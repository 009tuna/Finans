'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { expectationsHtml, storedExpectations } = require('../public/research');

// Synthetic research snapshots. The formatter must describe their stored
// opinions truthfully; it must not invent consensus, timing or performance.
const CAPTURED = '2026-10-01T06:00:00Z';
const BEFORE_RELEASE = '2026-10-02T10:00:00Z';
const RELEASE = '2026-10-02T12:30:00Z';
const AFTER_RELEASE = '2026-10-02T13:00:00Z';
const sources = [
  { id: 'consensus', title: 'Synthetic survey', url: 'https://example.com/consensus', kind: 'secondary', evidence: 'Synthetic survey only.', publishedAt: '2026-09-28T12:00:00Z' },
  { id: 'evidence', title: 'Synthetic dated evidence', url: 'https://example.com/evidence', kind: 'primary', evidence: 'Synthetic dated input only.', publishedAt: '2026-09-28T12:00:00Z' },
];
const payroll = {
  eventId: 'us_nonfarm_payroll_change:2026-09', market: 'us', symbol: '',
  metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-09',
  scheduledAt: RELEASE, pointEstimate: 250, consensus: 210,
  consensusSourceId: 'consensus', sourceIds: ['evidence'],
  rationale: 'Hiring evidence is firmer than the recorded survey baseline.',
};
const research = (forecasts = [payroll], extra = {}) => ({
  generatedAt: CAPTURED, forecasts: forecasts.map((forecast) => ({ ...forecast })),
  sources: sources.map((source) => ({ ...source })), forecastAbstentions: [], ...extra,
});
const render = (data, options = {}) => expectationsHtml(data, { now: BEFORE_RELEASE, ...options });
const entries = (html) => [...html.matchAll(/<article\b[^>]*class="[^"]*\bexpectation-entry\b[^>]*>/g)].length;
function numberFor(html, label) {
  const match = html.match(new RegExp('<dt>' + label + '</dt>\\s*<dd>([\\s\\S]*?)</dd>'));
  assert.ok(match, `readable numeric label exists: ${label}`);
  return match[1].replace(/<[^>]*>/g, '');
}

test('morning report exposes model, consensus and difference as separate values with event time', () => {
  const data = research();
  const previous = structuredClone(data);
  const html = render(data);
  assert.equal(entries(html), 1);
  assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
  assert.equal(numberFor(html, 'Piyasa konsensüsü'), '210 bin kişi');
  assert.equal(numberFor(html, 'Konsensüsten farkı'), '+40 bin kişi');
  assert.match(html, /Tarım dışı istihdam/);
  assert.match(html, /2026-09 dönemi/);
  assert.match(html, /15:30/, 'release is readable in Istanbul time rather than raw UTC');
  assert.match(html, /Rapor görüşü/);
  assert.doesNotMatch(html, /Açıklama saati geçti/);
  assert.deepEqual(data, previous, 'presentation must not rewrite the stored research snapshot');
});

test('zero model estimates and zero consensus stay numeric, including a zero difference', () => {
  const html = render(research([{ ...payroll, pointEstimate: 0, consensus: 0 }]));
  assert.equal(entries(html), 1);
  assert.equal(numberFor(html, 'Model görüşü'), '0 bin kişi');
  assert.equal(numberFor(html, 'Piyasa konsensüsü'), '0 bin kişi');
  assert.equal(numberFor(html, 'Konsensüsten farkı'), '0 bin kişi');
  assert.doesNotMatch(html, /Tahmin üretilemedi|Konsensüs yok/);
});

