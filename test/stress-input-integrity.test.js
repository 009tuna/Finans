'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runStressTest } = require('../src/forecast');
const stamp = '2026-09-10T14:00:00Z';
const fxStamp = '2026-09-10T13:00:00Z';
const snapshot = (extra = {}) => ({
  generatedAt: stamp,
  us: [{ symbol: 'SAME', price: 100, currency: 'USD', quoteTime: stamp }],
  bist: [{ symbol: 'SAME', price: 200, currency: 'TRY', quoteTime: stamp }],
  crypto: [{ symbol: 'BTC', price: 50000, currency: 'USD', quoteTime: stamp }],
  fx: { rates: { 'USD/TRY': { price: 40, base: 'USD', quote: 'TRY', quoteTime: fxStamp } } },
  ...extra,
});
const portfolio = (extra = {}) => ({
  us: [{ symbol: 'SAME', amount: 2, avgPrice: 90 }],
  bist: [{ symbol: 'SAME', amount: 20, avgPrice: 150 }],
  crypto: [{ symbol: 'BTC', amount: 0.01, avgPrice: 40000 }],
  ...extra,
});

test('stress values each holding in its own market and keeps source snapshot metadata', () => {
  const result = runStressTest(portfolio(), snapshot(), 999);
  assert.equal(result.status, 'complete');
  assert.equal(result.currentPortfolioValueUSD, 800, '200 USD + 4000 TRY / 40 + 500 USD');
  assert.equal(result.currentPortfolioValueTRY, 32000);
  assert.equal(result.metadata.dataGeneratedAt, stamp);
  assert.equal(result.metadata.fxRate, 40, 'a caller override cannot replace the sourced quote');
  assert.equal(result.metadata.fxQuoteTime, fxStamp);
  assert.match(result.metadata.currencyAssumption, /yerel para biriminde.*sabit/);
  assert.equal(result.positions.length, 3);
  assert.equal(result.positions[0].currentPrice, 100);
  assert.equal(result.positions[1].currentPrice, 200, 'same symbol in BIST must not overwrite the US price');
  assert.equal(result.positions[0].quoteTime, stamp);
  const scenario = result.scenarios.stagflation;
  assert.equal(scenario.oldUSD, 800);
  assert.equal(scenario.newUSD, 575, '170 + 80 + 325 USD');
  assert.equal(scenario.pnlUSD, -225);
  assert.equal(scenario.newTRY, 23000);
  assert.equal(scenario.pnlTRY, -9000);
  assert.ok(Math.abs(scenario.pctChange + 28.125) < 0.006, 'percentage reflects the portfolio loss to two decimals');
  assert.equal(scenario.shocks[1].oldValue, 4000);
  assert.equal(scenario.shocks[1].newValue, 3200);
  assert.equal(scenario.shocks[1].newUSD, 80);
  assert.equal(scenario.shocks[1].currency, 'TRY');
});

test('USD-only stress preserves the native total and uses null for unsupported TRY conversion', () => {
  const result = runStressTest(portfolio({ bist: [], crypto: [] }), snapshot({ fx: { usdtry: 38 } }), 50);
  assert.equal(result.status, 'partial');
  assert.equal(result.currentPortfolioValueUSD, 200);
  assert.equal(result.currentPortfolioValueTRY, null);
  assert.equal(result.metadata.fxRate, null);
  assert.equal(result.scenarios.stagflation.newUSD, 170);
  assert.equal(result.scenarios.stagflation.pnlUSD, -30);
  assert.equal(result.scenarios.stagflation.newTRY, null);
  assert.equal(result.scenarios.stagflation.pnlTRY, null);
  assert.equal(result.scenarios.stagflation.pctChange, -15);
  assert.equal(result.scenarios.stagflation.pctCurrency, 'USD');
});

test('TRY-only stress preserves native values and derives percent change without inventing dollars', () => {
  const result = runStressTest(portfolio({ us: [], crypto: [] }), snapshot({ fx: null }));
  assert.equal(result.currentPortfolioValueUSD, null);
  assert.equal(result.currentPortfolioValueTRY, 4000);
  assert.equal(result.scenarios.stagflation.oldUSD, null);
  assert.equal(result.scenarios.stagflation.newUSD, null);
  assert.equal(result.scenarios.stagflation.pnlUSD, null);
  assert.equal(result.scenarios.stagflation.newTRY, 3200);
  assert.equal(result.scenarios.stagflation.pnlTRY, -800);
  assert.equal(result.scenarios.stagflation.pctChange, -20);
  assert.equal(result.scenarios.stagflation.pctCurrency, 'TRY');
  assert.equal(result.scenarios.cryptoWinter.shocks[0].shockPct, 0, 'a defined zero shock stays an observed scenario assumption');
  assert.equal(result.scenarios.cryptoWinter.pnlTRY, 0);
});

