// Finansal Forecast Modülleri Birim Testi
'use strict';

const assert = require('assert');
const { calculateDCF, runStressTest, STRESS_SCENARIOS } = require('../src/forecast');

console.log('🧪 Finansal Forecast Birim Testleri Başlatılıyor...\n');

// 1. DCF Hesaplama Testleri
try {
  console.log('1. DCF Hesaplama Matemetik Testi...');
  const dcfParams = {
    currentPrice: 150,
    revenue: 100000,
    sharesOutstanding: 1000,
    revenueGrowthY1Y5: 10,  // %10
    revenueGrowthY6Y10: 5,   // %5
    ebitMargin: 20,          // %20
    taxRate: 20,             // %20
    capexAsPctOfRev: 5,      // %5
    daAsPctOfRev: 3,         // %3
    nwcChangeAsPctOfRev: 1,  // %1
    wacc: 10,                // %10
    terminalGrowthRate: 2,   // %2
    netDebt: 10000
  };

  const dcfResult = calculateDCF(dcfParams);
  
  // Model çıktılarının varlığını kontrol et
  assert.ok(dcfResult.forecast, 'Hata: Tahmin listesi bulunamadı');
  assert.strictEqual(dcfResult.forecast.length, 10, 'Hata: Projeksiyon 10 yıllık olmalıdır');
  assert.ok(dcfResult.fairValue > 0, 'Hata: Adil değer sıfırdan büyük olmalıdır');
  assert.ok(dcfResult.enterpriseValue > 0, 'Hata: Kurumsal değer sıfırdan büyük olmalıdır');
  
  console.log(`   ✓ Başarılı: Adil Değer = ${dcfResult.fairValue}, Güvenlik Marjı = %${dcfResult.marginOfSafety}`);
} catch (e) {
  console.error('❌ DCF Test Hatası:', e.message);
  process.exit(1);
}

// 2. WACC ve Terminal Büyüme Oranı Tutarsızlık Testi
try {
  console.log('2. DCF Hata Yönetimi Testi (WACC <= Terminal Büyüme)...');
  calculateDCF({
    currentPrice: 100,
    revenue: 100000,
    sharesOutstanding: 1000,
    wacc: 2,               // WACC = %2
    terminalGrowthRate: 3  // Terminal Büyüme = %3 (HATA VERMELİ)
  });
  assert.fail('Hata: WACC <= Terminal Büyüme durumunda hata fırlatılmalıydı!');
} catch (e) {
  if (e.message.includes('İndirgeme oranı (WACC)')) {
    console.log('   ✓ Başarılı: Hata beklendiği gibi yakalandı.');
  } else {
    console.error('❌ Hata Yönetimi Test Hatası:', e.message);
    process.exit(1);
  }
}

// 3. Stres Testi Modülü Testleri
try {
  console.log('3. Makro Stres Testi Senaryo Uygulama Testi...');
  const portfolio = {
    us: [{ symbol: 'AAPL', amount: 10, avgPrice: 150 }],
    bist: [{ symbol: 'THYAO', amount: 100, avgPrice: 200 }],
    crypto: [{ symbol: 'BTC', amount: 0.5, avgPrice: 60000 }]
  };

  const latestData = {
    us: [{ symbol: 'AAPL', price: 160, currency: 'USD' }],
    bist: [{ symbol: 'THYAO', price: 220, currency: 'TRY' }],
    crypto: [{ symbol: 'BTC', price: 62000, currency: 'USD' }],
    fx: { rates: { 'USD/TRY': { price: 40, base: 'USD', quote: 'TRY', quoteTime: '2026-09-10T13:00:00Z' } } }
  };

  const stressResults = runStressTest(portfolio, latestData);
  
  assert.ok(stressResults.scenarios, 'Hata: Senaryo sonuçları bulunamadı');
  assert.ok(stressResults.currentPortfolioValueUSD > 0, 'Hata: Portföy değeri sıfırdan büyük olmalı');
  
  const stagflation = stressResults.scenarios.stagflation;
  assert.ok(stagflation, 'Hata: Stagflasyon senaryosu bulunamadı');
  assert.ok(stagflation.newUSD < stagflation.oldUSD, 'Hata: Stagflasyonda portföy değeri düşmeli');
  
  console.log(`   ✓ Başarılı: Başlangıç Değeri (USD) = $${stressResults.currentPortfolioValueUSD}`);
  console.log(`   ✓ Stagflasyon Sonrası Değer (USD) = $${stagflation.newUSD} (Değişim: %${stagflation.pctChange})`);
} catch (e) {
  console.error('❌ Stres Testi Hata:', e.message);
  process.exit(1);
}

console.log('\n🎉 TÜM HESAPLAMA TESTLERİ BAŞARIYLA TAMAMLANDI!\n');
process.exit(0);