test('unavailable independent calendar is visible beside model opinions and does not imply no future event', () => {
  const html = render(research([payroll], { expectationCoverage: [
    { family: 'us_nonfarm_payroll_change', status: 'unavailable', reason: 'Bağımsız takvim kaynağı okunamadı.', scope: 'independent_calendar', checkedAt: CAPTURED },
    { family: 'us_cpi', status: 'no_upcoming_release', reason: 'Kontrol edilen 14 günlük pencerede açıklama yok.', scope: 'independent_calendar', checkedAt: CAPTURED },
  ] }));
  assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
  assert.match(html, /İstihdam takvimi.*kaynağı okunamadı/);
  assert.match(html, /TÜFE takvimi.*14 günlük pencerede açıklama yok/);
  assert.match(html, /Kontrol:/);
  assert.doesNotMatch(html, /sayısal model görüşü yok/);
  const available = render(research([payroll], { expectationCoverage: [{ family: 'us_cpi', status: 'available', reason: 'Kaynak alındı', scope: 'independent_calendar', checkedAt: CAPTURED }] }));
  assert.doesNotMatch(available, /expectation-coverage/);
});

test('a deadline-crossing abstention preserves its pre-release context without becoming a forecast', () => {
  const html = expectationsHtml(research([], { generatedAt: AFTER_RELEASE, analysisAsOf: CAPTURED,
    forecastAbstentions: [{ ...payroll, reason: 'Kaynak akışı tamamlanmadı.', missingEvidence: ['Güncel istihdam bileşenleri'] }] }), { now: AFTER_RELEASE });
  assert.equal(entries(html), 1);
  assert.match(html, /Tahmin üretilemedi/);
  assert.match(html, /Açıklama saati geçti/);
  assert.doesNotMatch(html, /<dt>Model görüşü/);
  const late = expectationsHtml(research([], { generatedAt: AFTER_RELEASE, analysisAsOf: AFTER_RELEASE,
    forecastAbstentions: [{ ...payroll, reason: 'Geç kayıt', missingEvidence: [] }] }), { now: AFTER_RELEASE });
  assert.equal(entries(late), 0, 'post-release context cannot masquerade as a pre-release decision');
});

test('an unchanged reassessment shows its own dated reason and sources alongside the stored opinion', () => {
  const oldSource = { id: 'old', title: 'Original evidence', url: 'https://example.com/original', kind: 'primary', evidence: 'Synthetic original numeric input.', publishedAt: '2026-09-28T12:00:00Z' };
  const html = render(research([], { analysisAsOf: CAPTURED, expectationReassessments: [{ ...payroll, status: 'unchanged', reason: 'Yeni bileşenleri inceledim; yön değişimi için yeterli kanıt yok.', sourceIds: ['evidence'] }] }), {
    storedOpinions: [{ ...payroll, recordedAt: CAPTURED, knowledgeCutoff: CAPTURED, originalPointEstimate: 250, sourceIds: ['old'], sourceEvidence: [oldSource] }],
  });
  assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
  assert.equal(entries(html), 1, 'reassessment is not an extra numeric forecast');
  assert.match(html, /yeniden incelendi ve korundu/);
  assert.match(html, /Yeni bileşenleri inceledim/);
  assert.match(html, /Original evidence/);
  assert.match(html, /Değerlendirme kaynakları:.*Synthetic dated evidence/);
});

test('missing consensus never becomes zero or produces a fabricated numeric gap', () => {
  for (const consensus of [null, undefined, '210', NaN]) {
    const html = render(research([{ ...payroll, consensus }]));
    assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
    assert.equal(numberFor(html, 'Piyasa konsensüsü'), 'Bu dönem için doğrulanamadı');
    assert.match(numberFor(html, 'Konsensüsten farkı'), /Bu dönem için konsensüs doğrulanamadı/);
    assert.doesNotMatch(html, /Konsensüs kaynağı:/, 'no consensus source is claimed when its value is absent');
  }
});

test('percentage estimates retain percent units but their difference uses percentage points', () => {
  const html = render(research([{
    ...payroll, metric: 'us_cpi_headline_mom_sa', unit: 'percent',
    pointEstimate: 0.3, consensus: 0.2,
  }]));
  assert.equal(numberFor(html, 'Model görüşü'), '0,3%');
  assert.equal(numberFor(html, 'Piyasa konsensüsü'), '0,2%');
  assert.match(numberFor(html, 'Konsensüsten farkı'), /^\+0,1 (?:yüzde )?puan$/);
  assert.doesNotMatch(html, /% puan/, 'a difference must not be presented as a percentage of the consensus');
});

