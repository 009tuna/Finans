# Otomatik okuma akışı — 6 Ekim 2026

Kullanıcı içerik yazmak istemiyor; sistemin kayıtlarını okuyarak izlemek istiyor. Varsayılan menü ve doğrudan eski düzenleme bağlantıları artık okuma akışına yönlendirilir. Kaydedilmiş kişisel notlar, alarmlar ve portföy kayıtları silinmez. Varlıkta `Sistem gerekçesi`, kaydedilmiş yapısal planı ve koşulları gösterir; kayıt yoksa gerçek yapısal tarama nedenini açıklar. Kullanıcı notu otomatik kaydedilmiş sistem gerekçesi gibi gösterilmez.

`#view=signals` aktif, geçmiş, başarı ve eski sistem arşivini ayırır. Aktif durum, işlem yürütme durumundan; başarı paydası ortak kanıt sınıflandırıcısından gelir. Kanıtı eksik açık kayıt aktifte kalır; kapanmış belirsiz kayıt geçmişte kalır. Bunlar kazanılmış işlem sayılmaz. Filtre, ilk 20 kayıt ve devam düğmesi vardır. Tekrarlanan okumada değişmeyen defter yeniden kurulmaz; yeni sürümde açık işlem ayrıntıları korunur. Görünür sekmede dakikada bir fiyat, günlük ve rapor yeniden okunur. Yenile düğmesi bu modda yalnız GET okumalarını çalıştırır; yönetici parolası veya kullanıcı kaydı gerektirmez.

NFP ve dört kanonik CPI ölçümü için model, konsensüs, üst ve alt beklenti koşulları ayrı görünür. Sayısal model görüşü mevcut kayıttan gelir. Konsensüs eksikse sıfır veya model tahminiyle doldurulmaz. Üst/alt beklenti için eşiği bilinmeyen genel ekonomik yorum açıkça etiketlidir; model tahmini ya da ölçülmüş fiyat tepkisi değildir. Aynı olay kimliğine bağlı kaynaklı model senaryoları ayrıca gösterilir. Sabah araştırma yönergesi sonraki çalışmalarda bu karşılaştırmaları kaynaklı senaryolarla üretmesini ister; bu değişiklik mevcut tahminleri yeniden yazmaz. En yakın NFP ve aylık çekirdek CPI ana akışta; diğer ölçümler kaybolmadan ayrıntıda okunur.

## Yerel kabul

- Tam npm test paketi ve ek `observer.test.js` geçti. Yaşam döngüsü ayrımı, payda dışlamaları, başarısız okuma, değişmez kayıtlar, bozuk plan, XSS, beş makro metrik, model/konsensüs farkı, kaçınma ve olay/kaynak eşleşmesi test edildi.
- Canlı veri kesitiyle masaüstü 1440×900 ve mobil 390×844 incelendi. Yeni panel, dört CPI kaydı, eksik konsensüs ve adaydan sistem gerekçesine geçiş doğrulandı. Görünür yazı giriş alanı ve sayfa taşması yoktu; tarayıcı hata kaydı yoktu.
- Ayrı yerel sunucuda sentetik aktif/kapanmış sinyal görünürlüğü, gerçek kanıt sözleşmesiyle oluşturulmuş sentetik kapanış paydası ve mobil görünüm denendi. Test kayıtları üretime veya yerel gerçek günlüğe yazılmadı. `synthetic-mobile.png` gerçek başarı kanıtı değildir; ekranında test etiketi vardır.
- Gerçek kaynak kesitinde yeni yapısal sinyal ve doğrulanmış kapanış yok. Eski 374 kayıt ayrı arşivde. ABD/BIST seans takvimi kanıtı eksik olduğundan otomatik yeni kayıtları kapalı; kripto için kurulum filtreleri geçerli. Bu UI teslimi, bu veri kapılarını kaldırmaz veya kârlılık kanıtlamaz.

Gerçek ekran okuyucu, yüzde zoom ve sahada kullanıcı testi yapılmadı. Üretim kabulü yayın sonrası ayrıca kaydedilir.
