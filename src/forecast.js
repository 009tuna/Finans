// Finansal Projeksiyon ve Tahmin (Forecast) Motoru
// Monte Carlo simülasyonu, DCF şirketi değerlemesi ve makro stres testleri.
'use strict';

const { fetchAssetChart } = require('./chart-data');
const { completedChartHistory } = require('./daily-history');

// Box-Muller transformasyonu ile normal dağılımlı rastgele sayı üretimi
function boxMullerRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // [0,1) aralığından (0,1) aralığına çevrim
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Ortalama hesaplama
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Standart sapma hesaplama
function std(arr, avg) {
  if (arr.length <= 1) return 0;
  const mu = avg !== undefined ? avg : mean(arr);
  const sumSq = arr.reduce((a, b) => a + Math.pow(b - mu, 2), 0);
  return Math.sqrt(sumSq / (arr.length - 1));
}

/**
 * Monte Carlo Simülasyonu çalıştırır.
 * @param {Array} assets - USD fiyatlı varlıklar: [{ symbol, market, amount, price, currency }]
 * @param {number} horizon - Gün cinsinden simülasyon süresi (örn. 30, 90, 365)
 * @param {number} monthlySaving - Aylık eklenecek nakit tasarrufu
 * @param {number} numPaths - Simüle edilecek yol sayısı (örn. 2000)
 */
