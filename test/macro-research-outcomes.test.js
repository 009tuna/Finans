'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { empty, addResearch, validateResearch, KEY: RESEARCH_KEY } = require('../src/research-ledger');
const { KEY: MACRO_KEY, initial, macroPayload } = require('../src/macro-store');
const { resolveBlsResearch } = require('../src/macro-research-outcomes');
const { getIntelligenceContext } = require('../src/intelligence-context');
const { checkSchema } = require('../src/research-runner');
const BEFORE = '2026-10-01T08:00:00.000Z'; const RELEASE = '2026-10-02T12:30:00.000Z'; const AFTER = '2026-10-02T12:32:00.000Z';
const forecast = { eventId: 'nfp-research', market: 'us', symbol: '', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-09',
  scheduledAt: RELEASE, pointEstimate: 100, consensus: null, consensusSourceId: '', probabilityAboveConsensus: null,
  rationale: 'Synthetic forecast for integration test.', sourceIds: ['s'], resolution: { provider: 'bls-first-release', field: 'nonfarmPayrollChange', sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_10022026.htm' } };
const research = { macroSummary: 'Synthetic', todayFocus: 'Synthetic', commentary: { us: 'Synthetic', bist: 'Synthetic', crypto: 'Synthetic' },
  coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: 'partial', reason: 'Synthetic fixture' })),
  sources: [{ id: 's', url: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm', title: 'Test source', publishedAt: '2026-09-04T12:30:00Z', kind: 'primary', evidence: 'Synthetic test only' }],
  events: [{ id: forecast.eventId, market: 'us', title: 'Synthetic event', sourceIds: ['s'], whatChanged: 'Synthetic', expectationGap: 'Synthetic', counterEvidence: 'Synthetic' }],
  forecasts: [forecast], scenarios: [{ eventId: forecast.eventId, market: 'us', symbol: '', condition: 'Synthetic high', impact: 'Synthetic', horizon: 'Synthetic', invalidation: 'Synthetic', sourceIds: ['s'] }], signals: [], unresolvedQuestions: [] };
checkSchema(research); validateResearch(research, BEFORE);
const calendar = { id: 'calendar', url: 'https://www.bls.gov/schedule/2026/10_sched.htm', title: 'Official calendar fixture', publishedAt: null, kind: 'primary', evidence: 'Release schedule, not a numerical observation.' };
const withCalendar = { ...research, sources: [...research.sources, calendar], forecasts: [{ ...forecast, sourceIds: ['s', calendar.id] }] };
validateResearch(withCalendar, BEFORE);
assert.throws(() => validateResearch({ ...withCalendar, sources: [...research.sources, { ...calendar, url: 'https://www.bls.gov/news.release/empsit.htm' }] }, BEFORE), /tarihli/);
assert.throws(() => validateResearch({ ...withCalendar, forecasts: [{ ...forecast, sourceIds: [calendar.id] }] }, BEFORE), /tarihli/);
assert.throws(() => validateResearch({ ...research, forecasts: [{ ...forecast, resolution: { ...forecast.resolution, sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm' } }] }, BEFORE), /BLS/);
for (const patch of [{ metric: 'EPS' }, { unit: 'jobs' }, { symbol: 'TEST' }, { period: '2026 Q3' }, { resolution: { ...forecast.resolution, sourceUrl: 'https://evil.test/empsit_10022026.htm' } }]) assert.throws(() => validateResearch({ ...research, forecasts: [{ ...forecast, ...patch }] }, BEFORE));
const ai = { runId: 'fixture-run', research: { ...research, model: 'gpt-6.1-sol', promptVersion: 'sol-research-v2' } };
const seed = addResearch(empty(), ai, BEFORE); seed.publication = { ai };
const observation = { metric: forecast.metric, unit: forecast.unit, period: forecast.period, value: 80, vintage: 'first_release',
  sourceUrl: forecast.resolution.sourceUrl, publishedAt: RELEASE, observedAt: AFTER, contentHash: createHash('sha256').update('synthetic').digest('hex') };
const event = { eventId: forecast.metric + ':' + forecast.period, metric: forecast.metric, unit: forecast.unit, period: forecast.period, scheduledAt: RELEASE };
(async () => {
  let ledger = structuredClone(seed); let revision = 'r0'; let writes = 0;
  const macro = { ...structuredClone(initial), events: [event], observations: [observation] };
  const db = { getCache: async (key) => key === RESEARCH_KEY ? { value: structuredClone(ledger), revision } : key === MACRO_KEY ? { value: structuredClone(macro), revision: 'macro' } : null,
    compareAndSetCache: async (key, next, previous) => { assert.equal(key, RESEARCH_KEY); assert.equal(previous, revision); ledger = structuredClone(next); revision = 'r' + (++writes); } };
  const view = macroPayload(initial, seed, BEFORE);
  assert.equal(view.nextEvent.eventId, event.eventId); assert.equal(view.nextEvent.scheduleVerification, 'model-cited-web-research');
  assert.equal(view.modelForecasts[0].researchEventId, forecast.eventId); assert.equal(view.modelScenarios[0].eventId, event.eventId);
  assert.equal(view.forecasts.length, 0, 'model calendar context cannot create deterministic forecasts');
  const reviewAt = '2026-10-01T10:00:00.000Z';
  const reviewed = addResearch(seed, { runId: 'review-run', research: { ...ai.research, generatedAt: reviewAt,
    forecasts: [{ ...forecast, pointEstimate: 90 }], scenarios: research.scenarios } }, reviewAt);
  reviewed.publication = { ai: { runId: 'review-run', research: { ...ai.research, scenarios: research.scenarios } } };
  const reviewView = macroPayload(initial, reviewed, reviewAt);
  assert.equal(reviewView.modelForecasts[0].pointEstimate, forecast.pointEstimate);
  assert.equal(reviewView.modelForecastReviews[0].pointEstimate, 90);
  assert.equal(reviewView.modelForecastReviews[0].eventId, event.eventId);
  assert.equal(reviewView.modelScenarios[0].referenceKind, 'current_model_opinion');
  assert.equal(reviewView.modelScenarios[0].referenceEstimate, 90);
  const resolved = await resolveBlsResearch({ database: db, now: AFTER });
  assert.equal(resolved.resolved, 1); assert.equal(ledger.outcomes[0].absoluteError, 20);
  assert.equal(ledger.outcomes[0].vintage, 'first_release'); assert.equal(ledger.outcomes[0].verification, 'bls-official-first-release');
  const immutable = structuredClone(ledger.outcomes);
  await resolveBlsResearch({ database: db, now: AFTER }); assert.equal(writes, 1); assert.deepEqual(ledger.outcomes, immutable);
  ledger = structuredClone(seed); macro.events[0].scheduleConflict = { detectedAt: AFTER };
  assert.equal((await resolveBlsResearch({ database: db, now: AFTER })).awaiting, 1); assert.equal(ledger.outcomes.length, 0);
  const context = await getIntelligenceContext({ database: db, researchLedger: ledger, now: BEFORE });
  assert.equal(context.macro.consensus, null); assert.equal(context.macro.systemForecasts.length, 0);
  console.log('BLS model forecasts: provider validation, independent context and immutable first-release resolution passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
