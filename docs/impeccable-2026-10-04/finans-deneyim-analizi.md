# Finans — Impeccable deneyim analizi

4 Ekim 2026 · Europe/Istanbul · Analiz ve öneri; uygulama koduna müdahale edilmedi.

## Ana değerlendirme

Finans'ın kullanılabilir bir görsel temeli var. Açık Air teması, petrol vurgu, Plus Jakarta Sans, piyasa ayrımı, gerçek grafikler ve daraltılabilir yardımcı paneller korunmalı. En büyük sorun, bilgi ile yapılacak iş arasındaki bağın zayıf olması. Kullanıcı çok sayıda doğru veriyi görüyor, fakat neyin önemli olduğunu, hangi bilginin neyi ölçtüğünü ve sıradaki işi çoğu zaman kendisi birleştiriyor.

Daha canlı ve keyifli deneyim için önerilen ürün sesi: **sakin, merak uyandıran, açıklayıcı ve ilerlemeyi görünür kılan**. Tasarımın canlılığı, güncel değişimi fark etmekten, bir kavramı anlamaktan ve gerçek bir inceleme işini tamamlamaktan gelmeli.

Bu değerlendirme mevcut PRODUCT.md ve DESIGN.md ile güncel kaynaklar, ayrı iki inceleme ve yerel QA tarayıcısı üzerinden yapıldı. Önceki proje notları yalnız başlangıç bağlamı olarak kullanıldı; eski koyu tema veya eski tahmin üretim sözleşmesi güncel kabul edilmedi.

## İnceleme kapsamı ve kanıt sınırı

- Kararlı ana hedef: `C:/Users/Monster/Downloads/Finans/public/index.html`; hedef kimliği `public-index-html`.
- Tasarım incelemesi: Genel Bakış, Açıklama beklentileri, Günlük Rapor, ABD listesi, MSFT detayı, Not ve takip, boş Portföy, Finansal Okuryazarlık. Kaynak üzerinden tarayıcı, strateji testi ve projeksiyon da incelendi; bu üç yüzeyin bütün çalışma akışları tarayıcıda denenmedi.
- Görsel kapsam: yaklaşık 1280 × 720 masaüstü, açık tema. Bu çalışmada mobil, bütün temalar, gerçek ekran okuyucu, gerçek %200 zoom, bütün hata durumları ve performans ölçümü yapılmadı.
- Assessment A tasarım incelemesi, Assessment B otomatik bulguları görülmeden tamamlandı. İçerik incelemesi de detector çıktısı görmedi.
- `http://127.0.0.1:5196/?qa=full` mevcut izole yerel QA sunucusu kullanıldı. Veriler QA anlık görüntüsüdür; canlı dağıtımın güncel veri veya erişilebilirlik kabulü değildir. Portföy, not, alarm veya finansal işlem kaydı yapılmadı.
- İnceleme sırasında dış kaynak değişiklikleri geçici birleştirme çatışmaları oluşturdu. Son yeniden yüklemede genel bakış yeniden doldu; dokuz aday düğmesi görünürdü, yeni uyarı/hata logları boştu. Son `node --check public/app.js` ve `node --check public/insights.js` kontrolleri geçti. Geçici çatışma bu raporda aktif P0 olarak taşınmadı. Son yeniden kontrol genel bakışa ve bu iki dosyaya aittir; diğer ekranlar ilk yüklenen sürüm üzerinden incelendi.
- Eşzamanlı değişiklik nedeniyle kaynakların fonksiyon/seçici adları esas alınmalı. Detector satırları tarama anına aittir; son dosyalar için değişmez satır referansları sayılmamalı.

Kanıtlar: [Assessment B](assessment-b.md), [ham detector çıktısı](detector.json), [son genel bakış görüntüsü](b-overview-final.jpg), [son DOM](b-final-dom.txt), [son konsol](b-final-console.json), [son kaynak özetleri](b-source-digests-final.json).

## Tasarım sağlığı: 25/40

Bu puan incelenen akışların uzman değerlendirmesidir; kullanıcı testi, erişilebilirlik sertifikası veya finansal model başarısı değildir.

