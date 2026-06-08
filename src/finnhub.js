// ABD hisseleri için Finnhub'ın benzersiz katkısı: analist konsensüsü + temel veriler
// (F/K, beta, piyasa değeri, sektör, logo). Fiyat ve OHLC serisi Yahoo'dan gelir.
'use strict';
const { fetchJson, mapLimit } = require('./util');
const BASE = 'https://finnhub.io/api/v1';

async function fetchFundamentals(symbol, token) {
  const q = '&token=' + token;
  const [metric, rec, profile] = await Promise.all([
    fetchJson(BASE + '/stock/metric?symbol=' + symbol + '&metric=all' + q),
    fetchJson(BASE + '/stock/recommendation?symbol=' + symbol + q),
    fetchJson(BASE + '/stock/profile2?symbol=' + symbol + q),
  ]);
  const m = (metric && metric.metric) || {};
  const latestRec = Array.isArray(rec) && rec.length ? rec[0] : null;
  return {
    symbol,
    name: (profile && profile.name) || null,
    logo: (profile && profile.logo) || null,
    industry: (profile && profile.finnhubIndustry) || null,
    marketCap: profile && profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null, // milyon $ -> ham $
    beta: m['beta'] != null ? m['beta'] : null,
    pe: m['peTTM'] != null ? m['peTTM'] : (m['peBasicExclExtraTTM'] != null ? m['peBasicExclExtraTTM'] : null),
    eps: m['epsTTM'] != null ? m['epsTTM'] : null,
    roe: m['roeTTM'] != null ? m['roeTTM'] : null,
    dividendYield: m['dividendYieldIndicatedAnnual'] != null ? m['dividendYieldIndicatedAnnual'] : null,
    analyst: latestRec
      ? {
          strongBuy: latestRec.strongBuy,
          buy: latestRec.buy,
          hold: latestRec.hold,
          sell: latestRec.sell,
          strongSell: latestRec.strongSell,
          period: latestRec.period,
        }
      : null,
  };
}

async function fetchManyFundamentals(symbols, token) {
  return mapLimit(symbols, 4, (s) =>
    fetchFundamentals(s, token).catch((e) => ({ symbol: s, __error: String((e && e.message) || e) }))
  );
}

module.exports = { fetchFundamentals, fetchManyFundamentals };
