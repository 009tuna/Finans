'use strict';
const assert = require('assert/strict');
const { createMacroEventLedger, METHODS, ACTIVE_METHODS } = require('../src/macro-events');
const sha = (s) => require('crypto').createHash('sha256').update(s).digest('hex');
const obs = (period, value, publishedAt, vintage = 'first_release', observedAt = '2026-09-10T12:00:00.000Z') => ({ metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period, value, publishedAt, observedAt, sourceUrl: `https://www.bls.gov/news.release/archives/empsit_${publishedAt.slice(5,7)}${publishedAt.slice(8,10)}${publishedAt.slice(0,4)}.htm`, contentHash: sha(period + publishedAt), vintage });
const event = { eventId: 'us_nonfarm_payroll_change:2026-09', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-09', scheduledAt: '2026-10-02T12:30:00.000Z', observedAt: '2026-09-18T00:00:00Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm', contentHash: sha('schedule') };
const ledger = createMacroEventLedger();
ledger.appendObservation(obs('2026-06', 100, '2026-07-03T12:30:00Z'));
ledger.appendObservation(obs('2026-07', -20, '2026-08-07T12:30:00Z'));
ledger.appendObservation(obs('2026-08', 162, '2026-09-04T12:30:00Z'));
const last = ledger.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z' });
assert.equal(last.estimate, 162); assert.deepEqual(last.inputObservationIds, [`2026-08:${sha('2026-08' + '2026-09-04T12:30:00Z')}`]);
const mean = ledger.createForecast({ event, methodId: METHODS.trailing_three_mean, createdAt: '2026-09-20T12:00:00Z' });
assert.equal(mean.estimate, 242 / 3); assert.equal(mean.inputObservationIds.length, 3);
assert.deepEqual(ACTIVE_METHODS, [METHODS.last_observation, METHODS.trailing_three_months]);
const consecutive = ledger.createForecast({ event, methodId: METHODS.trailing_three_months, createdAt: '2026-09-20T12:00:00Z' });
assert.equal(consecutive.estimate, 242 / 3);
assert.deepEqual(consecutive.inputObservationIds, [
  `2026-06:${sha('2026-06' + '2026-07-03T12:30:00Z')}`,
  `2026-07:${sha('2026-07' + '2026-08-07T12:30:00Z')}`,
  `2026-08:${sha('2026-08' + '2026-09-04T12:30:00Z')}`,
]);
assert.equal(createMacroEventLedger(ledger.snapshot()).snapshot().forecasts.find((f) => f.methodId === METHODS.trailing_three_months).estimate, 242 / 3);
assert.throws(() => ledger.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-09-21T00:00:00Z' }), /immutable/);
assert.throws(() => ledger.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-10-02T12:30:00Z' }), /before scheduled/);
assert.throws(() => ledger.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z', knowledgeCutoff: '2026-09-21T00:00:00Z' }), /follow/);
assert.throws(() => ledger.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z', estimate: 999 }), /cannot be overridden/);
const tooEarlyKnown = createMacroEventLedger({ observations: [obs('2026-08', 999, '2026-09-04T12:30:00Z', 'first_release', '2026-09-21T00:00:00Z')] });
const cutoffEvent = { ...event, eventId: 'us_nonfarm_payroll_change:2026-10', period: '2026-10', scheduledAt: '2026-11-06T13:30:00Z' };
assert.equal(tooEarlyKnown.createForecast({ event: cutoffEvent, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z' }).estimate, null);
const insufficientMean = createMacroEventLedger();
insufficientMean.appendObservation(obs('2026-08', 162, '2026-09-04T12:30:00Z'));
assert.equal(insufficientMean.createForecast({ event, methodId: METHODS.trailing_three_mean, createdAt: '2026-09-20T12:00:00Z' }).status, 'insufficient_history');
assert.throws(() => insufficientMean.createForecast({ event: { ...event, eventId: 'x' }, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z' }), /identity/);
const twoHistory = createMacroEventLedger({ observations: [obs('2026-07', 90, '2026-08-07T12:30:00Z'), obs('2026-08', 162, '2026-09-04T12:30:00Z')] });
twoHistory.createForecast({ event, methodId: METHODS.trailing_three_mean, createdAt: '2026-09-20T12:00:00Z' });
assert.equal(createMacroEventLedger(twoHistory.snapshot()).snapshot().forecasts[0].status, 'insufficient_history');
const gapV2 = twoHistory.createForecast({ event, methodId: METHODS.trailing_three_months, createdAt: '2026-09-20T12:00:00Z' });
assert.equal(gapV2.estimate, null);
assert.deepEqual(gapV2.inputObservationIds, []);
assert.equal(gapV2.status, 'insufficient_history');
assert.match(gapV2.rationale, /2026-06/);
const gapRoundTrip = createMacroEventLedger(twoHistory.snapshot()).snapshot().forecasts.find((f) => f.methodId === METHODS.trailing_three_months);
assert.equal(gapRoundTrip.status, 'insufficient_history');
assert.deepEqual(gapRoundTrip.inputObservationIds, []);
assert.equal(twoHistory.score(METHODS.trailing_three_months).n, 0);
const noConsensus = ledger.createForecast({ event: { ...event, eventId: 'us_nonfarm_payroll_change:2026-10', period: '2026-10', scheduledAt: '2026-11-06T13:30:00Z' }, methodId: METHODS.last_observation, createdAt: '2026-10-20T12:00:00Z' });
assert.equal(noConsensus.estimate, 162); // method is a public-data baseline; no consensus is invented.
const actual = obs('2026-09', 80, '2026-10-02T12:30:00Z', 'first_release', '2026-10-02T12:31:00Z');
ledger.resolveOutcome({ event, observation: actual, resolvedAt: '2026-10-02T12:32:00Z' });
assert.throws(() => ledger.resolveOutcome({ event, observation: { ...actual, value: 82 }, resolvedAt: '2026-10-03T00:00:00Z' }), /immutable/);
assert.throws(() => ledger.resolveOutcome({ event, observation: obs('2026-09', 82, '2026-10-02T12:30:00Z', 'revised'), resolvedAt: '2026-10-03T00:00:00Z' }), /first-release/);
assert.throws(() => ledger.resolveOutcome({ event, observation: actual, resolvedAt: '2026-10-02T12:30:00Z' }), /before the source was retrieved/);
const snap = ledger.snapshot(); snap.forecasts[0].inputObservationIds.push('tamper'); snap.observations[0].value = 999;
assert.equal(ledger.snapshot().forecasts[0].inputObservationIds.includes('tamper'), false); assert.equal(ledger.snapshot().observations[0].value, 100);
const scores = ledger.score(METHODS.last_observation);
assert.equal(scores.n, 1); assert.equal(scores.status, 'insufficient_sample'); assert.equal(scores.mae, 82); assert.equal(scores.signedBias, 82);
assert.equal(ledger.proposeCalibration({ methodId: METHODS.last_observation }).status, 'insufficient_sample');
assert.equal(createMacroEventLedger(ledger.snapshot()).snapshot().outcomes[0].status, 'resolved');
assert.equal(ledger.snapshot().observations.length, 3);
assert.throws(() => createMacroEventLedger({ forecasts: [{ forecastId: 'invalid' }] }), /forecast/);
assert.equal(createMacroEventLedger(ledger.snapshot()).snapshot().outcomes[0].unit, 'thousand_jobs');
const withRevision = createMacroEventLedger({ observations: ledger.snapshot().observations });
withRevision.appendRevision({ metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-07', previousValue: -23, value: 21, revisionChange: 44,
  publishedAt: '2026-09-04T12:30:00Z', observedAt: '2026-09-04T13:00:00Z', sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm', contentHash: sha('revision-2026-07'), vintage: 'revision' });
assert.equal(withRevision.snapshot().revisions[0].vintage, 'revision');
assert.throws(() => withRevision.appendRevision({ ...withRevision.snapshot().revisions[0], value: 22, revisionChange: 45 }), /immutable/);
const frozenDespiteRevision = withRevision.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z' });
assert.equal(frozenDespiteRevision.estimate, 162); // the newer July revision cannot replace its first-release observation.
assert.equal(createMacroEventLedger(withRevision.snapshot()).snapshot().revisions.length, 1);

const calibrationLedger = createMacroEventLedger();
const monthAt = (idx) => { const d = new Date(Date.UTC(2025, idx, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
for (let i = 0; i < 16; i++) {
  const period = monthAt(i), [year, month] = period.split('-').map(Number);
  const release = new Date(Date.UTC(year, month, 5, 12, 30)).toISOString();
  const releaseDate = release.slice(0, 10);
  const forecastEvent = { eventId: `us_nonfarm_payroll_change:${period}`, metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period, scheduledAt: release,
    observedAt: new Date(Date.parse(release) - 5 * 86400000).toISOString(), sourceUrl: event.sourceUrl, contentHash: event.contentHash };
  calibrationLedger.createForecast({ event: forecastEvent, methodId: METHODS.last_observation, createdAt: new Date(Date.parse(release) - 1000).toISOString() });
  const observation = { metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period, value: 100 + i,
    publishedAt: release, observedAt: new Date(Date.parse(release) + 60000).toISOString(), sourceUrl: `https://www.bls.gov/news.release/archives/empsit_${releaseDate.slice(5,7)}${releaseDate.slice(8,10)}${releaseDate.slice(0,4)}.htm`, contentHash: sha(period), vintage: 'first_release' };
  calibrationLedger.appendObservation(observation);
  calibrationLedger.resolveOutcome({ event: forecastEvent, observation, resolvedAt: new Date(Date.parse(release) + 120000).toISOString() });
}
const proposal = calibrationLedger.proposeCalibration({ methodId: METHODS.last_observation, createdAt: '2026-06-01T00:00:00Z' });
assert.equal(proposal.status, 'proposal_only'); assert.equal(proposal.trainingN, 12); assert.equal(proposal.holdoutN, 3); assert.equal(proposal.holdoutCandidateMae, 0);
assert.equal(calibrationLedger.score(METHODS.last_observation).n, 15);
const lateLedger = createMacroEventLedger({ observations: ledger.snapshot().observations });
lateLedger.createForecast({ event, methodId: METHODS.last_observation, createdAt: '2026-09-20T12:00:00Z' });
const late = obs('2026-09', 80, '2026-10-02T12:31:00Z', 'first_release', '2026-10-02T12:32:00Z');
assert.equal(lateLedger.resolveOutcome({ event, observation: late, resolvedAt: '2026-10-02T12:33:00Z' }).status, 'schedule_mismatch');
assert.equal(lateLedger.score(METHODS.last_observation).n, 0);
assert.throws(() => lateLedger.resolveOutcome({ event: { ...event, eventId: 'us_nonfarm_payroll_change:2026-10', period: '2026-10' }, observation: obs('2026-10', 80, '2026-10-02T12:29:00Z', 'first_release', '2026-10-02T12:32:00Z'), resolvedAt: '2026-10-02T12:33:00Z' }), /precedes scheduledAt/);
console.log('Macro event ledger: chronology, deterministic methods, immutability, vintages, and honest scoring passed');
