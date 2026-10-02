'use strict';
const db = require('./db');
const { envelope } = require('../public/report-integrity');
const { readLedger } = require('./research-ledger');
const { readProgress, preferCanonicalSuccess } = require('./research-progress');
async function getReportPayload() {
  const [ledger, snapshot, tips, automation] = await Promise.all([
    readLedger(), db.getLatestSnapshot({ strict: true }), db.getCache('tips_archive'), readProgress(),
  ]);
  const publication = ledger.value.publication;
  let record;
  if (publication !== undefined) {
    if (!publication || publication.schemaVersion !== 1 || !publication.base || !publication.date || !publication.base.runId
      || !publication.base.snapshotId || !Number.isFinite(Date.parse(publication.base.generatedAt))
      || (publication.ai && (publication.ai.runId !== publication.base.runId || publication.ai.snapshotId !== publication.base.snapshotId
        || !Number.isFinite(Date.parse(publication.ai.generatedAt)) || Date.parse(publication.ai.generatedAt) < Date.parse(publication.base.generatedAt)))) {
      throw new Error('Kayitli rapor yayin kaydi bozuk');
    }
    record = { base: publication.base, ai: publication.ai, date: publication.date };
  } else record = await db.getReport(undefined, { strict: true });
  preferCanonicalSuccess(automation, publication);
  return { ...envelope(record, snapshot), automation, tipsArchive: tips && Array.isArray(tips.value) ? tips.value : [] };
}
module.exports = { getReportPayload };
