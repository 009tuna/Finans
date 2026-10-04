// Action layer tests: dashboard decision surfaces without network/browser dependencies.
'use strict';

const assert = require('assert');
const {
  buildDailyChangeDigest,
  buildPortfolioValuation,
  buildPortfolioActions,
  buildAssetThesis,
  buildReportTrust,
  buildAlertRules,
  buildPredictionScorecard,
  buildPredictionCohorts,
  calculatePosition,
  buildIdeaFunnel,
  buildCatalystCalendar,
  buildCfoDecisionCockpit,
  buildPortfolioRiskPlan,
  buildDecisionLearningPanel,
  buildAssetLearningSnippet,
  buildCompanyTearsheet,
  buildCompsSnapshot,
  buildInvestmentCommitteeMemo,
} = require('../public/action-layer.js');

console.log('Action layer tests starting...\n');

const snapshot = {
  generatedAt: '2026-06-08T20:00:00.000Z',
  fx: { usdtry: 40 },
  us: [
    {
      market: 'us',
      symbol: 'AAPL',
      name: 'Apple Inc',
      currency: 'USD',
      price: 100,
      changePct: -1.2,
      quoteTime: '2026-06-08T19:50:00.000Z',
      analysis: {
        score: 59,
        label: 'TUT',
        tone: 'hold',
        summary: 'Bileşik teknik puan 59/100 -> TUT.',
        reasons: [
          { sentiment: 'pos', text: 'Fiyat 50g ve 200g ortalamaların üstünde — ana trend yukarı' },
          { sentiment: 'neg', text: 'MACD negatif ve histogram genişliyor — düşüş ivmesi' },
        ],
      },
      ind: {
        rsi: 53,
        macd: { histogram: -1.2 },
        pos52: 0.91,
      },
      decision: {
        score: 72,
        status: 'caution',
        confidence: { previousScore: 67, scoreDelta: -8, label: 'Sinyal zayıflıyor' },
        freshness: { status: 'fresh', label: 'Veri taze' },
        trade: { available: true, entry: 100, stop: 95, target: 110 },
      },
    },
    {
      market: 'us',
      symbol: 'AMD',
      name: 'Advanced Micro Devices',
      currency: 'USD',
      price: 80,
      changePct: 3.5,
      quoteTime: '2026-06-08T19:50:00.000Z',
      analysis: { score: 65, label: 'AL', tone: 'buy', reasons: [] },
      ind: { rsi: 58, macd: { histogram: 1.5 }, pos52: 0.7 },
      decision: { freshness: { status: 'fresh', label: 'Veri taze' }, confidence: { previousScore: 56, scoreDelta: 9 }, trade: { available: true, entry: 80, stop: 74, target: 92 } },
    },
  ],
  crypto: [
    {
      market: 'crypto',
      symbol: 'XRP',
      name: 'XRP',
      currency: 'USD',
      price: 1.2,
      changePct: -4,
      quoteTime: '2026-06-08T19:59:00.000Z',
      analysis: { score: 23, label: 'SAT', tone: 'sell', reasons: [{ sentiment: 'neg', text: 'Fiyat 200g ortalamanın altında — uzun vadeli düşüş eğilimi' }] },
      ind: { rsi: 27, macd: { histogram: -0.1 }, pos52: 0.04 },
      decision: { score: 88, status: 'clean', freshness: { status: 'fresh', label: 'Veri taze' }, confidence: { previousScore: 31, scoreDelta: -8 }, trade: { available: true, entry: 1.2, stop: 1.08, target: 1.44 } },
    },
  ],
  bist: [],
};

console.log('1. buildDailyChangeDigest ranks score changes...');
const digest = buildDailyChangeDigest(snapshot);
assert.equal(digest.weakening[0].symbol, 'AAPL');
assert.equal(digest.improving[0].symbol, 'AMD');
assert.ok(digest.headline.includes('AAPL'));
console.log('   ok');

console.log('6b. prediction cohorts keep markets, versions and legacy records separate...');
const cohortCard = buildPredictionCohorts({ predictions: [
  { id: 'a', symbol: 'A', market: 'us', source: 'system', outcome: 'open', evidenceVersion: 'technical-learning-v2', strategyVersion: 's1', resolverVersion: 'r1', createdAt: '2026-06-01T00:00:00Z', entry: 10, stop: 9, target: 12 },
  { id: 'b', symbol: 'B', market: 'us', source: 'system', outcome: 'target-hit', strategyVersion: 's1', resolverVersion: 'daily-bar-resolver-v3', createdAt: '2026-05-31T00:00:00Z', resolvedAt: '2026-06-02T22:00:00Z', entry: 10, stop: 9, target: 12, outcomeEvidence: 'daily_bar_range', barEndAt: '2026-06-01T23:00:00Z', barDate: '2026-06-01', closePrice: 12, resultPct: 20 },
  { id:'c', symbol: 'C', market: 'crypto', source: 'user', outcome: 'target-hit', createdAt:'2026-05-31T00:00:00Z',resolvedAt:'2026-06-02T22:00:00Z',entry:10,stop:9,target:12 },
] }, '2026-06-03T00:00:00Z');
assert.equal(cohortCard.counts.versioned_open, 1);
assert.equal(cohortCard.counts.versioned_result, 1);
assert.equal(cohortCard.counts.legacy, 1);
assert.ok(cohortCard.groups.some((group) => group.market === 'crypto' && group.status === 'legacy'));
console.log('   ok');

console.log('2. buildPortfolioActions flags concentration and weak holding...');
const portfolio = { crypto: [{ symbol: 'XRP', amount: 200, avgPrice: 1.1 }], us: [], bist: [] };
const port = buildPortfolioActions({ data: snapshot, portfolioData: portfolio, usdtry: 40 });
assert.ok(port.summary.includes('kripto ağırlığı %100'));
assert.ok(port.actions.some((a) => a.kind === 'reduce' && a.symbol === 'XRP'));
assert.ok(port.actions.some((a) => a.kind === 'rebalance'));
console.log('   ok');

