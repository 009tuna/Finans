# Finans — Karar Masası

6 Ekim 2026: varsayılan arayüz otomatik gözlem akışıdır. Manuel not/portföy/test/projeksiyon ekranları ana menüden çıktı; verileri korunur. Sinyaller ana menüde ayrı görünür; aktif, geçmiş, başarı ve eski arşiv ayrıdır. Makro ana görünüm dört karşılaştırmalı koşulu gösterir; tekrar eden ölçümler ve yöntem/kanıt geçmişi açılır ayrıntıya taşındı. Piyasa adayları kullanıcı görevi yerine sistemin gerçek yapısal izleme nedenini açar. [Kabul ve sınırlar](docs/design-air/observer-acceptance/README.md).
2 Ekim 2026 · güncel tasarım: Air

## Güncel görsel sistem

Gündüz bilgisayar başında rapor, piyasa ve portföy arasında geçiş yapan kullanıcı için açık, sakin bir çalışma alanı. Açık gri zemin, beyaz yüzeyler ve petrol vurgusu varsayılandır. Renk sadece seçim, eylem ve veri durumlarını taşır. Önceki dört koyu tema Görünüm menüsünde kullanılabilir; grafikleri aynı tema tokenları yönetir. Yeni tasarıma ilk geçiş açık temayı seçer, sonraki kullanıcı seçimleri korunur.

Arayüz gövdesi 13 px, tablo 12 px, rapor ve rehber 13 px / 1.75–1.8, ana başlık masaüstünde 18 px ve mobilde 16 px. Yardımcı metinler 10.5–11.5 px; sayısal özetler 18–21 px, değerleme sonucu en fazla 24 px. Masaüstü içerik kenarı 30 px, yüzey içi 20 px, ana sütun arası 24 px. Boşluk içeriği ayırır; iç içe kartlar raporda düz okuma akışına, karar listesinde ayırıcılı satırlara dönüşür.

Sol menü 204 px genişliğinden 64 px simge şeridine daralır. Genel bakış bağlamı, rapor kaynakları ve portföy düzenleyicisi bağımsız olarak 264 px'ten 44 px şeride daralır. Düğmeler erişilebilir ad, `aria-expanded` ve klavye odağını korur. Tercihler yerel depolamada tutulur; kaynak/sekme/form düğümleri kaldırılmaz. Odaklan iki yanı birlikte daraltır; çıkış önceki tercihleri geri getirir. Mobilde yardımcı paneller içerik altında açılabilir bölüme dönüşür, ana menü mevcut odak tuzaklı çekmeceyi kullanır.

Güncel kurallar `public/workspace.css`, panel davranışı `public/workspace.js` içindedir. Eski yerleşim notları aşağıda tarihçe olarak korunmuştur. [Uygulama ve yerel doğrulama](docs/design-air/verification.md).

### 3 Ekim · piyasa defteri ve sabah beklentileri

Karakter; süs, yeni font veya büyüyen başlıklardan değil, piyasa ayrımı ve açık karar dilinden gelir. ABD, BIST ve Kripto adayları ayrı seçilir; bir piyasanın güçlü puanları diğerini listeden düşürmez. Geniş ana sütunda üç piyasa aynı yüzeyde yan yana; 760 px altındaki sütunda ayrı başlıklarla alt alta okunur. Her piyasada ilk üç aday ve tam aday sayısı vardır. Teknik puanın yanında yapılacak iş ve bağlayıcı eksik görünür. Makro etkisi puanı değiştirmiyorsa ikinci bir aynı puan gösterilmez. Boş portföy ince bir durum satırına iner.

Ana ekran ve raporun özetinden hemen sonra açıklama öncesi model beklentileri okunur: dönem, açıklama saati, model değeri, konsensüs, fark, gerekçe ve kaynak. Değişmeyen ilk kilitli görüş eski kayıt tarihiyle korunur; daha sonraki görüş, rapor kesitinden sonrasına aitse geriye taşınmaz. Açıklama saati geçen kayıt eski görüş olarak etiketlenir. Kaynak yokluğu sayı veya sıfır konsensüs üretmez. Yeni araştırmada gelecekteki bilinen NFP ve dört CPI hedefi sayısal görüş, korunmuş ilk görüş veya açık eksik kanıt kaydıyla karşılanır.

