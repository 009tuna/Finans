# Finans: ilk karar ve tahmin sistemi paketi

1 Ekim 2026 · yerel uygulama paketi / canlı araştırma verisi ayrı

## İlk paket tarihsel kesiti

Aşağıdaki ilk paket kesiti önceki erişim ve yayın durumunu gösterir. Güncel kanıt sonraki bölümde verilmiştir.

Makro olay deposu, ilk açıklama ile revizyonları ayrı tutar. Açıklama öncesinde son gözlem ve son üç ilk açıklama ortalaması yöntemlerini dondurur; yeterli doğrulanmış veri yoksa sayı üretmez. Güncel BLS otomatik isteği HTTP 403 döndüğünden gerçek bağımsız yöntem kayıtları şu anda yok. Modelin resmî takvim atfı ekranda bağımsız doğrulanmış kaynak gibi sunulmaz.

Sol 6.1 araştırması gerçek olarak çalıştı. İlk doğrulama tarihsiz resmî takvim nedeniyle reddetti; yalnız exact primary BLS calendar için takvim istisnası getirildi. Sayısal kaynak tarihleri hâlâ zorunlu. Reddedilen adayın finansal içeriği değiştirilmedi, üretim saati korunarak yeniden doğrulandı. Eksik provenance alanları null/missing olarak belgelenmiştir; ikinci model çağrısı yapılmamıştır.

Araştırma yayını: `4d187f7b-cd0b-4631-b9cd-60fbc66dc99e`, UTC yayın zamanı `2026-09-30T21:55:00.546Z`. 2 Ekim 2026 15:30 İstanbul açıklaması için 100 bin kişi, üç koşullu senaryo. Konsensüs null. Bu model görüşüdür. 6 araştırma çalışması, 1 ölçülebilir makro tahmin, 0 sonuç; ölçülmüş doğruluk/iyileşme yoktur.

SPK ilk bağımsız kaynak çalışması 30 bağlantı ve son üç resmî PDF'de metin başlığı çıkarımı üretti. Ham kişisel satırlar saklanmaz/sunulmaz; yalnız başlık, kategori, sayfa ve açık semboller. Belgenin metnini okumak mevzuat değişikliği veya hukuki etki yorumu değildir. Aynı belge değişirse yeni kanıt sürümü tutulur; başarılı metin erişimi günlük önbellekle sınırlanır, hata son başarılı kanıtı silmez.

Genel Bakış merkezde Kararlar / Açıklama beklentileri / Sinyal değişimleri; dar bağlamda Piyasalar / Haberler / Takvim. Mevcut alt paneller açılabilir alanda erişilir. Tipografi küçültüldü; boş portföy ve karar satırları sıkıştırıldı. Kaynaklar, gerekçeler ve karşı kanıtlar detaylarda korunur.

Teknik resolver gerçek tespit saatini ve mum bitişini ayırır. Yeni ambiguous-bar sonuçlar isabet oranından ve öğrenme girdilerinden ayrıdır; muhafazakâr stop-önce getirisi açıkça varsayımdır. Bilinmeyen outcome kayıp, eksik resultPct sıfır sayılmaz. Tarihsel kayıtlar bu paketle yeniden çözülmedi.

## Doğrulama ve sınırlar

- Testler: npm test çıktısı aynı dizindeki `2026-10-01-intelligence-npm-test.txt` dosyasında. Gerçek kaynak sorguları testlerde taklit edilerek dış ağa bağımlı test çalıştırılmaz; gerçek kaynak çalışması ayrıca yapılmıştır.
- Yerel `/api/report`, `/api/research`, `/api/macro`, `/api/market-news` 200 ve veri alanları geri okundu. Canlı ilk iki uç yeni araştırma kimliği ile 200 döndü. Yeni makro/haber serverless yönlendirmeleri kodda testli; frontend/API paketi henüz canlıya dağıtılmadı.
- İlk responsive tarama 320/390/630/820/1024/1280/1440 CSS px'de Genel Bakış gövde taşması bulmadı. Görsel denetimde kalan sekme sıkışması ve boş alan düzeltildi; son ölçümler JSON kanıtına kaydedilecek.
- Mobil Menü → Escape odak dönüşü tarayıcıda doğrulandı. Tam ekran okuyucu, tüm araçlar, dört tema kontrastı, hareket azaltma ve gerçek tarayıcı zoom kabulü açık. Keyboard zoom çağrısı tarayıcı büyüklüğünü değiştirmedi; viewport testi gerçek zoom testi diye sunulmaz.
- BLS erişimi, ileri dönem gerçek sonuçlar, kaynaklı konsensüs, bağımsız KAP/kripto akışı, gerçek portföy işlem muhasebesi, maliyetli net ölçüm ve yeterli örneklemle kalibrasyon açık iş olarak kalır.
- Önce/sonra aynı veriyle kontrollü ekran karşılaştırması bu pakette henüz yok. İlk ekranlar farklı veri zamanlarına dayanır; karşılaştırmalı başarım iddiası yapılmaz.

