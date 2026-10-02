'use strict';
// Local, in-memory acceptance fixture. No model call and no database write.
const { createQaServer } = require('./ui-qa-server');
const { cpiPayload, initial } = require('../src/cpi-store');
const { empty, addResearch } = require('../src/research-ledger');
const { METRICS } = require('../src/cpi-sources');
function createModelFixture() {
  // Self-contained synthetic inputs: acceptance must not need a private API dump.
  const nextEvent = { eventId: 'us_cpi:2026-09', period: '2026-09', scheduledAt: '2026-10-14T12:30:00.000Z',
    sourceUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm', contentHash: 'a'.repeat(64), observedAt: '2026-10-01T14:00:00.000Z' };
  const saved = { nextEvent, events: [nextEvent], correctionReviews: [], sourceStatus: { status: 'available' },
    metrics: METRICS.map(() => ({ forecasts: [] })), observations: METRICS.map((metric, i) => ({ ...metric,
      id: metric.metric + ':2026-08:first_release', period: '2026-08', value: [0.4, 0.3, 3.4, 2.4][i], vintage: 'first_release',
      publishedAt: '2026-09-11T12:30:00.000Z', observedAt: '2026-09-11T12:31:00.000Z',
      sourceUrl: 'https://www.bls.gov/news.release/archives/cpi_09112026.htm', contentHash: 'b'.repeat(64) })) };
  const now = '2026-10-01T14:25:00.000Z';
  const reviewAt = '2026-10-01T14:35:00.000Z';
  const event = saved.nextEvent;
  const fields = ['cpiHeadlineMomSa', 'cpiCoreMomSa', 'cpiHeadlineYoyNsa', 'cpiCoreYoyNsa'];
  const estimates = [0.25, 0.26, 3.3, 2.5];
  const source = { id: 'qa-cpi-evidence', title: 'Sentetik kabul kaynağı',
    url: 'https://example.com/qa-cpi-evidence', publishedAt: '2026-10-01T14:20:00.000Z', kind: 'secondary', evidence: 'Sentetik test kaynağı; gerçek haber veya model görüşü değildir.' };
  const calendar = { id: 'qa-cpi-calendar', title: 'Sentetik kabul takvim referansı', url: 'https://www.bls.gov/schedule/news_release/cpi.htm', publishedAt: null, kind: 'primary', evidence: 'Yalnız test takvim referansı.' };
  const forecasts = METRICS.map((metric, i) => ({ eventId: 'qa-cpi-event', market: 'us', symbol: '', metric: metric.metric, unit: metric.unit,
    period: event.period, scheduledAt: event.scheduledAt, pointEstimate: estimates[i], consensus: null, consensusSourceId: '',
    probabilityAboveConsensus: null, sourceIds: [source.id, calendar.id], rationale: 'Sentetik kabul gerekçesi. Gerçek tahmin değildir.',
    resolution: { provider: 'bls-first-release', field: fields[i], sourceUrl: 'https://www.bls.gov/news.release/archives/cpi_10142026.htm' } }));
  const scenario = { eventId: 'qa-cpi-event', market: 'us', symbol: '',
    condition: 'Sentetik: çekirdek aylık oran modelin %0,30 güncel görüşünün üzerinde açıklanırsa.',
    impact: 'Koşullu örnek: faiz beklentileri üzerinden tahvil ve büyüme hisseleri etkilenebilir; kesin fiyat yönü değildir.',
    horizon: 'Açıklama sonrası ilk seans', invalidation: 'Diğer bileşenler ve merkez bankası iletişimi ters yönde kanıt verirse.', sourceIds: [source.id] };
  const research = { macroSummary: 'Sentetik CPI kabul verisi', todayFocus: 'Test', commentary: { us: 'Test', bist: 'Test', crypto: 'Test' },
    coverage: ['us', 'bist', 'crypto'].map(market => ({ market, status: 'partial', reason: 'Test' })),
    sources: [source, calendar], events: [{ id: 'qa-cpi-event', market: 'us', title: 'Sentetik CPI olayı', sourceIds: [source.id], whatChanged: 'Test', expectationGap: 'Test', counterEvidence: 'Test' }],
    forecasts, scenarios: [], signals: [], unresolvedQuestions: [], model: 'gpt-6.1-sol', promptVersion: 'sol-research-v5',
    analysisAsOf: '2026-10-01T14:15:00.000Z', generatedAt: now, sourceVerification: 'synthetic-acceptance-only' };
  let ledger = addResearch(empty(), { runId: 'qa-cpi-original', research }, now);
  const reviewed = { ...research, forecasts: forecasts.map(f => ({ ...f, pointEstimate: f.metric === 'us_cpi_core_mom_sa' ? 0.3 : f.pointEstimate })), scenarios: [scenario], generatedAt: reviewAt };
  const reviewAi = { runId: 'qa-cpi-review', research: reviewed };
  ledger = addResearch(ledger, reviewAi, reviewAt);
  ledger.publication = { ai: reviewAi };
  const value = { ...structuredClone(initial), events: saved.events, observations: saved.observations,
    forecasts: saved.metrics.flatMap(m => m.forecasts), outcomes: [], correctionReviews: saved.correctionReviews, sourceStatus: saved.sourceStatus };
  return { ledger, value, now: reviewAt, family: cpiPayload(value, reviewAt, ledger) };
}
async function start() {
  const fixture = createModelFixture();
  const response = await fetch('http://127.0.0.1:5190/api/macro');
  if (!response.ok) throw new Error('Yerel makro önizleme erişilemiyor');
  const macro = await response.json();
  macro.families = { ...macro.families, us_cpi: fixture.family };
  const server = await createQaServer({ macroSnapshot: macro });
  server.listen(5192, '127.0.0.1', () => console.log('Sentetik CPI kabul önizlemesi: http://127.0.0.1:5192/?qa=cpi-model#view=overview'));
}
module.exports = { createModelFixture };
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
