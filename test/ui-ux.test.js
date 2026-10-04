'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'app.js'), 'utf8');

function element() {
  const listeners = new Map();
  const classes = new Set();
  return {
    hidden: false,
    isConnected: true,
    offsetParent: {},
    value: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    classList: {
      add(...xs) { xs.forEach((x) => classes.add(x)); },
      remove(...xs) { xs.forEach((x) => classes.delete(x)); },
      contains(x) { return classes.has(x); },
      toggle(x, on) { if (on === undefined ? !classes.has(x) : on) classes.add(x); else classes.delete(x); },
    },
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name]; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    dispatch(type, event = {}) { const fn = listeners.get(type); if (fn) fn({ target: this, preventDefault() {}, ...event }); },
    focus() { this.ownerDocument.activeElement = this; },
    ownerDocument: null,
  };
}

function domContext(elements = {}) {
  const body = element();
  const document = {
    body,
    activeElement: null,
    querySelector(selector) { return elements[selector] || null; },
    querySelectorAll(selector) { return elements[selector] || []; },
    addEventListener(type, fn) { this.listeners ||= {}; this.listeners[type] = fn; },
    listeners: {},
  };
  body.ownerDocument = document;
  Object.values(elements).flat().forEach((el) => { if (el && typeof el === 'object') el.ownerDocument = document; });
  return document;
}

function context(extra = {}, elements = {}) {
  const document = domContext(elements);
  const ctx = {
    console,
    document,
    window: { innerWidth: 760, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Intl,
    Date,
    Error,
    Promise,
    ...extra,
  };
  ctx.$ = (selector) => document.querySelector(selector);
  return vm.createContext(ctx);
}

function evaluate(source, ctx) { vm.runInContext(source, ctx, { timeout: 1000 }); }

async function testNavigationFocus() {
  const toggle = element();
  const close = element();
  const backdrop = element();
  const first = element();
  const last = element();
  const ctx = context({}, { '#navToggle': toggle, '#navClose': close, '#navBackdrop': backdrop, '.sidebar button, .sidebar a, .sidebar summary, .sidebar select, .sidebar input': [first, last], '.navitem': [] });
  const start = appSource.indexOf('let navigationReturnFocus = null;');
  const end = appSource.indexOf("document.querySelectorAll('.navitem')", start);
  evaluate(appSource.slice(start, end), ctx);

  toggle.dispatch('click');
  assert.equal(ctx.document.body.classList.contains('nav-open'), true);
  assert.equal(ctx.document.activeElement, first, 'drawer opening moves focus inside the drawer');
  ctx.document.listeners.keydown({ key: 'Tab', shiftKey: true, preventDefault() {}, target: first });
  assert.equal(ctx.document.activeElement, last, 'shift-tab wraps to the last drawer control');
  ctx.document.listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(ctx.document.body.classList.contains('nav-open'), false);
  assert.equal(ctx.document.activeElement, toggle, 'drawer close restores trigger focus');
  close.dispatch('click');
  backdrop.dispatch('click');
}

async function testMarketSearchPersistence() {
  const search = element();
  const sort = element();
  const returnButton = element();
  const marketView = element();
  const ctx = context({
    activeView: 'us',
    sortBy: 'score',
    detailReturnFocus: null,
    candidateOrigin: null,
    marketDetailOpen: false,
    marketUi: { us: { query: '', sort: 'score' } },
    savedUiCount: 0,
    saveRouteUi() { ctx.savedUiCount++; },
    renderTable() {}, renderScoreChart() {},
  }, { '#marketSearch': search, '#sortSel': sort, '#assetReturnBtn': returnButton, '#view-market': marketView });
  const start = appSource.indexOf("$('#sortSel').addEventListener");
  const end = appSource.indexOf("$('#refreshBtn').addEventListener", start);
  evaluate(appSource.slice(start, end), ctx);
  search.dispatch('input', { target: { value: 'AAPL' } });
  assert.equal(ctx.marketUi.us.query, 'AAPL');
  assert.equal(ctx.savedUiCount, 1, 'search updates the current history entry without adding navigation');
  search.value = ctx.marketUi.us.query;
  assert.equal(search.value, 'AAPL', 'the active market query survives a render cycle through marketUi state');
  marketView.classList.add('is-detail-open');
  returnButton.dispatch('click');
  assert.equal(marketView.classList.contains('is-detail-open'), false);
}

async function testFailedPortfolioIsDistinctEmpty() {
  const ctx = context({ fetch: async () => { throw new Error('offline'); }, portfolioData: null, portfolioState: 'loading', portfolioLoadError: '', renderPortfolioLoadState() {} });
  const start = appSource.indexOf('async function loadPortfolio()');
  const end = appSource.indexOf('\nfunction renderPortfolioLoadState()', start);
  evaluate(appSource.slice(start, end), ctx);
  await ctx.loadPortfolio();
  assert.equal(ctx.portfolioData, null, 'a first portfolio failure remains unavailable rather than masquerading as an empty portfolio');
  assert.equal(ctx.portfolioState, 'unavailable');
}

function refreshHarness() {
  const button = element();
  const status = element();
  let resolveFetch, rejectFetch, requests = 0, renders = 0;
  const pending = new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; });
  const ctx = context({
    DATA: { generatedAt: '2026-10-01T00:00:00.000Z' }, REPORT_CACHE: { cached: true },
    authedFetch: async () => { requests += 1; return pending; },
    updateFreshness() {}, renderView() { renders += 1; }, alert() {},
  }, { '#refreshBtn': button, '#updated': status });
  const start = appSource.indexOf('let refreshPending = false;');
  const end = appSource.indexOf('\nasync function silentRefresh()', start);
  assert.ok(start >= 0 && end > start, 'manual refresh function and pending guard exist');
  evaluate(appSource.slice(start, end), ctx);
  button.focus();
  return { button, status, ctx, pending, finishSuccess: resolveFetch, finishFailure: rejectFetch,
    get requests() { return requests; }, get renders() { return renders; } };
}

