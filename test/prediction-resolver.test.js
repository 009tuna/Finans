// Automated tests for prediction resolver and extended scorecard.
'use strict';

const assert = require('assert');
const { resolveOne, applyResolvedPrediction, barEndFor, RESOLVER_VERSION } = require('../src/prediction-resolver');
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

const now = new Date('2026-06-05T21:00:00.000Z');

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
assert.equal(res1.resolvedAt, now.toISOString()); assert.equal(res1.barDate, '2026-06-02');
assert.equal(res1.barEndAt, '2026-06-02T20:00:00.000Z'); assert.equal(res1.resolverVersion, RESOLVER_VERSION);
assert.ok(Date.parse(res1.resolvedAt) <= now.getTime());
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
assert.equal(res2.resolvedAt, now.toISOString()); assert.equal(res2.barDate, '2026-06-02');
console.log('   ✓ Stop-hit resolved correctly');

// 3. Same daily bar reaches both levels: record ambiguity without a fabricated return.
console.log('3. Testing ambiguous same-bar outcome...');
const seriesSameDay = {
  dates: ['2026-06-01', '2026-06-02'],
  highs: [98, 115],
  lows: [97, 92],
  closes: [97, 102]
};
const res3 = resolveOne(basePred, seriesSameDay, now);
assert.equal(res3.outcome, 'ambiguous');
assert.equal(res3.closePrice, null);
assert.equal(res3.resultPct, null);
assert.equal(res3.resolvedAt, now.toISOString()); assert.equal(res3.barDate, '2026-06-02');
assert.equal(res3.outcomeEvidence, 'ambiguous_bar'); assert.equal(res3.assumedOrder, undefined);
assert.deepEqual(res3.possibleOutcomes, ['target-hit', 'stop-hit']);
console.log('   ✓ Ambiguous bar has no directional outcome or return');

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
assert.equal(res4.resolvedAt, now.toISOString()); assert.equal(res4.barDate, '2026-06-04');
assert.equal(res4.barEndAt, '2026-06-04T20:00:00.000Z'); assert.equal(res4.expiryReason, 'us_regular_session_close');
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
assert.equal(res5.resolvedAt, now.toISOString()); assert.equal(res5.barDate, '2026-06-04');
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

