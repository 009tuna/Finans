// GET /api/portfolio  — Portföy verilerini döndürür
// POST /api/portfolio — Portföy verilerini günceller
'use strict';

const { getPortfolio, savePortfolio } = require('../src/db');
const { isAuthorized } = require('../src/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    try {
      const portfolio = await getPortfolio();
      return res.status(200).json(portfolio);
    } catch (e) {
      console.error('[api/portfolio GET] hata:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Yetkisiz: admin parolası gerekli' });
      }
      // Vercel, body'yi otomatik parse eder (Content-Type: application/json ise)
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Geçersiz JSON verisi' });
      }
      await savePortfolio(body);
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[api/portfolio POST] hata:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
