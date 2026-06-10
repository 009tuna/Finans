// GET /api/report — Supabase reports tablosundan en son base + ai raporunu döndürür
'use strict';

const { getReport, getCache } = require('../src/db');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const r = await getReport(); // en son rapor
    
    // Read tips archive
    let tipsArchive = [];
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        const cached = await getCache('tips_archive');
        if (cached && Array.isArray(cached.value)) {
          tipsArchive = cached.value;
        }
      } catch (e) {
        console.warn('[api/report] Supabase tips_archive okuma hatası:', e.message);
      }
    }
    
    if (tipsArchive.length === 0) {
      const archivePath = path.join(__dirname, '../data/report/tips-archive.json');
      if (fs.existsSync(archivePath)) {
        try {
          tipsArchive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
        } catch (e) {
          console.warn('[api/report] tips-archive.json okuma hatası:', e.message);
        }
      }
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ 
      base: r.base || null, 
      ai: r.ai || null, 
      date: r.date || null,
      tipsArchive: tipsArchive
    });
  } catch (e) {
    console.error('[api/report] hata:', e.message);
    res.status(500).json({ error: e.message });
  }
};