async function runMonteCarlo({ assets, horizon = 365, monthlySaving = 0, numPaths = 2000 } = {}) {
  const cutoffMs = Date.now();
  if (!Array.isArray(assets) || !assets.length) {
    throw new Error('Simülasyon için portföy varlığı bulunamadı');
  }
  if (assets.length > 200) throw new Error('Simülasyonda en fazla 200 pozisyon kullanılabilir');
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 1095) {
    throw new Error('Simülasyon süresi 1–1095 arasında tam gün olmalıdır');
  }
  if (typeof monthlySaving !== 'number' || !Number.isFinite(monthlySaving) || monthlySaving < 0 || monthlySaving > 1e9) {
    throw new Error('Aylık tasarruf 0–1 milyar arasında geçerli bir USD tutarı olmalıdır');
  }
  if (!Number.isInteger(numPaths) || numPaths < 10 || numPaths > 5000 || numPaths * (horizon + 1) > 2e6) {
    throw new Error('Simülasyon yol sayısı 10–5000 arasında olmalı; toplam hesaplama sınırı aşılmamalıdır');
  }
  const positiveNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const maxMoney = Number.MAX_VALUE / 100; // Sonuçları sent hassasiyetine yuvarlarken taşmayı engelle.
  const samePrice = (left, right) => positiveNumber(left) && positiveNumber(right) && Math.abs(left / right - 1) <= 1e-8;
  const validQuoteTime = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const date = value.slice(0, 10);
    return new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date && Number(value.slice(11, 13)) < 24;
  };
  let initialPortfolioValue = 0;
  const values = assets.map(asset => {
    if (!asset || typeof asset.symbol !== 'string' || !asset.symbol.trim() || asset.symbol.length > 64 || !['us', 'bist', 'crypto'].includes(asset.market)) {
      throw new Error('Her pozisyon için geçerli bir sembol ve piyasa gerekir');
    }
    if (asset.currency !== 'USD') throw new Error(asset.symbol + ': simülasyon fiyatı ortak para birimi USD olmalıdır');
    if (!positiveNumber(asset.amount) || !positiveNumber(asset.price)) {
      throw new Error(asset.symbol + ': adet ve USD fiyatı pozitif sayılar olmalıdır');
    }
    if (asset.market === 'bist') {
      if (asset.originalCurrency !== 'TRY' || !positiveNumber(asset.originalPrice) || !positiveNumber(asset.fxRate) || !validQuoteTime(asset.fxQuoteTime)) {
        throw new Error(asset.symbol + ': BIST fiyatı için TRY fiyatı, USD/TRY kuru ve açık kur zamanı gerekir');
      }
      if (!samePrice(asset.price, asset.originalPrice / asset.fxRate)) {
        throw new Error(asset.symbol + ': USD fiyatı belirtilen TRY fiyatı ve kur dönüşümüyle uyuşmuyor');
      }
    } else if ((asset.originalCurrency !== undefined && asset.originalCurrency !== 'USD') ||
      (asset.originalPrice !== undefined && (!positiveNumber(asset.originalPrice) || !samePrice(asset.price, asset.originalPrice)))) {
      throw new Error(asset.symbol + ': kaynak fiyat ve para birimi USD fiyatıyla uyuşmuyor');
    }
    const value = asset.amount * asset.price;
    if (!positiveNumber(value) || value > maxMoney) throw new Error(asset.symbol + ': pozisyonun USD değeri geçersiz');
    initialPortfolioValue += value;
    return value;
  });
  if (!positiveNumber(initialPortfolioValue) || initialPortfolioValue > maxMoney) throw new Error('Portföyün toplam USD değeri geçersiz');

  // 1. Tüm varlıkların 1 yıllık tarihsel günlük verilerini çek
  const fetchPromises = assets.map(async (asset) => {
    try {
      const chart = await fetchAssetChart({
        market: asset.market,
        symbol: asset.symbol,
        interval: '1d',
        range: '1y'
      });
      const completed = completedChartHistory(chart,asset.market,cutoffMs);
      const dailyBars = new Map();
      completed.bars.slice().sort((a, b) => a.time - b.time).forEach(bar => {
        if (!bar || !positiveNumber(bar.time) || !positiveNumber(bar.close) || !Number.isFinite(new Date(bar.time * 1000).getTime())) {
          throw new Error('Tarihsel fiyat veya zaman geçersiz');
        }
        const date = bar.date;
        dailyBars.set(date, { time: bar.time, close: bar.close, date });
      });
      if (dailyBars.size < 6) throw new Error('En az 6 ayrı günlük tarihsel fiyat gerekir');
      return {
        symbol: asset.symbol,
        market: asset.market,
        amount: asset.amount,
        currentPrice: asset.price,
        bars: Array.from(dailyBars.values()),
        history: {
          market: asset.market, symbol: asset.symbol,
          source: typeof chart.source === 'string' ? chart.source : null,
          currency: completed.currency,
          fetchedAt: completed.completion.observedAt,
          completion: completed.completion,
        }
      };
    } catch (e) {
      throw new Error(asset.symbol + ': tarihsel veri alınamadı (' + e.message + '). Portföyün tamamı simüle edilmedi');
    }
  });

  const loadedAssets = await Promise.all(fetchPromises);

  // 2. Ortak gözlenen kapsamda takvim günü bazında hizalama.
  // Gelecekteki ilk fiyatı geçmişe yazma veya son gözlemden sonra kapsamı uzatma.
  const historyStartDate = loadedAssets.map(asset => asset.bars[0].date).sort().pop();
  const historyEndDate = loadedAssets.map(asset => asset.bars[asset.bars.length - 1].date).sort()[0];
  const firstCalendarDay = Date.parse(historyStartDate);
  const nDays = Math.round((Date.parse(historyEndDate) - firstCalendarDay) / 86400000) + 1;
  if (!Number.isInteger(nDays) || nDays < 6 || nDays > 3660) {
    throw new Error('Simülasyon için en az 6 ortak takvim günü içeren geçerli tarihsel kapsam gerekir');
  }
  const sortedDates = Array.from({ length: nDays }, (_, day) => new Date(firstCalendarDay + day * 86400000).toISOString().slice(0, 10));
  // Yeni gözlem olmayan günlerde yalnız daha önce gözlenen yerel kapanışı taşı.
  // Bu günlerin kapalı borsa günü mü veri boşluğu mu olduğunu varsayma.
  const assetPrices = loadedAssets.map(asset => {
    const observedDailyPrices = asset.bars.filter(bar => bar.date >= historyStartDate && bar.date <= historyEndDate).length;
    if (observedDailyPrices < 6) throw new Error(asset.symbol + ': ortak tarih kapsamında en az 6 gözlenen günlük kapanış gerekir');
    let barIndex = 0;
    let lastPrice = null;
    let lastObservedDate = null;
    let carriedForwardDays = 0;
    const prices = sortedDates.map(date => {
      while (barIndex < asset.bars.length && asset.bars[barIndex].date <= date) {
        lastPrice = asset.bars[barIndex].close;
        lastObservedDate = asset.bars[barIndex].date;
        barIndex++;
      }
      if (!positiveNumber(lastPrice)) throw new Error(asset.symbol + ': bu tarihte geçmişten taşınabilecek gözlenen fiyat yok');
      if (lastObservedDate !== date) carriedForwardDays++;
      return lastPrice;
    });
    asset.history.observedDailyPricesInOverlap = observedDailyPrices;
    asset.history.carriedForwardDays = carriedForwardDays;
    return prices;
  });

  // Günlük getirileri hesapla
  const assetReturns = assetPrices.map(prices => {
    const rets = new Array(nDays - 1);
    for (let i = 0; i < nDays - 1; i++) {
      const prev = prices[i];
      rets[i] = (prices[i + 1] - prev) / prev;
      if (!Number.isFinite(rets[i])) throw new Error('Tarihsel getiriler geçerli sayılar olmalıdır');
    }
    return rets;
  });

  // Portföy toplam başlangıç değeri ve varlık ağırlıkları
  const weights = values.map(v => v / initialPortfolioValue);

  // 3. Portföy düzeyinde birleşik tarihsel getirilerin hesaplanması
  const nReturns = nDays - 1;
  const portfolioReturns = new Array(nReturns);
  for (let t = 0; t < nReturns; t++) {
    let dayRet = 0;
    for (let i = 0; i < loadedAssets.length; i++) {
      dayRet += weights[i] * assetReturns[i][t];
    }
    portfolioReturns[t] = dayRet;
  }

  // Portföyün tarihsel ortalama günlük getirisi ve standart sapması (oynaklığı)
  const mu_d = mean(portfolioReturns);
  const sigma_d = std(portfolioReturns, mu_d);

  // Tarihçe ve ileri adımlar aynı takvim günü birimindedir; 365 adım bir yıldır.
  const daysPerYear = 365;
  const annualizedReturn = Math.pow(1 + mu_d, daysPerYear) - 1;
  const annualizedVol = sigma_d * Math.sqrt(daysPerYear);
  if (![mu_d * 100000, sigma_d * 100000, annualizedReturn * 10000, annualizedVol * 10000].every(Number.isFinite)) {
    throw new Error('Tarihsel getiri ve oynaklık simülasyon sınırlarını aşıyor');
  }

  // 4. Geleceğe Yönelik Monte Carlo Patikalarının Simülasyonu
  const dailySaving = monthlySaving * 12 / daysPerYear; // Bir yılda 12 aylık tasarrufu eşit günlük paylarla ekle.
  const paths = [];

  for (let p = 0; p < numPaths; p++) {
    const path = new Array(horizon + 1);
    path[0] = initialPortfolioValue;
    let currentVal = initialPortfolioValue;

    for (let d = 1; d <= horizon; d++) {
      const Z = boxMullerRandom();
      const dailyRet = mu_d + sigma_d * Z;
      currentVal = Math.max(0, currentVal * (1 + dailyRet) + dailySaving);
      if (!Number.isFinite(currentVal) || currentVal > maxMoney) throw new Error('Simülasyon değeri sayısal hesaplama sınırını aştı');
      path[d] = currentVal; // Bakiye sıfırın altına inmesin
    }
    paths.push(path);
  }

  // 5. Gün bazında yüzdeliklerin (percentiles) hesaplanması
  const percentiles = {
    pessimistic: new Array(horizon + 1), // 10. Yüzdelik
    median: new Array(horizon + 1),      // 50. Yüzdelik
    optimistic: new Array(horizon + 1)   // 90. Yüzdelik
  };

  for (let d = 0; d <= horizon; d++) {
    const valsAtDay = paths.map(path => path[d]).sort((a, b) => a - b);
    percentiles.pessimistic[d] = Math.round(valsAtDay[Math.floor(numPaths * 0.1)] * 100) / 100;
    percentiles.median[d] = Math.round(valsAtDay[Math.floor(numPaths * 0.5)] * 100) / 100;
    percentiles.optimistic[d] = Math.round(valsAtDay[Math.floor(numPaths * 0.9)] * 100) / 100;
  }

  return {
    currency: 'USD',
    initialValue: Math.round(initialPortfolioValue * 100) / 100,
    horizon,
    monthlySaving,
    mu_d: Math.round(mu_d * 100000) / 100000,
    sigma_d: Math.round(sigma_d * 100000) / 100000,
    annualizedReturn: Math.round(annualizedReturn * 10000) / 100,
    annualizedVol: Math.round(annualizedVol * 10000) / 100,
    metadata: {
      horizonUnit: 'calendar_day', daysPerYear,
      historyStartDate, historyEndDate, historicalCalendarDays: nDays, historicalReturnCount: nReturns,
      gapPolicy: 'carry_last_observed_within_common_coverage', tradingCalendarMode: 'not_modeled',
      savingBasis: 'uniform_daily_12_months_per_365_days', fxMode: 'fixed_snapshot',
      returnBasis: 'native_currency_at_fixed_snapshot_fx',
      stablecoinFxMode: assets.some(asset=>asset.market === 'crypto') ? 'fixed_ratio_not_modeled' : 'not_applicable',
    },
    histories: loadedAssets.map(asset => asset.history),
    percentiles
  };
}

