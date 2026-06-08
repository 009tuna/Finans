// Skorlama + yorumlama motoru (KISA VADE / aktif işlem ağırlıklı).
// İndikatörleri 5 alt-skora çevirir: Momentum, Trend, Hacim, Volatilite, Temel/Analist.
// Her alt-skor için Türkçe gerekçe üretir. NOT: Yatırım tavsiyesi değildir.
'use strict';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, d = 1) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

function labelFor(score) {
  if (score >= 75) return { label: 'GUCLU AL', tone: 'strong-buy' };
  if (score >= 60) return { label: 'AL', tone: 'buy' };
  if (score >= 45) return { label: 'TUT', tone: 'hold' };
  if (score >= 30) return { label: 'AZALT', tone: 'reduce' };
  return { label: 'SAT', tone: 'sell' };
}

// --- MOMENTUM: RSI + MACD + kısa vadeli getiri (kısa vadeci için en yüksek ağırlık) ---
function momentumScore(ind) {
  const reasons = [];
  let rsiS = 0.5;
  let macdS = 0.5;
  let rocS = 0.5;
  const rsi = ind.rsi;
  if (rsi != null) {
    if (rsi >= 80) { rsiS = 0.35; reasons.push(['neg', `RSI ${rsi} — aşırı alım (≥80), kısa vadeli geri çekilme riski yüksek`]); }
    else if (rsi >= 70) { rsiS = 0.7; reasons.push(['neutral', `RSI ${rsi} — güçlü ama aşırı alıma yakın (70-80)`]); }
    else if (rsi >= 55) { rsiS = 1.0; reasons.push(['pos', `RSI ${rsi} — sağlıklı yükseliş momentumu (ideal 55-70 bölgesi)`]); }
    else if (rsi >= 45) { rsiS = 0.6; reasons.push(['neutral', `RSI ${rsi} — nötr momentum`]); }
    else if (rsi >= 30) { rsiS = 0.4; reasons.push(['neg', `RSI ${rsi} — zayıf momentum`]); }
    else { rsiS = 0.5; reasons.push(['neutral', `RSI ${rsi} — aşırı satım (≤30), tepki yükselişi gelebilir`]); }
  }
  const m = ind.macd;
  if (m && m.histogram != null) {
    const rising = m.prevHistogram != null && m.histogram > m.prevHistogram;
    if (m.histogram > 0 && rising) { macdS = 1.0; reasons.push(['pos', 'MACD histogramı pozitif ve genişliyor — ivme güçleniyor']); }
    else if (m.histogram > 0) { macdS = 0.65; reasons.push(['neutral', 'MACD pozitif ama histogram daralıyor — ivme zayıflıyor']); }
    else if (rising) { macdS = 0.45; reasons.push(['neutral', 'MACD negatif ama histogram toparlıyor — olası dönüş sinyali']); }
    else { macdS = 0.2; reasons.push(['neg', 'MACD negatif ve histogram genişliyor — düşüş ivmesi']); }
  }
  if (ind.ret1w != null) {
    rocS = clamp(0.5 + ind.ret1w / 10, 0, 1);
    reasons.push([ind.ret1w >= 0 ? 'pos' : 'neg', `Son 1 hafta getiri: %${ind.ret1w}`]);
  }
  return { score: 0.45 * rsiS + 0.4 * macdS + 0.15 * rocS, reasons };
}

// --- TREND: fiyatın hareketli ortalamalara konumu + kesişimler ---
function trendScore(ind) {
  const reasons = [];
  const s = ind.signals || {};
  let sc =
    0.4 * (s.priceAboveSma20 ? 1 : 0) +
    0.3 * (s.priceAboveSma50 ? 1 : 0) +
    0.2 * (s.sma50AboveSma200 ? 1 : 0) +
    0.1 * (s.priceAboveSma200 ? 1 : 0);
  if (s.priceAboveSma50 && s.sma50AboveSma200) {
    reasons.push(['pos', `Fiyat 50g ve 200g ortalamaların üstünde — ana trend yukarı (50g'ye uzaklık %${s.distSma50})`]);
  } else if (!s.priceAboveSma50 && s.priceAboveSma200) {
    reasons.push(['neutral', 'Fiyat 50g ortalama altında ama 200g üstünde — orta vade zayıflıyor']);
  } else if (s.priceAboveSma200 === false) {
    reasons.push(['neg', 'Fiyat 200g ortalamanın altında — uzun vadeli düşüş eğilimi']);
  }
  if (s.goldenCross) { sc = clamp(sc + 0.1, 0, 1); reasons.push(['pos', 'Altın kesişim: 50g ortalama 200g\'yi yukarı kesti (boğa sinyali)']); }
  if (s.deathCross) { sc = clamp(sc - 0.1, 0, 1); reasons.push(['neg', 'Ölüm kesişimi: 50g ortalama 200g\'yi aşağı kesti (ayı sinyali)']); }
  return { score: clamp(sc, 0, 1), reasons };
}

// --- HACİM: OBV yönü + hacim patlaması (kısa vadede teyit için kritik) ---
function volumeScore(ind) {
  const reasons = [];
  if (!ind.obv && ind.volSpike == null) return { score: 0.5, reasons: [['neutral', 'Hacim verisi yetersiz']] };
  let sc = 0.5;
  if (ind.obv) {
    sc = ind.obv.rising ? 0.6 : 0.35;
    reasons.push([ind.obv.rising ? 'pos' : 'neg', `OBV (hacim akışı) ${ind.obv.rising ? 'yükseliyor — alım baskısı' : 'düşüyor — satış baskısı'}`]);
  }
  if (ind.volSpike != null) {
    sc = clamp(sc + (ind.volSpike - 1) * 0.3, 0, 1);
    if (ind.volSpike >= 1.5) reasons.push(['pos', `Hacim patlaması: 20g ortalamanın %${Math.round(ind.volSpike * 100)}'i — güçlü ilgi`]);
    else if (ind.volSpike < 0.6) reasons.push(['neutral', `Düşük hacim (ort. %${Math.round(ind.volSpike * 100)}) — hareket teyitsiz`]);
  }
  return { score: clamp(sc, 0, 1), reasons };
}

