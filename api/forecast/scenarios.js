// GET /api/forecast/scenarios — Makro stres testleri (portföy + piyasa verisine göre)
'use strict';

const { runStressTest } = require('../../src/forecast');
const { getPortfolio, getLatestSnapshot } = require('../../src/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [portfolio, latestData] = await Promise.all([
      getPortfolio(),
      getLatestSnapshot()
    ]);

    const usdtry = latestData && latestData.fx && latestData.fx.usdtry;
    const result = runStressTest(portfolio, latestData, usdtry);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/forecast/scenarios] hata:', e.message);
    res.status(400).json({ error: (e && e.message) || 'Stres testi hatası' });
  }
};
