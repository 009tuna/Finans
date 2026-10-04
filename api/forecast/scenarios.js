// Read-only stress calculation. POST uses the exact visible portfolio/data cut.
'use strict';

const { runStressTest } = require('../../src/forecast');
const { getPortfolio, getLatestSnapshot } = require('../../src/db');

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null;
    const [portfolio, latestData] = req.method === 'POST' ? [params?.portfolio, params?.data] : await Promise.all([getPortfolio(), getLatestSnapshot()]);
    const result = runStressTest(portfolio, latestData);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/forecast/scenarios] hata:', e.message);
    res.status(400).json({ error: (e && e.message) || 'Stres testi hatası' });
  }
};
