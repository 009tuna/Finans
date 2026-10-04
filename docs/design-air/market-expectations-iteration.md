# Piyasa ayrımı ve model veri beklentileri

3 Ekim 2026 · yerel uygulama ve mevcut Codex otomasyonu

## Uygulama

- ABD, BIST ve Kripto adayları global ilk sekiz kesilmeden önce bağımsız seçilir. Piyasa başına ilk üç satır, tam statü sayımları ve ayrı boş durum vardır. Eski helper çıktısı korunur.
- Ana ekran göstergeleri de ABD, BIST ve Kripto için ayrı hesaplanır: ortalama teknik puan, yükselen varlık sayısı ve AL etiketli varlık sayısı kendi paydalarıyla gösterilir. Kaynak hataları, puanlanmamış varlıklar ve eksik günlük değişim görünür; eksik değerler sıfıra çevrilmez. Bunlar takip listesinin göstergeleridir, bütün piyasanın temsili veya yatırım başarısı değildir.
- Geniş ana sütunda üç ayrı piyasa yan yana, dar sütunda alt alta okunur. Satırda sembol, teknik puan, yapılacak iş ve eksik kanıt görünür. Puan eşikleri ve finans hesapları değiştirilmedi.
- Ana ekranın geniş boş portföy alanı küçüldü. Tekrarlanan otomasyon durum metni birleştirildi. Jargon ve 'en iyi fırsat' gibi teknik puanı tavsiyeyle karıştıran başlıklar sadeleşti.
- Ana ekrandaki kısa model beklenti kartı 'Açıklama beklentileri' sekmesinin başındadır; 'Piyasa adayları' sekmesinin ilk ekranını aşağı itmez. 'Raporu oku' düğmesi tam rapora gider. Model değeri, konsensüs ve fark ayrı; CPI farkları yüzde puan, istihdam bin kişidir. Konsensüs eksikse karşılaştırma sayısı üretilmez. Ayrıntılı grafikler ve makro değerlendirmeler sekmede altta, tam gerekçeler ve kaynaklar raporda korunur.
- Son raporda yeni forecast yoksa rapor kesitinden önce kaydedilmiş ilk görüş veya sonraki model görüşü kendi tarihiyle okunur. Ham yeni sayısal tahmin için `generatedAt < scheduledAt` zorunludur. Rapor açıklama sonrasında tamamlanmış olsa da açıklamadan önce oluşturulmuş, kaydedilmiş ve kaynakları kendi `knowledgeCutoff` zamanında bilinen eski görüş tarihsel etiketiyle gösterilebilir. İlk tahmin ve sonraki görüş ayrıdır; yeniden göstermek yeni forecast veya başarı örneği oluşturmaz.
- Kayıtlı model sayısının kaynakları tarihli ve kendi bilgi kesitinden önce olmalıdır. Tarihsiz resmî BLS takvimi yalnız açıklama saatini destekleyebilir; yanında tarihli sayısal kanıt gerekir. Konsensüsün ayrı kaynağı da aynı bilgi kesitine göre denetlenir. Kaynak eksikse, tarihi belirsizse veya kesitten sonraysa model sayısı korunur; konsensüs ve fark boş gösterilir. Sistem yöntemleri model yerine kullanılmaz; sonraki kanıt eski kayda taşınmaz.
- Günün yeniden değerlendirme gerekçesi ve kaynakları piyasa, ölçüm, birim, dönem ve açıklama anıyla aynı hedefe bağlanır. Bunlar eski ilk tahminin kanıtı yerine kullanılmaz. Bağımsız takvim okunamaması kayıtlı model görüşünü silmez; ayrı kapsam notunda gösterilir.
- Aynı araştırmadan türetilen haber başlıkları ikinci kez yazılmaz. Farklı eski haberler korunur. Teknik listeler, haftalık geriye bakış ve öğrenme notları açılır ayrıntıya alındı.

## Sabah otomasyonu

Mevcut 'Finans GPT-6.1 Sol günlük araştırma' heartbeat otomasyonu ACTIVE olarak güncellendi. Günlük 09:30 Europe/Istanbul saati ve mevcut hedef sohbet korundu. Beklenti agenda, kaçınma ve zorunlu yeniden değerlendirme sözleşmesi prompta bağlandı; ikinci bir otomasyon oluşturulmadı. Bu son denetimde otomasyon yeniden değiştirilmedi.

Backend ilk 14 gün içindeki bilinen NFP ve dört CPI hedefini araştırma gündemine alır. İlk kilitli tahmini bulunmayan hedef yeni kaynaklı `forecasts` veya gerekçeli `forecastAbstentions` ile karşılanır. İlk tahmini bulunan hedef için eski sayıyı taşımak yeterli değildir: bugünkü araştırma mutlaka sayısal olmayan `expectationReassessments` kaydı üretir. `unchanged` kaynaklı korunma gerekçesi; `updated` yeni kaynaklı forecast; `abstained` eksik kanıtı açıklayan kaçınma kaydı gerektirir. Aynı sayıyı her gün tekrar ledger'a yazmak zorunlu değildir. İlk tahmin değişmez; yeniden değerlendirme ve kaçınma tahmin/başarı örneklemini artırmaz.

