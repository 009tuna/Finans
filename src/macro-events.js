'use strict';

const crypto = require('crypto');
const METRIC = 'us_nonfarm_payroll_change';
const UNIT = 'thousand_jobs';
const METHODS = Object.freeze({ last_observation: 'macro:last-observation:v1', trailing_three_mean: 'macro:trailing-three-mean:v1', trailing_three_months: 'macro:trailing-three-consecutive:v2' });
const ACTIVE_METHODS = Object.freeze([METHODS.last_observation, METHODS.trailing_three_months]);
const iso = (v, field) => { const d = new Date(v); if (!Number.isFinite(d.getTime())) throw new TypeError(`${field} must be a valid timestamp`); return d.toISOString(); };
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const time = (v) => new Date(v).getTime();
const periodOk = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v || '');
function previousMonths(period, count) {
  const [year, month] = period.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (i + 1), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }).reverse();
}
const officialBlsUrl = (v) => { try { return new URL(v).hostname === 'www.bls.gov' || new URL(v).hostname === 'bls.gov'; } catch { return false; } };
const officialScheduleUrl = (v) => { try { const u = new URL(v); return officialBlsUrl(v) && u.pathname === '/schedule/news_release/empsit.htm'; } catch { return false; } };
const archiveDateFromUrl = (v) => { try { const m = new URL(v).pathname.match(/\/archives\/empsit_(\d{2})(\d{2})(\d{4})\.htm$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; } catch { return null; } };
function validateObservation(o) {
  if (!o || o.metric !== METRIC || o.unit !== UNIT || !periodOk(o.period) || !Number.isFinite(o.value)) throw new TypeError('Invalid nonfarm payroll observation');
  if (!officialBlsUrl(o.sourceUrl) || !/^[a-f\d]{64}$/i.test(o.contentHash || '') || o.vintage !== 'first_release') throw new TypeError('Observation requires an official BLS source, SHA-256 content hash, and first_release vintage');
  const publishedAt = iso(o.publishedAt, 'publishedAt'), observedAt = iso(o.observedAt, 'observedAt');
  if (time(observedAt) < time(publishedAt)) throw new Error('Observation retrieval cannot precede official publication');
  if (archiveDateFromUrl(o.sourceUrl) !== publishedAt.slice(0, 10)) throw new Error('Observation source must be the matching official dated BLS archive');
  return Object.freeze({ ...o, publishedAt, observedAt });
}
function validateRevision(r) {
  if (!r || r.metric !== METRIC || r.unit !== UNIT || r.vintage !== 'revision' || !periodOk(r.period) || !Number.isFinite(r.value) || !Number.isFinite(r.previousValue) || !Number.isFinite(r.revisionChange)) throw new TypeError('Invalid macro revision');
  if (Math.abs((r.value - r.previousValue) - r.revisionChange) > 1e-9) throw new TypeError('Revision change must equal revised value minus prior value');
  if (!officialBlsUrl(r.sourceUrl) || !/^[a-f\d]{64}$/i.test(r.contentHash || '')) throw new TypeError('Revision requires official BLS source and SHA-256 content hash');
  const publishedAt = iso(r.publishedAt, 'publishedAt'), observedAt = iso(r.observedAt, 'observedAt');
  if (time(observedAt) < time(publishedAt) || archiveDateFromUrl(r.sourceUrl) !== publishedAt.slice(0, 10) || r.period >= publishedAt.slice(0, 7)) throw new Error('Revision source or publication chronology is invalid');
  return Object.freeze({ ...r, publishedAt, observedAt });
}
function freezeForecast(f) {
  if (!f || !f.forecastId || !f.eventId || !Object.values(METHODS).includes(f.methodId) || f.metric !== METRIC || f.unit !== UNIT || !periodOk(f.period)) throw new TypeError('Invalid seeded forecast');
  const createdAt = iso(f.createdAt, 'createdAt'), knowledgeCutoff = iso(f.knowledgeCutoff, 'knowledgeCutoff'), scheduledAt = iso(f.scheduledAt, 'scheduledAt');
  if (!officialScheduleUrl(f.scheduleSourceUrl) || !/^[a-f\d]{64}$/i.test(f.scheduleContentHash || '') || !Array.isArray(f.inputObservationIds)) throw new TypeError('Seeded forecast lacks official schedule provenance or input IDs');
  const scheduleObservedAt = iso(f.scheduleObservedAt, 'scheduleObservedAt');
  if (f.eventId !== `${METRIC}:${f.period}` || f.forecastId !== `${f.eventId}:${f.methodId}` || (f.estimate !== null && !Number.isFinite(f.estimate)) || !['frozen', 'insufficient_history'].includes(f.status)) throw new TypeError('Seeded forecast identity, estimate, or status is invalid');
  if (time(knowledgeCutoff) > time(createdAt) || time(createdAt) >= time(scheduledAt) || time(scheduleObservedAt) > time(knowledgeCutoff)) throw new Error('Seeded forecast violates chronology');
  return Object.freeze({ ...f, createdAt, knowledgeCutoff, scheduledAt, scheduleObservedAt, inputObservationIds: Object.freeze(f.inputObservationIds.slice()) });
}
function freezeOutcome(o) {
  if (!o || !o.eventId || !periodOk(o.period) || o.metric !== METRIC || o.unit !== UNIT || !Number.isFinite(o.actual) || o.vintage !== 'first_release') throw new TypeError('Invalid seeded outcome');
  if (!officialBlsUrl(o.sourceUrl) || !/^[a-f\d]{64}$/i.test(o.contentHash || '')) throw new TypeError('Seeded outcome lacks official source provenance');
  const publishedAt = iso(o.publishedAt, 'publishedAt'), observedAt = iso(o.observedAt, 'observedAt'), resolvedAt = iso(o.resolvedAt, 'resolvedAt'), scheduledAt = iso(o.scheduledAt, 'scheduledAt');
  if (o.eventId !== `${METRIC}:${o.period}` || archiveDateFromUrl(o.sourceUrl) !== publishedAt.slice(0, 10) || !['resolved', 'schedule_mismatch'].includes(o.status) || time(publishedAt) < time(scheduledAt) || time(observedAt) < time(publishedAt) || time(resolvedAt) < time(observedAt) || (o.status === 'resolved') !== (time(publishedAt) === time(scheduledAt))) throw new Error('Seeded outcome violates identity, source, or publication/retrieval/resolution chronology');
  return Object.freeze({ ...o, publishedAt, observedAt, resolvedAt, scheduledAt });
}
function createMacroEventLedger(seed = {}) {
  const observations = (seed.observations || []).map(validateObservation);
  const revisions = (seed.revisions || []).map(validateRevision);
  const forecasts = (seed.forecasts || []).map(freezeForecast);
  const outcomes = (seed.outcomes || []).map(freezeOutcome);
  const unique = (items, key, label) => { const seen = new Set(); for (const item of items) { const id = key(item); if (seen.has(id)) throw new Error(`Duplicate seeded ${label}: ${id}`); seen.add(id); } };
  unique(observations, (o) => o.period, 'first release');
  unique(revisions, (r) => `${r.period}:${r.publishedAt}`, 'revision');
  unique(forecasts, (f) => f.forecastId, 'forecast');
  unique(outcomes, (o) => o.eventId, 'outcome');
  for (const f of forecasts) {
    const eligible = observations.filter((o) => o.period < f.period && time(o.publishedAt) < time(f.knowledgeCutoff) && time(o.observedAt) <= time(f.knowledgeCutoff)).sort((a, b) => a.period.localeCompare(b.period));
    const v2Periods = f.methodId === METHODS.trailing_three_months ? previousMonths(f.period, 3) : null;
    const eligibleByPeriod = new Map(eligible.map((o) => [o.period, o]));
    const v2Used = v2Periods ? v2Periods.map((period) => eligibleByPeriod.get(period)).filter(Boolean) : null;
    const insufficientThree = f.methodId === METHODS.trailing_three_mean && eligible.length < 3;
    const insufficientConsecutive = !!v2Periods && v2Used.length !== 3;
    const used = insufficientThree || insufficientConsecutive ? [] : f.methodId === METHODS.last_observation ? eligible.slice(-1) : v2Periods ? v2Used : eligible.slice(-3);
    const expectedIds = used.map((o) => `${o.period}:${o.contentHash}`);
    if (JSON.stringify(f.inputObservationIds) !== JSON.stringify(expectedIds)) throw new Error('Seeded forecast inputs are not eligible for its knowledge cutoff');
    const needsThree = f.methodId === METHODS.trailing_three_mean;
    const expectedEstimate = (needsThree && eligible.length < 3 || insufficientConsecutive) || !used.length ? null : used.reduce((s, o) => s + o.value, 0) / used.length;
    if (f.estimate !== expectedEstimate || f.status !== (expectedEstimate === null ? 'insufficient_history' : 'frozen')) throw new Error('Seeded forecast does not match its versioned deterministic method');
  }
  function appendObservation(input) {
    const o = validateObservation(input);
    if (observations.some((x) => x.sourceUrl === o.sourceUrl && x.vintage === o.vintage && x.period === o.period) || observations.some((x) => x.metric === o.metric && x.period === o.period && x.vintage === 'first_release')) throw new Error('Observation is immutable: a first-release observation already exists for this period');
    observations.push(o); return o;
  }
  function appendRevision(input) {
    const r = validateRevision(input);
    if (revisions.some((x) => x.period === r.period && x.publishedAt === r.publishedAt)) throw new Error('Revision is immutable for this period and publication vintage');
    revisions.push(r); return r;
  }
  function createForecast({ event, methodId, createdAt, estimate, knowledgeCutoff, rationale }) {
    if (!event || event.metric !== METRIC || event.unit !== UNIT || !periodOk(event.period) || event.eventId !== `${METRIC}:${event.period}`) throw new TypeError('Invalid macro event identity, metric, unit, or period');
    if (!Object.values(METHODS).includes(methodId)) throw new TypeError('Unknown or unversioned forecast method');
    if (estimate !== undefined && estimate !== null) throw new Error('Deterministic baseline estimates cannot be overridden');
    const created = iso(createdAt, 'createdAt'), cutoff = iso(knowledgeCutoff || created, 'knowledgeCutoff'), scheduledAt = iso(event.scheduledAt, 'scheduledAt');
    const scheduleObservedAt = iso(event.observedAt, 'event.observedAt');
    if (!officialScheduleUrl(event.sourceUrl) || !/^[a-f\d]{64}$/i.test(event.contentHash || '')) throw new TypeError('Event requires official BLS schedule URL and content hash');
    if (time(cutoff) > time(created)) throw new Error('Knowledge cutoff cannot follow forecast creation');
    if (time(scheduleObservedAt) > time(cutoff)) throw new Error('Schedule retrieval occurred after the forecast knowledge cutoff');
    if (time(created) >= time(scheduledAt)) throw new Error('Forecast must be frozen before scheduled release');
    const id = `${event.eventId}:${methodId}`;
    if (forecasts.some((x) => x.forecastId === id)) throw new Error('Forecast is immutable: method already frozen for this event');
    const eligible = observations.filter((o) => o.metric === METRIC && o.unit === UNIT && o.period < event.period && time(o.publishedAt) < time(cutoff) && time(o.observedAt) <= time(cutoff)).sort((a, b) => a.period.localeCompare(b.period));
    const consecutivePeriods = methodId === METHODS.trailing_three_months ? previousMonths(event.period, 3) : null;
    const eligibleByPeriod = new Map(eligible.map((o) => [o.period, o]));
    const consecutiveUsed = consecutivePeriods ? consecutivePeriods.map((period) => eligibleByPeriod.get(period)) : null;
    const missingPeriods = consecutiveUsed ? consecutivePeriods.filter((_, i) => !consecutiveUsed[i]) : [];
    if (methodId === METHODS.trailing_three_months && missingPeriods.length) {
      const unavailable = Object.freeze({ forecastId: id, eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, methodId, createdAt: created,
        knowledgeCutoff: cutoff, scheduledAt, scheduleSourceUrl: event.sourceUrl, scheduleContentHash: event.contentHash, scheduleObservedAt, estimate: null, inputObservationIds: Object.freeze([]),
        rationale: `Unavailable: missing eligible first-release observation(s) for ${missingPeriods.join(', ')}; consecutive three-month history is required.`, status: 'insufficient_history' });
      forecasts.push(unavailable); return unavailable;
    }
    if (methodId === METHODS.trailing_three_mean && eligible.length < 3) {
      const unavailable = Object.freeze({ forecastId: id, eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, methodId, createdAt: created,
        knowledgeCutoff: cutoff, scheduledAt, scheduleSourceUrl: event.sourceUrl, scheduleContentHash: event.contentHash, scheduleObservedAt, estimate: null, inputObservationIds: Object.freeze([]),
        rationale: 'Unavailable: trailing-three mean requires three eligible prior monthly first-release observations.', status: 'insufficient_history' });
      forecasts.push(unavailable); return unavailable;
    }
    const used = methodId === METHODS.last_observation ? eligible.slice(-1) : consecutivePeriods ? consecutiveUsed : eligible.slice(-3);
    const value = used.length ? used.reduce((s, o) => s + o.value, 0) / used.length : null;
    const result = Object.freeze({ forecastId: id, eventId: event.eventId, metric: METRIC, unit: UNIT, period: event.period, methodId, createdAt: created,
      knowledgeCutoff: cutoff, scheduledAt, scheduleSourceUrl: event.sourceUrl, scheduleContentHash: event.contentHash, scheduleObservedAt,
      estimate: value, inputObservationIds: Object.freeze(used.map((o) => `${o.period}:${o.contentHash}`)),
      rationale: rationale || (used.length ? `Deterministic ${methodId} using ${used.map((o) => o.period).join(', ')} first-release observations.` : 'Unavailable: no eligible prior first-release observations.'), status: used.length ? 'frozen' : 'insufficient_history' });
    forecasts.push(result); return result;
  }
  function resolveOutcome({ event, observation, resolvedAt = new Date().toISOString() }) {
    if (!event || event.metric !== METRIC || event.unit !== UNIT || !periodOk(event.period) || event.eventId !== `${METRIC}:${event.period}`) throw new TypeError('Invalid macro event');
    if (!observation || observation.vintage !== 'first_release') throw new Error('Outcome must use the official first-release vintage; revisions cannot replace it');
    const o = validateObservation(observation);
    if (o.period !== event.period || o.metric !== event.metric || o.unit !== event.unit) throw new Error('Outcome must match event period, metric, and unit');
    const when = iso(resolvedAt, 'resolvedAt'), scheduledAt = iso(event.scheduledAt, 'scheduledAt');
    if (time(o.publishedAt) < time(scheduledAt)) throw new Error('Release publication precedes scheduledAt; retain as schedule_mismatch outside scoring');
    if (time(when) < time(o.observedAt)) throw new Error('Cannot resolve before the source was retrieved');
    if (outcomes.some((x) => x.eventId === event.eventId)) throw new Error('Outcome is immutable for this event');
    const outcome = Object.freeze({ eventId: event.eventId, period: event.period, metric: o.metric, unit: o.unit, actual: o.value, sourceUrl: o.sourceUrl, publishedAt: o.publishedAt, observedAt: o.observedAt, resolvedAt: when, scheduledAt, contentHash: o.contentHash, vintage: 'first_release', status: time(o.publishedAt) === time(scheduledAt) ? 'resolved' : 'schedule_mismatch' });
    outcomes.push(outcome); return outcome;
  }
  function pairedRows(methodId) {
    return forecasts.filter((f) => f.methodId === methodId && f.status === 'frozen' && Number.isFinite(f.estimate)).flatMap((f) => {
      const o = outcomes.find((x) => x.eventId === f.eventId && x.status === 'resolved' && x.period === f.period && x.metric === f.metric && x.unit === f.unit);
      return o ? [{ eventId: f.eventId, period: f.period, estimate: f.estimate, actual: o.actual, error: f.estimate - o.actual }] : [];
    }).sort((a, b) => a.period.localeCompare(b.period));
  }
  function score(methodId, { minSamples = 12 } = {}) {
    if (!Object.values(METHODS).includes(methodId)) throw new TypeError('Unknown or unversioned forecast method');
    if (!Number.isInteger(minSamples) || minSamples < 1) throw new TypeError('minSamples must be a positive integer');
    const rows = pairedRows(methodId), n = rows.length;
    return { methodId, n, minimumSamples: minSamples, sufficientSample: n >= minSamples, status: n >= minSamples ? 'scored' : 'insufficient_sample', mae: n ? rows.reduce((s, r) => s + Math.abs(r.error), 0) / n : null, signedBias: n ? rows.reduce((s, r) => s + r.error, 0) / n : null, pairedEvents: rows };
  }
  function proposeCalibration({ methodId, createdAt = new Date().toISOString(), minSamples = 12, holdoutSize = 3 } = {}) {
    if (!Object.values(METHODS).includes(methodId) || !Number.isInteger(minSamples) || minSamples < 1 || !Number.isInteger(holdoutSize) || holdoutSize < 1) throw new TypeError('Calibration requires a known method and positive integer sample thresholds');
    const cutoff = iso(createdAt, 'createdAt');
    const eligible = forecasts.filter((f) => f.methodId === methodId && f.status === 'frozen' && Number.isFinite(f.estimate) && time(f.createdAt) < time(cutoff)).flatMap((f) => {
      const o = outcomes.find((x) => x.eventId === f.eventId && x.status === 'resolved' && x.period === f.period && x.metric === f.metric && x.unit === f.unit && time(x.publishedAt) < time(cutoff) && time(x.observedAt) <= time(cutoff) && time(x.resolvedAt) <= time(cutoff));
      return o ? [{ forecast: f, outcome: o }] : [];
    }).sort((a, b) => a.forecast.period.localeCompare(b.forecast.period));
    if (eligible.length < minSamples + holdoutSize) return { status: 'insufficient_sample', methodId, n: eligible.length, required: minSamples + holdoutSize, proposal: null };
    const train = eligible.slice(0, -holdoutSize), holdout = eligible.slice(-holdoutSize);
    if (train.length < minSamples) return { status: 'insufficient_chronological_holdout', methodId, n: eligible.length, required: minSamples + holdoutSize, proposal: null };
    const bias = train.reduce((s, x) => s + x.outcome.actual - x.forecast.estimate, 0) / train.length;
    const errors = (set, adjusted) => set.map((x) => Math.abs(x.forecast.estimate + (adjusted ? bias : 0) - x.outcome.actual));
    const baseline = errors(holdout, false), candidate = errors(holdout, true);
    return { status: 'proposal_only', methodId, n: eligible.length, trainingN: train.length, holdoutN: holdout.length, trainingBiasAdjustment: bias,
      holdoutBaselineMae: baseline.reduce((a, b) => a + b, 0) / baseline.length, holdoutCandidateMae: candidate.reduce((a, b) => a + b, 0) / candidate.length,
      createdAt: cutoff, proposal: { id: `calibration:${methodId}:${digest({ cutoff, bias, train: train.map((x) => x.forecast.forecastId) }).slice(0, 12)}`, adjustment: bias, activation: 'manual_review_required' } };
  }
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return { appendObservation, appendRevision, createForecast, resolveOutcome, score, proposeCalibration, snapshot: () => clone({ observations, revisions, forecasts, outcomes }) };
}
module.exports = { METRIC, UNIT, METHODS, ACTIVE_METHODS, createMacroEventLedger, validateObservation, validateRevision };