console.log('2b. portfolio valuation preserves native values and refuses missing FX/prices...');
const valuationFx = { usdtry: 40, rates: { 'USD/TRY': { symbol: 'USDTRY=X', base: 'USD', quote: 'TRY', price: 40, quoteTime: '2026-10-02T18:00:00Z' } } };
const valuationData = {
  fx: valuationFx,
  us: [{ symbol: 'USDASSET', name: 'USD asset', price: 100, analysis: { score: 65, label: 'AL', tone: 'buy' } }],
  bist: [{ symbol: 'TRYASSET', price: 200, analysis: { score: 60, label: 'AL', tone: 'buy' } }, { symbol: 'TRYSECOND', price: 100, analysis: { score: 60, label: 'AL', tone: 'buy' } }],
  crypto: [{ symbol: 'COIN', price: 50, analysis: { score: 23, label: 'SAT', tone: 'sell' } }],
};
const valuationHoldings = { us: [{ symbol: 'USDASSET', amount: 2, avgPrice: 90 }], bist: [{ symbol: 'TRYASSET', amount: 10, avgPrice: 180 }], crypto: [{ symbol: 'COIN', amount: 2, avgPrice: 60 }] };
const valuationInputBefore = JSON.stringify([valuationData, valuationHoldings]);
const pricedPortfolio = buildPortfolioValuation({ data: valuationData, portfolioData: valuationHoldings, usdtry: 999 });
assert.equal(pricedPortfolio.status, 'complete');
assert.equal(pricedPortfolio.fxRate, 40, 'a caller number cannot override the identified source quote');
assert.equal(pricedPortfolio.fxQuoteTime, valuationFx.rates['USD/TRY'].quoteTime);
assert.equal(pricedPortfolio.totalsUsd, 350);
assert.equal(pricedPortfolio.totalsTry, 14000);
assert.equal(pricedPortfolio.costUsd, 345);
assert.equal(pricedPortfolio.pnlUsd, 5);
assert.equal(pricedPortfolio.pnlTry, 200);
assert.deepEqual(pricedPortfolio.localTotals, { USD: { value: 300, cost: 300, pnl: 0 }, TRY: { value: 2000, cost: 1800, pnl: 200 } });
assert.equal(pricedPortfolio.rows[1].value, 2000);
assert.equal(pricedPortfolio.rows[1].valueUsd, 50);
assert.equal(pricedPortfolio.rows[1].currency, 'TRY');
assert.equal(pricedPortfolio.rows[1].cost, 1800);
assert.equal(pricedPortfolio.rows[1].pnl, 200);
assert.equal(pricedPortfolio.weightsAvailable, true);
assert.equal(pricedPortfolio.weightCurrency, 'USD');
assert.ok(Math.abs(pricedPortfolio.rows.reduce(function (total, row) { return total + row.weightPct; }, 0) - 100) < 1e-10);
assert.ok(Math.abs(pricedPortfolio.marketWeights.bist - 50 / 350 * 100) < 1e-10);
assert.deepEqual(pricedPortfolio.coverage, { totalCount: 3, pricedCount: 3, costedCount: 3, priceRatio: 1 });
assert.equal(JSON.stringify([valuationData, valuationHoldings]), valuationInputBefore, 'valuation never mutates source data or positions');

const noFxData = Object.assign({}, valuationData, { fx: { usdtry: 40 } });
const noFxPortfolio = buildPortfolioValuation({ data: noFxData, portfolioData: valuationHoldings, usdtry: 40 });
assert.equal(noFxPortfolio.fxRate, null, 'bare legacy and caller rates are not sourced FX quotes');
assert.equal(noFxPortfolio.status, 'partial');
assert.equal(noFxPortfolio.missingFx, true);
assert.equal(noFxPortfolio.totalsUsd, null);
assert.equal(noFxPortfolio.totalsTry, null);
assert.equal(noFxPortfolio.pnlUsd, null);
assert.equal(noFxPortfolio.pnlTry, null);
assert.deepEqual(noFxPortfolio.localTotals, pricedPortfolio.localTotals, 'missing FX does not erase native amounts');
assert.ok(noFxPortfolio.rows.every(function (row) { return row.weightPct === null; }), 'a mixed portfolio with missing FX has no invented percentages');
assert.deepEqual(noFxPortfolio.marketWeights, { us: null, bist: null, crypto: null });

const usdOnly = buildPortfolioValuation({ data: noFxData, portfolioData: { us: valuationHoldings.us, crypto: valuationHoldings.crypto } });
assert.equal(usdOnly.totalsUsd, 300);
assert.equal(usdOnly.pnlUsd, 0);
assert.equal(usdOnly.totalsTry, null);
assert.equal(usdOnly.pnlTry, null);
assert.equal(usdOnly.weightsAvailable, true, 'USD-only native weights need no FX');
assert.equal(usdOnly.weightCurrency, 'USD');
const tryOnly = buildPortfolioValuation({ data: noFxData, portfolioData: { bist: valuationHoldings.bist.concat([{ symbol: 'TRYSECOND', amount: 10, avgPrice: 95 }]) } });
assert.equal(tryOnly.totalsTry, 3000);
assert.equal(tryOnly.pnlTry, 250);
assert.equal(tryOnly.totalsUsd, null);
assert.equal(tryOnly.pnlUsd, null);
assert.equal(tryOnly.weightsAvailable, true, 'TRY-only native weights remain computable without USD conversion');
assert.equal(tryOnly.weightCurrency, 'TRY');
assert.ok(Math.abs(tryOnly.marketWeights.bist - 100) < 1e-10);
assert.ok(Math.abs(tryOnly.rows[0].weightPct - 2000 / 3000 * 100) < 1e-10);

const withFx = function (changes, containerChanges) {
  return Object.assign({}, valuationData, { fx: Object.assign({}, valuationFx, containerChanges, { rates: { 'USD/TRY': Object.assign({}, valuationFx.rates['USD/TRY'], changes) } }) });
};
[0, -1, '40', Infinity, NaN].forEach(function (price) {
  const invalidFx = buildPortfolioValuation({ data: withFx({ price: price }), portfolioData: valuationHoldings });
  assert.equal(invalidFx.fxRate, null, 'only finite positive numeric source rates are accepted');
  assert.equal(invalidFx.totalsUsd, null);
});
[{ __error: 'source failed' }, { stale: true }, { freshness: { status: 'stale' } }, { status: 'unavailable' }, { base: 'EUR' }, { quote: 'USD' }, { quoteTime: null }, { quoteTime: '2026-10-02' }, { quoteTime: '2026-10-02T18:00:00' }].forEach(function (changes) {
  assert.equal(buildPortfolioValuation({ data: withFx(changes), portfolioData: valuationHoldings }).fxRate, null, 'failed, stale, unidentified and undated FX sources are unusable');
});
assert.equal(buildPortfolioValuation({ data: withFx({}, { __error: 'FX feed failed' }), portfolioData: valuationHoldings }).fxRate, null);
assert.equal(buildPortfolioValuation({ data: withFx({}, { stale: true }), portfolioData: valuationHoldings }).fxRate, null);
assert.equal(buildPortfolioValuation({ data: withFx({ quoteTime: '2026-10-02T21:00:00+03:00' }), portfolioData: valuationHoldings }).fxRate, 40, 'a timestamp with an explicit timezone remains valid evidence');

