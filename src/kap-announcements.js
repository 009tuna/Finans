'use strict';

// KAP's public search page is a client-side shell.  Its HTML does not contain
// the disclosure result set; the result API is served from a separate backend
// host and is not assumed here without a verified public contract.
const { createHash } = require('node:crypto');

const KAP_PUBLIC_PAGE = 'https://www.kap.org.tr/tr/bildirim-sorgu';
const KAP_API_DOC = 'https://www.kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873';
const KAP_PUBLIC_HOSTS = new Set(['www.kap.org.tr', 'kap.org.tr']);
const LIMITS = Object.freeze({ maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 });

function sha(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function validNow(now) {
  const date = new Date(now === undefined ? Date.now() : now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must be a valid timestamp');
  return date.toISOString();
}
function safeKapUrl(value) {
  try {
    const url = new URL(value, KAP_PUBLIC_PAGE);
    if (url.protocol !== 'https:' || !KAP_PUBLIC_HOSTS.has(url.hostname) || url.username || url.password || url.port) return null;
    url.hash = '';
    return url.href;
  } catch (_) { return null; }
}
async function fetchHtml(url = KAP_PUBLIC_PAGE, { fetcher = globalThis.fetch, maxBytes = LIMITS.maxBytes, timeoutMs = LIMITS.timeoutMs } = {}) {
  if (safeKapUrl(url) !== url || url !== KAP_PUBLIC_PAGE) throw new Error('invalid_source_url');
  if (typeof fetcher !== 'function') throw new Error('fetch_unavailable');
  const response = await fetcher(url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'text/html', 'user-agent': 'Finans source monitor/1.0' } });
  if (response.status >= 300 && response.status < 400) throw new Error('redirect_rejected');
  if (!response.ok) throw new Error(`http_${response.status}`);
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('source_too_large');
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error('source_too_large'); } chunks.push(Buffer.from(value)); } }
    finally { try { reader.releaseLock(); } catch (_) {} }
    return Buffer.concat(chunks).toString('utf8');
  }
  const body = await response.text(); if (Buffer.byteLength(body) > maxBytes) throw new Error('source_too_large'); return body;
}

async function collectKapAnnouncements({ fetchHtml: injectedFetch, now, sourceUrl = KAP_PUBLIC_PAGE } = {}) {
  const requestedAt = validNow(now);
  let html;
  try { html = await (injectedFetch || fetchHtml)(sourceUrl); }
  catch (error) {
    const checkedAt = validNow();
    const raw = String(error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|aborted/i.test(error?.message || '') ? 'timeout' : 'source_unavailable');
    return { items: [], records: [], checkedAt, status: 'unavailable', errorCode: raw, sourceUrl,
      failures: [{ scope: 'public_page', errorCode: raw }], scope: 'official_kap_company_disclosures', evidence: { sourceUrl: KAP_API_DOC, reason: 'KAP veri dağıtım/API erişimi resmî sözleşme ve MKK yetkilendirmesi/API key koşullarına bağlıdır.' } };
  }
  const checkedAt = validNow();
  return { items: [], records: [], checkedAt, status: 'unverified', errorCode: 'unsupported_public_listing', sourceUrl,
    failures: [{ scope: 'listing', errorCode: 'unsupported_public_listing' }], discoveredCount: 0,
    scope: 'official_kap_company_disclosures', requestedAt,
    evidence: { status: 200, retrievedAt: checkedAt, bodyHash: sha(html), linkCount: (String(html).match(/<a\b/gi) || []).length, sourceUrl: KAP_API_DOC,
      reason: 'KAP veri dağıtım/API erişimi resmî sözleşme ve MKK yetkilendirmesi/API key koşullarına bağlıdır.' } };
}

module.exports = { KAP_PUBLIC_PAGE, KAP_API_DOC, KAP_PUBLIC_HOSTS, LIMITS, safeKapUrl, fetchHtml, collectKapAnnouncements };
