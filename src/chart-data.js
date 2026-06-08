// Normalized OHLCV chart data for browser charts.
'use strict';

const { fetchJson } = require('./util');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const cache = new Map();

const YAHOO_INTERVALS = new Set(['1d', '1h', '30m', '15m', '5m']);
const YAHOO_RANGES = new Set(['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']);
const BINANCE_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function resolveChartSymbol(market, symbol) {
  const raw = String(symbol || '').trim();
  if (!raw) return '';
  if (market === 'bist') return raw.toUpperCase().endsWith('.IS') ? raw.toUpperCase() : raw.toUpperCase() + '.IS';
  if (market === 'crypto') {
    const s = raw.toUpperCase();
    return s.endsWith('USDT') ? s : s + 'USDT';
  }
  return raw.toUpperCase();
}

function chartDefaults(market, interval, range, limit) {
  const normalizedMarket = String(market || '').toLowerCase();
  const out = {
    market: normalizedMarket,
    interval: interval || (normalizedMarket === 'crypto' ? '1h' : '1d'),
    range: range || '1y',
    limit: Math.max(50, Math.min(1000, parseInt(limit || 500, 10) || 500)),
  };
  if (normalizedMarket === 'crypto') {
    if (!BINANCE_INTERVALS.has(out.interval)) out.interval = '1h';
  } else {
    if (!YAHOO_INTERVALS.has(out.interval)) out.interval = '1d';
    if (!YAHOO_RANGES.has(out.range)) out.range = out.interval === '1d' ? '1y' : '5d';
  }
  return out;
}

function normalizeYahooChart(data, ctx) {
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.timestamp) {
    throw new Error((data && data.__error) || 'Yahoo chart verisi yok');
  }
  const meta = result.meta || {};
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = num(q.close && q.close[i]);
    if (close == null) continue;
    const open = num(q.open && q.open[i]);
    const high = num(q.high && q.high[i]);
    const low = num(q.low && q.low[i]);
    const volume = num(q.volume && q.volume[i]);
    bars.push({
      time: Math.floor(result.timestamp[i]),
      open: open == null ? close : open,
      high: high == null ? close : high,
      low: low == null ? close : low,
      close,
      volume: volume == null ? 0 : volume,
    });
  }
  if (!bars.length) throw new Error('Yahoo OHLCV serisi bos');
  return {
    market: ctx.market,
    symbol: ctx.symbol,
    sourceSymbol: ctx.sourceSymbol,
    source: 'yahoo',
    interval: ctx.interval,
    range: ctx.range,
    currency: meta.currency || (ctx.market === 'bist' ? 'TRY' : 'USD'),
    name: meta.longName || meta.shortName || ctx.symbol,
    bars,
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeBinanceKlines(data, ctx) {
  if (!Array.isArray(data) || !data.length) throw new Error('Binance kline verisi yok');
  const bars = data.map((k) => ({
    time: Math.floor(num(k[0]) / 1000),
    open: num(k[1]),
    high: num(k[2]),
    low: num(k[3]),
    close: num(k[4]),
    volume: num(k[5]),
  })).filter((b) => finite(b.time) && finite(b.open) && finite(b.high) && finite(b.low) && finite(b.close));
  if (!bars.length) throw new Error('Binance OHLCV serisi bos');
  return {
    market: ctx.market,
    symbol: ctx.symbol,
    sourceSymbol: ctx.sourceSymbol,
    source: 'binance',
    interval: ctx.interval,
    range: null,
    currency: 'USD',
    name: ctx.symbol,
    bars,
    fetchedAt: new Date().toISOString(),
  };
}

function ttlFor(interval) {
  return interval === '1d' || interval === '1w' ? 10 * 60 * 1000 : 90 * 1000;
}

async function fetchAssetChart({ market, symbol, interval, range, limit }) {
  const defaults = chartDefaults(market, interval, range, limit);
  const normalizedMarket = defaults.market;
  if (!['us', 'bist', 'crypto'].includes(normalizedMarket)) throw new Error('Gecersiz pazar');
  const sourceSymbol = resolveChartSymbol(normalizedMarket, symbol);
  if (!sourceSymbol) throw new Error('Sembol gerekli');

  const displaySymbol = normalizedMarket === 'bist'
    ? sourceSymbol.replace(/\.IS$/, '')
    : normalizedMarket === 'crypto'
      ? sourceSymbol.replace(/USDT$/, '')
      : sourceSymbol;

  const key = [normalizedMarket, displaySymbol, defaults.interval, defaults.range, defaults.limit].join(':');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.t < ttlFor(defaults.interval)) {
    return Object.assign({}, cached.value, { cache: 'hit' });
  }

  let value;
  if (normalizedMarket === 'crypto') {
    const url = 'https://data-api.binance.vision/api/v3/klines?symbol=' +
      encodeURIComponent(sourceSymbol) + '&interval=' + encodeURIComponent(defaults.interval) +
      '&limit=' + defaults.limit;
    const data = await fetchJson(url, { retries: 2 });
    if (data && data.__error) throw new Error(data.__error);
    value = normalizeBinanceKlines(data, {
      market: normalizedMarket,
      symbol: displaySymbol,
      sourceSymbol,
      interval: defaults.interval,
    });
  } else {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sourceSymbol) +
      '?interval=' + encodeURIComponent(defaults.interval) +
      '&range=' + encodeURIComponent(defaults.range);
    const data = await fetchJson(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, retries: 2 });
    if (data && data.__error) throw new Error(data.__error);
    value = normalizeYahooChart(data, {
      market: normalizedMarket,
      symbol: displaySymbol,
      sourceSymbol,
      interval: defaults.interval,
      range: defaults.range,
    });
  }

  cache.set(key, { t: Date.now(), value });
  return Object.assign({}, value, { cache: 'miss' });
}

module.exports = {
  fetchAssetChart,
  normalizeYahooChart,
  normalizeBinanceKlines,
  resolveChartSymbol,
  chartDefaults,
};
