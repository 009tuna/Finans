# Finans — günlük akış ve tarihsel içerik denetimi

30 Eylül 2026 · Türkiye saati · Kaynaklar: canlı Supabase kayıtları, mevcut uygulama kodu ve seçili resmî yayınlar.

## Sonuç

Finans, veri toplama ve teknik izleme açısından düzenli çalışan bir araştırma çalışma alanı. Mevcut kayıtlar onu başarılı bir yatırım stratejisi veya ölçülmüş haber tahmin sistemi olarak sunmayı desteklemiyor. Kaynaklı araştırmanın dili Eylül sürümünde belirgin biçimde disiplinli; şirket kapsamı ve ölçülebilir tahmin üretimi ise zayıf.

Kullanıcının belirttiği altı ayın tamamı erişilebilir kayıtlarla doğrulanamadı. Supabase'de 8 Haziran–30 Eylül arası **115 takvim günü**, **86 rapor/geçmiş günü** var. Bu aralıkta 83 hafta içi günün tamamının tarih satırı mevcut. Satır bulunması, her gün bütün kaynakların başarılı olduğu veya aynı gün tam AI araştırması yapıldığı anlamına gelmez. Nisan–Mayıs içeriği bu veritabanında bulunmadığından değerlendirme dışı.

## 1. Otomasyon günlük ne yapıyor?

| Adım | Gerçek davranış | Sınır |
|---|---|---|
| Piyasa verisi | ABD, BIST ve kripto fiyat/seri verilerini toplar; teknik göstergeler, rejim ve puanlar üretir. | Teknik puan getiri olasılığı değildir; eksik sağlayıcı verisi kullanılabilir kapsamı daraltır. |
| Teknik tahminlerin takibi | Kaydedilen giriş/hedef/stop senaryolarını sonraki günlük yüksek/düşük/kapanışla karşılaştırır. | Gerçek işlem defteri, emir gerçekleşmesi ve net portföy getirisi değildir. |
| Araştırma sonuçları | Uygun ABD bilanço tahminlerini Finnhub gerçekleşenleriyle eşleştirir. | Makro/BIST/kripto sayısal olgu sonuçları insan doğrulamasıyla girilir. |
| Temel rapor | Piyasa özetini, fırsatları, riskleri, ekonomik/bilanço takvimini ve öğrenme özetini üretir. | Bu katman deterministik kod çıktısıdır; her paragrafı GPT üretmez. |
| Kaynak araştırması | Model, mevcut veri kesiti ve önceki araştırma ölçümleriyle web kaynaklarını inceler; olay, karşı kanıt, koşullu senaryo ve yeterli kanıt varsa forecast/sinyal üretir. | Kanıt yoksa tahmin veya sinyal üretilmez. Sayfa değişimi bu araştırmayı yeniden çalıştırmaz. |
| Doğrulama/yayın | Şema, tarih, kaynak ilişkisi, veri kesiti ve çalışma kimliğini kontrol edip Supabase'e yazar. | Bir URL'nin ve referans bağının geçerli olması, iddianın bağımsız doğrulandığı anlamına gelmez. |

Yerel komut: `npm run research`. Aynı günün veri kesiti eskiyse veya yoksa yeniler; araştırma sonuçlarını ve teknik sonuçları çözer; temel rapor kesitle eşleşmiyorsa/güncel değilse rapor üretir; sonra araştırma üretir. Aynı çalışma zaten başarıyla araştırılmışsa, eski modelle üretilmiş olsa da yeniden üretmez. Model değişikliği geçmiş raporların model etiketini değiştirmez.

GitHub Actions yapılandırması hafta içi **09:00 Türkiye saati** veri → teknik sonuç → temel rapor → araştırma gerçekleşenleri akışını tarif ediyor. Bu incelemede uzak Actions çalışma logları incelenmedi; tarih satırlarının varlığından yalnız bu workflow'un çalıştığı sonucu çıkarılmaz. AI üretimi yerel Codex otomasyonundadır. Yerel otomasyonun saat kuralı değiştirilmedi; bilgisayar/Codex kapalıyken üretim garanti edilmez.

