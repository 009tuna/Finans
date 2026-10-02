'use strict';

// Reads issuer lists only. KAP links may be referenced, but are never fetched here.
const { createHash } = require('node:crypto');
const { localDate } = require('./official-market-feeds');
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 100;
const POLL_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const SCOPE = 'official_company_ir_disclosure_links_pilot';
const IR_COMPANIES = Object.freeze([
  Object.freeze({ id: 'company_ir_ford_otosan', symbol: 'FROTO', source: 'Ford Otosan yatırımcı ilişkileri', sourceUrl: 'https://www.fordotosan.com.tr/tr/yatirimcilar/duyurular/ozel-durum-aciklamalari', host: 'www.fordotosan.com.tr', parser: 'ford', listingScope: 'latest_listing_page_only' }),
  Object.freeze({ id: 'company_ir_tupras', symbol: 'TUPRS', source: 'Tüpraş yatırımcı ilişkileri', sourceUrl: 'https://www.tupras.com.tr/tr/duyuru-ve-yayinlar', host: 'www.tupras.com.tr', parser: 'tupras', listingScope: 'selected_year_disclosure_section_only' }),
]);
const digest = value => createHash('sha256').update(String(value)).digest('hex');
function iso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid_clock');
  return date.toISOString();
}
function plain(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, token) => {
      const point = /^x/i.test(token) ? parseInt(token.slice(1), 16) : Number(token);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\uFFFD';
    }).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, name) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name.toLowerCase()])
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
function attribute(tag, name) {
  const match = String(tag).match(new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1', 'i'));
  return match ? plain(match[2]) : null;
}
function trustedCompany(company) {
  const configured = IR_COMPANIES.find(row => row.id === company?.id);
  if (!configured || configured.sourceUrl !== company.sourceUrl || configured.symbol !== company.symbol) throw new Error('source_not_allowlisted');
  return configured;
}
function safeDisclosureUrl(value, company) {
  try {
    company = trustedCompany(company);
    if (/[\u0000-\u001f\u007f]/.test(String(value))) return null;
    const url = new URL(value, company.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search) return null;
    const own = url.hostname === company.host || url.hostname === company.host.replace(/^www\./, '');
    const kap = ['kap.org.tr', 'www.kap.org.tr'].includes(url.hostname) && /^\/tr\/Bildirim\/[1-9]\d*\/?$/i.test(url.pathname);
    const document = own && (company.parser === 'ford' ? /^\/doc\/[A-Za-z0-9_-]+$/.test(url.pathname) : /^\/assets\/all-pdfs\/[^/]+\.pdf$/i.test(url.pathname));
    if (!kap && !document) return null;
    url.hash = '';
    return url.href;
  } catch (_) { return null; }
}
const MONTHS = { ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12 };
function publisherDate(value) {
  const text = plain(value);
  let match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    const named = text.match(/^(\d{1,2})\s+([\p{L}]+)\s+(\d{4})$/u);
    if (!named || !MONTHS[named[2].toLocaleLowerCase('tr-TR')]) return null;
    match = [null, named[1], String(MONTHS[named[2].toLocaleLowerCase('tr-TR')]), named[3]];
  }
  const date = match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
  const stamp = new Date(date + 'T00:00:00Z');
  return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === date ? date : null;
}
// Fixed issuer markup, not a generic HTML parser. Balanced divs bound the Tüpraş section.
function sectionById(html, id) {
  const open = new RegExp('<div\\b[^>]*\\bid\\s*=\\s*(["\\\'])' + id + '\\1[^>]*>', 'i').exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  let depth = 1;
  for (const token of html.slice(start).matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += /^<\//.test(token[0]) ? -1 : 1;
    if (!depth) return html.slice(start, start + token.index);
  }
  return null;
}
function rowsFromPage(html, company) {
  if (company.parser === 'ford') {
    const table = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)].find(match => /KATEGORİ/.test(plain(match[1])) && /TARİH/.test(plain(match[1])));
    if (!table) return null;
    return [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(match => {
      const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(cell => cell[1]);
      if (cells.length !== 3 || plain(cells[0]) !== 'Özel Durum Açıklamaları') return null;
      const link = cells[2].match(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/i);
      return { date: plain(cells[1]), title: link ? plain(link[2]) : '', href: link ? attribute(link[1], 'href') : null };
    }).filter(Boolean);
  }
  const section = sectionById(html, 'exceptionStatements');
  if (section === null) return null;
  const prefix = html.slice(0, html.indexOf(section)).slice(-8000);
  if (!plain(prefix).includes('Özel Durum Açıklamaları')) return null;
  // All archive years are present in HTML; only the publisher's selected year is ingested.
  const selected = [...prefix.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].reverse().find(match => /\bselected\b/i.test(match[1]));
  const year = selected && attribute(selected[1], 'value');
  if (!/^\d{4}$/.test(year || '')) return null;
  return [...section.matchAll(/<div\b[^>]*class=["'][^"']*\bc-report__item\b[^"']*["'][^>]*>/gi)].map((match, index, list) => {
    if (attribute(match[0], 'data-year') !== year) return null;
    const block = section.slice(match.index, list[index + 1]?.index || section.length);
    const date = block.match(/<span\b[^>]*class=["'][^"']*\bc-report__content-date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const link = block.match(/<a\b([^>]*)>\s*<span\b[^>]*class=["'][^"']*\bc-report__content-title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/a>/i);
    return { date: date ? plain(date[1]) : '', title: link ? plain(link[2]) : '', href: link ? attribute(link[1], 'href') : null };
  }).filter(Boolean);
}
function parseCompanyPage(input, company, { observedAt }) {
  company = trustedCompany(company);
  const checkedAt = iso(observedAt);
  const html = String(input);
  if (Buffer.byteLength(html) > MAX_BYTES) throw new Error('source_too_large');
  const listingHash = digest(html);
  const scrubbed = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  const rows = rowsFromPage(scrubbed, company);
  const today = localDate(checkedAt);
  let filteredCount = 0;
  const items = [];
  const seen = new Set();
  for (const row of rows || []) {
    const date = publisherDate(row.date), url = safeDisclosureUrl(row.href, company);
    if (!date || date > today || !url || !row.title || row.title.length > 600) { filteredCount++; continue; }
    const id = company.id + ':' + digest(url + '|' + date).slice(0, 24);
    const contentHash = digest(date + '|' + row.title + '|' + url);
    if (seen.has(id + ':' + contentHash)) continue;
    seen.add(id + ':' + contentHash);
    items.push({ id, sourceId: company.id, market: 'bist', symbol: company.symbol, type: 'company_disclosure',
      title: row.title, url, source: company.source, sourceUrl: company.sourceUrl, publishedDate: date, publishedAt: null,
      observedAt: checkedAt, contentHash, listingHash, listingCheckedAt: checkedAt, kind: 'primary',
      evidenceStatus: 'company_listing_link_verified',
      evidence: 'Resmî şirket açıklama listesindeki bağlantı; belge içeriği ve finansal etki henüz doğrulanmadı.' });
  }
  const descriptions = new Map();
  for (const item of items) {
    if (!descriptions.has(item.url)) descriptions.set(item.url, new Set());
    descriptions.get(item.url).add(item.publishedDate + '|' + item.title);
  }
  let conflictCount = 0;
  for (const item of items) if (descriptions.get(item.url).size > 1) {
    conflictCount++;
    item.evidenceStatus = 'company_listing_link_conflict';
    item.manualReviewRequired = true;
    item.evidence = 'Şirket listesinde aynı belge bağlantısı farklı başlık veya tarihle kullanılıyor. Liste kaydı korunur; belge eşleşmesi ve finansal etki ayrıca doğrulanmalıdır.';
  }
  items.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  const truncated = items.length > MAX_ITEMS;
  const status = !items.length ? 'unverified' : filteredCount || truncated || conflictCount ? 'partial' : 'available';
  return { items: items.slice(0, MAX_ITEMS), source: { symbol: company.symbol, sourceUrl: company.sourceUrl, status, checkedAt,
    lastSuccessfulAt: status === 'available' ? checkedAt : null, lastCompletedAt: items.length ? checkedAt : null,
    listingHash, discoveredCount: rows?.length ?? null, filteredCount, conflictCount, truncated, scope: SCOPE, listingScope: company.listingScope,
    reason: company.parser === 'ford' ? 'Yalnız açıklama listesinin ilk sayfası izlenir; tam şirket arşivi değildir.' : 'Yalnız şirketin seçili yıl özel durum açıklamaları bölümü izlenir.',
    errorCode: !items.length ? 'unsupported_company_listing' : conflictCount ? 'company_link_conflict' : filteredCount ? 'company_records_filtered' : truncated ? 'company_listing_truncated' : null,
    todayDateOnlyCount: items.length ? items.slice(0, MAX_ITEMS).filter(item => item.publishedDate === today).length : null,
    todayDateOnlyDate: items.length ? today : null,
    latestPublishedDate: items[0]?.publishedDate || null } };
}
async function fetchCompanyHtml(company, { fetcher, timeoutMs = 15000, maxBytes = MAX_BYTES } = {}) {
  company = trustedCompany(company);
  fetcher ||= process.platform === 'win32' && !process.env.VERCEL ? require('./windows-fetch').windowsFetch : globalThis.fetch;
  const response = await fetcher(company.sourceUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'text/html', 'user-agent': 'Finans public issuer source monitor/1.0' } });
  if (response.status >= 300 && response.status < 400) throw new Error('redirect_rejected');
  if (!response.ok) throw new Error('http_' + response.status);
  if (Number(response.headers?.get?.('content-length')) > maxBytes) throw new Error('source_too_large');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('source_too_large');
    return text;
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('source_too_large'); }
      chunks.push(Buffer.from(value));
    }
  } finally { try { reader.releaseLock(); } catch (_) {} }
  return Buffer.concat(chunks).toString('utf8');
}
async function collectCompanyDisclosures({ companies = IR_COMPANIES, fetchHtml = fetchCompanyHtml, now, clock = () => new Date(), previousSources = {}, force = false } = {}) {
  const current = () => iso(now === undefined ? clock() : now);
  const items = [], sources = {};
  for (const input of companies) {
    const company = trustedCompany(input), requestedAt = current(), previous = previousSources[company.id];
    const interval = ['available', 'partial'].includes(previous?.status) ? POLL_MS : RETRY_MS;
    const elapsed = Date.parse(requestedAt) - Date.parse(previous?.checkedAt);
    if (!force && elapsed >= 0 && elapsed < interval) {
      sources[company.id] = { ...previous, skipped: true };
      continue;
    }
    try {
      const html = await fetchHtml(company);
      const parsed = parseCompanyPage(html, company, { observedAt: current() });
      items.push(...parsed.items);
      sources[company.id] = { ...parsed.source, requestedAt };
    } catch (error) {
      const code = /timeout|abort|curl 28/i.test(String(error?.message) + ' ' + error?.name) ? 'timeout' : /^http_\d+$|^redirect_rejected$|^source_too_large$/.test(error?.message || '') ? error.message : 'source_unavailable';
      sources[company.id] = { symbol: company.symbol, sourceUrl: company.sourceUrl, status: 'unavailable', checkedAt: current(),
        requestedAt, errorCode: code, discoveredCount: null, filteredCount: null, scope: SCOPE, listingScope: company.listingScope };
    }
  }
  return { items, sources, configuredSymbols: IR_COMPANIES.map(company => company.symbol), scope: SCOPE };
}
module.exports = { IR_COMPANIES, SCOPE, MAX_BYTES, MAX_ITEMS, POLL_MS, RETRY_MS, publisherDate, safeDisclosureUrl, parseCompanyPage, fetchCompanyHtml, collectCompanyDisclosures };
