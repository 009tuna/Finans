# Strateji karşılaştırması — sinyal motoru ne kadar mantıklı?

17 Ekim 2026 · `scripts/compare-strategies.js` · Ham sonuçlar komutla yeniden üretilebilir: `node scripts/compare-strategies.js --range 10y`

## Kısa cevap

Mevcut motorun **long kırılım** kısmı sağlam: üç piyasada, iki ayrı dönemde ve 5 ile 10 yıllık testte en iyi risk-getiri oranını veren kurulum bu. Motorun diğer iki parçası değer katmıyor:

- **Short sinyalleri** test edilen her piyasada ve her stratejide sonucu kötüleştirdi. 2018, 2020 ve 2022 düşüşleri dahil 10 yılda da bu değişmedi. Tek tek hisse ve coin'de short, düşüşü yakalasa bile toparlanmalarda daha çok kaybettiriyor.
- **Geri çekilme kurulumu** kırılımın kalitesini düşürüyor: işlem sayısını artırıyor, Sharpe'ı ve düşüş korumasını zayıflatıyor.

Öneri: kırılımı ana sinyal olarak tut; geri çekilmeyi işlem sinyali olmaktan çıkar; short'ları işlem önerisi yerine "uzak dur / çık" risk uyarısına çevir. Piyasa genelinde 200 günlük trend filtresi, düşüşleri al-ve-tut'a göre kabaca yarıya indirdiği için portföy düzeyinde ayrı bir koruma katmanı olarak eklenmeli.

## Yöntem

- **Veri:** Yahoo Finance günlük OHLC; ABD 12, BIST 100 hisse, kripto 21 varlık. Ana test 10 yıllık (Ekim 2017 – Ekim 2026), kontrol testi 5 yıllık. İlk 252 gün göstergelerin ısınmasına ayrıldı.
- **İşlem kuralı:** Pozisyon t günü kapanışında belirlenir, t → t+1 kapanış getirisini taşır. Önceden bilinmeyen bilgi kullanılmaz. Pozisyon her değiştiğinde tek yön maliyet düşülür: ABD %0,05, BIST %0,2, kripto %0,1 (`src/costs.js`).
- **Portföy:** Her piyasada varlıkların strateji getirileri eşit ağırlıkla günlük ortalanır. Sonuç bir "sepet" ölçüsüdür; tek varlık seçimi değildir.
- **BIST'in para birimi:** TL bazlı getiri, yüksek enflasyon ve mevduat faizi yüzünden yanıltıcıdır. %40 nominal getiri, TL'de nakitte beklemekten kötü olabilir. Ana ölçü USD'dir (fiyat / USD-TRY). Vadeli işlemle short'ta TL faiz taşıması kur kaybını yaklaşık dengelediği için USD ölçüsü short için de makul bir yaklaşımdır. TL tablosu yalnız bilgi amaçlıdır.
- **Short izni:** ABD, kripto ve VİOP vadelisi olan 48 BIST payı. Diğer BIST paylarında short sıfırlanır.
- **Parametreler:** Literatürdeki standart değerler kullanıldı (200 gün, 12 ay, 55/20 gün, RSI(2) < 10). Bu veri üzerinde ayar yapılmadı. Aynı kurallar iki yarı döneme ayrı ayrı uygulandı. Sonuçların iki dönemde de tutarlı olması, aşırı uyum riskine karşı temel kontrol.
- **Mevcut motor (v1):** Gerçek motor girişi ertesi açılışta yapar, stop/hedefte gün içinde çıkar. Bu karşılaştırmada kapanıştan kapanışa yaklaşıklanmıştır.

## Test edilen stratejiler

