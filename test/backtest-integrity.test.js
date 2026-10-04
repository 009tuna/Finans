'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('src/backtest-engine.js', 'utf8');
const { explainBacktest } = require('../public/insights');
const {normalizeKlines,dailySeries,createCryptoMarketData} = require('../src/crypto-market-data');
const {normalizeSeries:normalizeYahooSeries} = require('../src/yahoo');
const calendar={provider:'binance',interval:'1d',timeZone:'UTC',basis:'binance_klines_default_timezone'};
function engine(closes, scores = [], extra = {}) {
  let scoredDay = 0;
  let fetches = 0;
  const indicatorInputs = [];
  const measured={closes,highs:closes.map(n=>n+1),lows:closes.map(n=>n-1),volumes:closes.map(()=>1000),rangeVerified:closes.map(()=>true),volumeVerified:closes.map(()=>true)};
  const defaultDates=closes.map((_,i)=>new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  const yahooDates = extra.series?.dates || defaultDates;
  const yahooSeries = {...measured,dates:yahooDates,sourceTimestamps:yahooDates.map(d=>d+'T17:00:00.000Z'),
    dateBasis:'exchange_timezone',timeZone:'America/New_York',observedAt:'2026-10-03T22:00:00.000Z',currentTradingPeriod:null,...extra.series};
  const cryptoSeries={...measured,dates:defaultDates,sourceTimestamps:defaultDates.map(d=>d+'T00:00:00.000Z'),closeTimes:defaultDates.map(d=>d+'T23:59:59.999Z'),calendar,
    technicalData:{status:'fresh',source:'binance',fetchedAt:'2021-01-01T00:00:00.000Z'}};
  const Clock=class extends Date {static now(){return Date.parse(extra.now || '2026-10-04T12:00:00.000Z');}};
  const context = vm.createContext({ Date:Clock, module: { exports: {} }, require: name => {
    if (name === './yahoo') return { fetchSeries: async () => { fetches++; return { currency: 'USD', ...extra, series:yahooSeries }; } };
    if (name === './coingecko') return { fetchSeries: async () => { fetches++; return extra.cryptoSeries || cryptoSeries; } };
    if (name === './indicators') return { computeIndicators: data => {indicatorInputs.push(data.closes);return {};} };
    if (name === './analyze') return { scoreAsset: () => ({ score: scores[scoredDay++] ?? 0 }) };
    if (name === './costs') return require('../src/costs');
    if (name === './daily-history') return require('../src/daily-history');
    throw new Error('Unexpected dependency: ' + name);
  } });
  vm.runInContext(source, context);
  return { run: options => context.module.exports.runBacktest({symbol:'FIXTURE',market:'us',...options}), fetches: () => fetches, indicatorInputs };
}
const series = (...tested) => Array(50).fill(100).concat(tested);
test('small gross gain becomes a net loss after both costs and never counts as a win', async () => {
  const result = await engine(series(100, 100.05), [80,40]).run();
  const exit = result.trades[1];
  const expected = 10000 * (1 - .0005) * (100.05 / 100) * (1 - .0005);
  assert.equal(exit.grossPriceReturnPct, .05);
  assert.ok(exit.netPnlPct < 0);
  assert.ok(Math.abs(exit.netPnlPct - (expected / 10000 - 1) * 100) < 1e-10);
  assert.equal(result.finalCapital, Math.round(expected * 100) / 100);
  assert.equal(explainBacktest(result).winRate, 0);
  assert.equal(result.benchmarkBasis, 'gross_price_return_cost_excluded');
  assert.equal(result.bhReturn, .05);
});
test('forced final liquidation includes both costs and updates the last equity observation', async () => {
  const result = await engine(series(100,110), [80,80]).run();
  const exit = result.trades[1];
  assert.equal(exit.reason, 'Vade Sonu');
  assert.ok(exit.netPnlPct < exit.grossPriceReturnPct);
  assert.equal(result.equityCurve.at(-1).total, result.finalCapital);
  assert.equal(result.equityCurve.at(-1).positionValue, 0);
});
test('each closed trade measures net return from its own pre-entry capital', async () => {
  const result = await engine(series(100,110,100,105), [80,40,80,40]).run();
  const exits = result.trades.filter(t => t.type === 'SELL');
  assert.equal(exits.length, 2);
  assert.equal(exits[1].capitalBefore, exits[0].capitalAfter);
  assert.ok(Math.abs(exits[1].netPnlPct - (((1-.0005)**2 * 1.05)-1)*100) < 1e-10);
  const firstFactor = 1 + result.firstHalfReturn / 100;
  const secondFactor = 1 + result.secondHalfReturn / 100;
  assert.ok(Math.abs((firstFactor*secondFactor-1)*100-result.strategyReturn) < .02);
});
test('cash-only strategy has no measured trade success and no artificial Sharpe', async () => {
  const result = await engine(series(100,110,90), [10,10,10]).run();
  assert.equal(result.strategyReturn, 0);
  assert.equal(result.sharpe, null);
  assert.equal(result.sortino, null);
  assert.equal(explainBacktest(result).winRate, null);
});
test('50 warm-up observations alone cannot produce a test; one valid test day can', async () => {
  await assert.rejects(engine(Array(50).fill(100)).run(), /51 geçerli kapanış/);
  const result = await engine(series(100), [80]).run();
  assert.equal(result.simulatedDays, 1);
  assert.equal(result.trades.length, 2);
  assert.ok(result.strategyReturn < 0);
  assert.equal(result.sharpe, null);
  assert.equal(result.firstHalfReturn, null);
});
test('missing, non-positive or non-finite prices and computed scores are rejected', async () => {
  for (const invalid of [null, 0, -1, NaN, Infinity, '100']) {
    await assert.rejects(engine(series(100,invalid)).run(), /kapanış fiyatı/);
  }
  await assert.rejects(engine(series(100),[Infinity]).run(), /puan hesaplanamadı/);
  await assert.rejects(engine(series(100),[],{__error:'source unavailable'}).run(), /source unavailable/);
});
test('invalid controls fail before fetching, including partial numeric strings and unsupported markets', async () => {
  for (const options of [{buyThreshold:'70bad'}, {buyThreshold:''}, {buyThreshold:101}, {sellThreshold:-1}, {stopLoss:-5}, {stopLoss:100}, {takeProfit:0}, {market:'unknown'}, {symbol:''}]) {
    const instance = engine(series(100));
    await assert.rejects(instance.run(options), /Geçersiz|Geçerli/);
    assert.equal(instance.fetches(), 0);
  }
});
test('crypto risk metrics annualize observations with 365 rather than the exchange assumption of 252', async () => {
  const result = await engine(series(100,110,105), [80,80,80]).run({market:'crypto'});
  assert.equal(result.periodsPerYear, 365);
  assert.equal(result.riskFreeRate, 0);
  assert.equal(result.currency,'USDT');
  assert.equal(result.history.currency,'USDT');
  assert.ok(Number.isFinite(result.sharpe));
});
test('execution price is excluded from the signal calculation and stop triggers execute one observation later', async () => {
  const instance = engine(series(100,80,70), [80,80,80]);
  const result = await instance.run({stopLoss:10});
  assert.deepEqual(Array.from(instance.indicatorInputs[0]),Array(50).fill(100));
  assert.equal(instance.indicatorInputs[1].length,51);
  assert.equal(instance.indicatorInputs[1].at(-1),100);
  const exit = result.trades.find(t=>t.type==='SELL');
  assert.equal(exit.day,3);
  assert.equal(exit.price,70,'önceki kapanışta stop tetiklenir; eşik veya aynı kapanış fiyatından satış uydurulmaz');
  assert.equal(result.executionPolicy,'previous_completed_bar_signal_next_observed_close');
  assert.equal(result.stopPolicy,'previous_close_trigger_next_observed_close_not_intraday_stop_order');
});
test('aligned source dates annotate signal and execution separately, while corrupt date order is rejected', async () => {
  const closes=series(100,110);
  const dates=Array.from({length:closes.length},(_,i)=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10));
  const result=await engine(closes,[80,40],{series:{closes,dates}}).run();
  assert.equal(result.trades[0].date,dates[50]);
  assert.equal(result.trades[0].signalDate,dates[49]);
  assert.equal(result.history.startDate,dates[50]);
  assert.equal(result.history.endDate,dates[51]);
  assert.equal(result.history.testObservations,2);
  await assert.rejects(engine(closes,[80,40],{series:{closes,dates:dates.toReversed()}}).run(),/Geçersiz tarih serisi/);
  await assert.rejects(engine(closes,[80,40],{series:{closes,dates:dates.slice(1)}}).run(),/aynı uzunlukta/);
});

