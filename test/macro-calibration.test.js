'use strict';

const assert = require('node:assert/strict');
const { proposeMacroCalibration, MIN_TRAINING, MIN_HOLDOUT } = require('../src/macro-calibration');

const metric = 'us_nonfarm_payroll_change';
const unit = 'thousand_jobs';
const methodId = 'macro:last-observation:v1';
const scheduleUrl = 'https://www.bls.gov/schedule/news_release/empsit.htm';
const hash = (n) => String(n).padStart(64, '0');
const month = (index) => {
  const d = new Date(Date.UTC(2024, index, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const dateForMonth = (period) => `${period}-05`;

function fixture(count = 15) {
  const forecasts = [], outcomes = [], forecastProvenance = [], sourceVerifications = [];
  for (let i = 0; i < count; i += 1) {
    const period = month(i + 1);
    const day = dateForMonth(period);
    const scheduledAt = `${day}T12:30:00.000Z`;
    const createdAt = `${day}T11:00:00.000Z`;
    const knowledgeCutoff = `${day}T10:59:00.000Z`;
    const eventId = `${metric}:${period}`;
    const forecastId = `${eventId}:${methodId}`;
    const actual = 100 + i;
    const estimate = actual + (i < count - 3 ? 4 : 5);
    const inputPeriod = month(i);
    const inputHash = hash(i + 100);
    const verificationId = `verification-${i}`;
    forecasts.push({ forecastId, eventId, metric, unit, period, methodId, status: 'frozen', estimate,
      createdAt, knowledgeCutoff, scheduledAt, scheduleSourceUrl: scheduleUrl, scheduleContentHash: hash(i + 300),
      scheduleObservedAt: `${day}T10:00:00.000Z`, inputObservationIds: [`${inputPeriod}:${inputHash}`] });
    const pub = scheduledAt;
    const observedAt = `${day}T12:35:00.000Z`;
    outcomes.push({ eventId, period, metric, unit, actual, sourceUrl: `https://www.bls.gov/news.release/archives/empsit_${day.slice(5, 7)}${day.slice(8, 10)}${day.slice(0, 4)}.htm`,
      publishedAt: pub, observedAt, resolvedAt: `${day}T12:36:00.000Z`, scheduledAt, contentHash: hash(i + 200), vintage: 'first_release', status: 'resolved' });
    forecastProvenance.push({ forecastId, createdAt, knowledgeCutoff, status: 'verified', expectedInputCount: 1, verifiedInputCount: 1,
      inputObservationIds: [`${inputPeriod}:${inputHash}`], inputVerificationIds: [verificationId] });
    const inputDay = dateForMonth(inputPeriod);
    sourceVerifications.push({ id: verificationId, period: inputPeriod, metric, unit, value: 50 + i,
      sourceUrl: `https://www.bls.gov/news.release/archives/empsit_${inputDay.slice(5, 7)}${inputDay.slice(8, 10)}${inputDay.slice(0, 4)}.htm`,
      publishedAt: `${inputDay}T12:30:00.000Z`, observedAt: `${inputDay}T12:35:00.000Z`, contentHash: inputHash,
      verificationVersion: 'post-fetch-v2' });
  }
  return { forecasts, outcomes, forecastProvenance, sourceVerifications, forecastProvenanceIssues: [], events: [], observationConflicts: [] };
}
const asOf = '2026-01-01T00:00:00.000Z';
function run(data, options = {}) { return proposeMacroCalibration({ ...data, methodId, metric, unit, asOf, ...options }); }

assert.equal(MIN_TRAINING, 12);
assert.equal(MIN_HOLDOUT, 3);

{
  const data = fixture();
  const before = JSON.stringify(data);
  const result = run(data);
  assert.equal(result.status, 'proposal_only');
  assert.equal(result.training.n, 12);
  assert.equal(result.holdout.n, 3);
  assert.equal(result.training.lastPeriod < result.holdout.firstPeriod, true);
  assert.equal(result.trainingBias, 4);
  assert.equal(result.correction, -4);
  assert.equal(result.rawHoldout.mae, 5);
  assert.equal(result.correctedHoldout.mae, 1);
  assert.deepEqual(result.proposal.trainingForecastIds, result.training.forecastIds);
  assert.ok(result.sourceIds.includes(data.forecastProvenance[0].inputVerificationIds[0]));
  assert.equal(JSON.stringify(data), before, 'calibration must not mutate ledger records');
}

{
  const result = run(fixture(14));
  assert.equal(result.status, 'insufficient_sample');
  assert.equal(result.proposal, null);
}

{
  const data = fixture();
  for (const outcome of data.outcomes.slice(-3)) outcome.actual += 10;
  const result = run(data);
  assert.equal(result.status, 'not_improved');
  assert.equal(result.proposal, null);
  assert.ok(result.rawHoldout.mae < result.correctedHoldout.mae);
}

{
  const data = fixture();
  data.forecastProvenance[0].status = 'not_attested';
  const result = run(data);
  assert.equal(result.status, 'insufficient_provenance');
  assert.ok(result.exclusions.some((item) => item.reason === 'provenance_unverified'));
}

{
  const data = fixture();
  data.forecastProvenanceIssues.push({ forecastId: data.forecasts[0].forecastId, reason: 'chronology review', detectedAt: asOf });
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'provenance_issue'));
}

{
  const data = fixture();
  data.outcomes[14] = { ...data.outcomes[14], vintage: 'revision' };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'wrong_vintage'));
  assert.equal(result.status, 'insufficient_sample');
}

