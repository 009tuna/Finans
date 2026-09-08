# Astra araştırması ve tahmin ölçümü

## Çalışan parçalar

`npm run research` günün veri kesitini kontrol eder, gerekirse yeniler, teknik ve araştırma tahminlerinin sonuçlarını işler, temel raporla eşleşen GPT-6 Astra araştırmasını üretip yayınlar. Aynı çalışma kimliğinin başarılı AI raporu tekrar üretilmez. `npm run research:draft` yalnız taslak üretir; `npm run research:resolve` yalnız gerçekleşenleri toplar.

Üretici `@openai/codex` 0.153.4, `gpt-6-astra`, `high` muhakeme ve canlı web araması kullanır. Mevcut ChatGPT/Codex oturumunu kullanır; ayrıca API anahtarı gerekmez. İşlem ayrı geçici dizinde, salt okunur modda, kabuk/alt ajan/eklenti araçları kapalı çalışır. Veritabanı anahtarları alt işleme aktarılmaz. Kullanım sınırı, model hatası veya 12 dakikalık zaman aşımında akış başarısız olur; başka modele sessiz geçiş yapmaz.

Kaynaklar, olaylar, piyasa kapsamı, açıklama öncesi sayısal tahminler ve koşullu piyasa senaryoları JSON şeması ve uygulama kurallarıyla kontrol edilir. Kaynakların içerik doğruluğu modelin web araştırmasına dayanır; URL doğrulayıcı bağımsız bir olgu doğrulayıcı değildir. Başarı örneklemi oluşmadan model güveni kalibre edilmiş olasılık olarak gösterilmez.

Resmî kullanım belgeleri: [Codex betik modu](https://learn.chatgpt.com/docs/non-interactive-mode), [GPT-6 Astra modeli](https://developers.openai.com/api/docs/models/gpt-6-astra).

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

GitHub Actions hafta içi 06:00 UTC'de veriyi, temel raporu ve mevcut bilanço sonuçlarını günceller. Astra üretimi her gün 09:30 Europe/Berlin için yerel Codex zamanlamasına bağlandı; bilgisayar/Codex kapalıyken yerel araştırmanın yapılması garanti edilmez. `daily-update.bat` manuel olarak da çalıştırılabilir. Mevcut Windows Görev Zamanlayıcı görevi varsayılmaz.

Windows'ta doğrulanan Node bağlantı zaman aşımı için Supabase istekleri sistem `curl.exe` HTTPS istemcisiyle yapılır. TLS doğrulaması açıktır; anahtarlar komut satırına yazılmaz, stdin üzerinden iletilir. Vercel/Linux doğal fetch kullanır.

Akış çöker ve `data/report/.daily-research.lock` kalırsa içindeki PID'nin gerçekten durmuş olduğu kontrol edilmeden kilidi kaldırmayın. Eski rapora yeni tarih veya kimlik ekleyerek yeniden yayınlamayın; yeni veriyle yeniden araştırma yapın.

## Doğrulama

`npm test` 22 test dosyasını çalıştırır. Açıklama sonrası tahmin reddi, immutable kayıtlar, sıfır/eksik gerçekleşen ayrımı, aynı örneklemli konsensüs karşılaştırması, Brier, çakışmada yeniden okuma, sağlayıcı arızası ve HTML kaçışı kapsanır. Sentetik tarayıcı kontrolü için `FINANS_RESEARCH_FIXTURE=1`, `FINANS_TEST_PORT=5182` ile `node test/fixtures/integrity-dashboard.js` çalıştırılır; gerçek hesap verisine yazmaz.
