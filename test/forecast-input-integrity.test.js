'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const FinansActionLayer = require('../public/action-layer');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const segment = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const signatureSource = segment('function stressPortfolioSignature(', 'let REPORT_CACHE');
const monteCarloSource = segment('function buildMonteCarloInputs(', 'function initForecastEventListeners(');
const defaultsSource = segment('function loadDCFDefaults(', 'async function runDCFCalculation(');
const calculationSource = segment('async function runDCFCalculation(', '/* ---------- Olaylar ---------- */');
const changedSource = segment('function markValuationChanged(', 'function syncForecastPanels(');
const date = '2026-09-10T14:00:00Z';
const fxDate = '2026-09-10T13:00:00Z';
const data = (extra = {}) => ({
  generatedAt: date,
  us: [{ symbol: 'US', currency: 'USD', price: 100, marketCap: 1000000, pe: 20, quoteTime: date }],
  bist: [{ symbol: 'TR', currency: 'TRY', price: 200, marketCap: 10000000, pe: 12, quoteTime: date }],
  crypto: [],
  fx: { rates: { 'USD/TRY': { base: 'USD', quote: 'TRY', price: 40, quoteTime: fxDate } } },
  ...extra,
});
const positions = () => ({ us: [{ symbol: 'US', amount: 2, avgPrice: 90 }], bist: [{ symbol: 'TR', amount: 20, avgPrice: 150 }], crypto: [] });
function inputsContext() {
  const context = vm.createContext({ FinansActionLayer });
  vm.runInContext(signatureSource + monteCarloSource, context);
  return context;
}

test('simulation normalizes BIST amounts with the sourced rate and records the FX snapshot', () => {
  const result = inputsContext().buildMonteCarloInputs(data(), positions());
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].price, 100);
  assert.equal(result.assets[1].price, 5);
  assert.ok(result.assets.every(asset => asset.currency === 'USD'));
  assert.equal(result.assets[1].originalPrice, 200);
  assert.equal(result.assets[1].originalCurrency, 'TRY');
  assert.equal(result.assets[1].fxRate, 40);
  assert.equal(result.assets[1].fxQuoteTime, fxDate);
  assert.equal(result.dataGeneratedAt, date);
  assert.equal(result.assets.reduce((sum, asset) => sum + asset.amount * asset.price, 0), 300);
});

test('missing, stale, unidentified and date-only FX stop BIST simulations', () => {
  const context = inputsContext();
  const pairs = [null, { usdtry: 38 }, { rates: { 'USD/TRY': { price: 40, quoteTime: fxDate } } },
    { rates: { 'USD/TRY': { base: 'USD', quote: 'TRY', price: 40, quoteTime: '2026-09-10' } } },
    { stale: true, rates: { 'USD/TRY': { base: 'USD', quote: 'TRY', price: 40, quoteTime: fxDate } } }];
  pairs.forEach(fx => assert.throws(() => context.buildMonteCarloInputs(data({ fx }), positions()), /kaynağı ve zamanı doğrulanmış USD\/TRY/));
});

test('USD-only portfolios need no FX and never use purchase cost as a missing market quote', () => {
  const context = inputsContext();
  const portfolio = { us: positions().us, bist: [], crypto: [] };
  assert.equal(context.buildMonteCarloInputs(data({ fx: null }), portfolio).assets[0].price, 100);
  assert.throws(() => context.buildMonteCarloInputs(data({ us: [] }), portfolio), /piyasa fiyatı yok/);
  assert.throws(() => context.buildMonteCarloInputs(data({ us: [{ symbol: 'US', price: 100, stale: true }] }), portfolio), /piyasa fiyatı yok/);
  assert.throws(() => context.buildMonteCarloInputs(data(), { us: [{ symbol: 'US', amount: -2, avgPrice: 90 }] }), /piyasa fiyatı yok|geçerli adet/);
});

