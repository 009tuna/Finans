'use strict';

const crypto = require('crypto');
const BLS_SCHEDULE = 'https://www.bls.gov/schedule/news_release/empsit.htm';
const BLS_ARCHIVE = 'https://www.bls.gov/news.release/archives/';
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function htmlText(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|tr|td|th|h[1-6]|li)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&ndash;|&#8211;/gi, '–').replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ldquo;|&rdquo;|&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
}
function easternIso(date, hour = 8, minute = 30) {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new TypeError('Invalid Eastern date or time');
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  let instant = wanted;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
    const offset = p.timeZoneName === 'GMT' ? 0 : ((p.timeZoneName.match(/GMT([+-])(\d{2}):(\d{2})/) || []).slice(1));
    const mins = Array.isArray(offset) ? (offset[0] === '-' ? -1 : 1) * (Number(offset[1]) * 60 + Number(offset[2])) : 0;
    instant = wanted - mins * 60000;
  }
  return new Date(instant).toISOString();
}
function parseSchedule(html) {
  const contentHash = crypto.createHash('sha256').update(String(html)).digest('hex');
  const text = htmlText(html);
  const re = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi;
  const out = []; let m;
  while ((m = re.exec(text))) {
    const periodMonth = MONTHS[m[1].toLowerCase()], periodYear = Number(m[2]);
    const pubMonth = MONTHS[Object.keys(MONTHS).find((x) => x.startsWith(m[3].toLowerCase()))];
    const day = Number(m[4]), year = Number(m[5]); let hour = Number(m[6]);
    if (!pubMonth || periodMonth < 1 || periodYear < 1900 || year < 1900 || day > 31 || Number(m[7]) > 59) continue;
    if (new Date(Date.UTC(year, pubMonth - 1, day)).getUTCDate() !== day) continue;
    hour = hour % 12 + (m[8].toUpperCase() === 'PM' ? 12 : 0);
    const date = `${year}-${String(pubMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const scheduledAt = easternIso(date, hour, Number(m[7]));
    out.push({ eventId: `us_nonfarm_payroll_change:${periodYear}-${String(periodMonth).padStart(2, '0')}`, metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`, scheduledAt, scheduledTimezone: 'America/New_York', sourceUrl: BLS_SCHEDULE, contentHash });
  }
  return out;
}
function archiveUrl(date) { return BLS_ARCHIVE + `empsit_${date.slice(5, 7)}${date.slice(8, 10)}${date.slice(0, 4)}.htm`; }
function signedCount(raw) { const n = Number(raw.replace(/[,+\s]/g, '').replace(/−/g, '-')); return Number.isFinite(n) ? n : null; }
function extractRevisions(text, { releasePeriod, publishedAt, observedAt, sourceUrl, contentHash }) {
  const end = text.indexOf('HOUSEHOLD DATA');
  const releaseText = text.slice(Math.max(0, text.indexOf('THE EMPLOYMENT SITUATION')), end > 0 ? end : text.length);
  const re = /(?:change in total nonfarm payroll employment for|and the change for)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+was revised\s+(up|down)\s+by\s+([+\-−]?\s*\d[\d,]*)\s*,?\s*from\s+([+\-−]?\s*\d[\d,]*)\s+to\s+([+\-−]?\s*\d[\d,]*)/gi;
  const found = []; let m;
  while ((m = re.exec(releaseText))) {
    const month = MONTHS[m[1].toLowerCase()];
    const releaseYear = Number(releasePeriod.slice(0, 4));
    const releaseMonth = Number(releasePeriod.slice(5, 7));
    const periodYear = month > releaseMonth ? releaseYear - 1 : releaseYear;
    const period = `${periodYear}-${String(month).padStart(2, '0')}`;
    const magnitude = signedCount(m[3]), previousValue = signedCount(m[4]), value = signedCount(m[5]);
    const actualChange = value - previousValue;
    if (period >= releasePeriod || magnitude === null || previousValue === null || value === null || magnitude < 0 || (m[2].toLowerCase() === 'up' ? actualChange <= 0 : actualChange >= 0) || Math.abs(Math.abs(actualChange) - magnitude) > 0.001) continue;
    if (found.some((x) => x.period === period)) continue;
    found.push({ metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period, value: value / 1000, previousValue: previousValue / 1000, revisionChange: actualChange / 1000,
      vintage: 'revision', publishedAt, observedAt, sourceUrl, contentHash });
  }
  return found;
}
function parseFirstRelease(html, { sourceUrl, observedAt = new Date().toISOString() } = {}) {
  const text = htmlText(html);
  const pub = text.match(/embargoed until\s+(?:[A-Z0-9-]+\s+)*(\d{1,2}:\d{2})\s*([ap])\.m\.\s*\(ET\)\s+[A-Z][a-z]+,?\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
  const title = text.match(/THE EMPLOYMENT SITUATION\s*[-–—]\s*([A-Z]+)\s+(\d{4})/i);
  if (!pub || !title || !MONTHS[title[1].toLowerCase()]) return { available: false, reason: 'unsupported_release_header_or_period' };
  const pubMonth = MONTHS[pub[3].toLowerCase()]; if (!pubMonth) return { available: false, reason: 'unsupported_publication_date' };
  if (Number(pub[4]) < 1 || Number(pub[4]) > new Date(Date.UTC(Number(pub[5]), pubMonth, 0)).getUTCDate()) return { available: false, reason: 'unsupported_publication_date' };
  let hr = Number(pub[1].split(':')[0]) % 12 + (pub[2].toLowerCase() === 'p' ? 12 : 0);
  const publishedAt = easternIso(`${pub[5]}-${String(pubMonth).padStart(2, '0')}-${String(Number(pub[4])).padStart(2, '0')}`, hr, Number(pub[1].split(':')[1]));
  const expectedUrl = archiveUrl(publishedAt);
  if (sourceUrl !== expectedUrl) return { available: false, reason: 'unverified_archive_source' };
  const period = `${title[2]}-${String(MONTHS[title[1].toLowerCase()]).padStart(2, '0')}`;
  const start = text.indexOf('THE EMPLOYMENT SITUATION');
  const leading = text.slice(Math.max(0, start - 800), text.indexOf('HOUSEHOLD DATA') > 0 ? text.indexOf('HOUSEHOLD DATA') : text.length);
  const months = '(January|February|March|April|May|June|July|August|September|October|November|December)';
  const amount = '([+\\-−]?\\s*\\d[\\d,]*(?:\\.\\d+)?)';
  // Headline format: explicitly names payroll employment and carries its own signed estimate.
  const bothRx = new RegExp('Both (?:total )?nonfarm payroll employment\\s*\\((' + '[+\\-−]?\\s*\\d[\\d,]*(?:\\.\\d+)?' + ')\\)\\s+and (?:the )?unemployment rate\\s*\\([^)]*\\)\\s+(?:changed little|was essentially unchanged|remained essentially unchanged)\\s+in\\s+' + months, 'i');
  // Establishment-survey format; the exact payroll subject prevents household employment counts matching.
  const changed = '(?:changed little|was essentially unchanged|remained essentially unchanged)';
  const totalRx = new RegExp('Total nonfarm payroll employment\\s+(?:(increased|rose|grew|decreased|fell|declined)\\s+by\\s+' + amount + '\\s+in\\s+' + months + '|' + changed + '\\s*\\(' + amount + '\\)\\s+in\\s+' + months + '|' + changed + '\\s+in\\s+' + months + '\\s*\\(' + amount + '\\))\\b', 'i');
  const headline = leading.match(bothRx);
  const total = leading.match(totalRx);
  const v = headline || total;
  const valueText = headline ? headline[1] : total && (total[2] || total[4] || total[7]);
  const valueMonth = headline ? headline[2] : total && (total[3] || total[5] || total[6]);
  if (!v || MONTHS[valueMonth.toLowerCase()] !== Number(period.slice(5))) return { available: false, reason: 'unsupported_first_estimate_format' };
  const token = valueText.replace(/[−\s]/g, (x) => x === '−' ? '-' : '');
  const parsedNumber = Number(token.replace(/,/g, '')) / 1000;
  const explicitSign = /^[+\-]/.test(token);
  const value = explicitSign ? parsedNumber : (/decreased|fell|declined/i.test(v[1] || '') ? -parsedNumber : parsedNumber);
  const raw = String(html);
  const retrievedAt = new Date(observedAt).toISOString();
  if (new Date(retrievedAt).getTime() < new Date(publishedAt).getTime()) return { available: false, reason: 'retrieval_precedes_publication' };
  const contentHash = crypto.createHash('sha256').update(raw).digest('hex');
  const revisions = extractRevisions(text, { releasePeriod: period, publishedAt, observedAt: retrievedAt, sourceUrl, contentHash });
  return { available: true, metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period, value, vintage: 'first_release', publishedAt, observedAt: retrievedAt, sourceUrl: sourceUrl || null, contentHash, revisions };
}
function createBlsMacroSource({ fetchText, now = () => new Date().toISOString() } = {}) {
  if (typeof fetchText !== 'function') throw new TypeError('fetchText is required');
  return {
    async getSchedule() { const html = await fetchText(BLS_SCHEDULE); const observedAt = new Date(now()).toISOString(); const events = parseSchedule(html); if (!events.length) throw new Error('BLS schedule unavailable: no supported Employment Situation rows were parsed'); return events.map((e) => ({ ...e, observedAt })); },
    async getFirstRelease(event, retrievedAt) {
      if (!event || event.metric !== 'us_nonfarm_payroll_change' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.period) || event.eventId !== `us_nonfarm_payroll_change:${event.period}`) throw new TypeError('A valid nonfarm payroll event is required');
      const requestedAt = retrievedAt || now();
      const scheduled = new Date(event.scheduledAt); if (!Number.isFinite(scheduled.getTime()) || scheduled > new Date(requestedAt)) return { available: false, reason: 'not_yet_published' };
      const url = archiveUrl(event.scheduledAt.slice(0, 10));
      const html = await fetchText(url);
      const observedAt = new Date(retrievedAt || now()).toISOString();
      const parsed = parseFirstRelease(html, { sourceUrl: url, observedAt });
      if (!parsed.available) return parsed;
      if (parsed.period !== event.period || new Date(parsed.publishedAt).getTime() > new Date(observedAt).getTime()) return { available: false, reason: 'release_period_or_publication_mismatch' };
      return parsed;
    }
  };
}
async function fetchText(url, options = {}) {
  const timeoutMs = Math.max(1, Math.min(Number(options.timeoutMs) || 15000, 30000));
  const maxBytes = Math.max(1, Math.min(Number(options.maxBytes) || 3 * 1024 * 1024, 5 * 1024 * 1024));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('BLS request timed out')), timeoutMs);
  try {
    // Node's native fetch succeeds for the public BLS pages on Windows where curl.exe
    // receives an automated-request 403. This remains an ordinary HTTPS request; it
    // does not impersonate a browser or attempt to defeat access controls.
    const headers = { 'User-Agent': 'Finans macro research/1.0 (public BLS source)', ...(options.headers || {}) };
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) throw new Error(`BLS HTTP ${response.status}`);
    if (response.url && new URL(response.url).href !== new URL(url).href) throw new Error('BLS redirected to an unexpected URL');
    const declaredSize = Number(response.headers && response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new Error('BLS response too large');
    let bytes;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new Error('BLS response too large');
          }
          chunks.push(part.value);
        }
      } catch (error) {
        try { await reader.cancel(error); } catch (_) { /* stream is already closed */ }
        throw error;
      }
      bytes = new Uint8Array(size);
      let offset = 0;
      chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    } else {
      // Compatibility for simple injected fetch adapters. The native fetch path uses the bounded stream above.
      bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new Error('BLS response too large');
    }
    return new TextDecoder('utf-8').decode(bytes);
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { BLS_SCHEDULE, parseSchedule, parseFirstRelease, extractRevisions, archiveUrl, easternIso, createBlsMacroSource, fetchText };