| İlke | Puan / 4 | Mevcut durum |
|---|---:|---|
| Sistem durumunu görünür kılma | 3 | Fiyat, rapor ve araştırma zamanları görünür; farklı zamanların anlamını çözmek fazla okuma istiyor. |
| Kullanıcının diliyle konuşma | 2 | Aday ve kanıt dili iyi; katman, kesit, kontrol puanı ve model ölçümleri ek açıklama gerektiriyor. |
| Kullanıcı kontrolü | 3 | Listeye dönüş, sekmeler ve daraltma mevcut. Yazma/geri alma yolları bu çalışmada denenmedi. |
| Tutarlılık | 2 | Görsel kontroller tutarlı, fakat güçlü teknik sinyal ile eksik araştırma farklı ekranlarda aynı güven diliyle anlatılıyor. |
| Hata önleme | 3 | Eksik veri, örnek hesap, teknik puan ve örneklem sınırları ayrılıyor. Form doğrulaması kaynakta incelendi. |
| Hatırlama yerine tanıma | 2 | Kullanıcı eksik kanıtın ilgili not veya kaynak alanıyla bağlantısını kendisi kuruyor. |
| Verimlilik ve esneklik | 3 | Odaklan, daraltma, arama, sıralama ve varlık URL'si var. Eylem odaklı geçiş güçlendirilebilir. |
| Sadelik ve estetik | 2 | Sakin yüzeyler iyi; tekrar eden uyarılar, haberler ve boş tablo okuma ritmini zayıflatıyor. |
| Hata açıklama ve toparlanma | 3 | Son başarılı veriyi koruma ve tekrar deneme kaynakta mevcut; bütün hata akışları tetiklenmedi. |
| Yardım ve öğrenme | 2 | Rehber ve hesaplayıcı var; karar anındaki terime bağlı yardım zayıf. |
| **Toplam** | **25/40** | **Kabul edilebilir temel; belirgin deneyim iyileştirmesi gerekiyor.** |

## Otomatik denetim ne söylüyor?

15 dosyalık public taraması başarıyla çalıştı; çıkış kodu 2, bulgu bulunduğu anlamına geliyor. Toplam 13 uyarı: 5 `overused-font`, 6 `side-tab`, 2 `single-font`. Bunların 3'ü yardımcı `visual-proposal.html` yüzeyine ait; ana uygulama kaynaklarında 10 sinyal var. Bunlar 13 ayrı kullanıcı kusuru değildir.

Tek font, Impeccable'ın ürün arayüzü rehberinde açıkça uygun görülüyor. Plus Jakarta Sans'ın birkaç yerde tanımlanması, fontu değiştirmenin gerekli olduğunu göstermiyor. Altı kenar çizgisi uyarısının beşi nötr yapısal ayırıcı. Eski rapor şeridi adayının da son yüklenen workspace.css tarafından tam nötr kenarlığa çevrildiği görülüyor. Bu uyarılardan yeni bir font veya bütün ayırıcıların kaldırılması sonucu çıkarılmamalı.

Detector'ın parser bağımlılıkları bulunamadığından bu çalışma regex fallback ile yürüdü. Dolayısıyla sonuç gerçek DOM, CSS cascade, kontrast, klavye odağı veya responsive uygunluk denetimi değildir. Tarayıcı araçlarının evaluate yüzeyi salt okunur olduğundan script enjekte edilmedi; görünür detector overlay'i yoktur.

Tarayıcıda daha somut bir durum ölçüldü: `Teknik puan` etiketi 10 px, fiyat güncelliği ve puanın olasılık olmadığı açıklaması 10.5 px, aday gerekçesi 11 px. Bu ölçümler bir kontrast veya WCAG ihlali iddiası değildir; önemli bağlamın çok küçük metne verilmesinin ürün sorunu olduğuna kanıttır. Son genel bakışta sayfa düzeyinde yatay taşma gözlenmedi. Tek masaüstü ölçümü mobil kabul yerine geçmez.

## Korunacak güçlü yanlar

