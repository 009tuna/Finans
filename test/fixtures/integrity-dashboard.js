// Read-only, synthetic browser verification. Never connect to a real provider.
'use strict';
const db = require('../../src/db');
const { normalizeJournal } = require('../../src/decision-journal');
const { buildMacroSignalOverlay } = require('../../src/signal-overlay');
const now = new Date().toISOString();
const old = new Date(Date.now() - 2 * 3600000).toISOString();
const snapshot = {
  generatedAt: now, counts: { us: 1, bist: 0, crypto: 0 },
  market: { usAsOf: now }, errors: [], fx: { usdtry: 1 }, topPicks: [], allocation: [],
  us: [{ market: 'us', symbol: 'TEST', name: 'SENTETİK TEST — gerçek piyasa verisi değildir', currency: 'USD', price: 100,
    quoteTime: now, changePct: 0, marketCap: 1000000, pe: 20, ind: { rsi: 50, signals: {} },
    analysis: { score: 60, label: 'TUT', tone: 'hold', reasons: [], sub: {}, summary: 'Sentetik arayüz testi.' },
    decision: { score: 90, contradictions: [], freshness: {}, trade: { available: false } } }],
  bist: [], crypto: [],
  marketRegime: { us: { type: 'calm' }, bist: { type: 'long-ok' }, crypto: { type: 'coupled' } },
};
const base = {
  schemaVersion: 2, runId: 'fixture-run', snapshotId: old, date: now.slice(0, 10), generatedAt: old,
  dataAsOf: { usAsOf: old }, sentiment: { label: 'Nötr', avg: 50, total: 1, buys: 0, gainers: 0 },
  markets: {}, opportunities: [], risks: [], signals: {},
  quality: { status: 'partial', snapshotErrors: [] },
  calendar: { economic: [], earnings: [], companyNews: [], coverage: {
    economic: { status: 'unavailable', count: 0 }, earnings: { status: 'empty', count: 0 }, companyNews: { status: 'empty', count: 0 },
  } },
};
base.signalOverlay = buildMacroSignalOverlay({ snapshot, aiReport: null, baseReport: base, now });
let ai = null;
let researchLedger = null;
if (process.env.FINANS_RESEARCH_FIXTURE === '1') {
  const { empty, addResearch } = require('../../src/research-ledger');
  const { toAiReport } = require('../../src/research-runner');
  base.snapshotId = now; base.generatedAt = now;
  const source = { id: 's1', url: 'https://example.com/synthetic-source', title: 'Sentetik test kaynağı', publishedAt: old, kind: 'primary', evidence: 'Gerçek veri değildir.' };
  const research = { model: 'gpt-6-astra (sentetik test)', promptVersion: 'fixture', generatedAt: now,
    macroSummary: 'SENTETİK TEST — gerçek piyasa araştırması değildir.', todayFocus: 'Arayüz doğrulama', commentary: { us: 'Test', bist: 'Test', crypto: 'Test' },
    coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: 'partial', reason: 'Kaynak eksikliği örneği.' })),
    sources: [source], events: [{ id: 'e1', market: 'us', title: 'Sentetik bilanço olayı', sourceIds: ['s1'], whatChanged: 'Test açıklaması', expectationGap: 'Konsensüs ile karşılaştırma', counterEvidence: 'Marj daralması olasılığı' }],
    forecasts: [{ eventId: 'e1', market: 'us', symbol: 'TEST', metric: 'EPS', unit: 'USD/share', period: 'Sentetik dönem', scheduledAt: new Date(Date.now() + 86400000).toISOString(), pointEstimate: 2, consensus: 1.8, consensusSourceId: 's1', probabilityAboveConsensus: 0.6, rationale: 'Yalnız test amacıyla.', sourceIds: ['s1'], resolution: { provider: 'finnhub-earnings', field: 'epsActual', sourceUrl: source.url } }],
    scenarios: [{ eventId: 'e1', market: 'us', symbol: 'TEST', condition: 'Gelir beklentiyi aşarsa', impact: 'Olumlu fiyat tepkisi olasılığı; ölçülmüş getiri değildir.', horizon: '1 gün', invalidation: 'Marjın gerilemesi', sourceIds: ['s1'] }], signals: [], unresolvedQuestions: ['Gerçekleşen veri bekleniyor.'] };
  ai = toAiReport(research, base); researchLedger = addResearch(empty(), ai, now);
}
db.getLatestSnapshot = async () => snapshot;
db.getReport = async () => ({ date: base.date, base, ai });
db.getHistory = async () => [];
db.getPortfolio = async () => ({ us: [], bist: [], crypto: [] });
db.getCache = async (key) => key === 'journal' ? { value: normalizeJournal(null), revision: now } : key === 'research_ledger_v1' && researchLedger ? { value: researchLedger, revision: now } : null;
db.compareAndSetCache = async () => { throw new Error('Read-only fixture'); };
require('../../src/fetch-all').runAll = async () => { throw new Error('Read-only fixture'); };
process.env.PORT = process.env.FINANS_TEST_PORT || '5181';
process.env.ADMIN_SECRET = 'fixture-disabled-writes';
require('../../server');
