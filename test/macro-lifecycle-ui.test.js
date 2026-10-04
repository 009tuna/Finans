'use strict';

const assert = require('node:assert/strict');
const macro = require('../public/macro');

const event = {
  eventId: 'us_nonfarm_payroll_change:2026-09', metric: 'us_nonfarm_payroll_change',
  unit: 'thousand_jobs', period: '2026-09', scheduledAt: '2026-10-02T12:30:00Z',
};
const first = {
  ...event, id: 'first', pointEstimate: 100, recordedAt: '2026-10-01T10:00:00Z',
  knowledgeCutoff: '2026-10-01T09:00:00Z', sourceEvidence: [{ id: 'data', url: 'https://www.bls.gov/news.release/empsit.htm', publishedAt: '2026-09-01T12:30:00Z' }],
};
const review = {
  ...first, id: 'later', reviewOnly: true, originalForecastId: 'first', pointEstimate: 90,
  recordedAt: '2026-10-02T11:00:00Z', knowledgeCutoff: '2026-10-02T10:00:00Z',
};
const result = {
  ...event, forecastId: 'first', value: 0, vintage: 'first_release',
  verification: 'bls-official-first-release', sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_10022026.htm',
  publishedAt: event.scheduledAt, observedAt: '2026-10-02T12:31:00Z',
};
const data = { events: [event], modelForecasts: [first], modelForecastReviews: [review], modelOutcomes: [result] };
const before = Date.parse('2026-10-02T12:00:00Z');
const after = Date.parse('2026-10-02T13:00:00Z');
const build = (value = data, at = after) => macro.buildMacroLifecycle(value, event, event.metric, event.unit, at);

assert.equal(build(data, before).state, 'upcoming');
assert.equal(build(data, before).actual, null, 'future observations must not leak into the prerelease view');
assert.equal(build().state, 'recorded');
assert.equal(build().first.pointEstimate, 100);
assert.equal(build().latest.pointEstimate, 90);
assert.equal(build().actual.value, 0, 'a measured zero is preserved');
assert.equal(first.pointEstimate, 100, 'the lifecycle view cannot overwrite the frozen first forecast');

const withoutResult = build({ ...data, modelOutcomes: [] });
assert.equal(withoutResult.state, 'awaiting_result', 'the release clock alone never proves the outcome');
assert.equal(withoutResult.actual, null);
for (const change of [
  { metric: 'wrong' }, { unit: 'percent' }, { period: '2026-08' }, { eventId: 'wrong' },
  { scheduledAt: '2026-10-02T12:31:00Z' }, { recordedAt: event.scheduledAt },
  { scheduledAt: '2026-10-02' }, { scheduledAt: '2026-10-02T12:30:00' },
  { recordedAt: '2026-10-01' }, { recordedAt: '2026-10-01T10:00:00' },
  { createdAt: '2026-10-01T11:00:00Z' }, { createdAt: event.scheduledAt },
  { createdAt: '2026-10-01' }, { createdAt: '2026-10-01T09:00:00' },
  { knowledgeCutoff: '2026-10-01' }, { knowledgeCutoff: '2026-10-01T09:00:00' },
  { knowledgeCutoff: '2026-10-02T13:00:00Z' }, { sourceEvidence: [] },
  { sourceEvidence: [{ url: 'https://example.com/date-only', publishedAt: '2026-09-01' }] },
  { sourceEvidence: [{ url: 'https://example.com/no-zone', publishedAt: '2026-09-01T12:00:00' }] },
  { sourceEvidence: [{ url: 'https://example.com/date-only-access', publishedAt: '2026-09-01T12:00:00Z', observedAt: '2026-09-02' }] },
  { sourceEvidence: [{ url: 'https://example.com/post-release', publishedAt: '2026-10-02T13:00:00Z' }] },
  { sourceEvidence: [{ url: 'https://example.com/future-access', publishedAt: '2026-09-01T12:30:00Z', observedAt: '2026-10-02T13:00:00Z' }] },
]) {
  assert.equal(build({ ...data, modelForecasts: [{ ...first, ...change }] }).first, null, 'first estimate requires exact identity and eligible source cutoff: ' + JSON.stringify(change));
}
for (const change of [
  { metric: 'wrong' }, { unit: 'percent' }, { period: '2026-08' }, { eventId: 'wrong' },
  { scheduledAt: '2026-10-02T12:31:00Z' }, { originalForecastId: 'another-first' },
  { recordedAt: event.scheduledAt }, { knowledgeCutoff: '2026-10-02T13:00:00Z' },
]) {
  assert.equal(build({ ...data, modelForecastReviews: [{ ...review, ...change }] }).latest, null, 'later opinions cannot cross event or cutoff identity');
}
for (const change of [
  { metric: 'wrong' }, { unit: 'percent' }, { period: '2026-08' }, { eventId: 'wrong' },
  { scheduledAt: '2026-10-02T12:31:00Z' }, { vintage: 'revision' }, { value: null }, { verification: 'human-reviewed' },
  { observedAt: '2026-10-03T13:00:00Z' }, { observedAt: '2026-10-02T12:00:00Z' },
  { publishedAt: '2026-10-01T12:30:00Z' }, { sourceUrl: 'javascript:alert(1)' },
  { publishedAt: '2026-10-02' }, { publishedAt: '2026-10-02T12:30:00' },
  { observedAt: '2026-10-02' }, { observedAt: '2026-10-02T12:31:00' },
]) {
  assert.equal(build({ ...data, modelOutcomes: [{ ...result, ...change }] }).actual, null, 'only an exact first-release observation can complete the lifecycle');
}

