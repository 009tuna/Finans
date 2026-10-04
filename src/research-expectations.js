'use strict';
// The agenda is a research task list, never a forecast or a market consensus.
// It only uses known future release records; the researcher must verify them.
const { METRICS } = require('./cpi-sources');
const HORIZON_DAYS = 14;
const validTime = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const identity = row => [row.market, row.metric, row.unit, row.period, row.scheduledAt].join('|');
const matches = (row, target) => row?.market === target.market && row.metric === target.metric && row.unit === target.unit
  && row.period === target.period && Date.parse(row.scheduledAt) === Date.parse(target.scheduledAt);
function buildExpectationCoverage(independent = {}, asOf = new Date().toISOString()) {
  if (!validTime(asOf)) throw new TypeError('Expectation coverage requires a timestamp');
  const macro = independent.macro || {}, end = Date.parse(asOf) + HORIZON_DAYS * 86400000;
  return [
    { family: 'us_nonfarm_payroll_change', label: 'Tarım dışı istihdam', data: macro },
    { family: 'us_cpi', label: 'CPI', data: macro.families?.us_cpi || {} },
  ].map(({ family, label, data }) => {
    const event = data.nextEvent, sourceStatus = data.sourceStatus?.status || data.status || 'not_initialized';
    const failures = Array.isArray(data.sourceStatus?.failures) ? data.sourceStatus.failures : [];
    const scheduleFailed = failures.some(item => item?.scope === 'schedule' || item?.errorCode === 'invalid_schedule_proof');
    const sourceUnreadable = !['available', 'partial'].includes(sourceStatus) || data.storeStatus?.status === 'unavailable'
      || scheduleFailed || event?.scheduleVerification === 'model-cited-web-research';
    const scheduleInvalid = event && (!validTime(event.scheduledAt) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.period || ''));
    const future = event && !scheduleInvalid && Date.parse(event.scheduledAt) > Date.parse(asOf);
    let status, reason;
    if (sourceUnreadable || scheduleInvalid) {
      status = 'unavailable';
      reason = label + ' takvimi kaynak akışında doğrulanamadı. Bu durum yaklaşan açıklama olmadığı anlamına gelmez; canlı araştırmanın bulduğu takvim ve beklenti kaynakları ayrıca değerlendirilir.';
    } else if (event?.scheduleConflict) {
      status = 'schedule_conflict';
      reason = label + ' açıklama saatine ilişkin kayıtlar çelişiyor. Saat doğrulanmadan yeni sayısal görüş üretilmez.';
    } else if (!future || Date.parse(event.scheduledAt) > end) {
      status = 'no_upcoming_release';
      reason = label + ' kaynak takviminin kayıtlarında gelecek ' + HORIZON_DAYS + ' gün için açıklama bulunmuyor.';
    } else {
      status = 'available';
      reason = label + ' için yaklaşan açıklama kaydı mevcut. Sayısal görüş ayrıca tarihli veri ve canlı kaynak doğrulaması gerektirir.';
    }
    return { family, status, reason, checkedAt: asOf, scheduledAt: future ? event.scheduledAt : null, scope: 'independent_calendar' };
  });
}
function attachExpectationContext(research, context = {}) {
  // This is runtime metadata, not a claim that the model performed a review.
  // It preserves independently detected gaps even when the model omits prose.
  return { ...research, analysisAsOf: context.analysisAsOf,
    expectationCoverage: buildExpectationCoverage(context.independent, context.analysisAsOf) };
}
function buildExpectationAgenda(independent = {}, asOf = new Date().toISOString()) {
  if (!validTime(asOf)) throw new TypeError('Expectation agenda requires a timestamp');
  const now = Date.parse(asOf), end = now + HORIZON_DAYS * 86400000;
  const macro = independent.macro || {}, cpi = macro.families?.us_cpi || {};
  const targets = [];
  function add(event, metric, unit, records, family, label) {
    if (!event || !validTime(event.scheduledAt) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.period || '')
      || Date.parse(event.scheduledAt) <= now || Date.parse(event.scheduledAt) > end) return;
    const target = { market: 'us', metric, unit, period: event.period, scheduledAt: event.scheduledAt, label,
      scheduleSourceUrl: event.sourceUrl || null, scheduleVerification: event.scheduleVerification || 'independent-source-record',
      scheduleConflict: Boolean(event.scheduleConflict), sourceStatus: family.sourceStatus || null, storeStatus: family.storeStatus || null };
    const eligible = row => {
      const created = row?.createdAt || row?.recordedAt || row?.knowledgeCutoff;
      const cutoff = row?.knowledgeCutoff || created;
      return matches(row, target) && Number.isFinite(row.pointEstimate) && validTime(created) && validTime(cutoff)
        && Date.parse(cutoff) <= Date.parse(created) && Date.parse(created) <= now
        && Date.parse(created) < Date.parse(target.scheduledAt);
    };
    const frozen = (records.frozenModelForecasts || []).filter(eligible).sort((a, b) =>
      Date.parse(a.recordedAt || a.createdAt || a.knowledgeCutoff) - Date.parse(b.recordedAt || b.createdAt || b.knowledgeCutoff))[0];
    const reviews = (records.modelForecastReviews || []).filter(eligible).sort((a, b) =>
      Date.parse(b.knowledgeCutoff || b.recordedAt || b.createdAt) - Date.parse(a.knowledgeCutoff || a.recordedAt || a.createdAt));
    const brief = row => row ? { pointEstimate: row.pointEstimate, knowledgeCutoff: row.knowledgeCutoff || row.recordedAt || row.createdAt,
      runId: row.runId || null, rationale: row.rationale || '', sourceIds: row.sourceIds || [] } : null;
    target.firstFrozenForecast = brief(frozen);
    target.latestModelOpinion = brief(reviews[0] || frozen);
    target.consensus = records.consensus || null;
    target.consensusStatus = records.consensusStatus || 'not_connected';
    target.key = identity(target);
    targets.push(target);
  }
  add(macro.nextEvent, 'us_nonfarm_payroll_change', 'thousand_jobs', macro, macro, 'Tarım dışı istihdam');
  const cpiLabels = ['Manşet CPI · aylık', 'Çekirdek CPI · aylık', 'Manşet CPI · yıllık', 'Çekirdek CPI · yıllık'];
  METRICS.forEach((policy, index) => add(cpi.nextEvent, policy.metric, policy.unit,
    (cpi.metrics || []).find(row => row.metric === policy.metric) || {}, cpi, cpiLabels[index]));
  return targets.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}
