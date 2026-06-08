// Supabase migration'ı çalıştırır ve bağlantıyı test eder
// Kullanım: node scripts/setup-supabase.js
'use strict';

try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }); } catch (_) {}

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli!');
  console.error('   .env.local dosyasına ekleyin:');
  console.error('   SUPABASE_URL=https://xbdxglqksoqlwlanwnui.supabase.co');
  console.error('   SUPABASE_ANON_KEY=eyJ...');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJ...');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Supabase migration başlatılıyor...');
  console.log('   URL:', SUPABASE_URL);

  // SQL migration dosyasını oku
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // SQL'i tek seferde çalıştıramayız (Supabase JS client raw SQL desteği kısıtlı)
  // Her statement'ı ayrı ayrı çalıştırıyoruz
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });
      if (error) {
        // exec_sql RPC yoksa alternatif yöntem
        if (error.message.includes('exec_sql')) {
          console.log('ℹ️  exec_sql RPC bulunamadı, SQL Editor üzerinden çalıştırın.');
          break;
        }
        console.warn('⚠️  Statement hatası:', error.message.slice(0, 100));
        errorCount++;
      } else {
        successCount++;
      }
    } catch (e) {
      errorCount++;
    }
  }

  if (errorCount > 0) {
    console.log('\n📋 Migration SQL\'i Supabase Dashboard SQL Editor\'de çalıştırın:');
    console.log('   https://supabase.com/dashboard/project/xbdxglqksoqlwlanwnui/sql/new');
    console.log('\n   SQL dosyası:', sqlPath);
  }

  // Bağlantı testi
  console.log('\n🔍 Bağlantı testi yapılıyor...');
  try {
    const { data, error } = await supabase.from('portfolio').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.log('❌ portfolio tablosu erişim hatası:', error.message);
      console.log('   → SQL migration\'ını önce çalıştırın');
    } else {
      console.log('✅ portfolio tablosu erişilebilir!');
    }
  } catch (e) {
    console.log('❌ Bağlantı hatası:', e.message);
  }

  try {
    const { data, error } = await supabase.from('market_snapshots').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.log('❌ market_snapshots tablosu erişim hatası:', error.message);
    } else {
      console.log('✅ market_snapshots tablosu erişilebilir!');
    }
  } catch (e) {}

  try {
    const { data, error } = await supabase.from('market_history').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.log('❌ market_history tablosu erişim hatası:', error.message);
    } else {
      console.log('✅ market_history tablosu erişilebilir!');
    }
  } catch (e) {}

  try {
    const { data, error } = await supabase.from('api_cache').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.log('❌ api_cache tablosu erişim hatası:', error.message);
    } else {
      console.log('✅ api_cache tablosu erişilebilir!');
    }
  } catch (e) {}
}

runMigration().catch(e => {
  console.error('Migration hatası:', e.message);
  process.exit(1);
});