Tekrarlanan haber başlıkları bir kez gösterilir; farklı eski haberler korunur. Teknik tarama, geriye bakış ve öğrenme sorusu açılır ayrıntılardadır. [Bu revizyonun kapsamı ve doğrulaması](docs/design-air/market-expectations-iteration.md).

---

30 Eylül 2026 · uygulanan görsel sistem

## Ürün yönü
Portföy ve kararlar ilk sıradadır. Portföy tablo merkezli, varlık incelemesi grafik merkezli, rapor ve rehber okuma merkezli çalışır. Veri, model yorumu ve ölçülmüş sonuç ayrıdır. Logo, Plus Jakarta Sans, vanilla JavaScript ve dört tema korunur.

## Karbon tokenları
| Rol | Token |
|---|---|
| Zemin | `oklch(18% .006 250)` |
| Navigasyon | `oklch(16% .006 250)` |
| İçerik | `oklch(23% .008 250)` |
| Form/açılır kontrol | `oklch(28% .010 250)` |
| Ayırıcı | `oklch(34% .010 250)` |
| Metin | `oklch(96% .004 250)` |
| İkincil | `oklch(80% .006 250)` |
| Yardımcı | `oklch(72% .006 250)` |
| Mavi | `oklch(68% .160 255)` |
| Kırmızı | `oklch(68% .18 25)` |

Kırmızının başlangıçtaki %64 açıklığı, yükseltilmiş yüzeyde normal metin kontrastını karşılamadığı için %68'e yükseltildi. Gümüş nötr koyu; Kehribar ve Yeşil kendi vurgu tonlarını kullanır. Tema değişimi mevcut grafik renklerini günceller.

## Yazı ve yerleşim
Masaüstü arayüz gövdesi 13 px, tablo 12.5 px, menü 12 px, rapor metni 13.5 px / 1.55 satır aralığıdır. Sayfa başlıkları 20 px, bölüm başlıkları 15–16 px; mobil giriş alanları tarayıcı yakınlaştırmasını tetiklememek için 16 px kalır. Rakamlar tabular-nums kullanır. Rapor kalan çalışma alanını kullanır; eğitim metinlerinin 72ch okuma sınırı korunur. Büyük ve seyrek düzen ile yalnız küçültmeye dayanan ilk revizyon kullanıcı tarafından reddedildi; yeni düzenin görsel kabulü açıktır.

Sol menü 176 px; üst çubuk 52 px başlangıç yüksekliğindedir. Genel Bakış portföy özetini tam genişlikte, karar tablosunu esnek ana sütunda, makro ve piyasa bağlamını 240–260 px yan sütunda gösterir. Raporun kaynak defteri sağ içerik kenarında 192 px; orta sütun kalan genişliği kullanır. Rapor kesiti, kısa veri durumu ve bölüm bağlantıları büyük iç içe kartlar yerine düz bir başlık akışı kurar. Kaynak defteri bütün kayıtları koruyan açılabilir alandır. Dar kullanılabilir genişlikte sütunlar alt alta gelir. İkincil performans, öğrenim, model portföyü, rejim, fırsat ve döviz görünümleri yerel açılır bölümde kalır. Masaüstü kenarlar 20 px; paneller 16 px iç boşluk ve 8/12/16/24 px tutarlı aralıklar kullanır. Kontrol köşesi 6 px, bağımsız panel 8 px. Dekoratif parlamalar kaldırıldı; bölüm hiyerarşisi yüzey ve başlık farkıyla kurulur.

980 px altında çekmece menü. Piyasa liste/detay ayrımı kullanılabilir içerik genişliğinde 1040 px, değerleme ve portföy yan paneli 1080 px eşiğini kullanır. Tablo ve matris gerektiğinde kendi alanında kayar.

