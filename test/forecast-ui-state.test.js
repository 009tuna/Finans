'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8').replace(/\r\n/g, '\n');
const context=vm.createContext({});
const start=source.indexOf('function syncForecastPanels(');
vm.runInContext(source.slice(start,source.indexOf('function renderForecastView(',start)),context);
const form={id:'form',dataset:{},hidden:false};
const result={id:'mc-results-container',dataset:{},hidden:true};
const valuation={id:'valuation',dataset:{},hidden:false};
const blocks={portfolio:[form,result,null],valuation:[valuation]};
context.syncForecastPanels(blocks,'portfolio');
assert.equal(form.hidden,false);
assert.equal(result.hidden,true,'mode selection cannot reveal uncalculated zero placeholders');
assert.equal(valuation.hidden,true);
result.dataset.resultReady='true';
context.syncForecastPanels(blocks,'portfolio');
assert.equal(result.hidden,false);
context.syncForecastPanels(blocks,'valuation');
assert.equal(result.hidden,true,'completed scenario stays hidden while studying valuation');
context.syncForecastPanels(blocks,'portfolio');
assert.equal(result.hidden,false,'last completed scenario survives mode changes');
console.log('Forecast mode and uncalculated result state tests passed');

;(async () => {
const helperStart = source.indexOf('function stressPortfolioSignature(');
const helperEnd = source.indexOf('let REPORT_CACHE', helperStart);
const stressStart = source.indexOf('async function loadStressScenarios(');
const stressSource = source.slice(helperStart, helperEnd) + source.slice(stressStart, source.indexOf('async function loadCorrelationMatrix('));
const stressRows = { innerHTML: '' };
const stressContext = vm.createContext({
  portfolioData: {}, portfolioState: 'ready', stressRequestVersion: 0, stressLastSuccessHtml: '', stressLastSuccessSignature: '',
  DATA: { generatedAt: '2026-10-03T07:00:00Z', us: [{ symbol: 'A', price: 1, __error: 'source unavailable' }], bist: [], crypto: [], fx: {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  $: (selector) => selector === '#stress-table-body' ? stressRows : null,
  esc: (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
  fmtNum: (value) => Number(value).toLocaleString('en-US'), fmtPct: (value) => Number(value).toFixed(1) + '%',
  fmtPrice: (value, currency) => value == null ? '–' : (currency === 'TRY' ? '₺' : '$') + value,
  setView: () => {}, console,
});
vm.runInContext(stressSource, stressContext);

await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /kayıtlı portföy pozisyonu yok[\s\S]*Portföye git/);

stressContext.portfolioData = null;
stressContext.portfolioState = 'unavailable';
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /Portföy verisi alınamadı[\s\S]*Portföye git/);
stressContext.portfolioState = 'loading';
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /Portföy verisi yükleniyor/);

stressContext.portfolioData = { us: [{ symbol: 'A', amount: 1 }], bist: [], crypto: [] };
stressContext.portfolioState = 'ready';
stressContext.fetch = async (url, options) => {
  assert.equal(options.method, 'POST', 'read-only calculation uses the visible portfolio, not a separate server portfolio');
  const posted = JSON.parse(options.body);
  assert.equal(posted.portfolio.us[0].symbol, 'A');
  assert.equal(posted.data.us[0].__error, 'source unavailable', 'source error flags survive the minimal input cut');
  return { ok: true, json: async () => ({ scenarios: { base: { name: 'Base', desc: 'x', shocks: [{ market: 'us', shockPct: 0 }], oldUSD: 1, oldTRY: 1, newUSD: 1, newTRY: 1, pnlUSD: 0, pnlTRY: 0, pctChange: 0 } } }) };
};
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /ABD: %0 · BIST: Pozisyon yok · Kripto: Pozisyon yok/);
assert.doesNotMatch(stressRows.innerHTML, /BIST: %0|Kripto: %0/);
stressContext.fetch = async () => ({ ok: true, json: async () => ({ scenarios: { local: { name: 'Local', desc: '', shocks: [], oldUSD: 10, oldTRY: null, newUSD: 9, newTRY: null, pnlUSD: -1, pnlTRY: null, pctChange: -10 } } }) });
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /\$10/);
assert.doesNotMatch(stressRows.innerHTML, /₺0|\+–|\$–|NaN/, 'unknown converted values keep their missing state');

