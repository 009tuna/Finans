# Kayıp denetimi sözleşmesi

Bu paket yalnız okuma yapar. Strateji, eşik, risk formülü, karar kaydı, çözümleyici veya öğrenme modeli değiştirmez. Tahmin çözmez, eğitim çalıştırmaz, yayın yapmaz. Günlükteki donmuş kayıtlar korunur.

Yerel kullanım:

```powershell
node scripts/audit-losses.js --journal data/journal.json --output docs/learning-audit/local-loss-audit.json
node scripts/audit-losses.js --journal path/to/frozen-journal.json --snapshot path/to/snapshot.json
node test/loss-audit.test.js
```

Canlı kullanım açıkça `--live` gerektirir:

```powershell
node scripts/audit-losses.js --live --output docs/learning-audit/live-loss-audit.json
```

Varsayılan doğrulanmış proje alanı `https://finans-dashboard-iota.vercel.app`; isteğe bağlı `--base-url` yalnız bir origin kabul eder. `/api/journal` ve `/api/data` ayrı GET istekleridir; atomik veritabanı kesiti değillerdir. Snapshot okunamazsa denetim günlüğü işler ve eksik snapshot durumunu raporlar. Günlük okunamaz veya `predictions` yoksa hata verir; eksik veri boş başarıya dönüşmez. Ağ testlerde kullanılmaz.

`--output` kullanıldığında stdout kısa kohort özeti ve rapor yollarıdır; tam toplulaştırılmış JSON ve Markdown dosyalara yazılır. `--output` yoksa tam toplulaştırılmış JSON stdout'a çıkar ve hiçbir dosya yazılmaz. Notlar, ham günlük, kimlik listeleri, tokenlar, varlık etiketleri, özel tezler veya olay içerikleri dışa aktarılmaz. Rapor kaynağın üstüne veya uygulama `data` dizinine yazamaz. Bozuk JSON içeriği hata mesajına konulmaz. Yerel girdilerin yeniden yazıldığı iddia edilemez.

## Ayrı kohortlar

Her satır tam bir kohorta girer: `legacy-system`, `structural-system`, `manual`, `historical-simulation`, `unknown-source`. `user` ve `manual` kaynakları manuel kalır. Kaynağı olmayan kayıt sistem kabul edilmez. Yalnız `source=system` ve `strategyVersion=structural-long-v1` yapısal sistem kohortudur. Aynı stratejiye ait tarihsel simülasyon ayrı kalır. Kimliği yinelenen bütün satırlar ortalama dışıdır; hangi kaydın doğru olduğuna keyfî karar verilmez.

Birden fazla kohort varsa `allRecords` yalnız envanter sayımlarını tutar; karma ortalama, medyan, oran ve plan geometrisi ortalamaları null olur ve nedeni yazılır. Her kohortun kendi sonuçları korunur.

Her kohort piyasa ve kaydedilmiş skor aralığıyla ayrılır. Skorlar 0–19, 20–39, 40–59, 60–79, 80–100, aralık dışı ve bilinmeyen sınıflarındadır. Kayıp oranlarının yüksek skorla ilişkisi nedensel kanıt veya eşik değiştirme gerekçesi değildir. Tarih yoğunluğu `createdAt` alanının kaydedilmiş tarih kısmıdır; işlem veya borsa yerel tarihi olarak sunulmaz.

Kaydedilmiş skor sayısal değilse veya 0–100 dışındaysa `invalid-saved-score` tanısal uyarısı çıkar. Skor sorunu tek başına tutarlı geçmiş fiyat getirisini geçersiz saymaz; skorun aday kalitesini kanıtladığı da iddia edilmez.

Sonuç bölümü birbirini dışlayan `positive`, `negative`, `zero`, `pending`, `not-entered`, `ambiguous`, `invalid`, `incomplete`, `unknown` sınıflarıdır. Çelişkiler önce geçersiz sayılır. Eksik temel kimlik/piyasa/zaman/fiyat bilgisi tutarlı sonuç sertifikası alamaz. Ham kaydedilmiş sonuç sayıları ayrıca gösterilir; sayısal sonuç ile kaydedilmiş sonuç adı arasındaki fark görünür kalır.

