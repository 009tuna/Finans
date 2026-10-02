# Finans · kaynaklar, tahmin çalışma alanı ve canlı yayın kabulü

2 Ekim 2026 · Europe/Istanbul. Bu kayıt bu yayın paketinin kabulüdür; bütün ürünün veya genel hedefin tamamlandığı anlamına gelmez.

## Son yayın

- Ana adres: https://finans-dashboard-iota.vercel.app/#view=overview
- Son paket: `dpl_4cF2jHWDcU6ttvFn2y8M5YCvUot4`, `finans-dashboard-p4wa2svwx-tunahan81jb-7635s-projects.vercel.app`.
- Korumalı paket `READY` oldu, dosya ve kaynak uçları doğrulandı, sonra mevcut ana adrese geçirildi. [Ana adresin Vercel kimliği](2026-10-02-live-deployment.json) son paketi doğrular.
- Önceki ana yayın: `dpl_5qcDVAoCwxmr6YD6MVCXepag3pNz`, `finans-dashboard-riseycy09-tunahan81jb-7635s-projects.vercel.app`. Geri dönüş gerekirse bu pakete `vercel rollback <url>` uygulanır. Bu tur geri dönüş yapılmadı.

İlk dağıtım incelemesinde `/api/market-news` haber yerine rapor döndürüyordu. Node proje ayarı kök `server.js` girişini kullandığından `/api/report?resource=market-news` ve `resource=macro` yolları burada da ele alındı. Mevcut araştırma takma yolu zaten destekleniyordu. Gerçek HTTP testinde yanıt şekli, salt okuma yöntemi, 405 ve sıradan rapor davranışının korunması kontrol edildi. Yanlış yanıt veren ara paket ana adrese geçirilmedi.

Canlı tarayıcı incelemesinde ikinci hata bulundu: geçmişten gelen varlık simgesi detay panelini açmıyordu. Panel sınıfı artık geri yüklenen görünümle eşlenir. Liste URL'si simge içermez; son seçilen varlık oturum belleğinde kalır. Listeye dönmek detay geçmişini koruyarak ayrı liste girişi oluşturur. Karar izi bağlantısı ortak varlığa geçiş eylemini kullanır.

## Gerçek veri yayını ve korunan kayıtlar

Şirket listesi pilotu `market_sources_v1` kaydına yazıldı ve CAS sonrası tekrar okundu. [Yayın geri okuması](2026-10-01-company-ir-publication-readback.json): toplam kayıt 241 → 317, şirket kaydı 0 → 76. Dosya adı önceki paket gününü taşır; gerçek `checkedAt` 1 Ekim 21:15:06 UTC / 2 Ekim 00:15:06 İstanbul'dur.

| Kaynak | Kapsam | Kayıt | Sonuç |
|---|---|---:|---|
| FROTO | Resmî açıklama listesinin ilk sayfası | 20 | Erişilebilir |
| TUPRS | Resmî açıklama listesindeki seçili 2026 yılı | 56 | Kısmi; iki belge bağlantısı çelişkisi |

76 bir arşiv/listeden edinim sayısıdır; bugün yayımlanan 76 haber değildir. Kontrol edilen İstanbul günü 2 Ekim'dir ve iki kaynakta o günün yayıncı tarihine sahip kayıt sayısı sıfırdır. Yayıncı saat vermediği için açıklama saati üretilmez. Şirket listesinde bağlantı doğrulanması PDF/KAP gövdesinin okunması veya başlıktan finansal etki çıkarılması anlamına gelmez. Tam KAP servisi bağlı değildir.

NFP, CPI ve araştırma defterlerinin [yayın öncesi](2026-10-02-deploy-protected-ledgers-before.json) / [sonrası](2026-10-02-deploy-protected-ledgers-after.json) SHA-256 değerleri eşittir. Bu pakette model çağrısı yok; mevcut ilk tahminler ve sonuçlar değiştirilmedi. Gerçek portföy/not ekleme veya silme yapılmadı. Model, risk formülleri, sayısal değerleme ve otomasyon takvimi değiştirilmedi.

## Canlı uç ve tarayıcı kanıtı

[Son paketin uç ölçümleri](2026-10-02-live-endpoints.json): `/api/market-news`, `/api/macro`, `/api/research`, `/api/report`, `/api/data` HTTP 200 ve kendi yanıt şekilleri. `app.js`, `macro.js`, `styles.css`, `macro.css` test edilmiş yerel dosyalarla birebir aynı. Bu tek çalışma 1,8–4,4 saniye API yanıtı gösterir; saha performansı veya Core Web Vitals ölçümü değildir.

