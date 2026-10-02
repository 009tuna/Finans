// Action layer tests: dashboard decision surfaces without network/browser dependencies.
'use strict';

const assert = require('assert');
const {
  buildDailyChangeDigest,
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
        freshness: { label: 'Veri taze' },
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
      decision: { confidence: { previousScore: 56, scoreDelta: 9 }, trade: { available: true, entry: 80, stop: 74, target: 92 } },
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
      decision: { score: 88, status: 'clean', confidence: { previousScore: 31, scoreDelta: -8 }, trade: { available: true, entry: 1.2, stop: 1.08, target: 1.44 } },
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

const calcInvalid = calculatePosition(10000, 2, 0, 2);
assert.equal(calcInvalid.available, false);
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
assert.ok(cockpit.summary.includes('Finans direktoru'));
assert.ok(cockpit.rows.length >= 2);
assert.ok(cockpit.rows.some((x) => x.symbol === 'AMD' && x.status === 'gated'));
assert.ok(cockpit.rows.some((x) => x.symbol === 'XRP' && x.status === 'blocked'));
assert.ok(cockpit.rows[0].decisionAsk);
assert.ok(cockpit.rows[0].missingEvidence.length >= 1);
const readyAssets = Array.from({ length: 9 }, function (_, i) {
  return { market: 'us', symbol: 'READY' + i, name: 'Ready candidate ' + i,
    analysis: { score: 80 - i, tone: 'buy', label: 'AL' }, decision: { trade: { available: true } } };
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
assert.ok(comps.readThrough.includes('benzer'));
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
assert.ok(memoReady.sections.nextActions.some((x) => x.includes('risk butcesi')));

const memoBlocked = buildInvestmentCommitteeMemo(snapshot.crypto[0], snapshot, mockJournal, {});
assert.equal(memoBlocked.verdict, 'blocked');
assert.ok(memoBlocked.sections.evidenceGaps.length >= 1);
console.log('   ok');

console.log('\nAction layer tests passed.');