test('rationale and source labels are escaped; unsafe URLs do not turn into clickable evidence', () => {
  const html = render(research([{
    ...payroll,
    rationale: '<img src=x onerror="alert(1)"> Hiring & wages are uncertain.',
    sourceIds: ['evidence', 'unsafe'],
  }], {
    sources: [
      { ...sources[0], title: '<script>bad consensus</script>' },
      { ...sources[1], title: 'Evidence "quoted" <svg onload=alert(1)>' },
      { id: 'unsafe', title: '<b>Unsafe protocol</b>', url: 'javascript:alert(1)' },
    ],
  }));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /Hiring &amp; wages/);
  assert.match(html, /&lt;script&gt;bad consensus&lt;\/script&gt;/);
  assert.match(html, /Evidence &quot;quoted&quot; &lt;svg/);
  assert.match(html, /&lt;b&gt;Unsafe protocol&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<img|<script|<svg|href="javascript:/);
  assert.match(html, /href="https:\/\/example\.com\/evidence"/);
  assert.match(html, /Gerekçe ve kaynaklar/);
});

test('unknown or imprecise capture/release times cannot imply an announcement-before forecast', () => {
  for (const generatedAt of [undefined, null, '', 'unknown', '2026-10-01']) {
    const html = render(research([payroll], { generatedAt }));
    assert.equal(entries(html), 0, `capture time requires an unambiguous instant: ${generatedAt}`);
    assert.doesNotMatch(html, /<dd>250 bin kişi/);
    assert.match(html, /model raporu bekleniyor|sayısal model görüşü yok/i);
  }
  for (const scheduledAt of [undefined, null, '', 'unknown', '2026-10-02']) {
    const html = render(research([{ ...payroll, scheduledAt }]));
    assert.equal(entries(html), 0, `release time requires an unambiguous instant: ${scheduledAt}`);
  }
});

test('numbers generated at or after release are not advertised as pre-release forecasts', () => {
  for (const generatedAt of [RELEASE, AFTER_RELEASE]) {
    const html = render(research([payroll], { generatedAt }), { now: AFTER_RELEASE });
    assert.equal(entries(html), 0, 'post-release generation cannot manufacture an earlier opinion');
    assert.doesNotMatch(html, /<dd>250 bin kişi/);
    assert.match(html, /açıklama öncesi sayısal model görüşü yok/);
  }
});

test('contradictory row creation times cannot borrow an earlier report timestamp', () => {
  for (const timeField of ['createdAt', 'recordedAt']) {
    const html = render(research([{ ...payroll, [timeField]: AFTER_RELEASE }]), { now: AFTER_RELEASE });
    assert.equal(entries(html), 0, `a row ${timeField} after release cannot be dressed as a forecast`);
  }
});

test('captured pre-release opinion remains clearly historical once its release time passes', () => {
  const html = render(research(), { now: AFTER_RELEASE });
  assert.equal(entries(html), 1, 'historical snapshot remains reviewable after release');
  assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
  assert.match(html, /Açıklama saati geçti/);
  assert.match(html, /raporun eski görüşüdür/);
  assert.doesNotMatch(html, /Güncel beklenti|Güncel model görüşü/, 'captured opinion must not acquire a current label');
  assert.match(html, /performans ilk tahmine göre ölçülür/, 'review presentation does not inflate the first scored forecast');
});

test('abstention gives a visible reason, missing evidence and source without inventing a number', () => {
  const data = research([], {
    forecastAbstentions: [{
      ...payroll, pointEstimate: undefined, consensus: undefined,
      reason: 'Dated employer survey is unavailable.',
      missingEvidence: ['Comparable first release', '<script>unsafe gap</script>'],
    }],
  });
  const html = render(data);
  assert.equal(entries(html), 1);
  assert.match(html, /Tahmin üretilemedi/);
  assert.match(html, /Dated employer survey is unavailable/);
  assert.match(html, /Eksik kanıt/);
  assert.match(html, /Comparable first release/);
  assert.match(html, /&lt;script&gt;unsafe gap&lt;\/script&gt;/);
  assert.match(html, /Synthetic dated evidence/);
  assert.doesNotMatch(html, /expectation-numbers|<dd>|NaN|undefined|<script>/);
});

