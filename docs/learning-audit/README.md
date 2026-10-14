# Öğrenme ve kayıp denetimi — ilk paket

Bu paket eski sonuçları değiştirmeden girdi çakışmalarını görünür kılar ve kaydedilmiş sonuçların kanıt kalitesini denetler. Strateji eşikleri, risk/maliyet formülleri, ilk tahminler ve model aktivasyon politikası değiştirilmedi.

## Gerçek kaynak karşılaştırması

13 Ekim ABD incelemesinde 12 varlığın aynı referans günündeki öğrenme kaydı karşılaştırıldı. Sekizinde yalnız kaynak kanıtı hash'i değişti; dördünde ATR'ye bağlı üç özellik de değişti. Referans fiyat/tarih ve uygunluk aynı kaldı. Eski tam kaynak gövdesi saklanmadığından hash farkının kesin nedeni veya tarihsel fiyat revizyonu doğrulanamadı; pencere kayması yalnız araştırılacak olası açıklamadır.

Yeni akış:

- İlk örnek aynen korunur; yeni içerikle üzerine yazılmaz.
- Bağlam ve yalnız kanıt özeti farkları ayrı gözlem olarak kaydedilir.
- Sayısal özellik, kanıtlanmış ortak OHLCV, uygunluk ve bilinmeyen alan farkları çakışma olarak kalır.
- Tekrarlanan aynı gözlem yeni eğitim örneği, tahmin veya başarı sayılmaz.
- Yeni tam kanıtlar hash ile ayrı ve değiştirilemez cache anahtarlarında korunur. Tüm öğrenme kataloğuna büyük kaynak gövdeleri eklenmez.
- Makro girdi çakışmasında yeni gelen sonuç etiketi ilk örneğe bağlanmaz; mevcut etiket değişmez.
- Genel API yalnız sınırlı neden ve gözlem özetini gösterir; eski özette ayrıntı bulunmaması sıfır değişim olarak sunulmaz.

Canlı, yalnız ABD kapsamındaki doğrulama 12 ilk örneğin hash'lerinin aynı kaldığını ve günlük içeriğinin kontrol boyunca değişmediğini gösterdi. 12 ayrı gözlem eklendi: 8 kanıt değişimi ve 4 sayısal değişim. Eğitim veya aktivasyon çağrılmadı. Bu toplama tüm piyasaların toplandığı anlamına gelmez; kapsam ayrıca kaydedilir. Süre yaklaşık 345 saniyedir; sonraki performans çalışması toplu cache okumalarını hedeflemelidir.

## Kayıp incelemesi

374 benzersiz eski sistem kaydı var: 358 kapanmış, 16 açık. Kapanmışların 96'sı olumlu, 262'si olumsuz etiketli. Kayıtlı giriş/çıkış fiyatlarıyla sonuç aritmetiği bu örneklemde tutarlı; bağımsız gerçekleşme kanıtı doğrulanmış değildir.

| Piyasa | Kapanmış kayıt | Ham kayıt ortalaması |
|---|---:|---:|
| BIST | 296 | −%1,57 |
| ABD | 36 | −%0,78 |
| Kripto | 26 | −%0,89 |

Bu eşit ağırlıklı, masraflar öncesi kayıt ortalamasıdır; net portföy getirisi değildir. Eski kayıtların tamamında para birimi ve fiyat temeli alanları eksik. Kapanmış 358 kaydın yalnız 22'sinde sonuç/çözümleyici metadata alanları var; bunların varlığı bağımsız işlem doğrulaması sayılmaz.

Ham olumlu sonuç büyüklüğü ortalaması %11,75, olumsuz sonuç büyüklüğü %6,27; oran yaklaşık 1,87. Mevcut ham olumlu oran %26,8 ile birlikte kayıt ortalaması negatiftir. Bu bulgu tek başına stopları genişletme, eşikleri artırma veya model eğitimine geçme talimatı değildir.

## Kullanım

```powershell
npm run audit:losses -- --live --output docs/learning-audit/live-loss-audit.json
npm run learning:diagnose -- --output docs/learning-audit/us-conflicts.json
node scripts/record-learning-observations.js --output docs/learning-audit/us-check.json
```

Son komut varsayılan olarak yalnız okur. `--write-observations` açıkça verilirse yalnız öğrenme kanıtı/örnek/gözlem/projeksiyon anahtarlarına yazabilir; strateji, günlük veya portföy yazma yeteneği yoktur. Bu komut bütün piyasaları taramaz ve model eğitmez. Kaynaklar uygulama verisi dışındaki toplu raporlara yazılır; özel notlar veya ham günlük rapora alınmaz.

## Kabul ve sonraki adım

Tam `npm test` ve ek öğrenme/kayıp denetimi regresyonları geçti. İlk örnek ve etiket korunması, eşzamanlı tekrar, eski kanıt eksikliği, kaynak gövdesi hash doğrulaması, ortak mum revizyonu, pencere farkı, gelecek kayıtların dışlanması ve karışık yöntemlerin sonuçlarının birleştirilmemesi kontrol edildi.

İlk hedef, karar anındaki fiyat/gösterge kanıtını ve işlem sonucunu birlikte kaydeden değerlendirme setidir. 90/180 günlük fiyat değişimi ile stop/hedef içeren işlemin net sonucu ayrı görevler olarak kalmalıdır. Güvenilir kanıt, bağımsız dönem ve maliyet sonrası kıyas oluşmadan yeni model veya eşik devreye alınmaz.

Yayın ve ekran kabulü bu dosyaya doğrulamadan sonra eklenir.
