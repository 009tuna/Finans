'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { isFresh, snapshotId } = require('../public/report-integrity');
async function run() {
  const lock = path.join(__dirname, '../data/report/.daily-research.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let fd;
  try { fd = fs.openSync(lock, 'wx'); } catch (e) { if (e.code === 'EEXIST') throw new Error('Gunluk arastirma zaten calisiyor; kilit mevcut'); throw e; }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try {
    const now = new Date().toISOString();
    let snapshot = await db.getLatestSnapshot({ strict: true });
    if (!snapshot || !isFresh(snapshot.generatedAt, now) || snapshot.generatedAt.slice(0, 10) !== now.slice(0, 10)) snapshot = await require('../src/fetch-all').runAll();
    await require('../src/research-outcomes').resolveEarnings();
    await require('../src/prediction-resolver').main();
    const record = await db.getReport(undefined, { strict: true });
    if (!record.base?.runId || !isFresh(record.base.generatedAt, now) || record.base.snapshotId !== snapshotId(snapshot)) await require('../src/report').run();
    await require('./generate-research').run();
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
if (require.main === module) run().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { run };