test('compact view keeps two primary events and retains other measurements in a disclosure', () => {
  const data = research([
    { ...payroll, metric: 'last_metric', scheduledAt: '2026-10-06T12:30:00Z', rationale: 'Last event reason' },
    { ...payroll, metric: 'second_metric', scheduledAt: '2026-10-04T12:30:00Z', rationale: 'Second event reason' },
    { ...payroll, metric: 'first_metric', scheduledAt: '2026-10-03T12:30:00Z', rationale: 'First event reason' },
  ]);
  const html = render(data, { compact: true });
  assert.equal(entries(html), 3, 'all measurements remain reachable');
  const primaryHtml = html.slice(0, html.indexOf('<details class="observer-other-metrics">'));
  assert.equal(entries(primaryHtml), 2, 'only two primary events precede the disclosure');
  assert.ok(html.indexOf('first_metric') < html.indexOf('second_metric'), 'closest announcements appear first');
  assert.doesNotMatch(primaryHtml, /last_metric|Last event reason/);
  assert.match(html, /Diğer veri ölçümleri \(1\)/);
  assert.match(html, /Last event reason/);
  assert.match(html, /First event reason/);
  assert.match(html, /Second event reason/);
  assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi', 'compact view still exposes a model value without opening a disclosure');
  assert.match(html, /data-open-expectation-report>Raporu oku/);
  assert.doesNotMatch(html, /data-open-model-workspace|Tüm beklentiler/);
  const full = render(data);
  assert.equal(entries(full), 3, 'full morning report retains every captured expectation');
  assert.match(full, /Last event reason/, 'the report retains the complete reasons');
  assert.match(full, /data-open-model-workspace/, 'the full report still opens the detailed first/current comparison');
});

test('empty or nonnumeric research has an honest readable state instead of a fake forecast', () => {
  assert.equal(entries(render(null)), 0);
  assert.match(render(null), /Kaynaklı model raporu bekleniyor/);
  for (const pointEstimate of [null, undefined, NaN, Infinity, '250']) {
    const html = render(research([{ ...payroll, pointEstimate }]));
    assert.equal(entries(html), 0);
    assert.match(html, /açıklama öncesi sayısal model görüşü yok/);
    assert.doesNotMatch(html, /<dd>250 bin kişi|NaN|Infinity/);
  }
});

test('unchanged locked views remain visible without becoming new forecasts or borrowing later evidence', () => {
  const first = { ...payroll, recordedAt: '2026-09-29T06:05:00Z', knowledgeCutoff: '2026-09-29T06:00:00Z', sourceEvidence: sources };
  const review = { ...first, pointEstimate: 240, recordedAt: '2026-09-30T06:05:00Z', knowledgeCutoff: '2026-09-30T06:00:00Z' };
  const later = { ...first, pointEstimate: 900, recordedAt: '2026-10-01T07:00:00Z', knowledgeCutoff: '2026-10-01T06:59:00Z' };
  const macro = { modelForecasts: [first], modelForecastReviews: [review, later], forecasts: [{ ...first, pointEstimate: 1000 }] };
  const previous = structuredClone(macro);
  const storedOpinions = storedExpectations(macro, CAPTURED);
  assert.equal(storedOpinions.length, 1);
  assert.equal(storedOpinions[0].pointEstimate, 240);
  assert.equal(storedOpinions[0].originalPointEstimate, 250);
  const html = render(research([]), { storedOpinions });
  assert.equal(entries(html), 1);
  assert.match(html, /Kayıtlı görüş/);
  assert.match(html, /İlk kilitli tahmin: 250 bin kişi/);
  assert.match(html, /Synthetic dated evidence/);
  assert.doesNotMatch(html, /900 bin|1\.000 bin/);
  assert.deepEqual(macro, previous);
  assert.equal(numberFor(render(research(), { storedOpinions }), 'Model görüşü'), '250 bin kişi', 'explicit report opinion wins over retained display fallback');
});

