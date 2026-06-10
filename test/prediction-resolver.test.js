// Automated tests for prediction resolver and extended scorecard.
'use strict';

const assert = require('assert');
const { resolveOne } = require('../src/prediction-resolver');
const { recordPrediction, buildPredictionScorecard } = require('../src/decision-journal');

console.log('🧪 prediction resolver tests starting...\n');

// Mock prediction template
const basePred = {
  id: 'us:AAPL:2026-06-01',
  market: 'us',
  symbol: 'AAPL',
  label: 'AL',
  score: 75,
  entry: 100,
  target: 110,
  stop: 95,
  createdAt: '2026-06-01T09:00:00.000Z',
  horizonDays: 3,
  resolvedAt: null,
  outcome: 'open',
  source: 'system'
};

const now = new Date('2026-06-05T09:00:00.000Z');

// 1. Target hit test
console.log('1. Testing target-hit...');
const seriesTargetHit = {
  dates: ['2026-06-01', '2026-06-02', '2026-06-03'],
  highs: [98, 112, 105],
  lows: [96, 99, 101],
  closes: [97, 110, 103]
};
const res1 = resolveOne(basePred, seriesTargetHit, now);
assert.equal(res1.outcome, 'target-hit');
assert.equal(res1.closePrice, 110);
assert.equal(res1.resultPct, 10.0);
assert.ok(res1.resolvedAt.includes('2026-06-02'));
console.log('   ✓ Target-hit resolved correctly');

// 2. Stop hit test
console.log('2. Testing stop-hit...');
const seriesStopHit = {
  dates: ['2026-06-01', '2026-06-02', '2026-06-03'],
  highs: [99, 98, 97],
  lows: [97, 94, 96],
  closes: [98, 95, 96]
};
const res2 = resolveOne(basePred, seriesStopHit, now);
assert.equal(res2.outcome, 'stop-hit');
assert.equal(res2.closePrice, 95);
assert.equal(res2.resultPct, -5.0);
assert.ok(res2.resolvedAt.includes('2026-06-02'));
console.log('   ✓ Stop-hit resolved correctly');

// 3. Same day target and stop hit (conservative check)
console.log('3. Testing same day target and stop hit (should resolve as stop-hit)...');
const seriesSameDay = {
  dates: ['2026-06-01', '2026-06-02'],
  highs: [98, 115],
  lows: [97, 92],
  closes: [97, 102]
};
const res3 = resolveOne(basePred, seriesSameDay, now);
assert.equal(res3.outcome, 'stop-hit');
assert.equal(res3.closePrice, 95);
assert.equal(res3.resultPct, -5.0);
assert.ok(res3.resolvedAt.includes('2026-06-02'));
console.log('   ✓ Same day both hit resolved as stop-hit correctly');

// 4. Expiration win test
console.log('4. Testing expired-win...');
// Expiry date is 2026-06-01 + 3 days = 2026-06-04
const seriesExpiredWin = {
  dates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'],
  highs: [99, 102, 103, 108],
  lows: [97, 98, 99, 101],
  closes: [98, 100, 101, 107]
};
const res4 = resolveOne(basePred, seriesExpiredWin, now);
assert.equal(res4.outcome, 'expired-win');
assert.equal(res4.closePrice, 107);
assert.equal(res4.resultPct, 7.0);
assert.ok(res4.resolvedAt.includes('2026-06-04'));
console.log('   ✓ Expired-win resolved correctly');

// 5. Expiration loss test
console.log('5. Testing expired-loss...');
const seriesExpiredLoss = {
  dates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'],
  highs: [99, 101, 99, 99],
  lows: [97, 96, 96, 96],
  closes: [98, 97, 97, 96]
};
const res5 = resolveOne(basePred, seriesExpiredLoss, now);
assert.equal(res5.outcome, 'expired-loss');
assert.equal(res5.closePrice, 96);
assert.equal(res5.resultPct, -4.0);
assert.ok(res5.resolvedAt.includes('2026-06-04'));
console.log('   ✓ Expired-loss resolved correctly');

// 6. Still open test
console.log('6. Testing still open (within horizon, no hit)...');
const seriesOpen = {
  dates: ['2026-06-01', '2026-06-02'],
  highs: [99, 101],
  lows: [97, 96],
  closes: [98, 99]
};
const res6 = resolveOne(basePred, seriesOpen, new Date('2026-06-03T09:00:00.000Z'));
assert.equal(res6.outcome, 'open');
assert.equal(res6.resolvedAt, null);
console.log('   ✓ Open state preserved correctly');

// 7. Scorecard generation tests
console.log('7. Testing buildPredictionScorecard with source, avgResultPct, and wins definition...');
const mockJournal = {
  predictions: [
    { outcome: 'target-hit', resultPct: 10, source: 'system', label: 'AL' },
    { outcome: 'expired-win', resultPct: 5, source: 'system', label: 'AL' },
    { outcome: 'stop-hit', resultPct: -5, source: 'user', label: 'AL' },
    { outcome: 'expired-loss', resultPct: -3, source: 'user', label: 'AL' },
    { outcome: 'open', source: 'system', label: 'TUT' }
  ]
};
const card = buildPredictionScorecard(mockJournal);
assert.equal(card.total, 5);
assert.equal(card.closed, 4);
assert.equal(card.open, 1);
// Wins should be 2 (target-hit + expired-win)
assert.equal(card.wins, 2);
assert.equal(card.losses, 2);
assert.equal(card.winRate, 50);
// AvgResultPct: (10 + 5 - 5 - 3) / 4 = 7 / 4 = 1.75 -> 1.8
assert.equal(card.avgResultPct, 1.8);

// Test bySource metrics
assert.equal(card.bySource.system.total, 3);
assert.equal(card.bySource.system.closed, 2);
assert.equal(card.bySource.system.wins, 2);
assert.equal(card.bySource.system.winRate, 100);

assert.equal(card.bySource.user.total, 2);
assert.equal(card.bySource.user.closed, 2);
assert.equal(card.bySource.user.wins, 0);
assert.equal(card.bySource.user.winRate, 0);
console.log('   ✓ Scorecard metrics computed correctly');

// 8. Duplication check test
console.log('8. Testing recordPrediction duplication check...');
let journal = { predictions: [] };
const predA = { market: 'us', symbol: 'AAPL', label: 'AL', score: 80, entry: 100, target: 110, stop: 95, outcome: 'open' };
journal = recordPrediction(journal, predA, '2026-06-01T09:00:00.000Z');
assert.equal(journal.predictions.length, 1);

// Attempt to record duplicate open prediction
const predB = { market: 'us', symbol: 'AAPL', label: 'AL', score: 85, entry: 102, target: 112, stop: 97, outcome: 'open' };
journal = recordPrediction(journal, predB, '2026-06-02T09:00:00.000Z');
// Should NOT record due to duplicate open check
assert.equal(journal.predictions.length, 1);
assert.equal(journal.predictions[0].score, 80); // original preserved

// Resolve the first one, then check if we can record again
journal.predictions[0].outcome = 'target-hit';
journal = recordPrediction(journal, predB, '2026-06-03T09:00:00.000Z');
// Should record now since the previous one is closed
assert.equal(journal.predictions.length, 2);
console.log('   ✓ Duplication check blocks duplicate open predictions correctly');

console.log('\n🎉 All prediction resolver tests passed!');
