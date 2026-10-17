'use strict';
const assert = require('assert/strict');
const vm = require('vm');
const fs = require('fs');
const ledger = require('../src/research-ledger');
const { MODEL, PROMPT_VERSION, buildContext, checkSchema, toAiReport } = require('../src/research-runner');
const { resolveEarnings } = require('../src/research-outcomes');
const NOW = '2026-09-08T06:00:00Z';
const LATER = '2026-09-10T06:00:00Z';
const source = { id: 's1', url: 'https://example.com/ir', title: 'Earnings schedule', publishedAt: '2026-09-07T00:00:00Z', kind: 'primary', evidence: 'Schedule and estimate' };
const forecast = { eventId: 'e1', market: 'us', symbol: 'TEST', metric: 'EPS', unit: 'USD/share', period: '2026 Q3', scheduledAt: '2026-09-09T20:00:00Z',
  pointEstimate: 2, consensus: 1, consensusSourceId: 's1', probabilityAboveConsensus: 0.8, rationale: 'Synthetic test only', sourceIds: ['s1'], resolution: { provider: 'finnhub-earnings', field: 'epsActual', sourceUrl: source.url } };
const research = { macroSummary: 'Test', todayFocus: 'Test', commentary: { us: 'Test', bist: 'Missing', crypto: 'Missing' },
  coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: 'partial', reason: 'Test' })), sources: [source],
  events: [{ id: 'e1', market: 'us', title: 'Test', sourceIds: ['s1'], whatChanged: 'Test', expectationGap: 'Test', counterEvidence: 'Test' }],
  forecasts: [forecast], scenarios: [], signals: [], unresolvedQuestions: [] };
checkSchema(research);
assert.equal(MODEL, 'gpt-6.1-sol');
assert.equal(PROMPT_VERSION, 'sol-research-v8');
const researchPrompt = fs.readFileSync(require.resolve('../routines/sol-research.md'), 'utf8');
assert.match(researchPrompt, /evidenceStatus=official_announcement_text ve sourceId=spk_announcements/);
assert.match(researchPrompt, /publishedAt=null ise saat veya gece yarısı üretme/);
assert.match(researchPrompt, /observedAt yalnız sistemin kaynağı aldığı zamandır/);
assert.match(researchPrompt, /tam resmî duyuruyu ve ilgili bülten\/mevzuat metnini aç/);
assert.match(researchPrompt, /gerçek kapsam, istisnalar ve karşı koşullarla sınırla/);
assert.match(researchPrompt, /Taslak süreç açıklamasını, gelecekte duyurulmuş tedbiri ve yürürlükteki kuralı ayırt et/);
assert.match(researchPrompt, /saklanan eski kayıtları bugünün yeni duyurusu gibi sunma/);
assert.match(researchPrompt, /KAP kaynağının eksik olması şirket kapsamının doğrulandığı anlamına gelmez/);
assert.match(researchPrompt, /Kaynaklı hukuki yorum üretmek yasak değildir/);
const context = buildContext({ runId: 'run1', snapshotId: NOW, markets: {}, quality: {}, calendar: {} },
  { us: [{ symbol: 'TEST', price: 100, currency: 'USD', quoteTime: NOW, pe: 20, marketCap: 1000000, analysis: { score: 60 } }],
    bist: [{ symbol: 'BIST', price: 50, currency: 'TRY', quoteTime: NOW, analysis: { score: 50 } }] }, {});
