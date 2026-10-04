// Supabase Tabanlı Veri Yönetim Sistemi
// SQLite + fs yerine Supabase PostgreSQL kullanır.
// Vercel serverless ve GitHub Actions ortamlarında çalışır.
'use strict';

// Local geliştirme için .env.local'ı yükle (Vercel ve GitHub Actions'ta gerek yok)
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }); } catch (_) {}

const { createClient } = require('@supabase/supabase-js');

// ----- Supabase bağlantısı -----
// Vercel'de env vars otomatik inject edilir.
// Local dev için .env.local kullanılır (vercel dev komutu okur).
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️  [db] SUPABASE_URL veya SUPABASE_ANON_KEY eksik. .env.local dosyasını kontrol edin.');
}

// Okuma için anon key (public RLS policy ile uyumlu)
const databaseFetch = process.platform === 'win32' && !process.env.VERCEL ? require('./windows-fetch').windowsFetch : (...args) => fetch(...args);
const clientOptions = { global: { fetch: (input, init = {}) => databaseFetch(input, {
  ...init,
  signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
}) } };
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions)
  : null;

// Yazma için service role key (RLS bypass + cron job)
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, clientOptions)
  : supabase; // Fallback: yoksa anon client kullan (write policy açık)

// =====================================================
// PORTFÖY
// =====================================================

/**
 * Tüm portföy kayıtlarını Supabase'den çeker.
 * @returns {{ us: [], bist: [], crypto: [] }}
 */
async function getPortfolio() {
  if (!supabase) throw new Error('Portföy için veritabanı bağlantısı gerekli');
  const { portfolioFromRows, completePortfolioRows } = require('./portfolio-storage');
  const rows = completePortfolioRows(await supabase.from('portfolio').select('*', { count: 'exact' }));
  return portfolioFromRows(rows);
}

/**
 * Portföy verilerini Supabase'e kaydeder.
 * Yeni satırları tek upsert ile kaydeder, ardından yalnız ilk okumada gözlenen
 * kaldırılmış satırları temizler. Adımların tamamı tek transaction değildir;
 * başarı ancak son okuma hedef portföyle birebir uyuşursa bildirilir.
 * @param {{ us: [], bist: [], crypto: [] }} portfolio
 */
async function savePortfolio(portfolio) {
  const { normalizePortfolioInput, completePortfolioRows, samePortfolioRows, removedPortfolioFilter } = require('./portfolio-storage');
  const rows = normalizePortfolioInput(portfolio);
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) throw new Error('Portföy için veritabanı yazma yetkisi gerekli');
  const read = async () => completePortfolioRows(await supabaseAdmin.from('portfolio').select('*', { count: 'exact' }));
  const previous = await read();
  const nextKeys = new Set(rows.map(row => row.market + ':' + row.symbol));
  const removed = previous.filter(row => !nextKeys.has(row.market + ':' + row.symbol));
  // Build and validate the narrow deletion predicate before the first mutation.
  const removeFilter = removedPortfolioFilter(removed);
  if (rows.length) {
    const updatedAt = new Date().toISOString();
    const payload = rows.map(row => ({ ...row, updated_at: updatedAt }));
    const saved = completePortfolioRows(await supabaseAdmin.from('portfolio')
      .upsert(payload, { onConflict: 'market,symbol', count: 'exact' }).select('*'));
    if (!samePortfolioRows(saved, rows)) throw new Error('Portföy yazma sonucu doğrulanamadı');
  }
  if (removed.length) {
    const deleted = completePortfolioRows(await supabaseAdmin.from('portfolio')
      .delete({ count: 'exact' }).or(removeFilter).select('*'));
    if (!samePortfolioRows(deleted, removed)) throw new Error('Portföy temizleme sonucu doğrulanamadı');
  }
  if (!samePortfolioRows(await read(), rows)) throw new Error('Portföy kaydının son hali doğrulanamadı');
  return true;
}

// =====================================================
// PİYASA SNAPSHOT (latest.json yerine)
// =====================================================

