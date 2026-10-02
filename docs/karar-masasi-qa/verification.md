# Karar Masası — uygulama ve doğrulama kaydı

30 Eylül 2026. Çalışan uygulama: http://127.0.0.1:5190/ . Canlı yayın yapılmadı.

## Gerçekleşen uygulama

Grafit yüzeyler, mavi vurgu, dört tema, ortak kontrol/tablo sistemi ve gruplandırılmış navigasyon uygulandı. Genel Bakış portföy ve karar sırasını; Portföy geniş tablo ve düzenleme panelini; varlık incelemesi liste, grafik ve dört ayrıntı sekmesini kullanıyor. Tarayıcı ortak tabloya, projeksiyon iki göreve, rapor bölüm bağlantıları ve kaynak akışına, okuryazarlık konu defteri ve okuma alanına taşındı.

Finansal hesaplama kodu, model seçimi, otomasyon, risk formülleri ve API şemaları bu tasarım çalışmasında değiştirilmedi. Çalışma dizininde daha önce oluşmuş backend/veri değişiklikleri bulunuyor; bunlar tasarım tesliminin yeni değişiklikleri olarak sayılmıyor.

CSS'te aynı üst düzey seçicinin daha sonra geçersiz kıldığı 60 bildirim temizlendi. Ulaşılamayan eski tarayıcı uygulaması ve bütün kartlara uygulanan giriş koreografisi kaldırıldı. Etkileşim geçişleri ve hareket azaltma kuralı korundu.

## Kontrol ortamı ve kanıt

`scripts/ui-qa-server.js`, yerel uygulamanın okuma yanıtlarını dondurarak 5191 portunda sunar. Portföy, not, alarm ve yenileme yazmaları 500 ile reddedilir; gerçek kayıt değiştirilmez. Backtest ve projeksiyon hesapları mevcut yerel API'yi kullanır. QA sunucusu üretim uygulamasına eklenmemiştir.

Anlık görüntü zamanı 29 Eylül 2026 23:06 GMT+2. Portföyde ASTOR: 150 adet, 300 TL ortalama maliyet, 211,70 TL fiyat; değer 31.755 TL ve ağırlık %100. Karşılaştırmalı Genel Bakış/Portföy ekranlarında bu kayıt aynı kaldı. Grafik sağlayıcısından daha sonra gelen tarihsel çubuklar bu dondurulmuş fiyat kesitinden ayrı zamanla etiketlenir.

- [Genel Bakış önce, 1280](overview-before-1280.jpg) → [sonra, 1280](overview-after-1280.jpg)
- [Portföy önce, 1280](portfolio-before-1280.jpg) → [sonra, 1280](portfolio-after-1280.jpg)
- [Portföy, 1440](portfolio-after-1440.jpg), [piyasa, 1440](market-after-1440.jpg), [rapor, 1280](report-after-1280.jpg)
- [Genel Bakış, 390](overview-after-390.jpg), [Portföy, 320](portfolio-after-320.jpg)
- [70 ekran/genişlik ölçümü](responsive-widths.json), [tema token kontrastı](theme-contrast.json), [npm test çıktısı](npm-test.txt)
- [Son değişikliklerden sonra 21 ana ekran/genişlik kontrolü](final-main-widths.json), [okuryazarlık okuma alanı](literacy-after-1280.jpg)

320, 390, 630, 820, 1024, 1280 ve 1440 CSS px genişliklerinde on sayfaya gerçekten geçildi. Kaydedilen 70 kontrolde gövde genişliği kullanılabilir genişliği aşmadı; görünen paragraf, etiket, tablo hücresi ve yardımcı metinler 12 px altına düşmedi. Bu ölçüm her kontrolün görsel olarak kusursuz olduğu veya ekran okuyucu sertifikasyonu anlamına gelmez.

Karbon/Gümüş/Kehribar/Yeşil tokenları gerçek tarayıcı stilinden okundu. Yükseltilmiş yüzeyde en düşük yardımcı metin kontrastı 5,88:1, kırmızı metin 4,66:1; vurgu düğmesi yazısı en az 6,49:1. Bu sonuç token çiftleri içindir; her olası grafik pikselinin veya dış kütüphanedeki her etiketin tam denetimi değildir.

## Gerçek kullanım senaryoları