Portföy, notlar ve alarm kuralları kullanıcının kayıtlarıdır. Araştırma akışı bunları otomatik alım/satım emrine dönüştürmez. DCF/Graham/DDM ve Monte Carlo ayrı hesaplama araçlarıdır; kaynak araştırması bu hesapların varsayımlarını otomatik iyileştirmez veya geçmiş doğruluğunu ölçmez.

## 2. Tarihsel teknik sonuçlar

Denetim kesiti: `2026-09-30-evidence.json` içindeki `auditedAt`. 356 kayıt, 335 kapanan senaryo, 21 açık kayıt. Bütün kayıtların kaynağı `system`; bunlar GPT-6.1 Sol başarı ölçümü değildir.

| Piyasa | Kapanan | Kazanan* | Kazanan oranı | Ortalama brüt sonuç |
|---|---:|---:|---:|---:|
| ABD | 32 | 10 | %31,3 | −%1,13 |
| BIST | 292 | 75 | %25,7 | −%1,57 |
| Kripto | 11 | 8 | %72,7 | +%11,95 |
| Toplam | 335 | 93 | %27,8 | −%1,08 |

\*Kazanan: hedefe ulaşan veya vadesinde giriş fiyatının üzerinde kapanan kayıt. 82 hedef, 240 stop, 11 vade sonunda pozitif, 2 vade sonunda negatif. Yalnız hedefe ulaşma oranı 82/335 = **%24,5**; bu oran kazanan oranıyla aynı değildir.

Ortalamalar kayıt başına eşit ağırlıklı, kaydedilmiş brüt fiyat değişimidir. Sermaye ağırlığı, eşzamanlı pozisyon, giriş gerçekleşmesi, kur etkisi, komisyon ve kayma içermez. Toplanıp portföy kazancı olarak okunamaz. Aynı sembol/piyasa koşulundaki tekrarlanan tahminler bağımsız örnekler sayılmaz. Açık 21 kayıt sonuçlara dahil değildir; özellikle son ay tamamlanmış bir dönem değildir.

BIST kapanan örneklerin %87,2'sini oluşturuyor. Toplam sonuç ağırlıkla BIST'in sonucudur. Kriptodaki 11 kapanış olumlu bir gözlem, istikrarlı başarı kanıtı değil. Yalnız güçlü AL kayıtlarında da 172 kapanışın 49'u kazanan (%28,5), ortalama −%0,79. Etiketin sertleşmesi tek başına sistemi güvenilir yapmamış.

| Tahminin kaydedildiği ay | Kapanan | Kazanan oranı | Ortalama brüt sonuç |
|---|---:|---:|---:|
| Haziran | 65 | %21,5 | −%2,85 |
| Temmuz | 79 | %27,8 | −%1,40 |
| Ağustos | 102 | %34,3 | −%0,11 |
| Eylül | 89 | %24,7 | −%0,62 |

Ağustos daha az olumsuz; kalıcı iyileşme ispatlanmış değil. Rejim, örnek karışımı ve kod sürümleri ayrıştırılmadı. Sonradan seçilen başarılı puan aralığını doğrudan yeni filtre yapmak aşırı uyuma yol açabilir; örneğin 90+ puan grubunda yalnız 13 kapanış var.

## 3. Kayıtların tutarlılığı

Olumlu kontroller: tekrar eden tahmin kimliği yok; bilinmeyen outcome yok; kapanan kayıtların tümünde getiri mevcut; kayıtlı getiri ile fiyat formülü arasında 0,11 puandan büyük sapma yok; giriş/stop/hedef sırası geçerli; çözülme tarihi oluşturulmadan önce değil; vadesi aşılmış açık kayıt yok.

Önemli sorunlar:

