'use strict';
const assert = require('node:assert/strict');
const { getMacroPayload, KEY: NFP_KEY, initial: nfpInitial } = require('../src/macro-store');
const { KEY: CPI_KEY, initial: cpiInitial } = require('../src/cpi-store');
const { getIntelligenceContext } = require('../src/intelligence-context');
const { handleIntelligence } = require('../src/intelligence-api');
const { run } = require('../scripts/refresh-intelligence');
const now = '2026-10-01T13:00:00.000Z';
const clone = (v) => structuredClone(v);
const cpiEvent = { eventId: 'us_cpi:2026-09', period: '2026-09', scheduledAt: '2026-10-14T12:30:00.000Z',
  sourceUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm', contentHash: 'a'.repeat(64), observedAt: now };
const nfpEvent = { eventId: 'us_nonfarm_payroll_change:2026-09', metric: 'us_nonfarm_payroll_change', unit: 'thousand_jobs', period: '2026-09', scheduledAt: '2026-10-02T12:30:00.000Z' };
const nfp = { ...clone(nfpInitial), events: [nfpEvent], sourceStatus: { status: 'available' } };
const cpi = { ...clone(cpiInitial), events: [cpiEvent], sourceStatus: { status: 'partial', failures: [{ code: 'release_missing' }] } };
function database(failedCpi = false, failedNfp = false, failedResearch = false, { nfpValue = nfp } = {}) {
  return { async getCache(key) {
    if (failedCpi && key === CPI_KEY) throw new Error('private database error');
    if (failedNfp && key === NFP_KEY) throw new Error('nfp database error');
    if (failedResearch && key === 'research_ledger_v1') throw new Error('research database error');
    const value = key === NFP_KEY ? nfpValue : key === CPI_KEY ? cpi : null;
    return value ? { value: clone(value), revision: 'r1' } : null;
  } };
}
async function main() {
  const payload = await getMacroPayload({ database: database(), now });
  assert.equal(payload.nextEvent.eventId, nfpEvent.eventId);
  assert.equal(payload.families.us_cpi.nextEvent.eventId, cpiEvent.eventId);
  assert.equal(payload.families.us_cpi.metrics.length, 4);
  assert.ok(payload.families.us_cpi.metrics.every((m) => m.unit === 'percent' && m.consensus === null && m.modelForecasts.length === 0));
  assert.equal(payload.storeStatus.status, 'available');
  assert.equal(payload.families.us_cpi.storeStatus.status, 'available');
  const degraded = await handleIntelligence({ method: 'GET' }, { database: database(true), now });
  assert.equal(degraded.status, 200, 'CPI storage failure must not disable intact NFP');
  assert.equal(degraded.body.nextEvent.eventId, nfpEvent.eventId);
  assert.equal(degraded.body.families.us_cpi.sourceStatus.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(degraded), /private database error/);
  const nfpFailure = await handleIntelligence({ method: 'GET' }, { database: database(false, true), now });
  assert.equal(nfpFailure.status, 200, 'NFP storage failure must not disable CPI');
  assert.equal(nfpFailure.body.storeStatus.status, 'unavailable');
  assert.equal(nfpFailure.body.storeStatus.errorCode, 'macro_store_unavailable');
  assert.equal(nfpFailure.body.families.us_cpi.storeStatus.status, 'available');
  const researchFailure = await handleIntelligence({ method: 'GET' }, { database: database(false, false, true), now });
  assert.equal(researchFailure.status, 200, 'shared research failure must not disable source families');
  assert.equal(researchFailure.body.researchStatus, 'unavailable');
  assert.match(researchFailure.body.researchCheckedAt, /^2026-10-01T13:00:00\.000Z$/);
  const totalFailure = await handleIntelligence({ method: 'GET' }, { database: database(true, true), now });
  assert.equal(totalFailure.status, 503);
  const malformedNfp = await handleIntelligence({ method: 'GET' }, { database: database(false, false, false, { nfpValue: { ...nfp, events: null } }), now });
  assert.equal(malformedNfp.status, 200, 'malformed NFP projection must not disable healthy CPI');
  assert.equal(malformedNfp.body.storeStatus.status, 'unavailable');
  assert.equal(malformedNfp.body.storeStatus.errorCode, 'macro_projection_invalid');
  assert.equal(malformedNfp.body.families.us_cpi.storeStatus.status, 'available');
  const context = await getIntelligenceContext({ database: database(), now });
  assert.equal(context.macro.families.us_cpi.metrics.length, 4);
  assert.equal(context.macro.families.us_cpi.metrics[0].consensus, null);
  assert.equal(context.macro.storeStatus.status, 'available');
  const degradedContext = await getIntelligenceContext({ database: database(false, true), now });
  assert.equal(degradedContext.macro.storeStatus.status, 'unavailable', 'research context distinguishes unreadable NFP records from an empty store');
  assert.equal(degradedContext.macro.families.us_cpi.storeStatus.status, 'available');
  assert.equal(degradedContext.macro.families.us_cpi.metrics.length, 4);
  const log = console.log; const oldExit = process.exitCode; let calls = 0; let output;
  console.log = () => {};
  try {
    output = await run({ now, refreshMacro: async () => ({ status: 'available' }),
      refreshMarketNews: async () => ({ status: 'available' }),
      refreshCpi: async () => { calls++; throw new Error('private source detail'); },
      getMacroPayload: async () => payload,
      refreshMacroConsensus: async () => ({ status: 'not_connected' }),
      resolveBlsResearch: async () => ({ status: 'no_op' }) });
    assert.equal(process.exitCode, 1);
  } finally { console.log = log; process.exitCode = oldExit; }
  assert.equal(calls, 1);
  assert.equal(output.macro.status, 'available');
  assert.equal(output.cpi.status, 'failed');
  assert.equal(output.modelCalled, false);
  assert.doesNotMatch(JSON.stringify(output), /private source detail/);
  console.log('CPI additive API, bounded research context and refresh isolation passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
