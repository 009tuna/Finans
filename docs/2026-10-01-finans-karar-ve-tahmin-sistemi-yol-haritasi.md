# Finans — ölçülebilir karar ve tahmin çalışma alanı

1 Ekim 2026 · Uygulama yol haritası · Durum: aktif, tamamlanmadı

## Hedef ve ürün kararı

Finans, haber gazetesi veya tek bir AI yanıt ekranı olmayacak. Portföy, piyasalar, açıklama öncesi beklentiler, araştırma ve sonuç ölçümü arasında bağlamını koruyan yoğun bir çalışma alanı olacak. Mevcut araçlar korunur; yeni görevler açık alanlara yerleştirilir. AI olmadan takvim, kaynak akışı, portföy, hesaplama, temel tahmin yöntemleri ve sonuç ölçümü çalışır. GPT-6.1 Sol kaynaklı muhakeme, sayısal beklenti ve koşullu senaryo katmanıdır.

Başarı, yeni kart veya tahmin sayısıyla ölçülmez. Kullanıcı bir açıklama için önceki değeri, kaynaklı konsensüsü, sistem ve model beklentisini, gerekçeyi, koşullu etkiyi ve sonradan ölçülen hatayı takip edebilmelidir. Girdi veya örneklem eksikse nedenini görmelidir. Tahmin hatasından öğrenme, sürümlü ve ileri dönem sınanan kalibrasyondur; modelin ağırlıklarının kendiliğinden eğitildiği iddia edilmez.

## Başlangıç kanıtı ve boşluklar

- 30 Eylül denetimi: araştırma günlüğünde beş çalışma, sıfır sayısal forecast ve sıfır ölçülmüş araştırma sonucu. Bu tarihsel kesit güncel başarı iddiası değildir.
- Mevcut ekonomik takvim Finnhub'a bağlı; tarih ve saat parçalanarak kaynak saat dilimi kayboluyor. Makro gerçekleşenler otomatik çözümlenmiyor. Bilanço çözümleyicisi ilk gözlenen sağlayıcı değerini alıyor; ilk resmî açıklamayı garanti etmiyor.
- Teknik fiyat senaryoları, makro olgu tahminlerinden ayrı bir veri ve ölçüm ailesi. Günlük OHLC'deki hedef/stop sırası, tamamlanmamış mum ve yöntem sürümü eksikleri ölçümü zayıflatıyor.
- Tarihsel altı ayın tamamı doğrulanmış değil. Eski veriden geriye dönük sahte açıklama öncesi tahmin oluşturulmayacak.
- Önceki UI şartnamesi 16 px gövde, 32 px başlık ve uzun bölüm akışı tarif ediyor. Kullanıcının yeni tercihi daha küçük başlıklar, fazla içerik, geniş merkez ve dar yardımcı alanlar. Yeni yoğunluk kararı bu değerleri değiştirir.

## Bütün ürün işlev haritası

| Alan | Korunan görevler | Yeni bağlantı ve kabul kanıtı |
|---|---|---|
| Genel Bakış | Portföy/risk, fikir hunisi, üç piyasa, makro, katalizör, hareketli varlık, döviz, model portföyü, karar öğrenimi | Aynı masaüstü görünümünde portföy, karar listesi ve bağlam; yardımcı içerik görev sekmeleriyle erişilir |
| Portföy | Ekle/düzenle/sil, maliyet, miktar, ağırlık, risk | Pozisyon → araştırma → senaryo bağlantısı; hata halinde taslak korunur; mevcut toplam pozisyon güncelleme anlamı açık |
| Piyasalar | ABD/BIST/kripto listeleri, arama/sıralama, grafik/göstergeler, şirket/benzerler/komite, not/izleme | Seçim/filtre/URL/geri dönüş korunur; ilgili takvim ve kaynakla bağlantı |
| Teknik Tarayıcı | Bütün sinyal kategorileri ve çoklu sinyal | Liste → varlık → test; teknik puan olasılık diye sunulmaz |
| Strateji Testi | Parametreler, kıyas, eğri, işlemler, risk | Önceki sonuç ile yeni parametre ayrılır; maliyet ve belirsiz mum ölçümü ayrı |
| Projeksiyon | Monte Carlo, tasarruf/stres/korelasyon; DCF/Graham/DDM/hassasiyet | Varsayım kaynağı/tarihi ve hesap sürümü; AI görüşü formül sonucu değildir |
| Rapor | Günlük/haftalık özet, kaynak, karşı kanıt, takvim, tahmin sonuçları | ABD/BIST/kripto ayrı akış; düzenleyici gelişmeler ayrı tür; olgu/yorum/senaryo ayrımı |
| Okuryazarlık | Rehber, hesaplayıcı, quiz, ipucu/arşiv | İlgili araç ve sonuç hata açıklamasından rehbere geçiş |
| Ortak kabuk | Dört tema, mobil menü, URL/geçmiş, klavye, durum/hata, hareket azaltma | Bütün sayfalarda yoğunluk ve taşma kontrolü; %80/%100/%125/%200 yakınlaştırma |

## Veri ve tahmin sözleşmesi

