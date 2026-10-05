// Pure source-cut checks for completed daily observations. No fetch or store calls.
'use strict';

function completedYahooHistory(series, cutoffMs) {
  const preciseTime = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const observedAt = preciseTime(series?.observedAt);
  if (!Number.isFinite(observedAt)) throw new Error('Yahoo kapanışları doğrulanamadı: kaynağın gözlem kesiti bilinmiyor');
  let formatter;
  if (series?.dateBasis !== 'exchange_timezone' || typeof series.timeZone !== 'string') {
    throw new Error('Yahoo kapanışları doğrulanamadı: borsa zaman dilimi ve günlük tarih kanıtı bilinmiyor');
  }
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: series.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (_) {
    throw new Error('Yahoo kapanışları doğrulanamadı: geçerli borsa zaman dilimi gerekir');
  }
  const localDate = (instant) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const effectiveCutoff = Math.min(cutoffMs, observedAt);
  const cutoffDate = localDate(effectiveCutoff);
  const count = Array.isArray(series?.closes) ? series.closes.length : 0;
  if (!Array.isArray(series.dates) || !Array.isArray(series.sourceTimestamps)) {
    throw new Error('Yahoo kapanışları doğrulanamadı: fiyat gözlemlerine bağlı kaynak tarihleri gerekir');
  }
  // Validate the original arrays before filtering. Otherwise a short OHLCV array
  // could be expanded with undefined entries and silently lose its mismatch.
  const alignedFields = ['closes','highs','lows','volumes','dates','sourceTimestamps','rangeVerified','volumeVerified','opens','openVerified','barStartAt','barEndAt','sessionEvidence'];
  for (const field of alignedFields) {
    if (series[field] != null && (!Array.isArray(series[field]) || series[field].length !== count)) {
      throw new Error('Yahoo kapanışları doğrulanamadı: tarih, fiyat ve OHLCV kanıtı gözlemleri aynı uzunlukta olmalıdır');
    }
  }
  const regular = series.currentTradingPeriod?.regular;
  const startMs = Number.isFinite(regular?.start) && regular.start > 0 ? regular.start * 1000 : NaN;
  const endMs = Number.isFinite(regular?.end) && regular.end > 0 ? regular.end * 1000 : NaN;
  const regularValid = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    && Number.isFinite(new Date(startMs).getTime()) && Number.isFinite(new Date(endMs).getTime());
  const sessionDate = regularValid && localDate(startMs) === localDate(endMs) ? localDate(startMs) : null;
  const indices = [];
  const bases = new Set();
  let excludedOpenBars = 0;
  let excludedUnverifiedBars = 0;
  for (let i = 0; i < count; i++) {
    const date = series.dates[i];
    const timestamp = preciseTime(series.sourceTimestamps[i]);
    if (!Number.isFinite(timestamp) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || localDate(timestamp) !== date) {
      excludedUnverifiedBars++;
      continue;
    }
    if (date > cutoffDate || timestamp > effectiveCutoff) {
      excludedOpenBars++;
      continue;
    }
    if (date < cutoffDate) {
      indices.push(i);
      bases.add('yahoo_exchange_local_prior_day_inference');
      continue;
    }
    if (sessionDate !== date) {
      excludedUnverifiedBars++;
      continue;
    }
    if (endMs > effectiveCutoff) {
      excludedOpenBars++;
      continue;
    }
    indices.push(i);
    bases.add('yahoo_current_regular_session_end');
  }
  if (!indices.length) throw new Error('Yahoo kapanışları doğrulanamadı: kaynak kesitine kadar tamamlandığı kanıtlanan günlük bar yok');
  const filtered = {...series};
  for (const field of alignedFields) {
    if (Array.isArray(series[field])) filtered[field] = indices.map((i) => series[field][i]);
  }
  return {series:filtered,completion:{
    cutoffAt:new Date(cutoffMs).toISOString(),
    observedAt:new Date(observedAt).toISOString(),
    effectiveCutoffAt:new Date(effectiveCutoff).toISOString(),
    timeZone:series.timeZone,
    dateBasis:series.dateBasis,
    exchangeLocalCutoffDate:cutoffDate,
    regularSession:sessionDate ? { startAt:new Date(startMs).toISOString(), endAt:new Date(endMs).toISOString(), exchangeLocalDate:sessionDate } : null,
    sourceObservations:count,
    completedObservations:indices.length,
    excludedOpenBars,
    excludedUnverifiedBars,
    bases:Array.from(bases),
  }};
}