function node(value = '') {
  return { value, textContent: '', innerHTML: '', dataset: {}, style: {}, disabled: false,
    listeners: {}, classList: { add() {}, remove() {} },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelector() { return null; }, getAttribute() { return null; },
  };
}
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function formContext() {
  const nodes = new Map();
  const get = selector => { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); };
  get('#dcf-asset-sel').value = 'us:US';
  get('#valuation-model-type-sel').value = 'dcf';
  get('#mc-horizon-sel').value = '90';
  get('#mc-saving-input').value = '0';
  get('#mc-results-container').dataset.resultReady = 'true';
  get('#mc-results-container').innerHTML = 'last completed result';
  const requests = [];
  const secondaryRuns = [];
  const context = vm.createContext({
    DATA: data(), portfolioData: positions(), dcfPending: false, dcfRequest: 0, mcRequest: 0, lastDcfSnapshot: null,
    FinansActionLayer, $: get, esc, console,
    fmtPrice: (value, currency) => `${currency} ${value}`, fmtNum: value => String(value), fullTimestamp: value => value || 'Zaman bilinmiyor',
    markValuationChanged() {}, bindResultInputs() {}, inputStamp: () => 'form-stamp', valuationStamp: () => 'valuation-stamp',
    formActionState(form, message) { form.message = message; },
    triggerRevealAnimations() {}, countUp(element, value) { element.textContent = String(value); }, drawMCChart() {},
    loadStressScenarios() { secondaryRuns.push('stress'); }, loadCorrelationMatrix() { secondaryRuns.push('correlation'); },
    document: { querySelectorAll: () => [], createElement: () => node() },
    fetch: async (url, request) => { requests.push({ url, body: JSON.parse(request.body) }); return { ok: true, json: async () => ({ fairValue: 110, marginOfSafety: 9, enterpriseValue: 110000, equityValue: 110000, forecast: [] }) }; },
  });
  vm.runInContext(signatureSource + monteCarloSource + changedSource + defaultsSource + calculationSource, context);
  return { context, nodes, get, requests, secondaryRuns };
}

test('secondary analyses run only after their disclosure opens', () => {
  const { context, get, secondaryRuns } = formContext();
  const initStart = source.indexOf('function initForecastEventListeners(');
  vm.runInContext(source.slice(initStart, source.indexOf('// DCF Asset change', initStart)) + '\n}', context);
  context.initForecastEventListeners();
  assert.deepEqual(secondaryRuns, []);
  const detail = get('#forecast-stress-details');
  detail.open = false;
  detail.listeners.toggle({ target: detail });
  assert.deepEqual(secondaryRuns, []);
  detail.open = true;
  detail.listeners.toggle({ target: detail });
  assert.deepEqual(secondaryRuns, ['stress']);
});

test('blocked BIST simulation reports a local reason, retains the completed result and makes no request', async () => {
  const { context, get, requests } = formContext();
  context.DATA.fx = null;
  const initStart = source.indexOf('function initForecastEventListeners(');
  const initEnd = source.indexOf('// DCF Asset change', initStart);
  vm.runInContext(source.slice(initStart, initEnd) + '\n}', context);
  context.initForecastEventListeners();
  await get('#mc-form').listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 0);
  assert.match(get('#mc-form').message, /BIST.*USD\/TRY.*Kur verisini yenileyin/);
  assert.equal(get('#mc-run-btn').disabled, false);
  assert.equal(get('#mc-results-container').innerHTML, 'last completed result');
});

test('successful simulation sends USD prices and an explicit zero USD saving amount', async () => {
  const { context, get, requests } = formContext();
  let meta;
  context.displayMCResults = (_result, snapshot) => { meta = snapshot; };
  const initStart = source.indexOf('function initForecastEventListeners(');
  vm.runInContext(source.slice(initStart, source.indexOf('// DCF Asset change', initStart)) + '\n}', context);
  context.initForecastEventListeners();
  await get('#mc-form').listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.assets[1].price, 5);
  assert.equal(requests[0].body.monthlySaving, 0);
  assert.equal(meta.fxQuoteTime, fxDate);
  assert.equal(meta.dataGeneratedAt, date);
  assert.match(get('#mc-form').message, /tüm tutarlar USD/);
});