// Provider daily bars have no intraday order or authoritative completion flag.
const intradayNow = new Date('2026-06-02T19:00:00.000Z'); // 15:00 EDT, before US close.
const intradayHit = resolveOne(basePred, { dates: ['2026-06-02'], highs: [112], lows: [99], closes: [108], barComplete: false }, intradayNow);
assert.equal(intradayHit.outcome, 'open'); // current market date is never assumed complete.
const pastButIncomplete = resolveOne(basePred, { dates: ['2026-06-02'], highs: [112], lows: [99], closes: [108], barComplete: false }, now);
assert.equal(pastButIncomplete.outcome, 'open');
const intradayExpiry = resolveOne(basePred, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [107], barComplete: false }, now);
assert.equal(intradayExpiry.outcome, 'open');
const bistUnfinished = resolveOne({ ...basePred, market: 'bist' }, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [107], barComplete: false }, new Date('2026-06-04T16:00:00.000Z'));
assert.equal(bistUnfinished.outcome, 'open'); // after policy close, source still explicitly says incomplete.
const futureBars = resolveOne(basePred, { dates: ['2026-06-06'], highs: [120], lows: [90], closes: [100] }, now);
assert.equal(futureBars.outcome, 'open');
const invalidBars = resolveOne(basePred, { dates: ['2026-06-04'], highs: [NaN], lows: [96], closes: [107] }, now);
assert.equal(invalidBars.outcome, 'open');
const invalidClose = resolveOne(basePred, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [Infinity] }, now);
assert.equal(invalidClose.outcome, 'open');
const malformedDate = resolveOne(basePred, { dates: ['2026-06-31'], highs: [108], lows: [96], closes: [107] }, now);
assert.equal(malformedDate.outcome, 'open');
const invalidAsOf = resolveOne(basePred, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [107], asOfDate: 'bad-date' }, now);
assert.equal(invalidAsOf.outcome, 'open');
const cappedAsOf = resolveOne(basePred, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [107], asOfDate: '2026-06-03' }, now);
assert.equal(cappedAsOf.outcome, 'open');
assert.equal(barEndFor('us', '2026-01-05').at.toISOString(), '2026-01-05T21:00:00.000Z'); // EST
assert.equal(barEndFor('us', '2026-06-05').at.toISOString(), '2026-06-05T20:00:00.000Z'); // EDT
assert.equal(barEndFor('bist', '2026-06-05').at.toISOString(), '2026-06-05T15:10:00.000Z');
assert.equal(barEndFor('crypto', '2026-06-05').at.toISOString(), '2026-06-06T00:00:00.000Z');
const unknownExpired = resolveOne({ ...basePred, market: 'other' }, seriesExpiredWin, new Date('2026-06-05T00:01:00.000Z'));
assert.equal(unknownExpired.outcome, 'open'); // no known market timezone/calendar contract.
const cryptoBeforeUtcMidnight = resolveOne({ ...basePred, market: 'crypto' }, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [107] }, new Date('2026-06-04T23:59:59.999Z'));
assert.equal(cryptoBeforeUtcMidnight.outcome, 'open');
const cryptoAtUtcMidnight = resolveOne({ ...basePred, market: 'crypto' }, { dates: ['2026-06-04'], highs: [108], lows: [96], closes: [107] }, new Date('2026-06-05T00:00:00.001Z'));
assert.equal(cryptoAtUtcMidnight.outcome, 'expired-win'); assert.equal(cryptoAtUtcMidnight.barEndAt, '2026-06-05T00:00:00.000Z');
const cryptoCurrentDaily = resolveOne({ ...basePred, market: 'crypto' }, { dates: ['2026-06-05'], highs: [120], lows: [90], closes: [100] }, new Date('2026-06-05T12:00:00.000Z'));
assert.equal(cryptoCurrentDaily.outcome, 'open'); // Binance's 1d response can contain the still-open UTC candle.
const bistCurrentDate = resolveOne({ ...basePred, market: 'bist' }, { dates: ['2026-06-05'], highs: [120], lows: [90], closes: [100] }, new Date('2026-06-04T21:30:00.000Z'));
assert.equal(bistCurrentDate.outcome, 'open'); // Istanbul date is June 5 while UTC is still June 4.
const usCurrentDate = resolveOne({ ...basePred, market: 'us' }, { dates: ['2026-06-05'], highs: [120], lows: [90], closes: [100] }, new Date('2026-06-05T20:30:00.000Z'));
assert.equal(usCurrentDate.outcome, 'open'); // Past nominal close does not prove provider daily bar is final.
const detectionDayCandle = resolveOne({ ...basePred, createdAt: '2026-06-02T22:30:00.000Z' }, { dates: ['2026-06-02'], highs: [120], lows: [90], closes: [100] }, now);
assert.equal(detectionDayCandle.outcome, 'open');
const unverifiedRange = resolveOne(basePred, { dates: ['2026-06-02'], highs: [120], lows: [90], closes: [100], rangeVerified: [false] }, now);
assert.equal(unverifiedRange.outcome, 'open');
const wrongYahooTimezone = resolveOne(basePred, { ...seriesTargetHit, dateBasis: 'exchange_timezone', timeZone: 'Europe/Istanbul' }, now);
assert.equal(wrongYahooTimezone.outcome, 'open');
const alreadyClosed = { ...res1, outcome: 'target-hit', resolvedAt: '2026-06-02T19:30:00.000Z' };
assert.equal(resolveOne(alreadyClosed, seriesStopHit, now), alreadyClosed);

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
assert.equal(journal.predictions[0].strategyVersion, 'user-scenario-v1');
const legacyClosed = { id: 'legacy-1', market: 'us', symbol: 'MSFT', outcome: 'target-hit', createdAt: '2024-01-01T00:00:00.000Z' };
const withNewVersion = recordPrediction({ predictions: [legacyClosed] }, { market: 'us', symbol: 'NVDA', entry: 100, target: 110, stop: 95 }, '2026-06-01T10:00:00.000Z');
assert.deepEqual(withNewVersion.predictions[0], legacyClosed); // legacy rows are preserved without fabricated attribution.
assert.equal(withNewVersion.predictions[1].strategyVersion, 'user-scenario-v1');
const systemVersioned = recordPrediction({ predictions: [] }, { market: 'us', symbol: 'TSLA', source: 'system', entry: 100, target: 110, stop: 95 }, '2026-06-01T11:00:00.000Z');
assert.equal(systemVersioned.predictions[0].strategyVersion, 'technical-rules-v1');

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

// 9. Resolver audit hook
console.log('9. Testing resolved prediction audit persistence...');
const auditJournal = { predictions: [Object.assign({}, basePred)] };
const resolvedForAudit = resolveOne(basePred, seriesTargetHit, now);
applyResolvedPrediction(auditJournal, resolvedForAudit);
assert.equal(auditJournal.predictions[0].outcome, 'target-hit');
assert.equal(auditJournal.decisionAudits.length, 1);
assert.equal(auditJournal.decisionAudits[0].predictionId, basePred.id);
assert.equal(auditJournal.decisionAudits[0].scoreBucket, '70-79');
applyResolvedPrediction(auditJournal, resolvedForAudit);
assert.equal(auditJournal.decisionAudits.length, 1);
console.log('   ok');
console.log('   ✓ Duplication check blocks duplicate open predictions correctly');

console.log('\n🎉 All prediction resolver tests passed!');
