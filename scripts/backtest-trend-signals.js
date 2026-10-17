// trend-signals-v1 kurallarının geçmiş testi: ABD ve BIST için Yahoo 5 yıllık, kripto için Binance ~1000 günlük veri.
// Sonuç piyasa × yön × kurulum bazında özetlenir; --save ile api_cache'e (trend_backtest_v1) yazılır.
'use strict';
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }); } catch (_) {}
const fs = require('fs');
const path = require('path');
const { backtest, summarize, STRATEGY, DEFAULTS } = require('../src/trend-signals');
const { mapLimit } = require('../src/util');
const universe = require('../src/bist-universe.json');

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' };
const BINANCE = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', binancecoin: 'BNB', ripple: 'XRP', cardano: 'ADA', 'avalanche-2': 'AVAX', dogecoin: 'DOGE',
  chainlink: 'LINK', polkadot: 'DOT', tron: 'TRX', sui: 'SUI', near: 'NEAR', render: 'RENDER', 'fetch-ai': 'FET', arbitrum: 'ARB', optimism: 'OP', pepe: 'PEPE',
  aptos: 'APT', uniswap: 'UNI', dogwifhat: 'WIF' };

// Binance erişilemeyen ağlarda (yerel Windows ağı gibi) aynı varlıkların Yahoo USD serisi kullanılır.
const YAHOO_CRYPTO = { sui: 'SUI20947-USD', arbitrum: 'ARB11841-USD', pepe: 'PEPE24478-USD', aptos: 'APT21794-USD', uniswap: 'UNI7083-USD' };
async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
  }
  return null;
}
// Son çubuk (devam eden gün olabilir) her zaman çıkarılır.
async function yahooBars(symbol, range = '5y') {
  const data = await getJson('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=' + range);
  const r = data && data.chart && data.chart.result && data.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0], offset = (r.meta.gmtoffset || 0) * 1000;
  const bars = { dates: [], opens: [], highs: [], lows: [], closes: [] };
  r.timestamp.forEach((ts, i) => {
    bars.dates.push(new Date(ts * 1000 + offset).toISOString().slice(0, 10));
    bars.opens.push(q.open[i]); bars.highs.push(q.high[i]); bars.lows.push(q.low[i]); bars.closes.push(q.close[i]);
  });
  for (const key of Object.keys(bars)) bars[key].pop();
  return bars;
}
async function binanceBars(base) {
  const rows = await getJson('https://data-api.binance.vision/api/v3/klines?symbol=' + base + 'USDT&interval=1d&limit=1000');
  if (!Array.isArray(rows) || !rows.length) return null;
  rows.pop();
  return { dates: rows.map((k) => new Date(k[0]).toISOString().slice(0, 10)), opens: rows.map((k) => +k[1]), highs: rows.map((k) => +k[2]), lows: rows.map((k) => +k[3]), closes: rows.map((k) => +k[4]) };
}

async function run({ save = false } = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const futures = new Set(universe.viopStockFutures.symbols);
  const jobs = [
    ...cfg.watchlists.us.map((symbol) => ({ market: 'us', symbol, allowShort: true, load: () => yahooBars(symbol) })),
    ...cfg.watchlists.bist.map((symbol) => ({ market: 'bist', symbol, allowShort: futures.has(symbol), load: () => yahooBars(symbol + '.IS') })),
    ...cfg.watchlists.crypto.filter((id) => BINANCE[id]).map((id) => ({ market: 'crypto', symbol: BINANCE[id], allowShort: true, load: async () => (await binanceBars(BINANCE[id])) || yahooBars(YAHOO_CRYPTO[id] || BINANCE[id] + '-USD') })),
  ];
  const all = [], missing = [];
  await mapLimit(jobs, 4, async (job) => {
    const bars = await job.load();
    if (!bars || bars.closes.length < DEFAULTS.minBars + 20) { missing.push(job.market + ':' + job.symbol); return; }
    backtest(bars, { market: job.market, allowShort: job.allowShort }).forEach((trade) => all.push({ market: job.market, symbol: job.symbol, ...trade }));
  });
  const groups = {};
  const add = (key, trade) => { (groups[key] = groups[key] || []).push(trade); };
  all.forEach((trade) => {
    add('all', trade); add(trade.market, trade); add(trade.market + ':' + trade.direction, trade);
    add(trade.market + ':' + trade.direction + ':' + trade.setup, trade);
  });
  const summary = Object.fromEntries(Object.entries(groups).sort().map(([key, trades]) => [key, summarize(trades)]));
  const dates = all.map((t) => t.entryDate).sort();
  const result = { strategy: STRATEGY, config: DEFAULTS, generatedAt: new Date().toISOString(), period: { from: dates[0] || null, to: dates.at(-1) || null },
    universe: { assets: jobs.length - missing.length, missing, bistShortEligible: [...futures].filter((s) => cfg.watchlists.bist.includes(s)).length },
    summary, recentTrades: all.sort((a, b) => b.exitDate.localeCompare(a.exitDate)).slice(0, 40).map((t) => ({ market: t.market, symbol: t.symbol, direction: t.direction, setup: t.setup, entryDate: t.entryDate, exitDate: t.exitDate, exitReason: t.exitReason, r: Math.round(t.r * 100) / 100, returnPct: Math.round(t.returnPct * 10000) / 100 })) };
  if (save) await require('../src/db').setCache('trend_backtest_v1', result);
  return result;
}

if (require.main === module) {
  run({ save: process.argv.includes('--save') }).then((r) => {
    console.log(STRATEGY, r.period.from, '→', r.period.to, '| varlık', r.universe.assets, '| eksik', r.universe.missing.length);
    for (const [key, s] of Object.entries(r.summary)) {
      if (!s.trades) continue;
      console.log(key.padEnd(26), 'işlem', String(s.trades).padStart(4), '| isabet', (s.winRate * 100).toFixed(0).padStart(3) + '%', '| ort R', String(s.avgR).padStart(6), '| top R', String(s.totalR).padStart(7), '| PF', String(s.profitFactor).padStart(5), '| ort %', String(s.avgReturnPct).padStart(6), '| maxDD R', String(s.maxDrawdownR).padStart(6), '| süre', s.avgHoldBars, JSON.stringify(s.exits));
    }
  }).catch((e) => { console.error(e); process.exitCode = 1; });
}
module.exports = { run, yahooBars, binanceBars, BINANCE };
