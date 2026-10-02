// GET /api/chart — Sembol bazlı OHLCV mum verisi
'use strict';

const { fetchAssetChart } = require('../src/chart-data');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { market, symbol, interval, range, limit } = req.query;
    const result = await fetchAssetChart({ market, symbol, interval, range, limit });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/chart] hata:', e.message);
    res.status(400).json({ error: (e && e.message) || 'Chart verisi alinamadi' });
  }
};
