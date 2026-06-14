'use strict';

const { buildPredictionScorecard, normalizeJournal } = require('./decision-journal');

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
  if (!signal || !signal.expiresAt) return false;
  return new Date(signal.expiresAt).getTime() <= new Date(now).getTime();
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

function textBlob(aiReport) {
  if (!aiReport) return '';
  const parts = [
    aiReport.macroSummary,
    aiReport.todayFocus,
    aiReport.commentary && aiReport.commentary.us,
    aiReport.commentary && aiReport.commentary.bist,
    aiReport.commentary && aiReport.commentary.crypto,
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function scoreText(text, positiveTerms, negativeTerms) {
  let score = 0;
  positiveTerms.forEach((term) => { if (text.includes(term)) score += 1; });
  negativeTerms.forEach((term) => { if (text.includes(term)) score -= 1; });
  return clamp(score, -2, 2);
}

function marketText(aiReport, market) {
  const global = textBlob(aiReport);
  const local = aiReport && aiReport.commentary && aiReport.commentary[market] ? String(aiReport.commentary[market]).toLowerCase() : '';
  return (local || global).trim();
}

function buildMarketOverlay(aiReport, nowIso) {
  const positive = ['risk appetite', 'olumlu', 'destek', 'dovish', 'yumusak', 'yumuşak', 'rally', 'genisleme', 'genişleme', 'likidite'];
  const negative = ['olumsuz', 'baski', 'baskı', 'hawkish', 'sikilasma', 'sıkılaşma', 'resesyon', 'enflasyon', 'riskten kacis', 'riskten kaçış', 'volatilite', 'jeopolitik'];
  const out = {};
  ['us', 'bist', 'crypto'].forEach((market) => {
    const text = marketText(aiReport, market);
    const adjustment = scoreText(text, positive, negative);
    out[market] = {
      market,
      adjustment,
      confidence: adjustment === 0 ? 0.35 : 0.6,
      reason: adjustment === 0 ? MARKET_NAMES[market] + ' makro metni notr' : MARKET_NAMES[market] + ' makro metni ' + (adjustment > 0 ? 'destekleyici' : 'baskilayici'),
      source: 'ai-report:commentary',
      asOf: nowIso,
      expiresAt: addHours(nowIso, DEFAULT_TTL_HOURS),
    };
  });
  return out;
}

function normalizeSignal(raw, nowIso) {
  if (!raw || typeof raw !== 'object') return null;
  const asOf = raw.asOf || raw.generatedAt || nowIso;
  const type = raw.type || raw.kind || 'macro';
  const source = raw.source || 'ai-report:macroSignalOverlay';
  return {
    type,
    market: raw.market ? normalizeMarket(raw.market) : null,
    symbol: raw.symbol ? String(raw.symbol).toUpperCase() : null,
    adjustment: clamp(raw.adjustment, -MAX_ADJUSTMENT, MAX_ADJUSTMENT),
    confidence: clamp(raw.confidence == null ? 0.5 : raw.confidence, 0, 1),
    source,
    reason: String(raw.reason || raw.title || type + ' overlay'),
    asOf,
    expiresAt: raw.expiresAt || addHours(asOf, DEFAULT_TTL_HOURS),
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
  return rawSignals.map((x) => normalizeSignal(x, nowIso)).filter(Boolean);
}

function component(type, adjustment, reason, source, nowIso, confidence) {
  return {
    type,
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
    const high = includesAny(headline, ['earnings', 'bilan', 'launch', 'partnership', 'approval', 'lawsuit', 'fed', 'cpi']);
    out.push(component(
      'companyNews',
      high ? 2 : 1,
      symbol + ' haber katalizoru: ' + headline,
      news.source || 'calendar:companyNews',
      news.date || nowIso,
      high ? 0.7 : 0.55
    ));
  });

  (cal.earnings || []).forEach((earning) => {
    if (String(earning.symbol || '').toUpperCase() !== symbol) return;
    out.push(component(
      'earnings',
      2,
      symbol + ' bilanco penceresi karar baskisini artiriyor',
      'calendar:earnings',
      earning.date || nowIso,
      0.68
    ));
  });

  (cal.economic || []).forEach((event) => {
    const name = event.event || event.name || '';
    const high = String(event.importance || event.impact || '').toLowerCase() === 'high';
    if (!high) return;
    if (market === 'us' && includesAny(name, ['cpi', 'fed', 'pce', 'payroll', 'jobs'])) {
      out.push(component('macroCatalyst', -1, name + ' verisi ABD risk primini etkileyebilir', 'calendar:economic', event.date || nowIso, 0.58));
    }
    if (market === 'bist' && includesAny(name, ['cpi', 'fed', 'rate', 'inflation', 'enflasyon'])) {
      out.push(component('macroCatalyst', -1, name + ' verisi BIST/TL duyarliligini artiriyor', 'calendar:economic', event.date || nowIso, 0.58));
    }
    if (market === 'crypto' && includesAny(name, ['cpi', 'fed', 'liquidity', 'rate'])) {
      out.push(component('btcLiquidity', -1, name + ' verisi BTC likidite duyarliligini artiriyor', 'calendar:economic', event.date || nowIso, 0.56));
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

function calibrationComponent(journal, nowIso) {
  const card = buildPredictionScorecard(journal);
  const system = card.bySource && card.bySource.system;
  if (!system || system.closed < 5) return null;
  if (system.winRate < 45) {
    return component('predictionCalibration', -2, 'Sistem tahmin kalibrasyonu zayif: ' + system.winRate + '% isabet', 'journal:predictions', nowIso, 0.75);
  }
  if (system.winRate > 60) {
    return component('predictionCalibration', 1, 'Sistem tahmin kalibrasyonu guclu: ' + system.winRate + '% isabet', 'journal:predictions', nowIso, 0.7);
  }
  return null;
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
  return clamp(components.reduce((sum, x) => sum + (Number(x.adjustment) || 0), 0), -MAX_ADJUSTMENT, MAX_ADJUSTMENT);
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
    boosted: assets.filter((x) => x.totalAdjustment > 0).length,
    reduced: assets.filter((x) => x.totalAdjustment < 0).length,
    highPressure: assets.filter((x) => x.components.some((c) => ['earnings', 'companyNews', 'macroCatalyst', 'btcLiquidity'].includes(c.type))).length,
    stale: assets.reduce((sum, x) => sum + (x.expiredComponents || []).length, 0),
  };
}

function buildMacroSignalOverlay({ snapshot, aiReport, baseReport, journal, now } = {}) {
  const nowIso = now || new Date().toISOString();
  const normalizedJournal = normalizeJournal(journal);
  const market = buildMarketOverlay(aiReport, nowIso);
  const aiSignals = extractAiSignals(aiReport, nowIso);
  const calibration = calibrationComponent(normalizedJournal, nowIso);
  const assets = {};

  allAssets(snapshot).forEach((asset) => {
    const active = [];
    const expired = [];
    const marketKey = normalizeMarket(asset.market);
    const m = market[marketKey];
    if (m && m.adjustment !== 0) active.push(Object.assign({ type: 'macro', adjustment: m.adjustment }, m));
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
    bankingComponents(asset, snapshot, nowIso).forEach((sig) => {
      if (isExpired(sig, nowIso)) expired.push(sig);
      else active.push(sig);
    });

    const totalAdjustment = componentImpact(active);
    const technicalScore = clamp(asset.analysis.score, 0, 100);
    const confidence = active.length
      ? Number((active.reduce((sum, x) => sum + x.confidence, 0) / active.length).toFixed(2))
      : 0;

    assets[assetKey(asset)] = {
      market: marketKey,
      symbol: String(asset.symbol || '').toUpperCase(),
      technicalScore,
      totalAdjustment,
      adjustedScore: clamp(technicalScore + totalAdjustment, 0, 100),
      status: statusFromAdjustment(totalAdjustment),
      confidence,
      components: active,
      expiredComponents: expired,
    };
  });

  const overlay = {
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