test('separate CPI stored records keep their own units; system baselines never impersonate a model', () => {
  const cpi = { ...payroll, metric: 'us_cpi_core_mom_sa', unit: 'percent', pointEstimate: 0.3, consensus: null,
    recordedAt: '2026-09-30T06:01:00Z', knowledgeCutoff: '2026-09-30T06:00:00Z', sourceEvidence: sources };
  const storedOpinions = storedExpectations({ forecasts: [payroll], families: { us_cpi: { modelForecasts: [cpi], forecasts: [payroll] } } }, CAPTURED);
  assert.equal(storedOpinions.length, 1);
  assert.equal(numberFor(render(research([]), { storedOpinions }), 'Model görüşü'), '0,3%');
  assert.deepEqual(storedExpectations({ forecasts: [payroll] }, CAPTURED), []);
  assert.deepEqual(storedExpectations({ modelForecasts: [cpi] }, '2026-10-01'), []);
});

test('a pre-release stored opinion remains historical when an unchanged report finishes after release', () => {
  const first = { ...payroll, recordedAt: CAPTURED, knowledgeCutoff: CAPTURED, sourceEvidence: sources };
  const macro = { modelForecasts: [first], modelForecastReviews: [] };
  const review = { market: payroll.market, metric: payroll.metric, unit: payroll.unit, period: payroll.period, scheduledAt: RELEASE,
    status: 'unchanged', reason: 'Açıklama öncesinde girdileri yeniden inceledim; kayıtlı görüş korunuyor.', sourceIds: ['evidence'] };
  const data = research([], { generatedAt: AFTER_RELEASE, analysisAsOf: '2026-10-02T12:29:00Z', expectationReassessments: [review] });
  const priorMacro = structuredClone(macro), priorResearch = structuredClone(data);
  const storedOpinions = storedExpectations(macro, data.generatedAt);
  assert.equal(storedOpinions.length, 1);
  const html = expectationsHtml(data, { now: AFTER_RELEASE, storedOpinions });
  assert.equal(entries(html), 1);
  assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
  assert.match(html, /Açıklama saati geçti/);
  assert.match(html, /kayıtlı görüş korunuyor/);
  assert.match(html, /Değerlendirme kaynakları:.*Synthetic dated evidence/);
  assert.match(html, /Kayıtlı görüş/);
  assert.deepEqual(macro, priorMacro, 'showing history does not create a forecast or change immutable records');
  assert.deepEqual(data, priorResearch);
});

test('post-release raw numbers cannot borrow the validity of a separate stored opinion', () => {
  const first = { ...payroll, recordedAt: CAPTURED, knowledgeCutoff: CAPTURED, sourceEvidence: sources };
  for (const generatedAt of [RELEASE, AFTER_RELEASE]) {
    const data = research([{ ...payroll, pointEstimate: 900, rationale: 'Invalid late raw forecast' }], { generatedAt });
    const html = expectationsHtml(data, { now: AFTER_RELEASE, storedOpinions: [first] });
    assert.equal(entries(html), 1);
    assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi', 'only the previously stored pre-release number survives');
    assert.doesNotMatch(html, /900 bin|Invalid late raw forecast/);
    assert.match(html, /Açıklama saati geçti/);
  }
});