/**
 * DCF hesaplaması için sadece adil değeri döndüren yardımcı matematik fonksiyonu.
 */
function valuationNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(label + ': sonlu sayısal girdi gerekir');
  }
  return value;
}

function valuationRounded(value, digits = 2) {
  valuationNumber(value, 'Hesaplama sonucu');
  const scale = Math.pow(10, digits);
  const rounded = Math.round(value * scale) / scale;
  if (!Number.isFinite(rounded)) throw new Error('Hesaplama sonucu sayısal sınırları aşıyor');
  return rounded;
}

function validateDCFInputs(inputs) {
  Object.entries(inputs).forEach(([name, value]) => valuationNumber(value, name));
  if (inputs.revenue <= 0 || inputs.sharesOutstanding <= 0) throw new Error('Yıllık gelir ve hisse adedi pozitif olmalıdır');
  if (inputs.revenueGrowthY1Y5 < -100 || inputs.revenueGrowthY6Y10 < -100) throw new Error('Gelir büyümesi -%100 altında olamaz');
  if (inputs.taxRate < 0 || inputs.taxRate > 100) throw new Error('Vergi oranı %0–100 arasında olmalıdır');
  if (inputs.capexAsPctOfRev < 0 || inputs.daAsPctOfRev < 0) throw new Error('CAPEX ve amortisman oranları negatif olamaz');
  if (inputs.wacc <= -100 || inputs.terminalGrowthRate <= -100) throw new Error('İskonto ve uç büyüme oranları -%100 üstünde olmalıdır');
  if (inputs.wacc <= inputs.terminalGrowthRate) throw new Error('İndirgeme oranı (WACC), uç büyüme oranından (Terminal Growth) büyük olmalıdır.');
}

function runDCFMath({
  revenue,
  sharesOutstanding,
  revenueGrowthY1Y5,
  revenueGrowthY6Y10,
  ebitMargin,
  taxRate,
  capexAsPctOfRev = 5,
  daAsPctOfRev = 3,
  nwcChangeAsPctOfRev = 1,
  wacc,
  terminalGrowthRate,
  netDebt
}) {
  validateDCFInputs({ revenue, sharesOutstanding, revenueGrowthY1Y5, revenueGrowthY6Y10, ebitMargin, taxRate, capexAsPctOfRev, daAsPctOfRev, nwcChangeAsPctOfRev, wacc, terminalGrowthRate, netDebt });
  const g1 = parseFloat(revenueGrowthY1Y5) / 100;
  const g2 = parseFloat(revenueGrowthY6Y10) / 100;
  const opMargin = parseFloat(ebitMargin) / 100;
  const tax = parseFloat(taxRate) / 100;
  const capexPct = parseFloat(capexAsPctOfRev) / 100;
  const daPct = parseFloat(daAsPctOfRev) / 100;
  const nwcPct = parseFloat(nwcChangeAsPctOfRev) / 100;
  const dRate = parseFloat(wacc) / 100;
  const tg = parseFloat(terminalGrowthRate) / 100;
  const nd = parseFloat(netDebt);

  let prevRevenue = revenue;
  let sumPV = 0;
  const forecast = [];

  for (let year = 1; year <= 10; year++) {
    const growth = year <= 5 ? g1 : g2;
    const rev = prevRevenue * (1 + growth);
    const ebit = rev * opMargin;
    const taxes = ebit * tax;
    const ebiat = ebit - taxes;
    const capex = rev * capexPct;
    const da = rev * daPct;
    const nwcChange = rev * nwcPct;
    
    const fcf = ebiat + da - capex - nwcChange;
    const discountFactor = Math.pow(1 + dRate, -year);
    const pv = fcf * discountFactor;
    
    forecast.push({ fcf, pv });
    sumPV += pv;
    prevRevenue = rev;
  }

  const lastFCF = forecast[9].fcf;
  const terminalValue = (lastFCF * (1 + tg)) / (dRate - tg);
  const pvTerminalValue = terminalValue * Math.pow(1 + dRate, -10);

  const enterpriseValue = sumPV + pvTerminalValue;
  const equityValue = enterpriseValue - nd;
  return valuationNumber(equityValue / sharesOutstanding, 'Hesaplanan DCF değeri');
}