const missingAssetHoldings = Object.assign({}, valuationHoldings, { us: valuationHoldings.us.concat([{ symbol: 'MISSING', amount: 1, avgPrice: 90 }]) });
const partialPrices = buildPortfolioValuation({ data: valuationData, portfolioData: missingAssetHoldings });
assert.equal(partialPrices.rows.length, 4, 'unpriced holdings are retained');
assert.equal(partialPrices.rows[1].symbol, 'MISSING');
assert.equal(partialPrices.rows[1].value, null);
assert.equal(partialPrices.rows[1].cost, 90, 'known local cost survives a missing price');
assert.equal(partialPrices.rows[1].pnl, null);
assert.equal(partialPrices.missingPriceCount, 1);
assert.equal(partialPrices.coverage.priceRatio, 0.75);
assert.equal(partialPrices.totalsUsd, null, 'priced subtotals are not mislabeled as the full portfolio');
assert.equal(partialPrices.pnlUsd, null);
assert.equal(partialPrices.weightsAvailable, false);
assert.ok(partialPrices.rows.every(function (row) { return row.weightPct === null; }));
[0, -1, '100', Infinity, NaN].forEach(function (price) {
  const badPriceData = Object.assign({}, valuationData, { us: [Object.assign({}, valuationData.us[0], { price: price })] });
  assert.equal(buildPortfolioValuation({ data: badPriceData, portfolioData: valuationHoldings }).missingPriceCount, 1, 'invalid prices cannot become zero-valued positions');
});
const stalePriceData = Object.assign({}, valuationData, { us: [Object.assign({}, valuationData.us[0], { decision: { freshness: { status: 'stale' } } })] });
assert.equal(buildPortfolioValuation({ data: stalePriceData, portfolioData: valuationHoldings }).missingPriceCount, 1, 'a explicitly stale quote is not treated as a current valuation');
const noCost = buildPortfolioValuation({ data: valuationData, portfolioData: { us: [{ symbol: 'USDASSET', amount: 2 }] } });
assert.equal(noCost.totalsUsd, 200);
assert.equal(noCost.rows[0].cost, null);
assert.equal(noCost.rows[0].pnl, null);
assert.equal(noCost.rows[0].pnlPct, null);
assert.equal(noCost.pnlUsd, null, 'missing average cost does not fabricate a gain');
assert.equal(noCost.missingCostCount, 1);
const zeroCost = buildPortfolioValuation({ data: valuationData, portfolioData: { us: [{ symbol: 'USDASSET', amount: 2, avgPrice: 0 }] } });
assert.equal(zeroCost.pnlUsd, 200);
assert.equal(zeroCost.rows[0].pnlPct, null, 'a zero cost basis does not create a finite return percentage');
const unavailablePortfolio = buildPortfolioValuation({ data: valuationData, portfolioData: null });
assert.equal(unavailablePortfolio.status, 'unavailable');
assert.equal(unavailablePortfolio.totalsUsd, null);
assert.equal(unavailablePortfolio.coverage.totalCount, null);
const emptyPortfolio = buildPortfolioValuation({ data: valuationData, portfolioData: { us: [], bist: [], crypto: [] } });
assert.equal(emptyPortfolio.status, 'empty');
assert.equal(emptyPortfolio.totalsUsd, 0);
assert.equal(emptyPortfolio.totalsTry, 0);
assert.equal(emptyPortfolio.pnlUsd, 0);
const noFxActions = buildPortfolioActions({ data: noFxData, portfolioData: valuationHoldings });
assert.equal(noFxActions.totalUsd, null);
assert.equal(noFxActions.cryptoWeightPct, null);
assert.equal(noFxActions.riskAvailable, false);
assert.ok(noFxActions.summary.includes('tam risk hesabı yapılamadı'));
assert.ok(noFxActions.actions.some(function (action) { return action.kind === 'data-gap'; }));
assert.ok(!noFxActions.actions.some(function (action) { return ['hold', 'trim', 'rebalance'].includes(action.kind); }), 'unknown weights never produce a clean bill of health or concentration action');
const incompleteRisk = buildPortfolioRiskPlan({ data: noFxData, portfolioData: valuationHoldings });
assert.equal(incompleteRisk.status, 'incomplete');
assert.equal(incompleteRisk.totalUsd, null);
assert.equal(incompleteRisk.riskBudget.totalNavUsd, null);
assert.equal(incompleteRisk.targetAllocations[0].currentWeightPct, null);
assert.equal(incompleteRisk.targetAllocations[0].maxWeightPct, null);
assert.equal(incompleteRisk.targetAllocations[0].action, 'unavailable');
assert.equal(incompleteRisk.riskBudget.maxSingleNamePct, 35);
assert.equal(incompleteRisk.riskBudget.maxCryptoPct, 50);
assert.ok(incompleteRisk.targetAllocations.some(function (row) { return row.symbol === 'COIN' && row.action === 'exit'; }), 'known weak-score policy remains unchanged even while valuation coverage is incomplete');
assert.equal(buildPortfolioRiskPlan({ data: noFxData, portfolioData: { us: valuationHoldings.us } }).riskAvailable, true, 'USD-native portfolio risk does not depend on a missing TRY conversion');
assert.equal(buildPortfolioRiskPlan({ data: valuationData, portfolioData: missingAssetHoldings }).status, 'incomplete');
console.log('   ok');

console.log('3. buildAssetThesis creates thesis, invalidation and catalyst...');
const thesis = buildAssetThesis(snapshot.us[0], {
  calendar: { companyNews: [{ symbol: 'AAPL', headline: 'Apple event expected this week', source: 'Yahoo' }] },
});
assert.ok(thesis.thesis.includes('Bekle'));
assert.ok(thesis.invalidation.includes('Aktif AL sinyali yok'));
assert.ok(thesis.catalysts[0].includes('Apple event'));
console.log('   ok');

console.log('4. buildReportTrust separates deterministic and AI data provenance...');
const trust = buildReportTrust({
  generatedAt: '2026-06-08T20:20:00.000Z',
  dataAsOf: { usAsOf: '2026-06-08T20:00:00.000Z', cryptoAsOf: '2026-06-08T20:10:00.000Z' },
  calendar: { economic: [{ event: 'CPI', estimate: 4.2, actual: null }] },
}, { macroSummary: 'AI text' });
assert.equal(trust.hasAi, true);
assert.ok(trust.items.some((x) => x.label === 'Takvim verisi' && x.status === 'forecast'));
assert.ok(trust.items.some((x) => x.label === 'Yapay zeka katmani' && x.status === 'ai'));
console.log('   ok');