function dailyKlines(count,lastDate,withCloseTime=true) {
  const last=Date.parse(lastDate+'T00:00:00.000Z');
  return Array.from({length:count},(_,i)=>{
    const open=last-(count-1-i)*86400000;
    return [open,'100','101','99','100','2',...(withCloseTime?[open+86400000-1]:[])];
  });
}
function fromBars(raw,observedAt,providerCalendar=calendar) {
  return {...dailySeries(normalizeKlines(raw),providerCalendar),technicalData:{status:'fresh',source:'binance',fetchedAt:observedAt}};
}
test('an open final daily candle cannot turn 50 completed warm-up bars into a backtest day',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const cryptoSeries=fromBars(dailyKlines(51,'2026-10-03'),observedAt);
  assert.equal(cryptoSeries.closeTimes.at(-1),'2026-10-03T23:59:59.999Z');
  await assert.rejects(engine(cryptoSeries.closes,[80],{cryptoSeries,now:observedAt}).run({market:'crypto'}),/51 geçerli kapanış/);
});
test('the public crypto series adapter carries provider closure times, observation cut and quote currency',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const bars=normalizeKlines(dailyKlines(51,'2026-10-03'));
  let request;
  const adapterContext=vm.createContext({module:{exports:{}},__dirname:require('node:path').resolve('src'),require:name=>{
    if(name==='fs'||name==='path') return require(name);
    if(name==='./util') return {mapLimit:()=>{throw Error('No market reads expected');}};
    if(name==='./crypto-http') return {};
    if(name==='./crypto-market-data') return {dailySeries,createCryptoMarketData:()=>({fetchBars:async(...args)=>{
      request=args;
      return {bars,technicalData:{status:'fresh',source:'binance',fetchedAt:observedAt,calendar}};
    }})};
    throw Error('Unexpected dependency: '+name);
  }});
  vm.runInContext(fs.readFileSync('src/coingecko.js','utf8'),adapterContext);
  const cryptoSeries=await adapterContext.module.exports.fetchSeries('BTCUSDT');
  assert.deepEqual(Array.from(request).slice(0,3),['BTCUSDT','1d',250]);
  assert.equal(cryptoSeries.quoteCurrency,'USDT');
  assert.equal(cryptoSeries.technicalData.fetchedAt,observedAt);
  assert.equal(cryptoSeries.calendar.provider,'binance');
  assert.equal(cryptoSeries.closeTimes.at(-1),'2026-10-03T23:59:59.999Z');
  await assert.rejects(engine(cryptoSeries.closes,[80],{cryptoSeries,now:observedAt}).run({market:'crypto'}),/51 geçerli kapanış/);
});
test('completed provider candles produce a dated result while the open candle is excluded with provenance',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const cryptoSeries=fromBars(dailyKlines(53,'2026-10-03'),observedAt);
  const result=await engine(cryptoSeries.closes,[80,40],{cryptoSeries,now:observedAt}).run({market:'crypto'});
  assert.equal(result.simulatedDays,2);
  assert.equal(result.history.endDate,'2026-10-02');
  assert.equal(result.history.completion.sourceObservations,53);
  assert.equal(result.history.completion.completedObservations,52);
  assert.equal(result.history.completion.excludedOpenBars,1);
  assert.deepEqual(Array.from(result.history.completion.bases),['provider_close_time']);
  assert.ok(result.trades.every(t=>t.date<='2026-10-02'));
});
test('UTC daily calendar inference is explicit and unavailable for unattested legacy timestamps',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const cryptoSeries=fromBars(dailyKlines(53,'2026-10-03',false),observedAt);
  assert.ok(cryptoSeries.closeTimes.every(t=>t===null),'source close times remain unknown; inferred times do not impersonate provider evidence');
  const result=await engine(cryptoSeries.closes,[80,40],{cryptoSeries,now:observedAt}).run({market:'crypto'});
  assert.deepEqual(Array.from(result.history.completion.bases),['binance_utc_daily_calendar_inference']);
  assert.equal(result.history.completion.excludedOpenBars,1);
  await assert.rejects(engine(cryptoSeries.closes,[80],{cryptoSeries:{...cryptoSeries,calendar:null},now:observedAt}).run({market:'crypto'}),/tamamlandığı kanıtlanan/);
  await assert.rejects(engine(cryptoSeries.closes,[80],{cryptoSeries:{...cryptoSeries,technicalData:{status:'stale',fetchedAt:null}},now:observedAt}).run({market:'crypto'}),/gözlem kesiti/);
});

