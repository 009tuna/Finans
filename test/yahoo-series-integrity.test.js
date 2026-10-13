'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
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
assert.deepEqual(bist.series.volumes, [1, 3]);
assert.deepEqual(bist.series.volumeVerified, [true, true], 'volume provenance follows the same source indices as retained prices and dates');
assert.equal(bist.series.dateBasis, 'exchange_timezone');
assert.equal(bist.series.timeZone, 'Europe/Istanbul');
assert.equal(bist.series.sourceTimestamps[0], '2026-09-29T21:00:00.000Z');
const us = normalizeSeries(fixture('America/New_York', [seconds('2026-10-01T01:00:00Z')], quotes), 'AAPL');
assert.deepEqual(us.series.dates, ['2026-09-30']);
for (const tz of [null, 'Invalid/Zone']) {
  const data = normalizeSeries(fixture(tz, [seconds('2026-09-30T13:30:00Z')], quotes), 'AAPL');
  assert.equal(data.price, 100);
  assert.deepEqual(data.series.dates, []);
  assert.deepEqual(data.series.volumeVerified, [], 'unverified timestamps cannot leave orphaned volume provenance');
  assert.equal(data.series.dateBasis, 'unverified');
  assert.equal(data.series.dateIssue, 'exchange_timezone_unavailable');
}
const missingRange = normalizeSeries(fixture('America/New_York', [seconds('2026-09-30T13:30:00Z')], { close: [100] }), 'AAPL');
assert.deepEqual(missingRange.series.rangeVerified, [false]);
assert.deepEqual(missingRange.series.volumeVerified, [false], 'an absent volume array is not measured zero volume');

const volumeSamples = [0, 17, null, undefined, NaN, Infinity, -Infinity, -2, '12', true];
const volumeKinds = normalizeSeries(fixture('America/New_York', volumeSamples.map((_, index) => seconds('2026-09-01T17:00:00Z') + index * 86400), {
  close: volumeSamples.map((_, index) => 100 + index),
  high: volumeSamples.map((_, index) => 110 + index),
  low: volumeSamples.map((_, index) => 90 + index),
  volume: volumeSamples,
}), 'AAPL');
assert.deepEqual(volumeKinds.series.volumeVerified, [true, true, false, false, false, false, false, false, false, false], 'only finite numeric nonnegative volume is verified; zero is a valid observed value');
assert.deepEqual(volumeKinds.series.volumes, [0, 17, 0, 0, 0, 0, 0, -2, 0, 0], 'provenance is separate from the existing numeric fallback contract, including legacy negative values');
assert.equal(volumeKinds.series.volumes[0], volumeKinds.series.volumes[2], 'measured zero and missing volume retain the same numeric compatibility value');
assert.notEqual(volumeKinds.series.volumeVerified[0], volumeKinds.series.volumeVerified[2], 'the verification flag distinguishes measured zero from a missing observation');

const alignedVolumes = normalizeSeries(fixture('America/New_York', [
  seconds('2026-09-01T17:00:00Z'), null, seconds('2026-09-03T17:00:00Z'), seconds('2026-09-04T17:00:00Z'),
  seconds('2026-09-05T17:00:00Z'), seconds('2026-09-06T17:00:00Z'), NaN, seconds('2026-09-08T17:00:00Z'),
], {
  close: [100, 101, 0, 102, NaN, 103, 104, 105],
  high: [110, 111, 110, 112, 110, 113, 114, 115],
  low: [90, 91, 90, 92, 90, 93, 94, 95],
  volume: [0, 111, null, null, 0, -3, 0, 42],
}), 'AAPL');
assert.deepEqual(alignedVolumes.series.closes, [100, 102, 103, 105]);
assert.deepEqual(alignedVolumes.series.dates, ['2026-09-01', '2026-09-04', '2026-09-06', '2026-09-08']);
assert.deepEqual(alignedVolumes.series.volumes, [0, 0, -3, 42]);
assert.deepEqual(alignedVolumes.series.volumeVerified, [true, false, false, true], 'invalid close/time rows are removed from prices, volume and provenance together');
assert.equal(alignedVolumes.series.volumeVerified.length, alignedVolumes.series.sourceTimestamps.length);
assert.equal(alignedVolumes.series.volumeVerified.length, alignedVolumes.series.closes.length);
const prediction = { id: 'x', market: 'bist', createdAt: '2026-09-29T12:00:00Z', outcome: 'open', entry: 100, target: 105, stop: 85, horizonDays: 30 };
// The October 1 morning is not a closed daily candle; September 30 is eligible.
const resolved = resolveOne(prediction, bist.series, new Date('2026-10-01T07:00:00Z'));
assert.equal(resolved.outcome, 'target-hit');
assert.equal(resolved.barDate, '2026-09-30');
assert.equal(Date.parse(resolved.resolvedAt) <= Date.parse('2026-10-01T07:00:00Z'), true);
assert.strictEqual(resolveOne({ ...prediction, market: 'us' }, bist.series, new Date('2026-10-01T07:00:00Z')).outcome, 'open');
console.log('yahoo series integrity tests passed');