## Aritmetik ve kanıt

Eski kayıt için `entry`, `closePrice`, `resultPct`; yapısal kayıt için `execution.fillPrice`, `exitPrice`, `grossResultPct` gerekir. Sayılar gerçek sonlu JSON sayıları olmalıdır; null, boş metin veya sayısal metin sıfıra çevrilmez. Giriş ve çıkış pozitif olmalıdır. Getiri `(exit / entry - 1) * 100` ile karşılaştırılır. Eski çözümleyicinin bir ondalığa yuvarlama toleransı 0.05000001 yüzde puanı; yapısal tolerans 1e-8 yüzde puanıdır. Eski hedef/stop kapanış fiyatı kaydedilmiş seviyeye uymalıdır. Sonuç işareti sonuç adıyla çelişmemelidir. Yapısal kayıtta kaydedilmiş maliyet modeli/net sonuç varsa onun aritmetiği de çelişki denetimine girer; net ortalama raporlanmaz.

`createdAt`, `resolvedAt`, geleceğe yazılmış kayıtlar ve çözümlemenin karar öncesinde olması denetlenir. Zamanlar timezone içeren ISO tarih-saat olmalı ve takvim günü geçerli olmalıdır. Sonuç yönü çıkış/giriş fiyatından denetlenir; küçük pozitif fiyat değişiminin eski çözümleyicide 0.0 olarak yuvarlanması tek başına çelişki sayılmaz. Yapısal girişin karardan sonra olması, kapanış state tutarlılığı, kaynak/plan para birimi ve fiyat bazının çelişmesi de incelenir. Eksik resolver, sonuç kanıtı, karar snapshot hash'i, giriş kanıtı, para birimi ve fiyat bazı sayılır. Yapısal sınıflandırıcının metadata sözleşmesi boşlukları ayrıca sayılır.

Kaynak alanlarının varlığı, sözleşmenin metadata kontrolünü geçmek veya fiyat aritmetiğinin tutması **işlemi bağımsız olarak doğrulamaz**. Bu paket hash'in gerçek tarihsel belgeyle eşleşmesini, fill sırasını veya broker/gerçek işlem fişini incelemez. `independentlyVerifiedExecutions=null`: sayı bilinmiyor, sıfır olduğu iddia edilmiyor. Eski kaydın güncel fiyatla “onarılması” yasaktır.

Ham ortalama yalnız tanınan kapalı, yinelenmeyen, temel verileri bulunan ve test edilebilir tutarlı sonuç altkümesidir. Kanıt/para birimi/fiyat bazı bilinmeyen satırlar bu betimsel altkümede bulunabilir; sayıları açıkça raporlanır. Bu nedenle ham ortalama **eşit ağırlıklı kaydedilmiş brüt tahmin sonucudur**; net veya gerçekleşmiş portföy getirisi, eğitim etiketi doğruluğu, işlem kalitesi veya model başarısı değildir. Pozisyon büyüklüğü ve sermaye tahsisi bilinmez. Manuel, simülasyon ve sistem kohortları bir performans iddiasında birleştirilmez.

Pozitif/negatif ortalama büyüklük oranı yalnız betimseldir ve her iki tarafın örneklemi varsa hesaplanır. Kaydedilmiş long plan oranı `(target-entry)/(entry-stop)` ile bilinen fiyatlardan hesaplanır: eski kayıtta nominal kayıt girişi, yapısal kayıtta varsa kaydedilmiş sanal fill. Yapısal giriş aralığının ortası uydurulmaz. Gerçekleşmiş risk oranı veya strateji beklentisi sayılmaz; eksik veya çelişkili planlar açıkça dışlanır.

Snapshot yalnız güncel kapsamın sayı ve zamanını verir. Karar anı RSI, ATR, trend, makro rejim, giriş veya piyasa nedeni buradan çıkarılmaz. Kayıpların gerçek nedeni için donmuş karar verisi, kaynak fiyat bazı, giriş/çıkış sırası ve maliyet belgesi gerekir. Sonraki eğitim veya eşik değişikliği bu denetimin otomatik sonucu değildir; önce bağımsız kaynak doğrulaması ve zaman dışı değerlendirme gerekir.