## Sıradaki öncelik

Önce kaynak erişimi ve açıklama sonrası değiştirilemez ölçüm döngüsü; ardından bütün araçlarda yoğun ekran kabulü ve frontend yayını. Daha fazla dekorasyon veya yeni haber kartı bu iki kapının önüne geçmeyecek.

## Son yerel kontrol

İlk npm test çalışması başarılı: 47 test dosyası. Genel Bakış, BIST liste görünümü ve boş Portföy 320/390/630/820/1024/1280/1440 CSS px'de gövde taşması olmadan ölçüldü; bu diğer ekran ve hata senaryolarının tam kabulü anlamına gelmez. Genel Bakış sekme etiketlerinin clientWidth/scrollWidth değerleri bütün boyutlarda eşit; etikette kırpılma görülmedi. 1280 px'de sekiz karar satırının her biri 48 px, toplam görünüm 953 px. Hazır aday artık ilk satırda; KPI bilgi kontrolleri sağ sütuna sığıyor. Bu sayısal ölçüm önceki farklı veri zamanıyla kontrollü performans kıyası değildir.

Mobil menü Escape ile kapanınca odak Menü tetikleyicisine dönüyor. Merkez sekmeleri ArrowRight ile hem seçim hem odak değiştiriyor. Modelin 100 bin kişi beklentisi, üç koşullu senaryo ve BLS 403 uyarısı aynı yerel makro görünümde okundu. Ekran görüntüleri: `2026-10-01-workspace-desktop.jpg`, `2026-10-01-macro-desktop.jpg`. Boyut kanıtı: `2026-10-01-workspace-responsive.json`.

Kaynak erişimi ve gerçek sonuçlar açık olduğundan bu paket bütün P1–P7 hedefinin tamamlandığı anlamına gelmez. Yerel önizleme `http://127.0.0.1:5190/` üzerinde çalışıyor; yeni frontend dağıtımı yapılmadı.

## Güncel kaynak ve yayın kanıtı · 1 Ekim 2026

BLS native HTTPS erişimi başarılı: 13 takvim olayı, 4 ilk açıklama; Mayıs 172 / Haziran 57 / Temmuz −23 / Ağustos 162 bin kişi. Üç dondurulmuş deterministik forecast korunur. İki eski v1 kaydı legacy_pre_fetch_clock gerekçesiyle puanlama dışındadır; v2 65,33 bin kişi ve girdi erişim sidecar'ı bulunmadığı için not_attested. Tahmin ve observation zamanları yeniden yazılmaz. Yeni kayıtlar gerçek post-fetch doğrulama kayıtlarına bağlanır. Kanıt: 2026-10-01-macro-source-readback.json.

Kriptoda Ethereum/Bitcoin Core 100'er resmî arşiv kaydı toplandı; son 24 saat sayısı bu çalışmada 0. Solana timeout; otomatik KAP şirket açıklaması bağlantısı eksik. Halkın erişebildiği KAP sayfası ile provision edilmiş sözleşmeli API ayrıdır; KAP teknik olarak imkânsız ilan edilmez. SPK 30 belge bağlantısı / 3 PDF metin çıkarımı çalışır; hukuki yorum ayrı kapıdır. Kaynak çalışması: 2026-10-01-source-refresh.txt.

Tam npm test 48 dosyada geçti. 106 görünür Genel Bakış metni/tema kontrast örneklemi: Karbon 6,49 / Gümüş 6,80 / Kehribar 6,80 / Yeşil 6,86 minimum. Kanıt: 2026-10-01-contrast-audit.json. Bu bütün ekranlar, durumlar ve gerçek zoom için kabul değildir.

Günlük araştırma 1 Ekim 07:41 UTC'de GPT-6.1 Sol ile yayınlandı. Kimlik: 9d9514f3-b6cf-45f0-b73b-21ca650314a5. Canlı /api/report ile /api/research 200 ve eşleşmiş kimlik: 10 kaynak, 4 gelişme, 0 yeni sinyal; toplam defter 7 çalışma / 1 tahmin / 0 sonuç. Mevcut tahmin yeniden yazılmadı. Model araştırması üç piyasada kısmi; bağımsız kaynak erişimi ve modelin kendi tarama erişimi ayrı kapsamdır.

