'use strict';

const { normalizeJournal } = require('./decision-journal');

const CLOSED_WIN = new Set(['target-hit', 'expired-win']);
const CLOSED_LOSS = new Set(['stop-hit', 'expired-loss']);

function clamp(n, min, max) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(n, d = 1) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(d));
}

function addDays(iso, days) {
  const base = iso ? new Date(iso) : new Date();
  return new Date(base.getTime() + days * 86400000).toISOString();
}

function diffDays(laterIso, earlierIso) {
  const later = new Date(laterIso);
  const earlier = new Date(earlierIso);
  if (isNaN(later.getTime()) || isNaN(earlier.getTime())) return 0;
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86400000));
}

function scoreBucket(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 'unknown';
  if (s <= 29) return '0-29';
  if (s <= 44) return '30-44';
  if (s <= 59) return '45-59';
  if (s <= 69) return '60-69';
  if (s <= 79) return '70-79';
  return '80-100';
}

function normalizedLabel(label) {
  return String(label || 'BILINMIYOR').trim().toUpperCase().replace(/\s+/g, '_');
}

function isClosed(prediction) {
  return !!(prediction && prediction.outcome && prediction.outcome !== 'open');
}

function isWin(outcome) {
  return CLOSED_WIN.has(String(outcome || ''));
}

function isLoss(outcome) {
  return CLOSED_LOSS.has(String(outcome || ''));
}

function attributionTags(prediction) {
  const outcome = String(prediction.outcome || '');
  const tags = [outcome];
  const market = String(prediction.market || '').toLowerCase();
  const label = normalizedLabel(prediction.label);
  if (market) tags.push(market + '-market');
  if (label.includes('GUCLU')) tags.push('high-conviction');
  if (isWin(outcome) && Number(prediction.resultPct) > 0) tags.push('positive-follow-through');
  return tags;
}

function failureTags(prediction) {
  const outcome = String(prediction.outcome || '');
  const tags = [];
  if (isLoss(outcome)) tags.push(outcome);
  if (outcome === 'stop-hit') tags.push('risk-limit-hit');
  if (outcome === 'expired-loss') tags.push('time-decay-loss');
  return tags;
}

function lessonFor(prediction, holdingDays) {
  const symbol = String(prediction.symbol || 'Varlik').toUpperCase();
  const market = String(prediction.market || '').toUpperCase();
  const result = round(prediction.resultPct || 0, 1);
  if (prediction.outcome === 'target-hit') {
    return symbol + ' hedefe ' + holdingDays + ' gunde ulasti; ' + market + ' tarafinda bu skor araligi takip edilmeli.';
  }
  if (prediction.outcome === 'expired-win') {
    return symbol + ' vade sonunda +' + result + '% ile kapandi; sinyal calisti ama hedefe ulasmadan zaman doldu.';
  }
  if (prediction.outcome === 'stop-hit') {
    return symbol + ' stop seviyesine indi; bu kosulda giris kalitesi ve stop mesafesi yeniden incelenmeli.';
  }
  if (prediction.outcome === 'expired-loss') {
    return symbol + ' vade sonunda ' + result + '% ile zayif kapandi; sinyal gecikti veya momentum teyidi yetersiz kaldi.';
  }
  return symbol + ' sinyali kapandi; sonuc audit kaydina alindi.';
}

function auditPrediction(prediction) {
  if (!isClosed(prediction)) return null;
  const holdingDays = diffDays(prediction.resolvedAt, prediction.createdAt);
  const id = String(prediction.id || [
    String(prediction.market || '').toLowerCase(),
    String(prediction.symbol || '').toUpperCase(),
    String(prediction.createdAt || '').slice(0, 10),
  ].join(':')) + ':audit';
  return {
    id,
    predictionId: prediction.id || null,
    market: String(prediction.market || '').toLowerCase(),
    symbol: String(prediction.symbol || '').toUpperCase(),
    source: prediction.source || 'user',
    label: prediction.label || '',
    score: prediction.score,
    scoreBucket: scoreBucket(prediction.score),
    entry: prediction.entry,
    target: prediction.target,
    stop: prediction.stop,
    outcome: prediction.outcome,
    resultPct: Number.isFinite(Number(prediction.resultPct)) ? Number(prediction.resultPct) : 0,
    createdAt: prediction.createdAt || null,
    resolvedAt: prediction.resolvedAt || null,
    holdingDays,
    attributionTags: attributionTags(prediction),
    failureTags: failureTags(prediction),
    lesson: lessonFor(prediction, holdingDays),
    confidence: clamp(0.55 + Math.min(0.2, holdingDays / 100), 0.55, 0.75),
  };
}

function groupStats(audits, keyFn, nowIso) {
  const groups = new Map();
  audits.forEach((audit) => {
    const key = keyFn(audit);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(audit);
  });
  return Array.from(groups.entries()).map(([key, rows]) => {
    const wins = rows.filter((x) => isWin(x.outcome)).length;
    const sampleSize = rows.length;
    const winRate = sampleSize ? Math.round((wins / sampleSize) * 100) : 0;
    const avgResultPct = sampleSize ? round(rows.reduce((sum, x) => sum + (Number(x.resultPct) || 0), 0) / sampleSize, 1) : 0;
    return {
      key,
      sampleSize,
      wins,
      losses: sampleSize - wins,
      winRate,
      avgResultPct,
      asOf: nowIso,
    };
  }).sort((a, b) => b.sampleSize - a.sampleSize || b.avgResultPct - a.avgResultPct);
}

function ruleAdjustment(stat) {
  if (!stat || stat.sampleSize < 5) return 0;
  if (stat.winRate >= 65 && stat.avgResultPct > 0) return stat.avgResultPct >= 4 ? 2 : 1;
  if (stat.winRate <= 40 || stat.avgResultPct < 0) return stat.avgResultPct <= -4 ? -2 : -1;
  return 0;
}

