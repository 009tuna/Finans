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
  strategyVersion: 'technical-rules-v1',
  resolverVersion: 'daily-bar-resolver-v3',
  outcomeEvidence: 'daily_bar_range',
  barDate: '2026-06-19',
  barEndAt: '2026-06-19T20:59:59.000Z',
  closePrice: 80.012,
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
  strategyVersion: 'technical-rules-v1', resolverVersion: 'daily-bar-resolver-v3',
  outcomeEvidence: 'daily_bar_range', barDate: '2026-06-02', barEndAt: '2026-06-02T20:59:59.000Z', closePrice: 94,
});
assert.ok(stopAudit.failureTags.includes('risk-limit-hit'));
assert.ok(stopAudit.lesson.includes('stop'));
const ambiguousAudit = auditPrediction({
  id: 'bist:AMB:2026-06-01', market: 'bist', symbol: 'AMB', source: 'system',
  outcome: 'stop-hit', outcomeEvidence: 'ambiguous_bar', resultPct: -2,
  createdAt: '2026-06-01T10:00:00.000Z', resolvedAt: '2026-06-02T10:00:00.000Z',
});
assert.ok(ambiguousAudit.attributionTags.includes('ambiguous_bar'));
assert.ok(!ambiguousAudit.attributionTags.includes('positive-follow-through'));
assert.deepEqual(ambiguousAudit.failureTags, []);
assert.ok(ambiguousAudit.lesson.includes('basari veya basarisizlik sayilmadi'));
const malformedResultAudit = auditPrediction({ outcome: 'target-hit', resultPct: '10', resolvedAt: '2026-06-02T10:00:00Z', createdAt: '2026-06-01T10:00:00Z' });
assert.equal(malformedResultAudit.resultPct, null);

const mk = (symbol, outcome, resultPct, day) => {
  const closePrice = 100 * (1 + resultPct / 100);
  return {
  id: 'bist:' + symbol + ':2026-06-' + String(day).padStart(2, '0'),
  market: 'bist',
  symbol,
  label: 'GUCLU AL',
  score: 84,
  entry: 100,
  target: outcome === 'target-hit' ? closePrice : 112,
  stop: outcome === 'stop-hit' ? closePrice : 94,
  source: 'system',
  outcome,
  resultPct,
  createdAt: '2026-06-' + String(day).padStart(2, '0') + 'T10:00:00.000Z',
  resolvedAt: '2026-06-' + String(day + 2).padStart(2, '0') + 'T20:59:59.000Z',
  strategyVersion: 'technical-rules-v1',
  resolverVersion: 'daily-bar-resolver-v3',
  outcomeEvidence: outcome.startsWith('expired') ? 'completed_daily_close' : 'daily_bar_range',
  barDate: '2026-06-' + String(day + 1).padStart(2, '0'),
  barEndAt: '2026-06-' + String(day + 1).padStart(2, '0') + 'T20:59:59.000Z',
  closePrice,
  };
};

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
assert.ok(summary.calibrationByMarket[0].key.endsWith('|bist'));
assert.equal(summary.calibrationByMarket[0].winRate, 80);
assert.ok(summary.learningRules.length >= 1);
assert.equal(summary.learningRules[0].scope.market, 'bist');
assert.ok(summary.learningRules[0].adjustment > 0);
assert.ok(summary.learningRules[0].confidence <= 0.75);
assert.equal(summary.learningRules[0].activation,'proposal_only');
assert.equal(summary.learningRules[0].confidenceKind,'heuristic-not-calibrated');
assert.equal(summary.learningRules[0].validationStatus,'chronological_validation_required');
assert.equal(summary.reviewQueue.length, 0);

const excludedSummary = buildLearningSummary({ predictions: [
  mk('WIN1', 'target-hit', 12, 1), mk('WIN2', 'target-hit', 10, 2),
  mk('WIN3', 'target-hit', 8, 3), mk('WIN4', 'target-hit', 6, 4),
  Object.assign(mk('AMB', 'stop-hit', -4, 5), { outcomeEvidence: 'ambiguous_bar' }),
  mk('UNKNOWN', 'future-outcome', 50, 6),
] }, '2026-06-14T12:00:00.000Z');
assert.equal(excludedSummary.totalAudits, 6);
assert.equal(excludedSummary.systemAudits, 4);
assert.equal(excludedSummary.ambiguousOutcomes, 1);
assert.equal(excludedSummary.unscoredOutcomes, 1);
assert.equal(excludedSummary.calibrationByMarket[0].sampleSize, 4);
assert.equal(excludedSummary.calibrationByMarket[0].winRate, 100);
assert.ok(excludedSummary.recentLessons.every((x) => x.outcome !== 'future-outcome' && x.outcomeEvidence !== 'ambiguous_bar'));

const thinSummary = buildLearningSummary({
  predictions: [
    mk('BTC', 'stop-hit', -5, 1),
    Object.assign(mk('ETH', 'expired-loss', -3, 2), { market: 'crypto', symbol: 'ETH', label: 'AL', score: 62 }),
  ],
}, '2026-06-14T12:00:00.000Z');
assert.equal(thinSummary.learningRules.length, 0);
assert.ok(thinSummary.reviewQueue.length >= 1);

// Evidence gates keep historic, malformed, future, and ambiguous rows out of learning,
// while preserving them in the audit inventory. Distinct strategy versions never mix.
const cohortRows = [];
for (let i = 0; i < 5; i += 1) cohortRows.push(Object.assign(mk('V' + i, 'target-hit', 5, i + 1), { strategyVersion: 'technical-rules-v1' }));
for (let i = 0; i < 5; i += 1) cohortRows.push(Object.assign(mk('W' + i, 'target-hit', 5, i + 10), { strategyVersion: 'technical-rules-v2' }));
cohortRows.push(Object.assign(mk('LEGACY', 'target-hit', 5, 20), { strategyVersion: undefined, resolverVersion: undefined, outcomeEvidence: undefined }));
cohortRows.push(Object.assign(mk('BAD', 'target-hit', 5, 21), { target: 90, closePrice: 80 }));
cohortRows.push(Object.assign(mk('AMBIG', 'stop-hit', -5, 22), { outcomeEvidence: 'ambiguous_bar' }));
cohortRows.push(Object.assign(mk('FUTURE', 'target-hit', 5, 23), { resolvedAt: '2026-06-20T20:00:00.000Z', barEndAt: '2026-06-19T20:00:00.000Z', barDate: '2026-06-19' }));
const cohortSummary = buildLearningSummary({ predictions: cohortRows }, '2026-06-30T12:00:00.000Z');
assert.equal(cohortSummary.systemAudits, 10);
assert.equal(cohortSummary.excludedAudits.length, 4);
assert.ok(Object.keys(cohortSummary.excludedReasonCounts).length >= 3);
assert.equal(cohortSummary.eligibleCohorts.length, 2);
assert.equal(cohortSummary.calibrationByMarket.filter((x) => x.sampleSize === 5).length, 2);
assert.equal(new Set(cohortSummary.learningRules.map((x) => x.scope.cohortKey)).size, 2);
const duplicate = mk('DUP','target-hit',5,1);
assert.equal(buildLearningSummary({predictions:[duplicate,duplicate]},'2026-06-30T12:00:00Z').systemAudits,0);
const future = {...duplicate,resolvedAt:'2026-07-01T00:00:00Z'};
assert.equal(buildLearningSummary({predictions:[future]},'2026-06-30T12:00:00Z').excludedReasonCounts.future_resolution,1);

console.log('decision auditor tests passed');