Açık işler: kaynaklı consensus vintage, diğer makro metrikler, ilk ileri dönem gerçekleşen, yalnız doğrulanmış kronolojik holdout ile kalibrasyon, teknik mum kapanışı ve belirsiz getiri ölçümü, işlem muhasebesi, bütün araçların görsel/klavye/zoom kabulü ve yeni frontend dağıtımı.

## Konsensüs ve ölçüm paketi · güncel kesit

Kaynaklı konsensüs bağımsız akışa bağlandı ve gerçek Supabase geri okumasıyla doğrulandı: Eylül NFP 90 bin kişi. İlk model tahmini 100 bin değişmedi; 1 Ekim güncel görüşü 90 bin puanlanan ikinci tahmin değildir. Yeni edinim eski tahminin bilgi kesitine eklenmez. Kaynak yayın ve sisteme alınma zamanı ayrı. `npm test`: 52 dosya başarılı. Gerçek kaynak ve API kanıtı `2026-10-01-consensus-readback.json`, `2026-10-01-consensus-api-readback.json`; çıktı `2026-10-01-consensus-npm-test.txt`.

Teknik sonuçlarda tamamlanmamış mum, borsa saat dilimi ve eksik high/low aralığı kapıları var. Belirsiz mum sonucu null getiridir ve ortalamaya/isabet paydasına girmez. Katı makro kalibrasyonu en az 12 eğitim + 3 ileri sınama, geçerli zaman kanıtı ve bilinen eğitim sonuçları gerektirir. Gerçek sonuç sayısı 0; sistemin eğitildiği veya doğruluğunun arttığı söylenemez.

Kapsam: tek gözden geçirilmiş Reuters NFP kaynağı; sonraki dönem konsensüs keşfi, diğer makro metrikler, KAP ve SPK hukuki etki açık. Frontend/API paketi yerel; canlı araştırma yayını ile yeni uygulama dağıtımı ayrı.

### Son kabul düzeltmeleri

Son tam test çalışması, yenileme odağı ve tarihsel model sonucu düzeltmeleri dahil 52 dosyada başarılı. Gerçek yenileme tamamlanınca odak `refreshBtn` düğmesine geri döndü; açık kaynak ayrıntısı ve seçili Açıklama beklentileri sekmesi korundu. Ctrl+Home seçili sekmeyi değiştirmedi. Kullanıcının odağı başka yere taşıması ve başarısız yenileme, ertelenmiş istek testleriyle doğrulandı; canlı API arızası yaratılmadı. Kanıt: `2026-10-01-consensus-keyboard-readback.json`.

Yerel API geri okumasında üç deterministik kayıt da kaynak erişim kanıtı olmadan puanlama dışı: iki eski kayıtta `legacy_pre_fetch_clock` ve `provenance_missing`, üçüncü kayıtta `provenance_missing`. Sayısal değerler/tarihler korunur; üç yöntem için n=0, MAE=null. İlk model 100 bin ve güncel görüş 90 bin ayrımı değişmedi. Açıklama sonrası geçmiş, gelecekteki takvim olayına bağlı olmadan, özgün forecastId ile ilk tahmin üzerinden okunur; bu davranış sentetik birim senaryosuyla doğrulandı, gerçek sonuç sayısı hâlâ 0.

320/390/630/820/1024/1280/1440 CSS px kontrollerinde bu panelde gövde, model kutusu veya ayrıntı etiketi taşması yok; ayrıntı tetikleyicileri en az 44 px yüksek. `2026-10-01-consensus-responsive.json`, son ilk ekran `2026-10-01-consensus-desktop.png`. Bu kanıt bütün araçların veya gerçek %80/%125/%200 tarayıcı yakınlaştırmasının kabulü değildir.
## SPK basın duyuruları — gerçek kaynak kabulü

1 Ekim 09:01:54 UTC ediniminde resmî 2026 duyuru listesindeki 12 bağlantı incelendi; personel/başsağlığı niteliğindeki iki kayıt ayrıldı ve 10 finans duyurusu Supabase'e alındı. Bu arşiv kapsamıdır, bugün yayımlanmış on haber anlamına gelmez. Kaynak durumu `available`; toplam bağımsız kaynak yenilemesi KAP ve Solana eksikleri nedeniyle `partial` kaldı.

