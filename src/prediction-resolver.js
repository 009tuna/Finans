'use strict';

const path = require('path');
const { fetchSeries: fetchYahooSeries } = require('./yahoo');
const { fetchSeries: fetchBinanceSeries } = require('./coingecko');
const { readJournal, writeJournal, appendDecisionAudit } = require('./decision-journal');
const { auditPrediction, buildLearningSummary } = require('./decision-auditor');

const ROOT = path.join(__dirname, '..');
const JOURNAL_PATH = path.join(ROOT, 'data', 'journal.json');

function diffDays(d1Str, d2Str) {
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// resolveOne(prediction, series, now) -> güncellenmiş prediction (veya değişiklik yoksa aynısı)
// series: { dates:[], highs:[], lows:[], closes:[] } — createdAt SONRASI günler
function resolveOne(prediction, series, now) {
  if (!prediction || prediction.outcome !== 'open') {
    return prediction;
  }
  if (!series || !Array.isArray(series.dates) || !series.dates.length) {
    return prediction;
  }

  const entry = prediction.entry;
  const target = prediction.target;
  const stop = prediction.stop;
  const horizonDays = prediction.horizonDays || 30;
  const createdDateStr = prediction.createdAt.slice(0, 10);
  const nowDateStr = now.toISOString().slice(0, 10);

  let resolved = null;

  for (let i = 0; i < series.dates.length; i++) {
    const dateStr = series.dates[i];
    
    // strictly after createdAt and up to now
    if (dateStr <= createdDateStr || dateStr > nowDateStr) {
      continue;
    }

    const high = series.highs[i];
    const low = series.lows[i];
    const close = series.closes[i];

    const hitTarget = high >= target;
    const hitStop = low <= stop;

    if (hitTarget && hitStop) {
      resolved = {
        outcome: 'stop-hit',
        resolvedAt: new Date(dateStr + 'T23:59:59.000Z').toISOString(),
        closePrice: stop,
      };
      break;
    } else if (hitTarget) {
      resolved = {
        outcome: 'target-hit',
        resolvedAt: new Date(dateStr + 'T23:59:59.000Z').toISOString(),
        closePrice: target,
      };
      break;
    } else if (hitStop) {
      resolved = {
        outcome: 'stop-hit',
        resolvedAt: new Date(dateStr + 'T23:59:59.000Z').toISOString(),
        closePrice: stop,
      };
      break;
    }

    const daysPassed = diffDays(dateStr, createdDateStr);
    if (daysPassed >= horizonDays) {
      resolved = {
        outcome: close > entry ? 'expired-win' : 'expired-loss',
        resolvedAt: new Date(dateStr + 'T23:59:59.000Z').toISOString(),
        closePrice: close,
      };
      break;
    }
  }

  // If not resolved in the loop, but now is past expiration calendar-wise
  if (!resolved) {
    const lastDaysPassed = diffDays(nowDateStr, createdDateStr);
    if (lastDaysPassed >= horizonDays) {
      // Find the last day in series that is after createdAt and <= now
      let lastValidIdx = -1;
      for (let i = series.dates.length - 1; i >= 0; i--) {
        const d = series.dates[i];
        if (d > createdDateStr && d <= nowDateStr) {
          lastValidIdx = i;
          break;
        }
      }
      if (lastValidIdx !== -1) {
        const close = series.closes[lastValidIdx];
        const dateStr = series.dates[lastValidIdx];
        resolved = {
          outcome: close > entry ? 'expired-win' : 'expired-loss',
          resolvedAt: new Date(dateStr + 'T23:59:59.000Z').toISOString(),
          closePrice: close,
        };
      }
    }
  }

  if (resolved) {
    const resultPct = Number(((resolved.closePrice - entry) / entry * 100).toFixed(1));
    return Object.assign({}, prediction, {
      outcome: resolved.outcome,
      resolvedAt: resolved.resolvedAt,
      closePrice: resolved.closePrice,
      resultPct: resultPct
    });
  }

  return prediction;
}

function applyResolvedPrediction(journal, prediction) {
  if (!journal || !Array.isArray(journal.predictions)) return journal;
  if (!prediction || !prediction.id || prediction.outcome === 'open') return journal;

  const idx = journal.predictions.findIndex((x) => x.id === prediction.id);
  if (idx >= 0) {
    journal.predictions[idx] = prediction;
  }

  const audit = auditPrediction(prediction);
  if (!audit) return journal;
  const nextJournal = appendDecisionAudit(journal, audit);
  journal.decisionAudits = nextJournal.decisionAudits;
  journal.learningRules = nextJournal.learningRules;
  journal.reviewQueue = nextJournal.reviewQueue;
  return journal;
}

// CLI wrapper
async function main() {
  const journal = await readJournal(JOURNAL_PATH);
  const openPredictions = journal.predictions.filter((x) => x.outcome === 'open');
  
  if (openPredictions.length === 0) {
    console.log(`[resolver] 0 çözüldü: 0 hedef, 0 stop | 0 açık`);
    return;
  }

  let targetHitCount = 0;
  let stopHitCount = 0;
  let resolvedCount = 0;
  const now = new Date();

  for (const pred of openPredictions) {
    let series = null;
    try {
      if (pred.market === 'us') {
        const data = await fetchYahooSeries(pred.symbol);
        if (data && !data.__error) {
          series = data.series;
        }
      } else if (pred.market === 'bist') {
        const data = await fetchYahooSeries(pred.symbol + '.IS');
        if (data && !data.__error) {
          series = data.series;
        }
      } else if (pred.market === 'crypto') {
        let binSym = pred.symbol.toUpperCase();
        if (!binSym.endsWith('USDT')) {
          binSym += 'USDT';
        }
        series = await fetchBinanceSeries(binSym);
      }
    } catch (err) {
      console.warn(`[resolver] warning: ${pred.market}:${pred.symbol} serisi çekilemedi: ${err.message}`);
    }

    if (!series || !series.closes || series.closes.length === 0) {
      console.warn(`[resolver] warning: ${pred.market}:${pred.symbol} için veri serisi alınamadı, atlanıyor.`);
      continue;
    }

    const nextPred = resolveOne(pred, series, now);
    if (nextPred.outcome !== 'open') {
      resolvedCount++;
      if (nextPred.outcome === 'target-hit' || nextPred.outcome === 'expired-win') {
        targetHitCount++;
      } else {
        stopHitCount++;
      }
      applyResolvedPrediction(journal, nextPred);
    }
  }

  if (resolvedCount > 0) {
    const learningSummary = buildLearningSummary(journal, new Date().toISOString());
    journal.learningRules = learningSummary.learningRules;
    journal.reviewQueue = learningSummary.reviewQueue;
    await writeJournal(JOURNAL_PATH, journal);
  }

  const currentOpenCount = journal.predictions.filter((x) => x.outcome === 'open').length;
  console.log(`[resolver] ${resolvedCount} çözüldü: ${targetHitCount} hedef, ${stopHitCount} stop | ${currentOpenCount} açık`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Resolver hatası:', err.message);
    process.exit(1);
  });
}

module.exports = {
  main,
  resolveOne,
  applyResolvedPrediction,
};
