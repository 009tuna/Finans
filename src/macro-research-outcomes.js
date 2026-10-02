'use strict';
const { readStore } = require('./intelligence-store');
const { KEY: MACRO_KEY, initial: macroInitial } = require('./macro-store');
const { KEY: CPI_KEY, initial: cpiInitial } = require('./cpi-store');
const { readLedger, updateLedger, resolveForecast, policyForForecast, validateBlsForecastPolicy, httpUrl, timestamp } = require('./research-ledger');
const { validateObservation } = require('./macro-events');
const { valid: validCpiObservation } = require('./cpi-events');

const CPI_SCHEDULE = 'https://www.bls.gov/schedule/news_release/cpi.htm';
const time = (value) => { try { return Date.parse(value); } catch (_) { return NaN; } };
const isCpiForecast = (forecast) => Boolean(forecast?.resolution?.provider === 'bls-first-release' && policyForForecast(forecast)?.metric === forecast.metric && forecast.metric.startsWith('us_cpi_'));
const arrays = (value, key) => Array.isArray(value?.[key]) ? value[key] : [];

function validCpiScheduleProof(event, forecast, now) {
  return Boolean(event && event.eventId === `us_cpi:${forecast.period}` && event.period === forecast.period
    && Number.isFinite(time(event.scheduledAt)) && time(event.scheduledAt) === time(forecast.scheduledAt)
    && event.sourceUrl === CPI_SCHEDULE && /^[a-f\d]{64}$/i.test(event.contentHash || '')
    && Number.isFinite(time(event.observedAt)) && time(event.observedAt) <= time(now));
}

function validCpiForecastCutoff(forecast) {
  if (!forecast) return false;
  const createdAt = forecast.createdAt || forecast.recordedAt;
  const knowledgeCutoff = forecast.knowledgeCutoff || createdAt;
  return timestamp(createdAt) && timestamp(knowledgeCutoff)
    && timestamp(forecast.recordedAt) && time(knowledgeCutoff) <= time(createdAt) && time(createdAt) <= time(forecast.recordedAt)
    && time(forecast.recordedAt) < time(forecast.scheduledAt)
    && time(knowledgeCutoff) < time(forecast.scheduledAt)
    && time(createdAt) < time(forecast.scheduledAt);
}

function actualIsContested(observation, correctionReviews) {
  return correctionReviews.some((review) => review?.conflictWith === observation.id || review?.incoming?.id === observation.id);
}

function validCpiStoredForecast(forecast) {
  if (!forecast || !Number.isFinite(forecast.pointEstimate) || !Array.isArray(forecast.sourceIds)
    || !forecast.sourceIds.length || !Array.isArray(forecast.sourceEvidence) || !forecast.sourceEvidence.length
    || new Set(forecast.sourceIds).size !== forecast.sourceIds.length || !validCpiForecastCutoff(forecast)) return false;
  const ids = new Set(), urls = new Set(), sourceMap = new Map();
  for (const source of forecast.sourceEvidence) {
    if (!source || typeof source.id !== 'string' || !source.id || ids.has(source.id) || !httpUrl(source.url) || urls.has(source.url)
      || !source.title || !source.evidence || !['primary', 'secondary'].includes(source.kind)) return false;
    if (source.publishedAt !== null && (!timestamp(source.publishedAt) || time(source.publishedAt) > time(forecast.knowledgeCutoff || forecast.createdAt))) return false;
    ids.add(source.id); urls.add(source.url); sourceMap.set(source.id, source);
  }
  if (forecast.sourceIds.some((id) => typeof id !== 'string' || !sourceMap.has(id))
    || !validateBlsForecastPolicy(forecast, sourceMap, forecast.knowledgeCutoff || forecast.createdAt)) return false;
  return forecast.sourceIds.some((id) => timestamp(sourceMap.get(id).publishedAt)
    && time(sourceMap.get(id).publishedAt) <= time(forecast.knowledgeCutoff || forecast.createdAt));
}

function cpiDueForecasts(research, now) {
  return arrays(research, 'forecasts').filter((forecast) => isCpiForecast(forecast)
    && time(forecast.scheduledAt) <= time(now)
    && !arrays(research, 'outcomes').some((outcome) => outcome?.forecastId === forecast.id));
}

