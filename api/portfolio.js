// GET /api/portfolio  — Portföy verilerini döndürür
// POST /api/portfolio — Portföy verilerini günceller
'use strict';

const { getPortfolio, savePortfolio } = require('../src/db');
const { isAuthorized } = require('../src/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const portfolio = await getPortfolio();
      return res.status(200).json(portfolio);
    } catch (e) {
      console.error('[api/portfolio GET] portföy kaynağı doğrulanamadı');
      return res.status(503).json({ error: 'Portföy kaynağına erişilemedi. Son başarılı kayıt korunur; tekrar deneyin.' });
    }
  }

  if (req.method === 'POST') {
    try {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Yetkisiz: admin parolası gerekli' });
      }
      // Vercel, body'yi otomatik parse eder (Content-Type: application/json ise)
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await savePortfolio(body);
      return res.status(200).json({ success: true });
    } catch (e) {
      const invalid = e instanceof SyntaxError || e?.statusCode === 400;
      if (!invalid) console.error('[api/portfolio POST] portföy kaydı doğrulanamadı');
      return res.status(invalid ? 400 : 503).json({ error: invalid
        ? 'Portföy verisi geçersiz. Piyasa listelerini, sembolleri, adet ve maliyetleri kontrol edin.'
        : 'Portföy kaydının sonucu doğrulanamadı. Veriyi yenileyip son kaydı kontrol edin; taslağınız korunur.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
