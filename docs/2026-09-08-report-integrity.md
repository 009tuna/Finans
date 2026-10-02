# Rapor ve sinyal bütünlüğü — 8 Eylül 2026

Bu belge ilk geliştirme paketinin kaydıdır. Sonraki araştırma entegrasyonu ve ölçüm katmanı için [güncel işletim belgesine](research.md) bakın.

İlk geliştirme paketi yanlış güncellik ve sahte kanıt sorunlarını giderir. Daha güçlü model kullanmak, eski haberi yeni sinyal yapan veya başarısız veri kaynağını boş takvim sayan bir sistemi düzeltmez.

## Değişen davranış

- Her temel rapor yeni `runId` ve dayandığı fiyat verisinin `snapshotId` değerini taşır. Yeni rapor eski AI içeriğini devralmaz.
- Rapor API'si ve tarayıcı aynı bütünlük kurallarını kullanır. Eksik, 36 saatten eski, gelecek tarihli veya farklı fiyat verisine bağlı analiz güncel yön sinyali olarak kullanılamaz. Eski teknik rapor açık uyarıyla okunabilir.
- Ham şirket haberi, anahtar kelime eşleşmesi ve yaklaşan bilanço tek başına yön puanı üretmez. Kaynak URL'si, zamanı ve geçerlilik süresi olan açık AI sinyalleri puanlanır; aynı kaynak/olay aynı hedef için iki kez sayılmaz. Net etki ±8 puanla sınırlıdır.
- Hazırlık eksikleri ve öğrenme notları yön puanından ayrıldı. `confidence` model görüşüdür; ölçülmüş başarı olasılığı değildir.
- Ekonomik takvim, bilançolar ve şirket haberleri bağımsız toplanır. Bir kaynağın hatası diğerlerini silmez. Kapsam durumları `available`, `partial`, `empty`, `unavailable` olarak saklanır. Haber sorgusu geçmiş üç güne bakar.
- Eksik makro kanıt toplam riski otomatik olarak düşük göstermez. Mevcut yüksek risk bulguları korunur.
- Tahmin günlüğü yazımı yetki ve sürüm kontrolü gerektirir. Çakışma 409, erişim hatası 503 döndürür. Tarayıcı sunucu tarafından üretilen tahminleri değiştiremez. Bulut kayıtlarında eski yerel dosyaya sessiz dönüş yapılmaz.
- Supabase çağrıları 12 saniye ile sınırlandırıldı. Rapor önce veritabanına yayınlanır; yerel dosyalar sonrasında oluşturulur. AI yayını temel raporun aynı çalışma kimliğini koruduğunu koşullu yazmayla kontrol eder.
- Windows akışı başarısız aşamada durur ve AI yayın doğrulamasını çalıştırır. GitHub akışı kaynak kapsamını çalışma özetine yazar; AI üretmediği için depodaki eski AI dosyasını arşivleme adımı kaldırıldı.

## Çalıştırma ve geçiş

Node 22 ve mevcut Supabase yapılandırması gerekir. Okuma için `SUPABASE_URL` / `SUPABASE_ANON_KEY`, yayın için `SUPABASE_SERVICE_ROLE_KEY`, haber/takvim için `FINNHUB_TOKEN` kullanılır. Günlük API yazımları mevcut `ADMIN_SECRET` korumasındadır. Yeni SQL göçü yoktur; mevcut `api_cache.updated_at` sürüm kontrolünde kullanılır.

1. `node src/fetch-all.js`
2. `node src/prediction-resolver.js`
3. `node src/report.js`
4. `routines/daily-report-prompt.md` doğrultusunda AI raporu üret. `runId` ve `snapshotId` değerlerini yeni temel rapordan al. Kanıt yoksa `signals: []` geçerlidir.
5. `node scripts/push-ai-report.js`

Bu komutlar gerçek veritabanına yazar. Eski AI dosyasına yeni tarih/kimlik eklemek geçerli geçiş değildir; analiz yeni temel raporla yeniden üretilmelidir. Günlük kaydında 409 alınırsa kaydı yeniden yükleyip kullanıcı notunu tekrar uygulamak gerekir.

## Doğrulama

`npm test`: 20 test dosyası geçti. Yeni testler eski/kaynaksız/tekrarlanan sinyalleri, eksik fiyat kesitini, kısmi sağlayıcı hatasını, başarısız yayını, yetkisiz yazımı ve eşzamanlı kayıt çakışmasını kapsar. Gerçek Supabase modülünün koşullu sorguları sahte istemciyle sınandı; canlı veritabanında yazma deneyi yapılmadı.

`node test/fixtures/integrity-dashboard.js` salt okunur sentetik paneli 5181 portunda açar. Tarayıcıda güncellik uyuşmazlığı, AI eksikliği, erişilemeyen takvim ve belirsiz risk durumu doğrulandı. Bu bir piyasa performansı testi değildir.

## Açık kalan işler

Bu paket yerel çalışma ağacındadır; canlı siteye dağıtılmadı. Windows AI üreticisi hâlâ Claude CLI'dır. `routines/astra-research-v2-draft.md` araştırma taslağıdır; Astra entegrasyonu, kalıcı olay/veri beklentisi kayıtları, gerçekleşen sonuçla forecast değerlendirmesi ve piyasa bazında başarı kalibrasyonu henüz uygulanmadı. URL biçimi kontrolü kaynağın iddiayı desteklediğini kanıtlamaz. Haber araştırmasının kaynak içeriğiyle doğrulanması sonraki katmanda gerekir.
