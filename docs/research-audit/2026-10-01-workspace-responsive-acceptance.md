# Finans çalışma alanı · yoğunluk ve responsive yerel kabul

1 Ekim 2026. Bu kayıt yerel arayüz paketini kapsar. Bütün ürünün, gerçek tarayıcı yakınlaştırmasının veya canlı dağıtımın tamamlandığı anlamına gelmez.

## Değişiklik ve gerekçe

| Önce | Sonra | Neden |
|---|---|---|
| Değerleme hisse seçimi mobilde alanın dışına taşıyor, model ve eylem erişimini bozuyordu. | Üst kontroller kendi alanına sığar; geniş alanda aynı satır, dar alanda doğal kırılma kullanır. | İşlevleri gizlemeden form kullanılabilir kalır. |
| Tek geniş varsayım sütununda beş slider ekranı kaplıyordu. | Panelin kendi kullanılabilir genişliği 680 px'e ulaşınca iki sütun; dar yan panel ve telefonda tek sütun. | Yazıyı küçültmeden aynı ekranda daha fazla girdi görülür. |
| DCF'ye geri dönüş CSS grid'i inline flex ile eziyordu. | Aktif DCF grubunun düzenini CSS yönetir; pasif gruplar gizlenir. | Graham/DDM/DCF geçişlerinde yerleşim korunur. |
| Koyu değerleme alanlarında sayısal değerler siyah görünüyordu. | Alan değerleri metin tokenını kullanır; düğme rengi input'a sızmaz. | Kullanıcı kendi varsayımlarını okuyabilir. |
| Uzun semboller 44 px'lik hücre kontrolünde kırpılıyordu. | Sembol kontrolünün yeterli asgari genişliği vardır; gereken yatay kaydırma tablo içinde kalır. | Semboller kısaltılmaz veya harflere bölünmez. |
| Okuryazarlık hesaplayıcısının alanları dar sütunlara sıkışıyordu. | Alanlar kendi esnek düzeninde kırılır; etiket ve sayılar okunur. | Hesaplayıcı telefonda da kullanılabilir. |
| Boş portföy dört stres senaryosunu sıfır etki gibi gösterebiliyordu. | Başarılı boş portföy, erişim hatası ve yükleme ayrı açıklanır. | Eksik veri zararsız sonuç gibi sunulmaz. |
| Başarısız stres yenilemesi son sonucu kaybettirebiliyordu. | Son başarılı sonuç korunur; başka portföye aitse açıkça etiketlenir. Gerçek tekrar deneme düğmesi vardır. | Kullanıcı veri hatasından toparlanabilir; eski sonuç güncel portföye uygulanmış gibi görünmez. |

Değişen uygulama dosyaları: `public/styles.css`, `public/index.html`, `public/app.js`. Finansal formüller, model, API şeması ve otomasyon takvimi bu pakette değiştirilmedi. Önceden mevcut çalışma ağacı değişiklikleri korunmuştur.

## Tarayıcı kanıtı

İzole kabul sunucusu: `http://127.0.0.1:5194/?qa=full`; kaynak okuma kesiti mevcut yerel 5190 sunucusundan. Üretim portföy/not yazmaları kabul sunucusundan iletilmez. Tarayıcıda portföy kaydı veya not kaydı yapılmadı. Değerleme kontrolünde mevcut salt hesaplama uçları kullanıldı; model çağrısı, araştırma yayını ve deploy yapılmadı.

On ana ekranın her biri **320, 390, 630, 820, 1024, 1280 ve 1440 CSS px** genişliklerinde tarandı. Her gezinmede beklenen başlık doğrulandı; 70 kayıtta yanlış ekran başlığı yok. Ölçülen görünür başlık, açıklama, etiket ve düğme metinlerinde kırpılma ve gövde taşması bulunmadı. Gerekli tablo içi yatay kaydırma ayrı tutuldu; bu tarama tablonun her hücresinin tam içeriğini ispatlamaz.

Portföy senaryosu ayrıca yedi genişlikte; DCF, Graham ve DDM formları ayrı ayrı yedi genişlikte kontrol edildi. Mobil form/eylem kontrolleri ölçülen durumlarda 44 px hedef alanını karşılar. Genel Bakış boş portföy eylemlerinin 630/820 px'deki son boyut düzeltmesi yeniden yükleme sonrası doğrulandı. Masaüstü yoğun kontrollerin daha küçük boyutu mobil kabulüyle karıştırılmadı.