## Ekran düzenleri
- Genel Bakış: portföy özeti → karar değişiklikleri ve karar listesi, yanında piyasa durumu, makro/portföy etkisi, kaynaklı araştırma ve katalizörler. Performans, öğrenim ve ek piyasa görünümleri kullanıcının açabildiği ikincil bölümdedir. Model portföyü ayrı adlandırılır.
- Portföy: kompakt özet → geniş tablo/düzenleme → dağılım/aksiyon/risk. Aynı sembol kaydı toplam miktar ve ortalama maliyeti değiştirir.
- Piyasalar: arama/sıralama → liste/grafik → Özet/Teknik/Araştırma/Not ve takip. Grafik odağı mevcut grafiği büyütür.
- Tarayıcı: ortak sonuç tablosu, tüm sinyaller, filtre, sayfalama ve teste aktarım.
- Projeksiyon: Portföy senaryosu ve Şirket değerlemesi. Slider ve sayı girişleri eşlenir. Hesap açık eylemle başlar.
- Rapor: özet/gelişmeler/etkiler/takvim/tahmin sonuçları, kaynak defteri ve açılır kaynaklar.
- Okuryazarlık: konu defteri, okuma alanı, hesaplayıcı ve arşiv. Quiz mevcut rapor içeriğine bağlı kalır.

## Davranış
URL görünümü, piyasayı ve sembolü taşır. Arama tarayıcı geçmişine yeni kayıt eklemeden mevcut kaydın durumunu günceller. Tarihçe kaydı filtrelerini ve liste konumunu saklar. Not taslakları varlık anahtarıyla oturum belleğinde kalır; URL/varsayılan kalıcı depolamaya yazılmaz.

Kayıt hatasında son başarılı veri ve girdiler korunur. Eksik fiyatlı pozisyon silinmez. Boş portföy ile erişim hatası ayrıdır. Eski hesap yeni parametrelerin sonucu gibi gösterilmez. Teknik skor başarı olasılığı değildir; araştırma örneklemi yoksa isabet üretilmez.

Journal yazmaları ortak kilitle seri yürür; alarm/not çift basma ek POST üretmez. Kayıt sürerken değişen not ve pozisyon girdileri yeni taslak olarak korunur. Strateji testinde kapanan işlem yoksa yüzde isabet gösterilmez. Projeksiyon sekmesi hesaplanmamış sıfır sonuçları açmaz. Grafiklerin değer tabloları klavyeyle erişilir; OKLCH tokenları grafik kütüphanesine sRGB olarak aktarılır.

## Araştırma zamanı ve günlük otomasyon
Fiyat verisi, analiz kesiti ve araştırma zamanı ayrı, açık saat dilimiyle gösterilir. Önceki kesite ait doğrulanmış model araştırması okunabilir; güncel fiyatlara uygulanabilir makro sinyal ayrı bütünlük koşullarına bağlıdır. Günlük otomasyon ayrıntısı kapalıyken de durumunu gösterir. Açıldığında gerçek aşamalar, bilinen süreler ve son başarılı yayın ayrı okunur. Kayıt yokluğu, erişim hatası ve kesilmiş çalışma aynı durum değildir. Yayın sonrası yerel dosya hatası tamamlanmış veritabanı yayınını başarısız göstermez.

[Yayın ve kabul kaydı](docs/research-audit/2026-09-30-report-publication-package.md).

## Hareket
Kontrol basılma 120 ms, seçim/tema 180 ms, detay 220 ms. Uzun sekme çıkışı, tüm kartlara aynı giriş ve rakam saydırma kaldırıldı. İçerik animasyon olmadan görünürdür. Sistem hareket azaltma tercihi CSS ve JS ile uygulanır.

## Kabul kaydı
[Uygulama ve doğrulama kanıtı](docs/karar-masasi-qa/verification.md), [v3 şartnamesi](docs/2026-09-29-kurumsal-ux-yol-haritasi.md).

