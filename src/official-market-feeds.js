'use strict';

const { createHash } = require('node:crypto');

const MAX_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ITEMS_PER_FEED = 100;
const NOW_TOLERANCE_MS = 0;
const KAP_API_DOC = 'https://www.kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873';
const KAP_PUBLIC_PAGE = 'https://www.kap.org.tr/tr/bildirim-sorgu';
const FEEDS = Object.freeze([
  {
    id: 'ethereum', market: 'crypto', source: 'Ethereum Foundation Blog', host: 'blog.ethereum.org',
    url: 'https://blog.ethereum.org/feed.xml', itemHosts: ['blog.ethereum.org'],
  },
  {
    id: 'bitcoin_core', market: 'crypto', source: 'Bitcoin Core Blog', host: 'bitcoincore.org',
    url: 'https://bitcoincore.org/en/rss.xml', itemHosts: ['bitcoincore.org'],
  },
  {
    id: 'solana', market: 'crypto', source: 'Solana Changelog', host: 'solana.com',
    url: 'https://solana.com/changelog/rss.xml', itemHosts: ['solana.com'],
  },
]);

function validNow(now) {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) throw new TypeError('now must be a valid timestamp');
  return new Date(timestamp).toISOString();
}

function localDate(nowIso, timeZone = 'Europe/Istanbul') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowIso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function checkedFeed(feed) {
  const url = new URL(feed.url);
  if (url.protocol !== 'https:' || url.hostname !== feed.host || url.username || url.password || url.port) {
    throw new Error('feed_url_not_allowlisted');
  }
  return url.href;
}

function safeItemUrl(value, feed) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !feed.itemHosts.includes(url.hostname) || url.username || url.password || url.port) return null;
    url.hash = '';
    return url.href;
  } catch (_) { return null; }
}

function numericEntity(value, radix) {
  const codePoint = parseInt(value, radix);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\uFFFD';
  return String.fromCodePoint(codePoint);
}