console.log('5. buildAlertRules suggests actionable rules...');
const holdAlerts = buildAlertRules(snapshot.us[0], { weightPct: 18 });
assert.ok(!holdAlerts.some((a) => a.trigger.includes('stop')));
assert.ok(holdAlerts.some((a) => a.trigger.includes('MACD')));
const buyAlerts = buildAlertRules(snapshot.us[1], { weightPct: 18 });
assert.ok(buyAlerts.some((a) => a.trigger.includes('stop')));
const stopAlert = buyAlerts.find((a) => a.trigger.includes('stop'));
assert.match(stopAlert.action, /fiyat kaynağından doğrula/);
assert.match(stopAlert.action, /kayıtlı bozulma koşulunu.*riskini yeniden incele/);
const modelAlerts = buildAlertRules({ ...snapshot.us[1], ind: { rsi: 30, macd: { histogram: -1 } } }, { weightPct: 40 });
assert.equal(modelAlerts.length, 4, 'stop, RSI, MACD and concentration remain distinct conditional rules');
assert.ok(modelAlerts.every((alert) => !/Tez bozuldu|pozisyonu azalt veya kapat|Tek varlik riskini azalt|Tepki alimi icin/i.test(alert.action)), 'a technical condition must not claim a confirmed broken thesis or prescribe a transaction');
assert.match(modelAlerts.find((alert) => alert.trigger.includes('Portfoy')).action, /Hesaplanan ağırlığı risk bütçen/);
console.log('   ok');

console.log('6. buildPredictionScorecard computes metrics...');
const mockJournal = {
  predictions: [
    { symbol: 'AAPL', market: 'us', outcome: 'target-hit', resultPct: 10, source: 'system', resolvedAt: '2026-06-08T20:00:00.000Z' },
    { symbol: 'BTC', market: 'crypto', outcome: 'stop-hit', resultPct: -5, source: 'user', resolvedAt: '2026-06-07T20:00:00.000Z' },
    { symbol: 'ETH', market: 'crypto', outcome: 'expired-win', resultPct: 3, source: 'system', resolvedAt: '2026-06-06T20:00:00.000Z' },
    { symbol: 'XRP', market: 'crypto', outcome: 'open', source: 'user' }
  ]
};
const card = buildPredictionScorecard(mockJournal);
assert.equal(card.total, 4);
assert.equal(card.open, 1);
assert.equal(card.closed, 3);
assert.equal(card.wins, 2);
assert.equal(card.losses, 1);
assert.equal(card.winRate, 67);
assert.equal(card.avgResultPct, 2.7);
assert.equal(card.last5Closed.length, 3);
assert.equal(card.bySource.system.total, 2);
assert.equal(card.bySource.system.wins, 2);
assert.equal(card.bySource.user.total, 2);
assert.equal(card.bySource.user.wins, 0);
const strictCard = buildPredictionScorecard({ predictions: [
  { outcome: 'target-hit', resultPct: 8, source: 'system' },
  { outcome: 'stop-hit', resultPct: -4, source: 'system' },
  { outcome: 'stop-hit', outcomeEvidence: 'ambiguous_bar', resultPct: -2, source: 'system' },
  { outcome: 'future-enum', resultPct: 'not-a-number', source: 'user' },
  { outcome: 'future-enum-2', resultPct: null, source: 'user' },
] });
assert.equal(strictCard.closed, 5);
assert.equal(strictCard.wins, 1);
assert.equal(strictCard.losses, 1);
assert.equal(strictCard.decisive, 2);
assert.equal(strictCard.ambiguous, 1);
assert.equal(strictCard.unscored, 2);
assert.equal(strictCard.winRate, 50);
assert.equal(strictCard.avgResultPct, 2);
assert.equal(strictCard.resultSampleSize, 2);
assert.equal(strictCard.last5Closed.find((x) => x.outcomeEvidence === 'ambiguous_bar').outcomeEvidence, 'ambiguous_bar');
assert.equal(strictCard.bySource.system.ambiguous, 1);
assert.equal(strictCard.bySource.user.winRate, null);
const noValidPct = buildPredictionScorecard({ predictions: [{ outcome: 'target-hit', resultPct: '5' }] });
assert.equal(noValidPct.avgResultPct, null);
assert.equal(noValidPct.resultSampleSize, 0);
console.log('   ok');

console.log('7. calculatePosition calculates size and levels...');
const calc1 = calculatePosition(10000, 2, 100, 2);
assert.equal(calc1.available, true);
assert.equal(calc1.entry, 100);
assert.equal(calc1.stop, 97);
assert.equal(calc1.target, 106);
assert.equal(calc1.riskAmount, 200);
assert.equal(calc1.units, 66);
assert.equal(calc1.positionAmount, 6600);
assert.equal(calc1.actualRiskAmount, 198);
assert.equal(calc1.capitalLimited, false);
assert.equal(calc1.constraints.quantityDecimals, 0);
assert.equal(calc1.constraints.fractionalQuantity, false);
assert.equal(calc1.constraints.leverageAllowed, false);

const calcInvalid = calculatePosition(10000, 2, 0, 2);
assert.equal(calcInvalid.available, false);
const positionValidInputs = [10000, 2, 100, 2];
positionValidInputs.forEach(function (_, index) {
  [undefined, null, '', '100', '100oops', 0, -1, NaN, Infinity].forEach(function (invalid) {
    const params = positionValidInputs.slice();
    params[index] = invalid;
    const result = calculatePosition.apply(null, params);
    assert.equal(result.available, false, 'no invalid capital/risk/price/ATR input can acquire defaults');
    assert.ok(result.reason);
  });
});
assert.equal(calculatePosition(10000, 100.01, 100, 2).available, false, 'risk percentage cannot exceed the entire capital');
assert.equal(calculatePosition(10000, 100, 100, 2).available, true, '100% is a valid explicit budget, still limited by capital');
assert.equal(calculatePosition(10000, 2, 100, 100).available, false, 'ATR cannot produce a negative stop');
assert.equal(calculatePosition(10000, 2, 100, 100 / 1.5).available, false, 'a zero stop is invalid');

const calcCapitalLimited = calculatePosition(10000, 2, 100, 0.001);
assert.equal(calcCapitalLimited.available, true);
assert.equal(calcCapitalLimited.capitalLimited, true);
assert.equal(calcCapitalLimited.units, 100);
assert.equal(calcCapitalLimited.positionAmount, 10000, 'a small stop cannot create implicit leverage');
assert.equal(calcCapitalLimited.riskAmount, 200, 'riskAmount retains the explicit budget');
assert.ok(calcCapitalLimited.actualRiskAmount < 1, 'actual stop risk is separate from the unused budget');
assert.ok(calcCapitalLimited.stop < calcCapitalLimited.entry, 'small stops retain enough price precision');