/**
 * En son piyasa verisi anlık görüntüsünü döndürür.
 * @returns {object|null}
 */
async function getLatestSnapshot({ strict = false } = {}) {
  if (!supabase) {
    if (strict) throw new Error('Veritabani baglantisi gerekli');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('data')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = row not found
    return data ? data.data : null;
  } catch (e) {
    if (strict) throw e;
    console.error('⚠️  [db] getLatestSnapshot hatası:', e.message);
    return null;
  }
}

/**
 * Piyasa verisi anlık görüntüsünü Supabase'e kaydeder.
 * Her zaman id=1 satırını upsert eder (tek satır politikası).
 * @param {object} snapshot
 */
async function saveSnapshot(snapshot) {
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) throw new Error('Snapshot icin veritabani yazma yetkisi gerekli');

  try {
    const { error } = await supabaseAdmin
      .from('market_snapshots')
      .upsert({
        id:           1,
        generated_at: snapshot.generatedAt || new Date().toISOString(),
        data:         snapshot
      }, { onConflict: 'id' });

    if (error) throw error;
  } catch (e) {
    console.error('⚠️  [db] saveSnapshot hatası:', e.message);
    throw e;
  }
}

// =====================================================
// GEÇMİŞ (history.json yerine)
// =====================================================

/**
 * Günlük geçmiş kayıtlarını döndürür (son 120 gün).
 * @returns {Array}
 */
async function getHistory() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('market_history')
      .select('date, generated_at, scores, prices')
      .order('date', { ascending: true })
      .limit(120);

    if (error) throw error;

    // history.json formatıyla uyumlu hale getir: { date, t, scores, prices }
    return (data || []).map(row => ({
      date:   row.date,
      t:      row.generated_at,
      scores: row.scores,
      prices: row.prices
    }));
  } catch (e) {
    console.error('⚠️  [db] getHistory hatası:', e.message);
    return [];
  }
}

/**
 * Günlük geçmiş kaydını ekler veya günceller.
 * @param {object} snapshot - runAll() tarafından döndürülen snapshot
 */
async function appendHistory(snapshot) {
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) throw new Error('Gecmis icin veritabani yazma yetkisi gerekli');

  try {
    const date = snapshot.generatedAt.slice(0, 10);
    const scores = {};
    const prices = {};

    const collect = (arr, pfx) => arr.forEach(x => {
      if (!x.analysis || x.analysis.score == null) return;
      const k = pfx + x.symbol;
      scores[k] = x.analysis.score;
      if (typeof x.price === 'number') prices[k] = x.price;
    });

    collect(snapshot.us     || [], 'US:');
    collect(snapshot.bist   || [], 'BIST:');
    collect(snapshot.crypto || [], 'CRYPTO:');

    const { error } = await supabaseAdmin
      .from('market_history')
      .upsert({
        date,
        generated_at: snapshot.generatedAt,
        scores,
        prices
      }, { onConflict: 'date' });

    if (error) throw error;

    // 120 günden eski kayıtları temizle
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    await supabaseAdmin
      .from('market_history')
      .delete()
      .lt('date', cutoff.toISOString().slice(0, 10));

  } catch (e) {
    console.error('⚠️  [db] appendHistory hatası:', e.message);
    throw e;
  }
}

// =====================================================
// API ÖNBELLEĞİ
// =====================================================

/**
 * Önbellekten veri sorgular.
 * @param {string} key
 * @returns {{ value: any, updatedAt: number }|null}
 */
async function getCache(key, { strict = false } = {}) {
  if (!supabase) {
    if (strict) throw new Error('Veritabani baglantisi yapilandirilmadi');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('api_cache')
      .select('cache_value, updated_at')
      .eq('cache_key', key)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    return {
      value:     data.cache_value,
      revision:  data.updated_at,
      updatedAt: new Date(data.updated_at).getTime()
    };
  } catch (e) {
    if (strict) throw e;
    console.error('⚠️  [db] getCache hatası:', e.message);
    return null;
  }
}

