// Dashboard istemcisi — sidebar görünümleri, indikatör detayları, Emil-kalibre mikro etkileşimler.
'use strict';

let DATA = null;
let activeView = 'overview';
let sortBy = 'score';
let allocChart = null;
let scoreChart = null;
let moversChart = null;
let portAllocChart = null;
let backtestChart = null;
let mcChart = null;
let portfolioData = null;
let portfolioState = 'loading';
let portfolioLoadError = '';
let portfolioSaving = false;
let stressRequestVersion = 0;
let stressLastSuccessHtml = '';
let stressLastSuccessSignature = '';

function stressPortfolioSignature(data) {
  if (!data || typeof data !== 'object') return '';
  return JSON.stringify(['us', 'bist', 'crypto'].map((market) => [market, (Array.isArray(data[market]) ? data[market] : []).map((item) => ({ symbol: item && item.symbol, amount: item && item.amount, avgPrice: item && item.avgPrice }))]));
}
let REPORT_CACHE = null;
let REPORT_CACHED_AT = 0;
let REPORT_REQUEST = null;
let predictionCohortFilter = 'verified';
let activeDetailCharts = {};
let assetDeskChart = null;
let assetDeskResize = null;
let lastAssetChart = null;
const marketChartPrefs = Object.create(null);
let assetDeskState = {
  market: null,
  symbol: null,
  mode: 'candles',
  interval: null,
  showSMA:  localStorage.getItem('finans-show-sma')  === 'true',
  showRSI:  localStorage.getItem('finans-show-rsi')  === 'true',
  showMACD: localStorage.getItem('finans-show-macd') === 'true',
};
let booted = false;
let loadFailures = 0;
let assetDeskRequest = 0;
let reportRequest = 0;
let briefingRequest = 0;
let keyboardNavigation = false;
let overviewTaskSelection = (() => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('finans-overview-task') || 'decisions' : 'decisions'; }
  catch (_) { return 'decisions'; }
})();
let overviewContextSelection = (() => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('finans-overview-context') || 'markets' : 'markets'; }
  catch (_) { return 'markets'; }
})();
let detailReturnFocus = null;
let marketDetailOpen = false;
const marketUi = { us: { query: '', sort: 'score', symbol: null }, bist: { query: '', sort: 'score', symbol: null }, crypto: { query: '', sort: 'score', symbol: null } };
// UI state deliberately lives in memory. Notes are drafts until the user submits them.
const noteDrafts = Object.create(null);
let journalSaving = false;
const assetDetailTabs = Object.create(null);
const marketScroll = Object.create(null);
let routeApplying = false;
let backtestResult = null;
let backtestRequest = 0;
let mcRequest = 0;
let dcfRequest = 0;
let lastDcfSnapshot = null;
let dcfPending = false;
let forecastDefaultsLoaded = false;
let screenerState = { query: '', market: 'all', category: 'all', sort: 'score', page: 1, pageSize: 25 };

const $ = (s) => document.querySelector(s);
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionQuery.matches;
motionQuery.addEventListener('change', (event) => { reduceMotion = event.matches; });

/* ---------- Biçimlendirme ---------- */
function fmtQty(n) { return Number.isFinite(Number(n)) ? Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 8 }) : '–'; }
function fmtNum(n, d = 2) {
  if (n == null || isNaN(n)) return '–';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPrice(n, cur) {
  if (n == null || isNaN(n)) return '–';
  const sym = cur === 'TRY' ? '₺' : cur === 'USD' || !cur ? '$' : cur + ' ';
  const magnitude = Math.abs(n);
  const d = magnitude >= 1000 ? 0 : magnitude >= 1 ? 2 : magnitude > 0 ? Math.min(10, Math.max(4, Math.ceil(-Math.log10(magnitude)) + 2)) : 2;
  return sym + fmtNum(n, d);
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '–';
  return (n >= 0 ? '+' : '') + fmtNum(n, 2) + '%';
}
function fmtCap(n) {
  if (!n) return '–';
  if (n >= 1e12) return '$' + fmtNum(n / 1e12, 2) + ' Tn';
  if (n >= 1e9) return '$' + fmtNum(n / 1e9, 1) + ' Mr';
  if (n >= 1e6) return '$' + fmtNum(n / 1e6, 1) + ' Mn';
  return '$' + fmtNum(n, 0);
}
function toneColor(t) {
  return { 'strong-buy': '#28d793', buy: '#4382ff', hold: '#eab308', reduce: '#f97316', sell: '#f87171' }[t] || '#7d8590';
}
function decisionTone(d) {
  return d && d.status ? d.status : 'unknown';
}
function decisionLabel(d) {
  if (!d) return 'Karar yok';
  if (d.status === 'clean') return 'Temiz';
  if (d.status === 'caution') return 'Dikkat';
  if (d.status === 'blocked') return 'Riskli';
  return 'Belirsiz';
}
function findPickAsset(p) {
  const market = p.market === 'ABD' ? 'us' : p.market === 'BIST' ? 'bist' : 'crypto';
  const list = DATA && DATA[market] ? DATA[market] : [];
  return list.find((x) => x.symbol === p.symbol);
}
function decisionMini(d) {
  if (!d) return '';
  return '<span class="decision-mini decision-' + decisionTone(d) + '" title="Karar kalitesi: ' + decisionLabel(d) + '">' + d.score + '</span>';
}

const TR_DAYS = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
const TR_MONTHS = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function relTime(iso) {
  if (!iso) return 'bilinmiyor';
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1.5) return 'az once';
  if (mins < 60) return Math.round(mins) + ' dk once';
  if (mins < 600) return (mins / 60).toFixed(1).replace('.0', '') + ' saat once';
  return d.getDate() + ' ' + TR_MONTHS[d.getMonth()] + ' ' + TR_DAYS[d.getDay()] + ' kapanisi';
}
function marketStatus(market) {
  const now = new Date();
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekend = day === 0 || day === 6;
  if (market === 'crypto') return { open: true, label: 'Canli · 7/24 acik' };
  if (weekend) return { open: false, label: 'Hafta sonu — piyasa kapali' };
  if (market === 'us') {
    const open = mins >= 13 * 60 + 30 && mins < 20 * 60;
    return { open, label: open ? 'Acik — ABD seansi' : 'Kapali — seans disi' };
  }
  const open = mins >= 7 * 60 && mins < 15 * 60;
  return { open, label: open ? 'Acik — BIST seansi' : 'Kapali — seans disi' };
}

function countUp(el, target, { decimals = 0, dur = 650 } = {}) {
  el.textContent = target.toFixed(decimals);
}

/* ---------- Veri yükleme ---------- */
let JOURNAL = { notes: {}, alerts: [], predictions: [], theses: {}, catalysts: [], riskRules: [] };
let JOURNAL_READY = false;

async function loadJournal() {
  try {
    const res = await fetch('/api/journal', { cache: 'no-store' });
    if (!res.ok) throw new Error('Gunluk yuklenemedi');
    JOURNAL = await res.json();
    JOURNAL_READY = Object.prototype.hasOwnProperty.call(JOURNAL, '_revision');
  } catch (e) {
    console.error('Journal yüklenemedi:', e);
    JOURNAL_READY = false;
    JOURNAL = { notes: {}, alerts: [], predictions: [], theses: {}, catalysts: [], riskRules: [] };
  }
}

async function saveJournal() {
    if (!JOURNAL_READY) throw new Error('Gunluk kaynagi yuklenemedi. Sayfayi yenileyin.');
    const res = await authedFetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JOURNAL),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Gunluk kaydedilemedi');
    JOURNAL = result;
}

async function loadPortfolio() {
  portfolioState = portfolioData ? 'stale' : 'loading';
  renderPortfolioLoadState();
  try {
    const res = await fetch('/api/portfolio');
    if (!res.ok) throw new Error('portfolio unavailable');
    portfolioData = await res.json();
    portfolioState = 'ready';
    portfolioLoadError = '';
    renderPortfolioLoadState();
    if (typeof activeView !== 'undefined' && activeView === 'overview' && typeof renderOverviewPortfolioSummary === 'function') renderOverviewPortfolioSummary();
    return true;
  } catch (e) {
    portfolioLoadError = 'Portföy verisi yüklenemedi.';
    portfolioState = portfolioData ? 'stale' : 'unavailable';
    renderPortfolioLoadState();
    return false;
  }
}
function renderPortfolioLoadState() {
  const el = $('#portfolioLoadState');
  if (!el) return;
  if (portfolioState === 'loading') el.innerHTML = '<div class="ui-skeleton">Portföy yükleniyor…</div>';
  else if (portfolioState === 'unavailable') el.innerHTML = '<div class="ui-state-error">Portföy verisi alınamadı. <button type="button" id="portfolioRetryBtn">Tekrar dene</button></div>';
  else if (portfolioState === 'stale') el.innerHTML = '<div class="ui-state-error">' + esc(portfolioLoadError || 'Portföy güncellenemedi; son başarılı veri gösteriliyor.') + ' <button type="button" id="portfolioRetryBtn">Tekrar dene</button></div>';
  else el.innerHTML = '';
  const retry = $('#portfolioRetryBtn');
  if (retry) retry.addEventListener('click', async () => { await loadPortfolio(); if (portfolioData) renderPortfolioView(); });
}

async function load() {
  try {
    if (!DATA) {
      $('#updated').innerHTML = '<span class="ui-skeleton" role="status">Veri yükleniyor…</span>';
      const view = $('#' + VIEW_META[activeView][2]);
      if (view && !view.querySelector('.view-loading-skeleton')) {
        const skeleton = document.createElement('div'); skeleton.className = 'view-loading-skeleton'; skeleton.setAttribute('role', 'status'); skeleton.setAttribute('aria-label', 'Çalışma alanı yükleniyor');
        skeleton.innerHTML = '<div class="ui-skeleton skeleton-title" aria-hidden="true"></div><div class="ui-skeleton skeleton-band" aria-hidden="true"></div><div class="ui-skeleton skeleton-table" aria-hidden="true"></div>';
        view.prepend(skeleton); view.classList.add('initial-loading');
      }
    }
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) throw new Error('data unavailable');
    DATA = await res.json();
    if (DATA && DATA.empty) {
      $('#updated').innerHTML = '<span class="fresh stale"><span class="dot"></span>Ilk veri cekiliyor…</span>';
      return silentRefresh();
    }
    // Independent reads overlap; a failed report read must not erase the last usable report.
    await Promise.all([loadPortfolio(), loadJournal(), loadReportCache().catch(() => null)]);
    updateFreshness();
    loadFailures = 0;
    document.querySelectorAll('.view-loading-skeleton').forEach((skeleton) => { skeleton.parentElement.classList.remove('initial-loading'); skeleton.remove(); });
    renderView();
    if (!booted) { booted = true; maybeAutoRefresh(); }
  } catch (e) {
    loadFailures += 1;
    const status = $('#updated');
    if (loadFailures <= 2) {
      status.innerHTML = '<span class="fresh stale" role="status">Sunucuya bağlanılamadı. Yeniden deneniyor…</span>';
      setTimeout(load, 1500);
    } else {
      status.innerHTML = '<span class="fresh stale" role="status">Veri yüklenemedi. <button type="button" id="loadRetryBtn">Tekrar dene</button></span>';
      const retry = $('#loadRetryBtn');
      if (retry) retry.addEventListener('click', () => { loadFailures = 0; load(); }, { once: true });
    }
  }
}
/* ---------- Yönetici parolası (yazma işlemleri için) ---------- */
function adminHeaders(base) {
  const h = Object.assign({}, base || {});
  const s = localStorage.getItem('adminSecret');
  if (s) h['x-admin-secret'] = s;
  return h;
}
// Yazma uçlarına ADMIN_SECRET ekler; 401'de parolayı sorar (silent değilse) ve bir kez yeniden dener.
async function authedFetch(url, opts, cfg) {
  opts = opts || {};
  const allowPrompt = !(cfg && cfg.silent);
  let res = await fetch(url, Object.assign({}, opts, { headers: adminHeaders(opts.headers) }));
  if (res.status === 401 && allowPrompt) {
    const entered = prompt('Yönetici doğrulaması: bu kayıt veya veri üretme işlemi için yönetici parolanızı girin.');
    if (entered) {
      localStorage.setItem('adminSecret', entered);
      res = await fetch(url, Object.assign({}, opts, { headers: adminHeaders(opts.headers) }));
    }
  }
  return res;
}

let refreshPending = false;
async function refresh() {
  if (refreshPending) return;
  const btn = $('#refreshBtn');
  if (!btn) return;
  const doc = btn.ownerDocument || document;
  const restoreFocus = doc.activeElement === btn;
  refreshPending = true;
  btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await authedFetch('/api/refresh', { method: 'POST' });
    if (res.status === 401) { alert('Yenileme için doğru yönetici parolası gerekli.'); return; }
    const fresh = await res.json();
    if (!res.ok) throw new Error(fresh.error || 'Veri yenilenemedi');
    if (fresh && !fresh.empty) { DATA = fresh; REPORT_CACHE = null; updateFreshness(); renderView(); }
  } catch (e) {
    const status = $('#updated');
    if (status) status.innerHTML = '<span class="fresh stale" role="status">Yenileme başarısız oldu; son başarılı veri gösteriliyor.</span>';
  }
  finally {
    btn.disabled = false; btn.classList.remove('loading');
    refreshPending = false;
    if (restoreFocus && btn.isConnected && (!doc.activeElement || doc.activeElement === doc.body) && typeof btn.focus === 'function') btn.focus();
  }
}
async function silentRefresh() {
  try {
    // Arka plan tazelemesi: parola sorma, 401 ise sessizce geç (GitHub Actions zaten günlük tazeler).
    const res = await authedFetch('/api/refresh', { method: 'POST' }, { silent: true });
    if (!res.ok) return;
    const fresh = await res.json();
    if (fresh && !fresh.empty) { DATA = fresh; REPORT_CACHE = null; updateFreshness(); renderView(); }
  } catch (e) { /* sessiz */ }
}
function maybeAutoRefresh() {
  const ageMin = (Date.now() - new Date(DATA.generatedAt).getTime()) / 60000;
  if (ageMin > 15) silentRefresh();
}
function updateFreshness() {
  const ageMin = (Date.now() - new Date(DATA.generatedAt).getTime()) / 60000;
  const cls = ageMin < 15 ? '' : 'stale';
  $('#updated').innerHTML = '<span class="fresh ' + cls + '"><span class="dot"></span>Veri: ' + relTime(DATA.generatedAt) + '</span>';
}

