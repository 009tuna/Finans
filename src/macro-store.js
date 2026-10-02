'use strict';
const { createHash } = require('node:crypto');
const { readStore, updateStore } = require('./intelligence-store');
const { createMacroEventLedger, METHODS, ACTIVE_METHODS, METRIC, UNIT, validateObservation } = require('./macro-events');
const { proposeMacroCalibration } = require('./macro-calibration');
const { forecastReviews } = require('./research-ledger');
const { createBlsMacroSource, fetchText } = require('./macro-sources');
const { getConsensusPayload } = require('./macro-consensus');
const { getCpiPayload } = require('./cpi-store');
const KEY = 'macro_event_ledger_v1';
const initial = { schemaVersion: 1, events: [], observations: [], revisions: [], revisionConflicts: [], methodAbstentions: [], sourceVerifications: [], forecastProvenance: [], forecastProvenanceIssues: [], forecasts: [], outcomes: [], sourceStatus: { status: 'not_initialized' }, updatedAt: null };
const verificationId = (item) => createHash('sha256').update(JSON.stringify([item.period, item.contentHash, item.value, item.sourceUrl, item.publishedAt, item.observedAt, 'post-fetch-v2'])).digest('hex');
const clock = (value) => { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('Invalid macro clock'); return date.toISOString(); };
function previousPeriods(period, count) {
  const [year, month] = period.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(year, month - 2 - i, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }).reverse();
}
function abstentionFor(event, methodId, observations, { createdAt, knowledgeCutoff, disputedPeriods = new Set() }) {
  const cutoffMs = Date.parse(knowledgeCutoff);
  const eligible = observations.filter((item) => item.period < event.period && Date.parse(item.publishedAt) < cutoffMs
    && Date.parse(item.observedAt) <= cutoffMs && cutoffMs - Date.parse(item.publishedAt) < 130 * 86400000).sort((a, b) => a.period.localeCompare(b.period));
  let requiredPeriods = [];
  let available = [];
  let missingPeriods = [];
  let disputedInputs = [];
  let disputedInputIds = [];
  if (methodId === METHODS.trailing_three_months) {
    requiredPeriods = previousPeriods(event.period, 3);
    const byPeriod = new Map(eligible.map((item) => [item.period, item]));
    disputedInputs = requiredPeriods.filter((period) => byPeriod.has(period) && disputedPeriods.has(period));
    disputedInputIds = disputedInputs.map((period) => { const item = byPeriod.get(period); return `${period}:${item.contentHash}:${item.value}`; });
    available = requiredPeriods.map((period) => byPeriod.get(period)).filter((item) => item && !disputedPeriods.has(item.period));
    missingPeriods = requiredPeriods.filter((period) => !byPeriod.has(period));
  } else if (methodId === METHODS.last_observation) {
    const latest = eligible.slice(-1)[0];
    if (latest && disputedPeriods.has(latest.period)) { disputedInputs = [latest.period]; disputedInputIds = [`${latest.period}:${latest.contentHash}:${latest.value}`]; }
    else if (latest) available = [latest];
    if (!latest) missingPeriods = [previousPeriods(event.period, 1)[0]];
  } else {
    available = eligible.slice(-3);
    missingPeriods = available.length < 3 ? [`${3 - available.length} eligible prior observation(s)`] : [];
  }
  const inputObservationIds = available.map((item) => `${item.period}:${item.contentHash}`);
  const fingerprintData = { eventId: event.eventId, methodId, scheduledAt: event.scheduledAt, scheduleContentHash: event.contentHash, missingPeriods, disputedInputs, disputedInputIds, inputObservationIds };
  const inputFingerprint = createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');
  const id = `${event.eventId}:${methodId}:abstention:${inputFingerprint.slice(0, 16)}`;
  return { id, eventId: event.eventId, metric: event.metric, unit: event.unit, period: event.period, methodId,
    createdAt, knowledgeCutoff, scheduledAt: event.scheduledAt, scheduleSourceUrl: event.sourceUrl, scheduleContentHash: event.contentHash,
    scheduleObservedAt: event.observedAt, estimate: null, status: disputedInputs.length ? 'disputed_input' : 'insufficient_history', inputObservationIds, inputFingerprint, missingPeriods, disputedInputs, disputedInputIds,
    rationale: disputedInputs.length ? `Manual review required: disputed first-release input(s) ${disputedInputs.join(', ')} at ${knowledgeCutoff}.`
      : missingPeriods.length ? `Unavailable at ${knowledgeCutoff}: missing ${missingPeriods.join(', ')}.` : `Unavailable at ${knowledgeCutoff}: no eligible inputs.` };
}
async function refreshMacro({ database, source, now: suppliedNow, forecastProvenanceIssues: reportedProvenanceIssues = [] } = {}) {
  let now = clock(suppliedNow || new Date().toISOString());
  const defaultSource = !source;
  const currentClock = () => suppliedNow ? now : new Date().toISOString();
  source ||= createBlsMacroSource({ fetchText, now: currentClock });
  let schedule = []; const observations = []; const failures = [];
  try {
    schedule = await source.getSchedule();
    if (!schedule.length) throw new Error('No parsed schedule');
  } catch (error) { failures.push({ scope: 'schedule', errorCode: /HTTP (\d+)/.test(error.message) ? 'http_' + error.message.match(/HTTP (\d+)/)[1] : 'source_unavailable' }); }
  // Fetch only a bounded recent history; archive backfills are inputs, never past predictions.
  const recent = schedule.filter((event) => Date.parse(event.scheduledAt) <= Date.parse(now)).sort((a, b) => a.period.localeCompare(b.period)).slice(-4);
  for (const event of recent) {
    try {
      const result = await source.getFirstRelease(event, defaultSource && !suppliedNow ? undefined : now);
      if (!result.available) { failures.push({ scope: event.eventId, errorCode: result.reason || 'unsupported_release' }); continue; }
      observations.push(result);
    } catch (error) { failures.push({ scope: event.eventId, errorCode: /HTTP (\d+)/.test(error.message) ? 'http_' + error.message.match(/HTTP (\d+)/)[1] : 'source_unavailable' }); }
  }
  // In live runs, observation retrieval and forecast creation occur after network
  // completion. Explicit fixture clocks remain deterministic for replay tests.
  now = clock(currentClock());
  const value = await updateStore(KEY, initial, (current) => {
    if (current.updatedAt && Date.parse(current.updatedAt) > Date.parse(now)) return current;
    const events = new Map(current.events.map((event) => [event.eventId, event]));
    const mismatches = [];
    for (const event of schedule) {
      const existing = events.get(event.eventId);
      const locked = current.forecasts.some((forecast) => forecast.eventId === event.eventId);
      if (existing && locked && existing.scheduledAt !== event.scheduledAt) {
        events.set(event.eventId, { ...existing, scheduleConflict: { observedScheduledAt: event.scheduledAt, detectedAt: now } });
        mismatches.push({ scope: event.eventId, errorCode: 'schedule_changed_after_forecast' });
      } else events.set(event.eventId, { ...existing, ...event });
    }
    const methodAbstentions = current.methodAbstentions ? current.methodAbstentions.slice() : [];
    const sourceVerifications = current.sourceVerifications ? current.sourceVerifications.slice() : [];
    const forecastProvenance = current.forecastProvenance ? current.forecastProvenance.slice() : [];
    const forecastProvenanceIssues = current.forecastProvenanceIssues ? current.forecastProvenanceIssues.slice() : [];
    // Older store versions placed null insufficient-history attempts in forecasts.
    // Migrate them to evidence records so they no longer lock a later numeric freeze.
    const legacyAbstentions = current.forecasts.filter((item) => item.status === 'insufficient_history' && item.estimate === null);
    for (const old of legacyAbstentions) {
      const oldEvent = events.get(old.eventId) || { eventId: old.eventId, metric: old.metric, unit: old.unit, period: old.period,
        scheduledAt: old.scheduledAt, sourceUrl: old.scheduleSourceUrl, contentHash: old.scheduleContentHash, observedAt: old.scheduleObservedAt };
      const candidate = abstentionFor(oldEvent, old.methodId, current.observations, { createdAt: old.createdAt, knowledgeCutoff: old.knowledgeCutoff,
        disputedPeriods: new Set((current.observationConflicts || []).filter((item) => item.numericConflict || current.observations.some((observation) => observation.period === item.period && observation.value !== item.value)).map((item) => item.period)) });
      if (!methodAbstentions.some((item) => item.id === candidate.id)) methodAbstentions.push({ ...candidate, migratedForecastId: old.forecastId });
    }
    const ledgerSeed = { ...current, forecasts: current.forecasts.filter((item) => !(item.status === 'insufficient_history' && item.estimate === null)) };
    const ledger = createMacroEventLedger(ledgerSeed);
    const versions = current.observationConflicts ? current.observationConflicts.slice() : [];
    const revisionConflicts = current.revisionConflicts ? current.revisionConflicts.slice() : [];
    for (const observation of observations) {
      validateObservation(observation);
      const verification = { id: verificationId(observation), period: observation.period, metric: observation.metric, unit: observation.unit,
        value: observation.value, sourceUrl: observation.sourceUrl, publishedAt: observation.publishedAt, observedAt: observation.observedAt,
        contentHash: observation.contentHash, verificationVersion: 'post-fetch-v2' };
      if (!sourceVerifications.some((item) => item.id === verification.id)) sourceVerifications.push(verification);
      const existing = current.observations.find((item) => item.period === observation.period && item.vintage === 'first_release');
      if (!existing) ledger.appendObservation(observation);
      else if (existing.value !== observation.value || existing.contentHash !== observation.contentHash) {
        // Hash-only edits do not alter the first release. Preserve evidence of changed source.
        const numericConflict = existing.value !== observation.value;
        if (!versions.some((item) => item.period === observation.period && item.contentHash === observation.contentHash && item.value === observation.value)) {
          versions.push({ ...observation, conflictWith: existing.contentHash, detectedAt: now, numericConflict });
        }
        if (existing.value !== observation.value) mismatches.push({ scope: observation.period, errorCode: 'first_release_changed' });
      }
      for (const revision of observation.revisions || []) {
        const existingRevision = ledger.snapshot().revisions.find((item) => item.period === revision.period && item.publishedAt === revision.publishedAt);
        if (!existingRevision) ledger.appendRevision(revision);
        else {
          const changedNumbers = existingRevision.value !== revision.value || existingRevision.previousValue !== revision.previousValue || existingRevision.revisionChange !== revision.revisionChange;
          const changedHash = existingRevision.contentHash !== revision.contentHash;
          if ((changedHash || changedNumbers) && !revisionConflicts.some((item) => item.period === revision.period && item.publishedAt === revision.publishedAt
            && item.contentHash === revision.contentHash && item.value === revision.value && item.previousValue === revision.previousValue && item.revisionChange === revision.revisionChange)) {
            revisionConflicts.push({ ...revision, conflictWith: existingRevision.contentHash, detectedAt: now, numericConflict: changedNumbers });
          }
          if (changedNumbers) mismatches.push({ scope: revision.period, errorCode: 'revision_value_changed' });
        }
      }
    }
    const disputedPeriods = new Set(versions.filter((item) => item.numericConflict || current.observations.some((observation) => observation.period === item.period && observation.value !== item.value)).map((item) => item.period));
    for (const period of disputedPeriods) {
      if (!mismatches.some((item) => item.scope === period && item.errorCode === 'first_release_conflict_unresolved')) mismatches.push({ scope: period, errorCode: 'first_release_conflict_unresolved' });
    }
    const next = [...events.values()].filter((event) => Date.parse(event.scheduledAt) > Date.parse(now) && !event.scheduleConflict).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
    // Never freeze a numeric method without eligible source inputs or a fresh verified schedule.
    if (next && schedule.length) {
      const availableObservations = ledger.snapshot().observations;
      for (const methodId of ACTIVE_METHODS) {
        if (current.forecasts.some((item) => item.eventId === next.eventId && item.methodId === methodId && item.status !== 'insufficient_history' && Number.isFinite(item.estimate))) continue;
        const attempt = abstentionFor(next, methodId, availableObservations, { createdAt: now, knowledgeCutoff: now, disputedPeriods });
        if (attempt.missingPeriods.length || attempt.disputedInputs.length) {
          if (!methodAbstentions.some((item) => item.eventId === attempt.eventId && item.methodId === attempt.methodId && item.inputFingerprint === attempt.inputFingerprint)) methodAbstentions.push(attempt);
          continue;
        }
        const forecast = ledger.createForecast({ event: next, methodId, createdAt: now, knowledgeCutoff: now });
        if (forecast.status === 'frozen' && Number.isFinite(forecast.estimate)) {
          const cutoff = Date.parse(forecast.knowledgeCutoff);
          const verifiedInputs = forecast.inputObservationIds.map((inputId) => {
            const split = inputId.indexOf(':');
            const period = inputId.slice(0, split), contentHash = inputId.slice(split + 1);
            const canonical = ledger.snapshot().observations.find((item) => item.period === period && item.contentHash === contentHash);
            const candidates = sourceVerifications.filter((item) => item.period === period && item.contentHash === contentHash && canonical
              && item.value === canonical.value && item.sourceUrl === canonical.sourceUrl && item.publishedAt === canonical.publishedAt && Date.parse(item.observedAt) <= cutoff);
            return candidates.length ? candidates[candidates.length - 1].id : null;
          });
          const provenance = { forecastId: forecast.forecastId, createdAt: forecast.createdAt, knowledgeCutoff: forecast.knowledgeCutoff,
            inputObservationIds: forecast.inputObservationIds.slice(), inputVerificationIds: verifiedInputs.filter(Boolean),
            verifiedInputCount: verifiedInputs.filter(Boolean).length, expectedInputCount: verifiedInputs.length,
            status: verifiedInputs.every(Boolean) ? 'verified' : 'not_attested' };
          if (!forecastProvenance.some((item) => item.forecastId === provenance.forecastId)) forecastProvenance.push(provenance);
        }
      }
    }
    for (const issue of reportedProvenanceIssues) {
      if (!issue || typeof issue.forecastId !== 'string' || !issue.forecastId || typeof issue.reason !== 'string' || !issue.reason.trim()) throw new TypeError('Forecast provenance issue requires forecastId and reason');
      const detectedAt = clock(issue.detectedAt);
      const forecast = [...current.forecasts, ...ledger.snapshot().forecasts].find((item) => item.forecastId === issue.forecastId);
      if (!forecast) throw new Error(`Provenance issue references unknown forecast: ${issue.forecastId}`);
      if (Date.parse(detectedAt) < Date.parse(forecast.createdAt)) throw new Error('Provenance issue detectedAt cannot precede forecast creation');
      if (Date.parse(detectedAt) > Date.parse(now)) throw new Error('Provenance issue detectedAt cannot follow current refresh time');
      if (!forecastProvenanceIssues.some((item) => item.forecastId === issue.forecastId && item.reason === issue.reason.trim() && item.detectedAt === detectedAt)) {
        forecastProvenanceIssues.push({ forecastId: issue.forecastId, reason: issue.reason.trim(), detectedAt });
      }
    }
    for (const event of events.values()) {
      if (event.scheduleConflict || current.outcomes.some((outcome) => outcome.eventId === event.eventId)) continue;
      const observation = ledger.snapshot().observations.find((item) => item.period === event.period);
      if (!observation || !current.forecasts.some((item) => item.eventId === event.eventId) || Date.parse(event.scheduledAt) > Date.parse(now)) continue;
      if (versions.some((item) => item.period === event.period && item.value !== observation.value)) continue;
      ledger.resolveOutcome({ event, observation, resolvedAt: now });
    }
    for (const item of forecastProvenanceIssues) {
      if (!mismatches.some((failure) => failure.scope === item.forecastId && failure.errorCode === 'forecast_provenance_review_required')) mismatches.push({ scope: item.forecastId, errorCode: 'forecast_provenance_review_required' });
    }
    const issues = failures.concat(mismatches);
    return { ...current, ...ledger.snapshot(), events: [...events.values()], observationConflicts: versions, revisionConflicts, methodAbstentions, sourceVerifications, forecastProvenance, forecastProvenanceIssues, updatedAt: now,
      sourceStatus: { status: !schedule.length ? 'unavailable' : issues.length ? 'partial' : 'available', auditRequired: disputedPeriods.size > 0 || forecastProvenanceIssues.length > 0, checkedAt: now,
        lastSuccessfulAt: schedule.length ? now : current.sourceStatus.lastSuccessfulAt || null, failures: issues } };
  }, database);
  return { status: value.sourceStatus.status, events: value.events.length, observations: value.observations.length, forecasts: value.forecasts.length, outcomes: value.outcomes.length, failures: value.sourceStatus.failures };
}
function macroPayload(value, researchLedger = {}, now = new Date().toISOString(), consensusProjection = null) {
  const issuesByForecast = new Map();
  (value.forecastProvenanceIssues || []).forEach((issue) => {
    if (!issuesByForecast.has(issue.forecastId)) issuesByForecast.set(issue.forecastId, []);
    issuesByForecast.get(issue.forecastId).push(issue);
  });
  const provenanceByForecast = new Map((value.forecastProvenance || []).map((item) => [item.forecastId, item]));
  const provenanceExclusions = (value.forecasts || []).filter((forecast) => {
    const eligibleForScore = forecast.status === 'frozen' && Number.isFinite(forecast.estimate);
    const provenance = provenanceByForecast.get(forecast.forecastId);
    return issuesByForecast.has(forecast.forecastId) || (eligibleForScore && provenance?.status !== 'verified');
  }).map((forecast) => {
    const provenance = provenanceByForecast.get(forecast.forecastId);
    const reasons = issuesByForecast.has(forecast.forecastId)
      ? issuesByForecast.get(forecast.forecastId).map((issue) => issue.reason) : [];
    if (!provenance) reasons.push('provenance_missing');
    else if (provenance.status !== 'verified') reasons.push('provenance_not_attested');
    return { forecastId: forecast.forecastId, eventId: forecast.eventId, methodId: forecast.methodId,
      reasons: [...new Set(reasons)], forecast: { ...forecast } };
  });
  const excludedIds = new Set(provenanceExclusions.map((item) => item.forecastId));
  const scoreLedger = createMacroEventLedger({ ...value, forecasts: (value.forecasts || []).filter((forecast) => !excludedIds.has(forecast.forecastId)) });
  const forecasts = (value.forecasts || []).map((forecast) => {
    const provenanceIssues = issuesByForecast.get(forecast.forecastId) || [];
    const provenance = provenanceByForecast.get(forecast.forecastId);
    return { ...forecast, provenanceIssues: provenanceIssues.map((item) => ({ ...item })),
      inputVerificationIds: provenance ? provenance.inputVerificationIds.slice() : [],
      chronologyStatus: provenanceIssues.length ? 'unverified' : provenance?.status === 'verified' ? 'verified' : 'not_attested' };
  });
  const all = researchLedger.forecasts || [];
  const modelForecasts = all.filter((forecast) => forecast.metric === 'us_nonfarm_payroll_change' && forecast.unit === 'thousand_jobs')
    .map((forecast) => {
      const run = (researchLedger.runs || []).find((candidate) => candidate.runId === forecast.runId);
      let knowledgeCutoff = forecast.knowledgeCutoff || null;
      let knowledgeCutoffBasis = knowledgeCutoff ? 'recorded_forecast' : 'unknown';
      if (!knowledgeCutoff && run?.research?.analysisAsOf) {
        knowledgeCutoff = run.research.analysisAsOf;
        knowledgeCutoffBasis = 'research_analysis_as_of';
      } else if (!knowledgeCutoff && run?.research?.generatedAt) {
        knowledgeCutoff = run.research.generatedAt;
        knowledgeCutoffBasis = 'research_generated_at';
      }
      return { ...forecast, ...(knowledgeCutoff ? { knowledgeCutoff } : {}), knowledgeCutoffBasis,
        researchEventId: forecast.eventId, eventId: forecast.metric + ':' + forecast.period };
    });
  const events = new Map(value.events.map((event) => [event.eventId, event]));
  for (const forecast of modelForecasts) {
    if (events.has(forecast.eventId) || forecast.resolution?.provider !== 'bls-first-release') continue;
    // A cited model schedule is useful context, but is explicitly distinct from an
    // automatically collected official schedule. It never creates system forecasts.
    events.set(forecast.eventId, { eventId: forecast.eventId, metric: forecast.metric, unit: forecast.unit, period: forecast.period,
      scheduledAt: forecast.scheduledAt, sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm',
      scheduleVerification: 'model-cited-web-research', observedAt: forecast.recordedAt });
  }
  const modelForecastReviews = forecastReviews(researchLedger).filter((review) => review.metric === METRIC && review.unit === UNIT)
    .map((review) => ({ ...review, researchEventId: review.eventId, eventId: `${METRIC}:${review.period}` }));
  const nextEvent = [...events.values()].filter((event) => Date.parse(event.scheduledAt) > Date.parse(now)).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0] || null;
  const consensusEvent = (value.events || []).filter((event) => event.sourceUrl === 'https://www.bls.gov/schedule/news_release/empsit.htm'
    && /^[a-f\d]{64}$/i.test(event.contentHash || '') && !event.scheduleConflict
    && Number.isFinite(Date.parse(event.scheduledAt)) && Date.parse(event.scheduledAt) > Date.parse(now))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0] || null;
  const ids = new Set(modelForecasts.map((forecast) => forecast.id));
  return { ...value, forecasts, methodAbstentions: value.methodAbstentions || [], events: [...events.values()], status: value.sourceStatus.status, nextEvent, consensusEvent,
    provenanceExclusions,
    scorecards: Object.values(METHODS).map((methodId) => ({ ...scoreLedger.score(methodId), excludedCount: provenanceExclusions.filter((item) => item.methodId === methodId).length,
      excludedForecastIds: provenanceExclusions.filter((item) => item.methodId === methodId).map((item) => item.forecastId),
      excludedReasons: provenanceExclusions.filter((item) => item.methodId === methodId).flatMap((item) => item.reasons) })),
    calibration: Object.values(METHODS).map((methodId) => ({ ...proposeMacroCalibration({
      forecasts: value.forecasts || [], outcomes: value.outcomes || [], forecastProvenance: value.forecastProvenance || [],
      sourceVerifications: value.sourceVerifications || [], forecastProvenanceIssues: value.forecastProvenanceIssues || [],
      events: value.events || [], observationConflicts: value.observationConflicts || [],
      methodId, metric: METRIC, unit: UNIT, asOf: now }),
      excludedCount: provenanceExclusions.filter((item) => item.methodId === methodId).length,
      excludedForecastIds: provenanceExclusions.filter((item) => item.methodId === methodId).map((item) => item.forecastId) })),
    modelForecasts, modelForecastReviews, modelOutcomes: (researchLedger.outcomes || []).filter((outcome) => ids.has(outcome.forecastId)),
    modelScenarios: (researchLedger.publication?.ai?.research?.scenarios || []).flatMap((scenario) => {
      const forecast = [...modelForecasts, ...modelForecastReviews].find((item) => item.researchEventId === scenario.eventId && item.runId === researchLedger.publication?.ai?.runId);
      return forecast ? [{ ...scenario, researchEventId: scenario.eventId, eventId: forecast.eventId, period: forecast.period,
        referenceEstimate: forecast.pointEstimate, referenceKind: forecast.reviewOnly ? 'current_model_opinion' : 'frozen_forecast' }] : [];
    }),
    consensus: consensusProjection?.current || null,
    consensusHistory: Array.isArray(consensusProjection?.records) ? consensusProjection.records : [],
    consensusStatus: consensusProjection?.sourceStatus || { status: 'not_connected', failures: [] },
    consensusScope: consensusProjection?.scope || consensusProjection?.sourceScope || 'Reviewed Reuters syndicated NFP estimate for September 2026 only',
    sourceScope: 'BLS Employment Situation only',
    limitations: ['Basit yöntemler model görüşü ve piyasa konsensüsü değildir.', 'Reuters consensus is a single reviewed syndicated estimate, not a multi-source consensus.', 'Geçmiş arşiv indirmeleri açıklama öncesi tahmin sayılmaz.', 'Kalibrasyon önerisi otomatik etkinleştirilmez.'] };
}
function checkedAt(value) {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
function unavailableCpiPayload(at, errorCode) {
  return { family: 'us_cpi', nextEvent: null, metrics: [], events: [], observations: [], proof: [], correctionReviews: [],
    sourceStatus: { status: 'unavailable', checkedAt: at, failures: [{ code: errorCode }] } };
}
async function getMacroPayload({ database, researchLedger, now } = {}) {
  const at = checkedAt(now);
  let value = initial; let nfpStoreStatus = { status: 'available', checkedAt: at };
  try { value = (await readStore(KEY, initial, database)).value; }
  catch (_) { nfpStoreStatus = { status: 'unavailable', checkedAt: at, errorCode: 'macro_store_unavailable' }; }
  let base;
  try { base = macroPayload(value, researchLedger, now); }
  catch (_) {
    nfpStoreStatus = { status: 'unavailable', checkedAt: at, errorCode: 'macro_projection_invalid' };
    base = macroPayload(initial, researchLedger, now);
  }
  let consensusProjection;
  try {
    consensusProjection = await getConsensusPayload({ database, event: base.consensusEvent, now });
  } catch (_) {
    consensusProjection = { records: [], current: null,
      sourceStatus: { status: 'unavailable', checkedAt: at, lastSuccessfulAt: null,
        failures: [{ code: 'consensus_store_unavailable' }] },
      scope: 'Reviewed Reuters syndicated NFP estimate for September 2026 only' };
  }
  let cpi; let cpiStoreStatus = { status: 'available', checkedAt: at };
  try { cpi = await getCpiPayload({ database, researchLedger, now }); }
  catch (_) { cpiStoreStatus = { status: 'unavailable', checkedAt: at, errorCode: 'cpi_store_unavailable' }; cpi = unavailableCpiPayload(at, 'cpi_store_unavailable'); }
  let projected;
  try { projected = macroPayload(value, researchLedger, now, consensusProjection); }
  catch (_) {
    nfpStoreStatus = { status: 'unavailable', checkedAt: at, errorCode: 'macro_projection_invalid' };
    projected = macroPayload(initial, researchLedger, now, consensusProjection);
  }
  return { ...projected, storeStatus: nfpStoreStatus,
    families: { us_cpi: { ...cpi, storeStatus: cpiStoreStatus } } };
}
module.exports = { KEY, initial, refreshMacro, getMacroPayload, macroPayload };