| Kontrol | Gözlenen sonuç |
|---|---|
| BIST kaynak türü | Tümü 118 / Düzenleyici 41 / Şirketler 76; kalan bir model olayı Tümü içinde |
| Şirket filtresi | Klavyeyle seçildi; seçim ve odak korunuyor; tüm liste 76 kayıt |
| Tüpraş çelişkisi | İki açıklama da inceleme gerekli; ayrıntıda belge gövdesinin okunmadığı açık |
| Mobil menü | Enter açıyor; Escape kapatıyor ve odağı tetikleyiciye döndürüyor; seçim başlığa odaklanıyor |
| Portföy | Başarılı boş kayıt ile ekleme formu görüldü; gerçek yazma yapılmadı |
| Varlık incelemesi | FROTO araması bir sonuç; klavye detay eylemi; grafik ve fiyat zamanları ayrı |
| Grafik odağı | Kapatılınca RSI seçimi korunuyor, mevcut grafik görünür |
| Gezinme düzeltmesi | Doğrudan simge bağlantısı, filtreli liste → detay → liste → geri/ileri canlıda çalışıyor |
| NFP | Önceki ilk açıklama 162 bin, bağımsız konsensüs 90 bin, ölçülecek ilk model tahmini 100 bin, güncel görüş 90 bin ayrı |
| CPI | Dört önceki ilk metrik ve yöntem kıyası; model kaydı/konsensüs yokluğu açık |
| Sonuç örneklemi | Araştırma 1 tahmin / 0 sonuç; örneklemsiz başarı oranı üretilmiyor |

[Geçmiş ve filtre tarayıcı kanıtı](2026-10-02-live-navigation-browser.json). [320/390/630/820/1024/1280/1440 CSS px ölçümleri](2026-10-02-live-source-widths.json): kaynak filtrelerinde kırpılma ve gövde taşması yok; hedef yüksekliği 44 px. Bu ölçüm kaynak kontrol alanını kapsar. Önceki [on ekran responsive kabulü](2026-10-01-workspace-responsive-acceptance.md) ayrı kapsamdır.

Son tarayıcıda yakalanmış error/warn kaydı yok. [Vercel gözlemi](2026-10-02-live-runtime-observation.json) son 15 dakika sorgusunda hata/uyarı kaydı döndürmedi. Bu, bütün trafik için 15 dakikalık kesintisiz izleme veya hata oranı ölçümü değildir.

- [Canlı istihdam çalışma alanı](2026-10-02-live-forecasts.png)
- [Canlı şirket filtresi · masaüstü](2026-10-02-live-company-desktop.png)
- [Canlı şirket filtresi · mobil](2026-10-02-live-company-mobile.png)
- [Son npm test çıktısı](2026-10-02-live-navigation-npm-test.txt): 69 test dosyalı komut çıkış 0; şirket paketindeki 21 alt test geçti. Gezinme regresyonu gerçek render, filtre/kaydırma, liste dönüşünün geçmişi, doğrudan/uyuşmayan simge bağlantılarını kapsar.

Kaynak ekranları aynı değişmeyen 76 kayıt üzerinden alınmıştır. Son tahmin ekranında fiyat akışı doğal olarak yenilenmiştir; bütün ekranların sabit tek kesitle önce/sonra karşılaştırıldığı iddia edilmez.

## Açık kabul kapıları

1. Gerçek 80/100/125/200 yüzde tarayıcı zoom'u. Chrome bağlıydı; Ctrl+- denemesinde viewport/DPR değişmedi. CSS viewport yeniden boyutlandırması zoom kanıtı değildir.
2. Bütün araçlarda klavye/ekran okuyucu, hareket azaltma ve aynı kesitte önce/sonra kabulü; dört temanın bütün durumları. Bu tur sadece yukarıdaki görevler canlıda sınandı.
3. Gerçek CPI model yayını ve bağımsız konsensüs; NFP/CPI resmî ilk sonuçlarından yeterli ileri dönem örneklem. Mevcut model sonucu sıfır olduğundan öğrenilmiş başarı/kalibrasyon iddiası yoktur.
4. Lisanssız şirket listesi pilotunun sonraki tarihlerde kontrolü ve belge gövdeleri için ayrı doğrulanmış kapsam; piyasa kaynaklarının kısmi arızaları görünür kalır.
5. Geniş işlev koruma matrisi, kayıt hataları/taslaklar/istek yarışının bütün ürün kabulü ve altı aylık içerik denetimi. Önceki sınırlı testler bu işlerin tamamı sayılmaz.

Genel hedef aktif; canlı dağıtım kapısı bu paket için kapanmıştır.
