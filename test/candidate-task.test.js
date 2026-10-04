'use strict';

const assert = require('assert');
const action = require('../public/action-layer');
const insights = require('../public/insights');

function candidate(changes, note, report) {
  const asset = {
    market: 'us', symbol: 'MSFT', currency: 'USD', price: 400,
    analysis: { score: 75, tone: 'strong-buy', label: 'GUCLU AL' },
    decision: { score: 90, status: 'clean', freshness: { status: 'fresh' }, trade: { available: true } },
    ...changes,
  };
  const snapshot = { generatedAt: '2026-10-04T00:00:00Z', us: [asset], crypto: [], bist: [] };
  const before = JSON.stringify(snapshot);
  const row = action.buildCfoDecisionCockpit(snapshot, { notes: note ? { 'us:MSFT': note } : {} }, report || {}).marketGroups[0].rows[0];
  assert.strictEqual(JSON.stringify(snapshot), before, 'UI task construction must not alter source evidence');
  assert.strictEqual(row.label, 'GUCLU AL', 'raw model label remains compatible');
  assert.strictEqual(row.score, 75, 'technical score is unchanged');
  assert.strictEqual(row.task.market, 'us');
  assert.strictEqual(row.task.symbol, 'MSFT');
  return row;
}

const delayed = candidate({ decision: { score: 90, status: 'clean', freshness: { status: 'delayed' }, trade: { available: true } } });
assert.strictEqual(delayed.task.kind, 'price', 'delayed quote takes priority over missing thesis');
assert.strictEqual(delayed.task.target, 'freshness');
assert.strictEqual(delayed.task.panel, 'overview');
assert.strictEqual(delayed.status, 'gated', 'high control score cannot make delayed quote ready');
assert.doesNotMatch(delayed.nextAction, /verisini yenile/);
assert.strictEqual(candidate({ price: 0 }).task.kind, 'price', 'invalid price is not a real quote');
assert.strictEqual(candidate({ price: null }).task.kind, 'price');
assert.strictEqual(candidate({ decision: { freshness: { status: 'unknown' }, trade: { available: true } } }).task.kind, 'price');

const controlled = candidate({ decision: { score: 55, status: 'blocked', freshness: { status: 'fresh' }, trade: { available: true } } });
assert.strictEqual(controlled.task.kind, 'control');
assert.strictEqual(controlled.status, 'blocked');
assert.strictEqual(controlled.task.target, 'control');

const thesis = candidate({}, { thesis: '   ', invalidation: 'Düşük nakit akışı' });
assert.strictEqual(thesis.task.kind, 'thesis', 'blank saved text is still an unresolved task');
assert.strictEqual(thesis.task.panel, 'notes');
assert.strictEqual(thesis.task.field, 'thesis');
assert.notStrictEqual(thesis.status, 'ready');
const invalidation = candidate({}, { thesis: 'Nakit akışı tezi', invalidation: '\n ' });
assert.strictEqual(invalidation.task.kind, 'invalidation');
assert.strictEqual(invalidation.task.field, 'invalidation');
assert.notStrictEqual(invalidation.status, 'ready');

const saved = { thesis: 'Nakit akışı tezi', invalidation: 'Marj düşüşü' };
const technical = candidate({ decision: { status: 'clean', freshness: { status: 'fresh' }, trade: { available: false } } }, saved);
assert.strictEqual(technical.task.kind, 'technical');
assert.strictEqual(technical.task.target, 'trade');
assert.notStrictEqual(technical.status, 'ready');

