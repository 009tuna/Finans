// İşlem maliyeti modeli ve maliyet kapısı testleri.
'use strict';
const assert = require('assert');
const { roundTripCost, oneWayCost, costGate } = require('../src/costs');

console.log('🧪 Maliyet modeli testleri başlatılıyor...\n');

console.log('1. Piyasa-başı round-trip maliyet...');
assert.equal(roundTripCost('us'), 0.001);
assert.equal(roundTripCost('bist'), 0.004);
assert.equal(roundTripCost('crypto'), 0.002);
assert.equal(roundTripCost('CRYPTO'), 0.002); // büyük harf
assert.equal(roundTripCost('bilinmeyen'), 0.002); // varsayılan
assert.equal(oneWayCost('bist'), 0.002);
console.log('   ✓ US %0.1 · BIST %0.4 · Kripto %0.2');

console.log('2. Maliyet kapısı — hedef < 2× maliyet → geç(me)...');
// BIST round-trip %0.4. Hedef %0.5 → oran 1.25 → BAŞARISIZ (scalp anlamsız)
const g1 = costGate('bist', 0.5);
assert.equal(g1.pass, false);
assert.equal(g1.ratio, 1.25);
// BIST hedef %4 → oran 10 → BAŞARILI (swing mantıklı)
const g2 = costGate('bist', 4);
assert.equal(g2.pass, true);
assert.ok(g2.ratio >= 2);
// US hedef %0.15 → oran 1.5 → başarısız
assert.equal(costGate('us', 0.15).pass, false);
console.log('   ✓ Kapı doğru: küçük scalp hedefleri eleniyor, swing geçiyor.');

console.log('\n🎉 Tüm maliyet testleri geçti.');
