// Tüm pazarları çeker → OHLC serisi → indikatörler → skor/yorum → Supabase'e yazar.
// US: Yahoo (fiyat+seri) + Finnhub (temel/analist). BIST: Yahoo. Kripto: CoinGecko.
'use strict';
const path = require('path');
const { fetchManySeries } = require('./yahoo');
const { fetchManyFundamentals } = require('./finnhub');
const { fetchCryptoFull } = require('./coingecko');
const { computeIndicators } = require('./indicators');
const { scoreAsset } = require('./analyze');
const { attachDecisionMetadata, attachSignalHealth } = require('./decision');
const { saveSnapshot, appendHistory, getHistory } = require('./db');
const { fetchFxRates } = require('./fx');
const { fetchAssetChart } = require('./chart-data');
const { computeMarketRegimes } = require('./market-regime');

const ROOT = path.join(__dirname, '..');
const fs = require('fs');


function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  // Env var varsa config.json'daki token'ı override et (GitHub Actions + Vercel için)
  if (process.env.FINNHUB_TOKEN) cfg.finnhubToken = process.env.FINNHUB_TOKEN;
  return cfg;
}

async function loadHistory() {
  try {
    const hist = await getHistory();
    return Array.isArray(hist) ? hist : [];
  } catch (e) {
    return [];
  }
}

function buildStock(series, fund, market) {
  if (series.__error) return { market, symbol: series.symbol, __error: series.__error };
  const ind = computeIndicators(series.series || {});
  const analysis = scoreAsset(ind, fund, market);
  return {
    market,
    symbol: market === 'bist' ? series.symbol.replace('.IS', '') : series.symbol,
    name: (fund && fund.name) || series.name,
    logo: fund ? fund.logo : null,
    industry: fund ? fund.industry : null,
    currency: series.currency || (market === 'bist' ? 'TRY' : 'USD'),
    price: series.price,
    quoteTime: series.quoteTime,
    change: series.change,
    changePct: series.changePct,
    marketCap: fund ? fund.marketCap : null,
    pe: fund ? fund.pe : null,
    beta: fund ? fund.beta : null,
    high52: series.high52,
    low52: series.low52,
    ind,
    analysis,
  };
}

function buildCrypto(c) {
  if (c.__error) return { market: 'crypto', symbol: c.symbol || c.id, id: c.id, __error: c.__error };
  const ind = computeIndicators(c.series || {});
  const analysis = scoreAsset(ind, null, 'crypto');
  const technicalData = c.technicalData || null;
  if (technicalData && ['stale', 'unavailable'].includes(technicalData.status)) {
    if (Number.isFinite(analysis.score)) {
      analysis.lastKnownScore = analysis.score;
      analysis.lastKnownLabel = analysis.label;
    }
    analysis.score = null;
    analysis.tone = 'hold';
    analysis.label = technicalData.status === 'stale' ? 'ESKİ VERİ' : 'TEKNİK VERİ YOK';
    analysis.summary = technicalData.status === 'stale'
      ? 'Son başarılı geçmiş gösteriliyor; güncel teknik sinyal üretilmedi.'
      : 'Fiyat mevcut; teknik geçmiş kaynağına erişilemedi.';
    analysis.reasons = [{ sentiment: 'neutral', text: technicalData.error || analysis.summary }];
  }
  return {
    market: 'crypto',
    symbol: c.symbol,
    id: c.id,
    providerId: c.providerId || c.id,
    technicalData,
    name: c.name,
    logo: c.logo,
    currency: 'USD',
    price: c.price,
    quoteTime: c.quoteTime,
    changePct: c.changePct,
    change7d: c.change7d,
    change30d: c.change30d,
    marketCap: c.marketCap,
    rank: c.rank,
    volume: c.volume,
    ath: c.ath,
    athChangePct: c.athChangePct,
    high52: ind && ind.high52,
    low52: ind && ind.low52,
    ind,
    analysis,
  };
}