function completedCryptoHistory(series, cutoffMs) {
  const preciseTime = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const observedAt = preciseTime(series?.technicalData?.fetchedAt);
  if (!Number.isFinite(observedAt)) throw new Error('Kripto kapanışları doğrulanamadı: kaynağın gözlem kesiti bilinmiyor');
  const effectiveCutoff = Math.min(cutoffMs, observedAt);
  const count = Array.isArray(series?.closes) ? series.closes.length : 0;
  const alignedFields = ['closes','highs','lows','volumes','dates','sourceTimestamps','closeTimes','closeTimeProvided','rangeVerified','volumeVerified','opens','openVerified','barStartAt','barEndAt','sessionEvidence'];
  for (const field of alignedFields) {
    if (series[field] != null && (!Array.isArray(series[field]) || series[field].length !== count)) {
      throw new Error('Kripto kapanışları doğrulanamadı: tarih, fiyat ve OHLCV kanıtı gözlemleri aynı uzunlukta olmalıdır');
    }
  }
  const calendar = series.calendar;
  const verifiedCalendar = calendar?.provider === 'binance' && calendar.interval === '1d' && calendar.timeZone === 'UTC'
    && calendar.basis === 'binance_klines_default_timezone';
  const indices = [];
  const bases = new Set();
  let excludedOpenBars = 0;
  let excludedUnverifiedBars = 0;
  for (let i = 0; i < count; i++) {
    const openMs = preciseTime(series.sourceTimestamps?.[i]);
    const openDate = Number.isFinite(openMs) ? new Date(openMs).toISOString().slice(0,10) : null;
    const validDailyOpen = verifiedCalendar && Number.isFinite(openMs)
      && openMs === Date.parse(openDate + 'T00:00:00.000Z') && series.dates?.[i] === openDate;
    if (!validDailyOpen) {
      excludedUnverifiedBars++;
      continue;
    }
    const providedFlag = series.closeTimeProvided?.[i];
    if (providedFlag != null && typeof providedFlag !== 'boolean') {
      excludedUnverifiedBars++;
      continue;
    }
    const hasProviderClose = providedFlag === true || series.closeTimes?.[i] != null;
    const expectedClose = openMs + 86400000 - 1;
    let closeMs = preciseTime(series.closeTimes?.[i]);
    const basis = hasProviderClose ? 'provider_close_time' : 'binance_utc_daily_calendar_inference';
    if (hasProviderClose && closeMs !== expectedClose) {
      // A malformed explicit source time is not missing legacy evidence. Never
      // replace conflicting provider evidence with a fabricated valid day end.
      excludedUnverifiedBars++;
      continue;
    }
    if (!hasProviderClose) closeMs = expectedClose;
    if (closeMs > effectiveCutoff) {
      excludedOpenBars++;
      continue;
    }
    indices.push(i);
    bases.add(basis);
  }
  if (!indices.length) throw new Error('Kripto kapanışları doğrulanamadı: kaynak kesitine kadar tamamlandığı kanıtlanan günlük bar yok');
  const filtered = {...series};
  for (const field of alignedFields) {
    if (Array.isArray(series[field])) filtered[field] = indices.map((i) => series[field][i]);
  }
  return {series:filtered,completion:{
    cutoffAt:new Date(cutoffMs).toISOString(),
    observedAt:new Date(observedAt).toISOString(),
    effectiveCutoffAt:new Date(effectiveCutoff).toISOString(),
    sourceObservations:count,
    completedObservations:indices.length,
    excludedOpenBars,
    excludedUnverifiedBars,
    bases:Array.from(bases),
  }};
}

