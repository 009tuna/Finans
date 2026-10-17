// İki yönlü trend sinyal motoru (long / short) — saf; canlı sinyal, sanal işlem takibi ve geçmiş testi aynı kodu kullanır.
//
// Rejim: yükseliş = kapanış > SMA200 ve SMA50 > SMA200; düşüş = tersi.
// Tetik (son tamamlanmış gün):
//   kırılım      — yükselişte önceki 55 günün en yükseğini aşan kapanış; düşüşte en düşüğünün altına kapanış.
//   geri çekilme — yükselişte son 3 günde SMA20'ye değip SMA20 ve SMA50 üstünde, önceki kapanıştan yüksek kapanış (RSI 40–65);
//                  düşüşte SMA20'ye tepki verip SMA20 ve SMA50 altında, önceki kapanıştan düşük kapanış (RSI 35–60).
// Plan: giriş sinyalden sonraki ilk seansın açılışı; stop 2×ATR(14), hedef 2R. Çıkış: stop, hedef,
// SMA50'nin ters yönde kırılması (kapanışla) veya 40 seansı aşan süre. Aynı gün hem stop hem hedef
// görülürse stop varsayılır. Maliyet piyasa bazında gidiş-dönüş düşülür.
'use strict';
const { roundTripCost } = require('./costs');

const STRATEGY = 'trend-signals-v1';
const DEFAULTS = Object.freeze({ breakoutBars: 55, pullbackLookback: 3, stopAtr: 2, rewardRisk: 2, maxHoldBars: 40, minBars: 210 });

function rollingSma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function rollingAtr(highs, lows, closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let value = null, sum = 0;
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    if (i <= period) { sum += tr; if (i === period) value = sum / period; }
    else value = (value * (period - 1) + tr) / period;
    if (i >= period) out[i] = value;
  }
  return out;
}
function rollingRsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const g = Math.max(change, 0), l = Math.max(-change, 0);
    if (i <= period) { gain += g / period; loss += l / period; }
    else { gain = (gain * (period - 1) + g) / period; loss = (loss * (period - 1) + l) / period; }
    if (i >= period) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// bars: { dates, opens, highs, lows, closes } — yalnız tamamlanmış günler, eşit uzunluk.
function prepare(bars) {
  const n = Array.isArray(bars && bars.closes) ? bars.closes.length : 0;
  const keep = [];
  for (let i = 0; i < n; i++) {
    const o = bars.opens && bars.opens[i], h = bars.highs[i], l = bars.lows[i], c = bars.closes[i];
    if ([o, h, l, c].every((v) => Number.isFinite(v) && v > 0) && h >= Math.max(o, c) && l <= Math.min(o, c) && bars.dates[i]) keep.push(i);
  }
  const pick = (field) => keep.map((i) => bars[field][i]);
  const ind = { dates: pick('dates'), opens: pick('opens'), highs: pick('highs'), lows: pick('lows'), closes: pick('closes') };
  ind.sma20 = rollingSma(ind.closes, 20);
  ind.sma50 = rollingSma(ind.closes, 50);
  ind.sma200 = rollingSma(ind.closes, 200);
  ind.atr = rollingAtr(ind.highs, ind.lows, ind.closes, 14);
  ind.rsi = rollingRsi(ind.closes, 14);
  return ind;
}

function regimeAt(ind, t) {
  const c = ind.closes[t], s50 = ind.sma50[t], s200 = ind.sma200[t];
  if (![s50, s200].every(Number.isFinite)) return 'unknown';
  if (c > s200 && s50 > s200) return 'up';
  if (c < s200 && s50 < s200) return 'down';
  return 'neutral';
}

// t gününün kapanışında oluşan tetik; yoksa null.
function triggerAt(ind, t, config = DEFAULTS) {
  if (t < config.minBars || t < config.breakoutBars + 1) return null;
  const regime = regimeAt(ind, t);
  if (regime !== 'up' && regime !== 'down') return null;
  const c = ind.closes[t], prev = ind.closes[t - 1], s20 = ind.sma20[t], s50 = ind.sma50[t], rsi = ind.rsi[t], atr = ind.atr[t];
  if (![s20, s50, rsi, atr].every(Number.isFinite) || atr <= 0) return null;
  const from = t - config.breakoutBars;
  let hi = -Infinity, lo = Infinity;
  for (let i = from; i < t; i++) { hi = Math.max(hi, ind.highs[i]); lo = Math.min(lo, ind.lows[i]); }
  const recent = (fn) => { for (let i = Math.max(0, t - config.pullbackLookback + 1); i <= t; i++) if (fn(i)) return true; return false; };
  if (regime === 'up') {
    if (c > hi) return { direction: 'long', setup: 'breakout', regime, level: hi };
    if (recent((i) => ind.lows[i] <= ind.sma20[i]) && c > s20 && c > s50 && c > prev && rsi >= 40 && rsi <= 65) return { direction: 'long', setup: 'pullback', regime, level: s20 };
  } else {
    if (c < lo) return { direction: 'short', setup: 'breakout', regime, level: lo };
    if (recent((i) => ind.highs[i] >= ind.sma20[i]) && c < s20 && c < s50 && c < prev && rsi >= 35 && rsi <= 60) return { direction: 'short', setup: 'pullback', regime, level: s20 };
  }
  return null;
}

// Giriş açılışına göre stop/hedef; sinyal günündeki ATR ile.
function planFromEntry(direction, entry, atr, config = DEFAULTS) {
  const risk = config.stopAtr * atr, sign = direction === 'long' ? 1 : -1;
  return { entry, stop: entry - sign * risk, target: entry + sign * config.rewardRisk * risk, risk };
}