1. **ABD/BIST/Kripto ayrımı:** Bir piyasanın yüksek puanları diğerini görünmez kılmıyor; takip listesi kapsamı ve paydalar açık.
2. **Veri dürüstlüğü:** Teknik puanın başarı ihtimali olmadığı, konsensüs bulunmadığında farkın hesaplanamadığı, ilk kilitli tahminin korunduğu ve n=0 için başarı üretilmediği anlatılıyor.
3. **Göreve uygun yüzey:** Varlık detayı grafik, portföy tablo, rapor ve rehber okuma merkezli. Odaklan, kaynak defteri, sekmeler ve grafik değerlerini tablo olarak okuma zaten mevcut.

## Öncelikli beş problem

### 1. [P1] Teknik güç, kontrol kalitesi ve araştırma hazırlığı aynı güven diliyle anlatılıyor

Genel bakışta MSFT için “Kanıtı tamamla” ve “Fiyat verisi gecikmeli” görülüyor. Detayda “GUCLU AL”, “Karar kalitesi 90 · sağlam”, “Temiz · 90” ve “Belirgin risk yok” ifadeleri var. Aynı ekran 25,3 saatlik fiyat kaydını da belirtiyor.

Bu, doğrudan bir hesap hatası kanıtı değil. `src/decision.js` kontrol puanını fiyat yaşı, sinyal kararlılığı ve gösterge çelişkilerinden hesaplıyor; gecikme cezasına rağmen puan 90 kalabiliyor. `cockpitSourceGate()` araştırma adaylığı için daha sıkı bir kaynak koşulu uyguluyor. Ölçülen şeyler farklı; kullanıcıya kullanılan sözcükler aynı güven düzeyini çağrıştırıyor.

**Öneri:** Teknik sinyal, veri/sinyal kontrolü ve araştırma hazırlığını ayrı isimlerle göster. “Risk yok” yerine kontrolün kapsamını belirt. Sayısal model veya eşikler bu içerik değişikliğinin parçası olmamalı.

Kaynak: `public/insights.js` → kalite etiketleri; `public/app.js` → varlık özeti ve `consHtml`; `public/action-layer.js` → `cockpitSourceGate`; `src/decision.js` → `buildFreshness`, kontrol puanı. Komutlar: `clarify`, `harden`.

### 2. [P1] “Kanıtı tamamla” ilgili işi açmıyor

Ana ekranda dokuz görünür adayın çoğu aynı eylem dilini kullanıyor. Satır varlık detayına götürüyor; eksik kanıt türüne göre doğrudan alan veya sekme açıldığına dair bağ bu satırda yok. Kullanıcı grafik, araştırma ve not sekmelerini kendisi ilişkilendiriyor.

**Öneri:** Gerçek eksikten gerçek eylem üret: “Tez notunu yaz”, “Tezi geçersiz kılan koşulu ekle”, “Fiyat zamanını incele”. Geçiş ilgili varlığın ilgili alanına götürsün. Kaydedilen iş kaydedilmeden tamamlandı sayılmasın. Veri yenileme yeni fiyat garantisi gibi sunulmasın.

Kaynak: `renderCfoDecisionCockpit`, `.cfo-row`, `navigateToAsset`, `#asset-panel-notes`. Komutlar: `shape`, `clarify`, `delight`.

### 3. [P2] Rapor, günün anlamından önce fazla metaveri okutuyor

İlk ekranda eşleşme bandı, kapsam uyarısı, otomasyon, altı bölüm bağlantısı, model etiketi, üretim zamanı ve eski metin açıklaması üst üste geliyor. Asıl özet alt bölümde başlıyor. Genel bakışın günlük piyasa yorumu da yardımcı panelde bir ayrıntının içinde kalıyor.

Rapor içinde haber listesi, model gelişmeleri ve şirketlere bağlanan haberler ayrı akışlar oluşturuyor. Aynı sağlayıcı başlığının birkaç sembolle görünmesi okuma ritmini uzatıyor. Kaynak içeriğini doğrulamadan şirket etkisi türetmek de yanlış olur.

**Öneri:** İlk ekranda en fazla üç kısa içerik satırı olsun: “Bugün değişen”, “Sıradaki açıklama”, “Açık eksik”. Güncellik/eşleşme bilgisi sürekli görünür kısa bir bantta kalsın; tekrarlanan açıklama yerel ayrıntıda bir kez verilsin. Haberler tek kimlik/kaynakla gösterilsin; gerçek ilgili semboller yanında yer alsın.