function validateExpectationCoverage(research, agenda = [], now = new Date().toISOString()) {
  const forecasts = research.forecasts || [], abstentions = research.forecastAbstentions || [];
  const reassessments = research.expectationReassessments || [];
  for (const item of reassessments) {
    const target = agenda.find(row => matches(item, row));
    if (!target?.firstFrozenForecast) throw new Error('Yeniden degerlendirme gundemdeki kilitli goruse baglanmali: ' + item.metric);
  }
  for (const target of agenda) {
    if (Date.parse(target.scheduledAt) <= Date.parse(now)) continue;
    const forecast = forecasts.find(row => matches(row, target));
    const abstention = abstentions.find(row => matches(row, target));
    const reassessment = reassessments.find(row => matches(row, target));
    if (forecast && abstention) throw new Error('Ayni beklenti icin tahmin ve kacinma birlikte olamaz: ' + target.metric);
    if (target.scheduleConflict && !abstention) throw new Error('Takvim celiskisinde beklenti kacinma gerekcesi gerekli: ' + target.metric);
    if (target.firstFrozenForecast) {
      if (!reassessment) throw new Error('Kilitli gorus bugunku yeniden degerlendirme yerine gecemez: ' + target.metric);
      if (reassessment.status === 'unchanged' && (forecast || abstention)
        || reassessment.status === 'updated' && !forecast || reassessment.status === 'abstained' && !abstention) throw new Error('Yeniden degerlendirme durumu beklenti kaydiyla celisiyor: ' + target.metric);
    } else if (!forecast && !abstention) throw new Error('Sabah beklenti gundemi atlanamaz: ' + target.metric);
  }
  return true;
}
module.exports = { HORIZON_DAYS, buildExpectationAgenda, buildExpectationCoverage, attachExpectationContext, validateExpectationCoverage };
