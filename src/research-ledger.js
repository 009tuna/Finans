'use strict';
const { createHash } = require('crypto');
const { isDeepStrictEqual } = require('util');
const db = require('./db');
const KEY = 'research_ledger_v1';
const markets = ['us', 'bist', 'crypto'];
const timestamp = (value) => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const httpUrl = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch (_) { return false; } };
const fail = (message) => { const e = new Error(message); e.statusCode = 400; throw e; };
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function forecastKey(f) {
  const metric = f.resolution?.provider === 'finnhub-earnings' ? f.resolution.field : f.metric.trim().toLowerCase();
  return hash([f.market, f.symbol.toUpperCase(), metric, f.unit.trim().toLowerCase(), f.period.trim().toLowerCase(), f.scheduledAt.slice(0, 10)]).slice(0, 24);
}
function validateResearch(r, now) {
  if (!r || !timestamp(now)) fail('Arastirma veya zaman eksik');
  for (const key of ['sources', 'events', 'forecasts', 'scenarios', 'signals', 'coverage', 'unresolvedQuestions']) {
    if (!Array.isArray(r[key]) || r[key].length > 100) fail(key + ' gecersiz');
  }
  const sources = new Map();
  for (const s of r.sources) {
    if (!s.id || sources.has(s.id) || !httpUrl(s.url) || (s.publishedAt !== null && (!timestamp(s.publishedAt) || Date.parse(s.publishedAt) > Date.parse(now)))
      || !s.title || !s.evidence || !['primary', 'secondary'].includes(s.kind)) fail('Kaynak kimligi, kaniti veya zamani gecersiz: ' + String(s.id).slice(0, 80));
    sources.set(s.id, s);
  }
  const refs = (ids) => Array.isArray(ids) && ids.length > 0 && ids.every((id) => sources.has(id));
  const events = new Map();
  for (const e of r.events) {
    if (!e.id || events.has(e.id) || !markets.includes(e.market) || !e.title || !refs(e.sourceIds)) fail('Olay kaynak baglantisi gecersiz');
    events.set(e.id, e);
  }
  if (r.coverage.length !== 3 || new Set(r.coverage.map((c) => c.market)).size !== 3
    || r.coverage.some((c) => !markets.includes(c.market) || !['available', 'partial', 'insufficient_evidence'].includes(c.status) || !c.reason)) fail('Uc piyasanin kapsam durumu gerekli');
  const keys = new Set();
  for (const f of r.forecasts) {
    if (!events.has(f.eventId) || !markets.includes(f.market) || !refs(f.sourceIds) || typeof f.symbol !== 'string'
      || !f.metric || !f.unit || !f.period || !timestamp(f.scheduledAt) || Date.parse(f.scheduledAt) <= Date.parse(now)
      || !Number.isFinite(f.pointEstimate) || !f.rationale || !httpUrl(f.resolution?.sourceUrl)
      || !['manual', 'finnhub-earnings'].includes(f.resolution?.provider)) fail('Tahmin aciklama oncesi, olculebilir ve kaynakli olmali');
    if (f.sourceIds.some((id) => !timestamp(sources.get(id).publishedAt)) || (f.consensusSourceId && !timestamp(sources.get(f.consensusSourceId)?.publishedAt))) fail('Tahmin icin tarihli kaynak gerekli');
    if (f.resolution.provider === 'finnhub-earnings' && (!f.symbol || f.market !== 'us' || !['epsActual', 'revenueActual'].includes(f.resolution.field)
      || f.unit !== (f.resolution.field === 'epsActual' ? 'USD/share' : 'USD'))) fail('Otomatik bilanco eslestirmesi gecersiz');
    if (f.resolution.provider === 'manual' && f.resolution.field !== 'manual') fail('Manuel sonuc alani gecersiz');
    if (f.consensus !== null && (!Number.isFinite(f.consensus) || !sources.has(f.consensusSourceId))) fail('Konsensus kaynagi gerekli');
    if (f.probabilityAboveConsensus !== null && (f.consensus === null || !Number.isFinite(f.probabilityAboveConsensus)
      || f.probabilityAboveConsensus < 0 || f.probabilityAboveConsensus > 1)) fail('Olasilik icin konsensus ve 0..1 araligi gerekli');
    const key = forecastKey(f); if (keys.has(key)) fail('Tekrarlanan tahmin'); keys.add(key);
  }
  for (const s of r.scenarios) {
    if (!events.has(s.eventId) || !markets.includes(s.market) || !refs(s.sourceIds) || !s.condition || !s.impact || !s.invalidation || !s.horizon) fail('Kosullu senaryo eksik');
  }
  for (const s of r.signals) {
    if (!events.has(s.eventId) || !sources.has(s.sourceId) || !markets.includes(s.market)) fail('Sinyalin olay/kaynak baglantisi eksik');
    if (!timestamp(sources.get(s.sourceId).publishedAt) || !timestamp(s.asOf) || Date.parse(s.asOf) < Date.parse(sources.get(s.sourceId).publishedAt)) fail('Sinyal tarihli kaynak gerektirir ve kaynaktan once olamaz');
  }
  return true;
}
function empty() { return { schemaVersion: 1, runs: [], forecasts: [], outcomes: [] }; }
function addResearch(ledger, ai, now) {
  const r = ai.research;
  validateResearch(r, now);
  const next = structuredClone(ledger);
  const digest = hash(r);
  const previous = next.runs.find((run) => run.runId === ai.runId);
  if (previous) {
    if (previous.digest !== digest) fail('Ayni calismanin arastirmasi degistirilemez');
    return next;
  }
  const ids = [];
  for (const f of r.forecasts) {
    const id = forecastKey(f); ids.push(id);
    if (next.forecasts.some((x) => x.id === id)) continue;
    next.forecasts.push({ ...structuredClone(f), id, recordedAt: now, runId: ai.runId,
      model: r.model, promptVersion: r.promptVersion, sourceEvidence: r.sources.filter((s) => f.sourceIds.includes(s.id) || f.consensusSourceId === s.id) });
  }
  next.runs.push({ runId: ai.runId, digest, recordedAt: now, forecastIds: ids, research: structuredClone(r) });
  return next;
}
function resolveForecast(ledger, input, now, verification = 'human-reviewed') {
  const f = ledger.forecasts.find((x) => x.id === input.forecastId);
  if (!f) fail('Tahmin bulunamadi');
  if (!Number.isFinite(input.value) || !httpUrl(input.sourceUrl) || !timestamp(input.publishedAt)
    || !timestamp(now) || Date.parse(input.publishedAt) > Date.parse(now) || Date.parse(input.publishedAt) < Date.parse(f.scheduledAt)
    || Date.parse(f.recordedAt) >= Date.parse(f.scheduledAt) || input.unit !== f.unit || input.period !== f.period || input.metric !== f.metric) fail('Sonuc zamani, birimi veya donemi tahminle eslesmiyor');
  const existing = ledger.outcomes.find((o) => o.forecastId === f.id);
  if (existing) {
    if (existing.value === input.value && existing.sourceUrl === input.sourceUrl) return structuredClone(ledger);
    fail('Kaydedilmis sonuc degistirilemez; revizyon ayri incelenmeli');
  }
  const next = structuredClone(ledger);
  next.outcomes.push({ forecastId: f.id, value: input.value, unit: input.unit, period: input.period, metric: input.metric,
    sourceUrl: input.sourceUrl, publishedAt: input.publishedAt, recordedAt: now, verification,
    absoluteError: Math.abs(f.pointEstimate - input.value),
    consensusAbsoluteError: f.consensus === null ? null : Math.abs(f.consensus - input.value),
    brier: f.probabilityAboveConsensus === null ? null : (f.probabilityAboveConsensus - (input.value > f.consensus ? 1 : 0)) ** 2 });
  return next;
}
function scorecard(ledger, now = new Date().toISOString()) {
  const groups = new Map();
  for (const f of ledger.forecasts) {
    const key = JSON.stringify([f.market, f.metric, f.unit]);
    if (!groups.has(key)) groups.set(key, { market: f.market, metric: f.metric, unit: f.unit, forecasts: 0, resolved: 0, errors: [], paired: [], briers: [] });
    const g = groups.get(key); g.forecasts++;
    const o = ledger.outcomes.find((x) => x.forecastId === f.id);
    if (!o) continue;
    g.resolved++; g.errors.push(o.absoluteError);
    if (o.consensusAbsoluteError !== null) g.paired.push({ model: o.absoluteError, baseline: o.consensusAbsoluteError });
    if (o.brier !== null) g.briers.push(o.brier);
  }
  const mean = (a) => a.length ? a.reduce((sum, v) => sum + v, 0) / a.length : null;
  return { total: ledger.forecasts.length, resolved: ledger.outcomes.length,
    pending: ledger.forecasts.filter((f) => !ledger.outcomes.some((o) => o.forecastId === f.id) && Date.parse(f.scheduledAt) > Date.parse(now)).length,
    awaitingOutcome: ledger.forecasts.filter((f) => !ledger.outcomes.some((o) => o.forecastId === f.id) && Date.parse(f.scheduledAt) <= Date.parse(now)).length,
    groups: [...groups.values()].map((g) => ({ market: g.market, metric: g.metric, unit: g.unit, forecasts: g.forecasts, resolved: g.resolved,
      mae: mean(g.errors), pairedCount: g.paired.length, pairedModelMae: mean(g.paired.map((p) => p.model)), consensusMae: mean(g.paired.map((p) => p.baseline)),
      brier: mean(g.briers), brierCount: g.briers.length, sampleStatus: g.resolved < 20 ? 'insufficient_sample' : 'descriptive_only' })) };
}
async function readLedger(database = db) {
  const cached = await database.getCache(KEY, { strict: true });
  const value = cached?.value || empty();
  if (value.schemaVersion !== 1 || !['runs', 'forecasts', 'outcomes'].every((k) => Array.isArray(value[k]))) throw new Error('Arastirma gunlugu bozuk');
  return { value, revision: cached?.revision || null };
}
async function updateLedger(transform, database = db) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readLedger(database);
    const next = transform(current.value);
    if (isDeepStrictEqual(current.value, next)) return next;
    try { await database.compareAndSetCache(KEY, next, current.revision); return next; }
    catch (e) { if (e.statusCode !== 409 || attempt === 2) throw e; }
  }
}
module.exports = { KEY, validateResearch, forecastKey, addResearch, resolveForecast, scorecard, empty, readLedger, updateLedger, httpUrl, timestamp };
