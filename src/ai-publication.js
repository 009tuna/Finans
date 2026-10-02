'use strict';
const { isFresh, snapshotId } = require('../public/report-integrity');
const { normalizeSignal, isExpired, buildMacroSignalOverlay } = require('./signal-overlay');

function validateAiReport(ai, base, snapshot, now = new Date().toISOString()) {
  if (!base || !base.runId || !isFresh(base.generatedAt, now)) throw new Error('Guncel temel rapor gerekli');
  if (!snapshot || !isFresh(snapshot.generatedAt, now) || snapshotId(snapshot) !== base.snapshotId) throw new Error('Piyasa verisi degisti; yeni temel rapor gerekli');
  if (!ai || ai.runId !== base.runId || ai.snapshotId !== base.snapshotId) throw new Error('AI raporunun runId/snapshotId degerleri temel raporla eslesmiyor');
  if (!isFresh(ai.generatedAt, now) || Date.parse(ai.generatedAt) < Date.parse(base.generatedAt)) throw new Error('AI raporunun zamani gecersiz veya eski');
  if (typeof ai.macroSummary !== 'string' || !ai.macroSummary.trim() || !ai.commentary || typeof ai.commentary !== 'object') throw new Error('AI raporunun ozet/yorum semasi eksik');
  const signals = ai.macroSignalOverlay && ai.macroSignalOverlay.signals;
  if (!Array.isArray(signals)) throw new Error('Sinyaller dizi olmali; kanit yoksa bos dizi kullanin');
  for (const raw of signals) {
    const normalized = normalizeSignal(raw, now);
    if (!normalized || isExpired(normalized, now) || !(normalized.market || normalized.symbol)
      || (normalized.market && !['us', 'bist', 'crypto'].includes(normalized.market))
      || !Number.isFinite(raw.adjustment) || Math.abs(raw.adjustment) > 8
      || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
      throw new Error('Kaynak, zaman, piyasa veya sayisal alanlari gecersiz AI sinyali');
    }
  }
  return true;
}

async function publish(ai, dependencies) {
  const { db, readJournal, journalPath, snapshot: frozenSnapshot, base: frozenBase, now = new Date().toISOString() } = dependencies;
  const date = ai && typeof ai.generatedAt === 'string' ? ai.generatedAt.slice(0, 10) : '';
  // The base report owns the publication date, including runs crossing midnight.
  const record = frozenBase ? { base: frozenBase, date: frozenBase.date } : await db.getReport(undefined, { strict: true });
  const snapshot = frozenSnapshot || await db.getLatestSnapshot({ strict: true });
  validateAiReport(ai, record.base, snapshot, now);
  const journal = await readJournal(journalPath);
  const base = { ...record.base, signalOverlay: buildMacroSignalOverlay({ snapshot, aiReport: ai, baseReport: record.base, journal, now }) };
  const { addPublication, updateLedger } = require('./research-ledger');
  const publicationDate = record.date || date;
  const ledger = await updateLedger((current) => addPublication(current, base, ai, publicationDate, new Date().toISOString()), db);
  const reread = await require('./research-ledger').readLedger(db);
  const saved = reread.value.publication;
  if (!saved || saved.schemaVersion !== 1 || saved.date !== publicationDate || saved.base.runId !== ai.runId
    || saved.base.snapshotId !== ai.snapshotId || saved.ai?.runId !== ai.runId || saved.ai?.generatedAt !== ai.generatedAt
    || saved.digest !== ledger.publication?.digest) {
    throw new Error('Yayin kaydi geri okuma dogrulamasi basarisiz');
  }
  return { date: saved.date, runId: ai.runId, publishedAt: saved.publishedAt };
}
module.exports = { validateAiReport, publish };
