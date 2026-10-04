'use strict';

const assert = require('assert');
const research = require('../public/research.js');

const linked = research.proseHtml('Kanıt [resmî açıklamada](https://example.com/news?a=1&b=2). <img src=x onerror=alert(1)>');
assert.match(linked, /href="https:\/\/example.com\/news\?a=1&amp;b=2"/);
assert.match(linked, /rel="noopener noreferrer"/);
assert.match(linked, /&lt;img/);
assert.doesNotMatch(linked, /<img/);
assert.doesNotMatch(research.proseHtml('[tehlike](javascript:alert(1))'), /<a/);
assert.doesNotMatch(research.proseHtml('[hatalı](https://)'), /<a/);
assert.match(research.proseHtml('[<b>kaynak</b>](https://example.com)'), /&lt;b&gt;kaynak&lt;\/b&gt;/);
const contextHtml = research.modelContextHtml({researchAsOf:'2026-10-01T07:41:03.528Z',researchStatus:'previous-analysis'},true);
assert.match(contextHtml,/Sonraki kaynak güncellemeleri bu metne işlenmedi/);
assert.match(contextHtml,/Europe\/Istanbul/);
assert.match(contextHtml,/data-open-model-workspace/);
assert.doesNotMatch(research.modelContextHtml({researchAsOf:'bad'}), /<time|datetime=/);
assert.doesNotMatch(research.modelContextHtml({researchStatus:'current'}), /Sonraki kaynak güncellemeleri/);

for (const missing of [null, undefined, 0, '']) assert.match(research.timestamp(missing), /Zaman doğrulanamadı/);
assert.match(research.timestamp('not-a-time'), /Zaman doğrulanamadı/);
assert.match(research.timestamp('2026-09-30T09:00:00Z'), /Europe\/Istanbul/);
const times = research.reportTimeLabels({
  pricesAsOf: '2026-09-30T09:00:00.000Z',
  analysisAsOf: '2026-09-29T09:00:00.000Z',
  researchAsOf: '2026-09-29T10:00:00.000Z',
});
assert.match(times, /Fiyat verisi/);
assert.match(times, /Analiz kesiti/);
assert.match(times, /Araştırma/);
assert.equal((times.match(/Europe\/Istanbul/g) || []).length, 3);

