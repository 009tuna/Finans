'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { computeIndicators } = require('../src/indicators');
const { scoreAsset } = require('../src/analyze');
const { attachDecisionMetadata, buildAssetDecision } = require('../src/decision');

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, start);
  const to = source.indexOf(end, from);
  assert.ok(to > from, end);
  return source.slice(from, to);
}
const pipeline = fs.readFileSync(path.join(__dirname, '../src/fetch-all.js'), 'utf8');
const builder = vm.createContext({ computeIndicators, scoreAsset });
vm.runInContext(section(pipeline, 'function buildCrypto(', '// Piyasa-seviye'), builder);
const closes = Array.from({ length: 250 }, (_, i) => 20 + i * 0.07 + Math.sin(i) * 0.03);
const series = { closes, highs: closes.map(n => n + 0.5), lows: closes.map(n => n - 0.5), volumes: closes.map(() => 1000), dates: closes.map((_, i) => 1700000000 + i * 86400) };
const input = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 40, quoteTime: '2026-09-30T14:00:00Z', series };
const normal = builder.buildCrypto({ ...input, technicalData: { status: 'fresh' } });
assert.equal(normal.analysis.score, scoreAsset(computeIndicators(series), null, 'crypto').score, 'fresh data uses the unchanged scoring formula');
for (const status of ['stale', 'unavailable']) {
  const asset = builder.buildCrypto({ ...input, technicalData: { status, error: 'HTTP 451' } });
  assert.equal(asset.price, 40, 'spot price remains usable');
  assert.equal(asset.quoteTime, input.quoteTime, 'quote timestamp is not the fetch completion time');
  assert.equal(asset.analysis.score, null, 'old history cannot produce a current recommendation');
  assert.equal(asset.analysis.lastKnownScore, normal.analysis.score);
  assert.equal(asset.analysis.tone, 'hold', 'old buy tone must not enable a trade plan');
  const snapshot = { generatedAt: '2026-09-30T14:01:00Z', us: [], bist: [], crypto: [asset] };
  attachDecisionMetadata(snapshot, [], {});
  assert.equal(asset.decision, undefined, 'stale data does not enter the actionable candidate set');
  assert.equal(buildAssetDecision(asset).trade.available, false, 'an explicit decision calculation cannot reuse the old buy tone');
}
const short = builder.buildCrypto({ ...input, series: { closes: [40] }, technicalData: { status: 'insufficient' } });
assert.equal(short.analysis.score, null);

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const records = [
  { symbol: 'OFFLINE', name: 'Kaynak yok', __error: 'HTTP 429' },
  { symbol: 'PRICE', name: 'Yalnız fiyat', price: 2 },
  { symbol: 'STALE', name: 'Eski analiz', price: 3, analysis: { score: null, lastKnownScore: 90 } },
  { symbol: 'FRESH', name: 'Güncel', price: 4, analysis: { score: 60 } },
];
const ui = vm.createContext({ DATA: { crypto: records }, activeView: 'crypto', marketUi: { crypto: { query: '', sort: 'score' } }, sortBy: 'score', fullTimestamp: value => value, esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') });
vm.runInContext(section(app, 'function currentList(', '/* ---------- Genel bakış'), ui);
vm.runInContext(section(app, 'function technicalDataNotice(', 'function renderScoreChart('), ui);
assert.deepEqual(Array.from(ui.currentList(), row => row.symbol), ['FRESH', 'PRICE', 'STALE']);
ui.marketUi.crypto.query = 'Yalnız';
assert.deepEqual(Array.from(ui.currentList(), row => row.symbol), ['PRICE'], 'unscored asset can still be found by company name');
const notice = ui.technicalDataNotice({ analysis: { lastKnownScore: 90 }, technicalData: { status: 'stale', bars: 250, fetchedAt: '2026-09-29T12:00:00Z', lastBarAt: '2026-09-29T00:00:00Z', error: '<script>bad</script>', cacheWarning: 'write denied' } });
assert.match(notice, /Eski teknik geçmiş.*2026-09-29T12:00:00Z.*Son mum başlangıcı/);
assert.match(notice, /90 \(eski\)/);
assert.match(notice, /&lt;script&gt;bad/);
assert.doesNotMatch(notice, /<script>/);
assert.match(notice, /write denied/);
assert.doesNotMatch(ui.technicalDataNotice({ technicalData: { status: 'unavailable' } }), /Son başarılı alım:/, 'unknown data time stays unknown');
(async () => {
  const { fetchJson } = require('../src/util');
  const httpError = await fetchJson('https://test.invalid', { retries: 0, transport: async () => ({ status: 451, ok: false, text: async () => 'provider access restriction' }) });
  assert.equal(httpError.__error, 'HTTP 451', 'injected transport retains the provider HTTP failure');
  const stalledBody = await fetchJson('https://test.invalid', { retries: 0, timeoutMs: 25, transport: async (_url, { signal }) => ({
    status: 200, ok: true,
    json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('body timed out')), { once: true })),
  }) });
  assert.equal(stalledBody.__error, 'body timed out', 'the timeout covers response body parsing as well as headers');
  console.log('crypto UI and pipeline state tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
