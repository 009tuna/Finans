// GET /api/data — En son piyasa verisi anlık görüntüsünü döndürür
// (data/latest.json yerine Supabase market_snapshots tablosu)
'use strict';

const { readStructuralSnapshot } = require('../src/structural-reader');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await readStructuralSnapshot();
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(data || { empty: true });
  } catch (e) {
    console.error('[api/data] hata:', e.message);
    res.status(500).json({ error: e.message });
  }
};