Impeccable ana rehberdir. Taste marka/şablon değerlendirmesinde, UI UX Pro Max kontrol ve erişilebilirlik denetiminde kullanıldı. Görsel referanslardan yüzey hiyerarşisi ve veri alanı ilkeleri alındı; ekranlar kopyalanmadı. Yerel kontroller tam erişilebilirlik sertifikasyonu veya saha performans sonucu olarak sunulmaz.

### 2 Ekim · raporun ilk ekranı ve doğrulama dili

Raporun eşleşme, eksik kapsam ve yenileme durumları kısa bir bantta daima görünürdür. Üç veri zamanı ve eşleşme açıklamaları yerel ayrıntıda açılır. Kaynakta eksik yayın zamanı, doğrulanmamış içerik iddiasından ayrılır. İnsan kontrolü yalnız açık insan incelemesi kaydında yazılır; otomatik BLS ilk açıklaması ve sağlayıcı ilk gözlemi kendi etiketlerini taşır. [Kaynak ve sunum denetimi](docs/research-audit/2026-10-02-source-claim-review.md) önceki görünümün geri çekilen kabulünü kaydeder. [Çalışma alanını yeniden kuran paket](docs/research-audit/2026-10-02-workspace-rebuild.md) güncel yerleşim yönünü ve açık doğrulama koşullarını belirtir.

### 1 Ekim · çalışma alanı yoğunluğu ve responsive kabul

Değerleme üst kontrolleri kendi genişliğinde kırılır. DCF varsayım paneli kendi alanı 680 px'e ulaştığında iki sütun, dar yan panelde tek sütun kullanır; model geçişi bu düzeni ezmez. Sayısal alanlar eylem düğmesinin renk stilini devralmaz. Semboller kısaltılmadan okunur; okuryazarlık hesaplayıcısının alanları doğal biçimde kırılır. Mobil boş portföy eylemleri 44 px'tir.

Stres testi boş portföyü sıfır etki gibi göstermez. Kaynak hatasında önceki başarılı sonuç korunur; değişen portföye ait sonuç açıkça ayrılır. Tekrar deneme gerçek eylemdir. On ana ekran/yedi viewport ve üç değerleme modeli tarandı; kapsam ve gerçek zoom dahil açık kapılar [yerel kabul kaydında](docs/research-audit/2026-10-01-workspace-responsive-acceptance.md) bulunur. Bu kayıt canlı dağıtım veya bütün ürünün erişilebilirlik kabulü değildir.

### 2 Ekim · varlık bağlamı ve canlı kaynak kapsamı

`#view=market&market=bist&symbol=FROTO` varlık detayını açar; liste URL'sinde simge bulunmaz. Son seçim, arama, sıralama ve liste konumu oturum belleğinde tutulur. Listeye dönüş detay geçmişini korur; geri/ileri hem URL'yi hem görünür düzeni geri getirir. Karar izi ortak varlığa geçiş eylemini kullanır.

BIST'te Tümü/Düzenleyici/Şirketler filtreleri aynı kontrol sistemini kullanır. Şirket kaydı yayıncı tarihi ile gözlem zamanını ayırır; liste doğrulaması belge içeriği doğrulaması gibi sunulmaz. Çelişkili bağlantı açık ayrıntıya bağlanır. [Canlı yayın kabulü](docs/research-audit/2026-10-02-live-release-acceptance.md), bu paketi ve açık gerçek zoom/erişilebilirlik sınırlarını kaydeder.

### 2 Ekim · model yorumunun zamanı ve kanıta geçiş

Rapor özeti ve piyasa yorumunda oluşturulma zamanı görünürdür. Önceki model metni sonraki kaynak gelişmeleriyle sessizce yeniden yazılmaz; güncel beklentilere açık eylemle geçilir ve odak ilgili çalışma alanına taşınır. Açık HTTP/HTTPS kaynak bağlantıları tıklanabilir, ham HTML metin kalır. İlk yüklemede bağımsız okumalar birlikte başlar; rapor arızası son başarılı içeriği silmez. [Canlı paket kabulü](docs/research-audit/2026-10-02-reading-context-acceptance.md) yedi genişliği, dört temada yeni bileşen kontrastını ve kapsam sınırlarını içerir.

