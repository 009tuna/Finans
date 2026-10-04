# Finans · rapor zamanı ve ilk yükleme kabulü

2 Ekim 2026 · Europe/Istanbul. Bu paket canlıda; bütün ürünün kabulü tamamlanmış değildir.

## Davranış

İlk fiyat okumasından sonra portföy, günlük ve rapor okumaları birlikte başlar. İlk ekran üçünün durumunu bekler; başlangıçtaki varsayılan boş portföy başarılı bir okuma gibi gösterilmez. Rapor isteği başarısızsa son başarılı rapor korunur. Bu değişiklik bağlantıların eşzamanlı başlamasını sağlar; ölçülmüş saha hızlanması veya Core Web Vitals sonucu değildir.

Model yorumunun oluşturulma zamanı özet ve piyasa yorumunda gösterilir. Önceki analiz kesitindeki yorumda sonraki kaynak güncellemelerinin metne işlenmediği belirtilir. Oluşturulma zamanı bilgi kesiti yerine kullanılmaz. Metin, ilk tahmin ve güncel görüş yeniden yazılmadı. Özetten güncel beklentilere geçiş gerçek çalışma alanını seçer ve klavye odağını ilgili sekmeye taşır.

Yorumdaki açık HTTP/HTTPS Markdown bağlantıları erişilebilir kaynak bağlantılarına dönüşür. Ham HTML kaçışlanır; desteklenmeyen biçimler metin kalır. Bu sınırlı bağlantı desteğidir, genel Markdown yorumlayıcısı değildir.

## Kanıt

- [70 dosyalı npm test çıktısı](2026-10-02-reading-context-npm-test.txt): süreç çıkış kodu 0. Yeni ilk-yükleme testi üç isteğin beraber başlamasını, kısmi hatada önceki raporun korunmasını ve ilk raporun yokluğunda içerik uydurulmamasını kontrol eder.
- Tarihsel denetim düzeltmesi eklendikten sonra [71 dosyalı son npm test](2026-10-02-reading-and-history-npm-test.txt) de çıkış kodu 0 ile tamamlandı. Arayüz ve denetim değişiklikleri birlikte kontrol edildi.
- [320/390/630/820/1024/1280/1440 CSS px](2026-10-02-reading-context-widths.json): yeni model zamanı/eylem alanında metin veya gövde taşması yok; eylem yüksekliği 44 px. Bu, gerçek tarayıcı yakınlaştırması değildir.
- [Dört tema kontrastı](2026-10-02-reading-context-contrast.json): 32 metin/kontrol örneği, en düşük 6,12:1; ölçülemeyen örnek veya başarısız eşik yok. Bütün ürünün bütün durumları kapsanmıyor.
- [Canlı tarayıcı](2026-10-02-reading-context-browser.json): üç gerçek yorum bağlantısı, Europe/Istanbul zamanı, Enter ile Genel Bakış/Açıklama beklentileri geçişi ve doğru odak. Rapor bölüm bağlantısı URL'yi değiştirmeden Özet'e odaklandı. Tarayıcı error/warn kaydı yok.
- [Canlı rapor görüntüsü](2026-10-02-reading-context-live.png), [yerel mobil](2026-10-02-reading-context-mobile.png), [yerel masaüstü](2026-10-02-reading-context-desktop.png). Yerel ekranlar aynı yakalanmış veri kesitini kullanır; doğal fiyat yenilemesi nedeniyle canlı ekranla aynı veri olduğu iddia edilmez. Bu pakette eşlenmiş eski/yeni ekran çifti üretilmedi.

## Yayın

Yeni paket `dpl_8mEETWgBN66Vp8U4RpRK4v7Mh2LA` / `finans-dashboard-cj1obj0pc-tunahan81jb-7635s-projects.vercel.app`. Korumalı pakette app.js, research.js ve styles.css SHA256 değerleri yerel dosyalarla birebir eşleşti; rapor ucu doğrulandı. Ardından mevcut ana adrese geçirildi. [Ana adres kimliği](2026-10-02-reading-context-live-deployment.json) READY/production durumunu doğrular.

[Dört canlı API kontrolü](2026-10-02-reading-context-live-endpoints.json): report/research/market-news/macro HTTP 200. Rapor ve araştırma kimliği `9d9514f3-b6cf-45f0-b73b-21ca650314a5`; araştırma 1 tahmin / 0 sonuç. Haber grupları 24 ABD, 118 BIST, 201 kripto kaydıdır; kayıt sayısı kapsam veya doğruluk oranı değildir. Vercel son 15 dakika error/warning sorgusu çıkış 0 ile boş döndü; sürekli izleme veya hata oranı ölçümü değildir.

Geri dönüş paketi: `dpl_4cF2jHWDcU6ttvFn2y8M5YCvUot4`, `finans-dashboard-p4wa2svwx-tunahan81jb-7635s-projects.vercel.app`. Ana görev geçişi ya da rapor yüklemesi bozulursa bu önceki doğrulanmış paket kullanılabilir. Geri dönüş uygulanmadı.

Bu tur model çağrısı, portföy/günlük yazımı, tahmin sonucu değişikliği veya otomasyon takvimi değişikliği yapılmadı. Yerel tarihsel denetim aracı bundan sonra ayrıca güncel tarihle çıktı verir; bu araç değişikliği arayüz yayınından sonra yapıldı ve yeni canlı paket kapsamına dahil değildir.

## Açık kapılar

Gerçek zoom, bütün araçlarda ekran okuyucu/klavye/durum kabulü ve eşlenmiş önce/sonra kanıtı açık. İlk resmî makro sonuç ve yeterli ileri dönem örneklem henüz yok. Tarihsel içerik ve uzaktaki otomasyon sürümü için [güncel denetim](2026-10-02-history-review.md) ayrı sınırlara sahiptir. Genel hedef sürüyor.