function confidenceForSample(sampleSize) {
  if (sampleSize >= 20) return 0.85;
  if (sampleSize >= 10) return 0.78;
  if (sampleSize >= 5) return 0.7;
  return 0.45;
}

function ruleReason(scope, stat, adj) {
  const direction = adj > 0 ? 'pozitif kalibre oldu' : 'zayif kalibre oldu';
  const scopeText = [scope.market, scope.label, scope.scoreBucket].filter(Boolean).join(' / ');
  return scopeText + ' gecmis sistem cagrisinda ' + stat.sampleSize + ' kapanis, %' + stat.winRate + ' isabet ve ortalama ' + stat.avgResultPct + '% sonuc: ' + direction + '.';
}

function ruleFromStat(scope, stat, nowIso) {
  const adjustment = ruleAdjustment(stat);
  if (!adjustment) return null;
  const labelKey = scope.label ? normalizedLabel(scope.label) : 'all';
  return {
    id: ['learning', scope.market || 'all', labelKey, scope.scoreBucket || 'all'].join(':'),
    scope,
    sampleSize: stat.sampleSize,
    winRate: stat.winRate,
    avgResultPct: stat.avgResultPct,
    adjustment,
    confidence: confidenceForSample(stat.sampleSize),
    reason: ruleReason(scope, stat, adjustment),
    asOf: nowIso,
    expiresAt: addDays(nowIso, 7),
  };
}

function scopeSpecificity(rule) {
  const scope = rule && rule.scope ? rule.scope : {};
  return (scope.market ? 1 : 0) + (scope.label ? 1 : 0) + (scope.scoreBucket ? 1 : 0);
}

function buildReviewQueue(audits, nowIso) {
  const byMarket = groupStats(audits.filter((x) => x.source === 'system'), (x) => x.market, nowIso);
  return byMarket
    .filter((stat) => stat.sampleSize > 0 && (stat.sampleSize < 5 || stat.winRate <= 40 || stat.avgResultPct < 0))
    .slice(0, 5)
    .map((stat) => ({
      id: stat.key + ':learning-review:' + nowIso.slice(0, 10),
      market: stat.key,
      symbol: null,
      priority: stat.winRate <= 40 || stat.avgResultPct < 0 ? 'high' : 'medium',
      reason: stat.key.toUpperCase() + ' sistem cagri orneklemi ' + stat.sampleSize + '; isabet %' + stat.winRate + ', ortalama sonuc ' + stat.avgResultPct + '%.',
      nextAction: stat.sampleSize < 5 ? 'Orneklem dolana kadar skor etkisi verme; kapanan sinyalleri biriktir.' : 'Bu piyasa icin giris filtresini ve vade varsayimini yeniden test et.',
      createdAt: nowIso,
      status: 'open',
    }));
}

function buildLearningSummary(journal, nowIso = new Date().toISOString()) {
  const normalized = normalizeJournal(journal);
  const existingAudits = normalized.decisionAudits || [];
  const inferredAudits = normalized.predictions
    .filter((p) => isClosed(p))
    .map(auditPrediction)
    .filter(Boolean);
  const byId = {};
  existingAudits.concat(inferredAudits).forEach((audit) => {
    if (audit && audit.id) byId[audit.id] = audit;
  });
  const audits = Object.values(byId).sort((a, b) => String(b.resolvedAt || '').localeCompare(String(a.resolvedAt || '')));
  const systemAudits = audits.filter((x) => (x.source || 'user') === 'system');

  const calibrationByMarket = groupStats(systemAudits, (x) => x.market, nowIso);
  const calibrationByLabel = groupStats(systemAudits, (x) => normalizedLabel(x.label), nowIso);
  const calibrationByScoreBucket = groupStats(systemAudits, (x) => x.scoreBucket, nowIso);

  const exactStats = groupStats(systemAudits, (x) => [x.market, normalizedLabel(x.label), x.scoreBucket].join('|'), nowIso);
  const marketBucketStats = groupStats(systemAudits, (x) => [x.market, x.scoreBucket].join('|'), nowIso);
  const marketStats = groupStats(systemAudits, (x) => x.market, nowIso);
  const learningRules = exactStats
    .map((stat) => {
      const parts = stat.key.split('|');
      return ruleFromStat({ market: parts[0], label: parts[1], scoreBucket: parts[2] }, stat, nowIso);
    })
    .concat(marketBucketStats.map((stat) => {
      const parts = stat.key.split('|');
      return ruleFromStat({ market: parts[0], scoreBucket: parts[1] }, stat, nowIso);
    }))
    .concat(marketStats.map((stat) => ruleFromStat({ market: stat.key }, stat, nowIso)))
    .filter(Boolean)
    .sort((a, b) => scopeSpecificity(b) - scopeSpecificity(a) || b.sampleSize - a.sampleSize);

  return {
    generatedAt: nowIso,
    totalAudits: audits.length,
    systemAudits: systemAudits.length,
    calibrationByMarket,
    calibrationByLabel,
    calibrationByScoreBucket,
    recentLessons: audits.slice(0, 8).map((x) => ({
      id: x.id,
      market: x.market,
      symbol: x.symbol,
      outcome: x.outcome,
      resultPct: x.resultPct,
      resolvedAt: x.resolvedAt,
      lesson: x.lesson,
      confidence: x.confidence,
    })),
    learningRules,
    reviewQueue: buildReviewQueue(systemAudits, nowIso),
  };
}

module.exports = {
  auditPrediction,
  buildLearningSummary,
  scoreBucket,
  isWin,
};
