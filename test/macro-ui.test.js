'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const macro = require('../public/macro');

const METRIC = 'us_nonfarm_payroll_change';
const UNIT = 'thousand_jobs';
const now = Date.parse('2099-01-01T00:00:00Z');
const event = {
  eventId: `${METRIC}:2099-01`, metric: METRIC, unit: UNIT, period: '2099-01',
  scheduledAt: '2099-02-05T13:30:00Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm',
};
const validMacro = {
  status: 'partial', updatedAt: '2099-01-01T12:00:00Z', events: [event],
  observations: [
    { metric: METRIC, unit: UNIT, value: 75, period: '2098-12', publishedAt: '2099-01-02T13:30:00Z', sourceUrl: 'https://www.bls.gov/example.html', vintage: 'first_release' },
    { metric: METRIC, unit: UNIT, value: 900, period: '2098-12', publishedAt: '2099-01-03T13:30:00Z', sourceUrl: 'https://www.bls.gov/revised.html', vintage: 'revision' },
  ],
  forecasts: [
    { eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, methodId: 'macro:last-observation:v1', estimate: 75, createdAt: '2099-01-01T10:00:00Z', knowledgeCutoff: '2099-01-01T09:00:00Z', inputObservationIds: ['2098-12:first'], rationale: 'Only the first release was eligible.' },
    { eventId: event.eventId, metric: METRIC, unit: 'wrong_unit', period: event.period, methodId: 'wrong', estimate: 999, createdAt: '2099-01-01T10:00:00Z', knowledgeCutoff: '2099-01-01T09:00:00Z', inputObservationIds: [] },
  ],
  outcomes: [{ eventId: event.eventId, actual: null, publishedAt: '2099-02-05T13:30:00Z', sourceUrl: 'https://www.bls.gov/result.html' }],
  scorecards: [{ methodId: 'macro:last-observation:v1', n: 0, mae: null, signedBias: null, status: 'insufficient_sample' }],
  calibration: [{ status: 'proposal_only', methodId: 'macro:last-observation:v1', n: 20, trainingBiasAdjustment: 1.5, holdoutBaselineMae: 4, holdoutCandidateMae: 3, proposal: { activation: 'manual_review_required' } }],
  modelForecasts: [{ eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, pointEstimate: 88, consensus: 90, sourceIds: [], rationale: '<unsafe>' }],
  modelScenarios: [{ eventId: event.eventId, condition: 'If hiring slows', impact: 'Risk appetite may weaken.', invalidation: 'Next release accelerates.', market: 'us', horizon: 'Short term' }],
};

assert.equal(macro.escapeHtml(`<script a="b">&'`), '&lt;script a=&quot;b&quot;&gt;&amp;&#39;');
assert.equal(macro.safeUrl('javascript:alert(1)'), null, 'non-web protocols cannot become links');
assert.equal(macro.matchPayrollEvent(validMacro, now).eventId, event.eventId);
assert.equal(macro.eventForecasts(validMacro, event).length, 1, 'forecasts must match event, metric, unit, and period');
assert.equal(macro.observationFor(validMacro, event).value, 75, 'revised vintage cannot replace the first release');
assert.equal(macro.observationFor({ observations: [{ value: 33, period: '2098-12', vintage: 'first_release' }] }, event), null, 'observations with missing metric, unit, or source provenance are rejected');
assert.equal(macro.exactOutcome(validMacro, event), null, 'missing actual remains missing instead of becoming zero');

const panel = macro.renderMacro(validMacro, '', now);
assert.match(panel, /75 bin kişi/, 'first-release observation and its matched method estimate are visible');
assert.doesNotMatch(panel, /900 bin kişi|999 bin kişi/, 'revision and mismatched forecast are excluded');
assert.match(panel, /Bu dönem için konsensüs doğrulanamadı/, 'no sourced consensus is invented');
assert.doesNotMatch(panel, />0 bin kişi</, 'null values never render as numeric zero');
assert.match(panel, /n=0/, 'insufficient sample is explicit');
assert.match(panel, /&lt;unsafe&gt;/, 'model rationale is escaped');
const calibrationPanel = counts => macro.renderMacro({ ...validMacro, calibration: [{
  methodId: 'macro:last-observation:v1', status: 'insufficient_sample', ...counts,
}] }, '', now);
for (const counts of [
  { eligibleN: null, n: null }, { eligibleN: undefined, n: undefined },
  { eligibleN: NaN }, { eligibleN: Infinity }, { eligibleN: -1 }, { eligibleN: '0' },
  { eligibleN: 1.5 }, { n: -1 }, { n: '7' },
]) {
  const unknownCount = calibrationPanel(counts);
  assert.match(unknownCount, /geçerli sonuç Veri yok\/15/, 'unknown or invalid calibration samples are not numeric zero');
  assert.doesNotMatch(unknownCount, /geçerli sonuç 0\/15/);
}
for (const [counts, expected] of [
  [{ eligibleN: 0, n: 20 }, '0/15'], [{ n: 0 }, '0/15'],
  [{ eligibleN: 7, n: 20, requiredN: 15 }, '7/15'], [{ n: 7, requiredN: 20 }, '7/20'],
  [{ eligibleN: null, n: 4 }, '4/15'],
]) {
  assert.ok(calibrationPanel(counts).includes('geçerli sonuç ' + expected), 'valid numeric counts and legacy n fallback remain visible');
}
for (const requiredN of [0, -1, '15', NaN, Infinity]) {
  assert.match(calibrationPanel({ eligibleN: 0, requiredN }), /geçerli sonuç 0\/Veri yok/, 'invalid explicit thresholds do not claim a numeric requirement');
}
assert.match(calibrationPanel({ eligibleN: 0, excludedN: '3' }), /geçerli sonuç 0\/15/);
assert.doesNotMatch(calibrationPanel({ eligibleN: 0, excludedN: '3' }), / · hariç 3/, 'string exclusion counts cannot be coerced into measured results');
assert.match(calibrationPanel({ eligibleN: 7, excludedN: 3 }), /geçerli sonuç 7\/15 · hariç 3/);
const incompleteSource = { ...validMacro, modelForecasts: [{ eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, pointEstimate: 88, consensus: 90, consensusSourceId: 'a', createdAt: '2099-01-01T12:00:00Z', sourceEvidence: [{ id: 'b', url: 'https://example.com/source', publishedAt: '2099-01-01T11:00:00Z' }] }] };
assert.match(macro.renderMacro(incompleteSource, '', now), /Bu dönem için konsensüs doğrulanamadı/, 'unmatched evidence cannot verify a consensus');
const sourceBacked = { ...incompleteSource, modelForecasts: [{ ...incompleteSource.modelForecasts[0], scheduledAt: event.scheduledAt, createdAt: '2098-12-31T23:30:00Z', recordedAt: '2098-12-31T23:30:00Z', knowledgeCutoff: '2098-12-31T23:00:00Z', consensusSourceId: 'a', sourceEvidence: [{ id: 'a', url: 'https://example.com/source', publishedAt: '2098-12-31T22:00:00Z', title: 'Survey', evidence: 'Reported estimate' }] }] };
assert.match(macro.renderMacro(sourceBacked, '', now), /90 bin kişi/, 'consensus requires the matching source published before the model cutoff');
const independentConsensus = { ...sourceBacked, consensus: { eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, value: 101, vintage: 'pre_release_consensus',
  publishedAt: '2098-12-31T22:50:00Z', observedAt: '2098-12-31T23:00:00Z', scheduledAt: '2099-02-05T16:30:00+03:00',
  sourceUrl: 'https://example.com/consensus', sourceTitle: 'Survey', provider: 'Provider A' }, consensusHistory: [
    { eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, value: 99, publishedAt: '2098-12-31T21:50:00Z', observedAt: '2098-12-31T22:00:00Z', sourceUrl: 'https://example.com/old', sourceTitle: 'Earlier survey' },
    { eventId: 'other-event', metric: METRIC, unit: UNIT, period: event.period, value: 500, publishedAt: '2098-12-31T21:50:00Z', observedAt: '2098-12-31T22:00:00Z', sourceUrl: 'https://example.com/wrong', sourceTitle: 'Wrong event' },
  ] };