Beklentiler de durumlarına göre ayrılmalı: yaklaşan, açıklama saati geçmiş, sonucu kaydedilmiş, sayı üretilememiş. Açıklama saatinin geçmesi tek başına sonucun elde edildiği anlamına gelmez.

Kaynak: `renderReport`, `.report-integrity`, `.model-context`, `#overviewBriefing`, `expectationsHtml`, `researchHtml`. Komutlar: `distill`, `layout`, `clarify`.

### 4. [P2] Önemli açıklamalar küçük; ilk kullanımda gerekli form dar

10–11 px bağlam metni, puan gibi daha güçlü görsel öğelerin yanında geri plana düşüyor. Boş portföyde hem geniş durum alanı hem 11 sütunlu boş tablo var; ilk kayıt formu 264 px yardımcı panelde iki sütuna sığıyor. Pazar ve sembol seçimleri görüntüde kırpılıyor.

**Öneri:** Veri tablosunu kompakt tut; rapor ve rehber metnini ayrı okuma ölçeğinde ele al. Deneme aralığı: uzun okuma metni 14–15 px, önemli yardımcı açıklama 12–13 px, mevcut başlık ve tablo ölçeği korunarak. Bu bir WCAG eşiği değildir; kullanıcı okuma testiyle seçilmelidir. Yeni büyük başlıklar eklemek gerekmiyor.

Boş portföyde ilk iş geniş bir başlangıç formu olsun; kayıttan sonra tablo düzenine geçilsin. Dar yan panelde Pazar/Sembol gibi alanlar tek sütuna düşsün. Renk kadar metin/durum etiketi de kullanılsın; gerçek klavye ve zoom kabulü ayrıca yapılsın.

Kaynak: `public/workspace.css`, `#portfolio-form`, `#portfolio-table-body`, `.portfolio-primary-grid`. Komutlar: `typeset`, `layout`, `onboard`, `adapt`.

### 5. [P2] Öğrenme içeriği kullanıcının o anki sorusuna yeterince bağlanmıyor

Rehberin altı gösterge açıklaması ve risk hesaplayıcısı iyi içerik. Raporun öğrenme notu/soru altyapısı da zaten mevcut. Ancak varlıkta görülen göstergeyle bunlar arasındaki geçiş kullanıcıya bırakılıyor; deneyim çoğunlukla metin okuma olarak kalıyor.

**Öneri:** RSI, konsensüs farkı veya kontrol puanı yanında kısa yerel yardım ve ilgili rehber bağlantısı ver. Her kavramı “Neyi ölçer / Neyi söylemez / Bir örnek üzerinde dene” düzeniyle anlat. Mevcut hesaplayıcıyı iki varsayımı karşılaştırma göreviyle bağla; öğretici örnek veriyi etiketle. Rapordaki mevcut soruyu görünür ama isteğe bağlı bir öğrenme girişine bağla. Yeni raporda soru yoksa günlük yeni soru varmış gibi davranma.

Tamamlanma geri bildirimi, öğrenilen kavram veya kaydedilen not gibi gerçek işlere bağlansın. Geri bildirim, yatırım getirisi veya işlem yapma sıklığıyla karıştırılmasın.

Kaynak: `#view-literacy`, `renderLiteracyView`, `updatePositionCalculator`, `renderReport` öğrenme notu ve quiz bölümü. Komutlar: `onboard`, `clarify`, `delight`.

## Kullanılacak içerik sözlüğü

