'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cpiPayload, initial, CPI_MODEL_FIELDS } = require('../src/cpi-store');
const { archiveUrl, METRICS } = require('../src/cpi-sources');
const { forecastKey } = require('../src/research-ledger');
const macro = require('../public/macro');

const NOW = '2026-10-15T13:00:00.000Z';
const PERIOD = '2026-09';
const SCHEDULED = '2026-10-14T12:30:00.000Z';
const EVENT = { eventId: 'us_cpi:' + PERIOD, period: PERIOD, scheduledAt: SCHEDULED, scheduleConflict: null };
const source = (id, url, publishedAt = '2026-09-30T12:00:00.000Z') => ({ id, url, title: id, evidence: 'Synthetic dated evidence', kind: 'primary', publishedAt });
const archive = archiveUrl('2026-10-14');
const sources = [source('schedule', 'https://www.bls.gov/schedule/news_release/cpi.htm', null), ...METRICS.map((metric, index) => source('archive-' + index, 'https://www.bls.gov/news.release/archives/cpi_09112026.htm'))];
const makeForecast = (metric, index, overrides = {}) => {
  const forecast = {
  id: 'cpi-original-' + index, eventId: 'research-cpi-september', market: 'us', symbol: '', metric: metric.metric, unit: 'percent', period: PERIOD,
  scheduledAt: SCHEDULED, pointEstimate: index + 0.1, rationale: 'Synthetic CPI evidence', sourceIds: ['schedule', 'archive-' + index],
  resolution: { provider: 'bls-first-release', field: CPI_MODEL_FIELDS[metric.metric], sourceUrl: archive },
  recordedAt: '2026-10-01T10:00:00.000Z', ...overrides,
  };
  forecast.id = forecastKey(forecast);
  return forecast;
};
const originalForecasts = METRICS.map(makeForecast);
const reviewForecasts = METRICS.map((metric, index) => makeForecast(metric, index, { pointEstimate: index + 0.3, rationale: 'Later opinion', sourceIds: ['schedule', 'archive-' + index] }));

function ledger({ conflict = false, withOutcome = true } = {}) {
  return {
    schemaVersion: 1,
    forecasts: originalForecasts,
    outcomes: withOutcome ? [{ forecastId: originalForecasts[0].id, value: 0.2, metric: METRICS[0].metric, unit: 'percent', period: PERIOD,
      sourceUrl: archive, publishedAt: SCHEDULED, observedAt: '2026-10-14T12:31:00.000Z', recordedAt: '2026-10-14T12:32:00.000Z',
      verification: 'bls-official-first-release', vintage: 'first_release', contentHash: 'a'.repeat(64) }] : [],
    runs: [
      { runId: 'run-original', recordedAt: '2026-10-01T10:00:00.000Z', research: { generatedAt: '2026-10-01T10:00:00.000Z', forecasts: originalForecasts, sources } },
      { runId: 'run-review', recordedAt: '2026-10-01T11:00:00.000Z', research: { generatedAt: '2026-10-01T11:00:00.000Z', forecasts: reviewForecasts, sources,
        scenarios: [{ id: 'shared-cpi-scenario', eventId: 'research-cpi-september', market: 'us', symbol: '', condition: 'CPI yukarı sürpriz', impact: 'Faiz indirimi beklentisi ötelenebilir.', horizon: '1-5 gün', invalidation: 'İlk açıklama beklentiyle uyumlu kalır.', sourceIds: ['schedule'] }] } },
    ],
    publication: { ai: { runId: 'run-review', research: { scenarios: [{ id: 'shared-cpi-scenario', eventId: 'research-cpi-september', market: 'us', symbol: '', condition: 'CPI yukarı sürpriz', impact: 'Faiz indirimi beklentisi ötelenebilir.', horizon: '1-5 gün', invalidation: 'İlk açıklama beklentiyle uyumlu kalır.', sourceIds: ['schedule'] }], sources } } },
    conflict,
  };
}