assert.equal(context.assets[0].pe, 20);
assert.equal(context.assets[0].marketCap, 1000000);
assert.equal(context.assets[1].pe, null, 'missing valuation multiples must stay missing');
assert.equal(context.assets[1].marketCap, null);
assert.equal(context.assets[1].currency, 'TRY');
assert.throws(() => checkSchema({ ...research, unexpected: 1 }));
assert.throws(() => checkSchema({ ...research, forecasts: [{ ...forecast, consensus: '1' }] }));
assert.throws(() => ledger.validateResearch({ ...research, sources: [{ ...source, publishedAt: LATER }] }, NOW));
assert.equal(ledger.validateResearch({ ...research, forecasts: [], sources: [{ ...source, publishedAt: null }] }, NOW), true);
assert.throws(() => ledger.validateResearch({ ...research, sources: [{ ...source, publishedAt: null }] }, NOW), /tarihli kaynak/);
assert.throws(() => ledger.validateResearch({ ...research, events: [{ ...research.events[0], sourceIds: ['unknown'] }] }, NOW));
assert.throws(() => ledger.validateResearch({ ...research, forecasts: [{ ...forecast, scheduledAt: NOW }] }, NOW));
assert.throws(() => ledger.validateResearch({ ...research, forecasts: [{ ...forecast, consensus: null }] }, NOW));
assert.throws(() => ledger.validateResearch({ ...research, forecasts: [{ ...forecast, unit: 'TRY' }] }, NOW));
const ai = toAiReport({ ...research, model: 'gpt-6-astra', promptVersion: 'test', generatedAt: NOW }, { runId: 'run1', snapshotId: NOW });
assert.equal(ai.worldNews[0].impact, 'bağlam', 'legacy impact label must stay short and must not infer direction');
let l = ledger.addResearch(ledger.empty(), ai, NOW);
assert.equal(l.forecasts.length, 1);
assert.equal(ledger.addResearch(l, ai, NOW).forecasts.length, 1);
assert.throws(() => ledger.addResearch(l, { ...ai, research: { ...ai.research, forecasts: [{ ...forecast, pointEstimate: 3 }] } }, NOW), /degistirilemez/);
assert.equal(ledger.addResearch(l, { ...ai, runId: 'run2' }, NOW).forecasts.length, 1, 'same forecast on another run must not inflate sample');
const reviewAt = '2026-09-08T08:00:00Z';
const reviewed = ledger.addResearch(l, { ...ai, runId: 'review-run', research: { ...ai.research,
  generatedAt: reviewAt, forecasts: [{ ...forecast, pointEstimate: 3, rationale: 'New evidence changes opinion' }] } }, reviewAt);
const reviews = ledger.forecastReviews(reviewed);
assert.equal(reviews.length, 1);
assert.equal(reviews[0].pointEstimate, 3);
assert.equal(reviews[0].originalPointEstimate, 2);
assert.equal(reviews[0].originalForecastId, l.forecasts[0].id);
assert.equal(reviews[0].reviewOnly, true);
assert.equal(reviews[0].knowledgeCutoff, reviewAt);
assert.equal(reviews[0].knowledgeCutoffBasis, 'research_generated_at');
assert.equal(reviewed.forecasts.length, 1);
assert.deepEqual(reviewed.forecasts, l.forecasts, 'later opinions cannot rewrite the first scored record');
assert.deepEqual(ledger.scorecard(reviewed, reviewAt), ledger.scorecard(l, reviewAt), 'reviews cannot inflate accuracy sample size');
const analysisCutoff = '2026-09-08T07:30:00Z';
const analysisReviewed = ledger.addResearch(l, { ...ai, runId: 'analysis-review-run', research: { ...ai.research,
  generatedAt: reviewAt, analysisAsOf: analysisCutoff,
  forecasts: [{ ...forecast, pointEstimate: 3, rationale: 'Review with explicit analysis cutoff' }] } }, reviewAt);
const analysisReview = ledger.forecastReviews(analysisReviewed)[0];
assert.equal(analysisReview.knowledgeCutoff, analysisCutoff);
assert.equal(analysisReview.knowledgeCutoffBasis, 'research_analysis_as_of');
const fallbackReviewed = ledger.addResearch(l, { ...ai, runId: 'fallback-review-run', research: { ...ai.research,
  generatedAt: null, analysisAsOf: null,
  forecasts: [{ ...forecast, pointEstimate: 3, rationale: 'Review with publication time fallback' }] } }, reviewAt);