// Açık işlemi verilen günler üzerinden ilerletir. trade: { direction, entry, stop, target, risk, entryIndex }
// Dönüş: aynı nesne + kapanmışsa exit alanları. Yalnız entryIndex'ten sonraki (dahil) günler değerlendirilir.
function advanceTrade(trade, ind, uptoIndex, config = DEFAULTS, cost = 0) {
  const t = Object.assign({}, trade);
  const long = t.direction === 'long';
  for (let k = t.lastIndex == null ? t.entryIndex : t.lastIndex + 1; k <= uptoIndex; k++) {
    const o = ind.opens[k], h = ind.highs[k], l = ind.lows[k], c = ind.closes[k];
    let exit = null, reason = null;
    if (k > t.entryIndex && (long ? o <= t.stop : o >= t.stop)) { exit = o; reason = 'stop'; }
    else if (long ? l <= t.stop : h >= t.stop) { exit = t.stop; reason = 'stop'; }
    else if (k > t.entryIndex && (long ? o >= t.target : o <= t.target)) { exit = o; reason = 'target'; }
    else if (long ? h >= t.target : l <= t.target) { exit = t.target; reason = 'target'; }
    else if (Number.isFinite(ind.sma50[k]) && (long ? c < ind.sma50[k] : c > ind.sma50[k])) { exit = c; reason = 'trend'; }
    else if (k - t.entryIndex + 1 >= config.maxHoldBars) { exit = c; reason = 'time'; }
    t.lastIndex = k;
    if (exit != null) {
      const sign = long ? 1 : -1;
      t.exit = exit; t.exitReason = reason; t.exitIndex = k; t.exitDate = ind.dates[k];
      t.returnPct = sign * (exit / t.entry - 1) - cost;
      t.r = (sign * (exit - t.entry) - cost * t.entry) / t.risk;
      t.status = 'closed';
      return t;
    }
  }
  t.status = 'open';
  return t;
}

// Bütün geçmiş üzerinde örtüşmeyen işlemler (aynı varlıkta bir işlem kapanmadan yenisi açılmaz).
function backtest(bars, { market, allowShort = true, config = DEFAULTS } = {}) {
  const ind = prepare(bars);
  const cost = roundTripCost(market);
  const trades = [];
  let t = config.minBars;
  while (t < ind.closes.length - 1) {
    const trig = triggerAt(ind, t, config);
    if (!trig || (trig.direction === 'short' && !allowShort)) { t++; continue; }
    const plan = planFromEntry(trig.direction, ind.opens[t + 1], ind.atr[t], config);
    const trade = advanceTrade({ direction: trig.direction, setup: trig.setup, signalDate: ind.dates[t], entryDate: ind.dates[t + 1], entryIndex: t + 1, ...plan }, ind, ind.closes.length - 1, config, cost);
    if (trade.status !== 'closed') break;
    trades.push(trade);
    t = trade.exitIndex + 1;
  }
  return trades;
}

function summarize(trades) {
  const n = trades.length;
  if (!n) return { trades: 0 };
  const wins = trades.filter((x) => x.r > 0);
  const grossWin = wins.reduce((a, x) => a + x.r, 0), grossLoss = -trades.filter((x) => x.r <= 0).reduce((a, x) => a + x.r, 0);
  let equity = 0, peak = 0, maxDd = 0;
  trades.slice().sort((a, b) => String(a.exitDate).localeCompare(String(b.exitDate))).forEach((x) => { equity += x.r; peak = Math.max(peak, equity); maxDd = Math.max(maxDd, peak - equity); });
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    trades: n, winRate: round(wins.length / n, 3), avgR: round(trades.reduce((a, x) => a + x.r, 0) / n, 3),
    totalR: round(trades.reduce((a, x) => a + x.r, 0)), profitFactor: grossLoss ? round(grossWin / grossLoss) : null,
    avgReturnPct: round(trades.reduce((a, x) => a + x.returnPct, 0) / n * 100), maxDrawdownR: round(maxDd),
    avgHoldBars: round(trades.reduce((a, x) => a + (x.exitIndex - x.entryIndex + 1), 0) / n, 1),
    exits: trades.reduce((a, x) => { a[x.exitReason] = (a[x.exitReason] || 0) + 1; return a; }, {}),
  };
}

// Canlı durum: son tamamlanmış günde tetik var mı? shortMode: 'trade' (short işlem) | 'reduce' (azalt/çık uyarısı).
function evaluateLatest(bars, { market, shortMode = 'trade', config = DEFAULTS } = {}) {
  const ind = prepare(bars);
  const t = ind.closes.length - 1;
  if (t < config.minBars) return { strategy: STRATEGY, status: 'insufficient', reason: 'history-under-' + config.minBars, bars: ind.closes.length };
  const regime = regimeAt(ind, t);
  const trig = triggerAt(ind, t, config);
  const base = { strategy: STRATEGY, regime, date: ind.dates[t], close: ind.closes[t], atr: ind.atr[t], rsi: ind.rsi[t], sma50: ind.sma50[t], sma200: ind.sma200[t] };
  if (!trig) return { ...base, status: 'watch' };
  const action = trig.direction === 'short' && shortMode !== 'trade' ? 'reduce' : trig.direction;
  const plan = planFromEntry(trig.direction, ind.closes[t], ind.atr[t], config);
  return { ...base, status: 'signal', direction: trig.direction, action, setup: trig.setup, level: trig.level, indicativePlan: { ...plan, basis: 'signal-close' }, costRoundTrip: roundTripCost(market) };
}

module.exports = { STRATEGY, DEFAULTS, prepare, regimeAt, triggerAt, planFromEntry, advanceTrade, backtest, summarize, evaluateLatest, rollingSma, rollingAtr, rollingRsi };