| Strateji | Kural | Literatürdeki karşılığı |
|---|---|---|
| Al ve tut | Hep pozisyonda | Kıyas |
| Trend 200g | Kapanış 200 günlük ortalamanın üstündeyse long (long/short sürümünde altındaysa short) | Hareketli ortalama zamanlaması — Brock, Lakonishok, LeBaron (1992); Faber (2007) |
| Momentum 12 ay | Son 252 günün getirisi pozitifse long (negatifse short) | Zaman serisi momentumu — Moskowitz, Ooi, Pedersen (2012) |
| Donchian 55/20 | 55 günlük zirve kırılımında gir, 20 günlük dip kırılımında çık; filtreli sürümde 200 günlük trend yönünde | Kanal kırılımı / "Turtle" kuralları |
| RSI(2) geri dönüş | 200 günlük trend üstünde RSI(2) < 10 ise al, 5 günlük ortalama üstünde kapanınca çık | Kısa vadeli ortalamaya dönüş (Connors) |
| Kesitsel momentum | Her ay son 6 ayın (son ay hariç) en iyi %20'sini eşit ağırlıkla tut | Jegadeesh–Titman (1993) |
| Mevcut motor v1 | 55 günlük kırılım + trend içi geri çekilme, 2×ATR stop, 2R hedef | Bu projenin motoru |

## Sonuçlar (10 yıllık ana test; son sütun 5 yıllık kontrol testi)

Sharpe: yıllık getiri / oynaklık (risksiz faiz düşülmedi). "Piyasada kalma": sermayenin ortalama ne kadarının pozisyonda olduğu.

#### ABD (USD) — 12 varlık, 2017-10-18 → 2026-10-15

| Strateji | Yıllık getiri | Oynaklık | Sharpe | En büyük düşüş | Piyasada kalma | Sharpe 1. yarı | Sharpe 2. yarı | Sharpe (5 yıllık test) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Al ve tut | 37,6% | 32,2% | 1,15 | 52,9% | 100,0% | 1,16 | 1,15 | 1,67 |
| Trend 200g (long) | 25,8% | 21,4% | 1,18 | 30,4% | 71,9% | 1,00 | 1,40 | 1,57 |
| Trend 200g (long/short) | 11,0% | 24,2% | 0,55 | 36,1% | 100,0% | 0,44 | 0,65 | 0,66 |
| Momentum 12 ay (long) | 28,7% | 23,8% | 1,18 | 32,7% | 77,6% | 1,11 | 1,26 | 1,53 |
| Momentum 12 ay (long/short) | 17,6% | 23,7% | 0,80 | 35,8% | 100,0% | 0,91 | 0,71 | 0,76 |
| Donchian 55/20 (long/short) | 3,6% | 20,8% | 0,27 | 32,5% | 64,7% | 0,29 | 0,26 | 0,32 |
| Donchian 55/20 + trend filtresi | 4,9% | 19,4% | 0,35 | 31,2% | 60,2% | 0,35 | 0,34 | 0,35 |
| RSI(2) geri dönüş (long) | 7,3% | 8,7% | 0,85 | 9,2% | 11,8% | 0,62 | 1,18 | 1,24 |
| Kesitsel momentum ilk %20 (long) | 57,1% | 47,4% | 1,19 | 63,5% | 100,0% | 1,18 | 1,20 | 1,58 |
| Mevcut motor v1 (long/short) | 8,3% | 14,5% | 0,62 | 18,6% | 47,0% | 0,69 | 0,58 | 0,68 |
| Mevcut motor v1 (yalnız long) | 11,9% | 10,9% | 1,09 | 12,4% | 36,0% | 1,11 | 1,07 | 1,17 |
| v1 yalnız kırılım (long) | 7,4% | 6,0% | 1,23 | 5,7% | 13,3% | 1,14 | 1,32 | 1,41 |

#### BIST (USD bazında, ana ölçü) — 100 varlık, 2017-10-05 → 2026-10-15

