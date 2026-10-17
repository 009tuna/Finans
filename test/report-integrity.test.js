'use strict';
const assert = require('assert');
const { buildMacroSignalOverlay, normalizeSignal, isExpired } = require('../src/signal-overlay');
const { envelope, assess } = require('../public/report-integrity');
const { validateAiReport, publish } = require('../src/ai-publication');
const { buildExecutiveSummary } = require('../public/insights');
const NOW = '2026-09-07T12:00:00.000Z';
const SNAP = '2026-09-07T11:00:00.000Z';
const snapshot = { generatedAt: SNAP, us: [{ market: 'us', symbol: 'TEST', analysis: { score: 70 } }], bist: [], crypto: [] };
const base = { generatedAt: '2026-09-07T11:10:00.000Z', runId: 'run-1', snapshotId: SNAP };
const ai = { generatedAt: '2026-09-07T11:30:00.000Z', runId: 'run-1', snapshotId: SNAP, macroSummary: 'Kanıt yetersiz.', commentary: {}, macroSignalOverlay: { signals: [] } };
const signal = { market: 'us', adjustment: 2, confidence: 0.6, source: 'https://example.com/event', asOf: '2026-09-07T11:20:00.000Z', expiresAt: '2026-09-08T11:20:00.000Z' };
function overlay(report, calendar = {}) { return buildMacroSignalOverlay({ snapshot, aiReport: report, baseReport: { calendar }, now: NOW }); }

// These are the audit's actual failure cases, not only happy-path arithmetic.
const oldText = overlay({ generatedAt: '2026-06-01T00:00:00.000Z', commentary: { us: 'likidite destegi olumlu' } });
assert.equal(oldText.assets['us:TEST'].totalAdjustment, 0);
assert.equal(oldText.assets['us:TEST'].evidenceStatus, 'missing');
const lawsuit = overlay(null, { companyNews: [{ symbol: 'TEST', headline: 'Company faces lawsuit over accounting fraud', datetime: Date.parse(SNAP) / 1000, url: 'https://example.com/lawsuit' }] });
assert.equal(lawsuit.assets['us:TEST'].totalAdjustment, 0);
assert.equal(lawsuit.assets['us:TEST'].components.find((x) => x.type === 'companyNews').asOf, SNAP);
const staleNews = overlay(null, { companyNews: [{ symbol: 'TEST', headline: 'Old news', datetime: Date.parse('2026-06-01') / 1000 }] });
assert.ok(staleNews.assets['us:TEST'].expiredComponents.some((x) => x.type === 'companyNews'));

for (const changed of [
  { asOf: undefined }, { asOf: 'invalid' }, { source: 'Model memory' }, { expiresAt: 'invalid' },
  { asOf: '2026-09-08T11:00:00Z' }, { expiresAt: '2026-09-07T11:00:00Z' },
  { asOf: '2026-06-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' },
]) {
  const result = overlay({ macroSignalOverlay: { signals: [{ ...signal, ...changed }] } });
  assert.equal(result.assets['us:TEST'].totalAdjustment, 0, JSON.stringify(changed));
}
assert.equal(isExpired({ asOf: SNAP }, NOW), true);
assert.equal(normalizeSignal({ ...signal, expiresAt: 'invalid' }, NOW), null);
const fresh = overlay({ macroSignalOverlay: { signals: [signal, { ...signal, type: 'duplicate-news' }] } });
assert.equal(fresh.assets['us:TEST'].totalAdjustment, 2, 'market and duplicate source must count only once');
assert.equal(fresh.market.us.adjustment, 2);
assert.ok(fresh.assets['us:TEST'].readinessIssues.length > 0);
assert.equal(fresh.assets['us:TEST'].technicalScore, 70);