const report = { signalOverlay: { assets: { 'us:MSFT': { components: [{ type: 'modelAuditGap', reason: 'Kaynaklı nakit akışı kanıtı eksik' }] } } } };
const research = candidate({}, saved, report);
assert.strictEqual(research.hasMacroOverlay, true, 'a supplied overlay is distinguished from a numeric fallback');
assert.strictEqual(research.macroEffectAvailable, false, 'evidence-only overlay cannot establish a quantitative effect');
assert.strictEqual(research.task.kind, 'research');
assert.strictEqual(research.task.reason, 'Kaynaklı nakit akışı kanıtı eksik');
assert.notStrictEqual(research.status, 'ready');
const complete = candidate({}, saved);
assert.strictEqual(complete.hasMacroOverlay, false, 'equal fallback scores do not establish a measured zero macro effect');
assert.strictEqual(complete.macroEffectAvailable, false);
assert.strictEqual(complete.task.kind, 'risk');
assert.strictEqual(complete.status, 'ready');
assert.match(complete.task.reason, /pozisyon boyutu ayrı/);
const measuredOverlay = values => ({ signalOverlay: { assets: { 'us:MSFT': values } } });
assert.strictEqual(candidate({}, saved, measuredOverlay({ adjustedScore: 75, totalAdjustment: 0 })).macroEffectAvailable, true, 'recorded zero is a measurable effect');
assert.strictEqual(candidate({}, saved, measuredOverlay({ adjustedScore: 0, totalAdjustment: -75 })).macroEffectAvailable, true, 'zero adjusted score is finite evidence');
assert.strictEqual(candidate({}, saved, measuredOverlay({ adjustedScore: 101, totalAdjustment: 26 })).macroEffectAvailable, false);
assert.strictEqual(candidate({}, saved, measuredOverlay({ adjustedScore: 75, totalAdjustment: null })).macroEffectAvailable, false);
assert.strictEqual(candidate({}, saved, measuredOverlay({ adjustedScore: 75, totalAdjustment: Infinity })).macroEffectAvailable, false);

assert.strictEqual(insights.technicalSignalLabel('GUCLU AL'), 'Güçlü olumlu');
assert.strictEqual(insights.technicalSignalLabel({ analysis: { tone: 'sell', label: 'SAT' } }), 'Olumsuz');
assert.strictEqual(insights.technicalSignalLabel({ label: '  GÜÇLÜ   AL  ' }), 'Güçlü olumlu');
assert.strictEqual(action.technicalSignalLabel('TUT'), 'Karışık');
assert.strictEqual(insights.technicalSignalLabel('unexpected-label'), 'Ölçülemedi', 'unknown labels do not invent a measured signal');
assert.strictEqual(insights.technicalSignalLabel({ analysis: { score: null, tone: 'buy' } }), 'Ölçülemedi');
assert.strictEqual(insights.technicalSignalLabel({ analysis: { score: Infinity, tone: 'buy' } }), 'Ölçülemedi');
assert.strictEqual(insights.technicalSignalLabel({ analysis: { score: 101, tone: 'buy' } }), 'Ölçülemedi');
const blankMemo = action.buildInvestmentCommitteeMemo({
  market: 'us', symbol: 'MSFT', price: 400,
  analysis: { score: 75, tone: 'buy', label: 'AL' },
  decision: { freshness: { status: 'fresh' }, trade: { available: true } },
}, { generatedAt: '2026-10-04T00:00:00Z', us: [], bist: [], crypto: [] }, { notes: { 'us:MSFT': { thesis: ' ', invalidation: '\n' } } });
assert.notStrictEqual(blankMemo.verdict, 'senior-review-ready', 'detail memo agrees with the candidate queue about blank notes');
const highWithContradiction = insights.explainDecision({
  analysis: { score: 75, tone: 'buy', label: 'AL' },
  decision: { score: 80, status: 'clean', contradictions: [{ label: 'Hacim', detail: 'Teyit eksik' }] },
});
assert.strictEqual(highWithContradiction.quality.statusLabel, 'Kontrol puanı yüksek');
assert.match(highWithContradiction.cons[0], /Teyit eksik/);
assert.doesNotMatch(highWithContradiction.quality.statusLabel, /çelişkisi saptanmadı|sağlam|risksiz/);
assert.match(highWithContradiction.quality.scope, /yatırım riskinin tamamını/);
assert.strictEqual(action.buildCfoDecisionCockpit(null, null, null).empty, true, 'missing snapshot remains missing');
const learningCounts = counts => action.buildDecisionLearningPanel({ decisionLearning: { evidenceVersion: 'technical-learning-v2', ...counts } }).metrics.slice(0,2).map(item => item.value);
assert.deepStrictEqual(learningCounts({}), ['Doğrulanmadı', 'Doğrulanmadı'], 'absent observed learning counts do not become zero');
assert.deepStrictEqual(learningCounts({totalAudits:0,systemAudits:0}), [0,0], 'explicit observed zero is preserved');
assert.deepStrictEqual(learningCounts({totalAudits:12,systemAudits:5}), [12,5]);
assert.deepStrictEqual(learningCounts({totalAudits:-1,systemAudits:Infinity}), ['Doğrulanmadı','Doğrulanmadı']);
assert.deepStrictEqual(learningCounts({totalAudits:'0',systemAudits:1.5}), ['Doğrulanmadı','Doğrulanmadı'], 'counts require observed nonnegative whole numbers');

console.log('Candidate tasks and signal semantics passed.');
