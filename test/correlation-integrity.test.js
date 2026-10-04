'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/forecast.js'), 'utf8');
const observedAt = '2026-10-20T12:00:00.000Z';
const firstDay = Date.parse('2026-08-03T00:00:00Z') / 1000;
const days = (count = 31, offset = 0) => Array.from({ length: count }, (_, index) => firstDay + (offset + index) * 86400);
const pattern = index => ((index % 7) - 3) * 0.003;
const asset = (symbol = 'A', market = 'us', extra = {}) => ({ market, symbol, ...extra });
function bars(times = days(), returnAt = pattern, initialPrice = 100) {
  let price = initialPrice;
  return times.map((time, index) => {
    if (index) price *= 1 + returnAt(index - 1);
    return { time, close: price };
  });
}
function chart(series = bars(), extra = {}) {
  const market = extra.market || 'us';
  const fetchedAt = extra.fetchedAt || observedAt;
  if (market === 'crypto') {
    return {
      bars: series.map(bar => ({
        ...bar, openTime: bar.time * 1000,
        closeTime: bar.time * 1000 + 86400000 - 1, closeTimeProvided: true,
      })),
      market, interval: '1d', source: 'binance', sourceSymbol: 'fixture', currency: 'USDT',
      fetchedAt,
      technicalData: {
        calendar: { provider: 'binance', interval: '1d', timeZone: 'UTC', basis: 'binance_klines_default_timezone' },
        fetchedAt,
      },
      ...extra,
    };
  }
  // The fixture's UTC-midnight dates represent exchange calendar dates.
  // At 14:00Z both supported exchanges are on that date; malformed values stay malformed.
  return {
    bars: series.map(bar => ({ ...bar, time: typeof bar.time === 'number' ? bar.time + 14 * 3600 : bar.time })),
    market, interval: '1d', source: 'yahoo', sourceSymbol: 'fixture',
    currency: market === 'bist' ? 'TRY' : 'USD', fetchedAt, observedAt: fetchedAt,
    dateBasis: 'exchange_timezone', timeZone: market === 'bist' ? 'Europe/Istanbul' : 'America/New_York',
    ...extra,
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

function observedChart(series, market, timestamp, extra = {}) {
  const date = timestamp.slice(0, 10);
  return chart(series, {
    market, fetchedAt: timestamp,
    currentTradingPeriod: market === 'us' ? { regular: {
      start: Date.parse(date + 'T13:30:00Z') / 1000,
      end: Date.parse(date + 'T20:00:00Z') / 1000,
    } } : undefined,
    ...extra,
  });
}

function engine(fetchChart = async ({ market }) => chart(undefined, { market }), now = observedAt) {
  const calls = [];
  let calculationTime = Date.parse(now);
  class CalculationDate extends Date {
    constructor(...args) { super(...(args.length ? args : [calculationTime])); }
    static now() { return calculationTime; }
  }
  const context = vm.createContext({
    module: { exports: {} }, console, Date: CalculationDate,
    require: name => {
      if (name === './daily-history') return require('../src/daily-history');
      assert.equal(name, './chart-data', 'correlation tests must not load network dependencies');
      return { fetchAssetChart: async params => { calls.push(params); return fetchChart(params); } };
    },
  });
  vm.runInContext(source, context, { filename: 'src/forecast.js' });
  return {
    run: context.module.exports.calculateCorrelationMatrix, calls,
    setNow: value => { calculationTime = Date.parse(value); },
  };
}

test('30 matching observed return intervals produce a symmetric correlation matrix and provenance', async () => {
  const { run, calls } = engine(async ({ symbol, market }) => chart(bars(days(), index => (symbol === 'B' ? -1 : 1) * pattern(index)), { market }));
  const result = await run({ assets: [asset('A'), asset('B', 'crypto')] });
  assert.deepEqual(plain(result.matrix), [[1, -1], [-1, 1]]);
  assert.equal(result.sampleCount, 30);
  assert.deepEqual(plain(result.metadata), {
    observationCount: 30, startDate: '2026-08-03', endDate: '2026-09-02',
    returnBasis: 'native_currency', minimumObservations: 30,
    stablecoinFxMode: 'fixed_ratio_not_modeled',
  });
  assert.deepEqual(plain(result.assets), [{ market: 'us', symbol: 'A' }, { market: 'crypto', symbol: 'B' }]);
  assert.equal(result.identities[0].label, 'ABD · A');
  assert.equal(result.histories[0].source, 'yahoo');
  assert.equal(result.histories[0].sourceSymbol, 'fixture');
  assert.equal(result.histories[0].fetchedAt, observedAt);
  assert.equal(result.histories[0].barCount, 31);
  assert.equal(result.returnIntervals.length, 30);
  assert.ok(result.returnIntervals.every(interval => interval.calendarDays === 1));
  assert.ok(calls.every(call => call.interval === '1d' && call.range === '1y'));
});

test('future/current prices and position quantities never change historical correlation', async () => {
  const { run } = engine();
  const baseline = await run({ assets: [asset('A'), asset('B')] });
  const changed = await run({ assets: [asset('A', 'us', { price: 1e100, amount: -1000 }), asset('B', 'us', { price: NaN, amount: null })] });
  assert.deepEqual(plain(changed), plain(baseline));
});

test('identical symbols in separate markets remain separate identified series', async () => {
  const { run } = engine(async ({ market }) => chart(bars(days(), index => (market === 'bist' ? -1 : 1) * pattern(index)), { market }));
  const result = await run({ assets: [asset('SAME', 'us'), asset('SAME', 'bist')] });
  assert.deepEqual(plain(result.identities.map(identity => identity.id)), ['us:SAME', 'bist:SAME']);
  assert.deepEqual(plain(result.identities.map(identity => identity.label)), ['ABD · SAME', 'BIST · SAME']);
  assert.deepEqual(plain(result.matrix), [[1, -1], [-1, 1]]);
  assert.equal(result.histories[1].currency, 'TRY', 'returns stay in their observed native currency');
});

test('different trading calendars compare only exact observed endpoint pairs', async () => {
  const allDays = days(65);
  const weekdays = allDays.filter(time => ![0, 6].includes(new Date(time * 1000).getUTCDay()));
  const { run } = engine(async ({ market }) => chart(bars(market === 'crypto' ? allDays : weekdays), { market }));
  const result = await run({ assets: [asset('STOCK'), asset('COIN', 'crypto')] });
  const stockIntervals = weekdays.slice(1).map((end, index) => ({ start: weekdays[index], end }));
  const oneDayStockIntervals = stockIntervals.filter(interval => interval.end - interval.start === 86400);
  assert.equal(result.sampleCount, oneDayStockIntervals.length);
  assert.ok(result.sampleCount >= 30);
  assert.ok(result.returnIntervals.every(interval => interval.calendarDays === 1), 'stock Fri–Mon cannot be compared with crypto Sun–Mon');
  assert.equal(result.returnIntervals.some(interval => interval.start === '2026-08-07' && interval.end === '2026-08-10'), false);
  assert.equal(result.returnIntervals.some(interval => interval.start === '2026-08-09' && interval.end === '2026-08-10'), false);
});

test('matching multi-day observed intervals are retained and disclosed when both markets share them', async () => {
  const weekdays = days(65).filter(time => ![0, 6].includes(new Date(time * 1000).getUTCDay()));
  const { run } = engine(async ({ market }) => chart(bars(weekdays), { market }));
  const result = await run({ assets: [asset('A'), asset('B', 'bist')] });
  assert.equal(result.sampleCount, weekdays.length - 1);
  assert.ok(result.returnIntervals.some(interval => interval.calendarDays === 3));
  assert.deepEqual(plain(result.matrix), [[1, 1], [1, 1]]);
});

test('unobserved or malformed history fails the entire requested matrix', async () => {
  const malformedCharts = [
    null, {}, chart([]), chart(bars(days(30))), chart(bars(), { interval: '1h' }),
    chart(bars(), { source: 'synthetic-test' }), chart(bars(), { currency: null }),
    chart(bars(), { observedAt: null }), chart(bars(), { dateBasis: 'utc' }),
    chart(bars(), { timeZone: 'Unverified/Exchange' }),
    chart(bars().map((bar, index) => index === 0 ? { ...bar, close: 0 } : bar)),
    chart(bars().map((bar, index) => index === 0 ? { ...bar, close: '100' } : bar)),
    chart(bars().map((bar, index) => index === 0 ? { ...bar, time: NaN } : bar)),
    chart(bars().map((bar, index) => index === 0 ? { ...bar, time: '12345' } : bar)),
    chart(bars().map((bar, index) => index === 1 ? { ...bar, time: firstDay + 10 } : bar)),
  ];
  for (const malformed of malformedCharts) {
    const { run } = engine(async ({ symbol }) => symbol === 'BAD' ? malformed : chart());
    await assert.rejects(run({ assets: [asset('GOOD'), asset('BAD')] }), /ABD · BAD: tarihsel veri alınamadı[\s\S]*Matrisin tamamı hesaplanamadı/);
  }
  const { run } = engine(async ({ symbol }) => {
    if (symbol === 'BAD') throw new Error('provider unavailable');
    return chart();
  });
  await assert.rejects(run({ assets: [asset('GOOD'), asset('BAD')] }), /provider unavailable[\s\S]*Matrisin tamamı hesaplanamadı/);
});

test('zero variance is unknown instead of a fabricated zero correlation', async () => {
  const { run } = engine(async ({ symbol }) => chart(bars(days(), symbol === 'FLAT' ? () => 0 : pattern)));
  const result = await run({ assets: [asset('FLAT'), asset('VARIABLE')] });
  assert.deepEqual(plain(result.matrix), [[null, null], [null, 1]]);
  assert.deepEqual(plain(result.zeroVarianceIds), ['us:FLAT']);
  assert.deepEqual(plain(result.undefinedPairs), [{ rowId: 'us:FLAT', colId: 'us:VARIABLE', reason: 'zero_variance' }]);
  assert.equal(result.sampleCount, 30);
});

test('numerical noise in constant compounded returns does not create a spurious relation', async () => {
  const { run } = engine(async ({ symbol }) => chart(bars(days(), symbol === 'FIXED' ? () => 0.01 : pattern)));
  const result = await run({ assets: [asset('FIXED'), asset('VARIABLE')] });
  assert.equal(result.matrix[0][1], null);
  assert.deepEqual(plain(result.zeroVarianceIds), ['us:FIXED']);
});

test('29 common intervals are explicitly insufficient even when both histories have 31 endpoints', async () => {
  const { run } = engine(async ({ symbol }) => chart(bars(days(31, symbol === 'B' ? 1 : 0))));
  await assert.rejects(run({ assets: [asset('A'), asset('B')] }), /en az 30 ortak gözlenen getiri aralığı gerekir; mevcut: 29/);
});

test('29 completed return intervals plus an open current-day bar cannot satisfy the threshold', async () => {
  const snapshotAt = '2026-09-02T14:30:00.000Z';
  for (const market of ['us', 'crypto']) {
    const snapshot = observedChart(bars(days(31)), market, snapshotAt);
    const { run } = engine(async () => snapshot, snapshotAt);
    await assert.rejects(
      run({ assets: [asset('A', market), asset('B', market)] }),
      /En az 31 ayrı günlük kapanış gerekir[\s\S]*Matrisin tamamı hesaplanamadı/,
      market + ': the open observation must not create the thirtieth return interval',
    );
  }
});

test('sufficient history excludes the open current day and ends on the last completed date', async () => {
  const snapshotAt = '2026-09-03T14:30:00.000Z';
  for (const market of ['us', 'crypto']) {
    const snapshot = observedChart(bars(days(32)), market, snapshotAt);
    const { run } = engine(async () => snapshot, snapshotAt);
    const result = await run({ assets: [asset('A', market), asset('B', market)] });
    assert.equal(result.sampleCount, 30);
    assert.equal(result.intervalEnd, '2026-09-02');
    assert.equal(result.metadata.endDate, '2026-09-02');
    assert.ok(result.returnIntervals.every(interval => interval.end < '2026-09-03'));
    for (const history of result.histories) {
      assert.equal(history.barCount, 31);
      assert.equal(history.endDate, '2026-09-02');
      assert.equal(history.completion.sourceObservations, 32);
      assert.equal(history.completion.completedObservations, 31);
      assert.equal(history.completion.excludedOpenBars, 1);
      assert.equal(history.completion.excludedUnverifiedBars, 0);
      assert.equal(history.completion.effectiveCutoffAt, snapshotAt);
    }
  }
});

test('advancing the calculation clock never promotes an open bar from an old cached observation', async () => {
  const snapshotAt = '2026-09-03T14:30:00.000Z';
  const laterAt = '2026-09-04T14:30:00.000Z';
  for (const market of ['us', 'crypto']) {
    const cached = observedChart(bars(days(32)), market, snapshotAt, { cache: 'fallback', fallback: true });
    let currentSnapshot = cached;
    const { run, setNow } = engine(async () => currentSnapshot, snapshotAt);
    const assets = [asset('A', market), asset('B', market)];
    const original = await run({ assets });
    setNow(laterAt);
    const later = await run({ assets });
    assert.deepEqual(plain(later.matrix), plain(original.matrix));
    assert.deepEqual(plain(later.returnIntervals), plain(original.returnIntervals));
    assert.equal(later.sampleCount, 30);
    assert.equal(later.intervalEnd, '2026-09-02');
    for (const history of later.histories) {
      assert.equal(history.completion.cutoffAt, laterAt);
      assert.equal(history.completion.observedAt, snapshotAt);
      assert.equal(history.completion.effectiveCutoffAt, snapshotAt);
      assert.equal(history.completion.excludedOpenBars, 1);
    }
    // A new provider snapshot supplies the finalized close, not merely a later clock.
    const finalized = bars(days(32)).map((bar, index) => index === 31 ? { ...bar, close: bar.close * 1.05 } : bar);
    currentSnapshot = observedChart(finalized, market, laterAt, { cache: 'miss' });
    const refreshed = await run({ assets });
    assert.equal(refreshed.sampleCount, 31);
    assert.equal(refreshed.intervalEnd, '2026-09-03');
    assert.ok(refreshed.histories.every(history => history.completion.completedObservations === 32));
  }
});

test('non-overlapping histories reject an empty intersection instead of manufacturing aligned prices', async () => {
  const { run } = engine(async ({ symbol }) => chart(bars(days(31, symbol === 'B' ? 40 : 0))));
  await assert.rejects(run({ assets: [asset('A'), asset('B')] }), /ortak gözlenen getiri aralığı[\s\S]*mevcut: 0/);
});

test('empty, single, duplicate and invalid identities fail before fetching data', async () => {
  const { run, calls } = engine();
  for (const assets of [undefined, null, [], [asset('A')]]) {
    await assert.rejects(run({ assets }), /en az 2 farklı piyasa\/sembol/);
  }
  await assert.rejects(run({ assets: [asset('A'), asset(' a ')] }), /aynı piyasa\/sembol/);
  for (const bad of [null, asset(''), asset('A', 'unknown'), { market: 'us', symbol: 1 }]) {
    await assert.rejects(run({ assets: [asset('GOOD'), bad] }), /geçerli piyasa ve sembol/);
  }
  assert.equal(calls.length, 0);
});
