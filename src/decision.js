// Decision metadata layer: freshness, signal stability, contradictions, and ATR trade plan.
'use strict';

const round = (x, d = 2) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

function priceDigits(price) {
  if (price == null || isNaN(price)) return 2;
  if (price >= 1000) return 0;
  if (price >= 1) return 2;
  return 4;
}

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
  if (typeof price !== 'number' || typeof atr !== 'number' || atr <= 0) {
    return { available: false, reason: 'ATR veya fiyat eksik' };
  }

  const digits = priceDigits(price);
  const risk = atr * 1.5;
  const entry = round(price, digits);
  const stop = round(price - risk, digits);
  const target = round(price + risk * 2, digits);
  const rawUnits = risk > 0 ? (100000 * (riskPct / 100)) / risk : null;
  const unitsPer100k = rawUnits == null ? null : rawUnits >= 1 ? Math.floor(rawUnits) : round(rawUnits, 4);

  return {
    available: true,
    entry,
    stop,
    target,
    riskReward: 2,
    positionRiskPct: riskPct,
    unitsPer100k,
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
  const riskPct = typeof opts.riskPct === 'number' ? opts.riskPct : 2;
  const history = opts.history || [];
  const marketKey = opts.marketKey || marketPrefix(asset.market);
  const trade = buildTradePlan(asset, riskPct);
  const freshness = buildFreshness(asset, now);
  const confidence = buildConfidence(asset, history, marketKey);
  const contradictions = buildContradictions(asset);
  const score = buildDecisionScore(freshness, confidence, contradictions);

  return {
    score,
    status: score >= 80 ? 'clean' : score >= 60 ? 'caution' : 'blocked',
    freshness,
    confidence,
    contradictions,
    trade,
  };
}

function attachDecisionMetadata(snapshot, history, cfg = {}) {
  const now = new Date(snapshot.generatedAt || Date.now());
  const riskPct = typeof cfg.riskPct === 'number' ? cfg.riskPct : 2;
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
  buildTradePlan,
  buildFreshness,
  buildConfidence,
  buildContradictions,
};