async function resolveCpiFromResearch(research, { database, now }) {
  const due = cpiDueForecasts(research, now);
  const result = { resolved: 0, awaiting: due.length, due: due.length, status: due.length ? 'pending' : 'not_due', matching: [] };
  if (!due.length) return result;
  let cpi;
  try {
    cpi = (await readStore(CPI_KEY, cpiInitial, database)).value;
  } catch (error) {
    return { ...result, status: 'unavailable', errorCode: 'cpi_store_unavailable', error: error.message || 'storage_or_source_failure' };
  }
  const events = arrays(cpi, 'events');
  const observations = arrays(cpi, 'observations');
  const correctionReviews = arrays(cpi, 'correctionReviews');
  for (const forecast of due) {
    if (!validCpiStoredForecast(forecast)) continue;
    const event = events.find((candidate) => validCpiScheduleProof(candidate, forecast, now));
    if (!event || event.scheduleConflict) continue;
    const observation = observations.find((candidate) => candidate && candidate.metric === forecast.metric && candidate.unit === forecast.unit
      && candidate.period === forecast.period && time(candidate.publishedAt) === time(forecast.scheduledAt));
    if (!observation || actualIsContested(observation, correctionReviews) || !validCpiObservation(observation)) continue;
    if (observation.sourceUrl !== forecast.resolution.sourceUrl || time(observation.publishedAt) !== time(event.scheduledAt)
      || time(observation.publishedAt) !== time(forecast.scheduledAt) || time(observation.observedAt) > time(now)) continue;
    result.matching.push({ forecastId: forecast.id, value: observation.value, metric: forecast.metric, unit: forecast.unit,
      period: forecast.period, publishedAt: observation.publishedAt, observedAt: observation.observedAt,
      sourceUrl: observation.sourceUrl, contentHash: observation.contentHash, vintage: 'first_release' });
  }
  result.resolved = result.matching.length;
  result.awaiting = due.length - result.resolved;
  result.status = result.resolved ? 'resolved' : 'awaiting';
  return result;
}

async function resolveCpiResearch({ database, now = new Date().toISOString() } = {}) {
  const { value: research } = await readLedger(database);
  const result = await resolveCpiFromResearch(research, { database, now });
  if (result.matching.length) {
    await updateLedger((current) => result.matching.reduce((ledger, observation) => resolveForecast(ledger, observation, now, 'bls-official-first-release'), current), database);
  }
  return { resolved: result.resolved, awaiting: result.awaiting, due: result.due, status: result.status, ...(result.errorCode ? { errorCode: result.errorCode } : {}) };
}

async function resolveBlsResearch({ database, now = new Date().toISOString() } = {}) {
  const { value: research } = await readLedger(database);
  const nfpDue = arrays(research, 'forecasts').filter((forecast) => policyForForecast(forecast)?.metric === 'us_nonfarm_payroll_change'
    && time(forecast.scheduledAt) <= time(now)
    && !arrays(research, 'outcomes').some((outcome) => outcome?.forecastId === forecast.id));
  const nfp = { resolved: 0, awaiting: nfpDue.length, due: nfpDue.length, status: nfpDue.length ? 'pending' : 'not_due' };
  const nfpMatching = [];
  if (nfpDue.length) {
    let macro;
    try {
      macro = (await readStore(MACRO_KEY, macroInitial, database)).value;
    } catch (_) {
      nfp.status = 'unavailable'; nfp.errorCode = 'macro_store_unavailable';
    }
    if (macro) for (const forecast of nfpDue) {
      const observation = arrays(macro, 'observations').find((item) => item && item.period === forecast.period && item.metric === forecast.metric && item.unit === forecast.unit);
      const event = arrays(macro, 'events').find((item) => item && item.period === forecast.period);
      if (!observation || !event || event.scheduleConflict || arrays(macro, 'observationConflicts').some((item) => item && item.period === forecast.period && item.value !== observation.value)) continue;
      try { validateObservation(observation); } catch (_) { continue; }
      if (observation.sourceUrl !== forecast.resolution.sourceUrl || time(observation.publishedAt) !== time(forecast.scheduledAt)
        || time(observation.observedAt) > time(now)) continue;
      nfpMatching.push({ forecastId: forecast.id, value: observation.value, metric: forecast.metric, unit: forecast.unit, period: forecast.period,
        publishedAt: observation.publishedAt, observedAt: observation.observedAt, sourceUrl: observation.sourceUrl, contentHash: observation.contentHash, vintage: 'first_release' });
    }
  }
  nfp.resolved = nfpMatching.length; nfp.awaiting = nfpDue.length - nfpMatching.length;
  if (nfp.status === 'pending') nfp.status = nfp.resolved ? 'resolved' : 'awaiting';
  // A CPI store outage must not prevent the already independent NFP resolver from scoring.
  const cpi = await resolveCpiFromResearch(research, { database, now });
  const matching = [...nfpMatching, ...cpi.matching];
  if (matching.length) await updateLedger((current) => matching.reduce((ledger, observation) => resolveForecast(ledger, observation, now, 'bls-official-first-release'), current), database);
  return { resolved: matching.length, awaiting: (nfpDue.length - nfpMatching.length) + cpi.awaiting,
    nfp,
    cpi: { resolved: cpi.resolved, awaiting: cpi.awaiting, due: cpi.due ?? cpi.resolved + cpi.awaiting, status: cpi.status, ...(cpi.errorCode ? { errorCode: cpi.errorCode } : {}) }, vintage: 'first_release' };
}

module.exports = { resolveBlsResearch, resolveCpiResearch, validCpiScheduleProof, validCpiForecastCutoff, validCpiStoredForecast };
