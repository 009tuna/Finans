'use strict';

const assert = require('assert');
const {
  buildMacroSignalOverlay,
  attachSignalOverlay,
} = require('../src/signal-overlay');

console.log('Signal overlay tests starting...\n');

const NOW = '2026-06-13T06:00:00.000Z';

function baseSnapshot() {
  return {
    generatedAt: NOW,
    us: [
      {
        market: 'us',
        symbol: 'AAPL',
        name: 'Apple',
        analysis: { score: 74, label: 'AL', tone: 'buy' },
        fundamentals: {},
      },
      {
        market: 'us',
        symbol: 'AMD',
        name: 'AMD',
        analysis: { score: 62, label: 'AL', tone: 'buy' },
        fundamentals: { marketCap: 1000000000, pe: 28 },
      },
    ],
    bist: [
      { market: 'bist', symbol: 'THYAO.IS', analysis: { score: 58, label: 'TUT', tone: 'hold' } },
    ],
    crypto: [
      { market: 'crypto', symbol: 'BTC', analysis: { score: 68, label: 'AL', tone: 'buy' } },
    ],
  };
}

const aiReport = {
  macroSummary: 'ABD risk appetite olumlu, kripto likidite destek; BIST/TL tarafinda baski ve volatilite var.',
  commentary: {
    us: 'Dovish Fed tonu risk appetite icin destek.',
    bist: 'TL ve BIST tarafinda baski suruyor.',
    crypto: 'BTC likidite genisleme sinyali olumlu.',
  },
  macroSignalOverlay: {
    generatedAt: NOW,
    signals: [
      {
        market: 'us',
        symbol: 'AAPL',
        type: 'companyNews',
        adjustment: 15,
        confidence: 0.9,
        source: 'https://example.com/company',
        reason: 'Apple earnings and partnership catalyst pressure',
        asOf: NOW,
        expiresAt: '2026-06-14T06:00:00.000Z',
      },
      {
        market: 'us',
        symbol: 'AAPL',
        type: 'macro',
        adjustment: -6,
        confidence: 0.8,
        source: 'https://example.com/expired',
        reason: 'Old CPI pressure',
        asOf: '2026-06-12T06:00:00.000Z',
        expiresAt: '2026-06-12T09:00:00.000Z',
      },
    ],
  },
};

const baseReport = {
  calendar: {
    economic: [
      { event: 'CPI', date: '2026-06-14', importance: 'high', impact: 'high' },
      { event: 'Fed rate decision', date: '2026-06-15', importance: 'high', impact: 'high' },
    ],
    earnings: [
      { symbol: 'AMD', date: '2026-06-14', epsEstimate: 1.2 },
    ],
    companyNews: [
      { symbol: 'AAPL', headline: 'Apple partnership and earnings event expected', source: 'Yahoo', date: '2026-06-13' },
    ],
  },
};

const journal = {
  notes: {
    'us:AAPL': { thesis: 'AI cycle remains intact', invalidation: 'Close below 50 DMA' },
    'us:AMD': { thesis: 'GPU share gain', invalidation: '' },
  },
  predictions: [
    { source: 'system', outcome: 'stop-hit', resultPct: -4, resolvedAt: '2026-06-01T00:00:00.000Z' },
    { source: 'system', outcome: 'stop-hit', resultPct: -5, resolvedAt: '2026-06-02T00:00:00.000Z' },
    { source: 'system', outcome: 'target-hit', resultPct: 7, resolvedAt: '2026-06-03T00:00:00.000Z' },
    { source: 'system', outcome: 'stop-hit', resultPct: -2, resolvedAt: '2026-06-04T00:00:00.000Z' },
    { source: 'system', outcome: 'stop-hit', resultPct: -3, resolvedAt: '2026-06-05T00:00:00.000Z' },
  ],
};

console.log('1. builds bounded overlay without mutating technical score...');
const overlay = buildMacroSignalOverlay({ snapshot: baseSnapshot(), aiReport, baseReport, journal, now: NOW });
const aapl = overlay.assets['us:AAPL'];
assert.equal(aapl.technicalScore, 74);
assert.equal(aapl.totalAdjustment, 8);
assert.equal(aapl.adjustedScore, 82);
assert.ok(aapl.components.some((x) => x.type === 'companyNews' && x.source === 'https://example.com/company'));
assert.ok(aapl.expiredComponents.some((x) => x.source === 'https://example.com/expired'));
console.log('   ok');