async function testRefreshFocusAndDuplicateGuard() {
  const harness = refreshHarness();
  const first = harness.ctx.refresh();
  const duplicate = harness.ctx.refresh();
  assert.equal(harness.button.disabled, true);
  assert.equal(harness.requests, 1, 'a second manual refresh while pending is ignored');
  await duplicate;
  harness.ctx.document.activeElement = harness.ctx.document.body; // native focus loss when disabling a focused button
  harness.finishSuccess({ ok: true, status: 200, json: async () => ({ empty: false, generatedAt: '2026-10-01T08:00:00Z' }) });
  await first;
  assert.equal(harness.button.disabled, false);
  assert.equal(harness.ctx.document.activeElement, harness.button, 'success restores focus only after it fell to body');
  assert.equal(harness.renders, 1);

  const failed = refreshHarness();
  const failedRequest = failed.ctx.refresh();
  failed.ctx.document.activeElement = failed.ctx.document.body;
  failed.finishFailure(new Error('offline'));
  await failedRequest;
  assert.equal(failed.ctx.document.activeElement, failed.button, 'failure also restores the original refresh trigger focus');
  assert.match(failed.status.innerHTML, /Yenileme başarısız/);
}

async function testRefreshDoesNotStealMovedFocus() {
  const harness = refreshHarness();
  const other = element();
  other.ownerDocument = harness.ctx.document;
  const request = harness.ctx.refresh();
  other.focus();
  harness.finishSuccess({ ok: true, status: 200, json: async () => ({ empty: false, generatedAt: '2026-10-01T08:00:00Z' }) });
  await request;
  assert.equal(harness.ctx.document.activeElement, other, 'refresh completion does not steal focus after the user moved elsewhere');
}

