// Trend sinyal defteri (v2): long kırılımı sanal işlem olarak kaydeder, girişi sinyalden sonraki ilk seans açılışından
// doldurur ve stop / hedef / trend / süre çıkışını geçmiş testiyle aynı kuralla izler. Düşüş yönündeki tetikler
// "uzak dur / çık" uyarısıdır; geri çekilmeler yalnız izlenir. Kayıt api_cache'te tutulur.
'use strict';
const { STRATEGY, DEFAULTS, prepare, planFromEntry, positionSize, advanceTrade, evaluateLatest } = require('./trend-signals');
const { roundTripCost } = require('./costs');

const JOURNAL_KEY = 'trend_signal_journal_v1';
const BACKTEST_KEY = 'trend_backtest_v2';
const DAY = 86400000;
const PENDING_DAYS = 7;
const NEW_SIGNAL_DAYS = 3;
const isTradeRule = (record) => record.direction === 'long' && record.setup === 'breakout';

// Geçmiş testinde bu piyasanın long kırılım sonucu. Kanıtlı: en az 30 işlem ve kâr faktörü ≥ 1,2.
function evidenceFor(backtest, market) {
  const s = backtest && backtest.summary && backtest.summary[market + ':long:breakout'];
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
const sizingOf = (sizing) => sizing ? { weight: round(sizing.weight, 4), stopPct: round(sizing.stopPct, 4), riskPerTrade: sizing.riskPerTrade, capped: sizing.capped } : null;

// assets: [{ market, symbol, bars }] — yalnız tamamlanmış günler. journal: { records: [] }.
function processJournal(journal, assets, { now = new Date().toISOString(), backtest = null, config = DEFAULTS } = {}) {
  const nowMs = Date.parse(now);
  // v1'den kalan ve v2'de işlem sayılmayan (short, geri çekilme) bekleyen kayıtlar dolmadan iptal edilir.
  const records = ((journal && journal.records) || []).map((r) => r.status === 'pending' && !isTradeRule(r)
    ? Object.assign({}, r, { status: 'cancelled', cancelReason: 'strategy-v2', updatedAt: now }) : Object.assign({}, r));
  const byAsset = new Map();
  records.forEach((r, i) => { const key = r.market + ':' + r.symbol; if (!byAsset.has(key)) byAsset.set(key, []); byAsset.get(key).push(i); });
  const latest = [];
  for (const asset of assets) {
    if (!asset || !asset.bars) continue;
    const ind = prepare(asset.bars);
    const last = ind.closes.length - 1;
    if (last < 1) continue;
    const cost = roundTripCost(asset.market);
    for (const index of byAsset.get(asset.market + ':' + asset.symbol) || []) {
      const current = records[index];
      if (current.status === 'pending') {
        const entryIndex = ind.dates.findIndex((d) => d > current.signalDate);
        if (entryIndex < 0) {
          if (nowMs - Date.parse(current.signalDate + 'T00:00:00Z') > PENDING_DAYS * DAY) records[index] = Object.assign({}, current, { status: 'expired', updatedAt: now });
          continue;
        }
        const plan = planFromEntry(current.direction, ind.opens[entryIndex], current.atr, config);
        const opened = Object.assign({}, current, { entryDate: ind.dates[entryIndex], entry: round(plan.entry, 6), stop: round(plan.stop, 6), target: round(plan.target, 6), risk: round(plan.risk, 6),
          sizing: sizingOf(positionSize(plan.entry, plan.stop, config)) });
        const trade = advanceTrade({ direction: current.direction, entry: plan.entry, stop: plan.stop, target: plan.target, risk: plan.risk, entryIndex }, ind, last, config, cost);
        records[index] = Object.assign(finish(opened, trade, ind), { updatedAt: now });
      } else if (current.status === 'open') {
        const entryIndex = ind.dates.indexOf(current.entryDate), lastIndex = ind.dates.indexOf(current.lastDate);
        if (entryIndex < 0 || lastIndex < 0 || lastIndex >= last) continue;
        const trade = advanceTrade({ direction: current.direction, entry: current.entry, stop: current.stop, target: current.target, risk: current.risk, entryIndex, lastIndex }, ind, last, config, cost);
        records[index] = Object.assign(finish(current, trade, ind), { updatedAt: now });
      }
    }
    const state = evaluateLatest(asset.bars, { market: asset.market, config });
    latest.push({ market: asset.market, symbol: asset.symbol, status: state.status, regime: state.regime || null, date: state.date || null,
      setup: state.setup || null, aboveSma200: state.aboveSma200 == null ? null : state.aboveSma200, toBreakout: round(state.toBreakout, 4) });
    if (state.status !== 'signal' && state.status !== 'avoid') continue;
    const id = [STRATEGY, asset.market, asset.symbol, state.date, state.direction].join(':');
    if (records.some((r) => r.id === id)) continue;
    if (state.status === 'signal' && records.some((r) => r.market === asset.market && r.symbol === asset.symbol && (r.status === 'pending' || r.status === 'open'))) continue;
    records.push({
      id, strategy: STRATEGY, market: asset.market, symbol: asset.symbol, direction: state.direction, action: state.action, setup: state.setup,
      signalDate: state.date, signalClose: round(state.close, 6), atr: round(state.atr, 6), level: round(state.level, 6),
      ...(state.status === 'signal' ? { indicativePlan: { stop: round(state.indicativePlan.stop, 6), target: round(state.indicativePlan.target, 6) }, sizing: sizingOf(state.sizing),
        evidence: evidenceFor(backtest, asset.market), costRoundTrip: state.costRoundTrip } : {}),
      status: state.status === 'signal' ? 'pending' : 'advisory', createdAt: now, updatedAt: now,
    });
  }
  return { journal: { schemaVersion: 1, strategy: STRATEGY, updatedAt: now, records }, latest };
}

function liveStats(records) {
  const closed = records.filter((r) => r.status === 'closed' && Number.isFinite(r.r));
  const group = (list) => list.length ? { trades: list.length, winRate: round(list.filter((r) => r.r > 0).length / list.length, 3), totalR: round(list.reduce((a, r) => a + r.r, 0), 2), avgR: round(list.reduce((a, r) => a + r.r, 0) / list.length, 3) } : { trades: 0 };
  const out = { all: group(closed) };
  for (const market of ['us', 'bist', 'crypto']) out[market] = group(closed.filter((r) => r.market === market));
  return out;
}

// Koruma katmanı: her piyasada 200 günlük ortalamanın üstündeki varlık payı.
function protectionLayer(latest) {
  const out = {};
  for (const market of ['us', 'bist', 'crypto']) {
    const list = latest.filter((x) => x.market === market && x.aboveSma200 != null);
    const above = list.filter((x) => x.aboveSma200).length;
    const share = list.length ? above / list.length : null;
    out[market] = { total: list.length, above, share: round(share, 3), state: share == null ? 'unknown' : share >= 0.6 ? 'healthy' : share >= 0.4 ? 'mixed' : 'weak' };
  }
  return out;
}

// Panelde gösterilecek özet.
function buildView(journal, latest, { now = new Date().toISOString(), backtest = null, persisted = true } = {}) {
  const nowMs = Date.parse(now), records = (journal && journal.records) || [];
  const recent = (r) => nowMs - Date.parse(r.signalDate + 'T00:00:00Z') <= NEW_SIGNAL_DAYS * DAY;
  const byNewest = (a, b) => String(b.signalDate).localeCompare(String(a.signalDate));
  const trades = records.filter(isTradeRule);
  const open = trades.filter((r) => r.status === 'open').sort(byNewest);
  return {
    strategy: STRATEGY, generatedAt: now, persisted,
    rules: { stopAtr: DEFAULTS.stopAtr, rewardRisk: DEFAULTS.rewardRisk, maxHoldBars: DEFAULTS.maxHoldBars, breakoutBars: DEFAULTS.breakoutBars,
      riskPerTrade: DEFAULTS.riskPerTrade, maxWeight: DEFAULTS.maxWeight, maxPositions: DEFAULTS.maxPositions },
    newSignals: trades.filter((r) => recent(r) && (r.status === 'pending' || r.status === 'open')).sort(byNewest),
    open,
    pending: trades.filter((r) => r.status === 'pending').sort(byNewest),
    closed: trades.filter((r) => r.status === 'closed').sort((a, b) => String(b.exitDate).localeCompare(String(a.exitDate))).slice(0, 40),
    avoid: records.filter((r) => r.status === 'advisory' && r.action === 'avoid' && recent(r)).sort(byNewest),
    watch: latest.filter((x) => x.status === 'watch-pullback'),
    exposure: { openPositions: open.length, weight: round(open.reduce((a, r) => a + ((r.sizing && r.sizing.weight) || 0), 0), 3) },
    protection: protectionLayer(latest),
    live: liveStats(trades),
    evidence: backtest ? Object.fromEntries(['us', 'bist', 'crypto'].map((m) => [m, evidenceFor(backtest, m)])) : null,
    backtest: backtest ? { generatedAt: backtest.generatedAt, period: backtest.period, assets: backtest.universe && backtest.universe.assets, summary: Object.fromEntries(Object.entries(backtest.summary || {}).filter(([k]) => k.split(':').length <= 2)) } : null,
    assets: latest,
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

module.exports = { JOURNAL_KEY, BACKTEST_KEY, evidenceFor, processJournal, buildView, liveStats, protectionLayer, processTrendSignals };
