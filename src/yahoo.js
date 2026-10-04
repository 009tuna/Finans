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
  // This is the actual retrieval cut, not the quote time or a cache-read time.
  return normalizeSeries(data, symbol, { observedAt: new Date(Date.now()).toISOString() });
}

function normalizeSeries(data, symbol, { observedAt = null } = {}) {
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
  const dates = [];
  const sourceTimestamps = [];
  const rangeVerified = [];
  const volumeVerified = [];
  let dateFormatter = null;
  const timeZone = typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : null;
  if (timeZone) {
    try { dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch (_) { /* An unknown exchange timezone cannot attest a daily bar date. */ }
  }
  const preciseTime = (value) => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
  const sourceObservedAt = preciseTime(observedAt) ? observedAt : null;
  const sourceRegular = meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
  // Preserve provider session boundaries as provider evidence. A daily timestamp
  // alone is not a closing timestamp, and no closed flag is synthesized here.
  const currentTradingPeriod = sourceRegular && typeof sourceRegular === 'object' ? {
    regular: {
      start: Number.isFinite(sourceRegular.start) && sourceRegular.start > 0 ? sourceRegular.start : null,
      end: Number.isFinite(sourceRegular.end) && sourceRegular.end > 0 ? sourceRegular.end : null,
      timezone: typeof sourceRegular.timezone === 'string' ? sourceRegular.timezone : null,
      gmtoffset: Number.isFinite(sourceRegular.gmtoffset) ? sourceRegular.gmtoffset : null,
    },
  } : null;
  for (let i = 0; i < closesRaw.length; i++) {
    const seconds = r.timestamp && r.timestamp[i];
    const instant = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
    if (Number.isFinite(closesRaw[i]) && closesRaw[i] > 0 && dateFormatter && instant && Number.isFinite(instant.getTime())) {
      closes.push(closesRaw[i]);
      highs.push(Number.isFinite(q.high && q.high[i]) ? q.high[i] : closesRaw[i]);
      lows.push(Number.isFinite(q.low && q.low[i]) ? q.low[i] : closesRaw[i]);
      volumes.push(Number.isFinite(q.volume && q.volume[i]) ? q.volume[i] : 0);
      const parts = Object.fromEntries(dateFormatter.formatToParts(instant).map((part) => [part.type, part.value]));
      dates.push(`${parts.year}-${parts.month}-${parts.day}`);
      sourceTimestamps.push(instant.toISOString());
      const sourceHigh = q.high && q.high[i];
      const sourceLow = q.low && q.low[i];
      rangeVerified.push(Number.isFinite(sourceHigh) && sourceHigh > 0 && Number.isFinite(sourceLow) && sourceLow > 0
        && sourceHigh >= sourceLow && closesRaw[i] >= sourceLow && closesRaw[i] <= sourceHigh);
      const sourceVolume = q.volume && q.volume[i];
      volumeVerified.push(Number.isFinite(sourceVolume) && sourceVolume >= 0);
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
    observedAt: sourceObservedAt,
    prevClose: prevDay,
    change: last != null && prevDay != null ? last - prevDay : null,
    changePct: last != null && prevDay ? ((last - prevDay) / prevDay) * 100 : null,
    dayHigh: meta.regularMarketDayHigh != null ? meta.regularMarketDayHigh : null,
    dayLow: meta.regularMarketDayLow != null ? meta.regularMarketDayLow : null,
    high52: meta.fiftyTwoWeekHigh != null ? meta.fiftyTwoWeekHigh : null,
    low52: meta.fiftyTwoWeekLow != null ? meta.fiftyTwoWeekLow : null,
    volume: meta.regularMarketVolume != null ? meta.regularMarketVolume : null,
    series: { dates, closes, highs, lows, volumes, sourceTimestamps, rangeVerified, volumeVerified,
      dateBasis: dateFormatter ? 'exchange_timezone' : 'unverified', timeZone,
      observedAt: sourceObservedAt, currentTradingPeriod,
      ...(dateFormatter ? {} : { dateIssue: 'exchange_timezone_unavailable' }) },
  };
}

async function fetchManySeries(symbols, toYahoo) {
  return mapLimit(symbols, 4, (s) =>
    fetchSeries(toYahoo ? toYahoo(s) : s).catch((e) => ({ symbol: s, __error: String((e && e.message) || e) }))
  );
}

module.exports = { fetchSeries, fetchManySeries, normalizeSeries };