function testModifiedHomePreservesBrowserBehavior() {
  function tabsFor(attr, values) {
    return values.map((value) => {
      const listeners = {};
      return { dataset: { [attr]: value }, listeners, focused: 0, clicked: 0,
        addEventListener(name, fn) { listeners[name] = fn; }, focus() { this.focused += 1; }, click() { this.clicked += 1; } };
    });
  }
  const assetTabs = tabsFor('assetTab', ['overview', 'technical']);
  const elementRoot = { querySelectorAll(selector) { return selector === '[data-asset-tab]' ? assetTabs : []; } };
  const assetCtx = context({ el: elementRoot });
  const assetStart = appSource.indexOf("el.querySelectorAll('[data-asset-tab]').forEach((tab, index, tabs) => tab.addEventListener('keydown'");
  const assetEnd = appSource.indexOf("  el.querySelectorAll('[data-asset-panel]')", assetStart);
  assert.ok(assetStart >= 0 && assetEnd > assetStart, 'asset detail tab keyboard handler exists');
  evaluate(appSource.slice(assetStart, assetEnd), assetCtx);
  for (const tab of assetTabs) {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      let prevented = false;
      tab.listeners.keydown({ key: 'Home', [modifier]: true, preventDefault() { prevented = true; } });
      assert.equal(prevented, false, `modified Home is not consumed by asset tabs (${modifier})`);
      assert.equal(assetTabs.reduce((sum, item) => sum + item.focused + item.clicked, 0), 0);
    }
  }

  const forecastTabs = tabsFor('forecastMode', ['portfolio', 'valuation']);
  const tabsRoot = { querySelectorAll(selector) { return selector === '[data-forecast-mode]' ? forecastTabs : []; } };
  const forecastCtx = context({ tabs: tabsRoot, modeBlocks: {}, localStorage: { setItem() {} }, syncForecastPanels() {} });
  const forecastStart = appSource.indexOf("tabs.querySelectorAll('[data-forecast-mode]').forEach((b, index, list) =>");
  const forecastEnd = appSource.indexOf('\n    activate(localStorage.getItem', forecastStart);
  assert.ok(forecastStart >= 0 && forecastEnd > forecastStart, 'forecast mode tab handler exists');
  evaluate(appSource.slice(forecastStart, forecastEnd), forecastCtx);
  for (const tab of forecastTabs) {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      let prevented = false;
      tab.listeners.keydown({ key: 'Home', [modifier]: true, preventDefault() { prevented = true; } });
      assert.equal(prevented, false, `modified Home is not consumed by forecast tabs (${modifier})`);
      assert.equal(forecastTabs.reduce((sum, item) => sum + item.focused + item.clicked, 0), 0);
    }
  }
}

async function testStaleReportGuard() {
  const report = element();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const ctx = context({ activeView: 'report', reportRequest: 0, loadReportCache: async () => pending }, { '#reportContent': report });
  const start = appSource.indexOf('async function renderReport()');
  const end = appSource.indexOf('\nfunction esc(', start);
  evaluate(appSource.slice(start, end), ctx);
  const first = ctx.renderReport();
  ctx.reportRequest = 2;
  release({ base: { date: 'old' } });
  await first;
  assert.equal(report.innerHTML, '', 'a superseded report request cannot paint stale content');
}