const calcFractional = calculatePosition(10000, 2, 60000, 1000);
assert.equal(calcFractional.available, true);
assert.equal(calcFractional.units, 0.13333333, 'fractional amounts are floored to eight places');
assert.equal(calcFractional.constraints.quantityDecimals, 8);
assert.equal(calcFractional.constraints.fractionalQuantity, true);
assert.ok(calcFractional.actualRiskAmount <= 200);
assert.ok(calcFractional.positionAmount <= 10000);
const calcFractionCapital = calculatePosition(30, 2, 100, 0.001);
assert.equal(calcFractionCapital.available, true);
assert.equal(calcFractionCapital.capitalLimited, true);
assert.equal(calcFractionCapital.units, 0.3);
assert.equal(calcFractionCapital.positionAmount, 30);

const calcTinyQuote = calculatePosition(10000, 2, 0.00000008, 0.000000001);
assert.equal(calcTinyQuote.available, true);
assert.equal(calcTinyQuote.entry, 0.00000008);
assert.ok(calcTinyQuote.stop > 0 && calcTinyQuote.stop < calcTinyQuote.entry);
assert.ok(calcTinyQuote.target > calcTinyQuote.entry);
assert.ok(calcTinyQuote.priceDecimals > 4, 'small crypto prices cannot round to a displayed zero');
const calcUnrepresentableQuote = calculatePosition(10000, 2, 1e-14, 1e-15);
assert.equal(calcUnrepresentableQuote.available, false);
assert.ok(calcUnrepresentableQuote.reason.includes('12 ondalık'));
const calcUnrepresentableQuantity = calculatePosition(1, 2, 1e12, 1);
assert.equal(calcUnrepresentableQuantity.available, false);
assert.ok(calcUnrepresentableQuantity.reason.includes('en küçük'));

const calcSubCentCapital = calculatePosition(0.009, 2, 100, 1);
assert.equal(calcSubCentCapital.available, true);
assert.ok(calcSubCentCapital.positionAmount <= 0.009, 'money rounding must not turn a valid position into one above capital');
assert.ok(calcSubCentCapital.actualRiskAmount <= calcSubCentCapital.riskAmount);
assert.equal(calculatePosition(Number.MAX_VALUE, 2, 100, 1e-12).available, false, 'nonfinite unit limits are unavailable');
assert.equal(calculatePosition(10000, 2, Number.MAX_VALUE, Number.MAX_VALUE / 4).available, false, 'nonfinite target levels are unavailable');
assert.equal(calculatePosition(1e-320, 1e-320, 100, 1).available, false, 'underflow cannot become a positive fabricated budget');

[1e-9, 0.05, 1, 100, 60000, 1e10].forEach(function (entryPrice) {
  [0.00001, 0.01, 0.2].forEach(function (atrRatio) {
    [0.5, 2, 100].forEach(function (budgetPct) {
      const result = calculatePosition(10000, budgetPct, entryPrice, entryPrice * atrRatio);
      if (!result.available) return;
      [result.entry, result.stop, result.target, result.units, result.positionAmount, result.actualRiskAmount].forEach(function (value) {
        assert.ok(Number.isFinite(value) && value > 0, 'available levels, quantity, cost and risk are finite and positive');
      });
      assert.ok(result.stop < result.entry && result.entry < result.target);
      assert.ok(result.positionAmount <= 10000, 'capital limit holds across price magnitudes');
      assert.ok(result.actualRiskAmount <= result.riskAmount, 'rounded quantity never exceeds risk budget');
      if (result.constraints.quantityDecimals === 0) assert.equal(result.units, Math.floor(result.units), 'legacy whole-unit policy remains intact');
    });
  });
});
console.log('   ok');

console.log('8. buildIdeaFunnel separates candidates from recommendations...');
const funnel = buildIdeaFunnel(snapshot, mockJournal);
assert.equal(funnel.buckets.advance[0].symbol, 'AMD');
assert.ok(funnel.buckets.watchlist.some((x) => x.symbol === 'AAPL'));
assert.ok(funnel.buckets.reject.some((x) => x.symbol === 'XRP'));
assert.ok(funnel.buckets.advance[0].nextWorkflow.includes('thesis'));
assert.equal(funnel.buckets.advance[0].recommendation, false);
console.log('   ok');

console.log('9. buildCatalystCalendar ranks decision pressure...');
const calendar = buildCatalystCalendar(snapshot, {
  calendar: {
    companyNews: [
      { symbol: 'AAPL', headline: 'Apple event expected this week', source: 'Yahoo', date: '2026-06-10' },
      { symbol: 'AMD', headline: 'AI accelerator launch window', source: 'IR', date: '2026-06-11' },
    ],
    economic: [
      { event: 'CPI', date: '2026-06-12', importance: 'high', estimate: 3.2, actual: null },
    ],
  },
});
assert.equal(calendar.events[0].decisionPressure, 'high');
assert.ok(calendar.events.some((x) => x.symbol === 'AMD' && x.thesisLink.includes('skor')));
assert.ok(calendar.prepQueue[0].action.includes('esik'));
console.log('   ok');

console.log('10. buildPortfolioRiskPlan names binding risk constraints...');
const riskPlan = buildPortfolioRiskPlan({ data: snapshot, portfolioData: portfolio, usdtry: 40 });
assert.equal(riskPlan.status, 'concentrated');
assert.equal(riskPlan.riskBudget.totalNavUsd, riskPlan.totalUsd);
assert.equal(riskPlan.riskBudget.maxSingleNamePct, 35);
assert.equal(riskPlan.riskBudget.maxCryptoPct, 50);
assert.ok(riskPlan.riskBudget.bindingConstraint.includes('Kripto'));
assert.ok(riskPlan.constraints.some((x) => x.kind === 'single-market'));
assert.ok(riskPlan.monitoringRules.some((x) => x.action.includes('azalt')));
assert.ok(riskPlan.targetAllocations.some((x) => x.symbol === 'XRP' && x.action === 'exit'));
console.log('   ok');

