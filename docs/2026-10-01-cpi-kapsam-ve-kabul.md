# CPI: ikinci makro olay ailesinin uygulama sözleşmesi

Durum: bağımsız kaynaklar, yöntem kayıtları, tipli model tahmini sözleşmesi, ilk sonuç eşleştirmesi ve yerel görünüm uygulandı. Gerçek CPI model kaydı henüz üretilmedi. Bağımsız konsensüs, CPI kalibrasyonu, gerçek zoom ve canlı kod dağıtımı tamamlanmadı.

NFP ilk çalışan örnektir. Ürün tek bir istihdam tahminiyle sınırlı kalmayacak. Sonraki aile ABD tüketici enflasyonu olacak; dört değer aynı tahmin gibi karıştırılmayacak:

| Metrik | Dönüşüm | Birim |
|---|---|---|
| Manşet aylık CPI-U | Mevsim etkilerinden arındırılmış aylık değişim | Yüzde; hata yüzde puan |
| Çekirdek aylık CPI-U | Gıda/enerji hariç, mevsim etkilerinden arındırılmış | Yüzde; hata yüzde puan |
| Manşet yıllık CPI-U | Arındırılmamış 12 aylık değişim | Yüzde; hata yüzde puan |
| Çekirdek yıllık CPI-U | Gıda/enerji hariç, arındırılmamış 12 aylık değişim | Yüzde; hata yüzde puan |

## Doğrulanmış başlangıç kaynakları