test('cached and stale provider snapshots retain closure evidence without promoting their formerly open candle',async()=>{
  let tick=Date.parse('2026-10-03T12:00:00.000Z');
  const rows=new Map();
  let writes=0;
  const database={getCache:async key=>rows.get(key)||null,compareAndSetCache:async(key,value,expected)=>{
    assert.equal(rows.get(key)?.revision||null,expected);
    rows.set(key,{value:structuredClone(value),revision:'r'+ ++writes});
  }};
  const service=createCryptoMarketData({database,now:()=>tick,fetchJson:async()=>dailyKlines(53,'2026-10-03')});
  const fresh=await service.fetchBars('BTCUSDT','1d',250);
  assert.equal(fresh.bars.at(-1).closeTime,Date.parse('2026-10-03T23:59:59.999Z'));
  tick+=1000;
  const offline=createCryptoMarketData({database,now:()=>tick,fetchJson:async()=>{throw Error('offline');}});
  const cached=await offline.fetchBars('BTCUSDT','1d',250);
  assert.equal(cached.technicalData.status,'cached');
  assert.equal(cached.bars.at(-1).closeTime,fresh.bars.at(-1).closeTime);
  tick=Date.parse('2026-10-04T01:00:00.000Z');
  const stale=await offline.fetchBars('BTCUSDT','1d',250);
  assert.equal(stale.technicalData.status,'stale');
  assert.equal(writes,1,'failed refresh never rewrites the successful provider snapshot');
  const cryptoSeries={...dailySeries(stale.bars,stale.technicalData.calendar),technicalData:stale.technicalData};
  const result=await engine(cryptoSeries.closes,[80,40],{cryptoSeries,now:new Date(tick).toISOString()}).run({market:'crypto'});
  assert.equal(result.history.endDate,'2026-10-02','time passing cannot turn an old intraday quote into a completed close');
  assert.equal(result.history.completion.effectiveCutoffAt,'2026-10-03T12:00:00.000Z');
  assert.equal(result.history.status,'stale');
  assert.equal(result.history.completion.excludedOpenBars,1);

  // Old records in the verified provider namespace may use the default 1d/UTC calendar.
  const old=rows.get('crypto-series:BTCUSDT:1d:250').value;
  delete old.calendar;
  old.bars.forEach(bar=>{delete bar.closeTime;delete bar.closeTimeProvided;});
  const oldCache=await offline.fetchBars('BTCUSDT','1d',250);
  const oldSeries={...dailySeries(oldCache.bars,oldCache.technicalData.calendar),technicalData:oldCache.technicalData};
  const inferred=await engine(oldSeries.closes,[80,40],{cryptoSeries:oldSeries,now:new Date(tick).toISOString()}).run({market:'crypto'});
  assert.equal(inferred.history.endDate,'2026-10-02');
  assert.deepEqual(Array.from(inferred.history.completion.bases),['binance_utc_daily_calendar_inference']);
});
test('unattested legacy local cache remains historical fallback but cannot prove completed backtest execution',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const dates=dailyKlines(53,'2026-10-03').map(k=>new Date(k[0]).toISOString().slice(0,10));
  const service=createCryptoMarketData({database:{getCache:async()=>null},now:()=>Date.parse(observedAt),fetchJson:async()=>{throw Error('offline');},
    legacyRead:async()=>({t:observedAt,series:{dates,closes:dates.map(()=>100),highs:dates.map(()=>101),lows:dates.map(()=>99),volumes:dates.map(()=>2)}})});
  const fallback=await service.fetchBars('BTCUSDT','1d',250,'fixture');
  assert.equal(fallback.technicalData.status,'stale');
  assert.equal(fallback.technicalData.source,'legacy-local-cache');
  assert.equal(fallback.technicalData.calendar,null);
  const cryptoSeries={...dailySeries(fallback.bars,fallback.technicalData.calendar),technicalData:fallback.technicalData};
  await assert.rejects(engine(cryptoSeries.closes,[80],{cryptoSeries,now:observedAt}).run({market:'crypto'}),/tamamlandığı kanıtlanan/);
});
test('source currency is preserved without silent dollar substitution',async()=>{
  await assert.rejects(engine(series(100),[80],{currency:null}).run(),/para birimi doğrulanamadı/);
  await assert.rejects(engine(series(100),[80],{currency:'USD'}).run({market:'bist'}),/TRY para birimi/);
  assert.equal((await engine(series(100),[80],{currency:'TRY'}).run({market:'bist'})).currency,'TRY');
  assert.equal((await engine(series(100),[80],{currency:'EUR'}).run()).currency,'EUR');
});
test('imputed range or volume cannot silently influence signals, while measured zero volume remains valid',async()=>{
  const closes=series(100,110);
  const measured={closes,highs:closes.map(n=>n+1),lows:closes.map(n=>n-1),volumes:closes.map(()=>0),rangeVerified:closes.map(()=>true),volumeVerified:closes.map(()=>true)};
  const missingRange=structuredClone(measured);missingRange.rangeVerified[0]=false;
  await assert.rejects(engine(closes,[80,40],{series:missingRange}).run(),/1 gözlemde yüksek\/düşük/);
  const missingVolume=structuredClone(measured);missingVolume.volumeVerified[50]=false;
  await assert.rejects(engine(closes,[80,40],{series:missingVolume}).run(),/1 gözlemde hacim/);
  const result=await engine(closes,[80,40],{series:measured}).run();
  assert.equal(result.simulatedDays,2);
  await assert.rejects(engine(closes,[80,40],{series:{...measured,volumeVerified:[true]}}).run(),/aynı uzunlukta/);
});

