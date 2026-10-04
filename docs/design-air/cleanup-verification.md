# Finans — son düzenleme ve kabul kaydı

4 Ekim 2026 · İstanbul · yerel uygulama

Bu kayıt, [ilk Air yenilemesini](verification.md) ve [piyasa/beklenti düzenlemesini](market-expectations-iteration.md) izleyen değişiklikleri kapsar. Kullanıcının mevcut değişiklikleri korunmuştur; bu çalışma bir Git sıfırlama, bulut tasarım dağıtımı veya finansal işlem değildir.

## Kullanıcı hedeflerinin karşılığı

| Hedef | Uygulanan davranış | Kabul kanıtı |
| --- | --- | --- |
| Daha sakin, karakterli ve düzenli sayfa | Açık teal/slate palet, ölçülü yazı, ortak boşluk/yüzey sistemi. İlk ekranda adaylar; ayrıntılar sekme veya açılır alanlarda. | [Son ana ekran](cleanup-overview-native.jpg), önceki genişlik/kontrast kayıtları |
| Sağ ve sol paneller daralabilsin | Bağımsız panel tercihleri, klavye kontrolleri, geçici odak modu ve mobil menü. | Workspace davranış testleri; ilk yenilemenin tarayıcı ölçümleri |
| ABD, BIST ve Kripto ayrı olsun | Her piyasada bağımsız ilk üç aday, kendi teknik istatistikleri ve boş/hata durumları. Adayın gerekçesi, karşı kanıtı ve veri tazeliği görünür. | Ana ekranda üç piyasa başlığı aynı satırda; ilk başlıkların üst sınırı 386,75 px. |
| Rapor anlaşılır olsun | Model görüşü, fiyat kesiti, kaynak takvimi ve ölçülmüş sonuç ayrı. Tekrarlanan haberler azaltıldı; ek teknik analizler kapalı ayrıntılara taşındı. | Rapor gezinmesi ve veri beklentileri gerçek tarayıcıda kontrol edildi. |
| Sabah raporunda modelin kendi veri beklentileri | 14 günlük NFP/CPI gündemi; kaynaklı yeni sayı, gerekçeli kaçınma veya zorunlu yeniden değerlendirme. İlk tahmin korunur. | [Gerçek model kabul denemesi](live-expectations-draft-review.md), şema/kapsam/ledger testleri |
| İşlevler eksik veriyi gizlemesin | Boş, okunamayan ve eski veri ayrılır. Portföy ve tez taslakları hata/yenileme boyunca korunur; kaydedilmemiş metin kayıt gibi gösterilmez. | Journal/portfolio hata, tekrar deneme, yarış ve kaydetme testleri; izole tarayıcı kabul durumları |

## Hesap ve veri düzeltmeleri

- Ortak günlük kapanış filtresi strateji testi, simülasyon ve korelasyona bağlandı. Kaynağın gözlem zamanı hesaplama zamanından önceyse kesit ilerletilmez. Yahoo borsa saat dilimi/seans kanıtı ve kripto UTC günlük kapanışı denetlenir. Açık bar canlı grafikte kalabilir; tamamlanmış günlük geçmişe dönüşmez. Eksik OHLC/volume kanıtı uydurulmaz.
- Strateji testi sonraki gözlenen kapanışta yürütme, işlem maliyetleri, zorunlu son satış ve doğru getiri/düşüş hesabını açıklar. Masrafsız al-tut karşılaştırmasının sınırı, kullanılan kapanışlar ve örneklem görünür. Kalibrasyon veya canlı kârlılık iddiası üretilmez.
- Simülasyon ve korelasyonda geçmişin gerçek kaynak para birimi korunur. BIST için kaynaklı kur zorunlu; bilinmeyen kur/fiyat ortalama maliyet veya sabit kurla doldurulmaz. Tarihsel kur oynaklığı ve USDT/USD değişimi modellenmediğinde bu varsayım yazılır. Korelasyon gerçek ortak getiri aralıklarını eşleştirir.
- Değerleme alanları finansal tablo verisi yokken boş kalır. DCF duyarlılığı temel senaryoyla tutarlı; geçersiz finansal alanlar sonuç üretmez. Risk hesabı hem risk bütçesi hem sermayeyle sınırlandırılır; küçük fiyat ve kesirli adetler sıfıra yuvarlanmaz. Eski, sermayeyi aşan örnek adet geçerli hesap olarak gösterilmez.
- Kaynaklı fiyatın, gerçek sıfırın ve bilinmeyen değerin biçimlendirmesi ayrıldı. OBV yatay/eksik yönü düşüş gibi gösterilmez; raporun veri zamanı piyasa kapanışı diye adlandırılmaz. Okunamayan ekonomik takvimde “0 kayıt” yerine “kayıt sayısı bilinmiyor” görünür. Tahmin sonuçları ham metrik kodları yerine Türkçe ölçüm adlarıyla okunur; CPI hata birimi yüzde puandır.
- Kaydedilmiş alarm eylemi korunur. Teknik şablon, kaydedilmemiş taslak ve gerçek kayıt ayrı gösterilir. Aynı varlık yenilenirken tez metni, odak ve imleç korunur. Eski eğitim notlarının bozuk karakterleri işaretlenir; metin tahminle yeniden yazılmaz.

