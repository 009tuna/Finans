# Finans — 30 Eylül 2026 canlı yayın

Canlı adres: https://finans-dashboard-iota.vercel.app/

Deployment: `dpl_3YitPhW9zzXGiHhFp54PcYEZ563A`

Deployment adresi: https://finans-dashboard-lai7q0qgp-tunahan81jb-7635s-projects.vercel.app/

Önceki sürüm: `dpl_A2fT5sRPfNfovQgg4gxR3yCj3ADz` — https://finans-dashboard-beobq50d0-tunahan81jb-7635s-projects.vercel.app/

## Yayın ve doğrulama

- Vercel CLI 61.1.0 ile bağlı Finans projesine üretim paketi oluşturuldu. Önce Render/WIF grafik uçları ve sayfa/API yanıtları doğrulandı; ardından deployment üretime promote edildi. Kalıcı canlı adres değişmedi.
- Yereldeki Karar Masası arayüzü, rapor sunumu ve kripto veri düzeltmeleri yayınlandı. Paket taramasında özel veri, ortam dosyaları, testler ve doküman içerikleri hariç tutuldu.
- `npm test`: 35 test dosyası, çıkış kodu 0. Çıktı: `2026-09-30-production-npm-test.txt`.
- Ana sayfa ve canlı `app.js` HTTP 200. Canlı uygulama kodunun SHA-256 değeri yereldeki dosyayla eşleşti.
- Fiyat/teknik analiz yayını mevcut yerel `src/fetch-all.js` akışıyla Supabase'e yapıldı. 30 Eylül 2026 **19:07:03 Türkiye saati** kaydı canlı `/api/data` üzerinden doğrulandı: **12/12 ABD, 100/100 BIST, 21/21 kripto teknik puanı; 21/21 kripto fiyatı**.
- Render ve WIF canlı grafikleri: HTTP 200, Binance kaynağı, 250 günlük mum, fallback yok.
- `/api/report`, `/api/research` ve `/api/portfolio` HTTP 200. Portföydeki mevcut tek pozisyon korunuyor.
- Yerel 5190 sunucusu yeni kodu yüklemesi için yeniden başlatıldı. Böylece eski süreç sonraki yenilemede eski kripto üreticisini kullanmaz.

Vercel API'ye Node bağlantısı bu bilgisayarda zaman aşımına uğradığından CLI işlemlerinde geçici, yalnız loopback'e bağlı Windows HTTPS aktarımı kullanıldı. TLS doğrulaması kapatılmadı. Yardımcılar `.vercel` içinde ve yayın paketinin dışında; hesabın CLI girişi kullanıcı tarafından onaylandı.

## Açık işler ve önerilen sıra

1. **Rapor/veri yayın düzeni:** Mevcut rapor 15:14 Türkiye saati analiz kesitine bağlı; yeni fiyat/teknik kesit 19:07. Bütünlük denetimi `snapshot-mismatch` / `context-mismatch` bildiriyor ve eski AI overlay'ini kullanmıyor. Fiyat yenilemesi ile araştırma kesitini ayrı izleyen, çalışma kimliği ve geçerlilik koşulları açık bir yayın düzeni gerekir. Bu yayın sırasında ek model çağrısı yapılmadı.
2. **Ölçüm:** Araştırma ledger'inde çalışma kimliği `ed2e0909-cfcf-4ffc-a965-779a0f8fb7e5` mevcut; araştırma tahmini ve ölçülmüş sonucu sıfır. Model yorumları bu nedenle ölçülmüş isabet olarak sunulamaz. Piyasa/vade/model bazlı kayıt, karşılaştırma ve örneklem görünümü sonraki ürün işi olmalı.
3. **Veri sağlığı:** Güncel/eksik varlık sayısı, kaynak ve gerçek veri zamanı, arıza ve yenileme durumu tek kontrol alanında toplanmalı. Özellikle masaüstü araştırma üreticisi ile bulut uygulamasının sorumlulukları açık olmalı.
4. **Portföy işlem defteri:** Mevcut pozisyon güncelleme anlamı korunuyor. Alış/satış/tarih/komisyon ve gerçekleşen kâr-zarar ayrı, açıkça tanımlanmış bir ürün paketi olarak eklenebilir.
5. **Manuel UX kabulü ve saha performansı:** NVDA, gerçek %200 yakınlaştırma, sistem hareket azaltma tercihi ve gerçek kullanıcı performans ölçümü açık. Önceki yerel ekran/kontrast kanıtı bu kontrollerin yerine geçmez.

Kanıtlar: `2026-09-30-prelive-verification.json`, `2026-09-30-live-verification.json`, `2026-09-30-production-data-refresh.txt`.

Geri dönüş gerekirse yukarıdaki önceki deployment, Vercel rollback akışıyla kullanılabilir. Veritabanı şeması değiştirilmedi; deployment rollback normal veri kayıtlarını geçmişe döndürmez.
