const assert = require('assert');
const { buildAssetDecision, attachSignalHealth, buildTradePlan, attachDecisionMetadata } = require('../src/decision');

const baseAsset = {
  market: 'us',
  symbol: 'AAPL',
  price: 100,
  currency: 'USD',
  quoteTime: new Date().toISOString(),
  ind: {
    atr: 4,
    atrPct: 4,
    pos52: 0.94,
    ret1w: -2.5,
    macd: { histogram: -0.4 },
    obv: { rising: false },
  },
  analysis: { score: 72, label: 'AL', tone: 'buy' },
};

const history = [
  {
    date: '2026-06-07',
    t: '2026-06-07T09:00:00.000Z',
    scores: { 'US:AAPL': 61 },
    prices: { 'US:AAPL': 97 },
  },
];

const decision = buildAssetDecision(baseAsset, {
  now: new Date(),
  history,
  riskPct: 2,
  marketKey: 'US:',
});

assert.equal(decision.trade.entry, 100);
assert.equal(decision.trade.stop, 94);
assert.equal(decision.trade.target, 112);
assert.equal(decision.trade.riskReward, 2);
assert.equal(decision.trade.positionRiskPct, 2);
assert.equal(decision.trade.unitsPer100k, 333);
assert.equal(decision.trade.capitalBase, 100000);
assert.equal(decision.trade.capitalCurrency, 'USD');
assert.equal(decision.trade.riskAmount, 2000);
assert.equal(decision.trade.actualRiskAmount, 1998);
assert.equal(decision.trade.positionAmount, 33300);
assert.ok(Math.abs(decision.trade.actualRiskPct - 1.998) < 1e-12);
assert.equal(decision.trade.capitalLimited, false);
assert.equal(decision.trade.constraints.leverageAllowed, false);
assert.deepEqual(decision.trade.assumptions, {
  currencyBasis: 'asset_price_currency', stopAtrMultiple: 1.5, targetAtrMultiple: 3,
  costsIncluded: false, slippageIncluded: false, brokerLotRulesApplied: false,
});

// A narrow stop cannot turn a 100k cash illustration into a leveraged position.
const cashLimited = buildTradePlan({ price: 100, currency: 'TRY', ind: { atr: 0.01 } }, 2);
assert.equal(cashLimited.available, true);
assert.equal(cashLimited.unitsPer100k, 1000);
assert.equal(cashLimited.positionAmount, 100000);
assert.equal(cashLimited.capitalLimited, true);
assert.equal(cashLimited.riskAmount, 2000);
assert.ok(Math.abs(cashLimited.actualRiskAmount - 15) < 1e-8);
assert.ok(cashLimited.actualRiskPct < cashLimited.positionRiskPct);
assert.ok(cashLimited.unitsPer100k <= cashLimited.constraints.maxUnitsByCapital);
assert.ok(cashLimited.unitsPer100k <= cashLimited.constraints.maxUnitsByRisk);

// Small admissible quantities survive; the old four-decimal rounding erased them.
const fractional = buildTradePlan({ price: 1e9, ind: { atr: 1e8 } }, 2);
assert.equal(fractional.available, true);
assert.equal(fractional.unitsPer100k, 0.00001333);
assert.equal(fractional.constraints.fractionalQuantity, true);
assert.equal(fractional.constraints.quantityDecimals, 8);
assert.equal(fractional.capitalCurrency, null, 'a missing source currency is not invented');
assert.ok(fractional.positionAmount <= 100000);
assert.ok(fractional.actualRiskAmount <= fractional.riskAmount);
const fractionalCashLimited = buildTradePlan({ price: 2e9, ind: { atr: 1000 } }, 2);
assert.equal(fractionalCashLimited.unitsPer100k, 0.00005);
assert.equal(fractionalCashLimited.capitalLimited, true);
assert.ok(fractionalCashLimited.positionAmount <= 100000);

