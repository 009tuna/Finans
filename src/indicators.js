// Saf matematiksel teknik indikatör motoru.
// Girdi: kapanış (ve varsa yüksek/düşük/hacim) dizileri. Çıktı: indikatör değerleri + sinyaller.
// Hiçbir dış bağımlılık yok. Tüm formüller standart tanımlara göre (Wilder vb.).
'use strict';

const round = (x, d = 2) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const last = (a) => (a && a.length ? a[a.length - 1] : null);

// Basit hareketli ortalama (son değer)
function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Üstel hareketli ortalama — tüm seri (SMA ile tohumlanır)
function emaSeries(values, period) {
  if (!values || values.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function ema(values, period) {
  return last(emaSeries(values, period).filter((x) => x != null));
}

// RSI (Wilder yumuşatması), 0–100
function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// MACD(12,26,9): macd, signal, histogram + bir önceki histogram (ivme yönü için)
function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] != null && es[i] != null) macdLine.push(ef[i] - es[i]);
  }
  const sigSeries = emaSeries(macdLine, signal);
  const macdNow = last(macdLine);
  const macdPrev = macdLine[macdLine.length - 2];
  const sigNow = last(sigSeries.filter((x) => x != null));
  const sigPrev = sigSeries[sigSeries.length - 2];
  return {
    macd: macdNow,
    signal: sigNow,
    histogram: macdNow != null && sigNow != null ? macdNow - sigNow : null,
    prevHistogram: macdPrev != null && sigPrev != null ? macdPrev - sigPrev : null,
  };
}

// Bollinger Bantları (20, 2σ): orta/üst/alt, %B, bant genişliği
function bollinger(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + mult * sd;
  const lower = mean - mult * sd;
  const price = last(closes);
  return {
    middle: mean,
    upper,
    lower,
    pctB: upper - lower ? (price - lower) / (upper - lower) : null,
    bandwidth: mean ? ((upper - lower) / mean) * 100 : null,
  };
}

// ATR(14) — Ortalama Gerçek Aralık (Wilder). Yüksek/düşük gerektirir.
function atr(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  let v = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) v = (v * (period - 1) + trs[i]) / period;
  return v;
}

// Yıllıklandırılmış volatilite (% — günlük log getirilerin std'i × √252)
function volatility(closes, period = 20) {
  if (!closes || closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  const rets = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// N gün önceye göre yüzde değişim
function roc(closes, period) {
  if (!closes || closes.length <= period) return null;
  const past = closes[closes.length - 1 - period];
  return past ? (closes[closes.length - 1] / past - 1) * 100 : null;
}

// On-Balance Volume + yükseliyor mu (son 10 güne göre)
function obv(closes, volumes) {
  if (!volumes || volumes.length < 2 || closes.length !== volumes.length) return null;
  const series = [0];
  for (let i = 1; i < closes.length; i++) {
    let v = series[i - 1];
    if (closes[i] > closes[i - 1]) v += volumes[i] || 0;
    else if (closes[i] < closes[i - 1]) v -= volumes[i] || 0;
    series.push(v);
  }
  const ref = series[Math.max(0, series.length - 11)];
  return { value: last(series), rising: last(series) > ref };
}

// Tüm indikatörleri tek seferde hesapla. Girdi: {closes, highs, lows, volumes}
function computeIndicators(series) {
  const closes = (series.closes || []).filter((x) => typeof x === 'number');
  const highs = (series.highs || []).filter((x) => typeof x === 'number');
  const lows = (series.lows || []).filter((x) => typeof x === 'number');
  const volumes = (series.volumes || []).filter((x) => typeof x === 'number');
  const n = closes.length;
  if (n < 20) return { __insufficient: true, points: n };

  const price = last(closes);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = n >= 200 ? sma(closes, 200) : null;
  const s50prev = n >= 51 ? sma(closes.slice(0, -1), 50) : null;
  const s200prev = n >= 201 ? sma(closes.slice(0, -1), 200) : null;

  const macdV = macd(closes);
  const bb = bollinger(closes);
  const rsiV = rsi(closes);
  const atrV = highs.length === n && lows.length === n ? atr(highs, lows, closes) : null;
  const obvV = volumes.length === n ? obv(closes, volumes) : null;
  const avgVol = volumes.length >= 20 ? sma(volumes, 20) : null;
  const lastVol = last(volumes);

  const high52 = n ? Math.max(...closes.slice(-Math.min(n, 252))) : null;
  const low52 = n ? Math.min(...closes.slice(-Math.min(n, 252))) : null;

  // Altın/ölüm kesişimi: 50g, 200g'yi yukarı/aşağı kesti mi (son barda)
  let goldenCross = false;
  let deathCross = false;
  if (s50 != null && s200 != null && s50prev != null && s200prev != null) {
    goldenCross = s50prev <= s200prev && s50 > s200;
    deathCross = s50prev >= s200prev && s50 < s200;
  }

  return {
    points: n,
    price: round(price, price < 1 ? 4 : 2),
    sma20: round(s20),
    sma50: round(s50),
    sma200: round(s200),
    ema12: round(ema(closes, 12)),
    ema26: round(ema(closes, 26)),
    rsi: round(rsiV, 1),
    macd: macdV
      ? { macd: round(macdV.macd, 3), signal: round(macdV.signal, 3), histogram: round(macdV.histogram, 3), prevHistogram: round(macdV.prevHistogram, 3) }
      : null,
    bollinger: bb
      ? { upper: round(bb.upper), middle: round(bb.middle), lower: round(bb.lower), pctB: round(bb.pctB, 2), bandwidth: round(bb.bandwidth, 1) }
      : null,
    atr: round(atrV),
    atrPct: atrV && price ? round((atrV / price) * 100, 2) : null,
    volatility: round(volatility(closes), 1),
    ret1w: round(roc(closes, 5), 1),
    ret1m: round(roc(closes, 21), 1),
    ret3m: round(roc(closes, 63), 1),
    ret6m: round(roc(closes, 126), 1),
    ret1y: round(roc(closes, Math.min(251, n - 1)), 1),
    obv: obvV,
    avgVol: round(avgVol, 0),
    lastVol: round(lastVol, 0),
    volSpike: avgVol && lastVol ? round(lastVol / avgVol, 2) : null,
    high52: round(high52, high52 && high52 < 1 ? 4 : 2),
    low52: round(low52, low52 && low52 < 1 ? 4 : 2),
    pos52: high52 != null && low52 != null && high52 > low52 ? round((price - low52) / (high52 - low52), 2) : null,
    signals: {
      priceAboveSma20: s20 != null ? price > s20 : null,
      priceAboveSma50: s50 != null ? price > s50 : null,
      priceAboveSma200: s200 != null ? price > s200 : null,
      sma50AboveSma200: s50 != null && s200 != null ? s50 > s200 : null,
      goldenCross,
      deathCross,
      distSma50: s50 ? round(((price - s50) / s50) * 100, 1) : null,
      distSma200: s200 ? round(((price - s200) / s200) * 100, 1) : null,
    },
    // küçük grafik için son 60 kapanış
    spark: closes.slice(-60).map((x) => round(x, x < 1 ? 4 : 2)),
  };
}

module.exports = { computeIndicators, sma, ema, rsi, macd, bollinger, atr, volatility, roc, obv };
