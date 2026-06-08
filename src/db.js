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
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Yazma için service role key (RLS bypass + cron job)
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : supabase; // Fallback: yoksa anon client kullan (write policy açık)

// =====================================================
// PORTFÖY
// =====================================================

/**
 * Tüm portföy kayıtlarını Supabase'den çeker.
 * @returns {{ us: [], bist: [], crypto: [] }}
 */
async function getPortfolio() {
  const empty = { us: [], bist: [], crypto: [] };
  if (!supabase) return empty;

  try {
    const { data, error } = await supabase
      .from('portfolio')
      .select('*');

    if (error) throw error;
    if (!data || data.length === 0) return empty;

    const portfolio = { us: [], bist: [], crypto: [] };
    data.forEach(row => {
      const m = row.market.toLowerCase();
      if (portfolio[m]) {
        portfolio[m].push({
          symbol:   row.symbol,
          amount:   row.amount,
          avgPrice: row.avg_price
        });
      }
    });
    return portfolio;
  } catch (e) {
    console.error('⚠️  [db] getPortfolio hatası:', e.message);
    return empty;
  }
}

/**
 * Portföy verilerini Supabase'e kaydeder.
 * Tüm mevcut kayıtları siler ve yeniden ekler (atomic upsert).
 * @param {{ us: [], bist: [], crypto: [] }} portfolio
 */
async function savePortfolio(portfolio) {
  if (!supabaseAdmin) return;

  try {
    // 1. Mevcut tüm portföy kayıtlarını sil
    const { error: delErr } = await supabaseAdmin
      .from('portfolio')
      .delete()
      .neq('market', '___never___'); // Tüm satırları sil

    if (delErr) throw delErr;

    // 2. Yeni kayıtları hazırla
    const rows = [];
    const addList = (list, market) => {
      (list || []).forEach(item => {
        if (item && item.symbol) {
          rows.push({
            market:    market.toLowerCase(),
            symbol:    item.symbol.toUpperCase().trim(),
            amount:    parseFloat(item.amount)   || 0,
            avg_price: parseFloat(item.avgPrice) || 0,
            updated_at: new Date().toISOString()
          });
        }
      });
    };

    addList(portfolio.us,     'us');
    addList(portfolio.bist,   'bist');
    addList(portfolio.crypto, 'crypto');

    if (rows.length === 0) return;

    // 3. Toplu insert
    const { error: insErr } = await supabaseAdmin
      .from('portfolio')
      .insert(rows);

    if (insErr) throw insErr;
  } catch (e) {
    console.error('⚠️  [db] savePortfolio hatası:', e.message);
    throw e;
  }
}

// =====================================================
// PİYASA SNAPSHOT (latest.json yerine)
// =====================================================

/**
 * En son piyasa verisi anlık görüntüsünü döndürür.
 * @returns {object|null}
 */
async function getLatestSnapshot() {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('data')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = row not found
    return data ? data.data : null;
  } catch (e) {
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
  if (!supabaseAdmin) return;

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
  if (!supabaseAdmin) return;

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
async function getCache(key) {
  if (!supabase) return null;

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
      updatedAt: new Date(data.updated_at).getTime()
    };
  } catch (e) {
    console.error('⚠️  [db] getCache hatası:', e.message);
    return null;
  }
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
async function getReport(date) {
  const empty = { base: null, ai: null, date: null };
  if (!supabase) return empty;

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
  if (!supabaseAdmin) return;

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
  getReport,
  saveReport
};
