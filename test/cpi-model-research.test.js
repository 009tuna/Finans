'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { KEY: RESEARCH_KEY, empty, addResearch, validateResearch, forecastReviews, scorecard } = require('../src/research-ledger');
const { KEY: MACRO_KEY, initial: macroInitial } = require('../src/macro-store');
const { KEY: CPI_KEY, initial: cpiInitial } = require('../src/cpi-store');
const { METRICS, archiveUrl } = require('../src/cpi-sources');
const { resolveBlsResearch, resolveCpiResearch } = require('../src/macro-research-outcomes');

const BEFORE = '2026-10-01T12:00:00.000Z';
const RELEASE = '2026-10-14T12:30:00.000Z';
const AFTER = '2026-10-14T12:32:00.000Z';
const ARCHIVE = archiveUrl('2026-10-14');
const CALENDAR = 'https://www.bls.gov/schedule/news_release/cpi.htm';
const datedSource = { id: 'numeric', url: 'https://www.bls.gov/news.release/archives/cpi_09112026.htm', title: 'Previous dated CPI release', publishedAt: '2026-09-11T12:30:00.000Z', kind: 'primary', evidence: 'Dated numeric evidence.' };
const calendarSource = { id: 'calendar', url: CALENDAR, title: 'CPI release schedule', publishedAt: null, kind: 'primary', evidence: 'Official future release calendar.' };
const eventId = 'cpi-model-event';

function forecast(metric, field, pointEstimate = 0) {
  return { eventId, market: 'us', symbol: '', metric, unit: 'percent', period: '2026-09', scheduledAt: RELEASE, pointEstimate, consensus: null, consensusSourceId: '', probabilityAboveConsensus: null,
    rationale: 'Synthetic typed CPI forecast.', sourceIds: ['numeric', 'calendar'], resolution: { provider: 'bls-first-release', field, sourceUrl: ARCHIVE } };
}
const fields = ['cpiHeadlineMomSa', 'cpiCoreMomSa', 'cpiHeadlineYoyNsa', 'cpiCoreYoyNsa'];
const forecasts = METRICS.map((metric, index) => forecast(metric.metric, fields[index], index + 0.1));
function researchWith(nextForecasts = forecasts, sourceList = [datedSource, calendarSource]) {
  return { macroSummary: 'Synthetic', todayFocus: 'Synthetic', commentary: { us: 'Synthetic', bist: 'Synthetic', crypto: 'Synthetic' },
    coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: 'partial', reason: 'Synthetic fixture' })), sources: sourceList,
    events: [{ id: eventId, market: 'us', title: 'CPI event', sourceIds: sourceList.map((source) => source.id), whatChanged: 'Synthetic', expectationGap: 'Synthetic', counterEvidence: 'Synthetic' }],
    forecasts: nextForecasts, scenarios: [], signals: [], unresolvedQuestions: [] };
}
function observation(metric, value, observedAt = '2026-10-14T12:31:00.000Z') {
  return { ...metric, id: `${metric.metric}:2026-09:first_release`, period: '2026-09', value, vintage: 'first_release', publishedAt: RELEASE, observedAt,
    sourceUrl: ARCHIVE, contentHash: createHash('sha256').update(metric.metric).digest('hex') };
}
function cpiEvent(overrides = {}) {
  return { eventId: 'us_cpi:2026-09', period: '2026-09', scheduledAt: RELEASE, sourceUrl: CALENDAR, contentHash: 'c'.repeat(64), observedAt: '2026-10-01T10:00:00.000Z', ...overrides };
}
function database(ledger, cpi = cpiInitial, macro = macroInitial, { failCpi = false, failMacro = false, failResearch = false, reads = [] } = {}) {
  let writes = 0;
  return { get writes() { return writes; }, reads, getCache: async (key) => {
    reads.push(key);
    if (key === RESEARCH_KEY) { if (failResearch) throw new Error('research storage down'); return { value: structuredClone(ledger), revision: 'research-r0' }; }
    if (key === CPI_KEY) { if (failCpi) throw new Error('cpi storage down'); return { value: structuredClone(cpi), revision: 'cpi-r0' }; }
    if (key === MACRO_KEY) { if (failMacro) throw new Error('nfp storage down'); return { value: structuredClone(macro), revision: 'macro-r0' }; }
    return null;
  }, compareAndSetCache: async (key, next, expected) => { assert.equal(key, RESEARCH_KEY); assert.equal(expected, 'research-r0'); writes++; ledger.runs = next.runs; ledger.forecasts = next.forecasts; ledger.outcomes = next.outcomes; return 'research-r1'; } };
}