| Senaryo | Gözlenen sonuç |
|---|---|
| Mobil menü ve Escape | Menü tıklamayı alıyor; Escape kapatıyor, odak Menü düğmesine dönüyor. Sayfa seçiminde başlığa odaklanıyor. |
| Pozisyon kaydı 500 | ASTOR miktarı 151 taslağında kalıyor; tabloda son başarılı 150 korunuyor; Kaydedilemedi mesajı görünüyor. |
| Not kaydı 500 ve sayfa dönüşü | Tez metni korunuyor. Başka sayfadan geri dönünce aynı varlığın not sekmesi ve oturum taslağı geri geliyor. |
| Portföy erişim hatası | Bakiye/boş portföy uydurulmuyor; hata, Tekrar dene ve kapalı kayıt formu gösteriliyor. |
| Gerçek boş portföy | Henüz pozisyon olmadığı anlatılıyor; ekleme formu kullanılabiliyor. |
| Fiyatı bulunmayan pozisyon | QA-MISSING satırı silinmiyor; tutar/ağırlık tire ile gösteriliyor. Tam risk/dağılım hesaplanamadığı belirtiliyor; kayıt düzenlenebiliyor. |
| Şirket adına arama | Apple → AAPL. Sonuçsuz aramada aktif metin ve Aramayı temizle düğmesi var. |
| Geri/ileri ve filtre | Tarihçe kaydı kendi piyasa aramasını ve sıralamasını saklıyor. Seçili varlık filtre dışındaysa grafik başka varlığa kaymıyor. |
| AAPL gecikiyor, PLTR seçiliyor | Son detay ve grafik kaynağı PLTR; geç AAPL yanıtı ekranı ezmiyor. |
| Grafik odağı | Çalışma alanı genişliyor; kapatınca seçili varlık ve günlük periyot korunuyor. Yeni hesap başlatılmıyor. |
| Klavyeyle tarayıcı sıralama | Enter ile sembol sıralaması, columnheader üzerinde ascending durumu ve aynı düğmede odak. Çoklu sinyaller görünür. |
| Tarayıcıdan teste aktarım | Sembol seçiliyor; Testi Çalıştır kendiliğinden tetiklenmiyor. Önceki sonucun parametre bağı korunuyor. |
| Backtest 100 AL eşiği | Sıfır işlem açıkça gösteriliyor. Eşik değiştirilince sonuç Önceki test sonucu olarak etiketleniyor. |
| DCF | AAPL için hesap çalışıyor. WACC değişince eski 224,78 sonucu korunuyor ve önceki sonuç etiketi geliyor. Hisse adedi 0 girilince gerekçe gösteriliyor. |
| Graham/DDM | Aynı mevcut API ile Graham 205,06 ve DDM 172,01 sonucu alındı. Bunlar modelin doğruluğuna ilişkin başarı ölçümü değildir. |
| Monte Carlo ve tek varlık korelasyonu | Simülasyon tamamlandı; yüzdelikler simülasyon çıktısı olarak adlandırılıyor. Tek varlıkta boş matris yerine iki varlık gerektiği anlatılıyor. |
| Eksik kripto ve eşleşmeyen rapor | ABD/BIST kullanılabilir. Kaynak arızası, raporun eski kesiti ve eşleşen AI katmanının yokluğu açık. |
| Tahmin sonucu yok | Sıfır araştırma tahmini için başarı oranı üretilmiyor. Model görüşü ve ölçüm ayrı. |
| Rapor bağlantısı ve kaynak | Takvim bağlantısı mevcut raporda kaydırıyor; uygulama görünümünü değiştirmiyor. Haber kaynağı ve gerçek yayın saati açılabiliyor. Yanıttaki 18 bilanço kaydının tamamına erişiliyor. |

## İşlev koruma matrisi