function yahooDailyHistory(count,lastDate,observedAt,{timeZone='America/New_York',startAt=lastDate+'T13:30:00.000Z',endAt=lastDate+'T20:00:00.000Z'}={}) {
  const end=Date.parse(lastDate+'T00:00:00.000Z');
  const dates=Array.from({length:count},(_,i)=>new Date(end-(count-1-i)*86400000).toISOString().slice(0,10));
  return {closes:dates.map((_,i)=>100+i),highs:dates.map((_,i)=>101+i),lows:dates.map((_,i)=>99+i),volumes:dates.map((_,i)=>1000+i),
    dates,sourceTimestamps:dates.map(d=>d+'T14:30:00.000Z'),rangeVerified:dates.map(()=>true),volumeVerified:dates.map(()=>true),
    observedAt,timeZone,dateBasis:'exchange_timezone',currentTradingPeriod:{regular:{start:Date.parse(startAt)/1000,end:Date.parse(endAt)/1000}}};
}

test('Yahoo current session at 15:00 cannot supply the 51st completed bar, and observed post-close data can',async()=>{
  const before='2026-10-02T19:00:00.000Z';
  const beforeSeries=yahooDailyHistory(51,'2026-10-02',before);
  await assert.rejects(engine(beforeSeries.closes,[80],{series:beforeSeries,now:before}).run(),/51 geçerli kapanış/);
  const after='2026-10-02T20:00:01.000Z';
  const afterSeries={...beforeSeries,observedAt:after};
  const result=await engine(afterSeries.closes,[80],{series:afterSeries,now:after}).run();
  assert.equal(result.simulatedDays,1);
  assert.equal(result.history.endDate,'2026-10-02');
  assert.equal(result.history.fetchedAt,after);
  assert.equal(result.history.completion.completedObservations,51);
  assert.equal(result.history.completion.excludedOpenBars,0);
  assert.equal(result.history.completion.regularSession.endAt,'2026-10-02T20:00:00.000Z');
  assert.deepEqual(Array.from(result.history.completion.bases),['yahoo_exchange_local_prior_day_inference','yahoo_current_regular_session_end']);
  assert.equal(afterSeries.closeTimes,undefined,'completion inference does not alter the provider source series');
});

