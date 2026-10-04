'use strict';

const { createHash } = require('crypto');
const https = require('https');
const MONTHS = { ocak: 1, oca: 1, şubat: 2, şub: 2, sub: 2, mart: 3, mar: 3, nisan: 4, nis: 4, mayıs: 5, may: 5, haziran: 6, haz: 6, temmuz: 7, tem: 7, ağustos: 8, ağu: 8, agu: 8, eylül: 9, eyl: 9, ekim: 10, eki: 10, kasım: 11, kas: 11, aralık: 12, ara: 12 };
const LIST_ORIGIN = 'https://www.spk.gov.tr';
const OFFICIAL_HOSTS = new Set(['spk.gov.tr', 'www.spk.gov.tr']);
const DEFAULT_LIST = (year) => `${LIST_ORIGIN}/duyurular/basin-duyurulari/${year}`;
const LIMITS = Object.freeze({ listBytes: 1_000_000, detailBytes: 1_000_000, count: 12, concurrency: 3, timeoutMs: 12_000, evidenceChars: 520 });
const sha = (s) => createHash('sha256').update(s).digest('hex');
function decode(s) { return String(s).replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&uuml;/gi, 'ü').replace(/&ccedil;/gi, 'ç').replace(/&ouml;/gi, 'ö').replace(/&scedil;/gi, 'ş').replace(/&gbreve;/gi, 'ğ').replace(/&inodot;/gi, 'ı')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))); }
function htmlText(s) { return decode(String(s).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<table\b[\s\S]*?<\/table>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function classDiv(html, className) { for (const m of String(html).matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi)) if ((m[1].match(/\bclass=["']([^"']*)["']/i)?.[1] || '').split(/\s+/).includes(className)) return m[2]; return null; }
function safeListUrl(value, year) {
  try { const u = new URL(value, LIST_ORIGIN); return u.protocol === 'https:' && OFFICIAL_HOSTS.has(u.hostname) && u.port === '' && u.username === '' && u.password === '' && !u.search && !u.hash && u.pathname === `/duyurular/basin-duyurulari/${year}` ? u.href : null; } catch (_) { return null; }
}
function safeDetailUrl(value, year) {
  try {
    const u = new URL(value, LIST_ORIGIN);
    if (u.protocol !== 'https:' || !OFFICIAL_HOSTS.has(u.hostname) || u.port || u.username || u.password || u.search || u.hash) return null;
    if (!u.pathname.startsWith(`/duyurular/basin-duyurulari/${year}/`) || u.pathname.split('/').filter(Boolean).length < 4) return null;
    return u.href;
  } catch (_) { return null; }
}
function publishedDate(text) {
  const m = htmlText(text).toLocaleLowerCase('tr-TR').match(/(?:^|\b)(\d{1,2})\s+([\p{L}]+)\s+(\d{4})(?:\b|$)/u);
  if (!m || !MONTHS[m[2]]) return null;
  const date = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const check = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(+check) && check.toISOString().slice(0, 10) === date ? date : null;
}
function selectArticle(html) {
  const source = String(html);
  const region = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (!region) return null;
  const titleMatch = region.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || region.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || region.match(/<h3\b[^>]*class=["'][^"']*\bbaslik\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
  const title = htmlText(titleMatch?.[1] || '');
  if (!title) return null;
  const articleRegion = region.slice(titleMatch.index);
  const dateTag = classDiv(articleRegion, 'tarih') ||
    articleRegion.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1] || articleRegion.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i)?.[1] ||
    articleRegion.match(/(?:Yayın|Yayımlanma|Yayım|Duyuru)\s*(?:Tarihi|Tarih)?\s*:?\s*([^<\n]{1,80})/i)?.[1] || '';
  const contentRegion = region.match(/<div\b[^>]*class=["'][^"']*\bicerik\b[^"']*\bstyled-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const spot = region.match(/<div\b[^>]*class=["'][^"']*\bspot\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const body = htmlText(`${spot} ${contentRegion}`);
  const date = publishedDate(dateTag);
  if (!date) return null;
  const content = htmlText(`${spot} ${contentRegion}`);
  if (!content) return null;
  return { title, publishedDate: date, body: content };
}
function isNonfinancial(title, body) { const s = `${title} ${body}`.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return /\b(personel\w*|sinav|ise alim|kariyer|bassagligi|vefat|cenaze|staj basvurusu)\b/.test(s); }
function classify(title, body) {
  const s = `${title} ${body}`.toLocaleLowerCase('tr-TR');
  if (/taslak/.test(String(title).toLocaleLowerCase('tr-TR'))) return 'draft_process_clarification';
  if (/yatırımcıları bilgilendirme|yatirimcilari bilgilendirme/.test(String(title).toLocaleLowerCase('tr-TR'))) return 'investor_notice';
  return 'general_press_announcement';
}
function shortEvidence(body) {
  // Strip table blocks before extracting; avoid persisting long numeric/account identifiers.
  return String(body).replace(/\b(?:TR\s*)?\d{20,30}\b/g, '[redacted]').replace(/\b\d{11}\b/g, '[redacted]').slice(0, LIMITS.evidenceChars).trim();
}
function parseListing(html, { sourceUrl, year, observedAt }) {
  const list = String(html).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!list) return [];
  const listMarker = /<div\b[^>]*class=["'][^"']*\bliste\b[^"']*["'][^>]*>/i.exec(list);
  if (!listMarker) return [];
  const rows = list.slice(listMarker.index);
  const found = [], seen = new Set();
  for (const a of rows.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = safeDetailUrl(a[1], year), title = htmlText(a[2].match(/<div\b[^>]*class=["'][^"']*\bliste-baslik\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    if (!url || !title || seen.has(url)) continue;
    seen.add(url); found.push({ url, title, sourceUrl, observedAt });
    if (found.length >= LIMITS.count) break;
  }
  return found;
}
function requestOfficial(url, { maxBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false, size = 0; const chunks = [];
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => { request.destroy(new Error('source_timeout')); }, timeoutMs);
    const request = https.get(url, { family: 4, agent: false, headers: { 'User-Agent': 'Finans source monitor/1.0', Accept: 'text/html' } }, (response) => {
      if (response.statusCode !== 200) { response.resume(); finish(reject, new Error(`http_${response.statusCode}`)); return; }
      const declared = Number(response.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) { response.destroy(); finish(reject, new Error('source_too_large')); return; }
      response.on('data', (chunk) => { size += chunk.length; if (size > maxBytes) { response.destroy(new Error('source_too_large')); finish(reject, new Error('source_too_large')); } else chunks.push(chunk); });
      response.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8')));
      response.on('error', (error) => finish(reject, error));
    });
    request.on('error', (error) => finish(reject, error));
  });
}
async function fetchHtml(url, { fetcher, maxBytes = LIMITS.detailBytes, timeoutMs = LIMITS.timeoutMs } = {}) {
  const safe = new URL(url);
  if (safe.protocol !== 'https:' || !OFFICIAL_HOSTS.has(safe.hostname) || safe.port || safe.username || safe.password) throw new Error('invalid_source_url');
  if (!fetcher) return requestOfficial(url, { maxBytes, timeoutMs });
  const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Finans source monitor/1.0' } });
  if (response.status >= 300 && response.status < 400) throw new Error('redirect_rejected');
  if (!response.ok) throw new Error(`http_${response.status}`);
  if (response.url && response.url !== url) throw new Error('redirect_rejected');
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('source_too_large');
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error('source_too_large'); } chunks.push(Buffer.from(value)); } }
    finally { try { reader.releaseLock(); } catch (_) {} }
    return Buffer.concat(chunks).toString('utf8');
  }
  const body = await response.text(); if (Buffer.byteLength(body) > maxBytes) throw new Error('source_too_large'); return body;
}
async function parallel(items, n, fn) {
  const out = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (cursor < items.length) { const i = cursor++; try { out[i] = await fn(items[i]); } catch (e) { out[i] = { errorCode: String(e.message || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'source_unavailable' }; } } }));
  return out;
}
async function collectSpkAnnouncements({ fetchHtml: injectedFetch, now, year } = {}) {
  const listYear = year || new Date(now || Date.now()).getUTCFullYear();
  const listUrl = DEFAULT_LIST(listYear), listFetch = injectedFetch || ((url, opts) => fetchHtml(url, opts));
  const discoveredAt = now === undefined ? null : new Date(now).toISOString();
  let listBody;
  try { if (!safeListUrl(listUrl, listYear)) throw new Error('invalid_source_url'); listBody = await listFetch(listUrl, { maxBytes: LIMITS.listBytes }); }
  catch (e) { const at = now === undefined ? new Date().toISOString() : discoveredAt; return { items: [], checkedAt: at, status: 'unavailable', errorCode: 'list_unavailable', failures: [{ scope: 'list', errorCode: 'source_unavailable' }], sourceUrl: listUrl }; }
  const listObservedAt = now === undefined ? new Date().toISOString() : discoveredAt;
  const discovered = parseListing(listBody, { sourceUrl: listUrl, year: listYear, observedAt: listObservedAt });
  const outcomes = await parallel(discovered, LIMITS.concurrency, async (item) => {
    const page = await listFetch(item.url, { maxBytes: LIMITS.detailBytes });
    const fetchedAt = now === undefined ? new Date().toISOString() : discoveredAt;
    const article = selectArticle(page); if (!article) throw new Error('unsupported_article');
    if (article.publishedDate > new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fetchedAt))) throw new Error('future_publication');
    if (isNonfinancial(article.title, article.body)) return { filtered: true };
    const contentHash = sha(`${article.title}\n${article.publishedDate}\n${article.body}`), statementType = classify(article.title, article.body);
    return { item: { id: `spk-announcement:${sha(item.url).slice(0, 20)}:${contentHash.slice(0, 12)}`, market: 'bist', type: 'regulatory_announcement', title: article.title,
      url: item.url, source: 'SPK', sourceId: 'spk_announcements', kind: 'primary', publishedDate: article.publishedDate, publishedAt: null,
      observedAt: fetchedAt, sourceUrl: item.url, listSourceUrl: listUrl, contentHash, evidence: shortEvidence(article.body), evidenceStatus: 'official_announcement_text',
      statementType, impactScope: 'announcement_evidence_only', manualReviewRequired: true, legalEffect: 'not_assessed' } };
  });
  const items = outcomes.filter(x => x?.item).map(x => x.item), failures = outcomes.map((x, i) => x?.errorCode ? ({ url: discovered[i].url, errorCode: x.errorCode }) : null).filter(Boolean);
  if (!discovered.length) return { items: [], checkedAt: listObservedAt, status: 'unavailable', errorCode: 'unsupported_list', failures: [{ scope: 'list', errorCode: 'unsupported_list' }], sourceUrl: listUrl };
  return { items, checkedAt: now === undefined ? new Date().toISOString() : discoveredAt, status: failures.length ? (items.length ? 'partial' : 'unavailable') : 'available', errorCode: failures.length ? 'detail_failures' : null, failures,
    sourceUrl: listUrl, discoveredCount: discovered.length, filteredCount: outcomes.filter(x => x?.filtered).length, scope: 'official_spk_press_announcements_evidence_only' };
}
module.exports = { collectSpkAnnouncements, parseListing, selectArticle, safeListUrl, safeDetailUrl, publishedDate, classify, isNonfinancial, fetchHtml, requestOfficial, LIMITS, DEFAULT_LIST };
