# 🔒 Ajan Günlüğü — ÖZEL (kullanıcıya gösterilmez)

Bu dosya yalnızca analiz ajanının (Claude) çalışma hafızasıdır. Panelde HİÇBİR yerde sunulmaz
(server.js yalnızca /api/data, /api/history, /api/report uçlarını açar; bu klasör servis edilmez).
Amaç: günlük akışı zamanla iyileştirmek — kalibrasyon, veri kalitesi, takip listesi ve sistem notları.

---

## 2026-06-07 — Kuruluş notu (ilk gözlemler)
- Sistem mimarisi: ABD+BIST → Yahoo OHLC serisi, Finnhub → analist/temel; Kripto → Binance OHLCV + CoinGecko piyasa verisi.
- Skorlama kısa-vade ağırlıklı (Momentum 0.32–0.38, Trend, Hacim, Volatilite, Temel).
- Gözlem: Kripto geneli düşüş trendinde (BTC RSI ~20, tüm SMA'ların altında) → skorlar düşük kümeleniyor; bu doğru davranış (naif dip-alımı önleniyor).
- İzlenecek: BIST'te bazı semboller (TTKOM, EREGL) sürekli tepe puanlarda — veri/momentum mu, yoksa dar bant mı? Birkaç gün izle.
- Fikir: İleride "ortalamaya dönüş" sinyali eklenebilir (aşırı satım + dipten dönüş teyidi).
- Akış: Günlük rutin 09:05'te (veri 09:00'da tazelendikten sonra) çalışacak.

<!-- Yeni günlük notlar buranın altına eklenir -->

## 2026-06-08 — Günlük not

**Veri/skorlama anomalileri**
- Kripto blok aşırı satımda kümelendi (BTC RSI 20.4, ADA 15.8, AVAX 17). Makro ile birebir tutarlı: zirveden -%48, ETF çıkışları, MicroStrategy satışı. Skorlama doğru davranıyor (ort. 30, dip-alımı önleniyor). Veri hatası değil, gerçek.
- TTKOM yine tepe (73, dün de tepeydi) + %212 hacim. EREGL de üst sırada. 2. gün üst üste BIST telekomda yoğunlaşma — dar bant mı, gerçek momentum mu hâlâ net değil. Bir gün daha izle, sonra "tek sembol haftalardır tepe" durumunda bant-genişliği (Bollinger) filtresi düşün.
- AAPL skoru 71 ama 52H bandında %93 (tepeye yakın) ve MACD negatif — yüksek skor + tepe yakınlığı çelişkisi. ABD AI satışı bağlamında bu skor fazla iyimser görünüyor; momentum ağırlığı tepe bölgesinde cezalandırma eklenebilir mi?

