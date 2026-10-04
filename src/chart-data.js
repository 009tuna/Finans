// Normalized OHLCV chart data for browser charts.
'use strict';

const util = require('./util');
const db = require('./db');
const cryptoMarketData = require('./crypto-market-data');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

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
  const observedAt = ctx.observedAt || new Date(Date.now()).toISOString();
  const timeZone = typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : null;
  let dateBasis = 'unverified';
  if (timeZone) {
    try { new Intl.DateTimeFormat('en-CA',{timeZone}).format(new Date(0)); dateBasis = 'exchange_timezone'; }
    catch (_) { /* Keep live bars accessible; estimators require a verified daily date basis. */ }
  }
  const regular = meta.currentTradingPeriod?.regular;
  const currentTradingPeriod = regular && typeof regular === 'object' ? {regular:{
    start:finite(regular.start) && regular.start > 0 ? regular.start : null,
    end:finite(regular.end) && regular.end > 0 ? regular.end : null,
    timezone:typeof regular.timezone === 'string' ? regular.timezone : null,
    gmtoffset:finite(regular.gmtoffset) ? regular.gmtoffset : null,
  }} : null;
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
      sourceTime: finite(result.timestamp[i]) ? result.timestamp[i] : null,
      open: open == null ? close : open,
      high: high == null ? close : high,
      low: low == null ? close : low,
      close,
      closeVerified: finite(q.close && q.close[i]) && q.close[i] > 0,
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
    currency: typeof meta.currency === 'string' && meta.currency.trim() ? meta.currency.trim() : null,
    name: meta.longName || meta.shortName || ctx.symbol,
    bars,
    fetchedAt: observedAt,
    observedAt, timeZone, dateBasis, currentTradingPeriod,
  };
}

function normalizeBinanceKlines(data, ctx) {
  const bars = cryptoMarketData.normalizeKlines(data);
  const observedAt = ctx.observedAt || new Date(Date.now()).toISOString();
  const calendar = {provider:'binance',interval:ctx.interval,timeZone:'UTC',basis:'binance_klines_default_timezone'};
  return {
    market: ctx.market,
    symbol: ctx.symbol,
    sourceSymbol: ctx.sourceSymbol,
    source: 'binance',
    interval: ctx.interval,
    range: null,
    currency: typeof ctx.sourceSymbol === 'string' && ctx.sourceSymbol.toUpperCase().endsWith('USDT') ? 'USDT' : null,
    name: ctx.symbol,
    bars,
    fetchedAt: observedAt,
    observedAt,
    technicalData:{status:'fresh',source:'binance',fetchedAt:observedAt,calendar},
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
  
  // 1. Supabase önbellek kontrolü (async — await şart; yoksa cache hiç tutmaz)
  const cachedEntry = await db.getCache(key);
  const cachedAge = cachedEntry && Date.now() - cachedEntry.updatedAt;
  if (cachedEntry && Number.isFinite(cachedAge) && cachedAge >= 0 && cachedAge < ttlFor(defaults.interval) &&
      (!cachedEntry.value.technicalData || cachedEntry.value.technicalData.status !== 'stale')) {
    return Object.assign({}, cachedEntry.value, { cache: 'hit' });
  }

  let value;
  try {
    if (normalizedMarket === 'crypto') {
      const result = await cryptoMarketData.fetchBars(sourceSymbol, defaults.interval, defaults.limit);
      value = {
        market: normalizedMarket, symbol: displaySymbol, sourceSymbol,
        source: 'binance',
        interval: defaults.interval, range: null, currency: 'USDT', name: displaySymbol,
        bars: result.bars, fetchedAt: result.technicalData.fetchedAt || null,
        observedAt:result.technicalData.fetchedAt || null,
        technicalData: result.technicalData,
      };
      if (result.technicalData.status === 'stale') {
        return Object.assign({}, value, { cache: 'fallback', fallback: true });
      }
    } else {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sourceSymbol) +
        '?interval=' + encodeURIComponent(defaults.interval) +
        '&range=' + encodeURIComponent(defaults.range);
      const data = await util.fetchJson(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, retries: 2 });
      if (data && data.__error) throw new Error(data.__error);
      value = normalizeYahooChart(data, {
        market: normalizedMarket,
        symbol: displaySymbol,
        sourceSymbol,
        interval: defaults.interval,
        range: defaults.range,
      });
    }

    // Supabase önbelleğe kaydet
    if (normalizedMarket !== 'crypto' || value.technicalData.status !== 'stale') await db.setCache(key, value);
    return Object.assign({}, value, { cache: 'miss' });
    
  } catch (err) {
    console.warn(`⚠️ [API Hatası] ${displaySymbol} için canlı veri çekilemedi: ${err.message}. Önbellek aranıyor...`);
    // Fallback: API başarısız olursa, süresi dolmuş olsa dahi eski veriyi dön
    if (cachedEntry) {
      console.log(`✔ [Fallback] ${displaySymbol} için önbellekten eski veri kurtarıldı.`);
      return Object.assign({}, cachedEntry.value, { cache: 'fallback', fallback: true });
    }
    // Önbellek de yoksa hatayı fırlat
    throw err;
  }
}

module.exports = {
  fetchAssetChart,
  normalizeYahooChart,
  normalizeBinanceKlines,
  resolveChartSymbol,
  chartDefaults,
};
