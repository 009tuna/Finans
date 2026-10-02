(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FinansMacro = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  const MARKETS = ['us', 'bist', 'crypto'];
  const MARKET_NAMES = { us: 'ABD', bist: 'BIST', crypto: 'Kripto' };
  const METHOD_NAMES = {
    'macro:last-observation:v1': 'Son ilk açıklanan değer',
    'macro:trailing-three-mean:v1': 'Eldeki son üç ilk açıklama · v1',
    'macro:trailing-three-consecutive:v2': 'Önceki üç ayın ilk açıklama ortalaması · v2',
    last_observation: 'Son ilk açıklanan değer',
    trailing_three_mean: 'Eldeki son üç ilk açıklama · v1',
  };
  const MARKET_NEWS_LIMIT = { marketNewsOverview: 4, marketNewsWorkspace: 8 };
  const CPI_METRICS = ['us_cpi_headline_mom_sa', 'us_cpi_core_mom_sa', 'us_cpi_headline_yoy_nsa', 'us_cpi_core_yoy_nsa'];
  const CPI_LABELS = {
    us_cpi_headline_mom_sa: 'Manşet · aylık · mevsim etkisinden arındırılmış',
    us_cpi_core_mom_sa: 'Çekirdek · aylık · mevsim etkisinden arındırılmış',
    us_cpi_headline_yoy_nsa: 'Manşet · yıllık · mevsim etkisinden arındırılmamış',
    us_cpi_core_yoy_nsa: 'Çekirdek · yıllık · mevsim etkisinden arındırılmamış',
  };
  const CPI_SHORT_LABELS = {
    us_cpi_headline_mom_sa: 'Manşet · aylık', us_cpi_core_mom_sa: 'Çekirdek · aylık',
    us_cpi_headline_yoy_nsa: 'Manşet · yıllık', us_cpi_core_yoy_nsa: 'Çekirdek · yıllık',
  };
  const CPI_METHOD_NAMES = {
    last_first_release_v1: 'Son ilk açıklanan değer · v1',
    consecutive_three_first_releases_v1: 'Önceki üç ilk açıklama ortalaması · v1',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function externalLink(value, label, className) {
    const url = safeUrl(value);
    if (!url) return '<span' + (className ? ' class="' + escapeHtml(className) + '"' : '') + '>' + escapeHtml(label) + '</span>';
    return '<a' + (className ? ' class="' + escapeHtml(className) + '"' : '') + ' href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
  }

  function validDate(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  }

  function formatDate(value, options) {
    const date = validDate(value);
    if (!date) return 'Tarih doğrulanamadı';
    const config = Object.assign({}, options || {});
    if (!config.dateStyle && !config.year && !config.month && !config.day) config.dateStyle = 'medium';
    return new Intl.DateTimeFormat('tr-TR', config).format(date);
  }

  function formatTimestamp(value) {
    if (!value) return 'Yayın zamanı doğrulanamadı';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDay(value);
    return formatDate(value, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
  }

  function formatDay(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return 'Yayın tarihi doğrulanamadı';
    return formatDate(value + 'T12:00:00Z', { timeZone: 'Europe/Istanbul' });
  }

  function formatNumber(value, digits = 1) {
    if (!isFiniteValue(value)) return 'Veri yok';
    return Number(value).toLocaleString('tr-TR', { maximumFractionDigits: digits });
  }

  function isFiniteValue(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }

  const MODEL_ARRAY_KEYS = ['modelForecasts', 'modelForecastReviews', 'modelOutcomes', 'modelScenarios', 'modelForecastExclusions', 'modelReviewExclusions'];

  function cloneModelItem(item) {
    if (!item || typeof item !== 'object') return item;
    try { return structuredClone(item); } catch (_) { return Object.assign({}, item); }
  }

  function modelResearchStatus(data) {
    const status = data && data.researchStatus;
    const value = typeof status === 'string' ? status : status && status.status;
    return { status: value || null, checkedAt: data && (data.researchCheckedAt || status && status.checkedAt) || null };
  }

  function sourceStoreStatus(data, familyName) {
    const source = familyModelSource(data, familyName);
    return source && source.storeStatus || familyName === 'us_nfp' && data && data.storeStatus || null;
  }

  function sourceHasRecords(data, familyName) {
    const source = familyModelSource(data, familyName);
    if (!source) return false;
    if (familyName === 'us_cpi') return Boolean((Array.isArray(source.metrics) && source.metrics.some((metric) => metric && (metric.previousFirstRelease || metric.forecasts && metric.forecasts.length || metric.outcomes && metric.outcomes.length || metric.consensus))) || (Array.isArray(source.observations) && source.observations.length) || (Array.isArray(source.forecasts) && source.forecasts.length));
    return Boolean((Array.isArray(source.observations) && source.observations.length) || (Array.isArray(source.forecasts) && source.forecasts.length) || (Array.isArray(source.outcomes) && source.outcomes.length));
  }

  function sourceSnapshot(data, familyName, now) {
    const source = familyModelSource(data, familyName);
    if (!source || !sourceHasRecords(data, familyName)) return null;
    const keys = ['events', 'nextEvent', 'observations', 'forecasts', 'outcomes', 'scorecards', 'calibration', 'methodAbstentions', 'proof', 'correctionReviews', 'revisions', 'revisionConflicts', 'sourceVerifications', 'observationConflicts', 'forecastProvenance', 'forecastProvenanceIssues', 'provenanceExclusions', 'updatedAt'];
    const snapshot = { capturedAt: source.sourceStatus?.lastSuccessfulAt || source.updatedAt || data.updatedAt || null };
    keys.forEach((key) => { if (source[key] !== undefined) snapshot[key] = cloneModelItem(source[key]); });
    if (familyName === 'us_cpi') {
      snapshot.metrics = (source.metrics || []).map((metric) => {
        const copy = cloneModelItem(metric) || {};
        MODEL_ARRAY_KEYS.concat(['modelScorecard']).forEach((key) => { delete copy[key]; });
        return copy;
      });
    }
    return snapshot;
  }

  function applySourceSnapshot(data, familyName, snapshot, incomingSource) {
    if (!snapshot) return data;
    const next = Object.assign({}, data);
    const targetSource = familyName === 'us_cpi' ? familyModelSource(data, familyName) : next;
    const target = Object.assign({}, targetSource);
    ['events', 'nextEvent', 'observations', 'forecasts', 'outcomes', 'scorecards', 'calibration', 'methodAbstentions', 'proof', 'correctionReviews', 'revisions', 'revisionConflicts', 'sourceVerifications', 'observationConflicts', 'forecastProvenance', 'forecastProvenanceIssues', 'provenanceExclusions', 'updatedAt'].forEach((key) => {
      if (snapshot[key] !== undefined) target[key] = cloneModelItem(snapshot[key]);
    });
    const citedIncomingEvents = [].concat(incomingSource.nextEvent || [], incomingSource.events || [])
      .filter((event) => event && event.scheduleVerification === 'model-cited-web-research')
      .filter((event, index, items) => items.findIndex((candidate) => (candidate.eventId || [candidate.metric, candidate.period, candidate.scheduledAt].join('|')) === (event.eventId || [event.metric, event.period, event.scheduledAt].join('|'))) === index)
      .map(cloneModelItem);
    if (citedIncomingEvents.length) {
      const events = Array.isArray(target.events) ? target.events.slice() : [];
      const eventKey = (event) => event && (event.eventId || [event.metric, event.period, event.scheduledAt].join('|'));
      const seen = new Set(events.map(eventKey).filter(Boolean));
      citedIncomingEvents.forEach((event) => {
        const key = eventKey(event);
        if (!key || seen.has(key)) return;
        events.push(event);
        seen.add(key);
      });
      target.events = events;
      const citedNext = citedIncomingEvents.slice().sort((a, b) => (Date.parse(a.scheduledAt) || 0) - (Date.parse(b.scheduledAt) || 0))[0];
      const currentNextAt = target.nextEvent && Date.parse(target.nextEvent.scheduledAt);
      if (!target.nextEvent || !Number.isFinite(currentNextAt) || (Number.isFinite(Date.parse(citedNext.scheduledAt)) && Date.parse(citedNext.scheduledAt) > currentNextAt)) target.nextEvent = citedNext;
    }
    if (familyName === 'us_cpi') {
      const modelFields = ['modelForecasts', 'modelForecastReviews', 'modelOutcomes', 'modelScorecard', 'modelForecastExclusions', 'modelReviewExclusions'];
      const incomingByMetric = new Map((incomingSource.metrics || []).map((metric) => [metric.metric, metric]));
      target.metrics = (snapshot.metrics || []).map((metric) => {
        const incoming = incomingByMetric.get(metric.metric);
        const preserved = {};
        modelFields.forEach((key) => { if (incoming && incoming[key] !== undefined) preserved[key] = cloneModelItem(incoming[key]); });
        return Object.assign({}, metric, preserved);
      });
      target.sourceStatus = Object.assign({}, incomingSource.sourceStatus || {}, { cached: true, originalSourceUpdatedAt: snapshot.capturedAt });
      next.families = Object.assign({}, data.families, { us_cpi: target });
    } else {
      next.events = target.events;
      next.nextEvent = target.nextEvent;
      next.observations = target.observations;
      next.forecasts = target.forecasts;
      next.outcomes = target.outcomes;
      next.scorecards = target.scorecards;
      next.calibration = target.calibration;
      next.methodAbstentions = target.methodAbstentions;
      next.proof = target.proof;
      next.correctionReviews = target.correctionReviews;
      next.revisions = target.revisions;
      next.revisionConflicts = target.revisionConflicts;
      next.sourceVerifications = target.sourceVerifications;
      next.observationConflicts = target.observationConflicts;
      next.forecastProvenance = target.forecastProvenance;
      next.forecastProvenanceIssues = target.forecastProvenanceIssues;
      next.provenanceExclusions = target.provenanceExclusions;
      next.updatedAt = target.updatedAt;
      next.sourceStatus = Object.assign({}, incomingSource.sourceStatus || {}, { cached: true, originalSourceUpdatedAt: snapshot.capturedAt });
    }
    return next;
  }

  function clearSourceLayer(data, familyName, incomingSource) {
    const next = Object.assign({}, data);
    const empty = { events: [], nextEvent: null, observations: [], forecasts: [], outcomes: [], scorecards: [], calibration: [], methodAbstentions: [], proof: [], correctionReviews: [], revisions: [], revisionConflicts: [], sourceVerifications: [], observationConflicts: [], forecastProvenance: [], forecastProvenanceIssues: [], provenanceExclusions: [], updatedAt: null };
    const citedSeen = new Set();
    const citedEvents = [].concat(incomingSource && incomingSource.nextEvent || [], incomingSource && incomingSource.events || [])
      .filter((event) => event && event.scheduleVerification === 'model-cited-web-research')
      .filter((event) => {
        const key = event.eventId || [event.metric, event.period, event.scheduledAt].join('|');
        if (citedSeen.has(key)) return false;
        citedSeen.add(key);
        return true;
      })
      .map(cloneModelItem)
      .sort((a, b) => (Date.parse(a.scheduledAt) || 0) - (Date.parse(b.scheduledAt) || 0));
    const citedEvent = citedEvents[0] || null;
    if (familyName === 'us_cpi') {
      const source = familyModelSource(data, familyName);
      next.families = Object.assign({}, data.families, { us_cpi: Object.assign({}, source, empty, { events: citedEvents, nextEvent: citedEvent, metrics: [], sourceStatus: incomingSource.sourceStatus }) });
    } else {
      Object.assign(next, empty, { events: citedEvents, nextEvent: citedEvent, sourceStatus: incomingSource.sourceStatus });
    }
    return next;
  }

  function mergeSourceCache(data, cache, now) {
    let next = Object.assign({}, data);
    ['us_nfp', 'us_cpi'].forEach((familyName) => {
      const incomingSource = familyModelSource(data, familyName);
      if (!incomingSource) return;
      const status = sourceStoreStatus(data, familyName);
      const unavailable = status && status.status === 'unavailable';
      const incoming = sourceSnapshot(data, familyName, now);
      if (!unavailable) {
        if (incoming) cache[familyName] = incoming;
        else if (status && status.status === 'available') cache[familyName] = null;
        return;
      }
      if (cache[familyName]) next = applySourceSnapshot(next, familyName, cache[familyName], incomingSource);
      else next = clearSourceLayer(next, familyName, incomingSource);
    });
    return next;
  }

  function familyModelSource(data, familyName) {
    return familyName === 'us_cpi' ? data && data.families && data.families.us_cpi : data;
  }

  function modelEvent(data, familyName, now) {
    const source = familyModelSource(data, familyName);
    return familyName === 'us_cpi' ? source && source.nextEvent || null : matchPayrollEvent(data, now);
  }

  function modelItemMatchesEvent(item, event, metric) {
    if (!item || !event || (!item.eventId && !item.period)) return false;
    if (item.eventId && item.eventId !== event.eventId) return false;
    if (item.period && item.period !== event.period) return false;
    if (metric && item.metric && item.metric !== metric) return false;
    return true;
  }

  function modelArray(source, key, event, metric) {
    return (Array.isArray(source && source[key]) ? source[key] : []).filter((item) => modelItemMatchesEvent(item, event, metric)).map(cloneModelItem);
  }

  function snapshotIdentity(snapshot) { return snapshot && [snapshot.eventId, snapshot.period, snapshot.metric || ''].join('|'); }

  function uniqueSnapshots(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      const key = snapshotIdentity(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function modelSnapshot(data, familyName, now) {
    const source = familyModelSource(data, familyName);
    const event = modelEvent(data, familyName, now);
    if (!source || !event) return null;
    const snapshot = { eventId: event.eventId, period: event.period, metric: event.metric || null, capturedAt: data && (data.researchCheckedAt || data.updatedAt) || null };
    MODEL_ARRAY_KEYS.forEach((key) => { snapshot[key] = modelArray(source, key, event); });
    if (familyName === 'us_cpi') {
      snapshot.metrics = (Array.isArray(source.metrics) ? source.metrics : []).map((metric) => ({
        metric: metric && metric.metric,
        modelForecasts: modelArray(metric, 'modelForecasts', event, metric && metric.metric),
        modelForecastReviews: modelArray(metric, 'modelForecastReviews', event, metric && metric.metric),
        modelOutcomes: modelArray(metric, 'modelOutcomes', event, metric && metric.metric),
        modelForecastExclusions: modelArray(metric, 'modelForecastExclusions', event, metric && metric.metric),
        modelReviewExclusions: modelArray(metric, 'modelReviewExclusions', event, metric && metric.metric),
        modelScorecard: cloneModelItem(metric && metric.modelScorecard || null),
      })).filter((metric) => metric.metric);
    }
    snapshot.hasRecords = MODEL_ARRAY_KEYS.some((key) => snapshot[key].length) || snapshot.metrics?.some((metric) =>
      metric.modelForecasts.length || metric.modelForecastReviews.length || metric.modelOutcomes.length || metric.modelScorecard && (metric.modelScorecard.n || metric.modelScorecard.sampleSize));
    return snapshot;
  }

  function snapshotMatchesEvent(snapshot, event) {
    return Boolean(snapshot && event && snapshot.eventId === event.eventId && snapshot.period === event.period);
  }

  function modelStatusFor(data, familyName) {
    const source = familyModelSource(data, familyName);
    return source && source.storeStatus && source.storeStatus.status === 'unavailable' ? source.storeStatus : data && data.storeStatus && familyName === 'us_nfp' ? data.storeStatus : null;
  }

  function applyModelSnapshot(data, familyName, snapshot, history, statusInfo, now) {
    const source = familyModelSource(data, familyName);
    if (!source) return data;
    const next = Object.assign({}, data);
    const correctionReviews = [].concat(Array.isArray(data.correctionReviews) ? data.correctionReviews : [], Array.isArray(source.correctionReviews) ? source.correctionReviews : []);
    const stale = statusInfo.status === 'unavailable' || statusInfo.status === 'store_unavailable';
    const affectedByCorrection = Boolean(source.nextEvent && source.nextEvent.scheduleConflict) || correctionReviews.length > 0;
    const markOutcome = (outcome) => Object.assign({}, outcome, stale ? { stale: true, contested: Boolean(outcome.contested || affectedByCorrection) } : {});
    const staleScore = (score) => stale && score && typeof score === 'object' ? Object.assign({}, score, { stale: true }) : score;
    const target = familyName === 'us_cpi'
      ? Object.assign({}, source, { metrics: (Array.isArray(source.metrics) ? source.metrics : []).map((metric) => Object.assign({}, metric)) })
      : next;
    MODEL_ARRAY_KEYS.forEach((key) => { target[key] = snapshot && Array.isArray(snapshot[key]) ? snapshot[key].slice() : []; });
    target.modelOutcomes = target.modelOutcomes.map(markOutcome);
    if (familyName === 'us_cpi') {
      const byMetric = new Map((snapshot && snapshot.metrics || []).map((metric) => [metric.metric, metric]));
      target.metrics = target.metrics.map((metric) => {
        const cached = byMetric.get(metric.metric);
        return Object.assign({}, metric, {
          modelForecasts: cached ? cached.modelForecasts.slice() : [],
          modelForecastReviews: cached ? cached.modelForecastReviews.slice() : [],
          modelOutcomes: cached ? cached.modelOutcomes.map(markOutcome) : [],
          modelForecastExclusions: cached ? cached.modelForecastExclusions.slice() : [],
          modelReviewExclusions: cached ? cached.modelReviewExclusions.slice() : [],
          modelScorecard: staleScore(cached && cached.modelScorecard || {}),
        });
      });
      next.families = Object.assign({}, data.families, { us_cpi: target });
    }
    const checkedAt = statusInfo.checkedAt || now;
    if (statusInfo.status === 'available') {
      delete target.modelStatus;
      delete target.modelWarning;
    } else {
      target.modelStatus = { status: statusInfo.status || 'unavailable', checkedAt, cached: Boolean(snapshot), cachedAt: snapshot && snapshot.capturedAt || null, stale: stale || affectedByCorrection };
      target.modelWarning = statusInfo.status === 'store_unavailable'
        ? snapshot ? 'Model kaynak eşleşmesi geçici olarak doğrulanamıyor; son başarılı model kaydı gösteriliyor.' : 'Model kaynak eşleşmesi geçici olarak doğrulanamıyor; doğrulanmış model kaydı gösterilemiyor.'
        : snapshot ? 'Model kayıtlarına erişilemiyor; son başarılı model kaydı korunuyor.' : 'Model kayıtlarına erişilemiyor; doğrulanmış model kaydı gösterilemiyor.';
    }
    target.modelHistory = (history || []).filter(Boolean).map((item) => ({
      eventId: item.eventId, period: item.period, metric: item.metric || null, capturedAt: item.capturedAt || null,
      modelForecasts: (item.modelForecasts || []).slice(), modelForecastReviews: (item.modelForecastReviews || []).slice(),
      modelOutcomes: (item.modelOutcomes || []).slice(), modelScenarios: (item.modelScenarios || []).slice(), metrics: cloneModelItem(item.metrics || []),
    }));
    return next;
  }

  function mergeModelCache(data, cache, now) {
    const next = Object.assign({}, data);
    const research = modelResearchStatus(data);
    ['us_nfp', 'us_cpi'].forEach((familyName) => {
      const source = familyModelSource(data, familyName);
      if (!source) return;
      const event = modelEvent(data, familyName, now);
      const incoming = modelSnapshot(data, familyName, now);
      const storeUnavailable = modelStatusFor(data, familyName)?.status === 'unavailable';
      const modelUnavailable = research.status === 'unavailable' || storeUnavailable;
      const previous = cache[familyName];
      if (!modelUnavailable) {
        if (incoming && incoming.hasRecords) {
          cache[familyName] = { current: incoming, history: uniqueSnapshots(previous ? [previous.current, ...(previous.history || [])].filter(Boolean).filter((item) => snapshotIdentity(item) !== snapshotIdentity(incoming)) : []).slice(0, 8) };
        } else if (research.status === 'available' || research.status === 'partial') {
          cache[familyName] = null;
        }
        return;
      }
      const candidates = previous ? [previous.current, ...(previous.history || [])].filter(Boolean) : [];
      const cachedCurrent = candidates.find((item) => snapshotMatchesEvent(item, event)) || null;
      const freshResearch = research.status === 'available' || research.status === 'partial';
      const current = research.status === 'unavailable'
        ? cachedCurrent
        : storeUnavailable && !freshResearch
        ? cachedCurrent || (incoming && incoming.hasRecords ? incoming : null)
        : (incoming && incoming.hasRecords && snapshotMatchesEvent(incoming, event)) ? incoming : cachedCurrent;
      const history = uniqueSnapshots(candidates.filter((item) => !snapshotMatchesEvent(item, event)));
      const incomingIsCurrent = Boolean(incoming && current === incoming && incoming.hasRecords);
      if (storeUnavailable && freshResearch && incomingIsCurrent) {
        cache[familyName] = { current: incoming, history: uniqueSnapshots([...(previous ? [previous.current, ...(previous.history || [])] : [])].filter(Boolean).filter((item) => snapshotIdentity(item) !== snapshotIdentity(incoming))).slice(0, 8) };
      }
      const statusInfo = research.status === 'unavailable' ? research : storeUnavailable && !(freshResearch && incomingIsCurrent) ? { status: 'store_unavailable', checkedAt: modelStatusFor(data, familyName)?.checkedAt } : { status: 'available', checkedAt: research.checkedAt };
      const applied = applyModelSnapshot(next, familyName, current, history, statusInfo, now);
      if (familyName === 'us_cpi') {
        next.families = applied.families;
      } else {
        MODEL_ARRAY_KEYS.concat(['modelStatus', 'modelWarning', 'modelHistory']).forEach((key) => { next[key] = applied[key]; });
      }
    });
    return next;
  }

  function periodLabel(period) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) return 'Dönem doğrulanamadı';
    return formatDate(period + '-15T12:00:00Z', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
  }

  function matchPayrollEvent(data, now = Date.now()) {
    const events = [].concat(data && data.nextEvent || [], data && data.events || []).filter((event) =>
      event && event.metric === 'us_nonfarm_payroll_change' && event.unit === 'thousand_jobs' &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(event.period || '') && event.eventId === 'us_nonfarm_payroll_change:' + event.period &&
      Number.isFinite(Date.parse(event.scheduledAt)) && Date.parse(event.scheduledAt) >= now);
    const unique = [...new Map(events.map((event) => [event.eventId, event])).values()];
    return unique.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0] || null;
  }

  function eventForecasts(data, event) {
    if (!event) return [];
    return (Array.isArray(data && data.forecasts) ? data.forecasts : []).filter((forecast) =>
      forecast && forecast.eventId === event.eventId && forecast.metric === event.metric &&
      forecast.unit === event.unit && forecast.period === event.period && forecast.methodId);
  }

  function observationFor(data, event) {
    const raw = data && data.observations;
    const observations = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw.latest, raw.previous].filter(Boolean) : [];
    return observations.filter((observation) => observation &&
      observation.metric === 'us_nonfarm_payroll_change' && observation.unit === 'thousand_jobs' && isFiniteValue(observation.value) &&
      safeUrl(observation.sourceUrl) && Number.isFinite(Date.parse(observation.publishedAt)) && /^\d{4}-(0[1-9]|1[0-2])$/.test(observation.period || '') && (!event || observation.period < event.period) &&
      observation.vintage === 'first_release')
      .sort((a, b) => b.period.localeCompare(a.period))[0] || null;
  }

  function exactOutcome(data, event) {
    if (!event) return null;
    return (Array.isArray(data && data.outcomes) ? data.outcomes : []).find((outcome) => outcome &&
      outcome.eventId === event.eventId && (outcome.metric == null || outcome.metric === event.metric) && (outcome.unit == null || outcome.unit === event.unit) &&
      (outcome.period == null || outcome.period === event.period) && isFiniteValue(outcome.actual) && safeUrl(outcome.sourceUrl) && Number.isFinite(Date.parse(outcome.publishedAt)) &&
      (!outcome.vintage || outcome.vintage === 'first_release')) || null;
  }

  function statusCopy(status) {
    return ({
      available: 'Yaklaşan doğrulanmış BLS takvim olayı yok.',
      unavailable: 'Makro verisine erişilemedi.',
      not_initialized: 'Makro kayıtları henüz başlatılmadı.',
      partial: 'Makro kapsamı kısmi; kaynak durumları ve dönem bilgileri aşağıda gösterilir.',
    })[status] || 'Makro kayıtları yükleniyor.';
  }

  function renderSourceHealth(data) {
    const raw = data && (data.sourceStatus || data.sources);
    if (!raw || typeof raw !== 'object') return '';
    const entries = raw.status ? [['BLS', raw]] : Object.entries(raw).filter(([, source]) => source && typeof source === 'object');
    if (!entries.length) return '';
    return '<div class="macro-source-health">' + entries.map(([name, source]) => {
      const reviewOnly = Array.isArray(source.failures) && source.failures.length && source.failures.every((item) => (item.code || item.errorCode) === 'forecast_provenance_review_required');
      const label = reviewOnly && source.lastSuccessfulAt ? 'Kaynak erişilebilir; eski tahminlerde zaman kanıtı eksik' : source.status === 'available' ? 'Erişilebilir' : source.status === 'partial' ? 'Kısmi' : source.status === 'unavailable' ? 'Erişilemiyor' : 'Durum bilinmiyor';
      const time = source.checkedAt ? ' · Kontrol ' + formatTimestamp(source.checkedAt) : '';
      const last = source.lastSuccessfulAt ? ' · Son başarılı ' + formatTimestamp(source.lastSuccessfulAt) : '';
      const cached = source.cached && source.originalSourceUpdatedAt ? ' · Son başarılı bağımsız kayıt ' + formatTimestamp(source.originalSourceUpdatedAt) + ' (cache)' : '';
      const failures = Array.isArray(source.failures) ? source.failures : [];
      const failure = failures.map((item) => item && [item.scope, item.code || item.errorCode, item.reason, item.checkedAt && formatTimestamp(item.checkedAt)].filter(Boolean).join(' · ')).filter(Boolean).join('; ');
      const sourceError = [source.errorCode, source.reason].filter(Boolean).join(' · ');
      const revisions = data.revisions && (Array.isArray(data.revisions) ? data.revisions : [data.revisions]);
      const revision = name === 'BLS' && revisions && revisions.length ? ' · Revizyon metaverisi mevcut' : '';
      return '<p><b>' + escapeHtml(name) + ':</b> ' + escapeHtml(label + time + last + cached + (failure ? ' · ' + failure : '') + (sourceError ? ' · ' + sourceError : '') + revision) + '</p>';
    }).join('') + '</div>';
  }

  function renderStoreStatus(data, label) {
    const status = data && data.storeStatus;
    if (!status || typeof status !== 'object' || !['unavailable', 'partial'].includes(status.status)) return '';
    const hasRecords = Boolean(status.lastSuccessfulAt || status.cached || (Array.isArray(data.observations) && data.observations.length) || (Array.isArray(data.forecasts) && data.forecasts.length) || (Array.isArray(data.metrics) && data.metrics.some((metric) => metric && (metric.previousFirstRelease || metric.forecasts && metric.forecasts.length))));
    const wording = status.status === 'unavailable'
      ? label + ' kayıt deposuna erişilemiyor; ' + (hasRecords ? 'doğrulanmış son kayıtlar korunuyor.' : 'doğrulanmış kayıt gösterilemiyor.')
      : label + ' kayıt deposu kısmen erişilebilir; gösterilen kayıtlar dönem ve kaynak kanıtıyla sınırlıdır.';
    const checked = status.checkedAt ? ' · Kontrol ' + formatTimestamp(status.checkedAt) : '';
    return '<p class="macro-layer-warning" role="status"><b>' + escapeHtml(wording) + '</b>' + escapeHtml(checked) + '</p>';
  }

  function renderModelHistory(data) {
    const history = Array.isArray(data && data.modelHistory) ? data.modelHistory : [];
    if (!history.length) return '';
    const sourceLinks = (items) => (items || []).flatMap((item) => Array.isArray(item && item.sourceEvidence) ? item.sourceEvidence : []).filter((item) => item && safeUrl(item.url)).slice(0, 3).map((item) => externalLink(item.url, item.title || 'Model kaynağı', 'macro-source-link')).join(' · ');
    return '<details class="macro-model-history"><summary>Önceki dönemin son başarılı model kaydı (' + history.length + ')</summary><div>' + history.slice(0, 4).map((item) => {
      const records = item.metrics && item.metrics.length ? item.metrics : [item];
      const scenario = item.modelScenarios && item.modelScenarios[0];
      const label = item.period ? periodLabel(item.period) : item.eventId || 'Dönem doğrulanamadı';
      const values = records.map((record) => {
        const forecast = record.modelForecasts && record.modelForecasts[0];
        const review = record.modelForecastReviews && record.modelForecastReviews[0];
        const outcome = record.modelOutcomes && record.modelOutcomes[0];
        const metricName = record.metric === 'us_nonfarm_payroll_change' ? 'Tarım dışı istihdam' : (CPI_SHORT_LABELS[record.metric] || record.metric || '');
        const recordUnit = record.unit || forecast?.unit || review?.unit || outcome?.unit;
        const unit = recordUnit === 'percent' ? '%' : recordUnit === 'thousand_jobs' ? ' bin kişi' : '';
        const metric = metricName ? ' · ' + metricName : '';
        const first = forecast && isFiniteValue(forecast.pointEstimate) ? '<p>İlk tahmin' + metric + ': <b>' + escapeHtml(formatNumber(forecast.pointEstimate, 2)) + escapeHtml(unit) + '</b>' + (forecast.rationale ? ' · ' + escapeHtml(forecast.rationale) : '') + '</p>' : '';
        const later = review && isFiniteValue(review.pointEstimate) ? '<p>Sonraki görüş' + metric + ': <b>' + escapeHtml(formatNumber(review.pointEstimate, 2)) + escapeHtml(unit) + '</b>' + (review.rationale ? ' · ' + escapeHtml(review.rationale) : '') + '</p>' : '';
        const result = outcome && isFiniteValue(outcome.value) ? '<p>Sonuç' + metric + ': <b>' + escapeHtml(formatNumber(outcome.value, 2)) + escapeHtml(unit) + '</b>' + (outcome.contested ? ' · Kanıt çelişkili; puanlama dışı' : '') + '</p>' : '';
        return first + later + result;
      }).join('');
      const scenarioCopy = scenario && scenario.condition ? '<p>Senaryo: ' + escapeHtml(scenario.condition) + (scenario.impact ? ' · ' + escapeHtml(scenario.impact) : '') + (scenario.invalidation ? ' · Geçersiz kılma: ' + escapeHtml(scenario.invalidation) : '') + '</p>' : '';
      const links = sourceLinks(records.flatMap((record) => [record.modelForecasts && record.modelForecasts[0], record.modelForecastReviews && record.modelForecastReviews[0]]).concat(scenario));
      return '<article><p><b>' + escapeHtml(label) + '</b>' + (item.capturedAt ? ' · Son başarılı okuma ' + escapeHtml(formatTimestamp(item.capturedAt)) : '') + '</p>' + values + scenarioCopy + (links ? '<p>' + links + '</p>' : '') + '</article>';
    }).join('') + '</div></details>';
  }

  function renderModelStatus(data, label) {
    const research = modelResearchStatus(data);
    const status = data && data.modelStatus || (research.status === 'unavailable' ? { status: 'unavailable', checkedAt: research.checkedAt } : null);
    const warning = data && data.modelWarning || (research.status === 'unavailable' ? 'Model kayıtlarına erişilemiyor.' : '');
    const unavailable = status && ['unavailable', 'store_unavailable'].includes(status.status);
    const warningHtml = unavailable || warning ? '<p class="macro-model-warning" role="status">' + escapeHtml(warning || 'Model kayıtlarına erişilemiyor.') + (status && status.checkedAt ? ' · Kontrol ' + escapeHtml(formatTimestamp(status.checkedAt)) : '') + (status && status.cachedAt ? ' · Son başarılı model okuması ' + escapeHtml(formatTimestamp(status.cachedAt)) : '') + ' <button type="button" class="macro-retry" data-macro-retry>Yeniden dene</button></p>' : '';
    return warningHtml + renderModelHistory(data);
  }

  function renderObservation(observation) {
    if (!observation) return '<div class="macro-data-point"><span>Önceki açıklanan değer</span><b>Doğrulanmış önceki değer yok</b></div>';
    return '<div class="macro-data-point"><span>Önceki ilk açıklama · ' + escapeHtml(periodLabel(observation.period)) + '</span>' +
      '<b>' + escapeHtml(formatNumber(observation.value)) + ' bin kişi</b></div>';
  }

  function renderEstimate(forecast) {
    const method = METHOD_NAMES[forecast.methodId] || forecast.methodId;
    const estimate = isFiniteValue(forecast.estimate)
      ? escapeHtml(formatNumber(forecast.estimate)) + ' bin kişi'
      : 'Tahmin üretilemedi; yeterli geçmiş yok';
    const detail = forecast.rationale ? '<p>' + escapeHtml(forecast.rationale) + '</p>' : '<p class="macro-muted">Bu yöntem kaydı için ek gerekçe yok.</p>';
    return '<article class="macro-method-row"><div><b>' + escapeHtml(method) + '</b><span>' + estimate + '</span></div>' + detail + '</article>';
  }

  function renderSourceAndTimeEvidence(data, event, forecasts, models, attempts = [], now = Date.now()) {
    const instant = now instanceof Date ? now.getTime() : Number(now);
    const source = data && (data.sourceStatus || data.sources) || {};
    const failures = (Array.isArray(source.failures) ? source.failures : Object.values(source).flatMap((item) => Array.isArray(item && item.failures) ? item.failures : []))
      .concat(Array.isArray(data && data.consensusStatus && data.consensusStatus.failures) ? data.consensusStatus.failures : []);
    const chronology = forecasts.concat(models);
    const unverified = chronology.filter((item) => item.chronologyStatus === 'unverified').length;
    const unattested = chronology.filter((item) => item.chronologyStatus === 'not_attested').length;
    const warnings = [];
    if (data && data.status === 'partial') warnings.push('Kısmi kaynak yanıtı');
    const consensusState = typeof (data && data.consensusStatus) === 'string' ? data.consensusStatus : data && data.consensusStatus && data.consensusStatus.status;
    if (['partial', 'unavailable'].includes(consensusState)) warnings.push('Konsensüs kanıtı ' + (consensusState === 'partial' ? 'kısmi' : 'erişilemiyor'));
    else if (consensusState === 'not_connected' || consensusState === 'unavailable') warnings.push('Bağımsız konsensüs yok');
    if (failures.length && failures.every((item) => (item.code || item.errorCode) === 'forecast_provenance_review_required')) warnings.push('Eski tahminlerin zaman kanıtı eksik');
    if (unverified) warnings.push(unverified + ' tahminin erişim zamanı doğrulanmıyor');
    if (unattested) warnings.push(unattested + ' tahminde girdi erişim izi yok');
    if (failures.length && !warnings.some((item) => item.startsWith('Kısmi'))) warnings.push('Kaynak kontrolünde eksik var');
    const summary = warnings.length ? warnings.join(' · ') : 'Güncellik ve kaynak ayrıntıları';
    const sourceHealth = renderSourceHealth(data);
    const updated = data && data.updatedAt ? '<p><b>Makro kaydı güncellendi:</b> ' + escapeHtml(formatTimestamp(data.updatedAt)) + '</p>' : '';
    const observation = observationFor(data, event);
    const observationEvidence = observation ? '<p><b>Önceki ilk açıklama:</b> ' + escapeHtml(formatTimestamp(observation.publishedAt)) + ' · ' + externalLink(observation.sourceUrl, 'BLS kaynağı', 'macro-source-link') + '</p>' : '';
    const consensus = sourcedConsensus(data, event, now);
    const consensusEvidence = consensus ? consensus.kind === 'independent'
      ? '<p><b>' + escapeHtml(consensus.source.title) + ':</b> Yayın ' + escapeHtml(formatTimestamp(consensus.source.publishedAt)) + ' · Sisteme alındı ' + escapeHtml(formatTimestamp(consensus.source.observedAt)) + ' · ' + externalLink(consensus.source.url, 'Kaynağı aç', 'macro-source-link') + '<br>Bu gözlem önceki model tahmininin bilgi kesitine eklenmez.</p>'
      : '<p><b>Model tahmini konsensüs kaynağı:</b> ' + escapeHtml(consensus.source.title || consensus.source.id || 'Kaynak') + ' · Yayın ' + escapeHtml(formatTimestamp(consensus.source.publishedAt)) + ' · ' + externalLink(consensus.source.url, 'Kaynağı aç', 'macro-source-link') + '</p>' : '';
    const consensusHistoryRows = (Array.isArray(data && data.consensusHistory) ? data.consensusHistory : []).filter((item) =>
      item && event && item.eventId === event.eventId && item.metric === event.metric && item.unit === event.unit && item.period === event.period &&
      safeUrl(item.sourceUrl) && Number.isFinite(Date.parse(item.publishedAt)) && Number.isFinite(Date.parse(item.observedAt)) && Date.parse(item.publishedAt) <= Date.parse(item.observedAt) && Date.parse(item.observedAt) <= instant);
    const consensusHistory = consensusHistoryRows.length ? '<div class="macro-consensus-history"><b>Konsensüs gözlem geçmişi</b>' + consensusHistoryRows.slice().sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 5).map((item) =>
      '<p>' + (isFiniteValue(item.value) ? escapeHtml(formatNumber(item.value)) + ' bin kişi · ' : '') + escapeHtml(item.sourceTitle || item.provider || 'Kaynak') + ' · Yayın ' + escapeHtml(formatTimestamp(item.publishedAt)) + ' · Sisteme alındı ' + escapeHtml(formatTimestamp(item.observedAt)) + ' · ' + externalLink(item.sourceUrl, 'Kaynağı aç', 'macro-source-link') + '</p>').join('') + '</div>' : '';
    const consensusStatus = data && data.consensusStatus ? '<p><b>Konsensüs durumu:</b> ' + escapeHtml(typeof data.consensusStatus === 'string' ? data.consensusStatus : [data.consensusStatus.status, data.consensusStatus.reason, data.consensusStatus.provider].filter(Boolean).join(' · ')) + '</p>' : '';
    const calendarEvidence = event ? '<p><b>Takvim:</b> ' + escapeHtml(event.scheduleVerification === 'model-cited-web-research' ? 'Model kaynak atfı; bağımsız erişim doğrulanmadı' : 'BLS takvim kaydı') + ' · ' + externalLink(event.sourceUrl, 'Takvim kaynağı', 'macro-source-link') + '</p>' : '';
    const forecastEvidence = forecasts.map((forecast) => {
      const title = METHOD_NAMES[forecast.methodId] || forecast.methodId || 'Yöntem';
      const status = forecast.chronologyStatus === 'unverified' ? '<p>Kaynak erişim zamanı doğrulanmadı; sayısal tahmin korunur, performans ve kalibrasyon örneklemine katılmaz.</p>' : forecast.chronologyStatus === 'not_attested' ? '<p>Girdi başına erişim doğrulama izi saklanmamış.</p>' : '';
      return '<div class="macro-evidence-entry"><b>' + escapeHtml(title) + '</b>' + status + '<dl class="macro-provenance"><div><dt>Oluşturulma</dt><dd>' + escapeHtml(formatTimestamp(forecast.createdAt)) + '</dd></div><div><dt>Bilgi kesiti</dt><dd>' + escapeHtml(formatTimestamp(forecast.knowledgeCutoff)) + '</dd></div><div><dt>Girdi gözlemleri</dt><dd>' + escapeHtml(Array.isArray(forecast.inputObservationIds) && forecast.inputObservationIds.length ? forecast.inputObservationIds.join(', ') : 'Yok') + '</dd></div></dl></div>';
    }).join('');
    const attemptEvidence = attempts.map((attempt) => '<p><b>' + escapeHtml(METHOD_NAMES[attempt.methodId] || attempt.methodId || 'Yöntem') + ' denemesi:</b> ' + escapeHtml(formatTimestamp(attempt.createdAt)) + ' · ' + escapeHtml(attempt.status === 'disputed_input' ? 'Girdi kaynağı çelişkili' : 'Eksik dönemler: ' + (attempt.missingPeriods || []).join(', ')) + '</p>').join('');
    const modelEvidence = models.flatMap((forecast) => {
      const cutoff = Date.parse(forecast.knowledgeCutoff || forecast.createdAt || forecast.recordedAt || '');
      const items = Array.isArray(forecast.sourceEvidence) ? forecast.sourceEvidence : [];
      const kind = forecast.reviewOnly ? 'Güncel model görüşü' : 'İlk model tahmini';
      const cutoffLabel = forecast.knowledgeCutoffBasis === 'research_generated_at' ? 'Model raporu üretim kesiti'
        : forecast.knowledgeCutoffBasis === 'publication_time_fallback' ? 'Kayıt zamanı yedeği'
          : forecast.knowledgeCutoffBasis === 'recorded_forecast' ? 'Tahmin bilgi kesiti'
            : forecast.knowledgeCutoffBasis === 'research_analysis_as_of' ? 'Araştırma analiz kesiti' : 'Bilgi kesiti';
      const cutoffEvidence = forecast.knowledgeCutoff ? ' · ' + cutoffLabel + ' ' + escapeHtml(formatTimestamp(forecast.knowledgeCutoff)) : '';
      const rationale = forecast.rationale || forecast.model || forecast.runId || isFiniteValue(forecast.pointEstimate) ? '<p><b>' + kind + ' ayrıntısı:</b> ' + (isFiniteValue(forecast.pointEstimate) ? escapeHtml(formatNumber(forecast.pointEstimate)) + ' bin kişi · ' : '') + escapeHtml(forecast.model || 'Model belirtilmedi') + (forecast.rationale ? ' · ' + escapeHtml(forecast.rationale) : '') + (forecast.runId ? ' · Çalışma ' + escapeHtml(forecast.runId) : '') + (forecast.originalPointEstimate != null ? ' · İlk tahmin ' + escapeHtml(formatNumber(forecast.originalPointEstimate)) + ' bin kişi' : '') + (forecast.recordedAt ? ' · Kayda alındı ' + escapeHtml(formatTimestamp(forecast.recordedAt)) : '') + cutoffEvidence + '</p>' : '';
      return [rationale].concat(items.filter((item) => item && safeUrl(item.url)).map((item) => '<p><b>' + escapeHtml(item.title || 'Model kaynağı') + ':</b> ' + escapeHtml(item.publishedAt ? formatTimestamp(item.publishedAt) : 'Yayıncı zamanı yok') + (Number.isFinite(cutoff) && item.publishedAt ? ' · ' + cutoffLabel + ' ' + escapeHtml(formatTimestamp(forecast.knowledgeCutoff || forecast.createdAt || forecast.recordedAt)) : '') + ' · ' + externalLink(item.url, 'Kaynağı aç', 'macro-source-link') + (item.evidence ? '<br>' + escapeHtml(item.evidence) : '') + '</p>'));
    }).join('');
    const revisions = data && data.revisions ? '<p>Revizyon metaverisi mevcut; ilk açıklama ve sonraki revizyonlar ayrı tutulur.</p>' : '';
    const failureDetails = failures.map((item) => '<p><b>' + escapeHtml(item.scope || item.provider || 'Kaynak') + ':</b> ' + escapeHtml([item.code || item.errorCode, item.reason, item.checkedAt && formatTimestamp(item.checkedAt)].filter(Boolean).join(' · ') || 'Kaynak kontrolü tamamlanamadı') + '</p>').join('');
    return '<details class="macro-evidence"><summary>Kaynak ve zaman kanıtı · ' + escapeHtml(summary) + '</summary><div>' + sourceHealth + updated + calendarEvidence + observationEvidence + consensusEvidence + consensusHistory + consensusStatus + forecastEvidence + attemptEvidence + modelEvidence + revisions + failureDetails + '</div></details>';
  }

  function renderScorecards(data) {
    const scorecards = Array.isArray(data && data.scorecards) ? data.scorecards : [];
    if (!scorecards.length) return '<p class="macro-muted">Tahmin performansı için sonuçlanan örnek henüz yok.</p>';
    return '<div class="macro-scorecards">' + scorecards.map((score) => {
      const method = METHOD_NAMES[score.methodId] || score.methodId || 'Yöntem';
      const excluded = isFiniteValue(score.excludedCount) && Number(score.excludedCount) > 0 ? ' · Zaman kanıtı eksik ' + score.excludedCount + ' kayıt hariç' : '';
      if (score.status !== 'scored' || !isFiniteValue(score.mae)) {
        const descriptive = isFiniteValue(score.mae) ? 'Betimsel MAE ' + formatNumber(score.mae) + (isFiniteValue(score.signedBias) ? ' · yanlılık ' + formatNumber(score.signedBias) : '') + ' · az örneklem, genellenemez · ' : 'Puanlama için yeterli sonuç yok · ';
        return '<div class="macro-score"><b>' + escapeHtml(method) + '</b><span>' + escapeHtml(descriptive) + 'n=' + escapeHtml(formatNumber(score.n, 0)) + escapeHtml(excluded) + '</span></div>';
      }
      return '<div class="macro-score"><b>' + escapeHtml(method) + '</b><span>MAE ' + escapeHtml(formatNumber(score.mae)) + ' · yanlılık ' + escapeHtml(formatNumber(score.signedBias)) + ' · n=' + escapeHtml(formatNumber(score.n, 0)) + escapeHtml(excluded) + '</span></div>';
    }).join('') + '</div>';
  }

  function renderCalibration(calibration) {
    const items = Array.isArray(calibration) ? calibration : calibration ? [calibration] : [];
    if (!items.length) return '';
    const proposals = items.filter((item) => item && item.status === 'proposal_only' && item.proposal);
    const statuses = {
      insufficient_sample: 'Yeterli sonuç henüz yok',
      insufficient_provenance: 'Geçerli zaman ve kaynak kanıtı yetersiz',
      insufficient_chronological_holdout: 'Eğitim sonucu sınama anında henüz bilinmiyordu',
      not_improved: 'Düzeltme sınama sonuçlarını iyileştirmedi; öneri üretilmedi',
      proposal_only: 'Elle inceleme önerisi',
    };
    return '<details class="macro-calibration"><summary>Öğrenme durumu · ' +
      (proposals.length ? proposals.length + ' inceleme önerisi' : 'kalibrasyon etkin değil') + '</summary>' + items.filter(Boolean).map((item) => {
      const label = METHOD_NAMES[item.methodId] || item.methodId || 'Yöntem';
      const n = item.eligibleN == null ? item.n : item.eligibleN;
      const excluded = item.excludedN == null ? item.excludedCount : item.excludedN;
      const sample = ' · geçerli sonuç ' + formatNumber(n || 0, 0) + '/' + formatNumber(item.requiredN || 15, 0) +
        (excluded > 0 ? ' · hariç ' + formatNumber(excluded, 0) : '');
      const proof = item.rawHoldout && item.correctedHoldout ? '<p>Sonraki ' + escapeHtml(formatNumber(item.holdout && item.holdout.n, 0)) +
        ' açıklamada MAE ' + escapeHtml(formatNumber(item.rawHoldout.mae)) + ' → ' + escapeHtml(formatNumber(item.correctedHoldout.mae)) +
        ' bin kişi. Eğitim yanlılığı: ' + escapeHtml(formatNumber(item.trainingBias)) + ' bin kişi; düzeltme ham tahminden çıkarılır.</p>' : '';
      const exclusions = Array.isArray(item.exclusions) && item.exclusions.length ? '<p>Dışlama gerekçeleri: ' +
        escapeHtml([...new Set(item.exclusions.map((entry) => ({ provenance_issue: 'kaynak zaman denetimi', provenance_unverified: 'girdi erişim izi eksik',
          outcome_not_matured: 'sonuç bekleniyor', conflicting_outcomes: 'çelişkili sonuç', information_leakage: 'açıklama sonrası bilgi',
          schedule_conflict: 'takvim çelişkisi', disputed_input: 'çelişkili girdi' })[entry.reason] || entry.reason))].join(', ')) + '</p>' : '';
      return '<div class="macro-method-detail"><b>' + escapeHtml(label) + '</b><p>' + escapeHtml((statuses[item.status] || 'Kanıt incelemesi gerekli') + sample) + '</p>' +
        proof + exclusions + '</div>';
    }).join('') + '<p>En az 12 önceki eğitim ve 3 sonraki sınama sonucu gerekir. Ham tahminler korunur; otomatik etkinleştirme yapılmaz.</p></details>';
  }

  function validModelReviewHistory(data, event, now = Date.now()) {
    if (!event || event.scheduleConflict) return [];
    const instant = now instanceof Date ? now.getTime() : Number(now);
    const release = Date.parse(event.scheduledAt);
    if (!Number.isFinite(instant) || !Number.isFinite(release)) return [];
    const latestByForecast = new Map();
    (Array.isArray(data && data.modelForecastReviews) ? data.modelForecastReviews : []).forEach((review) => {
      const recorded = Date.parse(review && (review.recordedAt || review.createdAt) || '');
      if (!review || review.reviewOnly !== true || !review.originalForecastId || review.eventId !== event.eventId ||
        review.metric !== event.metric || review.unit !== event.unit || review.period !== event.period || !isFiniteValue(review.pointEstimate) ||
        !Number.isFinite(recorded) || recorded > instant || recorded >= release) return;
      const current = latestByForecast.get(review.originalForecastId);
      if (!current || Date.parse(current.recordedAt || current.createdAt || '') < recorded) latestByForecast.set(review.originalForecastId, review);
    });
    return [...latestByForecast.values()].sort((a, b) => Date.parse(a.recordedAt || a.createdAt) - Date.parse(b.recordedAt || b.createdAt));
  }

  function renderModelForecasts(data, event, now = Date.now()) {
    if (!event) return '';
    const models = (Array.isArray(data && data.modelForecasts) ? data.modelForecasts : []).filter((forecast) =>
      forecast && forecast.metric === event.metric && forecast.unit === event.unit && forecast.period === event.period &&
      (forecast.eventId == null || forecast.eventId === event.eventId));
    const reviews = validModelReviewHistory(data, event, now);
    if (!models.length && !reviews.length) return '';
    return '<section class="macro-model-forecasts"><h3>Model tahmini</h3><div class="macro-model-summary-list">' + models.map((forecast) => {
      const estimate = isFiniteValue(forecast.pointEstimate) ? formatNumber(forecast.pointEstimate) + ' bin kişi' : 'Tahmin yok';
      return '<div class="macro-model-summary"><span>Ölçülecek ilk model tahmini</span><b>' + escapeHtml(estimate) + '</b></div>';
    }).join('') + reviews.map((review) => '<div class="macro-model-summary macro-model-review"><span>Güncel model görüşü · puanlamaya ayrı tahmin eklenmedi</span><b>' + escapeHtml(isFiniteValue(review.pointEstimate) ? formatNumber(review.pointEstimate) + ' bin kişi' : 'Sayısal görüş yok') + '</b>' + (review.recordedAt ? '<small>' + escapeHtml(formatTimestamp(review.recordedAt)) + '</small>' : '') + '</div>').join('') + '</div></section>';
  }

  function renderModelOutcomes(data, now = Date.now()) {
    const instant = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(instant)) return '';
    const forecasts = new Map((Array.isArray(data && data.modelForecasts) ? data.modelForecasts : [])
      .filter((forecast) => forecast && forecast.id && forecast.resolution?.provider === 'bls-first-release' &&
        forecast.metric === 'us_nonfarm_payroll_change' && forecast.unit === 'thousand_jobs' && isFiniteValue(forecast.pointEstimate) &&
        Number.isFinite(Date.parse(forecast.scheduledAt)) && Number.isFinite(Date.parse(forecast.recordedAt)) && Date.parse(forecast.recordedAt) < Date.parse(forecast.scheduledAt))
      .map((forecast) => [forecast.id, forecast]));
    const outcomes = (Array.isArray(data && data.modelOutcomes) ? data.modelOutcomes : []).flatMap((outcome) => {
      const forecast = outcome && forecasts.get(outcome.forecastId);
      const published = outcome && Date.parse(outcome.publishedAt);
      const observed = outcome && Date.parse(outcome.observedAt);
      const valid = forecast && outcome.metric === forecast.metric && outcome.unit === forecast.unit && outcome.period === forecast.period &&
        outcome.verification === 'bls-official-first-release' && outcome.vintage === 'first_release' &&
        isFiniteValue(outcome.value) && safeUrl(outcome.sourceUrl) && Number.isFinite(published) && Number.isFinite(observed) &&
        published >= Date.parse(forecast.scheduledAt) && observed >= published && observed <= instant;
      return valid ? [{ outcome, forecast, signedError: forecast.pointEstimate - outcome.value }] : [];
    }).sort((a, b) => Date.parse(b.outcome.observedAt) - Date.parse(a.outcome.observedAt));
    if (!outcomes.length) return '';
    return '<details class="macro-model-outcomes"><summary>Model tahmin sonuç geçmişi (' + outcomes.length + ')</summary>' + outcomes.map(({ outcome, forecast, signedError }) => {
      return '<article class="macro-model-outcome-entry"><b>' + escapeHtml(periodLabel(outcome.period)) + ' · İlk tahmin ' + escapeHtml(formatNumber(forecast.pointEstimate)) + ' bin kişi</b>' +
        '<p>İlk açıklama ' + escapeHtml(formatNumber(outcome.value)) + ' bin kişi · İmzalı hata (tahmin − sonuç) ' + escapeHtml(formatNumber(signedError)) + ' bin kişi · Mutlak hata ' + escapeHtml(formatNumber(Math.abs(signedError))) + ' bin kişi' + (outcome.stale ? ' · Önceki model kaydı; güncel puanlama bekletiliyor' : '') + (outcome.contested ? ' · Kanıt çelişkili; puanlama dışı' : '') + '</p>' +
        '<small>Yayın ' + escapeHtml(formatTimestamp(outcome.publishedAt)) + ' · Sisteme alındı ' + escapeHtml(formatTimestamp(outcome.observedAt)) +
        ' · ' + externalLink(outcome.sourceUrl, 'İlk açıklama kaynağı', 'macro-source-link') + '</small></article>';
    }).join('') + '</details>';
  }

  function renderScenarios(data, event) {
    if (!event) return '';
    const scenarios = (Array.isArray(data && data.modelScenarios) ? data.modelScenarios : []).filter((scenario) =>
      scenario && (scenario.eventId == null || scenario.eventId === event.eventId) &&
      (scenario.period == null || scenario.period === event.period) && scenario.condition && scenario.impact && scenario.invalidation);
    if (!scenarios.length) return '';
    const reference = scenarios.find((scenario) => isFiniteValue(scenario.referenceEstimate) && scenario.referenceKind);
    const firstEstimate = (Array.isArray(data.modelForecasts) ? data.modelForecasts : []).find((forecast) =>
      forecast && forecast.eventId === event.eventId && forecast.metric === event.metric && forecast.unit === event.unit && forecast.period === event.period && isFiniteValue(forecast.pointEstimate));
    const referenceCopy = reference ? '<p class="macro-scenario-reference">Bu senaryolar ' +
      (reference.referenceKind === 'current_model_opinion' ? 'güncel ' + escapeHtml(formatNumber(reference.referenceEstimate)) + ' bin kişilik model görüşünü referans alır.' : 'ölçülecek ilk ' + escapeHtml(formatNumber(reference.referenceEstimate)) + ' bin kişilik model tahminini referans alır.') +
      (reference.referenceKind === 'current_model_opinion' && firstEstimate ? ' Ölçülecek ilk tahmin ' + escapeHtml(formatNumber(firstEstimate.pointEstimate)) + ' bin kişi olarak korunur.' : '') + '</p>' : '';
    return '<details class="macro-scenarios"><summary>Koşullu piyasa senaryoları (' + scenarios.length + ')</summary><div>' + referenceCopy + scenarios.map((scenario) =>
      '<article class="macro-scenario"><h4>' + escapeHtml(scenario.condition) + '</h4><p>' + escapeHtml(scenario.impact) + '</p><dl><div><dt>Pazar / vade</dt><dd>' + escapeHtml(MARKET_NAMES[scenario.market] || scenario.market || 'Belirtilmedi') + ' · ' + escapeHtml(scenario.horizon || 'Vade belirtilmedi') + '</dd></div><div><dt>Geçersiz kılma koşulu</dt><dd>' + escapeHtml(scenario.invalidation) + '</dd></div></dl></article>'
    ).join('') + '</div></details>';
  }

  function sourcedConsensus(data, event, now = Date.now()) {
    if (!event) return null;
    const instant = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(instant)) return null;
    if (Object.prototype.hasOwnProperty.call(data || {}, 'consensus')) {
      const item = data.consensus;
      const published = item && Date.parse(item.publishedAt);
      const observed = item && Date.parse(item.observedAt);
      const scheduled = Date.parse(event.scheduledAt);
      const itemScheduled = item && Date.parse(item.scheduledAt);
      const exactMatch = item && item.eventId === event.eventId && item.metric === event.metric && item.unit === event.unit && item.period === event.period;
      if (!exactMatch || item.vintage !== 'pre_release_consensus' || item.scheduleConflict || event.scheduleConflict || !Number.isFinite(itemScheduled) || itemScheduled !== scheduled ||
        !isFiniteValue(item.value) || !safeUrl(item.sourceUrl) || !Number.isFinite(published) || !Number.isFinite(observed) ||
        published > observed || observed > instant || observed >= scheduled) return null;
      return { value: item.value, source: { id: item.provider || item.sourceTitle || 'Bağımsız konsensüs', title: item.sourceTitle || item.provider || 'Bağımsız konsensüs',
        url: item.sourceUrl, publishedAt: item.publishedAt, observedAt: item.observedAt }, kind: 'independent', record: item };
    }
    const candidates = (Array.isArray(data && data.modelForecasts) ? data.modelForecasts : []).filter((forecast) =>
      forecast && forecast.metric === event.metric && forecast.unit === event.unit && forecast.period === event.period &&
      (forecast.eventId == null || forecast.eventId === event.eventId) && isFiniteValue(forecast.consensus));
    candidates.sort((a, b) => String(b.createdAt || b.recordedAt || '').localeCompare(String(a.createdAt || a.recordedAt || '')));
    for (const forecast of candidates) {
      const cutoff = Date.parse(forecast.knowledgeCutoff || forecast.createdAt || forecast.recordedAt || '');
      const source = (Array.isArray(forecast.sourceEvidence) ? forecast.sourceEvidence : []).find((item) =>
        item && item.id === forecast.consensusSourceId && safeUrl(item.url) && Number.isFinite(Date.parse(item.publishedAt)) && Number.isFinite(cutoff) && Date.parse(item.publishedAt) <= cutoff);
      if (source) return { value: forecast.consensus, source };
    }
    return null;
  }

  function renderRecentOutcomes(data) {
    const outcomes = (Array.isArray(data && data.outcomes) ? data.outcomes : []).filter((item) =>
      item && item.eventId && (!item.vintage || item.vintage === 'first_release') && isFiniteValue(item.actual) && safeUrl(item.sourceUrl));
    if (!outcomes.length) return '';
    return '<details class="macro-recent-outcomes"><summary>Son açıklanan sonuçlar (' + outcomes.length + ')</summary>' + outcomes
      .slice().sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))).slice(0, 4).map((outcome) => {
        const matched = (Array.isArray(data.forecasts) ? data.forecasts : []).filter((forecast) => forecast && forecast.eventId === outcome.eventId && forecast.metric === 'us_nonfarm_payroll_change' && forecast.unit === 'thousand_jobs' && isFiniteValue(forecast.estimate));
        const comparisons = matched.map((forecast) => {
          const error = Number(forecast.estimate) - Number(outcome.actual);
          const label = METHOD_NAMES[forecast.methodId] || forecast.methodId || 'Yöntem';
          return '<span>' + escapeHtml(label) + ': tahmin ' + escapeHtml(formatNumber(forecast.estimate)) + ' · hata (tahmin − sonuç) ' + escapeHtml(formatNumber(error)) + ' bin kişi' + (forecast.chronologyStatus === 'unverified' ? ' · zaman kanıtı eksik; puanlanmaz' : '') + '</span>';
        }).join('');
        return '<article class="macro-recent-outcome"><b>' + escapeHtml(periodLabel(outcome.period || String(outcome.eventId).split(':').pop())) + ' · ' + escapeHtml(formatNumber(outcome.actual)) + ' bin kişi</b><small>İlk açıklama ' + escapeHtml(formatTimestamp(outcome.publishedAt)) + ' · ' + externalLink(outcome.sourceUrl, 'BLS kaynak belgesi', 'macro-source-link') + '</small>' + (comparisons || '<span>İlk açıklama doğrulandı; yöntem tahmin karşılaştırması mevcut değil.</span>') + '</article>';
      }).join('') + '</details>';
  }

  function cpiMetricValue(record, fields = ['value', 'estimate', 'pointEstimate']) {
    if (!record || typeof record !== 'object') return null;
    const key = fields.find((field) => isFiniteValue(record[field]));
    return key ? Number(record[key]) : null;
  }

  function cpiValue(record) {
    const value = cpiMetricValue(record);
    if (value == null) return 'Kayıt yok';
    const formatted = formatNumber(value, 2).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');
    return escapeHtml(formatted) + '%';
  }

  function cpiCellValue(record, emptyLabel) {
    return record && cpiMetricValue(record) != null ? cpiValue(record) : emptyLabel;
  }

  function cpiVerificationLabel(value) {
    return value === 'model-cited-web-research' ? 'Model kaynak atfı; bağımsız erişim doğrulanmadı' : value === 'bls-official-first-release' ? 'BLS ilk açıklama kaydı' : value || '';
  }

  function validCpiForecast(forecast, event, metricId) {
    return !!(forecast && event && forecast.metric === metricId && forecast.unit === 'percent' && forecast.period === event.period && forecast.eventId === event.eventId && forecast.status === 'frozen' && cpiMetricValue(forecast) != null);
  }

  function validCpiModel(model, event, metricId) {
    return !!(model && event && model.eventId === event.eventId && model.metric === metricId && model.unit === 'percent' && model.period === event.period && cpiMetricValue(model) != null);
  }

  function validCpiConsensus(consensus, event, metricId) {
    return !!(consensus && event && consensus.eventId === event.eventId && consensus.metric === metricId && consensus.unit === 'percent' && consensus.period === event.period && cpiMetricValue(consensus) != null);
  }

  function cpiEvidence(metric) {
    const entries = [];
    const previous = metric && metric.previousFirstRelease;
    if (previous && (!metric.eventPeriod || String(previous.period || '') < String(metric.eventPeriod))) entries.push('<p><b>Önceki ilk açıklama:</b> ' + escapeHtml(previous.period || 'Dönem doğrulanamadı') + ' · Yayın ' + escapeHtml(formatTimestamp(previous.publishedAt)) + (previous.observedAt ? ' · Sisteme alındı ' + escapeHtml(formatTimestamp(previous.observedAt)) : '') + (previous.sourceUrl ? ' · ' + externalLink(previous.sourceUrl, 'Kaynağı aç', 'macro-source-link') : '') + (previous.contentHash ? ' · İçerik özeti kayıtlı' : '') + '</p>');
    if (metric && metric.consensus && validCpiConsensus(metric.consensus, { eventId: metric.eventId, period: metric.eventPeriod }, metric.metric)) entries.push('<p><b>Konsensüs kaynağı:</b> ' + (metric.consensus.sourceUrl ? externalLink(metric.consensus.sourceUrl, 'Kaynağı aç', 'macro-source-link') : 'Kaynak bağlantısı yok') + (metric.consensus.publishedAt ? ' · Yayın ' + escapeHtml(formatTimestamp(metric.consensus.publishedAt)) : '') + '</p>');
    const forecasts = (Array.isArray(metric && metric.forecasts) ? metric.forecasts : metric && metric.forecasts ? [metric.forecasts] : []).filter((forecast) => !metric.eventId || (forecast && forecast.eventId === metric.eventId && forecast.metric === metric.metric && forecast.unit === 'percent' && forecast.period === metric.eventPeriod && forecast.status === 'frozen' && cpiMetricValue(forecast) != null));
    forecasts.forEach((forecast) => {
      const ids = forecast.inputIds || forecast.inputObservationIds || [];
      entries.push('<p><b>' + escapeHtml(CPI_METHOD_NAMES[forecast.methodId] || METHOD_NAMES[forecast.methodId] || forecast.methodId || 'Yöntem tahmini') + ':</b> ' + cpiValue(forecast) + (forecast.createdAt ? ' · Üretim ' + escapeHtml(formatTimestamp(forecast.createdAt)) : '') + (forecast.knowledgeCutoff ? ' · Bilgi kesiti ' + escapeHtml(formatTimestamp(forecast.knowledgeCutoff)) : '') + (ids.length ? ' · Girdi kanıtı ' + escapeHtml(ids.join(', ')) : '') + '</p>');
      (forecast.inputProof || []).forEach((input) => entries.push('<p>' + escapeHtml(periodLabel(input.period)) + ' · ' + cpiValue(input) + ' · Yayın ' + escapeHtml(formatTimestamp(input.publishedAt)) + ' · Sisteme alındı ' + escapeHtml(formatTimestamp(input.observedAt)) + ' · ' + externalLink(input.sourceUrl, 'Girdi kaynağı', 'macro-source-link') + '</p>'));
    });
    const models = (Array.isArray(metric && metric.modelForecasts) ? metric.modelForecasts : metric && metric.modelForecasts ? [metric.modelForecasts] : []).filter((model) => !metric.eventId || validCpiModel(model, { eventId: metric.eventId, period: metric.eventPeriod }, metric.metric));
    models.forEach((model) => {
      const modelKind = model.reviewOnly ? 'Güncel model görüşü' : 'İlk model tahmini';
      const evidence = (Array.isArray(model.sourceEvidence) ? model.sourceEvidence : []).filter((source) => source && safeUrl(source.url));
      entries.push('<p><b>' + modelKind + ' kanıtı:</b> ' + cpiValue(model) + (model.createdAt || model.recordedAt ? ' · Üretim ' + escapeHtml(formatTimestamp(model.createdAt || model.recordedAt)) : '') + (model.knowledgeCutoff ? ' · Bilgi kesiti ' + escapeHtml(formatTimestamp(model.knowledgeCutoff)) : '') + (model.runId ? ' · Çalışma ' + escapeHtml(model.runId) : '') + (model.sourceUrl ? ' · ' + externalLink(model.sourceUrl, 'İlk açıklama sonuç sayfası', 'macro-source-link') : '') + (model.rationale ? ' · ' + escapeHtml(model.rationale) : '') + '</p>' + evidence.map((source) => '<p>' + escapeHtml(source.title || source.id || 'Model kaynağı') + ' · ' + externalLink(source.url, 'Kaynağı aç', 'macro-source-link') + (source.publishedAt ? ' · Yayın ' + escapeHtml(formatTimestamp(source.publishedAt)) : '') + '</p>').join(''));
    });
    const identity = '<p><b>Teknik metric:</b> ' + escapeHtml(metric && metric.metric || 'Metrik doğrulanamadı') + '</p>';
    return '<section class="macro-cpi-proof-entry"><h4>' + escapeHtml(CPI_LABELS[metric && metric.metric] || 'Metrik') + '</h4>' + identity + (entries.length ? entries.join('') : '<p>Kaynak kanıtı bulunmuyor.</p>') + '</section>';
  }

  function renderCpiMethods(metrics, event, family) {
    const rows = [];
    metrics.forEach((metric) => {
      const forecasts = (Array.isArray(metric.forecasts) ? metric.forecasts : metric.forecasts ? [metric.forecasts] : []).filter((item) => validCpiForecast(item, event, metric.metric));
      const scorecards = Array.isArray(metric.scorecards) ? metric.scorecards : metric.scorecards ? [metric.scorecards] : [];
      const scoreByMethod = new Map(scorecards.map((score) => [score.methodId, score]));
      forecasts.forEach((forecast) => {
        const score = scoreByMethod.get(forecast.methodId) || {};
        const sampleSize = isFiniteValue(score.sampleSize) ? score.sampleSize : score.n;
        rows.push('<p><b>' + escapeHtml(CPI_LABELS[metric.metric] || metric.metric) + ' · ' + escapeHtml(CPI_METHOD_NAMES[forecast.methodId] || forecast.methodId || 'Yöntem') + ':</b> ' + cpiValue(forecast) + ' · ' + (isFiniteValue(sampleSize) ? 'n=' + escapeHtml(String(sampleSize)) : 'örneklem yok') + (isFiniteValue(score.mae) ? ' · hata ' + escapeHtml(formatNumber(score.mae, 2)) + ' yüzde puan' : '') + '</p>');
      });
      const completed = (metric.outcomes || []).filter((outcome) => outcome.metric === metric.metric && outcome.unit === 'percent' && isFiniteValue(outcome.actual) && isFiniteValue(outcome.error))
        .slice().sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt)).slice(0, 6);
      completed.forEach((outcome) => {
        const actual = (family.observations || []).find((item) => item.id === outcome.actualId);
        const forecast = (metric.forecasts || []).find((item) => item.id === outcome.forecastId);
        rows.push('<p><b>İlk sonuç · ' + escapeHtml(CPI_SHORT_LABELS[metric.metric]) + ' · ' + escapeHtml(periodLabel(actual && actual.period || forecast && forecast.period)) + ':</b> ' + cpiValue({ value: outcome.actual }) +
          ' · Tahmin ' + cpiValue(forecast) + ' · Hata (sonuç − tahmin) ' + escapeHtml(formatNumber(outcome.error, 2)) + ' yüzde puan' +
          (outcome.contested ? ' · Kanıt çelişkili; puanlama dışı' : '') +
          (actual ? ' · Yayın ' + escapeHtml(formatTimestamp(actual.publishedAt)) + ' · ' + externalLink(actual.sourceUrl, 'İlk açıklama kaynağı', 'macro-source-link') : '') + '</p>');
      });
    });
    const corrections = (Array.isArray(family && family.correctionReviews) ? family.correctionReviews : []).concat(metrics.flatMap((metric) => Array.isArray(metric.correctionReviews) ? metric.correctionReviews : [])).filter(Boolean);
    const abstentions = (Array.isArray(family && family.methodAbstentions) ? family.methodAbstentions : []).concat(metrics.flatMap((metric) => Array.isArray(metric.methodAbstentions) ? metric.methodAbstentions : [])).filter(Boolean);
    if (corrections.length) rows.push('<p><b>Kaynak çelişkisi incelemesi:</b> ' + escapeHtml(corrections.map((item) => item.reason || item.status || 'İnceleme gerekli').join(' · ')) + '</p>');
    if (abstentions.length) rows.push('<p><b>Tahmin üretilemedi:</b> ' + escapeHtml(abstentions.map((item) => item.reason || item.status || 'Gerekçe kaydı yok').join(' · ')) + '</p>');
    const hasOutcomes = metrics.some((metric) => (metric.outcomes || []).some((item) => !item.contested));
    return '<details class="macro-cpi-methods"><summary>Yöntem kıyası</summary><p>Bağımsız kıyas yöntemleridir; model görüşü veya piyasa konsensüsü değildir.</p>' + (rows.length ? rows.join('') : '<p>Tahmin yöntemi kaydı yok.</p>') +
      (hasOutcomes ? '' : '<p>Henüz ölçülmüş sonuç yok; hata ortalaması ve başarı oranı üretilmedi.</p>') + '</details>';
  }

  function renderCpiModelDetails(metrics, event) {
    if (!event) return '';
    const entries = [];
    metrics.forEach((metric) => {
      const first = (Array.isArray(metric.modelForecasts) ? metric.modelForecasts : []).filter((item) => validCpiModel(item, event, metric.metric));
      const reviews = (Array.isArray(metric.modelForecastReviews) ? metric.modelForecastReviews : []).filter((item) => validCpiModel(item, event, metric.metric) && item.reviewOnly === true);
      const outcomes = Array.isArray(metric.modelOutcomes) ? metric.modelOutcomes : [];
      const score = metric.modelScorecard || {};
      if (!first.length && !reviews.length && !score.n && !score.stale && !outcomes.length) return;
      first.forEach((model) => entries.push('<article class="macro-cpi-model-entry"><h4>' + escapeHtml(CPI_SHORT_LABELS[metric.metric] || metric.metric) + ' · İlk model tahmini</h4><p class="macro-cpi-model-value">' + cpiValue(model) + '</p><p>Üretim ' + escapeHtml(formatTimestamp(model.createdAt || model.recordedAt)) + ' · Bilgi kesiti ' + escapeHtml(formatTimestamp(model.knowledgeCutoff)) + (model.runId ? ' · Çalışma ' + escapeHtml(model.runId) : '') + '</p>' + (model.rationale ? '<p>Gerekçe: ' + escapeHtml(model.rationale) + '</p>' : '') + (model.sourceVerification ? '<p>Kaynak doğrulaması: ' + escapeHtml(cpiVerificationLabel(model.sourceVerification)) + '</p>' : '') + (Array.isArray(model.sourceEvidence) && model.sourceEvidence.length ? '<p>' + model.sourceEvidence.filter((source) => source && safeUrl(source.url)).map((source) => externalLink(source.url, source.title || 'Model kaynağı', 'macro-source-link')).join(' · ') + '</p>' : '') + '</article>'));
      if (reviews.length) {
        const review = reviews.slice().sort((a, b) => Date.parse(b.recordedAt || b.createdAt || '') - Date.parse(a.recordedAt || a.createdAt || ''))[0];
        entries.push('<article class="macro-cpi-model-entry macro-cpi-model-review"><h4>' + escapeHtml(CPI_SHORT_LABELS[metric.metric] || metric.metric) + ' · Güncel model görüşü</h4><p class="macro-cpi-model-value">' + cpiValue(review) + '</p><p>Bu görüş ilk tahminin yerine geçmez ve puanlamaya eklenmez. Kayıt ' + escapeHtml(formatTimestamp(review.recordedAt || review.createdAt)) + ' · Bilgi kesiti ' + escapeHtml(formatTimestamp(review.knowledgeCutoff)) + (review.originalForecastId ? ' · İlk tahmin ' + escapeHtml(review.originalForecastId) : '') + '</p>' + (review.rationale ? '<p>Gerekçe: ' + escapeHtml(review.rationale) + '</p>' : '') + (review.sourceVerification ? '<p>Kaynak doğrulaması: ' + escapeHtml(cpiVerificationLabel(review.sourceVerification)) + '</p>' : '') + (Array.isArray(review.sourceEvidence) && review.sourceEvidence.length ? '<p>' + review.sourceEvidence.filter((source) => source && safeUrl(source.url)).map((source) => externalLink(source.url, source.title || 'Review kaynağı', 'macro-source-link')).join(' · ') + '</p>' : '') + '</article>');
      }
      const scoreText = score.stale ? 'Önceki model kaydı geçici olarak eski; düzeltme veya takvim incelemesi tamamlanana kadar puanlama bekletiliyor' : Number.isFinite(score.n) ? 'n=' + escapeHtml(String(score.n)) + (Number.isFinite(score.mae) ? ' · MAE ' + escapeHtml(formatNumber(score.mae, 2)) + ' yüzde puan' : '') + (Number.isFinite(score.bias) ? ' · yanlılık ' + escapeHtml(formatNumber(score.bias, 2)) + ' yüzde puan' : '') : 'Henüz ölçülmüş model sonucu yok';
      const outcomeStatus = outcomes.some((outcome) => outcome && outcome.contested) ? '<p class="macro-cpi-model-score">Sonuç kanıtı çelişkili; puanlama dışı.</p>' : outcomes.some((outcome) => outcome && outcome.stale) ? '<p class="macro-cpi-model-score">Sonuç eski model kaydından geliyor; güncel doğrulama bekleniyor.</p>' : '';
      entries.push('<p class="macro-cpi-model-score"><b>Model puan kartı:</b> ' + scoreText + '</p>' + outcomeStatus);
    });
    return entries.length ? '<details class="macro-cpi-model-details"><summary>Model kanıtı ve sonraki görüşler</summary><div>' + entries.join('') + '</div></details>' : '';
  }

  function renderCpiScenarios(family, event) {
    if (!event) return '';
    const scenarios = (Array.isArray(family && family.modelScenarios) ? family.modelScenarios : []).filter((scenario) => scenario && scenario.eventId === event.eventId && scenario.period === event.period && scenario.condition && scenario.impact && scenario.invalidation);
    if (!scenarios.length) return '';
    return '<details class="macro-cpi-scenarios"><summary>Koşullu senaryolar (' + scenarios.length + ')</summary><div>' + scenarios.map((scenario) => {
      const references = Array.isArray(scenario.references) ? scenario.references : [];
      const referenceText = references.length ? '<p class="macro-scenario-reference"><b>Model görüşü referansı:</b> ' + references.map((reference) => escapeHtml(CPI_SHORT_LABELS[reference.metric] || reference.metric) + ' ' + escapeHtml(formatNumber(reference.referenceEstimate, 2)) + '% · ' + escapeHtml(reference.referenceKind === 'current_model_opinion' ? 'güncel görüş' : 'ilk tahmin')).join(' · ') + '</p>' : '';
      const sources = (Array.isArray(scenario.sourceEvidence) ? scenario.sourceEvidence : []).filter((source) => source && safeUrl(source.url));
      return '<article class="macro-scenario"><h4>' + escapeHtml(scenario.condition) + '</h4><p>' + escapeHtml(scenario.impact) + '</p>' + referenceText + '<dl><div><dt>Pazar / vade</dt><dd>' + escapeHtml(MARKET_NAMES[scenario.market] || scenario.market || 'Belirtilmedi') + ' · ' + escapeHtml(scenario.horizon || 'Vade belirtilmedi') + '</dd></div><div><dt>Geçersiz kılma koşulu</dt><dd>' + escapeHtml(scenario.invalidation) + '</dd></div><div><dt>Bağlı metrikler</dt><dd>' + escapeHtml((scenario.metricIds || []).map((id) => CPI_SHORT_LABELS[id] || id).join(' · ') || 'Metrik belirtilmedi') + '</dd></div></dl>' + (sources.length ? '<p>' + sources.map((source) => externalLink(source.url, source.title || 'Senaryo kaynağı', 'macro-source-link')).join(' · ') + '</p>' : '') + '</article>';
    }).join('') + '</div></details>';
  }

  function renderCpiSourceHealth(family) {
    const source = family && family.sourceStatus;
    if (!source || typeof source !== 'object') return '';
    const label = source.status === 'available' ? 'Erişilebilir' : source.status === 'partial' ? 'Kısmi erişim' : source.status === 'unavailable' ? 'Kullanılamıyor' : source.status === 'not_initialized' ? 'Henüz alınmadı' : 'Durum doğrulanmadı';
    const failures = Array.isArray(source.failures) ? source.failures : [];
    const raw = [source.errorCode, source.reason].filter(Boolean).concat(failures.map((item) => [item.code || item.errorCode, item.reason, item.checkedAt && formatTimestamp(item.checkedAt)].filter(Boolean).join(' · '))).filter(Boolean).join('; ');
    const cached = source.cached && source.originalSourceUpdatedAt ? ' · Son başarılı bağımsız kayıt ' + formatTimestamp(source.originalSourceUpdatedAt) + ' (cache)' : '';
    return '<p class="macro-cpi-source-status"><b>Kaynak durumu:</b> ' + escapeHtml(label) + (source.lastSuccessfulAt ? ' · Son başarılı ' + escapeHtml(formatTimestamp(source.lastSuccessfulAt)) : '') + cached + '</p>' + (raw ? '<details class="macro-cpi-evidence macro-cpi-source-evidence"><summary>Kaynak teknik ayrıntısı</summary><p>' + escapeHtml(raw) + '</p></details>' : '');
  }

  function renderCpi(family, selectedMetric = '') {
    const metrics = Array.isArray(family && family.metrics) ? family.metrics : [];
    const byId = new Map(metrics.map((metric) => [metric && metric.metric, metric]));
    const nextEvent = family && family.nextEvent;
    const event = nextEvent && nextEvent.eventId && nextEvent.period ? nextEvent : null;
    const eventLabel = nextEvent && nextEvent.period ? periodLabel(nextEvent.period) : 'Dönem doğrulanamadı';
    const eventTime = nextEvent && nextEvent.scheduledAt ? '<time datetime="' + escapeHtml(nextEvent.scheduledAt) + '">' + escapeHtml(formatTimestamp(nextEvent.scheduledAt)) + ' (İstanbul)</time>' : 'Açıklama zamanı doğrulanmadı';
    const rows = CPI_METRICS.map((id) => {
      const metric = Object.assign({ metric: id, eventId: event && event.eventId, eventPeriod: event && event.period }, byId.get(id) || {});
      const forecasts = (Array.isArray(metric.forecasts) ? metric.forecasts : metric.forecasts ? [metric.forecasts] : []).filter((item) => validCpiForecast(item, event, id));
      const models = (Array.isArray(metric.modelForecasts) ? metric.modelForecasts : metric.modelForecasts ? [metric.modelForecasts] : []).filter((item) => validCpiModel(item, event, id));
      const scorecards = Array.isArray(metric.scorecards) ? metric.scorecards : metric.scorecards ? [metric.scorecards] : [];
      const forecast = forecasts.find((item) => cpiMetricValue(item) != null) || forecasts[0];
       const model = models.find((item) => cpiMetricValue(item) != null) || models[0];
      const method = forecast ? ({ last_first_release_v1: 'Son ilk değer', consecutive_three_first_releases_v1: 'Üç ay ortalaması' }[forecast.methodId] || 'Yöntem tahmini') : 'Tahmin yok';
      const score = scorecards.find((item) => forecast && item.methodId === forecast.methodId) || scorecards[0];
      const sampleSize = score && (isFiniteValue(score.sampleSize) ? score.sampleSize : score.n);
      const scoreCopy = isFiniteValue(sampleSize) ? 'n=' + escapeHtml(String(sampleSize)) + (isFiniteValue(score.mae) ? ' · hata ' + escapeHtml(formatNumber(score.mae, 2)) + ' yüzde puan' : '') : 'Örneklem yok';
      const previous = metric.previousFirstRelease && event && String(metric.previousFirstRelease.period || '') < String(event.period) ? metric.previousFirstRelease : null;
      const consensus = validCpiConsensus(metric.consensus, event, id) ? metric.consensus : null;
      const adjustment = id.endsWith('_nsa') ? 'Mevsim etkisinden arındırılmamış' : 'Mevsim etkisinden arındırılmış';
       const modelUnavailable = family && family.modelStatus && ['unavailable', 'store_unavailable'].includes(family.modelStatus.status);
       const modelCell = model ? '<b>' + cpiValue(model) + '</b>' : modelUnavailable ? 'Erişilemiyor' : 'Kayıt yok';
       return '<tr' + (selectedMetric === id ? ' class="is-selected"' : '') + '><th scope="row"><span>' + escapeHtml(CPI_SHORT_LABELS[id] || 'CPI metriği') + '</span><small>' + adjustment + '</small></th><td>' + cpiCellValue(previous, 'Kayıt yok') + '</td><td>' + cpiCellValue(consensus, 'Bağlı değil') + '</td><td>' + modelCell + '</td><td><span>' + escapeHtml(method) + (forecast ? ' · ' + cpiValue(forecast) : '') + '</span><small>' + escapeHtml(forecast && forecast.contested ? 'Kanıt çelişkili · puanlama dışı' : scoreCopy) + '</small></td></tr>';
    }).join('');
    const hasData = metrics.some((metric) => metric && (metric.previousFirstRelease || metric.consensus || (Array.isArray(metric.forecasts) && metric.forecasts.length) || (Array.isArray(metric.modelForecasts) && metric.modelForecasts.length)));
    const notInitialized = family && family.sourceStatus && family.sourceStatus.status === 'not_initialized';
    const missing = !family ? '<p class="macro-empty">Enflasyon kaynak ailesi mevcut değil; doğrulanmış veri akışı bekleniyor.</p>' : notInitialized || !hasData ? '<p class="macro-empty">Enflasyon kaynakları henüz alınmadı; doğrulanmış veri akışı bekleniyor.</p>' : !metrics.length ? '<p class="macro-empty">Enflasyon metrikleri henüz doğrulanmadı; kaynak yanıtı bekleniyor.</p>' : '';
    const source = renderCpiSourceHealth(family) + renderStoreStatus(family, 'Enflasyon') + renderModelStatus(family, 'Enflasyon') + (nextEvent && nextEvent.scheduleConflict ? '<p class="macro-refresh-warning" role="status">Açıklama takvimi çelişkili; yeni tahmin ve puanlama bekletiliyor.</p>' : family && family.sourceStatus && family.sourceStatus.auditRequired ? '<p class="macro-refresh-warning" role="status">İlk açıklama kaynağında çelişki var; ilgili kayıtlar puanlamadan ayrıldı.</p>' : '');
    const showData = metrics.length && hasData && !notInitialized;
    return '<section id="macro-panel-us-cpi" class="macro-cpi" role="tabpanel" aria-labelledby="macro-tab-us-cpi" aria-label="ABD enflasyon görünümü"><header class="macro-cpi-head"><div><b>ABD enflasyon</b><span>' + escapeHtml(eventLabel) + ' · Açıklama: ' + eventTime + '</span></div></header>' + source + missing + (showData ? '<div class="macro-cpi-table-wrap" tabindex="0" role="region" aria-label="Enflasyon karşılaştırma tablosu"><table class="macro-cpi-table"><caption class="sr-only">Tüketici fiyat endeksi metrikleri. Model sütunu ilk model tahminini gösterir; sonraki model görüşleri ayrıntıda yer alır.</caption><thead><tr><th scope="col">Metrik</th><th scope="col">Önceki ilk açıklama</th><th scope="col">Konsensüs</th><th scope="col" aria-label="İlk model tahmini">İlk model tahmini</th><th scope="col">Yöntem kıyası</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="macro-cpi-evidence-list">' + renderCpiModelDetails(CPI_METRICS.map((id) => Object.assign({ metric: id }, byId.get(id) || {})), event) + renderCpiScenarios(family, event) + renderCpiMethods(CPI_METRICS.map((id) => Object.assign({ metric: id }, byId.get(id) || {})), event, family) + '<details class="macro-cpi-evidence"><summary>Kaynak ve kanıt · dört metrik</summary>' + CPI_METRICS.map((id) => cpiEvidence(Object.assign({ metric: id, eventId: event && event.eventId, eventPeriod: event && event.period }, byId.get(id) || {}))).join('') + '</details></div>' : '') + '</section>';
  }

  function renderMacroFamilyTabs(data, selectedFamily) {
    const hasCpi = !!(data && data.families && data.families.us_cpi);
    return '<div class="macro-family-tabs" role="tablist" aria-label="Makro veri ailesi"><button id="macro-tab-us-nfp" type="button" role="tab" aria-selected="' + String(selectedFamily === 'us_nfp') + '" aria-controls="macro-panel-us-nfp" tabindex="' + (selectedFamily === 'us_nfp' ? '0' : '-1') + '" data-macro-family="us_nfp">İstihdam</button><button id="macro-tab-us-cpi" type="button" role="tab" aria-selected="' + String(selectedFamily === 'us_cpi') + '" aria-controls="macro-panel-us-cpi" tabindex="' + (selectedFamily === 'us_cpi' ? '0' : '-1') + '" data-macro-family="us_cpi">Enflasyon' + (hasCpi ? '' : ' · kaynak bekleniyor') + '</button></div>';
  }

  function renderMacro(data, error, now = Date.now(), hasCachedSuccess = !!data, view = {}) {
    if (!data) return '<div class="macro-panel"><p class="macro-status">' + escapeHtml(error || 'Makro verisi yükleniyor.') + '</p>' + (error ? '<button type="button" class="macro-retry" data-macro-retry>Yeniden dene</button>' : '') + '</div>';
    const selectedFamily = view.family === 'us_cpi' ? 'us_cpi' : 'us_nfp';
    const tabs = data.families ? renderMacroFamilyTabs(data, selectedFamily) : '';
    if (selectedFamily === 'us_cpi') {
      const cpiFamily = data.families && data.families.us_cpi;
      const cpiUnavailable = !cpiFamily || ['unavailable', 'partial'].includes(cpiFamily.sourceStatus?.status) || cpiFamily.storeStatus?.status === 'unavailable';
      const refreshWarning = error && cpiUnavailable ? '<p class="macro-refresh-warning" role="status">Güncel enflasyon akışı alınamadı; mevcut kayıt korunuyor. ' + escapeHtml(error) + '</p><button type="button" class="macro-retry" data-macro-retry>Yeniden dene</button>' : '';
      return '<section class="macro-panel" aria-label="Makro görünümü">' + tabs + refreshWarning + renderCpi(cpiFamily, view.metric) + '</section>';
    }
    const event = matchPayrollEvent(data, now);
    const scheduleLabel = event && event.scheduleVerification === 'model-cited-web-research' ? ' · Takvim: modelin resmî kaynak atfı; bağımsız erişim doğrulanamadı' : '';
    const eventSchedule = event ? '<time datetime="' + escapeHtml(event.scheduledAt) + '">' + escapeHtml(formatTimestamp(event.scheduledAt)) + ' (İstanbul)</time>' + escapeHtml(scheduleLabel) : 'Yaklaşan doğrulanmış BLS takvim olayı yok.';
    const obs = observationFor(data, event);
    const forecasts = eventForecasts(data, event);
    const outcome = exactOutcome(data, event);
    const status = data.status === 'not_initialized' && data.storeStatus?.status !== 'unavailable' ? '<p class="macro-status">' + escapeHtml(statusCopy(data.status)) + '</p>' : '';
    const result = outcome ? '<div class="macro-outcome"><span>İlk açıklanan sonuç · ' + escapeHtml(periodLabel(event.period)) + '</span><b>' + escapeHtml(formatNumber(outcome.actual)) + ' bin kişi</b></div>' : '';
    const attempts = (Array.isArray(data.methodAbstentions) ? data.methodAbstentions : []).filter((item) => event && item.eventId === event.eventId && item.metric === event.metric && item.unit === event.unit);
    const attemptHistory = attempts.length ? '<div class="macro-method-attempts"><h4>Tahmin üretmeyen denemeler (' + attempts.length + ')</h4>' + attempts.slice(-6).map((attempt) =>
      '<p><b>' + escapeHtml(METHOD_NAMES[attempt.methodId] || attempt.methodId) + '</b> · ' +
      escapeHtml(attempt.status === 'disputed_input' ? 'Girdi kaynağı çelişkili; inceleme gerekiyor.' : 'Eksik dönemler: ' + (attempt.missingPeriods || []).join(', ')) +
      '</p>').join('') + '<p class="macro-muted">Bu kayıtlar sayısal tahmin değildir; veri tamamlanırsa yeni tahmin üretilebilir.</p></div>' : '';
    const recordsCount = forecasts.length + attempts.length;
    const methodsPreview = forecasts.slice(0, 2).map((forecast) => (METHOD_NAMES[forecast.methodId] || forecast.methodId) + ' ' + (isFiniteValue(forecast.estimate) ? formatNumber(forecast.estimate) + ' bin' : 'tahmin yok')).join(' · ');
    const forecastsHtml = (forecasts.length ? forecasts.map(renderEstimate).join('') : '<p class="macro-muted">Bu olay için dondurulmuş yöntem tahmini yok.</p>') + attemptHistory;
    const methods = '<details class="macro-method-comparison"><summary><span>Yöntem kıyası (' + recordsCount + ' kayıt)</span><small>' + escapeHtml(methodsPreview || (attempts.length ? 'Tahmin üretmeyen yöntem kayıtları' : 'Yöntem tahmini yok')) + '</small></summary><div class="macro-method-comparison-body">' + forecastsHtml + '</div></details>';
    const consensusRecord = sourcedConsensus(data, event, now);
    const content = event ? '<div class="macro-event-head"><div><b>ABD tarım dışı istihdam</b><span>' + escapeHtml(periodLabel(event.period)) + ' · ' + eventSchedule + '</span></div></div>' +
      '<div class="macro-data-grid">' + renderObservation(obs) +
      '<div class="macro-data-point"><span>Doğrulanmış konsensüs</span><b>' + (consensusRecord ? escapeHtml(formatNumber(consensusRecord.value)) + ' bin kişi' : 'Doğrulanmış konsensüs yok') + '</b>' + (consensusRecord && consensusRecord.kind === 'independent' ? '<small>' + escapeHtml(consensusRecord.source.title) + ' · bağımsız gözlem</small>' : '') + '</div></div>' + result +
      renderModelForecasts(data, event, now) + methods + renderScenarios(data, event) : '<p class="macro-empty">Yaklaşan doğrulanmış BLS takvim olayı yok.</p>';
    const warningCopy = error !== 'Yenileme başarısız.' && data.status === 'partial' && (obs || hasCachedSuccess) ? 'Kaynak kontrolünde eksik var; doğrulanmış kayıtlar gösteriliyor. ' : hasCachedSuccess ? 'Yenileme başarısız; son başarılı kayıt korunuyor. ' : 'Makro kaynağı erişilemiyor; doğrulanmış önceki kayıt yok. ';
    const sourceFailures = Array.isArray(data.sourceStatus?.failures) ? data.sourceStatus.failures : [];
    const consensusFailures = Array.isArray(data.consensusStatus?.failures) ? data.consensusStatus.failures : [];
    const allFailures = sourceFailures.concat(consensusFailures);
    const reviewOnly = allFailures.length > 0 && allFailures.every((item) => (item.code || item.errorCode) === 'forecast_provenance_review_required');
    const warning = error && !reviewOnly ? '<p class="macro-refresh-warning" role="status">' + escapeHtml(warningCopy) + escapeHtml(error) + '</p><button type="button" class="macro-retry" data-macro-retry>Yeniden dene</button>' : '';
    const performance = '<details class="macro-scorecard"><summary>Tahmin performansı ve kalibrasyon</summary>' + renderScorecards(data) + renderCalibration(data.calibration) + '</details>';
    const eventModelForecasts = (Array.isArray(data.modelForecasts) ? data.modelForecasts : []).filter((forecast) => event && forecast && forecast.metric === event.metric && forecast.unit === event.unit && forecast.period === event.period && (forecast.eventId == null || forecast.eventId === event.eventId));
    const eventModelReviews = (Array.isArray(data.modelForecastReviews) ? data.modelForecastReviews : []).filter((review) => event && review && review.eventId === event.eventId && review.metric === event.metric && review.unit === event.unit && review.period === event.period && review.reviewOnly === true);
    const evidence = renderSourceAndTimeEvidence(data, event, forecasts, eventModelForecasts.concat(eventModelReviews), attempts, now);
    return '<section id="macro-panel-us-nfp" class="macro-panel" role="tabpanel" aria-labelledby="macro-tab-us-nfp" aria-label="ABD tarım dışı istihdam görünümü">' + tabs + status + renderStoreStatus(data, 'İstihdam') + renderModelStatus(data, 'İstihdam') + warning + content + performance + renderRecentOutcomes(data) + renderModelOutcomes(data, now) + evidence + '</section>';
  }

  function marketTypeLabel(type) {
    return ({ regulatory_bulletin: 'Resmî belge', regulatory_announcement: 'Resmî duyuru', research_event: 'Araştırma olayı', company_news: 'Şirket haberi', company_disclosure: 'Şirket açıklaması' })[type] || 'Kaynak kaydı';
  }

  function itemDate(item) {
    if (['regulatory_announcement', 'company_disclosure'].includes(item.type)) return item.publishedDate ? 'Yayıncı tarihi ' + formatDay(item.publishedDate) : 'Yayıncı tarihi doğrulanamadı';
    const label = item.evidenceStatus === 'official_feed' ? 'Yayıncı tarihi ' : 'Yayımlandı ';
    if (item.publishedAt) return label + formatTimestamp(item.publishedAt);
    if (item.publishedDate) return label + formatDay(item.publishedDate);
    return 'Yayın tarihi doğrulanamadı';
  }

  function boundedText(value, limit = 480) {
    const text = String(value == null ? '' : value).trim();
    return text.length > limit ? text.slice(0, limit).trimEnd() + '…' : text;
  }

  function announcementStatementLabel(value) {
    return ({ regulatory_measure_announcement: 'Düzenleyici tedbir duyurusu', draft_process_clarification: 'Taslak süreç açıklaması', investor_notice: 'Yatırımcı bildirimi', general_press_announcement: 'Genel basın duyurusu' })[value] || '';
  }

  function renderNewsItem(item, news) {
    const regulatory = item.type === 'regulatory_bulletin';
    const company = item.type === 'company_disclosure';
    const announcement = item.type === 'regulatory_announcement' && item.evidenceStatus === 'official_announcement_text';
    const title = externalLink(item.url, item.title || 'Kaynak başlığı yok', 'market-news-title');
    const document = item.document && typeof item.document === 'object' ? item.document : null;
    let details = '';
    if (company) {
      const conflict = item.evidenceStatus === 'company_listing_link_conflict' || item.manualReviewRequired;
      details = '<details class="market-news-evidence-detail"><summary>' + (conflict ? 'Bağlantı eşleşmesi inceleme gerektiriyor' : 'Şirket listesi ve doğrulama kapsamı') + '</summary><div>' +
        '<p>' + escapeHtml(boundedText(item.evidence || 'Resmî şirket listesindeki açıklama bağlantısı.')) + '</p>' +
        (safeUrl(item.sourceUrl) ? '<p>' + externalLink(item.sourceUrl, 'Şirketin resmî açıklama listesi', 'macro-source-link') + '</p>' : '') +
        '<p>PDF veya KAP belgesi içeriği okunmadı; başlıktan finansal etki çıkarılmadı. Yayıncı yalnız tarih verdiği için açıklama saati gösterilmiyor.</p>' +
        (item.supersedes ? '<p>Liste kaydı değişti; önceki gözlem kayıt defterinde korunuyor.</p>' : '') + '</div></details>';
    } else if (announcement) {
      const statement = announcementStatementLabel(item.statementType);
      const impact = item.impactScope === 'announcement_evidence_only'
        ? '<p>Bu kayıt yalnızca duyuru kanıtıdır; kapsam veya hukuki etki değerlendirmesi yapılmamıştır.</p>'
        : item.impactScope ? '<p><b>Belirtilen kapsam:</b> ' + escapeHtml(boundedText(item.impactScope, 320)) + '</p>' : '';
      const evidence = item.evidence ? '<p>' + escapeHtml(boundedText(item.evidence)) + '</p>' : '<p>Duyuru metni özeti bulunmuyor.</p>';
      const observed = item.observedAt ? '<p>Kaynak kontrolünde alındı: ' + escapeHtml(formatTimestamp(item.observedAt)) + '</p>' : '<p>Kaynak kontrol zamanı doğrulanamadı.</p>';
      details = '<details class="market-news-evidence-detail"><summary>Duyuru kaynağı ve kapsamı</summary><div>' +
        (statement ? '<p><b>Duyuru türü:</b> ' + escapeHtml(statement) + '</p>' : '') + impact + evidence + observed +
        (item.manualReviewRequired ? '<p>Duyurunun kapsamı ve olası yürürlük tarihi resmî belge incelemesi gerektirir; burada hukuki veya fiyat etkisi çıkarımı yapılmaz.</p>' : '') +
        (safeUrl(item.sourceUrl || item.url) ? '<p>' + externalLink(item.sourceUrl || item.url, 'SPK duyuru kaynağı', 'macro-source-link') +
          (safeUrl(item.listSourceUrl) ? ' · ' + externalLink(item.listSourceUrl, 'SPK duyuru listesi', 'macro-source-link') : '') + '</p>' : '') +
        '<p>Bu kayıt resmî duyuru metnidir; tek başına hukuki veya piyasa etkisi doğrulaması değildir.</p></div></details>';
    } else if (regulatory && document && document.available === true && document.contentStatus === 'text_extracted') {
      const sections = Array.isArray(document.sections) ? document.sections : [];
      const sectionHtml = sections.map((section) => {
        if (!section || typeof section !== 'object') return '';
        const symbols = Array.isArray(section.symbols) ? section.symbols.filter((symbol) => symbol != null && String(symbol).trim()).map(escapeHtml).join(', ') : '';
        const metadata = [section.category ? 'Kategori: ' + escapeHtml(section.category) : '', section.page != null ? 'Sayfa: ' + escapeHtml(section.page) : '', symbols ? 'Semboller: ' + symbols : ''].filter(Boolean).join(' · ');
        return '<li><b>' + escapeHtml(section.title || 'Başlıksız bölüm') + '</b>' + (metadata ? '<small>' + metadata + '</small>' : '') + (section.summary ? '<p>' + escapeHtml(section.summary) + '</p>' : '') + '</li>';
      }).filter(Boolean).join('');
      const summary = document.summary ? '<p>' + escapeHtml(document.summary) + '</p>' : '';
      const extractedAt = document.extractedAt ? '<p>Metin çıkarımı: ' + escapeHtml(formatTimestamp(document.extractedAt)) + '</p>' : '';
      details = '<details class="market-news-evidence-detail"><summary>Resmî belge metni · ' + sections.length + ' bölüm</summary><div>' + summary + extractedAt +
        (sectionHtml ? '<ul>' + sectionHtml + '</ul>' : '<p>Çıkarılmış bölüm metni mevcut değil.</p>') +
        '<p>Metin çıkarımı hukuki veya işlemsel yorum değildir. Resmî PDF bağlantısı başlıkta yer alır.</p></div></details>';
    } else if (regulatory && document) {
      const verification = document.verification ? '<p>Bağlantı doğrulama durumu: ' + escapeHtml(document.verification) + '</p>' : '';
      const reason = document.reason ? '<p>Metin okunamadı: ' + escapeHtml(document.reason) + '</p>' : '<p>Belge metni okunamadı.</p>';
      details = '<details class="market-news-evidence-detail"><summary>Belge metni okunamadı</summary>' + verification + reason +
        '<p>Resmî PDF bağlantısı başlıkta yer alır. Metin çıkarımı hukuki veya işlemsel yorum değildir.</p></details>';
    } else if (regulatory) {
      details = '<details class="market-news-evidence-detail"><summary>Belge bağlantısı · içerik çözümlemesi bekliyor</summary></details>';
    } else if (item.evidenceStatus === 'official_feed' && item.evidence) {
      details = '<details class="market-news-evidence-detail"><summary>Yayıncı açıklaması</summary><p>' + escapeHtml(item.evidence) + '</p><p>Kaynağın açıklama metnidir; model yorumu veya doğrulanmış piyasa etkisi değildir.</p></details>';
    } else if (item.whatChanged || item.evidence || item.counterEvidence) {
      details = '<details class="market-news-evidence-detail"><summary>Değişim ve kanıt ayrıntıları</summary>' +
        (item.whatChanged ? '<p>' + escapeHtml(item.whatChanged) + '</p>' : '') + (item.evidence ? '<p><b>Kanıt:</b> ' + escapeHtml(item.evidence) + '</p>' : '') +
        (item.counterEvidence ? '<p><b>Karşı kanıt:</b> ' + escapeHtml(item.counterEvidence) + '</p>' : '') + '</details>';
    }
    const observation = item.observedAt ? '<span>Gözlem ' + escapeHtml(formatTimestamp(item.observedAt)) + '</span>' : '';
    const status = (!regulatory || announcement) && item.evidenceStatus ? '<span>' + escapeHtml(company ? (item.evidenceStatus === 'company_listing_link_conflict' ? 'Bağlantı çelişkisi · inceleme gerekli' : 'Resmî listede bağlantı doğrulandı') : announcement ? 'Resmî metin' : item.evidenceStatus === 'model_cited' ? 'Model kaynaklı' : item.evidenceStatus === 'provider_link' ? 'Sağlayıcı bağlantısı' : item.evidenceStatus === 'official_feed' ? 'Resmî yayıncı duyurusu' : item.evidenceStatus) + '</span>' : '';
    const companySource = company ? news?.sources?.[item.sourceId] || {} : {};
    const staleCompany = company && !['available', 'partial'].includes(companySource.status)
      ? '<span>Önceki liste gözlemi; güncel kaynak erişimi doğrulanamadı</span>' : '';
    const announcementSource = announcement ? (news && news.sources && news.sources.spk_announcements) || {} : {};
    const staleAnnouncement = announcement && announcementSource.status !== 'available'
      ? '<span>' + (announcementSource.status === 'unavailable' ? 'Son başarılı kayıttan; güncel kaynak kontrolü başarısız' : 'Kısmi kaynak yanıtı; kayıt yayın ve gözlem zamanlarıyla gösteriliyor') +
        (announcementSource.lastSuccessfulAt ? ' · Son başarılı ' + escapeHtml(formatTimestamp(announcementSource.lastSuccessfulAt)) : '') + '</span>' : '';
    return '<article class="market-news-item"><div class="market-news-item-heading"><span class="market-news-type">' + escapeHtml((company && item.symbol ? item.symbol + ' · ' : '') + (announcement ? 'Resmî duyuru' : item.evidenceStatus === 'official_feed' ? 'Ağ / proje duyurusu' : marketTypeLabel(item.type))) + '</span><time>' + escapeHtml(itemDate(item)) + '</time></div><h3>' + title + '</h3>' +
      details + '<div class="market-news-meta">' + (item.source ? '<span>' + escapeHtml(item.source) + '</span>' : announcement ? '<span>SPK</span>' : '') + status + observation + staleAnnouncement + staleCompany + '</div></article>';
  }

  function sourceStatusText(news, market) {
    const sources = news && news.sources || {};
    const names = { spk: 'SPK PDF belgeleri', spk_announcements: 'SPK duyuruları', kap: 'KAP', company_ir_ford_otosan: 'FROTO · Ford Otosan', company_ir_tupras: 'TUPRS · Tüpraş', ethereum: 'Ethereum Foundation', bitcoin_core: 'Bitcoin Core', solana: 'Solana' };
    const keys = market === 'bist' ? ['spk', 'spk_announcements', 'company_ir_ford_otosan', 'company_ir_tupras', 'kap'] : market === 'crypto' ? ['ethereum', 'bitcoin_core', 'solana'] : [];
    const selected = keys.filter((key) => sources[key]);
    if (!selected.length) return '';
    const available = selected.filter((key) => sources[key].status === 'available').length;
    const sourceFailureLabel = (code) => ({
      public_feed_not_verified: 'Resmî akış doğrulanamadı.',
      unsupported_public_listing: 'Şirket bildirimleri için doğrulanmış veri akışı yok.',
      company_link_conflict: 'Şirket listesinde aynı bağlantı farklı başlık veya tarihle kullanılıyor; inceleme gerekli.',
      unsupported_company_listing: 'Şirket açıklama listesinin biçimi doğrulanamadı; boş haber akışı sayılmadı.',
      company_records_filtered: 'Bazı liste kayıtlarının tarihi veya bağlantısı doğrulanamadı.',
      company_listing_truncated: 'Liste boyut sınırına ulaştı; kapsam kısmi.',
      redirect_rejected: 'Kaynak adresi yönlendirme döndürdü; yeni adres ayrıca doğrulanmalı.',
      source_too_large: 'Kaynak yanıtı boyut sınırını aştı.',
      timeout: 'Kaynak yanıtı zaman aşımına uğradı.',
      http_403: 'Kaynak erişimi reddedildi.',
      http_404: 'Kaynak adresi bulunamadı.',
      http_429: 'Kaynak isteği hız sınırına takıldı.',
      http_500: 'Kaynak sunucusu hata döndürdü.',
      http_502: 'Kaynak geçici ağ hatası döndürdü.',
      http_503: 'Kaynak geçici olarak kullanılamıyor.',
    })[code] || 'Kaynak kontrolü tamamlanamadı.';
    const rows = selected.map((key) => {
      const source = sources[key];
      const company = key.startsWith('company_ir_');
      const status = source.status === 'available' ? (company ? 'Son kontrolde erişilebilir' : 'Erişilebilir') : source.status === 'partial' ? 'Kısmi erişim' : source.status === 'unavailable' ? 'Kullanılamıyor' : 'Durum doğrulanmadı';
      const checked = source.checkedAt ? ' · Son kontrol ' + formatTimestamp(source.checkedAt) : '';
      const last = source.lastSuccessfulAt ? ' · Son başarılı ' + formatTimestamp(source.lastSuccessfulAt) : '';
      const count = ['available', 'partial'].includes(source.status) && isFiniteValue(source.count)
        ? ' · ' + source.count + (key === 'spk_announcements' ? ' arşiv duyuru kaydı (bugünün haber sayısı değildir)' : ' kaynak kaydı (günlük haber sayısı değildir)') : '';
      const daily = source.status === 'available' && isFiniteValue(source.last24HoursCount) ? ' · Son 24 saatte ' + source.last24HoursCount + ' tarihli duyuru' : '';
      const latest = source.latestPublishedAt ? ' · Son yayın ' + formatTimestamp(source.latestPublishedAt) : source.latestPublishedDate ? ' · Son liste tarihi ' + formatDay(source.latestPublishedDate) : '';
      const today = company && isFiniteValue(source.todayDateOnlyCount) && source.todayDateOnlyAt
        ? ' · Kontrol gününe ait ' + source.todayDateOnlyCount + ' kayıt (' + (source.todayDateOnlyDate ? formatDay(source.todayDateOnlyDate) : formatTimestamp(source.todayDateOnlyAt)) + (['available', 'partial'].includes(source.status) ? ')' : '; önceki kontrol)') : '';
      const failures = Array.isArray(source.failures) ? source.failures : [];
      const technicalEntries = [];
      if (source.errorCode || source.reason) technicalEntries.push([source.errorCode, source.reason, source.checkedAt && formatTimestamp(source.checkedAt)].filter(Boolean).join(' · '));
      failures.forEach((failure) => technicalEntries.push([failure.code || failure.errorCode, failure.reason, failure.checkedAt && formatTimestamp(failure.checkedAt)].filter(Boolean).join(' · ')));
      const technicalFailures = [...new Set(technicalEntries.filter(Boolean))].join('; ');
      const failureCodes = [...new Set(failures.map((failure) => failure.code || failure.errorCode).filter((code) => code && code !== source.errorCode))];
      const failureCopy = failureCodes.map((code) => sourceFailureLabel(code)).join(' ');
      const technical = technicalFailures ? '<details class="market-news-technical-detail"><summary>Teknik ayrıntı</summary><p>' + escapeHtml(technicalFailures) + '</p></details>' : '';
      return '<p><b>' + escapeHtml(names[key] || key) + ':</b> ' + escapeHtml(status + count + daily + today + latest + checked + last) +
        (source.errorCode ? '<br><span>' + escapeHtml(sourceFailureLabel(source.errorCode)) + '</span>' : '') +
        (failureCopy ? '<br><span>' + escapeHtml(failureCopy) + '</span>' : '') +
        (source.reason ? '<br><span>' + escapeHtml(source.reason) + '</span>' : '') + '</p>' + technical;
    }).join('');
    return '<details class="market-news-source-status"><summary>Kaynak durumu · ' + available + '/' + selected.length + ' erişilebilir</summary>' + rows + '</details>';
  }

  function renderMarketNews(news, id, state = {}, error = '') {
    const limit = MARKET_NEWS_LIMIT[id] || 8;
    if (!news) return '<div class="market-news-panel"><p class="market-news-status">' + escapeHtml(error || 'Kaynaklı haber akışı yükleniyor.') + '</p>' + (error ? '<button type="button" data-macro-retry>Yeniden dene</button>' : '') + '</div>';
    const groups = news.groups || {};
    const validGroups = Object.fromEntries(MARKETS.map((market) => [market, Array.isArray(groups[market]) ? groups[market] : []]));
    const selected = MARKETS.includes(state.market) ? state.market : (validGroups.us.length ? 'us' : validGroups.bist.length ? 'bist' : 'crypto');
    const kind = ['regulatory', 'company'].includes(state.kind) ? state.kind : 'all';
    const acceptsKind = (item, filter) => filter === 'all' || (filter === 'regulatory' ? ['regulatory_bulletin', 'regulatory_announcement'].includes(item.type) : ['company_disclosure', 'company_news'].includes(item.type));
    const items = selected === 'bist' ? validGroups[selected].filter(item => acceptsKind(item, kind)) : validGroups[selected];
    const showAll = !!state.showAll;
    const visible = showAll ? items : items.slice(0, limit);
    const marketButtons = MARKETS.map((market) => '<button type="button" class="market-news-market" data-news-market="' + market + '" aria-pressed="' + String(selected === market) + '">' +
      escapeHtml(MARKET_NAMES[market]) + '<span>' + escapeHtml(String(validGroups[market].length)) + '</span></button>').join('');
    const kindButtons = selected === 'bist' ? '<div class="market-news-tabs" role="group" aria-label="BIST kaynak türü">' + [['all', 'Tümü'], ['regulatory', 'Düzenleyici'], ['company', 'Şirketler']].map(([value, label]) =>
      '<button type="button" class="market-news-market" data-news-kind="' + value + '" aria-pressed="' + String(kind === value) + '">' + label + '<span>' + validGroups.bist.filter(item => acceptsKind(item, value)).length + '</span></button>').join('') + '</div>' : '';
    const coverage = (Array.isArray(news.coverage) ? news.coverage : []).filter((row) => row && row.market === selected)[0];
    const coverageCopy = coverage ? '<p class="market-news-coverage">' + escapeHtml(coverage.reason || (coverage.status === 'available' ? 'Kaynak kapsamı erişilebilir.' : 'Bu pazar için haber kapsamı sınırlı.')) + '</p>' : '';
    const filteredEmpty = selected === 'bist' && kind !== 'all';
    const list = visible.length ? '<div class="market-news-list">' + visible.map((item) => renderNewsItem(item, news)).join('') + '</div>' : '<p class="market-news-empty">' + escapeHtml(filteredEmpty ? 'Seçili kaynak türünde doğrulanmış kayıt yok. Kaynak durumunu kontrol edin veya filtreyi temizleyin.' : coverage && coverage.reason || 'Bu pazarda kaynaklı haber kaydı yok.') + '</p>' + (filteredEmpty ? '<button type="button" class="market-news-more" data-news-kind="all">Filtreyi temizle</button>' : '');
    const more = items.length > limit ? '<button type="button" class="market-news-more" data-news-more aria-expanded="' + String(showAll) + '">' + (showAll ? 'Daha az göster' : 'Tümünü göster (' + items.length + ')') + '</button>' : '';
    return '<section class="market-news-panel" aria-label="Piyasa haberleri"><div class="market-news-tabs" role="group" aria-label="Piyasa seçimi">' + marketButtons + '</div>' +
      (error ? '<p class="market-news-refresh-warning" role="status">Güncel akış alınamadı; son başarılı içerik gösteriliyor. ' + escapeHtml(error) + ' <button type="button" data-macro-retry>Yeniden dene</button></p>' : '') +
      kindButtons + sourceStatusText(news, selected) + coverageCopy + list + more + '</section>';
  }

  function createClient(clientRoot) {
    const state = {
      macro: null, macroHasSuccess: false, news: null, macroError: '', newsError: '', requestVersion: 0, inFlight: null,
      sourceCache: { us_nfp: null, us_cpi: null },
      modelCache: { us_nfp: null, us_cpi: null },
      views: { marketNewsOverview: { market: 'us', showAll: false }, marketNewsWorkspace: { market: 'us', showAll: false } },
      macroView: { family: 'us_nfp', metric: '' },
    };

    function mounts() {
      const doc = clientRoot && clientRoot.document;
      if (!doc || typeof doc.getElementById !== 'function') return [];
      return ['macroWorkspace', 'marketNewsOverview', 'marketNewsWorkspace'].map((id) => ({ id, element: doc.getElementById(id) })).filter((x) => x.element);
    }

    function render(onlyId) {
      mounts().filter(({ id }) => !onlyId || id === onlyId).forEach(({ id, element }) => {
        const active = clientRoot.document && clientRoot.document.activeElement;
        const focused = active && typeof element.contains === 'function' && element.contains(active) ? active : null;
        const focusKey = focused ? {
          tag: focused.tagName, text: focused.textContent,
          market: focused.getAttribute('data-news-market'), kind: focused.getAttribute('data-news-kind'), more: focused.hasAttribute('data-news-more'),
          retry: focused.hasAttribute('data-macro-retry'), family: focused.getAttribute('data-macro-family'), href: focused.getAttribute('href'),
        } : null;
        const expanded = Array.from(element.querySelectorAll('details[open]')).map((node) => node.querySelector('summary')?.textContent);
        if (id === 'macroWorkspace') element.innerHTML = renderMacro(state.macro, state.macroError, Date.now(), state.macroHasSuccess, state.macroView);
        else element.innerHTML = renderMarketNews(state.news, id, state.views[id], state.newsError);
        element.querySelectorAll('details').forEach((node) => { if (expanded.includes(node.querySelector('summary')?.textContent)) node.open = true; });
        if (focusKey) {
          const target = Array.from(element.querySelectorAll('button,a,summary')).find((node) => node.tagName === focusKey.tag && (
            focusKey.market !== null ? node.getAttribute('data-news-market') === focusKey.market :
            focusKey.kind !== null ? node.getAttribute('data-news-kind') === focusKey.kind :
            focusKey.family !== null ? node.getAttribute('data-macro-family') === focusKey.family :
            focusKey.more ? node.hasAttribute('data-news-more') : focusKey.retry ? node.hasAttribute('data-macro-retry') :
            focusKey.href !== null ? node.getAttribute('href') === focusKey.href : node.textContent === focusKey.text
          ));
          if (target) target.focus({ preventScroll: true });
        }
        element.querySelectorAll('[data-macro-retry]').forEach((button) => button.addEventListener('click', () => refresh({ force: true })));
        element.querySelectorAll('[data-macro-family]').forEach((button) => {
          button.addEventListener('click', () => { if (button.disabled) return; state.macroView.family = button.dataset.macroFamily; render('macroWorkspace'); });
          button.addEventListener('keydown', (event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const tabs = Array.from(element.querySelectorAll('[data-macro-family]:not([disabled])'));
            const index = tabs.indexOf(button);
            if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
            if (target) { target.focus(); target.click(); }
          });
        });
        element.querySelectorAll('[data-news-market]').forEach((button) => button.addEventListener('click', () => {
          const view = state.views[id]; view.market = button.dataset.newsMarket; view.showAll = false; render(id);
        }));
        element.querySelectorAll('[data-news-more]').forEach((button) => button.addEventListener('click', () => {
          state.views[id].showAll = !state.views[id].showAll; render(id);
        }));
        element.querySelectorAll('[data-news-kind]').forEach((button) => button.addEventListener('click', () => {
          const kind = button.dataset.newsKind;
          if (!['all', 'regulatory', 'company'].includes(kind)) return;
          state.views[id].kind = kind; state.views[id].showAll = false; render(id);
          element.querySelector('[data-news-kind="' + kind + '"]')?.focus({ preventScroll: true });
        }));
      });
    }

    async function fetchJson(pathname) {
      if (!clientRoot || typeof clientRoot.fetch !== 'function') throw new Error('Ağ isteği kullanılamıyor.');
      const response = await clientRoot.fetch(pathname, { cache: 'no-store' });
      if (!response || !response.ok) throw new Error('HTTP ' + (response && response.status || 'hatası'));
      return response.json();
    }

    function acceptMacro(data) {
      if (!data || typeof data !== 'object') throw new Error('Makro yanıtı okunamadı.');
      const source = data.sourceStatus || {};
      const failures = (Array.isArray(source.failures) ? source.failures : []).concat(Array.isArray(data.consensusStatus?.failures) ? data.consensusStatus.failures : []);
      const sourceUnavailable = source.status === 'unavailable' || data.consensusStatus?.status === 'unavailable' || failures.length > 0;
      const research = modelResearchStatus(data);
      const storeUnavailable = data.storeStatus?.status === 'unavailable' || data.families?.us_cpi?.storeStatus?.status === 'unavailable';
      const healthy = ['available', 'partial'].includes(data.status) && !sourceUnavailable;
      // A 200 partial payload can contain newly verified observations. The server
      // retains earlier records; rejecting the payload would hide valid new evidence.
      const sourced = mergeSourceCache(data, state.sourceCache, Date.now());
      const projected = mergeModelCache(sourced, state.modelCache, Date.now());
      state.macro = projected;
      if (observationFor(projected, matchPayrollEvent(projected, Date.now()))) state.macroHasSuccess = true;
      if (healthy || (research.status === 'unavailable' && !sourceUnavailable) || (storeUnavailable && !sourceUnavailable)) {
        state.macroHasSuccess = true;
        state.macroError = '';
        return;
      }
      if (failures.length && failures.every((item) => (item.code || item.errorCode) === 'forecast_provenance_review_required')) {
        state.macroHasSuccess = state.macroHasSuccess || !!observationFor(projected, matchPayrollEvent(projected, Date.now()));
        state.macroError = '';
        return;
      }
      const code = failures[0] && (failures[0].code || failures[0].errorCode);
      const http = code && String(code).match(/http[_ -]?(\d{3})/i);
      const explanations = {
        unsupported_first_release_format: 'BLS açıklamasının metin biçimi okunamadı.',
        first_release_changed: 'İlk açıklama değerinde kaynak çelişkisi var; inceleme gerekiyor.',
        first_release_conflict_unresolved: 'İlk açıklama değerindeki kaynak çelişkisi çözülmedi; inceleme gerekiyor.',
        forecast_provenance_review_required: 'Yeni kaynak doğrulamaları geçmiş tahminin erişim zamanını geriye dönük kanıtlamaz.',
        revision_value_changed: 'Revizyon değerinde kaynak çelişkisi var; inceleme gerekiyor.',
        disputed_input: 'Tahmin girdisinde kaynak çelişkisi var; inceleme gerekiyor.',
        schedule_changed_after_forecast: 'Takvim saati kayıtlı tahminle çelişiyor; otomatik ölçüm durduruldu.',
      };
      state.macroError = http ? 'Makro kaynak isteği HTTP ' + http[1] + '. Yeniden deneyin.' : explanations[code] || (sourceUnavailable ? 'Makro kaynak kontrolü tamamlanamadı. Yeniden deneyin.' : statusCopy(data.status));
    }

    function acceptNews(data) {
      if (!data || typeof data !== 'object' || !data.groups) throw new Error('Haber yanıtı okunamadı.');
      state.newsError = '';
      state.news = data;
    }

    function refresh(options = {}) {
      if (state.inFlight && !options.force) return state.inFlight;
      const version = ++state.requestVersion;
      const task = Promise.allSettled([fetchJson('/api/macro'), fetchJson('/api/market-news')]).then((results) => {
        if (version !== state.requestVersion) return { stale: true };
        const [macro, news] = results;
        if (macro.status === 'fulfilled') {
          try { acceptMacro(macro.value); } catch (error) { state.macroError = error.message; }
        } else state.macroError = state.macro ? 'Yenileme başarısız.' : 'Makro verisi alınamadı.';
        if (news.status === 'fulfilled') {
          try { acceptNews(news.value); } catch (error) { state.newsError = error.message; }
        } else state.newsError = state.news ? 'Yenileme başarısız.' : 'Haber akışı alınamadı.';
        render();
        return { stale: false, macro: macro.status === 'fulfilled', news: news.status === 'fulfilled' };
      }).finally(() => { if (version === state.requestVersion) state.inFlight = null; });
      state.inFlight = task;
      return task;
    }

    return { refresh, render, getState: () => ({ macro: state.macro, news: state.news, macroError: state.macroError, newsError: state.newsError, sourceCache: state.sourceCache, modelCache: state.modelCache }) };
  }

  const client = createClient(root);
  if (root && root.document && typeof root.document.getElementById === 'function') {
    const initialize = () => { if (root.document.getElementById('macroWorkspace') || root.document.getElementById('marketNewsOverview') || root.document.getElementById('marketNewsWorkspace')) client.refresh(); };
    if (root.document.readyState === 'loading' && root.document.addEventListener) root.document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else Promise.resolve().then(initialize);
  }
  return {
    escapeHtml, safeUrl, matchPayrollEvent, eventForecasts, observationFor, exactOutcome,
    renderMacro, renderCpi, renderMarketNews, renderModelOutcomes, createClient,
    refresh: (options) => client.refresh(options), render: () => client.render(), getState: () => client.getState(),
  };
});