test('valuation clears fabricated financial values and shows observed price separately from sample assumptions', () => {
  const { context, get } = formContext();
  ['dcf-net-debt', 'dcf-revenue', 'dcf-shares', 'graham-eps', 'ddm-dividend'].forEach(id => { get('#' + id).value = '999'; });
  context.loadDCFDefaults();
  ['dcf-net-debt', 'dcf-revenue', 'dcf-shares', 'graham-eps', 'ddm-dividend'].forEach(id => assert.equal(get('#' + id).value, ''));
  assert.match(get('#valuation-data-state').textContent, /Piyasa fiyatı: USD 100.*fiyat zamanı 2026-09-10T14:00:00Z/);
  assert.match(get('#valuation-data-state').textContent, /kaynaklı finansal tablo kalemleri yok.*örnek senaryo varsayımları/);
  assert.match(get('#valuation-result-state').textContent, /Finansal girdileri tamamlayın/);
  get('#dcf-asset-sel').value = 'bist:TR';
  context.loadDCFDefaults();
  assert.match(get('#valuation-data-state').textContent, /TRY 200.*Parasal girdiler TRY olmalı/);
});

test('each model blocks missing financial inputs before any network request', async () => {
  const { context, get, requests } = formContext();
  context.loadDCFDefaults();
  for (const [model, message] of [['dcf', /yıllık gelir.*hisse adedi.*net borç/], ['graham', /EPS.*AAA tahvil/], ['ddm', /yıllık temettü.*iskonto/]]) {
    get('#valuation-model-type-sel').value = model;
    await context.runDCFCalculation();
    assert.match(get('#valuation-result-state').textContent, message);
  assert.match(get('#valuation-result-state').textContent, /Eksik finansal veri otomatik tahmin edilmez/);
    assert.equal(requests.length, 0);
  }
});

test('DCF requires an explicit debt assumption and preserves zero when supplied', async () => {
  const { context, get, requests } = formContext();
  context.loadDCFDefaults();
  get('#dcf-revenue').value = '100000';
  get('#dcf-shares').value = '1000';
  await context.runDCFCalculation();
  assert.equal(requests.length, 0, 'blank debt is not silently converted to zero');
  get('#dcf-net-debt').value = '0';
  const captured = get('#valuationCapturedInputs');
  await context.runDCFCalculation();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.netDebt, 0);
  assert.equal(context.lastDcfSnapshot.params.netDebt, 0);
  assert.match(captured.innerHTML, /Piyasa verisi.*2026-09-10T14:00:00Z/);
  assert.match(captured.innerHTML, /Yıllık gelir.*100000.*Kullanıcı varsayımı/);
  assert.match(captured.innerHTML, /Net borç.*0.*Kullanıcı varsayımı/);
});

test('market quote absence blocks a manually completed valuation without presenting a fabricated price', async () => {
  const { context, get, requests } = formContext();
  context.DATA.us[0].price = null;
  context.loadDCFDefaults();
  assert.match(get('#valuation-data-state').textContent, /Piyasa fiyatı alınamadı/);
  get('#valuation-model-type-sel').value = 'graham';
  get('#graham-eps').value = '5';
  await context.runDCFCalculation();
  assert.equal(requests.length, 0);
  assert.match(get('#valuation-result-state').textContent, /Piyasa fiyatı da mevcut olmalı/);
});

test('stale and conflicting-currency quotes block valuation without a request', async () => {
  for (const flags of [{ stale: true }, { currency: 'TRY' }, { decision: { freshness: { status: 'stale' } } }]) {
    const { context, get, requests } = formContext();
    Object.assign(context.DATA.us[0], flags);
    get('#dcf-revenue').value = '1000'; get('#dcf-shares').value = '10'; get('#dcf-net-debt').value = '0';
    for (const id of ['dcf-growth-1-5', 'dcf-growth-6-10', 'dcf-ebit-margin', 'dcf-tax-rate', 'dcf-wacc', 'dcf-terminal-growth']) get('#' + id).value = id === 'dcf-wacc' ? '10' : '1';
    await context.runDCFCalculation();
    assert.equal(requests.length, 0);
    assert.match(get('#valuation-result-state').textContent, /Piyasa fiyatı.*mevcut olmalı/);
  }
});

