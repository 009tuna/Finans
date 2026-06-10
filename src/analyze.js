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

// RSI alt-skoru REJİME GÖRE değişir (raporların ana dersi):
//  - Yatay (range) rejimde mean-reversion: DÜŞÜK RSI = alım, YÜKSEK RSI = satış.
//  - Trend rejiminde momentum: yüksek RSI cezalandırılmaz (trend devam edebilir), düşük RSI = zayıflık.
function rsiSubScore(rsi, regime) {
  if (rsi == null) return [0.5, null];
  const isRange = regime && regime.type === 'range';
  if (isRange) {
    if (rsi <= 25) return [0.9, ['pos', `RSI ${rsi} — yatay piyasada aşırı satım, tepki/alım bölgesi`]];
    if (rsi <= 35) return [0.72, ['pos', `RSI ${rsi} — yatay piyasada zayıf, dönüş potansiyeli`]];
    if (rsi >= 75) return [0.12, ['neg', `RSI ${rsi} — yatay piyasada aşırı alım, geri çekilme riski`]];
    if (rsi >= 65) return [0.32, ['neg', `RSI ${rsi} — yatay piyasada pahalı bölge`]];
    return [0.55, ['neutral', `RSI ${rsi} — yatay piyasada nötr`]];
  }
  // Trend rejimi (veya rejim bilinmiyorsa momentum yorumu)
  if (rsi >= 80) return [0.6, ['neutral', `RSI ${rsi} — trendde güçlü ama çok gergin (≥80)`]];
  if (rsi >= 60) return [1.0, ['pos', `RSI ${rsi} — trend yönünde sağlıklı güç`]];
  if (rsi >= 50) return [0.8, ['pos', `RSI ${rsi} — trend yönünde momentum`]];
  if (rsi >= 40) return [0.45, ['neutral', `RSI ${rsi} — trendde zayıflama`]];
  return [0.25, ['neg', `RSI ${rsi} — trend yönü zayıf (RSI<40)`]];
}

// --- MOMENTUM: RSI(rejime duyarlı) + MACD + kısa vadeli getiri ---
function momentumScore(ind, regime) {
  const reasons = [];
  const [rsiS, rsiReason] = rsiSubScore(ind.rsi, regime);
  if (rsiReason) reasons.push(rsiReason);
  let macdS = 0.5;
  let rocS = 0.5;
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
  // Yatay rejimde RSI(mean-reversion) ağırlığı artar, MACD/ROC(trend-takip) azalır.
  const isRange = regime && regime.type === 'range';
  const w = isRange ? { rsi: 0.6, macd: 0.2, roc: 0.2 } : { rsi: 0.45, macd: 0.4, roc: 0.15 };
  return { score: w.rsi * rsiS + w.macd * macdS + w.roc * rocS, reasons };
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

// --- HACİM: OBV yönü + hacim patlaması + MFI (para akışı) ---
function volumeScore(ind) {
  const reasons = [];
  if (!ind.obv && ind.volSpike == null && ind.mfi == null) return { score: 0.5, reasons: [['neutral', 'Hacim verisi yetersiz']] };
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
  if (ind.mfi != null) {
    // MFI hacim-ağırlıklı para akışı (OBV'yi teyit/çeler); skoru harmanla
    sc = clamp(sc * 0.7 + (ind.mfi / 100) * 0.3, 0, 1);
    reasons.push([ind.mfi >= 55 ? 'pos' : ind.mfi <= 45 ? 'neg' : 'neutral', `MFI ${ind.mfi} — para akışı ${ind.mfi >= 55 ? 'pozitif (alım baskısı)' : ind.mfi <= 45 ? 'negatif (satış baskısı)' : 'nötr'}`]);
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

// Rejime + temel-veri varlığına göre alt-skor ağırlıkları (toplam=1).
// Yatay: mean-reversion (RSI/Bollinger) öne; Trend: trend+momentum öne.
function weightsFor(regime, hasFund) {
  const type = regime && regime.type;
  if (type === 'range') {
    return hasFund ? { mom: 0.34, tr: 0.10, vol: 0.20, vlt: 0.21, fnd: 0.15 }
                   : { mom: 0.40, tr: 0.13, vol: 0.24, vlt: 0.23, fnd: 0 };
  }
  if (type === 'trend' || type === 'strong-trend') {
    return hasFund ? { mom: 0.34, tr: 0.30, vol: 0.16, vlt: 0.05, fnd: 0.15 }
                   : { mom: 0.40, tr: 0.34, vol: 0.20, vlt: 0.06, fnd: 0 };
  }
  // Rejim bilinmiyor → varsayılan ağırlıklar
  return hasFund ? { mom: 0.32, tr: 0.20, vol: 0.18, vlt: 0.15, fnd: 0.15 }
                 : { mom: 0.38, tr: 0.24, vol: 0.21, vlt: 0.17, fnd: 0 };
}

// Ana fonksiyon. market: 'us' | 'bist' | 'crypto'
function scoreAsset(ind, fund, market) {
  if (!ind || ind.__insufficient) {
    return { score: null, label: 'VERİ YOK', tone: 'hold', sub: {}, reasons: [{ sentiment: 'neutral', text: 'Yeterli fiyat geçmişi yok' }], summary: 'İndikatör hesaplamak için yeterli veri yok.', regime: null };
  }
  const regime = ind.regime || null;
  const mom = momentumScore(ind, regime);
  const tr = trendScore(ind);
  const vol = volumeScore(ind);
  const vlt = volatilityScore(ind);
  const fnd = market === 'us' ? fundamentalScore(fund) : { score: 0.5, reasons: [], na: true };
  const hasFund = market === 'us' && !fnd.na;

  const w = weightsFor(regime, hasFund);

  const composite = w.mom * mom.score + w.tr * tr.score + w.vol * vol.score + w.vlt * vlt.score + w.fnd * fnd.score;
  let score = Math.round(composite * 100);
  let appliedPeakRisk = false;
  if (score >= 70 && ind.pos52 != null && ind.pos52 >= 0.9 && ind.macd && ind.macd.histogram < 0) {
    score = Math.max(0, score - 8);
    appliedPeakRisk = true;
  }
  const lab = labelFor(score);
  const reasons = []
    .concat(mom.reasons, tr.reasons, vol.reasons, vlt.reasons, fnd.reasons)
    .map((r) => ({ sentiment: r[0], text: r[1] }));

  if (appliedPeakRisk) {
    reasons.push({
      sentiment: 'neg',
      text: '52H zirvesine çok yakın + MACD negatif — tepe riski düzeltmesi (−8 puan)'
    });
  }

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
    regime,
  };
}

module.exports = { scoreAsset, labelFor };
