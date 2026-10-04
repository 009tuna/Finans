# Sol araştırması ve tahmin ölçümü

## Çalışan parçalar

`npm run research` günün veri kesitini kontrol eder, gerekirse yeniler, teknik ve araştırma tahminlerinin sonuçlarını işler, temel raporla eşleşen GPT-6.1 Sol araştırmasını üretip yayınlar. Aynı çalışma kimliğinin başarılı araştırması, eski modelle üretilmiş olsa da tekrar üretilmez; yeni model bir sonraki yeni çalışmada devreye girer. `npm run research:draft` yalnız taslak üretir; `npm run research:resolve` yalnız gerçekleşenleri toplar. Önceden yayımlanmış Astra raporları model adıyla ve ilk kaydedilmiş tahminleriyle kalır.

Üretici `@openai/codex` 0.159.2, `gpt-6.1-sol`, `high` muhakeme ve canlı web araması için yapılandırıldı. İşlem ayrı geçici dizinde, salt okunur modda, kabuk/alt ajan/eklenti araçları kapalı çalışır. Veritabanı anahtarları alt işleme aktarılmaz. Kullanım sınırı, model hatası veya 12 dakikalık zaman aşımında akış başarısız olur; başka modele sessiz geçiş yapmaz.

**Doğrulanan erişim durumu (30 Eylül 2026):** 0.153.4 sürümü GPT-6 Sol ve ilk GPT-6.1 Sol denemelerini ChatGPT hesabı için reddetti. Projedeki CLI bağımlılığı 0.159.2'ye güncellendikten sonra GPT-6.1 Sol araştırması başarıyla yayınlandı. Çalışma `ed2e0909-cfcf-4ffc-a965-779a0f8fb7e5`: 6 kaynak, 5 olay, 7 web araması; 0 sayısal forecast ve 0 yön sinyali. `/api/report` ve `/api/research` 200, ortak çalışma kimliği ve güncel rapor/veri eşleşmesi doğrulandı. İlk ret mesajı hesabın model erişiminin tamamen kapalı olduğunu kanıtlamıyor. Responses API'ye geçilmedi, başka model veya reset kredisi kullanılmadı.

Kaynaklar, olaylar, piyasa kapsamı, açıklama öncesi sayısal tahminler ve koşullu piyasa senaryoları JSON şeması ve uygulama kurallarıyla kontrol edilir. Kaynakların içerik doğruluğu modelin web araştırmasına dayanır; URL doğrulayıcı bağımsız bir olgu doğrulayıcı değildir. Başarı örneklemi oluşmadan model güveni kalibre edilmiş olasılık olarak gösterilmez.

Sol'un genel yorumu temel rapordaki piyasa bağlamına ve varlıkların fiyat, para birimi, fiyat zamanı, teknik puan, varsa F/K ve piyasa değeri alanlarına dayanır. F/K ve piyasa değeri özellikle ABD hisselerinde bulunabilir; BIST için bu veri kesitinde temel oran genelde yoktur. DCF ve Graham ekran içindeki ayrı, deterministik hesaplamalardır; bu araştırma akışında onların varsayımları veya çıktıları Sol'a gönderilmez. Sol'un yorumu hesaplanmış adil değer yerine geçmez.