/**
 * Dinamik DCF (İndirgenmiş Nakit Akışı) Adil Değer Hesaplayıcısı
 */
function calculateDCF({
  currentPrice,
  revenue,
  sharesOutstanding,
  revenueGrowthY1Y5 = 10,  // % olarak (örn. 10)
  revenueGrowthY6Y10 = 6,   // % olarak
  ebitMargin = 25,          // % olarak
  taxRate = 21,             // % olarak
  capexAsPctOfRev = 5,      // % olarak
  daAsPctOfRev = 3,         // % olarak
  nwcChangeAsPctOfRev = 1,  // % olarak
  wacc = 9.5,               // % olarak
  terminalGrowthRate = 2.5, // % olarak
  netDebt = 0
} = {}) {
  valuationNumber(currentPrice, 'Piyasa fiyatı');
  if (currentPrice <= 0) throw new Error('Piyasa fiyatı pozitif olmalıdır');
  validateDCFInputs({ revenue, sharesOutstanding, revenueGrowthY1Y5, revenueGrowthY6Y10, ebitMargin, taxRate, capexAsPctOfRev, daAsPctOfRev, nwcChangeAsPctOfRev, wacc, terminalGrowthRate, netDebt });
  
  const g1 = parseFloat(revenueGrowthY1Y5) / 100;
  const g2 = parseFloat(revenueGrowthY6Y10) / 100;
  const opMargin = parseFloat(ebitMargin) / 100;
  const tax = parseFloat(taxRate) / 100;
  const capexPct = parseFloat(capexAsPctOfRev) / 100;
  const daPct = parseFloat(daAsPctOfRev) / 100;
  const nwcPct = parseFloat(nwcChangeAsPctOfRev) / 100;
  const dRate = parseFloat(wacc) / 100;
  const tg = parseFloat(terminalGrowthRate) / 100;
  const nd = parseFloat(netDebt);

  if (dRate <= tg) {
    throw new Error('İndirgeme oranı (WACC), uç büyüme oranından (Terminal Growth) büyük olmalıdır.');
  }

  const forecast = [];
  let prevRevenue = revenue;
  let sumPV = 0;
  let lastRawFCF = 0;

  // 10 Yıllık Projeksiyon
  for (let year = 1; year <= 10; year++) {
    const growth = year <= 5 ? g1 : g2;
    const rev = prevRevenue * (1 + growth);
    const ebit = rev * opMargin;
    const taxes = ebit * tax;
    const ebiat = ebit - taxes;
    const capex = rev * capexPct;
    const da = rev * daPct;
    const nwcChange = rev * nwcPct;
    
    // Serbest Nakit Akışı (FCF) = EBIAT + D&A - CAPEX - NWC Değişimi
    const fcf = ebiat + da - capex - nwcChange;
    const discountFactor = Math.pow(1 + dRate, -year);
    const pv = fcf * discountFactor;
    
    forecast.push({
      year,
      revenue: valuationRounded(rev),
      ebit: valuationRounded(ebit),
      fcf: valuationRounded(fcf),
      pv: valuationRounded(pv)
    });
    
    sumPV += pv;
    prevRevenue = rev;
    lastRawFCF = fcf;
  }

  // Uç Değer (Terminal Value) Hesaplama
  const lastFCF = lastRawFCF;
  const terminalValue = (lastFCF * (1 + tg)) / (dRate - tg);
  const pvTerminalValue = terminalValue * Math.pow(1 + dRate, -10);

  // Toplam Kurumsal Değer (Enterprise Value)
  const enterpriseValue = sumPV + pvTerminalValue;
  
  // Özsermaye Değeri (Equity Value)
  const equityValue = enterpriseValue - nd;
  
  // Hisse Başına Adil Değer (Fair Value per Share)
  const fairValue = valuationNumber(equityValue / sharesOutstanding, 'Hesaplanan DCF değeri');
  const marginOfSafety = fairValue > 0 ? ((fairValue - currentPrice) / fairValue) * 100 : null;

  // 5x5 Hassasiyet Matrisi (WACC vs Büyüme Oranı)
  const waccBase = parseFloat(wacc);
  const growthBase = parseFloat(revenueGrowthY1Y5);
  
  const waccs = [waccBase - 2.0, waccBase - 1.0, waccBase, waccBase + 1.0, waccBase + 2.0];
  const growths = [growthBase - 4.0, growthBase - 2.0, growthBase, growthBase + 2.0, growthBase + 4.0];
  
  const sensitivityMatrix = [];
  waccs.forEach(w => {
    const row = [];
    growths.forEach(g => {
      let val = null;
      if (w > parseFloat(terminalGrowthRate)) {
        try { val = valuationRounded(runDCFMath({
          revenue,
          sharesOutstanding,
          revenueGrowthY1Y5: g,
          revenueGrowthY6Y10,
          ebitMargin,
          taxRate,
          capexAsPctOfRev,
          daAsPctOfRev,
          nwcChangeAsPctOfRev,
          wacc: w,
          terminalGrowthRate,
          netDebt
        })); } catch (_) { val = null; }
      }
      row.push(val);
    });
    sensitivityMatrix.push(row);
  });

  return {
    forecast,
    sumPV: valuationRounded(sumPV),
    terminalValue: valuationRounded(terminalValue),
    pvTerminalValue: valuationRounded(pvTerminalValue),
    enterpriseValue: valuationRounded(enterpriseValue),
    equityValue: valuationRounded(equityValue),
    fairValue: valuationRounded(fairValue),
    marginOfSafety: marginOfSafety == null ? null : valuationRounded(marginOfSafety),
    metadata: { valuationStatus: fairValue > 0 ? 'calculated' : 'non_positive_value', marginOfSafetyReason: fairValue > 0 ? null : 'non_positive_fair_value', rateUnit: 'percent', currencyBasis: 'all_monetary_inputs_same_currency' },
    sensitivity: {
      rows: waccs.map(w => `${w.toFixed(1)}%`),
      cols: growths.map(g => `${g.toFixed(1)}%`),
      matrix: sensitivityMatrix,
      rowLabel: 'WACC',
      colLabel: '1–5 yıl büyüme',
      fixedGrowthY6Y10: revenueGrowthY6Y10
    },
    parameters: {
      currentPrice,
      sharesOutstanding,
      revenue,
      revenueGrowthY1Y5,
      revenueGrowthY6Y10,
      ebitMargin,
      taxRate,
      capexAsPctOfRev,
      daAsPctOfRev,
      nwcChangeAsPctOfRev,
      wacc,
      terminalGrowthRate,
      netDebt
    }
  };
}