console.log('2. total overlay adjustment clamps at +/-8...');
const clampOverlay = buildMacroSignalOverlay({
  snapshot: baseSnapshot(),
  aiReport: {
    commentary: { us: 'risk appetite olumlu destek dovish rally likidite' },
    macroSignalOverlay: {
      signals: [
        { market: 'us', symbol: 'AMD', adjustment: 12, source: 'https://example.com/stress', reason: 'positive catalyst', asOf: NOW, expiresAt: '2026-06-14T06:00:00.000Z' },
        { market: 'us', symbol: 'AMD', adjustment: 7, source: 'https://example.com/stress2', reason: 'second catalyst', asOf: NOW, expiresAt: '2026-06-14T06:00:00.000Z' },
      ],
    },
  },
  baseReport: {},
  journal: {},
  now: NOW,
});
assert.equal(clampOverlay.assets['us:AMD'].totalAdjustment, 8);
console.log('   ok');

console.log('3. attaches overlay to cloned snapshot and leaves analysis.score unchanged...');
const snap = baseSnapshot();
const attached = attachSignalOverlay(snap, overlay);
assert.notStrictEqual(attached, snap);
assert.equal(attached.us[0].analysis.score, 74);
assert.equal(attached.us[0].signalOverlay.adjustedScore, 82);
console.log('   ok');

console.log('4. symbol catalysts do not leak to unrelated assets...');
const amd = overlay.assets['us:AMD'];
assert.ok(amd.components.some((x) => x.type === 'earnings'));
assert.ok(!amd.components.some((x) => x.type === 'companyNews' && x.reason.includes('Apple')));
console.log('   ok');

console.log('5. thesis, calibration and banking gaps are explicit components...');
assert.ok(aapl.components.some((x) => x.type === 'thesisStatus' && x.adjustment > 0));
assert.ok(amd.components.some((x) => x.type === 'thesisStatus' && x.adjustment < 0));
assert.ok(aapl.components.some((x) => x.type === 'predictionCalibration' && x.adjustment < 0));
assert.ok(aapl.components.some((x) => x.type === 'tearsheetCompleteness' && x.adjustment < 0));
assert.ok(aapl.components.some((x) => x.type === 'compsValuationGap'));
assert.ok(aapl.components.some((x) => x.type === 'modelAuditGap'));
assert.ok(aapl.components.some((x) => x.type === 'scenarioSensitivity'));
console.log('   ok');

console.log('6. market macro and summary fields are present...');
assert.equal(overlay.market.us.adjustment, 0);
assert.equal(overlay.market.us.status, "missing");
assert.equal(overlay.market.bist.adjustment, 0);
assert.equal(overlay.market.crypto.adjustment, 0);
assert.ok(overlay.summary.boosted >= 1);
assert.ok(overlay.generatedAt);
assert.ok(overlay.expiresAt);
console.log('   ok');

console.log('7. decision learning rules apply as bounded overlay components...');
const learningJournal = {
  predictions: [1, 2, 3, 4, 5].map((day) => ({
    id: 'us:AAPL:2026-05-0' + day,
    market: 'us',
    symbol: 'AAPL',
    label: 'AL',
    score: 74,
    source: 'system',
    outcome: day === 5 ? 'stop-hit' : 'target-hit',
    resultPct: day === 5 ? -4 : 6,
    entry: 100,
    target: 106,
    stop: 96,
    createdAt: '2026-05-0' + day + 'T10:00:00.000Z',
    resolvedAt: '2026-05-1' + day + 'T20:59:59.000Z',
  })),
};
const learningOverlay = buildMacroSignalOverlay({
  snapshot: baseSnapshot(),
  aiReport: { commentary: {} },
  baseReport: {},
  journal: learningJournal,
  now: NOW,
});
const learningComponent = learningOverlay.assets['us:AAPL'].components.find((x) => x.type === 'learningCalibration');
assert.ok(learningComponent);
assert.ok(learningComponent.adjustment > 0);
assert.ok(Math.abs(learningOverlay.assets['us:AAPL'].totalAdjustment) <= 8);
console.log('   ok');

console.log('\nSignal overlay tests passed.');
