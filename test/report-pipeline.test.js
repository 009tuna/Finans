'use strict';
const assert = require('assert/strict');
const os = require('os'); const fs = require('fs'); const path = require('path');
const { empty, updateLedger, addPublication, KEY, readLedger } = require('../src/research-ledger');
const { readProgress, writeProgress, KEY: PROGRESS_KEY } = require('../src/research-progress');
const { publish } = require('../src/ai-publication');
const NOW = new Date().toISOString(); const DATE = NOW.slice(0, 10);
const oldBase = { runId: 'r1', snapshotId: 'old-snap', generatedAt: new Date(Date.now() - 120000).toISOString(), date: DATE };
const oldLedger = addPublication(empty(), oldBase, null, DATE, new Date(Date.now() - 60000).toISOString());
const newSnapshot = { snapshotId: 'frozen-snap', generatedAt: new Date(Date.now() - 1000).toISOString(), us: [], bist: [], crypto: [] };
const newBase = { runId: 'r2', snapshotId: newSnapshot.snapshotId, generatedAt: new Date(Date.now() - 30000).toISOString(), date: DATE, calendar: {}, markets: {} };
const research = { macroSummary: 'Synthetic report', todayFocus: 'Synthetic', commentary: { us: 'Test', bist: 'Test', crypto: 'Test' },
  coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: 'partial', reason: 'Synthetic evidence' })), sources: [], events: [], forecasts: [], scenarios: [], signals: [], unresolvedQuestions: [] };
