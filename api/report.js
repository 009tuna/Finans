// GET /api/report — base.json + ai.json raporlarını birleştirerek döndürür
// Not: Raporlar şu an dosya tabanlı. Supabase'e taşınabilir ama scope dışı bırakıldı.
'use strict';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel serverless ortamında /data klasörü yazılabilir değil.
  // Rapor özelliği için Supabase'e taşıma gerekiyor — şimdilik boş döndür.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ base: null, ai: null });
};