const independentPanel = macro.renderMacro(independentConsensus, '', Date.parse('2099-01-01T00:00:00Z'));
assert.match(independentPanel, /101 bin kişi/, 'the exact-event independently observed consensus is shown as current');
assert.match(independentPanel, /Yayın 1\.01\.2099/);
assert.match(independentPanel, /Sisteme alındı 1\.01\.2099/);
assert.match(independentPanel, /Bu gözlem önceki model tahmininin bilgi kesitine eklenmez/);
assert.match(independentPanel, /Konsensüs gözlem geçmişi/);
assert.match(independentPanel, /Earlier survey/);
assert.doesNotMatch(independentPanel, /Wrong event/);
assert.doesNotMatch(independentPanel, /Doğrulanmış konsensüs<\/span><b>90 bin kişi/, 'old frozen model consensus does not replace the independent observation');
const futureConsensus = { ...independentConsensus, consensus: { ...independentConsensus.consensus, observedAt: '2099-01-01T00:01:00Z' } };
assert.match(macro.renderMacro(futureConsensus, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/);
const postReleaseConsensus = { ...independentConsensus, consensus: { ...independentConsensus.consensus, observedAt: event.scheduledAt } };
assert.match(macro.renderMacro(postReleaseConsensus, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/);
const mismatchedConsensus = { ...independentConsensus, consensus: { ...independentConsensus.consensus, eventId: 'other-event' } };
assert.match(macro.renderMacro(mismatchedConsensus, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/);
assert.match(macro.renderMacro({ ...independentConsensus, consensus: { ...independentConsensus.consensus, scheduledAt: '2099-02-05T16:31:00+03:00' } }, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/, 'consensus for a different release time is rejected');
assert.match(macro.renderMacro({ ...independentConsensus, consensus: { ...independentConsensus.consensus, scheduleConflict: true } }, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/, 'a consensus record marked with schedule conflict is rejected');
assert.match(macro.renderMacro({ ...independentConsensus, consensus: { ...independentConsensus.consensus, vintage: 'post_release_actual' } }, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/, 'only explicit pre-release consensus vintage is eligible');
assert.match(macro.renderMacro({ ...independentConsensus, event: undefined, events: [{ ...event, scheduleConflict: true }] }, '', Date.parse('2099-01-01T00:00:00Z')), /Bu dönem için konsensüs doğrulanamadı/, 'a conflicting event schedule disqualifies consensus');
const explicitNoConsensus = { ...sourceBacked, consensus: null, consensusStatus: { status: 'unavailable' } };
assert.match(macro.renderMacro(explicitNoConsensus, '', now), /Bu dönem için konsensüs doğrulanamadı/, 'explicit no-consensus status cannot fall back to a model forecast consensus');
const lateModelSource = { ...sourceBacked, modelForecasts: [{ ...sourceBacked.modelForecasts[0], knowledgeCutoff: '2098-12-31T21:00:00Z', knowledgeCutoffBasis: 'research_analysis_as_of' }] };
assert.match(macro.renderMacro(lateModelSource, '', now), /Bu dönem için konsensüs doğrulanamadı/, 'publication after the knowledge cutoff is rejected even if it predates recording');
assert.match(macro.renderMacro(sourceBacked, '', now), /Model tahmini/, 'model point estimate remains visible in the first-screen summary');
const completed = { ...validMacro, events: [], outcomes: [{ eventId: 'us_nonfarm_payroll_change:2098-11', period: '2098-11', actual: 123, publishedAt: '2098-12-01T13:30:00Z', sourceUrl: 'https://www.bls.gov/actual', vintage: 'first_release' }], forecasts: [{ eventId: 'us_nonfarm_payroll_change:2098-11', metric: METRIC, unit: UNIT, methodId: 'macro:last-observation:v1', estimate: 120 }] };
assert.match(macro.renderMacro(completed, '', now), /Son açıklanan sonuçlar/, 'completed event outcomes remain reachable after nextEvent moves forward');
assert.match(macro.renderMacro(completed, '', now), /hata \(tahmin − sonuç\) -3 bin kişi/, 'recent result uses the same error sign as the method scorecard');
const failedMacro = { status: 'unavailable', sourceStatus: { status: 'unavailable', checkedAt: '2099-01-01T12:00:00Z', failures: [{ scope: 'calendar', errorCode: 'http_403' }] } };
const failedPanel = macro.renderMacro(failedMacro, 'BLS kaynak isteği HTTP 403. Yeniden deneyin.', now, false);
assert.equal((failedPanel.match(/HTTP 403/g) || []).length, 1, 'HTTP 403 is shown once with no stale-data claim');
assert.match(failedPanel, /doğrulanmış önceki kayıt yok/i, 'unavailable state with no cache is honest');
assert.match(panel, /otomatik etkinleştirme yapılmaz/i, 'calibration cannot be mistaken for auto-activation');
const versionedMethods = { ...validMacro, forecasts: [
  { ...validMacro.forecasts[0], methodId: 'macro:trailing-three-mean:v1', estimate: 103.67 },
  { ...validMacro.forecasts[0], methodId: 'macro:trailing-three-consecutive:v2', estimate: 65.33 },
] };
assert.match(macro.renderMacro(versionedMethods, '', now), /Eldeki son üç ilk açıklama · v1/);
assert.match(macro.renderMacro(versionedMethods, '', now), /Önceki üç ayın ilk açıklama ortalaması · v2/, 'calendar-consecutive and legacy gapped baselines cannot share a label');
const provenanceReview = { ...validMacro, sourceStatus: { status: 'partial', lastSuccessfulAt: '2099-01-01T12:00:00Z', failures: [{ errorCode: 'forecast_provenance_review_required' }] },
  forecasts: [{ ...validMacro.forecasts[0], chronologyStatus: 'unverified' }], scorecards: [{ ...validMacro.scorecards[0], excludedCount: 1 }] };
const reviewedPanel = macro.renderMacro(provenanceReview, 'Geçmiş erişim zamanı doğrulanamaz.', now);
assert.match(reviewedPanel, /Kaynak erişilebilir; eski tahminlerde zaman kanıtı eksik/);
assert.match(reviewedPanel, /performans ve kalibrasyon örneklemine katılmaz/);
assert.match(reviewedPanel, /Zaman kanıtı eksik 1 kayıt hariç/);
assert.match(reviewedPanel, /<summary>Kaynak ve zaman kanıtı · Kısmi kaynak yanıtı · Eski tahminlerin zaman kanıtı eksik · 1 tahminin erişim zamanı doğrulanmıyor<\/summary>/);
assert.equal((reviewedPanel.match(/class="macro-evidence"/g) || []).length, 1, 'source, timestamp, and provenance evidence share one native disclosure');
assert.doesNotMatch(reviewedPanel, /Yeniden dene/, 'refreshing cannot repair historical retrieval chronology');
assert.doesNotMatch(reviewedPanel, /macro-refresh-warning/, 'provenance-only warning is not duplicated as a full-width error banner');
const availablePanel = macro.renderMacro({ ...validMacro, status: 'available', sourceStatus: { status: 'available', checkedAt: '2099-01-01T12:00:00Z' } }, '', now);
assert.doesNotMatch(availablePanel, /Makro kapsamı kısmi|Makro kayıt güncellemesi|Kaynak erişilebilir/);
assert.match(availablePanel, /Kaynak ve zaman kanıtı · Güncellik ve kaynak ayrıntıları/);
assert.ok(availablePanel.indexOf('ABD tarım dışı istihdam') < availablePanel.indexOf('Önceki ilk açıklama'));
assert.ok(availablePanel.indexOf('Önceki ilk açıklama') < availablePanel.indexOf('Model tahmini'));
assert.ok(availablePanel.indexOf('Model tahmini') < availablePanel.indexOf('Yöntem kıyası'));
assert.ok(availablePanel.indexOf('Yöntem kıyası') < availablePanel.indexOf('Koşullu piyasa senaryoları'));
assert.ok(availablePanel.indexOf('Koşullu piyasa senaryoları') < availablePanel.indexOf('Tahmin performansı ve kalibrasyon'));
const threeMethods = { ...validMacro, forecasts: [
  ...validMacro.forecasts,
  { ...validMacro.forecasts[0], methodId: 'macro:trailing-three-mean:v1', estimate: 76 },
  { ...validMacro.forecasts[0], methodId: 'macro:trailing-three-consecutive:v2', estimate: 77 },
] };
const threeMethodPanel = macro.renderMacro(threeMethods, '', now);
assert.match(threeMethodPanel, /<summary><span>Yöntem kıyası \(3 kayıt\)<\/span>/);
assert.equal((threeMethodPanel.match(/class="macro-method-row"/g) || []).length, 3, 'all method records remain available inside the collapsed comparison');
assert.match(threeMethodPanel, /Öğrenme durumu|proposal_only|Elle inceleme önerisi/);
const abstentionPanel = macro.renderMacro({ ...validMacro, methodAbstentions: [{ eventId: event.eventId, metric: METRIC, unit: UNIT, methodId: 'macro:last-observation:v1', createdAt: '2099-01-01T11:15:00Z', status: 'insufficient_history', missingPeriods: ['2098-11'] }] }, '', now);
assert.match(abstentionPanel, /Yöntem kıyası \(2 kayıt\)/);
assert.match(abstentionPanel, /denemesi:<\/b> 1\.01\.2099 14:15/, 'attempt timestamps remain available in the shared source and time disclosure');
const twoModelViews = { ...validMacro,
  modelForecasts: [{ id: 'forecast-100', eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, scheduledAt: event.scheduledAt, pointEstimate: 100, model: 'frozen-v1', createdAt: '2099-01-01T10:00:00Z', recordedAt: '2099-01-01T10:15:00Z', knowledgeCutoff: '2099-01-01T09:00:00Z', knowledgeCutoffBasis: 'research_generated_at', rationale: 'Frozen rationale stays reviewable.', sourceEvidence: [{ id: 'first-source', url: 'https://example.com/first-source', publishedAt: '2098-12-31T12:00:00Z' }] }],
  modelForecastReviews: [{ originalForecastId: 'forecast-100', eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, pointEstimate: 89,
    originalPointEstimate: 100, runId: 'run-89', scheduledAt: event.scheduledAt, knowledgeCutoff: '2099-01-01T10:30:00Z', recordedAt: '2099-01-01T10:30:00Z', createdAt: '2099-01-01T10:30:00Z', model: 'current-v1', rationale: 'Older review remains in evidence.', reviewOnly: true,
    sourceEvidence: [{ title: 'Older source', url: 'https://example.com/old-review', publishedAt: '2099-01-01T10:20:00Z' }] }, { originalForecastId: 'forecast-100', eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, pointEstimate: 90,
    originalPointEstimate: 100, runId: 'run-90', scheduledAt: event.scheduledAt, knowledgeCutoff: '2099-01-01T11:00:00Z', recordedAt: '2099-01-01T11:00:00Z', createdAt: '2099-01-01T11:00:00Z', model: 'current-v2', rationale: 'Current research view.', reviewOnly: true,
    sourceEvidence: [{ title: 'Review source', url: 'https://example.com/review', publishedAt: '2099-01-01T10:30:00Z', evidence: 'Supporting text.' }] }],
  modelScenarios: [{ eventId: event.eventId, period: event.period, referenceEstimate: 90, referenceKind: 'current_model_opinion', condition: 'If hiring slows', impact: 'Risk appetite may weaken.', invalidation: 'Next release accelerates.', market: 'us', horizon: 'Short term' }],
};
const modelViewsPanel = macro.renderMacro(twoModelViews, '', Date.parse('2099-01-01T12:00:00Z'));
assert.match(modelViewsPanel, /Ölçülecek ilk model tahmini/);
assert.match(modelViewsPanel, /Güncel model görüşü · puanlamaya ayrı tahmin eklenmedi/);
assert.ok(modelViewsPanel.indexOf('100 bin kişi') < modelViewsPanel.indexOf('90 bin kişi'), 'the frozen 100k estimate remains first and separate from the 90k current opinion');
assert.match(modelViewsPanel, /run-90|Review source|Current research view\./, 'review source and rationale remain available in source evidence');
assert.doesNotMatch(modelViewsPanel.slice(0, modelViewsPanel.indexOf('<details class="macro-evidence"')), /89 bin kişi/, 'only the latest valid review appears in the first-screen summary');
assert.match(modelViewsPanel, /89 bin kişi[\s\S]*Older source/, 'older review remains available in the evidence history');
assert.match(modelViewsPanel, /Model raporu üretim kesiti 1\.01\.2099 12:00/, 'research generation time is labeled as a report cutoff and shown separately from recording');
assert.match(modelViewsPanel, /Kayda alındı 1\.01\.2099 13:15/, 'publication recording time remains distinct from knowledge cutoff');
assert.match(macro.renderMacro({ ...twoModelViews, modelForecasts: [{ ...twoModelViews.modelForecasts[0], knowledgeCutoffBasis: 'publication_time_fallback' }] }, '', Date.parse('2099-01-01T12:00:00Z')), /Kayıt zamanı yedeği/, 'publication-time fallback is not presented as a true information cutoff');
assert.match(modelViewsPanel, /macro-model-summary-list[^]*?macro-model-summary[^]*?macro-model-review/, 'frozen estimate and current opinion share one dedicated summary grid');
assert.match(modelViewsPanel, /güncel 90 bin kişilik model görüşünü referans alır\. Ölçülecek ilk tahmin 100 bin kişi olarak korunur\./);

const octoberRelease = { eventId: `${METRIC}:2026-10`, metric: METRIC, unit: UNIT, period: '2026-10', scheduledAt: '2026-11-06T13:30:00Z', sourceUrl: event.sourceUrl };
const septemberForecast = { id: 'forecast-september-100', eventId: `${METRIC}:2026-09`, metric: METRIC, unit: UNIT, period: '2026-09', pointEstimate: 100,
  recordedAt: '2026-09-30T20:00:00Z', scheduledAt: '2026-10-02T12:30:00Z', resolution: { provider: 'bls-first-release' } };
const septemberOutcome = { forecastId: septemberForecast.id, metric: METRIC, unit: UNIT, period: '2026-09', value: 80,
  sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_10022026.htm', publishedAt: '2026-10-02T12:30:00Z', observedAt: '2026-10-02T12:32:00Z',
  verification: 'bls-official-first-release', vintage: 'first_release' };
const outcomeHistory = { ...validMacro, status: 'available', nextEvent: octoberRelease, events: [octoberRelease], modelForecasts: [septemberForecast],
  modelForecastReviews: [{ originalForecastId: septemberForecast.id, eventId: septemberForecast.eventId, metric: METRIC, unit: UNIT, period: '2026-09', pointEstimate: 90, reviewOnly: true }],
  modelOutcomes: [septemberOutcome] };
const outcomeHistoryPanel = macro.renderMacro(outcomeHistory, '', Date.parse('2026-10-05T12:00:00Z'));
assert.match(outcomeHistoryPanel, /Model tahmin sonuç geçmişi \(1\)/, 'September outcome stays visible when October is the upcoming event');
assert.match(outcomeHistoryPanel, /İlk tahmin 100 bin kişi/);
assert.match(outcomeHistoryPanel, /İmzalı hata \(tahmin − sonuç\) 20 bin kişi · Mutlak hata 20 bin kişi/, 'errors use the immutable original 100k forecast, not the current 90k view');
assert.match(outcomeHistoryPanel, /Yayın 2\.10\.2026 15:30 · Sisteme alındı 2\.10\.2026 15:32/);
assert.match(outcomeHistoryPanel, /href="https:\/\/www\.bls\.gov\/news\.release\/archives\/empsit_10022026\.htm"/);
const outcomeWithoutUpcoming = macro.renderMacro({ ...outcomeHistory, nextEvent: null, events: [] }, '', Date.parse('2026-10-05T12:00:00Z'));
assert.match(outcomeWithoutUpcoming, /Model tahmin sonuç geçmişi \(1\)/, 'model outcomes remain available when there is no upcoming event');
for (const invalidOutcome of [
  { ...septemberOutcome, observedAt: '2026-10-06T12:00:00Z' },
  { ...septemberOutcome, vintage: 'revision' },
  { ...septemberOutcome, forecastId: 'other-forecast' },
  { ...septemberOutcome, period: '2026-08' },
  { ...septemberOutcome, verification: 'human-reviewed' },
]) {
  const invalidPanel = macro.renderMacro({ ...outcomeHistory, modelOutcomes: [invalidOutcome] }, '', Date.parse('2026-10-05T12:00:00Z'));
  assert.doesNotMatch(invalidPanel, /Model tahmin sonuç geçmişi/, 'future, wrong vintage, identity, period, or provider/verification mismatch is excluded');
}
const feedNews = { groups: { us: [], bist: [], crypto: [{ type: 'research_event', title: 'Official release', url: 'https://bitcoincore.org/en/release', evidenceStatus: 'official_feed' }] }, sources: {
  ethereum: { status: 'available', count: 100, checkedAt: '2099-01-01T12:00:00Z' },
  bitcoin_core: { status: 'available', count: 100 },
  solana: { status: 'unavailable', lastSuccessfulAt: '2098-12-31T12:00:00Z', errorCode: 'timeout', reason: '<unsafe>' },
  spk: { status: 'available', count: 30 },
} };
const feedPanel = macro.renderMarketNews(feedNews, 'marketNewsOverview', { market: 'crypto' });
assert.match(feedPanel, /Kaynak durumu · 2\/3 erişilebilir/);
assert.match(feedPanel, /Resmî yayıncı duyurusu/);
assert.match(feedPanel, /günlük haber sayısı değildir/, 'archival feed count cannot imply 100 daily stories');
assert.match(feedPanel, /Son başarılı|&lt;unsafe&gt;/);
assert.doesNotMatch(feedPanel, /<b>SPK:/, 'source health is scoped to the selected market');
const duplicateSourceFailure = macro.renderMarketNews({ groups: { us: [], bist: [], crypto: [] }, sources: {
  solana: { status: 'unavailable', errorCode: 'unsupported_public_listing', reason: 'provider response', failures: [{ errorCode: 'unsupported_public_listing', reason: 'provider response' }] },
} }, 'marketNewsOverview', { market: 'crypto' });
assert.equal((duplicateSourceFailure.match(/Şirket bildirimleri için doğrulanmış veri akışı yok\./g) || []).length, 1, 'top-level and failure source codes produce one human-facing message');
assert.match(duplicateSourceFailure, /Teknik ayrıntı[\s\S]*unsupported_public_listing/, 'raw source code remains in technical evidence');
assert.match(macro.renderMarketNews({ groups: { us: [], bist: [], crypto: [{ type: 'research_event', evidenceStatus: 'official_feed', title: 'Release', publishedAt: '2099-01-01T12:00:00Z', url: 'https://example.com' }] } }, 'marketNewsOverview', { market: 'crypto' }), /Yayıncı tarihi/);
assert.match(macro.renderMarketNews({ groups: { us: [{ type: 'company_news', title: 'Results', publishedAt: '2099-01-01T12:00:00Z', url: 'https://example.com' }], bist: [], crypto: [] } }, 'marketNewsOverview', { market: 'us' }), /Yayımlandı/);

const spkAnnouncement = { id: 'spk-announcement:abc', market: 'bist', type: 'regulatory_announcement', title: '<SPK duyurusu>', source: 'SPK', sourceId: 'spk_announcements', kind: 'primary',
  publishedDate: '2026-10-01', publishedAt: null, observedAt: '2026-10-01T09:15:00Z', url: 'https://www.spk.gov.tr/duyuru/1', sourceUrl: 'https://www.spk.gov.tr/duyuru/1',
  listSourceUrl: 'https://www.spk.gov.tr/duyurular', evidence: '<script>unsafe</script> ' + 'a'.repeat(600), evidenceStatus: 'official_announcement_text',
  statementType: 'regulatory_measure_announcement', impactScope: 'announcement_evidence_only', manualReviewRequired: true, legalEffect: 'not_assessed' };
const spkAnnouncementNews = { groups: { us: [], bist: [spkAnnouncement], crypto: [] }, sources: { spk_announcements: {
  status: 'unavailable', checkedAt: '2026-10-02T08:00:00Z', lastSuccessfulAt: '2026-10-01T09:15:00Z', sourceUrl: 'https://www.spk.gov.tr/duyurular',
  failures: [{ code: 'http_503', checkedAt: '2026-10-02T08:00:00Z', reason: 'Listing fetch failed.' }], count: 1, discoveredCount: 1, filteredCount: 0, scope: 'official_spk_press_announcements_evidence_only' } } };
const spkPanel = macro.renderMarketNews(spkAnnouncementNews, 'marketNewsOverview', { market: 'bist' });
assert.match(spkPanel, /Resmî duyuru/);
assert.match(spkPanel, /Yayıncı tarihi 1 Eki 2026/, 'SPK publisher date stays date-only');
assert.doesNotMatch(spkPanel, /Yayıncı tarihi 1 Eki 2026 \d{2}:\d{2}/, 'date precision does not gain an invented hour');
assert.match(spkPanel, /Resmî duyuru[\s\S]*&lt;SPK duyurusu&gt;/, 'announcement title is escaped and distinct from PDF bulletins');
assert.match(spkPanel, /Duyuru kaynağı ve kapsamı[\s\S]*Gözlem 1\.10\.2026 12:15/);
assert.match(spkPanel, /Taslak süreç açıklaması|Düzenleyici tedbir duyurusu/);
assert.match(spkPanel, /yalnızca duyuru kanıtıdır/);
assert.match(spkPanel, /yürürlük tarihi resmî belge incelemesi gerektirir/);
assert.match(spkPanel, /&lt;script&gt;unsafe&lt;\/script&gt;/, 'announcement evidence is escaped');
assert.doesNotMatch(spkPanel, new RegExp('a'.repeat(481)), 'announcement evidence is bounded before rendering');
assert.match(spkPanel, /SPK duyuruları:[\s\S]*Kullanılamıyor[\s\S]*Son başarılı 1\.10\.2026 12:15[\s\S]*http_503/, 'SPK announcement source health and acquisition failure are separate from SPK PDF source');
assert.match(spkPanel, /Son başarılı kayıttan; güncel kaynak kontrolü başarısız/, 'retained announcement is not implied to be freshly acquired');
assert.match(spkPanel, /href="https:\/\/www\.spk\.gov\.tr\/duyuru\/1"/);
const partialSpkNews = { ...spkAnnouncementNews, sources: { spk_announcements: { ...spkAnnouncementNews.sources.spk_announcements, status: 'partial' } } };
const partialSpkPanel = macro.renderMarketNews(partialSpkNews, 'marketNewsOverview', { market: 'bist' });
assert.match(partialSpkPanel, /SPK duyuruları:[\s\S]*Kısmi erişim/);
assert.match(partialSpkPanel, /&lt;SPK duyurusu&gt;[\s\S]*Kısmi kaynak yanıtı; kayıt yayın ve gözlem zamanlarıyla gösteriliyor/, 'retained items remain visible and explicitly carry partial-source context');
const sparseAnnouncement = macro.renderMarketNews({ groups: { us: [], bist: [{ ...spkAnnouncement, evidence: '', observedAt: null, statementType: 'unknown_statement', impactScope: '', manualReviewRequired: false }], crypto: [] } }, 'marketNewsOverview', { market: 'bist' });
assert.match(sparseAnnouncement, /Duyuru kaynağı ve kapsamı[\s\S]*Duyuru metni özeti bulunmuyor\.[\s\S]*Kaynak kontrol zamanı doğrulanamadı\./, 'missing announcement details fail visibly without dropping its source link');
assert.doesNotMatch(sparseAnnouncement, /unknown_statement/);

const bulletin = macro.renderMarketNews({ groups: { us: [], bist: [{ type: 'regulatory_bulletin', title: 'SPK bülteni 2026/1', url: 'https://www.spk.gov.tr/a.pdf', publishedDate: '2026-09-30', publishedAt: null }], crypto: [] }, coverage: [{ market: 'bist', reason: 'Belge kapsamı.' }] }, 'marketNewsOverview', { market: 'bist' });
assert.match(bulletin, /Belge bağlantısı · içerik çözümlemesi bekliyor/);
const extractedBulletin = macro.renderMarketNews({ groups: { us: [], bist: [{ type: 'regulatory_bulletin', title: 'SPK Kararı', url: 'https://www.spk.gov.tr/karar.pdf', publishedDate: '2026-10-01', document: { available: true, contentStatus: 'text_extracted', verification: 'official_document_text', documentHash: 'hash', pages: 3, extractedAt: '2026-10-01T09:00:00Z', summary: '<script>unsafe summary</script>', sections: [{ title: '<unsafe title>', page: 2, category: 'Tedbir', symbols: ['ABC', '<XYZ>'], summary: 'Belgede geçen metin.' }] } }], crypto: [] }, coverage: [] }, 'marketNewsOverview', { market: 'bist' });
assert.match(extractedBulletin, /Resmî belge metni · 1 bölüm/);
assert.match(extractedBulletin, /&lt;unsafe title&gt;|&lt;unsafe title&gt;/, 'document section titles are escaped');
assert.match(extractedBulletin, /Kategori: Tedbir · Sayfa: 2 · Semboller: ABC, &lt;XYZ&gt;/, 'official document category, page, and symbols render as details');
assert.match(extractedBulletin, /&lt;script&gt;unsafe summary&lt;\/script&gt;/, 'document summary is escaped');
assert.match(extractedBulletin, /hukuki veya işlemsel yorum değildir/i, 'document extraction is clearly not legal or trading advice');
assert.match(extractedBulletin, /href="https:\/\/www.spk.gov.tr\/karar.pdf"/, 'official PDF link remains available');
const unreadableBulletin = macro.renderMarketNews({ groups: { us: [], bist: [{ type: 'regulatory_bulletin', title: 'SPK Belgesi', url: 'https://www.spk.gov.tr/unreadable.pdf', document: { available: false, verification: 'official_document_link', reason: 'PDF text could not be extracted.' } }], crypto: [] }, coverage: [] }, 'marketNewsOverview', { market: 'bist' });
assert.match(unreadableBulletin, /official_document_link/);
assert.match(unreadableBulletin, /PDF text could not be extracted/);
assert.match(unreadableBulletin, /href="https:\/\/www.spk.gov.tr\/unreadable.pdf"/, 'unreadable document still retains the verified PDF link');
const modelCitedCalendar = { ...validMacro, status: 'partial', sourceStatus: { status: 'unavailable', failures: [{ scope: 'calendar', errorCode: 'http_403' }] }, events: [{ ...event, scheduleVerification: 'model-cited-web-research' }] };
const modelSchedulePanel = macro.renderMacro(modelCitedCalendar, 'BLS kaynak isteği HTTP 403. Yeniden deneyin.', now, false);
assert.match(modelSchedulePanel, /Takvim: modelin resmî kaynak atfı; bağımsız erişim doğrulanamadı/);
assert.match(modelSchedulePanel, /HTTP 403/, 'the official calendar access failure remains visible');
assert.doesNotMatch(modelSchedulePanel, /Takvim: doğrulanmış/, 'model-cited schedule is not presented as independently verified');
assert.match(bulletin, /30\.09\.2026|30 Eyl 2026|30 Eylül 2026/);
assert.doesNotMatch(bulletin, /SPK bülteni[\s\S]*?\d{2}:\d{2}/, 'date-only source metadata does not acquire an invented publication time');
const manyNews = { groups: { us: Array.from({ length: 10 }, (_, index) => ({ type: 'research_event', title: `Event ${index}`, url: `https://example.com/${index}`, publishedDate: '2026-09-30' })), bist: [], crypto: [] }, coverage: [] };
const overviewNews = macro.renderMarketNews(manyNews, 'marketNewsOverview');
const reportNews = macro.renderMarketNews(manyNews, 'marketNewsWorkspace');
assert.equal((overviewNews.match(/class="market-news-item"/g) || []).length, 4, 'overview initially shows four items per selected market');
assert.equal((reportNews.match(/class="market-news-item"/g) || []).length, 8, 'report initially shows eight items per selected market');
assert.match(overviewNews, /Tümünü göster \(10\)/, 'remaining source items stay reachable through progressive disclosure');

const macroCss = fs.readFileSync(require.resolve('../public/macro.css'), 'utf8');
assert.match(macroCss, /\.macro-panel details > summary[^}]*min-height:\s*44px/s, 'macro native disclosure summaries retain touch-sized targets');
assert.match(macroCss, /summary:focus-visible[^}]*outline:\s*2px/s, 'native disclosure summaries have a visible keyboard focus ring');
assert.match(macroCss, /prefers-reduced-motion:\s*reduce/);
assert.match(macroCss, /overflow-wrap:\s*anywhere/);
assert.match(macroCss, /details > summary::before\s*\{\s*content:\s*"";[^}]*border-right:[^}]*border-bottom:[^}]*transform:\s*rotate\(45deg\)/, 'disclosure cue is a nonverbal CSS chevron');
assert.match(macroCss, /details\[open\] > summary::before[^}]*transform:\s*rotate\(225deg\)/, 'chevron direction changes when details opens');
assert.match(macroCss, /\.macro-method-comparison > summary\s*\{[^}]*flex-direction:\s*row;[^}]*justify-content:\s*flex-start/s, 'method title and preview remain wrap-capable on mobile');
assert.match(macroCss, /\.macro-model-summary-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, 'model summaries use two equal desktop columns');
assert.match(macroCss, /\.macro-model-summary:only-child\s*\{\s*grid-column:\s*1\s*\/\s*-1\s*;\s*\}/, 'a single model summary spans the full row');
assert.match(macroCss, /@media\s*\(max-width:\s*630px\)[\s\S]*?\.macro-model-summary-list\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/s, 'model summaries stack on mobile');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount() {
  let html = '';
  const expanded = new Set();
  const node = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; },
    setDetailsOpen(summaryText) { expanded.add(summaryText); },
    querySelectorAll(selector) {
      if (!selector.startsWith('details')) return [];
      const summaries = Array.from(html.matchAll(/<details\b[^>]*>[\s\S]*?<summary>([\s\S]*?)<\/summary>/g), (match) => match[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'));
      return summaries.filter((summary) => selector !== 'details[open]' || expanded.has(summary)).map((summary) => ({
        querySelector() { return { textContent: summary }; },
        get open() { return expanded.has(summary); },
        set open(value) { if (value) expanded.add(summary); else expanded.delete(summary); },
      }));
    },
  };
  return node;
}
function response(value) { return { ok: true, json: async () => value }; }