Her ekonomik olayın kimliği ülke/metric/dönem üzerinden sabittir. Takvim sürümü, gerçek saat dilimi, açıklama zamanı, kaynak URL'si ve gözlenme zamanı ayrı kaydedilir. İndirme saati açıklama saati yerine geçmez. Kaynak içeriğinin hash'i ve tarihli arşivi korunur; kaynak bulunamadığında geçmiş içerik silinmez.

Tahmin kaydı açıklamadan önce kilitlenir: eventId, yöntem/model sürümü, sayısal değer, birim, dönem, oluşturma zamanı, bilgi kesim zamanı, girdi gözlemleri, kaynaklar, gerekçe. Konsensüs bağımsız kaynak ve vintage ile gelir; bulunamıyorsa null kalır. Sistem beklentisi konsensüs etiketiyle sunulmaz. Model tahmini yöntemi değişmez sistem yönteminden ayrıdır.

Gerçekleşen kaydı ilk açıklama, ilk gözlenen ve revizyon türlerini ayırır. İlk açıklama hatası ancak tarihli resmî ilk açıklama kanıtıyla ölçülür. Revizyon eski sonucu değiştirmez; yeni observation olarak eklenir. Aynı event/yöntem için tahmin ikinci çalışmada yeniden yazılmaz. Geç kalan tahmin geçmişe kaydedilmez. Yeni takvim saati önceki tahminle çelişirse otomatik puanlama durdurulur ve denetim gerekir.

Tahmin kıyasları aynı olay, birim, dönem, bilgi kesimi ve vintage üzerinde yapılır. MAE, medyan mutlak hata ve yönlü sapma; mevcut olduğunda konsensüse ve basit yönteme karşı eşleşmiş fark gösterilir. Sayısal hatadan uydurma yüzde isabet üretilmez. Olasılıksal beklentide Brier ve kalibrasyon ayrı ölçülür; finansal fiyat tepkisi olgu doğruluğundan ayrıdır.

## Uygulama paketleri ve bağımlılıklar

### P1 — Kalıcı olay temeli ve ilk NFP örneği

Resmî BLS takvimi ve tarihli Employment Situation arşivleri. Saat dilimi/DST, dönem ve bin kişi birimi. AI gerektirmeyen son gözlem ve üç açıklama ortalaması. Açıklama öncesi immutable tahmin, açıklama sonrası resmî sonuç ve yöntem bazlı hata. Çakışmalı yazmayı önleyen mevcut api_cache CAS altyapısı; yeni DDL şart değil. Tarihsel arşivler eğitim girdisi olabilir; geçmişte yapılmış tahmin gibi sayılmaz.

Kabul: gelecek açıklama öncesi gerçek kaynaklı tahmin; geç tahmini reddetme; açıklama sonrası birimi/dönemi eşleşmiş sonuç; tekrarlı çalışmada aynı kayıt; kaynak hatasında mevcut kanıt korunur. Testler gerçek açıklamanın yerine geçmez.

### P2 — Yoğun çalışma alanı ve tüm ekranların yeniden hiyerarşisi

Masaüstü menü 192 px, merkez esnek, yardımcı alan yaklaşık 240–260 px. Kullanılabilir içerik genişliği yeterliyse yan yana, yetersizse tek akış. Desktop UI 14 px, metadata 12 px, sayfa başlığı 24 px, bölüm 18 px; uzun okuma metni 15–16 px ve 72ch. Mobil form alanı 16 px ve ana hedef 44 px. Başlık boyutu ekranı büyütmek için kullanılmaz.

Genel Bakış: kompakt portföy bandı → geniş karar tablosu; piyasa, kaynak/takvim ve öğrenim görevleri aynı çalışma düzeninde. Bütün eski içerik erişilir. Sadece tablo/matris kendi alanında yatay kayar. Günlük rapor ayrıntılı okuma için kalır; Genel Bakış raporun tekrarına dönüşmez. %80 zoom daha fazla kullanılabilir alan olduğunda grid büyür; %200 zoom okunur tek akışa döner. CSS transform veya tarayıcı zoom'u taklit eden ölçek yok.

Kabul: 320/390/630/820/1024/1280/1440 CSS px; dört tema; %80/%100/%125/%200 gerçek yakınlaştırma; uzun başlık/şirket adı; gövde ve kritik etikette taşma yok; klavye/menü/seçim/taslak/hızlı geçiş korunur. Görsel önce/sonra aynı veriyle.

### P3 — Piyasalara ayrılmış haber ve düzenleme akışı

ABD: resmî makro yayınlar, merkez bankası ve mevcut şirket haberleri. BIST: SPK bültenleri/duyurular ve KAP şirket açıklamaları. Kripto: proje/ağ resmî duyuruları ve düzenleyici gelişmeler. Önce kaynaklı toplama/dedup/tarih/kapsam, sonra AI açıklaması. SPK bülten bağlantısı tam mevzuat değişiklik özeti diye gösterilmez; yürürlük tarihi, metin değişikliği ve etkilenen görev ancak belgeyle doğrulanır. Bültenin listelenmesi ile PDF içeriğinin yorumlanması ayrı durumlar.