test('provider observation cut and regular-session boundaries are explicit and never synthesized by normalization', () => {
  const payload=fixture('America/New_York',[seconds('2026-10-02T13:30:00Z')],quotes);
  payload.chart.result[0].meta.currentTradingPeriod={regular:{start:seconds('2026-10-02T13:30:00Z'),end:seconds('2026-10-02T20:00:00Z'),timezone:'EDT',gmtoffset:-14400}};
  const observedAt='2026-10-02T19:00:00.000Z';
  const snapshot=normalizeSeries(payload,'AAPL',{observedAt});
  assert.equal(snapshot.observedAt,observedAt);
  assert.equal(snapshot.series.observedAt,observedAt);
  assert.equal(snapshot.series.currentTradingPeriod.regular.end,seconds('2026-10-02T20:00:00Z'));
  assert.equal(snapshot.series.currentTradingPeriod.regular.start,seconds('2026-10-02T13:30:00Z'));
  assert.equal(snapshot.series.currentTradingPeriod.regular.timezone,'EDT','provider abbreviation is retained separately from the IANA exchange timezone');
  assert.equal(snapshot.series.timeZone,'America/New_York');
  assert.equal(snapshot.series.closeTimes,undefined);
  assert.equal(snapshot.series.closed,undefined);
  const unattested=normalizeSeries(fixture('America/New_York',[seconds('2026-10-02T13:30:00Z')],quotes),'AAPL');
  assert.equal(unattested.series.observedAt,null,'normalizing legacy data cannot stamp a new provider observation time');
  assert.equal(unattested.series.currentTradingPeriod,null,'missing provider session evidence remains unknown');
  assert.equal(normalizeSeries(payload,'AAPL',{observedAt:'2026-10-02'}).series.observedAt,null);
});

test('daily date conversion follows New York DST and previous local date rather than a UTC date', () => {
  const snapshot=normalizeSeries(fixture('America/New_York',[
    seconds('2026-03-07T04:30:00Z'),seconds('2026-03-09T03:30:00Z'),seconds('2026-03-10T03:30:00Z'),
  ],quotes),'AAPL',{observedAt:'2026-03-10T04:00:00.000Z'});
  assert.deepEqual(snapshot.series.dates,['2026-03-06','2026-03-08','2026-03-09']);
  assert.deepEqual(snapshot.series.closes,[100,101,102]);
  assert.deepEqual(snapshot.series.highs,[110,112,114]);
  assert.deepEqual(snapshot.series.volumes,[1,2,3]);
  assert.equal(snapshot.series.sourceTimestamps.length,snapshot.series.closes.length);
});

test('fetchSeries records the actual completed retrieval time rather than request-start or quote time', async () => {
  let tick=Date.parse('2026-10-02T18:59:00.000Z');
  const Clock=class extends Date {static now(){return tick;}};
  const payload=fixture('America/New_York',[seconds('2026-10-02T13:30:00Z')],quotes);
  payload.chart.result[0].meta.regularMarketTime=seconds('2026-10-02T18:58:00Z');
  const context=vm.createContext({Date:Clock,module:{exports:{}},require:name=>{
    if(name==='./util') return {mapLimit:null,fetchJson:async()=>{tick=Date.parse('2026-10-02T19:01:00.000Z');return payload;}};
    if(name==='./equity-calendar') return require('../src/equity-calendar');
    throw Error('Unexpected dependency: '+name);
  }});
  vm.runInContext(fs.readFileSync('src/yahoo.js','utf8'),context);
  const snapshot=await context.module.exports.fetchSeries('AAPL');
  assert.equal(snapshot.observedAt,'2026-10-02T19:01:00.000Z');
  assert.equal(snapshot.series.observedAt,'2026-10-02T19:01:00.000Z');
  assert.equal(snapshot.quoteTime,'2026-10-02T18:58:00.000Z');
});

test('verified daily range requires positive ordered prices containing the close', () => {
  const ranges=[[110,90,true],[100,100,true],[50,110,false],[90,80,false],[110,105,false],[-1,90,false],[110,-1,false],[0,0,false],[Infinity,90,false],[110,null,false]];
  for(const [high,low,verified] of ranges) {
    const snapshot=normalizeSeries(fixture('America/New_York',[seconds('2026-09-30T13:30:00Z')],{close:[100],high:[high],low:[low],volume:[0]}),'AAPL');
    assert.equal(snapshot.series.rangeVerified[0],verified,`range ${high}/${low} cannot claim valid OHLC without a positive containing range`);
    assert.equal(snapshot.series.volumeVerified[0],true,'measured zero volume remains valid');
  }
});
