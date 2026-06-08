// Chart cache davranışı birim testi (Supabase async yapısına göre).
// db.getCache/setCache ve util.fetchJson mock'lanır → ağ/Supabase gerekmez, deterministik.
'use strict';
const assert = require('assert');

// --- db önbelleğini bellek-içi map ile mock'la ---
const db = require('../src/db');
const util = require('../src/util');

const memCache = new Map();
db.getCache = async (key) => {
  const e = memCache.get(key);
  return e ? { value: e.value, updatedAt: e.updatedAt } : null;
};
db.setCache = async (key, value) => {
  memCache.set(key, { value, updatedAt: Date.now() });
};

// --- ağ çağrısını (Yahoo) mock'la ---
let fetchCalls = 0;
let networkMode = 'ok'; // 'ok' | 'fail'
util.fetchJson = async () => {
  fetchCalls++;
  if (networkMode === 'fail') return { __error: 'HTTP 404' };
  return {
    chart: { result: [{
      timestamp: [1717372800, 1717459200],
      meta: { currency: 'USD', longName: 'Cache Test Inc.' },
      indicators: { quote: [{
        open: [100, 102], high: [105, 107], low: [95, 99], close: [102, 106], volume: [1000, 1200],
      }] },
    }] },
  };
};

// chart-data, db ve util'i modül-nesnesi üzerinden çağırdığı için mock'lar görünür.
const { fetchAssetChart } = require('../src/chart-data');

async function runTests() {
  console.log('🧪 Chart cache testleri (async Supabase) başlatılıyor...\n');

  // TEST 1: İlk istek → miss, cache'e yazılır, network 1 kez çağrılır
  console.log('1. İlk istek MISS + cache yazımı...');
  fetchCalls = 0; networkMode = 'ok';
  const r1 = await fetchAssetChart({ market: 'us', symbol: 'CACHETEST', interval: '1d', range: '1y' });
  assert.equal(r1.cache, 'miss');
  assert.equal(r1.symbol, 'CACHETEST');
  assert.equal(r1.bars[r1.bars.length - 1].close, 106);
  assert.equal(fetchCalls, 1);
  console.log('   ✓ Başarılı: ilk istek miss, network 1 kez çağrıldı.');

  // TEST 2: İkinci istek (TTL içinde) → HIT, network TEKRAR çağrılmaz
  //          (await bug'ı düzeltilmeden bu test geçmez — cache hep miss dönerdi.)
  console.log('2. İkinci istek HIT (await düzeltmesinin kanıtı)...');
  const r2 = await fetchAssetChart({ market: 'us', symbol: 'CACHETEST', interval: '1d', range: '1y' });
  assert.equal(r2.cache, 'hit');
  assert.equal(fetchCalls, 1); // artmadı → cache fiilen çalışıyor
  assert.equal(r2.bars[r2.bars.length - 1].close, 106);
  console.log('   ✓ Başarılı: ikinci istek cache hit, network çağrılmadı.');

  // TEST 3: Süresi dolmuş cache + ağ hatası → FALLBACK (eski veri korunur)
  console.log('3. Ağ hatasında FALLBACK (süresi dolmuş cache kurtarılır)...');
  const key = 'us:EXPIREDTEST:1d:1y:500';
  memCache.set(key, {
    value: {
      market: 'us', symbol: 'EXPIREDTEST', source: 'yahoo', interval: '1d', range: '1y',
      currency: 'USD', name: 'Expired', bars: [{ time: 1717372800, open: 50, high: 55, low: 45, close: 52, volume: 500 }],
    },
    updatedAt: Date.now() - 20 * 60 * 1000, // 20 dk önce (1d TTL 10 dk → süresi dolmuş)
  });
  networkMode = 'fail';
  const r3 = await fetchAssetChart({ market: 'us', symbol: 'EXPIREDTEST', interval: '1d', range: '1y' });
  assert.equal(r3.cache, 'fallback');
  assert.ok(r3.fallback);
  assert.equal(r3.bars[0].close, 52);
  console.log('   ✓ Başarılı: ağ hatasında eski veri fallback ile kurtarıldı.');

  console.log('\n🎉 Tüm chart cache testleri geçti.');
}

runTests().catch(err => {
  console.error('\n❌ TESTLERDE HATA:');
  console.error(err);
  process.exit(1);
});