1. **Dört kapanış zamanı denetim anına göre gelecekte.** TSLA, AGHOL, TKFEN ve BIMAS için `resolvedAt=2026-09-30T23:59:59Z`. Resolver günlük mumu incelerken o günün sonunu sonuç zamanı olarak yazıyor. Hedef/stopun gün içinde görülmesi mümkün olsa da kaydedilen zaman gerçek tespit zamanı değildir. Vade sonu günlük kapanışı için tamamlanmamış mum ayrıca sorun yaratır. Bu dört kayıt çıkarıldığında da 331 kapanışın ortalaması −%1,02; ana olumsuz bulgu değişmiyor.
2. **Aynı mumda hedef ve stop görülürse stop sayılıyor.** Muhafazakâr bir varsayım; günlük OHLC olay sırasını kanıtlamaz. Belirsiz mumlar ayrı işaretlenmeden sonuçlar kesinleşmiş işlem gibi sunulmamalı.
3. **356 kaydın tamamında model/strateji sürümü eksik.** Eski ve yeni teknik mantığın sonucu birbirinden ayrı değerlendirilemiyor. Kaydedilmiş sonuçlar belirli bir GPT sürümüne atfedilemez.
4. **Dört raporun tarih anahtarı temel rapor üretim günüyle farklı.** 8, 20, 23 ve 26 Haziran satırları. Özellikle 8 Haziran satırındaki base zamanı 18 Haziran; bunun üzerine 8 Haziran AI metni bağlı. Gecikmiş üretim veya geçmiş yeniden yazım olabilir; sebebi çalışma logları olmadan kesinleştirilemez. O gün bilinen bilgiyle geriye dönük değerlendirme bu satırda güvenilir değil.
5. **Geçmiş görünümü 120 kayıt sınırına sahip.** `getHistory()` artan tarih sıralamasıyla ilk 120 satırı alıyor. Veri büyüdüğünde yeni günleri dışarıda bırakabilir; altı aylık görünümü de garanti etmez. Bu denetim özel salt okunur sayfalama ile tüm 86 satırı okudu; uygulama sınırına dayanmadı.
6. **Bugünün veri kesiti kısmi.** ABD 12 varlıkta 11 F/K ve 12 piyasa değeri; BIST 100 varlıkta F/K ve piyasa değeri yok. Kripto 21 varlıkta iki fiyat/veri zamanı eksik ve yedi varlığın teknik seri kapsamı yetersiz. BIST şirketlerini bu girdiden temel değerlemeyle sıralamak mümkün değil.

## 4. AI yorumlarının mantığı ve kaynak kalitesi

Araştırma günlüğündeki tarihsel kapsam: **8, 9, 10 ve 17 Eylül'de dört Astra yayını**. 19 kaynak referansı, 17 farklı URL, 11 olay, 6 koşullu senaryo; **0 sayısal forecast, 0 yön sinyali, 0 ölçülmüş araştırma sonucu**. Kaynakların 12/19'unda kesin yayın zamanı yok. Bu sebeple Brier, model/konsensüs MAE veya haber tahmini isabet oranı üretilemez.

Günlük rapor tablosunda AI katmanı bulunan yalnız altı tarih var: dört Haziran metni ve iki Astra raporu. Günlük tabloda bulunmayan iki Astra çalışması immutable araştırma günlüğünde korunuyor. Günün base raporu yeniden yazıldığında AI alanının sıfırlanması bu fark için olası mekanizma; işlem logları incelenmeden her satırın sebebi kesin söylenemez. “86 gün AI analiz yaptı” çıkarımı yanlış olur.

**Haziran yaklaşımı:** Okunur ve piyasa risklerini birbirine bağlayan yorumlar var. Ancak dört rapordaki 20 `worldNews` başlığının hiçbirinde doğrudan kaynak URL alanı bulunmuyor. 14/17 Haziran sinyallerinin bazılarında kaynak adı veya metne gömülü URL var; tam kaynak zinciri ve tarih sürümü yok. 10 Haziran retrospektifinde koşullu bir uyarı, olay koşulu gerçekleşmeden fiyat hareketi oluştuğu kabul edilmesine rağmen “DOĞRU” diye nitelendirilmiş. Bu, açıklama sonrası anlatı değerlendirmesi; önceden kaydedilmiş/puanlanabilir olgu tahmini değil. Eski sinyallerden 25'i yeni 36 saatlik süre kuralından uzun; bugünkü kuralla geriye dönük başarısız sayılmamalı, fakat metodoloji değişimi açık kaydedilmeli.