async function testReportContentSurvivesLayoutChange() {
  const report = element();
  report.querySelectorAll = () => [];
  const research = require('../public/research.js');
  const sources = Array.from({ length: 12 }, (_, index) => ({
    id: 'source-' + index, title: 'Kaynak ' + index,
    url: 'https://example.com/evidence/' + index, publishedAt: '2026-10-02T08:00:00Z',
  }));
  sources.push({ id: 'unsafe', title: '<img onerror=bad>', url: 'javascript:alert(1)' });
  const data = {
    base: { generatedAt: '2026-10-02T08:00:00Z', date: '2026-10-02',
      quality: { status: 'partial' }, sentiment: { total: 133, buys: 26, gainers: 105, avg: 39, label: 'Temkinli' },
      opportunities: [{ symbol: 'TEST', market: 'us', summary: 'Teknik aday kaydı', label: 'AL', score: 71 }],
      signals: { oversold: ['OVERSOLD_TEST'], overbought: ['OVERBOUGHT_TEST'], goldenCross: ['GOLDEN_TEST'],
        deathCross: ['DEATH_TEST'], volumeSpike: ['VOLUME_TEST'], strongMomentum: ['MOMENTUM_TEST'] },
      risks: [{ market: 'us', symbol: 'TEST', reason: 'Risk gerekçesi' }],
    },
    ai: { todayFocus: 'Model odağı <img src=x>', macroSummary: 'Makro gerekçe', weeklyRetro: 'Haftalık kayıt',
      worldNews: [{ title: 'Dünya kaydı', impact: 'olumsuz' }], commentary: { us: 'ABD yorumu', bist: 'BIST yorumu', crypto: 'Kripto yorumu' },
      literacyTip: { title: 'Eğitim kaydı', body: 'Öğrenme açıklaması' },
      quiz: { question: 'Quiz kaydı', options: ['A', 'B'], correctIndex: 0 },
      research: { sources, events: [{ title: 'Araştırma kaydı', market: 'us', whatChanged: 'Kanıt açıklaması', sourceIds: ['source-0'] }] },
    },
    integrity: { usableResearch: true, baseStatus: 'snapshot-mismatch', researchStatus: 'previous-analysis', analysisAsOf: '2026-10-02T08:00:00Z' },
    automation: { status: 'completed', stages: [] },
  };
  const ctx = context({ activeView: 'report', reportRequest: 0, loadReportCache: async () => data,
    FinansResearch: { ...research, loadEvaluation() {} }, URL,
    esc: (value) => String(value == null ? '' : value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])),
    fullTimestamp: research.timestamp, relTime: () => 'önce',
    reportSignalOverlayHtml: () => '', weeklyHtml: () => '<h2>Takvim kaydı</h2>', triggerRevealAnimations() {}, reduceMotion: true,
    // This harness checks report content. Optional experience helpers have their own behavioral tests.
    workBriefHtml: () => '', bindReportReading() {},
    technicalSignalLabel: require('../public/insights').technicalSignalLabel,
  }, { '#reportContent': report });
  evaluate(appSource.slice(appSource.indexOf('function marketShortLabel('), appSource.indexOf('function catalystPressureLabel(')), ctx);
  const start = appSource.indexOf('async function renderReport()');
  evaluate(appSource.slice(start, appSource.indexOf('\nfunction esc(', start)), ctx);
  await ctx.renderReport();
  const rendered = report.innerHTML;
  for (const marker of ['Model odağı', 'Makro gerekçe', 'Haftalık kayıt', 'Dünya kaydı', 'Teknik aday kaydı', 'OVERSOLD_TEST',
    'OVERBOUGHT_TEST', 'GOLDEN_TEST', 'DEATH_TEST', 'VOLUME_TEST', 'MOMENTUM_TEST',
    'Risk gerekçesi', 'ABD yorumu', 'BIST yorumu', 'Kripto yorumu', 'Eğitim kaydı', 'Quiz kaydı', 'Araştırma kaydı', 'Takvim kaydı']) {
    assert.ok(rendered.includes(marker), `report retains ${marker}`);
  }
  for (let index = 0; index < 12; index++) assert.ok(rendered.includes('https://example.com/evidence/' + index), 'every source remains reachable');
  assert.doesNotMatch(rendered, /href="javascript:|<img/);
  assert.match(rendered, /Rapor güncel fiyat verisiyle eşleşmiyor/);
  assert.match(rendered, /Veri kapsamı eksik/);
  const sectionIds = ['report-summary', 'report-developments', 'report-impact', 'report-calendar', 'report-evaluation'];
  for (let index = 1; index < sectionIds.length; index++) {
    assert.ok(rendered.indexOf('id="' + sectionIds[index - 1] + '"') < rendered.indexOf('id="' + sectionIds[index] + '"'), 'report reading order is preserved');
  }
}