test('typed CPI schema accepts all four fields and rejects mappings, archive paths, and undated-only evidence', () => {
  validateResearch(researchWith(), BEFORE);
  for (const [index, patch] of [[0, { metric: 'us_cpi_core_mom_sa' }], [1, { unit: 'basis_points' }], [2, { resolution: { ...forecasts[2].resolution, field: 'cpiHeadlineMomSa' } }], [3, { resolution: { ...forecasts[3].resolution, sourceUrl: 'https://www.bls.gov/news.release/cpi.htm' } }]]) {
    assert.throws(() => validateResearch(researchWith(forecasts.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)), BEFORE));
  }
  assert.throws(() => validateResearch(researchWith(forecasts.map((item) => ({ ...item, sourceIds: ['calendar'] })), [calendarSource]), BEFORE));
  assert.throws(() => validateResearch(researchWith(forecasts, [{ ...calendarSource, url: 'https://www.bls.gov/schedule/news_release/cpi.htm?mutable=1' }, datedSource]), BEFORE), /tarihli/);
  assert.throws(() => validateResearch(researchWith(forecasts.map((item) => ({ ...item, scheduledAt: '2026-09-14T12:30:00.000Z' })), [datedSource, calendarSource]), BEFORE));
});

test('CPI resolver uses each typed observation, freezes first model forecasts, and is idempotent', async () => {
  const ai = { runId: 'cpi-run', generatedAt: BEFORE, research: { ...researchWith(), generatedAt: BEFORE } };
  const ledger = addResearch(empty(), ai, BEFORE);
  assert.equal(ledger.forecasts.every((item) => item.createdAt === BEFORE && item.knowledgeCutoff === BEFORE), true);
  const cpi = { ...structuredClone(cpiInitial), events: [cpiEvent()], observations: METRICS.map((metric, index) => observation(metric, index === 1 ? 0 : index + 0.5)) };
  const db = database(ledger, cpi);
  const result = await resolveBlsResearch({ database: db, now: AFTER });
  assert.equal(result.resolved, 4);
  assert.equal(result.cpi.due, 4);
  assert.deepEqual(ledger.outcomes.map((item) => item.metric), METRICS.map((item) => item.metric));
  assert.equal(db.writes, 1);
  const immutable = structuredClone(ledger.outcomes);
  const again = await resolveCpiResearch({ database: db, now: AFTER });
  assert.equal(again.resolved, 0);
  assert.equal(db.writes, 1);
  assert.deepEqual(ledger.outcomes, immutable);
});

test('CPI resolver refuses missing event proof, future acquisition, schedule conflicts, and contested actuals', async () => {
  for (const cpi of [
    { ...structuredClone(cpiInitial), observations: [observation(METRICS[0], 0.4)] },
    { ...structuredClone(cpiInitial), events: [cpiEvent()], observations: [observation(METRICS[0], 0.4, '2026-10-14T12:40:00.000Z')] },
    { ...structuredClone(cpiInitial), events: [cpiEvent({ scheduleConflict: { detectedAt: AFTER } })], observations: [observation(METRICS[0], 0.4)] },
    { ...structuredClone(cpiInitial), events: [cpiEvent()], observations: [observation(METRICS[0], 0.4)], correctionReviews: [{ conflictWith: 'us_cpi_headline_mom_sa:2026-09:first_release' }] },
  ]) {
    const ledger = addResearch(empty(), { runId: 'run-' + Math.random(), generatedAt: BEFORE, research: { ...researchWith([forecasts[0]]), generatedAt: BEFORE } }, BEFORE);
    const db = database(ledger, cpi);
    const result = await resolveCpiResearch({ database: db, now: AFTER });
    assert.equal(result.resolved, 0);
    assert.equal(db.writes, 0);
  }
});