// Native tiny quotes retain distinct positive entry, stop and target levels.
const tiny = buildTradePlan({ price: 0.000000011, ind: { atr: 0.0000000015 } }, 2);
assert.equal(tiny.available, true);
assert.ok(tiny.priceDecimals > 4);
assert.ok(tiny.stop > 0 && tiny.stop < tiny.entry && tiny.target > tiny.entry);
assert.ok(tiny.positionAmount <= 100000 && tiny.actualRiskAmount <= tiny.riskAmount);

for (const bad of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '100', true]) {
  assert.equal(buildTradePlan({ price: bad, ind: { atr: 4 } }, 2).available, false, 'invalid price never produces a trade');
  assert.equal(buildTradePlan({ price: 100, ind: { atr: bad } }, 2).available, false, 'invalid ATR never produces a trade');
  assert.equal(buildTradePlan({ price: 100, ind: { atr: 4 } }, bad).available, false, 'invalid risk never receives a fallback budget');
}
assert.equal(buildTradePlan({ price: 100, ind: { atr: 4 } }, 101).available, false);
assert.equal(buildTradePlan({ price: 100, ind: { atr: 70 } }, 2).available, false, 'negative model stop blocks the trade');
assert.equal(buildTradePlan({ price: 1e-14, ind: { atr: 1e-15 } }, 2).available, false, 'unrepresentable quote levels are unavailable instead of zero');
const unsupportedQuantity = buildTradePlan({ price: 1e16, ind: { atr: 1e14 } }, 2);
assert.equal(unsupportedQuantity.available, false, 'a budget below minimum model quantity does not publish a zero-unit trade');
assert.equal(unsupportedQuantity.unitsPer100k, undefined);

for (const riskPct of [null, 0, NaN, Infinity, '2', true, undefined]) {
  const invalidDecision = buildAssetDecision(baseAsset, { now: new Date(), riskPct });
  assert.equal(invalidDecision.trade.available, false, 'explicit malformed configuration does not silently use 2 percent');
}
assert.equal(buildAssetDecision(baseAsset, { now: new Date() }).trade.positionRiskPct, 2, 'omitting the risk configuration preserves the documented default');
const invalidRiskSnapshot = { generatedAt: baseAsset.quoteTime, us: [structuredClone(baseAsset)] };
attachDecisionMetadata(invalidRiskSnapshot, [], { riskPct: null });
assert.equal(invalidRiskSnapshot.us[0].decision.trade.available, false, 'snapshot attachment preserves the malformed risk guard');

assert.equal(decision.contradictions.length, 1);
assert.equal(decision.contradictions[0].code, 'late-cycle-long');
assert.equal(decision.confidence.status, 'watch');
assert.equal(decision.confidence.scoreDelta, 11);
assert.equal(decision.freshness.status, 'fresh');

const holdDecision = buildAssetDecision(Object.assign({}, baseAsset, {
  analysis: { score: 52, label: 'TUT', tone: 'hold' },
}), {
  now: new Date(),
  history,
  riskPct: 2,
  marketKey: 'US:',
});
assert.equal(holdDecision.trade.available, false);
assert.equal(holdDecision.trade.status, 'not-recommended');

const signalSnapshot = {
  generatedAt: '2026-06-14T12:00:00.000Z',
  us: [Object.assign({}, baseAsset, { price: 106, decision: buildAssetDecision(baseAsset, { now: new Date(), history, riskPct: 2, marketKey: 'US:' }) })],
};
attachSignalHealth(signalSnapshot, {
  predictions: [{
    id: 'us:AAPL:2026-06-10',
    market: 'us',
    symbol: 'AAPL',
    source: 'system',
    outcome: 'open',
    entry: 100,
    stop: 94,
    target: 112,
    createdAt: '2026-06-10T12:00:00.000Z',
    horizonDays: 30,
  }],
});
assert.equal(signalSnapshot.us[0].decision.activeSignal.available, true);
assert.equal(signalSnapshot.us[0].decision.activeSignal.entry, 100);
assert.equal(signalSnapshot.us[0].decision.activeSignal.resultPct, 6);
assert.equal(signalSnapshot.us[0].decision.activeSignal.status, 'healthy');
assert.equal(signalSnapshot.us[0].decision.activeSignal.stop, 94, 'new sizing metadata never migrates a frozen signal');

console.log('decision tests passed');