const html = macro.renderMacroLifecycle(data, event, event.metric, event.unit, after);
assert.match(html, /İlk kilitli tahmin[\s\S]*100 bin kişi[\s\S]*Son açıklama öncesi görüş[\s\S]*90 bin kişi[\s\S]*İlk açıklanan sonuç[\s\S]*0 bin kişi/);
assert.match(html, /Sonraki görüş ilk tahminin yerine geçmez/);
assert.match(macro.renderMacroLifecycle({ ...data, modelOutcomes: [] }, event, event.metric, event.unit, after), /Açıklama saati geçti; ilk sonuç henüz doğrulanamadı/);
assert.equal(macro.displayPayrollEvent({ events: [event] }, after), event, 'the completed or awaiting-result event remains reachable after the clock passes');
assert.equal(macro.matchPayrollEvent({ events: [event] }, after), null, 'the public upcoming-event helper retains its original semantics');

const cpiEvent = { eventId: 'us_cpi:2026-09', period: event.period, scheduledAt: event.scheduledAt };
const metric = 'us_cpi_headline_mom_sa';
const cpiFirst = { ...first, ...cpiEvent, metric, unit: 'percent', pointEstimate: 0.2 };
const cpiReview = { ...review, ...cpiEvent, metric, unit: 'percent', pointEstimate: 0.3 };
const cpiResult = { ...result, ...cpiEvent, metric, unit: 'percent', value: 0.1 };
const cpiData = { events: [cpiEvent], metrics: [{ metric, modelForecasts: [cpiFirst], modelForecastReviews: [cpiReview], modelOutcomes: [cpiResult] }], sourceStatus: { status: 'available' } };
assert.equal(macro.displayCpiEvent(cpiData, after), cpiEvent);
const cpiHtml = macro.renderCpi(cpiData, metric, after);
assert.match(cpiHtml, /İlk kilitli tahmin[\s\S]*0,2%[\s\S]*Son açıklama öncesi görüş[\s\S]*0,3%[\s\S]*İlk açıklanan sonuç[\s\S]*0,1%/);

const shared = { type: 'company_news', title: 'Shared headline', url: 'https://example.com/news?a=1&utm_source=feed', publishedAt: '2026-10-01T12:00:00Z', symbol: 'MSFT', sourceUrl: 'https://example.com/provider/msft', evidence: 'First evidence.' };
const other = { ...shared, title: '  SHARED   headline ', url: 'https://example.com/news?utm_source=other&a=1#top', symbol: 'AAPL', sourceUrl: 'https://example.com/provider/aapl', evidence: 'Second evidence.' };
const grouped = macro.deduplicateNewsItems([shared, other]);
assert.equal(grouped.length, 1);
assert.deepEqual(grouped[0].relatedSymbols, ['MSFT', 'AAPL']);
assert.equal(grouped[0].groupedSourceUrls.length, 4, 'all original article/provider URLs survive grouping');
assert.equal(grouped[0].groupedRecords.length, 2, 'evidence records survive deduplication');
assert.equal(macro.deduplicateNewsItems([shared, { ...other, publishedAt: '2026-10-02T12:00:00Z' }]).length, 2, 'a different publication time cannot be merged');
assert.equal(macro.deduplicateNewsItems([shared, { ...other, title: 'Different headline' }]).length, 2, 'same URL with another headline remains separate');
const newsHtml = macro.renderMarketNews({ groups: { us: [shared, other] } }, 'marketNewsWorkspace');
assert.equal((newsHtml.match(/class="market-news-item"/g) || []).length, 1);
assert.match(newsHtml, /MSFT · AAPL/);
assert.match(newsHtml, /First evidence[\s\S]*Second evidence/);
assert.match(newsHtml, /fiyat etkisi veya şirket ilişkisi kanıtı değildir/);
assert.equal(shared.relatedSymbols, undefined, 'raw provider records are not mutated');

console.log('Macro lifecycle and provider-news grouping tests passed');
