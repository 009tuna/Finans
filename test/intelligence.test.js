'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { refreshMacro, getMacroPayload, macroPayload, initial: macroInitial } = require('../src/macro-store');
const { refreshMarketNews, getMarketNews, parseSpkBulletins } = require('../src/market-news');
const { handleIntelligence } = require('../src/intelligence-api');
const { updateStore } = require('../src/intelligence-store');
const { METHODS, createMacroEventLedger } = require('../src/macro-events');
const NOW = '2026-10-01T08:00:00.000Z';
const RELEASE = '2026-10-02T12:30:00.000Z';
const clone = (value) => JSON.parse(JSON.stringify(value));
function database() {
  const rows = new Map(); let version = 0; let conflict = false; let dropped = false;
  return { rows, conflict: () => { conflict = true; }, drop: () => { dropped = true; },
    getCache: async (key) => rows.has(key) ? clone(rows.get(key)) : null,
    compareAndSetCache: async (key, value, expected) => {
      if (conflict) { conflict = false; const e = new Error('race'); e.statusCode = 409; throw e; }
      assert.equal(rows.get(key)?.revision || null, expected);
      if (dropped) return;
      const revision = 'r' + (++version); rows.set(key, { value: clone(value), revision }); return revision;
    } };
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const event = (period, scheduledAt) => ({ eventId: 'us_nonfarm_payroll_change:' + period, metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period,
  scheduledAt, observedAt: NOW, sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm', contentHash: hash('calendar') });
const events = [event('2026-06', '2026-07-02T12:30:00.000Z'), event('2026-07', '2026-08-07T12:30:00.000Z'), event('2026-08', '2026-09-04T12:30:00.000Z'), event('2026-09', RELEASE)];
const values = { '2026-06': 100, '2026-07': 120, '2026-08': 162, '2026-09': 80 };
const source = { getSchedule: async () => events,
  getFirstRelease: async (item, now) => ({ available: true, metric: item.metric, unit: item.unit, period: item.period, value: values[item.period],
    vintage: 'first_release', publishedAt: item.scheduledAt, observedAt: now,
    sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_' + item.scheduledAt.slice(5, 7) + item.scheduledAt.slice(8, 10) + item.scheduledAt.slice(0, 4) + '.htm', contentHash: hash(item.period + values[item.period]) }) };
const spkHtml = '<a href="https://spk.gov.tr/data/abc/2026-66.pdf">Bülten No : 2026/66 <b>Yayımlanma : 28 Eyl&#252;l 2026 Pazartesi</b></a>';
(async () => {
  const db = database(); db.conflict();
  const first = await refreshMacro({ database: db, source, now: NOW });
  assert.equal(first.forecasts, 2); assert.equal(first.outcomes, 0); assert.equal(first.observations, 3);
  let payload = await getMacroPayload({ database: db, now: NOW });
  assert.equal(payload.nextEvent.period, '2026-09');
  assert.equal(payload.forecasts.find((item) => item.methodId === METHODS.last_observation).estimate, 162);
  assert.equal(payload.forecasts.find((item) => item.methodId === METHODS.trailing_three_months).estimate, 127.33333333333333);
  assert.ok(!payload.forecasts.some((item) => item.methodId === METHODS.trailing_three_mean), 'new freezes use only active method versions');
  assert.ok(payload.scorecards.some((item) => item.methodId === METHODS.trailing_three_mean), 'historical v1 scorecard remains visible');
  const initialStored = db.rows.get('macro_event_ledger_v1').value;
  assert.equal(initialStored.sourceVerifications.length, 3);
  assert.ok(initialStored.sourceVerifications.every((item) => item.verificationVersion === 'post-fetch-v2' && Date.parse(item.observedAt) >= Date.parse(item.publishedAt)));
  assert.ok(initialStored.forecastProvenance.every((item) => item.status === 'verified' && item.inputVerificationIds.length === item.expectedInputCount));
  assert.equal(payload.consensus, null); assert.equal(payload.scorecards[0].mae, null);
  const frozen = clone(payload.forecasts);
  await refreshMacro({ database: db, source, now: '2026-10-01T09:00:00.000Z' });
  assert.deepEqual((await getMacroPayload({ database: db, now: NOW })).forecasts, frozen);
  const disputedDb = database();
  const disputedLedger = createMacroEventLedger();
  for (const historyEvent of events.slice(0, 3)) disputedLedger.appendObservation(await source.getFirstRelease(historyEvent, NOW));
  disputedLedger.createForecast({ event: events[3], methodId: METHODS.last_observation, createdAt: '2026-10-01T12:00:00.000Z' });
  disputedLedger.createForecast({ event: events[3], methodId: METHODS.trailing_three_months, createdAt: '2026-10-01T12:00:00.000Z' });
  const septemberActual = await source.getFirstRelease(events[3], '2026-10-02T12:31:00.000Z');
  disputedLedger.appendObservation(septemberActual);
  disputedLedger.resolveOutcome({ event: events[3], observation: septemberActual, resolvedAt: '2026-10-02T12:32:00.000Z' });
  const octoberEvent = event('2026-10', '2026-11-06T13:30:00.000Z');
  const disputedSchedule = events.concat([octoberEvent]);
  await updateStore('macro_event_ledger_v1', { schemaVersion: 1, events: [], observations: [], revisions: [], forecasts: [], outcomes: [], sourceStatus: { status: 'not_initialized' }, updatedAt: null }, () => ({
    schemaVersion: 1, events: disputedSchedule, ...disputedLedger.snapshot(), sourceStatus: { status: 'available' }, updatedAt: '2026-10-02T12:32:00.000Z',
  }), disputedDb);
  const originalJulyHash = hash('2026-07' + values['2026-07']);
  const changedJulySource = { getSchedule: async () => disputedSchedule, getFirstRelease: async (item, clock) => {
    const result = await source.getFirstRelease(item, clock);
    if (item.period === '2026-07') { result.value = 999; result.contentHash = originalJulyHash; }
    return result;
  } };
  const frozenBeforeConflict = clone(disputedLedger.snapshot().forecasts);
  await refreshMacro({ database: disputedDb, source: changedJulySource, now: '2026-10-02T12:33:00.000Z' });
  let disputedPayload = await getMacroPayload({ database: disputedDb, now: NOW });
  assert.deepEqual(disputedDb.rows.get('macro_event_ledger_v1').value.forecasts.filter((item) => item.eventId === events[3].eventId), frozenBeforeConflict, 'pre-existing numeric forecasts remain byte-for-byte unchanged');
  assert.equal(disputedPayload.observationConflicts.length, 1);
  assert.equal(disputedPayload.observationConflicts[0].numericConflict, true);
  assert.equal(disputedPayload.sourceStatus.status, 'partial');
  assert.equal(disputedPayload.sourceStatus.auditRequired, true);
  assert.ok(!disputedPayload.forecasts.some((item) => item.eventId === octoberEvent.eventId && item.methodId === METHODS.trailing_three_months));
  const contestedAttempt = disputedPayload.methodAbstentions.find((item) => item.eventId === octoberEvent.eventId && item.methodId === METHODS.trailing_three_months);
  assert.equal(contestedAttempt.status, 'disputed_input');
  assert.deepEqual(contestedAttempt.disputedInputs, ['2026-07']);
  await refreshMacro({ database: disputedDb, source: { ...source, getSchedule: async () => disputedSchedule }, now: '2026-10-02T13:00:00.000Z' });
  disputedPayload = await getMacroPayload({ database: disputedDb, now: NOW });
  assert.equal(disputedPayload.sourceStatus.status, 'partial', 'later return to the original release does not erase unresolved conflict status');
  assert.equal(disputedPayload.sourceStatus.auditRequired, true);
  assert.equal(disputedPayload.observationConflicts.length, 1);
  assert.equal(disputedPayload.methodAbstentions.filter((item) => item.eventId === octoberEvent.eventId && item.methodId === METHODS.trailing_three_months).length, 1);
  await refreshMacro({ database: db, source, now: '2026-10-02T12:32:00.000Z' });
  payload = await getMacroPayload({ database: db, now: '2026-10-02T12:33:00.000Z' });
  assert.equal(payload.outcomes.length, 1); assert.equal(payload.outcomes[0].actual, 80);
  assert.equal(payload.scorecards[0].n, 1); assert.equal(payload.scorecards[0].mae, 82);
  assert.equal(payload.scorecards[0].status, 'insufficient_sample');
  const before = clone(payload);
  await refreshMacro({ database: db, source: { getSchedule: async () => { throw new Error('BLS HTTP 403'); } }, now: '2026-10-02T13:00:00.000Z' });
  payload = await getMacroPayload({ database: db, now: '2026-10-02T13:01:00.000Z' });
  assert.deepEqual(payload.forecasts, before.forecasts); assert.deepEqual(payload.outcomes, before.outcomes);
  assert.equal(payload.status, 'unavailable'); assert.equal(payload.sourceStatus.failures[0].errorCode, 'http_403');
  const oldRun = await refreshMacro({ database: db, source, now: NOW });
  assert.equal(oldRun.status, 'unavailable', 'old completion must not overwrite a newer failure/success timestamp');
  const lateDb = database(); await refreshMacro({ database: lateDb, source, now: '2026-10-02T12:32:00.000Z' });
  assert.equal((await getMacroPayload({ database: lateDb })).forecasts.length, 0, 'archive import cannot manufacture pre-release predictions');
  const rawForecastsBeforeIssue = clone(db.rows.get('macro_event_ledger_v1').value.forecasts);
  const flaggedForecast = rawForecastsBeforeIssue.find((item) => item.methodId === METHODS.last_observation);
  const revisionBeforeInvalidIssue = db.rows.get('macro_event_ledger_v1').revision;
  await assert.rejects(refreshMacro({ database: db, source, now: '2026-10-02T13:04:00.000Z', forecastProvenanceIssues: [{
    forecastId: flaggedForecast.forecastId, reason: 'invalid backdated issue', detectedAt: '2026-10-01T07:00:00.000Z',
  }] }), /cannot precede forecast creation/);
  assert.equal(db.rows.get('macro_event_ledger_v1').revision, revisionBeforeInvalidIssue);
  await refreshMacro({ database: db, source, now: '2026-10-02T13:05:00.000Z', forecastProvenanceIssues: [{
    forecastId: flaggedForecast.forecastId, reason: 'Retrieval chronology predates verified post-fetch timing.', detectedAt: '2026-10-02T13:05:00.000Z',
  }] });
  let issuePayload = await getMacroPayload({ database: db, now: '2026-10-02T13:06:00.000Z' });
  assert.deepEqual(db.rows.get('macro_event_ledger_v1').value.forecasts, rawForecastsBeforeIssue, 'provenance annotation never rewrites the frozen raw forecast');
  const decoratedFlagged = issuePayload.forecasts.find((item) => item.forecastId === flaggedForecast.forecastId);
  assert.equal(decoratedFlagged.chronologyStatus, 'unverified');
  assert.equal(decoratedFlagged.provenanceIssues.length, 1);
  assert.equal(issuePayload.provenanceExclusions[0].forecast.forecastId, flaggedForecast.forecastId);
  const gatedLastScore = issuePayload.scorecards.find((item) => item.methodId === METHODS.last_observation);
  assert.equal(gatedLastScore.n, 0);
  assert.equal(gatedLastScore.excludedCount, 1);
  assert.equal(gatedLastScore.excludedForecastIds[0], flaggedForecast.forecastId);
  assert.ok(gatedLastScore.excludedReasons.some((reason) => reason.includes('Retrieval chronology')));
  const revisionBeforeUnknown = db.rows.get('macro_event_ledger_v1').revision;
  await assert.rejects(refreshMacro({ database: db, source, now: '2026-10-02T13:10:00.000Z', forecastProvenanceIssues: [{
    forecastId: 'unknown-forecast', reason: 'unknown', detectedAt: '2026-10-02T13:10:00.000Z',
  }] }), /unknown forecast/);
  assert.equal(db.rows.get('macro_event_ledger_v1').revision, revisionBeforeUnknown, 'unknown issue is rejected without a store update');
  await refreshMacro({ database: db, source, now: '2026-10-02T13:12:00.000Z' });
  issuePayload = await getMacroPayload({ database: db, now: '2026-10-02T13:13:00.000Z' });
  assert.equal(issuePayload.sourceStatus.status, 'partial');
  assert.equal(issuePayload.sourceStatus.auditRequired, true);
  assert.equal(issuePayload.scorecards.find((item) => item.methodId === METHODS.last_observation).n, 0, 'a later clean fetch does not silently restore a flagged score');
  const gapDb = database();
  const gapSource = { ...source, getFirstRelease: async (item, clock) => item.period === '2026-06'
    ? { available: false, reason: 'unsupported_release' }
    : source.getFirstRelease(item, clock) };
  await refreshMacro({ database: gapDb, source: gapSource, now: NOW });
  const gapPayload = await getMacroPayload({ database: gapDb, now: NOW });
  assert.ok(!gapPayload.forecasts.some((item) => item.methodId === METHODS.trailing_three_months), 'insufficient attempt is not stored as a forecast lock');
  const gapAbstention = gapPayload.methodAbstentions.find((item) => item.methodId === METHODS.trailing_three_months);
  assert.ok(gapAbstention);
  assert.equal(gapAbstention.estimate, null);
  assert.ok(gapAbstention.inputObservationIds.length > 0);
  assert.equal(gapAbstention.status, 'insufficient_history');
  assert.deepEqual(gapAbstention.missingPeriods, ['2026-06']);
  assert.equal(gapAbstention.createdAt, NOW);
  assert.equal(gapAbstention.knowledgeCutoff, NOW);
  assert.equal(gapAbstention.inputFingerprint.length, 64);
  const backfilled = await refreshMacro({ database: gapDb, source, now: '2026-10-01T09:00:00.000Z' });
  assert.equal(backfilled.forecasts, 2);
  const recovered = await getMacroPayload({ database: gapDb, now: NOW });
  const recoveredV2 = recovered.forecasts.find((item) => item.methodId === METHODS.trailing_three_months);
  assert.equal(recoveredV2.estimate, 127.33333333333333);
  assert.equal(recovered.methodAbstentions.length, 1, 'the original abstention remains after later successful freeze');
  assert.equal(recovered.methodAbstentions[0].createdAt, NOW, 'abstention cutoff is not rewritten to the later success time');
  const migrationDb = database();
  const legacyNullLedger = createMacroEventLedger();
  legacyNullLedger.appendObservation(await source.getFirstRelease(events[1], NOW));
  legacyNullLedger.appendObservation(await source.getFirstRelease(events[2], NOW));
  legacyNullLedger.createForecast({ event: events[3], methodId: METHODS.trailing_three_months, createdAt: NOW });
  await updateStore('macro_event_ledger_v1', { schemaVersion: 1, events: [], observations: [], revisions: [], forecasts: [], outcomes: [], sourceStatus: { status: 'not_initialized' }, updatedAt: null }, () => ({
    schemaVersion: 1, events, ...legacyNullLedger.snapshot(), sourceStatus: { status: 'available' }, updatedAt: NOW,
  }), migrationDb);
  await refreshMacro({ database: migrationDb, source, now: '2026-10-01T09:00:00.000Z' });
  const migrated = await getMacroPayload({ database: migrationDb, now: NOW });
  assert.equal(migrated.forecasts.find((item) => item.methodId === METHODS.trailing_three_months).estimate, 127.33333333333333);
  assert.equal(migrated.methodAbstentions.length, 1);
  assert.ok(migrated.methodAbstentions[0].migratedForecastId, 'legacy null forecast becomes preserved abstention evidence');
  const postReleaseDb = database();
  await refreshMacro({ database: postReleaseDb, source: gapSource, now: NOW });
  await refreshMacro({ database: postReleaseDb, source, now: '2026-10-02T12:32:00.000Z' });
  const postReleasePayload = await getMacroPayload({ database: postReleaseDb, now: '2026-10-02T12:33:00.000Z' });
  assert.ok(!postReleasePayload.forecasts.some((item) => item.methodId === METHODS.trailing_three_months), 'late history cannot create a pre-release forecast');
  const legacyDb = database();
  const historyLedger = require('../src/macro-events').createMacroEventLedger();
  [
    ['2026-03', 80, '2026-04-03T12:30:00.000Z', 'https://www.bls.gov/news.release/archives/empsit_04032026.htm'],
    ['2026-04', 90, '2026-05-08T12:30:00.000Z', 'https://www.bls.gov/news.release/archives/empsit_05082026.htm'],
    ['2026-05', 100, '2026-06-05T12:30:00.000Z', 'https://www.bls.gov/news.release/archives/empsit_06052026.htm'],
  ].forEach(([period, value, publishedAt, sourceUrl]) => historyLedger.appendObservation({ metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period, value,
    publishedAt, observedAt: new Date(Date.parse(publishedAt) + 60000).toISOString(), sourceUrl, contentHash: hash(period + value), vintage: 'first_release' }));
  const historicEvent = { eventId: 'us_nonfarm_payroll_change:2026-06', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-06',
    scheduledAt: '2026-07-02T12:30:00.000Z', observedAt: '2026-06-01T12:00:00.000Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm', contentHash: hash('historic-schedule') };
  historyLedger.createForecast({ event: historicEvent, methodId: METHODS.trailing_three_mean, createdAt: '2026-07-01T12:00:00.000Z' });
  const historicActual = { metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-06', value: 100, vintage: 'first_release',
    publishedAt: '2026-07-02T12:30:00.000Z', observedAt: '2026-07-02T12:31:00.000Z', sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_07022026.htm', contentHash: hash('2026-06' + 100) };
  historyLedger.appendObservation(historicActual);
  historyLedger.resolveOutcome({ event: historicEvent, observation: historicActual, resolvedAt: '2026-07-02T12:32:00.000Z' });
  await updateStore('macro_event_ledger_v1', { schemaVersion: 1, events: [], observations: [], revisions: [], revisionConflicts: [], forecasts: [], outcomes: [], sourceStatus: { status: 'not_initialized' }, updatedAt: null }, () => ({
    schemaVersion: 1, events: [historicEvent], ...historyLedger.snapshot(), sourceStatus: { status: 'available' }, updatedAt: '2026-07-02T12:32:00.000Z',
  }), legacyDb);
  await refreshMacro({ database: legacyDb, source, now: NOW });
  const legacyPayload = await getMacroPayload({ database: legacyDb, now: NOW });
  const preservedV1 = legacyPayload.forecasts.find((item) => item.methodId === METHODS.trailing_three_mean);
  assert.equal(preservedV1.estimate, 90);
  assert.equal(legacyPayload.outcomes.find((item) => item.eventId === historicEvent.eventId).actual, 100);
  assert.equal(legacyPayload.scorecards.find((item) => item.methodId === METHODS.trailing_three_mean).n, 0,
    'legacy numeric forecasts without per-input chronology proof stay visible but out of scorecards');
  assert.equal(legacyPayload.scorecards.find((item) => item.methodId === METHODS.trailing_three_mean).excludedCount, 1);
  const revisionDb = database();
  const revisionSource = (contentHash, revisedValue) => ({ ...source, getFirstRelease: async (item, clock) => {
    const result = await source.getFirstRelease(item, clock);
    if (item.period === '2026-08') result.revisions = [{ metric: item.metric, unit: item.unit, period: '2026-07', previousValue: -23,
      value: revisedValue, revisionChange: revisedValue + 23, vintage: 'revision', publishedAt: '2026-09-04T12:30:00.000Z', observedAt: clock,
      sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_09042026.htm', contentHash }];
    return result;
  } });
  await refreshMacro({ database: revisionDb, source: revisionSource(hash('revision-v1'), 21), now: NOW });
  await refreshMacro({ database: revisionDb, source: revisionSource(hash('revision-hash-only'), 21), now: '2026-10-01T09:00:00.000Z' });
  let revisionPayload = await getMacroPayload({ database: revisionDb, now: NOW });
  assert.equal(revisionPayload.revisions.length, 1, 'original revision remains append-only');
  assert.equal(revisionPayload.revisions[0].value, 21);
  assert.equal(revisionPayload.revisionConflicts.length, 1);
  assert.equal(revisionPayload.revisionConflicts[0].numericConflict, false);
  assert.equal(revisionPayload.sourceStatus.status, 'available', 'hash-only revision change is not a numeric conflict');
  await refreshMacro({ database: revisionDb, source: revisionSource(hash('revision-numeric-change'), 22), now: '2026-10-01T10:00:00.000Z' });
  revisionPayload = await getMacroPayload({ database: revisionDb, now: NOW });
  assert.equal(revisionPayload.revisions.length, 1);
  assert.equal(revisionPayload.revisionConflicts.length, 2);
  assert.equal(revisionPayload.revisionConflicts[1].numericConflict, true);
  assert.equal(revisionPayload.sourceStatus.status, 'partial');
  assert.ok(revisionPayload.sourceStatus.failures.some((failure) => failure.errorCode === 'revision_value_changed'));
  await refreshMacro({ database: revisionDb, source: revisionSource(hash('revision-numeric-change'), 23), now: '2026-10-01T11:00:00.000Z' });
  revisionPayload = await getMacroPayload({ database: revisionDb, now: NOW });
  assert.equal(revisionPayload.revisions[0].value, 21, 'the original published revision remains immutable');
  assert.equal(revisionPayload.revisionConflicts.length, 3, 'same-hash numeric correction is retained as a separate evidence version');
  assert.equal(revisionPayload.revisionConflicts[2].numericConflict, true);
  const scheduleDb = database(); await refreshMacro({ database: scheduleDb, source, now: NOW });
  await refreshMacro({ database: scheduleDb, source: { ...source, getSchedule: async () => events.map((item) => item.period === '2026-09' ? { ...item, scheduledAt: '2026-10-03T12:30:00.000Z' } : item) }, now: '2026-10-01T09:00:00.000Z' });
  assert.ok((await getMacroPayload({ database: scheduleDb, now: NOW })).nextEvent.scheduleConflict);
  assert.equal(parseSpkBulletins(spkHtml, { observedAt: NOW, sourceUrl: 'https://www.spk.gov.tr' })[0].publishedAt, null, 'date-only publication cannot invent a time');
  assert.equal(parseSpkBulletins(spkHtml.replace('https://spk.gov.tr', 'https://evil.test'), { observedAt: NOW }).length, 0);
  assert.equal(parseSpkBulletins(spkHtml.replace('28 Eyl', '28 Ara'), { observedAt: NOW }).length, 0, 'future publication excluded');
  let inspections = 0;
  const inspectDocument = async () => { inspections++; return { available: true, contentStatus: 'text_extracted', extractedAt: NOW, documentHash: hash('pdf'), pages: 4, sections: [{ title: 'C. İdari yaptırımlar', page: 1, category: 'enforcement', symbols: ['TRHOL'] }] }; };
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: async () => spkHtml, inspectDocument, collectAnnouncements: false, collectKap: false, collectFeeds: async () => ({ items: [], sources: {} }), now: NOW });
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: async () => spkHtml, inspectDocument, collectAnnouncements: false, collectKap: false, collectFeeds: async () => ({ items: [], sources: {} }), now: NOW });
  assert.equal(inspections, 1, 'unchanged successfully inspected PDFs are not downloaded again');
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: async () => { throw new Error('offline'); }, collectAnnouncements: false, collectKap: false, collectFeeds: async () => ({ items: [], sources: {} }), now: '2026-10-01T09:00:00.000Z' });
  const news = await getMarketNews({ database: db, now: NOW, report: { ai: { research: { sources: [{ id: 's', url: 'https://example.com/news', title: 'source', publishedAt: null }], events: [{ id: 'e', title: 'Crypto evidence', market: 'crypto', sourceIds: ['s'] }] } } } });
  assert.equal(news.groups.bist.length, 1); assert.equal(news.groups.crypto.length, 1); assert.equal(news.groups.us.length, 0);
  assert.equal(news.sources.spk.status, 'unavailable'); assert.equal(news.groups.bist[0].evidenceStatus, 'document_link_verified');
  assert.equal(news.groups.bist[0].document.pages, 4, 'PDF evidence remains available after a source outage');
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: async () => spkHtml, inspectDocument: async () => ({ ...await inspectDocument(), extractedAt: '2026-10-03T08:00:00.000Z', documentHash: hash('changed-pdf') }), collectAnnouncements: false, collectKap: false, collectFeeds: async () => ({ items: [], sources: {} }), now: '2026-10-03T08:00:00.000Z' });
  const corrected = await getMarketNews({ database: db, now: '2026-10-03T08:00:00.000Z' });
  assert.equal(db.rows.get('market_sources_v1').value.items.length, 2, 'a changed official PDF appends a version without erasing the original');
  assert.equal(corrected.groups.bist[0].document.documentHash, hash('changed-pdf'), 'the feed shows latest evidence while the ledger preserves both versions');
  const announcementDb = database();
  const announcement = { id: 'spk-announcement:fixture:hash1', market: 'bist', type: 'regulatory_announcement', title: 'Tasfiye süresine ilişkin basın duyurusu',
    url: 'https://spk.gov.tr/duyurular/basin-duyurulari/2026/tasfiye-suresi', source: 'SPK', sourceId: 'spk_announcements', kind: 'primary',
    publishedDate: '2026-09-28', publishedAt: null, observedAt: NOW, contentHash: hash('announcement1'), evidence: 'Kurul süre düzenlemesine ilişkin açıklama yaptı.',
    evidenceStatus: 'official_announcement_text', statementType: 'regulatory_measure_announcement', impactScope: 'announcement_evidence_only', manualReviewRequired: true, legalEffect: 'not_assessed' };
  const emptyMacroNews = { items: [], sources: {}, checkedAt: NOW, status: 'available' };
  await refreshMarketNews({ collectCompanyIr: false, database: announcementDb, collectAnnouncements: async () => ({ ...emptyMacroNews, sourceUrl: 'https://spk.gov.tr/duyurular/basin-duyurulari/2026', items: [announcement] }), collectKap: false, collectFeeds: false, fetchText: async () => spkHtml, documentLimit: 0, now: NOW });
  await refreshMarketNews({ collectCompanyIr: false, database: announcementDb, collectAnnouncements: async () => ({ ...emptyMacroNews, checkedAt: '2026-10-02T09:00:00.000Z', status: 'unavailable', errorCode: 'source_unavailable', failures: [{ scope: 'detail', errorCode: 'source_unavailable' }] }), collectKap: false, collectFeeds: false, fetchText: async () => { throw new Error('offline'); }, documentLimit: 0, now: '2026-10-02T09:00:00.000Z' });
  const announcementView = await getMarketNews({ database: announcementDb, now: '2026-10-02T09:00:00.000Z' });
  assert.ok(announcementView.groups.bist.some((x) => x.id === announcement.id), 'last good announcement remains visible during source outage');
  assert.equal(announcementView.sources.spk_announcements.status, 'unavailable');
  assert.equal(announcementDb.rows.get('market_sources_v1').value.items.filter((x) => x.sourceId === 'spk_announcements').length, 1);
  const empty = await handleIntelligence({ method: 'GET' }, { database: database(), now: NOW }); assert.equal(empty.status, 200); assert.equal(empty.body.status, 'not_initialized');
  assert.equal((await handleIntelligence({ method: 'POST' }, { database: db })).status, 405);
  const handler = require('../api/report');
  const liveDb = require('../src/db'); const originalRead = liveDb.getCache;
  const OriginalDate = global.Date;
  let routeStatus, routeBody;
  const response = { setHeader() {}, status(value) { routeStatus = value; return this; }, json(value) { routeBody = value; return this; } };
  try {
    // The route reads the current clock; keep it inside the fixture's pre-release window.
    global.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [NOW])); }
      static now() { return OriginalDate.parse(NOW); }
    };
    liveDb.getCache = async (key) => key === 'macro_event_ledger_v1' ? scheduleDb.getCache(key) : key === 'market_sources_v1' ? db.getCache(key) : null;
    await handler({ method: 'GET', url: '/api/report?resource=macro' }, response);
    assert.equal(routeStatus, 200); assert.equal(routeBody.nextEvent.period, '2026-09');
    await handler({ method: 'GET', query: { resource: 'market-news' }, url: '/api/report' }, response);
    assert.equal(routeStatus, 200); assert.equal(routeBody.groups.bist.length, 1);
    await handler({ method: 'POST', url: '/api/report?resource=macro' }, response);
    assert.equal(routeStatus, 405);
    for (const resource of ['macro', 'market-news']) assert.ok(require('../vercel.json').rewrites.some((x) => x.source === '/api/' + resource && x.destination === '/api/report?resource=' + resource));
  } finally { liveDb.getCache = originalRead; global.Date = OriginalDate; }
  const unavailable = await handleIntelligence({ method: 'GET' }, { database: { getCache: async () => { throw new Error('offline'); } } }); assert.equal(unavailable.status, 503);
  const silent = database(); silent.drop();
  await assert.rejects(() => updateStore('test', { schemaVersion: 1, n: 0 }, (current) => ({ ...current, n: 1 }), silent), /verified/);

  const priorNfp = { metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-08', value: 100,
    vintage: 'first_release', publishedAt: '2026-08-07T12:30:00.000Z', observedAt: '2026-08-07T12:35:00.000Z',
    sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_08072026.htm', contentHash: hash('prior-nfp') };
  const scoreLedger = createMacroEventLedger({ observations: [priorNfp] });
  const frozenForecast = scoreLedger.createForecast({ event: events[3], methodId: METHODS.last_observation,
    createdAt: NOW, knowledgeCutoff: NOW });
  const actualNfp = { metric: frozenForecast.metric, unit: frozenForecast.unit, period: frozenForecast.period, value: 110,
    vintage: 'first_release', publishedAt: RELEASE, observedAt: '2026-10-02T12:33:00.000Z',
    sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_10022026.htm', contentHash: hash('actual-nfp') };
  scoreLedger.resolveOutcome({ event: events[3], observation: actualNfp, resolvedAt: '2026-10-02T12:34:00.000Z' });
  const snapshot = scoreLedger.snapshot();
  const provenanceBase = { forecastId: frozenForecast.forecastId, createdAt: frozenForecast.createdAt, knowledgeCutoff: frozenForecast.knowledgeCutoff,
    inputObservationIds: frozenForecast.inputObservationIds, inputVerificationIds: [], expectedInputCount: 1, verifiedInputCount: 0, status: 'not_attested' };
  const withoutProof = macroPayload({ ...macroInitial, ...snapshot, events: [events[3]], forecastProvenance: [provenanceBase],
    forecastProvenanceIssues: [] }, {}, '2026-10-03T00:00:00.000Z');
  assert.equal(withoutProof.forecasts[0].estimate, 100, 'raw frozen estimate remains visible');
  assert.equal(withoutProof.outcomes[0].actual, 110, 'raw first-release outcome remains visible');
  assert.equal(withoutProof.forecasts[0].chronologyStatus, 'not_attested');
  const noProofScore = withoutProof.scorecards.find((item) => item.methodId === METHODS.last_observation);
  assert.equal(noProofScore.n, 0, 'unattested forecasts do not enter performance scorecards');
  assert.equal(noProofScore.excludedCount, 1);
  assert.ok(noProofScore.excludedReasons.includes('provenance_not_attested'));
  assert.deepEqual(noProofScore.excludedForecastIds, [frozenForecast.forecastId]);

  const verified = macroPayload({ ...macroInitial, ...snapshot, events: [events[3]], forecastProvenance: [{ ...provenanceBase,
    inputVerificationIds: ['verification-proof'], expectedInputCount: 1, verifiedInputCount: 1, status: 'verified' }], forecastProvenanceIssues: [] }, {}, '2026-10-03T00:00:00.000Z');
  const verifiedScore = verified.scorecards.find((item) => item.methodId === METHODS.last_observation);
  assert.equal(verifiedScore.n, 1, 'verified forecasts remain scoreable');
  assert.equal(verifiedScore.mae, 10);
  assert.equal(verifiedScore.excludedCount, 0);

  console.log('Independent intelligence lifecycle tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
