'use strict';

// Pure, forward-in-time calibration research. This module never mutates forecasts
// or activates an adjustment; callers may present an eligible proposal for review.
const MIN_TRAINING = 12;
const MIN_HOLDOUT = 3;
const isoMs = (value) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return Date.parse(value);
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const periodOk = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const officialBls = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ['www.bls.gov', 'bls.gov'].includes(parsed.hostname)
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
};
const officialSchedule = (url) => {
  try {
    const parsed = new URL(url);
    return officialBls(url) && parsed.hostname === 'www.bls.gov' && parsed.pathname === '/schedule/news_release/empsit.htm';
  } catch { return false; }
};
const archivePublicationDate = (url) => {
  try {
    const match = new URL(url).pathname.match(/\/archives\/empsit_(\d{2})(\d{2})(\d{4})\.htm$/);
    return match && officialBls(url) ? `${match[3]}-${match[1]}-${match[2]}` : null;
  } catch { return null; }
};
const validHash = (value) => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
const validId = (value) => typeof value === 'string' && value.length > 0;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] / 2 + sorted[mid] / 2);
}
function metrics(rows, correctedBias = null) {
  const errors = rows.map(({ forecast, outcome }) => {
    const estimate = correctedBias === null ? forecast.estimate : forecast.estimate - correctedBias;
    const error = estimate - outcome.actual;
    if (!finite(estimate) || !finite(error)) return null;
    return error;
  });
  if (!errors.length || errors.some((value) => value === null)) return null;
  const n = errors.length;
  const signedBias = errors.reduce((sum, error) => sum + error, 0) / n;
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / n;
  const medianAbsoluteError = median(errors.map(Math.abs));
  if (![signedBias, mae, medianAbsoluteError].every(finite)) return null;
  return { n, mae, medianAbsoluteError, signedBias };
}

/**
 * Generate a chronological bias-correction proposal from a ledger snapshot.
 * `asOf` is the evaluation knowledge boundary; outcomes resolved after it are
 * excluded. Provenance sidecars must be corroborated by sourceVerifications.
 */