### 2 Ekim · teknik sonuçlar ve öğrenme kanıtı

Teknik sonuçlar kaynak/piyasa/strateji/çözümleyici gruplarında okunur; birleşik başarı yüzdesi yoktur. Sürümlü açık senaryo sonuç örneklemi değildir. Eski ham hesap açık arşiv etiketiyle erişilebilir kalır. Grup seçimi klavye odağını ve sayfa dönüşünde seçimi korur. Örüntü önerileri aktif kural veya kalibre edilmiş güven yüzdesi gibi sunulmaz. [Canlı kabul kaydı](docs/research-audit/2026-10-02-performance-evidence-acceptance.md) aynı veriyle karşılaştırmayı, yedi genişliği, 72 test dosyasını ve açık doğrulama kapılarını içerir.

### 4 Ekim · anlaşılır içerik ve tamamlanabilir işler

Yazı boyutları kullanıcının talebiyle korunur. Genel Bakış ve Rapor üç satırlık gerçek çalışma özetiyle açılır: önceki teknik kayda göre değişim, kayıtlı yaklaşan açıklama ve açık kontrol. Aday satırı varlığın ilgili alanını açar, klavye odağını taşır; adaylara dönüş bağlamı korur. Teknik sinyal, veri/sinyal kontrolü ve araştırma eksikleri ayrı adlandırılır. Gerçek tarihsel teknik kayıt varsa küçük iz gösterilir.

Boş portföyün tek kayıt formu ana alandadır; başarı sonrası yardımcı alana döner. Başarı sunucu onayına bağlıdır ve kaydı adlandırır; hata veya kayıt sırasında değişen taslak korunur. RSI/kontrol/konsensüs yardımı terimin yanındadır, rehberdeki ilgili başlığa bağlanır. Hesaplayıcının iki varsayım karşılaştırması mevcut hesap kısıtlarını kullanır; örnek veriler etiketlidir. Rapor devamı ve varlık incelemesi isteğe bağlı yerel tercihlerdir; araştırma veya finansal başarı kaydı sayılmaz.

Beklentiler olay kimliğinde ilk kilitli tahmin, son uygun açıklama öncesi görüş ve kaynaklı sonuç olarak okunur. Saat geçmesi sonucu doğrulamaz; dönem, ölçüm, birim ve açıklama eşleşmesi gerekir. Eksik konsensüs sıfır veya piyasada beklenti yokluğu olarak gösterilmez. [Yerel uygulama ve kabul](docs/impeccable-2026-10-04/uygulama-ve-kabul.md) kanıtları ve gerçek zoom/ekran okuyucu/kullanıcı testi sınırlarını kaydeder.

### 4 Ekim · aday kartları, logolar ve kısa hareket

Piyasa adayları üç piyasa grubunda ayrı yüzeyli, tek native düğme olan kartlarla gösterilir. Logo/sembol/ad ve teknik puan üstte; görev, gerekçe ve gerçek kayıt izi aşağıdadır. Kart ilgili varlık ve görev alanına odaklanır. Mevcut takip listesinin 133 logosu kaynak kimliği doğrulanarak yerel dosyalardan sunulur; bilinmeyen veya yüklenemeyen görsel sembol karşılığına döner.

Yazı boyutları korunur. Hover 180 ms, basma 120 ms; yalnız aday sekmesine manuel dönüşte toplam en fazla 220 ms kısa hareket vardır. İçerik daima görünür; ilk yükleme ve veri yenileme animasyon başlatmaz. Hareket azaltma ve sekme değişiminde iptal uygulanır. Dört genişlik, uzun ad, eksik kaynak, beş tema, görev odağı ve tam test kabulü [aday kartları kaydında](docs/impeccable-2026-10-04/aday-kartlari-kabul.md) bulunur.