test('a mixed portfolio needs an identified dated rate; no bare 38 or caller override is used', () => {
  const invalidFx = [null, { usdtry: 38 },
    { rates: { 'USD/TRY': { price: 40, quoteTime: fxStamp } } },
    { rates: { 'USD/TRY': { price: 40, base: 'USD', quote: 'TRY', quoteTime: '2026-09-10' } } },
    { stale: true, rates: { 'USD/TRY': { price: 40, base: 'USD', quote: 'TRY', quoteTime: fxStamp } } },
    { rates: { 'USD/TRY': { price: -40, base: 'USD', quote: 'TRY', quoteTime: fxStamp } } }];
  invalidFx.forEach(fx => assert.throws(() => runStressTest(portfolio(), snapshot({ fx }), 38), /Karma portföy.*doğrulanmış USD\/TRY/));
});

test('missing or stale active prices reject the entire stress calculation, never use avgPrice', () => {
  const missing = snapshot({ bist: [] });
  assert.throws(() => runStressTest(portfolio(), missing), /bist:SAME.*Alış maliyeti/);
  for (const asset of [{ symbol: 'SAME', price: null }, { symbol: 'SAME', price: '100' }, { symbol: 'SAME', price: 100, stale: true }, { symbol: 'SAME', price: 100, __error: 'provider failed' }]) {
    assert.throws(() => runStressTest(portfolio(), snapshot({ us: [asset] })), /us:SAME.*Alış maliyeti/);
  }
});

test('purchase-cost absence does not block a scenario based on observed market prices', () => {
  const inputs = portfolio();
  delete inputs.us[0].avgPrice;
  const result = runStressTest(inputs, snapshot());
  assert.equal(result.currentPortfolioValueUSD, 800);
  assert.equal(result.scenarios.stagflation.pnlUSD, -225);
});

test('a source quote in a conflicting currency cannot be relabeled as the market currency', () => {
  const conflicting = snapshot();
  conflicting.bist[0].currency = 'USD';
  assert.throws(() => runStressTest(portfolio(), conflicting), /bist:SAME.*kaynak fiyatın para birimi/);
});

test('known empty portfolios and zero-size holdings have no scenarios or fabricated percentage change', () => {
  for (const inputs of [{ us: [], bist: [], crypto: [] }, { us: [{ symbol: 'MISSING', amount: 0 }], bist: [], crypto: [] }]) {
    const result = runStressTest(inputs, null);
    assert.equal(result.status, 'empty');
    assert.equal(result.currentPortfolioValueUSD, 0);
    assert.equal(result.currentPortfolioValueTRY, 0);
    assert.deepEqual(result.scenarios, {});
    assert.deepEqual(result.positions, []);
    assert.equal(result.metadata.fxRate, null);
  }
});

test('unavailable portfolio and malformed amounts are distinct from a known empty portfolio', () => {
  [null, undefined, {}].forEach(inputs => assert.throws(() => runStressTest(inputs, snapshot()), /Portföy verisi bulunamadı/));
  for (const amount of [-1, NaN, Infinity, '2', null]) {
    assert.throws(() => runStressTest(portfolio({ us: [{ symbol: 'SAME', amount }] }), snapshot()), /sayısal adet/);
  }
  assert.throws(() => runStressTest({ us: [], bist: {} }, snapshot()), /pozisyon listesi geçersiz/);
});

test('stress input objects stay unchanged and unknown quote time is not fabricated', () => {
  const inputs = portfolio();
  const marketData = snapshot();
  delete marketData.us[0].quoteTime;
  const before = JSON.stringify({ inputs, marketData });
  const result = runStressTest(inputs, marketData);
  assert.equal(result.positions[0].quoteTime, null);
  assert.equal(result.scenarios.stagflation.shocks[0].quoteTime, null);
  assert.equal(JSON.stringify({ inputs, marketData }), before);
});
