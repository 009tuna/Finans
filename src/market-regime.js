// Piyasa-SEVİYESİ rejim tespiti (tek varlık ADX'inin üstünde, piyasa geneli).
//  - US:     VIX seviyesi → rehavet/normal/stres/panik (mean-reversion vs breakout)
//  - Kripto: BTC–Nasdaq getiri korelasyonu → bağlı / kopuş / karışık
//  - BIST:   BIST100 fiyat vs SMA200 → long rejim aktif / nakit (açığa satış yasağı)
// Sınıflandırma fonksiyonları SAF (test edilebilir); seri çekme fetch-all'da.
'use strict';

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

// İki getiri serisi arasında Pearson korelasyonu (eşit uzunlukta olmalı)
function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  const xs = x.slice(-n), ys = y.slice(-n);
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

// İki bar serisini tarihe göre hizalayıp son `window` günlük getiri korelasyonunu döndürür.
function returnsCorrelation(barsA, barsB, window = 30) {
  if (!Array.isArray(barsA) || !Array.isArray(barsB)) return null;
  const dayA = {}, dayB = {};
  barsA.forEach(b => { dayA[new Date(b.time * 1000).toISOString().slice(0, 10)] = b.close; });
  barsB.forEach(b => { dayB[new Date(b.time * 1000).toISOString().slice(0, 10)] = b.close; });
  const common = Object.keys(dayA).filter(d => dayB[d] != null).sort();
  if (common.length < window + 1) {
    if (common.length < 3) return null;
  }
  const closesA = common.map(d => dayA[d]);
  const closesB = common.map(d => dayB[d]);
  const retA = [], retB = [];
  for (let i = 1; i < common.length; i++) {
    retA.push((closesA[i] - closesA[i - 1]) / (closesA[i - 1] || 1));
    retB.push((closesB[i] - closesB[i - 1]) / (closesB[i - 1] || 1));
  }
  const w = Math.min(window, retA.length);
  return pearson(retA.slice(-w), retB.slice(-w));
}

// --- Sınıflandırıcılar (saf) ---
function classifyVix(vix) {
  if (vix == null || isNaN(vix)) return null;
  let type, advice;
  if (vix < 18) { type = 'calm'; advice = 'Düşük volatilite (rehavet) — hisseler ortalamaya dönme eğiliminde; mean-reversion uygun, trend takibi zor.'; }
  else if (vix < 22) { type = 'normal'; advice = 'Normal volatilite — net rejim yok; seçici ol.'; }
  else if (vix < 30) { type = 'stress'; advice = 'Yüksek volatilite (stres) — momentum/breakout uygun; pozisyon küçült.'; }
  else { type = 'panic'; advice = 'Panik bölgesi — çok sert hareketler; çoğu kısa-vade için nakit daha güvenli.'; }
  const labelMap = { calm: 'Rehavet', normal: 'Normal', stress: 'Stres', panic: 'Panik' };
  return { metric: 'VIX', value: Math.round(vix * 100) / 100, type, label: labelMap[type], advice };
}

function classifyBistTrend(price, sma200) {
  if (price == null || sma200 == null) return null;
  const above = price > sma200;
  const distPct = Math.round(((price - sma200) / sma200) * 1000) / 10;
  return {
    metric: 'BIST100 vs SMA200',
    value: distPct, // % uzaklık
    type: above ? 'long-ok' : 'cash',
    label: above ? 'Long rejim aktif' : 'Nakit / temkin',
    advice: above
      ? `BIST100 200g ortalamanın %${distPct} üstünde — yükseliş rejimi; likit büyüklerde long işlemler mantıklı.`
      : `BIST100 200g ortalamanın %${Math.abs(distPct)} ALTINDA — açığa satış yasağı nedeniyle kısa-vadede nakit/temkin daha güvenli.`,
  };
}

function classifyBtcNasdaqCorr(corr) {
  if (corr == null || isNaN(corr)) return null;
  let type, advice;
  if (corr >= 0.5) { type = 'coupled'; advice = 'BTC, Nasdaq ile yüksek korelasyon — makro/risk-on-off ile birlikte hareket ediyor; bağımsız kripto sinyalleri zayıf.'; }
  else if (corr <= -0.3) { type = 'decoupled'; advice = 'BTC–Nasdaq kopuşu (negatif) — geçici ayrışma; tarihsel olarak ortalamaya dönüş (yeniden yakınsama) ihtimali yüksek.'; }
  else { type = 'mixed'; advice = 'BTC–Nasdaq korelasyonu zayıf/karışık — net makro bağ yok.'; }
  return { metric: 'BTC–Nasdaq 30g korelasyon', value: Math.round(corr * 100) / 100, type, label: type === 'coupled' ? 'Makroya bağlı' : type === 'decoupled' ? 'Kopuş' : 'Karışık', advice };
}

// bars: [{time, close}]. Eksik girdilerde ilgili rejim null döner.
function computeMarketRegimes({ vixBars, nasdaqBars, btcBars, bistBars } = {}) {
  const vix = vixBars && vixBars.length ? vixBars[vixBars.length - 1].close : null;
  let bistPrice = null, bistSma200 = null;
  if (bistBars && bistBars.length) {
    bistPrice = bistBars[bistBars.length - 1].close;
    if (bistBars.length >= 200) {
      const last200 = bistBars.slice(-200).map(b => b.close);
      bistSma200 = last200.reduce((a, b) => a + b, 0) / 200;
    }
  }
  const corr = returnsCorrelation(btcBars, nasdaqBars, 30);
  return {
    us: classifyVix(vix),
    bist: classifyBistTrend(bistPrice, bistSma200),
    crypto: classifyBtcNasdaqCorr(corr),
  };
}

module.exports = {
  pearson,
  returnsCorrelation,
  classifyVix,
  classifyBistTrend,
  classifyBtcNasdaqCorr,
  computeMarketRegimes,
};