// Tanımlı Stres Senaryoları
const STRESS_SCENARIOS = {
  stagflation: {
    name: 'Enflasyon Şoku & Faiz Artışı (Stagflasyon)',
    desc: 'Yüksek enflasyon sebebiyle merkez bankalarının faiz artışlarına devam ettiği, ekonomik büyümenin durduğu senaryo.',
    shocks: { us: -15, bist: -20, crypto: -35 } // % bazında şok
  },
  recession: {
    name: 'Ekonomik Resesyon (Sert İniş)',
    desc: 'Küresel büyümenin gerilediği, işsizliğin arttığı ve şirket bilançolarının daraldığı klasik resesyon senaryosu.',
    shocks: { us: -20, bist: -15, crypto: -25 }
  },
  bullPivot: {
    name: 'Parasal Gevşeme (Gevşek Para Politikası)',
    desc: 'Merkez bankalarının faiz indirim döngüsünü hızlandırdığı, küresel likiditenin arttığı boğa senaryosu.',
    shocks: { us: 18, bist: 25, crypto: 45 }
  },
  cryptoWinter: {
    name: 'Sistemik Kripto Çöküşü (Kripto Kışı)',
    desc: 'Kripto borsaları veya protokollerinde yaşanan sistemik sorunlar neticesinde kripto paraların sert düştüğü senaryo.',
    shocks: { us: -2, bist: 0, crypto: -55 }
  }
};

/**
 * Portföye makro stres testleri uygular
 */
