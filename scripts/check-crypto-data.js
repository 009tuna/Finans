// Checks real providers and the durable series cache without publishing snapshots,
// recording predictions, or changing portfolio/journal/research records.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fetchCryptoFull } = require('../src/coingecko');
const { computeIndicators } = require('../src/indicators');
const { scoreAsset } = require('../src/analyze');

(async () => {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8')).watchlists.crypto;
  const records = await fetchCryptoFull(ids);
  const rows = records.map(asset => {
    const technical = asset.technicalData || {};
    const current = ['fresh', 'cached'].includes(technical.status);
    const score = current ? scoreAsset(computeIndicators(asset.series || {}), null, 'crypto').score : null;
    return {
      id: asset.id, providerId: asset.providerId, symbol: asset.symbol,
      hasPrice: Number.isFinite(asset.price) && asset.price > 0,
      quoteTime: asset.quoteTime || null, technical,
      hasCurrentScore: Number.isFinite(score), error: asset.__error || null,
    };
  });
  const result = {
    checkedAt: new Date().toISOString(),
    scope: 'Real provider reads and crypto-series api_cache only. No snapshot, prediction, portfolio, or research publication.',
    total: rows.length,
    prices: rows.filter(row => row.hasPrice).length,
    currentTechnical: rows.filter(row => row.hasCurrentScore).length,
    stale: rows.filter(row => row.technical.status === 'stale').length,
    warnings: rows.filter(row => row.error || row.technical.error || row.technical.cacheWarning).length,
    rows,
  };
  const output = process.argv[2];
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, rows: rows.map(row => ({ symbol: row.symbol, status: row.technical.status, bars: row.technical.bars, hasPrice: row.hasPrice, warning: row.error || row.technical.error || row.technical.cacheWarning || null })) }, null, 2));
  if (result.prices !== ids.length || result.currentTechnical !== ids.length || result.warnings) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
