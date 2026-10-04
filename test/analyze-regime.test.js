// Rejime duyarlı skorlama testleri: aynı RSI farklı rejimde farklı momentum üretmeli.
'use strict';
const assert = require('assert');
const { scoreAsset } = require('../src/analyze');
const { obv } = require('../src/indicators');

console.log('🧪 Rejim-farkında skorlama testleri başlatılıyor...\n');

function makeInd(rsi, regimeType, extra) {
  return Object.assign({
    rsi,
    macd: { macd: 0, signal: 0, histogram: 0, prevHistogram: 0 },
    ret1w: 0,
    bollinger: { pctB: 0.5, bandwidth: 5 },
    atrPct: 2.5,
    volatility: 40,
    obv: { rising: true },
    volSpike: 1.0,
    mfi: 50,
    signals: { priceAboveSma20: true, priceAboveSma50: true, priceAboveSma200: true, sma50AboveSma200: true, goldenCross: false, deathCross: false, distSma50: 1 },
    pos52: 0.5,
    regime: regimeType ? { type: regimeType, direction: 'up', adx: regimeType === 'range' ? 12 : 30, label: regimeType } : null,
  }, extra || {});
}

// 1. Aşırı satım (RSI 25): YATAY rejimde momentum yüksek (alım), TRENDDE düşük (zayıflık)
console.log('1. RSI 25 — yatayda mean-reversion, trendde zayıflık...');
const rangeLow = scoreAsset(makeInd(25, 'range'), null, 'crypto');
const trendLow = scoreAsset(makeInd(25, 'trend'), null, 'crypto');
assert.ok(rangeLow.sub.momentum > trendLow.sub.momentum,
  `yatay momentum (${rangeLow.sub.momentum}) > trend momentum (${trendLow.sub.momentum}) olmalı`);
console.log(`   ✓ yatay momentum=${rangeLow.sub.momentum} > trend momentum=${trendLow.sub.momentum}`);

// 2. Aşırı alım (RSI 78): YATAY rejimde cezalı, TRENDDE normal
console.log('2. RSI 78 — yatayda cezalı, trendde normal...');
const rangeHigh = scoreAsset(makeInd(78, 'range'), null, 'crypto');
const trendHigh = scoreAsset(makeInd(78, 'trend'), null, 'crypto');
assert.ok(trendHigh.sub.momentum > rangeHigh.sub.momentum,
  `trend momentum (${trendHigh.sub.momentum}) > yatay momentum (${rangeHigh.sub.momentum}) olmalı`);
console.log(`   ✓ trend momentum=${trendHigh.sub.momentum} > yatay momentum=${rangeHigh.sub.momentum}`);

// 3. Rejim çıktıya yansımalı
console.log('3. analysis.regime geçişi...');
assert.equal(rangeLow.regime.type, 'range');
assert.equal(trendHigh.regime.type, 'trend');
console.log('   ✓ regime analysis çıktısında mevcut.');

// 4. MFI hacim skorunu etkilemeli
console.log('4. MFI hacim alt-skorunu etkiliyor...');
const hiMfi = scoreAsset(makeInd(50, 'trend', { mfi: 90 }), null, 'crypto');
const loMfi = scoreAsset(makeInd(50, 'trend', { mfi: 10 }), null, 'crypto');
assert.ok(hiMfi.sub.hacim > loMfi.sub.hacim,
  `yüksek MFI hacim (${hiMfi.sub.hacim}) > düşük MFI hacim (${loMfi.sub.hacim})`);
console.log(`   ✓ MFI90 hacim=${hiMfi.sub.hacim} > MFI10 hacim=${loMfi.sub.hacim}`);

// 5. Rejimsiz (regime=null) hâlâ geçerli skor üretmeli (geriye uyumluluk)
console.log('5. Rejimsiz geriye uyumluluk...');
const noReg = scoreAsset(makeInd(60, null), null, 'crypto');
assert.ok(noReg.score >= 0 && noReg.score <= 100);
assert.equal(noReg.regime, null);
console.log('   ✓ Rejim yoksa varsayılan skorlama çalışıyor, skor=' + noReg.score);