**Eylül yaklaşımı:** Bilgi, yorum ve koşul ayrımı daha iyi. “İstihdam önceki aydan yüksek” ile “konsensüsü aştı” aynı sayılmıyor; şirket duyurusu doğrudan fiyat artışı diye sunulmuyor; Ethereum geliştirme hedefi gerçekleşmiş ağ yükseltmesi sayılmıyor. Kaynak veya zaman bulunamadığında tahminden kaçınma mantıklı. Dört araştırmada ABD kapsamı hep kısmi; BIST ve kripto üçer kez yetersiz kanıt olarak etiketlenmiş. Bu dürüstlük iyi, fakat araştırma hizmetinin bu piyasalarda henüz yeterli olmadığı gerçeğini değiştirmiyor.

Seçili iddia kontrolü:

| Kayıtlı iddia | Kontrol | Sonuç |
|---|---|---|
| Ağustos ABD istihdamı +162 bin, işsizlik %4,1; iki ay revizyonu +55 bin | [BLS'nin tarihli ilk yayın arşivi](https://www.bls.gov/news.release/archives/empsit_09042026.htm) | Temel rakamlar kaynakla eşleşiyor. |
| 16 Eylül Fed artışı 25 bp, aralık %3,75–4,00 | [Fed tarihli açıklaması](https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm) | Karar, saat ve aralık kaynakla eşleşiyor. |
| Ağustos enflasyonuna yaklaşık 0,25 puan takvim etkisi | [TCMB 17 Eylül özeti](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Duyurular/Basin/2026/DUY2026-42) | Hizmet kalemlerinin takvim etkisi kaynakta mevcut. |

Apple, SBB ve Ethereum kayıtlarının kaynak sayfaları da açıldı. Burada bütün 19 kaynak referansının her cümlesi bağımsız doğrulanmış sayılmıyor. İlk BLS kaydındaki güncellenebilir `empsit.htm` bağlantısı, daha sonraki `archives/empsit_09042026.htm` bağlantısı kadar tarihsel olarak sağlam değil. Kaynaklar tarihli arşiv veya içerik kesitiyle korunmalı.

Sonuç: **Araştırma metinlerinin muhakemesi olgunlaşmış; işlem başarısı ve forecast başarısı kanıtlanmış değil.** “Faiz artışı iskonto oranıyla hisseleri baskılayabilir” mantıklı bir aktarım mekanizmasıdır; hangi varlıkta ne kadar getiri sağladığını tek başına göstermez.

## 5. Öncelikli iyileştirme sırası

1. **Ölçüm güvenini düzelt:** gerçek tespit zamanı, kapanmış mum/vade politikası, iki bariyerli mum belirsizliği, brüt/net ayrımı. Eski sonuçları sessizce yeniden yazma; varsa düzeltme ayrı revizyon ve gerekçeyle tutulmalı.
2. **Sürüm ve veri izi ekle:** strateji sürümü, snapshot/rapor kimliği, kaynak veri zamanı ve olası maliyet varsayımları yeni kayıtlarda tutulmalı. Her yeni model kendi yayın etiketiyle kalmalı.
3. **Kaynak kapsamını tamamla:** BIST için KAP/finansal tablolar; makro için doğrudan yayımlar ve açıklama saatleri; kripto sembol eşlemesi ve yeterli seri. Aynı erişim boşluğunu her gün tekrar anlatmak yerine boşluğun sahibi ve çözüm durumu izlenmeli.
4. **Ölçülebilir olgu tahmini üret:** kesin açıklama saati, birim, dönem ve kaynaklı konsensüs bulunan olayları seç. Tahmin sayısı hedefi koyma; uygun olay yoksa kaçın. Forecast sonuçları teknik fiyat senaryolarından ayrı ölçülmeli.
5. **İleri dönem doğrulaması kur:** işlem maliyetli sonuçlar, aynı dönem kıyas ölçütü ve değiştirilmeyen kurallarla ilerleyen dönem testleri. Geçmişte en iyi çıkan eşiği yeni başarı iddiası olarak pazarlama.
6. **İçerik katkısını göster:** önceki güne göre ne değişti, yeni kanıt ne, karşı kanıt ne, hangi koşul bozuldu? Değerleme araçlarında varsayım ve finansal kaynak eksikliği görünür kalmalı; model yorumunun hesaplanmış adil değer olmadığı belirtilmeli.

Bu inceleme ölçüm/risk/değerleme formüllerini veya geçmiş sonuçları değiştirmedi. Öneriler ayrı uygulama kapsamıdır.

## 6. GPT-6.1 Sol geçişinin gerçek sonucu

Otomasyonun adı ve talimatı GPT-6.1 Sol'a geçirildi; mevcut ACTIVE durumu, günlük saat kuralı ve bağlı sohbet korundu. Üretici model sabiti `gpt-6.1-sol`; prompt/çıktı sözleşmesi ve finansal formüller değiştirilmedi.

İlk deneme mevcut CLI 0.153.4 ile model desteklenmiyor hatası verdi. Proje bağımlılığı resmî `@openai/codex` 0.159.2 sürümüne güncellendi. Aynı modelle tekrar çalışma başarılı oldu: **30 Eylül 17:13 Türkiye saati**, 7 web araması, 6 kaynak, 5 olay, 0 sayısal forecast, 0 yön sinyali.

Yayın kimliği: `ed2e0909-cfcf-4ffc-a965-779a0f8fb7e5`. `/api/report` ve `/api/research` 200 yanıtladı; base, AI ve araştırma günlüğünün son çalışması aynı kimliği taşıyor. Rapor ve AI `current`, veri kesiti eşleşiyor. Ölçüm günlüğü hâlâ 0 forecast / 0 outcome. Yeni yayın sayısal tahmin başarısı üretmiş gibi sunulamaz.

Tarihsel tablolar bu yayından **önceki denetim kesitidir**: dört Astra araştırması. Yeni Sol yayınıyla araştırma günlüğünde beş çalışma vardır. Yeni yayın tarihsel Astra başarısı sayılmadı. 33 test giriş noktalı `npm test`, CLI/model geçişinden sonra çıkış 0 ile tamamlandı. Başka modele geçilmedi veya kullanım sıfırlama kredisi tüketilmedi. Canlı site kod dağıtımı yapılmadı; araştırma verisi yetkilendirilmiş mevcut Supabase akışıyla yayınlandı.

## 7. Tekrarlanabilir kanıt

- `scripts/audit-research-history.js`: yalnız okuyan, Supabase rapor/geçmiş kayıtlarını sayfalayan denetim.
- `2026-09-30-evidence.json`: denetim kesiti, toplulaştırmalar, tahmin alanları ve incelenen metinler. Anahtarlar, kişisel notlar ve portföy kaydı yok.
- `2026-09-30-summary.json`: nicel özet.
- `2026-09-30-npm-test.txt`: değişiklik sonrası test kaydı.
- `2026-09-30-publication.json`: gerçek HTTP uçları, çalışma kimlikleri, model, kaynak/olay sayıları ve bütünlük sonucu.

Sınırlamalar: Ham fiyat kesitlerinin yalnız en sonuncusu saklanıyor; eski günlük history bütün intraday/OHLC girdilerini taşımaz. Uzak workflow logları, altı aylık dış arşiv ve gerçek emir defteri incelenmedi. Bu çalışma tüm finansal hesapların yeniden doğrulandığı veya her AI iddiasının doğruluk oranının ölçüldüğü iddiasını taşımaz.
