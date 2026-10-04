'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { buildContext, generate, toAiReport } = require('../src/research-runner');
const { readLedger, scorecard } = require('../src/research-ledger');
const { isFresh, snapshotId } = require('../public/report-integrity');
const { validateAiReport, publish } = require('../src/ai-publication');
const { readJournal } = require('../src/decision-journal');
async function run({ publishResult = true, onStage = async () => {}, database = db, generateFn = generate, publishFn = publish,
  base: providedBase, snapshot: providedSnapshot, existingAi, ledgerValue, outputPath } = {}) {
  let record; let snapshot;
  const ledger = ledgerValue ? { value: ledgerValue } : await readLedger(database);
  const active = ledger.value.publication ? { base: ledger.value.publication.base, ai: ledger.value.publication.ai, date: ledger.value.publication.date } : null;
  if (providedBase) {
    record = { base: providedBase, ai: existingAi || (active?.base.runId === providedBase.runId ? active.ai : null), date: providedBase.date };
    snapshot = providedSnapshot;
  } else {
    const stagePath = path.join(__dirname, '../data/report/base-stage.json');
    let stage = null;
    if (fs.existsSync(stagePath)) { try { stage = JSON.parse(fs.readFileSync(stagePath, 'utf8')); } catch (_) {} }
    const legacy = active ? null : await database.getReport(undefined, { strict: true });
    const current = active || legacy;
    const now = new Date().toISOString();
    const stageUsable = stage?.base?.runId && stage.snapshot && stage.base.snapshotId === snapshotId(stage.snapshot)
      && isFresh(stage.base.generatedAt, now) && isFresh(stage.snapshot.generatedAt, now)
      && (!current?.base?.generatedAt || Date.parse(stage.base.generatedAt) >= Date.parse(current.base.generatedAt));
    if (stageUsable) {
      record = { base: stage.base, ai: current?.base?.runId === stage.base.runId ? current.ai : null, date: stage.base.date };
      snapshot = stage.snapshot;
    } else {
      record = current;
      snapshot = await database.getLatestSnapshot({ strict: true });
    }
  }
  const now = new Date().toISOString();
  if (!record.base?.runId || !isFresh(record.base.generatedAt, now) || !isFresh(snapshot?.generatedAt, now) || record.base.snapshotId !== snapshotId(snapshot)) throw new Error('Once guncel fiyat ve temel rapor uretin');
  if (record.ai && record.ai.runId === record.base.runId && record.ai.snapshotId === record.base.snapshotId && isFresh(record.ai.generatedAt, now)) {
    console.log('Bu calismanin arastirmasi zaten yayinlanmis.'); return { ...record.ai, publicationSkipped: true };
  }
  await onStage('research', 'running');
  const independent = await require('../src/intelligence-context').getIntelligenceContext({ database, researchLedger: ledger.value });
  const research = await generateFn(buildContext(record.base, snapshot, scorecard(ledger.value), independent), { onProgress: console.log });
  const ai = toAiReport(research, record.base);
  await onStage('research', 'completed'); await onStage('validation', 'running');
  validateAiReport(ai, record.base, snapshot, new Date().toISOString());
  await onStage('validation', 'completed');
  if (publishResult) {
    await onStage('publication', 'running');
    const result = await publishFn(ai, { db: database, readJournal, journalPath: path.join(__dirname, '../data/journal.json'), base: record.base, snapshot });
    Object.defineProperty(ai, 'publicationResult', { value: result, enumerable: false });
    await Promise.resolve(onStage('publication', 'completed')).catch(() => {});
  }
  const output = outputPath || path.join(__dirname, '../data/report', publishResult ? 'ai.json' : 'sol-draft.json');
  try { fs.writeFileSync(output, JSON.stringify(ai, null, 2) + '\n'); } catch (_) { if (!publishResult) throw new Error('Arastirma taslagi kaydedilemedi'); }
  console.log(JSON.stringify({ status: publishResult ? 'published' : 'draft', model: research.model, runId: ai.runId, events: research.events.length, forecasts: research.forecasts.length, signals: research.signals.length, webSearches: research.webSearches }));
  return ai;
}
if (require.main === module) run({ publishResult: !process.argv.includes('--draft') }).catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { run };
