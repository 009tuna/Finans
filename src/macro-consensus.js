'use strict';

const { createHash } = require('node:crypto');
const { readStore, updateStore } = require('./intelligence-store');
const { fetchText: defaultFetchText } = require('./macro-sources');

const KEY = 'macro_consensus_v1';
const SCHEMA_VERSION = 1;
const METRIC = 'us_nonfarm_payroll_change';
const UNIT = 'thousand_jobs';
const BLS_SCHEDULE_URL = 'https://www.bls.gov/schedule/news_release/empsit.htm';
const SEPTEMBER_RELEASE_AT = '2026-10-02T12:30:00.000Z';
const REVIEWED_SOURCES = Object.freeze({
  '2026-09': Object.freeze({
    url: 'https://ca.marketscreener.com/news/us-private-payrolls-growth-picks-up-in-september-adp-says-ce785ad2d188f326',
    headline: 'US private payrolls growth picks up in September, ADP says',
    publicationPeriod: '2026-09',
    previousPeriodMonth: 'August',
  }),
});
const initial = Object.freeze({ schemaVersion: SCHEMA_VERSION, records: [], sourceStatus: { status: 'not_initialized' }, updatedAt: null });
const isoMs = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const monthPeriod = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '');
const parseInstant = (value) => {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};
const validId = (value) => typeof value === 'string' && value.length > 0;
function validEvent(event) {
  if (!event || event.metric !== METRIC || event.unit !== UNIT || !monthPeriod(event.period)
    || event.eventId !== `${METRIC}:${event.period}`) return false;
  if (!BLS_SCHEDULE_URL || event.sourceUrl !== BLS_SCHEDULE_URL || !/^[a-f\d]{64}$/i.test(event.contentHash || '')) return false;
  if (event.scheduleConflict) return false;
  const scheduled = parseInstant(event.scheduledAt), observed = parseInstant(event.observedAt);
  return scheduled === Date.parse(SEPTEMBER_RELEASE_AT) && observed !== null && observed < scheduled;
}
function validArticleUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.href === url && parsed.protocol === 'https:' && parsed.hostname === 'ca.marketscreener.com'
      && parsed.pathname === new URL(REVIEWED_SOURCES['2026-09'].url).pathname
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
}
function typeIsNewsArticle(value) {
  const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
  return types.includes('NewsArticle');
}
function authorNames(value) {
  const author = Array.isArray(value?.author) ? value.author : [value?.author];
  return author.map((item) => typeof item === 'string' ? item : item?.name).filter((name) => typeof name === 'string');
}
function normalizeJsonStringControls(raw) {
  let inString = false, escaped = false, output = '';
  for (const character of raw) {
    const code = character.charCodeAt(0);
    if (inString && code < 0x20) { output += ' '; escaped = false; continue; }
    output += character;
    if (!inString) { if (character === '"') inString = true; continue; }
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '"') inString = false;
  }
  return output;
}
function parseArticleJsonLd(html) {
  const scripts = [...String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const articles = [];
  for (const match of scripts) {
    try {
      const decoded = match[1].replace(/&quot;/gi, '"').replace(/&amp;/gi, '&');
      const value = JSON.parse(normalizeJsonStringControls(decoded));
      const entries = Array.isArray(value) ? value : Array.isArray(value?.['@graph']) ? value['@graph'] : [value];
      for (const entry of entries) if (typeIsNewsArticle(entry)) articles.push(entry);
    } catch { /* Unsupported JSON-LD blocks are ignored, never guessed. */ }
  }
  return articles;
}
function parseConsensusArticle(html, { event, sourceUrl, observedAt }) {
  const raw = String(html);
  const spec = event && REVIEWED_SOURCES[event.period];
  if (!spec || !validEvent(event) || sourceUrl !== spec.url || !validArticleUrl(sourceUrl)) return { available: false, reason: 'unsupported_event_or_source' };
  const articles = parseArticleJsonLd(raw);
  if (articles.length !== 1) return { available: false, reason: 'ambiguous_or_missing_news_article' };
  const article = articles[0];
  if (article.headline !== spec.headline || !authorNames(article).some((name) => name.trim() === 'Reuters')) return { available: false, reason: 'unverified_headline_or_provider' };
  const pubMs = parseInstant(article.datePublished);
  const observedMs = parseInstant(observedAt);
  const scheduledMs = parseInstant(event.scheduledAt);
  if (pubMs === null || observedMs === null || scheduledMs === null) return { available: false, reason: 'invalid_publication_or_retrieval_time' };
  if (observedMs < pubMs) return { available: false, reason: 'retrieval_precedes_publication' };
  if (pubMs >= scheduledMs || observedMs >= scheduledMs) return { available: false, reason: 'consensus_after_release' };
  if (pubMs > parseInstant(event.observedAt) || parseInstant(event.observedAt) > observedMs) return { available: false, reason: 'event_schedule_observation_chronology_invalid' };
  if (new Date(pubMs).toISOString().slice(0, 7) !== spec.publicationPeriod) return { available: false, reason: 'publication_period_mismatch' };
  const body = typeof article.articleBody === 'string' ? article.articleBody.replace(/\s+/g, ' ').trim() : '';
  if (!body || !/^\s*WASHINGTON,\s*Sept(?:ember)?\s+30\s*\(Reuters\)/i.test(body)) return { available: false, reason: 'unverified_reuters_dateline' };
  const headlinePeriodMatches = article.headline.match(/\b(September)\b/i);
  if (!headlinePeriodMatches || headlinePeriodMatches[1].toLowerCase() !== 'september') return { available: false, reason: 'target_period_not_explicit' };
  // Exact reviewed sentence: other 90,000 values in this story refer to ADP private payrolls.
  const targetSentence = /\bNonfarm payrolls are expected to have advanced by ([\d,]+) jobs after accelerating ([\d,]+) in August\./gi;
  const matches = [...body.matchAll(targetSentence)];
  if (matches.length !== 1) return { available: false, reason: matches.length ? 'ambiguous_nonfarm_estimate' : 'unsupported_nonfarm_estimate_format' };
  const amount = Number(matches[0][1].replace(/,/g, ''));
  const previous = Number(matches[0][2].replace(/,/g, ''));
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(previous) || previous <= 0) return { available: false, reason: 'invalid_job_count' };
  const excerpt = matches[0][0];
  if (excerpt.split(/\s+/).length > 25) return { available: false, reason: 'evidence_excerpt_too_long' };
  const publishedAt = new Date(pubMs).toISOString();
  const actualObservedAt = new Date(observedMs).toISOString();
  const contentHash = sha256(raw);
  const recordId = sha256(JSON.stringify([event.eventId, sourceUrl, amount / 1000, publishedAt, excerpt, 'reviewed-reuters-consensus-v1']));
  return { available: true, record: Object.freeze({
    id: recordId, eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period,
    value: amount / 1000, scheduledAt: event.scheduledAt, scheduleObservedAt: event.observedAt,
    scheduleSourceUrl: event.sourceUrl,
    scheduleContentHash: event.contentHash, vintage: 'pre_release_consensus', sourceUrl, provider: 'Reuters',
    sourceKind: 'Reuters syndicated report', publisher: 'MarketScreener Canada',
    publishedAt, observedAt: actualObservedAt, contentHash,
    parserVersion: 'reviewed-reuters-nfp-2026-09-v1', evidenceExcerpt: excerpt,
    evidenceWordCount: excerpt.split(/\s+/).length,
  }) };
}
function consensusAtCutoff({ records = [], eventId, scheduledAt, cutoff, event } = {}) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  if (typeof eventId !== 'string' || !eventId || parseInstant(scheduledAt) === null || parseInstant(cutoff) === null) return null;
  const period = eventId.slice(`${METRIC}:`.length);
  if (eventId !== `${METRIC}:${period}` || !monthPeriod(period)) return null;
  const limit = parseInstant(cutoff), release = parseInstant(scheduledAt);
  if (release !== Date.parse(SEPTEMBER_RELEASE_AT)) return null;
  if (event && (!validEvent(event) || event.eventId !== eventId || parseInstant(event.scheduledAt) !== release)) return null;
  const sourceSpec = REVIEWED_SOURCES[period];
  return records.filter((record) => {
    if (!record || record.eventId !== eventId || record.metric !== METRIC || record.unit !== UNIT || record.period !== period
      || !sourceSpec || record.sourceUrl !== sourceSpec.url || record.provider !== 'Reuters'
      || record.sourceKind !== 'Reuters syndicated report' || record.parserVersion !== 'reviewed-reuters-nfp-2026-09-v1'
      || record.vintage !== 'pre_release_consensus' || !Number.isFinite(record.value) || record.value <= 0
      || !/^[a-f\d]{64}$/i.test(record.contentHash || '') || !/^[a-f\d]{64}$/i.test(record.id || '')
      || typeof record.evidenceExcerpt !== 'string' || record.evidenceExcerpt.split(/\s+/).filter(Boolean).length > 25
      || record.evidenceWordCount !== record.evidenceExcerpt.split(/\s+/).filter(Boolean).length
      || parseInstant(record.scheduledAt) !== release || record.scheduleSourceUrl !== BLS_SCHEDULE_URL) return false;
    const published = parseInstant(record.publishedAt), observed = parseInstant(record.observedAt);
    const scheduleObserved = parseInstant(record.scheduleObservedAt);
    return published !== null && observed !== null && scheduleObserved !== null && published <= scheduleObserved
      && scheduleObserved <= observed && observed <= limit
      && observed < release && published < release && limit < release;
  })
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] || null;
}
function cleanError(error) {
  const message = String(error?.message || '');
  const status = message.match(/\bHTTP\s+(\d{3})\b/i);
  return status ? `http_${status[1]}` : /too large/i.test(message) ? 'response_too_large' : 'source_unavailable';
}
function clockFactory(now) {
  if (typeof now === 'function') return () => new Date(now()).toISOString();
  if (now !== undefined) return () => new Date(now).toISOString();
  return () => new Date().toISOString();
}
async function refreshMacroConsensus({ database, event, fetchText = defaultFetchText, now } = {}) {
  if (typeof fetchText !== 'function') throw new TypeError('fetchText must be a function');
  const getNow = clockFactory(now);
  let parsed;
  let failure = null;
  let raw = null;
  const spec = event && REVIEWED_SOURCES[event.period];
  if (!spec || !validEvent(event)) {
    failure = 'unsupported_event_or_source';
  } else {
    try {
      raw = await fetchText(spec.url, { timeoutMs: 15000, maxBytes: 1024 * 1024 });
      if (typeof raw !== 'string') throw new Error('Invalid response body');
      const observedAt = getNow(); // Capture only after network completion.
      parsed = parseConsensusArticle(raw, { event, sourceUrl: spec.url, observedAt });
      if (!parsed.available) failure = parsed.reason;
    } catch (error) {
      failure = cleanError(error);
    }
  }
  // For preflight rejection no request was made. Timestamp still represents this check.
  const checkedAt = getNow();
  return updateStore(KEY, initial, (current) => {
    if (current.updatedAt && Date.parse(checkedAt) < Date.parse(current.updatedAt)) return current;
    const records = Array.isArray(current.records) ? current.records.slice() : [];
    let lastSuccessfulAt = current.sourceStatus?.lastSuccessfulAt || null;
    let status = failure ? (records.length ? 'partial' : 'unavailable') : 'available';
    let failures = failure ? [{ code: failure, checkedAt }] : [];
    if (parsed?.available) {
      const incoming = parsed.record;
      const existing = records.find((record) => record.id === incoming.id);
      if (!existing) records.push(incoming);
      lastSuccessfulAt = checkedAt;
      // A successfully verified fetch remains available even when the source bytes
      // repeat; immutable record IDs keep first observedAt unchanged.
    }
    return { schemaVersion: SCHEMA_VERSION, records, sourceStatus: {
      status, checkedAt, lastSuccessfulAt, failures,
    }, updatedAt: checkedAt };
  }, database);
}
async function getConsensusPayload({ database, event, now } = {}) {
  const { value } = await readStore(KEY, initial, database);
  const asOf = clockFactory(now)();
  const current = validEvent(event) ? consensusAtCutoff({ records: value.records, eventId: event.eventId,
    scheduledAt: event.scheduledAt, cutoff: asOf, event }) : null;
  return { ...value, current, asOf, metric: METRIC, unit: UNIT,
    sourceScope: 'Reviewed Reuters syndicated NFP estimate for September 2026 only' };
}

module.exports = { KEY, SCHEMA_VERSION, METRIC, UNIT, BLS_SCHEDULE_URL, REVIEWED_SOURCES,
  initial, parseArticleJsonLd, parseConsensusArticle, consensusAtCutoff,
  refreshMacroConsensus, getConsensusPayload };