Her piyasa için son başarılı veri, hata, kısmi kapsam ve tekrar eden erişim boşluğu görünür. Kaynağın piyasa etiketi ile modelin aktarım yorumu ayrıdır. ABD olayının üç piyasaya aynı metinle çoğaltılması yasak. Raporun mevcut kaynak/karşı kanıt içeriği korunur.

Kabul: SPK resmî belge bağlantısına ulaşım; piyasa filtresi ve günlük rapor grupları; tekrar/future-date/URL doğrulaması; bir kaynak hata verirken diğerleri kullanılabilir. KAP/kripto erişimi yoksa boş akış başarı diye gösterilmez.

### P4 — GPT-6.1 Sol beklentisi ve koşullu açıklama

Model girdisine takvim, tarihli ilk açıklamalar, sistem yöntemleri, kaynaklı konsensüs, mevcut piyasa gelişmeleri ve geçmiş ölçüm verilir. NFP ilk örnek; CPI/PCE, faiz, büyüme, Türkiye enflasyonu ve şirket bilançoları kaynak ve birim sözleşmeleri hazır oldukça eklenir. Modelin sayı üretmeme nedeni görünür.

Üç koşul: kaynaklı beklentinin üstü / yakını / altı. Eşik ve referans açık. Faiz, dolar, hisse, altın ve kripto etkileri mekanizma, ufuk, karşı koşul ve geçersizlikle açıklanır. Tek değişken kesin fiyat yönü vaat etmez; ücret, işsizlik, revizyon ve rejim birlikte değerlendirilir. Konsensüs yoksa senaryo referansı model veya yöntem tahmini olarak açıkça adlandırılır.

Kabul: gerçek açıklama öncesinde kayıtlı bir model tahmini veya kaynaklı kaçınma; kaynağı ve yöntemi görünen gerekçe; açıklama sonrası otomatik uygun sonuç eşleştirme; AI erişilemediğinde deterministik sistem çalışır. Model başarısı teknik sonuçlarla karıştırılmaz.

### P5 — Hata analizi ve kontrollü kalibrasyon

Olay/yöntem/model sürümüne göre hata dağılımı, sapma, karşılaştırma ve örneklem. İlk öneri: geçmiş karşılaştırılabilir sonuçlardan sapma düzeltmesi; en az 12 sonuç ve kronolojik eğitim/holdout ayrımı. Bunlar başlangıç kapısıdır, başarı garantisi değildir. Girdilere erişim zamanı ve vintage geçerli değilse kayıt öğrenme dışında kalır. Az örneklemde düzeltme uygulanmaz.

Yeni yöntem sürümü yalnız ilerleyen açıklamalarda test edilir; ham tahmin ve düzeltilmiş tahmin ayrı tutulur. Otomatik üretim, elle incelenebilir açıklama ve sınırlı parametreler. Veri sızıntısı, sonuç seçimi ve sürekli en iyi eşiğe uyma engellenir. Canlı örneklem birikmeden “eğitildi/isabet yükseldi” denmez.

Kabul: sonuca bakmadan üretilmiş kıyas; holdout metrikleri; model ve basit yöntem eşleşmiş örneklem; yöntem değişiklik günlüğü; negatif sonuçlar dahil. Çevrimdışı gerçek arşiv testi ile canlı ileri dönem sonuç ayrı.

### P6 — Teknik ölçüm, portföy ve araç bağlamı

Teknik resolver: gerçek tespit zamanı, tamamlanmış mum, hedef/stop belirsizliği, strateji sürümü ve brüt/net kıyas. Eski kayıtlar sessizce yeniden yazılmaz. Portföy işlem defteri ayrı muhasebe geçişidir: alım/satım/komisyon/nakit/temettü ve eski toplam pozisyonla açık geçiş; hazır olmadan mevcut kayıt anlamı değiştirilmez. Araştırma → test → senaryo → not bağlamı korunur.

Kabul: belirsiz sonuç ayrı rapor; maliyet varsayımı açık; pozisyon muhasebesi ve form hatası/çift kayıt testi; risk/değerleme formülleri değişirse sürüm ve bağımsız doğrulama.

### P7 — Operasyon ve son kabul

AI işinden bağımsız kaynak/veri/sonuç görevleri. Günlük kaynak sağlığı, aşama ve son başarılı çalışma. Gerekirse açıklama saatine yakın ayrı görev; önce idempotans/erişim/maliyet/lock davranışı doğrulanır. Yerel bilgisayarın kapalı olması ile bulut işinin garantisi birbirine karıştırılmaz. Mevcut otomasyon kullanıcı tercihi korunarak gerçek gereksinime göre güncellenir.

Bütün işlev envanteri, erişilebilirlik, kontrast ≥4.5:1, hareket azaltma, %200 zoom, yavaş istek yarışı, kaynak/kayıt hatası, boş/kısmi/eski veri; npm test ve gerçek kullanım akışı. Yerel testler saha performans iddiası değildir. Canlı paket yayınlandığında API, kimlik ve kaynak sayıları geri okunur; ekran görüntüsü alınır.

## Yürütme ve ilerleme kaydı

