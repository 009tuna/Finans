# Araştırma yayını ve günlük akış — uygulama kaydı

## Kapsam
Fiyat, analiz ve araştırma zamanları ayrılır. Önceki fiyat kesitine bağlı doğrulanmış araştırma okunabilir kalır; güncel fiyatlara ait olmayan AI sinyali uygulanmaz. Günlük otomasyonun gerçek aşamaları ve son başarılı yayını görünür olur.

## Yayın sözleşmesi
Yeni temel rapor taslaktır. Kaynak doğrulaması tamamlanmadan aktif rapor değişmez. Tam yayın, `research_ledger_v1` kaydının `publication` alanında tutulur: `{schemaVersion:1,date,base,ai,publishedAt}`. Araştırma kayıtları ve yayın aynı PostgreSQL satırının revizyon koşullu güncellemesiyle birlikte yazılır. Çakışmada son kayıt yeniden okunur; ölçülmüş sonuçlar korunur. İkinci, bağımsız bir rapor yazması yapılmaz. Eski `reports` satırları ilk tamamlanmış yayına kadar uyumlu okuma kaynağıdır.

Bu seçim yeni tablo, yetki veya SQL fonksiyonu gerektirmez. Mevcut araştırma günlüğünün sonuç ekleme işlemleri aynı kaydı ve aynı revizyon kontrolünü kullanmaya devam eder.

## Güven sınırları
- Model, risk hesapları, değerleme formülleri ve sonuç çözümleme kuralları değişmez.
- Araştırma özgün, dondurulmuş analiz kesitine karşı doğrulanır.
- Okunabilir araştırma ile uygulanabilir sinyal ayrı koşullardır; 36 saatlik mevcut tazelik sınırı korunur.
- Yanlış çalışma kimliği, gelecekteki zaman, geçersiz kaynak ve süresi dolmuş sinyal kabul edilmez.
- Günlük akış bilgisi ayrı, küçük bir kayıttır. Aşama hatası yayını başarılı göstermez. Gizli anahtar ve model çıktısı hata alanına yazılmaz.
- Yeni doğrulama için ücretli model çağrısı yapılmaz; hata, yarış ve idempotans senaryoları bağımlılıkları denetlenmiş testlerle sınanır.

## Kabul kanıtı
38 test dosyasının tamamı `npm test` ile geçti. [Test çıktısı](2026-09-30-publication-npm-test.txt). Kontroller; üretim hatasında önceki yayının korunması, revizyon çakışmasında sonuçların kaybolmaması, dondurulmuş fiyat kesiti, eski çalışmanın yenisini ezememesi, atlanan yayının yeni yayın sayılmaması ve veritabanına geri okuma doğrulamasını kapsar. Sentetik testlerin “published” çıktısı canlı araştırma üretildiği anlamına gelmez.

320, 390, 630, 820, 1024, 1280 ve 1440 px genişliklerinde raporun gövdesi ve zaman etiketleri kontrol edildi; taşma bulunmadı. [Responsive ölçümler](2026-09-30-publication-responsive.json). Otomasyon ayrıntısı Enter ile açıldı; başarısız deneme, bekleyen sonraki aşamalar ve önceki başarılı yayın birlikte okunabildi. [Mobil görünüm](2026-09-30-publication-mobile.jpg), [izole hata senaryosu](2026-09-30-publication-failure-desktop.jpg).

Mevcut rapor tek seferlik `scripts/adopt-legacy-publication.js` ile korunan kayda alındı. Kaynak araştırması var olan günlük kaydıyla karşılaştırıldı; gerçek `reports.updated_at` yayın zamanı aynen korundu. Önce/sonra günlük sayıları: 5 çalışma, 0 açıklama öncesi haber tahmini, 0 araştırma sonucu. Yeni model çağrısı, tahmin veya ölçülmüş sonuç üretilmedi. [Geçiş kaydı](2026-09-30-publication-adoption.json).

Yeni aşama geçmişi henüz yoktur; günlük otomasyon ekranı bunu açıkça belirtir ve önceki gerçek başarılı yayını gösterir. Aşama kayıtları bir sonraki gerçek `npm run research` çalışmasında dolacaktır. Eski fiyat kesitine ait beş gelişme ve altı kaynak okunur; güncel fiyatlarla eşleşmediği için AI sinyal katmanı uygulanmaz.

Bu kabul ilk yayın ve otomasyon görünürlüğü paketine aittir; bütün site için erişilebilirlik sertifikası, saha performans ölçümü veya model isabet iddiası değildir.

## Canlı teslim
30 Eylül 2026, 20:00 Europe/Istanbul: `dpl_5qcDVAoCwxmr6YD6MVCXepag3pNz` ana [Finans adresine](https://finans-dashboard-iota.vercel.app/#view=report) taşındı. On uç nokta HTTP 200 döndü; HTML, app.js ve CSS yerel dosyalarla aynı. Rapor çalışma kimliği araştırma günlüğünün son kaydıyla eşleşiyor; model `gpt-6.1-sol`, beş gelişme, altı kaynak. Son başarılı yayın 17:13:58 Europe/Istanbul; bu paketin dağıtım saati araştırma üretim saati sayılmadı. [Canlı API kanıtı](2026-09-30-publication-live-verification.json), [gerçek canlı ekran](2026-09-30-publication-live.jpg).

Yerel önizleme `http://127.0.0.1:5190/` adresinde güncel kodla çalışır. İzole hata senaryolarının QA sunucusu gerçek portföy/araştırma kayıtlarını değiştirmedi. Eski GitHub fiyat işi legacy reports satırına yazsa da korunan tamamlanmış yayın bundan etkilenmez; yeni günlük araştırma aynı koşullu yayın yolunu kullanır.
