# Piyasa adayları · kart, logo ve hareket kabulü

4 Ekim 2026. Kullanıcının adayların daha belirgin olması, kartlara geçmesi ve logolarla zenginleşmesi isteği uygulandı. Önceki font boyutlarını koruma şartı devam eder. İmplementasyon Impeccable `animate` rehberindeki kısa, amaca bağlı hareket ve hareket azaltma kurallarını kullanır.

## Son davranış

- ABD, BIST ve Kripto grupları korunur. Her aday ayrı kenarlığı ve yüzeyi olan tek native düğmedir. Logo/sembol/ad ve teknik puan üstte; yapılacak iş, gerekçe ve gerçek kayıt geçmişi aşağıdadır. Kart bütünü ilgili varlık ve görev alanını açar.
- Mevcut takip listesindeki 12 ABD hissesi, 100 BIST hissesi ve 21 kripto için toplam 133 yerel logo vardır. Kaynak eşleştirmesi, dosya özeti ve doğrulama zamanı `public/assets/asset-logos/sources.json` içindedir; yöntem README'de açıklanır. Görsel bilinmiyorsa veya yüklenemezse en fazla üç karakterli sembol karşılığı görünür. Piyasa ve kripto kimliği eşleştirmesi logo seçiminin parçasıdır. Tarayıcı dış logo servisine bağlanmaz.
- Kart hover hareketi 180 ms, basma geri bildirimi 120 ms. Aday sekmesine manuel dönüşte en fazla 12 kart için 180 ms ve en fazla 40 ms gecikme vardır; toplam 220 ms. İçerik başlangıçta görünür, ilk yüklemede ve veri yenilemede giriş animasyonu yoktur. Sekme değişimi devam eden hareketi iptal eder; hareket azaltma tercihi CSS ve JS yolunu kapatır.
- Yeni kart düzeni font-size eklemez veya değiştirmez. Önceki dört public dosyasındaki 195 deklarasyon, font kısaltmaları ve grafik font ayarları aynı kalmıştır.

## Kabul

| Kontrol | Sonuç |
| --- | --- |
| Tam `npm test` | Exit 0. Logo kimliği/hata karşılığı ve hareket/sekme yaşam döngüsü testleri dahil. |
| Responsive | 390, 768, 1280 ve 1440 px: 9 kartta sayfa/içerik/kart yatay taşması ve logo–puan çakışması yok. |
| Uzun ad | 390 px sentetik uzun şirket adları: 9 kartta taşma ve çakışma yok. |
| Eksik kaynak | Kripto verisi olmayan izole senaryoda 6 kart ve açık boş-piyasa mesajı; sahte aday yok. |
| Göreve geçiş | WIF kartı Enter ile gerçek tez notu alanına odaklanır; adaylara dönüş aynı karta odaklanır. MSFT kartı fiyat zamanı kontrolünü açar. |
| Tema/kontrast | Beş tema × sekiz kart metni = 40 ölçüm. Tümü 4,5:1 üstünde; en düşük 7,055:1 (Mist). |
| Gerçek yerel uygulama | 5190 portunda 9 kart ve 9 yerel logo yükleniyor; sayfa taşması yok. |
| Tarayıcı konsolu | Kart, tema ve görev kontrollerinde warning/error kaydı yok. |

İlk tam test turunda `workspace-tabs` izole harness'inin yeni tarayıcı bağımlılığı eksikti. Harness'e hareket bağlantısı ve manuel/programatik seçim, tekrar tıklama, iptal ve hareket azaltma kontrolleri eklendi; tam tur yeniden geçti.

## Kanıt

Kanıt dizini: `C:/Users/Monster/.codex/visualizations/2026/10/04/01a10467-e4d2-78d1-9371-4ee3a19bca9c/candidate-cards`.

- [Gerçek yerel uygulama](C:/Users/Monster/.codex/visualizations/2026/10/04/01a10467-e4d2-78d1-9371-4ee3a19bca9c/candidate-cards/desktop-live-final.jpg)
- [Mobil görünüm](C:/Users/Monster/.codex/visualizations/2026/10/04/01a10467-e4d2-78d1-9371-4ee3a19bca9c/candidate-cards/mobile-final.jpg)
- `responsive.json`, `long-names.json`, `partial-data.json`, `navigation.json`, `live-local.json`, `console.json`.
- `font-invariance.json`, `themes.json`, `contrast.json`, `npm-test.log`.

Bu kayıt yerel uygulama ve izole UI kabulüdür. Hareket azaltma yolu kaynak ve birim testinde doğrulandı; işletim sistemi tercihi ayrıca değiştirilmedi. Kontrast sonucu ölçülen metinlere, font koruması kaynak deklarasyonlarına aittir. Ekran okuyucu veya kullanıcı araştırması sonucu değildir. Bulut yayını yapılmadı. Önceki kapsamlı Impeccable uygulama kabulü ayrı tarihsel kayıtta kalır.