/* ---------- Görünüm yönetimi ---------- */
const VIEW_META = {
  overview: ['Genel Bakış', 'Tüm pazarların özeti ve öne çıkan fırsatlar', 'view-overview'],
  us: ['ABD Hisseleri', '12 hisse · teknik analiz + analist konsensüsü', 'view-market'],
  bist: ['BIST 100', 'En büyük 100 şirket · teknik analiz', 'view-market'],
  crypto: ['Kripto', '21 coin · teknik momentum analizi', 'view-market'],
  portfolio: ['Portföyüm', 'Maliyet, kâr/zarar ve portföy sağlık analizi', 'view-portfolio'],
  screener: ['Teknik Tarayıcı', 'Kritik indikatör sinyalleri ve alarmlar', 'view-screener'],
  backtest: ['Strateji Testi', 'Geçmiş fiyat verileriyle teknik puan stratejisi testi', 'view-backtest'],
  forecast: ['Finansal Projeksiyon', 'Olasılıksal portföy simülasyonu, stres testleri ve DCF analizleri', 'view-forecast'],
  report: ['Günlük Rapor', 'Teknik rapor, model araştırması ve kaynak kapsamı', 'view-report'],
  literacy: ['Finansal Okuryazarlık', 'İndikatör ve risk rehberi', 'view-literacy'],
};
function routeHash(view, market, symbol) {
  const params = new URLSearchParams();
  params.set('view', ['us', 'bist', 'crypto'].includes(view) ? 'market' : view);
  if (['us', 'bist', 'crypto'].includes(view)) {
    params.set('market', view);
    if (symbol) params.set('symbol', symbol);
  } else if (market && symbol) {
    params.set('market', market); params.set('symbol', symbol);
  }
  return '#' + params.toString();
}
function writeRoute(view, replace = false, preserveCurrentSnapshot = false) {
  if (routeApplying || !view) return;
  const market = ['us', 'bist', 'crypto'].includes(view) ? view : assetDeskState.market;
  const symbol = ['us', 'bist', 'crypto'].includes(view)
    ? (marketDetailOpen ? (marketUi[view] && marketUi[view].symbol) : null)
    : assetDeskState.symbol;
  const hash = routeHash(view, market, symbol);
  if (window.location.hash === hash) return;
  const method = replace ? 'replaceState' : 'pushState';
  if (!replace && !preserveCurrentSnapshot) saveRouteUi();
  window.history[method]({ view, market, symbol, ui: captureRouteUi() }, '', hash);
}
function captureRouteUi() {
  return { markets: JSON.parse(JSON.stringify(marketUi)), scroll: typeof marketScroll !== 'undefined' ? {...marketScroll} : {}, detailOpen: typeof marketDetailOpen !== 'undefined' ? marketDetailOpen : false, screener: typeof screenerState !== 'undefined' ? {...screenerState} : null };
}
function saveRouteUi() {
  if (routeApplying) return;
  window.history.replaceState({...window.history.state, ui:captureRouteUi()}, '', window.location.hash);
}
function readRoute() {
  const raw = window.location.hash.replace(/^#/, '');
  const p = new URLSearchParams(raw);
  const rawView = p.get('view') || 'overview';
  const market = p.get('market');
  const symbol = p.get('symbol');
  const validMarket = ['us', 'bist', 'crypto'].includes(market);
  const view = rawView === 'market' ? (validMarket ? market : 'overview') : rawView;
  const valid = Object.prototype.hasOwnProperty.call(VIEW_META, view) ? view : 'overview';
  return { view: valid, market, symbol, invalidMarket: rawView === 'market' && !validMarket };
}
function applyRoute() {
  const route = readRoute();
  routeApplying = true;
  const ui = window.history.state && window.history.state.ui;
  if (ui) {
    Object.keys(marketUi).forEach((market) => { if (ui.markets && ui.markets[market]) Object.assign(marketUi[market], ui.markets[market]); });
    if (ui.scroll && typeof marketScroll !== 'undefined') Object.assign(marketScroll, ui.scroll);
    if (ui.screener && typeof screenerState !== 'undefined') Object.assign(screenerState, ui.screener);
  }
  if (['us', 'bist', 'crypto'].includes(route.view)) {
    if (marketUi[route.view]) marketUi[route.view].symbol = route.symbol || marketUi[route.view].symbol;
    assetDeskState.symbol = route.symbol || null;
    // A symbol in the URL opens that asset; remembered list selection stays in marketUi.
    marketDetailOpen = !!route.symbol;
  }
  setView(route.view, { fromRoute: true });
  routeApplying = false;
}
function activateOverviewTask(task, moveFocus = false) {
  const tabs = Array.from(document.querySelectorAll('.overview-task-tab'));
  if (!tabs.length) return false;
  const tab = tabs.find((item) => item.dataset.overviewTab === task) || tabs.find((item) => item.dataset.overviewTab === 'decisions') || tabs[0];
  overviewTaskSelection = tab.dataset.overviewTab;
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.setAttribute('tabindex', active ? '0' : '-1');
    const panel = document.getElementById(item.getAttribute('aria-controls'));
    if (panel) panel.hidden = !active;
  });
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('finans-overview-task', overviewTaskSelection); } catch (_) { /* memory state remains available */ }
  if (moveFocus && tab.focus) tab.focus();
  return true;
}
function initOverviewTaskTabs() {
  const tabs = Array.from(document.querySelectorAll('.overview-task-tab'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateOverviewTask(tab.dataset.overviewTab, true));
    tab.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const index = tabs.indexOf(tab);
      let target = null;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') target = tabs[0];
      else if (event.key === 'End') target = tabs[tabs.length - 1];
      if (target) { event.preventDefault(); activateOverviewTask(target.dataset.overviewTab, true); }
    });
  });
  activateOverviewTask(overviewTaskSelection);
}
function activateOverviewContext(task, moveFocus = false) {
  const tabs = Array.from(document.querySelectorAll('[data-overview-context-tab]'));
  if (!tabs.length) return false;
  const tab = tabs.find((item) => item.dataset.overviewContextTab === task) || tabs.find((item) => item.dataset.overviewContextTab === 'markets') || tabs[0];
  overviewContextSelection = tab.dataset.overviewContextTab;
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.setAttribute('tabindex', active ? '0' : '-1');
    const panel = document.getElementById(item.getAttribute('aria-controls'));
    if (panel) panel.hidden = !active;
  });
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('finans-overview-context', overviewContextSelection); } catch (_) { /* memory state remains available */ }
  if (moveFocus && tab.focus) tab.focus();
  return true;
}
function initOverviewContextTabs() {
  const tabs = Array.from(document.querySelectorAll('[data-overview-context-tab]'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateOverviewContext(tab.dataset.overviewContextTab, true));
    tab.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const index = tabs.indexOf(tab);
      let target = null;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') target = tabs[0];
      else if (event.key === 'End') target = tabs[tabs.length - 1];
      if (target) { event.preventDefault(); activateOverviewContext(target.dataset.overviewContextTab, true); }
    });
  });
  activateOverviewContext(overviewContextSelection);
}
function setView(view, options = {}) {
  if (!VIEW_META[view]) view = 'overview';
  if (['us', 'bist', 'crypto'].includes(activeView)) {
    const table = $('#tableWrap');
    if (table && table.scrollTop != null) marketScroll[activeView] = table.scrollTop;
  }
  activeView = view;
  if (!options.fromRoute) writeRoute(view, false, !!options.preserveCurrentSnapshot);
  document.querySelectorAll('.navitem').forEach((n) => {
    const active = n.dataset.view === view;
    n.classList.toggle('active', active);
    if (active) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
  });
  const meta = VIEW_META[view];
  
  const titleEl = $('#viewTitle');
  const subEl = $('#viewSub');
  if (titleEl) titleEl.textContent = meta[0];
  if (subEl) subEl.textContent = meta[1];

  const targetViewId = meta[2];
  const targetViewEl = document.getElementById(targetViewId);
  const allViews = document.querySelectorAll('.view');

  allViews.forEach((v) => {
    if (window.gsap) gsap.killTweensOf(v);
    if (v.style) { v.style.removeProperty('opacity'); v.style.removeProperty('transform'); }
    const on = v.id === targetViewId;
    v.hidden = !on;
    v.classList.toggle('active', on);
  });
  if (targetViewEl && !reduceMotion && !keyboardNavigation && window.gsap) {
    gsap.killTweensOf(targetViewEl);
    gsap.fromTo(targetViewEl, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' });
  }
  const selectedFromNavigation = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sidebar');
  closeNavigation(false);
  if (selectedFromNavigation) {
    const heading = $('#viewTitle');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  }
  renderView();
}
function fullTimestamp(iso) {
  if (/^\d{10,13}$/.test(String(iso))) iso = Number(iso);
  if (!iso) return 'Zaman doğrulanamadı';
  const value = new Date(typeof iso === 'number' && iso < 100000000000 ? iso * 1000 : iso);
  if (Number.isNaN(value.getTime())) return 'Zaman doğrulanamadı';
  return new Intl.DateTimeFormat('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(value);
}
function fullDate(iso) {
  if (!iso) return 'Tarih doğrulanamadı';
  const value = new Date(typeof iso === 'number' && iso < 100000000000 ? iso * 1000 : iso);
  if (Number.isNaN(value.getTime())) return 'Tarih doğrulanamadı';
  return new Intl.DateTimeFormat('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }).format(value);
}
function renderView() {
  if (!DATA || DATA.empty) return;
  if (activeView === 'overview') {
    renderOverviewPortfolioSummary(); renderOverviewBriefing(); renderDailyDigest(); renderKpis(); renderExecSummary(); renderCfoDecisionCockpit(); renderSignalOverlayPanel(); renderIdeaFunnel(); renderCatalystCalendar();
    renderPredictionScorecard(); renderDecisionLearningPanel(); renderMarketRegime(); renderFxWidget(); renderPicks(); renderAlloc(); renderMovers(); renderDecisionTrace();
    if (window.FinansMacro && typeof window.FinansMacro.refresh === 'function') window.FinansMacro.refresh();
    triggerRevealAnimations($('#view-overview'));
  }
  else if (activeView === 'us' || activeView === 'bist' || activeView === 'crypto') {
    $('#marketChartTitle').textContent = VIEW_META[activeView][0] + ' — Yatırım Puanları';
    const marketWorkspaceTitle = $('#marketWorkspaceTitle');
    if (marketWorkspaceTitle) marketWorkspaceTitle.textContent = VIEW_META[activeView][0] + ' seçimi ve varlık detayı';
    const state = marketUi[activeView];
    if ($('#marketSearch')) $('#marketSearch').value = state.query;
    if ($('#sortSel')) $('#sortSel').value = state.sort;
    const list = currentList();
    const available = (DATA[activeView] || []).filter((asset) => asset.analysis && !asset.__error);
    const requestedSymbol = state.symbol || assetDeskState.symbol;
    const selected = (requestedSymbol ? available.find((x) => x.symbol === requestedSymbol) : null) || list[0];
    const invalidSymbol = !!requestedSymbol && !available.some((x) => x.symbol === requestedSymbol);
    if (invalidSymbol || !selected) marketDetailOpen = false;
    $('#view-market').classList.toggle('is-detail-open', marketDetailOpen);
    let routeNotice = $('#marketRouteNotice');
    if (!routeNotice && $('#tableWrap')) { routeNotice = document.createElement('p'); routeNotice.id = 'marketRouteNotice'; routeNotice.className = 'ui-state-error'; $('#tableWrap').parentElement.insertBefore(routeNotice, $('#tableWrap')); }
    if (routeNotice) { routeNotice.hidden = !invalidSymbol; routeNotice.textContent = invalidSymbol ? requestedSymbol + ' bu pazarda bulunamadı; liste gösteriliyor.' : ''; }
    renderMarketStatus(); renderAssetDesk(selected); renderScoreChart(); renderTable(); renderErrors();
    requestAnimationFrame(() => { const table = $('#tableWrap'); if (table && marketScroll[activeView] != null) table.scrollTop = marketScroll[activeView]; });
    triggerRevealAnimations($('#view-market'));
  } else if (activeView === 'report') {
    renderReport();
  } else if (activeView === 'portfolio') {
    renderPortfolioView();
  } else if (activeView === 'screener') {
    renderScreenerView();
  } else if (activeView === 'backtest') {
    renderBacktestView();
  } else if (activeView === 'forecast') {
    renderForecastView();
  } else if (activeView === 'literacy') {
    renderLiteracyView();
  }
}

/* ---------- Günlük Rapor ---------- */
function reportExecutiveReadingHtml(base, ai) {
  const s = base && base.sentiment ? base.sentiment : {};
  const overlaySummary = base && base.signalOverlay && base.signalOverlay.summary ? base.signalOverlay.summary : {};
  const macro = ai && ai.macroSummary ? ai.macroSummary : 'Makro yorum henuz uretilmedi; deterministik teknik rapor okunuyor.';
  const today = ai && ai.todayFocus ? ai.todayFocus : 'Bugun icin oncelik: genel duyarlilik, skor degisimi ve yaklasan katalizorleri birlikte oku.';
  const positioning = ai && ai.weeklyOutlook && ai.weeklyOutlook.positioning ? ai.weeklyOutlook.positioning : 'Pozisyon kararini tek sinyale baglama; rapor, teknik skor ve portfoy agirligini birlikte oku.';
  const worldNews = ai && Array.isArray(ai.worldNews) ? ai.worldNews.slice(0, 4) : [];
  const companyNews = base && base.calendar && Array.isArray(base.calendar.companyNews) ? base.calendar.companyNews.slice(0, 5) : [];
  const commentary = ai && ai.commentary ? ai.commentary : {};
  const marketLines = [
    commentary.us ? '<li><b>ABD</b><span>' + esc(commentary.us) + '</span></li>' : '',
    commentary.bist ? '<li><b>BIST</b><span>' + esc(commentary.bist) + '</span></li>' : '',
    commentary.crypto ? '<li><b>Kripto</b><span>' + esc(commentary.crypto) + '</span></li>' : '',
  ].filter(Boolean).join('');
  const worldHtml = worldNews.length
    ? worldNews.map((n) => '<li><b>' + esc(n.impact || 'notr') + '</b><span>' + esc(n.title || '') + '</span></li>').join('')
    : '<li><span>Kuresel haber ozeti icin AI raporu bekleniyor.</span></li>';
  const companyHtml = companyNews.length
    ? companyNews.map((n) => '<li><b>' + esc(n.symbol || '-') + '</b><span>' + esc(n.headline || '') + '</span></li>').join('')
    : '<li><span>Takip listesi icin sirket haber akisi yok.</span></li>';

  return '<div class="card reveal report-reader-card">' +
    '<div class="report-reader-head">' +
      '<div><span class="brief-kicker">Yonetici okuma akisi</span><h2>Once resmi anla, sonra detaya in.</h2></div>' +
      '<div class="reader-sentiment"><b>' + esc(s.label || '-') + '</b><span>' + esc(String(s.avg == null ? '-' : s.avg)) + '/100</span></div>' +
    '</div>' +
    '<div class="reader-grid">' +
      '<section class="reader-block reader-main"><h3>Makro degisim</h3><p>' + esc(macro) + '</p><ul>' + (marketLines || '<li><span>Pazar yorumu bekleniyor.</span></li>') + '</ul></section>' +
      '<section class="reader-block"><h3>Mikro ve haber akisi</h3><ul>' + worldHtml + companyHtml + '</ul></section>' +
      '<section class="reader-block"><h3>Bana etkisi</h3><p>' + esc(today) + '</p><div class="reader-impact">' +
        '<span>AL sinyali <b>' + esc(String(s.buys == null ? '-' : s.buys)) + '</b></span>' +
        '<span>Yukselen <b>' + esc(String(s.gainers == null ? '-' : s.gainers)) + '</b></span>' +
        '<span>Makro baski <b>' + (overlaySummary.withEvidence > 0 ? esc(String(overlaySummary.reduced || 0)) : 'Kanıt yok') + '</b></span>' +
      '</div><p>' + esc(positioning) + '</p></section>' +
    '</div>' +
  '</div>';
}
function renderDecisionTrace() {
  const view = $('#view-overview'); if (!view || !DATA) return;
  let el = $('#decisionTrace');
  if (!el) { el = document.createElement('section'); el.id = 'decisionTrace'; el.className = 'decision-trace'; const anchor = $('#dailyDigest'); if (anchor) anchor.appendChild(el); else view.appendChild(el); }
  const assets = [].concat(DATA.us || [], DATA.bist || [], DATA.crypto || []);
  const comparisons = assets.filter((asset) => Number.isFinite(asset.decision?.confidence?.previousScore) && Number.isFinite(asset.analysis?.score)).sort((a,b) => Math.abs(getScoreDelta(b) || 0) - Math.abs(getScoreDelta(a) || 0)).slice(0, 6);
  el.innerHTML = '<div class="card-head"><h3>Karar izi</h3><span class="card-sub">Önceki teknik durum → son teknik durum</span></div>' +
    '<p class="muted">Son veri: ' + esc(fullTimestamp(DATA.generatedAt)) + '. Önceki kaydın zamanı kaynakta yoksa gösterilmez.</p>' +
    (comparisons.length ? '<ul class="decision-trace-grid">' + comparisons.map((asset) => '<li><button class="asset-symbol-open" type="button" data-trace-symbol="' + esc(asset.symbol) + '" data-trace-market="' + esc(asset.market) + '"><b>' + esc(asset.symbol) + '</b></button><span>' + asset.decision.confidence.previousScore + ' → ' + asset.analysis.score + ' · ' + (getScoreDelta(asset) > 0 ? '+' : '') + getScoreDelta(asset) + ' puan</span><span>' + esc(asset.analysis.summary || asset.analysis.label || 'Teknik durum güncellendi') + '</span></li>').join('') + '</ul>' : '<p class="muted">Karşılaştırılabilir iki kayıt yok. Son durum ve veri zamanı piyasa incelemesinde gösterilir.</p>');
  el.querySelectorAll('[data-trace-symbol]').forEach((button) => button.addEventListener('click', () => navigateToAsset(button.dataset.traceMarket, button.dataset.traceSymbol)));
}

async function renderReport() {
  const el = $('#reportContent');
  const request = ++reportRequest;
  let data = null;
  let loadError = false;
  try { data = await loadReportCache(true); } catch (e) {
    if (request !== reportRequest || activeView !== 'report' || !el.isConnected) return;
    loadError = true;
    data = REPORT_CACHE ? checkedReport(REPORT_CACHE) : null;
    if (!data || !data.base) {
      el.innerHTML = '<div class="card"><p role="status">Rapor kaynağına erişilemedi.</p><button class="btn" id="reportRetryBtn" type="button">Tekrar dene</button></div>';
      const retry = $('#reportRetryBtn');
      if (retry) retry.addEventListener('click', () => renderReport(), { once: true });
      return;
    }
  }
  if (request !== reportRequest || activeView !== 'report' || !el.isConnected) return;
  const base = data && data.base;
  const integrity = data && data.integrity || {};
  const ai = integrity.usableResearch ? data.ai : null;
  if (!base) {
    el.innerHTML = '<div class="card reveal"><div class="rep-empty">Henüz rapor bulunamadı. Günlük veri ve rapor akışının tamamlanması bekleniyor.</div></div>';
    return;
  }
  const s = base.sentiment || {};
  const sc = s.label === 'Pozitif' ? 'sent-pos' : s.label === 'Nötr' ? 'sent-neu' : 'sent-cau';
  const aiBadge = ai ? '<span class="ai-badge">Model araştırması</span>' : '';

  let h = '';
  const reportTimestamp = integrity.analysisAsOf || base.generatedAt;
  h += '<header class="report-masthead"><div><h2>Rapor kesiti</h2><div class="report-meta"><span>' + esc(fullTimestamp(reportTimestamp)) + '</span><span>' + esc(String(s.total == null ? '–' : s.total)) + ' varlık</span><span>' + esc(String(s.buys == null ? '–' : s.buys)) + ' AL sinyali</span><span>' + esc(String(s.gainers == null ? '–' : s.gainers)) + ' yükselen</span></div></div><div class="report-badges">' + aiBadge + '<span class="sent-pill ' + sc + '">' + esc(s.label || 'Duyarlılık bilinmiyor') + ' · ' + esc(String(s.avg == null ? '–' : s.avg)) + '/100</span></div></header>' +
    FinansResearch.reportIntegrityHtml({ integrity, hasResearch: !!ai, partial: !!(base.quality && base.quality.status === 'partial'), loadError }) +
    FinansResearch.automationHtml(data.automation);
  h += '<nav class="report-toc" aria-label="Rapor bölümleri"><a href="#report-summary">Özet</a><a href="#report-developments">Gelişmeler</a><a href="#report-impact">Piyasa etkileri</a><a href="#report-calendar">Takvim</a><a href="#researchEvaluation">Tahmin sonuçları</a></nav>';
  h += '<section class="report-section" id="report-summary"><div class="report-reader-card"><div class="card-head"><h2>Özet</h2><span class="card-sub">Model yorumu ayrı okunur</span></div>' + (ai ? FinansResearch.modelContextHtml(integrity, true) : '') + '<p>' + FinansResearch.proseHtml(ai && ai.todayFocus ? ai.todayFocus : 'Teknik skor, piyasa genişliği ve takvimi birlikte değerlendirin.') + '</p></div>';
  h += '</section><section class="report-section" id="report-developments"><h2>Gelişmeler</h2>' +
    '<div id="marketNewsWorkspace" class="market-news-report" role="region" aria-label="Kaynaklı piyasa haberleri">Haber akışı yükleniyor…</div>';
  if (ai && ai.macroSummary) h += '<div class="report-reader-card"><div class="card-head"><h2>Makro görünüm</h2><span class="ai-badge">Yapay zeka yorumu</span></div><p class="rep-macro">' + FinansResearch.proseHtml(ai.macroSummary) + '</p></div>';
  h += FinansResearch.researchHtml(ai && ai.research) || '<div class="card"><p class="muted">Doğrulanmış araştırma gelişmesi henüz yok.</p></div>';
  h += '</section><section class="report-section" id="report-impact"><h2>Piyasa etkileri</h2>' + reportSignalOverlayHtml(base, integrity);

  // Yapay zeka makro + haber
  if (ai && Array.isArray(ai.worldNews) && ai.worldNews.length) {
    h += '<div class="card reveal"><div class="card-head"><h2>Dünya gelişmeleri</h2><span class="ai-badge">Yapay zeka</span></div>';
    if (Array.isArray(ai.worldNews) && ai.worldNews.length) {
      h += '<div class="rep-section"><h3>Öne çıkan gelişmeler</h3>' +
        ai.worldNews.map((n) => {
          const imp = (n.impact || '').toLowerCase();
          // "olumsuz" da "olum" içerir — önce olumsuz/negatifi kontrol et
          const cls = imp.includes('olums') || imp.includes('neg') ? 'imp-neg' : imp.includes('oluml') || imp.includes('pos') ? 'imp-pos' : 'imp-neutral';
          const lbl = cls === 'imp-neg' ? 'olumsuz' : cls === 'imp-pos' ? 'olumlu' : 'nötr';
          return '<div class="news-item"><span class="news-impact ' + cls + '">' + lbl + '</span><span>' + esc(n.title || '') + '</span></div>';
        }).join('') + '</div>';
    }
    h += '</div>';
  }

  // Haftalık Retro
  if (ai && ai.weeklyRetro) {
    h += '<div class="card reveal"><div class="card-head"><h2>Geçen Hafta Ne Dedik? (Haftalık Geri Bakış)</h2><span class="ai-badge">Yapay zeka</span></div>' +
      '<p class="rep-macro">' + esc(ai.weeklyRetro) + '</p></div>';
  }

  // Bu hafta: katalizör takvimi + finans direktörü senaryo analizi
  const calendarSection = '</section><section class="report-section" id="report-calendar">' + weeklyHtml(base, ai) + '</section>';

  // Fırsatlar
  if (base.opportunities && base.opportunities.length) {
    h += '<div class="card reveal"><div class="card-head"><h2>Bugünün Fırsatları</h2><span class="card-sub">en yüksek teknik puan</span></div>' +
      base.opportunities.map((o, i) =>
        '<div class="opp-row"><span class="rank">' + (i + 1) + '</span><div class="opp-meta"><div class="psym">' + esc(o.symbol) + ' <span class="pmkt">· ' + esc(o.market) + '</span></div><div class="opp-sum">' + esc(o.summary || '') + '</div></div><span class="badge tone-buy">' + esc(o.label) + ' · ' + esc(String(o.score == null ? '–' : o.score)) + '</span></div>'
      ).join('') + '</div>';
  }

  // Teknik sinyaller
  const sig = base.signals || {};
  const sigGroup = (title, arr, cls) => (arr && arr.length) ? '<div class="rep-section"><h3>' + title + '</h3><div class="chips">' + arr.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div></div>' : '';
  const anySig = ['overbought', 'oversold', 'goldenCross', 'deathCross', 'volumeSpike', 'strongMomentum'].some((k) => sig[k] && sig[k].length);
  if (anySig) {
    h += '<div class="card reveal"><div class="card-head"><h2>Teknik Sinyaller</h2></div>' +
      sigGroup('Güçlü momentum (MACD↑)', sig.strongMomentum) +
      sigGroup('Hacim patlaması', sig.volumeSpike) +
      sigGroup('Altın kesişim', sig.goldenCross) +
      sigGroup('Aşırı alım (RSI≥70)', sig.overbought) +
      sigGroup('Aşırı satım (RSI≤30)', sig.oversold) +
      sigGroup('Ölüm kesişimi', sig.deathCross) +
      '</div>';
  }

  // Yapay zeka pazar yorumu
  if (ai && ai.commentary) {
    const c = ai.commentary;
    h += '<div class="card reveal"><div class="card-head"><h2>Pazar Yorumu</h2><span class="ai-badge">Model görüşü</span></div>' + FinansResearch.modelContextHtml(integrity) + '<div class="commentary">' +
      (c.us ? '<div class="comm"><h4>ABD</h4><p>' + FinansResearch.proseHtml(c.us) + '</p></div>' : '') +
      (c.bist ? '<div class="comm"><h4>BIST</h4><p>' + FinansResearch.proseHtml(c.bist) + '</p></div>' : '') +
      (c.crypto ? '<div class="comm"><h4>Kripto</h4><p>' + FinansResearch.proseHtml(c.crypto) + '</p></div>' : '') +
      '</div></div>';
  }

  // Riskler
  if (base.risks && base.risks.length) {
    h += '<div class="card reveal"><div class="card-head"><h2>Dikkat / Riskler</h2></div><div class="chips">' +
      base.risks.map((r) => '<span class="chip"><b>' + esc(r.market) + ' ' + esc(r.symbol) + '</b> — ' + esc(r.reason) + '</span>').join('') + '</div></div>';
  }

  // Günün odağı özet bölümünde bir kez gösterilir; okuryazarlık ipucu bağımsız kalır.
  if (ai && ai.literacyTip) {
    h += '<div class="card reveal">';
    if (ai.literacyTip) h += '<div class="tip-card report-tip"><h4>' + esc(ai.literacyTip.title || 'Günün dersi') + '</h4><p>' + esc(ai.literacyTip.body || '') + '</p></div>';
    h += '</div>';
  }

  // Daily Quiz
  if (ai && ai.quiz) {
    const quizDate = /^\d{4}-\d{2}-\d{2}$/.test(String(base.date || '')) ? base.date : new Date().toISOString().slice(0, 10);
    const correctIndex = Number.isSafeInteger(ai.quiz.correctIndex) && ai.quiz.correctIndex >= 0 && Array.isArray(ai.quiz.options) && ai.quiz.correctIndex < ai.quiz.options.length ? ai.quiz.correctIndex : -1;
    const lastPlayed = localStorage.getItem('finans-quiz-last-played');
    const streak = parseInt(localStorage.getItem('finans-quiz-streak') || '0', 10);
    const hasPlayedToday = lastPlayed === quizDate;
    
    h += '<div class="card reveal report-quiz" id="quiz-card">';
    h += '<div class="card-head"><h2>Günün Finansal Akıl Yürütme Sorusu</h2><span class="ai-badge">Günlük Soru</span></div>';
    h += '<p style="font-weight: 600; margin-bottom: 12px; font-size: 14px;">' + esc(ai.quiz.question) + '</p>';
    
    if (hasPlayedToday) {
      const selectedIndex = parseInt(localStorage.getItem('finans-quiz-last-selected') || '0', 10);
      h += '<div class="quiz-options">';
      ai.quiz.options.forEach((opt, idx) => {
        const isCorrect = idx === correctIndex;
        const isSelected = idx === selectedIndex;
        let borderStyle = 'border: 1px solid var(--border);';
        let bgStyle = '';
        let icon = '';
        if (isCorrect) {
          borderStyle = 'border: 1px solid var(--green);';
          bgStyle = 'background: rgba(5, 150, 105, 0.1);';
          icon = '🟢 ';
        } else if (isSelected) {
          borderStyle = 'border: 1px solid var(--red);';
          bgStyle = 'background: rgba(220, 38, 38, 0.1);';
          icon = '🔴 ';
        }
        h += '<div style="padding: 10px 14px; border-radius: 6px; font-size: 13px; ' + borderStyle + ' ' + bgStyle + '">' + icon + esc(opt) + '</div>';
      });
      h += '</div>';
      h += '<div class="quiz-result">';
      h += '<b class="' + (selectedIndex === correctIndex ? 'quiz-correct' : 'quiz-incorrect') + '">' + (selectedIndex === correctIndex ? 'Tebrikler! Doğru cevap.' : 'Yanlış cevap.') + '</b>';
      h += '<p>' + esc(ai.quiz.explanation) + '</p>';
      h += '</div>';
      h += '<div class="quiz-streak">Mevcut seri skoru: ' + streak + ' gün</div>';
    } else {
      h += '<div class="quiz-options" id="quiz-options-container">';
      ai.quiz.options.forEach((opt, idx) => {
        h += '<button class="btn quiz-option" type="button" onclick="submitQuizAnswer(' + idx + ', ' + ai.quiz.correctIndex + ', \'' + quizDate + '\')">' + esc(opt) + '</button>';
      });
      h += '</div>';
      h += '<div id="quiz-streak-display" class="quiz-streak">Seri skoru: ' + streak + ' gün</div>';
    }
    h += '</div>';
  }

  h += calendarSection;
  h += '<section class="report-section" id="report-evaluation"><section class="card research-card" id="researchEvaluation" aria-live="polite">Tahmin ölçümleri yükleniyor…</section></section>';
  h += '<details class="report-extras"><summary>Ek analizler</summary><div class="card"><p class="muted">Üretim: ' + (ai ? 'kural-tabanlı teknik + yapay zeka makro/haber katmanı' : 'kural-tabanlı teknik (yapay zeka katmanı bekleniyor)') + ' · ' + relTime(base.generatedAt) + '. <b>Yatırım tavsiyesi değildir.</b></p></div></details>';

  const sourceRecords = ai && ai.research && Array.isArray(ai.research.sources) ? ai.research.sources : [];
  const sourceRows = sourceRecords.map((source) => {
    const title = source && source.title ? String(source.title) : 'Kaynak';
    const published = FinansResearch.sourcePublicationText(source && source.publishedAt);
    let titleHtml = esc(title);
    try {
      const url = new URL(source && source.url);
      if (['https:', 'http:'].includes(url.protocol)) {
        titleHtml = '<a href="' + esc(url.href).replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '</a>';
      }
    } catch (_) { /* keep the title and truthful unknown publication state */ }
    return '<li><span class="source-ledger-title">' + titleHtml + '</span><span>' + esc(published) + '</span></li>';
  }).join('');
  const sourceLedgerMessage = sourceRecords.length ? '' : '<p class="muted">Bu raporla eşleşen doğrulanmış araştırma kaynağı yok.</p>';
  const sourceRail = '<aside class="report-source-rail" aria-label="Rapor kaynakları"><details class="source-ledger" open><summary>Kaynak defteri <span class="source-ledger-count">' + sourceRecords.length + ' kayıt</span></summary><p class="source-ledger-footnote">Yayın saatleri İstanbul (UTC+3).</p>' + sourceLedgerMessage + (sourceRecords.length ? '<ul>' + sourceRows + '</ul>' : '') + '</details></aside>';
  el.innerHTML = '<div class="report-layout"><article class="report-reading-flow">' + h + '</article>' + sourceRail + '</div>';
  el.querySelectorAll('[data-open-model-workspace]').forEach((button) => button.addEventListener('click', () => { setView('overview'); activateOverviewTask('forecasts', true); }));
  if (window.FinansMacro && typeof window.FinansMacro.refresh === 'function') window.FinansMacro.refresh();
  el.querySelectorAll('.report-toc a').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); const target = el.querySelector(link.getAttribute('href')); if (target) { target.tabIndex = -1; target.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' }); target.focus({ preventScroll: true }); } }));
  FinansResearch.loadEvaluation($('#researchEvaluation'));
  triggerRevealAnimations(el);
}
function esc(t) { return String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function flag(c) { return { US: '🇺🇸', CN: '🇨🇳', JP: '🇯🇵', DE: '🇩🇪', GB: '🇬🇧', EU: '🇪🇺', EA: '🇪🇺', TR: '🇹🇷', FR: '🇫🇷' }[c] || c; }

// Bu haftanın katalizör takvimi + finans direktörü senaryo analizi (base = deterministik, ai = yorum)
function reportSignalOverlayHtml(base, integrity) {
  if (!FinansResearch.canUseReportOverlay(integrity)) return '';
  const overlay = base && base.signalOverlay;
  if (!overlay || !overlay.assets) return '';
  const summary = overlay.summary || {};
  const rows = Object.values(overlay.assets)
    .filter((x) => x.totalAdjustment !== 0)
    .sort((a, b) => Math.abs(b.totalAdjustment) - Math.abs(a.totalAdjustment))
    .slice(0, 5)
    .map((x) => {
      const cls = x.totalAdjustment > 0 ? 'pos' : 'neg';
      return '<div class="overlay-row report-overlay-row">' +
        '<span><b>' + esc(x.symbol) + '</b><small>Teknik ' + x.technicalScore + ' -> Makro ' + x.adjustedScore + ' · ' + esc(overlayStatusLabel(x.status)) + '</small></span>' +
        '<em class="overlay-adj oa-' + cls + '">' + adjustmentLabel(x.totalAdjustment) + '</em>' +
      '</div>';
    }).join('');
  return '<div class="card reveal signal-overlay-card">' +
    '<div class="card-head"><h2>Makro Sinyal Katmani</h2><span class="card-sub">AL/SAT degil; teknik skora sinirli makro/katalizor katmani</span></div>' +
    '<div class="overlay-summary">' +
      '<div><b>' + (summary.boosted || 0) + '</b><span>Destek</span></div>' +
      '<div><b>' + (summary.reduced || 0) + '</b><span>Baski</span></div>' +
      '<div><b>' + (summary.highPressure || 0) + '</b><span>Katalizor</span></div>' +
      '<div><b>' + (summary.stale || 0) + '</b><span>Suresi dolan</span></div>' +
    '</div>' +
    '<div class="overlay-rows">' + (rows || '<p class="muted compact">Aktif overlay etkisi yok.</p>') + '</div>' +
  '</div>';
}

function weeklyHtml(base, ai) {
  const cal = base.calendar || {};
  const wo = (ai && ai.weeklyOutlook) || null;
  const econ = cal.economic || [];
  const earn = cal.earnings || [];
  const news = cal.companyNews || [];
  if (!wo && !econ.length && !earn.length && !news.length && !cal.coverage) return '';

  let h = '<div class="card reveal"><div class="card-head"><h2>Bu Hafta: Veri &amp; Katalizör Takvimi</h2>' + (wo ? '<span class="ai-badge">Yapay zeka · finans direktörü senaryosu</span>' : '') + '</div>';
  if (cal.coverage) {
    const labels = { economic: 'Ekonomik takvim', earnings: 'Bilançolar', companyNews: 'Şirket haberleri' };
    const states = { available: 'Alındı', partial: 'Kısmi veri', unavailable: 'Kaynağa erişilemedi', empty: 'Kaynak döndü, olay bulunamadı' };
    h += '<div role="status">' + Object.keys(labels).map((key) => {
      const coverage = cal.coverage[key] || {};
      return '<p>' + labels[key] + ': ' + esc(states[coverage.status] || 'Doğrulanamadı') + ' · ' + (Number(coverage.count) || 0) + ' kayıt</p>';
    }).join('') + '</div>';
  }

  if (wo && wo.cfoSummary) h += '<div class="tip-card report-tip"><h4>Finans Direktörü Bakışı: Haftanın Sentezi</h4><p>' + esc(wo.cfoSummary) + '</p></div>';

  // Senaryo kartları
  if (wo && Array.isArray(wo.events) && wo.events.length) {
    h += '<div class="rep-section"><h3>Veri beklentileri ve senaryo analizi</h3><div class="scenarios">';
    wo.events.forEach((ev) => {
      h += '<div class="scenario"><div class="sc-head"><span class="sc-event">' + esc(ev.event || '') + (ev.importance === 'high' ? ' <span class="news-impact imp-neg">yüksek etki</span>' : '') + '</span><span class="sc-date">' + esc(ev.date || '') + '</span></div>' +
        (ev.consensus ? '<div class="sc-row"><span class="sc-lbl">Beklenti</span><span>' + esc(ev.consensus) + '</span></div>' : '') +
        (ev.myCall ? '<div class="sc-row"><span class="sc-lbl sc-my">Öngörüm</span><span>' + esc(ev.myCall) + '</span></div>' : '') +
        (ev.reasoning ? '<div class="sc-reason">' + esc(ev.reasoning) + '</div>' : '') +
        '<div class="sc-scen">' +
        (ev.ifLower ? '<div class="sc-low"><b>↓ Düşük gelirse:</b> ' + esc(ev.ifLower) + '</div>' : '') +
        (ev.ifHigher ? '<div class="sc-high"><b>↑ Yüksek gelirse:</b> ' + esc(ev.ifHigher) + '</div>' : '') +
        '</div>' +
        (Array.isArray(ev.affected) && ev.affected.length ? '<div class="sc-affected">Etkilenen: ' + ev.affected.map((a) => '<span class="chip">' + esc(a) + '</span>').join(' ') + '</div>' : '') +
        '</div>';
    });
    h += '</div></div>';
  }

  // Ham ekonomik takvim (gün gün)
  if (econ.length) {
    h += '<div class="rep-section"><h3>Ekonomik takvim · ' + esc(cal.weekFrom || '') + ' → ' + esc(cal.weekTo || '') + '</h3><div class="cal-list">';
    const byDate = {};
    econ.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    Object.keys(byDate).sort().forEach((d) => {
      h += '<div class="cal-day"><div class="cal-date">' + d + '</div>';
      byDate[d].forEach((e) => {
        h += '<div class="cal-ev"><span class="cal-flag">' + flag(e.country) + '</span><span class="cal-name">' + esc(e.event) + '</span>' +
          '<span class="cal-num">bekl. ' + (e.estimate != null ? esc(String(e.estimate)) : '–') + ' · önc. ' + (e.prev != null ? esc(String(e.prev)) : '–') + '</span>' +
          (e.impact === 'high' ? '<span class="news-impact imp-neg">yüksek</span>' : '') + '</div>';
      });
      h += '</div>';
    });
    h += '</div></div>';
  }

  // Bilanço takvimi
  if (earn.length) {
    const wlEarn = earn.filter((e) => e.watch);
    h += '<div class="rep-section"><h3>Bilanço takvimi</h3>';
    if (wlEarn.length) h += '<p class="muted report-calendar-note">⭐ Takip listenizden: ' + wlEarn.map((e) => '<b>' + esc(e.symbol) + '</b> (' + esc(e.date) + ')').join(', ') + '</p>';
    else h += '<p class="muted report-calendar-note">Bu hafta takip listenizden bilanço açıklayan yok.</p>';
    if (wo && wo.earningsFocus) h += '<p class="rep-macro report-calendar-note">' + esc(wo.earningsFocus) + '</p>';
    const earningsRows = (items) => items.map((e) => '<span class="chip' + (e.watch ? ' chip-watch' : '') + '">' + esc(e.symbol) + ' · ' + esc(fullDate(e.date)) + (e.epsEstimate != null ? ' · HBK ' + esc(String(e.epsEstimate)) : '') + '</span>').join('');
    h += '<div class="chips">' + earningsRows(earn.slice(0,14)) + '</div>' + (earn.length > 14 ? '<details><summary>Diğer ' + (earn.length - 14) + ' bilanço kaydını göster</summary><div class="chips">' + earningsRows(earn.slice(14)) + '</div></details>' : '') + '</div>';
  }

  // Şirket haber akışı
  if (news.length) {
    h += '<div class="rep-section"><h3>Şirket haber akışı</h3>' + news.map((n) => {
      let href = ''; try { const url = new URL(n.url); if (['https:', 'http:'].includes(url.protocol)) href = url.href; } catch (_) {}
      return '<details class="news-source-details"><summary><span class="news-impact imp-neutral">' + esc(n.symbol) + '</span> ' + esc(n.headline || '') + '</summary><p class="muted">' + esc(n.source || 'Kaynak belirtilmedi') + ' · ' + esc(fullTimestamp(n.publishedAt || n.datetime)) + '</p>' + (href ? '<a href="' + esc(href).replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer">Haberi kaynağında oku</a>' : '<p class="muted">Kaynak bağlantısı yok.</p>') + '</details>';
    }).join('') + '</div>';
  }

  if (wo && wo.positioning) h += '<div class="tip-card report-tip"><h4>Pozisyon Disiplini</h4><p>' + esc(wo.positioning) + '</p></div>';

  h += '</div>';
  return h;
}

/* ---------- Yardımcılar ---------- */
function allScored() {
  const tag = (arr, m) => (arr || []).filter((x) => x.analysis && x.analysis.score != null).map((x) => ({ market: m, ...x }));
  return [...tag(DATA.us, 'ABD'), ...tag(DATA.bist, 'BIST'), ...tag(DATA.crypto, 'Kripto')];
}
function currentList() {
  const map = { us: DATA.us, bist: DATA.bist, crypto: DATA.crypto };
  const state = marketUi[activeView] || { query: '', sort: sortBy };
  const query = state.query.trim().toLocaleLowerCase('tr-TR');
  let list = (map[activeView] || []).filter((x) => !x.__error && (x.analysis || Number.isFinite(x.price)));
  if (query) list = list.filter((x) => (x.symbol + ' ' + (x.name || '')).toLocaleLowerCase('tr-TR').includes(query));
  return list.slice().sort((a, b) => {
    if (state.sort === 'name') return (a.name || '').localeCompare(b.name || '');
    if (state.sort === 'changePct') return (Number.isFinite(b.changePct) ? b.changePct : -Infinity) - (Number.isFinite(a.changePct) ? a.changePct : -Infinity);
    if (state.sort === 'rsi') return (Number.isFinite(b.ind && b.ind.rsi) ? b.ind.rsi : -Infinity) - (Number.isFinite(a.ind && a.ind.rsi) ? a.ind.rsi : -Infinity);
    const scoreA = Number.isFinite(a.analysis && a.analysis.score) ? a.analysis.score : -Infinity;
    const scoreB = Number.isFinite(b.analysis && b.analysis.score) ? b.analysis.score : -Infinity;
    return scoreA === scoreB ? 0 : scoreB - scoreA;
  });
}

/* ---------- Genel bakış ---------- */
async function renderOverviewBriefing() {
  const el = $('#overviewBriefing');
  if (!el) return;
  const request = ++briefingRequest;
  let base = null;
  let ai = null;
  let report = null;
  try {
    report = await loadReportCache();
    base = report && report.base;
    ai = report && report.ai;
    const status = $('#overviewWorkspaceStatus');
    if (status && report && report.automation) status.textContent += ' · ' + FinansResearch.automationStatusSummary(report.automation);
  } catch (_) {
    base = null;
    ai = null;
  }
  if (request !== briefingRequest || activeView !== 'overview' || !el.isConnected) return;

  const matchesSnapshot = base && window.FinansReportIntegrity.assess(base, ai, DATA).baseStatus === 'current';
  const s = matchesSnapshot && base.sentiment ? base.sentiment : null;
  const overlaySummary = report && FinansResearch.canUseReportOverlay(report.integrity) && base && base.signalOverlay && base.signalOverlay.summary ? base.signalOverlay.summary : {};
  const macro = ai && ai.macroSummary
    ? ai.macroSummary
    : 'Rapor katmani henuz hazir degil; ilk okuma icin teknik ozet ve piyasa skorlarini kullan.';
  const focus = ai && ai.todayFocus
    ? ai.todayFocus
    : 'Bugun once raporu oku, sonra sadece skor degisimi olan varliklara in.';
  const research = ai && ai.research;
  const sourceMap = new Map(((research && research.sources) || []).map((source) => [source.id, source]));
  const events = ((research && research.events) || []).slice(0, 3);
  const eventsHtml = events.length ? events.map((event) => {
    const source = sourceMap.get((event.sourceIds || [])[0]);
    const publishedAt = source && source.publishedAt ? fullTimestamp(source.publishedAt) : 'Yayın zamanı doğrulanamadı';
    const market = { us: 'ABD', bist: 'BIST', crypto: 'Kripto' }[event.market] || event.market || 'Piyasa';
    return '<article class="briefing-event"><div class="briefing-event-meta">' + esc(market) + ' · ' + esc(publishedAt) + '</div><h3>' + esc(event.title || 'Gelişme') + '</h3><p>' + esc(event.whatChanged || 'Değişim açıklaması yok') + '</p></article>';
  }).join('') : '<p class="muted">Doğrulanmış araştırma olayı henüz yok.</p>';
  const digest = window.FinansActionLayer && window.FinansActionLayer.buildDailyChangeDigest ? window.FinansActionLayer.buildDailyChangeDigest(DATA) : null;
  const signalDelta = new Map([].concat(digest && digest.improving || [], digest && digest.weakening || []).map((item) => [item.market + ':' + item.symbol, item.delta]));
  const pulses = ['us', 'bist', 'crypto'].map((market) => {
    const list = (DATA[market] || []).filter((asset) => typeof asset.changePct === 'number');
    const up = list.filter((asset) => asset.changePct > 0).length;
    const changed = (DATA[market] || []).filter((asset) => signalDelta.has(market + ':' + asset.symbol)).length;
    return '<button class="market-pulse-row" type="button" onclick="setView(\'' + market + '\')"><span>' + ({ us: 'ABD', bist: 'BIST', crypto: 'Kripto' }[market]) + '</span><b>' + (list.length ? up + '/' + list.length + ' yükselen' + (changed ? ' · ' + changed + ' sinyal değişti' : '') : 'Veri yok · genişlik hesaplanamadı') + '</b></button>';
  }).join('');
  const calendarData = ((base || {}).calendar || {});
  const anchor = String((base && (base.generatedAt || base.snapshotId || base.date)) || new Date().toISOString()).slice(0, 10);
  const calendar = [].concat(calendarData.economic || [], calendarData.earnings || []).filter((event) => event.date && event.date.slice(0, 10) >= anchor).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 3);
  const coverage = calendarData.coverage;
  const calendarStatus = coverage && Object.values(coverage).some((item) => item && item.status === 'unavailable') ? 'Takvim kaynaklarının bir kısmına erişilemedi.' : coverage ? 'Yaklaşan doğrulanmış takvim olayı yok.' : 'Takvim kapsamı doğrulanamadı.';
  const calendarHtml = '<div class="briefing-calendar"><h3>Sırada ne var?</h3>' + (calendar.length ? calendar.map((event) => '<p><time datetime="' + esc(event.date) + '">' + esc(fullDate(event.date)) + '</time> · ' + esc(event.event || event.headline || event.symbol || '') + '</p>').join('') : '<p class="muted">' + calendarStatus + '</p>') + '</div>';
  const sentiment = s ? s.label + ' / ' + s.avg + '/100' : 'Rapor anlık görüntüyle eşleşmiyor';
  const breadth = s ? s.gainers + ' yukselen / ' + s.total + ' varlik' : 'Canlı veri genişliği aşağıda';
  const pressure = overlaySummary.withEvidence > 0 ? (overlaySummary.reduced || 0) + ' baski, ' + (overlaySummary.boosted || 0) + ' destek' : 'Güncel kanıt yok';

  el.innerHTML = '<section class="briefing-layout">' +
    '<div class="brief-main">' +
      '<h2>Bugün ne değişti?</h2>' +
      '<div class="briefing-events">' + eventsHtml + '</div>' +
      '<div class="briefing-context"><b>Neden önemli? / Model yorumu</b><p>' + esc(macro) + '</p></div>' +
      '<div class="brief-actions">' +
        '<button class="btn" type="button" onclick="setView(\'report\')">Gunluk raporu oku</button>' +
        '<button class="btn btn-secondary" type="button" onclick="setView(\'portfolio\')">Portfoyu kontrol et</button>' +
      '</div>' +
    '</div>' +
    '<div class="brief-side">' +
      '<div class="briefing-context"><b>Rapor durumu</b><p>' + esc(sentiment) + ' · ' + esc(breadth) + ' · ' + esc(pressure) + '</p></div>' +
      '<div class="market-pulse-list">' + pulses + '</div>' + calendarHtml +
      '<div class="brief-focus"><b>Takip notu</b><span>' + esc(focus) + '</span></div>' +
    '</div>' +
  '</section>';
}

function renderKpis() {
  const all = allScored();
  const avg = all.length ? Math.round(all.reduce((a, x) => a + x.analysis.score, 0) / all.length) : 0;
  const buys = all.filter((x) => x.analysis.tone === 'strong-buy' || x.analysis.tone === 'buy').length;
  const gainers = all.filter((x) => typeof x.changePct === 'number' && x.changePct > 0).length;
  const sentiment = avg >= 60 ? 'Pozitif' : avg >= 45 ? 'Nötr' : 'Temkinli';
  const c = DATA.counts || {};
  const cards = [
    { label: 'Takip Edilen Varlık', num: all.length, sub: (c.us || 0) + ' ABD · ' + (c.bist || 0) + ' BIST · ' + ((DATA.crypto || []).length ? c.crypto + ' kripto' : 'kripto verisi yok') },
    { label: 'Ortalama Teknik Puan', num: avg, sub: '100 üzerinden' },
    { label: 'Genel Piyasa Hissi', text: sentiment, sub: 'ortalama puana göre' },
    { label: 'Teknik AL sinyali', num: buys, sub: 'teknik puan etiketine göre; işlem hazırlığı değildir' },
    { label: 'Bugün Yükselen', num: gainers, suf: ' / ' + all.length, sub: 'pozitif günlük değişim' },
  ];
  $('#kpis').innerHTML = cards
    .map((k) =>
      '<div class="kpi"><div class="label">' + esc(k.label) + '</div><div class="value">' +
      (k.text != null ? esc(k.text) : '<span class="cv" data-count="' + k.num + '">0</span>' + (k.suf || '')) +
      '</div><details class="kpi-help"><summary aria-label="Açıklama: ' + esc(k.label) + '">?</summary><p>' + esc(k.sub) + '</p></details></div>'
    )
    .join('');
  document.querySelectorAll('#kpis .cv').forEach((el) => countUp(el, +el.dataset.count));
}

function renderOverviewPortfolioSummary() {
  const el = $('#overviewPortfolioSummary');
  const status = $('#overviewWorkspaceStatus');
  if (!el) return;
  const holdings = portfolioData
    ? ['us', 'bist', 'crypto'].reduce((count, market) => count + ((portfolioData[market] || []).length), 0)
    : null;
  const stateCopy = portfolioState === 'loading'
    ? 'Portföy durumu yükleniyor'
    : portfolioState === 'unavailable'
      ? 'Portföy verisine erişilemedi'
      : portfolioState === 'stale'
        ? 'Son başarılı portföy verisi gösteriliyor'
        : holdings === 0 ? 'Portföy boş' : holdings + ' açık pozisyon';
  if (status) status.textContent = stateCopy + ' · Piyasa verisi: ' + fullTimestamp(DATA && DATA.generatedAt);
  const detail = holdings == null
    ? 'Bakiye ve risk görünümü, portföy kaynağı erişilebilir olduğunda açılır.'
    : holdings === 0
      ? 'Henüz kayıtlı pozisyon yok. Varlık ekleyerek portföy görünümünü başlatın.'
      : holdings + ' pozisyon kayıtlı. Değer, risk planı ve uyarılar portföy sayfasında ayrıntılıdır.';
  let portfolioBand = '';
  if (portfolioData && holdings > 0) {
    const fx = DATA.fx && DATA.fx.usdtry ? DATA.fx.usdtry : 38;
    let unpricedCount = 0; let valueUsd = 0; let pnlUsd = 0; let maxWeight = 0; let cryptoUsd = 0;
    ['us', 'bist', 'crypto'].forEach((market) => (portfolioData[market] || []).forEach((h) => {
      const asset = (DATA[market] || []).find((x) => x.symbol === h.symbol); if (!asset || !(asset.price > 0)) { unpricedCount += 1; return; }
      const value = Number(h.amount) * Number(asset.price || 0); const pnl = value - Number(h.amount) * Number(h.avgPrice || 0); const usdValue = market === 'bist' ? value / fx : value; const usdPnl = market === 'bist' ? pnl / fx : pnl;
      valueUsd += usdValue; pnlUsd += usdPnl; if (market === 'crypto') cryptoUsd += usdValue;
    }));
    maxWeight = valueUsd > 0 ? Math.max(...['us', 'bist', 'crypto'].flatMap((market) => (portfolioData[market] || []).map((h) => { const a = (DATA[market] || []).find((x) => x.symbol === h.symbol); const v = a ? Number(h.amount) * Number(a.price || 0) / (market === 'bist' ? fx : 1) : 0; return v / valueUsd * 100; })), 0) : 0;
    const risk = unpricedCount ? 'Eksik fiyat · risk hesaplanamadı' : maxWeight >= 50 || (valueUsd > 0 && cryptoUsd / valueUsd * 100 > 50) ? 'Yoğunlaşma / risk kısıtı' : 'Dağılım izleniyor';
    portfolioBand = '<div class="desk-summary-band"><div><span>Değer</span><b>$' + fmtNum(valueUsd, 0) + '</b></div><div><span>Kâr / zarar</span><b class="' + (pnlUsd >= 0 ? 'pos' : 'neg') + '">' + fmtPrice(pnlUsd, 'USD') + '</b></div><div><span>Pozisyon</span><b>' + holdings + '</b></div><div><span>Risk</span><b>' + esc(risk) + ' · %' + fmtNum(maxWeight, 1) + (unpricedCount ? ' · yalnız fiyatlı pozisyonlar' : ' max') + '</b></div></div>';
  }
  el.innerHTML = '<section class="card reveal portfolio-summary-grid' + (portfolioBand ? '' : ' is-empty') + '">' +
    '<div class="portfolio-band-title"><h2>Portföy durumu</h2><span class="card-sub">' + esc(stateCopy) + '</span></div>' + portfolioBand + (!portfolioBand ? '<p>' + esc(detail) + '</p>' : '') +
    '<div class="portfolio-summary-actions">' +
      '<button class="btn" type="button" onclick="setView(\'portfolio\')">Portföyü aç</button>' +
      '<button class="btn btn-secondary" type="button" onclick="setView(\'screener\')">Sinyalleri tara</button>' +
    '</div>' +
  '</section>';
}

function renderPicks() {
  const picks = DATA.topPicks || [];
  $('#topPicks').innerHTML =
    picks
      .map((p, i) => {
        const source = findPickAsset(p);
        const mini = source ? decisionMini(source.decision) : '';
        return '<div class="pick"><div class="rank">' + (i + 1) + '</div>' +
        '<div class="pmeta"><div class="psym">' + p.symbol + ' <span class="pmkt">· ' + p.market + '</span></div>' +
        '<div class="pname">' + (p.name || '') + ' — ' + fmtPrice(p.price, p.currency) + '</div></div>' +
        mini + '<span class="badge tone-' + p.tone + '">' + p.label + ' · ' + p.score + '</span></div>';
      })
      .join('') || '<p class="muted">Henüz veri yok.</p>';
}

/* ---------- Yönetici Özeti / Risk Panosu ---------- */
function renderExecSummary() {
  const el = $('#execSummary');
  if (!el) return;
  if (!window.FinansInsights || !window.FinansInsights.buildExecutiveSummary) { el.innerHTML = ''; return; }
  const overlay = getReportSignalOverlay();
  const macroAvailable = !!overlay && ['us', 'bist', 'crypto'].every((m) => overlay.market[m] && overlay.market[m].status === 'available');
  const s = window.FinansInsights.buildExecutiveSummary(DATA, { macroAvailable });
  if (!s) { el.innerHTML = ''; return; }
  const tone = s.riskLevel.tone;
  el.innerHTML = '<div class="card reveal exec-card exec-' + tone + '">' +
    '<div class="exec-head"><h2>Yönetici Özeti</h2>' +
      '<span class="exec-risk er-' + tone + '">Risk: ' + esc(s.riskLevel.label) + '</span></div>' +
    '<p class="exec-headline">' + esc(s.headline) + '</p>' +
    '<ol class="exec-actions">' + s.actions.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ol>' +
  '</div>';
}

/* ---------- Piyasa Rejimi (piyasa-seviye) ---------- */
function renderMarketRegime() {
  const el = $('#marketRegime');
  if (!el) return;
  const mr = DATA && DATA.marketRegime;
  if (!mr) { el.innerHTML = '<p class="muted">Piyasa rejimi verisi henüz yok (sonraki güncellemede gelir).</p>'; return; }
  const TONE = { calm: 'pos', normal: '', stress: 'warn', panic: 'neg', 'long-ok': 'pos', cash: 'neg', coupled: '', decoupled: 'pos', mixed: '' };
  const tile = (flag, name, r) => {
    if (!r) return '<div class="regime-tile"><div class="rt-head"><span class="rt-mkt">' + flag + ' ' + name + '</span></div><p class="rt-advice muted">Veri yok</p></div>';
    const t = TONE[r.type] || '';
    return '<div class="regime-tile rt-' + t + '">' +
      '<div class="rt-head"><span class="rt-mkt">' + flag + ' ' + name + '</span><span class="rt-badge rt-' + t + '">' + esc(r.label) + '</span></div>' +
      '<div class="rt-metric">' + esc(r.metric) + ': <b>' + r.value + '</b></div>' +
      '<p class="rt-advice">' + esc(r.advice) + '</p>' +
    '</div>';
  };
  el.innerHTML = tile('🇺🇸', 'ABD', mr.us) + tile('₿', 'Kripto', mr.crypto) + tile('🇹🇷', 'BIST', mr.bist);
}

/* ---------- Chart renk paleti — marka aksanları (gri yerine kısıtlı, uyumlu renk) ---------- */
const CHART = {
  accent: '#6f9bff',   // marka indigo-mavi (ana seri)
  green:  '#3ddc97',   // yeşil (pozitif/optimistik)
  red:    '#f6766f',   // mercan kırmızı (negatif/pessimistik) — alarm tonu değil
  amber:  '#ecb45a',
  orange: '#f0925a',
  violet: '#a78bfa',
  teal:   '#34d4c4',
  axis:   '#8a92a0',
  grid:   'rgba(255,255,255,0.045)',
  neutral:'#5a6472',   // nötr ikincil (al-tut, medyan referans)
  toneColor(tone) {
    return ({ 'strong-buy': '#3ddc97', buy: '#57d3a4', hold: '#ecb45a', reduce: '#f0925a', sell: '#f6766f' })[tone] || '#6f9bff';
  },
};
// Smooth alan dolgusu için dikey gradient (renk → şeffaf)
function chartGradient(canvas, hex, alpha) {
  try {
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
    const r = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    g.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  } catch (_) { return 'rgba(111,155,255,0.10)'; }
}

function chartLabelColor() {
  // Lightweight Charts parses sRGB colors; CSS OKLCH tokens must be resolved first.
  return chartCssColor('--muted');
}

function renderChartDataTable(canvas, caption, headers, rows) {
  if (!canvas) return;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', caption + '. Değerler hemen sonraki açılır tabloda okunabilir.');
  const anchor = canvas.closest('.chart-box') || canvas;
  if (!anchor.parentElement) return;
  let details = document.getElementById(canvas.id + '-data-table');
  if (!details) {
    details = document.createElement('details');
    details.id = canvas.id + '-data-table';
    details.className = 'chart-data-table';
    anchor.parentElement.insertBefore(details, anchor.nextSibling);
  }
  details.innerHTML = '<summary>Grafik değerlerini tablo olarak oku</summary><div class="table-wrap"><table><caption>' + esc(caption) + '</caption><thead><tr>' +
    headers.map((header) => '<th scope="col">' + esc(header) + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map((row) => '<tr>' + row.map((value, index) => '<' + (index === 0 ? 'th scope="row"' : 'td') + '>' + esc(value == null ? '–' : value) + '</' + (index === 0 ? 'th' : 'td') + '>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '">Gösterilecek grafik verisi yok.</td></tr>') +
    '</tbody></table></div>';
}

function renderAlloc() {
  const alloc = (DATA.allocation || []).filter((a) => a.weight > 0);
  if (allocChart) allocChart.destroy();
  renderChartDataTable($('#allocChart'), 'Önerilen varlık dağılımı', ['Varlık grubu', 'Ağırlık (%)'], alloc.map((a) => [a.label, fmtNum(a.weight, 2)]));
  if (!window.Chart || !alloc.length) return;
  allocChart = new Chart($('#allocChart'), {
    type: 'doughnut',
    data: { labels: alloc.map((a) => a.label), datasets: [{ data: alloc.map((a) => a.weight), backgroundColor: [CHART.accent, CHART.teal, CHART.violet, CHART.amber, CHART.green, CHART.orange], borderColor: '#12151b', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 700 }, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: chartLabelColor(), boxWidth: 12, font: { size: 12, family: 'Plus Jakarta Sans' } } }, tooltip: { callbacks: { label: (x) => x.label + ': %' + x.raw } } } },
  });
}

function renderMovers() {
  const all = allScored().slice().sort((a, b) => b.analysis.score - a.analysis.score).slice(0, 12);
  if (moversChart) moversChart.destroy();
  renderChartDataTable($('#moversChart'), 'En yüksek puanlı 12 varlık', ['Varlık', 'Piyasa', 'Puan'], all.map((x) => [x.symbol, marketShortLabel(x.market), x.analysis.score]));
  if (!window.Chart || !all.length) return;
  moversChart = new Chart($('#moversChart'), {
    type: 'bar',
    data: { labels: all.map((x) => x.symbol), datasets: [{ data: all.map((x) => x.analysis.score), backgroundColor: all.map((x) => CHART.toneColor(x.analysis.tone)), hoverBackgroundColor: 'rgba(255,255,255,.22)', borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 750, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => { const a = all[x.dataIndex]; return a.market + ' · puan ' + x.raw + ' — ' + a.analysis.label; } } } },
      scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255, 255, 255, 0.02)' }, ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } } }, x: { grid: { display: false }, ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } } } },
    },
  });
}

/* ---------- Döviz Kurları Widget ---------- */
function renderFxWidget() {
  const container = $('#fxWidget');
  if (!container) return;

  const fx = DATA && DATA.fx;
  if (!fx || !fx.rates || Object.keys(fx.rates).length === 0) {
    container.innerHTML = '<p class="muted" style="padding:12px;">Döviz kuru verisi henüz yok.</p>';
    return;
  }

  const pairs = ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'EUR/USD'];
  const html = pairs.map(label => {
    const r = fx.rates[label];
    if (!r) return '';
    const chg = r.changePct;
    const chgCls = chg == null ? '' : chg >= 0 ? 'pos' : 'neg';
    const chgStr = chg == null ? '–' : (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    const spark = r.closes && r.closes.length >= 2 ? sparkFx(r.closes) : '';
    const age = r.quoteTime ? relTime(r.quoteTime) : '';
    return `
      <div class="fx-card">
        <div class="fx-pair">${label}</div>
        <div class="fx-rate">${r.price != null ? r.price.toFixed(4) : '–'}</div>
        <div class="fx-chg ${chgCls}">${chgStr}</div>
        ${spark}
        ${age ? `<div class="fx-age">${age}</div>` : ''}
      </div>`;
  }).join('');

  container.innerHTML = html || '<p class="muted">Kur verisi yükleniyor...</p>';
}

function sparkFx(closes) {
  if (!closes || closes.length < 2) return '';
  const w = 120, h = 32, pad = 2;
  const min = Math.min(...closes), max = Math.max(...closes), rng = max - min || 1;
  const pts = closes.map((v, i) =>
    (pad + (i / (closes.length - 1)) * (w - 2 * pad)).toFixed(1) + ',' +
    (h - pad - ((v - min) / rng) * (h - 2 * pad)).toFixed(1)
  ).join(' ');
  const col = closes[closes.length - 1] >= closes[0] ? '#28d793' : '#f87171';
  return `<svg class="fx-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
}

function renderMarketStatus() {
  const m = DATA.market || {};
  const missingMarket = !Array.isArray(DATA[activeView]) || DATA[activeView].length === 0;
  const asOf = { us: m.usAsOf, bist: m.bistAsOf, crypto: m.cryptoAsOf }[activeView];
  const name = { us: 'ABD piyasası', bist: 'BIST', crypto: 'Kripto piyasası' }[activeView];
  const st = marketStatus(activeView);
  const box = $('#marketStatus');
  box.className = 'mstatus reveal ' + (st.open ? 'open' : 'closed');
  const timestamp = asOf || DATA.generatedAt;
  const readable = fullTimestamp(timestamp);
  const assets = DATA[activeView] || [];
  const technicalCoverage = activeView === 'crypto' && assets.length
    ? ' · Fiyat: ' + assets.filter((x) => Number.isFinite(x.price)).length + '/' + assets.length + ' · Güncel teknik analiz: ' + assets.filter((x) => Number.isFinite(x.analysis && x.analysis.score)).length + '/' + assets.length
    : '';
  box.innerHTML = '<span class="dot"></span><b>' + name + ':</b> ' + (missingMarket ? 'Veri alınamadı; 0 olarak yorumlanmıyor' : st.label) + '<span class="asof">' + (missingMarket ? 'Piyasa kaynağı boş veya erişilemez.' : 'Gösterilen fiyatlar: ' + readable + technicalCoverage) + '</span>';
  const copy = $('#marketStatusCopy');
  if (copy) copy.textContent = st.label + ' · Fiyat anlık görüntüsü: ' + readable;
}

function technicalDataNotice(asset) {
  const data = asset && asset.technicalData;
  if (!data) return '';
  const labels = { fresh: 'Teknik geçmiş güncel', cached: 'Teknik geçmiş önbellekten', stale: 'Eski teknik geçmiş', unavailable: 'Teknik kaynağa erişilemiyor', insufficient: 'Teknik geçmiş yetersiz' };
  const warning = ['stale', 'unavailable', 'insufficient'].includes(data.status);
  let text = labels[data.status] || 'Teknik veri durumu bilinmiyor';
  if (data.fetchedAt) text += ' · Son başarılı alım: ' + fullTimestamp(data.fetchedAt);
  if (data.lastBarAt) text += ' · Son mum başlangıcı: ' + fullTimestamp(data.lastBarAt);
  if (Number.isFinite(data.bars)) text += ' · ' + data.bars + ' günlük mum';
  if (warning) text += ' · ' + (data.error || 'Güncel sinyal üretmek için veri doğrulanamadı.');
  if (data.status === 'stale' && Number.isFinite(asset.analysis && asset.analysis.lastKnownScore)) text += ' · Son hesaplanan puan: ' + asset.analysis.lastKnownScore + ' (eski)';
  if (data.cacheWarning) text += ' · Önbellek: ' + data.cacheWarning;
  return '<div class="' + (warning || data.cacheWarning ? 'ui-state-error' : 'muted') + '" role="status">' + esc(text) + '</div>';
}
function renderScoreChart() {
  const list = currentList().filter((x) => Number.isFinite(x.analysis && x.analysis.score));
  if (scoreChart) scoreChart.destroy();
  renderChartDataTable($('#scoreChart'), 'Seçili piyasadaki varlık puanları', ['Varlık', 'Puan'], list.map((x) => [x.symbol, x.analysis.score]));
  if (!window.Chart || !list.length) return;
  scoreChart = new Chart($('#scoreChart'), {
    type: 'bar',
    data: { labels: list.map((x) => x.symbol), datasets: [{ data: list.map((x) => x.analysis.score), backgroundColor: list.map((x) => CHART.toneColor(x.analysis.tone)), hoverBackgroundColor: 'rgba(255,255,255,.22)', borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 700, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => 'Puan ' + x.raw + ' — ' + list[x.dataIndex].analysis.label } } },
      scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255, 255, 255, 0.02)' }, ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } } }, x: { grid: { display: false }, ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } } } },
    },
  });
}

function deskDefaultInterval(market) {
  return market === 'crypto' ? '1h' : '1d';
}
function deskIntervals(market) {
  return market === 'crypto'
    ? [['1m', '1 dk'], ['5m', '5 dk'], ['15m', '15 dk'], ['1h', '1 saat'], ['4h', '4 saat'], ['1d', '1 gün']]
    : [['5m', '5 dk'], ['15m', '15 dk'], ['1h', '1 saat'], ['1d', '1 gün']];
}
function syncDeskControls(market, interval) {
  const sel = $('#deskIntervalSel');
  if (!sel) return;
  const opts = deskIntervals(market);
  sel.innerHTML = opts.map(([v, label]) => '<option value="' + v + '">' + label + '</option>').join('');
  sel.value = opts.some(([v]) => v === interval) ? interval : deskDefaultInterval(market);
  document.querySelectorAll('[data-desk-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.deskMode === assetDeskState.mode);
  });
  updateSmaButtonVisual();
  updateRsiButtonVisual();
  updateMacdButtonVisual();
}
function destroyAssetDeskChart() {
  if (assetDeskResize) {
    assetDeskResize.disconnect();
    assetDeskResize = null;
  }
  if (assetDeskChart && typeof assetDeskChart.remove === 'function') {
    assetDeskChart.remove();
  }
  assetDeskChart = null;
}
function addLwSeries(chart, name, options, paneIndex) {
  const lw = window.LightweightCharts || {};
  // v5: chart.addSeries(SeriesType, options, paneIndex)
  if (chart.addSeries && lw[name]) {
    return (paneIndex != null)
      ? chart.addSeries(lw[name], options, paneIndex)
      : chart.addSeries(lw[name], options);
  }
  // v4 fallback (paneIndex ignoré)
  if (name === 'CandlestickSeries' && chart.addCandlestickSeries) return chart.addCandlestickSeries(options);
  if (name === 'LineSeries'        && chart.addLineSeries)        return chart.addLineSeries(options);
  if (name === 'HistogramSeries'   && chart.addHistogramSeries)   return chart.addHistogramSeries(options);
  return null;
}
function addTradePriceLines(series, asset) {
  const trade = asset && asset.decision && asset.decision.trade;
  if (!series || !series.createPriceLine || !trade || !trade.available) return;
  [
    ['Giriş', trade.entry, '#4382ff'],
    ['Stop', trade.stop, '#f87171'],
    ['Hedef', trade.target, '#28d793'],
  ].forEach(([title, price, color]) => {
    if (price == null || isNaN(price)) return;
    series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title,
    });
  });
}
// Indicator calculations for Chart Desk overlay
function calculateSMA(bars, period) {
  const smaData = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const close = bars[i].close;
    sum += close;
    if (i >= period - 1) {
      if (i >= period) {
        const prevClose = bars[i - period].close;
        sum -= prevClose;
      }
      smaData.push({ time: bars[i].time, value: sum / period });
    }
  }
  return smaData;
}

function calculateEMA(closes, period) {
  if (!closes || closes.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(closes.length).fill(null);
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;
  const ef = calculateEMA(closes, fast);
  const es = calculateEMA(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] != null && es[i] != null) {
      macdLine.push(ef[i] - es[i]);
    }
  }
  const sigSeries = calculateEMA(macdLine, signal);
  const macdNow = macdLine[macdLine.length - 1];
  const sigNow = sigSeries[sigSeries.length - 1];
  return {
    macd: macdNow,
    signal: sigNow,
    histogram: (macdNow != null && sigNow != null) ? macdNow - sigNow : null
  };
}

// Full-series RSI for chart pane (Wilder smoothing)
function calculateRSISeries(bars, period = 14) {
  if (!bars || bars.length < period + 1) return [];
  const closes = bars.map(b => b.close);
  const out = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period; avgLoss /= period;
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out.push({ time: bars[period].time, value: rsi0 });
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ time: bars[i].time, value: rsi });
  }
  return out;
}

// Full-series MACD for chart pane
function calculateMACDSeries(bars, fast = 12, slow = 26, sig = 9) {
  if (!bars || bars.length < slow + sig) return null;
  const closes = bars.map(b => b.close);
  const ef = calculateEMA(closes, fast);
  const es = calculateEMA(closes, slow);
  // Build aligned macd values
  const macdVals = [];
  const macdTimes = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] != null && es[i] != null) {
      macdVals.push(ef[i] - es[i]);
      macdTimes.push(bars[i].time);
    }
  }
  const sigVals = calculateEMA(macdVals, sig);
  const macdLine = [], signalLine = [], hist = [];
  for (let i = 0; i < macdVals.length; i++) {
    if (sigVals[i] == null) continue;
    const m = macdVals[i], s = sigVals[i], h = m - s;
    macdLine.push({ time: macdTimes[i], value: m });
    signalLine.push({ time: macdTimes[i], value: s });
    hist.push({ time: macdTimes[i], value: h, color: h >= 0 ? '#28d793' : '#f87171' });
  }
  return { macdLine, signalLine, hist };
}

function updateSmaButtonVisual() {
  const btn = $('#deskSmaToggleBtn');
  const txt = $('#deskSmaStatusText');
  if (!btn || !txt) return;
  if (assetDeskState.showSMA) {
    btn.dataset.active = 'true'; txt.textContent = 'AÇIK'; txt.style.color = '#28d793'; btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false'; txt.textContent = 'KAPALI'; txt.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)';
  }
}

function updateRsiButtonVisual() {
  const btn = $('#deskRsiToggleBtn');
  const txt = $('#deskRsiStatusText');
  if (!btn || !txt) return;
  if (assetDeskState.showRSI) {
    btn.dataset.active = 'true'; txt.textContent = 'AÇIK'; txt.style.color = '#a78bfa'; btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false'; txt.textContent = 'KAPALI'; txt.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)';
  }
}

function updateMacdButtonVisual() {
  const btn = $('#deskMacdToggleBtn');
  const txt = $('#deskMacdStatusText');
  if (!btn || !txt) return;
  if (assetDeskState.showMACD) {
    btn.dataset.active = 'true'; txt.textContent = 'AÇIK'; txt.style.color = '#f97316'; btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false'; txt.textContent = 'KAPALI'; txt.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)';
  }
}

function drawAssetDeskChart(payload, asset) {
  const container = $('#assetChart');
  const note = $('#assetChartNote');
  if (!container || !note) return;
  destroyAssetDeskChart();
  container.innerHTML = '';
  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="chart-loading">Lightweight Charts yüklenemedi.</div>';
    return;
  }
  const bars = (payload && payload.bars) || [];
  if (!bars.length) {
    container.innerHTML = '<div class="chart-loading">Grafik için yeterli veri yok.</div>';
    return;
  }
  const lw = window.LightweightCharts;
  const chart = lw.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight || 360,
    layout: {
      background: { type: lw.ColorType ? lw.ColorType.Solid : 'solid', color: '#0f1115' },
      textColor: chartLabelColor(),
      fontFamily: 'Plus Jakarta Sans',
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
    },
    rightPriceScale: { borderColor: 'rgba(255,255,255,.04)' },
    timeScale: { borderColor: 'rgba(255,255,255,.04)', timeVisible: assetDeskState.interval !== '1d' },
    crosshair: { mode: 0 },
  });
  const volumeData = bars.map((b) => ({
    time: b.time,
    value: b.volume || 0,
    color: b.close >= b.open ? 'rgba(241, 243, 246, 0.15)' : 'rgba(82, 88, 102, 0.15)',
  }));
  const vol = addLwSeries(chart, 'HistogramSeries', {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    color: 'rgba(125, 133, 144, 0.15)',
  });
  if (vol) {
    vol.setData(volumeData);
    if (chart.priceScale) {
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    }
  }

  const mainOptions = assetDeskState.mode === 'line'
    ? { color: CHART.accent, lineWidth: 2, priceLineVisible: false }
    : {
        upColor: '#2fbe88',
        downColor: '#e2666e',
        borderVisible: true,
        borderUpColor: '#2fbe88',
        borderDownColor: '#e2666e',
        wickUpColor: '#6b7585',
        wickDownColor: '#6b7585',
      };
  const main = addLwSeries(chart, assetDeskState.mode === 'line' ? 'LineSeries' : 'CandlestickSeries', mainOptions);
  if (!main) {
    container.innerHTML = '<div class="chart-loading">Grafik serisi oluşturulamadı.</div>';
    return;
  }
  main.setData(assetDeskState.mode === 'line'
    ? bars.map((b) => ({ time: b.time, value: b.close }))
    : bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
  
  addTradePriceLines(main, asset);

  // Teknik indikatörleri hesapla ve paneli güncelle
  const closes = bars.map(b => b.close);
  const rsiVal = calculateRSI(closes, 14);
  const macdVal = calculateMACD(closes, 12, 26, 9);
  const sma20Data = calculateSMA(bars, 20);
  const sma50Data = calculateSMA(bars, 50);

  const currentSma20 = sma20Data.length ? sma20Data[sma20Data.length - 1].value : null;
  const currentSma50 = sma50Data.length ? sma50Data[sma50Data.length - 1].value : null;

  const rsiEl = $('#ind-rsi-val');
  const macdEl = $('#ind-macd-val');
  const sma20El = $('#ind-sma20-val');
  const sma50El = $('#ind-sma50-val');
  const panelEl = $('#desk-indicators-panel');

  if (panelEl) {
    panelEl.style.opacity = '1';
  }

  if (rsiEl) {
    if (rsiVal != null) {
      rsiEl.textContent = rsiVal.toFixed(1);
      if (rsiVal >= 70) rsiEl.style.color = '#f87171';
      else if (rsiVal <= 30) rsiEl.style.color = '#28d793';
      else rsiEl.style.color = 'var(--text)';
    } else {
      rsiEl.textContent = '–';
      rsiEl.style.color = 'var(--text)';
    }
  }

  if (macdEl) {
    if (macdVal && macdVal.macd != null) {
      macdEl.textContent = `${macdVal.macd.toFixed(2)} / ${macdVal.signal.toFixed(2)}`;
      if (macdVal.histogram > 0) macdEl.style.color = '#28d793';
      else if (macdVal.histogram < 0) macdEl.style.color = '#f87171';
      else macdEl.style.color = 'var(--text)';
    } else {
      macdEl.textContent = '–';
      macdEl.style.color = 'var(--text)';
    }
  }

  if (sma20El) {
    sma20El.textContent = currentSma20 != null ? fmtPrice(currentSma20, payload.currency) : '–';
  }
  if (sma50El) {
    sma50El.textContent = currentSma50 != null ? fmtPrice(currentSma50, payload.currency) : '–';
  }

  // Eğer SMA çizgileri aktifse çizdir
  if (assetDeskState.showSMA) {
    const sma20Series = addLwSeries(chart, 'LineSeries', {
      color: '#4382ff', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    if (sma20Series) sma20Series.setData(sma20Data);
    const sma50Series = addLwSeries(chart, 'LineSeries', {
      color: '#ff9f43', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    if (sma50Series) sma50Series.setData(sma50Data);
  }

  // --- RSI Panosu ---
  if (assetDeskState.showRSI) {
    const rsiSeries_data = calculateRSISeries(bars, 14);
    if (rsiSeries_data.length > 0) {
      const rsiPane = 1;
      const rsiS = addLwSeries(chart, 'LineSeries', {
        color: '#a78bfa',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceScaleId: 'rsi-scale',
      }, rsiPane);
      if (rsiS) {
        rsiS.setData(rsiSeries_data);
        // 0–100 sabit ölçek
        try {
          rsiS.priceScale().applyOptions({ autoScale: false, minimum: 0, maximum: 100 });
        } catch (_) {}
        // 70 referans çizgisi
        rsiS.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '70' });
        // 30 referans çizgisi
        rsiS.createPriceLine({ price: 30, color: 'rgba(40,215,147,0.5)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '30' });
        // 50 orta çizgi
        rsiS.createPriceLine({ price: 50, color: 'rgba(125,133,144,0.25)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      }
    }
  }

  // --- MACD Panosu ---
  if (assetDeskState.showMACD) {
    const macdData = calculateMACDSeries(bars, 12, 26, 9);
    if (macdData && macdData.hist.length > 0) {
      const macdPane = assetDeskState.showRSI ? 2 : 1;
      const histS = addLwSeries(chart, 'HistogramSeries', {
        priceLineVisible: false,
        lastValueVisible: false,
        color: '#28d793',
        priceScaleId: 'macd-scale',
      }, macdPane);
      if (histS) histS.setData(macdData.hist);

      const macdLineS = addLwSeries(chart, 'LineSeries', {
        color: '#4382ff',
        lineWidth: 1.2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'macd-scale',
      }, macdPane);
      if (macdLineS) macdLineS.setData(macdData.macdLine);

      const signalS = addLwSeries(chart, 'LineSeries', {
        color: '#f97316',
        lineWidth: 1.2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'macd-scale',
      }, macdPane);
      if (signalS) signalS.setData(macdData.signalLine);
    }
  }

  chart.timeScale().fitContent();
  assetDeskResize = new ResizeObserver(() => {
    chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 360 });
  });
  assetDeskResize.observe(container);
  assetDeskChart = chart;
  lastAssetChart = { payload, asset };
  const last = bars[bars.length - 1];
  note.innerHTML = '<span>' + payload.source.toUpperCase() + ' · ' + payload.sourceSymbol + ' · ' + payload.interval + '</span>' +
    '<span>Grafik zamanı: <b>' + esc(fullTimestamp(payload.generatedAt || payload.asOf || last.time)) + '</b></span>' +
    '<span>Son mum fiyatı: <b>' + fmtPrice(last.close, payload.currency) + '</b> · fiyat zamanı: ' + esc(fullTimestamp(asset.quoteTime)) + '</span>' +
    (payload.fallback ? '<span role="status">Grafik yenilenemedi; son başarılı geçmiş gösteriliyor.</span>' : '');
  note.innerHTML += '<details class="chart-data-alternative"><summary>Grafik değerlerini tablo olarak oku (' + bars.length + ' kayıt)</summary><div class="table-wrap max-height-300"><table><caption>' + esc(asset.symbol) + ' · ' + esc(payload.interval) + ' · ' + esc(payload.currency) + '</caption><thead><tr><th>Zaman</th><th>Açılış</th><th>Yüksek</th><th>Düşük</th><th>Kapanış</th><th>Hacim</th></tr></thead><tbody>' + bars.map((bar) => '<tr><td>' + esc(fullTimestamp(bar.time)) + '</td>' + [bar.open,bar.high,bar.low,bar.close].map((value) => '<td>' + fmtPrice(value,payload.currency) + '</td>').join('') + '<td>' + fmtNum(bar.volume,0) + '</td></tr>').join('') + '</tbody></table></div></details>';

}
async function renderAssetDesk(asset) {
  const title = $('#deskTitle');
  const meta = $('#deskMeta');
  const chartBox = $('#assetChart');
  const note = $('#assetChartNote');
  if (!title || !meta || !chartBox || !note) return;
  if (!asset) {
    title.textContent = 'Varlık Grafiği';
    meta.textContent = 'Bu pazarda grafik için sembol yok';
    note.textContent = '';
    chartBox.innerHTML = '<div class="chart-loading">Sembol bekleniyor.</div>';
    destroyAssetDeskChart();
    return;
  }
  const market = asset.market || activeView;
  if (assetDeskState.market && assetDeskState.market !== market) {
    marketChartPrefs[assetDeskState.market] = { interval: assetDeskState.interval, mode: assetDeskState.mode, showSMA: assetDeskState.showSMA, showRSI: assetDeskState.showRSI, showMACD: assetDeskState.showMACD };
    Object.assign(assetDeskState, marketChartPrefs[market] || { interval: deskDefaultInterval(market), mode: 'candles', showSMA: false, showRSI: false, showMACD: false });
  }
  if (marketUi[market]) marketUi[market].symbol = asset.symbol;
  const request = ++assetDeskRequest;

  assetDeskState.market = market;
  assetDeskState.symbol = asset.symbol;
  assetDeskState.interval = assetDeskState.interval || deskDefaultInterval(market);
  renderSelectedAssetDetail(asset);
  let focusBtn = $('#assetChartFocusBtn');
  if (!focusBtn && chartBox.parentElement) {
    focusBtn = document.createElement('button'); focusBtn.id = 'assetChartFocusBtn'; focusBtn.type = 'button'; focusBtn.className = 'btn chart-focus-toggle'; focusBtn.textContent = 'Grafiğe odaklan'; focusBtn.setAttribute('aria-pressed', 'false');
    const controls = $('#assetDesk .desk-controls');
    if (controls) controls.appendChild(focusBtn);
    else chartBox.parentElement.insertBefore(focusBtn, chartBox);
    focusBtn.addEventListener('click', () => {
      const active = document.body.classList.toggle('chart-focus-active');
      focusBtn.textContent = active ? 'Grafik odağını kapat' : 'Grafiğe odaklan'; focusBtn.setAttribute('aria-pressed', String(active));
      requestAnimationFrame(() => { if (assetDeskChart && assetDeskChart.applyOptions) assetDeskChart.applyOptions({ width: chartBox.clientWidth, height: chartBox.clientHeight || 360 }); });
    });
  }
  syncDeskControls(market, assetDeskState.interval);
  title.textContent = asset.symbol + ' · ' + (asset.analysis ? asset.analysis.label : 'Grafik');
  meta.textContent = (asset.name || asset.symbol) + ' · ' + fmtPrice(asset.price, asset.currency) + ' · ' + fmtPct(asset.changePct);
  chartBox.innerHTML = '<div class="chart-loading">Grafik yükleniyor...</div>';
  ['ind-rsi-val', 'ind-macd-val', 'ind-sma20-val', 'ind-sma50-val'].forEach((id) => { const value = $('#' + id); if (value) { value.textContent = '–'; value.style.color = 'var(--text)'; } });
  note.textContent = '';
  try {
    const qs = new URLSearchParams({
      market,
      symbol: asset.symbol,
      interval: assetDeskState.interval,
    });
    if (market === 'crypto') qs.set('limit', '500');
    else qs.set('range', assetDeskState.interval === '1d' ? '1y' : '5d');
    const res = await fetch('/api/chart?' + qs.toString(), { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || 'Chart hatası');
    if (request !== assetDeskRequest || assetDeskState.symbol !== asset.symbol || assetDeskState.market !== market || !chartBox.isConnected) return;
    drawAssetDeskChart(payload, asset);
  } catch (e) {
    if (request !== assetDeskRequest || !chartBox.isConnected) return;
    destroyAssetDeskChart();
    chartBox.innerHTML = '<div class="chart-loading">Grafik alınamadı. <button type="button" class="btn btn-secondary" data-chart-retry>Tekrar dene</button></div>';
    chartBox.querySelector('[data-chart-retry]').addEventListener('click', () => renderAssetDesk(asset));
    note.textContent = (e && e.message) || 'Bilinmeyen hata';
  }
}

function renderSelectedAssetDetail(asset) {
  const el = $('#selectedAssetDetail');
  if (!el) return;
  if (!asset || !asset.analysis) { el.innerHTML = ''; return; }
  const a = asset.analysis;
  const key = asset.market + ':' + asset.symbol;
  const selectedTab = assetDetailTabs[key] || 'overview';
  const bodies = {
    overview: technicalDataNotice(asset) + decisionInsightCard(asset) + '<div class="dsummary">' + esc(a.summary || '') + '</div>' + decisionPanel(asset),
    technical: technicalDataNotice(asset) + indGrid(asset) + subBars(a.sub || {}) + reasonList(a.reasons || []) + '<button type="button" class="btn btn-secondary" data-open-guide>Göstergeleri nasıl okuyabilirim?</button>',
    research: assetResearchCard(asset) + assetSignalOverlayCard(asset) + assetLearningCard(asset),
    notes: assetThesisCard(asset) + alertRulesCard(asset)
  };
  if (!el.dataset.guideBound) { el.dataset.guideBound = 'true'; el.addEventListener('click', (event) => { if (event.target.closest('[data-open-guide]')) setView('literacy'); }); }
  if (el.dataset.assetKey === key && el.querySelector('.asset-note-form')) {
    ['overview', 'technical', 'research'].forEach((name) => { const section = el.querySelector('[data-asset-panel="' + name + '"]'); if (section) section.innerHTML = bodies[name]; });
    const metadata = el.querySelector('.card-head .card-sub'); if (metadata) metadata.textContent = 'Seçili varlık · ' + fullTimestamp(DATA.generatedAt);
    return;
  }
  el.dataset.assetKey = key;
  const panel = (id, label, body) => '<section id="asset-panel-' + id + '" class="asset-detail-panel" data-asset-panel="' + id + '" role="tabpanel" aria-labelledby="asset-tab-' + id + '">' + body + '</section>';
  el.innerHTML = '<section class="card detailwrap"><div class="card-head"><h2>' + esc(asset.symbol) + ' detayları</h2><span class="card-sub">Seçili varlık · ' + esc(fullTimestamp(DATA.generatedAt)) + '</span></div>' +
    '<div class="asset-detail-tabs" role="tablist" aria-label="Varlık ayrıntıları">' +
      ['overview:Özet', 'technical:Teknik', 'research:Araştırma', 'notes:Not ve takip'].map((item) => { const p = item.split(':'); const on = p[0] === selectedTab; return '<button type="button" class="asset-detail-tab' + (on ? ' active' : '') + '" id="asset-tab-' + p[0] + '" role="tab" tabindex="' + (on ? 0 : -1) + '" aria-selected="' + on + '" aria-controls="asset-panel-' + p[0] + '" data-asset-tab="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
    '</div>' +
    panel('overview', 'Özet', bodies.overview) + panel('technical', 'Teknik', bodies.technical) + panel('research', 'Araştırma', bodies.research) + panel('notes', 'Not ve takip', bodies.notes) + '</section>';
  el.querySelectorAll('[data-asset-tab]').forEach((tab) => tab.addEventListener('click', () => {
    const name = tab.dataset.assetTab;
    assetDetailTabs[key] = name;
    el.querySelectorAll('[data-asset-tab]').forEach((x) => { const on = x.dataset.assetTab === name; x.classList.toggle('active', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
    el.querySelectorAll('[data-asset-panel]').forEach((x) => { x.hidden = x.dataset.assetPanel !== name; });
    const first = el.querySelector('[data-asset-panel="' + name + '"]');
    if (first) first.hidden = false;
  }));
  el.querySelectorAll('[data-asset-tab]').forEach((tab, index, tabs) => tab.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  }));
  el.querySelectorAll('[data-asset-panel]').forEach((x) => { x.hidden = x.dataset.assetPanel !== selectedTab; });
}

/* ---------- Tablo + detay ---------- */
function rsiColor(rsi) {
  if (rsi == null) return 'var(--muted)';
  if (rsi >= 70) return 'var(--red)';
  if (rsi <= 30) return 'var(--yellow)';
  if (rsi >= 50) return 'var(--green)';
  return '#f1f3f6';
}
function macdCell(ind) {
  const m = ind && ind.macd;
  if (!m || m.histogram == null) return '<span style="color:var(--muted)">–</span>';
  const rising = m.prevHistogram != null && m.histogram > m.prevHistogram;
  let sym, color;
  if (m.histogram > 0 && rising) { sym = '▲▲'; color = 'var(--green)'; }
  else if (m.histogram > 0) { sym = '▲'; color = 'var(--accent)'; }
  else if (rising) { sym = '▽'; color = 'var(--yellow)'; }
  else { sym = '▼'; color = 'var(--red)'; }
  return '<span style="color:' + color + '" title="hist ' + m.histogram + '">' + sym + '</span>';
}
function sparkline(spark) {
  if (!spark || spark.length < 2) return '';
  const w = 140, h = 38, pad = 2;
  const min = Math.min(...spark), max = Math.max(...spark), rng = max - min || 1;
  const pts = spark.map((v, i) => (pad + (i / (spark.length - 1)) * (w - 2 * pad)).toFixed(1) + ',' + (h - pad - ((v - min) / rng) * (h - 2 * pad)).toFixed(1)).join(' ');
  const col = spark[spark.length - 1] >= spark[0] ? '#28d793' : '#f87171';
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><polyline class="spark-path" pathLength="1" points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.6"/></svg>';
}
function subBars(sub) {
  const items = [['Momentum', sub.momentum], ['Trend', sub.trend], ['Hacim', sub.hacim], ['Volatilite', sub.volatilite]];
  if (sub.temel != null) items.push(['Temel/Analist', sub.temel]);
  return '<div class="subscores">' + items.map(([k, v]) => {
    const col = v >= 60 ? '#28d793' : v >= 45 ? '#eab308' : '#f87171';
    return '<div class="subrow"><span class="sublbl">' + k + '</span><span class="subbar"><i style="width:' + (v || 0) + '%;background:' + col + '"></i></span><span class="subval">' + (v == null ? '–' : v) + '</span></div>';
  }).join('') + '</div>';
}
function kv(label, val) { return val == null || val === '' ? '' : '<div class="kv"><span>' + label + '</span><b>' + val + '</b></div>'; }
function indGrid(x) {
  const i = x.ind || {}, m = i.macd || {}, bb = i.bollinger || {};
  const rows = [];
  rows.push(kv('RSI(14)', i.rsi));
  rows.push(kv('MACD / sinyal / hist', m.macd != null ? m.macd + ' / ' + m.signal + ' / ' + m.histogram : null));
  rows.push(kv('SMA 20/50/200', [i.sma20, i.sma50, i.sma200].filter((v) => v != null).join(' / ')));
  rows.push(kv('EMA 12/26', [i.ema12, i.ema26].filter((v) => v != null).join(' / ')));
  rows.push(kv('Bollinger Alt/Orta/Üst', bb.lower != null ? bb.lower + ' / ' + bb.middle + ' / ' + bb.upper : null));
  rows.push(kv('Bollinger %B / genişlik', bb.pctB != null ? bb.pctB + ' / %' + bb.bandwidth : null));
  rows.push(kv('ATR / ATR%', i.atr != null ? i.atr + ' / %' + i.atrPct : null));
  rows.push(kv('Yıllık volatilite', i.volatility != null ? '%' + i.volatility : null));
  rows.push(kv('Getiri 1h/1a/3a', [i.ret1w, i.ret1m, i.ret3m].map((v) => (v == null ? '–' : '%' + v)).join(' / ')));
  rows.push(kv('Getiri 6a/1y', [i.ret6m, i.ret1y].map((v) => (v == null ? '–' : '%' + v)).join(' / ')));
  rows.push(kv('52H bant konumu', i.pos52 != null ? '%' + Math.round(i.pos52 * 100) : null));
  rows.push(kv('52H düşük – yüksek', i.low52 != null ? i.low52 + ' – ' + i.high52 : null));
  rows.push(kv('Hacim / 20g ort.', i.volSpike != null ? '%' + Math.round(i.volSpike * 100) : null));
  rows.push(kv('OBV (hacim akışı)', i.obv ? (i.obv.rising ? 'yükseliyor ▲' : 'düşüyor ▼') : null));
  if (x.market === 'us') {
    rows.push(kv('F/K oranı', x.pe != null ? Math.round(x.pe * 10) / 10 : null));
    rows.push(kv('Beta', x.beta != null ? Math.round(x.beta * 100) / 100 : null));
    rows.push(kv('Piyasa değeri', x.marketCap ? fmtCap(x.marketCap) : null));
    rows.push(kv('Sektör', x.industry || null));
  }
  if (x.market === 'crypto') {
    rows.push(kv('Piyasa değeri', x.marketCap ? fmtCap(x.marketCap) : null));
    rows.push(kv('Piyasa değeri sırası', x.rank != null ? '#' + x.rank : null));
    rows.push(kv("ATH'den uzaklık", x.athChangePct != null ? '%' + Math.round(x.athChangePct) : null));
    rows.push(kv('7g / 30g getiri', [x.change7d, x.change30d].map((v) => (v == null ? '–' : '%' + Math.round(v * 10) / 10)).join(' / ')));
  }
  return '<div class="indgrid">' + rows.join('') + '</div>';
}
function reasonList(reasons) {
  return '<ul class="reasons">' + reasons.map((r) => '<li class="r-' + r.sentiment + '">' + r.text + '</li>').join('') + '</ul>';
}
function freshnessText(f) {
  if (!f) return 'Bilinmiyor';
  const age = f.ageHours == null ? '' : ' · ' + f.ageHours + 's';
  return f.label + age;
}
function confidenceText(c) {
  if (!c) return 'Bilinmiyor';
  const delta = c.scoreDelta == null ? '' : ' · ' + (c.scoreDelta > 0 ? '+' : '') + c.scoreDelta + ' puan';
  return c.label + delta;
}
function decisionPanel(x) {
  const d = x.decision;
  if (!d) return '';
  const trade = d.trade || {};
  const contradictions = d.contradictions || [];
  const tradeHtml = trade.available
    ? '<div class="trade-grid">' +
      '<div class="trade-cell"><span>Giris</span><b>' + fmtPrice(trade.entry, x.currency) + '</b></div>' +
      '<div class="trade-cell"><span>Stop</span><b>' + fmtPrice(trade.stop, x.currency) + '</b></div>' +
      '<div class="trade-cell"><span>Hedef</span><b>' + fmtPrice(trade.target, x.currency) + '</b></div>' +
      '<div class="trade-cell"><span>Risk/Odul</span><b>' + trade.riskReward + ':1</b></div>' +
      '<div class="trade-cell"><span>100k icin adet</span><b>' + (trade.unitsPer100k == null ? '–' : trade.unitsPer100k) + '</b></div>' +
      '<div class="trade-cell"><span>Hesap riski</span><b>%' + trade.positionRiskPct + '</b></div>' +
      '</div>'
    : '<p class="decision-muted">' + esc(trade.reason || 'Islem plani icin veri eksik') + '</p>';
  const contradictionHtml = contradictions.length
    ? '<div class="decision-alerts">' + contradictions.map((c) => '<div class="decision-alert"><b>' + esc(c.label) + '</b><span>' + esc(c.detail) + '</span></div>').join('') + '</div>'
    : '<p class="decision-muted">Belirgin skor celiskisi yok.</p>';

  return '<div class="decision-panel">' +
    '<div class="decision-head"><h4>Karar Kalitesi</h4><span class="decision-score decision-' + decisionTone(d) + '">' + decisionLabel(d) + ' · ' + d.score + '</span></div>' +
    '<div class="decision-grid">' +
    '<div><span>Tazelik</span><b>' + freshnessText(d.freshness) + '</b></div>' +
    '<div><span>Stabilite</span><b>' + confidenceText(d.confidence) + '</b></div>' +
    '<div><span>Celiski</span><b>' + (contradictions.length ? contradictions.length + ' uyari' : 'Temiz') + '</b></div>' +
    '</div>' +
    '<div class="decision-split"><div><h4>Islem Plani</h4>' + tradeHtml + '</div><div><h4>Uyarilar</h4>' + contradictionHtml + '</div></div>' +
    '</div>';
}

// İnsancıl "Karar Özeti" kartı (Katman 1: Sonuç → Katman 2: Neden + Plan).
// Saf mantık public/insights.js'te; burada yalnızca HTML'e dökülür.
function decisionInsightCard(x) {
  if (!window.FinansInsights) return '';
  const ins = window.FinansInsights.explainDecision(x);
  if (!ins) return '';
  const li = (arr) => '<ul>' + arr.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>';
  const prosHtml = ins.pros.length ? li(ins.pros) : '<p class="ins-empty">Belirgin olumlu sinyal yok</p>';
  const consHtml = ins.cons.length ? li(ins.cons) : '<p class="ins-empty">Belirgin risk yok</p>';
  const q = ins.quality;
  const qTone = q.status === 'clean' ? 'pos' : q.status === 'caution' ? 'warn' : q.status === 'blocked' ? 'neg' : 'muted';
  const regimeHtml = ins.regime ? '<span class="ins-regime">📊 ' + esc(ins.regime) + '</span>' : '';
  const cg = ins.costGate;
  const costHtml = cg && cg.ratio != null
    ? '<span class="ins-cost ' + (cg.pass ? 'ok' : 'bad') + '">' + (cg.pass ? '✓' : '✗') + ' Maliyet: hedef %' + cg.rewardPct + ' vs %' + cg.costPct + ' (×' + cg.ratio + ')</span>'
    : '';
  const metaHtml = (regimeHtml || costHtml) ? '<div class="insight-meta">' + regimeHtml + costHtml + '</div>' : '';
  const suitHtml = ins.suitability ? '<p class="insight-suit">' + esc(ins.suitability) + '</p>' : '';
  return '<div class="insight-card itone-' + esc(ins.tone) + '">' +
    '<div class="insight-head">' +
      '<span class="badge tone-' + esc(ins.tone) + '">' + esc(ins.verdict) + '</span>' +
      '<span class="insight-quality q-' + qTone + '">Karar kalitesi ' + (q.score != null ? q.score : '–') + (q.statusLabel ? ' · ' + esc(q.statusLabel) : '') + '</span>' +
    '</div>' +
    metaHtml +
    '<p class="insight-headline">' + esc(ins.headline) + '</p>' +
    suitHtml +
    '<div class="insight-cols">' +
      '<div class="insight-col"><span class="ins-kicker pos">✓ Lehte</span>' + prosHtml + '</div>' +
      '<div class="insight-col"><span class="ins-kicker neg">⚠ Dikkat</span>' + consHtml + '</div>' +
    '</div>' +
    '<p class="insight-plan"><b>Plan:</b> ' + esc(ins.plan) + '</p>' +
    '<p class="insight-qnote">' + esc(q.note) + '</p>' +
  '</div>';
}

function assetThesisCard(x) {
  const key = x.market + ':' + x.symbol;
  const savedNote = JOURNAL.notes[key] || { thesis: '', invalidation: '' };
  const note = Object.assign({}, savedNote, noteDrafts[key] || {});
  
  const suggested = (window.FinansActionLayer && window.FinansActionLayer.buildAssetThesis)
    ? window.FinansActionLayer.buildAssetThesis(x, DATA)
    : { thesis: '', invalidation: '', catalysts: [] };

  const thesisVal = note.thesis || '';
  const invalidationVal = note.invalidation || '';

  const catalystsHtml = (suggested.catalysts || []).map(c => '<li>' + esc(c) + '</li>').join('');

  return '<div class="asset-thesis-wrapper">' +
    '<div class="asset-thesis">' +
      '<div>' +
        '<h4>Yatırım Tezi</h4>' +
        '<p>' + esc(note.thesis || suggested.thesis || 'Tez yok.') + '</p>' +
      '</div>' +
      '<div>' +
        '<h4>Bozulma Koşulu</h4>' +
        '<p>' + esc(note.invalidation || suggested.invalidation || 'Bozulma koşulu yok.') + '</p>' +
      '</div>' +
      '<div>' +
        '<h4>Katalizörler</h4>' +
        '<ul>' + catalystsHtml + '</ul>' +
      '</div>' +
    '</div>' +
    '<form class="asset-note-form" data-market="' + x.market + '" data-symbol="' + x.symbol + '">' +
      '<div class="note-grid">' +
        '<label>Tez Notu' +
          '<textarea name="thesis" placeholder="Örn: 50g hareketli ortalama üstünde kalırsa alım yönlü izlenecek.">' + esc(thesisVal) + '</textarea>' +
        '</label>' +
        '<label>Bozulma Notu' +
          '<textarea name="invalidation" placeholder="Örn: Stop seviyesinin altında veya 50g ortalamanın altında kapanışlarda tez bozulur.">' + esc(invalidationVal) + '</textarea>' +
        '</label>' +
      '</div>' +
      '<div class="note-actions">' +
        '<button type="submit" class="btn"' + (journalSaving ? ' disabled' : '') + '>Notu Kaydet</button>' +
        '<span class="note-status" role="status" aria-live="polite" id="note-status-' + x.market + '-' + x.symbol + '"></span>' +
      '</div>' +
    '</form>' +
  '</div>';
}

function alertRulesCard(x) {
  let weightPct = 0;
  if (portfolioData && window.FinansActionLayer && window.FinansActionLayer.buildPortfolioActions) {
    const portActions = window.FinansActionLayer.buildPortfolioActions({ data: DATA, portfolioData: portfolioData });
    const row = portActions.rows.find(r => r.symbol === x.symbol);
    if (row) weightPct = row.weightPct;
  }
  
  const suggested = (window.FinansActionLayer && window.FinansActionLayer.buildAlertRules)
    ? window.FinansActionLayer.buildAlertRules(x, { weightPct: weightPct })
    : [];

  let alertsHtml = '';
  if (suggested.length === 0) {
    alertsHtml = '<p class="muted compact">Önerilen alarm kuralı yok.</p>';
  } else {
    alertsHtml = suggested.map(a => {
      const id = [x.market.toLowerCase(), x.symbol.toUpperCase(), a.trigger.toLowerCase()].join(':');
      const activeAlert = (JOURNAL.alerts || []).find(y => y.id === id);
      const isChecked = activeAlert && activeAlert.enabled;
      
      return '<form class="alert-toggle-form" data-market="' + x.market + '" data-symbol="' + x.symbol + '" data-trigger="' + esc(a.trigger) + '" data-action="' + esc(a.action) + '" style="margin-top:8px;">' +
        '<label class="alert-switch">' +
          '<input type="checkbox" aria-label="' + esc(a.trigger).replace(/"/g, '&quot;') + ' kuralını etkinleştir" ' + (isChecked ? 'checked' : '') + (journalSaving ? ' disabled' : '') + '>' +
          '<span></span>' +
        '</label>' +
        '<div>' +
          '<b>' + esc(a.trigger) + '</b>' +
          '<span>' + esc(a.action) + '</span>' +
        '</div>' +
        '<span class="field-status" role="status" aria-live="polite"></span>' +
      '</form>';
    }).join('');
  }

  return '<div class="alert-rules">' +
    '<h4>Önerilen Alarm Kuralları</h4>' +
    alertsHtml +
  '</div>';
}

function assetResearchCard(x) {
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildCompanyTearsheet || !window.FinansActionLayer.buildCompsSnapshot) return '';
  const tear = window.FinansActionLayer.buildCompanyTearsheet(x, DATA, JOURNAL);
  const comps = window.FinansActionLayer.buildCompsSnapshot(x, DATA);
  const metrics = tear.metrics.map((m) => '<div><span>' + esc(m.label) + '</span><b>' + esc(m.value) + '</b></div>').join('');
  const gaps = tear.gaps.length ? tear.gaps.map((g) => '<li>' + esc(g) + '</li>').join('') : '<li>Temel veri eksigi gorunmuyor.</li>';
  const peers = comps.peerSet.length ? comps.peerSet.map((p) => '<span>' + esc(p.symbol) + ' · ' + p.score + '</span>').join('') : '<span>Benzer sirket yok</span>';
  return '<div class="asset-research-card">' +
    '<div class="research-block">' +
      '<div class="research-head"><h4>Sirket Ozeti</h4><span>' + esc(tear.bankerRead) + '</span></div>' +
      '<p>' + esc(tear.thesis) + '</p>' +
      '<div class="research-metrics">' + metrics + '</div>' +
      '<ul class="research-gaps">' + gaps + '</ul>' +
    '</div>' +
    '<div class="research-block">' +
      '<div class="research-head"><h4>Benzer Sirket Gozlemi</h4><span>Tarama kalitesi</span></div>' +
      '<p>' + esc(comps.readThrough) + '</p>' +
      '<div class="peer-strip">' + peers + '</div>' +
      '<ul class="research-gaps">' + comps.limitations.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' +
    '</div>' +
    committeeMemoCard(x) +
  '</div>';
}

function committeeMemoCard(x) {
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildInvestmentCommitteeMemo) return '';
  const base = REPORT_CACHE && REPORT_CACHE.base ? REPORT_CACHE.base : {};
  const memo = window.FinansActionLayer.buildInvestmentCommitteeMemo(x, DATA, JOURNAL, base);
  const list = (items) => (items && items.length ? items.map((item) => '<li>' + esc(item) + '</li>').join('') : '<li>Kayit yok.</li>');
  return '<div class="committee-memo-card verdict-' + esc(memo.verdict) + '">' +
    '<div class="research-head"><h4>Yatirim Komitesi Notu</h4><span>' + esc(verdictLabel(memo.verdict)) + '</span></div>' +
    '<p class="memo-ask">' + esc(memo.decisionAsk) + '</p>' +
    '<div class="memo-snapshot">' +
      '<div><span>Fiyat</span><b>' + esc(memo.snapshot.price) + '</b></div>' +
      '<div><span>Skor</span><b>' + esc(memo.snapshot.score) + '</b></div>' +
      '<div><span>Ayarlanmis skor</span><b>' + esc(memo.snapshot.adjustedScore) + '</b></div>' +
      '<div><span>Etiket</span><b>' + esc(memo.snapshot.label) + '</b></div>' +
    '</div>' +
    '<div class="memo-grid">' +
      '<div><h5>Neye inaniyoruz?</h5><ul>' + list(memo.sections.whatWeBelieve) + '</ul></div>' +
      '<div><h5>Eksik kanit</h5><ul>' + list(memo.sections.evidenceGaps) + '</ul></div>' +
      '<div><h5>Risk iletimi</h5><ul>' + list(memo.sections.riskTransmission) + '</ul></div>' +
      '<div><h5>Sonraki aksiyon</h5><ul>' + list(memo.sections.nextActions) + '</ul></div>' +
    '</div>' +
  '</div>';
}

function drawDetailChart(idx, asset) {
  const canvasId = 'detail-chart-' + idx;
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  
  if (activeDetailCharts[idx]) {
    activeDetailCharts[idx].destroy();
  }
  
  const spark = asset.ind && asset.ind.spark ? asset.ind.spark : [];
  if (!spark.length) return;
  
  const labels = spark.map((_, i) => `Gün ${i + 1}`);
  const color = spark[spark.length - 1] >= spark[0] ? '#28d793' : '#f87171';
  
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 110);
  gradient.addColorStop(0, spark[spark.length - 1] >= spark[0] ? 'rgba(40, 215, 147, 0.12)' : 'rgba(239, 68, 68, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
 
  activeDetailCharts[idx] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: spark,
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 1.8,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        fill: true,
        tension: 0.15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => fmtPrice(context.raw, asset.currency)
          }
        }
      },
      scales: {
        y: {
          display: true,
          position: 'right',
          grid: { color: 'rgba(30, 34, 43, 0.3)' },
          ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' }, maxTicksLimit: 3 }
        },
        x: {
          display: false
        }
      }
    }
  });
}

function getScoreDelta(asset) {
  const c = asset && asset.decision && asset.decision.confidence;
  if (c && typeof c.scoreDelta === 'number') return c.scoreDelta;
  if (c && typeof c.previousScore === 'number' && asset.analysis && typeof asset.analysis.score === 'number') {
    return asset.analysis.score - c.previousScore;
  }
  return null;
}

function renderTable() {
  const list = currentList();
  
  // Bellek sızıntılarını önlemek için eski detay grafiklerini temizle
  Object.values(activeDetailCharts).forEach(chart => chart.destroy());
  activeDetailCharts = {};
  
  const tsEl = $('#tableTimestamp');
  if (tsEl && DATA.generatedAt) {
    tsEl.textContent = 'Teknik skor anlık görüntüsü: ' + fullTimestamp(DATA.generatedAt) + ' · fiyat, grafik güncelleme zamanından farklı olabilir';
  }

  let html = '<table><thead><tr><th>Sembol</th><th>Fiyat</th><th>Gün %</th><th>RSI</th><th>MACD</th><th>50g %</th><th>Vol</th><th>Puan</th><th>Öneri</th></tr></thead><tbody>';
  list.forEach((x, idx) => {
    const a = x.analysis || { score: null, label: 'VERİ YOK', tone: 'hold' }, i = x.ind || {}, s = i.signals || {};
    const chCls = (x.changePct || 0) >= 0 ? 'pos' : 'neg';
    const dist = s.distSma50;
    
    const delta = getScoreDelta(x);
    let deltaHtml = '';
    if (delta != null && delta !== 0) {
      const deltaCls = delta > 0 ? 'pos' : 'neg';
      const deltaSign = delta > 0 ? '+' : '';
      deltaHtml = ' <span class="score-delta ' + deltaCls + '" style="font-size: 12px; font-weight: 800; margin-left: 5px;">' + deltaSign + delta + '</span>';
    }

    html +=
      '<tr class="row" data-i="' + idx + '">' +
      '<td><button class="asset-open-btn asset-symbol-open" type="button" data-i="' + idx + '" aria-expanded="' + String(marketDetailOpen && assetDeskState.symbol === x.symbol) + '" aria-controls="selectedAssetDetail" aria-label="' + esc(x.symbol) + ' detayını aç"><span class="sym">' + x.symbol + '</span><span class="coname">' + esc(x.name || '') + '</span><span class="asset-open-hint">Detay</span></button></td>' +
      '<td>' + fmtPrice(x.price, x.currency) + '</td>' +
      '<td class="' + chCls + '">' + fmtPct(x.changePct) + '</td>' +
      '<td style="color:' + rsiColor(i.rsi) + ';font-weight:600">' + (i.rsi != null ? i.rsi : '–') + '</td>' +
      '<td>' + macdCell(i) + '</td>' +
      '<td class="' + ((dist || 0) >= 0 ? 'pos' : 'neg') + '">' + (dist != null ? fmtPct(dist) : '–') + '</td>' +
      '<td>' + (i.atrPct != null ? '%' + i.atrPct : '–') + '</td>' +
      '<td>' + (Number.isFinite(a.score) ? '<span class="scorecell"><span class="scorebar"><i style="width:' + a.score + '%;background:' + toneColor(a.tone) + '"></i></span>' + a.score + deltaHtml + '</span>' : '<span class="muted">' + (Number.isFinite(a.lastKnownScore) ? a.lastKnownScore + ' (eski)' : '–') + '</span>') + '</td>' +
      '<td><span class="badge tone-' + a.tone + '">' + esc(a.label) + '</span></td>' +
      '</tr>';
  });
  html += '</tbody></table>';
  let count = $('#marketResultCount');
  if (!count && $('#marketSearch')) { count = document.createElement('span'); count.id = 'marketResultCount'; count.className = 'muted'; count.setAttribute('role', 'status'); $('#marketSearch').closest('.market-toolbar').appendChild(count); }
  if (count) count.textContent = list.length + ' sonuç';
  const query = marketUi[activeView] && marketUi[activeView].query;
  const failed = (DATA[activeView] || []).some((asset) => asset.__error);
  $('#tableWrap').innerHTML = list.length ? html : (query ? '<p class="muted">“' + esc(query) + '” aramasında sonuç yok. <button type="button" class="btn btn-secondary" id="marketClearSearch">Aramayı temizle</button></p>' : '<p class="muted">' + (failed ? 'Bu piyasanın kaynağına erişilemedi. Diğer piyasalar kullanılabilir.' : 'Bu pazarda kullanılabilir veri bulunamadı.') + ' <button type="button" class="btn btn-secondary" id="marketReadRetry">Veriyi tekrar oku</button></p>');
  if ($('#marketClearSearch')) $('#marketClearSearch').addEventListener('click', () => { marketUi[activeView].query = ''; $('#marketSearch').value = ''; renderTable(); $('#marketSearch').focus(); });
  if ($('#marketReadRetry')) $('#marketReadRetry').addEventListener('click', load);
  const openAsset = (idx) => {
      if (marketScroll[activeView] != null) marketScroll[activeView] = $('#tableWrap').scrollTop;
      saveRouteUi();
      const button = document.querySelector('#tableWrap .asset-open-btn[data-i="' + idx + '"]');
      detailReturnFocus = button;
      marketDetailOpen = true;
      if (button) button.setAttribute('aria-expanded', 'true');
      renderAssetDesk(list[idx]);
      if (typeof writeRoute === 'function') writeRoute(activeView, false, true);
      saveRouteUi();
      $('#view-market').classList.add('is-detail-open');
  };
  document.querySelectorAll('#tableWrap .asset-open-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => { event.stopPropagation(); openAsset(btn.dataset.i); });
  });
  document.querySelectorAll('#tableWrap tr.row').forEach((tr) => {
    tr.addEventListener('click', () => openAsset(tr.dataset.i));
  });
}

function renderErrors() {
  const box = $('#errorsBox');
  const errs = DATA.errors || [];
  if (!errs.length) { box.hidden = true; return; }
  box.hidden = false;
  $('#errorsList').innerHTML = errs.map((e) => '<li>' + esc(e) + '</li>').join('');
  const summary = box.querySelector('summary'); if (summary) summary.textContent = errs.length + ' kaynak sorunu · ayrıntıları aç';
}

/* ---------- Portföy Görünümü ---------- */
let portInitialized = false;

async function renderPortfolioView() {
  renderPortfolioLoadState();
  if (!portfolioData) {
    $('#portfolio-kpis').innerHTML = '';
    $('#portfolio-table-body').innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px;">Portföy verisi yüklenmeden bakiye gösterilmez.</td></tr>';
    const form = $('#portfolio-form');
    if (form) Array.from(form.elements).forEach((el) => { el.disabled = true; });
    return;
  }
  const form = $('#portfolio-form');
  if (form) Array.from(form.elements).forEach((el) => { el.disabled = portfolioSaving; });
  const pKpis = $('#portfolio-kpis');
  const pTableBody = $('#portfolio-table-body');
  const USDTRY = (DATA.fx && DATA.fx.usdtry) ? DATA.fx.usdtry : 38.0; // Anlık kur (DATA.fx.usdtry)
  
  let totalValueUSD = 0;
  let totalValueTRY = 0;
  let totalPnLUSD = 0;
  let totalPnLTRY = 0;
  let totalCostUSD = 0;
  
  const usHoldings = portfolioData.us || [];
  const bistHoldings = portfolioData.bist || [];
  const cryptoHoldings = portfolioData.crypto || [];
  const tableRows = [];
  
  const findAssetData = (sym, market) => {
    const list = DATA[market] || [];
    return list.find(x => x.symbol === sym || (market === 'crypto' && x.id === sym));
  };
  
  const processAsset = (h, market, cur) => {
    const asset = findAssetData(h.symbol, market);
    if (!asset || !Number.isFinite(Number(asset.price)) || Number(asset.price) <= 0) {
      tableRows.push({ symbol: h.symbol, name: 'Fiyat verisi yok', amount: h.amount, avgPrice: h.avgPrice, price: null, value: null, pnl: null, pnlPct: null, score: '–', rec: 'Veri yok', tone: 'hold', sigStr: '–', market, currency: cur, unpriced: true });
      return;
    }
    const price = asset.price;
    const value = h.amount * price;
    const cost = h.amount * h.avgPrice;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    const score = asset.analysis ? asset.analysis.score : '–';
    const rec = asset.analysis ? asset.analysis.label : '–';
    const tone = asset.analysis ? asset.analysis.tone : 'hold';
    
    const activeSigs = [];
    if (asset.ind && Number.isFinite(asset.analysis && asset.analysis.score)) {
      if (asset.ind.rsi >= 70) activeSigs.push('Aşırı Alım');
      if (asset.ind.rsi <= 30) activeSigs.push('Aşırı Satım');
      if (asset.ind.signals) {
        if (asset.ind.signals.goldenCross) activeSigs.push('Golden Cross ✨');
        if (asset.ind.signals.deathCross) activeSigs.push('Death Cross 💀');
      }
    }
    const sigStr = activeSigs.length ? activeSigs.join(', ') : '–';
    
    if (cur === 'USD') {
      totalValueUSD += value;
      totalPnLUSD += pnl;
      totalCostUSD += cost;
    } else {
      totalValueTRY += value;
      totalPnLTRY += pnl;
    }
    
    tableRows.push({
      symbol: asset.symbol,
      name: asset.name || asset.symbol,
      amount: h.amount,
      avgPrice: h.avgPrice,
      price,
      value,
      pnl,
      pnlPct,
      score,
      rec,
      tone,
      sigStr,
      market,
      currency: cur
    });
  };
  
  usHoldings.forEach(h => processAsset(h, 'us', 'USD'));
  cryptoHoldings.forEach(h => processAsset(h, 'crypto', 'USD'));
  bistHoldings.forEach(h => processAsset(h, 'bist', 'TRY'));
  
  const finalValueUSD = totalValueUSD + (totalValueTRY / USDTRY);
  const finalValueTRY = (totalValueUSD * USDTRY) + totalValueTRY;
  const finalPnLUSD = totalPnLUSD + (totalPnLTRY / USDTRY);
  const finalPnLTRY = (totalPnLUSD * USDTRY) + totalPnLTRY;
  const finalCostUSD = finalValueUSD - finalPnLUSD;
  const finalPnLPercent = finalCostUSD > 0 ? (finalPnLUSD / finalCostUSD) * 100 : 0;
  
  let riskLabel = 'Risk profili hesaplanamadı';
  let riskCls = 'sent-neu';
  
  let cryptoVal = 0;
  cryptoHoldings.forEach(h => {
    const asset = findAssetData(h.symbol, 'crypto');
    if (asset) cryptoVal += h.amount * (asset.price || 0);
  });
  const cryptoWeightPct = finalValueUSD > 0 ? (cryptoVal / finalValueUSD) * 100 : 0;
  const maxHolding = tableRows.reduce((max, row) => Math.max(max, finalValueUSD > 0 ? ((row.currency === 'TRY' ? row.value / USDTRY : row.value) / finalValueUSD) * 100 : 0), 0);
  const riskPlan = window.FinansActionLayer && window.FinansActionLayer.buildPortfolioRiskPlan
    ? window.FinansActionLayer.buildPortfolioRiskPlan({ data: DATA, portfolioData, usdtry: USDTRY }) : null;
  const binding = riskPlan && riskPlan.bindingConstraint ? String(riskPlan.bindingConstraint) : '';
  if (tableRows.length) {
    if (binding || maxHolding >= 50 || cryptoWeightPct > 50) { riskLabel = 'Yoğunlaşma / risk kısıtı'; riskCls = 'sent-cau'; }
    else { riskLabel = 'Dağılım izleniyor'; riskCls = 'sent-neu'; }
  }
  

  const unpricedCount = tableRows.filter((row) => row.unpriced).length;
  if (unpricedCount) { riskLabel = 'Eksik fiyat · risk hesaplanamadı'; riskCls = 'sent-neu'; }
  pKpis.innerHTML = `
    <div class="kpi">
      <div class="label">Portföy Büyüklüğü (TL)</div>
      <div class="value">${fmtPrice(finalValueTRY, 'TRY')}<small>Anlık kur: 1 USD = ${USDTRY.toFixed(2)} TL</small></div>
    </div>
    <div class="kpi">
      <div class="label">Portföy Büyüklüğü (USD)</div>
      <div class="value">${fmtPrice(finalValueUSD, 'USD')}<small>Toplam varlık değeri</small></div>
    </div>
    <div class="kpi">
      <div class="label">Net Kâr / Zarar</div>
      <div class="value ${finalPnLUSD >= 0 ? 'pos' : 'neg'}">${fmtPrice(finalPnLUSD, 'USD')} (${fmtPct(finalPnLPercent)})<small>TL: ${fmtPrice(finalPnLTRY, 'TRY')} · kur dönüşümü ayrı gösterilir</small></div>
    </div>
    <div class="kpi">
      <div class="label">Risk Profili</div>
      <div class="value"><span class="sent-pill ${riskCls}" style="font-size: 14px; padding: 4px 10px; font-weight:700;">${riskLabel}</span><small>En yüksek ağırlık: %${fmtNum(maxHolding, 1)} · kripto: %${fmtNum(cryptoWeightPct, 1)}${binding ? ' · ' + esc(binding) : ''}</small></div>
    </div>
    ${unpricedCount ? '<p class="portfolio-data-warning" role="status">' + unpricedCount + ' pozisyonun fiyatı yok. Tutarlar yalnız fiyatı bulunan pozisyonları kapsar; ağırlık ve toplam risk hesaplanamadı.</p>' : ''}
    <div class="infl-note"><b>Kur notu:</b> USD ve TL tutarları ayrı gösterilir; kur dönüşümü performansın reel ölçümü değildir.</div>
  `;
  
  if (!tableRows.length) {
    pTableBody.innerHTML = '<tr><td colspan="11" class="muted" style="text-align:center;padding:24px;">Portföyünüzde henüz varlık yok. Ekleme formunu kullanarak başlayabilirsiniz.</td></tr>';
  } else {
    const portfolioTable = pTableBody.closest('table');
    if (portfolioTable && portfolioTable.tHead && !portfolioTable.tHead.querySelector('[data-weight-head]')) { const th = document.createElement('th'); th.dataset.weightHead = 'true'; th.textContent = 'Ağırlık'; portfolioTable.tHead.rows[0].insertBefore(th, portfolioTable.tHead.rows[0].children[6]); }
    pTableBody.innerHTML = tableRows.map((r) => {
      const pnlCls = r.pnl >= 0 ? 'pos' : 'neg';
      const weight = !unpricedCount && finalValueUSD > 0 ? ((r.currency === 'TRY' ? r.value / USDTRY : r.value) / finalValueUSD) * 100 : null;
      return `
        <tr>
          <td><span class="sym">${r.symbol}</span><div class="coname">${r.name}</div></td>
          <td>${fmtQty(r.amount)}</td>
          <td>${fmtPrice(r.avgPrice, r.currency)}</td>
          <td>${fmtPrice(r.price, r.currency)}</td>
          <td><b>${fmtPrice(r.value, r.currency)}</b></td>
          <td class="${pnlCls}"><b>${fmtPrice(r.pnl, r.currency)} (${fmtPct(r.pnlPct)})</b></td>
          <td>${weight == null ? '–' : '%' + fmtNum(weight, 1)}</td>
          <td>${r.score}</td>
          <td><span class="badge tone-${r.tone}">${r.rec}</span></td>
          <td>${r.sigStr === '–' ? '<span class="muted">–</span>' : `<span style="color:var(--orange); font-weight:600">${r.sigStr}</span>`}</td>
          <td><button class="btn btn-secondary portfolio-edit-btn" type="button" data-edit-market="${r.market}" data-edit-symbol="${r.symbol}">Düzenle</button><button class="btn" style="background:var(--red-soft);color:#ff6b73;border:1px solid rgba(234,57,67,.3);padding:4px 8px;font-size: 12px;box-shadow:none;" onclick="deletePortfolioAsset('${r.market}', '${r.symbol}')">Sil</button></td>
        </tr>
      `;
    }).join('');
    pTableBody.querySelectorAll('[data-edit-market]').forEach((button) => button.addEventListener('click', () => editPortfolioAsset(button.dataset.editMarket, button.dataset.editSymbol)));
  }
  if (!unpricedCount) renderPortfolioAllocation(tableRows, finalValueUSD);
  else { renderPortfolioAllocation([], 0); const allocation = $('#portfolioAllocation'); if (allocation) allocation.textContent = 'Eksik fiyat nedeniyle tam portföy dağılımı hesaplanamadı.'; }
  renderPortfolioChart(totalValueUSD - cryptoVal, cryptoVal, totalValueTRY / USDTRY);
  renderPortfolioRiskPlan();
  
  if (!portInitialized) {
    portInitialized = true;
    $('#port-market-sel').addEventListener('change', () => {
      const m = $('#port-market-sel').value;
      const list = portfolioSymbolOptions(m);
      $('#port-symbol-sel').innerHTML = list.map(x => `<option value="${x.symbol}">${x.symbol} (${x.name || ''})</option>`).join('');
      syncPortfolioEditor(true);
    });
    $('#port-symbol-sel').addEventListener('change', () => syncPortfolioEditor(true));
    
    $('#portfolio-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (portfolioSaving) return;
      const m = $('#port-market-sel').value;
      const sym = $('#port-symbol-sel').value;
      const amt = parseFloat($('#port-amount-input').value);
      const prc = parseFloat($('#port-price-input').value);
      const submittedInputStamp = inputStamp(e.currentTarget);
      const portfolioForm = e.currentTarget;
      
      const candidate = JSON.parse(JSON.stringify(portfolioData));
      const holdings = candidate[m] || [];
      const existing = holdings.find(h => h.symbol === sym);
      if (existing) {
        existing.amount = amt;
        existing.avgPrice = prc;
      } else {
        holdings.push({ symbol: sym, amount: amt, avgPrice: prc });
      }
      candidate[m] = holdings;
      portfolioSaving = true;
      const submit = noteFormButton(e.currentTarget);
      if (submit) submit.disabled = true;
      const saved = await savePortfolio(candidate);
      portfolioSaving = false;
      const status = $('#portfolioStatus');
      const editedDuringSave = inputStamp(portfolioForm) !== submittedInputStamp;
      if (status) status.textContent = saved ? (editedDuringSave ? 'Önceki kayıt tamamlandı. Yeni değişiklikler taslak; kaydetmeniz gerekiyor.' : 'Kaydedildi: mevcut pozisyon güncellendi.') : 'Kaydedilemedi. Girdileriniz korunuyor; tekrar deneyin.';
      if (saved) {
        portfolioData = candidate;
        renderPortfolioView();
        if (!editedDuringSave) {
          $('#port-amount-input').value = '';
          $('#port-price-input').value = '';
        }
      }
      if (submit) submit.disabled = false;
    });
  }

  // Her render işleminde sembol listesini doldur
  const m = $('#port-market-sel').value;
  const selectedSymbol = $('#port-symbol-sel').value;
  const list = portfolioSymbolOptions(m);
  $('#port-symbol-sel').innerHTML = list.map(x => `<option value="${x.symbol}">${x.symbol} (${x.name || ''})</option>`).join('');
  if (selectedSymbol && list.some((x) => x.symbol === selectedSymbol)) $('#port-symbol-sel').value = selectedSymbol;
  syncPortfolioEditor();
  triggerRevealAnimations($('#view-portfolio'));
}

function portfolioSymbolOptions(market) {
  const list = [...(DATA[market] || [])];
  for (const holding of (portfolioData && portfolioData[market]) || []) {
    if (!list.some((asset) => asset.symbol === holding.symbol)) list.push({symbol: holding.symbol, name: 'Fiyat verisi bulunmayan mevcut pozisyon'});
  }
  return list;
}

function syncPortfolioEditor(prefill = false) {
  const market = $('#port-market-sel'); const symbol = $('#port-symbol-sel');
  const amount = $('#port-amount-input'); const price = $('#port-price-input');
  if (!market || !symbol || !amount || !price || !portfolioData) return;
  const existing = (portfolioData[market.value] || []).find((x) => x.symbol === symbol.value);
  const status = $('#portfolioStatus');
  if (prefill === true && !existing) { amount.value = ''; price.value = ''; if (status) status.textContent = 'Yeni pozisyon'; }
  if (prefill === true && existing) {
    amount.value = existing.amount;
    price.value = existing.avgPrice;
    if (status && !portfolioSaving) status.textContent = 'Mevcut pozisyon düzenleniyor: ' + fmtQty(existing.amount) + ' adet · ' + fmtPrice(existing.avgPrice, market.value === 'bist' ? 'TRY' : 'USD');
  }
  const form = $('#portfolio-form');
  if (form && !form.querySelector('.portfolio-edit-note')) {
    const copy = document.createElement('p'); copy.className = 'portfolio-edit-note muted'; copy.textContent = 'Bu kayıt mevcut pozisyonun toplam adet ve ortalama maliyetini günceller.'; form.insertBefore(copy, form.querySelector('button[type="submit"]') || null);
    const preview = document.createElement('p'); preview.id = 'portfolioEditPreview'; preview.className = 'portfolio-edit-preview muted'; form.insertBefore(preview, form.querySelector('button[type="submit"]') || null);
    [amount, price].forEach((input) => input.addEventListener('input', syncPortfolioEditor));
  }
  const preview = $('#portfolioEditPreview');
  if (preview) { const nextAmount = Number(amount.value); const nextPrice = Number(price.value); preview.textContent = existing ? ('Eski: ' + fmtQty(existing.amount) + ' adet · ' + fmtPrice(existing.avgPrice, market.value === 'bist' ? 'TRY' : 'USD') + ' → Yeni: ' + (Number.isFinite(nextAmount) ? fmtQty(nextAmount) : '–') + ' adet · ' + (Number.isFinite(nextPrice) ? fmtPrice(nextPrice, market.value === 'bist' ? 'TRY' : 'USD') : '–')) : 'Yeni pozisyon kaydı'; }
}

function editPortfolioAsset(market, symbol) {
  const marketSelect = $('#port-market-sel'); const symbolSelect = $('#port-symbol-sel');
  if (!marketSelect || !symbolSelect) return;
  marketSelect.value = market; marketSelect.dispatchEvent(new Event('change'));
  symbolSelect.value = symbol; symbolSelect.dispatchEvent(new Event('change'));
  const amount = $('#port-amount-input'); if (amount) amount.focus();
}
window.editPortfolioAsset = editPortfolioAsset;
function renderPortfolioAllocation(rows, totalUsd) {
  let el = $('#portfolioAllocation'); const anchor = $('#portAllocChart');
  if (!el && anchor && anchor.parentElement) { el = document.createElement('div'); el.id = 'portfolioAllocation'; el.className = 'portfolio-allocation-bar'; anchor.parentElement.insertBefore(el, anchor); }
  if (!el) return;
  const fx = (DATA.fx && DATA.fx.usdtry) || 38;
  const valid = rows.filter((r) => totalUsd > 0).map((r) => ({ ...r, pct: ((r.currency === 'TRY' ? r.value / fx : r.value) / totalUsd) * 100 }));
  el.innerHTML = valid.length ? '<div class="allocation-track" role="img" aria-label="Portföy ağırlık dağılımı">' + valid.map((r) => '<span style="width:' + r.pct.toFixed(2) + '%" title="' + esc(r.symbol) + ' %' + r.pct.toFixed(1) + '"></span>').join('') + '</div><div class="allocation-legend">' + valid.map((r) => '<span><b>' + esc(r.symbol) + '</b> %' + fmtNum(r.pct, 1) + '</span>').join('') + '</div>' : '<p class="muted">Dağılım için kullanılabilir pozisyon verisi yok.</p>';
}

function noteFormButton(form) { return form.querySelector('button[type="submit"]'); }
async function savePortfolio(candidate = portfolioData) {
  try {
    const res = await authedFetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate)
    });
    if (!res.ok) {
      return false;
    }
    return true;
  } catch (e) {
    console.error('Portföy kaydedilemedi:', e);
    return false;
  }
}

async function deletePortfolioAsset(market, symbol) {
  if (portfolioSaving) {
    const status = $('#portfolioStatus');
    if (status) status.textContent = 'Başka bir portföy kaydı sürüyor. Tamamlandıktan sonra tekrar deneyin.';
    return;
  }
  if (!confirm(`${symbol} varlığını portföyden silmek istediğinize emin misiniz?`)) return;
  const candidate = JSON.parse(JSON.stringify(portfolioData));
  candidate[market] = (candidate[market] || []).filter(h => h.symbol !== symbol);
  const status = $('#portfolioStatus');
  if (status) status.textContent = 'Siliniyor…';
  portfolioSaving = true;
  const form = $('#portfolio-form');
  const submit = form && noteFormButton(form);
  if (submit) submit.disabled = true;
  try {
    if (await savePortfolio(candidate)) { portfolioData = candidate; if (status) status.textContent = 'Varlık silindi.'; }
    else if (status) status.textContent = 'Varlık silinemedi; portföy değişmedi.';
  } finally {
    portfolioSaving = false;
    if (submit) submit.disabled = false;
    renderPortfolioView();
  }
}
window.deletePortfolioAsset = deletePortfolioAsset;

function renderPortfolioChart(usVal, cryptoVal, bistVal) {
  if (portAllocChart) portAllocChart.destroy();
  const canvas = $('#portAllocChart');
  if (!canvas || !window.Chart) return;
  
  const total = usVal + cryptoVal + bistVal;
  if (total === 0) return;
  
  const data = [
    { label: 'ABD Hisseleri', val: Math.round((usVal / total) * 100) },
    { label: 'Kripto Paralar', val: Math.round((cryptoVal / total) * 100) },
    { label: 'BIST Varlıkları', val: Math.round((bistVal / total) * 100) }
  ].filter(x => x.val > 0);
  
  portAllocChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(x => x.label),
      datasets: [{
        data: data.map(x => x.val),
        backgroundColor: [CHART.accent, CHART.violet, CHART.teal],
        borderColor: '#12151b',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 500 },
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: chartLabelColor(), boxWidth: 12, font: { size: 12, family: 'Plus Jakarta Sans' } }
        },
        tooltip: {
          callbacks: { label: (x) => x.label + ': %' + x.raw }
        }
      }
    }
  });
}

/* ---------- Teknik Tarayıcı Görünümü ---------- */
function renderScreenerView() {
  const view = $('#view-screener');
  if (!view || !DATA) return;
  let mount = $('#screenerTableMount');
  if (!mount) {
    mount = document.createElement('div'); mount.id = 'screenerTableMount'; mount.className = 'screener-workspace';
    view.insertBefore(mount, view.firstElementChild);
  }
  const all = [].concat(...['us', 'bist', 'crypto'].map((market) => (DATA[market] || []).filter((x) => x.analysis && x.analysis.score != null).map((x) => ({ ...x, market }))));
  const signals = (x) => {
    const i = x.ind || {}, s = i.signals || {}, out = [];
    if (i.rsi <= 35 || (i.bollinger && i.bollinger.pctB <= 0)) out.push('Aşırı satım · ' + (i.rsi <= 35 ? 'RSI ' + i.rsi : 'alt bant'));
    if (i.rsi >= 68 || (i.bollinger && i.bollinger.pctB >= 1)) out.push('Aşırı alım · ' + (i.rsi >= 68 ? 'RSI ' + i.rsi : 'üst bant'));
    if (i.volSpike >= 1.5 && i.rsi > 50) out.push('Hacimli kırılım · ' + Math.round(i.volSpike * 100) + '%');
    if (s.deathCross || (i.rsi <= 30 && x.analysis.score <= 30)) out.push(s.deathCross ? 'Ayı/trend · Death Cross' : 'Ayı/trend · RSI ' + i.rsi);
    if ((x.decision && x.decision.contradictions || []).length) out.push('Çelişki · ' + x.decision.contradictions.map((c) => c.label).join(', '));
    return out;
  };
  const query = screenerState.query.trim().toLocaleLowerCase('tr-TR');
  let rows = all.map((x) => ({ x, signals: signals(x) })).filter((item) => item.signals.length);
  if (query) rows = rows.filter(({ x }) => (x.symbol + ' ' + (x.name || '')).toLocaleLowerCase('tr-TR').includes(query));
  if (screenerState.market !== 'all') rows = rows.filter(({ x }) => x.market === screenerState.market);
  if (screenerState.category !== 'all') rows = rows.filter(({ signals: list }) => list.some((signal) => signal.indexOf(screenerState.category) === 0));
  rows.sort((a, b) => screenerState.sort === 'name' ? a.x.symbol.localeCompare(b.x.symbol) : screenerState.sort === 'change' ? (b.x.changePct || -Infinity) - (a.x.changePct || -Infinity) : b.x.analysis.score - a.x.analysis.score);
  const pages = Math.max(1, Math.ceil(rows.length / screenerState.pageSize)); screenerState.page = Math.min(screenerState.page, pages);
  const pageRows = rows.slice((screenerState.page - 1) * screenerState.pageSize, screenerState.page * screenerState.pageSize);
  mount.innerHTML = '<div class="screener-toolbar" role="search"><label>Varlık ara <input id="screenerQuery" type="search" value="' + esc(screenerState.query) + '" placeholder="Sembol veya şirket" /></label><label>Piyasa <select id="screenerMarket"><option value="all">Tümü</option><option value="us">ABD</option><option value="bist">BIST</option><option value="crypto">Kripto</option></select></label><label>Sinyal <select id="screenerCategory"><option value="all">Tümü</option><option>Aşırı satım</option><option>Aşırı alım</option><option>Hacimli kırılım</option><option>Ayı/trend</option><option>Çelişki</option></select></label><label>Satır <select id="screenerPageSize"><option>25</option><option>50</option><option>100</option></select></label><button type="button" class="btn btn-secondary" id="screenerClear">Filtreleri temizle</button></div>' +
    '<div class="screener-table-wrap"><table class="screener-table"><thead><tr><th aria-sort="' + (screenerState.sort === 'name' ? 'ascending' : 'none') + '"><button type="button" data-screen-sort="name">Sembol</button></th><th>Piyasa</th><th>Fiyat</th><th>Sinyaller</th><th aria-sort="' + (screenerState.sort === 'score' ? 'descending' : 'none') + '"><button type="button" data-screen-sort="score">Teknik puan</button></th><th>İşlem</th></tr></thead><tbody>' +
      (pageRows.length ? pageRows.map(({ x, signals: list }) => '<tr><td><button type="button" class="asset-symbol-open" data-screen-market="' + x.market + '" data-screen-symbol="' + esc(x.symbol) + '"><b>' + esc(x.symbol) + '</b><span>' + esc(x.name || '') + '</span></button></td><td>' + ({ us: 'ABD', bist: 'BIST', crypto: 'Kripto' }[x.market]) + '</td><td>' + fmtPrice(x.price, x.currency) + '</td><td>' + list.map((s) => '<span class="chip">' + esc(s) + '</span>').join(' ') + '</td><td>' + x.analysis.score + '</td><td><button type="button" class="btn btn-secondary" data-screen-test="' + x.market + ':' + esc(x.symbol) + '">Teste aktar</button></td></tr>').join('') : '<tr><td colspan="6" class="muted">Aktif filtrelerle eşleşen sonuç yok. Filtreleri temizleyin.</td></tr>') +
    '</tbody></table></div><div class="screener-pagination" aria-live="polite"><span>' + rows.length + ' sonuç · Sayfa ' + screenerState.page + '/' + pages + '</span><button type="button" class="btn" id="screenerPrev"' + (screenerState.page <= 1 ? ' disabled' : '') + '>Önceki</button><button type="button" class="btn" id="screenerNext"' + (screenerState.page >= pages ? ' disabled' : '') + '>Sonraki</button></div>';
  $('#screenerMarket').value = screenerState.market; $('#screenerCategory').value = screenerState.category; $('#screenerPageSize').value = String(screenerState.pageSize);
  mount.querySelectorAll('[data-screen-sort]').forEach((b) => b.addEventListener('click', () => { const sort = b.dataset.screenSort; screenerState.sort = sort; screenerState.page = 1; renderScreenerView(); mount.querySelector('[data-screen-sort="'+sort+'"]').focus(); saveRouteUi(); }));
  $('#screenerQuery').addEventListener('input', (e) => { const pos = e.target.selectionStart; screenerState.query = e.target.value; screenerState.page = 1; renderScreenerView(); const input = $('#screenerQuery'); if (input) { input.focus(); input.setSelectionRange(pos, pos); } });
  $('#screenerMarket').addEventListener('change', (e) => { screenerState.market = e.target.value; screenerState.page = 1; renderScreenerView(); });
  $('#screenerCategory').addEventListener('change', (e) => { screenerState.category = e.target.value; screenerState.page = 1; renderScreenerView(); });
  $('#screenerPageSize').addEventListener('change', (e) => { screenerState.pageSize = Number(e.target.value); screenerState.page = 1; renderScreenerView(); });
  $('#screenerClear').addEventListener('click', () => { screenerState = { query: '', market: 'all', category: 'all', sort: 'score', page: 1, pageSize: screenerState.pageSize }; renderScreenerView(); });
  $('#screenerPrev').addEventListener('click', () => { screenerState.page--; renderScreenerView(); }); $('#screenerNext').addEventListener('click', () => { screenerState.page++; renderScreenerView(); });
  mount.querySelectorAll('[data-screen-market]').forEach((b) => b.addEventListener('click', () => navigateToAsset(b.dataset.screenMarket, b.dataset.screenSymbol)));
  mount.querySelectorAll('[data-screen-test]').forEach((b) => b.addEventListener('click', () => { setView('backtest'); setTimeout(() => { const s = $('#bt-asset-sel'); if (s) { s.value = b.dataset.screenTest; s.dispatchEvent(new Event('change', {bubbles:true})); } }, 0); }));
  const oldGrid = view.querySelector('.screener-grid'); if (oldGrid) oldGrid.hidden = true;
  return;
}

function navigateToAsset(market, symbol) {
  const list = DATA && DATA[market] ? DATA[market] : [];
  const asset = list.find((x) => x.symbol === symbol || (market === 'crypto' && x.id === symbol));
  if (!asset) return;
  saveRouteUi();
  marketUi[market].symbol = asset.symbol;
  marketDetailOpen = true;
  setView(market, {preserveCurrentSnapshot:true});
}
window.navigateToAsset = navigateToAsset;

/* ---------- Strateji testi görünümü ---------- */
let btInitialized = false;

function renderBacktestView() {
  const assetSel = $('#bt-asset-sel');
  if (!btInitialized) {
    btInitialized = true;
    
    const allOptions = [];
    const addOptions = (list, market, label) => {
      list.forEach(x => {
        allOptions.push(`<option value="${market}:${x.symbol}">${label}: ${x.symbol} (${x.name || ''})</option>`);
      });
    };
    addOptions(DATA.us || [], 'us', 'ABD');
    addOptions(DATA.bist || [], 'bist', 'BIST');
    (DATA.crypto || []).forEach(x => {
      allOptions.push(`<option value="crypto:${x.symbol}">Kripto: ${x.symbol.toUpperCase()} (${x.name || x.symbol})</option>`);
    });
    
    assetSel.innerHTML = allOptions.join('');
    
    bindResultInputs($('#backtest-form'), $('#backtest-results-container'), 'test');
    $('#backtest-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const runBtn = $('#bt-run-btn');
      if (runBtn && runBtn.disabled) return;
      const request = ++backtestRequest;
      const formStamp = inputStamp($('#backtest-form'));
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="btn-ic">↻</span> Simüle Ediliyor...';
      runBtn.classList.add('loading');
      formActionState(e.currentTarget, 'Test çalışıyor. Son başarılı sonuç korunuyor.');
      
      const assetVal = assetSel.value.split(':');
      const market = assetVal[0];
      const symbol = assetVal[1];
      const buyThreshold = parseInt($('#bt-buy-input').value);
      const sellThreshold = parseInt($('#bt-sell-input').value);
      const stopLoss = parseFloat($('#bt-sl-input').value) || null;
      const takeProfit = parseFloat($('#bt-tp-input').value) || null;
      
      try {
        const res = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, market, buyThreshold, sellThreshold, stopLoss, takeProfit })
        });
        const result = await res.json();
        
        if (result.error) {
          formActionState($('#backtest-form'), 'Test tamamlanamadı: ' + result.error + '. Girdiler ve son sonuç korunuyor.');
          return;
        }
        
        if (request === backtestRequest) { displayBacktestResults(result, { label: formStamp === inputStamp($('#backtest-form')) ? 'Güncel test sonucu' : 'Önceki test sonucu · girdiler değişti', formStamp, snapshot: { market, symbol, buyThreshold, sellThreshold, stopLoss, takeProfit } }); formActionState($('#backtest-form'), 'Test tamamlandı.'); }
      } catch (err) {
        formActionState($('#backtest-form'), 'Test tamamlanamadı: bağlantı hatası. Girdiler ve son sonuç korunuyor; tekrar deneyin.');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">▶</span> Testi Çalıştır';
        runBtn.classList.remove('loading');
      }
    });
  }
}

function displayBacktestResults(res, meta = {}) {
  backtestResult = res;
  const container = $('#backtest-results-container');
  container.hidden = false;
  container.dataset.inputStamp = meta.formStamp || inputStamp($('#backtest-form'));
  container.dataset.resultDescription = (meta.snapshot ? meta.snapshot.symbol + ' · AL eşiği ' + meta.snapshot.buyThreshold + ' / SAT eşiği ' + meta.snapshot.sellThreshold + ' · stop %' + (meta.snapshot.stopLoss || 'kapalı') + ' · hedef %' + (meta.snapshot.takeProfit || 'kapalı') : '');
  renderBacktestStory(res, meta);
  
  const pKpis = $('#backtest-kpis');
  const retCls = res.strategyReturn >= 0 ? 'pos' : 'neg';
  const bhCls = res.bhReturn >= 0 ? 'pos' : 'neg';
  const currencySym = res.currency === 'TRY' ? '₺' : '$';
  
  pKpis.innerHTML = `
    <div class="result-state" role="status">${res.trades && res.trades.length ? 'Son test sonucu' : 'Son test sonucu · 0 işlem'}</div>
    <div class="kpi">
      <div class="label">Başlangıç Sermayesi</div>
      <div class="value">${currencySym}${fmtNum(res.initialCapital, 0)}</div>
    </div>
    <div class="kpi">
      <div class="label">Strateji Bakiye (Bitiş)</div>
      <div class="value">${currencySym}${fmtNum(res.finalCapital, 2)}</div>
    </div>
    <div class="kpi">
      <div class="label">Strateji Getirisi</div>
      <div class="value ${retCls}">${fmtPct(res.strategyReturn)}<small>Toplam ${(res.trades || []).filter(t => t.type === 'SELL').length} kapanan işlem</small></div>
    </div>
    <div class="kpi">
      <div class="label">Al-Tut Getirisi</div>
      <div class="value ${bhCls}">${fmtPct(res.bhReturn)}<small>Pasif yatırım getirisi</small></div>
    </div>
  `;
  
  const tableBody = $('#backtest-trades-body');
  if (!res.trades || !res.trades.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px;">Simülasyon süresince hiç işlem gerçekleşmedi.</td></tr>';
  } else {
    tableBody.innerHTML = res.trades.map(t => {
      const pnlHtml = t.type === 'BUY' ? '–' : `<span class="${t.pnlPct >= 0 ? 'pos' : 'neg'}">${fmtPct(t.pnlPct)}</span>`;
      const reasonHtml = t.reason ? t.reason : 'Alım Sinyali (Skor)';
      return `
        <tr>
          <td>Gün ${t.day}</td>
          <td><span class="badge ${t.type === 'BUY' ? 'tone-buy' : 'tone-sell'}">${t.type}</span></td>
          <td>${currencySym}${fmtNum(t.price, 2)}</td>
          <td>${pnlHtml}</td>
          <td>${reasonHtml}</td>
          <td><b>${currencySym}${fmtNum(t.capitalAfter || t.capitalBefore, 2)}</b></td>
        </tr>
      `;
    }).join('');
  }
  
  drawBacktestChart(res);
  triggerRevealAnimations(container);
}

function renderBacktestStory(res, meta = {}) {
  const story = $('#backtest-story');
  if (!story) return;
  const sells = (res.trades || []).filter((t) => t.type === 'SELL');
  const buys = (res.trades || []).filter((t) => t.type === 'BUY');
  const wins = sells.filter((t) => t.pnlPct > 0).length;
  const winRate = sells.length ? Math.round((wins / sells.length) * 100) : 0;
  const diff = Math.round(((res.strategyReturn || 0) - (res.bhReturn || 0)) * 100) / 100;
  const diffText = diff >= 0
    ? 'Strateji al-tut yaklaşımını ' + fmtPct(diff) + ' geçti.'
    : 'Strateji al-tut yaklaşımının ' + fmtPct(Math.abs(diff)) + ' gerisinde kaldı.';
  const resultTone = res.strategyReturn >= 0 ? 'pos' : 'neg';
  const diffTone = diff >= 0 ? 'pos' : 'neg';
  const tradeText = sells.length
    ? sells.length + ' kapanan işlem, yaklaşık %' + winRate + ' isabet.'
    : 'Bu eşiklerde kapanan işlem oluşmadı.';
  const riskText = [
    res.stopLoss ? 'Stop: %' + res.stopLoss : 'Stop kapalı',
    res.takeProfit ? 'Kar al: %' + res.takeProfit : 'Kar al kapalı',
  ].join(' · ');
  story.innerHTML = '<p class="result-state" role="status">' + esc(meta.label || 'Test sonucu') + (meta.snapshot ? ' · ' + esc(meta.snapshot.symbol) + ' · eşikler ' + esc(String(meta.snapshot.buyThreshold)) + '/' + esc(String(meta.snapshot.sellThreshold)) : '') + '</p>' +
    '<div class="bt-story-card">' +
      '<span class="bt-kicker">Ne test edildi?</span>' +
      '<b>' + esc(res.symbol) + ' için skor eşiği stratejisi</b>' +
      '<p>Skor ' + res.buyThreshold + ' ve üstüne çıktığında alım, ' + res.sellThreshold + ' ve altına indiğinde çıkış denendi. ' + esc(riskText) + '.</p>' +
    '</div>' +
    '<div class="bt-story-card">' +
      '<span class="bt-kicker">Sonuç</span>' +
      '<b class="' + resultTone + '">' + fmtPct(res.strategyReturn) + ' strateji getirisi</b>' +
      '<p>' + esc(tradeText) + ' Başlangıç 10.000, bitiş ' + fmtPrice(res.finalCapital, res.currency) + '.</p>' +
    '</div>' +
    '<div class="bt-story-card">' +
      '<span class="bt-kicker">Karşılaştırma</span>' +
      '<b class="' + diffTone + '">' + esc(diffText) + '</b>' +
      '<p>Bu sonuç tek başına al/sat kuralı değildir; farklı eşikler ve piyasa rejimleriyle tekrar denenmeli.</p>' +
    '</div>';
  // Derinlik: "ne zaman çalışır / ne zaman bozulur" + max düşüş (public/insights.js)
  const ins = window.FinansInsights ? window.FinansInsights.explainBacktest(res) : null;
  if (ins) {
    story.innerHTML +=
      '<div class="bt-story-card"><span class="bt-kicker">Ne zaman çalışır?</span>' +
        '<b class="' + (ins.closedTrades ? (ins.headlineTone === 'neg' ? 'neg' : ins.headlineTone === 'warn' ? '' : 'pos') : '') + '">' + (ins.closedTrades ? 'İsabet %' + ins.winRate + ' · ' + ins.closedTrades + ' kapanan işlem' : 'İsabet hesaplanamadı · kapanan işlem yok') + '</b>' +
        '<p>' + esc(ins.worksWhen) + '</p></div>' +
      '<div class="bt-story-card warn"><span class="bt-kicker">Ne zaman bozulur?</span>' +
        '<b>Max düşüş %' + ins.maxDrawdown + '</b>' +
        '<p>' + esc(ins.breaksWhen) + '</p></div>';
  } else if (!buys.length) {
    story.innerHTML += '<div class="bt-story-card warn"><span class="bt-kicker">Okuma notu</span><b>Alım sinyali yok</b><p>Eşikler bu varlık için fazla seçici olabilir. Alım eşiğini düşürüp tekrar deneyin.</p></div>';
  }
  // Risk-ayarlı metrikler + yarı-dönem tutarlılığı (dürüstlük)
  if (res.sharpe != null || res.firstHalfReturn != null) {
    const consistent = (res.firstHalfReturn != null && res.secondHalfReturn != null)
      ? ((res.firstHalfReturn > 0) === (res.secondHalfReturn > 0))
      : null;
    const consText = !sells.length ? 'kapanan işlem yok; strateji başarısı ölçülemiyor'
      : consistent == null ? 'tek dönem değerlendirildi'
      : consistent ? 'iki yarıda getirinin yönü aynı; bu tek başına güvenilirlik kanıtı değildir'
      : 'yalnızca bir yarıda çalıştı — şansa/rejime duyarlı, dikkat';
    story.innerHTML +=
      '<div class="bt-story-card"><span class="bt-kicker">Risk-ayarlı</span>' +
        '<b class="' + (res.sharpe != null && res.sharpe > 0 ? 'pos' : 'neg') + '">Sharpe ' + (res.sharpe != null ? res.sharpe : '–') + ' · Sortino ' + (res.sortino != null ? res.sortino : '–') + '</b>' +
        '<p>Yarı-dönem: 1.yarı ' + (res.firstHalfReturn != null ? fmtPct(res.firstHalfReturn) : '–') + ' / 2.yarı ' + (res.secondHalfReturn != null ? fmtPct(res.secondHalfReturn) : '–') + ' — ' + consText + '.</p></div>';
  }
}

function drawBacktestChart(res) {
  if (backtestChart) backtestChart.destroy();
  const canvas = $('#backtestChart');
  if (!canvas) return;
  
  const curve = res.equityCurve || [];
  const labels = curve.map(c => `Gün ${c.day}`);
  const strategyData = curve.map(c => c.total);
  const initialPrice = curve[0] ? curve[0].price : 1;
  const bhData = curve.map(c => (c.price / initialPrice) * res.initialCapital);

  // Al/Sat marker'ları: işlem günlerini sermaye eğrisinde işaretle
  const dayToIdx = {};
  curve.forEach((c, i) => { dayToIdx[c.day] = i; });
  const buyPts = new Array(curve.length).fill(null);
  const sellPts = new Array(curve.length).fill(null);
  (res.trades || []).forEach(t => {
    const idx = dayToIdx[t.day];
    if (idx == null || !curve[idx]) return;
    if (t.type === 'BUY') buyPts[idx] = curve[idx].total;
    else sellPts[idx] = curve[idx].total;
  });

  renderChartDataTable(canvas, 'Geçmiş test sermaye eğrisi', ['Gün', 'Strateji sermayesi', 'Al-tut sermayesi', 'İşlem'], curve.map((c, index) => [c.day, fmtNum(strategyData[index], 2), fmtNum(bhData[index], 2), (res.trades || []).filter((trade) => trade.day === c.day).map((trade) => trade.type === 'BUY' ? 'Alış' : 'Satış').join(', ') || '–']));
  if (!window.Chart) return;
  backtestChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Strateji Getirisi',
          data: strategyData,
          borderColor: CHART.accent,
          backgroundColor: chartGradient(canvas, CHART.accent, 0.16),
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1
        },
        {
          label: 'Al-Tut Getirisi (Normalleştirilmiş)',
          data: bhData,
          borderColor: CHART.neutral,
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.1
        },
        {
          label: '▲ Alış',
          data: buyPts,
          borderColor: 'transparent',
          backgroundColor: CHART.green,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: 'triangle',
          showLine: false,
          fill: false
        },
        {
          label: '◆ Satış',
          data: sellPts,
          borderColor: 'transparent',
          backgroundColor: CHART.red,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: 'rectRot',
          showLine: false,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 500 },
      plugins: {
        legend: { labels: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } } }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.02)' },
          ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } }
        },
        x: {
          grid: { display: false },
          ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' }, maxTicksLimit: 12 }
        }
      }
    }
  });
}

let forecastInitialized = false;

function formActionState(form, message) {
  if (!form) return;
  let state = form.querySelector('.form-action-state');
  if (!state) { state = document.createElement('p'); state.className = 'form-action-state muted'; state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite'); form.appendChild(state); }
  state.textContent = message;
}

function inputStamp(root) {
  return JSON.stringify(Array.from(root.querySelectorAll('input:not(.paired-number-input), select')).map((el) => [el.id, el.value]));
}
function bindResultInputs(form, container, label) {
  if (!form || form.dataset.resultTracking) return;
  form.dataset.resultTracking = 'true';
  const update = () => {
    if (!container || !container.dataset.inputStamp) return;
    const status = container.querySelector('.result-state');
    if (!status) return;
    const changed = container.dataset.inputStamp !== inputStamp(form);
    status.textContent = (changed ? 'Önceki ' + label + ' sonucu · girdiler değişti. Yeniden hesaplayın. ' : 'Güncel ' + label + ' sonucu · ') + (container.dataset.resultDescription || '');
  };
  form.addEventListener('input', update); form.addEventListener('change', update);
}
function valuationStamp() {
  const card = $('#dcf-asset-sel').closest('.card');
  return inputStamp(card);
}
function markValuationChanged() {
  const status = $('#valuation-result-state');
  if (!status) return;
  status.textContent = lastDcfSnapshot ? 'Önceki değerleme sonucu · varsayımlar değişti. Değerlemeyi hesapla ile yenileyin.' : 'Varsayımlar hazır. Sonuç için Değerlemeyi hesapla düğmesini kullanın.';
}

function syncForecastPanels(modeBlocks, mode) {
  Object.keys(modeBlocks).forEach((key) => modeBlocks[key].forEach((el) => {
    if (el) el.hidden = key !== mode || (el.id === 'mc-results-container' && el.dataset.resultReady !== 'true');
  }));
}

function renderForecastView() {
  const forecastView = $('#view-forecast');
  if (forecastView && !$('#valuation-result-state')) { const state = document.createElement('p'); state.id = 'valuation-result-state'; state.className = 'result-state muted'; state.textContent = 'Hesaplama sonucu girdilere bağlıdır.'; const anchor = $('#valuation-assumptions-title'); if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(state, anchor); }
  if (forecastView && !$('#forecastModeTabs')) {
    const tabs = document.createElement('div'); tabs.id = 'forecastModeTabs'; tabs.className = 'forecast-mode-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Tahmin çalışma alanı'); tabs.innerHTML = '<button type="button" id="forecast-tab-portfolio" role="tab" aria-selected="true" class="active" data-forecast-mode="portfolio">Portföy senaryosu</button><button type="button" id="forecast-tab-valuation" role="tab" aria-selected="false" data-forecast-mode="valuation">Şirket değerlemesi</button>';
    forecastView.insertBefore(tabs, forecastView.firstElementChild);
    const mcCard = $('#mc-form') && $('#mc-form').closest('.card');
    const valuation = $('#dcf-asset-sel') && $('#dcf-asset-sel').closest('.card');
    const modeBlocks = { portfolio: [mcCard, $('#mc-results-container'), $('#stress-table-body') && $('#stress-table-body').closest('.card'), $('#correlation-loading') && $('#correlation-loading').closest('.card')], valuation: [valuation, $('#valuation-sensitivity-container') && $('#valuation-sensitivity-container').closest('.card'), $('#dcf-table-container') && $('#dcf-table-container').closest('.card')] };
    Object.keys(modeBlocks).forEach((mode) => {
      const panels = modeBlocks[mode].filter(Boolean);
      panels.forEach((panel, index) => {
        if (!panel.id) panel.id = 'forecast-panel-' + mode + '-' + index;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', 'forecast-tab-' + mode);
      });
      const tab = tabs.querySelector('[data-forecast-mode="' + mode + '"]');
      if (tab) tab.setAttribute('aria-controls', panels.map((panel) => panel.id).join(' '));
    });
    const activate = (mode) => { if (!Object.prototype.hasOwnProperty.call(modeBlocks, mode)) mode = 'portfolio'; localStorage.setItem('finans-forecast-mode', mode); tabs.querySelectorAll('[data-forecast-mode]').forEach((b) => { const on = b.dataset.forecastMode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); syncForecastPanels(modeBlocks, mode); };
    tabs.querySelectorAll('[data-forecast-mode]').forEach((b, index, list) => { b.addEventListener('click', () => activate(b.dataset.forecastMode)); b.addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length; list[next].focus(); list[next].click(); }); });
    activate(localStorage.getItem('finans-forecast-mode') || 'portfolio');
  }
  if (!forecastInitialized) {
    forecastInitialized = true;
    initForecastEventListeners();
    const calculate = $('#dcf-run-btn');
    if (calculate) calculate.parentElement.appendChild(calculate);
  }
  
  // DCF Select doldur (sadece hisseler: us ve bist)
  const dcfSel = $('#dcf-asset-sel');
  if (dcfSel) {
    const selectedValue = dcfSel.value;
    const opts = [];
    const addOpts = (list, market, pfx) => {
      list.forEach(x => {
        if (!x.__error) {
          opts.push(`<option value="${market}:${x.symbol}">${pfx}: ${x.symbol} (${x.name || ''})</option>`);
        }
      });
    };
    addOpts(DATA.us || [], 'us', 'ABD');
    addOpts(DATA.bist || [], 'bist', 'BIST');
    dcfSel.innerHTML = opts.join('') || '<option value="">Hisse senedi yok</option>';
    if (selectedValue && Array.from(dcfSel.options).some((o) => o.value === selectedValue)) dcfSel.value = selectedValue;
  }

  // Stres testlerini yukle
  loadStressScenarios();

  // Korelasyon matrisini yukle
  loadCorrelationMatrix();
  
  // Ilk DCF yuklemesi
  if (dcfSel && dcfSel.value && !forecastDefaultsLoaded) {
    forecastDefaultsLoaded = true;
    loadDCFDefaults();
  }
}

async function loadStressScenarios() {
  const tbody = $('#stress-table-body');
  const requestVersion = ++stressRequestVersion;
  if (!tbody) return;
  const portfolioAccessible = portfolioState === 'ready' || (portfolioState === 'stale' && !!portfolioData);
  const portfolioSignature = stressPortfolioSignature(portfolioData);
  const hasPortfolioPositions = !!portfolioData && ['us', 'bist', 'crypto'].some((market) => Array.isArray(portfolioData[market]) && portfolioData[market].length > 0);
  const emptyState = '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Stres senaryosu için kayıtlı portföy pozisyonu yok. <button type="button" class="btn btn-secondary" onclick="setView(\'portfolio\')">Portföye git</button></td></tr>';
  const errorState = (message) => '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Stres senaryoları alınamadı: ' + esc(message) + '. Girdi korunuyor. <button type="button" class="btn btn-secondary" onclick="loadStressScenarios()">Tekrar dene</button></td></tr>';
  const inaccessibleState = portfolioState === 'loading' ? '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Portföy verisi yükleniyor; stres senaryosu bekliyor.</td></tr>' : '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Portföy verisi alınamadı; stres senaryosu gösterilemiyor. <button type="button" class="btn btn-secondary" onclick="setView(\'portfolio\')">Portföye git</button></td></tr>';
  if (!portfolioAccessible) {
    tbody.innerHTML = inaccessibleState;
    return;
  }
  if (!hasPortfolioPositions) {
    tbody.innerHTML = emptyState;
    return;
  }
  try {
    const res = await fetch('/api/forecast/scenarios');
    if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status || 'hatası'));
    const result = await res.json();
    if (requestVersion !== stressRequestVersion || portfolioSignature !== stressPortfolioSignature(portfolioData)) return;
    if (result.error) {
      const previous = stressLastSuccessHtml ? '<tr><td colspan="7" class="muted" style="text-align:center;padding:8px;">' + (stressLastSuccessSignature === portfolioSignature ? 'Son başarılı sonuç korunuyor.' : 'Önceki portföyün sonucu · güncel pozisyonlara uygulanmaz.') + '</td></tr>' + stressLastSuccessHtml : '';
      tbody.innerHTML = errorState(result.error) + previous;
      return;
    }

    const scenarios = result.scenarios || {};
    let h = '';
    
    Object.keys(scenarios).forEach(key => {
      const sc = scenarios[key];
      const signCls = sc.pnlUSD >= 0 ? 'pos' : 'neg';
      const pctSignCls = sc.pctChange >= 0 ? 'pos' : 'neg';
      
      const shocks = Array.isArray(sc.shocks) ? sc.shocks : [];
      const shockLabel = (market) => {
        const shock = shocks.find((item) => item && item.market === market);
        if (!shock) return 'Pozisyon yok';
        return typeof shock.shockPct === 'number' && Number.isFinite(shock.shockPct) ? '%' + fmtNum(shock.shockPct, 1) : 'Şok verisi yok';
      };
      let shockStr = `ABD: ${shockLabel('us')} · BIST: ${shockLabel('bist')} · Kripto: ${shockLabel('crypto')}`;

      h += `
        <tr>
          <td><b>${esc(sc.name)}</b></td>
          <td style="font-size:12px; white-space:normal; max-width:220px; line-height:1.4; color:var(--muted);">${esc(sc.desc)}</td>
          <td style="font-size:12px; color:var(--muted-2);">${shockStr}</td>
          <td><b>$${fmtNum(sc.oldUSD, 0)}</b> <span style="font-size: 12px; color:var(--muted-2);">(${fmtNum(sc.oldTRY, 0)} ₺)</span></td>
          <td><b>$${fmtNum(sc.newUSD, 0)}</b> <span style="font-size: 12px; color:var(--muted-2);">(${fmtNum(sc.newTRY, 0)} ₺)</span></td>
          <td><b class="${signCls}">${sc.pnlUSD >= 0 ? '+' : ''}$${fmtNum(sc.pnlUSD, 0)}</b> <span style="font-size: 12px; color:var(--muted-2);">(${fmtNum(sc.pnlTRY, 0)} ₺)</span></td>
          <td><b class="${pctSignCls}">${fmtPct(sc.pctChange)}</b></td>
        </tr>
      `;
    });
    
    if (requestVersion !== stressRequestVersion || portfolioSignature !== stressPortfolioSignature(portfolioData)) return;
    stressLastSuccessHtml = h;
    stressLastSuccessSignature = portfolioSignature;
    tbody.innerHTML = h || '<tr><td colspan="7" class="muted" style="text-align:center;">Senaryo sonucu üretilemedi.</td></tr>';
    
    // Animate table rows entry

  } catch (e) {
    if (requestVersion !== stressRequestVersion || portfolioSignature !== stressPortfolioSignature(portfolioData)) return;
    const previous = stressLastSuccessHtml ? '<tr><td colspan="7" class="muted" style="text-align:center;padding:8px;">' + (stressLastSuccessSignature === portfolioSignature ? 'Son başarılı sonuç korunuyor.' : 'Önceki portföyün sonucu · güncel pozisyonlara uygulanmaz.') + '</td></tr>' + stressLastSuccessHtml : '';
    tbody.innerHTML = errorState(e && e.message || 'Veri bağlantı hatası') + previous;
  }
}

async function loadCorrelationMatrix() {
  const loadingDiv = $('#correlation-loading');
  const container = $('#correlation-heatmap-container');
  if (!loadingDiv || !container) return;

  const corrAssets = [];
  const addCorrAssets = (list, market) => {
    (list || []).forEach(p => {
      const source = DATA[market].find(x => x.symbol === p.symbol);
      corrAssets.push({
        symbol: p.symbol,
        market,
        amount: p.amount,
        price: source ? source.price : p.avgPrice
      });
    });
  };
  
  if (portfolioData) {
    addCorrAssets(portfolioData.us || [], 'us');
    addCorrAssets(portfolioData.bist || [], 'bist');
    addCorrAssets(portfolioData.crypto || [], 'crypto');
  }

  if (corrAssets.length <= 1) {
    loadingDiv.textContent = 'Korelasyon matrisi çizmek için portföyünüzde en az 2 farklı varlık bulunmalıdır.';
    loadingDiv.style.display = 'block';
    container.style.display = 'none';
    return;
  }

  try {
    loadingDiv.textContent = 'Tarihsel veriler hizalanıyor ve matris hesaplanıyor...';
    loadingDiv.style.display = 'block';
    container.style.display = 'none';

    const res = await fetch('/api/forecast/correlation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets: corrAssets })
    });
    const result = await res.json();
    if (result.error) {
      loadingDiv.textContent = 'Korelasyon hesaplama hatası: ' + result.error;
      return;
    }

    const { symbols, matrix } = result;
    if (!symbols || !symbols.length || !matrix || !matrix.length) {
      loadingDiv.textContent = 'Korelasyon verisi hesaplanamadı.';
      return;
    }

    loadingDiv.style.display = 'none';
    container.style.display = 'flex';

    // Heatmap table oluştur
    let h = '<table style="border-collapse: collapse; width: auto; margin: 0 auto;"><thead><tr><th></th>';
    symbols.forEach(s => {
      h += `<th style="text-align: center; padding: 12px; font-size: 12.5px; font-weight: 700; color: var(--muted); border: 1px solid var(--border);">${esc(s)}</th>`;
    });
    h += '</tr></thead><tbody>';

    matrix.forEach((row, rIdx) => {
      const rowSymbol = symbols[rIdx];
      h += `<tr><td style="font-weight: 700; font-size: 12.5px; padding: 12px; text-align: left; color: var(--text); border: 1px solid var(--border); background: var(--bg-2); min-width: 80px;">${esc(rowSymbol)}</td>`;
      row.forEach((val, cIdx) => {
        const colSymbol = symbols[cIdx];
        let bgStyle = '';
        let textStyle = 'color: var(--text);';
        
        if (rIdx === cIdx) {
          bgStyle = 'background-color: oklch(25% 0.02 250); font-weight: 700;';
        } else if (val > 0) {
          const intensity = Math.round(val * 100) / 100;
          bgStyle = `background-color: oklch(62% 0.16 250 / ${intensity * 0.45});`;
        } else if (val < 0) {
          const intensity = Math.abs(Math.round(val * 100) / 100);
          bgStyle = `background-color: oklch(68% 0.18 25 / ${intensity * 0.35});`;
        } else {
          bgStyle = 'background-color: var(--bg-2);';
        }

        h += `
          <td class="corr-cell" 
              data-row="${esc(rowSymbol)}" 
              data-col="${esc(colSymbol)}" 
              data-val="${val}"
              style="${bgStyle} ${textStyle} font-size: 13px; text-align: center; width: 64px; height: 50px; cursor: pointer; transition: all 150ms var(--ease-out); border: 1px solid var(--border); font-family: monospace;">
            ${val.toFixed(2)}
          </td>
        `;
      });
      h += '</tr>';
    });
    h += '</tbody></table>';

    container.innerHTML = h;

    // Hücre hover olayları
    const cells = container.querySelectorAll('.corr-cell');

    cells.forEach(cell => {
      cell.addEventListener('mouseenter', (e) => {
        // Hover style: outline glow
        e.target.style.outline = '2px solid var(--text)';
        e.target.style.zIndex = '10';
        e.target.style.position = 'relative';
        
        const row = e.target.dataset.row;
        const col = e.target.dataset.col;
        const val = parseFloat(e.target.dataset.val);
        
        let desc = '';
        if (row === col) {
          desc = `<b>${esc(row)}</b> kendisiyle tam korelasyona sahiptir (1.00).`;
        } else {
          let strength = '';
          const absVal = Math.abs(val);
          if (absVal >= 0.7) strength = 'Güçlü';
          else if (absVal >= 0.4) strength = 'Orta Düzey';
          else if (absVal >= 0.1) strength = 'Zayıf';
          else strength = 'Neredeyse İlişkisiz';

          const direction = val > 0 ? 'pozitif yönlü' : (val < 0 ? 'negatif yönlü' : 'yönü bulunmayan');
          desc = `<b>${esc(row)}</b> ve <b>${esc(col)}</b> arasında <b>${strength} ${direction}</b> ilişki bulunmaktadır (korelasyon katsayısı: <b>${val.toFixed(2)}</b>).`;
        }
        
        $('#correlation-info-text').innerHTML = desc;
      });

      cell.addEventListener('mouseleave', (e) => {
        e.target.style.outline = 'none';
        e.target.style.zIndex = '1';
        e.target.style.position = 'static';
        $('#correlation-info-text').innerHTML = 'İlişkileri incelemek için hücrelerin üzerine gelin.';
      });
    });

  } catch (err) {
    loadingDiv.textContent = 'Bağlantı hatası: Korelasyon verileri çekilemedi.';
  }
}

function initForecastEventListeners() {
  $('#dcf-run-btn').addEventListener('click', runDCFCalculation);
  bindResultInputs($('#mc-form'), $('#mc-results-container'), 'simülasyon');
  // Monte Carlo Formu
  const mcForm = $('#mc-form');
  if (mcForm) {
    mcForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const runBtn = $('#mc-run-btn');
      if (runBtn.disabled) return;
      const request = ++mcRequest;
      const formStamp = inputStamp($('#mc-form'));
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="btn-ic">🔮</span> Projeksiyon Çiziliyor...';
      runBtn.classList.add('loading');
      formActionState(mcForm, 'Simülasyon çalışıyor. Son başarılı sonuç korunuyor.');

      const horizon = parseInt($('#mc-horizon-sel').value, 10);
      const monthlySaving = parseFloat($('#mc-saving-input').value) || 0;

      const mcAssets = [];
      const addMcAssets = (list, market) => {
        list.forEach(p => {
          const source = DATA[market].find(x => x.symbol === p.symbol);
          mcAssets.push({
            symbol: p.symbol,
            market,
            amount: p.amount,
            price: source ? source.price : p.avgPrice
          });
        });
      };
      
      if (portfolioData) {
        addMcAssets(portfolioData.us || [], 'us');
        addMcAssets(portfolioData.bist || [], 'bist');
        addMcAssets(portfolioData.crypto || [], 'crypto');
      }

      if (!mcAssets.length) {
        formActionState(mcForm, 'Simülasyon için önce portföye en az bir pozisyon ekleyin.');
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">🔮</span> Simülasyonu Başlat';
        runBtn.classList.remove('loading');
        return;
      }

      try {
        const res = await fetch('/api/forecast/montecarlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: mcAssets, horizon, monthlySaving })
        });
        const result = await res.json();
        
        if (result.error) {
          formActionState(mcForm, 'Simülasyon tamamlanamadı: ' + result.error + '. Girdiler ve son sonuç korunuyor.');
          return;
        }

        if (request === mcRequest) { displayMCResults(result, { horizon, monthlySaving, formStamp }); formActionState(mcForm, 'Simülasyon tamamlandı.'); }
      } catch (err) {
        formActionState(mcForm, 'Simülasyon tamamlanamadı: bağlantı hatası. Girdiler ve son sonuç korunuyor; tekrar deneyin.');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">🔮</span> Simülasyonu Başlat';
        runBtn.classList.remove('loading');
      }
    });
  }

  // DCF Asset change
  const dcfSel = $('#dcf-asset-sel');
  if (dcfSel) {
    dcfSel.addEventListener('change', loadDCFDefaults);
  }

  // Model Type Selection change
  function setValuationModelGroupVisibility(model, groups) {
    if (!groups) return;
    if (groups.dcf) groups.dcf.style.display = model === 'dcf' ? '' : 'none';
    if (groups.graham) groups.graham.style.display = model === 'graham' ? 'flex' : 'none';
    if (groups.ddm) groups.ddm.style.display = model === 'ddm' ? 'flex' : 'none';
  }

  const modelSel = $('#valuation-model-type-sel');
  if (modelSel) {
    modelSel.addEventListener('change', () => {
      const model = modelSel.value;
      
      // Hide all input groups first, then show active one
      setValuationModelGroupVisibility(model, { dcf: $('#dcf-inputs-group'), graham: $('#graham-inputs-group'), ddm: $('#ddm-inputs-group') });
      
      // Toggle projection table and detail rows
      $('#dcf-table-container').style.display = model === 'dcf' ? 'block' : 'none';
      $('#dcf-ev-detail-row').style.display = model === 'dcf' ? 'flex' : 'none';
      $('#dcf-eq-detail-row').style.display = model === 'dcf' ? 'flex' : 'none';
      $('#dcf-ttm-detail-row').style.display = model === 'dcf' ? 'flex' : 'none';
      
      const assumptionsTitle = $('#valuation-assumptions-title');
      if (assumptionsTitle) {
        if (model === 'dcf') assumptionsTitle.textContent = 'DCF Model Varsayımları';
        else if (model === 'graham') assumptionsTitle.textContent = 'Graham Formülü Varsayımları';
        else assumptionsTitle.textContent = 'DDM Model Varsayımları';
      }
      
      markValuationChanged();
    });
  }

  // DCF Sliders & Inputs
  const dcfSliders = [
    'growth-1-5', 'growth-6-10', 'ebit-margin', 'wacc', 'terminal-growth'
  ];
  dcfSliders.forEach(id => {
    const el = $('#dcf-' + id);
    if (el) {
      el.addEventListener('input', (e) => {
        const lbl = $('#lbl-' + id);
        if (lbl) {
          lbl.textContent = (id === 'wacc' || id === 'terminal-growth') ? `%${parseFloat(e.target.value).toFixed(1)}` : `%${e.target.value}`;
        }
        markValuationChanged();
      });
    }
  });
  [...dcfSliders.map((id) => 'dcf-' + id), 'graham-growth', 'ddm-growth', 'ddm-wacc'].forEach((id) => {
    const range = $('#' + id); if (!range || range.parentElement.querySelector('.paired-number-input')) return;
    const numeric = document.createElement('input'); numeric.type = 'number'; numeric.className = 'paired-number-input'; numeric.min = range.min; numeric.max = range.max; numeric.step = range.step || '1'; numeric.value = range.value; numeric.setAttribute('aria-label', (range.parentElement.querySelector('.range-lbl span')?.textContent || id) + ' sayısal değer'); range.setAttribute('aria-label', range.parentElement.querySelector('.range-lbl span')?.textContent || id); range.insertAdjacentElement('afterend', numeric);
    numeric.addEventListener('input', () => { range.value = numeric.value; range.dispatchEvent(new Event('input', { bubbles: true })); });
    range.addEventListener('input', () => { numeric.value = range.value; });
  });

  const dcfInputs = ['tax-rate', 'net-debt', 'revenue', 'shares'];
  dcfInputs.forEach(id => {
    const el = $('#dcf-' + id);
    if (el) {
      el.addEventListener('change', markValuationChanged);
      el.addEventListener('keyup', markValuationChanged);
    }
  });

  // Graham inputs & slider
  const grahamGrowthInput = $('#graham-growth');
  if (grahamGrowthInput) {
    grahamGrowthInput.addEventListener('input', (e) => {
      $('#lbl-graham-growth').textContent = `%${parseFloat(e.target.value).toFixed(1)}`;
      markValuationChanged();
    });
  }
  ['graham-eps', 'graham-aaa-yield'].forEach(id => {
    const el = $('#' + id);
    if (el) {
      el.addEventListener('change', markValuationChanged);
      el.addEventListener('keyup', markValuationChanged);
    }
  });

  // DDM inputs & sliders
  const ddmGrowthInput = $('#ddm-growth');
  if (ddmGrowthInput) {
    ddmGrowthInput.addEventListener('input', (e) => {
      $('#lbl-ddm-growth').textContent = `%${parseFloat(e.target.value).toFixed(1)}`;
      markValuationChanged();
    });
  }
  const ddmWaccInput = $('#ddm-wacc');
  if (ddmWaccInput) {
    ddmWaccInput.addEventListener('input', (e) => {
      $('#lbl-ddm-wacc').textContent = `%${parseFloat(e.target.value).toFixed(1)}`;
      markValuationChanged();
    });
  }
  const ddmDivInput = $('#ddm-dividend');
  if (ddmDivInput) {
    ddmDivInput.addEventListener('change', markValuationChanged);
    ddmDivInput.addEventListener('keyup', markValuationChanged);
  }

  // Defaults button
  const defaultsBtn = $('#dcf-load-defaults-btn');
  if (defaultsBtn) {
    defaultsBtn.addEventListener('click', loadDCFDefaults);
  }
}

function displayMCResults(res, meta = {}) {
  const container = $('#mc-results-container');
  container.dataset.resultReady = 'true';
  container.hidden = $('#forecast-tab-portfolio')?.getAttribute('aria-selected') === 'false';
  container.dataset.inputSnapshot = JSON.stringify(meta);
  container.dataset.inputStamp = meta.formStamp || inputStamp($('#mc-form'));
  container.dataset.resultDescription = meta.horizon + ' gün · aylık tasarruf $' + meta.monthlySaving + ' · portföy anlık görüntüsü ' + fullTimestamp(DATA.generatedAt);
  let state = container.querySelector('.result-state');
  if (!state) { state = document.createElement('p'); state.className = 'result-state muted'; container.insertBefore(state, container.firstElementChild); }
  state.textContent = (container.dataset.inputStamp === inputStamp($('#mc-form')) ? 'Güncel sonuç · ' : 'Önceki sonuç · girdiler değişti · ') + meta.horizon + ' gün · aylık tasarruf ' + meta.monthlySaving;
  
  triggerRevealAnimations(container);

  
  const n = res.horizon;
  const pFinal = res.percentiles.pessimistic[n];
  const mFinal = res.percentiles.median[n];
  const oFinal = res.percentiles.optimistic[n];

  // countUp count-up!
  countUp($('#mc-kpi-init'), res.initialValue, { decimals: 0 });
  countUp($('#mc-kpi-median'), mFinal, { decimals: 0 });
  countUp($('#mc-kpi-pessimistic'), pFinal, { decimals: 0 });
  countUp($('#mc-kpi-optimistic'), oFinal, { decimals: 0 });
  countUp($('#mc-kpi-ret'), res.annualizedReturn, { decimals: 1 });
  countUp($('#mc-kpi-vol'), res.annualizedVol, { decimals: 1 });

  drawMCChart(res);
}

function drawMCChart(res) {
  if (mcChart) mcChart.destroy();
  const canvas = $('#mcChart');
  if (!canvas) return;

  const n = res.horizon;
  const labels = Array.from({ length: n + 1 }, (_, i) => `Gün ${i}`);
  renderChartDataTable(canvas, 'Monte Carlo portföy senaryoları (USD)', ['Gün', 'Kötümser (%10)', 'Medyan (%50)', 'İyimser (%90)'], labels.map((label, index) => [label, fmtNum(res.percentiles.pessimistic[index], 2), fmtNum(res.percentiles.median[index], 2), fmtNum(res.percentiles.optimistic[index], 2)]));
  if (!window.Chart) return;
  
  mcChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Optimistik (%90 Olasılık Üst Sınır)',
          data: res.percentiles.optimistic,
          borderColor: CHART.green,
          backgroundColor: 'transparent',
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.1
        },
        {
          label: 'Medyan (%50 Beklenen Gidişat)',
          data: res.percentiles.median,
          borderColor: CHART.accent,
          backgroundColor: chartGradient(canvas, CHART.accent, 0.12),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Pessimistik (%10 Olasılık Alt Sınır)',
          data: res.percentiles.pessimistic,
          borderColor: CHART.red,
          borderDash: [4, 4],
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 500 },
      plugins: {
        legend: { labels: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' } } }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.02)' },
          ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' }, callback: (value) => '$' + fmtNum(value, 0) }
        },
        x: {
          grid: { display: false },
          ticks: { color: chartLabelColor(), font: { size: 12, family: 'Plus Jakarta Sans' }, maxTicksLimit: 12 }
        }
      }
    }
  });
}

function loadDCFDefaults() {
  const dcfSel = $('#dcf-asset-sel');
  if (!dcfSel || !dcfSel.value) return;

  const parts = dcfSel.value.split(':');
  const market = parts[0];
  const symbol = parts[1];
  
  const list = DATA[market] || [];
  const stock = list.find(x => x.symbol === symbol);
  if (!stock) return;

  const price = stock.price || 100;
  const marketCap = stock.marketCap || (price * 1000000);
  const shares = marketCap / price;

  let revenue = marketCap / 4;
  let pe = stock.pe || null;
  if (pe && pe > 0) {
    const netIncome = marketCap / pe;
    revenue = netIncome / 0.15;
  }

  const defaults = {
    us: { wacc: 9.0, growth1_5: 10, growth6_10: 5, ebit: 25, tax: 21, netDebt: 0 },
    bist: { wacc: 16.0, growth1_5: 25, growth6_10: 12, ebit: 15, tax: 25, netDebt: 0 }
  };
  
  const def = defaults[market] || defaults.us;

  // DCF Defaults Set
  $('#dcf-growth-1-5').value = def.growth1_5;
  $('#lbl-growth-1-5').textContent = `%${def.growth1_5}`;

  $('#dcf-growth-6-10').value = def.growth6_10;
  $('#lbl-growth-6-10').textContent = `%${def.growth6_10}`;

  $('#dcf-ebit-margin').value = def.ebit;
  $('#lbl-ebit-margin').textContent = `%${def.ebit}`;

  $('#dcf-wacc').value = def.wacc;
  $('#lbl-wacc').textContent = `%${def.wacc.toFixed(1)}`;

  $('#dcf-terminal-growth').value = 2.5;
  $('#lbl-terminal-growth').textContent = `%2.5`;

  $('#dcf-tax-rate').value = def.tax;
  $('#dcf-net-debt').value = def.netDebt;
  $('#dcf-revenue').value = Math.round(revenue);
  $('#dcf-shares').value = Math.round(shares);

  // Graham Defaults Set
  const calculatedEps = stock.pe ? (stock.price / stock.pe) : (stock.price * 0.06);
  $('#graham-eps').value = calculatedEps.toFixed(2);
  const grahamGrowth = market === 'bist' ? 15 : 8;
  $('#graham-growth').value = grahamGrowth;
  $('#lbl-graham-growth').textContent = `%${grahamGrowth}`;
  $('#graham-aaa-yield').value = market === 'bist' ? 18.0 : 4.5;

  // DDM Defaults Set
  const calculatedDividend = stock.price * 0.025;
  $('#ddm-dividend').value = calculatedDividend.toFixed(2);
  const ddmGrowth = market === 'bist' ? 8.0 : 4.5;
  $('#ddm-growth').value = ddmGrowth;
  $('#lbl-ddm-growth').textContent = `%${ddmGrowth.toFixed(1)}`;
  
  const ddmWacc = market === 'bist' ? 16.0 : 9.5;
  $('#ddm-wacc').value = ddmWacc;
  $('#lbl-ddm-wacc').textContent = `%${ddmWacc.toFixed(1)}`;

  document.querySelectorAll('.paired-number-input').forEach((numeric) => { const range = numeric.previousElementSibling; if (range) numeric.value = range.value; });
  markValuationChanged();
}

async function runDCFCalculation() {
  if (dcfPending) return;
  const dcfSel = $('#dcf-asset-sel');
  if (!dcfSel || !dcfSel.value) return;

  const parts = dcfSel.value.split(':');
  const market = parts[0];
  const symbol = parts[1];
  
  const list = DATA[market] || [];
  const stock = list.find(x => x.symbol === symbol);
  if (!stock) return;

  const currencySym = stock.currency === 'TRY' ? '₺' : '$';
  const modelType = $('#valuation-model-type-sel')?.value || 'dcf';
  const request = ++dcfRequest;
  
  let params = {
    modelType,
    currentPrice: parseFloat(stock.price)
  };

  if (modelType === 'dcf') {
    params.revenue = parseFloat($('#dcf-revenue').value);
    params.sharesOutstanding = parseFloat($('#dcf-shares').value);
    params.revenueGrowthY1Y5 = parseFloat($('#dcf-growth-1-5').value);
    params.revenueGrowthY6Y10 = parseFloat($('#dcf-growth-6-10').value);
    params.ebitMargin = parseFloat($('#dcf-ebit-margin').value);
    params.taxRate = parseFloat($('#dcf-tax-rate').value);
    params.wacc = parseFloat($('#dcf-wacc').value);
    params.terminalGrowthRate = parseFloat($('#dcf-terminal-growth').value);
    params.netDebt = parseFloat($('#dcf-net-debt').value) || 0;
  } else if (modelType === 'graham') {
    params.eps = parseFloat($('#graham-eps').value);
    params.growthRate = parseFloat($('#graham-growth').value);
    params.aaaBondYield = parseFloat($('#graham-aaa-yield').value);
  } else if (modelType === 'ddm') {
    params.recentDividend = parseFloat($('#ddm-dividend').value);
    params.dividendGrowthRate = parseFloat($('#ddm-growth').value);
    params.wacc = parseFloat($('#ddm-wacc').value);
  }

  const status = $('#valuation-result-state');
  const inputError = Object.values(params).some((v) => typeof v === 'number' && !Number.isFinite(v)) ||
    (modelType === 'dcf' && (params.revenue <= 0 || params.sharesOutstanding <= 0 || params.wacc <= params.terminalGrowthRate)) ||
    (modelType === 'ddm' && (params.recentDividend <= 0 || params.wacc <= params.dividendGrowthRate)) ||
    (modelType === 'graham' && (params.eps <= 0 || params.aaaBondYield <= 0));
  if (inputError) { status.textContent = 'Hesaplanamadı: pozitif gelir/hisse adedi ve geçerli iskonto oranı gerekir. İskonto oranı büyümeden büyük olmalı. Girdiler ve son sonuç korunuyor.'; return; }
  const stamp = valuationStamp();
  dcfPending = true;
  const runButton = $('#dcf-run-btn'); runButton.disabled = true; runButton.textContent = 'Hesaplanıyor…';
  status.textContent = 'Hesaplanıyor… Son başarılı sonuç aşağıda korunuyor.';
  try {
    const res = await fetch('/api/forecast/dcf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const result = await res.json();
    if (request !== dcfRequest) return;
    if (result.error) {
      status.textContent = 'Hesaplanamadı: ' + result.error + '. Girdiler ve son başarılı sonuç korunuyor.';
      return;
    }
    lastDcfSnapshot = { params: Object.assign({}, params), market, symbol, stamp };
    let captured = $('#valuationCapturedInputs');
    if (!captured) { captured = document.createElement('details'); captured.id = 'valuationCapturedInputs'; const anchor = $('#dcf-fair-value-box'); anchor.parentElement.insertAdjacentElement('afterend', captured); }
    const labels = { currentPrice: 'Fiyat', revenue: 'Yıllık gelir', sharesOutstanding: 'Hisse adedi', revenueGrowthY1Y5: 'Gelir büyümesi 1–5 yıl (%)', revenueGrowthY6Y10: 'Gelir büyümesi 6–10 yıl (%)', ebitMargin: 'EBIT marjı (%)', taxRate: 'Vergi (%)', wacc: 'İskonto oranı (%)', terminalGrowthRate: 'Uç büyüme (%)', netDebt: 'Net borç', eps: 'Hisse başına kazanç', growthRate: 'Büyüme (%)', aaaBondYield: 'AAA tahvil faizi (%)', recentDividend: 'Son temettü', dividendGrowthRate: 'Temettü büyümesi (%)' };
    captured.innerHTML = '<summary>Hesaplamada kullanılan varsayımlar · ' + esc(symbol) + ' · ' + esc(stock.currency) + '</summary><dl class="captured-inputs">' + Object.entries(params).filter(([key]) => labels[key]).map(([key,value]) => '<div><dt>' + labels[key] + '</dt><dd>' + fmtNum(value, Number.isInteger(value) ? 0 : 2) + '</dd></div>').join('') + '</dl>';

    const valuationState = $('#valuation-result-state');
    if (valuationState) valuationState.textContent = (valuationStamp() === stamp ? 'Güncel sonuç · ' : 'Önceki sonuç · girdiler değişti · ') + modelType.toUpperCase() + ' · ' + stock.symbol + ' · ' + currencySym + ' · Sonuç, hesaplama anındaki varsayımlara aittir.';

    // Currency symbols sync
    $('#dcf-currency-sym').textContent = currencySym;
    $('#dcf-ev-cur').textContent = currencySym;
    $('#dcf-eq-cur').textContent = currencySym;
    $('#dcf-ttm-cur').textContent = currencySym;

    // Trigger the spring pop animation
    const fairValBox = $('#dcf-fair-value-box');
    if (fairValBox) {
      fairValBox.classList.remove('val-pop');
      void fairValBox.offsetWidth; // trigger reflow
      fairValBox.classList.add('val-pop');
    }

    // countUp count-up!
    countUp($('#dcf-fair-val-num'), result.fairValue, { decimals: 2 });
    countUp($('#dcf-safety-num'), result.marginOfSafety, { decimals: 1 });

    const badge = $('#dcf-margin-safety-badge');
    const mos = result.marginOfSafety;
    badge.innerHTML = `Güvenlik Marjı: ${mos >= 0 ? '+' : ''}<span id="dcf-safety-num">${fmtNum(mos, 1)}</span>%`;
    if (mos >= 20) {
      badge.className = 'badge tone-strong-buy';
    } else if (mos >= 0) {
      badge.className = 'badge tone-buy';
    } else if (mos >= -20) {
      badge.className = 'badge tone-reduce';
    } else {
      badge.className = 'badge tone-sell';
    }

    $('#dcf-current-price').textContent = fmtPrice(params.currentPrice, stock.currency);

    // Render Değerleme Hassasiyet Matrisi (Sensitivity Heatmap)
    const sensContainer = $('#valuation-sensitivity-grid');
    if (sensContainer && result.sensitivity) {
      const sens = result.sensitivity;
      const currentPrice = params.currentPrice;
      
      let html = '<table style="border-collapse: collapse; margin: 0 auto; width: auto; font-family: monospace; font-size: 12px; border: 1px solid var(--border);">';
      
      // Header row (cols)
      html += '<thead><tr>';
      html += `<th style="padding: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--muted); font-weight: 700;">${esc(sens.rowLabel)} \\ ${esc(sens.colLabel)}</th>`;
      sens.cols.forEach(colVal => {
        html += `<th style="padding: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--muted); font-weight: 700; text-align: center;">${esc(colVal)}</th>`;
      });
      html += '</tr></thead><tbody>';
      
      // Rows
      sens.matrix.forEach((rowVals, rIdx) => {
        const rowLabelVal = sens.rows[rIdx];
        html += `<tr><td style="padding: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--text); font-weight: 700; text-align: left;">${esc(rowLabelVal)}</td>`;
        
        rowVals.forEach((val, cIdx) => {
          // Calculate MOS for this cell
          const cellMOS = val > 0 ? ((val - currentPrice) / val) * 100 : -100;
          
          let cellBg = 'background-color: var(--bg-2);';
          let cellText = 'color: var(--text);';
          
          if (cellMOS >= 20) {
            cellBg = 'background-color: rgba(5, 150, 105, 0.35);'; // Strong Buy green
          } else if (cellMOS >= 0) {
            cellBg = 'background-color: rgba(5, 150, 105, 0.18);'; // Buy light green
          } else if (cellMOS >= -20) {
            cellBg = 'background-color: rgba(217, 119, 6, 0.22);'; // Reduce orange
          } else {
            cellBg = 'background-color: rgba(220, 38, 38, 0.25);'; // Sell red
          }
          
          // Highlight the center element (the actual selected values)
          let cellBorder = 'border: 1px solid var(--border);';
          let cellWeight = 'font-weight: 500;';
          if (rIdx === 2 && cIdx === 2) {
            cellBorder = 'border: 2px solid var(--text);';
            cellWeight = 'font-weight: 800; text-decoration: underline;';
          }
          
          html += `
            <td class="sens-cell" style="${cellBg} ${cellText} ${cellBorder} ${cellWeight} padding: 10px 12px; text-align: center; cursor: default;" 
                title="Değer: ${currencySym}${val.toFixed(2)} | Güvenlik Marjı: ${cellMOS.toFixed(1)}%">
              ${currencySym}${val.toFixed(0)}
            </td>
          `;
        });
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      sensContainer.innerHTML = html;


    }

    if (modelType === 'dcf') {
      countUp($('#dcf-ev-val-num'), result.enterpriseValue, { decimals: 0 });
      countUp($('#dcf-eq-val-num'), result.equityValue, { decimals: 0 });
      countUp($('#dcf-ttm-val-num'), params.revenue, { decimals: 0 });

      const tbody = $('#dcf-table-body');
      tbody.innerHTML = result.forecast.map(f => `
        <tr>
          <td>Yıl ${f.year}</td>
          <td>${currencySym}${fmtNum(f.revenue, 0)}</td>
          <td>${currencySym}${fmtNum(f.ebit, 0)}</td>
          <td>${currencySym}${fmtNum(f.fcf, 0)}</td>
          <td><b>${currencySym}${fmtNum(f.pv, 0)}</b></td>
        </tr>
      `).join('');
    }

  } catch (e) {
    status.textContent = 'Hesaplanamadı: bağlantı hatası. Girdiler ve son başarılı sonuç korunuyor.';
    console.error('Değerleme hesaplama hatası:', e);
  } finally {
    dcfPending = false; runButton.disabled = false; runButton.textContent = 'Değerlemeyi hesapla';
  }
}

/* ---------- Olaylar ---------- */
let navigationReturnFocus = null;
function navigationFocusables() {
  return Array.from(document.querySelectorAll('.sidebar button, .sidebar a, .sidebar summary, .sidebar select, .sidebar input')).filter((el) => !el.disabled && el.offsetParent !== null);
}
function closeNavigation(restoreFocus = true) {
  const wasOpen = document.body.classList.contains('nav-open');
  document.body.classList.remove('nav-open');
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && window.innerWidth <= 980) sidebar.inert = true;
  const main = document.querySelector('.main');
  if (main) main.inert = false;
  const toggle = $('#navToggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus && wasOpen && navigationReturnFocus && navigationReturnFocus.isConnected) navigationReturnFocus.focus();
  navigationReturnFocus = null;
}
function openNavigation(trigger) {
  if (window.innerWidth > 980) return;
  navigationReturnFocus = trigger || document.activeElement;
  document.body.classList.add('nav-open');
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.inert = false;
  const main = document.querySelector('.main');
  if (main) main.inert = true;
  const toggle = $('#navToggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  const first = navigationFocusables()[0];
  if (first) first.focus();
}
const navToggle = $('#navToggle');
if (navToggle) navToggle.addEventListener('click', () => document.body.classList.contains('nav-open') ? closeNavigation() : openNavigation(navToggle));
const navClose = $('#navClose');
if (navClose) navClose.addEventListener('click', closeNavigation);
const navBackdrop = $('#navBackdrop');
if (navBackdrop) navBackdrop.addEventListener('click', closeNavigation);
document.addEventListener('keydown', (event) => {
  keyboardNavigation = true;
  if (!document.body.classList.contains('nav-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeNavigation(); return; }
  if (event.key !== 'Tab') return;
  const items = navigationFocusables();
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.addEventListener('pointerdown', () => { keyboardNavigation = false; }, { passive: true });
window.addEventListener('resize', () => { if (window.innerWidth > 980) { const sidebar = document.querySelector('.sidebar'); if (sidebar) sidebar.inert = false; const main = document.querySelector('.main'); if (main) main.inert = false; closeNavigation(); } else closeNavigation(); });
document.querySelectorAll('.navitem').forEach((n) => n.addEventListener('click', () => setView(n.dataset.view)));
$('#sortSel').addEventListener('change', (e) => { if (marketUi[activeView]) marketUi[activeView].sort = e.target.value; sortBy = e.target.value; saveRouteUi(); if (['us', 'bist', 'crypto'].includes(activeView)) { renderScoreChart(); renderTable(); } });
const marketSearch = $('#marketSearch');
if (marketSearch) marketSearch.addEventListener('input', (e) => { if (marketUi[activeView]) marketUi[activeView].query = e.target.value; saveRouteUi(); renderTable(); });
const assetReturn = $('#assetReturnBtn');
  if (assetReturn) assetReturn.addEventListener('click', () => { saveRouteUi(); marketDetailOpen = false; $('#view-market').classList.remove('is-detail-open'); if (typeof writeRoute === 'function') writeRoute(activeView, false, true); saveRouteUi(); if (detailReturnFocus && detailReturnFocus.isConnected) { detailReturnFocus.setAttribute('aria-expanded', 'false'); detailReturnFocus.focus(); } });
$('#refreshBtn').addEventListener('click', refresh);
document.addEventListener('toggle', (e) => {
  const target = e.target;
  if (target && target.classList && target.classList.contains('overview-advanced') && target.open) {
    renderPicks();
    renderAlloc();
    renderMovers();
    renderMarketRegime();
    renderFxWidget();
  }
}, true);
document.querySelectorAll('[data-desk-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    assetDeskState.mode = btn.dataset.deskMode;
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    syncDeskControls(assetDeskState.market || activeView, assetDeskState.interval || deskDefaultInterval(activeView));
    renderAssetDesk(asset);
  });
});
$('#deskIntervalSel').addEventListener('change', (e) => {
  assetDeskState.interval = e.target.value;
  const list = DATA && DATA[activeView] ? DATA[activeView] : [];
  const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
  renderAssetDesk(asset);
});

const toggleBtn = $('#deskSmaToggleBtn');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    assetDeskState.showSMA = !assetDeskState.showSMA;
    localStorage.setItem('finans-show-sma', assetDeskState.showSMA);
    updateSmaButtonVisual();
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    if (asset) renderAssetDesk(asset);
  });
}

const rsiToggleBtn = $('#deskRsiToggleBtn');
if (rsiToggleBtn) {
  rsiToggleBtn.addEventListener('click', () => {
    assetDeskState.showRSI = !assetDeskState.showRSI;
    localStorage.setItem('finans-show-rsi', assetDeskState.showRSI);
    updateRsiButtonVisual();
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    if (asset) renderAssetDesk(asset);
  });
}

const macdToggleBtn = $('#deskMacdToggleBtn');
if (macdToggleBtn) {
  macdToggleBtn.addEventListener('click', () => {
    assetDeskState.showMACD = !assetDeskState.showMACD;
    localStorage.setItem('finans-show-macd', assetDeskState.showMACD);
    updateMacdButtonVisual();
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    if (asset) renderAssetDesk(asset);
  });
}

/* ---------- Tema Seçici İşlemleri ---------- */
function chartCssColor(token) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = getComputedStyle(document.body).getPropertyValue(token).trim(); ctx.fillRect(0,0,1,1);
  const rgba = ctx.getImageData(0,0,1,1).data;
  return '#' + Array.from(rgba).slice(0,3).map((value) => value.toString(16).padStart(2,'0')).join('');
}
function updateChartTheme() {
  const previousAccent = CHART.accent; CHART.accent = chartCssColor('--accent');
  const muted = chartCssColor('--muted');
  if (window.Chart) Object.values(Chart.instances).forEach((chart) => {
    if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = muted;
    Object.values(chart.options.scales || {}).forEach((scale) => { if (scale.ticks) scale.ticks.color = muted; });
    chart.data.datasets.forEach((series) => { if (series.borderColor === previousAccent) series.borderColor = CHART.accent; if (series.backgroundColor === previousAccent) series.backgroundColor = CHART.accent; });
    chart.update('none');
  });
  if (lastAssetChart && assetDeskState.symbol === lastAssetChart.asset.symbol && ['us','bist','crypto'].includes(activeView)) drawAssetDeskChart(lastAssetChart.payload,lastAssetChart.asset);
}

function initThemeSelector() {
  const btns = document.querySelectorAll('.theme-btn');
  const savedTheme = localStorage.getItem('finans-theme') || 'carbon';
  
  const applyTheme = (theme) => {
    // Remove old themes
    document.body.classList.remove('theme-carbon', 'theme-silver', 'theme-amber', 'theme-green');
    // Add new theme
    document.body.classList.add('theme-' + theme);
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    updateChartTheme();
    // Save to localStorage
    localStorage.setItem('finans-theme', theme);
    
    // Update active button state
    btns.forEach(btn => {
      if (btn.dataset.theme === theme) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.style.borderColor = 'var(--text)';
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.style.borderColor = 'transparent';
      }
    });
  };

  // Bind click events
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
    });
  });

  // Apply default/saved theme
  applyTheme(savedTheme);
}

initThemeSelector();
initOverviewTaskTabs();
initOverviewContextTabs();
updateSmaButtonVisual();
initAnimations();
window.addEventListener('hashchange', applyRoute);
window.addEventListener('popstate', applyRoute);
applyRoute();
load();
setInterval(silentRefresh, 10 * 60 * 1000);

/* ---------- Otomasyon Karar ve Okuryazarlık Yardımcıları ---------- */
function renderDailyDigest() {
  const el = $('#dailyDigest');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildDailyChangeDigest) { el.innerHTML = ''; return; }
  const d = window.FinansActionLayer.buildDailyChangeDigest(DATA);
  
  const item = (x, dir) => {
    const cls = dir === 'up' ? 'imp-pos' : 'imp-neg';
    const sign = dir === 'up' ? '+' : '';
    return '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px;">' +
      '<b>' + esc(x.symbol) + ' <span style="font-size: 12px; color:var(--muted); text-transform:uppercase;">(' + esc(x.market) + ')</span></b>' +
      '<div style="display:flex; gap:8px; align-items:center;">' +
        '<span class="badge tone-' + x.tone + '" style="font-size: 12px;">' + x.label + ' · ' + x.score + '</span>' +
        '<span class="news-impact ' + cls + '" style="font-size: 12px; padding:2px 6px; border-radius:4px; font-weight:700;">' + sign + x.delta + '</span>' +
      '</div>' +
    '</div>';
  };
  
  const up = d.improving.length ? d.improving.map((x) => item(x, 'up')).join('') : '<p class="muted compact" style="font-size:12px;">Güçlenen belirgin sinyal yok.</p>';
  const down = d.weakening.length ? d.weakening.map((x) => item(x, 'down')).join('') : '<p class="muted compact" style="font-size:12px;">Zayıflayan belirgin sinyal yok.</p>';
  
  el.innerHTML = '<div class="card reveal action-card">' +
    '<div class="card-head"><h2>Sinyallerde ne değişti?</h2><span class="card-sub">Dünkü skora göre karar radarı</span></div>' +
    '<p class="action-headline" style="font-size:13.5px; font-weight:600; margin-bottom:14px; color:var(--accent);">' + esc(d.headline) + '</p>' +
    '<div class="digest-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">' +
      '<div><h3 style="font-size:12.5px; font-weight:700; margin-bottom:8px; color:var(--green);">Güçlenen Sinyaller</h3>' + up + '</div>' +
      '<div><h3 style="font-size:12.5px; font-weight:700; margin-bottom:8px; color:var(--red);">Zayıflayan Sinyaller</h3>' + down + '</div>' +
    '</div>' +
  '</div>';
}

async function renderCfoDecisionCockpit() {
  const el = $('#cfoDecisionCockpit');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildCfoDecisionCockpit) { el.innerHTML = ''; return; }
  let base = REPORT_CACHE && REPORT_CACHE.base;
  if (!base) {
    try {
      const report = await loadReportCache();
      base = report && report.base;
    } catch (_) {
      base = {};
    }
  }
  const cockpit = window.FinansActionLayer.buildCfoDecisionCockpit(DATA, JOURNAL, base || {});
  const statusLabel = { ready: 'Hazır', gated: 'Kanıta bağlı', blocked: 'Bloke', watch: 'İzle' };
  const rows = cockpit.rows.length ? cockpit.rows.map((row) => {
    const accessibleDetail = [row.marketLabel, row.decisionAsk, 'Teknik puan ' + row.score, 'Makro katmanı ' + row.adjustedScore, statusLabel[row.status] || row.status, row.bindingReason, 'Eksik kanıt: ' + row.missingEvidence.join('; '), 'Sonraki iş: ' + workflowLabel(row.nextWorkflow)].filter(Boolean).join('. ');
    return '<button class="cfo-row cfo-' + esc(row.status) + '" type="button" aria-label="' + esc(row.symbol + '. ' + accessibleDetail) + '" title="' + esc(accessibleDetail) + '" data-market="' + esc(row.market) + '" data-symbol="' + esc(row.symbol) + '" onclick="navigateToAsset(this.dataset.market, this.dataset.symbol)">' +
      '<span class="cfo-symbol"><b>' + esc(row.symbol) + '</b><small>' + esc(row.marketLabel) + '</small></span>' +
      '<span class="cfo-score"><b>Teknik ' + row.score + '</b><small>Makro ' + row.adjustedScore + '</small></span>' +
      '<span class="cfo-status">' + esc(statusLabel[row.status] || row.status) + '</span>' +
      '<span class="cfo-binding">' + esc(row.bindingReason) + '</span>' +
    '</button>';
  }).join('') : '<p class="muted compact">Karar satiri uretmek icin veri bekleniyor.</p>';

  el.innerHTML = '<div class="card reveal cfo-cockpit-card">' +
    '<div class="card-head"><h2>Karar hazırlığı</h2><span class="card-sub">Teknik puan sinyal düzeyidir; hazır olma durumu tez ve kanıt eksiklerini de kapsar.</span></div>' +
    '<p class="action-headline">' + esc(cockpit.summary) + '</p>' +
    '<div class="cfo-rows">' + rows + '</div>' +
  '</div>';
}

function renderPredictionScorecard() {
  const el = $('#predictionScorecard');
  const helper = window.FinansActionLayer;
  if (!el || !helper || !helper.buildPredictionCohorts) return;
  const cohorts = helper.buildPredictionCohorts(JOURNAL, new Date().toISOString());
  if (cohorts.unavailable) {
    el.innerHTML = '<div class="card scorecard-card"><h2>Teknik Sonuçlar</h2><p>Ölçüm kanıtı okunamadı. Başarı oranı hesaplanmadı.</p></div>';
    return;
  }
  const counts = cohorts.counts;
  const reasonLabel = reason => window.FinansPredictionEvidence ? window.FinansPredictionEvidence.reasonLabel(reason) : 'Ölçüm kontrolü okunamadı';
  const selected = typeof predictionCohortFilter === 'undefined' ? 'verified' : predictionCohortFilter;
  const modern = cohorts.groups.filter(group => group.status === 'versioned_result' || group.status === 'versioned_open');
  const archive = cohorts.groups.filter(group => group.status !== 'versioned_result' && group.status !== 'versioned_open');
  const market = code => code === 'us' ? 'ABD' : code === 'bist' ? 'BIST' : code === 'crypto' ? 'Kripto' : 'Piyasa bilinmiyor';
  const status = code => ({versioned_result:'Ölçüme uygun sonuç',versioned_open:'Sürümlü açık senaryo',legacy:'Eski · kanıtı eksik',invalid:'Geçersiz · ölçüm dışı',ambiguous:'Belirsiz · ölçüm dışı'})[code] || 'Ölçüm dışı';
  const source = code => code === 'system' ? 'Sistem' : code === 'user' ? 'Kullanıcı' : 'Kaynak bilinmiyor';
  const label = group => [market(group.market),source(group.source),group.strategyVersion || 'sürüm yok',group.resolverVersion || 'ölçüm yöntemi yok',status(group.status)].join(' / ');
  const selectionOptions = '<option value="verified">Ölçüme uygun gruplar</option>' + cohorts.groups.map(group => '<option value="' + encodeURIComponent(group.key) + '"' + (selected === group.key ? ' selected' : '') + '>' + esc(label(group)) + ' · ' + group.items.length + '</option>').join('');
  const selectedGroup = cohorts.groups.find(group => group.key === selected);
  const visible = selectedGroup ? [selectedGroup] : modern;
  const row = item => {
    const evidence = window.FinansPredictionEvidence && window.FinansPredictionEvidence.classify(item);
    const ambiguous = item.outcomeEvidence === 'ambiguous_bar' || item.outcome === 'ambiguous';
    const outcome = ambiguous ? 'Belirsiz · aynı mumda hedef ve stop' : ({open:'Açık', 'target-hit':'Hedef vuruldu', 'stop-hit':'Stop oldu', 'expired-win':'Vade · kâr', 'expired-loss':'Vade · zarar'})[item.outcome] || 'Sonuç sınıflandırılamadı';
    const finite = typeof item.resultPct === 'number' && Number.isFinite(item.resultPct);
    const result = ambiguous ? 'Getiri ölçülemedi' : finite ? (item.resultPct > 0 ? '+' : '') + item.resultPct + '%' : 'Getiri bilinmiyor';
    const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'}) + ' TSİ' : 'Zaman yok';
    return '<li class="scorecard-row"><div><b>' + esc(item.symbol || 'Sembol yok') + '</b><span>' + esc(outcome) + '</span></div><div><b>' + esc(result) + '</b><span>' + esc(date(item.resolvedAt || item.createdAt)) + '</span></div><small>' + esc([item.strategyVersion || 'strateji sürümü yok',item.resolverVersion || 'ölçüm sürümü yok',evidence && evidence.reasons.length ? evidence.reasons.map(reasonLabel).join(', ') : ''].filter(Boolean).join(' · ')) + '</small></li>';
  };
  const groupHtml = group => {
    const card = group.scorecard;
    const measurable = group.status === 'versioned_result';
    const legacy = group.status === 'legacy';
    const rate = (measurable || legacy) && card.decisive > 0 && card.winRate != null ? card.winRate + '% (' + card.wins + '/' + card.decisive + ' belirleyici)' : 'Hesaplanamadı — belirleyici örnek yok';
    const avg = (measurable || legacy) && card.resultSampleSize > 0 && card.avgResultPct != null ? (card.avgResultPct > 0 ? '+' : '') + card.avgResultPct + '% · n=' + card.resultSampleSize : 'Hesaplanamadı — sonuç verisi yok';
    const items = group.items.slice().sort((a,b) => String(b.resolvedAt || b.createdAt || '').localeCompare(String(a.resolvedAt || a.createdAt || '')));
    return '<section class="scorecard-cohort"><h3>' + esc(market(group.market) + ' · ' + source(group.source)) + '</h3><p class="scorecard-evidence-strip">' + esc([group.strategyVersion || 'Sürüm yok',group.resolverVersion || 'Ölçüm yöntemi yok',status(group.status)].join(' · ')) + '</p>' +
      (legacy ? '<p class="scorecard-caveat">Doğrulanmamış arşiv hesabı. Kaynak veya sürüm kanıtı eksik; yeni performansa ve öğrenme girdisine katılmaz.</p>' : '') +
      '<div class="scorecard-metrics"><div><b>' + esc(rate) + '</b><span>' + (legacy ? 'Arşiv isabeti · doğrulanmamış' : 'İsabet · belirleyici') + '</span></div><div><b>' + card.open + '</b><span>Açık senaryo</span></div><div><b>' + card.wins + '/' + card.losses + '</b><span>Kazan / kaybet' + (measurable || legacy ? '' : ' · ölçüm dışı') + '</span></div><div><b>' + card.ambiguous + '</b><span>Belirsiz</span></div><div><b>' + card.unscored + '</b><span>Puanlanamayan</span></div><div><b>' + esc(avg) + '</b><span>Ort. brüt senaryo getirisi</span></div></div>' +
      '<ul class="scorecard-list">' + items.slice(0,5).map(row).join('') + '</ul>' + (items.length > 5 ? '<details><summary>Tüm ' + items.length + ' kaydı incele</summary><ul class="scorecard-list">' + items.slice(5).map(row).join('') + '</ul></details>' : '') + '</section>';
  };
  el.innerHTML = '<div class="card scorecard-card"><div class="card-head"><h2>Teknik Sonuçlar</h2><span class="card-sub">Sistem senaryoları · model tahminlerinden ayrı</span></div><p class="scorecard-evidence-strip">Ölçüme uygun <b>' + counts.versioned_result + '</b> sonuç · sürümlü <b>' + counts.versioned_open + '</b> açık · eski <b>' + counts.legacy + '</b> · geçersiz <b>' + counts.invalid + '</b> · belirsiz <b>' + counts.ambiguous + '</b></p><label class="scorecard-cohort-toolbar">İncelenen grup<select id="predictionCohortSelect">' + selectionOptions + '</select></label><p class="scorecard-caveat">Piyasa, kaynak, strateji ve ölçüm sürümleri birleştirilmez. Brüt senaryo getirisi; gerçekleşmiş net hesap getirisi değildir, komisyon ve vergileri içermez. Belirsiz sonuçlar isabet ve getiri ortalamasından çıkarılır.</p>' +
    (visible.length ? visible.map(groupHtml).join('') : '<p class="muted compact">Henüz ölçüme uygun kapanış yok. İsabet oranı ve ortalama getiri üretilemez.</p>') +
    '<details class="scorecard-archive"><summary>Ölçüm dışındaki kayıtlar (' + (counts.legacy + counts.invalid + counts.ambiguous) + ')</summary><p class="scorecard-caveat">Eski veya geçersiz kayıtlar yeniden yazılmadı. Ayrıntıları üstteki grup seçimiyle inceleyebilirsiniz.</p>' + archive.map(group => '<p>' + esc(label(group)) + ' · <b>' + group.items.length + '</b> kayıt</p>').join('') + '<p>Kontrol bulguları: ' + esc(Object.keys(cohorts.reasons).map(reason=>reasonLabel(reason) + ': ' + cohorts.reasons[reason]).join(' · ') || 'Yok') + '</p></details></div>';
  const control = el.querySelector && el.querySelector('#predictionCohortSelect');
  if (control) control.addEventListener('change', () => {
    predictionCohortFilter = decodeURIComponent(control.value);
    renderPredictionScorecard();
    const updated = el.querySelector('#predictionCohortSelect');
    if (updated) updated.focus();
  });
}

async function renderDecisionLearningPanel() {
  const el = $('#decisionLearningPanel');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildDecisionLearningPanel) return;

  let base = REPORT_CACHE && REPORT_CACHE.base;
  if (!base) {
    el.innerHTML = '<div class="card reveal decision-learning-card"><div class="card-head"><h2>Karar Öğrenme Döngüsü</h2><span class="card-sub">Rapor kaynağı okunuyor</span></div><p class="muted compact">Karar öğrenme verisi yükleniyor.</p></div>';
    try {
      const report = await loadReportCache();
      base = report && report.base;
    } catch (e) {
      base = null;
    }
  }

  const learning = window.FinansActionLayer.buildDecisionLearningPanel(base);

  if (learning.empty) {
    el.innerHTML = '<div class="card reveal decision-learning-card">' +
      '<div class="card-head"><h2>Karar Öğrenme Döngüsü</h2><span class="card-sub">' + esc(learning.summary) + '</span></div>' +
      '<p class="muted compact">Öğrenme verisi bulunamadı veya henüz işlenmedi.</p>' +
      '</div>';
    return;
  }

  const metrics = learning.metrics.map(function(m) {
    return '<div><b>' + esc(m.value) + '</b><span>' + esc(m.label) + '</span></div>';
  }).join('');

  const rules = learning.proposalRules.length ? learning.proposalRules.map(function(r) {
    const adj = r.adjustment > 0 ? '+' + r.adjustment : r.adjustment;
    return '<li>' +
      '<b>' + esc(r.scopeLabel) + '</b>' +
      '<span>' + adj + ' · doğrulama bekliyor</span>' +
      '<em>' + esc(r.reason) + ' (örnek: ' + r.sampleSize + ')</em>' +
      '</li>';
  }).join('') : '<li><em>Yeterli ve uygun örneklemden üretilmiş öneri yok.</em></li>';

  const lessons = learning.lessons.length ? learning.lessons.map(function(l) {
    return '<li>' +
      '<b>' + esc(l.symbol) + ' (' + esc(marketShortLabel(l.market)) + ')</b>' +
      '<span>Tek kayıt gözlemi · ileri dönem doğrulaması yok</span>' +
      '<em>' + esc(l.lesson) + '</em>' +
      '</li>';
  }).join('') : '<li><em>Son ders bulunamadı.</em></li>';

  const review = learning.reviewQueue.length ? learning.reviewQueue.map(function(q) {
    const prioCls = q.priority === 'high' ? 'imp-neg' : 'imp-neutral';
    return '<li>' +
      '<b>' + esc(marketShortLabel(q.market)) + '</b>' +
      '<span><span class="news-impact ' + prioCls + '" style="font-size: 12px; padding:2px 4px; border-radius:4px; font-weight:700;">' + esc(q.priority.toUpperCase()) + '</span></span>' +
      '<em>' + esc(q.reason) + ' <br><strong style="color:var(--text); font-size: 12px;">Eylem:</strong> ' + esc(q.nextAction) + '</em>' +
      '</li>';
  }).join('') : '<li><em>İnceleme sırası boş.</em></li>';

  el.innerHTML = '<div class="card reveal decision-learning-card">' +
    '<div class="card-head"><h2>Karar Öğrenme Döngüsü</h2><span class="card-sub">' + esc(learning.summary) + '</span></div>' +
    '<div class="learning-metrics">' + metrics + '</div>' +
    '<div class="learning-grid">' +
      '<div>' +
      '<h4>Örüntü önerileri · etkin değil</h4>' +
      '<ul>' + rules + '</ul>' +
      '</div>' +
      '<div>' +
        '<h4>Son Çıkarılan Dersler</h4>' +
        '<ul>' + lessons + '</ul>' +
      '</div>' +
      '<div>' +
        '<h4>İnceleme Sırası</h4>' +
        '<ul>' + review + '</ul>' +
      '</div>' +
    '</div>' +
    '<p class="learning-disclosure">Ölçüme katılmayan ' + learning.excludedCount + ' kayıt. Örüntü önerileri ileri dönem doğrulaması bekler; aktif veya kalibre edilmiş performans iddiası değildir.</p>' +
    ((learning.archivedRules.length || learning.archivedLessons.length) ? '<details class="learning-archive"><summary>Eski çıkarımlar · doğrulanmamış arşiv</summary><p>Bu metinler önceki yöntemin çıktılarıdır. Bugünkü puanı değiştirmez ve ölçülmüş başarı sayılmaz.</p><ul>' + learning.archivedRules.map(r=>'<li>' + esc(r.reason) + '</li>').join('') + learning.archivedLessons.map(l=>'<li>' + esc(l.symbol || '') + ': ' + esc(l.lesson) + '</li>').join('') + '</ul></details>' : '') +
    '</div>';
}

function assetLearningCard(x) {
  if (!x) return '';
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildAssetLearningSnippet) return '';
  const base = REPORT_CACHE && REPORT_CACHE.base ? REPORT_CACHE.base : null;
  const snippet = window.FinansActionLayer.buildAssetLearningSnippet(x, base);
  if (!snippet) return '';

  const cls = snippet.adjustment > 0 ? 'alc-pos' : snippet.adjustment < 0 ? 'alc-neg' : 'alc-neutral';
  const adjLabel = snippet.adjustment !== 0 ? (snippet.adjustment > 0 ? '+' : '') + snippet.adjustment : '';

  return '<div class="asset-learning-card ' + cls + '">' +
    '<div class="research-head"><h4>Karar Öğrenimi</h4><span>' + esc(snippet.kind) + '</span></div>' +
    '<div class="asset-learning-title"><b>' + esc(snippet.title) + (adjLabel ? ' (' + adjLabel + ')' : '') + '</b></div>' +
    '<p>' + esc(snippet.detail) + '</p>' +
    '<em>' + (snippet.kind === 'archive' ? 'Doğrulanmamış arşiv · puan etkisi yok' : 'Tek kayıt gözlemi · puan etkisi yok · ileri dönem doğrulaması gerekli') + '</em>' +
    '</div>';
}

function getReportSignalOverlay() {
  if (!REPORT_CACHE) return null;
  const report = window.FinansReportIntegrity.envelope(REPORT_CACHE, DATA);
  return report.base && report.base.signalOverlay || null;
}

function getAssetSignalOverlay(asset) {
  const overlay = getReportSignalOverlay();
  if (!overlay || !overlay.assets || !asset) return null;
  const market = String(asset.market || '').toLowerCase();
  const key = market + ':' + String(asset.symbol || '').toUpperCase();
  return overlay.assets[key] || null;
}

function adjustmentLabel(n) {
  const value = Number(n) || 0;
  return (value > 0 ? '+' : '') + value;
}
function overlayTypeLabel(type) {
  return {
    macro: 'Makro',
    fedDecision: 'Fed karari',
    usRetailSales: 'ABD perakende',
    aiCapexReadThrough: 'Yapay zeka yatirimi',
    enterpriseAiDemand: 'Kurumsal yapay zeka talebi',
    btcLiquidity: 'BTC likiditesi',
    tlPressure: 'TL baskisi',
    tcmbCarry: 'TCMB tasima etkisi',
    oilSensitivity: 'Petrol hassasiyeti',
    companyNews: 'Sirket haberi',
    earnings: 'Bilanco',
    macroCatalyst: 'Makro katalizor',
    thesisStatus: 'Tez durumu',
    tearsheetCompleteness: 'Veri tamligi',
    compsValuationGap: 'Carpan boslugu',
    modelAuditGap: 'Model denetimi',
    scenarioSensitivity: 'Senaryo hassasiyeti',
    predictionCalibration: 'Tahmin kalibrasyonu',
    learningCalibration: 'Ogrenme kalibrasyonu',
  }[type] || type || 'Bilesen';
}
function overlayStatusLabel(status) {
  return {
    boost: 'Destek',
    risk: 'Risk',
    watch: 'Izle',
    neutral: 'Notr',
    ready: 'Hazir',
    gated: 'Kanita bagli',
    blocked: 'Bloke',
  }[status] || status || 'Belirsiz';
}
function marketShortLabel(market) {
  return { us: 'ABD', bist: 'BIST', crypto: 'Kripto', macro: 'Makro' }[String(market || '').toLowerCase()] || String(market || '').toUpperCase();
}
function catalystPressureLabel(value) {
  return { high: 'yuksek', medium: 'orta', low: 'dusuk' }[value] || value || 'belirsiz';
}
function timingLabel(value) {
  return { dated: 'tarihli', window: 'pencere' }[value] || value || 'belirsiz';
}
function sourceLabel(value) {
  const text = String(value || '').trim();
  return {
    'company/news': 'Sirket haberi',
    calendar: 'Takvim',
    Yahoo: 'Yahoo',
    SeekingAlpha: 'Seeking Alpha',
  }[text] || text.replace(/\//g, ' / ') || 'Kaynak';
}
function actionKindLabel(value) {
  return {
    add: 'Ekle',
    buy: 'Al',
    hold: 'Tut',
    watch: 'Izle',
    trim: 'Azalt',
    reduce: 'Azalt',
    rebalance: 'Dengele',
    exit: 'Cik',
    avoid: 'Uzak dur',
  }[value] || value || 'Not';
}
function workflowLabel(value) {
  return {
    'thesis tracker -> catalyst calendar': 'tez takibi -> katalizor takvimi',
    'thesis tracker -> company tearsheet': 'tez takibi -> sirket ozeti',
    'valuation / expectations gate': 'degerleme / beklenti kapisi',
    'prediction calibration': 'tahmin kalibrasyonu',
    'watchlist / thesis draft': 'izleme listesi / tez taslagi',
    'reject / wait for repair': 'reddet / sinyal onarimini bekle',
  }[value] || value || 'Not';
}
function verdictLabel(value) {
  return {
    blocked: 'Bloke',
    'screen-grade': 'Tarama kalitesi',
    'senior-review-ready': 'Kidemli incelemeye hazir',
  }[value] || value || 'Belirsiz';
}

function renderSignalOverlayPanel() {
  const el = $('#signalOverlayPanel');
  if (!el) return;
  const overlay = getReportSignalOverlay();
  if (!overlay || !overlay.assets) {
    const existingResearch = !!(REPORT_CACHE && REPORT_CACHE.ai);
    el.innerHTML = '<div class="card reveal signal-overlay-card"><div class="card-head"><h2>Makro sinyal katmanı</h2><span class="card-sub">Güncel fiyatlarla eşleşen katman yok</span></div><p class="muted compact">' +
      (existingResearch ? 'Araştırma kaydı var; bu fiyat kesitine uygulanabilecek doğrulanmış skor etkisi yok.' : 'Bu fiyat kesitine uygulanabilecek doğrulanmış makro skor etkisi henüz yok.') +
      ' Teknik skorlar aynen kullanılıyor.</p></div>';
    return;
  }

  const summary = overlay.summary || {};
  const assets = Object.values(overlay.assets || {})
    .filter((x) => x.totalAdjustment !== 0)
    .sort((a, b) => Math.abs(b.totalAdjustment) - Math.abs(a.totalAdjustment))
    .slice(0, 6);
  const markets = ['us', 'bist', 'crypto'].map((m) => {
    const item = overlay.market && overlay.market[m] ? overlay.market[m] : { adjustment: 0, reason: 'notr' };
    const cls = item.adjustment > 0 ? 'pos' : item.adjustment < 0 ? 'neg' : 'neutral';
    return '<div class="overlay-market om-' + cls + '"><b>' + esc(marketShortLabel(m)) + ' ' + adjustmentLabel(item.adjustment) + '</b><span>' + esc(item.reason || '') + '</span></div>';
  }).join('');
  const rows = assets.length ? assets.map((x) => {
    const cls = x.totalAdjustment > 0 ? 'pos' : 'neg';
    const top = (x.components || [])[0];
    return '<button class="overlay-row" type="button" onclick="navigateToAsset(\'' + esc(x.market) + '\', \'' + esc(x.symbol) + '\')">' +
      '<span><b>' + esc(x.symbol) + '</b><small>Teknik ' + x.technicalScore + ' -> Makro ' + x.adjustedScore + ' · ' + esc(top ? overlayTypeLabel(top.type) : overlayStatusLabel(x.status)) + '</small></span>' +
      '<em class="overlay-adj oa-' + cls + '">' + adjustmentLabel(x.totalAdjustment) + '</em>' +
    '</button>';
  }).join('') : '<p class="muted compact">Aktif makro/katalizor etkisi yok.</p>';

  el.innerHTML = '<div class="card reveal signal-overlay-card">' +
    '<div class="card-head"><h2>Makro Sinyal Katmani</h2><span class="card-sub">Teknik skoru bozmaz; toplam etki +/-' + overlay.maxAdjustment + '</span></div>' +
    '<div class="overlay-summary">' +
      '<div><b>' + (summary.boosted || 0) + '</b><span>Destek</span></div>' +
      '<div><b>' + (summary.reduced || 0) + '</b><span>Baski</span></div>' +
      '<div><b>' + (summary.highPressure || 0) + '</b><span>Katalizor</span></div>' +
      '<div><b>' + (summary.stale || 0) + '</b><span>Suresi dolan</span></div>' +
    '</div>' +
    '<div class="overlay-markets">' + markets + '</div>' +
    '<div class="overlay-rows">' + rows + '</div>' +
  '</div>';
}

function assetSignalOverlayCard(x) {
  const overlay = getAssetSignalOverlay(x);
  if (!overlay) return '';
  const cls = overlay.totalAdjustment > 0 ? 'pos' : overlay.totalAdjustment < 0 ? 'neg' : 'neutral';
  const components = (overlay.components || []).slice(0, 7).map((c) => {
    const tone = c.adjustment > 0 ? 'pos' : c.adjustment < 0 ? 'neg' : 'neutral';
    return '<li><span class="overlay-chip oc-' + tone + '">' + adjustmentLabel(c.adjustment) + '</span><b>' + esc(overlayTypeLabel(c.type)) + '</b><em>' + esc(c.reason || '') + '</em></li>';
  }).join('');
  const expired = (overlay.expiredComponents || []).length
    ? '<p class="overlay-expired">' + overlay.expiredComponents.length + ' eski makro sinyal suresi doldugu icin etkisiz.</p>'
    : '';
  return '<div class="asset-overlay-card aoc-' + cls + '">' +
    '<div class="research-head"><h4>Makro Katman</h4><span>' + esc(overlayStatusLabel(overlay.status)) + ' · guven ' + Math.round((overlay.confidence || 0) * 100) + '%</span></div>' +
    '<div class="asset-overlay-score"><div><span>Teknik skor</span><b>' + overlay.technicalScore + '</b></div><div><span>Makro etki</span><b>' + adjustmentLabel(overlay.totalAdjustment) + '</b></div><div><span>Ayarlanmis skor</span><b>' + overlay.adjustedScore + '</b></div></div>' +
    '<ul class="asset-overlay-components">' + (components || '<li><em>Aktif bilesen yok.</em></li>') + '</ul>' +
    expired +
  '</div>';
}

function bucketTitle(key) {
  return {
    advance: 'Derin arastirma',
    watchlist: 'Izleme listesi',
    gated: 'Degerleme kapisi',
    unproven: 'Kanitsiz tema',
    reject: 'Reddet',
  }[key] || key;
}

function renderIdeaFunnel() {
  const el = $('#ideaFunnel');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildIdeaFunnel) { el.innerHTML = ''; return; }
  const funnel = window.FinansActionLayer.buildIdeaFunnel(DATA, JOURNAL);
  const keys = ['advance', 'watchlist', 'gated', 'reject'];
  const bucketHtml = keys.map((key) => {
    const rows = (funnel.buckets[key] || []).slice(0, 4);
    const empty = '<p class="muted compact">Bu kovada aday yok.</p>';
    const list = rows.length ? rows.map((x) => {
      return '<button class="idea-row" type="button" onclick="navigateToAsset(\'' + esc(x.market) + '\', \'' + esc(x.symbol) + '\')">' +
      '<span><b>' + esc(x.symbol) + '</b><small>' + esc(x.marketLabel) + ' · ' + esc(workflowLabel(x.nextWorkflow)) + '</small></span>' +
        '<em class="badge tone-' + esc(x.tone) + '">' + esc(x.label) + ' · ' + x.score + '</em>' +
      '</button>';
    }).join('') : empty;
    return '<div class="idea-bucket ib-' + key + '">' +
      '<div class="idea-bucket-head"><h3>' + bucketTitle(key) + '</h3><span>' + (funnel.counts[key] || 0) + '</span></div>' +
      list +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="card reveal idea-funnel-card">' +
    '<div class="card-head"><h2>Fikir Hunisi</h2><span class="card-sub">Aday, izleme ve red kovaları; nihai tavsiye degildir</span></div>' +
    '<p class="action-headline">' + esc(funnel.headline) + '</p>' +
    '<div class="idea-grid">' + bucketHtml + '</div>' +
  '</div>';
}

function checkedReport(raw) {
  const result = window.FinansReportIntegrity.envelope(raw, DATA);
  if (!raw.ai && raw.integrity) result.integrity = FinansResearch.restoreStrippedResearchMetadata(result.integrity, raw.integrity);
  return Object.assign({}, raw, result);
}
async function loadReportCache(force) {
  if (!force && REPORT_CACHE && Date.now() - REPORT_CACHED_AT < 30000) return checkedReport(REPORT_CACHE);
  if (REPORT_REQUEST) return REPORT_REQUEST;
  REPORT_REQUEST = (async () => {
    const res = await fetch('/api/report', { cache: 'no-store' });
    if (!res.ok) throw new Error('Rapor kaynagi kullanilamiyor');
    REPORT_CACHE = checkedReport(await res.json());
    REPORT_CACHED_AT = Date.now();
    return REPORT_CACHE;
  })();
  try { return await REPORT_REQUEST; } finally { REPORT_REQUEST = null; }
}

async function renderCatalystCalendar() {
  const el = $('#catalystCalendar');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildCatalystCalendar) { el.innerHTML = ''; return; }

  let base = REPORT_CACHE && REPORT_CACHE.base;
  if (!base) {
    el.innerHTML = '<div class="card reveal catalyst-card"><div class="card-head"><h2>Katalizor Takvimi</h2><span class="card-sub">Rapor kaynagi okunuyor</span></div><p class="muted compact">Katalizor verisi yukleniyor.</p></div>';
    try {
      const report = await loadReportCache();
      base = report && report.base;
    } catch (e) {
      base = null;
    }
  }

  const calendar = window.FinansActionLayer.buildCatalystCalendar(DATA, base || {});
  const rows = calendar.events.slice(0, 6).map((ev) => {
    const pressureCls = ev.decisionPressure === 'high' ? 'imp-neg' : ev.decisionPressure === 'medium' ? 'imp-neutral' : 'imp-pos';
    return '<div class="catalyst-row">' +
      '<div><b>' + esc(ev.title) + '</b><span>' + esc(ev.symbol || marketShortLabel(ev.market) || 'Makro') + ' · ' + esc(timingLabel(ev.timingConfidence)) + ' · ' + esc(sourceLabel(ev.source)) + '</span></div>' +
      '<div class="catalyst-meta"><small>' + esc(ev.date ? fullTimestamp(/^\d{10,13}$/.test(String(ev.date)) ? Number(ev.date) : ev.date) : 'Zaman penceresi doğrulanamadı') + '</small><em class="news-impact ' + pressureCls + '">' + esc(catalystPressureLabel(ev.decisionPressure)) + '</em></div>' +
    '</div>';
  }).join('');
  const prep = calendar.prepQueue.slice(0, 3).map((x) => '<li>' + esc(x.action) + '</li>').join('');

  el.innerHTML = '<div class="card reveal catalyst-card">' +
    '<div class="card-head"><h2>Katalizor Takvimi</h2><span class="card-sub">Karar baskisina gore sirali olaylar</span></div>' +
    (rows || '<p class="muted compact">Rapor kaynaginda izlenecek katalizor yok. /api/report uretildiginde burada siralanir.</p>') +
    (prep ? '<div class="prep-queue"><h3>Hazirlik kuyrugu</h3><ul>' + prep + '</ul></div>' : '') +
  '</div>';
}

function renderPortfolioRiskPlan() {
  const actionsEl = $('#portfolioActions');
  const riskEl = $('#portfolioRiskPlan');
  if (!portfolioData || !window.FinansActionLayer || !window.FinansActionLayer.buildPortfolioRiskPlan) {
    if (actionsEl) actionsEl.innerHTML = '';
    if (riskEl) riskEl.innerHTML = '';
    return;
  }
  const USDTRY = (DATA.fx && DATA.fx.usdtry) ? DATA.fx.usdtry : 38.0;
  const plan = window.FinansActionLayer.buildPortfolioRiskPlan({ data: DATA, portfolioData: portfolioData, usdtry: USDTRY });
  const missingPrices = ['us', 'bist', 'crypto'].some((market) => (portfolioData[market] || []).some((holding) => { const asset = (DATA[market] || []).find((item) => item.symbol === holding.symbol); return !asset || !Number.isFinite(asset.price) || asset.price <= 0; }));
  if (actionsEl) {
    actionsEl.innerHTML = '<div class="card reveal action-card">' +
      '<div class="card-head"><h2>Portfoy Aksiyonlari</h2><span class="card-sub">Pozisyon ve sinyal kaynakli karar notlari</span></div>' +
      '<div class="portfolio-actions">' + (plan.actions.length ? plan.actions.map((a) => {
        return '<div class="portfolio-action pa-' + esc(a.tone) + '"><span>' + esc(actionKindLabel(a.kind)) + '</span><p>' + esc(a.text) + '</p></div>';
      }).join('') : '<p class="muted compact">Portfoy aksiyonu yok.</p>') + '</div>' +
    '</div>';
  }
  if (riskEl) {
    const constraints = plan.constraints.length ? plan.constraints.map((c) => {
      return '<div class="risk-constraint"><b>' + esc(c.label) + '</b><span>' + esc(c.detail) + '</span></div>';
    }).join('') : '<p class="muted compact">Baglayici risk kisiti yok.</p>';
    const rules = plan.monitoringRules.slice(0, 5).map((r) => '<li><b>' + esc(r.symbol || 'Portfoy') + ':</b> ' + esc(r.action) + '</li>').join('');
    const budget = plan.riskBudget || { totalNavUsd: plan.totalUsd, maxSingleNamePct: 35, maxCryptoPct: 50, bindingConstraint: '-' };
    const allocRows = (plan.targetAllocations || []).slice(0, 6).map((x) => {
      return '<div class="target-allocation ta-' + esc(x.action) + '">' +
        '<b>' + esc(x.symbol) + '</b><span>' + esc(x.currentWeightPct) + '% -> azami ' + esc(x.maxWeightPct) + '%</span><em>' + esc(actionKindLabel(x.action)) + '</em>' +
      '</div>';
    }).join('');
    riskEl.innerHTML = '<div class="card reveal risk-plan-card rp-' + esc(plan.status) + '">' +
      '<div class="card-head"><h2>Risk Plani</h2><span class="card-sub">Baglayici kisit, tutulacak risk ve izleme kurallari</span></div>' +
      (missingPrices ? '<p class="portfolio-data-warning">Eksik fiyat var. Aşağıdaki hesap yalnız fiyatı bulunan pozisyonların planıdır; tüm portföyün risk değerlendirmesi değildir.</p>' : '') +
      '<div class="risk-budget-strip">' +
        '<div><span>NAV</span><b>$' + fmtNum(budget.totalNavUsd, 0) + '</b></div>' +
        '<div><span>Tek varlik limiti</span><b>%' + esc(budget.maxSingleNamePct) + '</b></div>' +
        '<div><span>Kripto limiti</span><b>%' + esc(budget.maxCryptoPct) + '</b></div>' +
        '<div><span>Baglayici kisit</span><b>' + esc(budget.bindingConstraint) + '</b></div>' +
      '</div>' +
      '<div class="risk-plan-layout">' +
        '<div><span class="risk-status">' + esc(plan.status) + '</span><p>' + esc(plan.retainedExposure) + '</p></div>' +
        '<div class="risk-constraints">' + constraints + '</div>' +
        '<div class="risk-rules"><h3>Izleme kurallari</h3><ul>' + (rules || '<li>Kural uretmek icin portfoy verisi ekle.</li>') + '</ul></div>' +
      '</div>' +
      '<div class="target-allocation-list">' + (allocRows || '<p class="muted compact">Hedef agirlik icin portfoy verisi ekle.</p>') + '</div>' +
    '</div>';
  }
}

let calculatorListenersAttached = false;

function renderLiteracyView() {
  const guides = $('#view-literacy .lit-grid');
  if (guides && !$('#literacyContents')) {
    const layout = document.createElement('div'); layout.className = 'literacy-reading-layout';
    guides.parentElement.insertBefore(layout, guides);
    const nav = document.createElement('nav'); nav.id = 'literacyContents'; nav.className = 'literacy-contents'; nav.setAttribute('aria-label', 'Öğrenme konuları');
    nav.innerHTML = '<h3>Konu defteri</h3>';
    guides.querySelectorAll(':scope > article').forEach((article, index) => {
      article.id = 'literacy-topic-' + index;
      const heading = article.querySelector('h3'); if (!heading) return;
      const link = document.createElement('a'); link.href = '#' + article.id; link.textContent = heading.textContent;
      link.addEventListener('click', (event) => { event.preventDefault(); article.tabIndex = -1; article.scrollIntoView({behavior: reduceMotion ? 'instant' : 'smooth', block: 'start'}); article.focus({preventScroll:true}); });
      nav.appendChild(link);
    });
    layout.append(nav, guides);
  }
  // 1. Fetch tips archive
  fetch('/api/report', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      const tips = data && data.tipsArchive;
      renderTipsArchive(tips);
    })
    .catch(err => {
      console.error('İpuçları yüklenemedi:', err);
      renderTipsArchive([]);
    });

  // 2. Setup calculator listeners (only once)
  if (!calculatorListenersAttached) {
    const inputs = ['#calc-capital', '#calc-risk-pct', '#calc-price', '#calc-atr'];
    inputs.forEach(sel => {
      const el = $(sel);
      if (el) {
        el.addEventListener('input', updatePositionCalculator);
      }
    });
    calculatorListenersAttached = true;
  }
  
  // Initial calculation
  updatePositionCalculator();
  triggerRevealAnimations($('#view-literacy'));
}

function updatePositionCalculator() {
  if (!window.FinansActionLayer || !window.FinansActionLayer.calculatePosition) return;
  
  const capital = parseFloat($('#calc-capital').value) || 0;
  const riskPct = parseFloat($('#calc-risk-pct').value) || 0;
  const price = parseFloat($('#calc-price').value) || 0;
  const atr = parseFloat($('#calc-atr').value) || 0;
  
  const res = window.FinansActionLayer.calculatePosition(capital, riskPct, price, atr);
  
  if (res.available) {
    $('#res-entry').textContent = fmtNum(res.entry, res.entry >= 1000 ? 0 : res.entry >= 1 ? 2 : 4);
    $('#res-stop').textContent = fmtNum(res.stop, res.stop >= 1000 ? 0 : res.stop >= 1 ? 2 : 4);
    $('#res-target').textContent = fmtNum(res.target, res.target >= 1000 ? 0 : res.target >= 1 ? 2 : 4);
    $('#res-risk-amount').textContent = fmtNum(res.riskAmount, 2);
    $('#res-units').textContent = res.units >= 1 ? fmtNum(Math.floor(res.units), 0) : fmtNum(res.units, 4);
    $('#res-pos-amount').textContent = fmtNum(res.positionAmount, 2);
  } else {
    $('#res-entry').textContent = '–';
    $('#res-stop').textContent = '–';
    $('#res-target').textContent = '–';
    $('#res-risk-amount').textContent = '–';
    $('#res-units').textContent = '–';
    $('#res-pos-amount').textContent = '–';
  }
}

function renderTipsArchive(tips) {
  const el = $('#tipsArchiveList');
  if (!el) return;
  
  if (!tips || !tips.length) {
    el.innerHTML = '<p class="muted" style="text-align:center; padding:12px;">Henüz arşivlenmiş ipucu yok.</p>';
    return;
  }
  
  const sorted = tips.slice().sort((a, b) => b.date.localeCompare(a.date));
  
  el.innerHTML = sorted.map(tip => {
    return '<div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:16px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<h4 style="margin:0; font-size:13.5px; font-weight:700;">' + esc(tip.title) + '</h4>' +
        '<span style="font-size: 12px; color:var(--muted); font-family:monospace;">' + esc(tip.date) + '</span>' +
      '</div>' +
      '<p style="margin:0; font-size:12.5px; color:var(--text); line-height:1.5;">' + esc(tip.body) + '</p>' +
    '</div>';
  }).join('');
}

window.submitQuizAnswer = function(selectedIndex, correctIndex, quizDate) {
  const isCorrect = selectedIndex === correctIndex;
  let streak = parseInt(localStorage.getItem('finans-quiz-streak') || '0', 10);
  if (isCorrect) {
    streak += 1;
  } else {
    streak = 0;
  }
  localStorage.setItem('finans-quiz-last-played', quizDate);
  localStorage.setItem('finans-quiz-last-selected', selectedIndex);
  localStorage.setItem('finans-quiz-streak', streak);
  
  renderReport();
};

/* ---------- GSAP Premium Animasyonları ---------- */
function triggerRevealAnimations(container) {
  if (!container) return;
  container.querySelectorAll('.card, .kpi, .table-wrap, .trading-desk, .lit, .scenario').forEach((item) => {
    item.style.removeProperty('opacity');
    item.style.removeProperty('transform');
  });
}

function initAnimations() { /* Interaction motion is handled by stateful CSS. */ }

// Delegated event listeners for note-saving form and suggested alert switch
function syncJournalSaveControls() {
  document.querySelectorAll('.asset-note-form button[type="submit"], .alert-toggle-form input[type="checkbox"]').forEach((control) => {
    control.disabled = journalSaving;
  });
}

function setNoteSaveStatus(key, message) {
  document.querySelectorAll('.asset-note-form').forEach((form) => {
    if (form.dataset.market + ':' + form.dataset.symbol !== key) return;
    const status = form.querySelector('.note-status');
    if (status) status.textContent = message;
  });
}

function syncAlertSaveResult(id, message) {
  document.querySelectorAll('.alert-toggle-form').forEach((form) => {
    const formId = [form.dataset.market.toLowerCase(), form.dataset.symbol.toUpperCase(), form.dataset.trigger.toLowerCase()].join(':');
    if (formId !== id) return;
    const checkbox = form.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = (JOURNAL.alerts || []).some((alert) => alert.id === id && alert.enabled);
    const status = form.querySelector('.field-status');
    if (status) status.textContent = message;
  });
}

document.addEventListener('submit', async (e) => {
  const noteForm = e.target.closest('.asset-note-form');
  if (noteForm) {
    e.preventDefault();
    if (noteForm.dataset.saving === 'true') return;
    if (journalSaving) {
      const status = noteForm.querySelector('.note-status');
      if (status) status.textContent = 'Başka bir kayıt sürüyor. Tamamlandıktan sonra tekrar kaydedin; taslağınız korunuyor.';
      return;
    }
    journalSaving = true;
    noteForm.dataset.saving = 'true';
    syncJournalSaveControls();
    const market = noteForm.dataset.market;
    const symbol = noteForm.dataset.symbol;
    const key = market + ':' + symbol;
    const thesis = noteForm.elements.thesis.value;
    const invalidation = noteForm.elements.invalidation.value;
    const previousNotes = JSON.parse(JSON.stringify(JOURNAL.notes || {}));

    noteDrafts[key] = { thesis, invalidation };

    JOURNAL.notes[key] = {
      thesis: thesis.trim(),
      invalidation: invalidation.trim(),
      updatedAt: new Date().toISOString()
    };

    const statusEl = noteForm.querySelector('.note-status');
    if (statusEl) statusEl.textContent = 'Kaydediliyor...';

    try {
      await saveJournal();
      const draft = noteDrafts[key];
      const editedDuringSave = draft && (draft.thesis !== thesis || draft.invalidation !== invalidation);
      if (!editedDuringSave) delete noteDrafts[key];
      const message = editedDuringSave ? 'Önceki not kaydedildi. Yeni değişiklikler taslak; kaydetmeniz gerekiyor.' : '✓ Kaydedildi';
      if (statusEl) statusEl.textContent = message;
      // Refresh the row detail
      const row = noteForm.closest('.detail');
      if (row) {
        const idx = row.id.replace('detail-', '');
        const list = currentList();
        const asset = list[idx];
        if (asset) {
          const wrapper = row.querySelector('.asset-thesis-wrapper');
          if (wrapper) {
            const nextCard = assetThesisCard(asset);
            const temp = document.createElement('div');
            temp.innerHTML = nextCard;
            wrapper.replaceWith(temp.firstChild);
          }
        }
      }
      setNoteSaveStatus(key, message);
    } catch (err) {
      JOURNAL.notes = previousNotes;
      const message = 'Kaydedilemedi: ' + err.message + '. Taslağınız korunuyor.';
      if (statusEl) statusEl.textContent = message;
      setNoteSaveStatus(key, message);
    } finally {
      noteForm.dataset.saving = 'false';
      journalSaving = false;
      syncJournalSaveControls();
    }
  }
});

document.addEventListener('input', (e) => {
  const field = e.target.closest('.asset-note-form input, .asset-note-form textarea');
  if (!field) return;
  const form = field.closest('.asset-note-form');
  const key = form.dataset.market + ':' + form.dataset.symbol;
  noteDrafts[key] = noteDrafts[key] || {};
  noteDrafts[key][field.name] = field.value;
  const status = form.querySelector('.note-status');
  if (status) status.textContent = 'Taslak';
});

document.addEventListener('change', async (e) => {
  const alertSwitch = e.target.closest('.alert-toggle-form input[type="checkbox"]');
  if (alertSwitch) {
    const alertForm = alertSwitch.closest('.alert-toggle-form');
    if (alertForm) {
      const market = alertForm.dataset.market;
      const symbol = alertForm.dataset.symbol;
      const trigger = alertForm.dataset.trigger;
      const action = alertForm.dataset.action;
      const id = [market.toLowerCase(), symbol.toUpperCase(), trigger.toLowerCase()].join(':');
      if (journalSaving) {
        alertSwitch.checked = (JOURNAL.alerts || []).some((alert) => alert.id === id && alert.enabled);
        const status = alertForm.querySelector('.field-status');
        if (status) status.textContent = 'Başka bir kayıt sürüyor. Tamamlandıktan sonra tekrar deneyin.';
        return;
      }
      journalSaving = true;
      syncJournalSaveControls();
      const enabled = alertSwitch.checked;
      const previousAlerts = JSON.parse(JSON.stringify(JOURNAL.alerts || []));

      const alertObj = {
        id,
        market: market.toLowerCase(),
        symbol: symbol.toUpperCase(),
        trigger: trigger,
        action: action,
        enabled: enabled,
        createdAt: new Date().toISOString()
      };

      JOURNAL.alerts = (JOURNAL.alerts || []).filter(x => x.id !== id);
      if (enabled) {
        JOURNAL.alerts.push(alertObj);
      }

      alertForm.classList.add('saving');
      const status = alertForm.querySelector('.field-status');
      if (status) status.textContent = 'Kaydediliyor...';
      try {
        await saveJournal();
        const status = alertForm.querySelector('.field-status');
        if (status) status.textContent = 'Kural kaydedildi.';
        syncAlertSaveResult(id, 'Kural kaydedildi.');
      } catch (err) {
        console.error('Alarm kaydedilemedi:', err);
        JOURNAL.alerts = previousAlerts;
        alertSwitch.checked = !enabled;
        const status = alertForm.querySelector('.field-status, .note-status');
        if (status) status.textContent = 'Kural kaydedilemedi. Girdileriniz korunuyor.';
        syncAlertSaveResult(id, 'Kural kaydedilemedi. Girdileriniz korunuyor.');
      } finally {
        alertForm.classList.remove('saving');
        journalSaving = false;
        syncJournalSaveControls();
      }
    }
  }
});