async function testOverviewBriefingReportSuccessAndFailure() {
  const briefing = element();
  const status = element();
  const report = {
    base: {
      generatedAt: '2099-01-01T12:00:00Z',
      sentiment: { label: 'Pozitif', avg: 72, gainers: 1, total: 1 },
      signalOverlay: { summary: { withEvidence: 1, reduced: 0, boosted: 1 } },
      calendar: { economic: [], earnings: [], coverage: {} },
    },
    ai: {
      macroSummary: 'Model özeti', todayFocus: 'Takip notu',
      research: { sources: [{ id: 'source-1', publishedAt: '2099-01-01T10:00:00Z' }], events: [{ market: 'us', sourceIds: ['source-1'], title: 'Doğrulanmış gelişme', whatChanged: 'Yeni kanıt' }] },
    },
    integrity: {},
  };
  const common = {
    activeView: 'overview', briefingRequest: 0,
    renderOverviewPortfolioSummary() {},
    DATA: { us: [{ symbol: 'AAPL', changePct: 1 }], bist: [], crypto: [] },
    fullTimestamp: () => '1.01.2099 13:00', fullDate: () => '1.01.2099',
    esc: (value) => String(value == null ? '' : value),
    FinansResearch: { canUseReportOverlay: () => true, automationStatusSummary: () => '' },
    FinansReportIntegrity: { assess: () => ({ baseStatus: 'current' }) },
    FinansActionLayer: { buildDailyChangeDigest: () => ({ improving: [], weakening: [] }) },
    window: { FinansResearch: {}, FinansReportIntegrity: {}, FinansActionLayer: {} },
  };
  const success = context({ ...common, loadReportCache: async () => report }, { '#overviewBriefing': briefing, '#overviewWorkspaceStatus': status });
  success.window.FinansReportIntegrity = common.FinansReportIntegrity;
  success.window.FinansActionLayer = common.FinansActionLayer;
  success.window.FinansResearch = common.FinansResearch;
  const start = appSource.indexOf('async function renderOverviewBriefing()');
  const end = appSource.indexOf('\nfunction renderKpis()', start);
  assert.ok(start >= 0 && end > start, 'overview briefing renderer exists');
  evaluate(appSource.slice(start, end), success);
  await success.renderOverviewBriefing();
  assert.match(briefing.innerHTML, /Doğrulanmış gelişme/);
  assert.match(briefing.innerHTML, /Model özeti/);

  const failedBriefing = element();
  const failed = context({ ...common, loadReportCache: async () => { throw new Error('offline'); } }, { '#overviewBriefing': failedBriefing, '#overviewWorkspaceStatus': element() });
  failed.window.FinansReportIntegrity = common.FinansReportIntegrity;
  failed.window.FinansActionLayer = common.FinansActionLayer;
  failed.window.FinansResearch = common.FinansResearch;
  evaluate(appSource.slice(start, end), failed);
  await failed.renderOverviewBriefing();
  assert.match(failedBriefing.innerHTML, /Rapor katmani henuz hazir degil/);
  assert.doesNotMatch(failedBriefing.innerHTML, /ReferenceError|report is not defined/);
}

async function testStaleChartGuard() {
  const title = element();
  const meta = element();
  const chartBox = element();
  const note = element();
  const pending = [];
  let drawn = 0;
  const ctx = context({
    assetDeskRequest: 0,
    assetDeskState: { market: null, symbol: null, interval: null },
    marketUi: { us: { symbol: null } },
    activeView: 'us',
    deskDefaultInterval: () => '1d', syncDeskControls() {}, fmtPrice: () => '$1', fmtPct: () => '+1%', destroyAssetDeskChart() {},
    drawAssetDeskChart() { drawn += 1; },
    fetch: () => new Promise((resolve) => pending.push(resolve)),
  }, { '#deskTitle': title, '#deskMeta': meta, '#assetChart': chartBox, '#assetChartNote': note });
  const start = appSource.indexOf('async function renderAssetDesk(asset)');
  const end = appSource.indexOf('\n/* ---------- Tablo + detay ---------- */', start);
  evaluate(appSource.slice(start, end), ctx);
  const asset = { symbol: 'AAPL', market: 'us', name: 'Apple', price: 100, changePct: 1 };
  const first = ctx.renderAssetDesk(asset);
  const second = ctx.renderAssetDesk(asset);
  pending[0]({ ok: true, json: async () => ({ bars: [] }) });
  await first;
  assert.equal(drawn, 0, 'the first chart response is discarded after a newer request starts');
  pending[1]({ ok: true, json: async () => ({ bars: [] }) });
  await second;
  assert.equal(drawn, 1);
}

(async () => {
  await testNavigationFocus();
  await testMarketSearchPersistence();
  await testFailedPortfolioIsDistinctEmpty();
  await testRefreshFocusAndDuplicateGuard();
  await testRefreshDoesNotStealMovedFocus();
  testModifiedHomePreservesBrowserBehavior();
  await testStaleReportGuard();
  await testReportContentSurvivesLayoutChange();
  await testOverviewBriefingReportSuccessAndFailure();
  await testStaleChartGuard();
  console.log('ui-ux behavioral tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