test('CPI store failure is isolated while NFP still resolves', async () => {
  const nfpRelease = '2026-10-02T12:30:00.000Z';
  const nfp = { ...forecasts[0], eventId: 'nfp-event', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', scheduledAt: nfpRelease, pointEstimate: 100,
    sourceIds: ['nfp'], resolution: { provider: 'bls-first-release', field: 'nonfarmPayrollChange', sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_10022026.htm' } };
  const nfpSource = { id: 'nfp', url: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm', title: 'NFP source', publishedAt: '2026-09-04T12:30:00.000Z', kind: 'primary', evidence: 'Synthetic' };
  const research = researchWith([nfp, forecasts[0]], [nfpSource, datedSource, calendarSource]);
  research.events = [{ ...research.events[0], id: 'nfp-event', sourceIds: ['nfp'] }, { ...research.events[0], id: eventId, sourceIds: ['numeric', 'calendar'] }];
  const ledger = addResearch(empty(), { runId: 'mixed-run', research }, BEFORE);
  const macro = { ...structuredClone(macroInitial), events: [{ period: '2026-09' }], observations: [{ metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-09', value: 80, vintage: 'first_release', sourceUrl: nfp.resolution.sourceUrl, publishedAt: nfpRelease, observedAt: AFTER, contentHash: 'a'.repeat(64) }] };
  const db = database(ledger, cpiInitial, macro, { failCpi: true });
  const result = await resolveBlsResearch({ database: db, now: AFTER });
  assert.equal(result.nfp.resolved, 1);
  assert.equal(result.cpi.status, 'unavailable');
  assert.equal(ledger.outcomes.length, 1);
});

test('resolver reads only due family stores and does not touch NFP storage for CPI-only work', async () => {
  const readsWithoutDue = [];
  const idle = database(empty(), cpiInitial, macroInitial, { reads: readsWithoutDue });
  const idleResult = await resolveBlsResearch({ database: idle, now: AFTER });
  assert.equal(idleResult.resolved, 0);
  assert.equal(idleResult.cpi.due, 0);
  assert.deepEqual(readsWithoutDue, [RESEARCH_KEY]);
  const ledger = addResearch(empty(), { runId: 'lazy-cpi', generatedAt: BEFORE, research: { ...researchWith([forecasts[0]]), generatedAt: BEFORE } }, BEFORE);
  const readsWithCpi = [];
  const cpiOnly = database(ledger, { ...structuredClone(cpiInitial), events: [cpiEvent()] }, macroInitial, { reads: readsWithCpi });
  const dueResult = await resolveBlsResearch({ database: cpiOnly, now: AFTER });
  assert.equal(dueResult.cpi.due, 1);
  assert.deepEqual(readsWithCpi, [RESEARCH_KEY, CPI_KEY]);
  assert.equal(readsWithCpi.includes(MACRO_KEY), false);
});

test('shared research failure aborts resolution before any family read or outcome write', async () => {
  const reads = [];
  const db = database(empty(), cpiInitial, macroInitial, { failResearch: true, reads });
  await assert.rejects(resolveBlsResearch({ database: db, now: AFTER }), /research storage down/);
  assert.deepEqual(reads, [RESEARCH_KEY]);
  assert.equal(db.writes, 0);
});

test('later CPI reviews remain review-only and metric samples stay separate', () => {
  const ledger = addResearch(empty(), { runId: 'original', generatedAt: BEFORE, research: { ...researchWith(), generatedAt: BEFORE } }, BEFORE);
  const reviewed = addResearch(ledger, { runId: 'review', generatedAt: '2026-10-02T12:00:00.000Z', research: { ...researchWith(forecasts.map((item) => ({ ...item, pointEstimate: item.pointEstimate + 10 }))), generatedAt: '2026-10-02T12:00:00.000Z', analysisAsOf: '2026-10-01T12:00:00.000Z' } }, '2026-10-02T12:00:00.000Z');
  assert.equal(reviewed.forecasts.length, 4);
  assert.equal(forecastReviews(reviewed).length, 4);
  assert.equal(scorecard(reviewed).groups.length, 4);
  assert.ok(forecastReviews(reviewed).every((item) => item.reviewOnly && item.scoringPolicy === 'original_forecast_only'));
  assert.equal(forecastReviews(reviewed)[0].knowledgeCutoff, '2026-10-02T12:00:00.000Z');
  assert.equal(forecastReviews(reviewed)[0].createdAt, '2026-10-02T12:00:00.000Z');
});

test('malformed stored CPI forecasts abstain without interrupting resolution', async () => {
  const validCpi = { ...structuredClone(cpiInitial), events: [cpiEvent()], observations: [observation(METRICS[0], 0.4)] };
  const patches = [
    { pointEstimate: null },
    { sourceIds: ['calendar'], sourceEvidence: [calendarSource] },
    { sourceIds: null },
    { sourceEvidence: [datedSource, { ...calendarSource }, { ...datedSource, id: 'late', url: 'https://example.com/late', publishedAt: '2026-10-02T12:30:00.000Z' }] },
    { recordedAt: '2026-10-15T12:31:00.000Z' },
  ];
  for (const patch of patches) {
    const ledger = addResearch(empty(), { runId: 'malformed-' + Math.random(), generatedAt: BEFORE, research: { ...researchWith([forecasts[0]]), generatedAt: BEFORE } }, BEFORE);
    ledger.forecasts[0] = { ...ledger.forecasts[0], ...patch };
    const db = database(ledger, validCpi);
    const result = await resolveCpiResearch({ database: db, now: AFTER });
    assert.equal(result.resolved, 0);
    assert.equal(db.writes, 0);
  }
});
