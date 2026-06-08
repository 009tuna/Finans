// GET /api/history — Günlük geçmiş verilerini döndürür
// (data/history.json yerine Supabase market_history tablosu)
'use strict';

const { getHistory } = require('../src/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const history = await getHistory();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(history || []);
  } catch (e) {
    console.error('[api/history] hata:', e.message);
    res.status(500).json({ error: e.message });
  }
};
