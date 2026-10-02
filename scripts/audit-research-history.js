'use strict';
// Read-only historical audit. Never resolves, records, publishes or rewrites source data.
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { createClient } = require('@supabase/supabase-js');
const { readJournal, buildPredictionScorecard } = require('../src/decision-journal');
const { readLedger, scorecard } = require('../src/research-ledger');
const { windowsFetch } = require('../src/windows-fetch');
let client;
async function rows(table, columns, order) {
  if (!client) client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { fetch: process.platform === 'win32' ? windowsFetch : fetch },
  });
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from(table).select(columns).order(order, { ascending: true }).range(offset, offset + 99);
    if (error) throw error;
    all.push(...data);
    if (data.length < 100) return all;
  }
}
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const count = (a, fn) => a.reduce((out, x) => { const key = fn(x); out[key] = (out[key] || 0) + 1; return out; }, {});
const range = a => ({ first: a.filter(Boolean).sort()[0] || null, last: a.filter(Boolean).sort().at(-1) || null });
const duplicates = (a, fn) => Object.entries(count(a, fn)).filter(([, n]) => n > 1);
function metrics(a) {
  const closed = a.filter(p => p.outcome && p.outcome !== 'open');
  const measured = closed.filter(p => p.outcomeEvidence !== 'ambiguous_bar' &&
    ['target-hit', 'stop-hit', 'expired-win', 'expired-loss'].includes(p.outcome));
  const returns = measured.map(p => p.resultPct).filter(Number.isFinite);
  const card = buildPredictionScorecard({ predictions: a });
  const ordered = [...returns].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return { total: a.length, closed: closed.length, open: a.length - closed.length,
    outcomes: count(a, p => p.outcome || 'missing'),
    wins: card.wins, losses: card.losses, decisive: card.decisive,
    ambiguous: card.ambiguous, unscored: card.unscored,
    winRatePct: card.decisive ? card.wins / card.decisive * 100 : null,
    closedWithoutOutcomeEvidence: closed.filter(p => !p.outcomeEvidence).length,
    positiveGrossReturns: returns.filter(x => x > 0).length,
    missingReturns: measured.length - returns.length, resultSampleSize: returns.length, meanGrossPct: mean(returns),
    medianGrossPct: ordered.length ? (ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2) : null,
    symbols: new Set(a.map(p => p.symbol)).size };
}
async function main() {
  const now = new Date().toISOString();
  const [reports, history, snapshots, j, ledger, snapshot] = await Promise.all([
    rows('reports', 'date,base,ai', 'date'), rows('market_history', 'date,generated_at,scores,prices', 'date'),
    rows('market_snapshots', 'generated_at', 'generated_at'), readJournal(path.resolve(__dirname, '../data/journal.json')),
    readLedger(), db.getLatestSnapshot({ strict: true }),
  ]);
  const p = j.predictions;
  const byMarket = {}, byMonth = {}, byScore = {};
  for (const market of ['us', 'bist', 'crypto']) byMarket[market] = metrics(p.filter(x => x.market === market));
  for (const month of [...new Set(p.map(x => x.createdAt?.slice(0, 7)))].sort()) byMonth[month] = metrics(p.filter(x => x.createdAt?.startsWith(month)));
  for (const label of [...new Set(p.map(x => x.label))]) byScore[label] = metrics(p.filter(x => x.label === label));
  const reportRows = reports.map(r => ({ date: r.date, baseGeneratedAt: r.base?.generatedAt, baseRunId: r.base?.runId,
    aiGeneratedAt: r.ai?.generatedAt, aiModel: r.ai?.research?.model || r.ai?.model || (r.ai ? 'legacy-unversioned' : null),
    aiRunId: r.ai?.runId, quality: r.base?.quality?.status || 'legacy-unlabelled',
    matching: !!r.ai?.runId && r.ai.runId === r.base?.runId && r.ai.snapshotId === r.base?.snapshotId,
    sourceCount: r.ai?.research?.sources?.length || 0, events: r.ai?.research?.events?.length || 0,
    calendarCoverage: r.base?.calendar?.coverage,
    macro: r.ai?.macroSummary || null, commentary: r.ai?.commentary || null,
    focus: r.ai?.todayFocus || null,
    legacyEvidence: r.ai && !r.ai.research ? { worldNews: r.ai.worldNews || [], signals: r.ai.macroSignalOverlay?.signals || [],
      weeklyOutlook: r.ai.weeklyOutlook || null, weeklyRetro: r.ai.weeklyRetro || null } : null,
    research: r.ai?.research ? {
      sources: r.ai.research.sources, coverage: r.ai.research.coverage, events: r.ai.research.events,
      forecasts: r.ai.research.forecasts, unresolvedQuestions: r.ai.research.unresolvedQuestions } : null,
  }));
  const gaps = history.slice(1).map((x, i) => ({ after: history[i].date, before: x.date,
    calendarDaysMissing: Math.round((Date.parse(x.date) - Date.parse(history[i].date)) / 86400000) - 1 })).filter(x => x.calendarDaysMissing > 3);
  const result = { auditedAt: now, methodology: 'Read-only full paginated Supabase reports/history/snapshot timestamps; current journal and immutable research ledger. Recognized nonambiguous closed outcomes only enter win rates and gross means. Legacy results without outcome evidence remain distinguishable; timestamp warnings are reported separately. Reads are not one atomic database snapshot. Returns are unweighted gross prediction outcomes, not portfolio or GPT model performance.',
    coverage: { reports: { count: reports.length, ...range(reports.map(x => x.date)) }, history: { count: history.length, ...range(history.map(x => x.date)), gaps },
      snapshots: { count: snapshots.length, ...range(snapshots.map(x => x.generated_at)) },
      predictions: { ...range(p.map(x => x.createdAt)), distinctRecordedDays: new Set(p.map(x => x.createdAt?.slice(0, 10))).size } },
    predictions: { ...metrics(p), byMarket, byMonth, byLabel: byScore, bySource: count(p, x => x.source || 'missing'),
      duplicateIds: duplicates(p, x => x.id), invalidLevels: p.filter(x => !(Number.isFinite(x.entry) && x.entry > 0 && x.stop < x.entry && x.target > x.entry)).map(x => x.id),
      unknownOutcomes: p.filter(x => !['open', 'target-hit', 'stop-hit', 'expired-win', 'expired-loss', 'ambiguous'].includes(x.outcome)).map(x => x.id),
      futureResolved: p.filter(x => x.resolvedAt && x.resolvedAt > now).map(x => ({ id: x.id, outcome: x.outcome, resolvedAt: x.resolvedAt })),
      beforeCreated: p.filter(x => x.resolvedAt && x.resolvedAt <= x.createdAt).map(x => x.id),
      expectedReturnErrors: p.filter(x => Number.isFinite(x.resultPct) && Number.isFinite(x.closePrice) && Math.abs(x.resultPct - ((x.closePrice - x.entry) / x.entry * 100)) > 0.11).map(x => x.id),
      withoutVersion: p.filter(x => !x.modelVersion && !x.strategyVersion).length,
      expiredStillOpen: p.filter(x => x.outcome === 'open' && Date.parse(x.createdAt) + (x.horizonDays || 30) * 86400000 < Date.parse(now)).map(x => x.id),
      allItems: p.map(x => ({ id: x.id, symbol: x.symbol, market: x.market, source: x.source, label: x.label, score: x.score, entry: x.entry, target: x.target, stop: x.stop, createdAt: x.createdAt, resolvedAt: x.resolvedAt, outcome: x.outcome, resultPct: x.resultPct, outcomeEvidence: x.outcomeEvidence, modelVersion: x.modelVersion, strategyVersion: x.strategyVersion, resolverVersion: x.resolverVersion, closePrice: x.closePrice })) },
    research: { runs: ledger.value.runs.length, models: count(ledger.value.runs, x => x.research.model),
      ...range(ledger.value.runs.map(x => x.recordedAt)), scorecard: scorecard(ledger.value),
      duplicateRunIds: duplicates(ledger.value.runs, x => x.runId),
      published: ledger.value.runs.map(x => ({ runId: x.runId, recordedAt: x.recordedAt, research: x.research })) },
    currentData: { generatedAt: snapshot.generatedAt, errors: snapshot.errors, markets: Object.fromEntries(['us', 'bist', 'crypto'].map(m => [m, {
      count: snapshot[m]?.length || 0, quoteTimes: range((snapshot[m] || []).map(x => x.quoteTime)),
      missingQuoteTime: (snapshot[m] || []).filter(x => !x.quoteTime).length,
      peAvailable: (snapshot[m] || []).filter(x => Number.isFinite(x.pe)).length,
      marketCapAvailable: (snapshot[m] || []).filter(x => Number.isFinite(x.marketCap)).length,
      invalidPrice: (snapshot[m] || []).filter(x => !Number.isFinite(x.price) || x.price <= 0).map(x => x.symbol),
    }])) },
    reports: reportRows,
    historyRows: history,
  };
  const auditDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const outputIndex = process.argv.indexOf('--out');
  if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error('--out requires a file path');
  const out = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.resolve(__dirname, '../docs/research-audit/' + auditDay + '-evidence.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  const { reports: omitted, historyRows: omittedHistory, ...summary } = result;
  summary.predictions = { ...summary.predictions, allItems: undefined };
  summary.research = { ...summary.research, published: undefined };
  console.log(JSON.stringify(summary, null, 2));
  console.error('Evidence: ' + out);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { metrics, main };