function value(overrides = {}) {
  return { ...structuredClone(initial), events: [{ ...EVENT, ...(overrides.event || {}) }], observations: [{ ...METRICS[0], id: METRICS[0].metric + ':' + PERIOD + ':first_release', period: PERIOD, value: 0.2, vintage: 'first_release', publishedAt: SCHEDULED, observedAt: '2026-10-14T12:31:00.000Z', sourceUrl: archive, contentHash: 'a'.repeat(64) }], sourceStatus: { status: 'available' }, ...overrides };
}

test('CPI model projection keeps freezes separate from reviews and groups a shared event scenario', () => {
  const projected = cpiPayload(value(), NOW, ledger());
  assert.equal(projected.metrics[0].modelForecasts.length, 1);
  assert.equal(projected.metrics[0].modelForecasts[0].id, originalForecasts[0].id);
  assert.equal(projected.metrics[0].modelForecasts[0].pointEstimate, originalForecasts[0].pointEstimate);
  assert.equal(projected.metrics[0].modelForecasts[0].knowledgeCutoff, '2026-10-01T10:00:00.000Z');
  assert.equal(projected.metrics[0].modelForecastReviews.length, 1);
  assert.equal(projected.metrics[0].modelForecastReviews[0].pointEstimate, 0.3);
  assert.equal(projected.metrics[0].modelForecastReviews[0].reviewOnly, true);
  assert.equal(projected.metrics[0].modelScorecard.n, 1);
  assert.equal(projected.metrics[0].modelScorecard.mae, 0.1);
  assert.equal(projected.metrics[0].modelScorecard.bias, 0.1);
  assert.equal(projected.metrics[0].consensus, null);
  assert.equal(projected.modelScenarios.length, 1);
  assert.deepEqual(projected.modelScenarios[0].metricIds, METRICS.map((metric) => metric.metric));
  assert.equal(projected.modelScenarios[0].references.length, 4);
  assert.equal(projected.modelScenarios[0].referenceEstimate, null, 'shared CPI scenario cannot display one arbitrary metric');
  assert.equal(projected.modelScenarios[0].sourceEvidence[0].url, sources[0].url);

  const scenarioView = structuredClone(projected);
  scenarioView.nextEvent = { ...EVENT };
  scenarioView.modelScenarios = [{ ...projected.modelScenarios[0], eventId: EVENT.eventId, references: [
    { metric: METRICS[0].metric, referenceEstimate: 0.25, referenceKind: 'frozen_forecast' },
    { metric: METRICS[1].metric, referenceEstimate: 0.30, referenceKind: 'current_model_opinion' },
  ] }];
  const scenarioHtml = macro.renderCpi(scenarioView);
  assert.match(scenarioHtml, /Manşet · aylık 0,25% · ilk tahmin/);
  assert.match(scenarioHtml, /Çekirdek · aylık 0,3% · güncel görüş/);
});

test('CPI model policy accepts a dated monthly BLS calendar with null publication time', () => {
  const monthly = ledger();
  monthly.runs = monthly.runs.map((run) => ({
    ...run,
    research: {
      ...run.research,
      sources: run.research.sources.map((item) => item.id === 'schedule'
        ? { ...item, url: 'https://www.bls.gov/schedule/2026/10_sched.htm', publishedAt: null }
        : item),
    },
  }));
  const projected = cpiPayload(value(), NOW, monthly);
  assert.equal(projected.metrics[0].modelForecasts.length, 1);
});

test('CPI model projection never borrows provenance from another run', () => {
  const missingRun = ledger();
  const record = {
    ...originalForecasts[0],
    runId: 'missing-run',
    sourceEvidence: structuredClone(sources),
    knowledgeCutoff: '2026-10-01T10:00:00.000Z',
  };
  missingRun.forecasts = [record];
  const projected = cpiPayload(value(), NOW, missingRun);
  assert.equal(projected.metrics[0].modelForecasts.length, 0);
  assert.equal(projected.modelForecastExclusions[0].reason, 'missing_recorded_run_provenance');
});