| Strateji | Yıllık getiri | Oynaklık | Sharpe | En büyük düşüş | Piyasada kalma | Sharpe 1. yarı | Sharpe 2. yarı | Sharpe (5 yıllık test) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Al ve tut | 7,1% | 31,2% | 0,38 | 57,5% | 100,0% | 0,09 | 0,73 | 0,40 |
| Trend 200g (long) | 8,3% | 16,4% | 0,57 | 34,7% | 47,3% | 0,11 | 0,98 | 0,65 |
| Trend 200g (long/short) | 4,1% | 16,2% | 0,33 | 39,1% | 79,6% | 0,02 | 0,70 | 0,41 |
| Momentum 12 ay (long) | 9,5% | 18,7% | 0,58 | 32,9% | 52,7% | 0,27 | 0,84 | 0,66 |
| Momentum 12 ay (long/short) | 7,4% | 17,5% | 0,49 | 33,8% | 82,4% | 0,33 | 0,65 | 0,63 |
| Donchian 55/20 (long/short) | 7,1% | 13,0% | 0,59 | 31,7% | 50,7% | 0,31 | 0,95 | 0,59 |
| Donchian 55/20 + trend filtresi | 7,0% | 12,4% | 0,60 | 32,5% | 46,3% | 0,24 | 1,08 | 0,73 |
| RSI(2) geri dönüş (long) | -4,7% | 7,7% | -0,58 | 36,1% | 9,4% | -0,78 | -0,44 | -0,44 |
| Kesitsel momentum ilk %20 (long) | 13,6% | 33,6% | 0,55 | 59,9% | 100,0% | 0,36 | 0,78 | 0,43 |
| Mevcut motor v1 (long/short) | 5,5% | 8,1% | 0,71 | 17,1% | 32,1% | 0,26 | 1,34 | 0,96 |
| Mevcut motor v1 (yalnız long) | 7,0% | 6,3% | 1,11 | 12,8% | 18,5% | 0,45 | 1,67 | 1,29 |
| v1 yalnız kırılım (long) | 5,1% | 2,9% | 1,70 | 3,8% | 6,1% | 1,20 | 2,09 | 1,89 |

#### BIST (TL bazında, yalnız bilgi) — 100 varlık, 2017-10-05 → 2026-10-15

| Strateji | Yıllık getiri | Oynaklık | Sharpe | En büyük düşüş | Piyasada kalma | Sharpe 1. yarı | Sharpe 2. yarı | Sharpe (5 yıllık test) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Al ve tut | 43,2% | 25,7% | 1,53 | 35,0% | 100,0% | 1,32 | 1,72 | 1,29 |
| Trend 200g (long) | 35,7% | 18,7% | 1,73 | 27,2% | 65,1% | 1,35 | 2,05 | 1,57 |
| Trend 200g (long/short) | 28,4% | 16,9% | 1,57 | 27,0% | 85,5% | 1,12 | 1,93 | 1,42 |
| Momentum 12 ay (long) | 40,8% | 20,4% | 1,78 | 28,0% | 71,7% | 1,52 | 2,01 | 1,56 |
| Momentum 12 ay (long/short) | 37,1% | 18,8% | 1,78 | 28,0% | 88,5% | 1,53 | 2,00 | 1,55 |
| Donchian 55/20 (long/short) | 17,9% | 12,3% | 1,40 | 28,9% | 54,0% | 0,93 | 1,84 | 1,33 |
| Donchian 55/20 + trend filtresi | 19,2% | 12,0% | 1,53 | 24,8% | 50,3% | 0,92 | 2,09 | 1,58 |
| RSI(2) geri dönüş (long) | -3,4% | 8,9% | -0,35 | 27,8% | 11,8% | -0,43 | -0,29 | -0,34 |
| Kesitsel momentum ilk %20 (long) | 51,7% | 28,7% | 1,60 | 52,1% | 100,0% | 1,50 | 1,69 | 1,24 |
| Mevcut motor v1 (long/short) | 16,6% | 8,1% | 1,94 | 12,4% | 36,4% | 1,22 | 2,55 | 1,99 |
| Mevcut motor v1 (yalnız long) | 19,6% | 8,2% | 2,23 | 12,3% | 28,5% | 1,58 | 2,76 | 2,24 |
| v1 yalnız kırılım (long) | 9,8% | 4,2% | 2,25 | 5,5% | 9,9% | 1,42 | 2,94 | 2,45 |

#### Kripto (USD) — 21 varlık, 2017-06-27 → 2026-10-16

