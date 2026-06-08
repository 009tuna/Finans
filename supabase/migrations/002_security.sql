-- =====================================================
-- Faz 0 Güvenlik: Public portföy yazımını kapat
-- =====================================================
-- 001_initial.sql, anon anahtarla herkese portföy yazma/silme izni veriyordu
-- ("anon_write_portfolio" FOR ALL USING(true) WITH CHECK(true)). Anon anahtar
-- tarayıcıya gittiği için public Vercel URL'inde portföy dışarıdan ezilebiliyordu.
--
-- Çözüm: Bu politikayı kaldır. Yazma artık YALNIZCA service_role ile yapılır
-- (RLS'yi bypass eder). Anon yalnızca okuyabilir (public_read_portfolio kalır).
-- API tarafında ayrıca ADMIN_SECRET header koruması var (src/admin-auth.js).

DROP POLICY IF EXISTS "anon_write_portfolio" ON portfolio;

-- Not: Service role ile yazma için Vercel/GitHub env'de SUPABASE_SERVICE_ROLE_KEY
-- tanımlı olmalı (src/db.js supabaseAdmin bunu kullanır).
