// Decision metadata layer: freshness, signal stability, contradictions, and ATR trade plan.
'use strict';
const { calculatePosition } = require('../public/action-layer');

const round = (x, d = 2) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

function marketPrefix(market) {
  if (market === 'us') return 'US:';
  if (market === 'bist') return 'BIST:';
  return 'CRYPTO:';
}

function latestPriorHistory(history, date) {
  if (!Array.isArray(history) || !history.length) return null;
  const prior = history.filter((h) => !date || h.date !== date);
  return prior.length ? prior[prior.length - 1] : null;
}

function buildTradePlan(asset, riskPct) {
  const price = asset && asset.price;
  const atr = asset && asset.ind && asset.ind.atr;
  const capitalBase = 100000;
  // Use the same pure arithmetic as the calculator. A risk allowance is an
  // upper bound, not permission to borrow cash when the ATR distance is small.
  const sized = calculatePosition(capitalBase, riskPct, price, atr);
  if (!sized.available) return sized;

  return {
    available: true,
    entry: sized.entry,
    stop: sized.stop,
    target: sized.target,
    riskReward: 2,
    positionRiskPct: riskPct,
    unitsPer100k: sized.units,
    capitalBase,
    capitalCurrency: typeof (asset && asset.currency) === 'string' && asset.currency.trim() ? asset.currency.trim() : null,
    riskAmount: sized.riskAmount,
    actualRiskAmount: sized.actualRiskAmount,
    actualRiskPct: sized.actualRiskAmount / capitalBase * 100,
    positionAmount: sized.positionAmount,
    capitalLimited: sized.capitalLimited,
    priceDecimals: sized.priceDecimals,
    constraints: sized.constraints,
    assumptions: {
      currencyBasis: 'asset_price_currency',
      stopAtrMultiple: 1.5,
      targetAtrMultiple: 3,
      costsIncluded: false,
      slippageIncluded: false,
      brokerLotRulesApplied: false,
    },
  };
}

function isBuyRecommendation(asset) {
  const a = asset && asset.analysis ? asset.analysis : {};
  return a.tone === 'strong-buy' || a.tone === 'buy' || a.label === 'GUCLU AL' || a.label === 'AL';
}

function buildActionableTradePlan(asset, riskPct, decisionScore) {
  if (!isBuyRecommendation(asset)) {
    return {
      available: false,
      status: 'not-recommended',
      reason: 'AL/GUCLU AL sinyali yok; giris, stop ve hedef seviyesi yayinlanmaz.',
    };
  }
  if (decisionScore != null && decisionScore < 60) {
    return {
      available: false,
      status: 'decision-blocked',
      reason: 'Karar kalitesi dusuk; yeni giris plani yayinlanmaz.',
    };
  }
  const plan = buildTradePlan(asset, riskPct);
  if (!plan.available) {
    return Object.assign({}, plan, { status: 'data-missing' });
  }
  return Object.assign({}, plan, {
    status: 'candidate',
    reason: 'AL sinyali icin ATR tabanli aday plan.',
  });
}

function diffDays(laterIso, earlierIso) {
  const later = new Date(laterIso);
  const earlier = new Date(earlierIso);
  if (isNaN(later.getTime()) || isNaN(earlier.getTime())) return null;
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86400000));
}

function buildSignalHealth(asset, prediction, nowIso) {
  if (!asset || !prediction || prediction.outcome !== 'open') return null;
  const price = Number(asset.price);
  const entry = Number(prediction.entry);
  const stop = Number(prediction.stop);
  const target = Number(prediction.target);
  if (![price, entry, stop, target].every(Number.isFinite) || entry <= 0 || target <= entry || stop >= entry) {
    return null;
  }

  const resultPct = round(((price - entry) / entry) * 100, 2);
  const progressPct = round(((price - entry) / (target - entry)) * 100, 1);
  const stopBufferPct = round(((price - stop) / entry) * 100, 2);
  const targetGapPct = round(((target - price) / price) * 100, 2);
  let status = 'healthy';
  let label = 'Saglikli';
  let reason = 'Fiyat giris ustunde; sinyal hedefe dogru izleniyor.';

  if (price >= target) {
    status = 'target-zone';
    label = 'Hedef bolgesi';
    reason = 'Fiyat hedef seviyesine ulasmis; sinyal kapatma/kar alma kontrolu ister.';
  } else if (price <= stop) {
    status = 'broken';
    label = 'Stop riski';
    reason = 'Fiyat stop seviyesinde veya altinda; sinyal sagligi bozuldu.';
  } else if (price < entry) {
    status = 'pullback';
    label = 'Geri cekilme';
    reason = 'Fiyat giris altinda ama stop ustunde; sinyal zayifliyor.';
  }

  return {
    available: true,
    predictionId: prediction.id,
    source: prediction.source || 'system',
    status,
    label,
    reason,
    entry,
    stop,
    target,
    currentPrice: price,
    resultPct,
    progressPct,
    stopBufferPct,
    targetGapPct,
    riskReward: 2,
    createdAt: prediction.createdAt,
    horizonDays: prediction.horizonDays || 30,
    ageDays: diffDays(nowIso || new Date().toISOString(), prediction.createdAt),
  };
}

