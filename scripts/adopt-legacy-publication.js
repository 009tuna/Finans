'use strict';
const { isDeepStrictEqual } = require('util');
const db = require('../src/db');
const { readLedger, validateResearch, publicationDigest } = require('../src/research-ledger');
const { assess } = require('../public/report-integrity');
async function latestReportRow(database) {
  const { data, error } = await database.supabase.from('reports').select('date,base,ai,updated_at').order('date', { ascending: false }).limit(1);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Legacy report row missing');
  return row;
}
function validStoredPublication(value) {
  return value && value.schemaVersion === 1 && value.date && value.base?.runId && value.ai?.runId
    && value.ai.runId === value.base.runId && value.publishedAt && value.digest;
}
async function adoptLegacyPublication({ database = db, readRow = latestReportRow, readSnapshot = () => database.getLatestSnapshot({ strict: true }),
  ledgerReader = readLedger, now = new Date().toISOString() } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await ledgerReader(database);
    if (Object.hasOwn(current.value, 'publication')) {
      if (!validStoredPublication(current.value.publication)) throw new Error('Existing canonical publication is invalid');
      return { status: 'already-published', date: current.value.publication.date, runId: current.value.publication.ai.runId };
    }
    const row = await readRow(database);
    const base = row?.base, ai = row?.ai;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date || '') || !row.updated_at || !base || !ai || !ai.research || base.date !== row.date) throw new Error('Legacy report lacks a complete publication');
    const aiAt = Date.parse(ai.generatedAt), runAt = Date.parse(current.value.runs.find((candidate) => candidate.runId === ai.runId)?.recordedAt);
    const publishedAt = Date.parse(row.updated_at), nowAt = Date.parse(now);
    if (![aiAt, runAt, publishedAt, nowAt].every(Number.isFinite) || !(aiAt <= runAt && runAt <= publishedAt && publishedAt <= nowAt)) {
      throw new Error('Legacy publication timestamps are invalid or out of order');
    }
    const snapshot = await readSnapshot(database);
    const integrity = assess(base, ai, snapshot, now);
    if (!integrity.usableResearch || !['current', 'previous-analysis'].includes(integrity.researchStatus)) throw new Error('Legacy report is not currently readable research');
    if (base.runId !== ai.runId || base.snapshotId !== ai.snapshotId) throw new Error('Legacy report IDs do not match');
    const run = current.value.runs.find((candidate) => candidate.runId === ai.runId);
    if (!run || typeof run.digest !== 'string' || !run.digest.trim() || !isDeepStrictEqual(run.research, ai.research)) throw new Error('Legacy research does not match ledger provenance');
    validateResearch(ai.research, run.recordedAt);
    const reread = await readRow(database);
    if (reread?.date !== row.date || reread?.updated_at !== row.updated_at || reread?.base?.runId !== base.runId
      || reread?.ai?.runId !== ai.runId || reread?.ai?.generatedAt !== ai.generatedAt) throw new Error('Legacy report changed during adoption');
    const next = structuredClone(current.value);
    next.publication = { schemaVersion: 1, date: row.date, base: structuredClone(base), ai: structuredClone(ai),
      publishedAt: row.updated_at, digest: publicationDigest(base, ai) };
    try { await database.compareAndSetCache(require('../src/research-ledger').KEY, next, current.revision); }
    catch (error) { if (error.statusCode === 409 && attempt < 2) continue; throw error; }
    const saved = await ledgerReader(database);
    const publication = saved.value.publication;
    if (!validStoredPublication(publication) || publication.date !== row.date || publication.base.runId !== base.runId
      || publication.ai.runId !== ai.runId || publication.publishedAt !== row.updated_at
      || publication.digest !== publicationDigest(base, ai)) throw new Error('Adopted publication failed readback verification');
    const before = structuredClone(current.value); const after = structuredClone(saved.value); delete before.publication; delete after.publication;
    for (const key of ['runs', 'forecasts', 'outcomes']) {
      if (!Array.isArray(before[key]) || !Array.isArray(after[key]) || before[key].length > after[key].length
        || !before[key].every((entry, index) => isDeepStrictEqual(entry, after[key][index]))) throw new Error('Adoption changed research ledger fields');
      after[key] = before[key];
    }
    if (!isDeepStrictEqual(before, after)) throw new Error('Adoption changed research ledger fields');
    return { status: 'adopted', date: row.date, runId: ai.runId, publishedAt: row.updated_at };
  }
  throw new Error('Ledger changed repeatedly during adoption');
}
if (require.main === module) adoptLegacyPublication().then((result) => console.log(JSON.stringify(result))).catch(() => {
  console.error('Legacy publication adoption refused or failed'); process.exitCode = 1;
});
module.exports = { adoptLegacyPublication, latestReportRow };