| Mevcut ifade | Önerilen ifade | Amaç |
|---|---|---|
| Karar kalitesi 90 · sağlam | Veri ve sinyal kontrolü: 90/100; alt satırda mevcut uyarı | Kontrol puanını karar doğruluğundan ayırır. |
| Temiz | Gösterge çelişkisi saptanmadı | Ölçümün kapsamını söyler. |
| Belirgin risk yok | Bu teknik göstergelerde ek karşı sinyal saptanmadı | Yatırım riskinin yokluğunu iddia etmez. |
| GUCLU AL / Öneri | Teknik sinyal: güçlü / Teknik sinyal | Teknik sınıflamayı yapılacak işlemden ayırır; eşikler korunur. |
| Yatırım Puanları | Teknik puan karşılaştırması | Genel bakışla aynı sözlüğü kullanır. |
| Makro sinyal katmanı | Makro etkisi | İç sistem adı yerine kullanıcı anlamını öne alır. |
| Konsensüs yok | Bu dönem için konsensüs doğrulanamadı | Piyasada beklenti bulunmadığını iddia etmez. |
| Bozulma Notu | Tezi geçersiz kılan koşul | İlk kullanıcı için kavramı açıklar. |
| Dönüş yakın · Aşırı satım | Aşırı satım göstergeleri | Teknik eşiği gelecekteki yön iddiasından ayırır. |
| Veri: 3,8 saat önce | Veri kesiti: [tarih ve saat] | Toplama anının her fiyatın zamanı olmadığını belirtir. |
| Veri açıklanmadan önce | Açıklama öncesi kaydedilen görüşler | Tarihsel görüşleri yaklaşan açıklama gibi göstermez. |

Bu öneriler henüz uygulanmadı. Dinamik uyarılar yalnız gerçekten bulunan kontrol ve kayıtlarından üretilmeli.

## Daha anlaşılır içerik yapısı

Her önemli gelişme dört soruyla anlatılsın:

1. **Ne değişti?** Kaynaklı olay veya karşılaştırılabilir önceki kayda göre değişim; tarih yanında.
2. **Neden önemli?** Beklentiden fark, temel gerekçe ve karşı kanıt. Model yorumu ayrı etiketli.
3. **Neyle bağlantılı?** Portföy veya takip listesindeki gerçek eşleşme. Eşleşme yoksa genel piyasa bağlamı olarak okunur. Koşullu etki, gerçekleşmiş fiyat etkisi değildir.
4. **Sıradaki takip ne?** Bir açıklama, belge, kaynak kontrolü veya kayıtlı tez koşulu; tek açık eylem.

`researchHtml` zaten `whatChanged`, `expectationGap`, `counterEvidence` ve `condition/impact/invalidation` alanlarını kullanıyor. Yeni bir içerik motoru kurmadan sunum sırası iyileştirilebilir. Portföyle nedensel etki bağlantısı yalnız sembol benzerliğinden otomatik çıkarılmamalı.

Önerilen genel bakış düzeni:

```text
Bugünün çalışma özeti
  Önceki kayda göre değişenler · Yaklaşan açıklama · Açık kontrol

Piyasa adayları | Veri beklentileri | Sinyal değişimleri
  Sembol + teknik görünüm + eksik iş + ilgili alana geçiş

Sağ yardımcı panel: Piyasalar | Haberler | Takvim
  Kullanıcı daraltabilir; ana iş akışını kesmez.

Açılır: Sonuçlar, yöntem ve ek analizler
```

Özet yeni bir uzun blok olmamalı. En fazla üç kısa satır mevcut tekrarlardan kazanılan yerde durmalı. Karşılaştırılabilir geçmiş veri yoksa “değişim ölçülemedi” denmeli; uydurma günlük gelişme üretilmemeli.

Beklenti yaşam döngüsü de olay kimliği içinde okunmalı:

```text
Ölçüm + dönem + açıklama zamanı + gerçek durum
İlk kilitli tahmin → sonraki açıklama öncesi görüş → ilk açıklanan sonuç
```

Aynı dönem, ölçüm, birim ve olay eşleşmesi şarttır. Önceki ayın değeri bu zincire sonuç diye konmamalı. İlk tahmin geçmiş kanıtıyla korunmalı; sonraki görüş performansın referansını değiştirmemeli. Sonuç erişilemiyorsa saat geçti diye “Sonuçlandı” yazılmamalı.

## Canlılık ve keyif için uygun geliştirmeler

