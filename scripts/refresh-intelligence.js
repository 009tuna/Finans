'use strict';
const macroStore = require('../src/macro-store');
const newsStore = require('../src/market-news');
const consensusStore = require('../src/macro-consensus');
const cpiStore = require('../src/cpi-store');
async function run(options = {}) {
  const refreshMacro = options.refreshMacro || macroStore.refreshMacro;
  const refreshMarketNews = options.refreshMarketNews || newsStore.refreshMarketNews;
  const refreshCpi = options.refreshCpi || cpiStore.refreshCpi;
  const getMacroPayload = options.getMacroPayload || macroStore.getMacroPayload;
  const refreshConsensus = options.refreshMacroConsensus || consensusStore.refreshMacroConsensus;
  const resolveResearch = options.resolveBlsResearch || ((opts) => require('../src/macro-research-outcomes').resolveBlsResearch(opts));
  const { refreshMacro: _rm, refreshMarketNews: _rn, refreshCpi: _cp, getMacroPayload: _gp,
    refreshMacroConsensus: _rc, resolveBlsResearch: _ro, ...operationOptions } = options;
  const results = await Promise.allSettled([refreshMacro(operationOptions), refreshMarketNews(operationOptions), refreshCpi(operationOptions)]);
  const [macro, marketNews, cpi] = results.map((result) => result.status === 'fulfilled' ? result.value : { status: 'failed', errorCode: 'storage_or_source_failure' });
  let macroContext;
  try { macroContext = await getMacroPayload(operationOptions); }
  catch (_) { macroContext = null; }
  let consensus;
  const consensusEvent = macroContext?.consensusEvent || macroContext?.nextEvent;
  if (!consensusEvent) {
    consensus = { status: 'unavailable', errorCode: 'next_event_unavailable', events: 0 };
  } else {
    try { consensus = await refreshConsensus({ ...operationOptions, event: consensusEvent }); }
    catch (_) { consensus = { status: 'failed', errorCode: 'consensus_source_or_storage_failure' }; }
  }
  // Re-read the projection after the independent consensus refresh so the output
  // can show its current event value without binding it to any older forecast.
  let refreshedMacroContext = macroContext;
  if (macroContext) {
    try { refreshedMacroContext = await getMacroPayload(operationOptions); }
    catch (_) { /* Keep the intact pre-consensus macro projection. */ }
  }
  let modelOutcomes;
  try { modelOutcomes = await resolveResearch(operationOptions); }
  catch (_) { modelOutcomes = { status: 'failed', errorCode: 'research_resolution_failure' }; }
  const currentConsensus = refreshedMacroContext?.consensus || null;
  const consensusStatus = consensus?.sourceStatus || {};
  const summarizeRecord = (record) => record ? ({ eventId: record.eventId, period: record.period, value: record.value,
    unit: record.unit, publishedAt: record.publishedAt, observedAt: record.observedAt,
    provider: record.provider, sourceKind: record.sourceKind, sourceUrl: record.sourceUrl }) : null;
  const output = { checkedAt: operationOptions.now || new Date().toISOString(), macro, marketNews, cpi,
    consensus: { status: consensus?.status || consensusStatus.status || 'unavailable', errorCode: consensus?.errorCode || null,
      recordCount: Array.isArray(consensus?.records) ? consensus.records.length : Number(consensus?.events) || 0,
      current: summarizeRecord(currentConsensus), failures: consensusStatus.failures || [] },
    macroPayload: refreshedMacroContext ? { status: refreshedMacroContext.status || 'unavailable',
      nextEvent: refreshedMacroContext.nextEvent ? { eventId: refreshedMacroContext.nextEvent.eventId,
        period: refreshedMacroContext.nextEvent.period, scheduledAt: refreshedMacroContext.nextEvent.scheduledAt } : null,
      consensus: summarizeRecord(currentConsensus), consensusStatus: refreshedMacroContext.consensusStatus?.status || null,
      forecastCount: refreshedMacroContext.forecasts?.length || 0, outcomeCount: refreshedMacroContext.outcomes?.length || 0 } : null,
    modelOutcomes, modelCalled: false };
  console.log(JSON.stringify(output));
  return output;
}
if (require.main === module) run().then((output) => {
  if ([output.macro, output.marketNews, output.cpi].some((result) => result.status === 'failed')) process.exitCode = 1;
}).catch(() => { console.error('Bağımsız kaynak akışı tamamlanamadı.'); process.exitCode = 1; });
module.exports = { run };
