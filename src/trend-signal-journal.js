// trend-signals-v1 sanal işlem defteri: günlük sinyali kaydeder, girişi sinyalden sonraki ilk seans açılışından
// doldurur ve stop / hedef / trend / süre çıkışını geçmiş testiyle aynı kuralla izler. Kayıt api_cache'te tutulur.
'use strict';
const { STRATEGY, DEFAULTS, prepare, planFromEntry, advanceTrade, evaluateLatest } = require('./trend-signals');
const { roundTripCost } = require('./costs');
const universe = require('./bist-universe.json');

const JOURNAL_KEY = 'trend_signal_journal_v1';
const BACKTEST_KEY = 'trend_backtest_v1';
const DAY = 86400000;
const PENDING_DAYS = 7;
const NEW_SIGNAL_DAYS = 3;
const FUTURES = new Set(universe.viopStockFutures.symbols);

// Short yalnız ABD, kripto ve VİOP'ta vadelisi olan BIST paylarında işlemdir; diğer BIST paylarında azalt/çık uyarısıdır.
function shortModeFor(market, symbol) {
  return market === 'bist' && !FUTURES.has(symbol) ? 'reduce' : 'trade';
}

// Geçmiş testinde bu piyasa × yön × kurulumun sonucu. Kanıtlı: en az 30 işlem ve kâr faktörü ≥ 1,2.
function evidenceFor(backtest, market, direction, setup) {
  const s = backtest && backtest.summary && backtest.summary[market + ':' + direction + ':' + setup];
  if (!s || !s.trades) return { status: 'untested' };
  return { status: s.trades >= 30 && s.profitFactor >= 1.2 ? 'proven' : 'weak', trades: s.trades, winRate: s.winRate, avgR: s.avgR, profitFactor: s.profitFactor };
}

const round = (value, digits = 4) => Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
function finish(record, trade, ind) {
  const out = Object.assign({}, record, { lastDate: ind.dates[trade.lastIndex], lastClose: ind.closes[trade.lastIndex] });
  if (trade.status === 'closed') {
    Object.assign(out, { status: 'closed', exitDate: trade.exitDate, exit: round(trade.exit, 6), exitReason: trade.exitReason, r: round(trade.r, 3), returnPct: round(trade.returnPct, 5) });
  } else {
    const sign = record.direction === 'long' ? 1 : -1;
    out.status = 'open';
    out.unrealizedR = round(sign * (out.lastClose - record.entry) / record.risk, 3);
  }
  return out;
}

// assets: [{ market, symbol, bars }] — yalnız tamamlanmış günler. journal: { records: [] }.
function processJournal(journal, assets, { now = new Date().toISOString(), backtest = null, config = DEFAULTS } = {}) {
  const nowMs = Date.parse(now);
  const records = ((journal && journal.records) || []).map((r) => Object.assign({}, r));
  const byAsset = new Map();
  records.forEach((r) => { const key = r.market + ':' + r.symbol; if (!byAsset.has(key)) byAsset.set(key, []); byAsset.get(key).push(r); });
  const latest = [];
  for (const asset of assets) {
    if (!asset || !asset.bars) continue;
    const ind = prepare(asset.bars);
    const last = ind.closes.length - 1;
    if (last < 1) continue;
    const cost = roundTripCost(asset.market);
    const own = byAsset.get(asset.market + ':' + asset.symbol) || [];
    for (const record of own) {
      const index = records.indexOf(record);
      if (record.status === 'pending') {
        const entryIndex = ind.dates.findIndex((d) => d > record.signalDate);
        if (entryIndex < 0) {
          if (nowMs - Date.parse(record.signalDate + 'T00:00:00Z') > PENDING_DAYS * DAY) records[index] = Object.assign({}, record, { status: 'expired', updatedAt: now });
          continue;
        }
        const plan = planFromEntry(record.direction, ind.opens[entryIndex], record.atr, config);
        const opened = Object.assign({}, record, { entryDate: ind.dates[entryIndex], entry: round(plan.entry, 6), stop: round(plan.stop, 6), target: round(plan.target, 6), risk: round(plan.risk, 6) });
        const trade = advanceTrade({ direction: record.direction, entry: plan.entry, stop: plan.stop, target: plan.target, risk: plan.risk, entryIndex }, ind, last, config, cost);
        records[index] = Object.assign(finish(opened, trade, ind), { updatedAt: now });
      } else if (record.status === 'open') {
        const entryIndex = ind.dates.indexOf(record.entryDate), lastIndex = ind.dates.indexOf(record.lastDate);
        if (entryIndex < 0 || lastIndex < 0 || lastIndex >= last) continue;
        const trade = advanceTrade({ direction: record.direction, entry: record.entry, stop: record.stop, target: record.target, risk: record.risk, entryIndex, lastIndex }, ind, last, config, cost);
        records[index] = Object.assign(finish(record, trade, ind), { updatedAt: now });
      }
    }
    const shortMode = shortModeFor(asset.market, asset.symbol);
    const state = evaluateLatest(asset.bars, { market: asset.market, shortMode, config });
    latest.push({ market: asset.market, symbol: asset.symbol, status: state.status, regime: state.regime || null, date: state.date || null, action: state.action || null });
    if (state.status !== 'signal') continue;
    const id = [STRATEGY, asset.market, asset.symbol, state.date, state.direction].join(':');
    if (records.some((r) => r.id === id)) continue;
    const busy = records.some((r) => r.market === asset.market && r.symbol === asset.symbol && (r.status === 'pending' || r.status === 'open'));
    if (state.action !== 'reduce' && busy) continue;
    records.push({
      id, strategy: STRATEGY, market: asset.market, symbol: asset.symbol, direction: state.direction, action: state.action, setup: state.setup, shortMode,
      signalDate: state.date, signalClose: round(state.close, 6), atr: round(state.atr, 6), level: round(state.level, 6), indicativePlan: { stop: round(state.indicativePlan.stop, 6), target: round(state.indicativePlan.target, 6) },
      evidence: evidenceFor(backtest, asset.market, state.direction, state.setup), costRoundTrip: state.costRoundTrip,
      status: state.action === 'reduce' ? 'advisory' : 'pending', createdAt: now, updatedAt: now,
    });
  }
  return { journal: { schemaVersion: 1, strategy: STRATEGY, updatedAt: now, records }, latest };
}