function completedChartHistory(chart, market, cutoffMs) {
  if (!chart || !Array.isArray(chart.bars) || chart.interval !== '1d') throw new Error('Günlük tarihsel fiyat serisi yok');
  if (!Number.isFinite(cutoffMs)) throw new Error('Günlük kapanışlar için geçerli hesaplama kesiti gerekir');
  const expectedSource = market === 'crypto' ? 'binance' : 'yahoo';
  if (!['us','bist','crypto'].includes(market) || chart.source !== expectedSource) throw new Error('Günlük fiyat sağlayıcısı doğrulanamadı');
  const currency = typeof chart.currency === 'string' && chart.currency.trim() ? chart.currency.trim() : null;
  if (!currency) throw new Error('Günlük fiyat kaynağının para birimi doğrulanamadı');
  if (market !== 'crypto' && (!Intl.supportedValuesOf('currency').includes(currency) || ['XXX','XTS'].includes(currency))) {
    throw new Error('Günlük fiyat kaynağının desteklenen para birimi doğrulanamadı');
  }
  if (market === 'bist' && currency !== 'TRY') throw new Error('BIST günlük fiyat kaynağının TRY para birimi doğrulanamadı');
  if (market === 'crypto' && currency !== 'USDT') throw new Error('Binance günlük fiyat kaynağının USDT para birimi doğrulanamadı');
  let formatter = null;
  if (market !== 'crypto') {
    if (chart.dateBasis !== 'exchange_timezone' || typeof chart.timeZone !== 'string') throw new Error('Borsa zaman dilimi ve günlük tarih kanıtı bilinmiyor');
    try { formatter = new Intl.DateTimeFormat('en-CA', {timeZone:chart.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}); }
    catch (_) { throw new Error('Geçerli borsa zaman dilimi gerekir'); }
  }
  const sourceTimestamps = [];
  const dates = [];
  const closes = [];
  for (const bar of chart.bars) {
    const hasSourceTime = bar && Object.prototype.hasOwnProperty.call(bar,'sourceTime');
    const sourceMs = bar && (hasSourceTime ? bar.sourceTime * 1000 : bar.openTime != null ? bar.openTime : bar.time * 1000);
    if (!bar || typeof bar.time !== 'number' || !Number.isFinite(bar.time) || bar.time <= 0
      || (hasSourceTime && (typeof bar.sourceTime !== 'number' || !Number.isFinite(bar.sourceTime) || bar.sourceTime <= 0)) || (bar.openTime != null && typeof bar.openTime !== 'number')
      || !Number.isFinite(sourceMs) || sourceMs <= 0 || !Number.isFinite(new Date(sourceMs).getTime())
      || typeof bar.close !== 'number' || !Number.isFinite(bar.close) || bar.close <= 0 || bar.closeVerified === false) {
      throw new Error('Tarihsel fiyat veya zaman geçersiz');
    }
    const instant = new Date(sourceMs);
    sourceTimestamps.push(instant.toISOString());
    if (formatter) {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(part=>[part.type,part.value]));
      dates.push(`${parts.year}-${parts.month}-${parts.day}`);
    } else dates.push(instant.toISOString().slice(0,10));
    closes.push(bar.close);
  }
  const series = {closes,dates,sourceTimestamps};
  let completed;
  if (market === 'crypto') {
    series.closeTimes = chart.bars.map(bar=>typeof bar.closeTime === 'number' && Number.isFinite(bar.closeTime) && Number.isFinite(new Date(bar.closeTime).getTime()) ? new Date(bar.closeTime).toISOString() : null);
    series.closeTimeProvided = chart.bars.map(bar=>bar.closeTimeProvided != null && typeof bar.closeTimeProvided !== 'boolean' ? bar.closeTimeProvided : bar.closeTimeProvided === true || bar.closeTime != null);
    series.calendar = chart.technicalData?.calendar || chart.calendar || null;
    series.technicalData = chart.technicalData || {fetchedAt:chart.observedAt || chart.fetchedAt || null};
    completed = completedCryptoHistory(series,cutoffMs);
  } else {
    Object.assign(series,{observedAt:chart.observedAt || null,timeZone:chart.timeZone,dateBasis:chart.dateBasis,currentTradingPeriod:chart.currentTradingPeriod || null});
    completed = completedYahooHistory(series,cutoffMs);
  }
  const observed = completed.series.sourceTimestamps.map((timestamp,index)=>({time:Date.parse(timestamp)/1000,date:completed.series.dates[index],close:completed.series.closes[index]}));
  if (new Set(observed.map(bar=>bar.date)).size !== observed.length) throw new Error('Aynı gün için birden fazla kapanış gözlemi var');
  return {bars:observed,completion:completed.completion,currency};
}

module.exports = { completedYahooHistory, completedCryptoHistory, completedChartHistory };