| Geliştirme | Kullanıcının kazanımı | Veri/uygulama koşulu | Göreli maliyet |
|---|---|---|---|
| Önceki kayda göre değişen kısa özet | Her gelişinde yeni olanı hızlı fark eder | Mevcut `buildDailyChangeDigest`; karşılaştırma kapsamı ve zamanının görünmesi | Orta |
| Eksik işten ilgili alana geçiş | “Tamamla” gerçek bir işe dönüşür | Varlık ve alan eşleşmesi; klavye odağı ve geri dönüş bağlamı | Düşük–orta |
| Teknik değişimin küçük görsel izi | Sabit bir puan yerine gelişimi okur | Gerçek tarihsel seri; yoksa görsel üretilmez | Orta |
| İlk tahmin/güncel görüş/sonuç karşılaştırması | Modelin neyi ne zaman söylediğini anlar | Donmuş ilk kayıt, aynı olay ve sonuç kanıtı | Orta |
| Terime bağlı mini açıklama | Başka sayfaya geçmeden anlam kazanır | Rehberdeki mevcut içeriğe bağ | Düşük–orta |
| Hesaplayıcıyla iki varsayımı deneme | Okuduğu kavramın sonucunu görür | Açık örnek veriler, para birimi ve mevcut hesap sınırları | Orta |
| Gerçek kayıt sonrası kısa geri bildirim | Tamamlanan işi ve nereye kaydedildiğini bilir | Başarılı kayıt yanıtı; hata veya yeni taslak ayrıca korunur | Düşük |
| İsteğe bağlı okuma/inceleme devamı | Kaldığı yerden devam eder | Gerçek yerel tercih veya okuma kaydı; yeni takibe yeni veri gerekir | Orta |

Renk sözlüğü az sayıda ve görevli kalmalı: petrol seçim/eylem; kırmızı olumsuz durum; amber bekleyen kontrol; yeşil yalnız anlamı açık olumlu durum. Bir rengin teknik güç, veri tazeliği ve araştırma tamamlığını aynı anda anlatması engellenmeli. Hareket mevcut 120–220 ms ölçeğinde durum geçişi ve geri bildirim için kullanılabilir; reduced-motion alternatifi korunmalı. Her satırın sürekli hareket etmesi veya skorun saydırılması anlam üretmiyor.

## Bilişsel yük ve duygu akışı

Gruplama ve yerel ayrıntı güçlü. Sorunlu alanlar: ilk görev odağı, önem hiyerarşisi, tekrar, ekranlar arasında hatırlama ve ilgili işe geçiş. On menü hedefi dört anlamlı grupta; menüyü sırf sayı fazla diye budamak gerekmez. Altı rapor/rehber bağlantısı da tek başına hata değildir. Asıl ölçü, kullanıcıya sorulan sorunun cevabını bulurken kaç ekran ve ayrıntı dolaştığıdır.

Girişte sakin ve ciddi bir güven duygusu var. Ardından “portföy boş”, “kanıt eksik”, “veri gecikmeli”, “rapor eşleşmiyor”, “tahmin üretilemedi” birikiyor. Bunların önemli kısmı doğru bilgi; gizlenmemeli. Her birine anlaşılır kapsam ve yapılabilir sonraki iş eklenmeli. Potansiyel iyi an, bir değişimi anlamak, karşı kanıtı görmek, notunu kaydetmek ve ilk tahminle sonucu karşılaştırmak. Bugünkü bitişte ise okunan bilgiyle tamamlanan iş arasındaki bağ zayıf.

## Persona kontrolü

- **İleri analitik kullanıcı:** Aynı tarih ve kaynak açıklamalarını yeniden okuyor; iki ayrı puanı çözmesi ve kanıt alanına manuel geçmesi gerekiyor. Odaklan ve liste dönüşü korunmalı; gerçek değişim ile kısa yoldan ilgili alana geçiş öne alınmalı.
- **İlk kullanıcı:** “Kanıtı tamamla” işin ne olduğunu söylemiyor; güçlü alım etiketi araştırma bitti sanılabilir. Terim yardımı ve ilk tamamlanabilir iş yanında olmalı.
- **Ekran okuyucu/düşük görme ihtiyacı:** Native düğmeler ve etiketler iyi. Adayların erişilebilir açıklamaları çok uzun ve tekrarlı; önemli 10–11 px metinler ayrıca kontrol edilmeli. Bunlar tam ekran okuyucu veya kontrast testi yapılmış kusur iddiası değildir.

## Küçük gözlemler ve açık sorular

