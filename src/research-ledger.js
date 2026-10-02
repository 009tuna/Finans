'use strict';
const { createHash } = require('crypto');
const { isDeepStrictEqual } = require('util');
const db = require('./db');
const KEY = 'research_ledger_v1';
const markets = ['us', 'bist', 'crypto'];
const BLS_SCHEDULE = 'https://www.bls.gov/schedule/news_release/empsit.htm';
const CPI_SCHEDULE = 'https://www.bls.gov/schedule/news_release/cpi.htm';
const BLS_MONTHLY_SCHEDULE = /^https:\/\/www\.bls\.gov\/schedule\/\d{4}\/(0[1-9]|1[0-2])_sched\.htm$/;
const BLS_ARCHIVE = 'https://www.bls.gov/news.release/archives/';
const BLS_FORECAST_POLICIES = Object.freeze({
  nonfarmPayrollChange: Object.freeze({ provider: 'bls-first-release', field: 'nonfarmPayrollChange', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', requireScheduleSource: false, archivePrefix: 'empsit_' }),
  cpiHeadlineMomSa: Object.freeze({ provider: 'bls-first-release', field: 'cpiHeadlineMomSa', metric: 'us_cpi_headline_mom_sa', unit: 'percent', requireScheduleSource: true, archivePrefix: 'cpi_' }),
  cpiCoreMomSa: Object.freeze({ provider: 'bls-first-release', field: 'cpiCoreMomSa', metric: 'us_cpi_core_mom_sa', unit: 'percent', requireScheduleSource: true, archivePrefix: 'cpi_' }),
  cpiHeadlineYoyNsa: Object.freeze({ provider: 'bls-first-release', field: 'cpiHeadlineYoyNsa', metric: 'us_cpi_headline_yoy_nsa', unit: 'percent', requireScheduleSource: true, archivePrefix: 'cpi_' }),
  cpiCoreYoyNsa: Object.freeze({ provider: 'bls-first-release', field: 'cpiCoreYoyNsa', metric: 'us_cpi_core_yoy_nsa', unit: 'percent', requireScheduleSource: true, archivePrefix: 'cpi_' }),
});
const timestamp = (value) => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const httpUrl = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch (_) { return false; } };
const fail = (message) => { const e = new Error(message); e.statusCode = 400; throw e; };
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const utcDate = (value) => { try { const instant = Date.parse(value); return Number.isFinite(instant) ? new Date(instant).toISOString().slice(0, 10) : null; } catch (_) { return null; } };
const archiveUrl = (policy, scheduledAt) => {
  const date = utcDate(scheduledAt);
  return date && BLS_ARCHIVE + policy.archivePrefix + date.slice(5, 7) + date.slice(8, 10) + date.slice(0, 4) + '.htm';
};
function policyForForecast(forecast) {
  if (forecast?.resolution?.provider !== 'bls-first-release') return null;
  return BLS_FORECAST_POLICIES[forecast.resolution.field] || null;
}
function isMonthlySchedule(url, scheduledAt) {
  if (!BLS_MONTHLY_SCHEDULE.test(url)) return false;
  const expected = utcDate(scheduledAt);
  const match = new URL(url).pathname.match(/^\/schedule\/(\d{4})\/(0[1-9]|1[0-2])_sched\.htm$/);
  return Boolean(expected && match && `${match[1]}-${match[2]}` === expected.slice(0, 7));
}
function isUntimedScheduleSource(source, forecast, policy) {
  if (!source || source.kind !== 'primary' || source.publishedAt !== null || !policy) return false;
  const url = source.url;
  if (url === (policy.archivePrefix === 'cpi_' ? CPI_SCHEDULE : BLS_SCHEDULE)) return true;
  return isMonthlySchedule(url, forecast.scheduledAt);
}
function isOfficialScheduleSource(source, forecast, policy) {
  if (!source || source.kind !== 'primary' || !policy) return false;
  if (source.publishedAt !== null && !timestamp(source.publishedAt)) return false;
  const url = source.url;
  return url === (policy.archivePrefix === 'cpi_' ? CPI_SCHEDULE : BLS_SCHEDULE) || isMonthlySchedule(url, forecast.scheduledAt);
}
function validateBlsForecastPolicy(forecast, sources, now) {
  const policy = policyForForecast(forecast);
  if (!policy || !(sources instanceof Map) || !timestamp(now) || !Array.isArray(forecast.sourceIds)
    || !forecast.sourceIds.length || new Set(forecast.sourceIds).size !== forecast.sourceIds.length
    || !Number.isFinite(forecast.pointEstimate)) return false;
  let scheduled;
  try { scheduled = Date.parse(forecast.scheduledAt); } catch (_) { return false; }
  if (typeof forecast.period !== 'string' || typeof forecast.metric !== 'string' || typeof forecast.unit !== 'string'
    || typeof forecast.market !== 'string' || typeof forecast.symbol !== 'string'
    || forecast.market !== 'us' || forecast.symbol !== '' || forecast.metric !== policy.metric || forecast.unit !== policy.unit
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(forecast.period) || !Number.isFinite(scheduled) || scheduled <= Date.parse(now)
    || forecast.resolution.sourceUrl !== archiveUrl(policy, forecast.scheduledAt)) return false;
  let datedEvidence = false;
  for (const id of forecast.sourceIds) {
    const source = sources.get(id);
    if (!source || !source.id || source.id !== id || !httpUrl(source.url) || !source.title || !source.evidence || !['primary', 'secondary'].includes(source.kind)) return false;
    if (source.publishedAt === null) {
      if (!isUntimedScheduleSource(source, forecast, policy)) return false;
    } else {
      if (!timestamp(source.publishedAt) || Date.parse(source.publishedAt) > Date.parse(now)) return false;
      datedEvidence = true;
    }
  }
  if (!datedEvidence || policy.requireScheduleSource && !forecast.sourceIds.some((id) => isOfficialScheduleSource(sources.get(id), forecast, policy))) return false;
  return true;
}
function forecastKey(f) {
  const metric = f.resolution?.provider === 'finnhub-earnings' ? f.resolution.field : f.metric.trim().toLowerCase();
  const date = policyForForecast(f)?.archivePrefix === 'cpi_' ? utcDate(f.scheduledAt) : f.scheduledAt.slice(0, 10);
  return hash([f.market, f.symbol.toUpperCase(), metric, f.unit.trim().toLowerCase(), f.period.trim().toLowerCase(), date]).slice(0, 24);
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
      || !['manual', 'finnhub-earnings', 'bls-first-release'].includes(f.resolution?.provider)) fail('Tahmin aciklama oncesi, olculebilir ve kaynakli olmali');
    const policy = policyForForecast(f);
    const untimedOfficialSchedule = (source) => isUntimedScheduleSource(source, f, policy);
    // A release calendar is a schedule, not a timestamped data observation. Only
    // that exact primary BLS calendar can be undated; numeric evidence stays dated.
    if (!f.sourceIds.some((id) => timestamp(sources.get(id).publishedAt)) || f.sourceIds.some((id) => {
      const source = sources.get(id); return !timestamp(source.publishedAt) && !untimedOfficialSchedule(source);
    }) || (f.consensusSourceId && !timestamp(sources.get(f.consensusSourceId)?.publishedAt))) fail('Tahmin icin tarihli kaynak gerekli');
    if (f.resolution.provider === 'finnhub-earnings' && (!f.symbol || f.market !== 'us' || !['epsActual', 'revenueActual'].includes(f.resolution.field)
      || f.unit !== (f.resolution.field === 'epsActual' ? 'USD/share' : 'USD'))) fail('Otomatik bilanco eslestirmesi gecersiz');
    if (f.resolution.provider === 'manual' && f.resolution.field !== 'manual') fail('Manuel sonuc alani gecersiz');
    if (f.resolution.provider === 'bls-first-release' && !validateBlsForecastPolicy(f, sources, now)) fail('BLS ilk aciklama sozlesmesi gecersiz');
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
// Later opinions are evidence from immutable runs, never replacement scored forecasts.
function forecastReviews(ledger) {
  const originals = new Map((ledger.forecasts || []).map((item) => [item.id, item]));
  return (ledger.runs || []).flatMap((run) => (run.research?.forecasts || []).flatMap((item) => {
    const original = originals.get(forecastKey(item));
    if (!original || run.runId === original.runId || Date.parse(run.recordedAt) <= Date.parse(original.recordedAt)) return [];
    const changed = item.pointEstimate !== original.pointEstimate || item.consensus !== original.consensus ||
      item.probabilityAboveConsensus !== original.probabilityAboveConsensus || item.rationale !== original.rationale;
    if (!changed) return [];
    const cpiReview = policyForForecast(item)?.archivePrefix === 'cpi_';
    const generatedAt = run.research.generatedAt;
    const generatedAtUsable = timestamp(generatedAt) && timestamp(run.recordedAt) && Date.parse(generatedAt) <= Date.parse(run.recordedAt);
    const knowledgeCutoffBasis = cpiReview ? (generatedAtUsable ? 'research_generated_at' : 'publication_time_fallback')
      : run.research.analysisAsOf ? 'research_analysis_as_of'
        : run.research.generatedAt ? 'research_generated_at' : 'publication_time_fallback';
    const knowledgeCutoff = cpiReview ? (generatedAtUsable ? generatedAt : run.recordedAt)
      : run.research.analysisAsOf || run.research.generatedAt || run.recordedAt;
    return [{ ...structuredClone(item), id: 'review:' + original.id + ':' + run.runId,
      originalForecastId: original.id, originalPointEstimate: original.pointEstimate,
      runId: run.runId, recordedAt: run.recordedAt, createdAt: cpiReview ? run.recordedAt : (run.research.generatedAt || run.recordedAt),
      knowledgeCutoff,
      knowledgeCutoffBasis,
      model: run.research.model, promptVersion: run.research.promptVersion,
      sourceEvidence: (run.research.sources || []).filter((source) => item.sourceIds.includes(source.id) || item.consensusSourceId === source.id),
      reviewOnly: true, scoringPolicy: 'original_forecast_only' }];
  }));
}
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
    const typedCpi = f.resolution?.provider === 'bls-first-release' && /^us_cpi_(headline|core)_(mom_sa|yoy_nsa)$/.test(f.metric);
    const generatedAt = r.generatedAt || ai.generatedAt;
    const modelCompletion = typedCpi && timestamp(generatedAt) && Date.parse(generatedAt) <= Date.parse(now) ? generatedAt : now;
    next.forecasts.push({ ...structuredClone(f), id, recordedAt: now, runId: ai.runId,
      ...(typedCpi ? { createdAt: now, knowledgeCutoff: modelCompletion } : {}),
      model: r.model, promptVersion: r.promptVersion, sourceEvidence: r.sources.filter((s) => f.sourceIds.includes(s.id) || f.consensusSourceId === s.id) });
  }
  next.runs.push({ runId: ai.runId, digest, recordedAt: now, forecastIds: ids, research: structuredClone(r) });
  return next;
}
function publicationDigest(base, ai) { return hash([base && base.runId, base && base.snapshotId, base && base.generatedAt, ai]); }
function addPublication(ledger, base, ai, date, now) {
  const next = ai && ai.research ? addResearch(ledger, ai, now) : structuredClone(ledger);
  const digest = publicationDigest(base, ai);
  const current = next.publication;
  if (current) {
    if (!current.base || current.schemaVersion !== 1 || !current.digest) fail('Kayitli yayin kaydi gecersiz');
    const a = Date.parse(current.base.generatedAt), b = Date.parse(base.generatedAt);
    if (Number.isFinite(a) && b < a) fail('Daha eski temel rapor yayinlanamaz');
    if (current.base.runId === base.runId) {
      if (current.digest !== digest) fail('Ayni calismanin yayin icerigi degistirilemez');
      return next;
    }
  }
  next.publication = { schemaVersion: 1, date, base: structuredClone(base), ai: ai ? structuredClone(ai) : null, publishedAt: now, digest };
  return next;
}
function resolveForecast(ledger, input, now, verification = 'human-reviewed') {
  const f = ledger.forecasts.find((x) => x.id === input.forecastId);
  if (!f) fail('Tahmin bulunamadi');
  const policy = policyForForecast(f);
  const createdAt = f.createdAt || f.recordedAt;
  const knowledgeCutoff = f.knowledgeCutoff || createdAt;
  if (!Number.isFinite(input.value) || !httpUrl(input.sourceUrl) || !timestamp(input.publishedAt)
    || !timestamp(now) || Date.parse(input.publishedAt) > Date.parse(now) || Date.parse(input.publishedAt) < Date.parse(f.scheduledAt)
    || Date.parse(createdAt) >= Date.parse(f.scheduledAt) || input.unit !== f.unit || input.period !== f.period || input.metric !== f.metric
    || policy && input.sourceUrl !== f.resolution.sourceUrl
    || policy?.archivePrefix === 'cpi_' && (!timestamp(createdAt) || !timestamp(knowledgeCutoff) || Date.parse(knowledgeCutoff) > Date.parse(createdAt) || Date.parse(knowledgeCutoff) >= Date.parse(f.scheduledAt))) fail('Sonuc zamani, birimi veya donemi tahminle eslesmiyor');
  const existing = ledger.outcomes.find((o) => o.forecastId === f.id);
  if (existing) {
    if (existing.value === input.value && existing.sourceUrl === input.sourceUrl) return structuredClone(ledger);
    fail('Kaydedilmis sonuc degistirilemez; revizyon ayri incelenmeli');
  }
  const next = structuredClone(ledger);
  next.outcomes.push({ forecastId: f.id, value: input.value, unit: input.unit, period: input.period, metric: input.metric,
    sourceUrl: input.sourceUrl, publishedAt: input.publishedAt, recordedAt: now, verification,
    ...(verification === 'bls-official-first-release' ? { vintage: input.vintage, observedAt: input.observedAt, contentHash: input.contentHash } : {}),
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
module.exports = { KEY, BLS_FORECAST_POLICIES, policyForForecast, validateBlsForecastPolicy, validateForecastPolicy: validateBlsForecastPolicy, validateResearch, forecastKey, forecastReviews, addResearch, addPublication, publicationDigest, resolveForecast, scorecard, empty, readLedger, updateLedger, httpUrl, timestamp };