| Strateji | Yıllık getiri | Oynaklık | Sharpe | En büyük düşüş | Piyasada kalma | Sharpe 1. yarı | Sharpe 2. yarı | Sharpe (5 yıllık test) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Al ve tut | 74,6% | 83,1% | 1,09 | 84,2% | 100,0% | 1,65 | 0,40 | 0,66 |
| Trend 200g (long) | 63,1% | 56,8% | 1,14 | 74,8% | 47,9% | 1,57 | 0,49 | 0,57 |
| Trend 200g (long/short) | 16,8% | 69,0% | 0,57 | 88,0% | 100,0% | 0,91 | 0,10 | -0,06 |
| Momentum 12 ay (long) | 70,8% | 60,5% | 1,19 | 78,5% | 55,2% | 1,61 | 0,51 | 0,63 |
| Momentum 12 ay (long/short) | 33,6% | 69,4% | 0,76 | 94,5% | 100,0% | 1,18 | 0,13 | -0,05 |
| Donchian 55/20 (long/short) | 53,2% | 56,8% | 1,03 | 65,1% | 63,3% | 1,44 | 0,50 | 0,43 |
| Donchian 55/20 + trend filtresi | 46,8% | 54,6% | 0,97 | 75,8% | 57,6% | 1,28 | 0,58 | 0,48 |
| RSI(2) geri dönüş (long) | 11,1% | 28,4% | 0,51 | 32,0% | 8,8% | 0,64 | 0,34 | 0,42 |
| Kesitsel momentum ilk %20 (long) | 50,6% | 95,1% | 0,91 | 89,1% | 100,0% | 1,16 | 0,60 | 0,86 |
| Mevcut motor v1 (long/short) | 26,1% | 40,2% | 0,77 | 48,4% | 40,2% | 1,16 | 0,27 | 0,07 |
| Mevcut motor v1 (yalnız long) | 33,9% | 31,0% | 1,09 | 35,3% | 18,8% | 1,46 | 0,50 | 0,56 |
| v1 yalnız kırılım (long) | 22,2% | 18,5% | 1,17 | 16,7% | 6,1% | 1,36 | 1,30 | 1,32 |

## Bulgular

1. **Long kırılım tutarlı biçimde en iyi risk-getiri oranını veriyor.** Sharpe ABD'de 1,23, BIST'te (USD) 1,70, kriptoda 1,17. En büyük düşüş %4–17 aralığında. İki yarı dönemde de pozitif; 5 yıllık testte de aynı tablo. Zayıf yanı düşük kullanım: sermayenin ancak %6–13'ü pozisyonda olduğu için mutlak getiri düşük kalıyor. Bu, sinyal kalitesinin değil pozisyon boyutlandırmanın sorusu.
2. **Short'lar her yerde zarar ettiriyor.** Aynı stratejinin long/short sürümü, long sürümünden her piyasada daha düşük Sharpe verdi (ör. ABD trend 200g: 1,18 → 0,55; kripto: 1,14 → 0,57). Mevcut motor da short'larla her piyasada kötüleşiyor. Literatürle uyumlu: zaman serisi momentumunun long/short başarısı tahvil, döviz ve emtia vadelilerinden oluşan çeşitlendirilmiş sepetlerden geliyor. Tek hisse short'ları ise toparlanmalarda sert kaybettiriyor ("momentum crashes", Daniel–Moskowitz).
3. **Geri çekilme kurulumu sinyali sulandırıyor.** Mevcut motorun long sürümünün Sharpe'ı, yalnız kırılım sürümünden her piyasada düşük; düşüşü de daha derin.
4. **Basit 200 günlük trend filtresi en iyi koruma aracı.** Getiriyi bir miktar azaltıyor, en büyük düşüşü ciddi kısaltıyor: ABD %53 → %30, BIST (USD) %58 → %35, kripto %84 → %75. Sharpe al-ve-tut ile aynı ya da daha iyi. Bu bir giriş sinyali değil; "bu piyasada / varlıkta kalınır mı" sorusunun cevabı.
5. **Donchian 55/20 ABD'de zayıf**, kriptoda iyi. Bizim kırılım kuralımızdan farkı, sabit hedef yerine trend bitene kadar pozisyonda kalması. Bu, kriptonun uzun trendlerinde işe yarıyor, ABD'nin dalgalı yükselişinde sık stop yiyor.
6. **RSI(2) ortalamaya dönüş:** ABD'de mütevazı ama tutarlı pozitif (Sharpe 0,85), BIST'te her dönemde zararda. BIST'te kısa vadeli düşüşten alım çalışmıyor. Literatürde BIST için bildirilen ters yönlü etkilerle birlikte düşünüldüğünde ayrı bir BIST kuralı gerekli.
7. **Kesitsel momentumun yüksek getirisine güvenilmemeli.** ABD'de 12 hisseden 2'si seçildiği için sonuç, bugün bilinen kazananların (NVDA, PLTR vb.) listede olmasından besleniyor; en büyük düşüş %60'ın üstünde.
8. **BIST TL tablosu yanıltır.** TL'de her şey iyi görünüyor (al ve tut yıllık %43). Aynı dönemde TL mevduatı da yüksek getiri verdi ve USD'de al-ve-tut yıllık %7'de kaldı. BIST kararları USD veya reel getiriyle ölçülmeli.

