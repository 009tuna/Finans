'use strict';

const fs = require('fs');
const path = require('path');

let db = null;
try {
  db = require('../src/db');
} catch (e) {
  // Ignore
}

// Local dotenv load
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') }); } catch (_) {}

async function run() {
  const aiPath = path.join(__dirname, '../data/report/ai.json');
  const archivePath = path.join(__dirname, '../data/report/tips-archive.json');

  if (!fs.existsSync(aiPath)) {
    console.log('⚠️ [archive-tip] data/report/ai.json bulunamadı. Sonlandırılıyor.');
    return;
  }

  let ai = {};
  try {
    ai = JSON.parse(fs.readFileSync(aiPath, 'utf8'));
  } catch (e) {
    console.error('❌ [archive-tip] ai.json okuma hatası:', e.message);
    return;
  }

  const tip = ai.literacyTip;
  if (!tip || !tip.title || !tip.body) {
    console.log('⚠️ [archive-tip] ai.json içinde geçerli bir literacyTip bulunamadı.');
    return;
  }

  const date = ai.generatedAt ? ai.generatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

  // Read archive
  let archive = [];
  if (db && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const cached = await db.getCache('tips_archive');
      if (cached && Array.isArray(cached.value)) {
        archive = cached.value;
      }
    } catch (e) {
      console.warn('⚠️ [archive-tip] Supabase read error, falling back to file:', e.message);
    }
  }

  if (archive.length === 0 && fs.existsSync(archivePath)) {
    try {
      archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    } catch (e) {
      console.warn('⚠️ [archive-tip] tips-archive.json okuma hatası, sıfırlanıyor:', e.message);
    }
  }

  if (!Array.isArray(archive)) {
    archive = [];
  }

  // Idempotent check
  const exists = archive.some(x => x.date === date);
  if (exists) {
    console.log(`ℹ️ [archive-tip] ${date} tarihi için zaten bir tip arşivlenmiş. Atlanıyor.`);
    return;
  }

  archive.push({
    date,
    title: tip.title,
    body: tip.body
  });

  // Write to local file
  try {
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2) + '\n');
    console.log(`✅ [archive-tip] ${date} ipucu local arşive eklendi.`);
  } catch (e) {
    console.error('❌ [archive-tip] tips-archive.json yazma hatası:', e.message);
  }

  // Write to Supabase if active
  if (db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await db.setCache('tips_archive', archive);
      console.log('✅ [archive-tip] İpuçları arşivi Supabase\'e kaydedildi.');
    } catch (e) {
      console.error('❌ [archive-tip] Supabase cache write error:', e.message);
    }
  }
}

run().catch(err => {
  console.error('❌ [archive-tip] Hata:', err);
  process.exit(1);
});