function runStressTest(portfolio, latestData, usdtry) {
  const { buildPortfolioValuation } = require('../public/action-layer');
  const markets = ['us', 'bist', 'crypto'];
  if (!portfolio || typeof portfolio !== 'object' || !markets.some(market => Array.isArray(portfolio[market]))) {
    throw new Error('Portföy verisi bulunamadı');
  }
  // Eski usdtry parametresi uyumluluk için korunur; kaynaksız kur kullanılamaz.
  const activePortfolio = {};
  markets.forEach(market => {
    if (portfolio[market] != null && !Array.isArray(portfolio[market])) throw new Error(market + ': pozisyon listesi geçersiz');
    activePortfolio[market] = (portfolio[market] || []).filter(holding => {
      if (!holding || typeof holding.symbol !== 'string' || !holding.symbol.trim() ||
        typeof holding.amount !== 'number' || !Number.isFinite(holding.amount) || holding.amount < 0) {
        throw new Error(market + ': her pozisyon için sembol ve sıfır veya pozitif sayısal adet gerekir');
      }
      return holding.amount > 0;
    });
  });
  const valuation = buildPortfolioValuation({ data: latestData, portfolioData: activePortfolio });
  const round = value => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = Math.round(value * 100) / 100;
    return Number.isFinite(rounded) ? rounded : null;
  };
  const metadata = {
    dataGeneratedAt: latestData && latestData.generatedAt || null,
    fxRate: valuation.fxRate,
    fxQuoteTime: valuation.fxQuoteTime,
    currencyAssumption: 'Fiyat şokları yerel para biriminde uygulanır; USD/TRY kuru senaryo boyunca sabit tutulur.',
  };
  if (!valuation.rows.length) {
    return { status: 'empty', currentPortfolioValueUSD: 0, currentPortfolioValueTRY: 0, scenarios: {}, positions: [], metadata };
  }
  if (valuation.missingPriceCount) {
    const missing = valuation.rows.filter(row => row.unpriced).map(row => row.market + ':' + row.symbol);
    throw new Error('Stres hesabı için piyasa fiyatı eksik veya eski: ' + missing.join(', ') + '. Alış maliyeti güncel fiyat yerine kullanılamaz');
  }
  valuation.rows.forEach(row => {
    if (row.asset.currency != null && row.asset.currency !== row.currency) {
      throw new Error(row.market + ':' + row.symbol + ': kaynak fiyatın para birimi piyasanın ' + row.currency + ' para birimiyle uyuşmuyor');
    }
  });
  const currencies = new Set(valuation.rows.map(row => row.currency));
  if (currencies.size > 1 && valuation.fxRate == null) {
    throw new Error('Karma portföyün stres hesabı için kaynağı ve zamanı doğrulanmış USD/TRY kuru gerekiyor');
  }
  const totalUSD = valuation.totalsUsd;
  const totalTRY = valuation.totalsTry;
  const convert = (value, currency, target) => currency === target ? value : valuation.fxRate == null ? null : target === 'USD' ? value / valuation.fxRate : value * valuation.fxRate;
  const total = (items, property) => items.some(item => item[property] == null) ? null : items.reduce((sum, item) => sum + item[property], 0);
  const scenarioResults = {};
  Object.entries(STRESS_SCENARIOS).forEach(([key, scenario]) => {
    const itemShocks = valuation.rows.map(row => {
      const shockPct = scenario.shocks[row.market];
      const newValue = row.valueLocal * (1 + shockPct / 100);
      const pnl = newValue - row.valueLocal;
      return {
        symbol: row.symbol, market: row.market, currency: row.currency, amount: row.amount,
        currentPrice: row.price, quoteTime: row.asset && row.asset.quoteTime || null,
        shockPct, oldValue: row.valueLocal, newValue, pnl,
        oldUSD: row.valueUsd, oldTRY: row.valueTry,
        newUSD: convert(newValue, row.currency, 'USD'), newTRY: convert(newValue, row.currency, 'TRY'),
        pnlUSD: convert(pnl, row.currency, 'USD'), pnlTRY: convert(pnl, row.currency, 'TRY'),
      };
    });
    const newUSD = total(itemShocks, 'newUSD');
    const newTRY = total(itemShocks, 'newTRY');
    const pnlUSD = totalUSD == null || newUSD == null ? null : newUSD - totalUSD;
    const pnlTRY = totalTRY == null || newTRY == null ? null : newTRY - totalTRY;
    const pctCurrency = totalUSD != null ? 'USD' : 'TRY';
    const basis = pctCurrency === 'USD' ? totalUSD : totalTRY;
    const change = pctCurrency === 'USD' ? pnlUSD : pnlTRY;
    scenarioResults[key] = {
      name: scenario.name, desc: scenario.desc,
      oldUSD: round(totalUSD), newUSD: round(newUSD), oldTRY: round(totalTRY), newTRY: round(newTRY),
      pnlUSD: round(pnlUSD), pnlTRY: round(pnlTRY),
      pctChange: basis > 0 && change != null ? round(change / basis * 100) : null,
      pctCurrency,
      shocks: itemShocks.map(item => Object.assign({}, item, Object.fromEntries(['oldValue', 'newValue', 'pnl', 'oldUSD', 'oldTRY', 'newUSD', 'newTRY', 'pnlUSD', 'pnlTRY'].map(field => [field, round(item[field])])))),
    };
  });
  return {
    status: totalUSD == null || totalTRY == null ? 'partial' : 'complete',
    currentPortfolioValueUSD: round(totalUSD), currentPortfolioValueTRY: round(totalTRY),
    scenarios: scenarioResults, metadata,
    positions: valuation.rows.map(row => ({ market: row.market, symbol: row.symbol, currency: row.currency, amount: row.amount, currentPrice: row.price, quoteTime: row.asset && row.asset.quoteTime || null, valueLocal: round(row.valueLocal), valueUSD: round(row.valueUsd), valueTRY: round(row.valueTry) })),
  };
}

function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n <= 1) return 0;
  const muX = mean(x);
  const muY = mean(y);
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - muX;
    const dy = y[i] - muY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/**
 * Portföy varlıkları arasında Pearson korelasyon matrisi hesaplar.
 */
