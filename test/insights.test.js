// İnsancıl karar/backtest özeti üreticilerinin birim testleri (saf, ağ/Supabase gerekmez).
'use strict';
const assert = require('assert');
const { explainDecision, explainBacktest, buildExecutiveSummary } = require('../public/insights.js');

console.log('🧪 Insights (insancıl özet) testleri başlatılıyor...\n');

// --- explainDecision ---
console.log('1. explainDecision — güçlü AL senaryosu...');
const buyAsset = {
  currency: 'USD',
  market: 'us',
  ind: { regime: { type: 'trend', direction: 'up', adx: 32, label: 'Trend (yukarı)' } },
  analysis: {
    score: 78, label: 'GUCLU AL', tone: 'strong-buy',
    sub: { momentum: 85, trend: 80, hacim: 40, volatilite: 60, temel: 70 },
    reasons: [
      { sentiment: 'pos', text: 'RSI 62 — sağlıklı yükseliş momentumu (ideal 55-70 bölgesi)' },
      { sentiment: 'pos', text: 'Fiyat 50g ve 200g ortalamaların üstünde — ana trend yukarı' },
      { sentiment: 'neg', text: 'OBV (hacim akışı) düşüyor — satış baskısı' },
    ],
  },
  decision: {
    score: 82, status: 'clean',
    freshness: { label: 'Veri taze' },
    confidence: { label: 'Sinyal stabil' },
    contradictions: [],
    trade: { available: true, entry: 100, stop: 95, target: 110, riskReward: 2, positionRiskPct: 2, unitsPer100k: 200 },
  },
};
const dec = explainDecision(buyAsset);
assert.equal(dec.verdict, 'GUCLU AL');
assert.equal(dec.tone, 'strong-buy');
assert.ok(/Güçlü alım sinyali/.test(dec.headline), 'başlık verdict öbeği içermeli');
assert.ok(/momentum/i.test(dec.headline), 'en güçlü alan başlıkta geçmeli');
assert.ok(dec.pros.length >= 2, 'en az 2 lehte madde');
assert.ok(dec.cons.length >= 1, 'en az 1 dikkat maddesi');
assert.ok(/stop/i.test(dec.plan) && /Risk\/Ödül/.test(dec.plan), 'plan stop ve R:R içermeli');
assert.equal(dec.quality.status, 'clean');
assert.equal(dec.quality.statusLabel, 'sağlam');
assert.ok(/Trend \(yukarı\)/.test(dec.regime) && /ADX 32/.test(dec.regime), 'rejim etiketi gelmeli: ' + dec.regime);
assert.ok(/trend yönünde/i.test(dec.suitability), 'uygunluk metni rejimle uyumlu olmalı');
assert.equal(dec.costGate.pass, true, 'hedef %10 >> US maliyeti → kapı geçer');
console.log('   ✓ Başarılı: headline + lehte/dikkat + plan + rejim/uygunluk/maliyet üretildi.');

// 1b. Maliyet kapısı — küçük scalp hedefi elenmeli ve dikkat listesinde ilk sırada olmalı
console.log('1b. Maliyet kapısı küçük hedefi eliyor...');
const scalpAsset = {
  market: 'bist', currency: 'TRY',
  ind: { regime: { type: 'range', adx: 14, label: 'Yatay' } },
  analysis: { score: 62, label: 'AL', tone: 'buy', sub: { momentum: 60, trend: 55, hacim: 55, volatilite: 50 }, reasons: [{ sentiment: 'pos', text: 'RSI 30 — yatayda aşırı satım' }] },
  decision: { score: 70, status: 'clean', contradictions: [], trade: { available: true, entry: 100, stop: 99.5, target: 100.5, riskReward: 1, positionRiskPct: 2 } },
};
const scalp = explainDecision(scalpAsset);
assert.equal(scalp.costGate.pass, false, 'hedef %0.5 < 2× BIST maliyeti → kapı kapalı');
assert.ok(/Maliyet kapısı/.test(scalp.cons[0]), 'maliyet uyarısı ilk dikkat maddesi olmalı: ' + scalp.cons[0]);
assert.ok(/Yatay/.test(scalp.regime));
console.log('   ✓ Başarılı: küçük hedef elendi, maliyet uyarısı öne alındı.');

console.log('2. explainDecision — çelişki en öne alınmalı...');
const contraAsset = {
  currency: 'USD',
  analysis: { score: 62, label: 'AL', tone: 'buy', sub: { momentum: 70, trend: 65, hacim: 30, volatilite: 55 }, reasons: [{ sentiment: 'pos', text: 'RSI 60 — sağlıklı momentum' }] },
  decision: { score: 64, status: 'caution', contradictions: [{ label: 'Tepe riski', detail: 'Skor yüksek ama MACD negatif.', severity: 'high' }], trade: { available: false, reason: 'ATR eksik' } },
};
const dec2 = explainDecision(contraAsset);
assert.ok(/Tepe riski/.test(dec2.cons[0]), 'çelişki ilk dikkat maddesi olmalı');
assert.ok(/veri yetersiz/i.test(dec2.plan), 'plan yoksa uygun mesaj');
console.log('   ✓ Başarılı: çelişki öne alındı, plansız durum yönetildi.');

