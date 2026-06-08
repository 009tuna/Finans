// Yerel Claude routine'in ürettiği data/report/ai.json'u Supabase reports tablosuna yazar.
// Routine, ai.json'u yazdıktan SONRA bu scripti çağırır → AI rapor buluta (Vercel'e) akar.
// base'i ezmez: saveReport kısmi sütun günceller.
'use strict';
const fs = require('fs');
const path = require('path');
const { saveReport } = require('../src/db');

async function main() {
  const file = path.join(__dirname, '..', 'data', 'report', 'ai.json');
  if (!fs.existsSync(file)) {
    console.error('❌ ai.json bulunamadı:', file);
    process.exit(1);
  }
  const ai = JSON.parse(fs.readFileSync(file, 'utf8'));
  const date = (ai.date || ai.generatedAt || new Date().toISOString()).slice(0, 10);
  await saveReport(date, { ai });
  console.log('✅ AI rapor Supabase\'e yazıldı:', date);
}

main().catch((e) => { console.error('❌ push-ai-report hatası:', e.message); process.exit(1); });