// Critical data warnings stay visible when the optional date details are closed.
const integrityBand = research.reportIntegrityHtml({
  integrity: { baseStatus: 'snapshot-mismatch', researchStatus: 'previous-analysis', pricesAsOf: '2026-10-02T09:00:00Z', analysisAsOf: '2026-10-02T08:00:00Z', researchAsOf: '2026-10-02T08:05:00Z' },
  hasResearch: true, partial: true, loadError: true,
});
const visibleIntegrity = integrityBand.split('<details')[0];
assert.match(visibleIntegrity, /Rapor güncel fiyat verisiyle eşleşmiyor/);
assert.match(visibleIntegrity, /Önceki analiz kesitine dayanıyor/);
assert.match(visibleIntegrity, /Veri kapsamı eksik/);
assert.match(visibleIntegrity, /role="status">Rapor yenilenemedi/);
assert.doesNotMatch(integrityBand, /<details[^>]*\bopen\b/);
assert.match(integrityBand, /Fiyat verisi/);
assert.match(integrityBand, /Analiz kesiti/);
assert.equal((integrityBand.match(/Europe\/Istanbul/g) || []).length, 3);
const currentBand = research.reportIntegrityHtml({ integrity: { baseStatus: 'current', researchStatus: 'current' }, hasResearch: true });
assert.match(currentBand, /Rapor ve fiyat verisi eşleşiyor/);
assert.doesNotMatch(currentBand, /Veri kapsamı eksik|Rapor yenilenemedi|model yorumları gizlendi/);
for (const status of ['missing', 'stale', 'context-mismatch', 'unverified']) {
  assert.match(research.reportIntegrityHtml({ integrity: { researchStatus: status } }).split('<details')[0], new RegExp(research.researchStatusMessage({ researchStatus: status }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
for (const unknown of [undefined, null, '', 'bad', 0]) assert.equal(research.sourcePublicationText(unknown), 'Yayın zamanı bilinmiyor');
assert.match(research.sourcePublicationText('2026-10-02T08:00:00Z'), /^Yayın: .*2026.*11:00/);

const previous = { researchStatus: 'previous-analysis' };
assert.match(research.researchStatusMessage(previous), /Önceki analiz kesitine dayanıyor/);
assert.match(research.researchStatusMessage(previous), /uygulanmadı/);
const readable = research.researchHtml({ model: 'Araştırma', generatedAt: '2026-09-29T10:00:00Z', events: [{ market: 'us', title: 'Eski kesitteki araştırma', whatChanged: '<em>Yeni fiyat değil</em>' }] });
assert.match(readable, /Eski kesitteki araştırma/);
assert.match(readable, /&lt;em&gt;Yeni fiyat değil&lt;\/em&gt;/);
assert.equal(research.canUseReportOverlay({ baseStatus: 'snapshot-mismatch', aiStatus: 'context-mismatch', usableResearch: true, usableOverlay: false }), false);
assert.equal(research.canUseReportOverlay({ baseStatus: 'current', aiStatus: 'current', usableResearch: true, usableOverlay: true }), true);
const strippedMetadata = research.restoreStrippedResearchMetadata({ baseStatus: 'current', aiStatus: 'missing', researchStatus: 'missing', usableResearch: false, usableOverlay: false, pricesAsOf: null, analysisAsOf: null, researchAsOf: null }, {
  aiStatus: 'stale', researchStatus: 'stale', pricesAsOf: '2026-09-30T09:00:00Z', analysisAsOf: '2026-09-29T09:00:00Z', researchAsOf: '2026-09-29T10:00:00Z', usableResearch: true, usableOverlay: true,
});
assert.equal(strippedMetadata.researchStatus, 'stale');
assert.equal(strippedMetadata.researchAsOf, '2026-09-29T10:00:00Z');
assert.equal(strippedMetadata.usableResearch, false);
assert.equal(strippedMetadata.usableOverlay, false);
assert.equal(research.canUseReportOverlay(strippedMetadata), false);

const automation = research.automationHtml({
  runId: 'run-42', status: 'failed', startedAt: '2026-09-30T10:00:00.000Z', updatedAt: '2026-09-30T10:03:00.000Z',
  errorCode: 'generation_failed',
  stages: [
    { id: 'publication', status: 'pending', message: '<img src=x onerror=alert(1)>' },
    { id: 'research', status: 'completed', startedAt: '2026-09-30T10:01:00.000Z' },
    { id: 'base', status: 'running', startedAt: '2026-09-30T10:02:00.000Z', message: 'Temel rapor hazırlanıyor' },
  ],
  lastSuccessful: { runId: 'run-41', publishedAt: '2026-09-29T10:03:00.000Z' },
}, '2026-09-30T10:03:30.000Z');
assert.ok(automation.indexOf('Temel rapor') < automation.indexOf('Araştırma'));
assert.ok(automation.indexOf('Araştırma') < automation.indexOf('Yayın'));
assert.match(automation, /Son deneme: Başarısız/);
assert.match(automation, /<summary>Günlük otomasyon <span class="automation-summary-state">· Başarısız/);
assert.match(automation, /Son başarılı yayın:/);
assert.match(automation, /Rapor oluşturulamadı/);
assert.doesNotMatch(automation, /generation_failed/);
assert.match(automation, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(automation, /<script>|<img/);
assert.match(automation, /Süre bilinmiyor/);

const interrupted = research.automationHtml({ status: 'interrupted', stages: [{ id: 'research', status: 'running', startedAt: '2026-09-30T10:02:00.000Z' }], lastSuccessful: null }, '2026-09-30T10:03:30.000Z');
assert.match(interrupted, /tamamlanma durumu doğrulanamıyor/);
assert.match(interrupted, /İlerlemesi bilinmiyor/);
assert.match(interrupted, /Süre bilinmiyor/);
assert.match(interrupted, /Başarılı yayın zamanı kayıtlı değil/);
const completedWithoutPublish = research.automationHtml({ status: 'completed', stages: [
  { id: 'research', status: 'skipped' }, { id: 'validation', status: 'skipped' }, { id: 'publication', status: 'skipped' },
], lastSuccessful: { runId: 'run-old', publishedAt: '2026-09-29T09:00:00Z' } }, '2026-09-30T10:03:30.000Z');
assert.match(completedWithoutPublish, /Tamamlandı · Yeni yayın yapılmadı/);
assert.match(completedWithoutPublish, /Son başarılı yayın:/);
const idleWithoutStages = research.automationHtml({ status: 'idle', stages: [], lastSuccessful: null });
assert.match(idleWithoutStages, /Henüz aşama kaydı yok; sonraki günlük çalışmada görünür/);
assert.match(idleWithoutStages, /<summary>Günlük otomasyon <span class="automation-summary-state">· Henüz kayıt yok/);
const unknownFailure = research.automationHtml({ status: 'failed', errorCode: 'PRIVATE_STACK_TRACE', stages: [] });
assert.match(unknownFailure, /İşlem tamamlanamadı/);
assert.doesNotMatch(unknownFailure, /PRIVATE_STACK_TRACE/);

const hostileCounts = research.evaluationHtml({ scorecard: { total: '<img>', resolved: 0, pending: 0, awaitingOutcome: 0, groups: [] }, forecasts: [], outcomes: [] });
assert.match(hostileCounts, /Ölçüm kapsamı: Veri yok/);
assert.doesNotMatch(hostileCounts, /<img>/);

const auditForecast = { id: 'audit-f', market: 'us', symbol: '', metric: 'us_cpi_core_mom_sa', unit: 'percent', period: '2026-09',
  pointEstimate: 0.3, consensus: null, recordedAt: '2026-10-02T08:02:13Z', scheduledAt: '2026-10-14T12:30:00Z',
  resolution: { sourceUrl: 'https://www.bls.gov/news.release/archives/cpi_10142026.htm' } };
for (const scorecard of [undefined, null, {}, { total: null }, { total: '0' }, { total: NaN }]) {
  const data = { scorecard, forecasts: [auditForecast], outcomes: [] }, previous = structuredClone(data);
  const html = research.evaluationHtml(data);
  assert.match(html, /1 tahmin kaydı gösteriliyor/);
  assert.match(html, /Ölçüm kapsamı: Veri yok/);
  assert.match(html, /TÜFE · çekirdek \/ aylık/);
  assert.doesNotMatch(html, /0 tahmin|Henüz açıklama öncesi kaydedilmiş tahmin yok|0 sonuçlandı/);
  assert.deepEqual(data, previous, 'formatting missing measurement data never adds forecasts or outcomes');
}
const zeroScorecard = { total: 0, resolved: 0, pending: 0, awaitingOutcome: 0, groups: [] };
const zeroEvaluation = research.evaluationHtml({ scorecard: zeroScorecard, forecasts: [], outcomes: [] });
assert.match(zeroEvaluation, /0 tahmin kaydı gösteriliyor/);
assert.match(zeroEvaluation, /Ölçüm kapsamı: 0 tahmin · 0 sonuçlandı · 0 açıklama bekliyor · 0 gerçekleşen veri bekliyor/);
assert.match(zeroEvaluation, /Henüz açıklama öncesi kaydedilmiş tahmin yok/);
assert.doesNotMatch(zeroEvaluation, /Ölçüm kapsamı: Veri yok/);
const zeroWithRecords = research.evaluationHtml({ scorecard: zeroScorecard, forecasts: [auditForecast], outcomes: [] });
assert.match(zeroWithRecords, /1 tahmin kaydı gösteriliyor/);
assert.doesNotMatch(zeroWithRecords, /Henüz açıklama öncesi kaydedilmiş tahmin yok/, 'a scorecard cannot erase a separately supplied record list');
const measuredScorecard = { total: 2, resolved: 1, pending: 1, awaitingOutcome: 0, groups: [
  { market: 'us', metric: auditForecast.metric, unit: auditForecast.unit, resolved: 1, forecasts: 2,
    mae: 0, pairedModelMae: 0, consensusMae: 0.1, pairedCount: 1, brier: 0, brierCount: 1, sampleStatus: 'insufficient_sample' },
] };
const measuredData = { scorecard: measuredScorecard, forecasts: [auditForecast], outcomes: [] };
const measuredPrevious = structuredClone(measuredData), measuredEvaluation = research.evaluationHtml(measuredData);
assert.match(measuredEvaluation, /1 tahmin kaydı gösteriliyor/, 'loaded record count is distinct from the complete measurement scope');
assert.match(measuredEvaluation, /Ölçüm kapsamı: 2 tahmin · 1 sonuçlandı · 1 açıklama bekliyor · 0 gerçekleşen veri bekliyor/);
assert.match(measuredEvaluation, /<td>1\/2<\/td><td>0<\/td><td>0 \/ 0,1 \(n=1\)<\/td><td>0 \(n=1\)<\/td>/);
assert.match(measuredEvaluation, /TÜFE · çekirdek \/ aylık \(yüzde puan\)/);
assert.doesNotMatch(measuredEvaluation, /Henüz açıklama öncesi kaydedilmiş tahmin yok|Ölçüm kapsamı: Veri yok/);
assert.deepEqual(measuredData, measuredPrevious);
const unknownRecords = research.evaluationHtml({});
assert.match(unknownRecords, /Gösterilen kayıt sayısı bilinmiyor/);
assert.match(unknownRecords, /Ölçüm kapsamı: Veri yok/);
assert.doesNotMatch(unknownRecords, /0 tahmin kaydı|Henüz açıklama öncesi kaydedilmiş tahmin yok/);
function outcomeLabel(verification, vintage) {
  return research.evaluationHtml({ forecasts: [auditForecast], outcomes: [{ forecastId: auditForecast.id, value: 0.2,
    metric: auditForecast.metric, unit: auditForecast.unit, period: auditForecast.period,
    publishedAt: auditForecast.scheduledAt, recordedAt: '2026-10-14T12:40:00Z',
    verification, vintage, sourceUrl: auditForecast.resolution.sourceUrl }] }, { now: '2026-10-15T06:00:00Z' });
}
const official = outcomeLabel('bls-official-first-release', 'first_release');
assert.match(official, /Resmî BLS ilk açıklama kaydı/);
assert.doesNotMatch(official, /İnsan tarafından|—%|NaN/);
assert.match(official, /Europe\/Istanbul/);
assert.match(outcomeLabel('bls-official-first-release'), /ilk açıklama sürümü doğrulanamadı/);
assert.match(outcomeLabel('provider-first-observed'), /ilk açıklama sürümü garanti edilmez/);
assert.match(outcomeLabel('human-reviewed'), /İnsan tarafından kontrol edildi/);
assert.match(outcomeLabel(undefined), /Doğrulama yöntemi kayıtlı değil/);
assert.doesNotMatch(outcomeLabel('unknown'), /İnsan tarafından|Resmî BLS/);
assert.match(research.researchHtml({ sourceVerification: 'model-cited-web-research' }), /kaynak atfı bağımsız içerik doğrulaması anlamına gelmez/);
assert.match(research.researchHtml({ sourceVerification: 'synthetic-acceptance-only' }), /gerçek araştırma değildir/);
assert.match(research.researchHtml({}), /Kaynak doğrulama yöntemi kayıtlı değil/);

(async () => {
  const previousFetch = global.fetch;
  const target = { isConnected: true, innerHTML: '' };
  try {
    for (const data of [{ forecasts: [auditForecast], outcomes: [] },
      { scorecard: zeroScorecard, forecasts: [], outcomes: [] }, measuredData]) {
      global.fetch = async (url, options) => {
        assert.equal(url, '/api/research');
        assert.equal(options.cache, 'no-store');
        return { ok: true, json: async () => data };
      };
      await research.loadEvaluation(target);
      assert.equal(target.innerHTML, research.evaluationHtml(data), 'the normal loader exposes the current count/measurement state');
    }
    global.fetch = async () => ({ ok: false });
    await research.loadEvaluation(target);
    assert.match(target.innerHTML, /Ölçüm günlüğüne erişilemedi/);
    assert.doesNotMatch(target.innerHTML, /0 tahmin|0 sonuçlandı/);
  } finally {
    global.fetch = previousFetch;
  }
  console.log('research progress UI tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
