'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/forecast.js'), 'utf8');
const firstDay = Date.parse('2026-09-01T00:00:00Z') / 1000;
const fixtureObservedAt = '2026-10-20T12:00:00Z';
const usdAsset = (extra = {}) => ({ symbol: 'US', market: 'us', amount: 2, price: 100, currency: 'USD', ...extra });
const bistAsset = (extra = {}) => ({
  symbol: 'BIST', market: 'bist', amount: 20, price: 5, currency: 'USD',
  originalPrice: 200, originalCurrency: 'TRY', fxRate: 40, fxQuoteTime: '2026-09-10T13:00:00Z', ...extra,
});
const bars = (startPrice, dailyReturn = 0, count = 6, offset = 0) => Array.from({ length: count }, (_, day) => ({
  time: firstDay + (offset + day) * 86400,
  close: startPrice * Math.pow(1 + dailyReturn, day),
}));

// Fixture times name a calendar date. Yahoo's raw provider timestamp is during
// that exchange's session; Binance daily bars start at midnight UTC. Values are
// retained exactly, including deliberately corrupt rows used below.
function sourceChart(series = bars(100), market = 'us', extra = {}) {
  const base = {
    market, interval: '1d', sourceSymbol: 'fixture',
    fetchedAt: fixtureObservedAt, observedAt: fixtureObservedAt,
  };
  if (market === 'crypto') {
    return {
      ...base, source: 'binance', currency: 'USDT',
      technicalData: {
        fetchedAt: fixtureObservedAt,
        calendar: { provider: 'binance', interval: '1d', timeZone: 'UTC', basis: 'binance_klines_default_timezone' },
      },
      bars: series.map(bar => ({
        ...bar, openTime: bar.time * 1000,
        closeTime: bar.time * 1000 + 86400000 - 1, closeTimeProvided: true,
      })),
      ...extra,
    };
  }
  return {
    ...base, source: 'yahoo', currency: market === 'bist' ? 'TRY' : 'USD',
    dateBasis: 'exchange_timezone', timeZone: market === 'bist' ? 'Europe/Istanbul' : 'America/New_York',
    bars: series.map(bar => ({ ...bar, time: typeof bar.time === 'number' ? bar.time + 14 * 3600 : bar.time })),
    ...extra,
  };
}

function engine(chartFetcher = async ({ market }) => sourceChart(bars(100), market), now = fixtureObservedAt) {
  const calls = [];
  let nowMs = Date.parse(now);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  }
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.5;
  const context = vm.createContext({
    module: { exports: {} }, console, Math: deterministicMath, Date: Clock,
    require: name => {
      if (name === './daily-history') return require('../src/daily-history');
      assert.equal(name, './chart-data', 'forecast tests must not load network dependencies');
      return { fetchAssetChart: async params => { calls.push(params); return chartFetcher(params); } };
    },
  });
  vm.runInContext(source, context, { filename: 'src/forecast.js' });
  return { run: context.module.exports.runMonteCarlo, calls, setNow: value => { nowMs = Date.parse(value); } };
}

test('mixed USD and TRY positions use normalized USD weights and native historical returns', async () => {
  const { run, calls } = engine(async ({ market }) => sourceChart(market === 'bist' ? bars(200, 0.02) : bars(100, 0.01), market));
  const result = await run({ assets: [usdAsset(), bistAsset()], horizon: 1, numPaths: 10 });
  assert.equal(result.currency, 'USD');
  assert.equal(result.initialValue, 300, '200 USD + 4000 TRY / 40 = 300 USD');
  assert.equal(result.mu_d, 0.01333, 'normalized weights are 2/3 US and 1/3 BIST');
  assert.equal(result.sigma_d, 0);
  assert.equal(result.percentiles.median[0], 300);
  assert.equal(result.percentiles.median[1], 304);
  assert.equal(result.metadata.horizonUnit, 'calendar_day');
  assert.equal(result.metadata.daysPerYear, 365);
  assert.equal(result.metadata.stablecoinFxMode, 'not_applicable');
  assert.equal(result.annualizedReturn, Math.round((Math.pow(1 + 0.013333333333333333, 365) - 1) * 10000) / 100);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.interval === '1d' && call.range === '1y'));
});

