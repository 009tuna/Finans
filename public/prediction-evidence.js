// Shared eligibility for technical scenario records. Does not rewrite records or score prices.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansPredictionEvidence = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const markets = ['us', 'bist', 'crypto'];
  const sources = ['system', 'user'];
  const wins = ['target-hit', 'expired-win'];
  const losses = ['stop-hit', 'expired-loss'];
  const methods = ['daily_bar_range', 'completed_daily_close'];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const time = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  const version = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const zones = {us:'America/New_York',bist:'Europe/Istanbul',crypto:'UTC'};
  const localDay = (at, market) => new Intl.DateTimeFormat('en-CA', {
    timeZone:zones[market],year:'numeric',month:'2-digit',day:'2-digit',
  }).format(new Date(at));

  function classify(record, nowIso) {
    const p = record || {};
    const now = time(nowIso || new Date().toISOString());
    const source = sources.includes(p.source) ? p.source : 'unknown';
    const market = markets.includes(p.market) ? p.market : 'unknown';
    const strategyVersion = version(p.strategyVersion);
    const resolverVersion = version(p.resolverVersion);
    const reasons = [];
    let status;
    const created = time(p.createdAt), resolved = time(p.resolvedAt);
    if (!version(p.id)) reasons.push('missing_record_id');
    if (!Number.isFinite(now) || !Number.isFinite(created) || created > now) reasons.push('invalid_creation_time');
    if (market === 'unknown') reasons.push('unknown_market');
    if (![p.entry, p.target, p.stop].every(finite) || p.entry <= 0 || p.stop <= 0 || !(p.stop < p.entry && p.target > p.entry)) reasons.push('invalid_levels');
    if (p.outcome !== 'open') {
      if (!Number.isFinite(resolved) || resolved <= created) reasons.push('invalid_resolution_time');
      else if (resolved > now) reasons.push('future_resolution');
      if (!wins.includes(p.outcome) && !losses.includes(p.outcome) && p.outcome !== 'ambiguous') reasons.push('unknown_outcome');
    }
    if (reasons.length) status = 'invalid';
    else if (p.outcomeEvidence === 'ambiguous_bar' || p.outcome === 'ambiguous') {
      status = 'ambiguous'; reasons.push('ambiguous_bar');
    } else {
      if (source === 'unknown') reasons.push('missing_source');
      if (!strategyVersion) reasons.push('missing_strategy_version');
      if (p.outcome !== 'open') {
        if (!resolverVersion) reasons.push('missing_resolver_version');
        if (!p.outcomeEvidence) reasons.push('missing_outcome_evidence');
      }
      if (reasons.length) status = 'legacy';
      else if (p.outcome === 'open') status = 'versioned_open';
      else {
        if (resolverVersion !== 'daily-bar-resolver-v3') reasons.push('unsupported_resolver_version');
        if (!methods.includes(p.outcomeEvidence)) reasons.push('unsupported_outcome_evidence');
        if ((p.outcome === 'target-hit' || p.outcome === 'stop-hit') && p.outcomeEvidence !== 'daily_bar_range') reasons.push('outcome_evidence_mismatch');
        if ((p.outcome === 'expired-win' || p.outcome === 'expired-loss') && p.outcomeEvidence !== 'completed_daily_close') reasons.push('outcome_evidence_mismatch');
        const barEnd = time(p.barEndAt);
        if (!Number.isFinite(barEnd) || barEnd <= created || barEnd > resolved || barEnd > now) reasons.push('invalid_bar_time');
        const barDay = typeof p.barDate === 'string' ? Date.parse(p.barDate + 'T00:00:00Z') : NaN;
        const validBarDate = Number.isFinite(barDay) && /^\d{4}-\d{2}-\d{2}$/.test(p.barDate) && new Date(barDay).toISOString().slice(0,10) === p.barDate;
        if (!validBarDate) reasons.push('invalid_bar_date');
        else if (p.barDate <= localDay(created, market) || p.barDate >= localDay(resolved, market) ||
          (Number.isFinite(barEnd) && (market === 'crypto' ? barEnd !== barDay + 86400000 : localDay(barEnd, market) !== p.barDate))) reasons.push('bar_day_mismatch');
        if (!finite(p.closePrice) || p.closePrice <= 0 || !finite(p.resultPct)) reasons.push('missing_result');
        else if (Math.abs(p.resultPct - ((p.closePrice - p.entry) / p.entry * 100)) > 0.11) reasons.push('inconsistent_return');
        if (finite(p.closePrice) && ((p.outcome === 'target-hit' && p.closePrice !== p.target) ||
          (p.outcome === 'stop-hit' && p.closePrice !== p.stop) ||
          (p.outcome === 'expired-win' && p.closePrice <= p.entry) ||
          (p.outcome === 'expired-loss' && p.closePrice > p.entry))) reasons.push('outcome_price_mismatch');
        if (reasons.length) status = 'invalid';
        else status = 'versioned_result';
      }
    }
    const cohortKey = JSON.stringify(status === 'versioned_result' || status === 'versioned_open'
      ? [status, source, market, strategyVersion, resolverVersion]
      : [status, source, market]);
    return {status, eligible: status === 'versioned_result', reasons, cohortKey, source, market, strategyVersion, resolverVersion};
  }

  function group(predictions, nowIso) {
    const records = Array.isArray(predictions) ? predictions : [];
    const cutoff = nowIso || new Date().toISOString();
    const ids = new Map();
    records.forEach(record => {if (record && record.id) ids.set(record.id,(ids.get(record.id)||0)+1);});
    const groups = new Map();
    const counts = {versioned_open: 0, versioned_result: 0, legacy: 0, invalid: 0, ambiguous: 0};
    const reasons = {};
    for (const record of records) {
      const evidence = classify(record, cutoff);
      if (record && ids.get(record.id) > 1) {
        evidence.status = 'invalid'; evidence.eligible = false; evidence.reasons.push('duplicate_record_id');
        evidence.cohortKey = JSON.stringify(['invalid',evidence.source,evidence.market]);
      }
      counts[evidence.status]++;
      for (const reason of new Set(evidence.reasons)) reasons[reason] = (reasons[reason] || 0) + 1;
      if (!groups.has(evidence.cohortKey)) groups.set(evidence.cohortKey, {
        key:evidence.cohortKey, status:evidence.status, source:evidence.source, market:evidence.market,
        strategyVersion:evidence.strategyVersion, resolverVersion:evidence.resolverVersion, items:[],
      });
      groups.get(evidence.cohortKey).items.push(record);
    }
    return {groups:[...groups.values()], counts, reasons};
  }
  const reasonLabels = {
    missing_record_id:'Kayıt kimliği eksik',invalid_creation_time:'Oluşturma zamanı geçersiz',unknown_market:'Piyasa bilinmiyor',invalid_levels:'Fiyat seviyeleri geçersiz',invalid_resolution_time:'Sonuç zamanı geçersiz',future_resolution:'Sonuç zamanı gelecekte',unknown_outcome:'Sonuç türü bilinmiyor',ambiguous_bar:'Aynı mumda hedef ve stop; sıra bilinmiyor',missing_source:'Kayıt kaynağı eksik',missing_strategy_version:'Strateji sürümü eksik',missing_resolver_version:'Ölçüm sürümü eksik',missing_outcome_evidence:'Sonuç kanıtı eksik',unsupported_resolver_version:'Ölçüm sürümü desteklenmiyor',unsupported_outcome_evidence:'Kanıt yöntemi desteklenmiyor',outcome_evidence_mismatch:'Sonuç ve kanıt yöntemi uyuşmuyor',invalid_bar_time:'Mum zamanı geçersiz',invalid_bar_date:'Mum tarihi geçersiz',bar_day_mismatch:'Mum günü zaman aralığına uymuyor',missing_result:'Sayısal sonuç eksik',inconsistent_return:'Getiri ve fiyat uyuşmuyor',outcome_price_mismatch:'Sonuç ve kapanış fiyatı uyuşmuyor',duplicate_record_id:'Kayıt kimliği tekrarlanıyor',classifier_unavailable:'Ölçüm kontrolü okunamadı'
  };
  const reasonLabel = reason => reasonLabels[reason] || 'Diğer ölçüm kontrolü';
  return {classify, group, reasonLabel};
});