- Yayıncı yalnız gün belirtiyorsa `publishedDate` tutulur, `publishedAt` null kalır. HTTP bitişi yayın saati sayılmaz. Her kaydın gerçek edinim zamanı, tam duyuru bağlantısı ve anlamsal içerik hash'i vardır.
- Gerçek HTML önceki sentetik testten farklıydı: başlık `h3.baslik`, tarih `div.tarih`. Gerçek sayfa ayrıştırması düzeltilmeden paket kabul edilmedi. Menü değişikliği aynı duyurunun yeni sürümü sayılmaz; içerik değişikliği ayrı kanıt kaydıdır.
- Metin kısa kaynak kanıtıdır; tablolar ve uzun hesap/kimlik dizileri tutulmaz. Taslak, geçmiş karar ve ileride duyurulacak tedbir ifadelerinden yürürlük veya fiyat etkisi üretilmez. Model talimatı bu ayrımı korur; bu kabul sırasında ek model çağrısı yapılmadı.
- Araştırma defteri edinim öncesi/sonrası eşit: 7 çalışma / 1 değişmez tahmin / 0 sonuç. Mevcut tahmin ve sayısal sonuçlar değiştirilmedi.
- Yerel `/api/market-news` HTTP 200; on duyuru kayıtlıdır. BIST grubundaki 42 toplam kayıt PDF, duyuru ve diğer mevcut kayıtların birleşimidir; güncel haber sayısı olarak kullanılmaz.
- Tam `npm test` 53 dosyada geçti. Gerçek tarayıcıda BIST duyuru ayrıntısı Enter ile açıldı; yayıncı tarihi, edinim zamanı, özgün bağlantı ve kapsam sınırı okunuyor. SPK PDF / SPK duyuruları / KAP kaynak sağlığı ayrı gösteriliyor.

Kanıtlar: `2026-10-01-spk-announcements-readback.json`, `2026-10-01-spk-api-readback.json`, `2026-10-01-spk-npm-test.txt`. Yeni arayüz/API kodu yereldir; Supabase kaynak kaydı tek başına frontend dağıtımı sayılmaz. Bütün araçların gerçek zoom ve erişilebilirlik kabulü, otomatik KAP şirket açıklamaları ve hukuki etki incelemesi açık kalır.

Son UI kontrolü: açık duyuru kanıtıyla 320, 390, 630, 820, 1024, 1280 ve 1440 px ölçüldü; gövde, panel ve dört haber başlığında yatay taşma görülmedi. 980 px altında kaynak/ayrıntı özetleri 44 px, masaüstünde 40 px. Ham kaynak hata kodu ve kontrol zamanı teknik ayrıntıda korunur; normal durum metni Türkçedir. Kanıt: `2026-10-01-spk-responsive.json`, `2026-10-01-spk-desktop.png`. Uygulama içi tarayıcı Ctrl+eksi sonrası DPR ve içerik genişliğini değiştirmedi; bu çalışma gerçek zoom doğrulaması sayılmaz.

KAP araştırması: resmî bildirim arama HTML'i HTTP 200 olsa da açıklama sonuçları bulunmadı; otomatik şirket kapsamı doğrulanmadı. [KAP REST API açıklaması](https://www.kap.org.tr/tr/api/about/content-file/8a019492945fbe080194b26d8bed4873) toplu veri servisi için Borsa İstanbul veri dağıtım sözleşmesi ve MKK IP/API anahtarı yetkilendirmesi belirtir. Public sayfaya erişmek API erişimi sayılmaz; bu koşullar yerine getirilmeden bağlantı tamamlandı denmez.

Kullanıcı lisanslı erişimi olmadığını bildirdi. Eklenen KAP modülü şirket bildirim bağlayıcısı değildir: sınırlı public sayfa erişim kontrolü, doğrulanmamış kapsam ve geçmiş kayıt koruma davranışıdır. Üretim varsayılan aktarımı 13:28:23–13:28:33 UTC'de zaman aşımı verdi; kanıt `2026-10-01-kap-production-probe.json`. Bu kesit, önceki farklı aktarımın HTTP 200 bulgusundan ayrıdır. Son kod timeout'ı kararlı hata koduyla gösterir. 10:00 kaynak kontrolü → 11:00 timeout → geç gelen 10:30 yanıt testi sağlık zamanının geriye gitmediğini doğrular. Başarısız kontrol eski şirket kaydını veya önceki HTML ediniminin hash/tarih kanıtını silmez. Sayfa bağlantısı görülse bile doğrulanmış şirket kapsamı üretilmez; aktarım bayt sınırında durdurulur. Bu kontroller sentetik kabul senaryolarıdır, gerçek KAP bildirimi alındığına kanıt değildir.

Son entegrasyon sonrası tam `npm test` 54 test dosyasında geçti (çıkış 0). KAP dosyası altı kaynak/hata/koruma senaryosu içeriyor. Kanıt: `2026-10-01-source-acceptance-npm-test.txt`. Bu kabul, bütün ürünün gerçek zoom veya canlı dağıtım kabulünün yerine geçmez.
