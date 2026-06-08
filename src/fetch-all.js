// Tüm pazarları çeker → OHLC serisi → indikatörler → skor/yorum → data/latest.json + history.
// US: Yahoo (fiyat+seri) + Finnhub (temel/analist). BIST: Yahoo. Kripto: CoinGecko.
'use strict';
const fs = require('fs');
const path = require('path');
const { fetchManySeries } = require('./yahoo');
const { fetchManyFundamentals } = require('./finnhub');
const { fetchCryptoFull } = require('./coingecko');
const { computeIndicators } = require('./indicators');
const { scoreAsset } = require('./analyze');
const { attachDecisionMetadata } = require('./decision');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

function loadHistory() {
  try {
    const hist = JSON.parse(fs.readFileSync(path.join(DATA, 'history.json'), 'utf8'));
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
  return {
    market: 'crypto',
    symbol: c.symbol,
    id: c.id,
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

async function runAll() {
  const cfg = loadConfig();
  const token = cfg.finnhubToken;

  const [usSeries, usFund, bistSeries, crypto] = await Promise.all([
    fetchManySeries(cfg.watchlists.us),
    fetchManyFundamentals(cfg.watchlists.us, token),
    fetchManySeries(cfg.watchlists.bist, (s) => s + '.IS'),
    fetchCryptoFull(cfg.watchlists.crypto),
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

  const insufficient = (arr, pfx) =>
    arr.filter((x) => !x.__error && (!x.analysis || x.analysis.score == null)).map((x) => pfx + ' ' + x.symbol + ': yetersiz veri');
  const errs = []
    .concat(us.filter((x) => x.__error).map((x) => 'ABD ' + x.symbol + ': ' + x.__error))
    .concat(bist.filter((x) => x.__error).map((x) => 'BIST ' + x.symbol + ': ' + x.__error))
    .concat(cryptoArr.filter((x) => x.__error).map((x) => 'Kripto ' + x.symbol + ': ' + x.__error))
    .concat(insufficient(us, 'ABD'), insufficient(bist, 'BIST'), insufficient(cryptoArr, 'Kripto'));

  const snapshot = {
    generatedAt: new Date().toISOString(),
    counts: { us: scored(us).length, bist: scored(bist).length, crypto: scored(cryptoArr).length },
    market: { usAsOf: maxTime(us), bistAsOf: maxTime(bist), cryptoAsOf: maxTime(cryptoArr) },
    topPicks,
    allocation,
    us,
    bist,
    crypto: cryptoArr,
    errors: errs,
  };

  attachDecisionMetadata(snapshot, loadHistory(), cfg);

  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'latest.json'), JSON.stringify(snapshot));
  appendHistory(snapshot);
  fs.appendFileSync(
    path.join(DATA, 'run.log'),
    snapshot.generatedAt + ` | ABD:${snapshot.counts.us} BIST:${snapshot.counts.bist} Kripto:${snapshot.counts.crypto}` + (errs.length ? ` | hata:${errs.length}` : '') + '\n'
  );
  return snapshot;
}

function appendHistory(snapshot) {
  const file = path.join(DATA, 'history.json');
  let hist = [];
  try {
    hist = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(hist)) hist = [];
  } catch (e) {
    hist = [];
  }
  const date = snapshot.generatedAt.slice(0, 10);
  const scores = {};
  const prices = {};
  const collect = (arr, pfx) => arr.forEach((x) => {
    if (!x.analysis || x.analysis.score == null) return;
    const k = pfx + x.symbol;
    scores[k] = x.analysis.score;
    if (typeof x.price === 'number') prices[k] = x.price;
  });
  collect(snapshot.us, 'US:');
  collect(snapshot.bist, 'BIST:');
  collect(snapshot.crypto, 'CRYPTO:');
  const entry = { date, t: snapshot.generatedAt, scores, prices };
  const idx = hist.findIndex((h) => h.date === date);
  if (idx >= 0) hist[idx] = entry;
  else hist.push(entry);
  if (hist.length > 120) hist = hist.slice(hist.length - 120);
  fs.writeFileSync(file, JSON.stringify(hist));
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
