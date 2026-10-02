'use strict';
const db = require('./db');
const KEY = 'research_progress_v1';
const allowed = new Set(['unavailable', 'validation_failed', 'generation_failed', 'publication_failed', 'pipeline_failed', 'model_access']);
const validTime = (value) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
function clean(value) {
  if (!value || value.schemaVersion !== 1 || !value.runId || !Array.isArray(value.stages) || !['running', 'completed', 'failed', 'interrupted'].includes(value.status)) return null;
  const stageStates = new Set(['pending', 'running', 'completed', 'skipped', 'failed']);
  if (![value.startedAt, value.finishedAt, value.updatedAt].every(validTime) || !value.startedAt || !value.updatedAt
    || (value.status !== 'running' && !value.finishedAt)) return null;
  return { schemaVersion: 1, runId: String(value.runId).slice(0, 80), status: value.status,
    startedAt: value.startedAt || null, finishedAt: value.finishedAt || null, updatedAt: value.updatedAt || null,
    stages: value.stages.map((s) => ({ id: String(s.id).slice(0, 40), status: stageStates.has(s.status) ? s.status : 'pending', startedAt: s.startedAt || null, finishedAt: s.finishedAt || null,
      ...(typeof s.message === 'string' ? { message: s.message.slice(0, 100) } : {}) })),
    lastSuccessful: value.lastSuccessful && typeof value.lastSuccessful.runId === 'string' ? { runId: value.lastSuccessful.runId.slice(0, 80), publishedAt: value.lastSuccessful.publishedAt || null } : null,
    ...(allowed.has(value.errorCode) ? { errorCode: value.errorCode } : {}) };
}
async function readProgress(database = db, now = Date.now()) {
  try {
    const cached = await database.getCache(KEY, { strict: true });
    if (!cached) return { status: 'idle', runId: null, startedAt: null, finishedAt: null, updatedAt: null, stages: [], lastSuccessful: null };
    const state = clean(cached && cached.value);
    if (!state) return { status: 'unavailable', runId: null, startedAt: null, finishedAt: null, updatedAt: null, stages: [], lastSuccessful: null, errorCode: 'unavailable' };
    if (state.status === 'running' && (Date.parse(state.updatedAt) > now || Date.parse(state.updatedAt) < now - 6 * 60 * 60 * 1000)) state.status = 'interrupted';
    delete state.schemaVersion;
    return state;
  } catch (_) { return { status: 'unavailable', runId: null, startedAt: null, finishedAt: null, updatedAt: null, stages: [], lastSuccessful: null, errorCode: 'unavailable' }; }
}
async function writeProgress(state, database = db) {
  const safe = clean(state);
  if (!safe) { const e = new Error('Invalid progress state'); e.statusCode = 400; throw e; }
  for (let i = 0; i < 3; i++) {
    const old = await database.getCache(KEY, { strict: true });
    const current = clean(old && old.value);
    if (current && current.runId !== safe.runId && (Date.parse(current.startedAt) > Date.parse(safe.startedAt)
      || (current.status === 'running' && Date.parse(current.startedAt) === Date.parse(safe.startedAt)))) {
      const e = new Error('Stale progress run'); e.statusCode = 409; throw e;
    }
    if (current && current.runId === safe.runId && Date.parse(current.updatedAt) >= Date.parse(safe.updatedAt)) {
      if (JSON.stringify(current) === JSON.stringify(safe)) return safe;
      const e = new Error('Stale progress update'); e.statusCode = 409; throw e;
    }
    try { await database.compareAndSetCache(KEY, safe, old?.revision || null); return safe; }
    catch (e) { if (e.statusCode !== 409 || i === 2) throw e; }
  }
}
function preferCanonicalSuccess(automation, publication) {
  if (!publication?.ai || !publication.ai.runId || !publication.publishedAt) return automation;
  const cachedTime = Date.parse(automation.lastSuccessful?.publishedAt);
  const publishedTime = Date.parse(publication.publishedAt);
  if (!automation.lastSuccessful || !Number.isFinite(cachedTime) || (Number.isFinite(publishedTime) && publishedTime > cachedTime)) {
    automation.lastSuccessful = { runId: publication.ai.runId, publishedAt: publication.publishedAt };
  }
  return automation;
}
module.exports = { KEY, readProgress, writeProgress, clean, preferCanonicalSuccess };