**Takip listesi fikirleri**
- Petrol/enerji teması eksik. İran savaşı + Brent ~120$ ana makro tema; XOM/CVX (ABD) veya TUPRS (BIST) eklemek paneli güncel gündeme bağlar.
- Altın da satılıyor (risk-off'ta bile) — bir güvenli liman proxy'si (GLD?) eklemek ilginç sinyal verebilir.

**Kalibrasyon önerileri**
- "Yüksek skor + 52H bandında %90+" kombinasyonuna küçük bir düşüş düzeltmesi (tepe riski). AAPL örneği bunu motive ediyor.
- Aşırı satım listesi büyükse (bugün 9 coin) genel "risk-off rejimi" bayrağı üretip tüm yeni AL sinyallerini bir kademe yumuşatmak mantıklı olabilir.

**Yarın izle**
- ABD vadelileri: cuma satışı (Nasdaq -%4) devam mı, tepki alımı mı?
- Brent/Hürmüz haber akışı — enflasyon ve Fed söylemi için ana tetikleyici.
- BTC 60.000$ desteği tutuyor mu; kırılırsa kripto skorları daha da çöker.
- 16-17 Haziran Fed toplantısı yaklaşıyor; söylem sertleşirse risk varlıkları topluca baskılanır.

**Sistem akışı**
- Makro tema (savaş, petrol) ile teknik liste arasında doğrudan sembol köprüsü yok. Tematik bir eşleştirme (haber teması → ilgili semboller) eklemek raporu daha aksiyon alınabilir yapar.

## 2026-06-08 (2. çalıştırma) — Haftalık makro odak notu

**Veri/skorlama anomalileri**
- base.json hâlâ 06-07 tarihli (dataAsOf: ABD/BIST 06-05, kripto 06-07). Yani teknik skorlar 2 iş günü eski; hafta sonu boşluğu. Pazartesi (bugün) açılış sonrası veri tazelenince skorlar oynayabilir. ai.json'u güncel makro + Cuma satışı bağlamıyla yazdım.
- AAPL paradoksu sürüyor: skor 71 (AL) ama 52H %93 + MACD negatif. Cuma'nın çip satışı bağlamında bu skor fazla iyimser. "Yüksek skor + 52H %90+ + MACD negatif" üçlüsüne tepe-riski düzeltmesi tekrar gündemde — net kalibrasyon adayı.
- TTKOM 3. gün üst üste tepe (73) + %212 hacim. Artık "dar bant mı gerçek momentum mu" sorusu olgunlaştı; Bollinger bant-genişliği filtresini bir sonraki iterasyonda denemeye değer. Hacim patlaması gerçek ilgiye işaret ediyor olabilir, haber tara (TTKOM özelinde temettü/ihale haberi?).

**Takip listesi / tematik**
- Web araştırması net: ana makro tema çift başlı — (1) İran savaşı/enerji enflasyonu, (2) AI/çip balonu düzeltmesi (AVGO/MRVL/MU). Panelde her ikisinin de doğrudan proxy'si zayıf. Petrol için TUPRS (BIST) / XOM-CVX (ABD), çip teması için zaten NVDA/AVGO var.
- ECB'nin ARTIRIM yapması (indirim değil) önemli rejim sinyali: küresel faiz tekrar yukarı. Bu, kripto ve uzun vadeli tech için yapısal baskı. Watch listesini bu rejime göre defansif/değer ağırlıklı düşünmek mantıklı.

**Kalibrasyon önerileri**
- "Aşırı satım sayısı ≥ N" → risk-off bayrağı fikri hâlâ geçerli (bugün 9 coin). Bu bayrak aktifken AL eşiğini +5 puan yükseltmek (daha seçici olmak) test edilebilir.
- Calendar'da yüksek-etkili olay yoğunluğu (bu hafta 10-11 Haziran kümesi) bir "olay riski" skoru üretebilir; olay öncesi yeni sinyalleri otomatik yumuşatmak CFO mantığıyla uyumlu olur.

**Yarın/bu hafta izle**
- 10 Haziran ABD TÜFE (12:30 UTC) — haftanın tek belirleyici verisi. Beklenti YoY %4.2 (3.8'den yükseliş). Sıcak gelirse kripto+çip ikinci dalga satış.
- 11 Haziran üçlüsü: ECB (25bp artış kesin gibi, ton önemli) + TCMB (%37 sabit bekleniyor) + ABD ÜFE.
- BTC 60.000$ desteği — kırılım kripto skorlarını dipe çeker.
- 16-17 Haziran Fed (Warsh dönemi ilk toplantı) — sabit bekleniyor ama söylem; bu hafta veriler oraya zemin hazırlıyor.

**Sistem akışı**
- ai.json şeması weeklyOutlook ile zenginleşti; ancak events[].affected sembolleri ile teknik listedeki gerçek skorlar arasında otomatik tutarlılık kontrolü yok. İleride affected sembollerin güncel skorunu rapora otomatik iliştirmek (örn. "EREGL şu an 64") senaryoları somutlaştırır.
- base.json tazelik damgası ile ai.json generatedAt arasında gün farkı oluşabiliyor; rapor üstünde "teknik veri X tarihli, makro yorum Y tarihli" ayrımını UI'da göstermek kullanıcı güveni için iyi olur.

## 2026-06-08 (3. çalıştırma) — Pazartesi açılış + olay-yoğun hafta

**Veri/skor anomalileri**
- base.json tazelendi: generatedAt 06-08T07:13, ama dataAsOf hâlâ ABD 06-05 / BIST 06-08 / kripto 06-08. ABD teknik skorları Cuma kapanışı (çip satışı öncesi/sonrası belirsiz) — pazartesi ABD açılışı sonrası AAPL/NVDA skorları muhtemelen düşecek. ai.json'u bu beklentiyle yazdım.
- AAPL paradoksu ÜÇÜNCÜ kez: skor 71 (AL) ama 52H %93 + MACD negatif. Bu kombinasyon artık sistematik bir kalibrasyon borcu — "skor ≥70 VE 52H ≥%90 VE MACD<0" → -8 puan tepe-riski düzeltmesi uygulanmalı. Manuel olarak commentary'de uyardım ama skor hâlâ yanıltıcı AL veriyor.
- Aşırı satım listesi 6 coin (BTC/ETH/SOL/ADA/AVAX/DOT). risk-off bayrağı eşiği (≥5-6 coin) bugün tetiklenirdi. Hâlâ kodlanmadı; manuel olarak literacyTip + positioning'de işledim.

**Makro tutarlılık kontrolü (web vs base)**
- base.json TÜFE estimate YoY %4.2 — web teyit ediyor (Nisan %3.8 = 2023'ten beri zirve, enerji %17.9 sıçrama). Polymarket >%3.4 @ 53¢, SPF Q2 yıllıklandırılmış ~%6. %4.2 makul, yukarı sürpriz riski gerçek.
- ECB: base estimate %2.4/%2.25 = ARTIRIM. Web teyit (markets ~2 artırım fiyatlıyor, ateşkesle 3'ten 2'ye indi). Önemli rejim sinyali — küresel faiz yukarı, kripto/tech yapısal baskı.
- TCMB calendar'da saat 11:00 yazıyor ama Türkçe kaynaklar 14:00 diyor. Önemsiz ama veri kaynağı saat dilimi tutarsızlığı (UTC vs TR?) bayrak. base'i olduğu gibi bıraktım, tarih (06-11) doğru.
- Brent: önceki çalıştırmada "~120$/94$" demişim, bu hafta web ~104$ veriyor (ateşkes sonrası %13 düşüp tekrar yükseldi). Enerji teması canlı ama seviye revize.

**Takip listesi / tematik**
- Apple etkinliği BUGÜN (companyNews "Tim Cook's Legacy... tomorrow" — base 06-07 üretildiği için "tomorrow"=06-08). AAPL tek gerçek şirket katalizörü; bilanço yok. todayFocus'a koydum.
- Enerji proxy TUPRS güçlü momentum + skor 66 — paneldeki en temiz tematik eşleşme (enerji enflasyonu → rafineri marjı). EREGL'i Çin ticaret verisi senaryosuna bağladım ama panelde güncel skorunu görmedim (base opportunities'de yok), affected'a koymadan önce doğrulamak iyi olur.
- volumeSpike: META %179, AVGO %185, COIN %165 — üçü de Cuma çip/kripto satışıyla uyumlu (panik hacmi). AVGO çip teması, COIN kripto proxy. Bunları bir sonraki sürümde "haber teması → sembol" köprüsüne aday.

**Kalibrasyon önerileri (tekrar eden, kodlanmamış borçlar)**
1. Tepe-riski düzeltmesi (yukarıda, AAPL).
2. risk-off bayrağı (aşırı satım ≥N → AL eşiği +5).
3. Olay-riski skoru: 10-12 Haziran 4 high-impact ABD verisi kümesi; olay öncesi yeni sinyalleri yumuşat.
4. affected[] sembollerinin güncel skorunu rapora otomatik iliştir (senaryoları somutlaştırır).

**Yarın/bu hafta izle**
- 09 Haz 03:00 Çin dış ticaret — haftanın ilk öncü verisi, risk iştahı yön tayini.
- 10 Haz 12:30 ABD TÜFE — THE event. >%4.2 → BTC 60k testi + çip ikinci dalga.
- 11 Haz ECB (artırım+ton) + TCMB (%37 sabit) + ABD ÜFE üçlüsü.
- 12 Haz Michigan güveni + enflasyon beklentileri — stagflasyon teyidi.
- BTC 60.000$ / BIST 13.500 — iki kritik destek; kırılım = ilgili skorların dibe gitmesi.

**Sistem akışı**
- dataAsOf alanları market bazında farklı tazelikte; UI'da "ABD verisi Cuma kapanışı" damgası kullanıcı yanılgısını önler. Pazartesi sabahı ABD skorları 2 gün eski iken AL/SAT vermek riskli.
- Kalibrasyon borçları 3 çalıştırmadır tekrarlıyor ama kod tarafına geçmiyor — bunları tek bir "scoring-adjustments" config'e bağlamak (manuel commentary yerine) tutarlılık sağlar.

## 2026-06-08 (4. çalıştırma — günlük zamanlanmış görev) — Veri oynaklığı gözlemi

**Veri/skor anomalileri — ÖNEMLİ**
- Aynı gün içinde (3. çalıştırmadan ~birkaç saat sonra) yeniden fetch edildiğinde TUPRS skoru 66 (AL) → 56 (TUT) düştü; sentiment ortalaması ve genel görünüm de kaydı. Bu, günlük tek-snapshot yaklaşımının gün içi oynaklığa karşı kırılgan olduğunu somut biçimde gösteriyor — sabah 07:13 ile öğleye yakın saatler arasında "AL" sinyali "TUT"a dönüşebiliyor. Eğer kullanıcı sabah erken bakıp TUPRS'a pozisyon alırsa, birkaç saat sonra aynı sembol zayıflamış olabilir.
- Çıkarım: Rapor başlığına/ai.json'a "bu skor X saatinde alınan ana fotoğrafa dayanıyor, gün içi değişebilir" notu eklemek ya da günde 2 kez (açılış + öğle) fetch + delta gösterimi düşünülebilir. Şu an tek seferlik kalibrasyon notu olarak bırakıyorum.
- AAPL paradoksu (skor 71-AL ama 52H %93 + MACD negatif) DÖRDÜNCÜ kez aynen sürüyor — artık net bir kod değişikliği gerektiriyor, manuel uyarı yetersiz kalmaya başladı.

**Makro tutarlılık kontrolü (web vs base) — ek bulgular**
- TÜFE: SPF Q2 yıllıklandırılmış ~%6 ile takvim consensus'u %4.2 arasındaki farkı netleştirdim — bunlar farklı ölçüm pencereleri (yıllıklandırılmış çeyrek vs YoY aylık), raporda bu karışıklığı önlemek için "%4.2 YoY konsensüs, ancak SPF çeyreklik bazda daha sıcak bir tablo öngörüyor" şeklinde temkinli bağladım.
- TCMB: Web kaynakları (33 ekonomistten 27'si sabit, 6'sı +300bp) ile base.json'daki "prev: 37" tutarlı; medyan beklenti %37 sabit — net konsensüs var, calendar saat tutarsızlığı (11:00 vs gerçek 14:00) hâlâ duruyor ama önceki notta işaretlendi.
- Çin dış ticaret: Ocak-Şubat rekoru (213.6 mlr$) ile Mart'taki 4 yıllık dip arasındaki keskin dalgalanmayı gördüm — bu verinin "trend" olarak okunmaması, tek aylık snapshot olarak değerlendirilmesi gerektiğini events.reasoning'e yansıttım.

**Yarın/bu hafta izle**
- TUPRS skor trendini takip et — eğer düşüş devam ederse "güçlü momentum" sinyali ile skor arasındaki uyumsuzluk ayrı bir kalibrasyon maddesi olur.
- Gün-içi skor oynaklığı diğer sembollerde de var mı? Bir sonraki çalıştırmada aynı günün önceki snapshot'ıyla diff alıp kaç sembolün AL/TUT/SAT eşiğini geçtiğini saymak faydalı olur.
- BTC 60.000$ ve BIST destek seviyelerinin bu hafta nasıl test edildiğini gözlemle.

**Kalibrasyon önerileri (kümülatif, hâlâ kodlanmamış)**
1. Tepe-riski düzeltmesi (AAPL: skor≥70 + 52H≥%90 + MACD<0 → -8 puan) — 4. tekrar, artık öncelikli.
2. risk-off bayrağı (aşırı satım ≥5-6 coin → eşikleri yumuşat).
3. Gün-içi snapshot diff'i / "skor şu saatte alındı, değişebilir" uyarısı — bugünün TUPRS gözlemiyle netleşen yeni öncelik.
4. affected[] sembollerin güncel skorunu rapora otomatik iliştir.