Yeni üretim şeması `forecastAbstentions` ve `expectationReassessments` alanlarını zorunlu tutar; araştırma promptu `sol-research-v7`'dir. Eski raporlar bu alanlar olmadan okunmaya devam eder. Konsensüs yokluğu tek başına modelin kaynaklı sayı vermesine engel değildir. Araştırma açıklama sırasında tamamlanırsa açıklama öncesi `analysisAsOf` bağlamındaki kaçınma veya yeniden değerlendirme tarihsel olarak korunabilir; yeni sayısal tahminin açıklama öncesi sınırı gevşetilmez.

`expectationCoverage` modelin değerlendirme yaptığı iddiası değildir. NFP ve CPI için bağımsız kaynak akışının takvim kapsamını ayrı kaydeder: `available`, `unavailable`, `no_upcoming_release` veya `schedule_conflict`. Okunamayan takvim yaklaşan açıklama bulunmadığı anlamına gelmez; tarih/saat çelişkisi doğrulama tamamlanana kadar yeni sayı yerine kaçınma gerektirir.

3 Ekimdeki ilk revizyonda yeni canlı model üretimi veya Supabase yayını çalıştırılmadı. **4 Ekim güncellemesi:** v7 sözleşmesi gerçek `gpt-6.1-sol` çağrısıyla [manuel taslak kabul denemesinde](live-expectations-draft-review.md) doğrulandı. Taslak yayınlanmadı, ilk tahminlere veya başarı örneklemine eklenmedi; yalnız açıkça etiketli `?qa=live-draft` görünümünde incelenir. Sonraki zamanlanmış yayının başarısı henüz gözlenmedi. Tasarımın bulut dağıtımı yapılmadı.

## Doğrulama

Tam `npm test` zinciri geçti; log: `iteration-tests.txt`. Ayrıca son markup düzenlemesinden sonra UI davranışı, workspace kontrolü ve syntax kontrolleri geçti. Yeni testler piyasa kapsamının global sıralama altında kaybolmasını, sıfır/eksik konsensüsü, yüzde puan birimini, geçersiz açıklama zamanını, geç üretilmiş tahminleri, kaynak kaçışını ve eski görüşün yeni başarı örneği olmamasını kontrol eder.

Son sözleşme denetiminde `morning-expectations-ui.test.js` 23 testi, `research-expectations.test.js`, `research.test.js`, `overview-market-stats.test.js` ve `node --check public/research.js` geçti. Ek kontroller açıklama sonrası ilk/sonraki görüşün korunmasını, güncel yeniden değerlendirme hedefinin saat dilimleri arasında doğru eşleşmesini, eski kayıtların değişmemesini ve konsensüs kaynağının kendi bilgi kesitini aşmamasını kapsar. **4 Ekim son kabulünde** yeni kaynak, hesap ve UI düzeltmelerinden sonra tam test zinciri tekrar başarılı: [güncel tam çıktı](cleanup-final-tests.txt), [son tarayıcı ve kabul kapsamı](cleanup-verification.md).

Tarayıcıda ana ekran ve rapor 1440/1024/768/390 px genişliklerinde kontrol edildi; sayfa yatay taşması yok. Ana ekranda üç piyasa gerçek görünür konumlarıyla ölçüldü. BIST adayı ENERY detayına geçti; beklenti bağlantısı doğru sekmeyi açtı. Kayıtlı NFP eski görüş, CPI kilitli görüş ve bilinmeyen konsensüs etiketleri gözlendi. Ölçümler: `iteration-layouts.json`.

Kontrast kontrolü yeni ekranların görünür DOM metinlerini açık ve Karbon temalarında örnekler. 957 ölçülen metinde kontrast ihlali yok; 21 grup-opacity örneği ölçüm dışında. En düşük ölçülen oran 4.64:1. Kapalı ayrıntılar, canvas içeriği ve bütün durumlar kapsamda değildir; tam erişilebilirlik sertifikası sayılmaz. Sonuç: `iteration-contrast-results.json`.

## Kalan ürün meselesi

Adayların çoğunda aynı 'tez notu yok' gerekçesi bulunuyor. Bu tasarım kusurundan çok araştırma kapsamı meselesidir: şirket/protokol özelindeki tezin ve bozulma koşulunun kalitesi güçlendirilmelidir. Piyasa bazlı genişlik ve teknik göstergeler uygulanmıştır; bütün piyasayı temsil ettikleri veya ölçülmüş yatırım başarısı oldukları iddia edilmez. v7 beklenti sözleşmesinin ilk canlı manuel çıktısı doğrulandı; sonraki zamanlanmış araştırmanın yayını ayrıca gözlenmelidir.
