// Supabase Management API ile SQL migration çalıştırır
// Personal Access Token kullanır - mcp_config.json'daki token
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Token'ı .env.local'dan oku — ASLA hardcode etme (Management API tam proje yetkisi verir).
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') }); } catch (_) {}

const PAT         = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'xbdxglqksoqlwlanwnui';

if (!PAT) {
  console.error('❌ SUPABASE_ACCESS_TOKEN tanımlı değil.');
  console.error('   .env.local içine ekleyin: SUPABASE_ACCESS_TOKEN=sbp_xxx');
  console.error('   (Supabase > Account > Access Tokens)');
  process.exit(1);
}

function apiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.supabase.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('🚀 Supabase SQL Migration başlatılıyor...\n');

  // SQL dosyasını oku (CLI arg ile seçilebilir: node scripts/run-migration.js 002_security.sql)
  const migFile = process.argv[2] || '001_initial.sql';
  const sqlFile = path.join(__dirname, '..', 'supabase', 'migrations', migFile);
  console.log(`📄 Migration dosyası: ${migFile}`);
  const fullSQL = fs.readFileSync(sqlFile, 'utf8');

  // Management API /v1/projects/{ref}/database/query endpoint'i
  console.log('📡 Management API ile SQL çalıştırılıyor...');
  const res = await apiRequest(
    'POST',
    `/v1/projects/${PROJECT_REF}/database/query`,
    { query: fullSQL }
  );

  console.log('Status:', res.status);
  if (res.status === 200 || res.status === 201) {
    console.log('✅ Migration başarılı!');
  } else {
    console.log('Response:', JSON.stringify(res.body, null, 2).slice(0, 500));

    // Tek tek statement çalıştır
    console.log('\n🔄 Statement bazında çalıştırılıyor...');
    const statements = fullSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 10 && !s.startsWith('--'));

    let ok = 0, err = 0;
    for (const stmt of statements) {
      const r = await apiRequest(
        'POST',
        `/v1/projects/${PROJECT_REF}/database/query`,
        { query: stmt }
      );
      if (r.status === 200 || r.status === 201) {
        ok++;
      } else {
        const msg = typeof r.body === 'object' ? (r.body.message || r.body.error || JSON.stringify(r.body)) : r.body;
        // Zaten varsa ignore et
        if (msg && (msg.includes('already exists') || msg.includes('zaten var'))) {
          ok++;
        } else {
          console.warn(`  ⚠️  [${r.status}] ${String(msg).slice(0, 120)}`);
          err++;
        }
      }
    }
    console.log(`\n  ✅ Başarılı: ${ok} | ❌ Hata: ${err}`);
  }

  // Doğrulama: tabloları listele
  console.log('\n🔍 Tablolar kontrol ediliyor...');
  const tablesRes = await apiRequest('GET', `/v1/projects/${PROJECT_REF}/database/tables?schema=public`);
  if (tablesRes.status === 200 && Array.isArray(tablesRes.body)) {
    const names = tablesRes.body.map(t => t.name);
    const expected = ['portfolio', 'market_snapshots', 'market_history', 'api_cache'];
    expected.forEach(t => {
      console.log(names.includes(t) ? `  ✅ ${t}` : `  ❌ ${t} (oluşturulamadı!)`);
    });
  } else {
    console.log('  Tablo listesi alınamadı:', JSON.stringify(tablesRes.body).slice(0, 200));
  }
}

main().catch(e => { console.error('❌ Hata:', e.message); process.exit(1); });
