'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { isFresh, snapshotId } = require('../public/report-integrity');
const { randomUUID } = require('crypto');
const { writeProgress, readProgress } = require('../src/research-progress');
const { readLedger } = require('../src/research-ledger');
async function run({ database = db, lockPath = path.join(__dirname, '../data/report/.daily-research.lock'),
  fetchSnapshot = async () => database.getLatestSnapshot({ strict: true }),
  refreshIndependent = (options) => require('./refresh-intelligence').run(options),
  resolveOutcomes = async () => { await require('../src/research-outcomes').resolveEarnings(); await require('../src/prediction-resolver').main(); },
  refreshLearning = (options) => require('./refresh-learning').run(options),
  buildBase = async (snapshot) => require('../src/report').run({ snapshot }),
  generateResearch = (options) => require('./generate-research').run(options),
  progress = { read: readProgress, write: writeProgress } } = {}) {
  const lock = lockPath;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let fd;
  try { fd = fs.openSync(lock, 'wx'); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let lockState;
    try { lockState = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch (_) { throw new Error('Gunluk arastirma kilidi okunamiyor; elle incelenmeli'); }
    if (!Number.isInteger(lockState.pid) || lockState.pid <= 0) throw new Error('Gunluk arastirma kilidi gecersiz; elle incelenmeli');
    let alive = true;
    try { process.kill(lockState.pid, 0); } catch (checkError) { if (checkError.code === 'ESRCH') alive = false; else if (checkError.code !== 'EPERM') throw checkError; }
    if (alive) throw new Error('Gunluk arastirma zaten calisiyor; kilit mevcut');
    fs.unlinkSync(lock);
    try { fd = fs.openSync(lock, 'wx'); } catch (retryError) { if (retryError.code === 'EEXIST') throw new Error('Gunluk arastirma zaten calisiyor; kilit yeniden olustu'); throw retryError; }
  }
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); }
  catch (e) { fs.closeSync(fd); fs.unlinkSync(lock); throw e; }
  const runId = randomUUID(); const startedAt = new Date().toISOString();
  const ids = ['data', 'outcomes', 'base', 'research', 'validation', 'publication'];
  const previous = await progress.read(database);
  const state = { schemaVersion: 1, runId, status: 'running', startedAt, updatedAt: startedAt, finishedAt: null,
    stages: ids.map((id) => ({ id, status: 'pending', startedAt: null, finishedAt: null })), lastSuccessful: previous.lastSuccessful || null };
  const mark = async (id, status) => { const now = new Date(Math.max(Date.now(), Date.parse(state.updatedAt) + 1)).toISOString(); const item = state.stages.find((s) => s.id === id); item.status = status; if (status === 'running') item.startedAt = now; if (['completed', 'skipped', 'failed'].includes(status)) item.finishedAt = now; state.updatedAt = now; await progress.write(state, database); };
  let activeStage = 'data';
  try {
    await mark('data', 'running');
    // These sources and deterministic forecasts run even when model access later fails.
    // Partial source failures are recorded separately and do not discard price data.
    try { await refreshIndependent({ database }); }
    catch (_) { console.warn('Bağımsız kaynak yenilemesi tamamlanamadı; önceki kaynak kayıtları korunur.'); }
    const now = new Date().toISOString();
    let snapshot = await fetchSnapshot();
    if (!snapshot || !isFresh(snapshot.generatedAt, now) || snapshot.generatedAt.slice(0, 10) !== now.slice(0, 10)) snapshot = await require('../src/fetch-all').runAll();
    await mark('data', 'completed'); activeStage = 'outcomes'; await mark('outcomes', 'running');
    await resolveOutcomes();
    const learning = await refreshLearning({ database });
    if (learning.status === 'unavailable') throw new Error('Öğrenme yenilemesi tamamlanamadı');
    await mark('outcomes', 'completed'); activeStage = 'base'; await mark('base', 'running');
    const ledgerNow = await readLedger(database);
    const pub = ledgerNow.value.publication;
    const record = pub ? { base: pub.base, ai: pub.ai, date: pub.date } : await database.getReport(undefined, { strict: true });
    let base = record.base;
    if (!base?.runId || !isFresh(base.generatedAt, now) || base.snapshotId !== snapshotId(snapshot)) base = await buildBase(snapshot);
    await mark('base', 'completed'); activeStage = 'research';
    const ai = await generateResearch({ database, base, snapshot, existingAi: record.ai, ledgerValue: ledgerNow.value,
      onStage: async (id, status) => { activeStage = id; await mark(id, status); } });
    // Newly frozen macro forecasts must be captured before their release, rather
    // than waiting for tomorrow's run and misclassifying a replay as shadow data.
    const afterResearchLearning = await refreshLearning({ database });
    if (afterResearchLearning.status === 'unavailable') throw new Error('Yeni tahminlerin öğrenme kaydı tamamlanamadı');
    if (ai?.publicationSkipped) { await mark('research', 'skipped'); await mark('validation', 'skipped'); await mark('publication', 'skipped'); }
    state.status = 'completed'; state.finishedAt = new Date(Math.max(Date.now(), Date.parse(state.updatedAt) + 1)).toISOString(); state.updatedAt = state.finishedAt;
    if (ai?.publicationResult?.runId) state.lastSuccessful = { runId: ai.publicationResult.runId, publishedAt: ai.publicationResult.publishedAt };
    try { await progress.write(state, database); } catch (_) { /* publication ledger remains authoritative */ }
  } catch (e) {
    await mark(activeStage, 'failed').catch(() => {}); state.status = 'failed'; state.errorCode = activeStage === 'publication' ? 'publication_failed' : activeStage === 'validation' ? 'validation_failed' : activeStage === 'research' ? 'generation_failed' : 'pipeline_failed';
    if (activeStage === 'research' && /401|403|unauthori[sz]ed|forbidden|model not found|billing|payment required|api key|codex cli bulunamadi/i.test(String(e && e.message || ''))) state.errorCode = 'model_access';
    state.finishedAt = new Date(Math.max(Date.now(), Date.parse(state.updatedAt) + 1)).toISOString(); state.updatedAt = state.finishedAt; await progress.write(state, database).catch(() => {}); throw e;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
if (require.main === module) run().catch((e) => {
  const message = String(e && e.message || '').toLowerCase();
  const code = /401|403|unauthori[sz]ed|forbidden|model not found|billing|payment required|api key|codex cli bulunamadi/.test(message) ? 'model_access' : 'pipeline_failed';
  console.error('Gunluk arastirma basarisiz (' + code + ')'); process.exitCode = 1;
});
module.exports = { run };
