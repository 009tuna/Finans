'use strict';
const assert = require('node:assert/strict');
const { buildExpectationAgenda, buildExpectationCoverage, attachExpectationContext, validateExpectationCoverage } = require('../src/research-expectations');
const { checkSchema } = require('../src/research-runner');
const schema = require('../src/research-schema');
const { validateResearch, addResearch, forecastReviews, empty } = require('../src/research-ledger');
const now = '2026-10-01T06:00:00.000Z';
const nfpDate = '2026-10-02T12:30:00.000Z', cpiDate = '2026-10-14T12:30:00.000Z';
const event = { period: '2026-09', scheduledAt: nfpDate, sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm' };
const prior = { market: 'us', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: event.period, scheduledAt: nfpDate,
  pointEstimate: 0, knowledgeCutoff: '2026-09-30T12:00:00.000Z', rationale: 'Synthetic recorded first view' };
const independent = { macro: { nextEvent: event, frozenModelForecasts: [prior], modelForecastReviews: [],
  families: { us_cpi: { nextEvent: { ...event, scheduledAt: cpiDate, sourceUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm' }, metrics: [] } } } };
const research = { macroSummary: 'Fixture', todayFocus: 'Fixture', commentary: { us: 'Fixture', bist: 'Fixture', crypto: 'Fixture' },
  coverage: ['us', 'bist', 'crypto'].map(market => ({ market, status: 'partial', reason: 'Fixture' })),
  sources: [], events: [], forecasts: [], scenarios: [], signals: [], unresolvedQuestions: [] };
const abstain = target => ({ market: target.market, metric: target.metric, unit: target.unit, period: target.period,
  scheduledAt: target.scheduledAt, reason: 'Dated numeric evidence not available in synthetic fixture.',
  missingEvidence: ['Verified dated period evidence'], sourceIds: [] });
const assessmentSource = { id: 'synthetic-reassessment', url: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm', title: 'Synthetic reviewed input',
  evidence: 'Synthetic dated input reviewed today; not current market guidance.', kind: 'primary', publishedAt: '2026-09-04T12:30:00Z' };
const reassess = (target, status = 'unchanged') => ({ market: target.market, metric: target.metric, unit: target.unit, period: target.period,
  scheduledAt: target.scheduledAt, status, reason: 'Synthetic evidence reviewed; the recorded opinion remains unchanged.',
  sourceIds: status === 'abstained' ? [] : [assessmentSource.id] });
const clone = structuredClone(independent);
const agenda = buildExpectationAgenda(independent, now);
assert.equal(agenda.length, 5, 'one NFP and four distinct CPI targets, even if CPI inputs are missing');
assert.equal(agenda[0].firstFrozenForecast.pointEstimate, 0, 'a zero point estimate is a valid retained opinion');
assert.deepEqual(independent, clone, 'agenda cannot rewrite stored forecasts');
assert.equal(buildExpectationAgenda(independent, nfpDate).length, 4, 'a release reaching its deadline leaves the pre-release agenda');
assert.equal(buildExpectationAgenda(independent, '2026-09-01T06:00:00Z').length, 0, 'distant releases do not crowd daily expectations');
assert.equal(buildExpectationAgenda({}, now).length, 0, 'missing sources cannot create calendar events');
const futureEvidence = structuredClone(independent); futureEvidence.macro.frozenModelForecasts[0].knowledgeCutoff = '2026-10-02T13:00:00Z';
assert.equal(buildExpectationAgenda(futureEvidence, now)[0].firstFrozenForecast, null, 'lookahead cannot qualify as a retained forecast');
const lateRecord = structuredClone(independent); lateRecord.macro.frozenModelForecasts[0].recordedAt = '2026-10-02T13:00:00Z';
assert.equal(buildExpectationAgenda(lateRecord, now)[0].firstFrozenForecast, null, 'backdated evidence cannot qualify a late-created record');
const differentMetric = structuredClone(independent); differentMetric.macro.frozenModelForecasts[0].unit = 'jobs';
assert.equal(buildExpectationAgenda(differentMetric, now)[0].firstFrozenForecast, null, 'unit mismatch cannot silently substitute a prior forecast');
const current = { ...research, sources: [assessmentSource], forecastAbstentions: agenda.slice(1).map(abstain), expectationReassessments: [reassess(agenda[0])] };
assert.equal(validateExpectationCoverage(current, agenda, now), true, 'explicit sourced reassessment covers retained NFP; explicit gaps cover CPI');
assert.throws(() => validateExpectationCoverage(research, agenda, now), /yeniden degerlendirme/);
assert.throws(() => validateExpectationCoverage({ ...current, expectationReassessments: [] }, agenda, now), /yeniden degerlendirme/, 'a frozen record alone no longer completes today\'s task');
assert.equal(validateResearch(current, now), true, 'no source is fabricated when the source itself is unavailable');
checkSchema(research); // Historical records need no backfill or new timestamps.
assert.throws(() => checkSchema(research, { ...schema, required: Object.keys(schema.properties) }), /forecastAbstentions.*eksik/);
const view = { stance: 'nötr', conviction: 'düşük', thesis: 'Fixture', drivers: [], risks: [], watch: '' };
const analystFields = { marketViews: { us: view, bist: view, crypto: view }, calendarAnalysis: [], turkeyCalendar: [] };
assert.throws(() => checkSchema(current, { ...schema, required: Object.keys(schema.properties) }), /marketViews.*eksik/, 'the v8 generator requires the analyst layer');
checkSchema({ ...current, ...analystFields }, { ...schema, required: Object.keys(schema.properties) });
const gapOnly = { ...current, expectationReassessments: [] };
const ledger = addResearch(empty(), { runId: 'abstention-only', research: gapOnly }, now);
assert.equal(ledger.forecasts.length, 0, 'abstentions never increase the scored sample');
assert.equal(ledger.runs[0].research.forecastAbstentions.length, 4, 'evidence gaps remain visible in the immutable run');
assert.throws(() => validateResearch({ ...current, forecastAbstentions: [current.forecastAbstentions[0], current.forecastAbstentions[0]] }, now), /Tekrarlanan/);
assert.throws(() => validateResearch({ ...current, forecastAbstentions: [{ ...current.forecastAbstentions[0], sourceIds: ['invented'] }] }, now), /eksik kanit/);
assert.throws(() => validateResearch({ ...current, forecastAbstentions: [{ ...current.forecastAbstentions[0], missingEvidence: [] }] }, now), /eksik kanit/);
assert.throws(() => validateResearch(current, cpiDate), /gelecek aciklama/);
const historical = { ...current, analysisAsOf: now, generatedAt: cpiDate };
assert.equal(validateResearch(historical, cpiDate), true, 'a release during research must not reject a non-numeric historical evidence gap');
const afterReleaseLedger = addResearch(empty(), { runId: 'release-crossing-gap', research: { ...historical, expectationReassessments: [] } }, cpiDate);
assert.equal(afterReleaseLedger.forecasts.length, 0, 'release-crossing abstentions cannot become scored late forecasts');
assert.equal(afterReleaseLedger.runs[0].research.forecastAbstentions.length, 4, 'pre-release gaps survive in the immutable history');
assert.throws(() => validateResearch({ ...historical, analysisAsOf: cpiDate }, cpiDate), /aciklama oncesi/);
assert.throws(() => validateResearch({ ...historical, analysisAsOf: '2026-10-15T12:00:00Z' }, cpiDate), /aciklama oncesi/);
assert.throws(() => validateResearch({ ...historical, analysisAsOf: 'not-a-timestamp' }, cpiDate), /aciklama oncesi/);
const numericSource = { id: 'synthetic-dated', url: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm', title: 'Synthetic input',
  evidence: 'Synthetic first-release input, not a current forecast.', kind: 'primary', publishedAt: '2026-09-04T12:30:00Z' };
const numeric = { ...prior, symbol: '', eventId: 'synthetic-nfp', consensus: null, consensusSourceId: '', probabilityAboveConsensus: null,
  sourceIds: [numericSource.id], resolution: { provider: 'bls-first-release', field: 'nonfarmPayrollChange', sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_10022026.htm' } };
const numericResearch = { ...research, analysisAsOf: now, sources: [numericSource], forecasts: [numeric],
  events: [{ id: numeric.eventId, market: 'us', title: 'Synthetic', sourceIds: [numericSource.id], whatChanged: 'Synthetic', expectationGap: 'Synthetic', counterEvidence: 'Synthetic' }] };
assert.equal(validateResearch(numericResearch, now), true);
const untimedCalendar = { id: 'synthetic-bls-schedule', url: event.sourceUrl, title: 'Synthetic BLS schedule',
  evidence: 'Synthetic release timing only; publication time unknown.', kind: 'primary', publishedAt: null };
const dayOnlyEnergy = { id: 'synthetic-eia-day-only', url: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=W&n=PET&s=EMM_EPM0_PTE_NUS_DPG',
  title: 'Synthetic energy input with a known day only', publishedAt: null, kind: 'primary',
  evidence: 'Synthetic test input has a publication day but no verified publication hour or timezone.' };
const calendarNumeric = { ...numericResearch, sources: [numericSource, untimedCalendar],
  forecasts: [{ ...numeric, sourceIds: [numericSource.id, untimedCalendar.id] }] };
assert.equal(validateResearch(calendarNumeric, now), true, 'an untimed official BLS calendar is a timing reference, alongside timestamped numeric evidence');
const untimedNumeric = { ...calendarNumeric, sources: [...calendarNumeric.sources, dayOnlyEnergy],
  forecasts: [{ ...calendarNumeric.forecasts[0], sourceIds: [...calendarNumeric.forecasts[0].sourceIds, dayOnlyEnergy.id] }] };
assert.throws(() => validateResearch(untimedNumeric, now), /Tahmin icin tarihli kaynak/,
  'one dated numeric source cannot authorize an additional day-only numeric input; the entire forecast must be rejected');
const transparentGap = { ...untimedNumeric, forecasts: [], forecastAbstentions: [{ ...abstain(agenda[0]),
  reason: 'The numerical view depends on an energy input whose publication hour cannot be verified.',
  missingEvidence: ['Verified publication hour and timezone for the material energy input'],
  sourceIds: [dayOnlyEnergy.id, untimedCalendar.id] }] };
assert.equal(validateResearch(transparentGap, now), true, 'the same uncertain source may support an explicit evidence gap without becoming a numeric forecast');
assert.throws(() => validateResearch(numericResearch, nfpDate), /Tahmin aciklama oncesi/, 'numeric forecasts still require creation strictly before release');
const originalLedger = addResearch(empty(), { runId: 'first-nfp', research: { ...numericResearch, analysisAsOf: prior.knowledgeCutoff } }, prior.knowledgeCutoff);
const firstCopy = structuredClone(originalLedger.forecasts);
const unchangedLedger = addResearch(originalLedger, { runId: 'unchanged-nfp', research: { ...current, generatedAt: now, analysisAsOf: now } }, now);
assert.equal(unchangedLedger.forecasts.length, 1, 'unchanged reassessment creates no second numerical forecast');
assert.deepEqual(unchangedLedger.forecasts, firstCopy, 'unchanged reassessment cannot rewrite the first point estimate');
assert.equal(unchangedLedger.runs[1].research.expectationReassessments[0].status, 'unchanged', 'today\'s review reason remains in the immutable run');
assert.throws(() => addResearch(empty(), { runId: 'no-original', research: current }, now), /onceden kilitlenmis/);
const updated = { ...numericResearch, forecasts: [{ ...numeric, pointEstimate: 25, rationale: 'Synthetic new evidence changes opinion.' }],
  forecastAbstentions: current.forecastAbstentions, expectationReassessments: [{ ...reassess(agenda[0], 'updated'), sourceIds: [numericSource.id] }] };
assert.equal(validateResearch(updated, now), true);
assert.equal(validateExpectationCoverage(updated, agenda, now), true);
const updatedLedger = addResearch(originalLedger, { runId: 'updated-nfp', research: { ...updated, generatedAt: now } }, now);
assert.deepEqual(updatedLedger.forecasts, firstCopy, 'updated opinion leaves the original scored record untouched');
assert.equal(forecastReviews(updatedLedger)[0].pointEstimate, 25);
assert.equal(forecastReviews(updatedLedger)[0].originalPointEstimate, 0);
const paused = { ...current, forecastAbstentions: agenda.map(abstain), expectationReassessments: [reassess(agenda[0], 'abstained')] };
assert.equal(validateResearch(paused, now), true);
assert.equal(validateExpectationCoverage(paused, agenda, now), true);
assert.deepEqual(addResearch(originalLedger, { runId: 'abstained-nfp', research: paused }, now).forecasts, firstCopy, 'evidence gaps preserve the prior scored record');
assert.throws(() => validateResearch({ ...current, expectationReassessments: [{ ...current.expectationReassessments[0], sourceIds: [] }] }, now), /tarihli kaynak/);
assert.throws(() => validateResearch({ ...current, expectationReassessments: [{ ...current.expectationReassessments[0], status: 'updated' }] }, now), /celisiyor/);
assert.throws(() => validateResearch({ ...current, expectationReassessments: [current.expectationReassessments[0], current.expectationReassessments[0]] }, now), /Tekrarlanan/);
assert.throws(() => validateExpectationCoverage({ ...current, expectationReassessments: [reassess(agenda[1])] }, agenda, now), /kilitli goruse/);
const conflictAgenda = buildExpectationAgenda({ macro: { ...independent.macro, nextEvent: { ...event, scheduleConflict: true } } }, now);
assert.throws(() => validateExpectationCoverage(current, conflictAgenda, now), /Takvim celiskisi/);
assert.equal(validateExpectationCoverage(paused, conflictAgenda, now), true);
const contradiction = { ...current, forecasts: [{ ...current.forecastAbstentions[0], pointEstimate: 0.3 }] };
assert.throws(() => validateExpectationCoverage(contradiction, agenda, now), /birlikte olamaz/);
const missingCalendars = { macro: { status: 'unavailable', nextEvent: null, families: { us_cpi: { sourceStatus: { status: 'unavailable' }, nextEvent: null } } } };
const emptyModel = { ...research, forecastAbstentions: [], expectationReassessments: [] };
const modelCopy = structuredClone(emptyModel);
const contextual = attachExpectationContext(emptyModel, { independent: missingCalendars, analysisAsOf: now });
assert.deepEqual(emptyModel, modelCopy, 'coverage annotation cannot rewrite the model response');
assert.equal(contextual.expectationCoverage.length, 2);
assert.ok(contextual.expectationCoverage.every(row => row.status === 'unavailable' && row.scheduledAt === null));
assert.equal(contextual.unresolvedQuestions.length, 0, 'runtime gaps remain present even when the model writes no gap prose');
assert.equal(validateResearch(contextual, now), true, 'missing independent sources do not forbid a report or fabricate a release date');
const coverageLedger = addResearch(empty(), { runId: 'missing-calendar', research: contextual }, now);
assert.equal(coverageLedger.forecasts.length, 0);
assert.deepEqual(coverageLedger.runs[0].research.expectationCoverage, contextual.expectationCoverage);
const healthyCalendar = { macro: { sourceStatus: { status: 'available' }, storeStatus: { status: 'available' }, nextEvent: event,
  families: { us_cpi: { sourceStatus: { status: 'available' }, storeStatus: { status: 'available' }, nextEvent: { ...event, scheduledAt: cpiDate } } } } };
assert.ok(buildExpectationCoverage(healthyCalendar, now).every(row => row.status === 'available'));
const cpiFailure = structuredClone(healthyCalendar); cpiFailure.macro.families.us_cpi.storeStatus.status = 'unavailable';
assert.deepEqual(buildExpectationCoverage(cpiFailure, now).map(row => row.status), ['available', 'unavailable'], 'one failed family does not hide another available calendar');
const emptyHealthy = structuredClone(healthyCalendar); emptyHealthy.macro.nextEvent = null; emptyHealthy.macro.families.us_cpi.nextEvent = null;
assert.ok(buildExpectationCoverage(emptyHealthy, now).every(row => row.status === 'no_upcoming_release'), 'known empty calendar differs from an unreadable one');
const failedRefresh = structuredClone(healthyCalendar); failedRefresh.macro.sourceStatus = { status: 'partial', failures: [{ scope: 'schedule' }] };
assert.equal(buildExpectationCoverage(failedRefresh, now)[0].status, 'unavailable', 'stored calendar cannot conceal a failed current schedule refresh');
const invalidCpiSchedule = structuredClone(emptyHealthy); invalidCpiSchedule.macro.families.us_cpi.sourceStatus = { status: 'partial', failures: [{ scope: 'us_cpi:2026-09', errorCode: 'invalid_schedule_proof' }] };
assert.equal(buildExpectationCoverage(invalidCpiSchedule, now)[1].status, 'unavailable', 'event-scoped schedule proof failure cannot become a healthy empty calendar');
assert.throws(() => validateResearch({ ...contextual, expectationCoverage: [{ ...contextual.expectationCoverage[0], checkedAt: cpiDate }, contextual.expectationCoverage[1]] }, now), /kapsam kaydi/);
console.log('Morning expectations: targeted coverage, explicit evidence gaps, deadlines, immutable samples and legacy compatibility passed');
