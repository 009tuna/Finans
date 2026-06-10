// Günlük rapor — DETERMİNİSTİK TEMEL katman (LLM gerektirmez).
// data/latest.json + Finnhub takvimlerinden teknik özet, fırsatlar, sinyaller ve
// bu haftanın katalizör takvimini (ekonomik veri + bilanço + şirket haberi) çıkarır → data/report/base.json
// AI/makro/senaryo katmanı ayrı (data/report/ai.json) günlük Claude rutiniyle üretilir.
'use strict';
const fs = require('fs');
const path = require('path');
const { fetchEconomic, fetchEarnings, fetchCompanyNews } = require('./calendar');
const { getLatestSnapshot, saveReport } = require('./db');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const REPORT_DIR = path.join(DATA, 'report');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function buildBaseReport() {
  const cfg = loadConfig();
  const token = cfg.finnhubToken;
  // Snapshot Supabase'den (latest.json artık yazılmıyor); yerel dev için dosya fallback.
  let snap = await getLatestSnapshot();
  if (!snap) {
    try { snap = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8')); } catch (_) {}
  }
  if (!snap) throw new Error('Snapshot yok (Supabase market_snapshots boş ve latest.json bulunamadı). Önce node src/fetch-all.js çalıştırın.');
  const all = []
    .concat((snap.us || []).map((x) => ({ market: 'ABD', ...x })))
    .concat((snap.bist || []).map((x) => ({ market: 'BIST', ...x })))
    .concat((snap.crypto || []).map((x) => ({ market: 'Kripto', ...x })))
    .filter((x) => x.analysis && x.analysis.score != null);

  const avg = all.length ? Math.round(all.reduce((a, x) => a + x.analysis.score, 0) / all.length) : 0;
  const buys = all.filter((x) => x.analysis.tone === 'strong-buy' || x.analysis.tone === 'buy').length;
  const gainers = all.filter((x) => typeof x.changePct === 'number' && x.changePct > 0).length;
  const sentLabel = avg >= 60 ? 'Pozitif' : avg >= 45 ? 'Nötr' : 'Temkinli';

  const marketSummary = (arr, name) => {
    const list = arr.filter((x) => x.analysis && x.analysis.score != null);
    if (!list.length) return { name, count: 0 };
    const a = Math.round(list.reduce((s, x) => s + x.analysis.score, 0) / list.length);
    const top = list.slice().sort((p, q) => q.analysis.score - p.analysis.score)[0];
    return { name, count: list.length, avg: a, topPick: { symbol: top.symbol, score: top.analysis.score, label: top.analysis.label } };
  };

  const opportunities = all
    .slice()
    .sort((a, b) => b.analysis.score - a.analysis.score)
    .slice(0, 6)
    .map((x) => ({ market: x.market, symbol: x.symbol, name: x.name, score: x.analysis.score, label: x.analysis.label, summary: x.analysis.summary }));

  const ind = (x) => x.ind || {};
  const sig = (x) => (x.ind && x.ind.signals) || {};
  const tag = (x) => x.market + ' ' + x.symbol;
  const signals = {
    overbought: all.filter((x) => ind(x).rsi >= 70).map((x) => tag(x) + ' (RSI ' + ind(x).rsi + ')'),
    oversold: all.filter((x) => ind(x).rsi != null && ind(x).rsi <= 30).map((x) => tag(x) + ' (RSI ' + ind(x).rsi + ')'),
    goldenCross: all.filter((x) => sig(x).goldenCross).map(tag),
    deathCross: all.filter((x) => sig(x).deathCross).map(tag),
    volumeSpike: all.filter((x) => ind(x).volSpike >= 1.5).map((x) => tag(x) + ' (%' + Math.round(ind(x).volSpike * 100) + ')'),
    strongMomentum: all
      .filter((x) => { const m = ind(x).macd; return m && m.histogram > 0 && m.prevHistogram != null && m.histogram > m.prevHistogram; })
      .map(tag),
  };

  const risks = all
    .filter((x) => sig(x).deathCross || ind(x).rsi >= 78 || x.analysis.score <= 30)
    .slice(0, 8)
    .map((x) => ({
      market: x.market,
      symbol: x.symbol,
      reason: sig(x).deathCross ? 'Ölüm kesişimi (50g<200g)' : ind(x).rsi >= 78 ? 'Aşırı alım RSI ' + ind(x).rsi : 'Düşük teknik puan ' + x.analysis.score,
    }));

  // --- Bu haftanın katalizör takvimi (Finnhub) ---
  const today = new Date();
  const weekTo = new Date(today.getTime() + 6 * 86400000);
  const from = ymd(today);
  const to = ymd(weekTo);
  const usTopSymbols = opportunities.filter((o) => o.market === 'ABD').map((o) => o.symbol);
  const newsSymbols = [...new Set(usTopSymbols.concat((cfg.watchlists.us || []).slice(0, 6)))].slice(0, 8);

  let calendar = { weekFrom: from, weekTo: to, economic: [], earnings: [], companyNews: [] };
  try {
    const [economic, earnings, companyNews] = await Promise.all([
      fetchEconomic(token, from, to),
      fetchEarnings(token, from, to, cfg.watchlists.us),
      fetchCompanyNews(token, newsSymbols, from, to),
    ]);
    // Etki sırasına göre (yüksek önce) en önemli 24 olay — base.json'u küçük tutar (token tasarrufu)
    const impRank = { high: 0, medium: 1, low: 2 };
    const econSorted = economic.slice().sort((a, b) => (impRank[a.impact] != null ? impRank[a.impact] : 3) - (impRank[b.impact] != null ? impRank[b.impact] : 3) || a.date.localeCompare(b.date));
    calendar = { weekFrom: from, weekTo: to, economic: econSorted.slice(0, 40), earnings: earnings.slice(0, 18), companyNews };
  } catch (e) {
    calendar.error = String((e && e.message) || e);
  }

  // Scorecard and resolved predictions integration
  let scorecard = null;
  let resolvedLastWeek = [];
  try {
    const { readJournal, buildPredictionScorecard } = require('./decision-journal');
    const journal = await readJournal(path.join(DATA, 'journal.json'));
    scorecard = buildPredictionScorecard(journal);
    
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    resolvedLastWeek = journal.predictions
      .filter((x) => x.outcome !== 'open' && x.resolvedAt && new Date(x.resolvedAt) >= sevenDaysAgo)
      .map((x) => ({
        id: x.id,
        market: x.market,
        symbol: x.symbol,
        label: x.label,
        score: x.score,
        entry: x.entry,
        target: x.target,
        stop: x.stop,
        outcome: x.outcome,
        resolvedAt: x.resolvedAt,
        resultPct: x.resultPct,
      }));
  } catch (err) {
    console.error('⚠️ [report] Scorecard verisi yüklenemedi:', err.message);
  }

  return {
    generatedAt: new Date().toISOString(),
    date: (snap.generatedAt || new Date().toISOString()).slice(0, 10),
    dataAsOf: snap.market || null,
    sentiment: { avg, label: sentLabel, gainers, total: all.length, buys },
    markets: {
      us: marketSummary(snap.us || [], 'ABD'),
      bist: marketSummary(snap.bist || [], 'BIST'),
      crypto: marketSummary(snap.crypto || [], 'Kripto'),
    },
    opportunities,
    signals,
    risks,
    calendar,
    scorecard,
    resolvedLastWeek,
  };
}

async function run() {
  const base = await buildBaseReport();
  // Yerel dosya (Claude routine base.json'u okur) — best-effort.
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, 'base.json'), JSON.stringify(base, null, 2));
    fs.writeFileSync(path.join(REPORT_DIR, 'base-' + base.date + '.json'), JSON.stringify(base));
  } catch (e) {
    console.warn('Yerel base.json yazılamadı (sorun değil, Supabase asıl):', e.message);
  }
  // Supabase'e yaz (asıl kaynak — Vercel buradan okur).
  try {
    await saveReport(base.date, { base });
    console.log('Temel rapor Supabase\'e yazıldı: ' + base.date);
  } catch (e) {
    console.error('⚠️  Temel rapor Supabase\'e yazılamadı:', e.message);
  }
  const c = base.calendar || {};
  console.log('Temel rapor üretildi: ' + base.date + ' | duyarlılık ' + base.sentiment.label + ' (' + base.sentiment.avg + ')');
  console.log('  Takvim: ' + (c.economic || []).length + ' ekonomik olay, ' + (c.earnings || []).length + ' bilanço, ' + (c.companyNews || []).length + ' haber');
  return base;
}

if (require.main === module) run().catch((e) => { console.error('HATA:', e); process.exit(1); });
module.exports = { run, buildBaseReport };
