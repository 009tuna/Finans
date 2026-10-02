'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  KEY, METRIC, UNIT, REVIEWED_SOURCES, initial, parseConsensusArticle,
  consensusAtCutoff, refreshMacroConsensus, getConsensusPayload,
} = require('../src/macro-consensus');

const clone = (value) => JSON.parse(JSON.stringify(value));
function database() {
  const rows = new Map(); let version = 0; let raceNext = false;
  return {
    rows,
    raceOnce() { raceNext = true; },
    async getCache(key) { return rows.has(key) ? clone(rows.get(key)) : null; },
    async compareAndSetCache(key, value, expected) {
      if (raceNext) { raceNext = false; const error = new Error('simulated conflict'); error.statusCode = 409; throw error; }
      assert.equal(rows.get(key)?.revision || null, expected);
      const revision = `r${++version}`;
      rows.set(key, { value: clone(value), revision });
      return revision;
    },
  };
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const source = REVIEWED_SOURCES['2026-09'];
const event = { eventId: `${METRIC}:2026-09`, metric: METRIC, unit: UNIT, period: '2026-09',
  scheduledAt: '2026-10-02T12:30:00.000Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm',
  contentHash: hash('official BLS calendar'), observedAt: '2026-10-01T07:00:00.000Z' };
const publication = '2026-09-30T12:27:36.000Z';
const evidence = (nfp = '110,000', options = {}) => {
  const article = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: options.headline || source.headline,
    datePublished: options.datePublished || publication,
    author: options.author || [{ '@type': 'Organization', name: 'Reuters' }],
    articleBody: options.body || `WASHINGTON, Sept 30 (Reuters) - ADP recorded private employment rising by 90,000 jobs. Economists forecast private employment increased by 70,000. Nonfarm payrolls are expected to have advanced by ${nfp} jobs after accelerating 162,000 in August.`,
  };
  return `<html><script type="application/ld+json">${JSON.stringify(article)}</script></html>`;
};
const observedAt = '2026-10-01T08:00:00.000Z';
function parse(html = evidence(), targetEvent = event, observed = observedAt, sourceUrl = source.url) {
  return parseConsensusArticle(html, { event: targetEvent, observedAt: observed, sourceUrl });
}

{
  const result = parse();
  assert.equal(result.available, true);
  assert.equal(result.record.value, 110);
  assert.equal(result.record.unit, 'thousand_jobs');
  assert.equal(result.record.period, '2026-09');
  assert.equal(result.record.provider, 'Reuters');
  assert.equal(result.record.sourceKind, 'Reuters syndicated report');
  assert.equal(result.record.vintage, 'pre_release_consensus');
  assert.equal(result.record.scheduledAt, event.scheduledAt);
  assert.ok(result.record.contentHash === hash(evidence()));
  assert.ok(result.record.evidenceWordCount <= 25);
  assert.ok(!Object.hasOwn(result.record, 'articleBody'), 'full source article is not persisted');
  assert.match(result.record.evidenceExcerpt, /Nonfarm payrolls/);
}

{
  const variant = { ...event, scheduledAt: '2026-10-02T08:30:00-04:00' };
  assert.equal(parse(evidence(), variant).available, true, 'equivalent ISO timezone offsets are accepted');
  assert.equal(parse(evidence(), { ...event, scheduledAt: '2026-10-03T12:30:00.000Z' }).reason, 'unsupported_event_or_source');
  assert.equal(parse(evidence(), { ...event, scheduleConflict: { detectedAt: observedAt } }).reason, 'unsupported_event_or_source');
  assert.equal(parse(evidence(), { ...event, observedAt: '2026-10-01T09:00:00.000Z' }, '2026-10-01T08:00:00.000Z').reason,
    'event_schedule_observation_chronology_invalid');
}