console.log('11. buildCfoDecisionCockpit ranks ready, gated and blocked decisions...');
const cockpit = buildCfoDecisionCockpit(snapshot, mockJournal, {
  signalOverlay: {
    assets: {
      'us:AMD': {
        totalAdjustment: -2,
        adjustedScore: 63,
        status: 'watch',
        components: [
          { type: 'scenarioSensitivity', reason: 'Scenario sensitivity requires sizing work' },
        ],
      },
      'crypto:XRP': {
        totalAdjustment: -1,
        adjustedScore: 22,
        status: 'risk',
        components: [
          { type: 'thesisStatus', reason: 'Thesis missing' },
        ],
      },
    },
  },
});
assert.ok(cockpit.summary.includes('aday kanıt bekliyor'));
assert.ok(!/direkt[oö]r|kokpit/i.test(cockpit.summary), 'decision summary uses plain language');
assert.ok(cockpit.rows.length >= 2);
assert.ok(cockpit.rows.some((x) => x.symbol === 'AMD' && x.status === 'gated'));
assert.ok(cockpit.rows.some((x) => x.symbol === 'XRP' && x.status === 'blocked'));
assert.ok(cockpit.rows[0].decisionAsk);
assert.ok(cockpit.rows[0].missingEvidence.length >= 1);
const readyAssets = Array.from({ length: 9 }, function (_, i) {
  return { market: 'us', symbol: 'READY' + i, name: 'Ready candidate ' + i, price: 100,
    analysis: { score: 80 - i, tone: 'buy', label: 'AL' }, decision: { freshness: { status: 'fresh' }, trade: { available: true } } };
});
const prioritySnapshot = { generatedAt: snapshot.generatedAt, us: readyAssets.concat([
  { market: 'us', symbol: 'BLOCKED1', analysis: { score: 20, tone: 'sell', label: 'SAT' } },
  { market: 'us', symbol: 'BLOCKED2', analysis: { score: 10, tone: 'sell', label: 'SAT' } },
]) };
const readyNotes = { notes: {} };
readyAssets.forEach(function (asset) { readyNotes.notes['us:' + asset.symbol] = { thesis: 'tez', invalidation: 'kosul' }; });
const priorityCockpit = buildCfoDecisionCockpit(prioritySnapshot, readyNotes, {});
assert.equal(priorityCockpit.counts.ready, 9);
assert.equal(priorityCockpit.counts.blocked, 2);
assert.equal(priorityCockpit.rows.length, 8);
assert.ok(priorityCockpit.rows.every(function (row) { return row.status === 'ready'; }));
assert.deepEqual(priorityCockpit.marketGroups.map(function (group) { return group.market; }), ['us', 'bist', 'crypto']);
assert.equal(priorityCockpit.marketGroups[0].total, 11, 'market totals include candidates beyond the preview');
assert.deepEqual(priorityCockpit.marketGroups[0].counts, { ready: 9, gated: 0, watch: 0, blocked: 2 });
assert.equal(priorityCockpit.marketGroups[0].rows.length, 3, 'each market preview contains at most three candidates');
assert.equal(priorityCockpit.marketGroups[0].empty, false);
assert.ok(priorityCockpit.marketGroups.slice(1).every(function (group) { return group.empty && group.total === 0 && group.rows.length === 0; }), 'markets without scored data remain distinct empty groups');

const groupedSnapshot = Object.assign({}, prioritySnapshot, {
  bist: [
    { symbol: 'BISTGATED', name: 'BIST gated', price: 100, analysis: { score: 70, tone: 'buy', label: 'AL' }, decision: { freshness: { status: 'fresh' }, trade: { available: true } } },
    { symbol: 'BISTWATCH', price: 100, analysis: { score: 59, tone: 'hold', label: 'TUT' }, decision: { freshness: { status: 'fresh' } } },
    { symbol: 'BISTBLOCKED', price: 100, analysis: { score: 30, tone: 'sell', label: 'SAT' }, decision: { freshness: { status: 'fresh' } } },
    { symbol: 'BISTREADY', price: 100, analysis: { score: 62, tone: 'buy', label: 'AL' }, decision: { freshness: { status: 'fresh' }, trade: { available: true } } },
  ],
  crypto: [
    { symbol: 'BTC', name: 'Bitcoin', price: 100, analysis: { score: 68, tone: 'buy', label: 'AL' }, decision: { freshness: { status: 'fresh' }, trade: { available: true } } },
    { symbol: 'ETH', price: 100, analysis: { score: 48, tone: 'hold', label: 'TUT' }, decision: { freshness: { status: 'fresh' } } },
    snapshot.crypto[0],
  ],
});
const groupedJournal = { notes: Object.assign({}, readyNotes.notes, {
  'bist:BISTREADY': { thesis: 'BIST tez', invalidation: 'BIST bozulma koşulu' },
  'bist:BISTGATED': { thesis: 'BIST tez' },
}) };
const groupedReport = { signalOverlay: { assets: {
  'crypto:BTC': { adjustedScore: 66, totalAdjustment: -2, components: [{ type: 'compsValuationGap', reason: 'Likidite kanıtı eksik', adjustment: -2 }] },
} } };
const groupedInputBefore = JSON.stringify([groupedSnapshot, groupedJournal, groupedReport]);
const groupedCockpit = buildCfoDecisionCockpit(groupedSnapshot, groupedJournal, groupedReport);
assert.ok(groupedCockpit.rows.every(function (row) { return row.market === 'us'; }), 'legacy top-eight ranking remains unchanged when US has nine stronger ready candidates');
assert.deepEqual(groupedCockpit.marketGroups.map(function (group) { return group.rows[0].market; }), ['us', 'bist', 'crypto'], 'independent previews retain all three markets despite global truncation');
assert.deepEqual(groupedCockpit.marketGroups[0].rows.map(function (row) { return row.symbol; }), ['READY0', 'READY1', 'READY2'], 'scores remain descending within the same readiness status');
const bistGroup = groupedCockpit.marketGroups[1];
assert.equal(bistGroup.marketLabel, 'BIST');
assert.equal(bistGroup.total, 4);
assert.deepEqual(bistGroup.counts, { ready: 1, gated: 1, watch: 1, blocked: 1 }, 'counts reflect the full market queue, including the hidden fourth row');
assert.deepEqual(bistGroup.rows.map(function (row) { return [row.symbol, row.status]; }), [['BISTREADY', 'ready'], ['BISTGATED', 'gated'], ['BISTWATCH', 'watch']], 'readiness outranks a higher technical score within each market');
assert.deepEqual(bistGroup.rows[1].missingEvidence, ['tez bozulma koşulu yok']);
const cryptoGroup = groupedCockpit.marketGroups[2];
assert.equal(cryptoGroup.marketLabel, 'Kripto');
assert.deepEqual(cryptoGroup.counts, { ready: 0, gated: 1, watch: 1, blocked: 1 });
assert.equal(cryptoGroup.rows[0].name, 'Bitcoin');
assert.equal(cryptoGroup.rows[0].score, 68);
assert.equal(cryptoGroup.rows[0].adjustedScore, 66, 'grouping preserves the evidence-adjusted score');
assert.equal(cryptoGroup.rows[0].bindingReason, 'tez notu yok');
assert.deepEqual(cryptoGroup.rows[0].missingEvidence, ['tez notu yok', 'tez bozulma koşulu yok', 'Likidite kanıtı eksik'], 'grouping retains thesis gaps and report evidence verbatim');
assert.ok(cryptoGroup.rows[0].decisionAsk && cryptoGroup.rows[0].retainedExposure && cryptoGroup.rows[0].nextWorkflow, 'decision context remains available on each grouped row');
assert.equal(JSON.stringify([groupedSnapshot, groupedJournal, groupedReport]), groupedInputBefore, 'market grouping does not mutate inputs');
assert.deepEqual(groupedCockpit.marketGroups[0].rows[0], groupedCockpit.rows[0], 'the grouped and legacy surfaces share the same decision information');
const emptyCockpit = buildCfoDecisionCockpit(null, null, null);
assert.equal(emptyCockpit.empty, true);
assert.deepEqual(emptyCockpit.rows, []);
assert.deepEqual(emptyCockpit.counts, {}, 'legacy no-data counts remain backward compatible');
assert.ok(emptyCockpit.summary.includes('piyasa verisi bekleniyor'));
assert.equal(emptyCockpit.marketGroups.length, 3);
emptyCockpit.marketGroups.forEach(function (group) {
  assert.equal(group.empty, true);
  assert.equal(group.total, 0);
  assert.deepEqual(group.rows, []);
  assert.deepEqual(group.counts, { ready: 0, gated: 0, watch: 0, blocked: 0 });
});

