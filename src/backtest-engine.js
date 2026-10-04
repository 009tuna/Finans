// Tarihsel Strateji Backtest Motoru
// Belirtilen varlık için son 250 günlük veriyi çekip gün gün teknik puan hesaplar,
// ardından belirtilen Al/Sat puan eşiklerine göre işlem simülasyonu çalıştırır.
'use strict';
const { fetchSeries: fetchYahooSeries } = require('./yahoo');
const { fetchSeries: fetchBinanceSeries } = require('./coingecko');
const { computeIndicators } = require('./indicators');
const { scoreAsset } = require('./analyze');
const { oneWayCost, roundTripCost } = require('./costs');

const { completedYahooHistory, completedCryptoHistory } = require('./daily-history');

async function runBacktest({ symbol, market, buyThreshold = 70, sellThreshold = 45, stopLoss = null, takeProfit = null }) {
  const cutoffMs = Date.now();
  let series = null;
  let currency = 'USD';
  let historySource = null;
  let completion = null;

  const numericInput = (value) => typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  buyThreshold = numericInput(buyThreshold);
  sellThreshold = numericInput(sellThreshold);
  stopLoss = stopLoss == null || stopLoss === '' ? null : numericInput(stopLoss);
  takeProfit = takeProfit == null || takeProfit === '' ? null : numericInput(takeProfit);
  if (![buyThreshold, sellThreshold].every(Number.isFinite)
      || [stopLoss, takeProfit].some((value) => value != null && !Number.isFinite(value))) {
    throw new Error('Geçersiz test girdisi: AL/SAT eşikleri ile etkin stop ve hedef değerleri sonlu sayı olmalıdır');
  }
  if (![buyThreshold, sellThreshold].every((n) => n >= 0 && n <= 100)
      || (stopLoss != null && (stopLoss <= 0 || stopLoss >= 100)) || (takeProfit != null && takeProfit <= 0)) {
    throw new Error('Geçersiz test girdisi: eşikler 0–100, etkin stop 0–100 arasında, hedef pozitif olmalıdır');
  }
  if (!['us', 'bist', 'crypto'].includes(market) || typeof symbol !== 'string' || !symbol.trim()) {
    throw new Error('Geçerli bir piyasa ve varlık seçilmelidir');
  }
  symbol = symbol.trim();

  if (market === 'us') {
    const data = await fetchYahooSeries(symbol);
    if (!data || data.__error) throw new Error(data?.__error || 'Yahoo fiyat kaynağı alınamadı');
    if (typeof data.currency !== 'string' || !data.currency.trim()) throw new Error('Yahoo fiyat kaynağının para birimi doğrulanamadı');
    ({series,completion} = completedYahooHistory(data.series,cutoffMs));
    currency = data.currency.trim();
    historySource = 'Yahoo Finance';
  } else if (market === 'bist') {
    const data = await fetchYahooSeries(symbol + '.IS');
    if (!data || data.__error) throw new Error(data?.__error || 'Yahoo fiyat kaynağı alınamadı');
    if (data.currency !== 'TRY') throw new Error('BIST fiyat kaynağının TRY para birimi doğrulanamadı');
    ({series,completion} = completedYahooHistory(data.series,cutoffMs));
    currency = 'TRY';
    historySource = 'Yahoo Finance';
  } else if (market === 'crypto') {
    let binSym = symbol.toUpperCase();
    if (!binSym.endsWith('USDT')) binSym += 'USDT';
    const data = await fetchBinanceSeries(binSym);
    if (!data) throw new Error('Binance verisi alınamadı');
    if (data.__error) throw new Error(data.__error);
    ({series,completion} = completedCryptoHistory(data,cutoffMs));
    currency = 'USDT';
    historySource = data.technicalData?.source || 'Binance';
  }

  const startDay = 50; // İndikatör ısınması için ilk 50 günü atlıyoruz
  if (!series || !Array.isArray(series.closes) || series.closes.length <= startDay) {
    throw new Error('Yetersiz veri serisi: 50 günlük ısınmanın ardından en az 1 test günü gerekir (en az 51 geçerli kapanış)');
  }
  if (!series.closes.every((price) => typeof price === 'number' && Number.isFinite(price) && price > 0)) {
    throw new Error('Geçersiz kapanış fiyatı: test serisindeki tüm fiyatlar sonlu ve pozitif olmalıdır');
  }

  const closes = series.closes;
  const highs = series.highs;
  const lows = series.lows;
  const volumes = series.volumes;
  const n = closes.length;
  for (const field of ['highs','lows','volumes','rangeVerified','volumeVerified']) {
    if (series[field] != null && (!Array.isArray(series[field]) || series[field].length !== n)) {
      throw new Error('Geçersiz OHLCV serisi: fiyat, hacim ve kaynak kanıtı gözlemleri aynı uzunlukta olmalıdır');
    }
  }
  const missingRange = Array.isArray(series.rangeVerified) ? series.rangeVerified.filter((verified) => verified !== true).length : 0;
  const missingVolume = Array.isArray(series.volumeVerified) ? series.volumeVerified.filter((verified) => verified !== true).length : 0;
  if (missingRange || missingVolume) {
    throw new Error('OHLCV kaynak kalitesi doğrulanamadı: ' + missingRange + ' gözlemde yüksek/düşük, ' + missingVolume + ' gözlemde hacim ölçümü eksik. Doldurulmuş değerlerle test yapılmadı');
  }
  if (series.dates != null && (!Array.isArray(series.dates) || series.dates.length !== n)) {
    throw new Error('Geçersiz tarih serisi: tarihler kapanış gözlemleriyle aynı uzunlukta olmalıdır');
  }
  const dates = Array.isArray(series.dates) && series.dates.length === n ? series.dates : null;
  if (dates && !dates.every((date, index) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date && (!index || date > dates[index - 1]))) {
    throw new Error('Geçersiz tarih serisi: günlük gözlemler sıralı, benzersiz ve gerçek tarihler olmalıdır');
  }

  const dailyScores = [];

  // Gün gün teknik puanları hesapla (Kayan pencere)
  for (let i = startDay; i < n; i++) {
    const sliceSeries = {
      // Günün kapanışı sinyal girdisi değildir: önceki tamamlanmış günlük barlar.
      closes: closes.slice(0, i),
      highs: highs && highs.length ? highs.slice(0, i) : null,
      lows: lows && lows.length ? lows.slice(0, i) : null,
      volumes: volumes && volumes.length ? volumes.slice(0, i) : null,
    };
    const ind = computeIndicators(sliceSeries);
    const scored = scoreAsset(ind, null, market);
    if (!scored || typeof scored.score !== 'number' || !Number.isFinite(scored.score)) {
      throw new Error('Teknik puan hesaplanamadı: geçerli puanı olmayan gün test sonucu üretemez');
    }
    dailyScores.push(scored.score);
  }

  // İşlem Simülasyonu
  let capital = 10000; // Başlangıç sermayesi (Dolar veya TL)
  let position = 0; // Eldeki varlık miktarı
  let buyPrice = 0;
  let entryCapital = 0; // Alım maliyeti düşülmeden önce bu işleme ayrılan tüm nakit
  const trades = [];
  const equityCurve = [];
  const owc = oneWayCost(market); // her al/sat'ta düşülen tek-yön işlem maliyeti (gerçekçilik)

  for (let i = 0; i < dailyScores.length; i++) {
    const idx = i + startDay;
    const currentPrice = closes[idx];
    const score = dailyScores[i];

    if (position > 0) {
      // Pozisyondayız, Satış Koşullarını Denetle
      const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
      const signalPnlPct = ((closes[idx - 1] - buyPrice) / buyPrice) * 100;
      let exitReason = null;

      if (stopLoss != null && signalPnlPct <= -stopLoss) {
        exitReason = `Stop Loss (-%${stopLoss})`;
      } else if (takeProfit != null && signalPnlPct >= takeProfit) {
        exitReason = `Kâr Al (+%${takeProfit})`;
      } else if (score <= sellThreshold) {
        exitReason = `Puan Düşük (${score} ≤ ${sellThreshold})`;
      }

      if (exitReason) {
        capital = position * currentPrice * (1 - owc); // satışta maliyet düş
        const netPnl = capital - entryCapital;
        const netPnlPct = (netPnl / entryCapital) * 100;
        trades.push({
          type: 'SELL',
          day: idx - startDay + 1,
          date: dates ? dates[idx] : null,
          signalDate: dates ? dates[idx - 1] : null,
          price: currentPrice,
          pnlPct: Math.round(pnlPct * 100) / 100,
          grossPriceReturnPct: Math.round(pnlPct * 100) / 100,
          netPnl: Math.round(netPnl * 100) / 100,
          netPnlPct,
          capitalBefore: Math.round(entryCapital * 100) / 100,
          reason: exitReason,
          capitalAfter: Math.round(capital * 100) / 100,
        });
        position = 0;
      }
    } else {
      // Pozisyonda değiliz, Alış Koşullarını Denetle
      if (score >= buyThreshold) {
        entryCapital = capital;
        position = (capital * (1 - owc)) / currentPrice; // alışta maliyet düş
        buyPrice = currentPrice;
        trades.push({
          type: 'BUY',
          day: idx - startDay + 1,
          date: dates ? dates[idx] : null,
          signalDate: dates ? dates[idx - 1] : null,
          price: currentPrice,
          capitalBefore: Math.round(capital * 100) / 100,
        });
      }
    }

    const posVal = position * currentPrice;
    equityCurve.push({
      day: idx - startDay + 1,
      date: dates ? dates[idx] : null,
      signalDate: dates ? dates[idx - 1] : null,
      price: currentPrice,
      score,
      capital: position > 0 ? 0 : Math.round(capital * 100) / 100,
      positionValue: Math.round(posVal * 100) / 100,
      total: Math.round((position > 0 ? posVal : capital) * 100) / 100,
    });
  }

  // Son gün pozisyon açıksa kapat
  if (position > 0) {
    const finalPrice = closes[n - 1];
    capital = position * finalPrice * (1 - owc); // vade sonu satışında maliyet düş
    const pnlPct = ((finalPrice - buyPrice) / buyPrice) * 100;
    const netPnl = capital - entryCapital;
    const netPnlPct = (netPnl / entryCapital) * 100;
    trades.push({
      type: 'SELL',
      day: n - startDay,
      date: dates ? dates[n - 1] : null,
      signalDate: null,
      price: finalPrice,
      pnlPct: Math.round(pnlPct * 100) / 100,
      grossPriceReturnPct: Math.round(pnlPct * 100) / 100,
      netPnl: Math.round(netPnl * 100) / 100,
      netPnlPct,
      capitalBefore: Math.round(entryCapital * 100) / 100,
      reason: 'Vade Sonu',
      capitalAfter: Math.round(capital * 100) / 100,
    });
    position = 0;
    equityCurve[equityCurve.length - 1].capital = Math.round(capital * 100) / 100;
    equityCurve[equityCurve.length - 1].positionValue = 0;
    equityCurve[equityCurve.length - 1].total = Math.round(capital * 100) / 100;
  }

  const initialCapital = 10000;
  const finalCapital = capital;
  const strategyReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
  const bhReturn = ((closes[n - 1] - closes[startDay]) / closes[startDay]) * 100;
  if (!equityCurve.length || ![finalCapital, strategyReturn, bhReturn, ...[finalCapital, strategyReturn, bhReturn].map((value) => Math.round(value * 100) / 100)].every(Number.isFinite)
      || !equityCurve.every((point) => [point.price, point.score, point.capital, point.positionValue, point.total].every(Number.isFinite))
      || !trades.every((trade) => [trade.price, trade.capitalBefore, ...(trade.type === 'SELL' ? [trade.capitalAfter, trade.grossPriceReturnPct, trade.netPnl, trade.netPnlPct] : [])].every(Number.isFinite))) {
    throw new Error('Test sonucu doğrulanamadı: geçerli test günü, sonlu sermaye eğrisi ve al-tut karşılaştırması gerekir');
  }

  // --- Risk-ayarlı metrikler + örneklem-içi/dışı tutarlılık (dürüstlük) ---
  const dailyRets = [];
  for (let i = 0; i < equityCurve.length; i++) {
    const prev = i > 0 ? equityCurve[i - 1].total : initialCapital;
    if (prev > 0) dailyRets.push((equityCurve[i].total - prev) / prev);
  }
  const mean = dailyRets.length ? dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length : 0;
  const variance = dailyRets.length > 1 ? dailyRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyRets.length - 1) : 0;
  const sd = Math.sqrt(variance);
  const downside = dailyRets.filter((r) => r < 0);
  const downVar = downside.length ? downside.reduce((a, b) => a + b * b, 0) / downside.length : 0;
  const downSd = Math.sqrt(downVar);
  const periodsPerYear = market === 'crypto' ? 365 : 252;
  const sharpe = sd > 0 && dailyRets.length > 1 ? (mean / sd) * Math.sqrt(periodsPerYear) : null;
  const sortino = downSd > 0 && dailyRets.length > 1 ? (mean / downSd) * Math.sqrt(periodsPerYear) : null;

  // Yarı-dönem tutarlılığı: strateji ikinci yarıda da çalıştı mı? (overfit/şans göstergesi)
  const half = Math.floor(equityCurve.length / 2);
  const halfReturn = (before, after) => {
    if (!Number.isFinite(before) || before <= 0 || !Number.isFinite(after)) return null;
    return Math.round(((after - before) / before) * 10000) / 100;
  };
  const firstHalfReturn = half > 1 ? halfReturn(initialCapital, equityCurve[half - 1].total) : null;
  const secondHalfReturn = half > 1 ? halfReturn(equityCurve[half - 1].total, equityCurve[equityCurve.length - 1].total) : null;

  return {
    symbol,
    market,
    buyThreshold,
    sellThreshold,
    stopLoss,
    takeProfit,
    currency,
    pnlPctBasis: 'gross_price_return', // Eski pnlPct sözleşmesi korunur; net sonuçlar ayrı alanlardadır.
    simulatedDays: equityCurve.length,
    periodsPerYear,
    riskFreeRate: 0,
    benchmarkBasis: 'gross_price_return_cost_excluded',
    executionPolicy: 'previous_completed_bar_signal_next_observed_close',
    stopPolicy: 'previous_close_trigger_next_observed_close_not_intraday_stop_order',
    history: {
      source: historySource,
      startDate: dates ? dates[startDay] : null,
      endDate: dates ? dates[n - 1] : null,
      observations: n,
      warmupObservations: startDay,
      testObservations: equityCurve.length,
      currency,
      status: series.technicalData?.status || (dates ? 'observed' : 'dates_unavailable'),
      fetchedAt: series.technicalData?.fetchedAt || series.observedAt || null,
      completion,
    },
    roundTripCostPct: Math.round(roundTripCost(market) * 10000) / 100, // % (her işlemde uygulandı)
    initialCapital,
    finalCapital: Math.round(finalCapital * 100) / 100,
    strategyReturn: Math.round(strategyReturn * 100) / 100,
    bhReturn: Math.round(bhReturn * 100) / 100,
    sharpe: Number.isFinite(sharpe) ? Math.round(sharpe * 100) / 100 : null,
    sortino: Number.isFinite(sortino) ? Math.round(sortino * 100) / 100 : null,
    firstHalfReturn,
    secondHalfReturn,
    trades,
    equityCurve,
  };
}

module.exports = { runBacktest };
