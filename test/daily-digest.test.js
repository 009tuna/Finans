'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ActionLayer = require('../public/action-layer.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const renderSource = app.slice(app.indexOf('function renderDailyDigest()'), app.indexOf('async function renderCfoDecisionCockpit()'));
const asset = (symbol, confidence, score = 60) => ({ market: 'us', symbol, analysis: { score, label: 'TUT', tone: 'hold' }, decision: { confidence } });
const render = (data) => {
  const el = { innerHTML: '' };
  const context = vm.createContext({ $: () => el, window: { FinansActionLayer: ActionLayer }, DATA: data, esc: (value) => String(value == null ? '' : value) });
  vm.runInContext(renderSource, context);
  context.renderDailyDigest();
  return el.innerHTML;
};

const unavailable = { us: [asset('MISSING', {}), asset('STRING', { previousScore: '60', scoreDelta: '0' }), asset('INVALID', { scoreDelta: NaN, previousScore: Infinity })] };
const missing = ActionLayer.buildDailyChangeDigest(unavailable);
assert.equal(missing.comparisonCount, 0);
assert.equal(missing.missingComparisonCount, 3);
assert.equal(missing.unchangedCount, 0);
assert.equal(missing.changedCount, 0);
assert.equal(missing.totalCount, 3);
assert.deepEqual(missing.improving, []);
assert.deepEqual(missing.weakening, []);
assert.match(missing.headline, /kayıt yok.*ölçülemedi/);
const missingHtml = render(unavailable);
assert.match(missingHtml, /Karşılaştırma kaydı yok/);
assert.match(missingHtml, /3 varlığın karşılaştırma kaydı eksik veya geçersiz/);
assert.doesNotMatch(missingHtml, /sakin|değişmedi|Güçlenen Sinyaller|digest-grid/);

const unchanged = { us: [asset('EXPLICIT_ZERO', { scoreDelta: 0, previousScore: 50 }), asset('DERIVED_ZERO', { previousScore: 60 }), asset('MISSING', {})] };
const zero = ActionLayer.buildDailyChangeDigest(unchanged);
assert.equal(zero.comparisonCount, 2, 'explicit and derived zero are valid comparisons');
assert.equal(zero.unchangedCount, 2);
assert.equal(zero.changedCount, 0);
assert.equal(zero.missingComparisonCount, 1);
assert.match(zero.headline, /2 varlığın.*değişmedi/);
const zeroHtml = render(unchanged);
assert.match(zeroHtml, /Önceki teknik kayda göre · 2 varlık/);
assert.match(zeroHtml, /1 varlığın karşılaştırma kaydı eksik veya geçersiz/);
assert.match(zeroHtml, /2 varlığın.*değişmedi/);
assert.doesNotMatch(zeroHtml, /Dünkü|Karşılaştırma kaydı yok|digest-grid/);

const mixed = { us: [
  asset('ZERO', { scoreDelta: 0 }),
  asset('UP', { scoreDelta: 8 }),
  asset('DOWN', { scoreDelta: -9 }),
  asset('DERIVED', { scoreDelta: NaN, previousScore: 57 }),
  asset('FINITE_FALLBACK', { scoreDelta: Infinity, previousScore: 65 }),
  asset('OVERFLOW', { previousScore: -Number.MAX_VALUE }, Number.MAX_VALUE),
  asset('BAD_SCORE', { scoreDelta: 10 }, NaN),
  asset('MISSING', {}),
] };
const mixedBefore = structuredClone(mixed);
const changes = ActionLayer.buildDailyChangeDigest(mixed);
assert.equal(changes.comparisonCount, 5, 'non-finite direct deltas can use a valid previous score');
assert.equal(changes.unchangedCount, 1);
assert.equal(changes.changedCount, 4);
assert.equal(changes.missingComparisonCount, 2, 'overflow and absent evidence are unavailable comparisons');
assert.equal(changes.totalCount, 7, 'non-finite current scores cannot appear in a technical comparison');
assert.deepEqual(changes.improving.map((row) => [row.symbol, row.delta]), [['UP', 8], ['DERIVED', 3]]);
assert.deepEqual(changes.weakening.map((row) => [row.symbol, row.delta]), [['DOWN', -9], ['FINITE_FALLBACK', -5]]);
assert.match(changes.headline, /^DOWN.*önceki teknik kayda göre 9 puan zayıfladı/, 'existing risk-change leader priority remains');
assert.deepEqual(mixed, mixedBefore, 'digest does not mutate the source snapshot');
const changesHtml = render(mixed);
assert.match(changesHtml, /digest-grid/);
assert.match(changesHtml, /Önceki teknik kayda göre · 5 varlık/);
assert.match(changesHtml, /2 varlığın karşılaştırma kaydı eksik veya geçersiz/);
assert.doesNotMatch(changesHtml, /Dünkü|dünkü/);

const ranked = ActionLayer.buildDailyChangeDigest({ us: Array.from({ length: 12 }, (_, index) => asset('ROW' + index, { scoreDelta: index < 6 ? index + 1 : -(index - 5) })) });
assert.equal(ranked.comparisonCount, 12, 'comparison coverage is counted before top-four truncation');
assert.equal(ranked.changedCount, 12);
assert.deepEqual(ranked.improving.map((row) => row.delta), [6, 5, 4, 3]);
assert.deepEqual(ranked.weakening.map((row) => row.delta), [-6, -5, -4, -3]);
const empty = ActionLayer.buildDailyChangeDigest(null);
assert.equal(empty.comparisonCount, 0);
assert.equal(empty.totalCount, 0);
assert.match(empty.headline, /ölçülemedi/);
console.log('daily digest: no comparison versus zero movement, finite evidence, coverage, ranking and UI copy passed');
