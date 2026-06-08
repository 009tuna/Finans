// Genişletilmiş Finansal Forecast Modülleri Birim Testi
'use strict';

const assert = require('assert');
const { calculateGraham, calculateDDM, calculateCorrelationMatrix } = require('../src/forecast');

console.log('🧪 Genişletilmiş Finansal Forecast Birim Testleri Başlatılıyor...\n');

// 1. Benjamin Graham Hesaplama Testleri
try {
  console.log('1. Benjamin Graham Değerleme Formülü Testi...');
  const grahamParams = {
    currentPrice: 150,
    eps: 6.5,
    growthRate: 8.5,
    aaaBondYield: 4.5
  };

  const result = calculateGraham(grahamParams);
  
  assert.ok(result.fairValue > 0, 'Hata: Graham adil değer sıfırdan büyük olmalıdır');
  assert.strictEqual(result.parameters.eps, 6.5);
  assert.strictEqual(result.parameters.growthRate, 8.5);
  
  // V = (6.5 * (8.5 + 2 * 8.5) * 4.4) / 4.5 = (6.5 * 25.5 * 4.4) / 4.5 = 729.3 / 4.5 = 162.066...
  const expectedValue = Math.round(((6.5 * (8.5 + 2 * 8.5) * 4.4) / 4.5) * 100) / 100;
  assert.strictEqual(result.fairValue, expectedValue, `Hata: Graham adil değeri beklenen ${expectedValue} değerinden farklı: ${result.fairValue}`);
  
  console.log(`   ✓ Başarılı: Graham Adil Değer = ${result.fairValue}, Güvenlik Marjı = %${result.marginOfSafety}`);
} catch (e) {
  console.error('❌ Graham Test Hatası:', e.message);
  process.exit(1);
}

// 2. Graham Hata Yönetimi Testi
try {
  console.log('2. Graham Hata Yönetimi Testi (AAA Yield <= 0)...');
  calculateGraham({
    currentPrice: 100,
    eps: 5,
    aaaBondYield: 0
  });
  assert.fail('Hata: AAA Yield <= 0 durumunda hata fırlatılmalıydı!');
} catch (e) {
  if (e.message.includes('AAA kurumsal tahvil faizi sıfırdan büyük olmalıdır')) {
    console.log('   ✓ Başarılı: Hata beklendiği gibi yakalandı.');
  } else {
    console.error('❌ Graham Hata Yönetimi Test Hatası:', e.message);
    process.exit(1);
  }
}

// 3. DDM (Dividend Discount Model) Hesaplama Testleri
try {
  console.log('3. Temettü İndirgeme Modeli (DDM) Testi...');
  const ddmParams = {
    currentPrice: 80,
    recentDividend: 3.5,
    dividendGrowthRate: 5, // %5
    wacc: 10 // %10
  };

  const result = calculateDDM(ddmParams);
  
  assert.ok(result.fairValue > 0, 'Hata: DDM adil değer sıfırdan büyük olmalıdır');
  // P = (3.5 * (1 + 0.05)) / (0.10 - 0.05) = 3.675 / 0.05 = 73.5
  assert.strictEqual(result.fairValue, 73.5, `Hata: DDM adil değeri beklenen 73.5 değerinden farklı: ${result.fairValue}`);
  
  console.log(`   ✓ Başarılı: DDM Adil Değer = ${result.fairValue}, Güvenlik Marjı = %${result.marginOfSafety}`);
} catch (e) {
  console.error('❌ DDM Test Hatası:', e.message);
  process.exit(1);
}

// 4. DDM Hata Yönetimi Testi (WACC <= Dividend Growth)
try {
  console.log('4. DDM Hata Yönetimi Testi (WACC <= Temettü Büyüme)...');
  calculateDDM({
    currentPrice: 100,
    recentDividend: 2,
    dividendGrowthRate: 8,
    wacc: 8
  });
  assert.fail('Hata: WACC <= Temettü Büyüme durumunda hata fırlatılmalıydı!');
} catch (e) {
  if (e.message.includes('İskonto oranı (WACC)')) {
    console.log('   ✓ Başarılı: Hata beklendiği gibi yakalandı.');
  } else {
    console.error('❌ DDM Hata Yönetimi Test Hatası:', e.message);
    process.exit(1);
  }
}

// 5. Korelasyon Matrisi Boş Portföy Testi
try {
  console.log('5. Korelasyon Matrisi Boş/Tek Varlık Testi...');
  calculateCorrelationMatrix({ assets: [] }).then(res => {
    assert.deepStrictEqual(res.matrix, [], 'Hata: Boş portföy boş matris vermeli');
    return calculateCorrelationMatrix({ assets: [{ symbol: 'AAPL', market: 'us' }] });
  }).then(res => {
    assert.deepStrictEqual(res.matrix, [[1.0]], 'Hata: Tek varlık [[1.0]] matris vermeli');
    console.log('   ✓ Başarılı: Korelasyon kenar durumları doğru yönetildi.');
  }).catch(e => {
    console.error('❌ Korelasyon Test Hatası:', e.message);
    process.exit(1);
  });
} catch (e) {
  console.error('❌ Korelasyon Dış Test Hatası:', e.message);
  process.exit(1);
}

// Sonlandırma
setTimeout(() => {
  console.log('\n🎉 TÜM GENİŞLETİLMİŞ HESAPLAMA TESTLERİ BAŞARIYLA TAMAMLANDI!\n');
  process.exit(0);
}, 200);