function proposeMacroCalibration({
  forecasts, outcomes, forecastProvenance, forecastProvenanceIssues = [], sourceVerifications, events = [], observationConflicts = [],
  methodId, metric, unit, asOf, minTraining = MIN_TRAINING, holdoutSize = MIN_HOLDOUT,
} = {}) {
  for (const [name, value] of Object.entries({ forecasts, outcomes, forecastProvenance, forecastProvenanceIssues, sourceVerifications, events, observationConflicts })) {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  }
  if (!validId(methodId) || !validId(metric) || !validId(unit)) throw new TypeError('methodId, metric, and unit are required strings');
  const asOfMs = isoMs(asOf);
  if (asOfMs === null) throw new TypeError('asOf must be a valid ISO timestamp');
  if (!Number.isInteger(minTraining) || minTraining < MIN_TRAINING || !Number.isInteger(holdoutSize) || holdoutSize < MIN_HOLDOUT) {
    throw new TypeError(`Calibration requires at least ${MIN_TRAINING} training and ${MIN_HOLDOUT} holdout events`);
  }

  const excluded = [];
  const exclude = (forecast, reason, detail) => excluded.push({
    forecastId: forecast?.forecastId || null, eventId: forecast?.eventId || null,
    period: forecast?.period || null, reason, ...(detail ? { detail } : {}),
  });
  const provenanceByForecast = new Map();
  for (const record of forecastProvenance) {
    if (record && validId(record.forecastId)) {
      const list = provenanceByForecast.get(record.forecastId) || [];
      list.push(record); provenanceByForecast.set(record.forecastId, list);
    }
  }
  const issuesByForecast = new Map();
  for (const issue of forecastProvenanceIssues) {
    if (issue && validId(issue.forecastId)) {
      const list = issuesByForecast.get(issue.forecastId) || [];
      list.push(issue); issuesByForecast.set(issue.forecastId, list);
    }
  }
  const verificationsById = new Map();
  for (const verification of sourceVerifications) {
    if (verification && validId(verification.id)) {
      const list = verificationsById.get(verification.id) || [];
      list.push(verification); verificationsById.set(verification.id, list);
    }
  }
  const conflictedPeriods = new Set(observationConflicts.filter((item) => item && item.numericConflict === true).map((item) => item.period));
  const eventsById = new Map();
  for (const event of events) {
    if (event && validId(event.eventId)) {
      const list = eventsById.get(event.eventId) || [];
      list.push(event); eventsById.set(event.eventId, list);
    }
  }

  const matchingForecasts = forecasts.filter((forecast) => forecast?.methodId === methodId
    && forecast.metric === metric && forecast.unit === unit);
  const forecastIds = new Set();
  const forecastByEvent = new Map();
  const seenEvents = new Set();
  const candidates = [];
  for (const forecast of matchingForecasts) {
    if (!forecast || !validId(forecast.forecastId) || !validId(forecast.eventId) || !periodOk(forecast.period)) {
      exclude(forecast, 'invalid_forecast_identity'); continue;
    }
    if (forecastIds.has(forecast.forecastId)) { exclude(forecast, 'duplicate_forecast_id'); continue; }
    forecastIds.add(forecast.forecastId);
    if (seenEvents.has(forecast.eventId)) { exclude(forecast, 'duplicate_event_forecast'); continue; }
    seenEvents.add(forecast.eventId);
    if (forecast.eventId !== `${metric}:${forecast.period}`) { exclude(forecast, 'period_event_mismatch'); continue; }
    if (forecast.status !== 'frozen' || !finite(forecast.estimate)) { exclude(forecast, 'unscorable_forecast'); continue; }
    if (issuesByForecast.has(forecast.forecastId) || forecast.chronologyStatus === 'unverified'
      || (Array.isArray(forecast.provenanceIssues) && forecast.provenanceIssues.length)) {
      exclude(forecast, 'provenance_issue'); continue;
    }
    const createdAt = isoMs(forecast.createdAt), cutoff = isoMs(forecast.knowledgeCutoff), scheduled = isoMs(forecast.scheduledAt);
    if (createdAt === null || cutoff === null || scheduled === null || cutoff > createdAt || createdAt >= scheduled || createdAt > asOfMs) {
      exclude(forecast, 'forecast_chronology_invalid'); continue;
    }
    const scheduleObservedAt = isoMs(forecast.scheduleObservedAt);
    if (!officialSchedule(forecast.scheduleSourceUrl) || !validHash(forecast.scheduleContentHash)
      || scheduleObservedAt === null || scheduleObservedAt > cutoff) {
      exclude(forecast, 'schedule_provenance_invalid'); continue;
    }
    const matchingEvents = eventsById.get(forecast.eventId) || [];
    if (matchingEvents.length > 1 || matchingEvents.some((event) => event.scheduleConflict
      || event.scheduledAt !== forecast.scheduledAt || event.sourceUrl !== forecast.scheduleSourceUrl)) {
      exclude(forecast, 'schedule_conflict'); continue;
    }
    if (!Array.isArray(forecast.inputObservationIds) || !forecast.inputObservationIds.length) {
      exclude(forecast, 'provenance_missing'); continue;
    }
    const parsedInputs = forecast.inputObservationIds.map((value) => typeof value === 'string' ? value.split(':') : []);
    if (parsedInputs.some(([inputPeriod, inputHash]) => !periodOk(inputPeriod) || inputPeriod >= forecast.period || !validHash(inputHash))) {
      exclude(forecast, 'invalid_input_period_or_id'); continue;
    }
    if (new Set(forecast.inputObservationIds).size !== forecast.inputObservationIds.length) {
      exclude(forecast, 'duplicate_input_id'); continue;
    }
    if (parsedInputs.some(([inputPeriod]) => conflictedPeriods.has(inputPeriod))) {
      exclude(forecast, 'contested_input'); continue;
    }
    const pRecords = provenanceByForecast.get(forecast.forecastId) || [];
    const provenance = pRecords.length === 1 ? pRecords[0] : null;
    if (!provenance || provenance.status !== 'verified' || !Array.isArray(provenance.inputVerificationIds)
      || !Array.isArray(provenance.inputObservationIds)
      || provenance.expectedInputCount !== forecast.inputObservationIds.length
      || provenance.verifiedInputCount !== forecast.inputObservationIds.length
      || JSON.stringify(provenance.inputObservationIds) !== JSON.stringify(forecast.inputObservationIds)
      || provenance.inputVerificationIds.length !== forecast.inputObservationIds.length
      || provenance.createdAt !== forecast.createdAt || provenance.knowledgeCutoff !== forecast.knowledgeCutoff) {
      exclude(forecast, pRecords.length > 1 ? 'provenance_conflict' : 'provenance_unverified'); continue;
    }
    if (new Set(provenance.inputVerificationIds).size !== provenance.inputVerificationIds.length) {
      exclude(forecast, 'duplicate_verification_id'); continue;
    }
    let provenanceOkay = true;
    const usedInputIds = new Set();
    const usedVerificationIds = new Set();
    for (let i = 0; i < provenance.inputVerificationIds.length; i += 1) {
      const matches = verificationsById.get(provenance.inputVerificationIds[i]) || [];
      const verification = matches.length === 1 ? matches[0] : null;
      const [inputPeriod, inputHash] = forecast.inputObservationIds[i].split(':');
      const observedAt = verification && isoMs(verification.observedAt);
      const publishedAt = verification && isoMs(verification.publishedAt);
      if (usedInputIds.has(forecast.inputObservationIds[i]) || usedVerificationIds.has(provenance.inputVerificationIds[i])
        || !periodOk(inputPeriod) || inputPeriod >= forecast.period || conflictedPeriods.has(inputPeriod)
        || !verification || verification.verificationVersion !== 'post-fetch-v2' || matches.length !== 1
        || verification.period !== inputPeriod || verification.contentHash !== inputHash || !validHash(inputHash)
        || verification.metric !== metric || verification.unit !== unit || !finite(verification.value)
        || !officialBls(verification.sourceUrl) || archivePublicationDate(verification.sourceUrl) !== (typeof verification.publishedAt === 'string' ? verification.publishedAt.slice(0, 10) : null)
        || !validHash(verification.contentHash) || observedAt === null || publishedAt === null
        || observedAt < publishedAt || observedAt > cutoff || publishedAt > cutoff || observedAt > asOfMs) {
        provenanceOkay = false; break;
      }
      usedInputIds.add(forecast.inputObservationIds[i]);
      usedVerificationIds.add(provenance.inputVerificationIds[i]);
    }
    if (!provenanceOkay) { exclude(forecast, 'provenance_chronology_or_source_invalid'); continue; }
    forecastByEvent.set(forecast.eventId, { forecast, createdAt, cutoff, scheduled });
  }

  const outcomesByEvent = new Map();
  for (const outcome of outcomes) {
    if (!outcome || typeof outcome.eventId !== 'string') continue;
    const list = outcomesByEvent.get(outcome.eventId) || [];
    list.push(outcome); outcomesByEvent.set(outcome.eventId, list);
  }
  const rows = [];
  let provenanceEligibleOutcomes = 0;
  for (const [eventId, pair] of forecastByEvent) {
    const { forecast, createdAt, cutoff, scheduled } = pair;
    const eventOutcomes = outcomesByEvent.get(eventId) || [];
    if (!eventOutcomes.length) { exclude(forecast, 'outcome_not_matured'); continue; }
    if (eventOutcomes.length !== 1) {
      const same = eventOutcomes.every((item) => item.period === eventOutcomes[0].period && item.actual === eventOutcomes[0].actual
        && item.contentHash === eventOutcomes[0].contentHash && item.vintage === eventOutcomes[0].vintage);
      exclude(forecast, same ? 'duplicate_outcome' : 'conflicting_outcomes'); continue;
    }
    const outcome = eventOutcomes[0];
    if (outcome.vintage !== 'first_release') { exclude(forecast, 'wrong_vintage'); continue; }
    if (outcome.status !== 'resolved' || outcome.metric !== metric || outcome.unit !== unit || outcome.period !== forecast.period
      || outcome.eventId !== `${metric}:${outcome.period}` || !finite(outcome.actual)) {
      exclude(forecast, 'outcome_identity_or_status_invalid'); continue;
    }
    if (!officialBls(outcome.sourceUrl) || !validHash(outcome.contentHash)
      || archivePublicationDate(outcome.sourceUrl) !== (typeof outcome.publishedAt === 'string' ? outcome.publishedAt.slice(0, 10) : null)) {
      exclude(forecast, 'outcome_source_invalid'); continue;
    }
    const publishedAt = isoMs(outcome.publishedAt), observedAt = isoMs(outcome.observedAt), resolvedAt = isoMs(outcome.resolvedAt);
    const outcomeScheduled = isoMs(outcome.scheduledAt);
    if (publishedAt === null || observedAt === null || resolvedAt === null || outcomeScheduled === null
      || publishedAt < outcomeScheduled || outcomeScheduled !== scheduled || publishedAt !== scheduled || observedAt < publishedAt || resolvedAt < observedAt) {
      exclude(forecast, 'outcome_chronology_invalid'); continue;
    }
    if (createdAt >= publishedAt || cutoff >= publishedAt) { exclude(forecast, 'information_leakage'); continue; }
    if (resolvedAt > asOfMs || observedAt > asOfMs) { exclude(forecast, 'outcome_not_matured_at_cutoff'); continue; }
    provenanceEligibleOutcomes += 1;
    const error = forecast.estimate - outcome.actual;
    if (!finite(error)) { exclude(forecast, 'numeric_overflow'); continue; }
    rows.push({ forecast, outcome, error });
  }

  rows.sort((a, b) => a.forecast.period.localeCompare(b.forecast.period)
    || a.forecast.eventId.localeCompare(b.forecast.eventId));
  // One period is one evaluation point. Repeated records for a period are not
  // silently treated as independent monthly holdout evidence.
  const uniqueRows = [];
  const periodCounts = new Map();
  for (const row of rows) periodCounts.set(row.forecast.period, (periodCounts.get(row.forecast.period) || 0) + 1);
  for (const row of rows) {
    if (periodCounts.get(row.forecast.period) > 1) exclude(row.forecast, 'duplicate_period');
    else uniqueRows.push(row);
  }

  const required = minTraining + holdoutSize;
  const base = { methodId, metric, unit, asOf: new Date(asOfMs).toISOString(), minimumTraining: minTraining,
    holdoutSize, eligibleN: uniqueRows.length, provenanceEligibleN: provenanceEligibleOutcomes,
    excludedN: excluded.length, exclusions: excluded, sourceIds: uniqueRows.flatMap((row) => [
      ...row.forecast.inputObservationIds, ...((provenanceByForecast.get(row.forecast.forecastId) || [])[0]?.inputVerificationIds || []), row.outcome.contentHash,
    ]), training: null, holdout: null, trainingBias: null, rawHoldout: null, correctedHoldout: null, proposal: null };
  if (uniqueRows.length < required) {
    const provenanceShortfall = excluded.some((item) => ['provenance_missing', 'provenance_unverified', 'provenance_conflict',
      'provenance_issue', 'provenance_chronology_or_source_invalid'].includes(item.reason));
    return { ...base, status: provenanceShortfall ? 'insufficient_provenance' : 'insufficient_sample', requiredN: required };
  }
  const training = uniqueRows.slice(0, -holdoutSize);
  const holdout = uniqueRows.slice(-holdoutSize);
  if (training.length < minTraining || new Set(holdout.map((row) => row.forecast.period)).size < MIN_HOLDOUT) {
    return { ...base, status: 'insufficient_sample', requiredN: required };
  }
  const holdoutStart = Math.min(isoMs(holdout[0].forecast.createdAt), isoMs(holdout[0].forecast.knowledgeCutoff));
  const lateTraining = training.filter((row) => [row.outcome.publishedAt, row.outcome.observedAt, row.outcome.resolvedAt]
    .some((timestamp) => isoMs(timestamp) === null || isoMs(timestamp) >= holdoutStart));
  if (lateTraining.length) {
    const chronologyExclusions = lateTraining.map((row) => ({ forecastId: row.forecast.forecastId,
      eventId: row.forecast.eventId, period: row.forecast.period, reason: 'training_outcome_after_holdout_cutoff' }));
    return { ...base, status: 'insufficient_chronological_holdout', requiredN: required,
      holdoutStart: new Date(holdoutStart).toISOString(), exclusions: [...excluded, ...chronologyExclusions],
      excludedN: excluded.length + chronologyExclusions.length, training: { n: training.length },
      holdout: { n: holdout.length, firstPeriod: holdout[0].forecast.period, lastPeriod: holdout[holdout.length - 1].forecast.period },
      reason: 'Every training release must be published, retrieved, and resolved before the first holdout forecast cutoff.' };
  }
  const trainingErrors = training.map((row) => row.error);
  const trainingBias = trainingErrors.reduce((sum, error) => sum + error, 0) / trainingErrors.length;
  if (!finite(trainingBias)) return { ...base, status: 'insufficient_sample', reason: 'numeric_overflow', requiredN: required };
  const rawHoldout = metrics(holdout);
  const correctedHoldout = metrics(holdout, trainingBias);
  if (!rawHoldout || !correctedHoldout) return { ...base, status: 'insufficient_sample', reason: 'numeric_overflow', requiredN: required };
  const improved = correctedHoldout.mae < rawHoldout.mae
    && correctedHoldout.medianAbsoluteError <= rawHoldout.medianAbsoluteError
    && Math.abs(correctedHoldout.signedBias) <= Math.abs(rawHoldout.signedBias);
  const describe = (row) => ({ eventId: row.forecast.eventId, period: row.forecast.period,
    forecastId: row.forecast.forecastId, outcomeHash: row.outcome.contentHash,
    inputObservationIds: row.forecast.inputObservationIds.slice(),
    inputVerificationIds: (provenanceByForecast.get(row.forecast.forecastId) || [])[0]?.inputVerificationIds?.slice() || [] });
  return { ...base, status: improved ? 'proposal_only' : 'not_improved', requiredN: required,
    training: { n: training.length, firstPeriod: training[0].forecast.period, lastPeriod: training[training.length - 1].forecast.period,
      events: training.map(describe), forecastIds: training.map((row) => row.forecast.forecastId) },
    holdout: { n: holdout.length, firstPeriod: holdout[0].forecast.period, lastPeriod: holdout[holdout.length - 1].forecast.period,
      events: holdout.map(describe), forecastIds: holdout.map((row) => row.forecast.forecastId) },
    trainingBias, correction: -trainingBias, correctionRule: 'correctedEstimate = rawEstimate - trainingBias; trainingBias = mean(forecast - actual)',
    rawHoldout, correctedHoldout, improvementRule: 'Apply-ready for human review only when holdout MAE improves and median absolute error and absolute signed bias do not worsen.',
    proposal: improved ? { methodId, adjustment: -trainingBias, activation: 'manual_review_required', trainingForecastIds: training.map((row) => row.forecast.forecastId), holdoutForecastIds: holdout.map((row) => row.forecast.forecastId) } : null };
}

module.exports = { MIN_TRAINING, MIN_HOLDOUT, proposeMacroCalibration };
