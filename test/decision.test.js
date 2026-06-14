const assert = require('assert');
const { buildAssetDecision, attachSignalHealth } = require('../src/decision');

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

console.log('decision tests passed');
