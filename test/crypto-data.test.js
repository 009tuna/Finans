'use strict';
const assert = require('assert');
const { createCryptoMarketData, normalizeKlines, BASE_URL } = require('../src/crypto-market-data');
const { createCryptoClient, PROVIDER_IDS } = require('../src/coingecko');
const { createCryptoHttp } = require('../src/crypto-http');

function klines(count = 25, start = 1700000000000) {
  return Array.from({ length: count }, (_, i) => [start + i * 86400000, '10', '12', '9', '11', '2']);
}
function memoryDb() {
  const rows = new Map();
  return {
    rows,
    async getCache(key, { strict } = {}) {
      if (!strict) throw Error('strict read expected');
      const row = rows.get(key);
      return row ? { value: row.value, revision: row.revision, updatedAt: Date.parse(row.revision) } : null;
    },
    async compareAndSetCache(key, value, expected) {
      const old = rows.get(key);
      if ((old ? old.revision : null) !== expected) { const e = Error('conflict'); e.statusCode = 409; throw e; }
      const revision = new Date(Date.now() + rows.size).toISOString();
      rows.set(key, { value, revision }); return revision;
    },
  };
}

(async () => {
  assert.deepEqual(PROVIDER_IDS, { render: 'render-token', dogwifhat: 'dogwifcoin' });
  assert.equal(BASE_URL, 'https://data-api.binance.vision/api/v3/klines');
  assert.throws(() => normalizeKlines([[1, 'x', 'x', 'x', 'x', 'x']]), /malformed/);
  assert.throws(() => normalizeKlines([[1700000000000, '10', '12', '9', '11', null]]), /malformed/);
  assert.throws(() => normalizeKlines([[1700000000000, '10', '12', '9', '11', '']]), /malformed/);

  let captured;
  const fakeWindowsFetch = async () => {};
  const windowsHttp = createCryptoHttp({ platform: 'win32', env: {}, windowsFetch: fakeWindowsFetch,
    fetchJson: async (_url, options) => { captured = options; return []; } });
  await windowsHttp.fetchJson('https://example.test', { retries: 2 });
  assert.equal(captured.transport, fakeWindowsFetch);
  assert.equal(captured.retries, 2);
  const cloudHttp = createCryptoHttp({ platform: 'win32', env: { VERCEL: '1' }, windowsFetch: fakeWindowsFetch,
    fetchJson: async (_url, options) => { captured = options; return []; } });
  await cloudHttp.fetchJson('https://example.test', {});
  assert.equal(Object.hasOwn(captured, 'transport'), false);

  const db = memoryDb(); let requests = [];
  const svc = createCryptoMarketData({ database: db, now: () => Date.now(), fetchJson: async (url) => { requests.push(url); return klines(); } });
  const first = await svc.fetchBars('BTCUSDT', '1d', 25);
  assert.equal(first.technicalData.status, 'fresh');
  assert.match(requests[0], /^https:\/\/data-api\.binance\.vision\/api\/v3\/klines\?symbol=BTCUSDT/);
  assert.equal(db.rows.size, 1);
  // A new service instance models a process restart and reads the durable cache.
  const restarted = createCryptoMarketData({ database: db, fetchJson: async () => { throw Error('should use cache'); } });
  assert.equal((await restarted.fetchBars('BTCUSDT', '1d', 25)).technicalData.status, 'cached');
  const cachedValue = db.rows.get('crypto-series:BTCUSDT:1d:25').value;
  cachedValue.bars.push({ time: 1709999999, open: null, high: null, low: null, close: null, volume: null });
  const validatedCache = await restarted.fetchBars('BTCUSDT', '1d', 25);
  assert.equal(validatedCache.technicalData.bars, validatedCache.bars.length, 'metadata counts only validated cached bars');
  assert.equal(validatedCache.technicalData.bars, 25);

  let time = Date.now();
  const staleDb = memoryDb();
  const good = createCryptoMarketData({ database: staleDb, now: () => time, fetchJson: async () => klines() });
  await good.fetchBars('ETHUSDT', '1d', 25);
  time += 11 * 60 * 1000;
  const offline = createCryptoMarketData({ database: staleDb, now: () => time, fetchJson: async () => { throw Error('offline'); } });
  const stale = await offline.fetchBars('ETHUSDT', '1d', 25);
  assert.equal(stale.technicalData.status, 'stale');
  assert.equal(stale.technicalData.error, 'offline');
  assert.equal(stale.bars.length, 25);
  const priorGood = staleDb.rows.get('crypto-series:ETHUSDT:1d:25').value;
  const malformed = createCryptoMarketData({ database: staleDb, now: () => time, fetchJson: async () => [[1, 'bad']] });
  const malformedFallback = await malformed.fetchBars('ETHUSDT', '1d', 25);
  assert.equal(malformedFallback.technicalData.status, 'stale');
  assert.equal(staleDb.rows.get('crypto-series:ETHUSDT:1d:25').value, priorGood);

  const short = createCryptoMarketData({ database: memoryDb(), fetchJson: async () => klines(5) });
  assert.equal((await short.fetchBars('XRPUSDT', '1d', 25)).technicalData.status, 'insufficient');
  const empty = createCryptoMarketData({ database: memoryDb(), fetchJson: async () => [] });
  const failure = await empty.fetchBars('XRPUSDT', '1d', 25).catch((e) => e);
  assert.match(failure.message, /bos/);

  let legacyArgs;
  const legacy = createCryptoMarketData({ database: memoryDb(), fetchJson: async () => { throw Error('offline'); },
    legacyRead: async (...args) => { legacyArgs = args; return { t: '2025-01-02T00:00:00.000Z', series: {
      dates: klines(25).map((k) => new Date(k[0]).toISOString().slice(0, 10)), closes: Array(25).fill(11),
      highs: Array(25).fill(12), lows: Array(25).fill(9), volumes: Array(25).fill(2),
    } }; } });
  const legacyResult = await legacy.fetchBars('ABCUSDT', '1d', 25, 'configured-asset-id');
  assert.deepEqual(legacyArgs, ['ABCUSDT', 'configured-asset-id']);
  assert.equal(legacyResult.technicalData.status, 'stale');
  assert.equal(legacyResult.technicalData.fetchedAt, '2025-01-02T00:00:00.000Z');

  const writeDb = memoryDb();
  writeDb.compareAndSetCache = async () => { throw Error('write denied'); };
  const writeFail = createCryptoMarketData({ database: writeDb, fetchJson: async () => klines() });
  const surfaced = await writeFail.fetchBars('SOLUSDT', '1d', 25);
  assert.equal(surfaced.technicalData.status, 'fresh');
  assert.match(surfaced.technicalData.cacheWarning, /write denied/);

  const readFailDb = memoryDb();
  readFailDb.getCache = async () => { throw Error('read denied'); };
  const readFail = createCryptoMarketData({ database: readFailDb, fetchJson: async () => klines() });
  const readSurfaced = await readFail.fetchBars('SOLUSDT', '1d', 25);
  assert.equal(readSurfaced.technicalData.status, 'fresh');
  assert.match(readSurfaced.technicalData.cacheWarning, /read denied/);

  const sameBarDb = memoryDb();
  const sameBars = klines(25);
  sameBarDb.rows.set('crypto-series:BTCUSDT:1d:25', { revision: '2026-01-01T00:00:00.000Z', value: {
    bars: normalizeKlines(sameBars), lastBarAt: new Date(sameBars.at(-1)[0]).toISOString(), fetchedAt: '2028-01-01T00:00:01.000Z',
  } });
  const slow = createCryptoMarketData({ database: sameBarDb, now: () => Date.parse('2028-01-01T00:00:00Z'), fetchJson: async () => sameBars });
  const kept = await slow.fetchBars('BTCUSDT', '1d', 25);
  assert.equal(sameBarDb.rows.get('crypto-series:BTCUSDT:1d:25').value.fetchedAt, '2028-01-01T00:00:01.000Z');
  assert.equal(kept.technicalData.status, 'cached');

  // Two writers start from the same revision. CAS retry must retain the later bar.
  const raceDb = memoryDb();
  let barrierResolve; const barrier = new Promise((r) => { barrierResolve = r; }); let reads = 0;
  const originalGet = raceDb.getCache;
  raceDb.getCache = async (...args) => { const out = await originalGet(...args); reads++; if (reads === 2) barrierResolve(); if (reads <= 2) await barrier; return out; };
  const older = klines(25, 1700000000000), newer = klines(25, 1710000000000);
  const a = createCryptoMarketData({ database: raceDb, fetchJson: async () => older });
  const b = createCryptoMarketData({ database: raceDb, fetchJson: async () => newer });
  await Promise.all([a.fetchBars('ADAUSDT', '1d', 25), b.fetchBars('ADAUSDT', '1d', 25)]);
  assert.equal(raceDb.rows.get('crypto-series:ADAUSDT:1d:25').value.lastBarAt, new Date(newer.at(-1)[0]).toISOString());

  // Request A starts first and finishes last; request B must win for the same candle.
  const delayedDb = memoryDb(); let tick = Date.parse('2028-01-01T00:00:00Z');
  let releaseA; const pendingA = new Promise((resolve) => { releaseA = resolve; });
  const barsA = klines(25).map((k) => [k[0], '10', '13', '9', '12', '2']);
  const barsB = klines(25).map((k) => [k[0], '10', '14', '9', '13', '2']);
  let networkCalls = 0;
  const delayed = createCryptoMarketData({ database: delayedDb, now: () => tick, fetchJson: () => (++networkCalls === 1 ? pendingA : Promise.resolve(barsB)) });
  const firstStarted = delayed.fetchBars('LINKUSDT', '1d', 25);
  await new Promise((resolve) => setImmediate(resolve));
  tick += 1000;
  const secondStarted = delayed.fetchBars('LINKUSDT', '1d', 25);
  tick += 500;
  const secondResult = await secondStarted;
  tick += 5000;
  releaseA(barsA);
  const firstResult = await firstStarted;
  const delayedWinner = delayedDb.rows.get('crypto-series:LINKUSDT:1d:25').value;
  assert.equal(delayedWinner.bars.at(-1).close, 13);
  assert.equal(firstResult.bars.at(-1).close, 13);
  assert.equal(secondResult.bars.at(-1).close, 13);
  assert.ok(Date.parse(delayedWinner.fetchedAt) > Date.parse(delayedWinner.requestStartedAt));

  let requested;
  const client = createCryptoClient({ fetcher: async (url) => {
    requested = url;
    return [
      { id: 'render-token', symbol: 'render', name: 'Render', current_price: 5 },
      { id: 'dogwifcoin', symbol: 'wif', name: 'dogwifhat', current_price: 2 },
    ];
  }, seriesFetcher: async (_pair, id) => {
    if (id === 'render') throw Error('render series offline');
    return { closes: [], highs: [], lows: [], dates: [], volumes: [], __error: 'series offline', technicalData: { status: 'unavailable', error: 'series offline' } };
  } });
  const records = await client.fetchCryptoFull(['render', 'dogwifhat']);
  assert.match(requested, /ids=render-token,dogwifcoin/);
  assert.deepEqual(records.map((r) => r.id), ['render', 'dogwifhat']);
  assert.deepEqual(records.map((r) => r.providerId), ['render-token', 'dogwifcoin']);
  assert.deepEqual(records.map((r) => r.price), [5, 2]);
  assert.deepEqual(records.map((r) => r.series.__error), ['render series offline', 'series offline']);

  const marketFailure = createCryptoClient({ fetcher: async () => { throw Error('CoinGecko 429 rate limit'); } });
  const failedMarkets = await marketFailure.fetchCryptoFull(['render', 'dogwifhat']);
  assert.deepEqual(failedMarkets.map((r) => r.__error), ['CoinGecko 429 rate limit', 'CoinGecko 429 rate limit']);
  let invalidPriceSeriesCalls = 0;
  const invalidSpot = createCryptoClient({ fetcher: async () => [
    { id: 'render-token', symbol: 'render', current_price: null },
    { id: 'dogwifcoin', symbol: 'wif', current_price: NaN },
  ], seriesFetcher: async () => { invalidPriceSeriesCalls++; return { closes: [1] }; } });
  const invalidSpotRows = await invalidSpot.fetchCryptoFull(['render', 'dogwifhat']);
  assert.equal(invalidPriceSeriesCalls, 0);
  assert.ok(invalidSpotRows.every((r) => /spot fiyati/.test(r.__error)));

  // Chart adapters surface helper stale state as fallback and never promote it to a fresh outer cache entry.
  const dbModule = require('../src/db');
  const cryptoDataModule = require('../src/crypto-market-data');
  const savedGet = dbModule.getCache, savedSet = dbModule.setCache, savedFetch = cryptoDataModule.fetchBars;
  let outerWrites = 0;
  dbModule.getCache = async () => null;
  dbModule.setCache = async () => { outerWrites++; };
  cryptoDataModule.fetchBars = async () => ({ bars: normalizeKlines(klines()), technicalData: {
    status: 'stale', source: 'supabase', fetchedAt: null, lastBarAt: '2024-01-01T00:00:00.000Z', bars: 25, error: 'offline',
  } });
  const chart = require('../src/chart-data');
  const chartValue = await chart.fetchAssetChart({ market: 'crypto', symbol: 'BTC', interval: '1d', limit: 50 });
  assert.equal(chartValue.cache, 'fallback');
  assert.equal(chartValue.fallback, true);
  assert.equal(chartValue.fetchedAt, null);
  assert.equal(outerWrites, 0);
  dbModule.getCache = savedGet; dbModule.setCache = savedSet; cryptoDataModule.fetchBars = savedFetch;
  console.log('crypto data tests passed');
})().catch((err) => { console.error(err); process.exitCode = 1; });
