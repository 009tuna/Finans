'use strict';

const { normalizeJournal } = require('./decision-journal');
const { buildLearningSummary, scoreBucket } = require('./decision-auditor');

const MAX_ADJUSTMENT = 8;
const DEFAULT_TTL_HOURS = 36;
const MARKET_NAMES = { us: 'ABD', bist: 'BIST', crypto: 'Kripto' };

function clamp(n, min, max) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function addHours(iso, hours) {
  const base = iso ? new Date(iso) : new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function isExpired(signal, now) {
  if (!signal) return true;
  const start = Date.parse(signal.asOf);
  const end = Date.parse(signal.expiresAt);
  const current = Date.parse(now);
  return ![start, end, current].every(Number.isFinite) || start > current || end <= current || end <= start;
}

function normalizeMarket(market) {
  const m = String(market || '').toLowerCase();
  if (m === 'abd' || m === 'us' || m === 'usa') return 'us';
  if (m === 'kripto' || m === 'crypto') return 'crypto';
  if (m === 'bist' || m === 'tr' || m === 'turkey') return 'bist';
  return m || 'unknown';
}

function assetKey(asset) {
  return normalizeMarket(asset.market) + ':' + String(asset.symbol || '').toUpperCase();
}

function allAssets(snapshot) {
  const withMarket = (market, rows) => (rows || []).map((x) => Object.assign({ market }, x, { market: x.market || market }));
  return []
    .concat(withMarket('us', snapshot && snapshot.us))
    .concat(withMarket('bist', snapshot && snapshot.bist))
    .concat(withMarket('crypto', snapshot && snapshot.crypto))
    .filter((x) => x && x.symbol && x.analysis && typeof x.analysis.score === 'number');
}

function buildMarketOverlay(aiSignals, nowIso) {
  const out = {};
  ['us', 'bist', 'crypto'].forEach((market) => {
    const signals = aiSignals.filter((s) => s.market === market && !s.symbol && !isExpired(s, nowIso));
    out[market] = {
      market,
      adjustment: componentImpact(signals),
      confidence: signals.length ? signals.reduce((n, s) => n + s.confidence, 0) / signals.length : null,
      status: signals.length ? 'available' : 'missing',
      reason: signals.length ? MARKET_NAMES[market] + ' kaynakli makro gorus' : MARKET_NAMES[market] + ' icin guncel kaynakli makro sinyal yok',
      asOf: signals.length ? signals.map((s) => s.asOf).sort()[0] : null,
      expiresAt: signals.length ? signals.map((s) => s.expiresAt).sort()[0] : null,
    };
  });
  return out;
}

function normalizeSignal(raw, nowIso) {
  if (!raw || typeof raw !== 'object') return null;
  const asOf = raw.asOf || raw.generatedAt;
  if (!Number.isFinite(Date.parse(asOf))) return null;
  try { if (!['https:', 'http:'].includes(new URL(raw.source).protocol)) return null; } catch (_) { return null; }
  const type = raw.type || raw.kind || 'macro';
  const maxExpiry = addHours(asOf, DEFAULT_TTL_HOURS);
  if (raw.expiresAt && !Number.isFinite(Date.parse(raw.expiresAt))) return null;
  const expiresAt = raw.expiresAt && Date.parse(raw.expiresAt) < Date.parse(maxExpiry) ? raw.expiresAt : maxExpiry;
  return {
    type,
    category: 'directional',
    eventId: raw.eventId || null,
    market: raw.market ? normalizeMarket(raw.market) : null,
    symbol: raw.symbol ? String(raw.symbol).toUpperCase() : null,
    adjustment: clamp(raw.adjustment, -MAX_ADJUSTMENT, MAX_ADJUSTMENT),
    confidence: clamp(raw.confidence == null ? 0.5 : raw.confidence, 0, 1),
    source: raw.source,
    confidenceKind: 'model-opinion',
    reason: String(raw.reason || raw.title || type + ' overlay'),
    asOf,
    expiresAt,
  };
}

function extractAiSignals(aiReport, nowIso) {
  const overlay = aiReport && aiReport.macroSignalOverlay;
  if (!overlay) return [];
  const rawSignals = Array.isArray(overlay.signals)
    ? overlay.signals
    : Array.isArray(overlay.components)
      ? overlay.components
      : [];
  const seen = new Set();
  return rawSignals.map((x) => normalizeSignal(x, nowIso)).filter(Boolean)
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))
    .filter((s) => {
      const key = [s.eventId || s.source, s.market, s.symbol].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function component(type, adjustment, reason, source, nowIso, confidence) {
  return {
    type,
    category: 'readiness',
    adjustment: clamp(adjustment, -MAX_ADJUSTMENT, MAX_ADJUSTMENT),
    confidence: clamp(confidence == null ? 0.55 : confidence, 0, 1),
    reason,
    source,
    asOf: nowIso,
    expiresAt: addHours(nowIso, DEFAULT_TTL_HOURS),
  };
}

function includesAny(value, words) {
  const text = String(value || '').toLowerCase();
  return words.some((word) => text.includes(word));
}

function buildCatalystComponents(asset, baseReport, nowIso) {
  const market = normalizeMarket(asset.market);
  const symbol = String(asset.symbol || '').toUpperCase();
  const cal = (baseReport && baseReport.calendar) || {};
  const out = [];

  (cal.companyNews || []).forEach((news) => {
    if (String(news.symbol || '').toUpperCase() !== symbol) return;
    const headline = news.headline || news.title || '';
    const asOf = news.publishedAt || (Number.isFinite(news.datetime) ? new Date(news.datetime * 1000).toISOString() : news.date);
    if (!Number.isFinite(Date.parse(asOf))) return;
    out.push(component(
      'companyNews',
      0,
      symbol + ' haber katalizoru: ' + headline,
      news.url || news.source || 'calendar:companyNews',
      asOf,
      0
    ));
  });

  (cal.earnings || []).forEach((earning) => {
    if (String(earning.symbol || '').toUpperCase() !== symbol) return;
    if (!Number.isFinite(Date.parse(earning.date))) return;
    if (earning.date < nowIso.slice(0, 10) || Date.parse(earning.date) > Date.parse(nowIso) + 7 * 86400000) return;
    out.push(component(
      'earnings',
      0,
      symbol + ' bilanco penceresi karar baskisini artiriyor',
      'calendar:earnings',
      nowIso,
      0
    ));
  });

  (cal.economic || []).forEach((event) => {
    const name = event.event || event.name || '';
    const high = String(event.importance || event.impact || '').toLowerCase() === 'high';
    if (!high) return;
    if (!Number.isFinite(Date.parse(event.date)) || event.date < nowIso.slice(0, 10) || Date.parse(event.date) > Date.parse(nowIso) + 7 * 86400000) return;
    if (market === 'us' && includesAny(name, ['cpi', 'fed', 'pce', 'payroll', 'jobs'])) {
      out.push(component('macroCatalyst', 0, name + ' verisi ABD risk primini etkileyebilir', 'calendar:economic', nowIso, 0));
    }
    if (market === 'bist' && includesAny(name, ['cpi', 'fed', 'rate', 'inflation', 'enflasyon'])) {
      out.push(component('macroCatalyst', 0, name + ' verisi BIST/TL duyarliligini artiriyor', 'calendar:economic', nowIso, 0));
    }
    if (market === 'crypto' && includesAny(name, ['cpi', 'fed', 'liquidity', 'rate'])) {
      out.push(component('btcLiquidity', 0, name + ' verisi BTC likidite duyarliligini artiriyor', 'calendar:economic', nowIso, 0));
    }
  });

  return out;
}

function thesisComponent(asset, journal, nowIso) {
  const notes = normalizeJournal(journal).notes;
  const note = notes[assetKey(asset)];
  if (note && note.thesis && note.invalidation) {
    return component('thesisStatus', 1, 'Tez ve bozulma kosulu kayitli', 'journal:notes', note.updatedAt || nowIso, 0.72);
  }
  if (note && note.thesis && !note.invalidation) {
    return component('thesisStatus', -1, 'Tez var ama bozulma kosulu eksik', 'journal:notes', note.updatedAt || nowIso, 0.66);
  }
  return component('thesisStatus', -1, 'Tez status eksik; pozisyon aksiyonu zayif kanitli', 'journal:notes', nowIso, 0.55);
}

function calibrationComponent() {
  // A pooled historical win rate is not chronological calibration. No approved
  // validation/activation workflow exists yet, so it cannot alter readiness.
  return null;
}

function learningComponents() {
  // Proposals remain inactive until a validated activation workflow exists.
  return [];
}

function bankingComponents(asset, snapshot, nowIso) {
  const market = normalizeMarket(asset.market);
  if (market === 'crypto') return [];
  const score = asset.analysis && asset.analysis.score;
  const fund = asset.fundamentals || asset.fund || {};
  const hasMarketCap = Number.isFinite(Number(asset.marketCap || fund.marketCap));
  const hasValuation = Number.isFinite(Number(asset.pe || fund.pe || fund.forwardPE || fund.evEbitda));
  const out = [];
  if (!hasMarketCap || !hasValuation) {
    out.push(component('tearsheetCompleteness', -1, 'Tearsheet temel veri eksigi tasiyor', 'banking:tearsheet', nowIso, 0.68));
  }
  if (score >= 60 && !hasValuation) {
    out.push(component('compsValuationGap', -1, 'Yuksek teknik puana ragmen comps degerleme carpani yok', 'banking:comps', nowIso, 0.62));
  }
  const tone = asset.analysis && asset.analysis.tone;
  const isBuy = tone === 'strong-buy' || tone === 'buy';
  if (isBuy && (!asset.decision || !asset.decision.trade || asset.decision.trade.available !== true)) {
    out.push(component('modelAuditGap', -1, 'Trade modeli giris/stop/hedef denetimi tamam degil', 'banking:modelAudit', nowIso, 0.58));
  }
  const atrPct = asset.ind && Number(asset.ind.atrPct);
  if ((Number.isFinite(atrPct) && atrPct >= 6) || score >= 70) {
    out.push(component('scenarioSensitivity', -1, 'Senaryo hassasiyeti yuksek; sizing/stres testi gerekli', 'banking:scenario', nowIso, 0.56));
  }
  return out;
}

function matchingAiComponents(asset, aiSignals) {
  const market = normalizeMarket(asset.market);
  const symbol = String(asset.symbol || '').toUpperCase();
  return aiSignals.filter((sig) => {
    if (sig.symbol && sig.symbol !== symbol) return false;
    if (sig.market && sig.market !== market) return false;
    return sig.symbol || sig.market;
  });
}

function componentImpact(components) {
  return clamp(components.filter((x) => x.category === 'directional').reduce((sum, x) => sum + (Number(x.adjustment) || 0), 0), -MAX_ADJUSTMENT, MAX_ADJUSTMENT);
}

function statusFromAdjustment(adj) {
  if (adj >= 4) return 'boost';
  if (adj <= -4) return 'risk';
  if (adj !== 0) return 'watch';
  return 'neutral';
}

function summarizeOverlay(overlay) {
  const assets = Object.values((overlay && overlay.assets) || {});
  return {
    withEvidence: assets.filter((x) => x.evidenceStatus === 'available').length,
    boosted: assets.filter((x) => x.totalAdjustment > 0).length,
    reduced: assets.filter((x) => x.totalAdjustment < 0).length,
    highPressure: assets.filter((x) => x.components.some((c) => ['earnings', 'companyNews', 'macroCatalyst', 'btcLiquidity'].includes(c.type))).length,
    stale: assets.reduce((sum, x) => sum + (x.expiredComponents || []).length, 0),
  };
}

function buildMacroSignalOverlay({ snapshot, aiReport, baseReport, journal, now } = {}) {
  const nowIso = now || new Date().toISOString();
  const normalizedJournal = normalizeJournal(journal);
  const aiSignals = extractAiSignals(aiReport, nowIso);
  const market = buildMarketOverlay(aiSignals, nowIso);
  const calibration = calibrationComponent(normalizedJournal, nowIso);
  const learningSummary = buildLearningSummary(normalizedJournal, nowIso);
  const learningRules = learningSummary.learningRules || [];
  const assets = {};

  allAssets(snapshot).forEach((asset) => {
    const active = [];
    const expired = [];
    const marketKey = normalizeMarket(asset.market);
    matchingAiComponents(asset, aiSignals).forEach((sig) => {
      if (isExpired(sig, nowIso)) expired.push(sig);
      else active.push(sig);
    });
    buildCatalystComponents(asset, baseReport, nowIso).forEach((sig) => {
      if (isExpired(sig, nowIso)) expired.push(sig);
      else active.push(sig);
    });
    [thesisComponent(asset, normalizedJournal, nowIso), calibration].filter(Boolean).forEach((sig) => {
      if (isExpired(sig, nowIso)) expired.push(sig);
      else active.push(sig);
    });
    learningComponents(asset, learningRules, nowIso).forEach((sig) => {
      if (isExpired(sig, nowIso)) expired.push(sig);
      else active.push(sig);
    });
    bankingComponents(asset, snapshot, nowIso).forEach((sig) => {
      if (isExpired(sig, nowIso)) expired.push(sig);
      else active.push(sig);
    });

    const totalAdjustment = componentImpact(active);
    const technicalScore = clamp(asset.analysis.score, 0, 100);
    const directional = active.filter((x) => x.category === 'directional');
    const confidence = directional.length
      ? Number((directional.reduce((sum, x) => sum + x.confidence, 0) / directional.length).toFixed(2))
      : null;

    assets[assetKey(asset)] = {
      market: marketKey,
      symbol: String(asset.symbol || '').toUpperCase(),
      technicalScore,
      totalAdjustment,
      adjustedScore: clamp(technicalScore + totalAdjustment, 0, 100),
      status: statusFromAdjustment(totalAdjustment),
      confidence,
      confidenceKind: 'model-opinion',
      evidenceStatus: directional.length ? 'available' : 'missing',
      readinessIssues: active.filter((x) => x.category === 'readiness' && x.adjustment < 0),
      components: active,
      expiredComponents: expired,
    };
  });

  const overlay = {
    schemaVersion: 2,
    generatedAt: nowIso,
    expiresAt: addHours(nowIso, DEFAULT_TTL_HOURS),
    maxAdjustment: MAX_ADJUSTMENT,
    market,
    assets,
    summary: null,
  };
  overlay.summary = summarizeOverlay(overlay);
  return overlay;
}

function attachSignalOverlay(snapshot, overlay) {
  const cloned = JSON.parse(JSON.stringify(snapshot || {}));
  ['us', 'bist', 'crypto'].forEach((market) => {
    cloned[market] = (cloned[market] || []).map((asset) => {
      const key = market + ':' + String(asset.symbol || '').toUpperCase();
      return Object.assign({}, asset, { signalOverlay: overlay && overlay.assets ? overlay.assets[key] || null : null });
    });
  });
  cloned.macroSignalOverlay = overlay || null;
  return cloned;
}

module.exports = {
  MAX_ADJUSTMENT,
  clamp,
  isExpired,
  normalizeSignal,
  buildMacroSignalOverlay,
  attachSignalOverlay,
  summarizeOverlay,
};