- Piyasa ekranındaki seans/fiyat zamanı bilgisi başlık ve marketStatus içinde tekrar ediyor; tek bilgi bandı yeterli olabilir.
- Normal haftalık seansın kapalı olması, kaynak gecikmesi ve fiyat yaşının artması ayrı durumlar. Pazar günü eski fiyat tek başına kaynak hatası değildir. Tatil/özel kapanış doğrulaması olmadan resmî kapanış veya kesin seans bilgisi iddia edilmemeli.
- “Görüş”, “model yorumu”, “araştırma”, “yapay zeka” için tutarlı bir sözlük kurulmalı. Model adı ana okumadan çok yöntem ayrıntısında değer taşıyor; yorumun zamanı ana alanda kalmalı.
- Arşivde karakter kaybı etiketli eski notlar var. Bunlar okunabilir eğitim içeriğiyle aynı ağırlıkta gösterilmemeli; arşiv bütünlüğünü koruyan bir gruba alınabilir.
- Bir incelemede ekranlar arası kaydırma konumu beklentiden farklı göründü. Tekrarlanabilir davranış kanıtı olmadığı için aktif hata diye puanlanmadı; sonraki kabulde yeni ekrana giriş ile geri dönüş davranışı ayrı denenmeli.
- Ana ekranın birinci işi “bugün değişeni anlamak” mı, “araştırılacak adayı seçmek” mi? Önerim kısa değişim özetiyle açılıp aday seçimine devam etmek.
- Keyif hangi tamamlanan işten doğmalı? Önerim gerçek bir inceleme veya öğrenme adımından; ölçülmemiş başarı veya işlem sıklığından değil.

## Önerilen uygulama sırası ve kabul ölçütleri

Kullanıcının açık hedefi daha canlı, keyifli ve anlaşılır içerik olduğu için öncelik bu yönde verildi. Bu bölüm bir plan önerisidir; geliştirme başlatılmadı.

1. **Dil ve güven:** `clarify` ile teknik puan/kontrol/araştırma hazırlığı sözlüğü; zaman ve eksik veri dilini `harden` ile kontrol et.
2. **İlk ekran ve rapor:** `distill` + `layout`; tekrardan kazanılan yere kısa günlük özet, gerçek eksik işe geçiş ve beklenti durum ayrımı.
3. **Öğrenme ve ilk kullanım:** `onboard` + `delight`; mevcut rehber, hesaplayıcı ve rapor sorusunu bağlama bağla; boş portföyün ilk işini kolaylaştır.
4. **Okunabilirlik ve cihaz kabulü:** `typeset` + `adapt`; okuma/tabloları ayrı ele al, hedefli kontrast/klavye/zoom/viewport kontrolü yap.
5. **Son kalite turu:** `polish`; ardından aynı kararlı hedef için critique ve uygun teknik audit.

Önerilen kabul görevleri:

- Kullanıcı 30 saniyede önceki kayda göre önemli değişimi ve ilgili sonraki işi bulabiliyor mu? Bu süre bir hedef; mevcut ölçülmüş performans değil.
- Aynı varlıktaki teknik puan, kontrol puanı ve araştırma hazırlığını doğru ayırabiliyor mu?
- Eksik tez eylemi ilgili not alanını açıyor; kayıttan sonra odak ve başarı/hata bilgisi korunuyor mu?
- Aynı olayın ilk tahmini, sonraki görüşü ve sonucu doğru zamanla okunuyor mu; farklı dönem yanlış eşleşmiyor mu?
- Boş portföy ilk kayıt görevini okunur alanlarla gösteriyor mu?
- 390/768/1280/1440 px, klavye, gerçek %200 zoom ve hareket azaltma tercihi üzerinde ana akışlar tamamlanabiliyor mu?
- İlk tahminler, n=0 davranışı, eksik fiyat/konsensüs, para birimi ve kaynak zamanı kontrolleri korunuyor mu?

Bu çalışmanın sonucu bir analizdir. Önerilerin faydası uygulama sonrası görev bazlı karşılaştırmayla doğrulanmalıdır; otomatik tarayıcının temiz çıktısı tek başına tasarım kabulü değildir.
