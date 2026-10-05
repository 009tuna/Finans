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

const RESOLVER_VERSION = 'daily-bar-resolver-v3';
const TIMEZONES = { us: 'America/New_York', bist: 'Europe/Istanbul', crypto: 'UTC' };
function localDateAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function zonedInstant(dateStr, hour, minute, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  let instant = wanted;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
    const match = parts.timeZoneName.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
    instant = wanted - offsetMinutes * 60000;
  }
  return new Date(instant);
}
function barEndFor(market, dateStr) {
  if (market === 'crypto') {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return { at: d, reason: 'crypto_utc_day_complete' };
  }
  if (market === 'us') return { at: zonedInstant(dateStr, 16, 0, TIMEZONES.us), reason: 'us_regular_session_close' };
  if (market === 'bist') return { at: zonedInstant(dateStr, 18, 10, TIMEZONES.bist), reason: 'bist_conservative_session_close' };
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { at: d, reason: 'unknown_market_utc_day_close' };
}
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }

// resolveOne(prediction, series, now) -> güncellenmiş prediction (veya değişiklik yoksa aynısı)
// series: { dates:[], highs:[], lows:[], closes:[] } — createdAt SONRASI günler
function resolveOne(prediction, series, now) {
  if(require('../public/structural-records').isStructural(prediction)) {
    const observation=require('./structural-data').normalizeObservation({series,market:prediction.market,symbol:prediction.symbol,sourceSymbol:prediction.plan.sourceSymbol,provider:prediction.sourceEvidence.provider,currency:prediction.plan.currency,priceBasis:prediction.plan.priceBasis},now.toISOString());
    return require('./paper-trade-engine').advancePaperTrade(prediction,observation,{preparedAt:now.toISOString()});
  }
  if (!prediction || prediction.outcome !== 'open') {
    return prediction;
  }
  if (!series || !Array.isArray(series.dates) || !series.dates.length || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return prediction;
  }

  const entry = prediction.entry;
  const target = prediction.target;
  const stop = prediction.stop;
  const horizonDays = Number.isInteger(prediction.horizonDays) && prediction.horizonDays > 0 ? prediction.horizonDays : 30;
  if (typeof prediction.createdAt !== 'string') return prediction;
  const created = new Date(prediction.createdAt);
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(target) || !Number.isFinite(stop)) return prediction;
  const timeZone = TIMEZONES[prediction.market];
  // Without a provider calendar/timezone contract, do not score unknown markets.
  if (!timeZone) return prediction;
  if (series.dateBasis === 'exchange_timezone' && series.timeZone !== timeZone) return prediction;
  const createdDateStr = localDateAt(created, timeZone);
  if (series.asOfDate != null && !validDate(series.asOfDate)) return prediction;
  const nowDateStr = localDateAt(now, timeZone);
  if (series.asOfDate != null && series.asOfDate > nowDateStr) return prediction;
  const asOfDateStr = series.asOfDate || nowDateStr;
  const rows = [];
  for (let i = 0; i < series.dates.length; i++) {
    const dateStr = series.dates[i];
    // Daily OHLC range has no intraday ordering. Skip the prediction's local
    // detection day and today's local date, even if the nominal close passed.
    if (!validDate(dateStr) || dateStr <= createdDateStr || dateStr >= nowDateStr || dateStr > asOfDateStr) continue;
    const high = series.highs && series.highs[i], low = series.lows && series.lows[i], close = series.closes && series.closes[i];
    if (![high, low, close].every(Number.isFinite) || high < low || high < close || low > close || close <= 0) continue;
    const end = barEndFor(prediction.market, dateStr);
    const completeFlag = Array.isArray(series.barComplete) ? series.barComplete[i] : series.barComplete;
    const complete = end.at.getTime() <= now.getTime() && completeFlag !== false;
    if (!complete) continue;
    rows.push({ dateStr, high, low, close, end, complete, rangeVerified: !Array.isArray(series.rangeVerified) || series.rangeVerified[i] !== false });
  }
  rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const uniqueDates = new Set();
  const validRows = rows.filter((r) => { if (uniqueDates.has(r.dateStr)) return false; uniqueDates.add(r.dateStr); return true; });
  let resolved = null;
  for (const row of validRows) {
    const daysPassed = diffDays(row.dateStr, createdDateStr);
    // Range hits on the final horizon day count; later bars are outside the prediction window.
    if (row.rangeVerified && daysPassed <= horizonDays) {
      const hitTarget = row.high >= target, hitStop = row.low <= stop;
      if (hitTarget || hitStop) {
        const ambiguous = hitTarget && hitStop;
        resolved = { outcome: ambiguous ? 'ambiguous' : hitStop ? 'stop-hit' : 'target-hit', closePrice: ambiguous ? null : hitStop ? stop : target, barDate: row.dateStr, barEndAt: row.end.at.toISOString(),
          outcomeEvidence: ambiguous ? 'ambiguous_bar' : 'daily_bar_range', ...(ambiguous ? { possibleOutcomes: ['target-hit', 'stop-hit'] } : {}),
          expiryReason: null };
        break;
      }
    }
    if (daysPassed >= horizonDays && row.complete) {
      resolved = { outcome: row.close > entry ? 'expired-win' : 'expired-loss', closePrice: row.close, barDate: row.dateStr, barEndAt: row.end.at.toISOString(),
        outcomeEvidence: 'completed_daily_close', expiryReason: row.end.reason };
      break;
    }
  }

  if (resolved) {
    const resultPct = resolved.closePrice == null ? null : Number(((resolved.closePrice - entry) / entry * 100).toFixed(1));
    return Object.assign({}, prediction, {
      outcome: resolved.outcome,
      resolvedAt: now.toISOString(),
      barDate: resolved.barDate,
      barEndAt: resolved.barEndAt,
      resolverVersion: RESOLVER_VERSION,
      outcomeEvidence: resolved.outcomeEvidence,
      ...(resolved.possibleOutcomes ? { possibleOutcomes: resolved.possibleOutcomes } : {}),
      ...(resolved.expiryReason ? { expiryReason: resolved.expiryReason } : {}),
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
  const journal=await readJournal(JOURNAL_PATH);
  const {collectObservations}=require('./structural-pipeline');
  const observations=await collectObservations({},journal,new Date().toISOString());
  const updated=await require('./structural-journal').createStructuralJournal()(observations);
  const score=require('../public/structural-records').buildScorecard(updated.predictions);
  console.log('[resolver] yapısal net sonuçlar:',score.verified,'| bekleyen:',score.exclusions.pending,'| kanıt eksik:',score.exclusions.incomplete);
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
  RESOLVER_VERSION,
  barEndFor,
};