// Piyasa-seviye rejim girdileri: ^VIX (US), ^IXIC+BTC-USD (kripto korelasyon), XU100.IS (BIST SMA200).
// Her biri dayanıklı: çekilemezse o rejim null döner, akışı bozmaz.
async function fetchMarketRegimes() {
  const safe = async (params) => {
    try { const r = await fetchAssetChart(params); return (r && r.bars) || null; }
    catch (_) { return null; }
  };
  const [vixBars, nasdaqBars, btcBars, bistBars] = await Promise.all([
    safe({ market: 'us', symbol: '^VIX', interval: '1d', range: '3mo' }),
    safe({ market: 'us', symbol: '^IXIC', interval: '1d', range: '3mo' }),
    safe({ market: 'us', symbol: 'BTC-USD', interval: '1d', range: '3mo' }),
    safe({ market: 'bist', symbol: 'XU100', interval: '1d', range: '2y' }), // SMA200 için ≥200 gün
  ]);
  try { return computeMarketRegimes({ vixBars, nasdaqBars, btcBars, bistBars }); }
  catch (_) { return { us: null, bist: null, crypto: null }; }
}

async function runAll() {
  const cfg = loadConfig();
  const token = cfg.finnhubToken;

  const [usSeries, usFund, bistSeries, crypto, fx, marketRegime] = await Promise.all([
    fetchManySeries(cfg.watchlists.us),
    fetchManyFundamentals(cfg.watchlists.us, token),
    fetchManySeries(cfg.watchlists.bist, (s) => s + '.IS'),
    fetchCryptoFull(cfg.watchlists.crypto),
    fetchFxRates(),
    fetchMarketRegimes(),
  ]);

  const fundBy = {};
  usFund.forEach((f) => { if (f && f.symbol) fundBy[f.symbol] = f; });

  const us = usSeries.map((s) => buildStock(s, fundBy[s.symbol] || null, 'us'));
  const bist = bistSeries.map((s) => buildStock(s, null, 'bist'));
  const cryptoArr = crypto.map(buildCrypto);

  const scored = (arr) => arr.filter((x) => x.analysis && x.analysis.score != null);
  const tagged = [...scored(us), ...scored(bist), ...scored(cryptoArr)];
  const topPicks = tagged
    .slice()
    .sort((a, b) => b.analysis.score - a.analysis.score)
    .slice(0, 6)
    .map((x) => ({
      market: x.market === 'us' ? 'ABD' : x.market === 'bist' ? 'BIST' : 'Kripto',
      symbol: x.symbol,
      name: x.name,
      price: x.price,
      currency: x.currency,
      score: x.analysis.score,
      label: x.analysis.label,
      tone: x.analysis.tone,
    }));

  const wsum = topPicks.reduce((a, p) => a + p.score, 0) || 1;
  const allocation = topPicks.map((p) => ({
    label: (p.market === 'ABD' ? '🇺🇸' : p.market === 'BIST' ? '🇹🇷' : '₿') + ' ' + p.symbol,
    weight: Math.round((p.score / wsum) * 100),
  }));

  const maxTime = (arr) => {
    let m = null;
    arr.forEach((x) => { if (x.quoteTime && (!m || x.quoteTime > m)) m = x.quoteTime; });
    return m;
  };

  const insufficient = (arr, pfx) => arr.flatMap((x) => {
    if (x.__error) return [];
    const data = x.technicalData;
    const messages = [];
    if (data && ['stale', 'unavailable', 'insufficient'].includes(data.status)) {
      const reason = data.status === 'stale' ? 'eski teknik geçmiş kullanılıyor' : data.status === 'unavailable' ? 'teknik kaynak erişilemiyor' : 'teknik geçmiş kısa';
      messages.push(pfx + ' ' + x.symbol + ': ' + reason + (data.error ? ' — ' + data.error : ''));
    } else if (!x.analysis || x.analysis.score == null) messages.push(pfx + ' ' + x.symbol + ': yetersiz veri');
    if (data && data.cacheWarning) messages.push(pfx + ' ' + x.symbol + ': teknik önbellek — ' + data.cacheWarning);
    return messages;
  });
  const errs = []
    .concat(us.filter((x) => x.__error).map((x) => 'ABD ' + x.symbol + ': ' + x.__error))
    .concat(bist.filter((x) => x.__error).map((x) => 'BIST ' + x.symbol + ': ' + x.__error))
    .concat(cryptoArr.filter((x) => x.__error).map((x) => 'Kripto ' + x.symbol + ': ' + x.__error))
    .concat(insufficient(us, 'ABD'), insufficient(bist, 'BIST'), insufficient(cryptoArr, 'Kripto'));

  const snapshot = {
    generatedAt: new Date().toISOString(),
    counts: { us: scored(us).length, bist: scored(bist).length, crypto: scored(cryptoArr).length },
    market: { usAsOf: maxTime(us), bistAsOf: maxTime(bist), cryptoAsOf: maxTime(cryptoArr) },
    fx,
    marketRegime,
    topPicks,
    allocation,
    us,
    bist,
    crypto: cryptoArr,
    errors: errs,
  };

  const history = await loadHistory();
  attachDecisionMetadata(snapshot, history, cfg);

  // System predictions recording
  const { readJournal, writeJournal, recordPrediction } = require('./decision-journal');
  const JOURNAL_PATH = path.join(ROOT, 'data', 'journal.json');
  let journalForSignals = null;
  try {
    const journal = await readJournal(JOURNAL_PATH);
    let updatedJournal = journal;
    const nowIso = snapshot.generatedAt;
    
    const recordList = (arr) => {
      (arr || []).forEach(x => {
        if (x.analysis && x.analysis.score >= 70 && x.decision && x.decision.trade && x.decision.trade.available) {
          updatedJournal = recordPrediction(updatedJournal, {
            market: x.market,
            symbol: x.symbol,
            label: x.analysis.label,
            score: x.analysis.score,
            entry: x.decision.trade.entry,
            target: x.decision.trade.target,
            stop: x.decision.trade.stop,
            horizonDays: 30,
            source: 'system'
          }, nowIso);
        }
      });
    };
    recordList(snapshot.us);
    recordList(snapshot.bist);
    recordList(snapshot.crypto);
    
    await writeJournal(JOURNAL_PATH, updatedJournal);
    journalForSignals = updatedJournal;
  } catch (err) {
    console.error('⚠️ [fetch-all] Sistem tahminleri kaydedilemedi:', err.message);
    throw err;
  }

  attachSignalHealth(snapshot, journalForSignals);

  // Supabase'e yaz (latest + history)
  await saveSnapshot(snapshot);
  await appendHistory(snapshot);

  const logLine = snapshot.generatedAt + ` | ABD:${snapshot.counts.us} BIST:${snapshot.counts.bist} Kripto:${snapshot.counts.crypto}` + (errs.length ? ` | hata:${errs.length}` : '');
  console.log('[fetch-all]', logLine);

  return snapshot;
}

if (require.main === module) {
  runAll()
    .then((s) => {
      console.log('Veriler güncellendi: ' + s.generatedAt);
      console.log(`  ABD: ${s.counts.us} | BIST: ${s.counts.bist} | Kripto: ${s.counts.crypto}`);
      if (s.errors.length) console.log('  Uyarılar:\n   - ' + s.errors.join('\n   - '));
      console.log('  Öne çıkanlar:');
      s.topPicks.forEach((p) => console.log(`   * ${p.market} ${p.symbol} -> ${p.label} (${p.score})`));
    })
    .catch((e) => { console.error('HATA:', e); process.exit(1); });
}

module.exports = { runAll };
