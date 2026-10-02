// ADX / MFI / rejim sınıflandırması birim testleri (saf matematik).
'use strict';
const assert = require('assert');
const { computeIndicators, adx, mfi, classifyRegime } = require('../src/indicators');

console.log('🧪 Rejim/ADX/MFI indikatör testleri başlatılıyor...\n');

function series(fn, n = 70) {
  const closes = [], highs = [], lows = [], volumes = [];
  for (let i = 0; i < n; i++) {
    const c = fn(i);
    closes.push(c); highs.push(c + 0.5); lows.push(c - 0.5); volumes.push(1000);
  }
  return { closes, highs, lows, volumes };
}

// 1. Temiz yukarı trend → yüksek ADX, regime güçlü-trend yukarı, MFI 100
console.log('1. Yukarı trend → güçlü-trend (yukarı) + MFI=100...');
const up = series((i) => 100 + i);
const upInd = computeIndicators(up);
assert.ok(upInd.adx > 40, 'temiz trendde ADX>40 olmalı, geldi: ' + upInd.adx);
assert.equal(upInd.regime.type, 'strong-trend');
assert.equal(upInd.regime.direction, 'up');
assert.equal(upInd.mfi, 100, 'salt yükselişte MFI=100');
console.log('   ✓ ADX=' + upInd.adx + ', regime=' + upInd.regime.label + ', MFI=' + upInd.mfi);

// 2. Aşağı trend → regime aşağı, MFI düşük
console.log('2. Aşağı trend → trend (aşağı) + MFI düşük...');
const down = series((i) => 200 - i);
const downInd = computeIndicators(down);
assert.equal(downInd.regime.direction, 'down');
assert.ok(downInd.mfi < 50, 'düşüşte MFI<50, geldi: ' + downInd.mfi);
console.log('   ✓ regime=' + downInd.regime.label + ', MFI=' + downInd.mfi);

// 3. Yatay/testere → düşük ADX, regime range (trendin ADX'inden düşük)
console.log('3. Testere piyasa → yatay rejim (düşük ADX)...');
const chop = series((i) => 100 + 2 * Math.sin(i));
const chopInd = computeIndicators(chop);
assert.ok(chopInd.adx < upInd.adx, 'testere ADX trend ADX\'inden düşük olmalı');
assert.equal(chopInd.regime.type, 'range', 'beklenen range, geldi: ' + chopInd.regime.type + ' (ADX ' + chopInd.adx + ')');
console.log('   ✓ ADX=' + chopInd.adx + ', regime=' + chopInd.regime.label);

// 4. classifyRegime eşik sınırları
console.log('4. classifyRegime eşikleri...');
assert.equal(classifyRegime({ adx: 12, plusDI: 30, minusDI: 10 }).type, 'range');
assert.equal(classifyRegime({ adx: 28, plusDI: 30, minusDI: 10 }).type, 'trend');
assert.equal(classifyRegime({ adx: 50, plusDI: 10, minusDI: 30 }).type, 'strong-trend');
assert.equal(classifyRegime({ adx: 50, plusDI: 10, minusDI: 30 }).direction, 'down');
assert.equal(classifyRegime(null), null);
console.log('   ✓ Eşikler ve yön doğru.');

console.log('\n🎉 Tüm rejim/indikatör testleri geçti.');
