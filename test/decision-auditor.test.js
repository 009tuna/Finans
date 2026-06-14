// Decision auditor tests: resolved calls -> audit rows -> learning rules.
'use strict';

const assert = require('assert');
const { auditPrediction, buildLearningSummary, scoreBucket } = require('../src/decision-auditor');

console.log('decision auditor tests starting...');

assert.equal(scoreBucket(12), '0-29');
assert.equal(scoreBucket(44), '30-44');
assert.equal(scoreBucket(59), '45-59');
assert.equal(scoreBucket(69), '60-69');
assert.equal(scoreBucket(79), '70-79');
assert.equal(scoreBucket(88), '80-100');

const targetAudit = auditPrediction({
  id: 'bist:AKBNK:2026-06-12',
  market: 'bist',
  symbol: 'AKBNK',
  label: 'GUCLU AL',
  score: 87,
  entry: 72.15,
  target: 80.01,
  stop: 68.22,
  source: 'system',
  outcome: 'target-hit',
  resultPct: 10.9,
  createdAt: '2026-06-12T10:22:14.731Z',
  resolvedAt: '2026-06-20T20:59:59.000Z',
});

assert.equal(targetAudit.id, 'bist:AKBNK:2026-06-12:audit');
assert.equal(targetAudit.scoreBucket, '80-100');
assert.equal(targetAudit.holdingDays, 8);
assert.ok(targetAudit.attributionTags.includes('target-hit'));
assert.ok(targetAudit.attributionTags.includes('high-conviction'));
assert.equal(targetAudit.failureTags.length, 0);
assert.ok(targetAudit.lesson.includes('hedef'));

const stopAudit = auditPrediction({
  id: 'us:AAPL:2026-06-01',
  market: 'us',
  symbol: 'AAPL',
  label: 'AL',
  score: 71,
  entry: 100,
  target: 112,
  stop: 94,
  source: 'system',
  outcome: 'stop-hit',
  resultPct: -6,
  createdAt: '2026-06-01T10:00:00.000Z',
  resolvedAt: '2026-06-03T20:59:59.000Z',
});
assert.ok(stopAudit.failureTags.includes('risk-limit-hit'));
assert.ok(stopAudit.lesson.includes('stop'));

const mk = (symbol, outcome, resultPct, day) => ({
  id: 'bist:' + symbol + ':2026-06-' + String(day).padStart(2, '0'),
  market: 'bist',
  symbol,
  label: 'GUCLU AL',
  score: 84,
  entry: 100,
  target: 112,
  stop: 94,
  source: 'system',
  outcome,
  resultPct,
  createdAt: '2026-06-' + String(day).padStart(2, '0') + 'T10:00:00.000Z',
  resolvedAt: '2026-06-' + String(day + 2).padStart(2, '0') + 'T20:59:59.000Z',
});

const summary = buildLearningSummary({
  predictions: [
    mk('AAA', 'target-hit', 12, 1),
    mk('BBB', 'target-hit', 10, 2),
    mk('CCC', 'expired-win', 3, 3),
    mk('DDD', 'target-hit', 8, 4),
    mk('EEE', 'stop-hit', -6, 5),
  ],
}, '2026-06-14T12:00:00.000Z');

assert.equal(summary.totalAudits, 5);
assert.equal(summary.systemAudits, 5);
assert.equal(summary.calibrationByMarket[0].key, 'bist');
assert.equal(summary.calibrationByMarket[0].winRate, 80);
assert.ok(summary.learningRules.length >= 1);
assert.equal(summary.learningRules[0].scope.market, 'bist');
assert.ok(summary.learningRules[0].adjustment > 0);
assert.ok(summary.learningRules[0].confidence <= 0.75);
assert.equal(summary.reviewQueue.length, 0);

const thinSummary = buildLearningSummary({
  predictions: [
    mk('BTC', 'stop-hit', -5, 1),
    Object.assign(mk('ETH', 'expired-loss', -3, 2), { market: 'crypto', symbol: 'ETH', label: 'AL', score: 62 }),
  ],
}, '2026-06-14T12:00:00.000Z');
assert.equal(thinSummary.learningRules.length, 0);
assert.ok(thinSummary.reviewQueue.length >= 1);

console.log('decision auditor tests passed');