| ID | Son konum / durum | Kanıt |
|---|---|---|
| OV-01 | Üst portföy bandı, dikkat bölümü, piyasa bağlamı; korundu | Önce/sonra ve %100 yoğunlaşma senaryosu |
| OV-02 | Karar kokpiti, fikir hunisi, overlay, katalizör; korundu | Tarayıcıda görünen bölümler; action-layer testleri |
| OV-03 | Yönetici özeti, rejim, fırsatlar, model portföyü, döviz; korundu | Mevcut render işlevleri ve Genel Bakış sayfası |
| OV-04 | Performans ve öğrenim; korundu | Journal/scorecard testleri; sıfır örneklem görünümü |
| MKT-01 | Arama/sıralama, liste, grafik ve gösterge kontrolleri; korundu | Apple araması, grafik odağı, periyot, responsive kontroller |
| MKT-02 | Özet/Teknik/Araştırma; korundu | Şirket özeti, benzerler ve komite notu render bağlantıları; action-layer testleri |
| MKT-03 | Not ve takip; korundu | Not hata/taslak senaryosu; alarm kayıt metni ve journal testleri |
| PORT-01 | Pozisyon tablosu ve düzenleme; korundu | Kayıt hatası, eski→yeni önizleme, eksik fiyat ve boş portföy |
| PORT-02 | Risk bandı, aksiyon ve risk planı; korundu | %100 yoğunlaşma; eksik fiyatın tüm riskten ayrılması; risk-plan testleri |
| SCAN-01 | Tek tablo, piyasa/sinyal filtreleri, 25/50/100; taşındı | Çoklu sinyal, klavye sıralama, teste aktarım |
| BT-01 | Form → kıyas/eğri/risk/işlemler; korundu | Sıfır işlem ve eski sonuç senaryosu; insights testleri |
| FC-01 | Portföy senaryosu; korundu | Tamamlanan MC, stres tablosu, tek varlık açıklaması; forecast testleri |
| VAL-01 | Şirket değerlemesi; korundu | DCF/Graham/DDM gerçek API sonuçları, girdi hatası, hassasiyet ve 10 yıllık tablo |
| RPT-01 | Bölüm bağlantıları ve kaynak defteri; taşındı | Eşleşmeyen rapor, tam bilanço erişimi ve haber kaynakları; report/research testleri |
| EDU-01 | Konu defteri, rehber, hesaplayıcı ve arşiv; taşındı | Sayfa ve hesaplayıcı kodu/action-layer testleri. Quiz mevcut AI raporuna bağlı; canlı AI olmadığı için bu kesitte quiz yok. |
| SHELL-01 | Dört tema, menü, yenileme/yetkili kayıt; korundu | Tema kontrastı, Escape/odak, kayıt hata senaryoları |

## Test sonucu ve kabul sınırı

`npm test`: 27 test giriş noktası, çıkış kodu 0. Yeni regresyonlar tarihçe/URL, pozisyon taslağı, eksik fiyatlı sembol seçimi, Unix zaman biçimi ve parametresi değişen eski sonuçların etiketlenmesini kapsıyor. Mevcut finans, araştırma ve veri bütünlüğü testleri de geçti.

Son değişikliklerden sonra temiz tarayıcı oturumunda on sayfa tekrar açıldı; tarayıcı hata günlüğü boştu. Üç ana ekran yedi genişlikte yeniden kontrol edildi; 21 ek kontrolde gövde taşması bulunmadı.

Bu ortamda gerçek NVDA/VoiceOver kullanım testi, sistemin hareket azaltma tercihini değiştirerek deneme ve tarayıcının gerçek %200 yakınlaştırması tamamlanmadı. Hareket azaltma CSS/JS kuralları ve erişilebilir DOM denetlendi; bunlar bu üç manuel kabulün yerine geçmez. Core Web Vitals saha ölçümü yapılmadı. Canlı sağlayıcı arızası ve eksik/eşleşmeyen AI raporu tasarım testiyle giderilmiş sayılmaz.

Uygulama yerel incelemeye hazırdır. Bu açık kabul kontrolleri yapılmadan tam WCAG uyumu veya tüm kabul koşullarının kapandığı iddia edilmez.

Normal 5190 önizlemesi teslimde açıldı. Uygulamanın mevcut otomatik yenilemesi yeni 30 Eylül 03:59 GMT+2 kesitini getirdi; karşılaştırma ekranları yukarıdaki dondurulmuş 29 Eylül kesitinde kalır. [Normal önizleme görüntüsü](overview-preview-current.jpg) ayrı kaydedildi. QA sunucusu kontrollerin ardından durduruldu; gerektiğinde `node scripts/ui-qa-server.js` ile yeniden başlatılabilir.

## 30 Eylül — ikinci kabul turu

Başarılı kayıt ve tekrar deneme uçtan uca kontrolleri tamamlandı. QA sunucusuna `success` ve `retry` senaryoları eklendi: portföy ve journal yalnız sunucu belleğinde tutuluyor, gerçek uygulamaya bu yazmalar iletilmiyor. Journal revizyon çatışması da korunuyor. İlk hata senaryoları değişmedi. QA yardımcısının HTTP testi, kaynak sunucuya kayıt isteği gönderilmediğini doğruluyor.

Bu turdaki veri kesiti 30 Eylül 05:25 GMT+2; önce/sonra karşılaştırmasının 29 Eylül kesitini değiştirmez. Gerçek `/api/portfolio` son kontrolde hâlâ ASTOR 150 adet / 300 maliyet; gerçek journal tek mevcut not / sıfır alarm içeriyordu. Sentetik not ve pozisyonlar 5191 belleğinde kaldı.

