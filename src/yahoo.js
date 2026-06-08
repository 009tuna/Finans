// Yahoo Finance v8 grafik ucu — hem ABD hem BIST için tam OHLCV serisi döndürür.
// (İndikatörler tek fiyatla değil, fiyat serisiyle hesaplandığı için seri şart.)
'use strict';
const { fetchJson, mapLimit } = require('./util');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

// symbol: tam Yahoo sembolü (örn. "AAPL" ya da "THYAO.IS")
async function fetchSeries(symbol) {
  const data = await fetchJson(
    'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=1y',
    { headers: { 'User-Agent': UA, Accept: 'application/json' } }
  );
  const r = data && data.chart && data.chart.result && data.chart.result[0];
  if (!r || !r.meta) return { symbol, __error: (data && data.__error) || 'veri yok' };
  const meta = r.meta;
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  // Aynı indeksleri koruyarak boşlukları temizle
  const closesRaw = q.close || [];
  const closes = [];
  const highs = [];
  const lows = [];
  const volumes = [];
  for (let i = 0; i < closesRaw.length; i++) {
    if (typeof closesRaw[i] === 'number') {
      closes.push(closesRaw[i]);
      highs.push(typeof q.high[i] === 'number' ? q.high[i] : closesRaw[i]);
      lows.push(typeof q.low[i] === 'number' ? q.low[i] : closesRaw[i]);
      volumes.push(typeof q.volume[i] === 'number' ? q.volume[i] : 0);
    }
  }
  const last = meta.regularMarketPrice != null ? meta.regularMarketPrice : (closes.length ? closes[closes.length - 1] : null);
  // Günlük değişim: serideki bir önceki kapanışa göre.
  // (meta.chartPreviousClose 1y aralıkta bir yıl önceki kapanışı verdiğinden kullanılamaz.)
  const prevDay = closes.length >= 2 ? closes[closes.length - 2] : meta.previousClose != null ? meta.previousClose : null;
  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency || null,
    price: last != null ? last : null,
    quoteTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    prevClose: prevDay,
    change: last != null && prevDay != null ? last - prevDay : null,
    changePct: last != null && prevDay ? ((last - prevDay) / prevDay) * 100 : null,
    dayHigh: meta.regularMarketDayHigh != null ? meta.regularMarketDayHigh : null,
    dayLow: meta.regularMarketDayLow != null ? meta.regularMarketDayLow : null,
    high52: meta.fiftyTwoWeekHigh != null ? meta.fiftyTwoWeekHigh : null,
    low52: meta.fiftyTwoWeekLow != null ? meta.fiftyTwoWeekLow : null,
    volume: meta.regularMarketVolume != null ? meta.regularMarketVolume : null,
    series: { closes, highs, lows, volumes },
  };
}

async function fetchManySeries(symbols, toYahoo) {
  return mapLimit(symbols, 4, (s) =>
    fetchSeries(toYahoo ? toYahoo(s) : s).catch((e) => ({ symbol: s, __error: String((e && e.message) || e) }))
  );
}

module.exports = { fetchSeries, fetchManySeries };
