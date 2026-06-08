-- =====================================================
-- Günlük Rapor tablosu (data/report/*.json yerine)
-- base: deterministik teknik özet + takvim (src/report.js, GH Action'da üretilir)
-- ai:   Claude rutininin makro/senaryo katmanı (yerel routine Supabase'e yazar)
-- İkisi AYRI yazılır (base GH Action, ai yerel) → upsert kısmi sütun günceller.
-- =====================================================

CREATE TABLE IF NOT EXISTS reports (
  date       DATE PRIMARY KEY,
  base       JSONB,
  ai         JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (panel public erişim)
CREATE POLICY "public_read_reports" ON reports FOR SELECT USING (true);

-- Yazma yalnızca service_role (RLS bypass) — GH Action ve yerel routine service key kullanır.