test('US and crypto positions use USD valuation and savings with the native historical currency disclosed', async () => {
  const { run } = engine();
  const result = await run({
    assets: [usdAsset(), usdAsset({ symbol: 'BTC', market: 'crypto', amount: 0.01, price: 50000 })],
    horizon: 1, monthlySaving: 300, numPaths: 10,
  });
  assert.equal(result.initialValue, 700);
  assert.equal(result.currency, 'USD');
  assert.equal(result.monthlySaving, 300);
  assert.equal(result.percentiles.median[1], 709.86);
  assert.equal(result.histories[1].currency, 'USDT', 'the observed crypto quote currency is disclosed');
  assert.equal(result.metadata.stablecoinFxMode, 'fixed_ratio_not_modeled');
});

test('non-overlapping leading and trailing history is excluded, never filled with a future or USD quote', async () => {
  const { run } = engine(async ({ market }) => sourceChart(market === 'bist' ? bars(240, 0, 6, 1) : bars(100, 0, 8), market));
  const result = await run({
    assets: [usdAsset({ amount: 1 }), bistAsset({ amount: 10, originalPrice: 240, price: 6 })],
    horizon: 1, monthlySaving: 30, numPaths: 10,
  });
  assert.equal(result.initialValue, 160);
  assert.equal(result.mu_d, 0, 'a constant TRY series cannot acquire a false FX-sized return');
  assert.equal(result.sigma_d, 0);
  assert.equal(result.percentiles.median[1], 160.99);
  assert.equal(result.metadata.historyStartDate, '2026-09-02');
  assert.equal(result.metadata.historyEndDate, '2026-09-07');
  assert.equal(result.metadata.historicalCalendarDays, 6);
  assert.ok(result.histories.every(history => history.carriedForwardDays === 0));
});

test('return calibration is restricted to the overlap without inserting later first quotes into earlier history', async () => {
  const { run } = engine(async ({ market }) => sourceChart(market === 'bist' ? bars(200, 0.02, 6, 3) : bars(100, 0.01, 9), market));
  const result = await run({ assets: [usdAsset(), bistAsset()], horizon: 1, numPaths: 10 });
  assert.equal(result.mu_d, 0.01333, 'early US-only returns must not dilute the BIST return series');
  assert.equal(result.metadata.historyStartDate, '2026-09-04');
  assert.equal(result.metadata.historyEndDate, '2026-09-09');
  assert.equal(result.metadata.historicalReturnCount, 5);
});

test('stock-only calibration uses calendar days, disclosed carried quotes and 365-day annualization', async () => {
  const calendarTimes = Array.from({ length: 14 }, (_, day) => firstDay + day * 86400);
  const tradingTimes = calendarTimes.filter(time => ![0, 6].includes(new Date(time * 1000).getUTCDay()));
  const series = tradingTimes.map((time, index) => ({ time, close: 100 * Math.pow(1.01, index) }));
  const { run } = engine(async () => sourceChart(series));
  const result = await run({ assets: [usdAsset()], horizon: 365, numPaths: 10 });
  const expectedMean = (tradingTimes.length - 1) * 0.01 / 13;
  assert.equal(result.mu_d, Math.round(expectedMean * 100000) / 100000);
  assert.equal(result.annualizedReturn, Math.round((Math.pow(1 + expectedMean, 365) - 1) * 10000) / 100);
  assert.equal(result.metadata.historicalCalendarDays, 14);
  assert.equal(result.metadata.historicalReturnCount, 13);
  assert.equal(result.metadata.tradingCalendarMode, 'not_modeled');
  assert.equal(result.metadata.gapPolicy, 'carry_last_observed_within_common_coverage');
  assert.equal(result.histories[0].carriedForwardDays, 4);
  assert.equal(result.histories[0].observedDailyPricesInOverlap, 10);
  assert.equal(result.percentiles.median.length, 366, '365 steps are 365 calendar days');
});

test('a 365-day zero-return path receives exactly 12 monthly USD savings contributions', async () => {
  const { run } = engine();
  const result = await run({ assets: [usdAsset()], horizon: 365, monthlySaving: 120, numPaths: 10 });
  assert.equal(result.percentiles.median[365], 200 + 12 * 120);
  assert.equal(result.metadata.savingBasis, 'uniform_daily_12_months_per_365_days');
});

