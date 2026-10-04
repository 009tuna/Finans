'use strict';

const crypto = require('crypto');

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 80;
const NETWORK_TIMEOUT_MS = 20000;
const SPK_HOSTS = new Set(['spk.gov.tr', 'www.spk.gov.tr']);
const TURKISH_MONTHS = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12 };
const STOP_SYMBOLS = new Set(['SPK', 'BIST', 'MKK', 'TCKN', 'TC', 'TURKIYE', 'KURUL', 'KARAR', 'SAYI', 'MADDE', 'GENEL', 'YONETIM', 'SERMAYE', 'PIYASA', 'HALKA', 'ARZ', 'FON', 'A', 'AS', 'LTD', 'INC', 'VE', 'ILE']);
let pdfjsPromise;

function foldTurkish(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').toLocaleUpperCase('en-US');
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function validItem(item) {
  if (!item || typeof item.id !== 'string' || typeof item.url !== 'string' || !validDate(item.publishedDate)) return { ok: false, reason: 'invalid_bulletin_item' };
  let u;
  try { u = new URL(item.url); } catch { return { ok: false, reason: 'invalid_document_url' }; }
  if (u.protocol !== 'https:' || !SPK_HOSTS.has(u.hostname.toLowerCase()) || u.search || u.hash || !/^\/data\/[a-f\d]{16,64}\/\d{4}-\d{1,3}\.pdf$/i.test(u.pathname)) return { ok: false, reason: 'untrusted_document_url' };
  const match = u.pathname.match(/\/(\d{4})-(\d{1,3})\.pdf$/i);
  const idMatch = item.id.match(/^spk:(\d{4})\/(\d{1,3})$/i);
  if (!match || !idMatch || match[1] !== idMatch[1] || Number(match[2]) !== Number(idMatch[2])) return { ok: false, reason: 'document_identity_mismatch' };
  return { ok: true, url: u.href, year: Number(match[1]), number: Number(match[2]) };
}
function parseTurkishDate(text) {
  const s = foldTurkish(text);
  let m = s.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})\b/);
  if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  m = s.match(/\b(\d{1,2})\s+(OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK)\s+(20\d{2})\b/);
  if (m) return `${m[3]}-${String(TURKISH_MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  return null;
}
function parseBulletinIdentity(text, { officialIssuer = false } = {}) {
  const head = foldTurkish(text).slice(0, 1800);
  const hasBulletinTitle = /\bSPK\s+BULTENI\b/.test(head);
  const hasInstitution = /SERMAYE\s+PIYASASI\s+KURULU|\bSPK\b/.test(head);
  if (!hasBulletinTitle && !(officialIssuer && hasInstitution)) return { ok: false, reason: 'bulletin_header_not_found' };
  const id = head.match(/\b(20\d{2})\s*[/\-]\s*(\d{1,3})\b/);
  if (!id) return { ok: false, reason: 'bulletin_number_not_found' };
  const date = parseTurkishDate(head);
  if (!date) return { ok: false, reason: 'bulletin_date_not_found' };
  if (!validDate(date)) return { ok: false, reason: 'bulletin_date_invalid' };
  return { ok: true, year: Number(id[1]), number: Number(id[2]), publishedDate: date };
}
function categoryFor(title) {
  const t = foldTurkish(title);
  if (/SU[CÇ]|IDARI PARA CEZASI|ISLEM YASAGI|YAPTIRIM|IZINSIZ FAALIYET|FAALIYETI DURDUR/.test(t)) return 'enforcement';
  if (/SERMAYE ARTIR|SERMAYE AZALT|BOR[ÇC]LANMA ARACI|HALKA ARZ|IHRAC|PAY IHRAC|KIRA SERTIFIKASI/.test(t)) return 'capital_issue';
  if (/ONAY|IZIN|UYGUN|BASVURU|FON KURULUS|IZAHNAME|YATIRIM ORTAKLIGI/.test(t)) return 'approval';
  if (/KURUL KARARI|ILKE KARARI|DUYURU|MEVZUAT|REHBER|DUZENLEME|TEDBIR/.test(t)) return 'regulatory_notice';
  return 'other';
}
function shortSummary(category) {
  return ({ enforcement: 'Yaptırım veya uyum başlığı; hukuki sonuç hakkında otomatik yorum yapılmadı.',
    capital_issue: 'Sermaye piyasası işlemi başlığı; ayrıntı resmi metinde incelenmeli.',
    approval: 'Kurul onayı veya izin başlığı; kapsam resmi metinde incelenmeli.',
    regulatory_notice: 'Düzenleyici duyuru başlığı; otomatik kural değişikliği uygulanmadı.',
    other: 'Başlık metinden çıkarıldı; anlamı için manuel inceleme gerekir.' })[category];
}
function pageLines(items) {
  const lines = []; let current = '';
  for (const item of items || []) {
    if (typeof item.str !== 'string') continue;
    const value = item.str.replace(/\s+/g, ' ').trim();
    if (value) current += (current ? ' ' : '') + value;
    if (item.hasEOL && current) { lines.push(current.trim()); current = ''; }
  }
  if (current) lines.push(current.trim());
  return lines;
}
function symbolsFrom(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\(([A-Z][A-Z0-9]{2,5})\)/g)) if (!STOP_SYMBOLS.has(m[1])) out.add(m[1]);
  return [...out].sort();
}
function extractSections(pages) {
  const sections = [];
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p].lines;
    const candidates = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const match = line.match(/^\s*((?:[A-ZÇĞİÖŞÜ]|\d{1,2})[.)])\s+(.{3,180}?)\s*$/u);
      if (!match) continue;
      const title = `${match[1]} ${match[2].replace(/\s+/g, ' ').trim()}`;
      if (title.length > 180 || /\b(?:TCKN|T\.C\.\s*KIMLIK|MKK|DOGUM TARIHI|ADRES)\b|\d{11}/i.test(foldTurkish(title))) continue;
      const category = categoryFor(title);
      const numbered = /^\d/.test(match[1]);
      // Unrecognized numbered entries can be personal rows; retain only a generic placeholder.
      const safeTitle = numbered && category === 'other' ? `${match[1]} Diğer alt başlık` : title;
      candidates.push({ line, title: safeTitle, category, index: lineIndex });
    }
    candidates.forEach((section, idx) => {
      const end = candidates[idx + 1] ? candidates[idx + 1].index : lines.length;
      const symbols = symbolsFrom(lines.slice(section.index, end).join(' ')).slice(0, 100);
      sections.push({ title: section.title, page: p + 1, category: section.category, symbols, summary: shortSummary(section.category) });
    });
  }
  return sections;
}
function unavailable(reason, extras = {}) { return { available: false, contentStatus: 'unavailable', reason, ...extras }; }

async function defaultFetchBinary(url, { signal, maxBytes = MAX_BYTES } = {}) {
  const transport = process.platform === 'win32' && !process.env.VERCEL ? require('./windows-fetch').windowsFetch : fetch;
  const response = await transport(url, { signal, headers: { Accept: 'application/pdf', 'User-Agent': 'Finans public bulletin text extractor/1.0' } });
  if (!response.ok) throw new Error(`document_http_${response.status}`);
  const declared = Number(response.headers && response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('document_too_large');
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error('document_too_large'); }
        chunks.push(Buffer.from(value));
      }
    } finally { try { reader.releaseLock(); } catch (_) {} }
    return Buffer.concat(chunks, size);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) throw new Error('document_too_large');
  return data;
}
function bytesFrom(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return null;
}
async function loadPdfJs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}
async function extractPdf(bytes) {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, disableFontFace: true,
    enableXfa: false, disableAutoFetch: true, disableStream: true, stopAtErrors: true, verbosity: 0 });
  let doc;
  try {
    doc = await loadingTask.promise;
    if (doc.numPages > MAX_PAGES) return { error: 'too_many_pages' };
    let officialIssuer = false;
    try { const metadata = await doc.getMetadata(); officialIssuer = foldTurkish(metadata && metadata.info && metadata.info.Author) === 'SPK'; } catch (_) {}
    const pages = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      try {
        const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
        pages.push({ lines: pageLines(content.items) });
      } finally { page.cleanup(); }
    }
    return { pages, officialIssuer };
  } finally {
    if (doc) { try { doc.cleanup(); } catch (_) {} }
    try { await loadingTask.destroy(); } catch (_) {}
  }
}
async function inspectBulletin(item, { fetchBinary = defaultFetchBinary, now = () => new Date() } = {}) {
  const valid = validItem(item);
  if (!valid.ok) return unavailable(valid.reason);
  const controller = new AbortController();
  let timer;
  try {
    const request = Promise.resolve().then(() => fetchBinary(valid.url, { signal: controller.signal, timeoutMs: NETWORK_TIMEOUT_MS, maxBytes: MAX_BYTES }));
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('document_timeout')); }, NETWORK_TIMEOUT_MS); });
    const raw = await Promise.race([request, timeout]);
    const bytes = bytesFrom(raw);
    if (!bytes) return unavailable('invalid_binary_response');
    if (!bytes.length || bytes.length > MAX_BYTES) return unavailable(bytes.length > MAX_BYTES ? 'document_too_large' : 'empty_document');
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') return unavailable('invalid_pdf_body');
    let extracted;
    try { extracted = await extractPdf(bytes); } catch (e) { return unavailable('pdf_unreadable'); }
    if (extracted.error) return unavailable(extracted.error);
    const nonempty = extracted.pages.some((page) => page.lines.join(' ').trim());
    if (!nonempty) return unavailable('ocr_needed', { pages: extracted.pages.length });
    const allText = extracted.pages.map((page) => page.lines.join('\n')).join('\n');
    const identity = parseBulletinIdentity(allText, { officialIssuer: extracted.officialIssuer });
    if (!identity.ok) return unavailable(identity.reason, { pages: extracted.pages.length });
    if (identity.year !== valid.year || identity.number !== valid.number || identity.publishedDate !== item.publishedDate) return unavailable('bulletin_identity_mismatch', { pages: extracted.pages.length });
    const sections = extractSections(extracted.pages);
    if (!sections.length) return unavailable('unsupported_section_headings', { pages: extracted.pages.length });
    const extractedAt = new Date(now()).toISOString();
    return { available: true, contentStatus: 'text_extracted', verification: 'official_document_text', id: item.id, sourceUrl: valid.url,
      documentHash: crypto.createHash('sha256').update(bytes).digest('hex'), publishedDate: identity.publishedDate, pages: extracted.pages.length,
      extractedAt, sections, summary: `${sections.length} başlık ve metinde açıkça yazılı semboller çıkarıldı; hukuki/işlemsel etki yorumlanmadı.` };
  } catch (e) {
    return unavailable(String(e && e.message || e).replace(/\s+/g, '_').slice(0, 80));
  } finally { if (timer) clearTimeout(timer); }
}

module.exports = { inspectBulletin, validItem, parseBulletinIdentity, parseTurkishDate, categoryFor, extractSections, defaultFetchBinary, MAX_BYTES, MAX_PAGES, NETWORK_TIMEOUT_MS };
