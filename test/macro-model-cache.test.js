'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const macro = require('../public/macro');

const nfpMetric = 'us_nonfarm_payroll_change';
const nfpUnit = 'thousand_jobs';
const nfpEvent = (period) => ({ eventId: `${nfpMetric}:${period}`, metric: nfpMetric, unit: nfpUnit, period, scheduledAt: period === '2099-01' ? '2099-02-05T13:30:00Z' : '2099-03-05T13:30:00Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm' });
const cpiMetrics = ['us_cpi_headline_mom_sa', 'us_cpi_core_mom_sa', 'us_cpi_headline_yoy_nsa', 'us_cpi_core_yoy_nsa'];

function nfpModel(event, pointEstimate) {
  return { id: `model-${event.period}`, eventId: event.eventId, metric: nfpMetric, unit: nfpUnit, period: event.period, pointEstimate, rationale: 'Model rationale retained in cache.', createdAt: '2099-01-01T10:00:00Z', knowledgeCutoff: '2099-01-01T09:00:00Z', sourceEvidence: [{ title: 'Model source', url: 'https://example.com/model-source', publishedAt: '2099-01-01T08:00:00Z' }] };
}

function payload({ event = nfpEvent('2099-01'), modelForecasts = [], researchStatus = { status: 'available', checkedAt: '2099-01-01T12:00:00Z' }, storeStatus, cpiModelPeriod = '2099-01', cpiModelValue = 0.25, cpiModelScorecard = {}, cpiCorrectionReviews = [], cpiModelOutcomes = [], cpiStoreStatus = { status: 'available', checkedAt: '2099-01-01T12:00:00Z' } } = {}) {
  const cpiEvent = { eventId: 'us_cpi:' + cpiModelPeriod, period: cpiModelPeriod, scheduledAt: cpiModelPeriod === '2099-01' ? '2099-02-10T13:30:00Z' : '2099-03-10T13:30:00Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm' };
  return {
    status: 'available', researchStatus, researchCheckedAt: researchStatus.checkedAt,
    storeStatus, sourceStatus: { status: 'available', checkedAt: '2099-01-01T12:00:00Z' },
    events: [event], forecasts: [], observations: [], modelForecasts, modelForecastReviews: [], modelOutcomes: [], modelScenarios: [],
    families: { us_cpi: {
      family: 'us_cpi', nextEvent: cpiEvent, sourceStatus: { status: 'available', checkedAt: '2099-01-01T12:00:00Z' }, storeStatus: cpiStoreStatus,
      correctionReviews: cpiCorrectionReviews,
      metrics: cpiMetrics.map((metric) => ({ metric, unit: 'percent', modelForecasts: metric === cpiMetrics[0] ? [{ eventId: cpiEvent.eventId, metric, unit: 'percent', period: cpiModelPeriod, pointEstimate: cpiModelValue, rationale: 'CPI cache rationale.' }] : [], modelForecastReviews: [], modelOutcomes: metric === cpiMetrics[0] ? cpiModelOutcomes : [], modelScorecard: metric === cpiMetrics[0] ? cpiModelScorecard : {} })),
      modelForecasts: [], modelForecastReviews: [], modelOutcomes: [], modelScenarios: [],
    } },
  };
}

function mount() {
  let html = '';
  return { get innerHTML() { return html; }, set innerHTML(value) { html = value; }, querySelectorAll() { return []; } };
}

const emptyNews = { groups: { us: [], bist: [], crypto: [] }, coverage: [] };
const response = (value) => ({ ok: true, json: async () => value });