const fallbackReview = ledger.forecastReviews(fallbackReviewed)[0];
assert.equal(fallbackReview.knowledgeCutoff, reviewAt);
assert.equal(fallbackReview.knowledgeCutoffBasis, 'publication_time_fallback');
assert.equal(Object.hasOwn(fallbackReview, 'observedAt'), false, 'a projection cutoff does not imply source retrieval provenance');
const outcome = { forecastId: l.forecasts[0].id, value: 0, sourceUrl: source.url, publishedAt: LATER, unit: forecast.unit, period: forecast.period, metric: forecast.metric };
assert.throws(() => ledger.resolveForecast(l, { ...outcome, unit: 'USD' }, LATER));
assert.throws(() => ledger.resolveForecast(l, { ...outcome, publishedAt: NOW }, LATER));
assert.throws(() => ledger.resolveForecast(l, { ...outcome, value: null }, LATER));
const resolved = ledger.resolveForecast(l, outcome, LATER);
assert.equal(l.outcomes.length, 0, 'immutable input');
assert.equal(resolved.outcomes[0].absoluteError, 2, 'zero actual is not missing');
assert.equal(ledger.resolveForecast(reviewed, outcome, LATER).outcomes[0].absoluteError, 2, 'outcome compares against first forecast, never the later opinion');
assert.equal(resolved.outcomes[0].consensusAbsoluteError, 1);
assert.ok(Math.abs(resolved.outcomes[0].brier - 0.64) < 1e-10);
assert.equal(ledger.resolveForecast(resolved, outcome, LATER).outcomes.length, 1);
assert.throws(() => ledger.resolveForecast(resolved, { ...outcome, value: 9 }, LATER), /degistirilemez/);
assert.equal(ledger.scorecard(ledger.empty(), NOW).groups.length, 0);
assert.equal(ledger.scorecard(l, NOW).groups[0].mae, null);
assert.equal(ledger.scorecard(l, LATER).awaitingOutcome, 1);
const scores = ledger.scorecard(resolved, LATER);
assert.equal(scores.groups[0].pairedModelMae, 2);
assert.equal(scores.groups[0].consensusMae, 1);
assert.equal(scores.groups[0].sampleStatus, 'insufficient_sample');
const ctx = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../public/research'), 'utf8'), ctx);
assert.match(ctx.FinansResearch.evaluationHtml({ scorecard: scores, forecasts: resolved.forecasts, outcomes: resolved.outcomes }), /2 \/ 1/);
assert.ok(!ctx.FinansResearch.researchHtml({ ...ai.research, events: [{ ...research.events[0], title: '<script>x</script>' }] }).includes('<script>'));
assert.match(ctx.FinansResearch.researchHtml(ai.research), /Model araştırması.*gpt-6-astra/, 'legacy report keeps its actual model label');
assert.match(ctx.FinansResearch.researchHtml({ ...ai.research, model: MODEL }), /Model araştırması.*gpt-6\.1-sol/);

(async () => {
  let saved = l; let revision = 'r1'; let writes = 0;
  const database = { getCache: async () => ({ value: saved, revision }), compareAndSetCache: async (key, next, expected) => {
    assert.equal(expected, revision); writes++; if (writes === 1) { revision = 'r2'; const e = new Error('race'); e.statusCode = 409; throw e; }
    saved = next; revision = 'r3';
  } };
  const result = await resolveEarnings({ database, token: 'test-only', now: LATER, fetcher: async () => ({ earningsCalendar: [{ symbol: 'TEST', date: '2026-09-09', epsActual: 0 }] }) });
  assert.equal(result.resolved, 1); assert.equal(writes, 2); assert.equal(saved.outcomes[0].value, 0);
  assert.equal(saved.outcomes[0].verification, 'provider-first-observed');
  const again = await resolveEarnings({ database, token: 'test-only', now: LATER, fetcher: async () => { throw new Error('must not fetch'); } });
  assert.equal(again.status, 'no_due_forecasts');
  await assert.rejects(resolveEarnings({ database: { getCache: async () => ({ value: l, revision }) }, token: 'test', now: LATER, fetcher: async () => ({ __error: '403' }) }), /erisilemedi/);
  const partial = await resolveEarnings({ database: { getCache: async () => ({ value: l, revision }) }, token: 'test', now: LATER, fetcher: async () => ({ earningsCalendar: [{ symbol: 'TEST', date: '2026-09-09', epsActual: null }] }) });
  assert.equal(partial.resolved, 0);
  console.log('Research: schema, lookahead, immutable forecasts, outcomes, baseline metrics, conflict retry and UI escaping passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