async function calculateCorrelationMatrix({ assets } = {}) {
  const cutoffMs = Date.now();
  if (!Array.isArray(assets) || assets.length < 2) {
    throw new Error('Korelasyon için en az 2 farklı piyasa/sembol gerekir');
  }
  if (assets.length > 100) throw new Error('Korelasyonda en fazla 100 farklı varlık kullanılabilir');
  const marketLabels = { us: 'ABD', bist: 'BIST', crypto: 'Kripto' };
  const seen = new Set();
  const identities = assets.map(asset => {
    if (!asset || !Object.prototype.hasOwnProperty.call(marketLabels, asset.market) || typeof asset.symbol !== 'string' || !asset.symbol.trim() || asset.symbol.length > 64) {
      throw new Error('Her varlık için geçerli piyasa ve sembol gerekir');
    }
    const symbol = asset.symbol.trim().toUpperCase();
    const id = asset.market + ':' + symbol;
    if (seen.has(id)) throw new Error(id + ': aynı piyasa/sembol birden fazla kez gönderilemez');
    seen.add(id);
    return { id, market: asset.market, symbol, label: marketLabels[asset.market] + ' · ' + symbol };
  });
  const minimumObservations = 30;
  const positiveNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

  // Hiçbir varlığı düşürme; getirileri yalnız gözlenen ardışık kapanışlar arasında hesapla.
  const loadedAssets = await Promise.all(identities.map(async identity => {
    try {
      const chart = await fetchAssetChart({ market: identity.market, symbol: identity.symbol, interval: '1d', range: '1y' });
      const completed = completedChartHistory(chart,identity.market,cutoffMs);
      const observed = completed.bars.map(bar => {
        if (!bar || !positiveNumber(bar.time) || !positiveNumber(bar.close) || !Number.isFinite(new Date(bar.time * 1000).getTime())) {
          throw new Error('Tarihsel fiyat veya zaman geçersiz');
        }
        return { time: bar.time, close: bar.close, date: bar.date };
      }).sort((a, b) => a.time - b.time);
      if (observed.length < minimumObservations + 1) throw new Error('En az 31 ayrı günlük kapanış gerekir');
      const dates = new Set(observed.map(bar => bar.date));
      if (dates.size !== observed.length) throw new Error('Aynı gün için birden fazla kapanış gözlemi var');
      const returns = new Map();
      for (let day = 1; day < observed.length; day++) {
        const start = observed[day - 1];
        const end = observed[day];
        const value = end.close / start.close - 1;
        if (!Number.isFinite(value)) throw new Error('Tarihsel getiri geçersiz');
        returns.set(start.date + '/' + end.date, value);
      }
      return {
        identity, returns,
        history: {
          id: identity.id, market: identity.market, symbol: identity.symbol,
          source: typeof chart.source === 'string' ? chart.source : null,
          sourceSymbol: typeof chart.sourceSymbol === 'string' ? chart.sourceSymbol : null,
          currency: completed.currency,
          fetchedAt: completed.completion.observedAt,
          completion: completed.completion,
          barCount: observed.length, startDate: observed[0].date, endDate: observed[observed.length - 1].date,
        },
      };
    } catch (error) {
      throw new Error(identity.label + ': tarihsel veri alınamadı (' + error.message + '). Matrisin tamamı hesaplanamadı');
    }
  }));

  // Fri–Mon ile Sun–Mon aynı getiri aralığı değildir; iki uç tarihi de eşleştir.
  const commonIntervals = Array.from(loadedAssets[0].returns.keys()).filter(key => loadedAssets.every(asset => asset.returns.has(key))).sort();
  if (commonIntervals.length < minimumObservations) {
    throw new Error('Korelasyon için en az 30 ortak gözlenen getiri aralığı gerekir; mevcut: ' + commonIntervals.length);
  }
  const returnIntervals = commonIntervals.map(key => {
    const [start, end] = key.split('/');
    return { start, end, calendarDays: (Date.parse(end) - Date.parse(start)) / 86400000 };
  });
  const centeredReturns = loadedAssets.map(asset => {
    const returns = commonIntervals.map(key => asset.returns.get(key));
    const scale = Math.max(...returns.map(Math.abs));
    const range = Math.max(...returns) - Math.min(...returns);
    // Çok küçük yuvarlama farkları sabit getiriye sahte bir varyans kazandırmasın.
    if (scale === 0 || range <= scale * 1e-12) return null;
    const normalized = returns.map(value => value / scale);
    const average = mean(normalized);
    const deviations = normalized.map(value => value - average);
    const sumSquares = deviations.reduce((sum, value) => sum + value * value, 0);
    return { deviations, norm: Math.sqrt(sumSquares) };
  });
  const matrix = identities.map(() => identities.map(() => null));
  const undefinedPairs = [];
  for (let i = 0; i < identities.length; i++) {
    matrix[i][i] = centeredReturns[i] ? 1 : null;
    for (let j = i + 1; j < identities.length; j++) {
      if (!centeredReturns[i] || !centeredReturns[j]) {
        undefinedPairs.push({ rowId: identities[i].id, colId: identities[j].id, reason: 'zero_variance' });
        continue;
      }
      const numerator = centeredReturns[i].deviations.reduce((sum, value, index) => sum + value * centeredReturns[j].deviations[index], 0);
      const coefficient = Math.max(-1, Math.min(1, numerator / (centeredReturns[i].norm * centeredReturns[j].norm)));
      matrix[i][j] = matrix[j][i] = Math.round(coefficient * 100) / 100;
    }
  }
  const startDate = returnIntervals[0].start;
  const endDate = returnIntervals[returnIntervals.length - 1].end;
  return {
    assets: identities.map(({ market, symbol }) => ({ market, symbol })),
    identities, symbols: identities.map(asset => asset.symbol), matrix,
    sampleCount: commonIntervals.length, intervalStart: startDate, intervalEnd: endDate,
    metadata: { observationCount: commonIntervals.length, startDate, endDate, returnBasis: 'native_currency', minimumObservations,
      stablecoinFxMode: identities.some(asset=>asset.market === 'crypto') ? 'fixed_ratio_not_modeled' : 'not_applicable' },
    returnIntervals, histories: loadedAssets.map(asset => asset.history),
    zeroVarianceIds: identities.filter((_, index) => !centeredReturns[index]).map(asset => asset.id),
    undefinedPairs,
  };
}

/**
 * Benjamin Graham Değerleme Formülü
 */