[BLS CPI takvimi](https://www.bls.gov/schedule/news_release/cpi.htm) Eylül 2026 verisi için 14 Ekim 08:30 Eastern açıklamasını gösteriyor. [Ağustos açıklaması](https://www.bls.gov/news.release/cpi.htm) aynı sonraki tarihi doğruluyor. Bu hareketli son yayın URL'si tek başına değişmez ilk açıklama arşivi değildir. Üretim bağlayıcısı başlamadan tarihli arşiv URL'si ve gerçek edinim/hash kanıtı doğrulanacak.

Ağustos metnindeki manşet aylık %0,4 / yıllık %3,4 ve çekirdek aylık %0,3 / yıllık %2,4 ayrı referanslar. Bu inceleme geçmiş bir tahminin girdilerine erişim kanıtı olarak yazılmayacak. API'nin bugün döndürdüğü revize seri geçmişte bilinen ilk açıklamaymış gibi kullanılmayacak.

## Uygulama ve koruma

- Önce metrik politikası oluştur: benzersiz metric/unit/seasonal-adjustment kimliği, takvim ailesi, resmî kaynak doğrulayıcısı, ilk açıklama ve revizyon kuralları.
- Mevcut NFP kayıtlarının kimlikleri, kesitleri ve sonuçları aynen kalacak. Genel kayıt motoruna geçişte eski kayıtları sessizce taşıyan/yazan migrasyon olmayacak; yeni aile ayrı saklanabilir.
- Aynı takvim olayı dört metrik taşıyabilir; tahmin ve hata her metrik için ayrı. Bir eksik değer diğerlerini düşürmeyecek. Takvim düzeltmesi çelişki olarak izlenecek.
- İlk deterministik kıyaslar son ilk değer ve ardışık üç ilk açıklama ortalaması. Eksik ayda atlayarak ortalama yok. Girdi edinimleri tahmin kesitinden önce olmalı; geçmişe tahmin üretme yok.
- Konsensüs, model tahmini ve yöntem kıyası ayrı. Konsensüs bağlayıcısı ilgili dönem ve metrik için doğrulanmadan sayı gelmeyecek. Kaynaklı kaçınma kabul edilir.
- CPI ilk açıklamasındaki bileşenler ve zaman bilgisi kanıt olarak kalacak. Manşet yüksek/çekirdek düşük gibi çelişki fiyat yönünü kesinleştirmeyecek. Rejim, faiz/dolar kanalı, ufuk ve geçersizlik koşulu senaryoda açık olacak.
- Model görüşü güncellenebilir; puanlanacak ilk tahmin değişmez. Öğrenme tüm metrikleri havuzlayan tek başarı oranı üretmeyecek. NFP için geçerli örneklem CPI'yi eğitilmiş saydırmayacak.

## Ekran ve kabul

Makro çalışma alanında olay seçimi; önceki/konsensüs/model/gerçekleşen aynı metrik ve dönemde karşılaştırılır. Dört enflasyon sayısı ayrı dev kartlar yerine okunaklı kompakt satırlarda yer alır. Kaynak ve varsayım ayrıntıda, kritik yokluk/çelişki satırda görünür.

Kabul: gerçek tarihli arşiv ayrıştırması; negatif/unchanged değer; doğru SA/NSA ve aylık/yıllık ayrımı; DST; düzeltme ve eski kayıt koruma; açıklama öncesi immutable kayıt; sonraki ilk değerle otomatik eşleşme; kaynak hatasında eski içeriğin kalması; bütün CPI sonuçlarının NFP skorlarından ayrı olması; mobil/klavye/gerçek zoom. Mevcut NFP test paketi geçerken CPI kapsamı ayrıca kanıtlanacak.

## 1 Ekim uygulama ve kabul kanıtı

- Üretim aktarımıyla dört tarihli BLS arşivi alındı: Mayıs, Haziran, Temmuz, Ağustos 2026. Tablo A'nın güncel ay sütunu ve SA/NSA başlıkları doğrulanır; daha sonraki revize seri kullanılmaz. Haziran çekirdek aylık sıfır ve manşet aylık −0,4 tablo kanıtıyla gelir. Bilinmeyen değer sıfır yapılmaz. Paragraf/tablo çelişkisi ilgili metriği kullanılmaz bırakır.
- Supabase geri okuması: 13 takvim olayı / 16 ilk açıklama değeri / 8 yöntem tahmini / 0 sonuç. Tahminler 1 Ekim 14:12:39 UTC bilgi kesitinde, 14 Ekim 12:30 UTC açıklanacak Eylül dönemi için donduruldu. Eski açıklama tarihine tahmin oluşturulmadı. Araştırma defteri ve NFP defteri hash karşılaştırmasında değişmedi; araştırma 7 çalışma / 1 tahmin / 0 sonuç.
- İki yöntem: son ilk değer ve önceki ardışık üç ayın ilk değer ortalaması. İlk model tahmini ve piyasa konsensüsü değildir. CPI model alanı boş, konsensüs bağlı değil; yeni model çağrısı yapılmadı. Günlük bağımsız kaynak akışına CPI işi eklendi. Araştırma bağlamında CPI şimdilik yalnız kanıttır; model çözümleyicisi açılmadan yapılandırılmış CPI tahmini üretme talimatı verilmez.
- Ayrı `cpi_event_ledger_v1` CAS deposu, sabit metrik/dönem/yöntem kimlikleri, girdi kanıtı kopyaları ve gerçek edinim zamanı korunur. Düzeltme ilk değeri değiştirmez; çelişkili kayıtlar performans dışında kalır. Hata `sonuç − tahmin`, birim yüzde puandır; MAE ve sapma metrik ve yöntem bazında ayrı. Kalibrasyon etkin değildir.
- `/api/macro` yerelde HTTP 200: NFP üst alanları korunur; `families.us_cpi` eklenir. CPI depo hatası NFP'yi düşürmez. İlk sonuç eşleştirmesi açıklama öncesi kanıt ve kesin resmî ilk yayın ister; gerçek sonuç henüz yok, eşleştirme hata/yarış senaryolarında testle doğrulandı.
- 59 dosyalık `npm test` geçti. CPI kaynak testleri 14, olay/depo kabul testleri 31; API ve UI kontrolleri ayrıca çalıştı. 320/390/630/820/1024/1280/1440 genişliklerinde açık kaynak kanıtıyla gövde/panel/başlık taşması yok; telefon hedefleri 44 px. Küçük ekranda yalnız tablo yatay kayar. Klavyeyle sekme ve kanıt açılımı; yenilemede aile seçimi doğrulandı. Gerçek zoom bu kanıt değildir ve açık kalır.

Kanıtlar: [veritabanı geri okuması](research-audit/2026-10-01-cpi-readback.json), [yerel API](research-audit/2026-10-01-cpi-api-readback.json), [kaynak ön kontrolü](research-audit/2026-10-01-cpi-table-preflight.json), [responsive kontrol](research-audit/2026-10-01-cpi-responsive.json), [test çıktısı](research-audit/2026-10-01-cpi-npm-test.txt). Kaynak kayıtlarının Supabase'e yazılması frontend/API kodunun canlıya dağıtılması değildir.

## 1 Ekim · model tahmini, senaryo ve ilk sonuç sözleşmesi

Bu bölüm yukarıdaki tarihsel “CPI yalnız bağlamdır” aşamasından sonraki uygulamayı kaydeder. Model aynı kalır: GPT-6.1 Sol. Yeni prompt sürümü `sol-research-v5`; bu pakette model çağrısı veya Supabase yazımı yapılmadı.

| Metrik | Otomatik sonuç alanı |
|---|---|
| `us_cpi_headline_mom_sa` | `cpiHeadlineMomSa` |
| `us_cpi_core_mom_sa` | `cpiCoreMomSa` |
| `us_cpi_headline_yoy_nsa` | `cpiHeadlineYoyNsa` |
| `us_cpi_core_yoy_nsa` | `cpiCoreYoyNsa` |

- Dört tipli kayıt `bls-first-release` sağlayıcısına bağlandı. Birim `percent`; hata `gerçekleşen − ilk tahmin`, yüzde puan. Dönem, resmî takvim, metrik/alan, sembolsüz ABD olayı ve açıklama gününün tam tarihli arşiv adresi doğrulanır. Gelecekteki sonuç URL'si bugün yayımlanmış tahmin dayanağı sayılmaz; en az bir tarihli sayısal kaynak ve ilgili resmî takvim gerekir.
- İlk model tahmini değişmez. Yeni görüş çalışma geçmişinden türetilir; ikinci puanlama örneği olmaz. Yeni CPI kayıtlarının bilgi kesiti model araştırmasının tamamlandığı zamandır. `analysisAsOf` fiyat/girdi kesiti olarak kalır. Mevcut NFP kimlikleri ve eski kayıt davranışı değiştirilmedi.
- Çözümleyici yalnız zamanı gelen CPI tahminlerinde bağımsız depoyu okur. Dönem, metrik, SA/NSA tanımı, ilk yayın, içerik hash'i ve gerçek edinim zamanı eşleşmeden sonuç yazmaz. Çelişkili takvim veya ilk değer otomatik eşleşmeyi durdurur. CPI depo arızası NFP çözümlemesini engellemez. Metrik başına model MAE/sapma ayrı; `n=0` için değerler `null` kalır.
- Yerel API, ilk model kayıtlarını, sonraki görüşleri, gerekçeyi, üretim/bilgi kesitini ve kaynak atıflarını ayrı taşır. Modelin web atfı bağımsız kaynak edinim kanıtı değildir. Eşleşmeyen çalışma kimliği başka çalışmanın kanıtını devralmaz. NFP görüşleri CPI dışlamalarına karışmaz.
- Ortak CPI olayı dört tahmin taşıyabilir. Senaryo tek kez gösterilir; değişmeyen ilk değerler ve güncel görüşler kendi metrikleriyle referanslanır. Koşul, ufuk, aktarım gerekçesi ve geçersizlik görünür; fiyat tepkisi ölçülmüş başarı değildir.

Gerçek geri okuma 15:02 UTC: araştırma 7 çalışma / 1 NFP tahmini / 0 sonuç; NFP 13 olay / 4 ilk değer / 3 yöntem kaydı; CPI 13 olay / 16 ilk değer / 8 yöntem kaydı / 0 sonuç. Üç defterin hash'i paket öncesiyle aynı. `/api/macro` HTTP 200: NFP ilk tahmin ve tek sonraki görüş korunur; dört CPI metriğinde model/review/sonuç/dışlama sayıları sıfırdır. Gerçek CPI model tahmini yokluğu sentetik test sayılarıyla doldurulmadı.

62 dosyalık `npm test` geçti. Tipli doğrulama, eksik/yanlış kaynak, geç kesit, yinelenen sonuç, ilk tahminin korunması, dönem/metrik ayrımı, CPI arızasında NFP, gerçek sonuç yapısında `actualId` bulunmadığında düzeltme dışlaması ve ortak senaryoda dört referans ayrıca test edildi. Kaynak bağlantısı metninin son düzeltmesi CPI UI testiyle doğrulandı.

Tarayıcı kabulü izole `5192` sunucusunda, açıkça etiketli sentetik model kayıtlarıyla yapıldı. Gerçek ilk kaynak/yöntem kayıtları önceki geri okuma kesitinden; model değerleri örnektir. Kayıt/araştırma yayını yoktur. Açık model ve senaryo ayrıntıları 320/390/630/820/1024/1280/1440 genişliklerinde gövde/panel/metin taşması üretmedi; mobil açılım hedefleri 44 px. Tablo gerekli dar genişliklerde kendi alanında kayar. Enter ile ayrıntı açılıp kapanır. Bu kontrol gerçek tarayıcı zoom kabulü değildir.

Kanıtlar: [önceki hash'ler](research-audit/2026-10-01-cpi-model-before.json), [API ve değişmeyen defterler](research-audit/2026-10-01-cpi-model-readback.json), [test çıktısı](research-audit/2026-10-01-cpi-model-npm-test.txt), [responsive ölçümler](research-audit/2026-10-01-cpi-model-responsive.json), [sentetik ekran](research-audit/2026-10-01-cpi-model-ui-synthetic.png). Tekrar üretim: `node scripts/cpi-model-ui-qa.js`; gerçek yerel sunucu `5190` açık olmalı. Bu script mevcut ekranı izole kabul verisiyle sunar; canlı kayıt oluşturmaz.

Açık kapılar: gerçek kaynaklı CPI model yayını ve sonraki ilk sonuç; bağımsız CPI konsensüsü; yeterli ileri dönem örneklem ve kalibrasyon; kısmi model deposu arızasında önbellekli model içeriğinin korunması; NFP deposu arızasında CPI API/çözümleme izolasyonu; dört tema ve bütün araçlarda gerçek zoom/form/klavye kabulü; frontend/API kodunun canlı dağıtımı. Lisanssız KAP için şirket yatırımcı ilişkileri kaynakları ayrı, açık kapsamla araştırılacak; tam KAP bağlantısı iddiası yok.

### Son görsel ve erişilebilirlik kontrolü

| Önce | Sonra | Gerekçe |
|---|---|---|
| Her model hücresinde aynı iki satırlı etiket | Anlam sütun başlığında; hücrede yüzde | Tekrarı ve satır yüksekliğini azaltır. |
| Hücre etiketi erişilebilir adda yüzdeyi örtüyor | Sayısal değer doğrudan okunuyor | Ekran okuyucu tahmini duyabilir. |
| Gizli olması amaçlanan caption görünür | Görsel alandan kırpılmış, erişilebilir caption | Açıklama korunur; tablonun önüne tekrar eklenmez. |

Son yedi genişlik kontrolü bu düzeltmelerden sonra tekrarlandı; taşma yok, açılım hedefleri 44 px. 1280×720 görünümde dört tahmin değeri okunur; son satırın alt metadata kısmı için normal dikey kaydırma gerekir. Bütün satırların ilk ekrana eksiksiz sığdığı iddia edilmez. Caption ve yüzde değerleri AX görünümünde doğrulandı. Son küçük erişilebilirlik/CSS düzeltmelerinin ardından iki hedef CPI UI/model testi ve JavaScript sözdizimi kontrolü geçti; 62 dosyalık tam paket çıktısı önceki başlık düzenlemesini de kapsar.

### 1 Ekim · kaynak/model kısmi arıza kabulü

Önceki açık kapı listesinde belirtilen kısmi model önbelleği ve NFP/CPI izolasyonu bu paketle yerelde tamamlandı. Ayrı bağımsız/model önbellekleri, ilk erişim hatası, sağlıklı boş kayıt, dönem değişimi, kaynak kanıtı korunması ve geç yanıt koruması uygulandı. Son düzeltmelerle 65 test dosyası geçti; tarayıcıda hata/toparlanma, klavyeyle eski dönem açılımı ve yedi genişlik denendi. Genel Bakış'taki rapor değişken kapsam hatası da gerçek çalıştırma testiyle düzeltildi.

[Ayrıntılı kabul kaydı](research-audit/2026-10-01-macro-resilience-acceptance.md) kanıtları ve sınırları içerir. Gerçek CPI model yayını/sonucu, konsensüs/kalibrasyon, bütün araçlar/temalar ve gerçek zoom ile canlı dağıtım hâlâ açıktır. Güncel Supabase geri okuması zaman aşımına uğradığından bu pakette hash eşitliği doğrulanmış değildir; gerçek kayıt yazılmadı.
