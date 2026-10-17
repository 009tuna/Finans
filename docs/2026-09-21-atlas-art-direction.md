# Finans / Piyasa Atlası — somut sanat yönetimi

21 Eylül 2026. Bu belge tasarım önerisidir; üretim uygulaması veya finansal araştırma değildir. Önceki deneyim yönünü somutlaştırır. Eşlik eden bağımsız konsept docs/design-atlas/index.html içindedir. Mevcut sitenin koduna bağlı değildir.

## Karar

Finans'ın ana yüzeyi bir günlük yayın gibi okunacak; seçilen gelişme açıklayıcı bir analiz alanına dönüşecek. Ürünün ayırt edici unsuru haberin, model yorumunun ve eksik kanıtın tek bir ilişkili görünümde anlaşılması olacak. Grafiklerin estetiği verinin doğruluğunun önüne geçmeyecek.

Görsel yön: nötr açık yüzey, neredeyse siyah metin, doygun kobalt seçim rengi; analiz alanında koyu mürekkep yüzey. Ana kompozisyon 8/4 kolon oranında asimetrik. Dış çerçeve yerine 1px ayırıcılar, büyük başlık ve boşlukla hiyerarşi. Kart yalnız bağımsız bir araç için. Başlıkların kişiliği belirgin; kontroller ve sayılar sakin. Yuvarlaklık çoğunlukla 6–10px.

## İlk 60 saniyenin sahneleri

1. Açılış: Finans markası, rapor tarihi, dört ana navigasyon ve tek ana haber. Kullanıcı başlık, iki cümle bağlam ve kaynağın türünü görür. Büyük bir portföy tutarı veya puan gösterisi açılışı işgal etmez. Ana hikâye veri eksikse bunun yerine son doğrulanmış raporun tarihi görünür.
2. Haber seçimi: İkinci bir başlığa basıldığında başlık ve analiz alanı birlikte güncellenir. Seçili öğe yerini korur; bütün sayfa yeniden giriş animasyonu oynamaz. Önceki ve yeni hikâye arasında en fazla 240ms geçiş.
3. Etkiyi inceleme: Koyu alanda olay, olası aktarım kanalı ve yeniden değerlendirme koşulu görünür. Kaynağa dayanan olay ile koşullu model yorumu etiketle ve çizgi türüyle ayrılır. Örnekteki bağlantı, doğrulanmış fiyat tepkisi olarak sunulmaz.
4. Karşı görüş: Kullanıcı karşı kanıtı aynı alanda açar. Metin eklenirken grafik üzerindeki ilgili bağ vurgulanır; karşı kanıt gizli bir dipnot olmaz.
5. Varlığa geçiş: Üretim tasarımında yalnız kaynak/rapor içinde ilişkilendirilmiş semboller gösterilir. Sembol yoksa piyasa düzeyinde kalınır. Mobilde tam genişlikte detay; geri dönüşte haber seçimi ve kaydırma konumu korunur.
6. Takip: Kullanıcı koşulu notuna ekleyebilir veya mevcut alarma bağlayabilir. İşlem yerinde onaylanır; başarısızsa girdi kalır. Bağımsız konsept bu kalıcı işlemleri gerçekleştirmez.

## Ekranların karakteri

| Ekran | Baskın içerik | Ayırt edici etkileşim |
|---|---|---|
| Bugün | Bir ana olay ve kısa ikincil gündem | Haberle birlikte değişen açıklama alanı |
| Piyasalar | Sembol listesi, tarihli fiyat ve seçili varlık | Liste ile ilgili haberin eşzamanlı seçimi |
| Rapor | Kaynaklı uzun okuma | Bölüm bağlantıları ve bağlam içinde kaynak açıklaması |
| Takibim | Portföy, not ve izleme koşulları | Haberle ilişkili mevcut notu bulma |
| Laboratuvar | Geçmiş kayıt ve senaryo | O gün bilinenlerle sonucun karşılaştırılması |

Günlük rapor aynı metni farklı kartlarda yeniden üretmez. Teknik tarayıcı Piyasalar'ın filtrelerine; strateji testi ve projeksiyon Laboratuvar'a yerleşir. Mevcut işlevlere doğrudan erişim korunur.

