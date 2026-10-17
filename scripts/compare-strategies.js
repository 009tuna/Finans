// Strateji karşılaştırması: aynı veri, aynı maliyet, portföy düzeyinde ve "al ve tut" kıyasıyla.
// Pozisyon t kapanışında belirlenir, t → t+1 kapanış getirisini taşır; pozisyon değişiminde tek yön maliyet düşülür.
// Piyasa portföyü: varlık strateji getirilerinin eşit ağırlıklı günlük ortalaması.
// BIST, TL'deki yüksek mevduat getirisi ve kur kaybı nedeniyle ayrıca USD bazında ölçülür (TRY=X).
// Kullanım: node scripts/compare-strategies.js [--json çıktı.json]
'use strict';
const fs = require('fs');
const path = require('path');
const { prepare, rollingSma, rollingRsi, backtest } = require('../src/trend-signals');
const { oneWayCost } = require('../src/costs');
const { mapLimit } = require('../src/util');
const { yahooBars } = require('./backtest-trend-signals');
const universe = require('../src/bist-universe.json');

const WARMUP = 252;
const RANGE = process.argv.includes('--range') ? process.argv[process.argv.indexOf('--range') + 1] : '5y';
const CRYPTO_YAHOO = { bitcoin: 'BTC-USD', ethereum: 'ETH-USD', solana: 'SOL-USD', binancecoin: 'BNB-USD', ripple: 'XRP-USD', cardano: 'ADA-USD',
  'avalanche-2': 'AVAX-USD', dogecoin: 'DOGE-USD', chainlink: 'LINK-USD', polkadot: 'DOT-USD', tron: 'TRX-USD', sui: 'SUI20947-USD', near: 'NEAR-USD',
  render: 'RENDER-USD', 'fetch-ai': 'FET-USD', arbitrum: 'ARB11841-USD', optimism: 'OP-USD', pepe: 'PEPE24478-USD', aptos: 'APT21794-USD',
  uniswap: 'UNI7083-USD', dogwifhat: 'WIF-USD' };

// ---- Pozisyon üreticileri: ind → pos[] (−1, 0, 1). allowShort false ise short 0 olur. ----
const clampShort = (pos, allowShort) => allowShort ? pos : pos.map((p) => Math.max(p, 0));
const S = {
  'Al ve tut': (ind) => ind.closes.map(() => 1),
  'Trend 200g (long)': (ind) => ind.closes.map((c, t) => (ind.sma200[t] && c > ind.sma200[t] ? 1 : 0)),
  'Trend 200g (long/short)': (ind, o) => clampShort(ind.closes.map((c, t) => (!ind.sma200[t] ? 0 : c > ind.sma200[t] ? 1 : -1)), o.allowShort),
  'Momentum 12 ay (long)': (ind) => ind.closes.map((c, t) => (t >= 252 && c > ind.closes[t - 252] ? 1 : 0)),
  'Momentum 12 ay (long/short)': (ind, o) => clampShort(ind.closes.map((c, t) => (t < 252 ? 0 : c > ind.closes[t - 252] ? 1 : -1)), o.allowShort),
  'Donchian 55/20 (long/short)': (ind, o) => donchian(ind, false, o.allowShort),
  'Donchian 55/20 + trend filtresi': (ind, o) => donchian(ind, true, o.allowShort),
  'RSI(2) geri dönüş (long)': (ind) => rsi2(ind),
  'Mevcut motor v1 (long/short)': (ind, o) => fromTrades(ind, o, { allowShort: o.allowShort }),
  'Mevcut motor v1 (yalnız long)': (ind, o) => fromTrades(ind, o, { allowShort: false }),
  'v1 yalnız kırılım (long)': (ind, o) => fromTrades(ind, o, { allowShort: false, setup: 'breakout' }),
};

function donchian(ind, trendFilter, allowShort) {
  const n = ind.closes.length, pos = new Array(n).fill(0);
  let state = 0;
  for (let t = 56; t < n; t++) {
    let hi55 = -Infinity, lo55 = Infinity, hi20 = -Infinity, lo20 = Infinity;
    for (let i = t - 55; i < t; i++) { hi55 = Math.max(hi55, ind.highs[i]); lo55 = Math.min(lo55, ind.lows[i]); }
    for (let i = t - 20; i < t; i++) { hi20 = Math.max(hi20, ind.highs[i]); lo20 = Math.min(lo20, ind.lows[i]); }
    const c = ind.closes[t], up = !trendFilter || (ind.sma200[t] && c > ind.sma200[t]), down = !trendFilter || (ind.sma200[t] && c < ind.sma200[t]);
    if (state === 1 && c < lo20) state = 0;
    if (state === -1 && c > hi20) state = 0;
    if (state === 0 && c > hi55 && up) state = 1;
    else if (state === 0 && allowShort && c < lo55 && down) state = -1;
    pos[t] = state;
  }
  return pos;
}
function rsi2(ind) {
  const r2 = rollingRsi(ind.closes, 2), s5 = rollingSma(ind.closes, 5), n = ind.closes.length, pos = new Array(n).fill(0);
  let state = 0;
  for (let t = 1; t < n; t++) {
    const c = ind.closes[t];
    if (state === 1 && s5[t] && c > s5[t]) state = 0;
    else if (state === 0 && ind.sma200[t] && c > ind.sma200[t] && r2[t] != null && r2[t] < 10) state = 1;
    pos[t] = state;
  }
  return pos;
}
// v1 işlemleri: giriş ertesi açılış / çıkış gün içi. Kapanış bazlı yaklaşım: sinyal günü kapanışından çıkış günü kapanışına.
function fromTrades(ind, o, { allowShort, setup }) {
  const pos = new Array(ind.closes.length).fill(0);
  backtest(o.bars, { market: o.market, allowShort }).forEach((tr) => {
    if (setup && tr.setup !== setup) return;
    const dir = tr.direction === 'long' ? 1 : -1;
    for (let t = tr.entryIndex - 1; t < tr.exitIndex; t++) pos[t] = dir;
  });
  return pos;
}

