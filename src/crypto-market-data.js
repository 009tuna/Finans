'use strict';

const cryptoHttp = require('./crypto-http');
const db = require('./db');

const BASE_URL = 'https://data-api.binance.vision/api/v3/klines';
const DAILY_TTL = 10 * 60 * 1000;

function positive(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function nonnegative(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeKlines(data) {
  if (!Array.isArray(data) || data.length === 0) throw new Error('Binance kline verisi bos');
  const bars = [];
  for (const k of data) {
    if (!Array.isArray(k) || k.length < 6) continue;
    const timeMs = Number(k[0]);
    const open = positive(k[1]), high = positive(k[2]), low = positive(k[3]), close = positive(k[4]);
    const volume = nonnegative(k[5]);
    if (!Number.isFinite(timeMs) || timeMs <= 0 || !open || !high || !low || !close || volume == null) continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    bars.push({ time: Math.floor(timeMs / 1000), open, high, low, close, volume });
  }
  bars.sort((a, b) => a.time - b.time);
  const unique = bars.filter((bar, i) => !i || bar.time > bars[i - 1].time);
  if (!unique.length) throw new Error('Binance OHLCV serisi malformed');
  return unique;
}

function dailySeries(bars) {
  return {
    dates: bars.map((b) => new Date(b.time * 1000).toISOString().slice(0, 10)),
    closes: bars.map((b) => b.close), highs: bars.map((b) => b.high),
    lows: bars.map((b) => b.low), volumes: bars.map((b) => b.volume),
  };
}

function validateBars(input) {
  if (!Array.isArray(input) || !input.length) throw new Error('OHLCV cache serisi bos');
  const normalized = input.map((b) => [Number(b.time) * 1000, b.open, b.high, b.low, b.close, b.volume]);
  return normalizeKlines(normalized);
}

function newer(a, b) {
  if (!a) return false;
  const aBar = Date.parse(a.lastBarAt), bBar = Date.parse(b.lastBarAt);
  if (!Number.isFinite(aBar)) return false;
  if (!Number.isFinite(bBar) || aBar !== bBar) return aBar > bBar;
  const aOrder = Date.parse(a.requestStartedAt || a.fetchedAt) || 0;
  const bOrder = Date.parse(b.requestStartedAt || b.fetchedAt) || 0;
  return aOrder > bOrder;
}

function createCryptoMarketData({ fetchJson = cryptoHttp.fetchJson, database = db, now = () => Date.now(), legacyRead = null } = {}) {
  async function read(key) { return database.getCache(key, { strict: true }); }
  async function persist(key, value) {
    let current;
    try { current = await read(key); } catch (err) { return { warning: err.message }; }
    if (current && newer(current.value, value)) return { winner: current.value };
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await database.compareAndSetCache(key, value, current ? current.revision : null);
        return {};
      } catch (err) {
        if (err.statusCode !== 409) return { warning: err.message };
        try { current = await read(key); } catch (readErr) { return { warning: readErr.message }; }
        if (current && newer(current.value, value)) return { winner: current.value };
      }
    }
    return { warning: 'Seri cache yazma cakismasi cozumlenemedi' };
  }
  async function fetchBars(symbol, interval = '1d', limit = 250, legacyId = null) {
    const requestStartedAt = new Date(now()).toISOString();
    const pair = String(symbol || '').toUpperCase();
    if (!pair) throw new Error('Binance sembol gerekli');
    const key = `crypto-series:${pair}:${interval}:${limit}`;
    let cached = null, cacheWarning = null, payload = null, cachedBars = null;
    try {
      cached = await read(key);
      payload = cached && cached.value;
      if (payload) {
        cachedBars = validateBars(payload.bars);
        payload = Object.assign({}, payload, { bars: cachedBars, lastBarAt: new Date(cachedBars[cachedBars.length - 1].time * 1000).toISOString() });
      }
    } catch (e) { cacheWarning = e.message; cached = null; payload = null; cachedBars = null; }
    const age = payload && Number.isFinite(Date.parse(payload.fetchedAt)) ? now() - Date.parse(payload.fetchedAt) : NaN;
    const fresh = payload && cachedBars && Number.isFinite(age) && age >= 0 && age < (interval === '1d' ? DAILY_TTL : 90_000);
    if (fresh) return { bars: cachedBars, technicalData: metadata(cachedBars.length < 20 ? 'insufficient' : 'cached', 'supabase', payload, cachedBars.length < 20 ? 'Indikatorler icin 20 bardan az gecerli bar' : null) };
    try {
      const url = `${BASE_URL}?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`;
      const raw = await fetchJson(url, { retries: 2 });
      if (raw && raw.__error) throw new Error(raw.__error);
      const bars = normalizeKlines(raw);
      const result = { bars, fetchedAt: new Date(now()).toISOString(), requestStartedAt, lastBarAt: new Date(bars[bars.length - 1].time * 1000).toISOString() };
      if (bars.length < 20) return { bars, technicalData: metadata('insufficient', 'binance', result, 'Indikatorler icin 20 bardan az gecerli bar') };
      const saved = await persist(key, result);
      if (saved.winner) {
        const winnerBars = validateBars(saved.winner.bars);
        return { bars: winnerBars, technicalData: metadata(winnerBars.length < 20 ? 'insufficient' : 'cached', 'supabase', saved.winner, null, cacheWarning) };
      }
      return { bars, technicalData: metadata('fresh', 'binance', result, null, saved.warning || cacheWarning) };
    } catch (err) {
      if (payload && cachedBars && cachedBars.length) {
        return { bars: cachedBars, technicalData: metadata(cachedBars.length < 20 ? 'insufficient' : 'stale', 'supabase', payload, err.message, cacheWarning) };
      }
      if (typeof legacyRead === 'function') {
        try {
          const old = await legacyRead(pair, legacyId);
          const rawBars = old && old.bars ? old.bars : old && old.series ? seriesToBars(old.series) : null;
          const bars = rawBars && validateBars(rawBars);
          if (bars && bars.length) return { bars, technicalData: metadata(bars.length < 20 ? 'insufficient' : 'stale', 'legacy-local-cache', { bars, fetchedAt: old.fetchedAt || old.t || null }, err.message, cacheWarning || 'Legacy cache is read-only') };
        } catch (_) {}
      }
      throw err;
    }
  }
  return { fetchBars };
}

function seriesToBars(series) {
  if (!series || !Array.isArray(series.dates)) return null;
  return series.dates.map((date, i) => ({ time: Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000), open: series.closes[i], high: series.highs[i], low: series.lows[i], close: series.closes[i], volume: series.volumes && series.volumes[i] != null ? series.volumes[i] : 0 }));
}
function metadata(status, source, payload, error, cacheWarning) {
  const bars = payload.bars || [];
  return { status, source, fetchedAt: payload.fetchedAt || null, lastBarAt: payload.lastBarAt || (bars.length ? new Date(bars[bars.length - 1].time * 1000).toISOString() : null), bars: bars.length, error: error || null, ...(cacheWarning ? { cacheWarning } : {}) };
}

const defaultService = createCryptoMarketData();
module.exports = { BASE_URL, DAILY_TTL, normalizeKlines, validateBars, dailySeries, createCryptoMarketData, fetchBars: defaultService.fetchBars };