{
  const data = fixture();
  data.outcomes[0] = { ...data.outcomes[0], actual: data.outcomes[0].actual + 1, contentHash: hash(999) };
  data.outcomes.push({ ...data.outcomes[0] });
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'duplicate_outcome'));
  assert.equal(result.status, 'insufficient_sample');
}

{
  const data = fixture();
  data.outcomes[0] = { ...data.outcomes[0], actual: data.outcomes[0].actual + 1, contentHash: hash(999) };
  data.outcomes.push({ ...data.outcomes[0], actual: data.outcomes[0].actual + 1, contentHash: hash(998) });
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'conflicting_outcomes'));
}

{
  const data = fixture();
  data.outcomes[14] = { ...data.outcomes[14], resolvedAt: '2026-01-02T00:00:00.000Z' };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'outcome_not_matured_at_cutoff'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], createdAt: data.outcomes[0].publishedAt };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'forecast_chronology_invalid'));
}

{
  const data = fixture();
  data.sourceVerifications[0] = { ...data.sourceVerifications[0], observedAt: '2024-02-05T12:35:00.000Z' };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'provenance_chronology_or_source_invalid'));
}

{
  const data = fixture();
  data.outcomes[0] = { ...data.outcomes[0], observedAt: data.forecasts[12].createdAt, resolvedAt: data.forecasts[12].createdAt };
  const result = run(data);
  assert.equal(result.status, 'insufficient_chronological_holdout');
  assert.equal(result.proposal, null);
  assert.ok(result.exclusions.some((item) => item.reason === 'training_outcome_after_holdout_cutoff'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], inputObservationIds: [`${month(0)}:${hash(444)}`] };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'provenance_unverified'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], inputObservationIds: [data.forecasts[0].inputObservationIds[0], data.forecasts[0].inputObservationIds[0]] };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'duplicate_input_id'));
}

{
  const data = fixture();
  data.sourceVerifications[0] = { ...data.sourceVerifications[0], publishedAt: null };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'provenance_chronology_or_source_invalid'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], scheduleObservedAt: '2024-02-05T11:30:00.000Z' };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'schedule_provenance_invalid'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], scheduleSourceUrl: 'https://user@www.bls.gov/schedule/news_release/empsit.htm' };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'schedule_provenance_invalid'));
}

{
  const data = fixture();
  data.events.push({ eventId: data.forecasts[0].eventId, scheduledAt: data.forecasts[0].scheduledAt,
    sourceUrl: scheduleUrl, contentHash: hash(300), scheduleConflict: { detectedAt: asOf } });
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'schedule_conflict'));
}

{
  const data = fixture();
  const baseline = run(data);
  data.events.push({ eventId: data.forecasts[0].eventId, scheduledAt: data.forecasts[0].scheduledAt,
    sourceUrl: scheduleUrl, contentHash: hash(777) });
  const changedCalendarHash = run(data);
  assert.equal(changedCalendarHash.status, baseline.status);
  assert.equal(changedCalendarHash.trainingBias, baseline.trainingBias);
  assert.deepEqual(changedCalendarHash.holdout, baseline.holdout);
}

{
  const data = fixture();
  data.sourceVerifications[0] = { ...data.sourceVerifications[0], sourceUrl: `${data.sourceVerifications[0].sourceUrl}?view=1` };
  let result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'provenance_chronology_or_source_invalid'));

  const clean = fixture();
  clean.outcomes[0] = { ...clean.outcomes[0], sourceUrl: `${clean.outcomes[0].sourceUrl}#section` };
  result = run(clean);
  assert.ok(result.exclusions.some((item) => item.reason === 'outcome_source_invalid'));
}

{
  const data = fixture();
  data.observationConflicts.push({ period: month(0), numericConflict: true });
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'contested_input'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], inputObservationIds: [`${data.forecasts[0].period}:${hash(444)}`] };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'invalid_input_period_or_id'));
}

{
  const data = fixture();
  const secondInput = `2023-12:${hash(445)}`;
  data.forecastProvenance[0].inputVerificationIds = ['verification-0', 'verification-0'];
  data.forecastProvenance[0].inputObservationIds.push(secondInput);
  data.forecastProvenance[0].expectedInputCount = 2;
  data.forecastProvenance[0].verifiedInputCount = 2;
  data.forecasts[0].inputObservationIds.push(secondInput);
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'duplicate_verification_id'));
}

{
  const data = fixture();
  data.outcomes[0] = { ...data.outcomes[0], scheduledAt: '2024-02-05T11:00:00.000Z' };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'outcome_chronology_invalid'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], estimate: Number.NaN };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'unscorable_forecast'));
}

{
  const data = fixture();
  data.forecasts[0] = { ...data.forecasts[0], estimate: 1e308 };
  data.outcomes[0] = { ...data.outcomes[0], actual: -1e308 };
  const result = run(data);
  assert.ok(result.exclusions.some((item) => item.reason === 'numeric_overflow'));
}

assert.throws(() => run(fixture(), { minTraining: 11 }), /at least 12 training/);
assert.throws(() => run(fixture(), { holdoutSize: 2 }), /at least 12 training/);
assert.throws(() => run(fixture(), { asOf: 'not-a-date' }), /valid ISO timestamp/);
assert.throws(() => proposeMacroCalibration({}), /must be an array/);

console.log('macro-calibration tests passed');