test('research failure keeps same-event model cache and exposes older periods separately', async () => {
  let current = payload({ modelForecasts: [nfpModel(nfpEvent('2099-01'), 100)] });
  const node = mount();
  const client = macro.createClient({ document: { getElementById(id) { return id === 'macroWorkspace' ? node : null; } }, fetch(url) { return Promise.resolve(response(url === '/api/macro' ? current : emptyNews)); } });
  await client.refresh();
  current = payload({ event: nfpEvent('2099-01'), modelForecasts: [], researchStatus: { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z' } });
  await client.refresh({ force: true });
  assert.match(node.innerHTML, /Model kayıtlarına erişilemiyor/);
  assert.match(node.innerHTML, /100 bin kişi/);
  current = payload({ event: nfpEvent('2099-02'), modelForecasts: [], researchStatus: { status: 'unavailable', checkedAt: '2099-02-01T12:00:00Z' } });
  await client.refresh({ force: true });
  assert.match(node.innerHTML, /Model kayıtlarına erişilemiyor/);
  assert.equal((node.innerHTML.match(/100 bin kişi/g) || []).length, 1, 'older value is available only in explicit history');
  assert.match(node.innerHTML, /Önceki dönemin son başarılı model kaydı/);
  assert.match(node.innerHTML, /Model rationale retained in cache|Model source/);
});

test('cached model scorecards become stale when a new correction arrives during research failure', async () => {
  let current = payload({ cpiModelScorecard: { n: 2, sampleSize: 2, mae: 0.1, bias: 0.02 }, cpiModelOutcomes: [{ eventId: 'us_cpi:2099-01', metric: cpiMetrics[0], unit: 'percent', period: '2099-01', value: 0.2 }] });
  const node = mount();
  const client = macro.createClient({ document: { getElementById(id) { return id === 'macroWorkspace' ? node : null; } }, fetch(url) { return Promise.resolve(response(url === '/api/macro' ? current : emptyNews)); } });
  await client.refresh();
  current = payload({ researchStatus: { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z' }, cpiModelScorecard: {}, cpiCorrectionReviews: [{ conflictWith: 'cpi-actual-2099-01' }] });
  await client.refresh({ force: true });
  const state = client.getState();
  assert.equal(state.macro.families.us_cpi.metrics[0].modelScorecard.stale, true);
  assert.equal(state.macro.families.us_cpi.metrics[0].modelScorecard.n, 2, 'cached measured counts remain evidence even when current scoring is suppressed');
  assert.match(macro.renderCpi(state.macro.families.us_cpi), /puanlama bekletiliyor/);
});

test('research failure without a model cache is distinct from a healthy empty model set', () => {
  const family = payload().families.us_cpi;
  family.metrics = family.metrics.map((metric) => ({ ...metric, previousFirstRelease: { period: '2098-12', value: 1, publishedAt: '2099-01-02T13:30:00Z', sourceUrl: 'https://example.com/cpi-first', vintage: 'first_release' } }));
  family.modelStatus = { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z', cached: false };
  family.modelWarning = 'Model kayıtlarına erişilemiyor; doğrulanmış model kaydı gösterilemiyor.';
  assert.match(macro.renderCpi(family), /Erişilemiyor/);
  const healthy = structuredClone(family);
  delete healthy.modelStatus; delete healthy.modelWarning;
  assert.match(macro.renderCpi(healthy), /Kayıt yok/);
});

test('store failure stays scoped to NFP while CPI updates, and healthy empty research clears old models', async () => {
  let current = payload({ modelForecasts: [nfpModel(nfpEvent('2099-01'), 100)] });
  current.observations = [{ metric: nfpMetric, unit: nfpUnit, value: 162, period: '2098-12', publishedAt: '2099-01-02T13:30:00Z', sourceUrl: 'https://example.com/nfp-first', vintage: 'first_release' }];
  current.forecasts = [{ eventId: nfpEvent('2099-01').eventId, metric: nfpMetric, unit: nfpUnit, period: '2099-01', methodId: 'macro:last-observation:v1', estimate: 162 }];
  const node = mount();
  const client = macro.createClient({ document: { getElementById(id) { return id === 'macroWorkspace' ? node : null; } }, fetch(url) { return Promise.resolve(response(url === '/api/macro' ? current : emptyNews)); } });
  await client.refresh();
  current = payload({ storeStatus: { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z' }, modelForecasts: [], cpiModelValue: 0.3 });
  await client.refresh({ force: true });
  let state = client.getState();
  assert.equal(state.macro.modelForecasts[0].pointEstimate, 100);
  assert.equal(state.macro.families.us_cpi.metrics[0].modelForecasts[0].pointEstimate, 0.3);
  assert.match(node.innerHTML, /İstihdam kayıt deposuna erişilemiyor/);
  current = payload({ modelForecasts: [], cpiModelValue: 0.35 });
  await client.refresh({ force: true });
  state = client.getState();
  assert.equal(state.macro.modelForecasts.length, 0);
  assert.doesNotMatch(node.innerHTML, /Model kayıtlarına erişilemiyor/);
});

test('late research responses cannot mutate the newer model cache', async () => {
  const oldPayload = payload({ modelForecasts: [nfpModel(nfpEvent('2099-01'), 100)] });
  const newPayload = payload({ modelForecasts: [nfpModel(nfpEvent('2099-01'), 120)] });
  const original = structuredClone(oldPayload);
  const requests = [];
  const node = mount();
  const client = macro.createClient({ document: { getElementById(id) { return id === 'macroWorkspace' ? node : null; } }, fetch(url) { let resolve; const promise = new Promise((yes) => { resolve = yes; }); requests.push({ url, resolve }); return promise; } });
  const oldRefresh = client.refresh({ force: true });
  const newRefresh = client.refresh({ force: true });
  requests[2].resolve(response(newPayload));
  requests[3].resolve(response(emptyNews));
  await newRefresh;
  requests[0].resolve(response(oldPayload));
  requests[1].resolve(response(emptyNews));
  await oldRefresh;
  assert.equal(client.getState().macro.modelForecasts[0].pointEstimate, 120);
  assert.deepEqual(oldPayload, original, 'cache projection does not mutate API payloads');
});

test('store failures retain independent NFP and CPI source layers without borrowing periods', async () => {
  const first = payload({ storeStatus: { status: 'available', checkedAt: '2099-01-01T12:00:00Z' } });
  first.updatedAt = '2099-01-01T12:00:00Z';
  first.observations = [{ metric: nfpMetric, unit: nfpUnit, value: 162, period: '2098-12', publishedAt: '2099-01-02T13:30:00Z', sourceUrl: 'https://example.com/nfp-first', vintage: 'first_release' }];
  first.forecasts = [{ eventId: nfpEvent('2099-01').eventId, metric: nfpMetric, unit: nfpUnit, period: '2099-01', methodId: 'macro:last-observation:v1', estimate: 162 }];
  first.provenanceExclusions = [{ forecastId: 'method-jan', reason: 'provenance_unverified', sourceIds: ['bls-jan-calendar'] }];
  first.forecastProvenanceIssues = [{ forecastId: 'method-jan', code: 'cutoff_unverified' }];
  first.families.us_cpi.updatedAt = '2099-01-01T12:00:00Z';
  first.families.us_cpi.metrics = first.families.us_cpi.metrics.map((metric, index) => ({ ...metric,
    previousFirstRelease: { period: '2098-12', value: index + 1, publishedAt: '2099-01-02T13:30:00Z', sourceUrl: 'https://example.com/cpi-first', vintage: 'first_release' },
    forecasts: [{ eventId: 'us_cpi:2099-01', metric: metric.metric, unit: 'percent', period: '2099-01', status: 'frozen', estimate: index + 1.1 }],
  }));
  const firstPayload = structuredClone(first);
  let current = first;
  const node = mount();
  const client = macro.createClient({ document: { getElementById(id) { return id === 'macroWorkspace' ? node : null; } }, fetch(url) { return Promise.resolve(response(url === '/api/macro' ? current : emptyNews)); } });
  await client.refresh();

  const nfpPlaceholder = payload({ storeStatus: { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z' }, modelForecasts: [] });
  nfpPlaceholder.sourceStatus = { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z', errorCode: 'http_503' };
  nfpPlaceholder.events = []; nfpPlaceholder.observations = []; nfpPlaceholder.forecasts = []; nfpPlaceholder.nextEvent = null;
  nfpPlaceholder.families.us_cpi = { ...first.families.us_cpi, storeStatus: { status: 'available', checkedAt: '2099-01-02T12:00:00Z' } };
  current = nfpPlaceholder;
  await client.refresh({ force: true });
  assert.match(node.innerHTML, /162 bin kişi/);
  assert.match(node.innerHTML, /Son başarılı bağımsız kayıt/);
  assert.match(node.innerHTML, /cache/);
  const cachedState = client.getState().macro;
  assert.deepEqual(cachedState.provenanceExclusions, first.provenanceExclusions, 'cached provenance exclusions remain available after store failure');
  assert.deepEqual(cachedState.forecastProvenanceIssues, first.forecastProvenanceIssues);
  assert.deepEqual(first, firstPayload, 'source cache projection does not mutate the API payload');

  const nfpFreshCpiFailure = payload({ event: nfpEvent('2099-02'), storeStatus: { status: 'available', checkedAt: '2099-01-03T12:00:00Z' }, modelForecasts: [] });
  nfpFreshCpiFailure.observations = [{ metric: nfpMetric, unit: nfpUnit, value: 170, period: '2099-01', publishedAt: '2099-02-01T13:30:00Z', sourceUrl: 'https://example.com/nfp-new', vintage: 'first_release' }];
  nfpFreshCpiFailure.forecasts = [{ eventId: nfpEvent('2099-02').eventId, metric: nfpMetric, unit: nfpUnit, period: '2099-02', methodId: 'macro:last-observation:v1', estimate: 170 }];
  nfpFreshCpiFailure.families.us_cpi = { ...nfpPlaceholder.families.us_cpi, metrics: [], nextEvent: null, storeStatus: { status: 'unavailable', checkedAt: '2099-01-03T12:00:00Z' }, sourceStatus: { status: 'unavailable', checkedAt: '2099-01-03T12:00:00Z', errorCode: 'http_503' } };
  current = nfpFreshCpiFailure;
  await client.refresh({ force: true });
  let state = client.getState();
  assert.equal(state.macro.observations[0].value, 170, 'fresh NFP source layer updates while CPI cache is retained');
  assert.equal(state.macro.families.us_cpi.metrics.length, 4, 'CPI placeholder does not erase its four cached metrics');
  assert.match(macro.renderCpi(state.macro.families.us_cpi), /1%|2%|3%|4%/);

  const nfpFailureWithHealthyCpi = payload({ storeStatus: { status: 'unavailable', checkedAt: '2099-01-04T12:00:00Z' } });
  nfpFailureWithHealthyCpi.sourceStatus = { status: 'unavailable', checkedAt: '2099-01-04T12:00:00Z', errorCode: 'http_503' };
  assert.doesNotMatch(macro.renderMacro({ ...nfpFailureWithHealthyCpi, families: { us_cpi: first.families.us_cpi } }, 'NFP HTTP 503', Date.parse('2099-01-04T12:00:00Z'), true, { family: 'us_cpi' }), /Güncel enflasyon akışı alınamadı/, 'NFP source failure does not leak into the selected CPI panel');
});

test('fresh model research keeps a cited schedule visible when the independent store fails cold', async () => {
  const event = nfpEvent('2099-01');
  event.scheduleVerification = 'model-cited-web-research';
  const current = payload({ event, storeStatus: { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z', errorCode: 'http_503' }, modelForecasts: [nfpModel(event, 100)] });
  current.sourceStatus = { status: 'unavailable', checkedAt: '2099-01-02T12:00:00Z', errorCode: 'http_503' };
  current.observations = [];
  current.forecasts = [];
  const node = mount();
  const client = macro.createClient({ document: { getElementById(id) { return id === 'macroWorkspace' ? node : null; } }, fetch(url) { return Promise.resolve(response(url === '/api/macro' ? current : emptyNews)); } });
  await client.refresh();
  assert.match(node.innerHTML, /100 bin kişi/);
  assert.doesNotMatch(node.innerHTML, /son başarılı model kaydı gösteriliyor/);
  assert.match(node.innerHTML, /Model kaynak atfı/);
});