console.log('11b. candidate explanations use existing technical evidence without changing decisions...');
const aaplCandidate = cockpit.rows.find(function (row) { return row.symbol === 'AAPL'; });
assert.ok(aaplCandidate.selectionReason.includes(snapshot.us[0].analysis.reasons[0].text), 'the existing positive technical reason explains selection');
assert.ok(aaplCandidate.selectionReason.includes(snapshot.us[0].analysis.reasons[1].text), 'an opposing technical signal is retained beside the positive reason');
assert.ok(aaplCandidate.selectionReason.includes('Dikkat:'), 'conflicting technical evidence is clearly marked');
assert.ok(aaplCandidate.selectionReason.includes('Veri taze'), 'verified freshness is visible beside technical evidence');
assert.deepEqual(aaplCandidate.evidenceGaps, aaplCandidate.missingEvidence, 'evidence gaps remain separate from why the candidate was selected');
const amdCandidate = cockpit.rows.find(function (row) { return row.symbol === 'AMD'; });
assert.equal(amdCandidate.selectionReason, 'Teknik puan 65/100; AL sinyali. Aktif işlem sinyali mevcut. · Veri taze', 'when reasoning is unavailable only supplied score, signal, available plan and freshness are stated');
assert.equal(amdCandidate.status, 'gated');
assert.ok(amdCandidate.nextAction.includes('Şirketi, kârı ve nakit akışını araştır'));
assert.ok(amdCandidate.evidenceGaps.includes('Scenario sensitivity requires sizing work'), 'report evidence is preserved verbatim');
const xrpCandidate = cockpit.rows.find(function (row) { return row.symbol === 'XRP'; });
assert.equal(xrpCandidate.selectionReason, snapshot.crypto[0].analysis.reasons[0].text + ' · Veri taze', 'blocked assets explain the existing negative signal');
assert.ok(xrpCandidate.nextAction.includes('pozisyonun varsa'), 'a blocked candidate does not assume the user owns a position');
assert.ok(cryptoGroup.rows[0].nextAction.includes('Protokol, likidite ve arzı araştır'));
assert.ok(!/şirket/i.test(cryptoGroup.rows[0].nextAction + cryptoGroup.rows[0].nextWorkflow), 'crypto research does not require a company workflow');
assert.ok(bistGroup.rows[1].nextAction.includes('kârı ve nakit akışını'));

const explanationFixture = function (changes, note, report) {
  const asset = Object.assign({ market: 'crypto', symbol: 'EVIDENCE', price: 100, analysis: { score: 70, tone: 'buy', label: 'AL' }, decision: { freshness: { status: 'fresh' }, trade: { available: true } } }, changes);
  return buildCfoDecisionCockpit({ generatedAt: snapshot.generatedAt, crypto: [asset] }, { notes: note ? { 'crypto:EVIDENCE': note } : {} }, report || {}).marketGroups[2].rows[0];
};
const summaryCandidate = explanationFixture({ analysis: { score: 70, tone: 'buy', label: 'AL', reasons: [null, { text: null }, { text: 123 }], summary: '  Kaynak teknik özeti: RSI 58; MACD pozitif.  ' } }, { thesis: 'Bu tez mevcut kaynak kanıtı değildir.', invalidation: 'Koşul' });
assert.equal(summaryCandidate.selectionReason, 'Kaynak teknik özeti: RSI 58; MACD pozitif. · Veri taze', 'a supplied analysis summary is the fallback when reason entries are unusable');
assert.ok(!summaryCandidate.selectionReason.includes('Bu tez'), 'journal prose is not promoted into technical evidence');
assert.equal(summaryCandidate.status, 'ready');
assert.deepEqual(summaryCandidate.evidenceGaps, []);
assert.ok(summaryCandidate.nextAction.includes('portföy risk limitlerinle'));
const noPlanCandidate = explanationFixture({ decision: { freshness: { status: 'fresh' }, trade: { available: false } } });
assert.equal(noPlanCandidate.selectionReason, 'Teknik puan 70/100; AL sinyali. · Veri taze', 'an unavailable plan is never described as an active signal');
assert.ok(noPlanCandidate.nextAction.startsWith('Aktif giriş/stop/hedef sinyalini bekle'));
assert.ok(noPlanCandidate.evidenceGaps.includes('aktif giriş/stop/hedef sinyali eksik'));
const positiveOnlyBlocked = explanationFixture({ analysis: { score: 30, tone: 'sell', label: 'SAT', reasons: [{ sentiment: 'pos', text: 'RSI toparlıyor.' }] } });
assert.equal(positiveOnlyBlocked.status, 'blocked');
assert.equal(positiveOnlyBlocked.selectionReason, 'Teknik puan 30/100; SAT sinyali. · Veri taze', 'a blocked candidate does not cherry-pick a lone positive indicator as its selection reason');
const staleCandidate = explanationFixture({ decision: { status: 'blocked', freshness: { status: 'stale', label: 'Veri eski' }, trade: { available: true } } }, { thesis: 'Tez', invalidation: 'Koşul' });
assert.equal(staleCandidate.status, 'blocked', 'an explicit decision block cannot be presented as ready');
assert.equal(staleCandidate.score, 70);
assert.equal(staleCandidate.adjustedScore, 70);
assert.ok(staleCandidate.selectionReason.includes('Veri eski'));
assert.ok(staleCandidate.nextAction.startsWith('Önce fiyat verisini yenile'), 'supplied stale data is refreshed before a next-step trade check');
const decisionBlockedCandidate = explanationFixture({ decision: { status: 'blocked', freshness: { status: 'fresh' }, trade: { available: true } } }, { thesis: 'Tez', invalidation: 'Koşul' });
assert.equal(decisionBlockedCandidate.status, 'blocked');
assert.ok(decisionBlockedCandidate.selectionReason.includes('Veri taze'));
assert.ok(decisionBlockedCandidate.nextAction.startsWith('Karar kontrolündeki uyarıları incele'), 'existing decision warnings remain visible even when cockpit readiness rules differ');
const unknownTimeCandidate = explanationFixture({ decision: { freshness: { status: 'unknown' }, trade: { available: true } } });
assert.ok(unknownTimeCandidate.selectionReason.includes('Veri zamanı doğrulanmadı'));
assert.ok(unknownTimeCandidate.nextAction.startsWith('Önce fiyat ve zamanını doğrula'));
const manyGapsCandidate = explanationFixture({}, null, { signalOverlay: { assets: { 'crypto:EVIDENCE': { components: Array.from({ length: 5 }, function (_, index) { return { type: 'modelAuditGap', reason: 'Kaynak açığı ' + index }; }) } } } });
assert.equal(manyGapsCandidate.missingEvidence.length, 4, 'legacy evidence previews remain bounded');
assert.equal(manyGapsCandidate.evidenceGaps.length, 7, 'the new evidence field retains all supplied gaps');
assert.ok(manyGapsCandidate.evidenceGaps.includes('Kaynak açığı 4'), 'long evidence lists do not discard the final report gap');
console.log('   ok');

