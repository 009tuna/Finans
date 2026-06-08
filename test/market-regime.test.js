// Piyasa-seviye rejim (VIX / BIST-SMA200 / BTC-Nasdaq korelasyon) testleri.
'use strict';
const assert = require('assert');
const { classifyVix, classifyBistTrend, classifyBtcNasdaqCorr, returnsCorrelation, computeMarketRegimes } = require('../src/market-regime');

console.log('🧪 Piyasa-seviye rejim testleri başlatılıyor...\n');

console.log('1. VIX sınıflandırması...');
assert.equal(classifyVix(15).type, 'calm');
assert.equal(classifyVix(20).type, 'normal');
assert.equal(classifyVix(25).type, 'stress');
assert.equal(classifyVix(35).type, 'panic');
assert.equal(classifyVix(null), null);
assert.ok(/mean-reversion/i.test(classifyVix(15).advice));
console.log('   ✓ rehavet/normal/stres/panik eşikleri doğru.');

console.log('2. BIST SMA200 kapısı...');
assert.equal(classifyBistTrend(110, 100).type, 'long-ok');
assert.equal(classifyBistTrend(110, 100).value, 10);
assert.equal(classifyBistTrend(90, 100).type, 'cash');
assert.ok(/açığa satış/i.test(classifyBistTrend(90, 100).advice));
console.log('   ✓ 200g üstü=long, altı=nakit (yasak uyarısı).');

console.log('3. BTC–Nasdaq korelasyon sınıfı...');
assert.equal(classifyBtcNasdaqCorr(0.8).type, 'coupled');
assert.equal(classifyBtcNasdaqCorr(-0.5).type, 'decoupled');
assert.equal(classifyBtcNasdaqCorr(0.1).type, 'mixed');
console.log('   ✓ bağlı/kopuş/karışık doğru.');

console.log('4. returnsCorrelation hizalama + Pearson...');
const t0 = 1700000000;
const mk = (fn, n = 40) => Array.from({ length: n }, (_, i) => ({ time: t0 + i * 86400, close: fn(i) }));
const a = mk(i => 100 + 5 * Math.sin(i));
const same = mk(i => 100 + 5 * Math.sin(i));
const opp = mk(i => 100 - 5 * Math.sin(i));
assert.ok(returnsCorrelation(a, same, 30) > 0.9, 'aynı seri ~+1 olmalı');
assert.ok(returnsCorrelation(a, opp, 30) < -0.9, 'ters seri ~-1 olmalı');
console.log('   ✓ korelasyon: aynı≈+1, ters≈−1.');

console.log('5. computeMarketRegimes birleşik...');
const reg = computeMarketRegimes({
  vixBars: mk(() => 14, 5),
  nasdaqBars: a,
  btcBars: same,
  bistBars: mk(i => 100 + i, 210), // yükselen, SMA200 üstünde
});
assert.equal(reg.us.type, 'calm');
assert.equal(reg.bist.type, 'long-ok');
assert.equal(reg.crypto.type, 'coupled');
console.log('   ✓ us=calm, bist=long-ok, crypto=coupled.');

console.log('\n🎉 Tüm piyasa-rejim testleri geçti.');