test('mixed stock/crypto history has one calendar-day basis with per-asset observed-gap counts', async () => {
  const allTimes = Array.from({ length: 14 }, (_, day) => firstDay + day * 86400);
  const tradingTimes = allTimes.filter(time => ![0, 6].includes(new Date(time * 1000).getUTCDay()));
  const stockSeries = tradingTimes.map((time, index) => ({ time, close: 100 * Math.pow(1.01, index) }));
  const cryptoSeries = allTimes.map(time => ({ time, close: 100 }));
  const { run } = engine(async ({ market }) => sourceChart(market === 'crypto' ? cryptoSeries : stockSeries, market));
  const result = await run({
    assets: [usdAsset(), usdAsset({ symbol: 'COIN', market: 'crypto' })], horizon: 1, numPaths: 10,
  });
  const expectedMean = 9 * 0.005 / 13;
  assert.equal(result.mu_d, Math.round(expectedMean * 100000) / 100000);
  assert.equal(result.annualizedReturn, Math.round((Math.pow(1 + expectedMean, 365) - 1) * 10000) / 100);
  assert.equal(result.metadata.historicalReturnCount, 13);
  assert.equal(result.histories[0].carriedForwardDays, 4);
  assert.equal(result.histories[1].carriedForwardDays, 0);
});

test('non-overlapping or sparsely observed common history fails instead of creating backward-filled returns', async () => {
  const disjoint = engine(async ({ market }) => sourceChart(market === 'bist' ? bars(200, 0, 6, 10) : bars(100), market));
  await assert.rejects(disjoint.run({ assets: [usdAsset(), bistAsset()], horizon: 1, numPaths: 10 }), /en az 6 ortak takvim günü/);
  const sparse = engine(async ({ market }) => sourceChart(market === 'bist'
    ? Array.from({ length: 6 }, (_, day) => ({ time: firstDay + (-10 + day * 5) * 86400, close: 200 }))
    : bars(100, 0, 31, -30), market));
  await assert.rejects(sparse.run({ assets: [usdAsset(), bistAsset()], horizon: 1, numPaths: 10 }), /ortak tarih kapsamında en az 6 gözlenen günlük kapanış/);
});

test('missing or conflicting currency is rejected before historical data is fetched', async () => {
  const { run, calls } = engine();
  for (const currency of [undefined, null, 'TRY', 'usd', 'EUR']) {
    await assert.rejects(run({ assets: [usdAsset({ currency })], horizon: 1, numPaths: 10 }), /ortak para birimi USD/);
  }
  await assert.rejects(run({ assets: [usdAsset({ originalCurrency: 'TRY', originalPrice: 100 })], horizon: 1, numPaths: 10 }), /kaynak fiyat/);
  await assert.rejects(run({ assets: [usdAsset({ originalCurrency: 'USD', originalPrice: 101 })], horizon: 1, numPaths: 10 }), /kaynak fiyat/);
  assert.equal(calls.length, 0);
});

test('every BIST position requires a positive explicit exchange-rate proof and a zoned quote timestamp', async () => {
  const { run, calls } = engine();
  const invalidProofs = [
    { originalCurrency: undefined }, { originalCurrency: 'USD' }, { originalPrice: undefined },
    { originalPrice: 0 }, { originalPrice: '200' }, { fxRate: undefined }, { fxRate: 0 },
    { fxRate: -40 }, { fxRate: Infinity }, { fxRate: '40' }, { fxQuoteTime: undefined },
    { fxQuoteTime: '2026-09-10' }, { fxQuoteTime: '2026-09-10T13:00:00' },
    { fxQuoteTime: 'invalid' }, { fxQuoteTime: '2026-13-10T13:00:00Z' },
    { fxQuoteTime: '2026-02-30T13:00:00Z' }, { fxQuoteTime: '2026-09-10T24:00:00Z' },
  ];
  for (const proof of invalidProofs) {
    await assert.rejects(run({ assets: [bistAsset(proof)], horizon: 1, numPaths: 10 }), /TRY fiyatı, USD\/TRY kuru ve açık kur zamanı/);
  }
  await assert.rejects(run({ assets: [bistAsset({ price: 200 })], horizon: 1, numPaths: 10 }), /kur dönüşümüyle uyuşmuyor/);
  await assert.rejects(run({ assets: [bistAsset({ originalPrice: 1e308, fxRate: 1e-308 })], horizon: 1, numPaths: 10 }), /kur dönüşümüyle uyuşmuyor/);
  await assert.rejects(run({ assets: [bistAsset({ originalPrice: 4e-8, price: 2e-9 })], horizon: 1, numPaths: 10 }), /kur dönüşümüyle uyuşmuyor/);
  assert.equal(calls.length, 0);
});

test('BIST accepts exact USD conversion with an explicit timezone offset', async () => {
  const { run } = engine(async () => sourceChart(bars(200), 'bist'));
  const result = await run({ assets: [bistAsset({ fxQuoteTime: '2026-09-10T16:00:00+03:00' })], horizon: 1, numPaths: 10 });
  assert.equal(result.initialValue, 100);
  assert.equal(result.currency, 'USD');
});