console.log('12. buildDecisionLearningPanel and buildAssetLearningSnippet expose audit lessons...');
const learningBase = {
  generatedAt: '2026-06-14T12:00:00.000Z',
  scorecard: card,
  decisionLearning: {
    totalAudits: 5,
    systemAudits: 5,
    learningRules: [
      {
        id: 'learning:us:AL:60-69',
        scope: { market: 'us', label: 'AL', scoreBucket: '60-69' },
        adjustment: 1,
        confidence: 0.7,
        sampleSize: 5,
        winRate: 80,
        reason: 'ABD AL 60-69 kovasi gecmiste iyi calisti.',
        expiresAt: '2026-06-20T12:00:00.000Z',
      },
    ],
    recentLessons: [
      { id: 'amd:audit', market: 'us', symbol: 'AMD', lesson: 'AMD hedefe ulasti.', confidence: 0.7 },
    ],
    reviewQueue: [],
  },
};
const learningPanel = buildDecisionLearningPanel(learningBase);
assert.equal(learningPanel.empty, false);
assert.ok(learningPanel.metrics.some((x) => x.label === 'Aktif kural' && x.value === 0));
assert.equal(learningPanel.rules.length,0);
assert.equal(learningPanel.proposalRules.length,0);
assert.ok(learningPanel.archivedRules[0].reason.includes('ABD'));
const assetLearning = buildAssetLearningSnippet(snapshot.us[1], learningBase);
assert.equal(assetLearning.kind, 'archive');
assert.equal(assetLearning.adjustment, 0);
learningBase.decisionLearning.evidenceVersion = 'technical-learning-v2';
learningBase.decisionLearning.learningRules[0].activation = 'proposal_only';
learningBase.decisionLearning.learningRules[0].validationStatus = 'chronological_validation_required';
const proposedPanel = buildDecisionLearningPanel(learningBase);
assert.equal(proposedPanel.rules.length,0);
assert.equal(proposedPanel.proposalRules.length,1);
assert.equal(buildAssetLearningSnippet(snapshot.us[1],learningBase).adjustment,0);
learningBase.decisionLearning.learningRules[0].activation = 'active';
learningBase.decisionLearning.learningRules[0].validationStatus = 'chronologically_validated';
assert.equal(buildDecisionLearningPanel(learningBase).rules.length,0,'unchecked activation flags cannot activate a rule');
console.log('   ok');

console.log('13. buildCompanyTearsheet and buildCompsSnapshot produce evidence-aware snapshots...');
const tearsheet = buildCompanyTearsheet(snapshot.us[0], snapshot, mockJournal);
assert.equal(tearsheet.symbol, 'AAPL');
assert.ok(tearsheet.metrics.some((x) => x.label === 'Teknik skor'));
assert.ok(tearsheet.gaps.some((x) => x.includes('temel')));
const comps = buildCompsSnapshot(snapshot.us[0], snapshot);
assert.equal(comps.target.symbol, 'AAPL');
assert.ok(comps.peerSet.length >= 1);
assert.equal(comps.peerAverageScore, snapshot.us[1].analysis.score);
const invalidComparisons = buildCompsSnapshot(snapshot.us[0], { us: [snapshot.us[1],
  { market: 'us', symbol: 'BROKEN', analysis: { score: NaN } },
  { market: 'us', symbol: 'OUT', analysis: { score: 200 } },
  { market: 'us', symbol: 'FAIL', __error: 'source unavailable', analysis: { score: 59 } },
] });
assert.deepEqual(invalidComparisons.peerSet.map((row) => row.symbol), ['AMD'], 'only sourced, valid technical scores enter comparisons');
assert.equal(buildCompsSnapshot({ market: 'us', symbol: 'NO_SCORE' }, snapshot).peerSet.length, 0);
console.log('   ok');

console.log('14. buildInvestmentCommitteeMemo creates readiness verdicts...');
const memoReady = buildInvestmentCommitteeMemo(snapshot.us[1], snapshot, {
  notes: {
    'us:AMD': {
      thesis: 'AI accelerator cycle can support upside.',
      invalidation: 'Break below stop invalidates the setup.',
    },
  },
  predictions: [],
}, {});
assert.equal(memoReady.verdict, 'senior-review-ready');
assert.ok(memoReady.sections.whatWeBelieve.length >= 1);
assert.ok(memoReady.sections.nextActions.some((x) => x.includes('risk bütçesi')));
const memoStale = buildInvestmentCommitteeMemo({ ...snapshot.us[1], decision: { ...snapshot.us[1].decision, freshness: { status: 'stale' } } }, snapshot, {
  notes: { 'us:AMD': { thesis: 'Saved thesis', invalidation: 'Saved stop' } },
}, {});
assert.equal(memoStale.verdict, 'blocked', 'saved thesis cannot make a stale price review-ready');
assert.ok(memoStale.sections.evidenceGaps.some((gap) => gap.includes('eski')));

const memoBlocked = buildInvestmentCommitteeMemo(snapshot.crypto[0], snapshot, mockJournal, {});
assert.equal(memoBlocked.verdict, 'blocked');
assert.ok(memoBlocked.sections.evidenceGaps.length >= 1);
console.log('   ok');

console.log('\nAction layer tests passed.');
