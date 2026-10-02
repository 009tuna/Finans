// POST /api/backtest — Tarihsel strateji backtesti çalıştırır
'use strict';

const { runBacktest } = require('../src/backtest-engine');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = req.body;
    if (!params || !params.symbol || !params.market) {
      return res.status(400).json({ error: 'symbol ve market parametreleri zorunludur' });
    }
    const result = await runBacktest(params);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/backtest] hata:', e.message);
    res.status(400).json({ error: (e && e.message) || 'Backtest hatası' });
  }
};