## Hareket tarifleri

| An | Süre ve davranış | Hareket azaltıldığında |
|---|---|---|
| Kontrole basış | 110ms renk değişimi ve çok küçük basılma | Renk değişimi |
| Haber seçimi | 200–240ms geçiş; içerik her zaman görünür | Anında değişim |
| Kaynağı/karşı kanıtı açma | 180ms vurgu; doğal içerik akışı | Anında açılma |
| Mobil ayrıntıya geçiş | 240–300ms kısa konum geçişi | Anında görünüm |
| Sonuç karşılaştırması | Kullanıcı talebiyle 300ms sonuç işaretinin belirmesi | Sonuç doğrudan görünür |
| Veri güncelleme | Yalnız değişen satırda tek kısa vurgu | Güncellendi metni |

Cursor takibi, yapay yavaş kaydırma, sonsuz haber bandı, sürekli parlayan arka plan, rakamları sıfırdan saydırma ve her açılışta logo gösterisi kullanılmaz. Hareket tek bir olayın anlaşılmasına yardım eder. Klavye ve dokunma eşit işlevlidir.

## İçerik dili

Üç katman: kısa başlık → neden önemli → kanıt ve yöntem. Kaynak kapsamı özet bir durumla görünür; önemli sınır seçili olayın yanında anlatılır. Aynı uyarı her kartta tekrarlanmaz.

17 Eylül yerel raporunda iki araştırma olayı ve bir koşullu senaryo var; sayısal tahmin yok. Bu içerikle geçmiş tahmin isabeti veya gerçekleşen piyasa etkisi gösterilemez. Konsept bu kayıtları yalnız arşiv içerik olarak kullanır. Yayın saati bilinmiyorsa saat üretilmez. Nötr piyasa ile bilinmeyen piyasa farklı görünür.

Teknik puan, yön tavsiyesi görünümünden ayrılır: model değiştirilmeden etikette puanın neyi ölçtüğü açıklanır. Bir 80/100 skor yüzde olasılık gibi çizilmez. Sayısal tahmin yokken laboratuvar öğrenme içeriği sunabilir; yapay başarı üretmez.

## Üç güçlü ikinci aşama

- Karar arşivi: Günün kayıtlarını dondurulmuş haliyle incele; ardından sonuçları aç. Veri zamanlaması ve revizyon geçmişi gerekir.
- Beklenti farkı: Konsensüs, açıklama öncesi tahmin ve gerçekleşeni aynı eksende göster. Birimler ve muhasebe tanımları eşleşmelidir; eksik değer gösterilmez.
- Açıklamalı senaryo: Kullanıcı tek varsayımı değiştirir; mevcut hesaplama modeli sonucu ve nedenini açıklar. Yeni nedensellik modeli gerekirse UI paketine gizlice eklenmez.

## Uygulama sınırı ve kalite kapısı

Önce bağımsız konsept değerlendirilir. Sonraki üretim paketi yalnız Bugün → olay → mevcut varlık görünümü akışıdır. Ana yapıya taşındıktan sonra diğer ekranlar aynı bileşen sistemiyle uyarlanır. Yeni framework, backend veya ücretli model çağrısı bu tasarım çalışmasının varsayılanı değildir.

En fazla iki uygulama ajanı, açık dosya sahipliği. Root sanat yönetimi ve tek nihai görsel inceleme yapar. Tekrarlayan geniş denetimler yerine değişen akışın testi yapılır. Çalışan çıktı bulunmadan yeni özellik paketi açılmaz.

Kabul: 390px ve 1440px'te güçlü kompozisyon; uzun Türkçe başlıkta taşma yok; görünür klavye odağı; azaltılmış hareket; gerçek ve yorumun anlaşılması; tarih/kaynak bağlamının korunması. Üretim uyarlamasında ayrıca 630/820/1280px, veri hataları ve mevcut npm test paketi kontrol edilir. Awwwards düzeyi hedef olarak kalır, ödül veya kalite iddiası peşinen yapılmaz.