test('a cached intraday Yahoo snapshot never gains a completed bar merely because run time passes close or midnight',async()=>{
  const observedAt='2026-10-02T19:00:00.000Z';
  const cached=yahooDailyHistory(53,'2026-10-02',observedAt);
  for(const now of ['2026-10-02T20:01:00.000Z','2026-10-03T12:00:00.000Z']) {
    const result=await engine(cached.closes,[80,40],{series:cached,now}).run();
    assert.equal(result.history.endDate,'2026-10-01');
    assert.equal(result.history.completion.effectiveCutoffAt,observedAt);
    assert.equal(result.history.completion.exchangeLocalCutoffDate,'2026-10-02');
    assert.equal(result.history.completion.excludedOpenBars,1);
    assert.equal(result.history.observations,52);
  }
  const futureObserved={...cached,observedAt:'2026-10-02T20:01:00.000Z'};
  await assert.rejects(engine(futureObserved.closes.slice(2),[80],{series:{...futureObserved,...Object.fromEntries(['closes','highs','lows','volumes','dates','sourceTimestamps','rangeVerified','volumeVerified'].map(k=>[k,futureObserved[k].slice(2)]))},now:observedAt}).run(),/51 geçerli kapanış/);
});

test('Yahoo current-day closure without matching provider regular-session evidence stays unknown',async()=>{
  const observedAt='2026-10-02T20:01:00.000Z';
  const full=yahooDailyHistory(53,'2026-10-02',observedAt);
  for(const currentTradingPeriod of [null,{regular:{start:full.currentTradingPeriod.regular.start,end:null}},
    {regular:{start:Date.parse('2026-10-01T13:30:00Z')/1000,end:Date.parse('2026-10-01T20:00:00Z')/1000}},
    {regular:{start:full.currentTradingPeriod.regular.end,end:full.currentTradingPeriod.regular.start}}]) {
    const result=await engine(full.closes,[80,40],{series:{...full,currentTradingPeriod},now:observedAt}).run();
    assert.equal(result.history.endDate,'2026-10-01');
    assert.equal(result.history.completion.excludedUnverifiedBars,1);
    assert.deepEqual(Array.from(result.history.completion.bases),['yahoo_exchange_local_prior_day_inference']);
  }
});

