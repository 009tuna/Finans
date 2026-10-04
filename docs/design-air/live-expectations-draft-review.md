# Sabah beklentileri — canlı model kabul denemesi

4 Ekim 2026, İstanbul. `gpt-6.1-sol` ile canlı kaynak araştırmasına dayalı **manuel taslak** üretildi. Taslak yayınlanmadı, tahmin günlüğüne yazılmadı ve tamamlanmış otomasyon çalışması sayılmadı. Model çıktısı elle düzeltilmedi.

Analiz başlangıcı **3 Ekim 23:22:28 UTC**, model yanıtının tamamlanması **23:27:39 UTC**. Kullanılan fiyat kesiti **3 Ekim 07:24:26 UTC**; bu kesit güncel araştırmanın zamanı gibi gösterilmedi.

| 14 Ekim, 12:30 UTC açıklaması | Modelin bu incelemedeki sonucu |
| --- | --- |
| Eylül çekirdek CPI · aylık, SA | Önceden kilitli **%0,3** görüşü kaynaklı yeniden değerlendirmeyle korundu. İlk kayıt değişmedi. |
| Eylül çekirdek CPI · yıllık, NSA | Yeni model taslağı **%2,5**. Piyasa konsensüsü doğrulanmadığından konsensüs ve üstünde gerçekleşme olasılığı boş bırakıldı. |
| Eylül manşet CPI · aylık, SA | Sayısal görüşten kaçındı: enerji verisinin gerçek yayın saati doğrulanamadı. |
| Eylül manşet CPI · yıllık, NSA | Aynı enerji boşluğu ve bileşen hesabı eksikliği nedeniyle sayısal görüşten kaçındı. |

Takvim [BLS Ekim 2026 takviminde](https://www.bls.gov/schedule/2026/10_sched.htm) yeniden kontrol edildi. Sonraki NFP 6 Kasımda olduğu için 14 günlük gündemde bulunmuyor; açıklanmış Eylül NFP için yeni tahmin üretilmedi. Sonraki tarih [2 Ekim istihdam bülteninde](https://www.bls.gov/news.release/archives/empsit_10022026.htm) belirtiliyor.

Aylık çekirdek görüşün gerekçesi, barınma ve enerji dışı hizmetlerdeki devamlılık; sağlık ve araç sigortasındaki düşüşler karşı kanıt. Model son değeri taşımayı seçtiğini, üç açıklama ortalamasından neden farklı kaldığını yazdı. Bunlar modelin öznel tercihleri; ölçülmüş başarı veya güven yüzdesi değil. İlgili rakamlar [Ağustos CPI ilk açıklamasında](https://www.bls.gov/news.release/archives/cpi_09112026.htm) görülebiliyor.

Yeni yıllık çekirdek beklentisi, ağustos yıllık %2,4, bu incelemede korunan eylül aylık %0,3 ve önceki yılın eylül aylık %0,2 karşılaştırmasından türetildi. Önceki yılın değerini ve 08:30 Eastern yayın saatini [24 Ekim 2025 BLS arşivinde](https://www.bls.gov/news.release/archives/cpi_10242025.htm) ayrıca kontrol ettik. Taslaktaki `100 × (1.024 × 1.003 / 1.002 − 1)` işlemi **2,5022** veriyor; %2,5 yuvarlaması tutarlı. Bu, SA aylık oranlardan NSA yıllık orana geçerken iki yıldaki mevsimsel farkın yaklaşık aynı kaldığını varsayan model hesabı. Güncel mevsim katsayıları veya eylül bileşenleriyle doğrulanmış bir endeks hesabı değil; taslak bu sınırı açıkça yazıyor.

İlk canlı deneme, yayın saati bilinmeyen EIA girdisini manşet CPI tahmininin sayısal dayanağı yaptığı için reddedildi. Doğrulayıcı gevşetilmedi. Üretim talimatı, takvim dışındaki **her** sayısal tahmin kaynağının doğrulanmış tam yayın zamanına sahip olması gerektiğini açıklaştırdı. İkinci gerçek çağrı bu girdiyi belirsizliğiyle gösterdi ve manşet hedeflerde kaçınma kaydı üretti. EIA kaynağı bağlam veya kanıt boşluğu olarak görülebiliyor; sayısal tahmin kaynağına dönüşmüyor.

Şema, araştırma kuralları, dört beklenti hedefinin kapsamı ve rapor/fiyat kesiti eşleşmesi geçti. İki mevcut ilk tahmin değişmedi. Gerçek araştırma günlüğünün sürümü ve SHA-256 özeti üretim sonrasında tekrar okundu ve aynı kaldı. Yayın, kaynak yenileme, sonuç çözümleme ve veritabanı yazımı çağrılmadı. Ayrı salt okunur inceleme P1/P2 bulgu bulmadı.

- [Ham model taslağı](live-expectations-draft.json)
- [Kabul kontrolü](live-expectations-draft-validation.json)
- [Gerçek girdi kesiti](live-expectations-draft-input.json)
- [İlk reddedilen yanıt](live-expectations-draft-attempt-1-rejected.json)
- [İlk denemenin girdi kesiti](live-expectations-draft-attempt-1-input.json)
- [İlerleme kaydı](live-expectations-draft.log)

Bu deneme canlı modelin beklenti ve yeniden değerlendirme sözleşmesine uyabildiğini gösteriyor. Zamanlanmış otomasyonun sonraki çalışmasının başarılı yayınlandığını veya bu beklentinin isabetli olduğunu henüz göstermiyor.