// Kesitsel momentum (piyasa düzeyi): her 21 günde son 126 günün (son 21 hariç) getirisine göre ilk %20, eşit ağırlık.
function crossSectional(assets, dates) {
  const byDate = new Map(dates.map((d, i) => [d, i]));
  const weights = new Map();
  let current = new Set();
  dates.forEach((date, k) => {
    if (k % 21 === 0) {
      const scored = assets.map((a) => {
        const t = a.index.get(date);
        if (t == null || t < 147) return null;
        return { a, score: a.ind.closes[t - 21] / a.ind.closes[t - 147] - 1 };
      }).filter(Boolean).sort((x, y) => y.score - x.score);
      current = new Set(scored.slice(0, Math.max(1, Math.round(scored.length * 0.2))).map((x) => x.a.symbol));
    }
    weights.set(date, current);
  });
  return { weights, byDate };
}

function metrics(daily, perYear) {
  const r = daily.map((x) => x.r);
  if (r.length < 30) return null;
  let eq = 1, peak = 1, maxDd = 0;
  r.forEach((x) => { eq *= 1 + x; peak = Math.max(peak, eq); maxDd = Math.max(maxDd, 1 - eq / peak); });
  const years = r.length / perYear, mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
  const exposure = daily.reduce((a, x) => a + x.exposure, 0) / daily.length;
  const turnover = daily.reduce((a, x) => a + x.turnover, 0) / years;
  return { cagr: eq ** (1 / years) - 1, vol: sd * Math.sqrt(perYear), sharpe: sd ? mean / sd * Math.sqrt(perYear) : 0, maxDd, exposure, turnover, days: r.length };
}

// Bir piyasanın varlıklarından, verilen strateji için eşit ağırlıklı portföy günlük getirileri.
function portfolio(assets, name, market, priceKey) {
  const dates = [...new Set(assets.flatMap((a) => a[priceKey].dates.slice(WARMUP)))].sort();
  const cost = oneWayCost(market);
  const perAsset = assets.map((a) => {
    const ind = a[priceKey + 'Ind'];
    const pos = S[name](ind, { allowShort: a.allowShort, market, bars: a[priceKey] });
    const out = new Map();
    for (let t = WARMUP; t < ind.closes.length - 1; t++) {
      const ret = ind.closes[t + 1] / ind.closes[t] - 1, change = Math.abs(pos[t] - (pos[t - 1] || 0));
      out.set(ind.dates[t + 1], { r: pos[t] * ret - change * cost, exposure: Math.abs(pos[t]), turnover: change });
    }
    return out;
  });
  return dates.map((d) => {
    const rows = perAsset.map((m) => m.get(d)).filter(Boolean);
    if (!rows.length) return null;
    return { date: d, r: rows.reduce((a, x) => a + x.r, 0) / rows.length, exposure: rows.reduce((a, x) => a + x.exposure, 0) / rows.length, turnover: rows.reduce((a, x) => a + x.turnover, 0) / rows.length };
  }).filter(Boolean);
}
function xsPortfolio(assets, market, priceKey) {
  const dates = [...new Set(assets.flatMap((a) => a[priceKey].dates))].sort();
  assets.forEach((a) => { a.index = new Map(a[priceKey + 'Ind'].dates.map((d, i) => [d, i])); a.ind = a[priceKey + 'Ind']; });
  const { weights } = crossSectional(assets, dates);
  const cost = oneWayCost(market);
  let prev = new Set();
  const out = [];
  for (let k = WARMUP; k < dates.length - 1; k++) {
    const d = dates[k], next = dates[k + 1], held = weights.get(d);
    const rets = [...held].map((sym) => { const a = assets.find((x) => x.symbol === sym); const t = a.index.get(d), u = a.index.get(next); return t != null && u != null ? a.ind.closes[u] / a.ind.closes[t] - 1 : null; }).filter((x) => x != null);
    const changed = [...held].filter((s) => !prev.has(s)).length + [...prev].filter((s) => !held.has(s)).length;
    const turnover = held.size ? changed / held.size : 0;
    out.push({ date: next, r: (rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0) - turnover * cost, exposure: 1, turnover: turnover / 5 });
    prev = held;
  }
  return out;
}

