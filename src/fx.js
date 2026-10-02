// Döviz Kuru Çekici — Yahoo Finance'ten gerçek zamanlı kurlar
// USD/TRY, EUR/TRY, GBP/TRY, EUR/USD, BTC/USD vb.
'use strict';
const { fetchJson } = require('./util');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

// Çekilecek kur sembolleri
const FX_SYMBOLS = [
  { symbol: 'USDTRY=X', base: 'USD', quote: 'TRY', label: 'USD/TRY' },
  { symbol: 'EURTRY=X', base: 'EUR', quote: 'TRY', label: 'EUR/TRY' },
  { symbol: 'GBPTRY=X', base: 'GBP', quote: 'TRY', label: 'GBP/TRY' },
  { symbol: 'EURUSD=X', base: 'EUR', quote: 'USD', label: 'EUR/USD' },
  { symbol: 'GBPUSD=X', base: 'GBP', quote: 'USD', label: 'GBP/USD' },
  { symbol: 'JPYTRY=X', base: 'JPY', quote: 'TRY', label: 'JPY/TRY' },
];

/**
 * Tek bir kur sembolünün anlık fiyatını Yahoo Finance'ten çeker.
 */
async function fetchFxRate(symbolDef) {
  try {
    const data = await fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbolDef.symbol}?interval=1d&range=5d`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const r = data && data.chart && data.chart.result && data.chart.result[0];
    if (!r || !r.meta) return null;

    const meta = r.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const changePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null;

    // 5 günlük kapanış serisi (sparkline için)
    const closes = (r.indicators?.quote?.[0]?.close || [])
      .filter(v => typeof v === 'number')
      .slice(-5);

    return {
      symbol:    symbolDef.symbol,
      base:      symbolDef.base,
      quote:     symbolDef.quote,
      label:     symbolDef.label,
      price:     price != null ? Math.round(price * 10000) / 10000 : null,
      changePct: changePct != null ? Math.round(changePct * 100) / 100 : null,
      quoteTime: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null,
      closes,
    };
  } catch (e) {
    console.warn(`[fx] ${symbolDef.label} çekilemedi:`, e.message);
    return null;
  }
}

/**
 * Tüm döviz kurlarını paralel çeker.
 * @returns {{ rates: object, usdtry: number, eurtry: number, gbptry: number, fetchedAt: string }}
 */
async function fetchFxRates() {
  const results = await Promise.all(FX_SYMBOLS.map(fetchFxRate));

  const rates = {};
  results.forEach(r => {
    if (r && r.price != null) {
      rates[r.label] = r;
    }
  });

  // En önemli kurları kolay erişim için düz sayı olarak da ekle
  const usdtry = rates['USD/TRY']?.price || null;
  const eurtry = rates['EUR/TRY']?.price || null;
  const gbptry = rates['GBP/TRY']?.price || null;
  const eurusd = rates['EUR/USD']?.price || null;

  return {
    rates,
    usdtry,
    eurtry,
    gbptry,
    eurusd,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchFxRates };
