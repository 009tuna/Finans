'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExpectationLifecycle, storedExpectations, expectationsHtml, nextUpcomingExpectation, researchHtml, evaluationHtml } = require('../public/research');

const before = '2026-10-01T06:00:00Z';
const release = '2026-10-02T12:30:00Z';
const after = '2026-10-04T06:00:00Z';
const source = { id: 'source', title: 'Synthetic first-release input', evidence: 'Synthetic dated evidence.', kind: 'primary', url: 'https://example.com/input', publishedAt: '2026-09-04T12:30:00Z' };
const first = { id: 'locked-first', market: 'us', symbol: '', eventId: 'payroll:2026-09', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-09', scheduledAt: release,
  pointEstimate: 0, consensus: null, recordedAt: '2026-09-29T06:05:00Z', knowledgeCutoff: '2026-09-29T06:00:00Z', sourceIds: ['source'], sourceEvidence: [source] };
const review = { ...first, id: 'review', pointEstimate: 20, recordedAt: '2026-09-30T06:05:00Z', knowledgeCutoff: '2026-09-30T06:00:00Z' };
const result = { forecastId: first.id, metric: first.metric, unit: first.unit, period: first.period, value: 0, publishedAt: release,
  recordedAt: '2026-10-02T12:40:00Z', observedAt: '2026-10-02T12:35:00Z', sourceUrl: 'https://example.com/release', verification: 'bls-official-first-release', vintage: 'first_release' };
const research = { generatedAt: before, analysisAsOf: before, sources: [source], forecasts: [], forecastAbstentions: [] };
function lifecycle(macro, patch = {}, options = {}) {
  const storedOpinions = storedExpectations(macro, before);
  return buildExpectationLifecycle({ ...research, ...patch }, { now: after, storedOpinions, ...options });
}

test('same release displays frozen first, last eligible prerelease view and actual without modifying samples', () => {
  const future = { ...review, pointEstimate: 900, recordedAt: '2026-10-01T07:00:00Z', knowledgeCutoff: '2026-10-01T06:59:00Z' };
  const macro = { modelForecasts: [first], modelForecastReviews: [review, future], modelOutcomes: [result] };
  const copy = structuredClone(macro), rows = lifecycle(macro);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].firstOpinion.pointEstimate, 0);
  assert.equal(rows[0].latestOpinion.pointEstimate, 20);
  assert.equal(rows[0].outcome.value, 0);
  assert.equal(rows[0].status, 'resolved');
  const html = expectationsHtml(research, { now: after, storedOpinions: storedExpectations(macro, before) });
  assert.match(html, /Sonuç kaydı var/);
  assert.match(html, /İlk kilitli tahmin<\/span><b>0 bin kişi/);
  assert.match(html, /Son uygun açıklama öncesi görüş<\/span><b>20 bin kişi/);
  assert.match(html, /İlk açıklanan sonuç<\/span><b>0 bin kişi/);
  assert.doesNotMatch(html, /900 bin/);
  assert.deepEqual(macro, copy);
});

test('release time passing stays awaiting-outcome, never a zero result', () => {
  const rows = lifecycle({ modelForecasts: [first] });
  assert.equal(rows[0].status, 'awaiting-outcome');
  assert.equal(rows[0].outcome, null);
  const html = expectationsHtml(research, { now: after, storedOpinions: storedExpectations({ modelForecasts: [first] }, before) });
  assert.match(html, /Saatin geçmesi gerçekleşen verinin alındığını göstermez/);
  assert.match(html, /Sonuç kaydı yok/);
  assert.doesNotMatch(html, /İlk açıklanan sonuç/);
});

test('result needs exact immutable forecast binding, metric, period, unit, timing and source', () => {
  const invalid = [
    { forecastId: 'some-other-forecast' }, { metric: 'us_cpi_core_mom_sa' }, { period: '2026-08' }, { unit: 'jobs' },
    { market: 'bist' }, { eventId: 'other-event' }, { scheduledAt: '2026-10-02T12:31:00Z' },
    { value: null }, { value: '0' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:pass@example.com/release' },
    { publishedAt: '2026-10-02' }, { publishedAt: '2026-10-02T12:29:00Z' }, { recordedAt: '2026-10-02T12:29:00Z' }, { observedAt: '2026-10-02T12:29:00Z' },
    { recordedAt: '2026-10-05T00:00:00Z' }, { vintage: 'revised' }, { contested: true }, { stale: true }, { verification: 'unknown' },
  ];
  for (const patch of invalid) {
    const rows = lifecycle({ modelForecasts: [first], modelOutcomes: [{ ...result, ...patch }] });
    assert.equal(rows[0].outcome, null, JSON.stringify(patch));
    assert.equal(rows[0].status, 'awaiting-outcome');
  }
  assert.equal(lifecycle({ modelForecasts: [first], previousObservation: { ...result, value: 0 } })[0].outcome, null, 'previous-period baseline cannot become actual');
});

test('provider and reviewed outcomes explain their provenance instead of promising first-release vintage', () => {
  for (const verification of ['provider-first-observed', 'human-reviewed']) {
    const macro = { modelForecasts: [first], modelOutcomes: [{ ...result, verification, vintage: undefined }] };
    const rows = lifecycle(macro);
    assert.equal(rows[0].status, 'resolved');
    const html = expectationsHtml(research, { now: after, storedOpinions: storedExpectations(macro, before) });
    assert.match(html, /Kaydedilen sonuç<\/span><b>0 bin kişi/);
    assert.doesNotMatch(html, /İlk açıklanan sonuç/);
  }
});

test('review-only evidence cannot impersonate a locked first forecast', () => {
  const rows = lifecycle({ modelForecastReviews: [review], modelOutcomes: [{ ...result, forecastId: review.id }] });
  assert.equal(rows[0].firstOpinion, null);
  assert.equal(rows[0].latestOpinion.pointEstimate, 20);
  assert.equal(rows[0].outcome, null);
});

test('explicit abstention preserves earlier first without making a new numeric scored record', () => {
  const patch = { forecastAbstentions: [{ market: first.market, metric: first.metric, unit: first.unit, period: first.period, scheduledAt: first.scheduledAt,
    reason: 'Synthetic missing evidence', missingEvidence: ['Dated input'], sourceIds: [] }] };
  const rows = lifecycle({ modelForecasts: [first] }, patch);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'abstention');
  assert.equal(rows[0].firstOpinion.pointEstimate, 0);
  assert.equal(rows[0].event.available, false);
});

test('next event is an actual future calendar row; missing date, past event and raw late view cannot invent one', () => {
  const cpi = { ...first, id: 'cpi-first', eventId: 'cpi:2026-09', metric: 'us_cpi_core_mom_sa', unit: 'percent', pointEstimate: 0.3, scheduledAt: '2026-10-14T12:30:00Z' };
  const options = { now: after, storedOpinions: storedExpectations({ modelForecasts: [first], families: { us_cpi: { modelForecasts: [cpi] } } }, before) };
  const next = nextUpcomingExpectation(research, options);
  assert.equal(next.metric, cpi.metric);
  assert.equal(next.scheduledAt, cpi.scheduledAt);
  assert.equal(next.label, 'TÜFE · çekirdek / aylık');
  assert.equal(nextUpcomingExpectation(research, { now: after, storedOpinions: storedExpectations({ modelForecasts: [first] }, before) }), null);
  assert.equal(nextUpcomingExpectation({ ...research, forecasts: [{ ...cpi, scheduledAt: null }] }, { now: after }), null);
  assert.equal(nextUpcomingExpectation({ ...research, generatedAt: '2026-10-15T12:30:00Z', forecasts: [cpi] }, { now: after }), null);
});

test('different events or symbols cannot lend their frozen estimate to the report', () => {
  const raw = { ...first, id: undefined, pointEstimate: 8, sourceEvidence: undefined };
  for (const patch of [{ eventId: 'another-event' }, { symbol: 'MSFT' }, { period: '2026-08' }, { unit: 'percent' }, { scheduledAt: '2026-10-02T12:31:00Z' }]) {
    const rows = lifecycle({ modelForecasts: [first] }, { forecasts: [{ ...raw, ...patch }] });
    const entry = rows.find(row => row.event.pointEstimate === 8);
    assert.equal(entry.firstOpinion, null, JSON.stringify(patch));
    assert.equal(entry.outcome, null);
  }
});

test('a raw report cannot borrow its capture time to disguise a contradictory knowledge cutoff', () => {
  for (const patch of [{ knowledgeCutoff: '2026-10-01T07:00:00Z' }, { knowledgeCutoff: '2026-10-01' }, { createdAt: '2026-10-01T05:59:00Z', recordedAt: '2026-10-01T05:58:00Z' }]) {
    const rows = buildExpectationLifecycle({ ...research, forecasts: [{ ...first, ...patch, sourceEvidence: undefined }] }, { now: after });
    assert.equal(rows.length, 0, JSON.stringify(patch));
  }
  assert.deepEqual(buildExpectationLifecycle({ ...research, sources: {}, forecasts: [null], forecastAbstentions: [null] }, { now: after }), []);
});

test('the four-question story links scenarios by explicit event and market and retains unmatched evidence', () => {
  const data = { generatedAt: before, sources: [source], events: [{ id: 'event-a', market: 'us', title: 'Synthetic event', whatChanged: 'Observed change', expectationGap: 'Recorded gap', counterEvidence: 'Counter evidence', sourceIds: ['source'] }],
    scenarios: [ { eventId: 'event-a', market: 'us', symbol: 'MSFT', condition: 'Matched condition', impact: 'Matched impact', invalidation: 'Matched invalidation', sourceIds: ['source'] },
      { eventId: 'other-event', market: 'us', symbol: 'MSFT', condition: 'Unmatched condition', impact: 'Unmatched impact', invalidation: 'Unmatched invalidation', sourceIds: ['source'] } ] };
  const html = researchHtml(data), copy = structuredClone(data);
  for (const question of ['Ne oldu?', 'Neden önemli?', 'Hangi koşulda etkiler?', 'Neyi izlemeli?']) assert.ok(html.includes(question));
  const story = html.match(/<dl class="research-story">([\s\S]*?)<\/dl>/)[1];
  assert.match(story, /Matched condition/);
  assert.doesNotMatch(story, /Unmatched condition/);
  assert.match(html, /Unmatched condition/);
  assert.equal((html.match(/Matched condition/g) || []).length, 1, 'attached scenario is not repeated below the same story');
  assert.deepEqual(data, copy);
});

test('measurement history displays the same pending/result distinctions and rejects a mismatched actual', () => {
  const data = { forecasts: [first], forecastReviews: [review], outcomes: [] };
  assert.match(evaluationHtml(data, { now: before }), /Açıklama bekleniyor/);
  assert.match(evaluationHtml(data, { now: after }), /Saati geçti · sonuç doğrulanamadı/);
  const valid = evaluationHtml({ ...data, outcomes: [result] }, { now: after });
  assert.match(valid, /Sonuç kaydı var/);
  assert.match(valid, /İlk kilitli tahmin<\/span><b>0 bin kişi/);
  assert.match(valid, /Son uygun açıklama öncesi görüş<\/span><b>20 bin kişi/);
  const invalid = evaluationHtml({ ...data, outcomes: [{ ...result, period: '2026-08', value: 999 }] }, { now: after });
  assert.doesNotMatch(invalid, /999|Sonuç kaydı var/);
  assert.match(invalid, /Sonuç kaydı ölçümle eşleşmedi/);
  assert.match(invalid, /Saati geçti · sonuç doğrulanamadı/);
  assert.deepEqual(data.outcomes, []);
});