test('invalid amounts and current prices cannot fall back to history or accept numeric strings', async () => {
  const { run, calls } = engine();
  for (const field of ['amount', 'price']) {
    for (const value of [undefined, null, '', '100', 0, -1, NaN, Infinity]) {
      await assert.rejects(run({ assets: [usdAsset({ [field]: value })], horizon: 1, numPaths: 10 }), /adet ve USD fiyatı pozitif sayılar/);
    }
  }
  await assert.rejects(run({ assets: [usdAsset({ amount: 1e308, price: 1e308 })], horizon: 1, numPaths: 10 }), /USD değeri geçersiz/);
  await assert.rejects(run({ assets: [usdAsset({ amount: 1, price: 1e308 })], horizon: 1, numPaths: 10 }), /USD değeri geçersiz/);
  assert.equal(calls.length, 0);
});

test('simulation work and savings inputs have strict finite numeric bounds', async () => {
  const { run, calls } = engine();
  const base = { assets: [usdAsset()], horizon: 1, numPaths: 10, monthlySaving: 0 };
  for (const horizon of [0, -1, 1.5, 1096, '365', NaN, Infinity]) {
    await assert.rejects(run({ ...base, horizon }), /tam gün/);
  }
  for (const numPaths of [0, 9, 10.5, 5001, '10', NaN, Infinity]) {
    await assert.rejects(run({ ...base, numPaths }), /yol sayısı/);
  }
  await assert.rejects(run({ ...base, horizon: 1095, numPaths: 2000 }), /hesaplama sınırı/);
  for (const monthlySaving of [-1, null, '0', NaN, Infinity, 1e9 + 1]) {
    await assert.rejects(run({ ...base, monthlySaving }), /geçerli bir USD tutarı/);
  }
  assert.equal(calls.length, 0);
});

test('one unavailable holding rejects the entire portfolio instead of silently dropping it', async () => {
  const { run } = engine(async ({ symbol }) => {
    if (symbol === 'MISSING') throw new Error('provider unavailable');
    return sourceChart(bars(100));
  });
  await assert.rejects(run({
    assets: [usdAsset(), usdAsset({ symbol: 'MISSING' })], horizon: 1, numPaths: 10,
  }), /MISSING: tarihsel veri alınamadı[\s\S]*Portföyün tamamı simüle edilmedi/);
});

test('missing, insufficient, duplicate-only and corrupt history all reject a complete portfolio', async () => {
  const invalidCharts = [
    null, {}, sourceChart([]), sourceChart(bars(100, 0, 5)),
    sourceChart(bars(100).map(bar => ({ ...bar, time: firstDay }))),
    sourceChart(bars(100).map((bar, i) => i === 0 ? { ...bar, close: 0 } : bar)),
    sourceChart(bars(100).map((bar, i) => i === 0 ? { ...bar, time: NaN } : bar)),
  ];
  for (const chart of invalidCharts) {
    const { run } = engine(async ({ symbol }) => symbol === 'BAD' ? chart : sourceChart(bars(100)));
    await assert.rejects(run({ assets: [usdAsset(), usdAsset({ symbol: 'BAD' })], horizon: 1, numPaths: 10 }), /BAD: tarihsel veri alınamadı[\s\S]*Portföyün tamamı simüle edilmedi/);
  }
});

test('five completed prices plus a current open Binance day cannot satisfy the six-price minimum', async () => {
  const observedAt = '2026-09-06T12:00:00Z';
  const chart = sourceChart(bars(100, 0.01, 6), 'crypto', {
    fetchedAt: observedAt, observedAt,
    technicalData: {
      fetchedAt: observedAt,
      calendar: { provider: 'binance', interval: '1d', timeZone: 'UTC', basis: 'binance_klines_default_timezone' },
    },
  });
  const { run } = engine(async () => chart, observedAt);
  await assert.rejects(run({ assets: [usdAsset({ symbol: 'COIN', market: 'crypto' })], horizon: 1, numPaths: 10 }),
    /COIN: tarihsel veri alınamadı[\s\S]*En az 6[\s\S]*Portföyün tamamı simüle edilmedi/);
});