for (const [html, ev, observed, url, reason] of [
  [evidence(), { ...event, period: '2026-08', eventId: `${METRIC}:2026-08` }, observedAt, source.url, 'unsupported_event_or_source'],
  [evidence('110,000', { headline: 'ADP payroll growth in September' }), event, observedAt, source.url, 'unverified_headline_or_provider'],
  [evidence('110,000', { author: [{ name: 'MarketScreener' }] }), event, observedAt, source.url, 'unverified_headline_or_provider'],
  [evidence('110,000', { datePublished: '2026-10-03T12:27:36.000Z' }), event, observedAt, source.url, 'retrieval_precedes_publication'],
  [evidence('110,000', { datePublished: '2026-10-02T13:00:00.000Z' }), event, '2026-10-03T00:00:00.000Z', source.url, 'consensus_after_release'],
  [evidence('110,000', { body: 'Sept 30 market news. Nonfarm payrolls are expected to have advanced by 110,000 jobs after accelerating 162,000 in August.' }), event, observedAt, source.url, 'unverified_reuters_dateline'],
  [evidence('110,000', { body: `WASHINGTON, Sept 30 (Reuters) - Nonfarm payrolls are expected to have advanced by 110,000 jobs after accelerating 162,000 in August. Nonfarm payrolls are expected to have advanced by 120,000 jobs after accelerating 162,000 in August.` }), event, observedAt, source.url, 'ambiguous_nonfarm_estimate'],
  [evidence(), event, observedAt, `${source.url}?cache=1`, 'unsupported_event_or_source'],
]) {
  assert.equal(parse(html, ev, observed, url).reason, reason);
}

{
  const noArticle = parse('<html><title>not news data</title></html>');
  assert.equal(noArticle.available, false);
  assert.equal(noArticle.reason, 'ambiguous_or_missing_news_article');
}