test('stored history refuses imprecise, late or contradictory record and evidence cutoffs', () => {
  const first = { ...payroll, recordedAt: CAPTURED, knowledgeCutoff: CAPTURED, sourceEvidence: sources };
  const badSource = patch => ({ ...first, sourceEvidence: sources.map(source => source.id === 'evidence' ? { ...source, ...patch } : source) });
  const withoutTime = { ...first }; delete withoutTime.recordedAt; delete withoutTime.knowledgeCutoff;
  const invalid = [withoutTime,
    { ...first, recordedAt: '2026-10-01' },
    { ...first, createdAt: CAPTURED, recordedAt: '2026-10-03T12:00:00Z' },
    { ...first, createdAt: CAPTURED, recordedAt: RELEASE },
    { ...first, createdAt: '2026-10-01T07:00:00Z', recordedAt: CAPTURED },
    { ...first, knowledgeCutoff: '2026-10-01T06:01:00Z' },
    { ...first, sourceIds: ['missing'] }, { ...first, sourceEvidence: [] },
    badSource({ publishedAt: null }), badSource({ publishedAt: '2026-09-28' }),
    badSource({ publishedAt: '2026-10-01T06:01:00Z' }), badSource({ evidence: '' }),
    badSource({ url: 'javascript:alert(1)' }), badSource({ url: 'https://user:pass@example.com/source' }),
  ];
  for (const candidate of invalid) {
    assert.equal(storedExpectations({ modelForecasts: [candidate] }, AFTER_RELEASE).length, 0);
    assert.equal(entries(expectationsHtml(research([], { generatedAt: AFTER_RELEASE }), { now: AFTER_RELEASE, storedOpinions: [candidate] })), 0,
      'direct fallback input cannot bypass the immutable source/time checks');
  }
});

test('an untimed official release calendar supports timing alongside dated numeric evidence', () => {
  const calendar = { id: 'calendar', title: 'Official calendar fixture', url: 'https://www.bls.gov/schedule/news_release/cpi.htm',
    kind: 'primary', publishedAt: null, evidence: 'Synthetic calendar timing reference only.' };
  const cpi = { ...payroll, metric: 'us_cpi_core_mom_sa', unit: 'percent', pointEstimate: 0.3, consensus: null,
    recordedAt: CAPTURED, knowledgeCutoff: CAPTURED, sourceIds: ['evidence', 'calendar'], sourceEvidence: sources.concat(calendar) };
  const storedOpinions = storedExpectations({ families: { us_cpi: { modelForecasts: [cpi] } } }, AFTER_RELEASE);
  assert.equal(storedOpinions.length, 1);
  assert.equal(numberFor(expectationsHtml(research([], { generatedAt: AFTER_RELEASE }), { now: AFTER_RELEASE, storedOpinions }), 'Model görüşü'), '0,3%');
  assert.deepEqual(storedExpectations({ modelForecasts: [{ ...cpi, sourceIds: ['calendar'], sourceEvidence: [calendar] }] }, AFTER_RELEASE), [],
    'a release calendar alone cannot prove a numerical model estimate');
});