function buildFreshness(asset, now) {
  const t = asset && asset.quoteTime ? new Date(asset.quoteTime) : null;
  if (!t || isNaN(t.getTime())) {
    return { status: 'unknown', label: 'Veri zamani yok', ageHours: null };
  }

  const ageHours = Math.max(0, (now.getTime() - t.getTime()) / 36e5);
  const market = asset.market;
  const staleAfter = market === 'crypto' ? 2 : 36;
  const delayedAfter = market === 'crypto' ? 1 : 18;
  let status = 'fresh';
  if (ageHours > staleAfter) status = 'stale';
  else if (ageHours > delayedAfter) status = 'delayed';

  const label = status === 'fresh'
    ? 'Veri taze'
    : status === 'delayed'
      ? 'Veri gecikmeli'
      : 'Veri eski';

  return { status, label, ageHours: round(ageHours, 1), asOf: asset.quoteTime };
}

function buildConfidence(asset, history, marketKey) {
  const key = (marketKey || marketPrefix(asset.market)) + asset.symbol;
  const today = new Date().toISOString().slice(0, 10);
  const prior = latestPriorHistory(history, today);
  const current = asset && asset.analysis && asset.analysis.score;
  const previous = prior && prior.scores ? prior.scores[key] : null;

  if (typeof current !== 'number' || typeof previous !== 'number') {
    return { status: 'unknown', label: 'Stabilite icin gecmis az', previousScore: previous, scoreDelta: null };
  }

  const scoreDelta = current - previous;
  const abs = Math.abs(scoreDelta);
  let status = 'stable';
  if (abs >= 15) status = 'unstable';
  else if (abs >= 8) status = 'watch';

  const label = status === 'stable'
    ? 'Sinyal stabil'
    : status === 'watch'
      ? 'Sinyal hizli degisti'
      : 'Sinyal oynak';

  return { status, label, previousScore: previous, scoreDelta };
}

function buildContradictions(asset) {
  const a = asset.analysis || {};
  const ind = asset.ind || {};
  const macd = ind.macd || {};
  const out = [];

  if (a.score >= 60 && ind.pos52 >= 0.9 && macd.histogram < 0) {
    out.push({
      code: 'late-cycle-long',
      severity: 'high',
      label: 'Tepe riski',
      detail: 'Skor yuksek, fiyat 52H bandinin tepesinde ve MACD negatif.',
    });
  }

  if (a.score >= 60 && ind.volSpike != null && ind.volSpike < 0.5) {
    out.push({
      code: 'thin-confirmation',
      severity: 'medium',
      label: 'Hacim teyidi zayif',
      detail: 'AL sinyali var ama hacim 20g ortalamanin belirgin altinda.',
    });
  }

  return out;
}

function buildDecisionScore(freshness, confidence, contradictions) {
  let score = 100;
  if (freshness.status === 'delayed') score -= 10;
  if (freshness.status === 'stale') score -= 24;
  if (confidence.status === 'watch') score -= 8;
  if (confidence.status === 'unstable') score -= 18;
  contradictions.forEach((c) => {
    score -= c.severity === 'high' ? 18 : 10;
  });
  return Math.max(0, Math.min(100, score));
}

function buildAssetDecision(asset, opts = {}) {
  const now = opts.now || new Date();
  const riskPct = Object.prototype.hasOwnProperty.call(opts, 'riskPct') ? opts.riskPct : 2;
  const history = opts.history || [];
  const marketKey = opts.marketKey || marketPrefix(asset.market);
  const freshness = buildFreshness(asset, now);
  const confidence = buildConfidence(asset, history, marketKey);
  const contradictions = buildContradictions(asset);
  const score = buildDecisionScore(freshness, confidence, contradictions);
  const trade = buildActionableTradePlan(asset, riskPct, score);

  return {
    score,
    status: score >= 80 ? 'clean' : score >= 60 ? 'caution' : 'blocked',
    freshness,
    confidence,
    contradictions,
    trade,
    activeSignal: null,
  };
}

function attachSignalHealth(snapshot, journal) {
  const predictions = Array.isArray(journal && journal.predictions) ? journal.predictions : [];
  const openByKey = {};
  predictions
    .filter((p) => p && p.outcome === 'open' && (p.source || 'system') === 'system')
    .forEach((p) => {
      const key = String(p.market || '').toLowerCase() + ':' + String(p.symbol || '').toUpperCase();
      const prev = openByKey[key];
      if (!prev || String(p.createdAt || '') > String(prev.createdAt || '')) openByKey[key] = p;
    });

  const nowIso = snapshot && snapshot.generatedAt ? snapshot.generatedAt : new Date().toISOString();
  ['us', 'bist', 'crypto'].forEach((market) => {
    (snapshot && snapshot[market] ? snapshot[market] : []).forEach((asset) => {
      if (!asset || !asset.decision) return;
      const key = market + ':' + String(asset.symbol || '').toUpperCase();
      asset.decision.activeSignal = buildSignalHealth(asset, openByKey[key], nowIso);
    });
  });
  return snapshot;
}

function attachDecisionMetadata(snapshot, history, cfg = {}) {
  const now = new Date(snapshot.generatedAt || Date.now());
  const riskPct = Object.prototype.hasOwnProperty.call(cfg, 'riskPct') ? cfg.riskPct : 2;
  const attach = (arr, prefix) => (arr || []).forEach((asset) => {
    if (!asset.analysis || asset.analysis.score == null) return;
    asset.decision = buildAssetDecision(asset, { now, history, riskPct, marketKey: prefix });
  });
  attach(snapshot.us, 'US:');
  attach(snapshot.bist, 'BIST:');
  attach(snapshot.crypto, 'CRYPTO:');
  return snapshot;
}

module.exports = {
  buildAssetDecision,
  attachDecisionMetadata,
  attachSignalHealth,
  buildTradePlan,
  buildActionableTradePlan,
  buildSignalHealth,
  isBuyRecommendation,
  buildFreshness,
  buildConfidence,
  buildContradictions,
};
