// POST /api/forecast/montecarlo — Monte Carlo portföy simülasyonu
'use strict';

const { runMonteCarlo } = require('../../src/forecast');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = req.body;
    const result = await runMonteCarlo(params);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/forecast/montecarlo] hata:', e.message);
    res.status(400).json({ error: (e && e.message) || 'Monte Carlo hatası' });
  }
};