| Akış | Doğrulanan davranış |
|---|---|
| Boş portföy → stres testi → Portföye git | Sahte sıfır sonuç yok; eylem Portföyüm başlığına götürür. |
| Portföy okuma hatası | “Portföy verisi alınamadı; stres senaryosu gösterilemiyor.”; boş portföy açıklaması kullanılmaz. 390 px'de taşma yok. |
| DCF → Graham → DDM → DCF | Yalnız aktif grubun alanları görünür; DCF kendi grid düzenine geri döner. |
| Geçerli değerleme → geçersiz WACC/büyüme | Önceki hesaplanan değer değişmez; WACC 4 ve terminal büyüme 6 girdileri korunur; neden açıkça görünür. Bu finansal varsayımların doğruluğunun denetimi değildir. |
| Okuryazarlık hesaplayıcısı | 320 px'de dört etiketin client/scroll genişlikleri eşit. Örnek girdiler 10000 / %1 / fiyat 100 / ATR 2 ile mevcut hesaplama 100 risk, 97 stop, 33 adet ve 3300 pozisyon gösterir. Bunlar kabul girdileridir. |
| Mobil menü + Escape | Menü kapanır; odak `navToggle` Menü tetikleyicisine döner. |
| ABD sembol kontrolleri | Yedi genişlikte 12 sembol kontrolünde ayrıca kırpılma bulunmadı. Bütün piyasa hücrelerinin kabulü yerine kullanılmaz. |

Son sağlıklı önizlemede yakalanan error/warn konsol kaydı yok. [Ham tarayıcı kaydı](2026-10-01-workspace-responsive-browser.json).

## Görsel karşılaştırma

Mobil değerleme aynı kaynak kesiti, AAPL/DCF, Karbon tema ve 390 × 844 görünümle karşılaştırıldı. Göreli veri yaşı doğal olarak ilerler; görüntüler kontrollü performans ölçümü değildir.

- [Mobil önce](2026-10-01-valuation-mobile-before.png)
- [Mobil sonra](2026-10-01-valuation-mobile-after.png)
- [Masaüstü son düzen, 1280 × 900](2026-10-01-valuation-desktop-after.png)
- [İlk ölçüm ham kaydı](2026-10-01-workspace-responsive-before.json)

## Kontrast ve test kapsamı

Dört temanın on ana ekrandaki ilk görünümünde **2687 ölçülebilen metin örneği** sıfır kontrast ihlaliyle geçti; en düşük oran yaklaşık **5,21:1**. Gradyan/katman nedeniyle 36 örnek ölçüm dışıdır. Bu örneklem input değerlerini kapsamıyordu; görsel incelemede bulunan sayısal alan sorunu ayrıca düzeltildi.

DCF/Graham/DDM'de dört tema için **84 aktif input/select alanının değer rengi** ayrıca hesaplandı: sıfır ihlal, sıfır dışlama; en düşük oran yaklaşık **12,63:1**. Açılmış yerel select popup'ları, placeholder'lar, bütün hata/odak durumları ve grafik metinleri bu kanıtın kapsamında değildir.

[Ana metin kontrast raporu](2026-10-01-workspace-theme-contrast.json), [alan değeri kontrast raporu](2026-10-01-valuation-control-contrast.json), [alanların ham stilleri](2026-10-01-valuation-control-styles.json).

`npm test` son kaynak kesitinde 65 test dosyasıyla çıkış 0 tamamlandı. [Tam çıktı](2026-10-01-workspace-responsive-npm-test.txt). Son durum testleri gerçek frontend fonksiyonunu çalıştırır: yükleme/erişilememe/gerçek boş portföy, eksik şok ile gerçek sıfır ayrımı, hata sonrası içerik koruma, değişen portföy etiketi ve geç tamamlanan eski istek. Model görünürlüğü testi ve gerçek tarayıcı model geçişi birlikte kullanıldı. CSS/UI sözleşmesi kontrolleri ile `node --check public/app.js` ve kapsamlı diff boşluk kontrolü başarılı.

## Açık kabul kapıları

- Gerçek tarayıcı %80/%100/%125/%200 yakınlaştırması. Mevcut bağlı yüzey IAB viewport kontrolü sağlar; Chrome bağlı değildir. Viewport daraltmak gerçek zoom diye sunulmaz.
- Bütün araçların bütün klavye, ekran okuyucu, kayıt hatası, yavaş ağ ve odak/taşan popup durumları; grafik alternatiflerinin ve dört temanın bütün durumlarının kabulü.
- Güncel bulut defterinin geri okunması, gerçek kaynaklı CPI model yayını/ilk sonucu, CPI bağımsız konsensüsü ve yeterli ileri dönem örneklemle kalibrasyon.
- Lisanssız şirket yatırımcı ilişkileri kaynak pilotu ve doğrulanmış kapsam. Tam KAP veri servisi erişimi varsayılmaz.
- Yeni kodun canlı dağıtımı ve canlı uçların doğrulanması.

Bu paket responsive/yoğunluk kusurlarını somut olarak azaltır. Genel karar ve tahmin sistemi hedefi açık kalır; sonuçlanmamış tahminlerden başarı oranı üretilmez.
