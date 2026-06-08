// GET /api/report — Supabase reports tablosundan en son base + ai raporunu döndürür
'use strict';

const { getReport } = require('../src/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const r = await getReport(); // en son rapor
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ base: r.base || null, ai: r.ai || null, date: r.date || null });
  } catch (e) {
    console.error('[api/report] hata:', e.message);
    res.status(500).json({ error: e.message });
  }
};