test('Yahoo missing date basis, invalid timezone, missing observation cut and unattested dates cannot masquerade as completed history',async()=>{
  const full=yahooDailyHistory(53,'2026-10-02','2026-10-03T12:00:00.000Z');
  for(const patch of [{dateBasis:null},{dateBasis:'utc'},{timeZone:null},{timeZone:'Invalid/Zone'},{observedAt:null},{observedAt:'2026-10-03'},{sourceTimestamps:null}]) {
    await assert.rejects(engine(full.closes,[80],{series:{...full,...patch}}).run(),/Yahoo kapanışları doğrulanamadı/);
  }
});

test('Yahoo local cutoff and regular end evidence follow DST and midnight rather than a UTC calendar',async()=>{
  const winter=yahooDailyHistory(51,'2026-01-15','2026-01-15T20:00:00.000Z',{startAt:'2026-01-15T14:30:00Z',endAt:'2026-01-15T21:00:00Z'});
  await assert.rejects(engine(winter.closes,[80],{series:winter,now:winter.observedAt}).run(),/51 geçerli kapanış/);
  const winterAfter={...winter,observedAt:'2026-01-15T21:01:00.000Z'};
  assert.equal((await engine(winterAfter.closes,[80],{series:winterAfter,now:winterAfter.observedAt}).run()).history.completion.regularSession.endAt,'2026-01-15T21:00:00.000Z');
  const summer=yahooDailyHistory(51,'2026-03-09','2026-03-10T03:30:00.000Z',{startAt:'2026-03-09T13:30:00Z',endAt:'2026-03-09T20:00:00Z'});
  const result=await engine(summer.closes,[80],{series:summer,now:summer.observedAt}).run();
  assert.equal(result.history.completion.exchangeLocalCutoffDate,'2026-03-09');
  assert.equal(result.history.endDate,'2026-03-09');
  assert.deepEqual(Array.from(result.history.completion.bases),['yahoo_exchange_local_prior_day_inference','yahoo_current_regular_session_end']);
});

