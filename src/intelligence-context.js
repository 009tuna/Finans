'use strict';
async function getIntelligenceContext({ database, researchLedger, now = new Date().toISOString() } = {}) {
  const results = await Promise.allSettled([
    require('./macro-store').getMacroPayload({ database, researchLedger, now }),
    require('./market-news').getMarketNews({ database, report: researchLedger?.publication, now }),
  ]);
  const macro = results[0].status === 'fulfilled' ? results[0].value : { status: 'unavailable' };
  const news = results[1].status === 'fulfilled' ? results[1].value : { coverage: [], groups: {} };
  const cpi = macro.families?.us_cpi;
  return { macro: { status: macro.status, sourceStatus: macro.sourceStatus, storeStatus: macro.storeStatus || null, nextEvent: macro.nextEvent || null,
    observations: (macro.observations || []).slice(-4), systemForecasts: (macro.forecasts || []).slice(-6), methodAbstentions: (macro.methodAbstentions || []).slice(-6), scorecards: macro.scorecards || [],
    frozenModelForecasts: macro.modelForecasts || [], modelForecastReviews: (macro.modelForecastReviews || []).slice(-6),
    consensus: macro.consensus || null, consensusStatus: macro.consensusStatus || 'not_connected',
    families: cpi ? { us_cpi: { family: 'us_cpi', nextEvent: cpi.nextEvent || null,
      sourceStatus: cpi.sourceStatus, storeStatus: cpi.storeStatus || null, metrics: (cpi.metrics || []).map((metric) => ({
        metric: metric.metric, unit: metric.unit, adjustment: metric.adjustment, frequency: metric.frequency,
        previousFirstRelease: metric.previousFirstRelease || null,
        systemForecasts: (metric.forecasts || []).filter((forecast) => forecast.eventId === cpi.nextEvent?.eventId),
        scorecards: metric.scorecards || [], consensus: metric.consensus || null,
        consensusStatus: metric.consensusStatus || { status: 'not_connected' },
        frozenModelForecasts: (metric.modelForecasts || []).filter((forecast) => forecast.period === cpi.nextEvent?.period).slice(-1),
        modelForecastReviews: (metric.modelForecastReviews || []).filter((forecast) => forecast.period === cpi.nextEvent?.period).slice(-3),
        modelScorecard: metric.modelScorecard || { sampleSize: 0, mae: null, bias: null, errorUnit: 'percentage_point' },
        modelOutcomes: (metric.modelOutcomes || []).slice(-3),
      })), modelScenarios: (cpi.modelScenarios || []).filter((scenario) => scenario.eventId === cpi.nextEvent?.eventId).slice(0, 8),
      scheduleProof: (cpi.events || []).find((event) => event.eventId === cpi.nextEvent?.eventId) || null,
      limits: 'Four distinct CPI metrics; percent values and percentage-point errors. Typed first-release CPI model forecasts are supported when official future schedule and dated numerical evidence are verified. Scoring uses only the first frozen forecast for each metric and period; later opinions and conditional price scenarios are not extra scored samples. CPI consensus is not connected: do not copy baselines or NFP consensus as CPI consensus. Independently collected BLS archive evidence and model-cited web evidence have different verification levels. Never forecast historical releases or infer calibrated confidence from no outcomes.' } } : {},
    limits: 'System methods are independent baselines. Scoring uses the first frozen model forecast; later opinions cannot replace it or add a second accuracy sample. A family storeStatus of unavailable means records could not be read, not a successful empty collection. storeStatus.checkedAt is the read check time, never the source publication or model generation time. Available families remain usable independently.' },
    marketSources: { coverage: news.coverage, sources: news.sources, groups: Object.fromEntries(['us', 'bist', 'crypto'].map((market) => [market, (news.groups[market] || []).slice(0, 8)])),
      companyDisclosures: (news.groups.bist || []).filter(item => item.type === 'company_disclosure').slice(0, 8),
      limits: 'Issuer pilot covers only FROTO first listing page and TUPRS selected-year disclosure section. These are dated archival listing references, not necessarily today\'s news. observedAt is acquisition time, never publication time. No document body or KAP API was fetched; list membership does not verify financial/legal effect. Conflicting link descriptions require review. Check publisher dates and source health before commentary; never infer news or a trading signal from a refreshed archive.' } };
}
module.exports = { getIntelligenceContext };
