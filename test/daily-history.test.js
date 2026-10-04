'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {normalizeYahooChart,normalizeBinanceKlines}=require('../src/chart-data');
const {completedChartHistory}=require('../src/daily-history');
const sec=value=>Date.parse(value)/1000;
function yahoo(observedAt,{timeZone='America/New_York',currency='USD',close=[100,101,102]}={}) {
  return normalizeYahooChart({chart:{result:[{
    meta:{exchangeTimezoneName:timeZone,currency,currentTradingPeriod:{regular:{start:sec('2026-10-02T13:30:00Z'),end:sec('2026-10-02T20:00:00Z')}}},
    timestamp:['2026-09-30T13:30:00Z','2026-10-01T13:30:00Z','2026-10-02T13:30:00Z'].map(sec),
    indicators:{quote:[{close}]},
  }]}},{market:'us',symbol:'AAPL',sourceSymbol:'AAPL',interval:'1d',range:'1y',observedAt});
}
function crypto(observedAt) {
  const end=Date.parse('2026-10-03T00:00:00.000Z');
  return normalizeBinanceKlines(Array.from({length:6},(_,i)=>{
    const open=end-(5-i)*86400000;
    return [open,'100','101','99','100','1000',open+86400000-1];
  }),{market:'crypto',symbol:'BTC',sourceSymbol:'BTCUSDT',interval:'1d',observedAt});
}
test('daily financial history filters open Yahoo bars while preserving live chart bars and explicit session proof',()=>{
  const chart=yahoo('2026-10-02T19:00:00.000Z');
  const closed=completedChartHistory(chart,'us',Date.parse('2026-10-02T19:30:00Z'));
  assert.equal(chart.bars.length,3,'live chart keeps the developing session');
  assert.equal(closed.bars.length,2);
  assert.equal(closed.bars.at(-1).date,'2026-10-01');
  assert.equal(closed.completion.excludedOpenBars,1);
  assert.equal(closed.completion.effectiveCutoffAt,'2026-10-02T19:00:00.000Z');
  assert.equal(closed.completion.regularSession.endAt,'2026-10-02T20:00:00.000Z');
  assert.deepEqual(closed.completion.bases,['yahoo_exchange_local_prior_day_inference']);
  const after=yahoo('2026-10-02T20:01:00.000Z');
  assert.equal(completedChartHistory(after,'us',Date.parse('2026-10-02T20:01:00Z')).bars.length,3);
});
test('old intraday Yahoo and Binance snapshots do not gain closed bars when calculation time advances',()=>{
  const stock=yahoo('2026-10-02T19:00:00.000Z');
  const coin=crypto('2026-10-03T12:00:00.000Z');
  for(const cutoff of ['2026-10-03T12:00:00Z','2026-10-04T12:00:00Z']) {
    assert.equal(completedChartHistory(stock,'us',Date.parse(cutoff)).bars.at(-1).date,'2026-10-01');
    const result=completedChartHistory(coin,'crypto',Date.parse(cutoff));
    assert.equal(result.bars.length,5);
    assert.equal(result.bars.at(-1).date,'2026-10-02');
    assert.equal(result.completion.effectiveCutoffAt,'2026-10-03T12:00:00.000Z');
    assert.equal(result.currency,'USDT');
  }
  assert.equal(coin.bars.length,6,'developing crypto bar remains available to live charts');
});
test('legacy charts with unknown currency, time basis or observation cut remain visible but cannot calibrate returns',()=>{
  const cutoff=Date.parse('2026-10-04T12:00:00Z');
  const chart=yahoo('2026-10-02T20:01:00.000Z');
  for(const patch of [{currency:null},{currency:'unknown'},{currency:'ZZZ'},{currency:'XXX'},{observedAt:null},{dateBasis:null},{timeZone:'Invalid/Zone'},{source:'unknown'}]) {
    assert.throws(()=>completedChartHistory({...chart,...patch},'us',cutoff));
    assert.equal(chart.bars.length,3);
  }
  const missing=yahoo('2026-10-02T20:01:00.000Z',{currency:null,timeZone:null});
  assert.equal(missing.currency,null,'source absence never defaults to USD');
  assert.equal(missing.dateBasis,'unverified');
  assert.equal(missing.bars.length,3);
  const coin=crypto('2026-10-03T12:00:00.000Z');
  assert.throws(()=>completedChartHistory({...coin,currency:'USD'},'crypto',cutoff),/USDT/);
  assert.throws(()=>completedChartHistory({...coin,technicalData:{...coin.technicalData,calendar:null}},'crypto',cutoff),/tamamlandığı kanıtlanan/);
});
test('return history needs verified closing prices but does not fabricate a requirement for missing OHLC observations',()=>{
  const chart=yahoo('2026-10-03T12:00:00.000Z');
  assert.equal(completedChartHistory(chart,'us',Date.parse('2026-10-03T12:00:00Z')).bars.length,3,'verified daily closes can calibrate return ratios without a high/low or volume measurement');
  const numericPrefix=yahoo('2026-10-03T12:00:00.000Z',{close:[100,'101bad',102]});
  assert.equal(numericPrefix.bars[1].close,101,'existing display parsing remains compatible');
  assert.equal(numericPrefix.bars[1].closeVerified,false);
  assert.throws(()=>completedChartHistory(numericPrefix,'us',Date.parse('2026-10-03T12:00:00Z')),/fiyat veya zaman/);
  const unknownTimestamp={...chart,bars:chart.bars.map((bar,i)=>i===0?{...bar,sourceTime:null}:bar)};
  assert.throws(()=>completedChartHistory(unknownTimestamp,'us',Date.parse('2026-10-03T12:00:00Z')),/fiyat veya zaman/);
});
test('completed source dates use the IANA exchange-local date instead of the UTC date',()=>{
  const chart=yahoo('2026-10-03T12:00:00.000Z');
  chart.bars=[{time:sec('2026-10-01T01:00:00Z'),sourceTime:sec('2026-10-01T01:00:00Z'),close:100,closeVerified:true}];
  const result=completedChartHistory(chart,'us',Date.parse('2026-10-03T12:00:00Z'));
  assert.equal(result.bars[0].date,'2026-09-30');
  assert.equal(result.completion.timeZone,'America/New_York');
});
test('a malformed explicit crypto close time never becomes inferred proof in the chart adapter',()=>{
  const chart=crypto('2026-10-04T12:00:00.000Z');
  chart.bars.at(-1).closeTime=chart.bars.at(-1).openTime+3600000;
  const result=completedChartHistory(chart,'crypto',Date.parse('2026-10-04T12:00:00Z'));
  assert.equal(result.bars.at(-1).date,'2026-10-02');
  assert.equal(result.completion.excludedUnverifiedBars,1);
  assert.deepEqual(result.completion.bases,['provider_close_time']);
});