test('retained consensus has its own immutable source cutoff without hiding a valid model opinion', () => {
  const first = { ...payroll, recordedAt: '2026-10-01T06:05:00Z', knowledgeCutoff: CAPTURED,
    probabilityAboveConsensus: 0.6, sourceEvidence: sources };
  const changedConsensus = patch => ({ ...first, sourceEvidence: sources.map(source => source.id === 'consensus' ? { ...source, ...patch } : source) });
  const invalid = [
    { ...first, consensusSourceId: 'missing' },
    { ...first, sourceEvidence: sources.filter(source => source.id !== 'consensus') },
    changedConsensus({ publishedAt: null }), changedConsensus({ publishedAt: '2026-09-28' }),
    changedConsensus({ publishedAt: '2026-10-01T06:01:00Z' }),
    changedConsensus({ publishedAt: '2026-10-03T14:00:00Z' }),
    changedConsensus({ evidence: '' }), changedConsensus({ url: 'javascript:alert(1)' }),
  ];
  const data = research([], { generatedAt: AFTER_RELEASE });
  for (const candidate of invalid) {
    const previous = structuredClone(candidate);
    const storedOpinions = storedExpectations({ modelForecasts: [candidate] }, AFTER_RELEASE);
    assert.equal(storedOpinions.length, 1, 'an invalid comparison source must not erase independent model evidence');
    assert.equal(storedOpinions[0].consensus, null);
    assert.equal(storedOpinions[0].probabilityAboveConsensus, null);
    for (const opinions of [storedOpinions, [candidate]]) {
      const html = expectationsHtml(data, { now: AFTER_RELEASE, storedOpinions: opinions });
      assert.equal(numberFor(html, 'Model görüşü'), '250 bin kişi');
      assert.equal(numberFor(html, 'Piyasa konsensüsü'), 'Bu dönem için doğrulanamadı');
      assert.equal(numberFor(html, 'Konsensüsten farkı'), 'Bu dönem için konsensüs doğrulanamadı');
      assert.doesNotMatch(html, /Konsensüs kaynağı:|210 bin kişi|\+40 bin kişi/);
    }
    assert.deepEqual(candidate, previous, 'presentation never changes frozen forecast or review records');
  }
  for (const consensus of [210, 0]) {
    const storedOpinions = storedExpectations({ modelForecasts: [{ ...first, consensus }] }, AFTER_RELEASE);
    const html = expectationsHtml(data, { now: AFTER_RELEASE, storedOpinions });
    assert.equal(numberFor(html, 'Piyasa konsensüsü'), consensus + ' bin kişi');
    assert.equal(numberFor(html, 'Konsensüsten farkı'), '+' + (250 - consensus) + ' bin kişi');
    assert.match(html, /Konsensüs kaynağı:.*Synthetic survey/);
  }
});

test('historical latest review preserves the first value and matches reassessment by exact release identity', () => {
  const first = { ...payroll, recordedAt: '2026-09-29T06:05:00Z', knowledgeCutoff: '2026-09-29T06:00:00Z', sourceEvidence: sources };
  const later = { ...first, pointEstimate: 240, recordedAt: '2026-09-30T06:05:00Z', knowledgeCutoff: '2026-09-30T06:00:00Z' };
  const target = { market: payroll.market, metric: payroll.metric, unit: payroll.unit, period: payroll.period,
    scheduledAt: '2026-10-02T15:30:00+03:00', status: 'unchanged', reason: 'Doğru dönem ve açıklama yeniden incelendi.', sourceIds: ['evidence'] };
  const mismatches = [{ ...target, period: '2026-08' }, { ...target, unit: 'percent' }, { ...target, market: 'bist' },
    { ...target, scheduledAt: '2026-10-02T12:31:00Z' }].map(item => ({ ...item, reason: 'Yanlış hedefin gerekçesi' }));
  const data = research([], { generatedAt: AFTER_RELEASE, analysisAsOf: '2026-10-02T12:29:00Z',
    expectationReassessments: mismatches.concat(target), expectationCoverage: [
      { family: 'us_nonfarm_payroll_change', status: 'unavailable', reason: 'Bağımsız takvim şu anda okunamadı.', scope: 'independent_calendar', checkedAt: CAPTURED },
    ] });
  const macro = { modelForecasts: [first], modelForecastReviews: [later] }, previous = structuredClone(macro);
  const storedOpinions = storedExpectations(macro, data.generatedAt);
  const html = expectationsHtml(data, { now: AFTER_RELEASE, storedOpinions });
  assert.equal(entries(html), 1, 'the later opinion and first forecast are one historical target');
  assert.equal(numberFor(html, 'Model görüşü'), '240 bin kişi');
  assert.match(html, /İlk kilitli tahmin: 250 bin kişi/);
  assert.match(html, /Açıklama saati geçti/);
  assert.match(html, /Doğru dönem ve açıklama yeniden incelendi/);
  assert.doesNotMatch(html, /Yanlış hedefin gerekçesi/);
  assert.match(html, /Değerlendirme kaynakları:.*Synthetic dated evidence/);
  assert.match(html, /Bağımsız takvim şu anda okunamadı/, 'calendar failure must coexist with already recorded model evidence');
  assert.deepEqual(macro, previous, 'historical presentation never adds samples or rewrites the first forecast');
});
