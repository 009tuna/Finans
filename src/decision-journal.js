'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db = null;
try {
  db = require('./db');
} catch (e) {
  // Ignore, might be running in test where db is not fully loaded/mocked, or just no-op
}

function normalizeJournal(input) {
  return {
    ...(input && Object.prototype.hasOwnProperty.call(input, '_revision') ? { _revision: input._revision } : {}),
    notes: input && input.notes && typeof input.notes === 'object' ? input.notes : {},
    alerts: Array.isArray(input && input.alerts) ? input.alerts : [],
    predictions: Array.isArray(input && input.predictions) ? input.predictions : [],
    theses: input && input.theses && typeof input.theses === 'object' ? input.theses : {},
    catalysts: Array.isArray(input && input.catalysts) ? input.catalysts : [],
    riskRules: Array.isArray(input && input.riskRules) ? input.riskRules : [],
    decisionAudits: Array.isArray(input && input.decisionAudits) ? input.decisionAudits : [],
    learningRules: Array.isArray(input && input.learningRules) ? input.learningRules : [],
    reviewQueue: Array.isArray(input && input.reviewQueue) ? input.reviewQueue : [],
  };
}

function keyOf(market, symbol) {
  return String(market || '').toLowerCase() + ':' + String(symbol || '').toUpperCase();
}

function cloneJournal(journal) {
  return JSON.parse(JSON.stringify(normalizeJournal(journal)));
}

function upsertNote(journal, market, symbol, note, nowIso) {
  const j = cloneJournal(journal);
  const key = keyOf(market, symbol);
  j.notes[key] = {
    thesis: String(note && note.thesis ? note.thesis : '').trim(),
    invalidation: String(note && note.invalidation ? note.invalidation : '').trim(),
    updatedAt: nowIso,
  };
  return j;
}

function alertId(alert) {
  return [
    String(alert && alert.market ? alert.market : '').toLowerCase(),
    String(alert && alert.symbol ? alert.symbol : '').toUpperCase(),
    String(alert && alert.trigger ? alert.trigger : '').toLowerCase(),
  ].join(':');
}

function upsertAlert(journal, alert, nowIso) {
  const j = cloneJournal(journal);
  const next = {
    id: alert.id || alertId(alert),
    market: String(alert.market || '').toLowerCase(),
    symbol: String(alert.symbol || '').toUpperCase(),
    trigger: String(alert.trigger || '').trim(),
    action: String(alert.action || '').trim(),
    enabled: alert.enabled !== false,
    createdAt: alert.createdAt || nowIso,
  };
  const idx = j.alerts.findIndex((x) => x.id === next.id);
  if (idx >= 0) j.alerts[idx] = Object.assign({}, j.alerts[idx], next);
  else j.alerts.push(next);
  return j;
}

function recordPrediction(journal, prediction, nowIso) {
  const j = cloneJournal(journal);
  const market = String(prediction.market || '').toLowerCase();
  const symbol = String(prediction.symbol || '').toUpperCase();

  // Duplication check: if there is already an open prediction for the same market:symbol, do not record a new one
  const hasOpen = j.predictions.some((x) => x.market === market && x.symbol === symbol && x.outcome === 'open');
  if (hasOpen) {
    return j;
  }

  const id = prediction.id || [
    market,
    symbol,
    nowIso.slice(0, 10),
  ].join(':');
  if (!j.predictions.some((x) => x.id === id)) {
    j.predictions.push({
      id,
      market,
      symbol,
      label: prediction.label || '',
      score: prediction.score,
      entry: prediction.entry,
      target: prediction.target,
      stop: prediction.stop,
      createdAt: nowIso,
      horizonDays: prediction.horizonDays || 30,
      resolvedAt: null,
      outcome: 'open',
      source: prediction.source || 'user',
    });
  }
  return j;
}