// 6. Top-risk scoring adjustment (Phase 2a)
console.log('6. Top-risk scoring adjustment...');
const indTopRisk = makeInd(65, 'trend', {
  pos52: 0.95,
  macd: { macd: 0, signal: 0, histogram: -0.5, prevHistogram: -0.2 }
});
const resTopRisk = scoreAsset(indTopRisk, null, 'crypto');

const indNormalRisk = makeInd(65, 'trend', {
  pos52: 0.85,
  macd: { macd: 0, signal: 0, histogram: -0.5, prevHistogram: -0.2 }
});
const resNormalRisk = scoreAsset(indNormalRisk, null, 'crypto');

assert.equal(resNormalRisk.score - resTopRisk.score, 8, 'Top-risk asset score should be exactly 8 points lower');
assert.ok(resTopRisk.reasons.some((r) => r.sentiment === 'neg' && r.text.includes('tepe riski düzeltmesi')), 'Top-risk reason should be attached');
assert.ok(!resNormalRisk.reasons.some((r) => r.text.includes('tepe riski düzeltmesi')), 'Normal risk should not have the top-risk warning');
console.log('   ✓ Top-risk adjustment decreases score by 8 points and attaches warning reason');

// 7. Flat volume flow and an old false rising flag do not prove selling pressure.
console.log('7. OBV artan / azalan / düz yönü ve eski veri belirsizliği...');
const zeroFlow = obv([100, 101, 102], [0, 0, 0]);
const flatFlow = obv([100, 101, 100], [1000, 1000, 1000]);
const upFlow = obv([100, 101, 102], [1000, 1000, 1000]);
const downFlow = obv([102, 101, 100], [1000, 1000, 1000]);
assert.deepEqual(zeroFlow, { value: 0, rising: false, direction: 'flat' });
assert.deepEqual(flatFlow, { value: 0, rising: false, direction: 'flat' });
assert.deepEqual(upFlow, { value: 2000, rising: true, direction: 'up' });
assert.deepEqual(downFlow, { value: -2000, rising: false, direction: 'down' });
const scoredFlow = (flow) => scoreAsset(makeInd(50, 'trend', { obv: flow }), null, 'crypto');
const flatScored = scoredFlow(flatFlow);
const downScored = scoredFlow(downFlow);
const upScored = scoredFlow(upFlow);
const legacyScored = scoredFlow({ value: 0, rising: false });
const flowReason = (scored) => scored.reasons.find((reason) => reason.text.startsWith('OBV '));
assert.equal(flowReason(flatScored).sentiment, 'neutral');
assert.ok(flowReason(flatScored).text.includes('yatay'));
assert.ok(!flowReason(flatScored).text.includes('satış baskısı'));
assert.equal(flowReason(downScored).sentiment, 'neg');
assert.ok(flowReason(downScored).text.includes('düşüyor'));
assert.equal(flowReason(upScored).sentiment, 'pos');
assert.ok(flowReason(upScored).text.includes('yükseliyor'));
assert.equal(flowReason(legacyScored).sentiment, 'neutral');
assert.ok(flowReason(legacyScored).text.includes('yön bilgisi eksik'));
assert.ok(!flowReason(legacyScored).text.includes('düşüyor'));
// Only evidence and wording changed: the existing false-rising score branch remains.
assert.deepEqual(flatScored.sub, downScored.sub);
assert.equal(flatScored.score, downScored.score);
assert.equal(legacyScored.score, downScored.score);
assert.ok(upScored.sub.hacim > downScored.sub.hacim);
console.log('   ✓ Düz/eksik yön satış baskısı değil; mevcut puanlama korunuyor.');

console.log('\n🎉 Tüm rejim-farkında skorlama testleri geçti.');