function mockStore() {
  return evidence();
}
async function runAsyncTests() {
{
  const db = database(); db.raceOnce();
  let fetched = false;
  const times = [];
  const value = await refreshMacroConsensus({ database: db, event,
    fetchText: async (url, opts) => { fetched = true; assert.equal(url, source.url); assert.equal(opts.maxBytes, 1024 * 1024); return mockStore(); },
    now: () => { assert.equal(fetched, true, 'retrieval time is captured only after fetch'); times.push(observedAt); return observedAt; },
  });
  assert.equal(value.sourceStatus.status, 'available');
  assert.equal(value.records.length, 1);
  assert.equal(db.rows.has(KEY), true);
  const record = value.records[0];
  assert.equal(record.value, 110);
  assert.equal(record.observedAt, observedAt);

  const later = await refreshMacroConsensus({ database: db, event, fetchText: async () => mockStore(), now: () => '2026-10-01T09:00:00.000Z' });
  assert.equal(later.records.length, 1, 'same source version is idempotent');
  assert.equal(later.records[0].observedAt, observedAt, 'first observedAt is immutable');
}

{
  const db = database();
  const first = await refreshMacroConsensus({ database: db, event, fetchText: async () => mockStore(), now: () => observedAt });
  const changed = await refreshMacroConsensus({ database: db, event, fetchText: async () => evidence('120,000'), now: () => '2026-10-01T09:00:00.000Z' });
  assert.equal(changed.records.length, 2);
  assert.notEqual(changed.records[0].id, changed.records[1].id);
  assert.equal(first.records[0].value, 110);
}

{
  const db = database();
  const firstHtml = evidence();
  const first = await refreshMacroConsensus({ database: db, event, fetchText: async () => firstHtml, now: () => observedAt });
  const secondHtml = `${evidence()}<footer>Updated market page navigation</footer>`;
  const second = await refreshMacroConsensus({ database: db, event, fetchText: async () => secondHtml, now: () => '2026-10-01T09:00:00.000Z' });
  assert.equal(second.records.length, 1, 'raw page changes do not create a new semantic vintage');
  assert.equal(second.records[0].id, first.records[0].id);
  assert.equal(second.records[0].contentHash, first.records[0].contentHash, 'first raw hash attestation remains immutable');
}

{
  const db = database();
  const first = await refreshMacroConsensus({ database: db, event, fetchText: async () => mockStore(), now: () => observedAt });
  const failed = await refreshMacroConsensus({ database: db, event, fetchText: async () => { throw new Error('HTTP 403 private-detail'); }, now: () => '2026-10-01T10:00:00.000Z' });
  assert.equal(failed.records.length, 1);
  assert.equal(failed.records[0].id, first.records[0].id);
  assert.equal(failed.sourceStatus.status, 'partial');
  assert.deepEqual(failed.sourceStatus.failures, [{ code: 'http_403', checkedAt: '2026-10-01T10:00:00.000Z' }]);
}

{
  const db = database();
  let releaseOlderFetch;
  const older = refreshMacroConsensus({ database: db, event,
    fetchText: () => new Promise((resolve) => { releaseOlderFetch = resolve; }),
    now: () => '2026-10-01T08:00:00.000Z' });
  // Let the newer refresh commit first while the older request is still pending.
  const newer = await refreshMacroConsensus({ database: db, event, fetchText: async () => mockStore(), now: () => '2026-10-01T09:00:00.000Z' });
  releaseOlderFetch(mockStore());
  const olderResult = await older;
  assert.equal(olderResult.updatedAt, newer.updatedAt);
  assert.deepEqual(olderResult.sourceStatus, newer.sourceStatus);
  assert.equal(olderResult.records[0].observedAt, '2026-10-01T09:00:00.000Z');
}

{
  const db = database();
  const after = await refreshMacroConsensus({ database: db, event,
    fetchText: async () => mockStore(), now: () => '2026-10-02T13:00:00.000Z' });
  assert.equal(after.records.length, 0);
  assert.equal(after.sourceStatus.failures[0].code, 'consensus_after_release');
}

{
  const db = database();
  const fetchedLate = await refreshMacroConsensus({ database: db, event, fetchText: async () => mockStore(), now: () => '2026-10-01T08:00:00.000Z' });
  const record = fetchedLate.records[0];
  const cutoffBeforeFetch = consensusAtCutoff({ records: [record], eventId: event.eventId,
    scheduledAt: event.scheduledAt, cutoff: '2026-10-01T07:59:59.999Z' });
  const cutoffAfterFetch = consensusAtCutoff({ records: [record], eventId: event.eventId,
    scheduledAt: event.scheduledAt, cutoff: observedAt, event });
  assert.equal(cutoffBeforeFetch, null, 'later retrieval cannot be retroactively used by a frozen forecast');
  assert.equal(cutoffAfterFetch.id, record.id);
  const payload = await getConsensusPayload({ database: db, event, now: observedAt });
  assert.equal(payload.current.id, record.id);
}

{
  const record = parse().record;
  const variantRecord = { ...record, scheduledAt: '2026-10-02T08:30:00-04:00' };
  assert.equal(consensusAtCutoff({ records: [variantRecord], eventId: event.eventId, scheduledAt: event.scheduledAt,
    cutoff: observedAt }).id, record.id, 'schedule equality is by instant, not raw timestamp spelling');
  assert.equal(consensusAtCutoff({ records: [record], eventId: event.eventId, scheduledAt: '2026-10-03T12:30:00.000Z',
    cutoff: observedAt }), null, 'the helper cannot rebind the reviewed September source to another release date');
  const refreshedCalendarEvent = { ...event, observedAt: '2026-10-01T08:30:00.000Z', contentHash: 'b'.repeat(64) };
  assert.equal(consensusAtCutoff({ records: [record], eventId: event.eventId, scheduledAt: event.scheduledAt,
    cutoff: '2026-10-01T08:31:00.000Z', event: refreshedCalendarEvent }).id, record.id,
  'a later hash-only schedule refresh cannot invalidate the record original observation chronology');
  for (const invalid of [
    { ...record, metric: 'other_metric' },
    { ...record, unit: 'jobs' },
    { ...record, period: '2026-08' },
    { ...record, provider: 'Other' },
    { ...record, sourceUrl: `${source.url}?utm=1` },
    { ...record, publishedAt: '2026-10-01T09:00:00.000Z' },
    { ...record, scheduleObservedAt: '2026-10-01T12:00:00.000Z' },
  ]) {
    assert.equal(consensusAtCutoff({ records: [invalid], eventId: event.eventId,
      scheduledAt: event.scheduledAt, cutoff: '2026-10-01T10:00:00.000Z' }), null);
  }
  assert.equal(consensusAtCutoff({ records: [record], eventId: event.eventId, scheduledAt: event.scheduledAt,
    cutoff: observedAt, event: { ...event, scheduleConflict: { detectedAt: observedAt } } }), null);
}

{
  const db = database();
  await refreshMacroConsensus({ database: db, event, fetchText: async () => mockStore(), now: () => observedAt });
  const payload = await getConsensusPayload({ database: db, event: { ...event, scheduleConflict: { detectedAt: observedAt } }, now: observedAt });
  assert.equal(payload.current, null, 'a conflicted current schedule cannot project consensus');
}

{
  const untouched = clone(initial);
  assert.equal(untouched.records.length, 0);
}

console.log('macro-consensus tests passed');
}
runAsyncTests().catch((error) => { console.error(error); process.exitCode = 1; });