test('CPI projection excludes invalid, cross-period, cross-metric, and unproven model records', () => {
  const invalid = [
    makeForecast(METRICS[0], 0, { period: '2026-08' }),
    makeForecast(METRICS[1], 1, { resolution: { provider: 'bls-first-release', field: 'cpiHeadlineMomSa', sourceUrl: archive } }),
    makeForecast(METRICS[2], 2, { scheduledAt: '2026-10-15T12:30:00.000Z' }),
    makeForecast(METRICS[3], 3, { recordedAt: '2026-10-14T13:00:00.000Z' }),
  ];
  const badLedger = ledger();
  badLedger.forecasts = [...badLedger.forecasts, ...invalid];
  badLedger.runs[0].research.forecasts = [...badLedger.runs[0].research.forecasts, ...invalid];
  const projected = cpiPayload(value(), NOW, badLedger);
  assert.equal(projected.modelForecasts.length, 4);
  assert.equal(projected.modelForecasts.some((item) => item.period !== PERIOD || item.metric === 'us_nonfarm_payroll_change'), false);
  assert.equal(projected.metrics[3].modelForecasts.length, 1);
  assert.equal(projected.modelForecastExclusions.length, 4);
  assert.ok(projected.modelForecastExclusions.every((item) => item.reason));
});

test('CPI model outcomes stay visible but leave scorecards when the schedule conflicts', () => {
  const projected = cpiPayload(value({ event: { scheduleConflict: { detectedAt: NOW } } }), NOW, ledger());
  assert.equal(projected.metrics[0].modelOutcomes.length, 1);
  assert.equal(projected.metrics[0].modelOutcomes[0].contested, true);
  assert.equal(projected.metrics[0].modelScorecard.n, 0);
  assert.equal(projected.metrics[0].modelScorecard.mae, null);
});

test('CPI model outcomes without actualId still honor correction-reviewed actuals', () => {
  const actualId = METRICS[0].metric + ':' + PERIOD + ':first_release';
  const projected = cpiPayload(value({ correctionReviews: [{ conflictWith: actualId }] }), NOW, ledger());
  assert.equal(projected.metrics[0].modelOutcomes.length, 1);
  assert.equal(projected.metrics[0].modelOutcomes[0].actualId, undefined);
  assert.equal(projected.metrics[0].modelOutcomes[0].contested, true);
  assert.equal(projected.metrics[0].modelScorecard.n, 0);
});

test('CPI model review exclusions ignore unrelated NFP reviews', () => {
  const nfpOriginal = {
    id: 'nfp-original', eventId: 'research-nfp', market: 'us', symbol: '', metric: 'us_nonfarm_payroll_change',
    unit: 'thousand_jobs', period: PERIOD, scheduledAt: SCHEDULED, pointEstimate: 100, rationale: 'NFP original', sourceIds: [],
    resolution: { provider: 'manual', field: 'manual', sourceUrl: 'https://example.com/nfp' }, recordedAt: '2026-10-01T10:00:00.000Z',
  };
  nfpOriginal.id = forecastKey(nfpOriginal);
  const nfpReview = { ...nfpOriginal, pointEstimate: 90, rationale: 'NFP review' };
  const nfpLedger = ledger();
  nfpLedger.forecasts = [...nfpLedger.forecasts, nfpOriginal];
  nfpLedger.runs[0].research.forecasts = [...nfpLedger.runs[0].research.forecasts, nfpOriginal];
  nfpLedger.runs[1].research.forecasts = [...nfpLedger.runs[1].research.forecasts, nfpReview];
  const projected = cpiPayload(value(), NOW, nfpLedger);
  assert.equal(projected.modelReviewExclusions.some((item) => item.metric === 'us_nonfarm_payroll_change'), false);
  assert.equal(projected.modelForecastExclusions.some((item) => item.metric === 'us_nonfarm_payroll_change'), false);
});

test('CPI model view does not create accuracy numbers without outcomes', () => {
  const projected = cpiPayload(value(), NOW, ledger({ withOutcome: false }));
  assert.deepEqual(projected.metrics[0].modelScorecard, { n: 0, sampleSize: 0, mae: null, bias: null, errorUnit: 'percentage_point', errorConvention: 'actual_minus_estimate', status: 'insufficient_sample' });
  assert.equal(projected.metrics[0].modelOutcomes.length, 0);
});

console.log('CPI model projection surface tests passed');
