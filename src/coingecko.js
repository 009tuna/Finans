// Kripto — hibrit kaynak:
//  • CoinGecko markets ucu: canlı fiyat/piyasa değeri/24s-7g-30g/ATH (1 çağrı, taze).
//  • Binance klines: indikatör için 250 günlük OHLCV serisi (bol limitli, yüksek/düşük dahil).
// Seri 6 saat önbelleklenir (günlük mumlar gün içinde değişmez).
'use strict';
const fs = require('fs');
const path = require('path');
const { fetchJson, mapLimit } = require('./util');
const BASE = 'https://api.coingecko.com/api/v3';
const CACHE_FILE = path.join(__dirname, '..', 'data', 'crypto-series-cache.json');
const TTL = 6 * 3600 * 1000;

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveCache(c) {
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(c)); } catch (e) {}
}

async function fetchMarkets(ids) {
  const url =
    BASE + '/coins/markets?vs_currency=usd&ids=' + ids.join(',') +
    '&order=market_cap_desc&price_change_percentage=24h,7d,30d';
  const data = await fetchJson(url, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(data)) return null;
  const map = {};
  data.forEach((c) => {
    map[c.id] = {
      id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, logo: c.image,
      price: c.current_price, quoteTime: c.last_updated || null,
      marketCap: c.market_cap, rank: c.market_cap_rank, volume: c.total_volume,
      high24: c.high_24h, low24: c.low_24h,
      changePct: c.price_change_percentage_24h,
      change7d: c.price_change_percentage_7d_in_currency,
      change30d: c.price_change_percentage_30d_in_currency,
      ath: c.ath, athChangePct: c.ath_change_percentage,
    };
  });
  return map;
}

// Binance günlük OHLCV serisi. binSym örn. "BTCUSDT"
async function fetchSeries(binSym) {
  const data = await fetchJson('https://api.binance.com/api/v3/klines?symbol=' + binSym + '&interval=1d&limit=250', { retries: 3 });
  if (!Array.isArray(data) || !data.length) return null;
  return {
    dates: data.map((k) => new Date(k[0]).toISOString().slice(0, 10)),
    closes: data.map((k) => parseFloat(k[4])),
    highs: data.map((k) => parseFloat(k[2])),
    lows: data.map((k) => parseFloat(k[3])),
    volumes: data.map((k) => parseFloat(k[5])),
  };
}

// CoinGecko id -> Binance işlem çifti (çoğu büyük coin SYMBOL+USDT)
function binanceSymbol(base) {
  return (base.symbol || '').toUpperCase() + 'USDT';
}

async function fetchCryptoFull(ids) {
  const markets = await fetchMarkets(ids);
  if (!markets) return ids.map((id) => ({ id, symbol: id, __error: 'CoinGecko erişilemedi (markets)' }));
  const cache = loadCache();
  const now = Date.now();
  const out = await mapLimit(ids, 6, async (id) => {
    const base = markets[id] || { id, symbol: id, __error: 'piyasa verisi yok' };
    if (base.__error) return base;
    let series = null;
    const cached = cache[id];
    if (cached && cached.series && now - new Date(cached.t).getTime() < TTL) {
      series = cached.series; // taze önbellek
    } else {
      series = await fetchSeries(binanceSymbol(base)).catch(() => null);
      if (series) cache[id] = { t: new Date().toISOString(), series };
      else if (cached && cached.series) series = cached.series; // hata olursa eski seri
    }
    return Object.assign({}, base, { series: series || { closes: [], highs: [], lows: [], volumes: [] } });
  });
  saveCache(cache);
  return out;
}

module.exports = { fetchCryptoFull, fetchSeries };