test('excluding a Yahoo open bar keeps all OHLCV, dates and verification fields aligned',async()=>{
  const full=yahooDailyHistory(53,'2026-10-02','2026-10-02T19:00:00.000Z');
  full.closes[52]=9999;
  full.highs[52]=10000;
  full.lows[52]=9998;
  full.volumes[52]=99999;
  full.rangeVerified[52]=false;
  full.volumeVerified[52]=false;
  const result=await engine(full.closes,[80,40],{series:full,now:full.observedAt}).run();
  assert.equal(result.history.observations,52);
  assert.equal(result.history.endDate,'2026-10-01');
  assert.ok(result.equityCurve.every(row=>row.price!==9999));
  await assert.rejects(engine(full.closes,[80],{series:{...full,highs:full.highs.slice(1)},now:full.observedAt}).run(),/aynı uzunlukta/);
});

test('crypto original OHLCV and provenance lengths are checked before the open bar is excluded',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const full=fromBars(dailyKlines(52,'2026-10-03'),observedAt);
  const fields=['highs','lows','volumes','rangeVerified','volumeVerified'];
  for(const shortened of fields.map(field=>[field]).concat([fields])) {
    const corrupt={...full,...Object.fromEntries(shortened.map(field=>[field,full[field].slice(1)]))};
    await assert.rejects(engine(corrupt.closes,[80],{cryptoSeries:corrupt,now:observedAt}).run({market:'crypto'}),/aynı uzunlukta/);
  }
});

test('a provider 01:00 closeTime is not a completed UTC 1d candle and never falls back to inferred proof',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const raw=dailyKlines(51,'2026-10-03');
  raw.at(-1)[6]=raw.at(-1)[0]+3600000;
  const invalid=fromBars(raw,observedAt);
  assert.equal(invalid.closeTimes.at(-1),'2026-10-03T01:00:00.000Z');
  await assert.rejects(engine(invalid.closes,[80],{cryptoSeries:invalid,now:observedAt}).run({market:'crypto'}),/51 geçerli kapanış/);
  const enough=dailyKlines(53,'2026-10-03');
  enough.at(-1)[6]=enough.at(-1)[0]+3600000;
  const retained=fromBars(enough,observedAt);
  const result=await engine(retained.closes,[80,40],{cryptoSeries:retained,now:observedAt}).run({market:'crypto'});
  assert.equal(result.history.endDate,'2026-10-02');
  assert.equal(result.history.completion.excludedUnverifiedBars,1);
  assert.equal(result.history.completion.excludedOpenBars,0);
  assert.deepEqual(Array.from(result.history.completion.bases),['provider_close_time']);
});