## Sınırlar

- **Hayatta kalanlar yanlılığı:** Liste bugünün takip listesi. 10 yıl önce bu hisseler bilinemezdi, endeksten çıkan veya batan şirketler de yok. Bu, özellikle al-ve-tut, momentum ve long sonuçlarını iyimser gösterir. Short sonuçlarını ise kötümser gösterebilir.
- **Temettü:** Yahoo kapanışları bölünmeye göre düzeltilmiş, temettüye göre değil. Long ve al-ve-tut biraz eksik ölçülüyor.
- **Nakit getirisi ve short maliyetleri modellenmedi:** USD nakit faizi, hisse ödünç maliyeti ve kripto fonlama oranı hesapta yok. Piyasada kalma oranı düşük stratejiler gerçekte nakit faizi de kazanır.
- **Eşit ağırlıklı sepet ölçüsü**, gerçek bir portföyün aynı anda kaç pozisyon taşıyabileceğini (sermaye kısıtı) modellemiyor.
- **Tek sınama:** Bu tablo bir kez üretildi ve hiçbir parametre buna göre seçilmedi. Bundan sonraki değişiklikler aynı veride tekrar tekrar denenirse aşırı uyum riski doğar (Bailey vd., "Probability of Backtest Overfitting").

## Öneri: sinyal motoru v2

1. **Ana işlem sinyali:** Trend yönünde 55 günlük kırılım (long). Kurallar değişmeden kalır.
2. **Geri çekilme:** İşlem sinyalinden çıkar; ekranda en fazla "izlemede" bilgisi olarak kalsın.
3. **Short:** İşlem önerisi olarak gösterilmez. Düşüş rejimindeki varlıklar "uzak dur / elindeysen çık" uyarısı olarak listelenir. Kanıt birikirse (canlı defter veya daha geniş bir vadeli sepeti) yeniden değerlendirilir.
4. **Koruma katmanı:** Her varlık ve piyasa için 200 günlük trend durumu "pozisyonda kalınabilir / nakitte bekle" olarak gösterilir. Bu, al-ve-tut yapan bir yatırımcı için en sade ve en kanıtlı risk kuralı.
5. **Pozisyon boyutu:** Kırılım sinyalinin düşük kullanımını telafi etmek için sabit risk (ör. işlem başına sermayenin %0,5–1'i; stop mesafesi 2×ATR) önerilir. Eşzamanlı işlem sayısı ve piyasa yoğunlaşması ayrıca sınırlandırılmalı.
6. **BIST'e özel:** Ölçüm USD bazında yapılır. Kısa vadeli dipten alım kuralları BIST'te kullanılmaz.

## Kaynaklar

- Brock, Lakonishok, LeBaron (1992), *Simple Technical Trading Rules and the Stochastic Properties of Stock Returns* — [Journal of Finance](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1992.tb04681.x)
- Moskowitz, Ooi, Pedersen (2012), *Time Series Momentum* — [AQR veri ve makale](https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Original-Paper-Data)
- Jegadeesh, Titman (1993/2001), hisse momentumu — [NBER w7159](https://www.nber.org/papers/w7159)
- Daniel, Moskowitz, *Momentum Crashes* — [AQR](https://www.aqr.com/insights/research/journal-article/momentum-crashes)
- Faber (2007), *A Quantitative Approach to Tactical Asset Allocation* — [SSRN 962461](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=962461)
- Ünal (2021), BIST'te kazanan/kaybeden portföyleri — [DergiPark](https://dergipark.org.tr/tr/pub/ijmeb/article/832584)
- Liu, Tsyvinski, kripto getirilerinde momentum — [NBER w24877](https://www.nber.org/papers/w24877)
- Bailey, Borwein, López de Prado, Zhu, *The Probability of Backtest Overfitting* — [PDF](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)
- Literatür taraması: [2026-10-14 strateji taraması](2026-10-14-strateji-taramasi.md)