(async () => {
  const macroNode = mount();
  const overviewNode = mount();
  const reportNode = mount();
  const nodes = { macroWorkspace: macroNode, marketNewsOverview: overviewNode, marketNewsWorkspace: reportNode };
  const requests = [];
  const client = macro.createClient({
    document: { getElementById(id) { return nodes[id] || null; } },
    fetch(url) { const request = deferred(); requests.push({ url, ...request }); return request.promise; },
  });

  const oldRefresh = client.refresh({ force: true });
  const newRefresh = client.refresh({ force: true });
  assert.equal(requests.length, 4, 'forced refreshes are independently versioned');
  requests[2].resolve(response(validMacro));
  requests[3].resolve(response({ groups: { us: [], bist: [], crypto: [] }, coverage: [] }));
  await newRefresh;
  requests[0].resolve(response({ ...validMacro, events: [{ ...event, period: '2098-01', eventId: `${METRIC}:2098-01` }] }));
  requests[1].resolve(response({ groups: { us: [{ title: 'old response', url: 'https://example.com' }], bist: [], crypto: [] }, coverage: [] }));
  await oldRefresh;
  assert.match(macroNode.innerHTML, /2099/ , 'late responses cannot overwrite the newer macro render');
  assert.doesNotMatch(overviewNode.innerHTML, /old response/, 'late responses cannot overwrite the newer news render');

  assert.doesNotMatch(macroNode.innerHTML, /Ocak 2098/, 'newer event remains mounted after a late response');
  assert.ok(overviewNode.innerHTML.includes('market-news-tabs') && reportNode.innerHTML.includes('market-news-tabs'), 'overview and report mounts both receive the feed');

  const expandedNode = mount();
  const expandedClient = macro.createClient({
    document: { getElementById(id) { return id === 'macroWorkspace' ? expandedNode : null; } },
    fetch(url) { return Promise.resolve(response(url === '/api/macro' ? validMacro : { groups: { us: [], bist: [], crypto: [] } })); },
  });
  await expandedClient.refresh();
  const methodSummary = expandedNode.querySelectorAll('details').map((item) => item.querySelector('summary').textContent).find((summary) => summary.startsWith('Yöntem kıyası'));
  expandedNode.setDetailsOpen(methodSummary);
  await expandedClient.refresh({ force: true });
  assert.ok(expandedNode.querySelectorAll('details[open]').some((item) => item.querySelector('summary').textContent === methodSummary), 'the same open native disclosure stays open after refresh');

  let calibrationPayload = { ...validMacro, calibration: [{ methodId: 'macro:last-observation:v1', status: 'insufficient_sample', eligibleN: null, n: null }] };
  const calibrationNode = mount();
  const calibrationClient = macro.createClient({
    document: { getElementById(id) { return id === 'macroWorkspace' ? calibrationNode : null; } },
    fetch(url) { return Promise.resolve(response(url === '/api/macro' ? calibrationPayload : { groups: { us: [], bist: [], crypto: [] } })); },
  });
  await calibrationClient.refresh();
  assert.match(calibrationNode.innerHTML, /geçerli sonuç Veri yok\/15/, 'normal source refresh keeps unknown calibration count distinct from zero');
  calibrationPayload = { ...calibrationPayload, calibration: [{ ...calibrationPayload.calibration[0], eligibleN: 0 }] };
  await calibrationClient.refresh({ force: true });
  assert.match(calibrationNode.innerHTML, /geçerli sonuç 0\/15/, 'a subsequent measured zero renders as zero');
  calibrationPayload = { ...calibrationPayload, calibration: [{ ...calibrationPayload.calibration[0], eligibleN: 7 }] };
  await calibrationClient.refresh({ force: true });
  assert.match(calibrationNode.innerHTML, /geçerli sonuç 7\/15/, 'a subsequent valid count replaces the unknown and zero states');

  let partialPayload = validMacro;
  const partialClient = macro.createClient({
    document: { getElementById(id) { return nodes[id] || null; } },
    fetch(url) { return Promise.resolve(response(url === '/api/macro' ? partialPayload : { groups: { us: [], bist: [], crypto: [] } })); },
  });
  await partialClient.refresh();
  partialPayload = { ...validMacro, sourceStatus: { status: 'partial', failures: [{ scope: 'older-archive', errorCode: 'unsupported_first_release_format' }] },
    observations: [{ ...validMacro.observations[0], value: 96 }] };
  await partialClient.refresh({ force: true });
  assert.match(macroNode.innerHTML, /96 bin kişi/, 'partial success updates verified observations rather than retaining an older payload');
  assert.match(macroNode.innerHTML, /doğrulanmış kayıtlar gösteriliyor/);
  assert.doesNotMatch(macroNode.innerHTML, /doğrulanmış önceki kayıt yok/, 'a failed older archive does not erase the existence of a valid observation');

  const consensusFailureClient = macro.createClient({
    document: { getElementById(id) { return nodes[id] || null; } },
    fetch(url) { return Promise.resolve(response(url === '/api/macro'
      ? { ...validMacro, consensusStatus: { status: 'unavailable', failures: [{ provider: 'Survey API', code: 'http_503', checkedAt: '2099-01-01T11:30:00Z' }] } }
      : { groups: { us: [], bist: [], crypto: [] }, coverage: [] })); },
  });
  await consensusFailureClient.refresh({ force: true });
  assert.match(macroNode.innerHTML, /HTTP 503/, 'consensus endpoint failures remain visible with their HTTP code');
  assert.match(macroNode.innerHTML, /Survey API[\s\S]*http_503[\s\S]*1\.01\.2099 14:30/, 'consensus failure evidence shows code and checked time');
  assert.match(macroNode.innerHTML, /data-macro-retry/, 'a transient consensus source failure keeps the retry action');

  const provenanceOnlyClient = macro.createClient({
    document: { getElementById(id) { return nodes[id] || null; } },
    fetch(url) { return Promise.resolve(response(url === '/api/macro' ? { ...validMacro, sourceStatus: { status: 'partial', failures: [{ code: 'forecast_provenance_review_required' }] } } : { groups: { us: [], bist: [], crypto: [] }, coverage: [] })); },
  });
  await provenanceOnlyClient.refresh({ force: true });
  assert.doesNotMatch(macroNode.innerHTML, /macro-refresh-warning|data-macro-retry/, 'provenance-only review is explained in evidence without duplicate full-width warning or futile retry');
  assert.match(macroNode.innerHTML, /Eski tahminlerin zaman kanıtı eksik/);

  let fail = false;
  const errorClient = macro.createClient({
    document: { getElementById(id) { return nodes[id] || null; } },
    fetch(url) { return fail ? Promise.reject(new Error('offline')) : Promise.resolve(response(url === '/api/macro' ? validMacro : { groups: { us: [], bist: [], crypto: [] }, coverage: [] })); },
  });
  await errorClient.refresh();
  const lastGood = macroNode.innerHTML;
  fail = true;
  await errorClient.refresh({ force: true });
  assert.match(macroNode.innerHTML, /son başarılı kayıt korunuyor/, 'network failure retains good content with a retry notice');
  assert.ok(macroNode.innerHTML.includes('75 bin kişi') && lastGood.includes('75 bin kişi'));
  console.log('macro UI rendering, vintage, escaping and request-race tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