| Kontrol / düzeltme | Kanıt |
|---|---|
| Pozisyon çift basma, başarı ve yeniden yükleme | 1 istek, 1 başarı; 151 / 301 kaydı yeniden yüklemede kaldı |
| Not çift basma ve kayıt sırasında yeni metin | 1 ilk istek; önceki metin kaydedildi, yeni taslak korundu; ikinci kayıt yeniden yüklemede okundu |
| Alarm çift basma ve yeniden yükleme | 1 alarm yazması; kural seçili kaldı |
| İlk kayıt hatası → tekrar deneme | Portföy, not ve alarm ayrı ayrı 2 deneme / 1 hata / 1 başarı |
| Portföy kaydı sırasında yeni düzenleme | Son kayıtta 155 / 305; formda yeni 156 / 306 taslağı ve açık durum mesajı |
| Birden fazla journal formu / silme-kaydetme çakışması | Ortak kayıt kilidi; olay temelli regresyonlar |
| Strateji / Monte Carlo / DCF çift basma | Her uç için tek hesap isteği; kaynak zaman ölçümü, ağ yanıtlarından okunuyor |
| Hesaplanmamış Monte Carlo | Sekme seçimi sıfır tutarlı sahte sonucu açmıyor; başarı sonrası sonuç var, diğer sekmede gizli |
| Sıfır işlemli strateji | Yüzde isabet ve daha güvenilir iddiası kaldırıldı; kapanan işlem olmadığında başarı ölçülemiyor |
| Grafik erişimi | Model dağılımı, puanlar, backtest ve MC için isimli grafik + klavyeyle açılan tablo; AAPL 251, backtest 201, 90 günlük MC 91 satır |
| Grafik/tema entegrasyonu | OKLCH grafik kütüphanesine sRGB olarak aktarılıyor; dört temada AAPL gerçek grafiği başarılı |
| Grafik odak düğmesi | Gösterge panelinden kontrol satırına taşındı; yedi genişlikte örtüşme yok |

[Kayıt ve hesap akışları](acceptance-records.json), [son DOM denetimi](acceptance-dom-audit.json), [tema/grafik kontrolü](acceptance-chart-themes.json), [odak geometrisi](acceptance-focus-geometry.json).

Yeni grafik tabloları açıkken dört kompozisyon yedi gerçek viewport genişliğinde yeniden ölçüldü: 28 kontrolde gövde taşması yok. [Son genişlik kanıtı](acceptance-final-widths.json). Bu kontrol gerçek %200 tarayıcı yakınlaştırmasının yerine geçmez.

### Yerel performans

Seçili ve görünür IAB sekmesinde, 1440×900, CPU/ağ kısıtlaması olmadan: LCP 968 ms, CLS 0,000238; on sayfanın tıklama → iki çizim karesi gözlemi 18–92 ms. İlk yüklemede 162 ms uzun görev de gözlendi; hiçbir uzun görev olmadığı iddia edilmiyor. [Ham ölçüm](acceptance-performance-foreground.json). Bu süreler resmi INP, cihazlar arası kıyas veya saha Core Web Vitals sonucu değildir. İlk arka plan sekmesi ölçümü throttling/test aracı etkisine açıktı; `acceptance-performance.json` karşılaştırma için saklandı, kabul değeri olarak kullanılmıyor.

33 test giriş noktalı `npm test` son değişikliklerle geçti (çıkış 0). Journal/portföy eşzamanlı kayıt, bekleyen taslak, grafik erişimi, QA yazma izolasyonu, sıfır örneklem ve hesaplanmamış sonuç için yeni regresyonlar eklendi.

### Kalan kabul

Gerçek NVDA, gerçek %200 tarayıcı yakınlaştırması ve Windows hareket azaltma ayarı bu araç ortamında kontrol edilemiyor; **açık**. [Manuel kabul listesi](manual-acceptance.md) bu üç görevi ve son kullanıcı incelemesini tarif eder. DOM/klavye kontrolleri bu testleri tamamlanmış yapmaz. Yerel teknik kontroller tamamlandı; tam erişilebilirlik veya bütün şartnamenin koşulsuz kabulü ilan edilmedi. Canlı yayın ayrı adımdır.

[Son fiyat grafiği](acceptance-chart-final.jpg), [kayıt sırasında taslak](acceptance-pending-draft.jpg), [sıfır işlem açıklaması](acceptance-zero-trades.jpg).

Teslimde geçici test sekmesi kapatıldı ve viewport sıfırlandı. QA sunucusu durduruldu. Normal 5190 önizlemesi yeniden yüklendi ve açık bırakıldı; mevcut otomatik yenileme 30 Eylül 05:55 GMT+2 kesitini getirdi, hata günlüğü boştu. Bu yeni canlı kesit yukarıdaki dondurulmuş test verisiyle karıştırılmamalıdır.
