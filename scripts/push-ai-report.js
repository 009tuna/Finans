// Yerel Claude routine'in ürettiği data/report/ai.json'u Supabase reports tablosuna yazar.
// Routine, ai.json'u yazdıktan SONRA bu scripti çağırır → AI rapor buluta (Vercel'e) akar.
// base'i ezmez: saveReport kısmi sütun günceller.
'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { readJournal } = require('../src/decision-journal');
const { publish } = require('../src/ai-publication');

async function main() {
  const file = path.join(__dirname, '..', 'data', 'report', 'ai.json');
  if (!fs.existsSync(file)) {
    console.error('❌ ai.json bulunamadı:', file);
    process.exit(1);
  }
  const ai = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = await publish(ai, { db, readJournal, journalPath: path.join(__dirname, '..', 'data', 'journal.json') });
  console.log('✅ AI rapor yayinlandi ve geri okunarak dogrulandi:', result.date, result.runId);
}

if (require.main === module) main().catch((e) => { console.error('❌ push-ai-report hatası:', e.message); process.exit(1); });
module.exports = { main };
