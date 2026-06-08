// Tarihsel Strateji Backtest Motoru
// Belirtilen varlık için son 250 günlük veriyi çekip gün gün teknik puan hesaplar,
// ardından belirtilen Al/Sat puan eşiklerine göre işlem simülasyonu çalıştırır.
'use strict';
const { fetchSeries: fetchYahooSeries } = require('./yahoo');
const { fetchSeries: fetchBinanceSeries } = require('./coingecko');
const { computeIndicators } = require('./indicators');
const { scoreAsset } = require('./analyze');
const { oneWayCost, roundTripCost } = require('./costs');

async function runBacktest({ symbol, market, buyThreshold = 70, sellThreshold = 45, stopLoss = null, takeProfit = null }) {
  let series = null;
  let currency = 'USD';

  buyThreshold = parseFloat(buyThreshold);
  sellThreshold = parseFloat(sellThreshold);
  stopLoss = stopLoss ? parseFloat(stopLoss) : null;
  takeProfit = takeProfit ? parseFloat(takeProfit) : null;

  if (market === 'us') {
    const data = await fetchYahooSeries(symbol);
    if (data.__error) throw new Error(data.__error);
    series = data.series;
    currency = data.currency || 'USD';
  } else if (market === 'bist') {
    const data = await fetchYahooSeries(symbol + '.IS');
    if (data.__error) throw new Error(data.__error);
    series = data.series;
    currency = 'TRY';
  } else if (market === 'crypto') {
    let binSym = symbol.toUpperCase();
    if (!binSym.endsWith('USDT')) binSym += 'USDT';
    const data = await fetchBinanceSeries(binSym);
    if (!data) throw new Error('Binance verisi alınamadı');
    series = data;
    currency = 'USD';
  }

  if (!series || !series.closes || series.closes.length < 50) {
    throw new Error('Yetersiz veri serisi (En az 50 günlük geçmiş veri gerekir)');
  }

  const closes = series.closes;
  const highs = series.highs;
  const lows = series.lows;
  const volumes = series.volumes;
  const n = closes.length;

  const dailyScores = [];
  const dailyPrices = [];
  const startDay = 50; // İndikatör ısınması için ilk 50 günü atlıyoruz

  // Gün gün teknik puanları hesapla (Kayan pencere)
  for (let i = startDay; i < n; i++) {
    const sliceSeries = {
      closes: closes.slice(0, i + 1),
      highs: highs && highs.length ? highs.slice(0, i + 1) : null,
      lows: lows && lows.length ? lows.slice(0, i + 1) : null,
      volumes: volumes && volumes.length ? volumes.slice(0, i + 1) : null,
    };
    const ind = computeIndicators(sliceSeries);
    const scored = scoreAsset(ind, null, market);
    dailyScores.push(scored.score != null ? scored.score : 50);
    dailyPrices.push(closes[i]);
  }

  // İşlem Simülasyonu
  let capital = 10000; // Başlangıç sermayesi (Dolar veya TL)
  let position = 0; // Eldeki varlık miktarı
  let buyPrice = 0;
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
      let exitReason = null;

      if (stopLoss != null && pnlPct <= -stopLoss) {
        exitReason = `Stop Loss (-%${stopLoss})`;
      } else if (takeProfit != null && pnlPct >= takeProfit) {
        exitReason = `Kâr Al (+%${takeProfit})`;
      } else if (score <= sellThreshold) {
        exitReason = `Puan Düşük (${score} ≤ ${sellThreshold})`;
      }

      if (exitReason) {
        capital = position * currentPrice * (1 - owc); // satışta maliyet düş
        trades.push({
          type: 'SELL',
          day: idx - startDay + 1,
          price: currentPrice,
          pnlPct: Math.round(pnlPct * 100) / 100,
          reason: exitReason,
          capitalAfter: Math.round(capital * 100) / 100,
        });
        position = 0;
      }
    } else {
      // Pozisyonda değiliz, Alış Koşullarını Denetle
      if (score >= buyThreshold) {
        position = (capital * (1 - owc)) / currentPrice; // alışta maliyet düş
        buyPrice = currentPrice;
        trades.push({
          type: 'BUY',
          day: idx - startDay + 1,
          price: currentPrice,
          capitalBefore: Math.round(capital * 100) / 100,
        });
      }
    }

    const posVal = position * currentPrice;
    equityCurve.push({
      day: idx - startDay + 1,
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
    trades.push({
      type: 'SELL',
      day: n - startDay,
      price: finalPrice,
      pnlPct: Math.round(pnlPct * 100) / 100,
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

  // --- Risk-ayarlı metrikler + örneklem-içi/dışı tutarlılık (dürüstlük) ---
  const dailyRets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].total || 1;
    dailyRets.push((equityCurve[i].total - prev) / prev);
  }
  const mean = dailyRets.length ? dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length : 0;
  const variance = dailyRets.length > 1 ? dailyRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyRets.length - 1) : 0;
  const sd = Math.sqrt(variance);
  const downside = dailyRets.filter((r) => r < 0);
  const downVar = downside.length ? downside.reduce((a, b) => a + b * b, 0) / downside.length : 0;
  const downSd = Math.sqrt(downVar);
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : null;
  const sortino = downSd > 0 ? (mean / downSd) * Math.sqrt(252) : null;

  // Yarı-dönem tutarlılığı: strateji ikinci yarıda da çalıştı mı? (overfit/şans göstergesi)
  const half = Math.floor(equityCurve.length / 2);
  const halfReturn = (a, b) => {
    if (!equityCurve[a] || !equityCurve[b] || !equityCurve[a].total) return null;
    return Math.round(((equityCurve[b].total - equityCurve[a].total) / equityCurve[a].total) * 10000) / 100;
  };
  const firstHalfReturn = half > 1 ? halfReturn(0, half) : null;
  const secondHalfReturn = half > 1 ? halfReturn(half, equityCurve.length - 1) : null;

  return {
    symbol,
    market,
    buyThreshold,
    sellThreshold,
    stopLoss,
    takeProfit,
    currency,
    roundTripCostPct: Math.round(roundTripCost(market) * 10000) / 100, // % (her işlemde uygulandı)
    initialCapital,
    finalCapital: Math.round(finalCapital * 100) / 100,
    strategyReturn: Math.round(strategyReturn * 100) / 100,
    bhReturn: Math.round(bhReturn * 100) / 100,
    sharpe: sharpe != null ? Math.round(sharpe * 100) / 100 : null,
    sortino: sortino != null ? Math.round(sortino * 100) / 100 : null,
    firstHalfReturn,
    secondHalfReturn,
    trades,
    equityCurve,
  };
}

module.exports = { runBacktest };