stressContext.fetch = async () => ({ ok: true, json: async () => ({ scenarios: { unknown: { name: 'Unknown', desc: 'x', shocks: [{ market: 'us', shockPct: null }, { market: 'bist', shockPct: '' }, { market: 'crypto', shockPct: 0 }], oldUSD: 1, oldTRY: 1, newUSD: 1, newTRY: 1, pnlUSD: 0, pnlTRY: 0, pctChange: 0 } } }) });
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /ABD: Şok verisi yok · BIST: Şok verisi yok · Kripto: %0/);

stressContext.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /HTTP 503[\s\S]*ABD: Şok verisi yok/);
assert.match(stressRows.innerHTML, /type="button"[\s\S]*Tekrar dene/);
assert.doesNotMatch(stressRows.innerHTML, /<script>/);

stressContext.portfolioData = { us: [{ symbol: 'B', amount: 2 }], bist: [], crypto: [] };
await stressContext.loadStressScenarios();
assert.match(stressRows.innerHTML, /Önceki portföyün sonucu · güncel pozisyonlara uygulanmaz/);

let resolveOld;
let resolveNew;
stressContext.fetch = () => new Promise((resolve) => { if (!resolveOld) resolveOld = resolve; else resolveNew = resolve; });
const oldRun = stressContext.loadStressScenarios();
const newRun = stressContext.loadStressScenarios();
resolveNew({ ok: true, json: async () => ({ scenarios: { newer: { name: 'New', desc: '', shocks: [], oldUSD: 1, oldTRY: 1, newUSD: 2, newTRY: 2, pnlUSD: 1, pnlTRY: 1, pctChange: 100 } } }) });
await newRun;
resolveOld({ ok: true, json: async () => ({ scenarios: { older: { name: 'Old', desc: '', shocks: [], oldUSD: 1, oldTRY: 1, newUSD: 1, newTRY: 1, pnlUSD: 0, pnlTRY: 0, pctChange: 0 } } }) });
await oldRun;
assert.match(stressRows.innerHTML, /New/);
assert.doesNotMatch(stressRows.innerHTML, /Old/);
console.log('Stress scenario empty-state, absence, failure-retention and race tests passed');

const visibilityStart = source.indexOf('function setValuationModelGroupVisibility(');
const visibilityEnd = source.indexOf('\n\n  const modelSel', visibilityStart);
assert.ok(visibilityStart >= 0 && visibilityEnd > visibilityStart, 'valuation visibility helper has a bounded extraction');
vm.runInContext(source.slice(visibilityStart, visibilityEnd), stressContext);
const groups = { dcf: { style: { display: 'none' } }, graham: { style: { display: 'none' } }, ddm: { style: { display: 'none' } } };
stressContext.setValuationModelGroupVisibility('dcf', groups);
assert.deepEqual(groups, { dcf: { style: { display: '' } }, graham: { style: { display: 'none' } }, ddm: { style: { display: 'none' } } }, 'DCF active group leaves CSS grid display available');
stressContext.setValuationModelGroupVisibility('graham', groups);
assert.equal(groups.dcf.style.display, 'none');
assert.equal(groups.graham.style.display, 'flex');
stressContext.setValuationModelGroupVisibility('ddm', groups);
assert.equal(groups.graham.style.display, 'none');
assert.equal(groups.ddm.style.display, 'flex');
stressContext.setValuationModelGroupVisibility('dcf', groups);
assert.equal(groups.dcf.style.display, '');
console.log('Valuation model group visibility tests passed');
})();
