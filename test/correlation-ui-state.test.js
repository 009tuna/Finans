'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const helper = source.slice(source.indexOf('function stressPortfolioSignature('), source.indexOf('let REPORT_CACHE'));
const loader = source.slice(source.indexOf('async function loadCorrelationMatrix('), source.indexOf('function buildMonteCarloInputs('));
const provenance = source.slice(source.indexOf('function historicalSourceProofHtml('), source.indexOf('async function loadCorrelationMatrix('));
function harness() {
  const loading = { innerHTML: '', textContent: '', style: {} };
  const container = { innerHTML: '', style: {}, querySelectorAll: () => [] };
  const info = { textContent: '' };
  const requests = [];
  const context = vm.createContext({
    portfolioData: { us: [{ symbol: 'SAME', amount: 1, avgPrice: 100 }], bist: [{ symbol: 'SAME', amount: 2, avgPrice: 20 }], crypto: [] },
    portfolioState: 'ready', correlationRequestVersion: 0,
    $: id => ({ '#correlation-loading': loading, '#correlation-heatmap-container': container, '#correlation-info-text': info })[id],
    esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    marketShortLabel: market => ({ us: 'ABD', bist: 'BIST' })[market], fmtNum: value => value.toFixed(2), fullTimestamp: value => value || 'bilinmiyor',
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
  });
  vm.runInContext(helper + provenance + loader, context);
  const result = { symbols: ['SAME', 'SAME'], assets: [{ market: 'us', symbol: 'SAME' }, { market: 'bist', symbol: 'SAME' }], matrix: [[1, null], [null, null]], metadata: { observationCount: 35, startDate: '2026-08-01', endDate: '2026-09-20' } };
  function finish(index, body = result, ok = true) { requests[index].resolve({ ok, status: ok ? 200 : 400, json: async () => body }); }
  return { context, loading, container, info, requests, result, finish };
}
(async () => {
  const h = harness();
  const run = h.context.loadCorrelationMatrix();
  const posted = JSON.parse(h.requests[0].options.body);
  assert.deepEqual(posted.assets, [{ symbol: 'SAME', market: 'us' }, { symbol: 'SAME', market: 'bist' }], 'historical relationships do not use purchase costs or current prices');
  h.finish(0);
  await run;
  assert.match(h.container.innerHTML, /ABD · SAME[\s\S]*BIST · SAME/);
  assert.match(h.container.innerHTML, /35 ortak getiri gözlemi/);
  assert.match(h.container.innerHTML, /katsayı hesaplanamıyor/);
  assert.doesNotMatch(h.container.innerHTML, /NaN|data-val="0"/, 'undefined correlation is never replaced with zero');
  assert.match(h.container.innerHTML, /scope="col"[\s\S]*scope="row"[\s\S]*<button/, 'the matrix is readable and operable with a keyboard');

  const oldRun = h.context.loadCorrelationMatrix();
  const newRun = h.context.loadCorrelationMatrix();
  h.finish(2, { ...h.result, matrix: [[1, 0.5], [0.5, 1]] });
  await newRun;
  h.finish(1, { error: 'Old error must not replace new results' }, false);
  await oldRun;
  assert.equal(h.loading.style.display, 'none');
  assert.match(h.container.innerHTML, /0.50/);

  const failed = h.context.loadCorrelationMatrix();
  h.finish(3, { error: 'En az 30 ortak gözlem gerekiyor' }, false);
  await failed;
  assert.match(h.loading.innerHTML, /30 ortak gözlem[\s\S]*Tekrar dene/);
  assert.equal(h.container.style.display, 'none', 'old matrix is hidden when the current cut cannot be computed');

  const wrongOrder = h.context.loadCorrelationMatrix();
  h.finish(4, { ...h.result, assets: h.result.assets.slice().reverse() });
  await wrongOrder;
  assert.match(h.loading.innerHTML, /tüm pozisyonları/);

  h.context.portfolioState = 'unavailable';
  await h.context.loadCorrelationMatrix();
  assert.equal(h.requests.length, 5, 'unreadable portfolio cannot launch a calculation');
  console.log('Correlation UI identity, missing values, keyboard surface, failure and race tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
