# Kripto veri onarımı — 30 Eylül 2026

## Sorun ve düzeltme

- Render ve WIF için kayıtlı kimlikler korunarak sağlayıcı kimlikleri `render-token` ve `dogwifcoin` olarak eşlendi.
- Teknik analiz ile grafik aynı Binance piyasa verisi adresini ve OHLCV doğrulama katmanını kullanıyor. Farklı dönem veya mum sayıları ayrı önbellek anahtarına sahip.
- Günlük geçmiş, `api_cache` içinde `crypto-series:<pair>:<interval>:<limit>` anahtarıyla Supabase'e kaydediliyor. Yerel dosya yalnız eski veri kurtarma için okunuyor.
- Önbellek yazımları atomik karşılaştırma kullanıyor. Daha eski mum veya daha erken başlamış yavaş istek, yeni seriyi ezemiyor.
- Bağlantı hatası, kısa geçmiş, eski veri ve önbellek arızası ayrılıyor. Fiyatı olan varlık listede kalıyor. Eski teknik puan güncel aday, AL rozeti veya işlem planı üretmiyor.
- Grafikte eski seri gösterildiğinde fallback durumu belirtiliyor; eski veri yeni tarih verilerek yeniden kaydedilmiyor.
- Windows yerel ortamında Node HTTPS ile Binance erişimi bu çalışmada başarısız oldu. Aynı URL Windows HTTPS taşıyıcısıyla HTTP 200 ve 250 mum döndürdü. Kripto istekleri yerelde mevcut Windows taşıyıcısını kullanıyor; Vercel/Linux native bağlantıyı sürdürüyor. Bu bulgu bulut hatasının kesin nedeni olarak sunulamaz.
- İstek zaman aşımı JSON gövdesinin okunmasını da kapsıyor.

## Doğrulama

Gerçek kaynak kontrolü: **21/21 fiyat, 21/21 güncel teknik hesaplama, her varlıkta 250 günlük mum, sıfır uyarı**. Kontrol 30 Eylül 2026, 18:36:46 Türkiye saatinde tamamlandı.

Yeni süreçte dış kaynak isteği bilinçli olarak engellendi: **21/21 seri Supabase'ten okundu, sıfır ağ isteği**. Bu kontrol kalıcı önbelleği doğrular; sağlayıcıya sürekli erişim garantisi değildir.

`npm test` içindeki 35 test dosyası geçti. Yeni kontroller kimlik eşlemesi, kayıt hataları, kısa/bozuk seri, yeniden başlama, aynı mumda geciken istek, eski grafik, fiyatı olan puansız varlık, kaynak hatasının HTML kaçışı ve veri zamanının korunmasını kapsıyor.

Kanıt dosyaları:

- `2026-09-30-crypto-native-network-check.json`: ilk yerel bağlantı başarısızlığı ve eski veri kurtarma.
- `2026-09-30-crypto-provider-check.json`: düzeltilmiş üretim kodu ile gerçek sağlayıcı kontrolü.
- `2026-09-30-crypto-cache-restart-check.json`: yeni süreçte ağ isteği olmadan Supabase okuma.

Yeniden kontrol: `node scripts/check-crypto-data.js docs/research-audit/crypto-provider-check.json`. Komut yalnız kripto seri önbelleğine yazabilir; snapshot, araştırma, portföy ve tahmin sonuçlarını yayınlamaz.

## Teslim sınırı

Kod düzeltmeleri yereldedir; canlı uygulamaya deployment yapılmadı. Bu çalışmada snapshot/rapor yeniden yayınlanmadı, kayıtlı tahmin sonuçları ve finansal hesap formülleri değiştirilmedi. Supabase'e yalnız seri önbelleği yazıldı. Canlı kabul için yeni kod yayınlandıktan sonra veri yenileme ve `/api/data` ile `/api/chart` doğrulaması gerekir.

Binance güncel günlük mumunun tamamlanmış olduğu varsayılmıyor; arayüz mum başlangıç zamanını gösteriyor. Günlük mum kapanışı veya tahmin çözümleme politikası bu pakette değiştirilmedi.