test('Binance calibration ends at the last completed day and cached observations never mature as the clock advances', async () => {
  const observedAt = '2026-09-07T12:00:00Z';
  const chart = sourceChart(bars(100, 0.01, 7), 'crypto', {
    fetchedAt: observedAt, observedAt,
    technicalData: {
      fetchedAt: observedAt,
      calendar: { provider: 'binance', interval: '1d', timeZone: 'UTC', basis: 'binance_klines_default_timezone' },
    },
  });
  const { run, setNow } = engine(async () => chart, observedAt);
  const input = { assets: [usdAsset({ symbol: 'COIN', market: 'crypto' })], horizon: 1, numPaths: 10 };
  const initial = await run(input);
  assert.equal(initial.metadata.historyStartDate, '2026-09-01');
  assert.equal(initial.metadata.historyEndDate, '2026-09-06');
  assert.equal(initial.metadata.historicalCalendarDays, 6);
  assert.equal(initial.metadata.historicalReturnCount, 5);
  assert.equal(initial.histories[0].completion.sourceObservations, 7);
  assert.equal(initial.histories[0].completion.completedObservations, 6);
  assert.equal(initial.histories[0].completion.excludedOpenBars, 1);
  setNow('2026-09-09T12:00:00Z');
  const cached = await run(input);
  assert.equal(cached.metadata.historyEndDate, '2026-09-06', 'wall time cannot close an older open source snapshot');
  assert.equal(cached.metadata.historicalReturnCount, 5);
  assert.equal(cached.mu_d, initial.mu_d);
  assert.equal(cached.histories[0].completion.effectiveCutoffAt, '2026-09-07T12:00:00.000Z');
  assert.equal(cached.histories[0].completion.excludedOpenBars, 1);
});

test('Yahoo regular-session evidence excludes its current open day even after that cached snapshot ages', async () => {
  const observedAt = '2026-09-08T14:30:00Z';
  const chart = sourceChart(bars(100, 0.01, 8), 'us', {
    fetchedAt: observedAt, observedAt,
    currentTradingPeriod: { regular: {
      start: Date.parse('2026-09-08T13:30:00Z') / 1000,
      end: Date.parse('2026-09-08T20:00:00Z') / 1000,
    } },
  });
  const { run, setNow } = engine(async () => chart, observedAt);
  const input = { assets: [usdAsset()], horizon: 1, numPaths: 10 };
  const initial = await run(input);
  assert.equal(initial.metadata.historyEndDate, '2026-09-07');
  assert.equal(initial.histories[0].completion.completedObservations, 7);
  assert.equal(initial.histories[0].completion.excludedOpenBars, 1);
  setNow('2026-09-10T12:00:00Z');
  const cached = await run(input);
  assert.equal(cached.metadata.historyEndDate, '2026-09-07');
  assert.equal(cached.histories[0].completion.effectiveCutoffAt, '2026-09-08T14:30:00.000Z');
  assert.equal(cached.histories[0].completion.excludedOpenBars, 1);
});

test('the Monte Carlo calculation cutoff stays fixed while its awaited fetch advances the clock', async () => {
  const calculationAt = '2026-09-07T12:00:00Z';
  const fetchedAt = '2026-09-08T12:00:00Z';
  let setNow;
  const calculator = engine(async () => {
    setNow(fetchedAt);
    return sourceChart(bars(100, 0.01, 7), 'crypto', {
      fetchedAt, observedAt: fetchedAt,
      technicalData: {
        fetchedAt,
        calendar: { provider: 'binance', interval: '1d', timeZone: 'UTC', basis: 'binance_klines_default_timezone' },
      },
    });
  }, calculationAt);
  setNow = calculator.setNow;
  const result = await calculator.run({ assets: [usdAsset({ symbol: 'COIN', market: 'crypto' })], horizon: 1, numPaths: 10 });
  assert.equal(result.metadata.historyEndDate, '2026-09-06');
  assert.equal(result.histories[0].completion.cutoffAt, '2026-09-07T12:00:00.000Z');
  assert.equal(result.histories[0].completion.observedAt, '2026-09-08T12:00:00.000Z');
  assert.equal(result.histories[0].completion.effectiveCutoffAt, '2026-09-07T12:00:00.000Z');
});

test('unattested source contracts reject otherwise sufficient daily prices', async () => {
  const invalidContracts = [
    { interval: undefined }, { interval: '1h' }, { source: 'synthetic-test' },
    { currency: undefined }, { currency: '' }, { observedAt: undefined },
    { observedAt: '2026-10-20' }, { observedAt: '2026-10-20T12:00:00' },
    { timeZone: undefined }, { timeZone: 'unknown/zone' }, { dateBasis: undefined },
  ];
  for (const extra of invalidContracts) {
    const { run } = engine(async () => sourceChart(bars(100), 'us', extra));
    await assert.rejects(run({ assets: [usdAsset()], horizon: 1, numPaths: 10 }),
      /US: tarihsel veri alınamadı[\s\S]*Portföyün tamamı simüle edilmedi/);
  }
});
