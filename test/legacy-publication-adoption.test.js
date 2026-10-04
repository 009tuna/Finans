'use strict';
const assert = require('assert/strict');
const { createHash } = require('crypto');
const { empty, KEY } = require('../src/research-ledger');
const { adoptLegacyPublication } = require('../scripts/adopt-legacy-publication');
const now = new Date().toISOString();
const baseTime = new Date(Date.now() - 60000).toISOString();
const aiTime = new Date(Date.now() - 30000).toISOString();
const snapshot = { snapshotId: 'snapshot-1', generatedAt: new Date(Date.now() - 25000).toISOString(), us: [], bist: [], crypto: [] };
const research = { macroSummary: 'Verified legacy analysis', todayFocus: 'Context only', commentary: { us: 'Evidence', bist: 'Evidence', crypto: 'Evidence' },
  coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: 'partial', reason: 'Insufficient evidence' })),
  sources: [], events: [], forecasts: [], scenarios: [], signals: [], unresolvedQuestions: [], model: 'gpt-6.1-sol', promptVersion: 'v1' };
const reorderedResearch = Object.fromEntries(Object.entries(research).reverse());
const ai = { schemaVersion: 3, runId: 'legacy-run', snapshotId: snapshot.snapshotId, generatedAt: aiTime, macroSummary: research.macroSummary,
  commentary: research.commentary, macroSignalOverlay: { signals: [] }, research: reorderedResearch };
const base = { schemaVersion: 2, runId: ai.runId, snapshotId: ai.snapshotId, generatedAt: baseTime, date: now.slice(0, 10), opportunities: [{ symbol: 'TEST' }] };
const row = { date: now.slice(0, 10), base, ai, updated_at: new Date(Date.now() - 10000).toISOString() };
const run = { runId: ai.runId, digest: createHash('sha256').update(JSON.stringify(research)).digest('hex'), recordedAt: new Date(Date.now() - 20000).toISOString(), research };
function makeDb({ rowValue = row, snapshotValue = snapshot, concurrentOutcome = false, dropWrite = false } = {}) {
  let value = { ...empty(), runs: [run], forecasts: [{ id: 'forecast-keep' }], outcomes: [{ forecastId: 'resolved-keep', value: 0 }], privateExtra: { preserve: true } };
  let revision = 'v1'; let casCalls = 0;
  return { value: () => value, casCalls: () => casCalls,
    readRow: async () => rowValue,
    readSnapshot: async () => snapshotValue,
    ledgerReader: async () => ({ value, revision }),
    database: { async compareAndSetCache(key, next, expected) {
      assert.equal(key, KEY); assert.equal(expected, revision); casCalls++;
      if (concurrentOutcome && casCalls === 1) { value = { ...value, outcomes: [...value.outcomes, { forecastId: 'concurrent' }] }; revision = 'v2'; const e = new Error('conflict'); e.statusCode = 409; throw e; }
      if (!dropWrite) { value = next; revision = 'v' + (casCalls + 1); }
    } } };
}
(async () => {
  const fixture = makeDb({ concurrentOutcome: true });
  const result = await adoptLegacyPublication({ database: fixture.database, readRow: fixture.readRow, readSnapshot: fixture.readSnapshot, ledgerReader: fixture.ledgerReader, now });
  assert.equal(result.status, 'adopted'); assert.equal(result.publishedAt, row.updated_at);
  assert.equal(fixture.value().publication.publishedAt, row.updated_at, 'adoption preserves original reports.updated_at');
  assert.deepEqual(fixture.value().forecasts, [{ id: 'forecast-keep' }]);
  assert.deepEqual(fixture.value().outcomes, [{ forecastId: 'resolved-keep', value: 0 }, { forecastId: 'concurrent' }]);
  assert.deepEqual(fixture.value().privateExtra, { preserve: true });

  const drop = makeDb({ dropWrite: true });
  await assert.rejects(adoptLegacyPublication({ database: drop.database, readRow: drop.readRow, readSnapshot: drop.readSnapshot, ledgerReader: drop.ledgerReader, now }), /readback/);
  let reads = 0; const changed = makeDb();
  await assert.rejects(adoptLegacyPublication({ database: changed.database, readRow: async () => { reads++; return reads === 1 ? row : { ...row, updated_at: now }; },
    readSnapshot: changed.readSnapshot, ledgerReader: changed.ledgerReader, now }), /changed during adoption/);
  assert.equal(changed.casCalls(), 0, 'changed legacy report is refused before commit');
  const stale = makeDb({ snapshotValue: { ...snapshot, generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() } });
  await assert.rejects(adoptLegacyPublication({ database: stale.database, readRow: stale.readRow, readSnapshot: stale.readSnapshot, ledgerReader: stale.ledgerReader, now }), /currently readable/);
  assert.equal(stale.casCalls(), 0);
  console.log('Legacy publication adoption preserves provenance and ledger fields');
})().catch((e) => { console.error(e); process.exitCode = 1; });