test('undefined model margin and sensitivity cells stay missing instead of becoming buy states', async () => {
  const { context, get } = formContext();
  context.loadDCFDefaults();
  get('#dcf-revenue').value = '1000'; get('#dcf-shares').value = '10'; get('#dcf-net-debt').value = '2000';
  const captured = get('#valuationCapturedInputs');
  context.fetch = async () => ({ ok: true, json: async () => ({ fairValue: -50, marginOfSafety: null, enterpriseValue: 1500, equityValue: -500, forecast: [], parameters: { capexAsPctOfRev: 5, daAsPctOfRev: 3, nwcChangeAsPctOfRev: 1 }, sensitivity: { rowLabel: 'WACC', colLabel: 'Growth', rows: [10], cols: [2, 3], matrix: [[null, -50]] } }) });
  await context.runDCFCalculation();
  assert.equal(get('#dcf-margin-safety-badge').className, 'badge');
  assert.match(get('#dcf-margin-safety-badge').innerHTML, /marj hesaplanamadı/);
  assert.match(get('#valuation-sensitivity-grid').innerHTML, /pozitif hisse değeri hesaplanamadı/);
  assert.doesNotMatch(get('#valuation-sensitivity-grid').innerHTML, /\$0|NaN|Infinity/);
  assert.match(captured.innerHTML, /Modelin sabit varsayımları[\s\S]*Amortisman/);
  assert.equal(get('#valuation-result-panel').hidden, false);
});

test('result descriptions use the captured data and FX time and flag a portfolio change during calculation', () => {
  const { context, get } = formContext();
  const snapshot = context.buildMonteCarloInputs(context.DATA, context.portfolioData);
  const state = node();
  get('#mc-results-container').querySelector = () => state;
  context.DATA.generatedAt = '2026-09-11T14:00:00Z';
  context.portfolioData.us[0].amount = 3;
  context.marketShortLabel = market => ({us:'ABD',bist:'BIST',crypto:'Kripto'})[market] || 'Piyasa bilinmiyor';
  vm.runInContext(segment('function historicalSourceProofHtml(', 'async function loadCorrelationMatrix(') + segment('function displayMCResults(', 'function drawMCChart('), context);
  context.displayMCResults({ horizon: 1, initialValue: 300, annualizedReturn: 0, annualizedVol: 0, percentiles: { pessimistic: [300, 300], median: [300, 300], optimistic: [300, 300] } }, { horizon: 1, monthlySaving: 0, formStamp: 'form-stamp', ...snapshot });
  assert.match(state.textContent, /Önceki simülasyon sonucu.*portföy değişti/);
  assert.match(state.textContent, /veri kesiti 2026-09-10T14:00:00Z.*kur zamanı 2026-09-10T13:00:00Z.*kur oynaklığı modellenmedi/);
  assert.doesNotMatch(state.textContent, /2026-09-11/);
  assert.equal(get('#mc-history-details').hidden,true,'legacy result with no source-cut evidence must not expose an empty source panel');
  context.DATA.generatedAt = date;
  context.portfolioData.us[0].amount = 2;
  context.syncMonteCarloResultState();
  assert.match(state.textContent, /^Güncel simülasyon sonucu/);
  context.DATA.us[0].price = 101;
  context.syncMonteCarloResultState();
  assert.match(state.textContent, /^Önceki simülasyon sonucu/, 'a quote change with the same snapshot timestamp still invalidates the result');
  context.DATA.us[0].price = 100;
  context.DATA.fx = null;
  context.syncMonteCarloResultState();
  assert.match(state.textContent, /^Önceki simülasyon sonucu/, 'an unavailable FX quote must not restore a current-result label');
});

test('static form exposes USD saving units and contains no initial fabricated financial observations', () => {
  for (const id of ['valuation-result-panel', 'valuation-sensitivity-container', 'dcf-table-container']) assert.match(html, new RegExp('id="' + id + '"[^>]*hidden'), 'uncalculated result surfaces start hidden');
  assert.match(html, /<label>Aylık ek tasarruf \(USD\)/);
  for (const id of ['dcf-net-debt', 'dcf-revenue', 'dcf-shares', 'graham-eps', 'ddm-dividend']) {
    const input = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'))[0];
    assert.doesNotMatch(input, /\bvalue="[^"]+"/);
    assert.match(input, /placeholder=/);
  }
});