function makeDatabase(seed = oldLedger) {
  let value = structuredClone(seed); let revision = 'rev1';
  return { getCache: async (key) => { assert.equal(key, KEY); return { value, revision }; },
    compareAndSetCache: async (key, next, expected) => { assert.equal(key, KEY); assert.equal(expected, revision); value = structuredClone(next); revision = 'rev' + (Number(revision.slice(3)) + 1); },
    async read() { return structuredClone(value); } };
}
function progressStore(lastSuccessful = { runId: 'r1', publishedAt: oldLedger.publication.publishedAt }) {
  let value = { status: 'completed', lastSuccessful };
  return { read: async () => structuredClone(value), write: async (next) => { value = structuredClone(next); }, get: () => structuredClone(value) };
}
(async () => {
  // Ledger CAS conflict retries reapply publication on the concurrently updated ledger.
  let data = empty(); let revision = 'v1'; let conflict = true;
  const adapter = { async getCache(key) { assert.equal(key, KEY); return { value: data, revision }; }, async compareAndSetCache(key, value) {
    assert.equal(key, KEY); if (conflict) { conflict = false; data = { ...data, outcomes: [{ forecastId: 'concurrent' }] }; revision = 'v2'; const e = new Error('conflict'); e.statusCode = 409; throw e; }
    data = value; revision = 'v3';
  } };
  const result = await updateLedger((ledger) => addPublication(ledger, oldBase, null, DATE, NOW), adapter);
  assert.equal(result.outcomes[0].forecastId, 'concurrent');

  // A CAS adapter that acknowledges but drops the write is caught by a real backread.
  const drop = makeDatabase(empty()); drop.compareAndSetCache = async () => {};
  const aiForReadback = { runId: newBase.runId, snapshotId: newBase.snapshotId, generatedAt: NOW, macroSummary: 'ok', commentary: {}, macroSignalOverlay: { signals: [] } };
  await assert.rejects(publish(aiForReadback, { db: drop, base: newBase, snapshot: newSnapshot, now: NOW, readJournal: async () => ({}) }), /geri okuma/);

  let independentRuns = 0;
  const daily = (options) => require('../scripts/daily-research').run({ ...options, refreshIndependent: async () => { independentRuns++; } });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finans-pipeline-'));
  const staleLock = path.join(temp, 'stale.lock'); fs.writeFileSync(staleLock, JSON.stringify({ pid: 2147483647, startedAt: NOW }));
  await assert.rejects(daily({ database: makeDatabase(oldLedger), lockPath: staleLock, fetchSnapshot: async () => { throw new Error('stop after stale lock recovery'); },
    resolveOutcomes: async () => {}, buildBase: async () => oldBase, progress: progressStore(), generateResearch: async () => null }), /stop after stale lock recovery/);
  assert.equal(fs.existsSync(staleLock), false, 'a dead-process lock is reclaimed and the new lock is cleaned up');
  const lockPath = path.join(temp, 'daily.lock');
  // Generator failure leaves the previous publication untouched.
  const failureDb = makeDatabase(oldLedger); const failureProgress = progressStore();
  await assert.rejects(daily({ database: failureDb, lockPath, fetchSnapshot: async () => newSnapshot, resolveOutcomes: async () => {}, buildBase: async () => newBase,
    progress: failureProgress, generateResearch: async () => { throw new Error('synthetic model failure'); } }), /synthetic model failure/);
  assert.deepEqual((await failureDb.read()).publication, oldLedger.publication);

  // End-to-end staged context stays frozen even when latest prices advance while generation runs.
  const liveDb = makeDatabase(oldLedger); const liveProgress = progressStore();
  const regularWrite = liveProgress.write;
  liveProgress.write = async (next) => { if (next.status === 'completed') throw new Error('synthetic progress write failure'); return regularWrite(next); };
  let latest = newSnapshot;
  const newLaterSnapshot = { ...newSnapshot, snapshotId: 'newer-price', generatedAt: new Date(Date.now() + 1000).toISOString() };
  const generation = async (context) => { assert.equal(context.snapshotId, newSnapshot.snapshotId); latest = newLaterSnapshot;
    return { ...research, model: 'gpt-6.1-sol', promptVersion: 'test', generatedAt: new Date().toISOString() }; };
  const dir = path.join(temp, 'output'); fs.mkdirSync(dir);
  const runResearch = (options) => require('../scripts/generate-research').run({ ...options, database: liveDb, generateFn: generation,
    outputPath: path.join(dir, 'ai.json'), publishFn: (candidate, deps) => publish(candidate, { ...deps, readJournal: async () => ({}) }) });
  await daily({ database: liveDb, lockPath, fetchSnapshot: async () => newSnapshot, resolveOutcomes: async () => {}, buildBase: async () => newBase,
    progress: liveProgress, generateResearch: runResearch });
  assert.equal((await liveDb.read()).publication.base.snapshotId, 'frozen-snap');
  assert.equal(liveProgress.get().lastSuccessful.runId, 'r1', 'failed progress write leaves its cached success unchanged');
  assert.ok((await liveDb.read()).publication.publishedAt);

  // API projections prefer the canonical publication over an older progress success.
  const db = require('../src/db');
  const originalDb = { getCache: db.getCache, getReport: db.getReport, getLatestSnapshot: db.getLatestSnapshot };
  const publishedLedger = await liveDb.read();
  const staleProgress = { schemaVersion: 1, runId: 'autom-old', status: 'failed', startedAt: NOW, finishedAt: NOW, updatedAt: NOW,
    stages: [], lastSuccessful: liveProgress.get().lastSuccessful };
  db.getCache = async (key) => key === KEY ? { value: publishedLedger, revision: 'l1' } : key === PROGRESS_KEY ? { value: staleProgress, revision: 'p1' } : null;
  db.getReport = async () => { throw new Error('legacy reports must not be read with canonical publication'); };
  db.getLatestSnapshot = async () => newSnapshot;
  const reportPayload = await require('../src/report-api').getReportPayload();
  assert.equal(reportPayload.automation.lastSuccessful.runId, 'r2');
  assert.equal(reportPayload.automation.lastSuccessful.publishedAt, publishedLedger.publication.publishedAt);
  const researchPayload = await require('../src/research-api').handleResearch({ method: 'GET' });
  assert.equal(researchPayload.body.automation.lastSuccessful.runId, 'r2');
  db.getCache = originalDb.getCache; db.getReport = originalDb.getReport; db.getLatestSnapshot = originalDb.getLatestSnapshot;

  // Existing publication is skipped and lastSuccessful remains tied to its real AI publication.
  const skipDb = makeDatabase((await liveDb.read())); const skipProgress = progressStore({ runId: 'r2', publishedAt: (await skipDb.read()).publication.publishedAt });
  const skipSnapshot = newSnapshot;
  const skipBase = (await skipDb.read()).publication.base;
  await daily({ database: skipDb, lockPath, fetchSnapshot: async () => skipSnapshot, resolveOutcomes: async () => {}, buildBase: async () => skipBase,
    progress: skipProgress, generateResearch: async () => ({ publicationSkipped: true }) });
  assert.equal(skipProgress.get().stages.find((stage) => stage.id === 'publication').status, 'skipped');
  assert.deepEqual(skipProgress.get().lastSuccessful, { runId: 'r2', publishedAt: (await skipDb.read()).publication.publishedAt });
  assert.equal(independentRuns, 4, 'independent source work runs before both successful and failed model pipelines');

  // Expired progress is honestly interrupted and older/competing writers cannot roll it back.
  const running = { schemaVersion: 1, runId: 'new-run', status: 'running', startedAt: NOW, updatedAt: NOW, finishedAt: null, stages: [], lastSuccessful: null };
  const progressAdapter = { getCache: async () => ({ value: running, revision: 'p1' }), compareAndSetCache: async () => { throw new Error('must not overwrite'); } };
  assert.equal((await readProgress(progressAdapter, Date.now() + 7 * 60 * 60 * 1000)).status, 'interrupted');
  await assert.rejects(writeProgress({ ...running, runId: 'old-run', startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, progressAdapter), /Stale progress run/);
  await assert.rejects(writeProgress({ schemaVersion: 1, status: 'running', stages: [] }, progressAdapter), /Invalid progress/);
  const tempRoot = path.resolve(os.tmpdir()); const resolvedTemp = path.resolve(temp);
  assert.ok(resolvedTemp.startsWith(tempRoot + path.sep) && path.basename(resolvedTemp).startsWith('finans-pipeline-'), 'cleanup target must remain inside the named test temp directory');
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
  console.log('Atomic publication and injected daily pipeline tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
