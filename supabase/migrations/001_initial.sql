-- =====================================================
-- Finans Dashboard - İlk Şema Migrasyonu
-- Vercel + Supabase cloud migration için
-- =====================================================

-- 1. Portföy tablosu (SQLite'daki portfolio tablosunun karşılığı)
CREATE TABLE IF NOT EXISTS portfolio (
  market     TEXT    NOT NULL,
  symbol     TEXT    NOT NULL,
  amount     NUMERIC NOT NULL DEFAULT 0,
  avg_price  NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, symbol)
);

-- 2. Piyasa anlık görüntü tablosu (data/latest.json yerine)
-- Her runAll() çağrısında tek satır upsert edilir (id=1 sabit)
CREATE TABLE IF NOT EXISTS market_snapshots (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL,
  data         JSONB       NOT NULL
);

-- Tek satır politikası: id her zaman 1 olacak şekilde constraint
-- (INSERT OR REPLACE mantığı için ON CONFLICT DO UPDATE kullanılır)

-- 3. Günlük geçmiş tablosu (data/history.json yerine)
CREATE TABLE IF NOT EXISTS market_history (
  date         DATE PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL,
  scores       JSONB       NOT NULL DEFAULT '{}',
  prices       JSONB       NOT NULL DEFAULT '{}'
);

-- Son 120 kaydı otomatikte tutmak için trigger (opsiyonel, uygulama katmanında da yapılabilir)

-- 4. API önbellek tablosu (SQLite api_cache tablosunun karşılığı)
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key   TEXT        PRIMARY KEY,
  cache_value JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- İndeksler
-- =====================================================

-- Geçmişi tarihe göre sıralamak için indeks
CREATE INDEX IF NOT EXISTS idx_market_history_date ON market_history(date DESC);

-- Önbellek erişimi için (zaten PRIMARY KEY ama açıklık adına)
CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);

-- =====================================================
-- Row Level Security (RLS) - Temel güvenlik
-- Şimdilik: Anon key ile okuma, service role ile yazma
-- =====================================================

ALTER TABLE portfolio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_cache        ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (dashboard public erişim için)
CREATE POLICY "public_read_portfolio"        ON portfolio        FOR SELECT USING (true);
CREATE POLICY "public_read_snapshots"        ON market_snapshots FOR SELECT USING (true);
CREATE POLICY "public_read_history"          ON market_history   FOR SELECT USING (true);
CREATE POLICY "public_read_cache"            ON api_cache        FOR SELECT USING (true);

-- Yazma yalnızca service role (API routes ve cron job)
-- Service role RLS'yi bypass eder, bu yüzden ek policy gerekmez.
-- Anon key için yazma politikası: YALNIZCA authenticated kullanıcılar yazabilir
-- (şimdilik portfolio için anon write'a izin veriyoruz — gelecekte auth eklenecek)
CREATE POLICY "anon_write_portfolio"    ON portfolio FOR ALL USING (true) WITH CHECK (true);