// Atomic compare-and-set: a stale reader must never overwrite newer predictions.
async function compareAndSetCache(key, value, expectedRevision) {
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) throw new Error('Veritabani yazma yetkisi yapilandirilmadi');
  const revision = new Date(Math.max(Date.now(), (Date.parse(expectedRevision) || 0) + 1)).toISOString();
  const row = { cache_key: key, cache_value: value, updated_at: revision };
  const query = expectedRevision === null
    ? supabaseAdmin.from('api_cache').insert(row)
    : supabaseAdmin.from('api_cache').update(row).eq('cache_key', key).eq('updated_at', expectedRevision);
  const { data, error } = await query.select('updated_at');
  if (error && error.code !== '23505') throw error;
  if (error || !data || data.length !== 1) {
    const conflict = new Error('Kayit baska bir islem tarafindan degistirildi. Guncel kaydi yeniden yukleyin.');
    conflict.statusCode = 409;
    throw conflict;
  }
  return data[0].updated_at;
}

/**
 * Veriyi önbelleğe yazar.
 * @param {string} key
 * @param {any} value
 */
async function setCache(key, value) {
  if (!supabaseAdmin) return;

  try {
    const { error } = await supabaseAdmin
      .from('api_cache')
      .upsert({
        cache_key:   key,
        cache_value: value,
        updated_at:  new Date().toISOString()
      }, { onConflict: 'cache_key' });

    if (error) throw error;
  } catch (e) {
    console.error('⚠️  [db] setCache hatası:', e.message);
  }
}

// =====================================================
// GÜNLÜK RAPOR (data/report/*.json yerine)
// =====================================================

/**
 * Rapor kaydını döndürür. date verilmezse en son raporu getirir.
 * @param {string} [date] YYYY-MM-DD
 * @returns {{ base: object|null, ai: object|null, date: string|null }}
 */
async function getReport(date, { strict = false } = {}) {
  const empty = { base: null, ai: null, date: null };
  if (!supabase) {
    if (strict) throw new Error('Veritabani baglantisi gerekli');
    return empty;
  }

  try {
    let query = supabase.from('reports').select('date, base, ai');
    query = date
      ? query.eq('date', date)
      : query.order('date', { ascending: false }).limit(1);

    const { data, error } = await query;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { base: row.base || null, ai: row.ai || null, date: row.date } : empty;
  } catch (e) {
    if (strict) throw e;
    console.error('⚠️  [db] getReport hatası:', e.message);
    return empty;
  }
}

/**
 * Rapor satırını upsert eder. base ve ai AYRI yazılabilir; verilmeyen alan korunur
 * (Supabase upsert yalnızca sağlanan sütunları günceller).
 * @param {string} date YYYY-MM-DD
 * @param {{ base?: object, ai?: object }} fields
 */
async function saveReport(date, fields = {}) {
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) throw new Error('Rapor icin veritabani yazma yetkisi gerekli');

  try {
    const row = { date, updated_at: new Date().toISOString() };
    if (fields.base !== undefined) row.base = fields.base;
    if (fields.ai !== undefined) row.ai = fields.ai;

    const { error } = await supabaseAdmin
      .from('reports')
      .upsert(row, { onConflict: 'date' });

    if (error) throw error;
  } catch (e) {
    console.error('⚠️  [db] saveReport hatası:', e.message);
    throw e;
  }
}

async function publishAiReport(date, runId, fields) {
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) throw new Error('Rapor icin veritabani yazma yetkisi gerekli');
  const { data, error } = await supabaseAdmin.from('reports')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('date', date).eq('base->>runId', runId).select('date');
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error('Temel rapor degisti; eski AI raporu yayinlanmadi');
}

module.exports = {
  supabase,
  supabaseAdmin,
  getPortfolio,
  savePortfolio,
  getLatestSnapshot,
  saveSnapshot,
  getHistory,
  appendHistory,
  getCache,
  setCache,
  compareAndSetCache,
  getReport,
  saveReport,
  publishAiReport
};