async function load() {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const futures = new Set(universe.viopStockFutures.symbols);
  const jobs = [
    ...cfg.watchlists.us.map((s) => ({ market: 'us', symbol: s, yahoo: s, allowShort: true })),
    ...cfg.watchlists.bist.map((s) => ({ market: 'bist', symbol: s, yahoo: s + '.IS', allowShort: futures.has(s) })),
    ...cfg.watchlists.crypto.map((id) => ({ market: 'crypto', symbol: CRYPTO_YAHOO[id].replace(/\d*-USD$/, ''), yahoo: CRYPTO_YAHOO[id], allowShort: true })),
  ];
  const fx = await yahooBars('TRY=X', RANGE);
  const fxByDate = new Map(fx.dates.map((d, i) => [d, fx.closes[i]]).filter(([, v]) => Number.isFinite(v)));
  const assets = [];
  await mapLimit(jobs, 4, async (job) => {
    const bars = await yahooBars(job.yahoo, RANGE);
    if (!bars || bars.closes.filter(Number.isFinite).length < WARMUP + 60) return;
    const asset = { ...job, local: bars, localInd: prepare(bars) };
    if (job.market === 'bist') {
      // USD fiyatı: aynı gün (yoksa son bilinen) USD/TRY ile bölünür.
      let last = null; const usd = { dates: [], opens: [], highs: [], lows: [], closes: [] };
      bars.dates.forEach((d, i) => {
        if (fxByDate.has(d)) last = fxByDate.get(d);
        if (!last) return;
        usd.dates.push(d); ['opens', 'highs', 'lows', 'closes'].forEach((k) => usd[k].push(bars[k][i] / last));
      });
      asset.usd = usd; asset.usdInd = prepare(usd);
    }
    assets.push(asset);
  });
  return assets;
}

function table(title, rowsByName) {
  const pct = (v) => (v * 100).toFixed(1).padStart(6) + '%';
  console.log('\n' + title);
  console.log('Strateji'.padEnd(34) + '  Yıllık   Oynaklık  Sharpe  Max düşüş  Piyasada  | 1. yarı Sharpe | 2. yarı Sharpe');
  for (const [name, m] of Object.entries(rowsByName)) {
    if (!m.full) continue;
    console.log(name.padEnd(34) + pct(m.full.cagr) + '  ' + pct(m.full.vol) + '  ' + m.full.sharpe.toFixed(2).padStart(5) + '   ' + pct(m.full.maxDd) + '   ' + pct(m.full.exposure) +
      '  |  ' + (m.h1 ? m.h1.sharpe.toFixed(2) + ' (' + pct(m.h1.cagr).trim() + ')' : '–').padEnd(14) + ' |  ' + (m.h2 ? m.h2.sharpe.toFixed(2) + ' (' + pct(m.h2.cagr).trim() + ')' : '–'));
  }
}

async function run() {
  const assets = await load();
  const result = { generatedAt: new Date().toISOString(), markets: {} };
  const views = [['us', 'local', 'ABD (USD)', 252], ['bist', 'usd', 'BIST (USD bazında, ana ölçü)', 252], ['bist', 'local', 'BIST (TL bazında, yalnız bilgi)', 252], ['crypto', 'local', 'Kripto (USD)', 365]];
  for (const [market, key, title, perYear] of views) {
    const list = assets.filter((a) => a.market === market && a[key]);
    const rows = {};
    for (const name of Object.keys(S)) rows[name] = portfolio(list, name, market, key);
    rows['Kesitsel momentum ilk %20 (long)'] = xsPortfolio(list, market, key);
    const dates = rows['Al ve tut'].map((x) => x.date), mid = dates[Math.floor(dates.length / 2)];
    const summary = Object.fromEntries(Object.entries(rows).map(([name, daily]) => [name, {
      full: metrics(daily, perYear), h1: metrics(daily.filter((x) => x.date < mid), perYear), h2: metrics(daily.filter((x) => x.date >= mid), perYear),
    }]));
    result.markets[title] = { assets: list.length, from: dates[0], mid, to: dates.at(-1), summary };
    table(title + ' · ' + list.length + ' varlık · ' + dates[0] + ' → ' + dates.at(-1) + ' (yarı: ' + mid + ')', summary);
  }
  return result;
}

if (require.main === module) {
  const out = process.argv.indexOf('--json');
  run().then((r) => { if (out > 0) fs.writeFileSync(process.argv[out + 1], JSON.stringify(r, null, 2)); }).catch((e) => { console.error(e); process.exitCode = 1; });
}
module.exports = { run, S };