// --- VOLATİLİTE/RİSK: ATR/yıllık vol + Bollinger konumu ---
function volatilityScore(ind) {
  const reasons = [];
  let sc = 0.5;
  const v = ind.atrPct != null ? ind.atrPct : ind.volatility != null ? ind.volatility / 16 : null;
  if (v != null) {
    sc = 1 - clamp(Math.abs(v - 2.5) / 6, 0, 0.6); // ~%2.5 günlük oynaklık aktif işlem için ideal
    reasons.push(['neutral', `Oynaklık: günlük ~%${ind.atrPct != null ? ind.atrPct : round(v)} · yıllık %${ind.volatility != null ? ind.volatility : '–'}`]);
  }
  const bb = ind.bollinger;
  if (bb && bb.pctB != null) {
    if (bb.pctB > 1) { sc = clamp(sc - 0.15, 0, 1); reasons.push(['neg', `Fiyat üst Bollinger bandının üstünde (%B ${bb.pctB}) — aşırı gergin, geri çekilme riski`]); }
    else if (bb.pctB < 0) { sc = clamp(sc + 0.1, 0, 1); reasons.push(['pos', `Fiyat alt Bollinger bandının altında (%B ${bb.pctB}) — tepki potansiyeli`]); }
    else reasons.push(['neutral', `Bollinger %B ${bb.pctB} (bant içinde) · bant genişliği %${bb.bandwidth}`]);
  }
  return { score: clamp(sc, 0, 1), reasons };
}

// --- TEMEL/ANALİST: yalnızca ABD (Finnhub) ---
function fundamentalScore(fund) {
  const reasons = [];
  if (!fund || !fund.analyst) {
    return { score: 0.5, reasons: fund && fund.pe != null ? [['neutral', `F/K ${round(fund.pe)}`]] : [], na: true };
  }
  const a = fund.analyst;
  const tot = a.strongBuy + a.buy + a.hold + a.sell + a.strongSell;
  let sc = 0.5;
  if (tot > 0) {
    sc = (a.strongBuy * 1 + a.buy * 0.75 + a.hold * 0.5 + a.sell * 0.25) / tot;
    reasons.push([sc >= 0.6 ? 'pos' : sc >= 0.45 ? 'neutral' : 'neg', `Analist konsensüsü: ${a.strongBuy} güçlü al · ${a.buy} al · ${a.hold} tut · ${a.sell + a.strongSell} sat`]);
  }
  if (fund.pe != null) reasons.push(['neutral', `F/K ${round(fund.pe)}${fund.pe > 60 ? ' (yüksek)' : fund.pe < 0 ? ' (zarar)' : ''}`]);
  return { score: clamp(sc, 0, 1), reasons };
}

function buildSummary(ind, score, label) {
  const s = ind.signals || {};
  const bits = [`Bileşik teknik puan ${score}/100 → ${label}.`];
  if (ind.rsi != null) bits.push(`RSI ${ind.rsi}`);
  if (ind.macd && ind.macd.histogram != null) bits.push(`MACD ${ind.macd.histogram > 0 ? 'pozitif' : 'negatif'}`);
  if (s.priceAboveSma50 != null) bits.push(`fiyat 50g ort. ${s.priceAboveSma50 ? 'üstünde' : 'altında'}`);
  if (ind.pos52 != null) bits.push(`52H bandında %${Math.round(ind.pos52 * 100)}`);
  return bits.join(' · ');
}

// Ana fonksiyon. market: 'us' | 'bist' | 'crypto'
function scoreAsset(ind, fund, market) {
  if (!ind || ind.__insufficient) {
    return { score: null, label: 'VERİ YOK', tone: 'hold', sub: {}, reasons: [{ sentiment: 'neutral', text: 'Yeterli fiyat geçmişi yok' }], summary: 'İndikatör hesaplamak için yeterli veri yok.' };
  }
  const mom = momentumScore(ind);
  const tr = trendScore(ind);
  const vol = volumeScore(ind);
  const vlt = volatilityScore(ind);
  const fnd = market === 'us' ? fundamentalScore(fund) : { score: 0.5, reasons: [], na: true };

  let w;
  if (market === 'us' && !fnd.na) w = { mom: 0.32, tr: 0.2, vol: 0.18, vlt: 0.15, fnd: 0.15 };
  else w = { mom: 0.38, tr: 0.24, vol: 0.21, vlt: 0.17, fnd: 0 };

  const composite = w.mom * mom.score + w.tr * tr.score + w.vol * vol.score + w.vlt * vlt.score + w.fnd * fnd.score;
  const score = Math.round(composite * 100);
  const lab = labelFor(score);
  const reasons = []
    .concat(mom.reasons, tr.reasons, vol.reasons, vlt.reasons, fnd.reasons)
    .map((r) => ({ sentiment: r[0], text: r[1] }));

  return {
    score,
    label: lab.label,
    tone: lab.tone,
    sub: {
      momentum: Math.round(mom.score * 100),
      trend: Math.round(tr.score * 100),
      hacim: Math.round(vol.score * 100),
      volatilite: Math.round(vlt.score * 100),
      temel: fnd.na ? null : Math.round(fnd.score * 100),
    },
    reasons,
    summary: buildSummary(ind, score, lab.label),
  };
}

module.exports = { scoreAsset, labelFor };
