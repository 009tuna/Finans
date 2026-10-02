'use strict';
const assert = require('node:assert/strict');
const { normalizeSeries } = require('../src/yahoo');
const { resolveOne } = require('../src/prediction-resolver');
const seconds = (s) => Date.parse(s) / 1000;
const fixture = (tz, timestamps, quotes) => ({ chart: { result: [{
  meta: { exchangeTimezoneName: tz, regularMarketPrice: 100 },
  timestamp: timestamps, indicators: { quote: [quotes] },
}] } });
const quotes = { close: [100, 101, 102], high: [110, 112, 114], low: [90, 92, 94], volume: [1, 2, 3] };
const bist = normalizeSeries(fixture('Europe/Istanbul', [
  seconds('2026-09-29T21:00:00Z'), null, seconds('2026-10-01T06:00:00Z'),
], quotes), 'THYAO.IS');
assert.deepEqual(bist.series.dates, ['2026-09-30', '2026-10-01']);
assert.deepEqual(bist.series.closes, [100, 102]);
assert.deepEqual(bist.series.highs, [110, 114]);
assert.deepEqual(bist.series.rangeVerified, [true, true]);
assert.equal(bist.series.dateBasis, 'exchange_timezone');
assert.equal(bist.series.timeZone, 'Europe/Istanbul');
assert.equal(bist.series.sourceTimestamps[0], '2026-09-29T21:00:00.000Z');
const us = normalizeSeries(fixture('America/New_York', [seconds('2026-10-01T01:00:00Z')], quotes), 'AAPL');
assert.deepEqual(us.series.dates, ['2026-09-30']);
for (const tz of [null, 'Invalid/Zone']) {
  const data = normalizeSeries(fixture(tz, [seconds('2026-09-30T13:30:00Z')], quotes), 'AAPL');
  assert.equal(data.price, 100);
  assert.deepEqual(data.series.dates, []);
  assert.equal(data.series.dateBasis, 'unverified');
  assert.equal(data.series.dateIssue, 'exchange_timezone_unavailable');
}
const missingRange = normalizeSeries(fixture('America/New_York', [seconds('2026-09-30T13:30:00Z')], { close: [100] }), 'AAPL');
assert.deepEqual(missingRange.series.rangeVerified, [false]);
const prediction = { id: 'x', market: 'bist', createdAt: '2026-09-29T12:00:00Z', outcome: 'open', entry: 100, target: 105, stop: 85, horizonDays: 30 };
// The October 1 morning is not a closed daily candle; September 30 is eligible.
const resolved = resolveOne(prediction, bist.series, new Date('2026-10-01T07:00:00Z'));
assert.equal(resolved.outcome, 'target-hit');
assert.equal(resolved.barDate, '2026-09-30');
assert.equal(Date.parse(resolved.resolvedAt) <= Date.parse('2026-10-01T07:00:00Z'), true);
assert.strictEqual(resolveOne({ ...prediction, market: 'us' }, bist.series, new Date('2026-10-01T07:00:00Z')).outcome, 'open');
console.log('yahoo series integrity tests passed');