function calculateGraham({
  currentPrice,
  eps,
  growthRate = 10,
  aaaBondYield = 4.5
}) {
  currentPrice = valuationNumber(currentPrice, 'Piyasa fiyatı');
  const epsVal = valuationNumber(eps, 'Hisse başına kazanç (EPS)');
  const g = valuationNumber(growthRate, 'Büyüme oranı');
  const Y = valuationNumber(aaaBondYield, 'AAA kurumsal tahvil faizi');

  if (currentPrice <= 0) throw new Error('Piyasa fiyatı sıfırdan büyük olmalıdır.');
  if (epsVal <= 0) throw new Error('Hisse başına kazanç (EPS) sıfırdan büyük olmalıdır.');

  if (Y <= 0) {
    throw new Error('AAA kurumsal tahvil faizi sıfırdan büyük olmalıdır.');
  }

  // Graham Formülü: V = (EPS * (8.5 + 2 * g) * 4.4) / Y
  const fairValue = (epsVal * (8.5 + 2 * g) * 4.4) / Y;
  const roundedFairValue = valuationRounded(fairValue);
  const marginOfSafety = fairValue > 0 ? valuationRounded(((fairValue - currentPrice) / fairValue) * 100) : null;

  // 5x5 Hassasiyet Matrisi (AAA Faiz vs Büyüme Oranı)
  const aaaBase = Y;
  const grBase = g;
  
  const yields = [aaaBase - 1.0, aaaBase - 0.5, aaaBase, aaaBase + 0.5, aaaBase + 1.0];
  const growths = [grBase - 4.0, grBase - 2.0, grBase, grBase + 2.0, grBase + 4.0];
  
  const sensitivityMatrix = yields.map(y => growths.map(gr => {
    if (y <= 0) return null;
    try {
      return valuationRounded((epsVal * (8.5 + 2 * gr) * 4.4) / y);
    } catch {
      return null;
    }
  }));

  return {
    fairValue: roundedFairValue,
    marginOfSafety,
    metadata: {
      valuationStatus: fairValue > 0 ? 'calculated' : 'non_positive_value',
      marginOfSafetyReason: fairValue > 0 ? null : 'non_positive_fair_value',
      rateUnit: 'percent',
      currencyBasis: 'all_monetary_inputs_same_currency'
    },
    sensitivity: {
      rows: yields.map(y => `${y.toFixed(1)}%`),
      cols: growths.map(gr => `${gr.toFixed(1)}%`),
      matrix: sensitivityMatrix,
      rowLabel: 'AAA Faiz',
      colLabel: 'Büyüme'
    },
    parameters: {
      currentPrice,
      eps: epsVal,
      growthRate: g,
      aaaBondYield: Y
    }
  };
}

/**
 * Temettü İndirgeme Modeli (DDM - Gordon Growth)
 */
function calculateDDM({
  currentPrice,
  recentDividend,
  dividendGrowthRate = 5,
  wacc = 9.5
}) {
  currentPrice = valuationNumber(currentPrice, 'Piyasa fiyatı');
  const D0 = valuationNumber(recentDividend, 'Hisse başına yıllık temettü');
  const divGrowthBase = valuationNumber(dividendGrowthRate, 'Temettü büyüme oranı');
  const waccBase = valuationNumber(wacc, 'İskonto oranı');
  const g = divGrowthBase / 100;
  const r = waccBase / 100;

  if (currentPrice <= 0) throw new Error('Piyasa fiyatı sıfırdan büyük olmalıdır.');
  if (D0 <= 0) throw new Error('Hisse başına yıllık temettü sıfırdan büyük olmalıdır.');
  if (g <= -1 || r <= -1) throw new Error('Temettü büyüme ve iskonto oranları %-100 değerinden büyük olmalıdır.');

  if (r <= g) {
    throw new Error('İskonto oranı (WACC), temettü büyüme oranından büyük olmalıdır.');
  }

  // DDM Gordon Büyüme: P = (D0 * (1 + g)) / (r - g)
  const fairValue = (D0 * (1 + g)) / (r - g);
  const roundedFairValue = valuationRounded(fairValue);
  const marginOfSafety = fairValue > 0 ? valuationRounded(((fairValue - currentPrice) / fairValue) * 100) : null;

  // 5x5 Hassasiyet Matrisi (WACC vs Temettü Büyüme Oranı)
  const waccs = [waccBase - 2.0, waccBase - 1.0, waccBase, waccBase + 1.0, waccBase + 2.0];
  const growths = [divGrowthBase - 2.0, divGrowthBase - 1.0, divGrowthBase, divGrowthBase + 1.0, divGrowthBase + 2.0];
  
  const sensitivityMatrix = waccs.map(w => growths.map(dg => {
    const wCoeff = w / 100;
    const dgCoeff = dg / 100;
    if (wCoeff <= -1 || dgCoeff <= -1 || wCoeff <= dgCoeff) return null;
    try {
      return valuationRounded((D0 * (1 + dgCoeff)) / (wCoeff - dgCoeff));
    } catch {
      return null;
    }
  }));

  return {
    fairValue: roundedFairValue,
    marginOfSafety,
    metadata: {
      valuationStatus: fairValue > 0 ? 'calculated' : 'non_positive_value',
      marginOfSafetyReason: fairValue > 0 ? null : 'non_positive_fair_value',
      rateUnit: 'percent',
      currencyBasis: 'all_monetary_inputs_same_currency'
    },
    sensitivity: {
      rows: waccs.map(w => `${w.toFixed(1)}%`),
      cols: growths.map(dg => `${dg.toFixed(1)}%`),
      matrix: sensitivityMatrix,
      rowLabel: 'WACC',
      colLabel: 'T.Büyüme'
    },
    parameters: {
      currentPrice,
      recentDividend: D0,
      dividendGrowthRate: divGrowthBase,
      wacc: waccBase
    }
  };
}

module.exports = {
  runMonteCarlo,
  calculateDCF,
  runStressTest,
  calculateCorrelationMatrix,
  calculateGraham,
  calculateDDM,
  STRESS_SCENARIOS
};