## Son doğrulama

En son ürün değişikliklerinden sonra tam **`npm test` zinciri başarılı**, çıkış kodu 0: [tam çıktı](cleanup-final-tests.txt). Yeni kapanış filtresi, geçmiş kaynak sözleşmeleri, canlı taslak izolasyonu, sayısal biçimlendirme ve hata durumları ana zincirdedir. Ayrı son salt okunur kabul incelemesinde tamamlanmayı engelleyen yeni uygulama bulgusu çıkmadı.

Gerçek tarayıcıda kaynak fiyatlarıyla kurulmuş, yalnız kabul amaçlı ABD/BIST portföyü için 90 günlük, ek tasarrufsuz simülasyon tamamlandı. AAPL geçmişinde 251, AEFES geçmişinde 255 tamamlanmış gözlem; bu kesitte açık ve kapanışı doğrulanamayan gözlem sayıları gerçekten 0. Ortak simülasyon geçmişi 2025-10-03–2026-10-02; korelasyonda 229 gerçek ortak getiri gözlemi. İki hesap da aynı 4 Ekim 03:42 İstanbul kaynak kesitini gösterdi. Bunlar test portföyünün kabul bulgularıdır; kullanıcının portföyü veya yeni getiri beklentisi değildir. [Ekran kanıtı](cleanup-forecast-source-proof.jpg).

Son ana ekran doğal pencere boyutunda 1434 px içerik genişliğinde kontrol edildi; sayfa yatay taşması yok. Önceki 390/768/1024/1280/1440 px kontrolleri ve kontrast örneklemeleri kendi tarihli belgelerinde korunur; bunlar bütün durumlar için erişilebilirlik sertifikası değildir. Geçici test boyutu kaldırıldı. Son normal ana ekran ve rapor yüklemelerinde yeni konsol hatası gözlenmedi; geçmiş konsol kaydındaki iki journal hatası, kasıtlı `journal-error` kabul durumuna aittir.

## Canlı modelin kabul sınırı

Gerçek `gpt-6.1-sol` çağrısı, kilitli çekirdek aylık CPI **%0,3** görüşünü kaynaklı yeniden değerlendirdi, çekirdek yıllık CPI için **%2,5** taslak üretti ve kanıtı eksik iki manşet hedefte sayı vermedi. İlk reddedilen denemede yayın saati bilinmeyen sayısal enerji kaynağı vardı; doğrulayıcı korunarak üretim talimatı netleştirildi. Yıllık hesap mevsimsel farkın yaklaşık sabitliği varsayımına dayanır; doğrulanmış güncel endeks hesabı veya ölçülmüş başarı değildir.

`?qa=live-draft` kabul görünümü aynı rapor renderer'ıyla gerçek taslağı gösterir. Yalnız yeşil sonuç dosyasına güvenmez: şema, kapsam, fiyat/girdi eşleşmesi ve zaman sırası tekrar denetlenir. Yanlış veya değiştirilmiş taslak reddedilir. [Ekran kanıtı](cleanup-live-expectations.jpg), [kontrol dosyası](live-expectations-draft-validation.json).

**Taslak yayınlanmadı ve tahmin günlüğüne eklenmedi.** QA görünümünde mevcut gerçek otomasyon durumu korunur. Mevcut “Finans GPT-6.1 Sol günlük araştırma” otomasyonunun ACTIVE ve günlük 09:30 İstanbul yapılandırması son kez salt okunur doğrulandı. Sonraki zamanlanmış çalışmanın başarılı yayını bu manuel denemeden çıkarılamaz.

## Açık araştırma sınırları

Şirket/protokol özelindeki tezlerin, BIST finansal oranlarının, CPI konsensüsünün ve enerji girdisinin gerçek yayın saatinin kapsamı hâlâ eksik. Bu eksiklikler görünür bırakılır; daha fazla kart veya yüksek teknik puan bunların yerine geçmez. Güncel model görüşleri başarı örneklemini artırmaz. Fiyat geçmişi modelleri temettü, kurumsal işlem, gelecekteki kur ve likidite etkilerini tam modellemeyen açık varsayımlardır.