function appendDecisionAudit(journal, audit) {
  const j = cloneJournal(journal);
  if (!audit || !audit.id) return j;
  if (!j.decisionAudits.some((x) => x.id === audit.id)) {
    j.decisionAudits.push(audit);
  }
  return j;
}

function buildPredictionScorecard(journal) {
  const predictions = normalizeJournal(journal).predictions;
  const closedItems = predictions.filter((x) => x.outcome && x.outcome !== 'open');
  
  // wins definition expanded: target-hit or expired-win
  const wins = closedItems.filter((x) => x.outcome === 'target-hit' || x.outcome === 'expired-win').length;
  
  let avgResultPct = 0;
  if (closedItems.length > 0) {
    const totalPct = closedItems.reduce((acc, x) => acc + (x.resultPct || 0), 0);
    avgResultPct = Number((totalPct / closedItems.length).toFixed(1));
  }

  const getSubScorecard = (source) => {
    const filtered = predictions.filter((x) => (x.source || 'user') === source);
    const closed = filtered.filter((x) => x.outcome && x.outcome !== 'open');
    const w = closed.filter((x) => x.outcome === 'target-hit' || x.outcome === 'expired-win').length;
    return {
      total: filtered.length,
      closed: closed.length,
      wins: w,
      winRate: closed.length ? Math.round((w / closed.length) * 100) : 0,
    };
  };

  return {
    total: predictions.length,
    open: predictions.length - closedItems.length,
    closed: closedItems.length,
    wins,
    losses: closedItems.length - wins,
    winRate: closedItems.length ? Math.round((wins / closedItems.length) * 100) : 0,
    avgResultPct,
    bySource: {
      system: getSubScorecard('system'),
      user: getSubScorecard('user'),
    }
  };
}

function readJournalFile(filePath) {
  try {
    return normalizeJournal(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (_) {
    return normalizeJournal(null);
  }
}

function writeJournalFile(filePath, journal) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = normalizeJournal(journal);
  delete content._revision;
  const temp = filePath + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(content, null, 2) + '\n');
    fs.renameSync(temp, filePath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function cloudJournal() { return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY); }
function localRevision(filePath) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

async function readJournal(filePath) {
  if (cloudJournal()) {
    const cached = await db.getCache('journal', { strict: true });
    return { ...normalizeJournal(cached && cached.value), _revision: cached ? cached.revision : null };
  }
  const revision = localRevision(filePath);
  // Corrupt data is an error, not an empty journal that may overwrite records.
  const journal = revision === null ? normalizeJournal(null) : normalizeJournal(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  return { ...journal, _revision: revision };
}

async function writeJournal(filePath, journal) {
  const normalized = normalizeJournal(journal);
  if (!Object.prototype.hasOwnProperty.call(normalized, '_revision')) {
    const error = new Error('Kayit surumu eksik. Gunlugu yeniden yukleyin.');
    error.statusCode = 409;
    throw error;
  }
  const expected = normalized._revision;
  delete normalized._revision;
  if (cloudJournal()) {
    // Cloud is authoritative. Never write a local file first (Vercel is read-only).
    const revision = await db.compareAndSetCache('journal', normalized, expected);
    return { ...normalized, _revision: revision };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = filePath + '.lock';
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const conflict = new Error('Gunluk baska bir islem tarafindan yaziliyor. Tekrar deneyin.');
    conflict.statusCode = 409;
    throw conflict;
  }
  try {
    if (localRevision(filePath) !== expected) {
      const error = new Error('Gunluk degisti. Kaydetmeden once yeniden yukleyin.');
      error.statusCode = 409;
      throw error;
    }
    writeJournalFile(filePath, normalized);
    return { ...normalized, _revision: localRevision(filePath) };
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

module.exports = {
  normalizeJournal,
  upsertNote,
  upsertAlert,
  recordPrediction,
  appendDecisionAudit,
  buildPredictionScorecard,
  readJournalFile,
  writeJournalFile,
  readJournal,
  writeJournal,
};
