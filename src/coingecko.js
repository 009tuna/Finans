// CoinGecko supplies spot/market fields; Binance supplies durable OHLCV history.
'use strict';
const fs = require('fs');
const path = require('path');
const { mapLimit } = require('./util');
const cryptoHttp = require('./crypto-http');
const marketData = require('./crypto-market-data');
const BASE = 'https://api.coingecko.com/api/v3';
const LEGACY_CACHE = path.join(__dirname, '..', 'data', 'crypto-series-cache.json');
const PROVIDER_IDS = { render: 'render-token', dogwifhat: 'dogwifcoin' };

function readLegacy(pair, configuredId) {
  try {
    const cache = JSON.parse(fs.readFileSync(LEGACY_CACHE, 'utf8'));
    const entry = configuredId && cache[configuredId];
    return entry || null;
  } catch (_) { return null; }
}
const service = marketData.createCryptoMarketData({ legacyRead: readLegacy });

async function fetchMarkets(providerIds, fetcher = cryptoHttp.fetchJson) {
  const url = BASE + '/coins/markets?vs_currency=usd&ids=' + providerIds.map(encodeURIComponent).join(',') +
    '&order=market_cap_desc&price_change_percentage=24h,7d,30d';
  const data = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (data && data.__error) throw new Error(data.__error);
  if (!Array.isArray(data)) return null;
  const map = {};
  data.forEach((c) => { map[c.id] = {
    symbol: (c.symbol || '').toUpperCase(), name: c.name, logo: c.image,
    price: c.current_price, quoteTime: c.last_updated || null,
    marketCap: c.market_cap, rank: c.market_cap_rank, volume: c.total_volume,
    high24: c.high_24h, low24: c.low_24h, changePct: c.price_change_percentage_24h,
    change7d: c.price_change_percentage_7d_in_currency,
    change30d: c.price_change_percentage_30d_in_currency,
    ath: c.ath, athChangePct: c.ath_change_percentage,
  }; });
  return map;
}

async function fetchSeries(binSym, configuredId) {
  try {
    const result = await service.fetchBars(binSym, '1d', 250, configuredId);
    return Object.assign(marketData.dailySeries(result.bars, result.technicalData.calendar), {
      technicalData: result.technicalData, quoteCurrency: String(binSym).toUpperCase().endsWith('USDT') ? 'USDT' : null
    });
  } catch (err) {
    return { dates: [], closes: [], highs: [], lows: [], volumes: [], __error: err.message,
      technicalData: { status: 'unavailable', source: null, fetchedAt: null, lastBarAt: null, bars: 0, error: err.message } };
  }
}

function binanceSymbol(base) { return (base.symbol || '').toUpperCase() + 'USDT'; }

function unavailableSeries(error) {
  const message = String(error && error.message || error || 'Seri verisi alinamadi');
  return { dates: [], closes: [], highs: [], lows: [], volumes: [], __error: message,
    technicalData: { status: 'unavailable', source: null, fetchedAt: null, lastBarAt: null, bars: 0, error: message } };
}

function createCryptoClient({ fetcher = cryptoHttp.fetchJson, seriesFetcher = fetchSeries, limit = mapLimit } = {}) {
  return { async fetchCryptoFull(ids) {
    const providerIds = ids.map((id) => PROVIDER_IDS[id] || id);
    let markets, marketError = null;
    try { markets = await fetchMarkets(providerIds, fetcher); } catch (err) { marketError = err.message; markets = null; }
    if (!markets) return ids.map((id) => ({ id, providerId: PROVIDER_IDS[id] || id, symbol: id, __error: marketError || 'CoinGecko markets yaniti gecerli degil' }));
    return limit(ids, 6, async (id) => {
      const providerId = PROVIDER_IDS[id] || id, base = markets[providerId];
      if (!base) return { id, providerId, symbol: id, __error: 'piyasa verisi yok' };
      const spotPrice = typeof base.price === 'number' ? base.price : Number(base.price);
      if (base.price == null || base.price === '' || !Number.isFinite(spotPrice) || spotPrice <= 0) {
        return Object.assign({ id, providerId }, base, { __error: 'CoinGecko spot fiyati yok veya gecersiz' });
      }
      let series;
      try { series = await seriesFetcher(binanceSymbol(base), id); } catch (err) { series = unavailableSeries(err); }
      if (!series || series.__error && !series.technicalData) series = unavailableSeries(series && series.__error || 'Seri verisi alinamadi');
      return Object.assign({ id, providerId }, base, { series, technicalData: series.technicalData });
    });
  } };
}

const fetchCryptoFull = createCryptoClient().fetchCryptoFull;

module.exports = { fetchCryptoFull, fetchSeries, fetchMarkets, PROVIDER_IDS, createCryptoClient };
