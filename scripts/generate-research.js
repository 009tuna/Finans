'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { buildContext, generate, toAiReport } = require('../src/research-runner');
const { readLedger, scorecard } = require('../src/research-ledger');
const { isFresh, snapshotId } = require('../public/report-integrity');
const { validateAiReport, publish } = require('../src/ai-publication');
const { readJournal } = require('../src/decision-journal');
async function run({ publishResult = true } = {}) {
  const [record, snapshot, ledger] = await Promise.all([db.getReport(undefined, { strict: true }), db.getLatestSnapshot({ strict: true }), readLedger()]);
  const now = new Date().toISOString();
  if (!record.base?.runId || !isFresh(record.base.generatedAt, now) || !isFresh(snapshot?.generatedAt, now) || record.base.snapshotId !== snapshotId(snapshot)) throw new Error('Once guncel fiyat ve temel rapor uretin');
  if (record.ai?.research?.model === 'gpt-6-astra' && record.ai.runId === record.base.runId && isFresh(record.ai.generatedAt, now)) {
    console.log('Bu calismanin Astra arastirmasi zaten yayinlanmis.'); return record.ai;
  }
  const research = await generate(buildContext(record.base, snapshot, scorecard(ledger.value)), { onProgress: console.log });
  const ai = toAiReport(research, record.base);
  validateAiReport(ai, record.base, snapshot, new Date().toISOString());
  if (publishResult) await publish(ai, { db, readJournal, journalPath: path.join(__dirname, '../data/journal.json') });
  const output = path.join(__dirname, '../data/report', publishResult ? 'ai.json' : 'astra-draft.json');
  fs.writeFileSync(output, JSON.stringify(ai, null, 2) + '\n');
  console.log(JSON.stringify({ status: publishResult ? 'published' : 'draft', model: research.model, runId: ai.runId, events: research.events.length, forecasts: research.forecasts.length, signals: research.signals.length, webSearches: research.webSearches }));
  return ai;
}
if (require.main === module) run({ publishResult: !process.argv.includes('--draft') }).catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { run };