test('daily crypto closure requires the matching real UTC midnight open and calendar date',async()=>{
  const observedAt='2026-10-03T12:00:00.000Z';
  const full=fromBars(dailyKlines(51,'2026-10-03'),observedAt);
  const early={...full,closeTimes:full.closeTimes.map((v,i)=>i===50?'2026-10-03T01:00:00.000Z':v)};
  for(const patch of [
    {sourceTimestamps:full.sourceTimestamps.map((v,i)=>i===50?null:v)},
    {sourceTimestamps:full.sourceTimestamps.map((v,i)=>i===50?'2026-10-03':v)},
    {sourceTimestamps:full.sourceTimestamps.map((v,i)=>i===50?'2026-10-02T00:00:00.000Z':v)},
    {sourceTimestamps:full.sourceTimestamps.map((v,i)=>i===50?'2026-10-03T00:30:00.000Z':v)},
    {dates:full.dates.map((v,i)=>i===50?'2026-10-02':v)},
  ]) {
    const corrupt={...early,...patch};
    await assert.rejects(engine(corrupt.closes,[80],{cryptoSeries:corrupt,now:observedAt}).run({market:'crypto'}),/51 geçerli kapanış/);
  }
  await assert.rejects(engine(full.closes,[80],{cryptoSeries:{...full,calendar:null},now:observedAt}).run({market:'crypto'}),/tamamlandığı kanıtlanan/);
  const shifted=dailyKlines(51,'2026-10-02');
  shifted.at(-1)[0]+=1;
  const precise=fromBars(shifted,observedAt);
  assert.equal(precise.sourceTimestamps.at(-1),'2026-10-02T00:00:00.001Z','normalization must not floor a non-midnight provider open into midnight');
  await assert.rejects(engine(precise.closes,[80],{cryptoSeries:precise,now:observedAt}).run({market:'crypto'}),/51 geçerli kapanış/);
});

test('malformed explicit closeTime stays explicit through normalization and cache instead of becoming legacy missing proof',async()=>{
  const observedAt='2026-10-04T12:00:00.000Z';
  for(const malformed of [-1,NaN,'',Date.parse('2026-10-02T23:59:59.999Z')]) {
    const raw=dailyKlines(53,'2026-10-03');
    raw.at(-1)[6]=malformed;
    const bars=normalizeKlines(raw);
    assert.equal(bars.at(-1).closeTimeProvided,true);
    assert.equal(bars.at(-1).closeTime,undefined);
    const cryptoSeries={...dailySeries(bars,calendar),technicalData:{status:'fresh',source:'binance',fetchedAt:observedAt}};
    assert.equal(cryptoSeries.closeTimeProvided.at(-1),true);
    const result=await engine(cryptoSeries.closes,[80,40],{cryptoSeries,now:observedAt}).run({market:'crypto'});
    assert.equal(result.history.endDate,'2026-10-02');
    assert.equal(result.history.completion.excludedUnverifiedBars,1);
  }
  const raw=dailyKlines(53,'2026-10-03');
  raw.at(-1)[6]=-1;
  const bars=normalizeKlines(raw);
  const service=createCryptoMarketData({database:{getCache:async()=>({value:{bars,calendar,fetchedAt:observedAt}})},now:()=>Date.parse(observedAt),fetchJson:async()=>{throw Error('No live calls expected');}});
  const cached=await service.fetchBars('BTCUSDT','1d',250);
  assert.equal(cached.technicalData.status,'cached');
  assert.equal(cached.bars.at(-1).closeTimeProvided,true);
  const cryptoSeries={...dailySeries(cached.bars,cached.technicalData.calendar),technicalData:cached.technicalData};
  const result=await engine(cryptoSeries.closes,[80,40],{cryptoSeries,now:observedAt}).run({market:'crypto'});
  assert.equal(result.history.endDate,'2026-10-02');
  assert.equal(result.history.completion.excludedUnverifiedBars,1);
});

test('malformed Yahoo high/low cannot carry verified range into a backtest signal',async()=>{
  const observedAt='2026-10-03T22:00:00.000Z';
  const timestamps=Array.from({length:51},(_,i)=>Date.UTC(2026,0,1+i,17)/1000);
  for(const [high,low] of [[50,110],[90,80],[110,105],[-1,90],[110,-1]]) {
    const quotes={close:Array(51).fill(100),high:Array(51).fill(110),low:Array(51).fill(90),volume:Array(51).fill(0)};
    quotes.high[50]=high;quotes.low[50]=low;
    const data=normalizeYahooSeries({chart:{result:[{meta:{exchangeTimezoneName:'America/New_York',currency:'USD'},timestamp:timestamps,indicators:{quote:[quotes]}}]}},'FIXTURE',{observedAt});
    assert.equal(data.series.rangeVerified[50],false);
    await assert.rejects(engine(data.series.closes,[80],{series:data.series,now:observedAt}).run(),/1 gözlemde yüksek\/düşük/);
  }
});