Resmî kullanım belgeleri: [Codex betik modu](https://learn.chatgpt.com/docs/non-interactive-mode).

## Kalıcı kayıt ve sonuç ölçümü

Supabase `api_cache` tablosundaki `research_ledger_v1` kaydı araştırma sürümlerini, tahminleri ve sonuçları tutar. CAS sürüm kontrolü eşzamanlı yazımları korur. Tahmin yalnız açıklama saatinden önce kaydedilir. Aynı ölçüm/piyasa/sembol/dönem/tarihin ilk tahmini korunur; tekrar çalışma örneklemi artırmaz. Eski tahmin veya sonuç üzerine yazılmaz. Mevcut sürümde tahmin revizyonları skorlanmaz; yeni araştırmada metinsel olarak tartışılabilir.

MAE ölçümün kendi birimindedir. Farklı piyasa/ölçüm/birimler birlikte ortalanmaz. Konsensüs MAE ile model MAE yalnız iki değerin de bilindiği aynı sonuçlar üzerinde karşılaştırılır. Brier, öznel P(gerçekleşen > konsensüs) tahmininin karesel hatasıdır; eşit gerçekleşme bu olay için 0'dır. Eksik değerler sıfıra çevrilmez. 20 sonucun altında örneklem yetersiz, üstünde yalnız betimsel olarak etiketlenir; bu eşik strateji başarısını kanıtlamaz.

ABD bilanço EPS/gelir sonuçları Finnhub'daki aynı sembol ve açıklama tarihiyle eşleştirilir. Belirsiz veya eksik eşleşme sonuçlanmaz. Kaydedilen değer sağlayıcıda ilk gördüğümüz sürümdür; sağlayıcının ilk resmî açıklama sürümü olduğunu garanti etmez. GAAP/adjusted veya para birimi tanımı uyuşmuyorsa bu otomatik çözüm kullanılmamalıdır.

Makro, BIST ve kripto olgu tahminleri aynı ölçüm katmanına bağlıdır; mevcut sürümde gerçekleşenler insan kontrolüyle girilir. Koşullu fiyat senaryoları henüz otomatik getiri testi değildir. Bu kapsam sınırını piyasa bazında başarı iddiasıyla karıştırmayın.

## Manuel gerçekleşen girişi

`GET /api/research` tahmin kimliklerini ve ölçümleri döndürür. Resmî kaynaktaki değer, birim, dönem ve açıklama saati kontrol edildikten sonra `POST /api/research`:

```json
{
  "action": "resolve",
  "confirmed": true,
  "forecastId": "GET yanitindaki kimlik",
  "value": 2.5,
  "unit": "tahmindeki birim",
  "period": "tahmindeki donem",
  "metric": "tahmindeki olcum",
  "publishedAt": "2026-09-10T12:30:00Z",
  "sourceUrl": "https://resmi-kaynak.example/yayin"
}
```

Üretimde mevcut `x-admin-secret` veya Bearer başlığı gerekir. Örnek JSON gerçek sonuç değildir. Yanlış sonuç düzeltmeleri bu sürümde otomatik kabul edilmez; ayrı revizyon desteği olmadan eski kayıt değiştirilmez.

## Zamanlama ve işletim

Sabah araştırmasının ilk işi, gelecek 14 gün içindeki bilinen NFP ve dört CPI ölçümü için modelin kendi açıklama öncesi beklentisini değerlendirmektir. `buildContext` bu hedefleri `expectationAgenda` listesinde sunar; liste bir tahmin ya da konsensüs değildir. Model resmî takvimi ve tarihli sayısal dayanakları canlı araştırmayla kontrol eder. Yeni üretim (`sol-research-v7`) ilk tahmini bulunmayan her hedefi kaynaklı `research.forecasts` veya `research.forecastAbstentions` kaydıyla karşılamak zorundadır. Önceden ilk tahmini kaydedilmiş hedef ise bugünkü açık yeniden değerlendirmeyi gerektirir; eski sayının varlığı görevi tamamlamaz. Haber özetiyle beklenti görevi atlanamaz; kanıt yoksa sayı da zorunlu değildir.

`research.expectationReassessments` yeni üretimde zorunlu, eski raporlarda isteğe bağlı dizidir. Her satır `market`, `metric`, `unit`, `period`, `scheduledAt`, `status`, `reason`, `sourceIds` taşır; yalnız önceden BLS ilk açıklama tahmini kilitlenmiş NFP/CPI hedefleri için kullanılır. `unchanged`, son kayıtlı görüşün bugünkü tarihli kaynak değerlendirmesiyle korunduğunu bildirir ve aynı hedefe yeni forecast yazmaz. `updated`, eşleşen kaynaklı forecast gerektirir. `abstained`, bugünkü güncel görüşün desteklenemediğini bildirir ve eşleşen kaçınma kaydı gerektirir. Unchanged/updated için tarihli kaynak zorunludur; hiç kaynak okunamayan abstained satırının sourceIds dizisi boş olabilir. Sayısal değer bu diziye eklenmez. Kayıt çalışma geçmişinde kalır; ilk kilitli tahmin ve başarı örneklemi değişmez. Yeniden değerlendirme mevcut ilk tahmine bağlı değilse yayın reddedilir.

`forecastAbstentions` kayıtları `market`, `metric`, `unit`, `period`, `scheduledAt`, `reason`, `missingEvidence` ve `sourceIds` taşır. Bunlar kullanıcının neden beklenti verilmediğini ve hangi kanıtın eksik olduğunu görmesini sağlar; tahmin örneklemine, isabet ölçümüne veya yön sinyaline girmez. Piyasa konsensüsü bulunmaması tek başına kaçınma gerekçesi değildir. Eski raporlar bu alan olmadan okunmaya devam eder. İlk tahmin sonradan değiştirilmez; yeni kaynaklı görüş ayrı geçmiş kaydıdır. Gündem boşsa kaynak/takvim kapsamı araştırmanın açık sorularında belirtilir. Yerel zamanlayıcının aktif olması, bilgisayar ve Codex kapalıyken çalışma garantisi vermez.

Araştırma veya yayın sürerken açıklama saati gelirse sayısal forecast hâlâ reddedilir. Sayı içermeyen kaçınma kaydı ise yalnız `research.analysisAsOf` açıklama saatinden önceyse tarihsel kaynak boşluğu olarak korunur; ilk tahmin, sonuç veya başarı örneği oluşturmaz. Açıklama sonrasına ait ya da zaman kesiti belirsiz kaçınma geriye dönük açıklama öncesi kayıt diye kabul edilmez.

Runtime, model metni boşluğu belirtmese bile `research.expectationCoverage` dizisinde NFP ve CPI için iki tarihli kayıt ekler. Alanlar `family`, `status`, `reason`, `checkedAt`, `scheduledAt` (bilinmiyorsa null), `scope=independent_calendar` biçimindedir. `unavailable` okunamayan/başarısız takvimi, `no_upcoming_release` kayıtların 14 günlük penceresinde açıklama bulunmamasını, `schedule_conflict` saat çelişkisini, `available` bilinen açıklama kaydını ifade eder. Bu alan modelin bağımsız görüş ürettiği veya takvimi yeniden doğruladığı iddiası değildir; canlı model araştırmasının kaynakları ayrı kalır. Eski raporlara yeni kontrol zamanı eklenmez.

`scripts/refresh-intelligence.js` modül olarak çağrıldığında kaynağın kısmî hatasını sonuçta bildirir ve çağıran sürecin exit code'unu değiştirmez. Tek başına CLI çalıştırıldığında macro/news/CPI `failed` sonucu hata çıkışına dönüşür. Böylece başarılı günlük yayın, önceki kaynak yenilemesinin süreçte bıraktığı çıkış koduyla başarısız görünmez.

GitHub Actions hafta içi 06:00 UTC'de veriyi, temel raporu ve mevcut bilanço sonuçlarını günceller. Yerel Codex üretimi her gün 09:30 Europe/Berlin için zamanlamaya bağlandı; bilgisayar/Codex kapalıyken yerel araştırmanın yapılması garanti edilmez. `daily-update.bat` manuel olarak da çalıştırılabilir. Mevcut Windows Görev Zamanlayıcı görevi varsayılmaz.

Windows'ta doğrulanan Node bağlantı zaman aşımı için Supabase istekleri sistem `curl.exe` HTTPS istemcisiyle yapılır. TLS doğrulaması açıktır; anahtarlar komut satırına yazılmaz, stdin üzerinden iletilir. Vercel/Linux doğal fetch kullanır.

Akış çöker ve `data/report/.daily-research.lock` kalırsa içindeki PID'nin gerçekten durmuş olduğu kontrol edilmeden kilidi kaldırmayın. Eski rapora yeni tarih veya kimlik ekleyerek yeniden yayınlamayın; yeni veriyle yeniden araştırma yapın.

## Doğrulama

`npm test` 33 test giriş noktasını çalıştırır. Açıklama sonrası tahmin reddi, immutable kayıtlar, sıfır/eksik gerçekleşen ayrımı, aynı örneklemli konsensüs karşılaştırması, Brier, çakışmada yeniden okuma, sağlayıcı arızası, API yetkisi/yönlendirme ve HTML kaçışı kapsanır. Sentetik tarayıcı kontrolü için `FINANS_RESEARCH_FIXTURE=1`, `FINANS_TEST_PORT=5182` ile `node test/fixtures/integrity-dashboard.js` çalıştırılır; gerçek hesap verisine yazmaz.

8 Eylül ilk canlı çalışma: dört kaynak, iki olay, bir koşullu senaryo; sayısal forecast ve yön sinyali sıfır. Kaynak/konsensüs boşlukları nedeniyle tahminden kaçınıldı. Canlı rapor ve ölçüm uçları 200, yetkisiz sonuç yazımı 401 ile doğrulandı. Bu ilk yayın performans kanıtı değildir.