function decodeXml(text) {
  return String(text || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([\da-f]{1,8});/gi, (_, hex) => numericEntity(hex, 16))
    .replace(/&#(\d{1,10});/g, (_, dec) => numericEntity(dec, 10))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]);
}

function plainText(text) {
  const decoded = decodeXml(String(text || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' '));
  return decoded.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function xmlTag(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp('<(?:[\\w.-]+:)?' + escaped + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + escaped + '\\s*>', 'i'));
  return match ? match[1] : '';
}

function xmlLink(block) {
  const links = [...String(block).matchAll(/<(?:[\w.-]+:)?link\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/(?:[\w.-]+:)?link\s*>)/gi)];
  const candidates = links.map((match) => {
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    const rel = match[1].match(/\brel\s*=\s*(["'])(.*?)\1/i);
    const isAtom = Boolean(href);
    return { value: isAtom ? decodeXml(href[2]).trim() : plainText(match[2]), alternate: !rel || /^(alternate|)$/i.test(rel[2]), atom: isAtom };
  });
  return candidates.find((candidate) => candidate.atom && candidate.alternate)?.value
    || candidates.find((candidate) => !candidate.atom)?.value
    || candidates.find((candidate) => candidate.atom)?.value || '';
}

function parsePublisherDate(value) {
  const raw = plainText(value);
  if (!raw) return { publishedAt: null, publishedDate: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw
      ? { publishedAt: null, publishedDate: raw } : { publishedAt: null, publishedDate: null };
  }
  const hasZone = /(?:Z|GMT|UT|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (!hasZone) return { publishedAt: null, publishedDate: null };
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return { publishedAt: null, publishedDate: null };
  return { publishedAt: new Date(timestamp).toISOString(), publishedDate: null };
}

function entriesFromXml(xml) {
  const input = String(xml || '');
  if (/<!ENTITY\b/i.test(input)) throw new Error('xml_entities_not_supported');
  const isAtom = /<feed\b/i.test(input) && !/<rss\b/i.test(input);
  const tag = isAtom ? 'entry' : 'item';
  const matches = [...input.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '\\s*>', 'gi'))];
  return matches.slice(0, MAX_ITEMS_PER_FEED).map((match) => {
    const block = match[1];
    const title = plainText(xmlTag(block, 'title'));
    const link = xmlLink(block) || plainText(xmlTag(block, 'guid')) || plainText(xmlTag(block, 'id'));
    const published = xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'dc:date');
    const description = xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content');
    return { title, link: decodeXml(link).trim(), date: parsePublisherDate(published), description: plainText(description) };
  });
}

function validFeedDocument(xml) {
  const input = String(xml || '').replace(/^\uFEFF/, '').trim();
  const stack = [];
  let root = null;
  const tags = input.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<[^>]*>/g) || [];
  for (const token of tags) {
    if (/^<!--|^<\?|^<!\[CDATA\[|^<!/i.test(token)) continue;
    const close = token.match(/^<\/\s*([\w.-]+(?::[\w.-]+)?)\s*>$/);
    if (close) {
      if (stack.pop() !== close[1]) return false;
      continue;
    }
    const open = token.match(/^<\s*([\w.-]+(?::[\w.-]+)?)(?:\s[^>]*)?>$/);
    if (!open) return false;
    if (!stack.length && !root) root = open[1];
    else if (!stack.length) return false;
    if (!/\/\s*>$/.test(token)) stack.push(open[1]);
  }
  return stack.length === 0 && ['rss', 'feed', 'rdf:RDF'].includes(root);
}

function digest(value) { return createHash('sha256').update(String(value)).digest('hex'); }

function parseFeed(xml, feed, { now = new Date().toISOString(), observedAt = now } = {}) {
  const nowIso = validNow(now);
  const observedIso = validNow(observedAt);
  const upperBound = Date.parse(nowIso) + NOW_TOLERANCE_MS;
  const seen = new Set();
  const items = [];
  for (const entry of entriesFromXml(xml)) {
    if (!entry.title) continue;
    const url = safeItemUrl(entry.link, feed);
    if (!url) continue;
    if (entry.date.publishedAt && Date.parse(entry.date.publishedAt) > upperBound) continue;
    if (entry.date.publishedDate && entry.date.publishedDate > localDate(nowIso)) continue;
    const publication = entry.date.publishedAt || entry.date.publishedDate || 'undated';
    const contentHash = digest([feed.id, url, entry.title, publication, entry.description].join('|'));
    if (seen.has(contentHash)) continue;
    seen.add(contentHash);
    items.push({
      id: 'official:' + feed.id + ':' + contentHash.slice(0, 20), feedId: feed.id, market: feed.market, type: 'research_event',
      title: entry.title, url, source: feed.source, kind: 'primary',
      publishedAt: entry.date.publishedAt, publishedDate: entry.date.publishedDate,
      observedAt: observedIso, contentHash, evidenceStatus: 'official_feed',
      ...(entry.description ? { evidence: entry.description.slice(0, 1200) } : {}),
    });
  }
  return items.sort((a, b) => String(b.publishedAt || b.publishedDate || '').localeCompare(String(a.publishedAt || a.publishedDate || '')));
}

async function readLimited(response, maxBytes = MAX_BYTES) {
  const advertised = Number(response.headers && response.headers.get && response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new Error('response_too_large');
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('response_too_large'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('response_too_large');
  return text;
}

function errorCode(error) {
  if (error && error.name === 'TimeoutError') return 'timeout';
  const status = String(error && error.message || '').match(/HTTP_(\d{3})/);
  if (status) return 'http_' + status[1];
  if (/response_too_large/.test(error && error.message || '')) return 'response_too_large';
  if (/xml_entities_not_supported|feed_xml_invalid/.test(error && error.message || '')) return 'feed_invalid';
  return 'source_unavailable';
}

async function fetchFeedResponse(feed, fetchImpl, timeoutMs) {
  const allowedHost = feed.host;
  let url = checkedFeed(feed);
  const signal = AbortSignal.timeout(timeoutMs);
  const seen = new Set();
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    if (seen.has(url)) throw new Error('feed_redirect_loop');
    seen.add(url);
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'manual', cache: 'no-store', signal,
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', 'user-agent': 'Finans primary-market-feed/1.0' },
    });
    if (response && [301, 302, 303, 307, 308].includes(response.status)) {
      if (response.body && typeof response.body.cancel === 'function') response.body.cancel().catch(() => {});
      if (redirectCount === 2) throw new Error('feed_redirect_limit');
      const location = response.headers && response.headers.get && response.headers.get('location');
      let next;
      try { next = new URL(location, url); } catch (_) { throw new Error('feed_redirect_invalid'); }
      if (next.protocol !== 'https:' || next.hostname !== allowedHost || next.username || next.password || next.port) throw new Error('feed_redirect_not_allowlisted');
      url = next.href;
      continue;
    }
    return response;
  }
  throw new Error('feed_redirect_limit');
}

async function readFeedSnapshot(feed, { fetchImpl = globalThis.fetch, now, observedAt, clock = () => new Date().toISOString(), timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  const response = await fetchFeedResponse(feed, fetchImpl, timeoutMs);
  if (!response || !response.ok) throw new Error('HTTP_' + (response && response.status || 0));
  const xml = await readLimited(response, maxBytes);
  if (!validFeedDocument(xml)) throw new Error('feed_xml_invalid');
  const retrievedAt = validNow(now === undefined ? clock() : now);
  const itemObservedAt = validNow(observedAt === undefined ? retrievedAt : observedAt);
  return { items: parseFeed(xml, feed, { now: retrievedAt, observedAt: itemObservedAt }), retrievedAt };
}

async function readFeed(feed, options = {}) {
  return (await readFeedSnapshot(feed, options)).items;
}

function unverifiedKap(now) {
  return {
    status: 'unverified', checkedAt: now, lastSuccessfulAt: null, errorCode: 'public_feed_not_verified',
    sourceUrl: KAP_PUBLIC_PAGE, apiDocumentationUrl: KAP_API_DOC,
    reason: 'KAP resmî bildirim arama sayfası mevcut; doğrulanmış bir genel RSS/API akışı bu kaynak kapsamında henüz bağlı değil.',
    count: 0,
  };
}

async function collectOfficialFeeds({ fetchImpl = globalThis.fetch, now, observedAt, clock = () => new Date().toISOString(), timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const fixedNow = now === undefined ? undefined : validNow(now);
  const fixedObserved = observedAt === undefined ? undefined : validNow(observedAt);
  const entries = await Promise.all(FEEDS.map(async (feed) => {
    try {
      const snapshot = await readFeedSnapshot(feed, { fetchImpl, now: fixedNow, observedAt: fixedObserved, clock, timeoutMs, maxBytes });
      const { items, retrievedAt } = snapshot;
      const published = items.map((item) => item.publishedAt).filter(Boolean).sort().at(-1) || null;
      const publishedDate = items.map((item) => item.publishedDate).filter(Boolean).sort().at(-1) || null;
      const since = Date.parse(retrievedAt) - 24 * 60 * 60 * 1000;
      const last24HoursCount = items.filter((item) => item.publishedAt && Date.parse(item.publishedAt) >= since).length;
      const todayDateOnlyCount = items.filter((item) => item.publishedDate === localDate(retrievedAt)).length;
      return { feed, items, status: { sourceUrl: feed.url, status: 'available', checkedAt: retrievedAt, lastSuccessfulAt: retrievedAt,
        count: items.length, retainedCount: items.length, last24HoursCount, todayDateOnlyCount, latestPublishedAt: published, latestPublishedDate: publishedDate } };
    } catch (error) {
      const checkedAt = fixedNow || validNow(clock());
      return { feed, items: [], status: { sourceUrl: feed.url, status: 'unavailable', checkedAt, lastSuccessfulAt: null, count: 0, last24HoursCount: 0, todayDateOnlyCount: 0,
        latestPublishedAt: null, errorCode: errorCode(error) } };
    }
  }));
  const items = [...entries.flatMap((entry) => entry.items)];
  const deduped = [...new Map(items.map((item) => [item.url + '|' + item.title + '|' + (item.publishedAt || item.publishedDate || ''), item])).values()]
    .sort((a, b) => String(b.publishedAt || b.publishedDate || '').localeCompare(String(a.publishedAt || a.publishedDate || '')));
  const checkedAt = fixedNow || validNow(clock());
  const sources = { kap: unverifiedKap(checkedAt) };
  for (const { feed, status } of entries) sources[feed.id] = status;
  return { items: deduped, sources, checkedAt };
}

module.exports = {
  MAX_BYTES, REQUEST_TIMEOUT_MS, KAP_API_DOC, KAP_PUBLIC_PAGE, FEEDS,
  localDate, checkedFeed, safeItemUrl, parsePublisherDate, entriesFromXml, parseFeed, readLimited, fetchFeedResponse, readFeed, readFeedSnapshot,
  collectOfficialFeeds,
};
