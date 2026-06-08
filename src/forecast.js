// Finansal Projeksiyon ve Tahmin (Forecast) Motoru
// Monte Carlo simülasyonu, DCF şirketi değerlemesi ve makro stres testleri.
'use strict';

const { fetchAssetChart } = require('./chart-data');

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
 * @param {Array} assets - Varlık listesi: [{ symbol, market, amount, price }]
 * @param {number} horizon - Gün cinsinden simülasyon süresi (örn. 30, 90, 365)
 * @param {number} monthlySaving - Aylık eklenecek nakit tasarrufu
 * @param {number} numPaths - Simüle edilecek yol sayısı (örn. 2000)
 */
async function runMonteCarlo({ assets, horizon = 365, monthlySaving = 0, numPaths = 2000 }) {
  if (!assets || !assets.length) {
    throw new Error('Simülasyon için portföy varlığı bulunamadı');
  }

  // 1. Tüm varlıkların 1 yıllık tarihsel günlük verilerini çek
  const fetchPromises = assets.map(async (asset) => {
    try {
      const chart = await fetchAssetChart({
        market: asset.market,
        symbol: asset.symbol,
        interval: '1d',
        range: '1y'
      });
      return {
        symbol: asset.symbol,
        market: asset.market,
        amount: parseFloat(asset.amount),
        currentPrice: parseFloat(asset.price || chart.bars[chart.bars.length - 1].close),
        bars: chart.bars || []
      };
    } catch (e) {
      console.error(`Monte Carlo veri hatası (${asset.symbol}):`, e.message);
      return null;
    }
  });

  const loadedAssets = (await Promise.all(fetchPromises)).filter(x => x !== null && x.bars.length > 5);

  if (!loadedAssets.length) {
    throw new Error('Varlıkların tarihsel verisi çekilemedi');
  }

  // 2. Gün bazında hizalama ve tarihsel getirilerin hesaplanması
  // Tüm tarihleri (günleri) topla ve sırala
  const dateMap = {}; // dateString -> index
  const allDatesSet = new Set();
  
  loadedAssets.forEach(asset => {
    asset.bars.forEach(b => {
      const dateStr = new Date(b.time * 1000).toISOString().slice(0, 10);
      allDatesSet.add(dateStr);
    });
  });

  const sortedDates = Array.from(allDatesSet).sort();
  sortedDates.forEach((d, idx) => { dateMap[d] = idx; });

  // Her varlığın fiyat serisini tarihlere göre doldur (delik varsa bir önceki fiyatla doldur - forward fill)
  const nDays = sortedDates.length;
  const assetPrices = loadedAssets.map(asset => {
    const prices = new Array(nDays).fill(null);
    asset.bars.forEach(b => {
      const dateStr = new Date(b.time * 1000).toISOString().slice(0, 10);
      prices[dateMap[dateStr]] = b.close;
    });

    // Delikleri doldur
    let lastPrice = asset.currentPrice;
    // Geriye doğru doldur
    for (let i = nDays - 1; i >= 0; i--) {
      if (prices[i] === null) {
        prices[i] = lastPrice;
      } else {
        lastPrice = prices[i];
      }
    }
    // İleriye doğru doldur
    lastPrice = prices[0];
    for (let i = 0; i < nDays; i++) {
      if (prices[i] === null) {
        prices[i] = lastPrice;
      } else {
        lastPrice = prices[i];
      }
    }
    return prices;
  });

  // Günlük getirileri hesapla
  const assetReturns = assetPrices.map(prices => {
    const rets = new Array(nDays - 1);
    for (let i = 0; i < nDays - 1; i++) {
      const prev = prices[i] || 1;
      rets[i] = (prices[i + 1] - prev) / prev;
    }
    return rets;
  });

  // Portföy toplam başlangıç değeri ve varlık ağırlıkları
  let initialPortfolioValue = 0;
  const values = loadedAssets.map((asset) => asset.amount * asset.currentPrice);
  initialPortfolioValue = values.reduce((a, b) => a + b, 0);

  if (initialPortfolioValue <= 0) {
    throw new Error('Portföy değeri sıfır veya negatif olamaz');
  }

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

  // Yıllıklandırılmış istatistikler (kabaca 252 işlem günü üzerinden)
  const annualizedReturn = Math.pow(1 + mu_d, 252) - 1;
  const annualizedVol = sigma_d * Math.sqrt(252);

  // 4. Geleceğe Yönelik Monte Carlo Patikalarının Simülasyonu
  const dailySaving = monthlySaving / 30; // Günlük tasarruf ekleme payı
  const paths = [];

  for (let p = 0; p < numPaths; p++) {
    const path = new Array(horizon + 1);
    path[0] = initialPortfolioValue;
    let currentVal = initialPortfolioValue;

    for (let d = 1; d <= horizon; d++) {
      const Z = boxMullerRandom();
      const dailyRet = mu_d + sigma_d * Z;
      currentVal = currentVal * (1 + dailyRet) + dailySaving;
      path[d] = Math.max(0, currentVal); // Bakiye sıfırın altına inmesin
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
    initialValue: Math.round(initialPortfolioValue * 100) / 100,
    horizon,
    monthlySaving,
    mu_d: Math.round(mu_d * 100000) / 100000,
    sigma_d: Math.round(sigma_d * 100000) / 100000,
    annualizedReturn: Math.round(annualizedReturn * 10000) / 100,
    annualizedVol: Math.round(annualizedVol * 10000) / 100,
    percentiles
  };
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
}) {
  currentPrice = parseFloat(currentPrice);
  revenue = parseFloat(revenue);
  sharesOutstanding = parseFloat(sharesOutstanding);
  
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
      revenue: Math.round(rev),
      ebit: Math.round(ebit),
      fcf: Math.round(fcf),
      pv: Math.round(pv)
    });
    
    sumPV += pv;
    prevRevenue = rev;
  }

  // Uç Değer (Terminal Value) Hesaplama
  const lastFCF = forecast[9].fcf;
  const terminalValue = (lastFCF * (1 + tg)) / (dRate - tg);
  const pvTerminalValue = terminalValue * Math.pow(1 + dRate, -10);

  // Toplam Kurumsal Değer (Enterprise Value)
  const enterpriseValue = sumPV + pvTerminalValue;
  
  // Özsermaye Değeri (Equity Value)
  const equityValue = enterpriseValue - nd;
  
  // Hisse Başına Adil Değer (Fair Value per Share)
  const fairValue = sharesOutstanding > 0 ? (equityValue / sharesOutstanding) : 0;
  const marginOfSafety = fairValue > 0 ? ((fairValue - currentPrice) / fairValue) * 100 : 0;

  return {
    forecast,
    sumPV: Math.round(sumPV * 100) / 100,
    terminalValue: Math.round(terminalValue * 100) / 100,
    pvTerminalValue: Math.round(pvTerminalValue * 100) / 100,
    enterpriseValue: Math.round(enterpriseValue * 100) / 100,
    equityValue: Math.round(equityValue * 100) / 100,
    fairValue: Math.round(fairValue * 100) / 100,
    marginOfSafety: Math.round(marginOfSafety * 100) / 100,
    parameters: {
      currentPrice,
      sharesOutstanding,
      revenue,
      revenueGrowthY1Y5,
      revenueGrowthY6Y10,
      ebitMargin,
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
function runStressTest(portfolio, latestData) {
  if (!portfolio || (!portfolio.us && !portfolio.bist && !portfolio.crypto)) {
    return { error: 'Portföy verisi bulunamadı' };
  }

  // Fiyat sözlüğü oluştur
  const priceMap = {};
  const collectPrices = (list) => {
    (list || []).forEach(item => {
      if (item.symbol && item.price) {
        priceMap[item.symbol.toUpperCase()] = {
          price: item.price,
          currency: item.currency || 'USD'
        };
      }
    });
  };
  
  if (latestData) {
    collectPrices(latestData.us);
    collectPrices(latestData.bist);
    collectPrices(latestData.crypto);
  }

  // Portföyün anlık değerini ve varlık detaylarını hesapla
  let totalUSDValue = 0;
  let totalTRYValue = 0;
  const portfolioItems = [];

  const addItems = (list, market, defaultCurrency) => {
    (list || []).forEach(p => {
      const sym = p.symbol.toUpperCase();
      const pInfo = priceMap[sym] || { price: parseFloat(p.avgPrice), currency: defaultCurrency };
      const curPrice = pInfo.price;
      const currency = pInfo.currency;
      const amount = parseFloat(p.amount);
      const val = amount * curPrice;

      portfolioItems.push({
        symbol: p.symbol,
        market,
        amount,
        avgPrice: parseFloat(p.avgPrice),
        currentPrice: curPrice,
        currency,
        value: val
      });

      // Basit kur dönüşümü: TL -> USD için kabaca 32.5 alalım, USD -> TL için 32.5
      // (Daha doğru kur bilgisi dashboard verilerinden çekilebilir ama basitlik adına sabit kur iş görür)
      const usdVal = currency === 'TRY' ? val / 32.5 : val;
      const tryVal = currency === 'USD' ? val * 32.5 : val;
      
      totalUSDValue += usdVal;
      totalTRYValue += tryVal;
    });
  };

  addItems(portfolio.us, 'us', 'USD');
  addItems(portfolio.bist, 'bist', 'TRY');
  addItems(portfolio.crypto, 'crypto', 'USD');

  const scenarioResults = {};

  Object.keys(STRESS_SCENARIOS).forEach(scKey => {
    const sc = STRESS_SCENARIOS[scKey];
    let newTotalUSD = 0;
    let newTotalTRY = 0;
    const itemShocks = [];

    portfolioItems.forEach(item => {
      const shockPct = sc.shocks[item.market] || 0;
      const shockCoeff = 1 + (shockPct / 100);
      const newValue = item.value * shockCoeff;
      const pnl = newValue - item.value;

      const usdVal = item.currency === 'TRY' ? newValue / 32.5 : newValue;
      const tryVal = item.currency === 'USD' ? newValue * 32.5 : newValue;
      
      newTotalUSD += usdVal;
      newTotalTRY += tryVal;

      itemShocks.push({
        symbol: item.symbol,
        market: item.market,
        shockPct,
        oldValue: Math.round(item.value * 100) / 100,
        newValue: Math.round(newValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        currency: item.currency
      });
    });

    const pnlUSD = newTotalUSD - totalUSDValue;
    const pnlTRY = newTotalTRY - totalTRYValue;
    const pctChange = totalUSDValue > 0 ? (pnlUSD / totalUSDValue) * 100 : 0;

    scenarioResults[scKey] = {
      name: sc.name,
      desc: sc.desc,
      oldUSD: Math.round(totalUSDValue * 100) / 100,
      newUSD: Math.round(newTotalUSD * 100) / 100,
      oldTRY: Math.round(totalTRYValue * 100) / 100,
      newTRY: Math.round(newTotalTRY * 100) / 100,
      pnlUSD: Math.round(pnlUSD * 100) / 100,
      pnlTRY: Math.round(pnlTRY * 100) / 100,
      pctChange: Math.round(pctChange * 100) / 100,
      shocks: itemShocks
    };
  });

  return {
    currentPortfolioValueUSD: Math.round(totalUSDValue * 100) / 100,
    currentPortfolioValueTRY: Math.round(totalTRYValue * 100) / 100,
    scenarios: scenarioResults
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
async function calculateCorrelationMatrix({ assets }) {
  if (!assets || assets.length <= 1) {
    return { symbols: (assets || []).map(a => a.symbol), matrix: assets && assets.length ? [[1.0]] : [] };
  }

  // 1. Tarihsel verileri çek
  const fetchPromises = assets.map(async (asset) => {
    try {
      const chart = await fetchAssetChart({
        market: asset.market,
        symbol: asset.symbol,
        interval: '1d',
        range: '1y'
      });
      return {
        symbol: asset.symbol,
        currentPrice: parseFloat(asset.price || chart.bars[chart.bars.length - 1].close),
        bars: chart.bars || []
      };
    } catch (e) {
      console.error(`Korelasyon veri hatası (${asset.symbol}):`, e.message);
      return null;
    }
  });

  const loadedAssets = (await Promise.all(fetchPromises)).filter(x => x !== null && x.bars.length > 5);
  
  if (loadedAssets.length <= 1) {
    return { symbols: loadedAssets.map(a => a.symbol), matrix: loadedAssets.length ? [[1.0]] : [] };
  }

  // 2. Tarih bazlı hizalama
  const allDatesSet = new Set();
  loadedAssets.forEach(asset => {
    asset.bars.forEach(b => {
      const dateStr = new Date(b.time * 1000).toISOString().slice(0, 10);
      allDatesSet.add(dateStr);
    });
  });

  const sortedDates = Array.from(allDatesSet).sort();
  const dateMap = {};
  sortedDates.forEach((d, idx) => { dateMap[d] = idx; });
  const nDays = sortedDates.length;

  // Fiyat dolgusu (forward-fill)
  const assetPrices = loadedAssets.map(asset => {
    const prices = new Array(nDays).fill(null);
    asset.bars.forEach(b => {
      const dateStr = new Date(b.time * 1000).toISOString().slice(0, 10);
      prices[dateMap[dateStr]] = b.close;
    });

    let lastPrice = asset.currentPrice;
    for (let i = nDays - 1; i >= 0; i--) {
      if (prices[i] === null) prices[i] = lastPrice;
      else lastPrice = prices[i];
    }
    lastPrice = prices[0];
    for (let i = 0; i < nDays; i++) {
      if (prices[i] === null) prices[i] = lastPrice;
      else lastPrice = prices[i];
    }
    return prices;
  });

  // Günlük getirileri hesapla
  const assetReturns = assetPrices.map(prices => {
    const rets = new Array(nDays - 1);
    for (let i = 0; i < nDays - 1; i++) {
      const prev = prices[i] || 1;
      rets[i] = (prices[i + 1] - prev) / prev;
    }
    return rets;
  });

  // 3. Matris oluştur
  const m = loadedAssets.length;
  const matrix = Array.from({ length: m }, () => new Array(m).fill(0));
  const symbols = loadedAssets.map(a => a.symbol);

  for (let i = 0; i < m; i++) {
    matrix[i][i] = 1.0; // Diyagonal elemanlar her zaman 1.0'dir.
    for (let j = i + 1; j < m; j++) {
      const corr = pearsonCorrelation(assetReturns[i], assetReturns[j]);
      const roundedCorr = Math.round(corr * 100) / 100;
      matrix[i][j] = roundedCorr;
      matrix[j][i] = roundedCorr;
    }
  }

  return {
    symbols,
    matrix
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
  currentPrice = parseFloat(currentPrice);
  const epsVal = parseFloat(eps) || 0;
  const g = parseFloat(growthRate);
  const Y = parseFloat(aaaBondYield);

  if (Y <= 0) {
    throw new Error('AAA kurumsal tahvil faizi sıfırdan büyük olmalıdır.');
  }

  // Graham Formülü: V = (EPS * (8.5 + 2 * g) * 4.4) / Y
  const fairValue = (epsVal * (8.5 + 2 * g) * 4.4) / Y;
  const marginOfSafety = fairValue > 0 ? ((fairValue - currentPrice) / fairValue) * 100 : 0;

  return {
    fairValue: Math.round(fairValue * 100) / 100,
    marginOfSafety: Math.round(marginOfSafety * 100) / 100,
    parameters: {
      currentPrice,
      eps: epsVal,
      growthRate,
      aaaBondYield
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
  currentPrice = parseFloat(currentPrice);
  const D0 = parseFloat(recentDividend) || 0;
  const g = parseFloat(dividendGrowthRate) / 100;
  const r = parseFloat(wacc) / 100;

  if (r <= g) {
    throw new Error('İskonto oranı (WACC), temettü büyüme oranından büyük olmalıdır.');
  }

  // DDM Gordon Büyüme: P = (D0 * (1 + g)) / (r - g)
  const fairValue = (D0 * (1 + g)) / (r - g);
  const marginOfSafety = fairValue > 0 ? ((fairValue - currentPrice) / fairValue) * 100 : 0;

  return {
    fairValue: Math.round(fairValue * 100) / 100,
    marginOfSafety: Math.round(marginOfSafety * 100) / 100,
    parameters: {
      currentPrice,
      recentDividend,
      dividendGrowthRate,
      wacc
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