console.log('3. explainDecision — veri yoksa null...');
assert.equal(explainDecision(null), null);
assert.equal(explainDecision({ analysis: { score: null } }), null);
console.log('   ✓ Başarılı: skor yoksa null döndü.');

// --- explainBacktest ---
console.log('4. explainBacktest — al-tut’u geçen, isabetli strateji...');
const btRes = {
  symbol: 'AAPL', buyThreshold: 70, sellThreshold: 45, strategyReturn: 30, bhReturn: 20,
  equityCurve: [
    { day: 1, total: 10000, price: 100 },
    { day: 2, total: 11000, price: 110 },
    { day: 3, total: 9000, price: 90 },   // 11000 → 9000 ≈ %18.18 düşüş
    { day: 4, total: 13000, price: 130 },
  ],
  trades: [
    { type: 'BUY', day: 1, price: 100 },
    { type: 'SELL', day: 2, price: 110, pnlPct: 10 },
    { type: 'BUY', day: 3, price: 90 },
    { type: 'SELL', day: 4, price: 130, pnlPct: 44 },
  ],
};
const bt = explainBacktest(btRes);
assert.ok(bt.maxDrawdown > 17 && bt.maxDrawdown < 19, 'max düşüş ~%18 olmalı, geldi: ' + bt.maxDrawdown);
assert.equal(bt.winRate, 100);
assert.equal(bt.closedTrades, 2);
assert.equal(bt.beatBH, true);
assert.equal(bt.headlineTone, 'pos');
assert.ok(/Trend belirgin/.test(bt.worksWhen));
assert.ok(bt.breaksWhen.indexOf(String(bt.maxDrawdown)) !== -1, 'breaksWhen max düşüşü içermeli');
console.log('   ✓ Başarılı: maxDD, isabet ve "çalışır/bozulur" anlatısı doğru.');

console.log('5. explainBacktest — hiç alım yoksa uyarı tonu...');
const btNone = { symbol: 'X', buyThreshold: 90, strategyReturn: 0, bhReturn: 5, equityCurve: [{ day: 1, total: 10000, price: 100 }], trades: [] };
const bt2 = explainBacktest(btNone);
assert.equal(bt2.headlineTone, 'warn');
assert.ok(/hiç alım/i.test(bt2.worksWhen));
console.log('   ✓ Başarılı: alımsız senaryo uyarı olarak işaretlendi.');

// --- buildExecutiveSummary ---
console.log('6. buildExecutiveSummary — risk + aksiyon sentezi...');
const snap = {
  marketRegime: {
    us: { type: 'calm', label: 'Rehavet' },
    bist: { type: 'cash', label: 'Nakit' },
    crypto: { type: 'coupled', label: 'Makroya bağlı' },
  },
  topPicks: [{ market: 'ABD', symbol: 'AAPL', label: 'AL', score: 72 }],
  us: [{ analysis: { score: 72 }, decision: { score: 55, contradictions: [{ label: 'x', detail: 'y' }] } }],
  bist: [{ analysis: { score: 60 }, decision: { score: 50, contradictions: [] } }],
  crypto: [{ analysis: { score: 40 }, decision: { score: 45, contradictions: [{ label: 'a', detail: 'b' }, { label: 'c', detail: 'd' }] } }],
};
const ex = buildExecutiveSummary(snap);
assert.ok(ex.riskLevel && ex.riskLevel.label, 'risk seviyesi olmalı');
assert.equal(ex.riskLevel.label, 'Yüksek'); // bist cash(+2) + avgQuality 50<60(+2) + 3 çelişki(+1)
assert.ok(ex.actions.length >= 2 && ex.actions.length <= 4);
const actionsText = ex.actions.join(' ');
assert.ok(/BIST 200g/.test(actionsText), 'BIST nakit aksiyonu olmalı');
assert.ok(/AAPL/.test(actionsText), 'en iyi fırsat aksiyonu olmalı');
assert.ok(/negatif-toplaml/.test(actionsText), 'dürüstlük aksiyonu her zaman son sırada');
assert.equal(buildExecutiveSummary(null), null);
console.log('   ✓ Başarılı: risk=' + ex.riskLevel.label + ', ' + ex.actions.length + ' aksiyon.');

console.log('\n🎉 Tüm insights testleri geçti.');