const record = { date: '2026-09-07', base: { ...base, signalOverlay: fresh }, ai };
assert.equal(envelope(record, snapshot, NOW).integrity.usableOverlay, true);
assert.equal(envelope(record, null, NOW).ai, null, 'missing price snapshot must fail closed');
assert.equal(envelope(record, { snapshotId: SNAP, generatedAt: '2026-06-01' }, NOW).base.signalOverlay, null);
assert.equal(envelope(record, { generatedAt: NOW }, NOW).base.signalOverlay, null);
assert.equal(envelope(record, { generatedAt: NOW }, NOW).integrity.researchStatus, 'previous-analysis');
assert.equal(envelope(record, { generatedAt: NOW }, NOW).ai.runId, ai.runId, 'snapshot id may fall back to generatedAt');
assert.equal(envelope({ ...record, ai: { ...ai, runId: 'old' } }, snapshot, NOW).ai, null);
const priorSnapshot = { generatedAt: '2026-09-07T11:45:00.000Z', snapshotId: 'newer' };
const previous = envelope({ ...record, ai: { ...ai, research: { events: [] } } }, priorSnapshot, NOW);
assert.equal(previous.integrity.researchStatus, 'previous-analysis');
assert.equal(previous.integrity.usableResearch, true);
assert.equal(previous.ai.runId, base.runId);
assert.equal(previous.integrity.pricesAsOf, priorSnapshot.generatedAt);
// A refresh that started after the report's price cut but was written after the report is newer prices.
const raced = envelope(record, { generatedAt: '2026-09-07T11:05:00.000Z', snapshotId: '2026-09-07T11:05:00.000Z' }, NOW);
assert.equal(raced.integrity.researchStatus, 'previous-analysis');
assert.equal(raced.integrity.usableResearch, true);
// An older cut than the report's own is not newer prices.
assert.equal(envelope(record, { generatedAt: '2026-09-07T10:30:00.000Z', snapshotId: '2026-09-07T10:30:00.000Z' }, NOW).integrity.usableResearch, false);
assert.equal(envelope({ ...record, base: { ...base, signalOverlay: { ...fresh, schemaVersion: 1 } } }, snapshot, NOW).base.signalOverlay, null);
assert.equal(assess({}, ai, snapshot, NOW).baseStatus, 'unverified');
assert.equal(assess(base, { ...ai, generatedAt: '2026-06-01' }, snapshot, NOW).aiStatus, 'stale');
assert.equal(validateAiReport(ai, base, snapshot, NOW), true, 'zero signals is a valid result');
assert.throws(() => validateAiReport({ ...ai, snapshotId: 'other' }, base, snapshot, NOW));
assert.throws(() => validateAiReport({ ...ai, generatedAt: '2026-09-07T10:00:00Z' }, base, snapshot, NOW));
assert.throws(() => validateAiReport({ ...ai, macroSignalOverlay: { signals: [{ ...signal, source: 'memory' }] } }, base, snapshot, NOW));
const risk = buildExecutiveSummary({ ...snapshot, marketRegime: { us: { type: 'calm' }, bist: { type: 'long-ok' }, crypto: { type: 'coupled' } } });
assert.equal(risk.riskLevel.label, 'Belirsiz');

(async () => {
  let stored = record;
  let ledgerValue = require('../src/research-ledger').empty();
  let writes = 0;
  const db = {
    getReport: async () => stored,
    getLatestSnapshot: async () => snapshot,
    getCache: async () => ({ value: ledgerValue, revision: writes ? 'v' + writes : null }),
    compareAndSetCache: async (_, value) => { writes++; ledgerValue = value; },
  };
  const result = await publish(ai, { db, now: NOW, readJournal: async () => ({}), journalPath: 'unused' });
  assert.equal(result.runId, base.runId);
  assert.equal(writes, 1);
  await assert.rejects(publish({ ...ai, runId: 'old' }, { db, now: NOW }), /eslesmiyor/);
  assert.equal(writes, 1, 'invalid publication must not write');
  console.log('Report integrity, directional evidence and publication tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
