// POST /api/refresh — Tüm piyasa verilerini yeniden çeker ve Supabase'e yazar
'use strict';

const { runAll } = require('../src/fetch-all');
const { isAuthorized } = require('../src/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Yetkisiz: admin parolası gerekli' });
  }

  try {
    const snap = await runAll();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(snap);
  } catch (e) {
    console.error('[api/refresh] hata:', e.message);
    res.status(500).json({ error: e.message });
  }
};