Ana ajan mimariyi, kaynak sözleşmelerini, entegrasyonu ve kabulü yönetir. En fazla iki Luna uygulama ajanı; dosya sahipliği ayrılmış işler paralel. İlk dalga: P1 yeni domain modülleri/testler; P2 mevcut frontend kompozisyonu. Ana ajan API/kalıcı kayıt, piyasa kaynakları, rapor/AI bağlamı ve entegrasyonu yapar. Çalışma bir tur sonunda bitmezse bu dosyaya tamamlanan ve kalan kanıt yazılır; hedef küçük bir pakete indirgenmez.

| Gereksinim | Durum | Kanıt / sonraki kapı |
|---|---|---|
| Uçtan uca yol haritası | Hazır | Bu dosya; bütün kullanıcı hedefleri P1–P7 |
| Resmî makro olay temeli | Gerçek kaynak çalışıyor; geçmiş zaman kanıtı denetimi görünür | Native HTTPS ile 13 takvim olayı ve 4 tarihli ilk açıklama toplandı. Eylül için 3 dondurulmuş yöntem kaydı korunuyor. Eski iki v1 kaydı zaman kanıtı sorunu nedeniyle puanlamadan hariç; v2 girdilerine erişim sidecar'ı sonradan uydurulmadı. |
| Yoğun çalışma alanı | Yerel paket; kabul sürüyor | Merkez görev sekmeleri, dar bağlam paneli, kompakt satırlar ve metinler. Gerçek zoom ve bütün araçlarda son kabul henüz tamamlanmadı. |
| Piyasa bazlı SPK/haber | İlk kaynak katmanı çalışıyor | 30 resmî bülten bağlantısı; son 3 PDF'de başlık/kategori/sayfa/sembol çıkarımı. Ethereum ve Bitcoin Core resmî RSS arşivleri bağımsız toplanıyor; Solana zaman aşımı ve otomatik KAP bağlantısı açık. Hukuki etki çıkarımı tamamlanmadı. |
| Gerçek Sol tahmini/senaryosu | Önceden kaydedildi; günlük yeni yayın doğrulandı | İlk NFP tahmini aynı kayıtta korunuyor. 1 Ekim yayın kimliği 9d9514f3-b6cf-45f0-b73b-21ca650314a5; canlı report/research eşleşiyor. 10 kaynak, 4 gelişme; defter toplamı 7 çalışma / 1 tahmin / 0 sonuç. Bağımsız Reuters konsensüsü 90 bin kişi olarak alındı; ilk tahmine geriye eklenmedi. |
| Gerçek sonuç/hata ölçümü | Uygun açıklama bekleniyor | 1 gerçek tahmin, 0 sonuç. 2 Ekim ilk resmî açıklaması gerekli; BLS erişimi son gerçek çalışmada başarılı; sonradan revizyonlar önceki sonucu değiştirmez. |
| Ölçülmüş hatadan kalibrasyon | Geçerli kronolojik öneri kapısı kodda; gerçek örneklem yok | En az 12 eğitim + 3 ileri sınama; girdi erişim kanıtı ve sınama kesitinden önce bilinen sonuçlar zorunlu; otomatik etkinleştirme yok. |
| Bütün ekranlar/portföy/teknik güven | Açık | P2, P6 ve P7 tam kabul |

### 1 Ekim ilk paket kaydı

- `npm run intelligence` gerçek kaynakları model çağırmadan çalıştırdı; SPK listesi ve üç belge metni toplandı. BLS arızası eski veriyi silmiyor ve boşluğu sayıyla doldurmuyor.
- Sol taslağı ilk doğrulamada tarihsiz resmî takvim nedeniyle reddedildi. Yalnız tam BLS takvim adresine dar istisna getirildi; sayısal kaynak tarih şartı korundu. İçerik, tahmin ve üretim zamanı değiştirilmeden tekrar doğrulandı. İlk reddedilen taslakta saklanmayan kullanım, tam arama sayısı, prompt hash'i ve tam bağlam kesiti uydurulmadı; kurtarma provenance kaydı açıkça tutuldu.
- Yeni yayın Supabase'den ve canlı `/api/report`, `/api/research` uçlarından geri okundu: 6 çalışma, 1 tahmin, 0 sonuç. Bu veri yayınıdır; yeni frontend/API kaynak yönlendirmeleri henüz canlıya dağıtılmadı.
- Yeni teknik sonuçlarda gerçek çözümleme zamanı ve mum zamanı ayrıldı. Aynı günlük mumda hedef/stop sırası bilinmiyorsa ayrı belirsiz kayıt; başarı paydası ve öğrenme girdileri dışında. Eski kayıtlar yeniden yazılmadı. Kullanıcı/sistem tahmin sürümleri ayrı; brüt senaryo sonucu gerçek net işlem getirisi değildir.
- Yeni makro ve haber API'leri mevcut Vercel rapor fonksiyonunda da yönlendirilir; yeni framework veya veritabanı şeması gerektirmez. Workflow dosyasında bağımsız kaynak işi eklendi; uzaktaki zamanlayıcıda etkinleştirildiği henüz doğrulanmadı.
- İlerleme kanıtı: [ilk paket kabul kaydı](research-audit/2026-10-01-intelligence-package.md), [test çıktısı](research-audit/2026-10-01-intelligence-npm-test.txt), [yayın kaydı](research-audit/2026-10-01-macro-publication.json).