function liveStats(records) {
  const closed = records.filter((r) => r.status === 'closed' && Number.isFinite(r.r));
  const group = (list) => list.length ? { trades: list.length, winRate: round(list.filter((r) => r.r > 0).length / list.length, 3), totalR: round(list.reduce((a, r) => a + r.r, 0), 2), avgR: round(list.reduce((a, r) => a + r.r, 0) / list.length, 3) } : { trades: 0 };
  const out = { all: group(closed) };
  for (const market of ['us', 'bist', 'crypto']) for (const direction of ['long', 'short']) out[market + ':' + direction] = group(closed.filter((r) => r.market === market && r.direction === direction));
  return out;
}

// Panelde gösterilecek özet: yeni sinyaller, açık işlemler, kapananlar, uyarılar, geçmiş testi ve canlı sonuç.
function buildView(journal, latest, { now = new Date().toISOString(), backtest = null, persisted = true } = {}) {
  const nowMs = Date.parse(now), records = (journal && journal.records) || [];
  const recent = (r) => nowMs - Date.parse(r.signalDate + 'T00:00:00Z') <= NEW_SIGNAL_DAYS * DAY;
  const byNewest = (a, b) => String(b.signalDate).localeCompare(String(a.signalDate));
  const evidence = backtest && backtest.summary ? Object.fromEntries(['us', 'bist', 'crypto'].flatMap((m) => ['long', 'short'].flatMap((d) => ['breakout', 'pullback'].map((s) => [m + ':' + d + ':' + s, evidenceFor(backtest, m, d, s)])))) : null;
  return {
    strategy: STRATEGY, generatedAt: now, persisted,
    rules: { stopAtr: DEFAULTS.stopAtr, rewardRisk: DEFAULTS.rewardRisk, maxHoldBars: DEFAULTS.maxHoldBars, breakoutBars: DEFAULTS.breakoutBars },
    newSignals: records.filter((r) => r.action !== 'reduce' && recent(r) && (r.status === 'pending' || r.status === 'open')).sort(byNewest),
    open: records.filter((r) => r.status === 'open').sort(byNewest),
    pending: records.filter((r) => r.status === 'pending').sort(byNewest),
    closed: records.filter((r) => r.status === 'closed').sort((a, b) => String(b.exitDate).localeCompare(String(a.exitDate))).slice(0, 40),
    advisories: records.filter((r) => r.status === 'advisory' && recent(r)).sort(byNewest),
    live: liveStats(records),
    backtest: backtest ? { generatedAt: backtest.generatedAt, period: backtest.period, assets: backtest.universe && backtest.universe.assets, summary: Object.fromEntries(Object.entries(backtest.summary || {}).filter(([k]) => k.split(':').length <= 2)) } : null,
    evidence,
    coverage: { assets: latest.length, regimes: latest.reduce((acc, x) => { const k = x.market + ':' + (x.regime || x.status); acc[k] = (acc[k] || 0) + 1; return acc; }, {}) },
    futuresUniverse: { source: universe.viopStockFutures.source, sourceDate: universe.viopStockFutures.sourceDate, count: FUTURES.size },
  };
}

// fetch-all içinden: kaydı okur, işler, karşılaştırmalı yazar ve görünümü snapshot'a ekler.
async function processTrendSignals(snapshot, assets, { db = require('./db'), now = new Date().toISOString() } = {}) {
  const backtestRow = await db.getCache(BACKTEST_KEY).catch(() => null);
  const backtest = backtestRow && backtestRow.value || null;
  let persisted = false, result = null;
  for (let attempt = 0; attempt < 2 && !persisted; attempt++) {
    const row = await db.getCache(JOURNAL_KEY, { strict: true }).catch(() => undefined);
    if (row === undefined) break;
    result = processJournal(row && row.value, assets, { now, backtest });
    try { await db.compareAndSetCache(JOURNAL_KEY, result.journal, row ? row.revision : null); persisted = true; }
    catch (error) { if (error.statusCode !== 409) break; }
  }
  if (!result) result = processJournal(null, assets, { now, backtest });
  snapshot.trendSignals = buildView(result.journal, result.latest, { now, backtest, persisted });
  return snapshot.trendSignals;
}

module.exports = { JOURNAL_KEY, BACKTEST_KEY, shortModeFor, evidenceFor, processJournal, buildView, liveStats, processTrendSignals };
