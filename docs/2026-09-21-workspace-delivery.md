# Finans çalışma alanı yeniden düzenleme

21 Eylül 2026

## Değişen yapı

- Genel Bakış artık haber merkezli bir açılış değil; portföy durumu, piyasa KPI'ları, sinyal değişimleri ve karar katmanı üstte görünür.
- Araştırma/takvim içeriği karar alanının altında bağlam olarak kalır.
- Gelişmiş analizler başlangıçta görünür ve kullanıcı isterse tek bir ayrıntı yüzeyi olarak kapatabilir. Fırsatlar, dağılım, rejim, grafikler ve döviz widget'ı erişilebilir kalır.
- Portföy sayfasının pozisyon tablosu, risk planı, dağılım grafiği ve varlık ekleme formu korunur.
- Piyasa ekranlarında arama, sıralama, grafik, SMA/RSI/MACD, not, alarm ve seçili varlık ayrıntısı korunur.
- Rapor, tarayıcı, strateji testi, projeksiyon ve okuryazarlık sayfalarının navigasyonu korunur.
- Ortak yüzeyler daha kompakt hale getirildi: 216px yan menü, 60px üst çubuk, kısa boşluk ölçeği, tek odak rengi ve mobilde 44px kontroller.
- `prefers-reduced-motion` altında menü ve görünüm animasyonları tamamen kapanır; içerik animasyonun görünmesini beklemez.

## Kanıt

- `npm test` geçti: karar, grafik, UI sözleşmesi, UI davranışı, portföy durumu, forecast, rapor, günlük, araştırma ve API testleri.
- `git diff --check` geçti; yalnız Windows satır sonu uyarıları var.
- Yerel Chrome önizlemesinde gerçek veriyle Genel Bakış ve Portföy sayfaları görüntülendi; portföyde pozisyon tablosu, risk planı, dağılım grafiği ve kayıt formu görünür.
- Genel Bakış 1440px görüntüsü: `docs/2026-09-21-overview-live3.png`.
- Portföy 1440px görüntüsü: `docs/2026-09-21-portfolio-live.png`.

## Sınır

Bu teslim canlıya yayın yapmaz, backend/API şemasını değiştirmez ve finansal veriyi yeniden üretmez. 390px portföy doğrulamasında `document/body` yatay taşması yok, sayfa hatası yok ve tablo yalnız kendi sarmalayıcısında yatay kayıyor. Genişlik döngüsündeki geçici drawer tıklama denemesi gizli drawer öğesine doğrudan tıklamaya çalıştığı için kullanılmadı; görünür navigasyon akışı mevcut UI davranış testiyle kapsanıyor.
