# Sinyal kapsamı ve araç erişimi onarımı · 13 Ekim 2026

Canlı incelemede 12 ABD ve 100 BIST varlığının tamamı `calendar-unverified` nedeniyle yeni yapısal kayıt açamıyordu. Yahoo serisi, yeni yöntemin istediği `sessionCalendar` alanını hiç sağlamıyordu. Kriptoda 21 seans kaynağı doğrulanmıştı; 16 varlıkta destek geçersizleşmiş, dört varlıkta trend kapısı, bir varlıkta tetik eksikliği vardı. Yeni yapısal kayıt sayısı sıfırdı; 374 eski kayıttan 16'sı açıktı. Mevcut teknik AL/GÜÇLÜ AL adayları 31'di. Bu sayılar inceleme kesitidir, canlı sonuç veya başarı oranı değildir.

## Değişiklikler

- Resmî kaynaklara bağlı, borsa kimliği ve saat dilimi doğrulanan seans adaptörü eklendi. NASDAQ 2025–2026, NYSE ailesi 2025–2027 kapsamındadır; tatiller, yarım günler ve DST korunur. Bilinmeyen borsa/yıl veya çelişkili saatler güvenilir sayılmaz.
- BIST'in Yahoo seans saatleriyle resmî işlem saatleri çelişir; kesin açılış anı desteklenmiyor. BIST otomatik girişleri hâlâ kapalıdır. Kaynak kanıtı ve özel hata nedenleri artık normalizasyon sırasında kaybolmaz.
- Sinyaller ekranı teknik adayları, önceki açık kayıtları ve yapısal işlemleri ayrı sekmelerde gösterir. Yeni işlem yoksa mevcut adaylar başlangıçta görünür; piyasa engelleri açılır bölümün arkasında saklanmaz.
- Portföy, Strateji Testi, Finansal Projeksiyon ve Okuryazarlık menüleri geri açıldı. Gözlem modunun bu sayfaları zorla Sinyaller'e yönlendirmesi kaldırıldı. Quiz ve rehber kontrolleri görünürdür.
- Strateji eşikleri, maliyet/risk formülleri, ilk tahminler ve kayıtlı kullanıcı verisi bu kod değişikliğinde yeniden yazılmadı.

## Doğrulama

Tam `npm test` geçti. Yeni kontroller gerçek sayfa değiştiricisini gözlem moduyla çalıştırır; dört araç kendi sayfasında açılır. Teknik aday/işlem ayrımı, açık eski kayıtlar, eksik veri, XSS ve değişmez kayıtlar testlidir. Takvim testleri tatil, yarım gün, DST, kapsam dışı yıl, borsa/saat/para birimi çelişkisi ve tamamlanmamış günün kapanmış sayılmamasını kapsar.

Üretimin kullandığı Yahoo başlıklarıyla salt okunur kontrol, 12 ABD varlığının tamamında 251 tamamlanmış gözlem ve doğrulanmış seans takvimi gösterdi. Hiçbiri inceleme anında yapısal giriş koşulunu sağlamadı; kayıt üretmek için koşullar değiştirilmedi. İlk başlıksız deneme HTTP 429 aldı; üretim başlıklarıyla doğrulama başarılı oldu. Bu deneme günlüğe veya veritabanına yazmadı.

Yayın ve görsel kabul sonuçları onarım tamamlandığında aşağıya eklenir. `before.png`, yerel `tests.txt` ve `us-source-readback.json` inceleme kanıtlarıdır; kullanıcı günlüğü yayın paketine alınmaz.

## Açık sınırlar

BIST için gerçek açılış kanıtı veya sınırları belirsiz açılışı doğru temsil eden ayrı yürütme sözleşmesi gerekir. NASDAQ 2027 resmî takvimi incelenen kaynaklarda doğrulanmadığından yıl geçişinden önce kapsam güncellenmelidir. Takvim onarımı kârlılık veya yeni sinyal garantisi değildir.

Kaynaklar: [NYSE](https://www.nyse.com/trade/hours-calendars), [Nasdaq](https://www.nasdaqtrader.com/Trader.aspx?id=Calendar), [BIST tatiller](https://www.borsaistanbul.com/en/official-holidays), [BIST işlem saatleri](https://www.borsaistanbul.com/en/markets/equity-market/trading-hours). İndirme zamanları ve belge hash'leri `src/equity-calendar-sources.json` içindedir. Takvim manifesti, özel veri dizinleriyle birlikte yayın dışında kalmaması için kodun yanındadır.