### Sıradaki kapılar

1. 2 Ekim ilk NFP açıklamasında önceden kayıtlı tahmini resmî ilk açıklamayla eşleştir. Kaynaklı konsensüs, çoklu metrik ve geçerli örneklem kapıları açık; sonuç açıklanmadan isabet/kalibrasyon üretme.
2. Yoğun düzenin bütün ekranlarda, dört temada, gerçek 80/100/125/200% zoom'da ve klavyeyle tam kabulünü tamamla. Kabul kanıtından sonra frontend paketini yayınla.
3. KAP otomatik şirket açıklaması bağlantısı ve Solana erişimi; kripto kapsamını üç resmî yayıncıyla sınırlı olarak belirt. SPK'da metin çıkarımı ile hukuki değişiklik yorumunu ayrı tut.
4. Portföyün işlem defteri, maliyetli net ölçüm ve araçlar arası bağlam; mevcut toplam pozisyon kayıt anlamına sessiz muhasebe değişikliği yapma.
5. Yeterli ileri dönem sonuçtan sonra kronolojik holdout ile yöntem önerisi; modelin kendisini eğittiği iddiası ancak ölçülmüş kanıtla değerlendirilebilir.

## Birincil referanslar

- [BLS Employment Situation takvimi](https://www.bls.gov/schedule/news_release/empsit.htm): referans dönem, açıklama günü ve Eastern Time saati.
- [BLS tarihli ilk yayın örneği](https://www.bls.gov/news.release/archives/empsit_09042026.htm): ilk açıklama ve önceki aylara revizyon ayrı içerik.
- [SPK resmî bülten listesi](https://www.spk.gov.tr/spk-bultenleri/2026-yili-spk-bultenleri): tarihli resmî belge erişimi; içerik özeti ayrıca doğrulanır.
- [Önceki araştırma denetimi](research-audit/2026-09-30-degerlendirme.md), [yayın güveni kabulü](research-audit/2026-09-30-report-publication-package.md).

### 1 Ekim kaynak ve zaman kanıtı güncellemesi

- İlk HTTP 403 kesiti tarihsel kayıttır. Sonraki native Node HTTPS erişimi BLS takvimi ile Mayıs 172, Haziran 57, Temmuz −23, Ağustos 162 bin kişi ilk açıklamalarını doğruladı. Revizyonlar bu değerlere yazılmadı.
- Yeni ardışık üç ay yöntemi v2: 65,33 bin kişi. Eski v1 tahminleri ve zamanları aynen korunur; iki v1 kaydına legacy_pre_fetch_clock dışlama kanıtı eklendi. Sonradan alınan kaynak izi önceki forecast için erişim kanıtı sayılamaz.
- Ethereum ve Bitcoin Core RSS ayrıştırması gerçek kaynakta düzeltildi ve doğrulandı. 100+100 kayıt arşiv sayısıdır; bu çalışmada son 24 saat sayısı sıfırdır. Solana erişim hatası, KAP bağlantı eksikliği ve SPK belge/metin farkı görünür.
- 48 test dosyası geçti. Dört temada görünür Genel Bakış metinleri örnekleminde minimum kontrast 6,49:1; bu bütün ekranların WCAG kabulü değildir. Gerçek zoom ve kontrollü aynı veriyle önce/sonra karşılaştırma açık.
- Günlük GPT-6.1 Sol akışı 1 Ekim 07:41 UTC'de tamamlandı. Canlı /api/report ve /api/research 200; çalışma kimliği 9d9514f3-b6cf-45f0-b73b-21ca650314a5. Üç piyasa da kısmi kapsam; sonuç yokken isabet oranı yok. Yeni frontend bu araştırma veri yayınıyla otomatik dağıtılmış sayılmaz.

### 1 Ekim · kaynaklı konsensüs ve ölçüm bütünlüğü

- Reuters’ın 30 Eylül tarihli ekonomist anketi haberi kaynak olarak doğrulandı; bağımsız konsensüs 90 bin kişi. Gerçek edinim: 1 Ekim 08:22:30 UTC. Yayın 30 Eylül 12:27:36 UTC; bunlar aynı zaman değildir. Kaynak yalnız Eylül 2026 NFP için gözden geçirilmiş kayıtlı bağlayıcıdır; sonraki ay veya diğer veri türleri otomatik kapsanmış sayılmaz.
- Supabase geri okuması bir konsensüs kaydı ve değişmeyen araştırma defteri gösteriyor: 7 çalışma / 1 tahmin / 0 sonuç. İlk tahmin 100 bin, güncel model görüşü 90 bin ayrı gösterilir. Güncel görüş türetilmiş çalışma geçmişidir; ikinci puanlama örneği değildir. Üç senaryo güncel 90 bin görüşünü referans alır. Eski tahminin consensus alanı null kalır.
- Eski model raporunun bilinen üretim kesiti yalnız gösterim sırasında kayıtlı çalışma alanından türetilir; bu, gerçek kaynak edinim zamanı kanıtı değildir. İlk kayıt ve yayın tarihleri yeniden yazılmadı.
- Yeni teknik çözümleme piyasanın yerel gününü kullanır; bugünün mumu ve gelecekteki mumlar işlenmez. Yahoo tarihleri borsa saat diliminden gelir; eksik zaman damgası için bugün tarihi uydurulmaz. Eksik high/low aralığı hedef/stop hit kanıtı sayılmaz. Aynı mumda iki hit belirsizdir; getiri null ve kazanma/ortalama getiri hesabı dışında. Gerçek işlem gerçekleşmesi, gap/slippage ve net maliyet ölçümü hâlâ ayrı iş.
- Kalibrasyon yalnız doğrulanmış önceden kilitlenmiş kayıtları kullanır. En az 12 eğitim + 3 kronolojik sınama gerekir; tüm eğitim sonuçları ilk sınama tahmininin kesitinden önce biliniyor olmalı. Hata düzeltmesi MAE iyileştirirken medyan hata veya mutlak sapmayı kötüleştirirse önerilmez. Eski kayıtların zaman kanıtı yokluğu geriye dönük doldurulmaz. Şu an geçerli sonuç yok; eğitim/iyileşme iddiası yok.
- `npm test` 52 test dosyasında geçti. Kanıt: `docs/research-audit/2026-10-01-consensus-npm-test.txt`; gerçek kaynak geri okuması: `2026-10-01-consensus-readback.json`; yerel API kontrolü: `2026-10-01-consensus-api-readback.json`.
- Yeni panel ve API kodu yerel önizlemede; bu değişikliklerin canlı dağıtımı henüz yapılmadı. Gerçek ilk sonuç, diğer makro metrikler/konsensüs kaynakları, KAP, SPK hukuki etki, gerçek zoom ve bütün araçların kabulü açık.
### 1 Ekim · SPK basın duyurusu katmanı

Resmî duyuru listesi gerçek sayfalarda doğrulandı: 12 bağlantıdan iki ilgisiz kayıt ayrıldı, 10 finans duyurusu 09:01:54 UTC'de alındı ve Supabase'den geri okundu. Bu sayı arşiv kapsamıdır. Yayıncı gün hassasiyetindeki tarihleri ile gerçek edinim zamanları ayrı; kısa kanıt metni hukuki etki olarak sunulmaz. BIST ekranında bülten PDF'leri, basın duyuruları ve KAP durumu ayrı izlenir. Araştırma defteri aynı kaldı: 7 çalışma / 1 tahmin / 0 sonuç; ek model çağrısı yok.

53 dosyalık test paketi geçti. Tarayıcı kaynak ayrıntısını ve klavye açılmasını doğruladı; açık kanıt içeriği yedi genişlikte taşmadı, mobil kaynak kontrolleri 44 px'e çıktı. Otomatik KAP şirket açıklaması bağlantısı tamamlanmadı: resmî toplu veri servisi sözleşme ve MKK IP/API anahtarı yetkilendirmesi gerektiriyor. Arama HTML'i tek başına bildirim kapsamı değildir. Mevcut üretim aktarımı 13:28 UTC'de 10 saniyelik zaman aşımı verdi; farklı aktarımla HTML erişim kanıtı bu başarısızlığı gizlemez. Yeni frontend/API için canlı dağıtım ve bütün araçlarda gerçek zoom kabulü açık. Ayrıntı: `docs/research-audit/2026-10-01-intelligence-package.md` ve SPK geri okuma/test kayıtları.

Kullanıcı 1 Ekim'de lisanslı KAP veri erişimi bulunmadığını bildirdi. API bağlantısı varsayılmaz; satın alma veya sözleşme yetkisi verilmiş değildir. Sonraki kaynak incelemesi açık şirket yatırımcı ilişkileri sayfaları ve resmî bağlantılar üzerinden, düşük sıklık ve açık kapsamla yapılacak. Bu seçenek tam KAP veri servisi diye sunulmayacak. İkinci makro aile için [CPI uygulama sözleşmesi](2026-10-01-cpi-kapsam-ve-kabul.md) hazır; uygulama ve gerçek kaynak kabulü sıradaki iştir.

### 1 Ekim · ikinci makro aile, CPI

CPI'nin bağımsız kaynak ve yöntem kayıtları uygulandı: resmî tablo başlıkları doğrulanmış dört ilk yayın, 16 metrik değeri ve gelecek Eylül açıklaması için 8 sabit yöntem tahmini Supabase'den geri okundu. İlk kayıt kesiti 14:12:39 UTC; sonuç sayısı sıfır. NFP ve araştırma defterleri aynı kaldı. Yerel panelde İstihdam/Enflasyon seçimi, kompakt dört satır, kaynak edinim kanıtı ve metrik başına yöntem kıyası çalışıyor. 59 test dosyası geçti; yedi genişlik ve temel klavye akışı doğrulandı. [CPI kabul kaydı](2026-10-01-cpi-kapsam-ve-kabul.md) ayrıntıları ve kanıtları içerir.

CPI model tahmin/çözümleme ve bağımsız konsensüs bağlayıcıları henüz açık değildir; kıyas sayıları GPT görüşü değildir. CPI kalibrasyonu, gerçek zoom/bütün araçlar kabulü, KAP şirket kaynakları ve yeni kodun canlı dağıtımı açık iş olarak devam eder. İşlev koruma hedefi daraltılmadı.

### 1 Ekim · CPI model sözleşmesi ve yerel senaryo görünümü

Önceki paragraf bağımsız kaynak aşamasının tarihsel durumudur. Dört CPI metriği artık tipli model tahmini ve resmî ilk sonuç çözümleyicisini kullanabilir. GPT-6.1 Sol değişmedi; `sol-research-v5` kaynaklı kaçınmayı, ayrı metrikleri, ilk tahminin korunmasını ve koşullu fiyat senaryosunu tarif eder. Bu pakette model çağrısı veya kayıt yayını yapılmadı; gerçek CPI model sayısı hâlâ sıfırdır. NFP ve iki bağımsız defterin hash'leri değişmedi.

Yerel görünüm ilk tahmin, güncel görüş, gerekçe, kaynak düzeyi ve olay başına tek senaryoyu ayırır. Metrik başına hata yüzde puanla ölçülür; sonucu bulunmayan kayıt öğrenilmiş başarı sayılmaz. 62 dosyalık test paketi ve açık ayrıntılarla yedi genişlik kontrolü geçti. Sentetik kabul kaydı gerçek tahmin diye gösterilmedi. [CPI uygulama/kabul kaydı](2026-10-01-cpi-kapsam-ve-kabul.md) kapsamı ve kanıtları içerir.

Sonraki sıra: model/kaynak depolarında kısmi arıza ve önbellek koruması, gerçek zoom/bütün araçlar kabulü, lisanssız şirket kaynakları ve gerçek CPI araştırma kaydı. Gelecek NFP ilk sonucu ve yeterli kronolojik örneklem beklenir; konsensüs/kalibrasyon bağlantıları ile portföy işlem defteri hedefleri açık kalır. Genel hedef tamamlanmış sayılmadı.

### 1 Ekim · bağımsız/model katmanlarının hata dayanıklılığı

Kısmi arıza ve önbellek paketi yerel kabulden geçti. NFP/CPI depo ve projeksiyon hataları diğer aileyi kesmez; bağımsız ve model içerikleri ayrı saklanır. Yeni dönem eski tahmini devralmaz; önceki kayıt metrik/birim/kaynaklarıyla geçmişte kalır. Sağlıklı boş defter, erişim hatasından ayrılır. Son incelemede Genel Bakış rapor özeti kapsam hatası da düzeltildi. Son 65 test dosyası, hata/toparlanma tarayıcı akışları ve yedi genişlik kontrolü geçti.

[Kabul kaydı](research-audit/2026-10-01-macro-resilience-acceptance.md) sentetik test kapsamını açıklar. Model çağrısı, gerçek yazım veya dağıtım yapılmadı; güncel Supabase geri okuması zaman aşımı nedeniyle doğrulanmadı. Sıradaki kabul kapıları gerçek CPI yayını/ilk sonuç, bağımsız konsensüs/kalibrasyon, lisanssız şirket kaynakları, bütün araçlar/temalar ve gerçek zoom kabulü ile canlı dağıtımdır. Portföy işlem defteri ve genel hedef açık kalır.

### 1 Ekim · bütün ana ekranlarda responsive/yoğunluk paketi

On ana ekran yedi CSS viewport genişliğinde, portföy senaryosu ve üç değerleme modeli ayrıca doğrulandı. Değerleme formunda taşma, siyah sayısal alan metni ve geniş panelde gereksiz tek sütun düzeltildi. Model geçişi düzeni korur. Sembol kırpılması, dar hesaplayıcı alanları ve mobil boş portföy düğmeleri giderildi. Stres testi boş/erişilemeyen portföyü ayırır; hata sırasında eski sonucu açık kapsamla tutar ve tekrar denemeyi sunar.

[Kabul ve görsel kanıt](research-audit/2026-10-01-workspace-responsive-acceptance.md): 65 test dosyası, dört temada 2687 normal metin ve 84 form alanı değeri kontrast örneği. Bunlar bütün durumların veya gerçek zoom'un kabulü değildir. Bu tur model çağrısı, gerçek kayıt yayını ve dağıtım yapılmadı. Sonraki işler: kalan klavye/zoom/veri güveni kabulü; lisanssız şirket kaynak pilotu; gerçek CPI kayıtları/konsensüs/ilk sonuç; yeterli kronolojik örneklemle kalibrasyon ve canlı dağıtım. Portföy işlem defteri ve genel hedef korunur.

### 1 Ekim · resmî şirket kaynakları pilotu

FROTO ilk sayfa / TUPRS seçili yıl listesi gerçek ağ yanıtıyla doğrulandı: 76 tarihli arşiv açıklaması, 75 belge bağlantısı. İki Tüpraş bağlantı çelişkisi korunur ve inceleme gerektirir. Günlük bağımsız kaynak akışına, CAS kayıt katmanına, ayrı araştırma girdisine ve BIST kaynak türü filtrelerine bağlandı. Yeni kontrol alanı yedi CSS genişliğinde ve klavyeyle doğrulandı. Model çağrısı veya gerçek şirket kaydı yayını yapılmadı; gerçek yayın önizlemesi mevcut 241 kaydı koruyarak 76 ek kaydı gösterdi.

[Kapsam ve kanıt](research-audit/2026-10-01-company-ir-acceptance.md). Canlı haber rotası 404 döndüğü için frontend/API dağıtımı, canlı geri okuma ve gerçek kaynak yayını açık. Belge gövdeleri/tam KAP erişimi doğrulanmış değildir. Genel hedef ve önceki açık kabul kapıları korunur.

### 2 Ekim · kaynak yayını ve canlı dağıtım kabulü

Önceki paragraflardaki açık canlı kapısı bu paket için kapandı. FROTO/TUPRS pilotunun 76 arşiv kaydı Supabase'e yazıldı; toplam 317 kayıt geri okundu. İki gerçek bağlantı çelişkisi ve liste/belge kapsam farkı korunur. Kök Node girişindeki Vercel haber/makro yönlendirmesi düzeltildi; son paket ana adrese geçirildi. Canlı API şekilleri, dört arayüz dosyası ve değişmeyen üç tahmin defteri doğrulandı.

Canlı kabulde geçmiş URL'sinin varlık panelini açmaması da bulundu ve giderildi. Liste ve detay URL'leri ayrılır; filtre/son seçim korunur. 69 test dosyalı paket ve canlı doğrudan bağlantı/geri/ileri akışı geçti. [Yayın ve sınırları](research-audit/2026-10-02-live-release-acceptance.md) API, görsel ve kaynak kanıtlarını içerir.

Sonraki kapılar: gerçek zoom, bütün ürün erişilebilirliği/durum kabulü, gerçek CPI model kaydı/bağımsız konsensüs, resmî ilk sonuçlar ve yeterli kronolojik örneklemle kalibrasyon. Bu yayında model çağrısı yapılmadı; 1 model tahmini / 0 sonuç başarı kanıtı değildir. Tam KAP ve altı aylık içerik denetimi tamamlanmış sayılmaz; genel hedef açık kalır.

### 2 Ekim · rapor bağlamı yayını ve tarihsel ölçüm denetimi

Model yorumunun oluşturulma zamanı ve güncel beklentilere geçiş canlıya alındı. İlk bağımsız okumalar paralel başlar, başarısız rapor okuması son başarılı içeriği korur. 70 dosyalı test paketi ve canlı klavye akışı geçti; yeni bileşen yedi genişlik/dört tema kontrolünden geçti. [Yayın kabulü](research-audit/2026-10-02-reading-context-acceptance.md) sınırları içerir.

[Güncel tarihsel denetim](research-audit/2026-10-02-history-review.md) 87 rapor/geçmiş günü, 367 teknik senaryo ve 7 model çalışma kaydı buldu. 8 Haziran–1 Ekim döneminin dışında altı aylık içerik kanıtı yok. Kapanmış 336 teknik kayıt eski sonuç kanıtını kullanıyor; kaydedilmiş brüt ortalama −%1,10 ve bir çözümleme tarihi denetim anında gelecekte. Bu ölçümler model başarısı değildir. Arşiv incelenebilir biçimde alındı, eski denetim korunarak araçtaki belirsiz sonuç/medyan/çıktı tarihi düzeltildi.

Öncelik: geçersiz GitHub oturumu yenilenince uzaktaki günlük sonuç çözücüsünün sürümünü doğrula; eski/sürümlü performans gruplarını ayır. Sonra bütün araçlarda kabul ve tüm iddiaların kaynak/zaman denetimi sürer. İlk resmî makro sonuç ve yeterli ileri örneklem açık; model veya kaynak verisi bu tur değiştirilmedi. Genel hedef tamamlanmış sayılmadı.

### 2 Ekim · performans grupları ve öneri sınırı canlıda

Teknik sonuç grupları kaynak, piyasa, strateji ve resolver sürümüne ayrıldı. Eski/kanıtı eksik, geçersiz ve belirsiz kayıtlar yeni performans ve öğrenme hesabına katılmaz; arşiv erişimi korunur. Öğrenme katsayıları öneridir, ayrı ileri dönem doğrulaması olmadan puanı değiştirmez. Birleşik eski isabetin ikinci puan etkisi de kaldırıldı. 72 dosyalı test paketi, gerçek klavye/gezinme akışı ve iki panelin yedi CSS genişliği geçti. Aynı dondurulmuş veriyle önce/sonra karşılaştırması ve ana alan yayını [kabul kaydındadır](research-audit/2026-10-02-performance-evidence-acceptance.md).

Günlük otomasyonun bu sabahki yayını artık 2 model tahmini içerir: ilk NFP kaydı korunur; ilk çekirdek CPI model tahmini vardır. Ölçülmüş model sonucu 0'dır. Önceki “gerçek CPI kayıt yok” kapısı bu metrik için kapanmıştır; diğer CPI metrikleri, ilk resmî sonuç, yeterli kronolojik örneklem ve etkin kalibrasyon açık kalır. GitHub uzak sürüm kontrolü erişim yanıtını bekler. Sonraki sıra: bütün araçlarda gerçek zoom/erişilebilirlik/durum kabulü ve araştırma iddialarının kaynak/zaman doğrulaması. Genel hedef açık kalır.
