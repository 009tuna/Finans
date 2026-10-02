'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { getIntelligenceContext } = require('../src/intelligence-context');
const { getMacroPayload, KEY: NFP_KEY, initial: nfpInitial } = require('../src/macro-store');
const { KEY: CPI_KEY, initial: cpiInitial } = require('../src/cpi-store');
const { addResearch, empty } = require('../src/research-ledger');
const { checkSchema, MODEL, PROMPT_VERSION } = require('../src/research-runner');
const before = '2026-10-01T14:30:00.000Z';
const snapshotAt = '2026-10-01T14:00:00.000Z';
const schedule = { eventId: 'us_cpi:2026-09', period: '2026-09', scheduledAt: '2026-10-14T12:30:00.000Z',
  sourceUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm', observedAt: '2026-10-01T13:00:00.000Z', contentHash: 'a'.repeat(64) };
const source = { id: 'fixture-evidence', url: 'https://www.bls.gov/news.release/archives/cpi_09112026.htm',
  title: 'Synthetic dated evidence', publishedAt: '2026-09-11T12:30:00.000Z', kind: 'primary', evidence: 'Synthetic test, not a forecast.' };
const calendar = { id: 'fixture-calendar', url: schedule.sourceUrl, title: 'Official calendar fixture', publishedAt: null, kind: 'primary', evidence: 'Synthetic schedule reference only.' };
const forecast = { eventId: 'fixture-cpi', market: 'us', symbol: '', metric: 'us_cpi_core_mom_sa', unit: 'percent', period: '2026-09',
  scheduledAt: schedule.scheduledAt, pointEstimate: 0.27, consensus: null, consensusSourceId: '', probabilityAboveConsensus: null,
  rationale: 'Synthetic evidence-grounded fixture.', sourceIds: [source.id, calendar.id],
  resolution: { provider: 'bls-first-release', field: 'cpiCoreMomSa', sourceUrl: 'https://www.bls.gov/news.release/archives/cpi_10142026.htm' } };
const research = { macroSummary: 'Fixture', todayFocus: 'Fixture', commentary: { us: 'Fixture', bist: 'Fixture', crypto: 'Fixture' },
  coverage: ['us', 'bist', 'crypto'].map(market => ({ market, status: 'partial', reason: 'Fixture' })),
  sources: [source, calendar], events: [{ id: forecast.eventId, market: 'us', title: 'Fixture', sourceIds: [source.id], whatChanged: 'Fixture', expectationGap: 'Fixture', counterEvidence: 'Fixture' }],
  forecasts: [forecast], scenarios: [], signals: [], unresolvedQuestions: [] };
const cpi = { ...structuredClone(cpiInitial), events: [schedule], sourceStatus: { status: 'available' } };
const database = { async getCache(key) {
  if (key === NFP_KEY) return { value: structuredClone(nfpInitial), revision: 'nfp' };
  if (key === CPI_KEY) return { value: structuredClone(cpi), revision: 'cpi' };
  return null;
} };
async function main() {
  checkSchema(research);
  const metadata = { ...research, model: MODEL, promptVersion: PROMPT_VERSION, generatedAt: before, analysisAsOf: snapshotAt, sourceVerification: 'model-cited-web-research' };
  const ledger = addResearch(empty(), { runId: 'cpi-context-fixture', research: metadata }, before);
  const copy = structuredClone(ledger);
  const view = await getMacroPayload({ database, now: before, researchLedger: ledger });
  assert.equal(view.modelForecasts.length, 0, 'CPI must not enter NFP projection');
  const family = view.families.us_cpi;
  assert.equal(family.metrics.find(m => m.metric === forecast.metric).modelForecasts.length, 1);
  assert.ok(family.metrics.filter(m => m.metric !== forecast.metric).every(m => m.modelForecasts.length === 0));
  const context = await getIntelligenceContext({ database, now: before, researchLedger: ledger });
  const cpiContext = context.macro.families.us_cpi;
  assert.equal(cpiContext.scheduleProof.contentHash, schedule.contentHash);
  assert.equal(cpiContext.metrics.length, 4);
  const metric = cpiContext.metrics.find(m => m.metric === forecast.metric);
  assert.equal(metric.frozenModelForecasts[0].pointEstimate, 0.27);
  assert.equal(metric.frozenModelForecasts[0].knowledgeCutoff, before, 'knowledge cutoff is model research completion, not snapshot time');
  assert.equal(metric.consensus, null);
  assert.equal(metric.modelScorecard.sampleSize, 0);
  assert.equal(metric.modelScorecard.mae, null);
  assert.equal(metric.modelScorecard.errorUnit, 'percentage_point');
  assert.doesNotMatch(cpiContext.limits, /context only|do not emit structured CPI forecasts/);
  assert.match(cpiContext.limits, /first frozen forecast/);
  assert.deepEqual(ledger, copy, 'projection cannot mutate the research ledger');
  const prompt = fs.readFileSync(require.resolve('../routines/sol-research.md'), 'utf8');
  assert.ok(prompt.includes('resolution.provider=bls-first-release'));
  for (const name of ['cpiHeadlineMomSa', 'cpiCoreMomSa', 'cpiHeadlineYoyNsa', 'cpiCoreYoyNsa']) assert.ok(prompt.includes(name));
  assert.equal(MODEL, 'gpt-6.1-sol');
  assert.equal(PROMPT_VERSION, 'sol-research-v5');
  console.log('CPI typed research context: isolated families, completion cutoff, empty sample and prompt policy passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
