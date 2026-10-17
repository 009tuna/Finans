# Finans Otomasyonu

ABD hisseleri, BIST (BIST 30 dahil 101 hisse) ve seçili kripto paraları **gerçek teknik analiz** (RSI, MACD, Bollinger…) ile
takip eden, görsel bir panele döken, **her varlık için yatırım puanı + yorum** üreten ve her sabah
**CFO mantığıyla kapsamlı bir günlük rapor** (makro + haftalık katalizör takvimi + senaryo analizi)
hazırlayan kişisel sistem.

> ⚠️ **Yatırım tavsiyesi değildir.** Puanlar teknik göstergelerden üretilen otomatik tahminlerdir.

---

## Hızlı başlangıç
**`start-dashboard.bat`** → tarayıcıda panel açılır: **http://localhost:5174**
Veri yoksa **↻ Yenile**'ye basın.

## Rapor bütünlüğü ve yayın akışı

Rapor artık üretildiği fiyat verisine `snapshotId`, kendi çalışmasına `runId` ile bağlıdır. Eski veya farklı veri kesitine ait AI yorumu güncel sinyale katılmaz. Kaynağa erişilememesi ile kaynakta olay bulunmaması ayrı gösterilir. Ayrıntılar ve geçiş adımları: [8 Eylül geliştirme notu](docs/2026-09-08-report-integrity.md).

GitHub Actions hafta içi fiyatları ve tahmin sonuçlarını günceller, temel rapor taslağı hazırlar. Taslak son başarılı araştırma yayınını değiştirmez. Yerel `npm run research` akışı **GPT-6.1 Sol** ile kaynak araştırması ve genel yorum üretir; yeterli kanıt bulunan açıklama öncesi tahminleri kaydeder ve doğrulanan tam paketi Supabase'e yayınlar. Rapor ve araştırma günlüğü tek revizyon koşullu kayıtta birlikte yazılır. Fiyat yenilense de doğrulanmış araştırma, kendi analiz kesiti ve zamanıyla okunabilir; eski AI sinyali yeni fiyatlara uygulanmaz. Mevcut F/K ve piyasa değeri yorumlanabilir; DCF/Graham hesabı bu akışta modele verilmez. Ayrıntılar: [Yayın paketi](docs/research-audit/2026-09-30-report-publication-package.md), [Araştırma ve ölçüm](docs/research.md), [tarihsel içerik ve sonuç denetimi](docs/research-audit/2026-09-30-degerlendirme.md).

## Otomatik günlük akış
`daily-update.bat` veya `npm run research` aynı akışı çalıştırır:
1. Günün fiyat verisi yoksa yeniler; mevcut bulut güncellemesini tekrar kullanır.
2. Teknik tahminleri ve araştırma tahminlerinin mevcut sonuçlarını çözer.
3. Gerekiyorsa dondurulmuş fiyat kesitiyle eşleşen temel rapor taslağını üretir.
4. Sol ile canlı web araştırması ve koşullu senaryolar üretir.
5. Şema/zaman/kaynak kontrolünden sonra rapor, araştırma ve yeni tahminleri tek koşullu yazmada yayınlayıp doğrular. Hata olursa önceki yayın korunur.

Günlük Rapor ekranı fiyat, analiz ve araştırma zamanlarını ayrı gösterir. Günlük otomasyon ayrıntısı gerçek aşama kayıtlarına dayanır; aşama kaydı bulunmaması tamamlanmış çalışma anlamına gelmez.

Yerel Codex araştırması her gün 09:30 (Europe/Berlin) için zamanlanmıştır. Bilgisayar ve Codex erişilebilir olmalıdır. Elle çalıştırma: `npm run research`.

---

## Panel (sol menü)
- **Ana:** Genel bakış (AI piyasa görüşü, veri takvimi, piyasa adayları) · Günlük brif (bugün, piyasa görüşü, veri takvimi, gelişmeler, teknik adaylar; denetim ve kaynaklar "Ayrıntılar" altında) · Sinyaller (long/short sinyalleri, açık ve kapanan sanal işlemler, geçmiş testi)
- **Piyasalar:** ABD, BIST, Kripto — sıralanabilir liste ve varlık detayı
- **Araçlar:** Portföy, Teknik tarayıcı, Strateji testi, Projeksiyon, Rehber

## Veri takvimi ve AI analisti
Takvim Forex Factory haftalık akışı (beklenti, önceki) ve Nasdaq ekonomik takviminden (gerçekleşen, ileri günler) otomatik gelir; `/api/report?resource=calendar`. Türkiye verilerini (TCMB, TÜİK) ve her veri için beklenti üstü/altı senaryolarını (ABD / BIST / Kripto ayrı) günlük AI araştırması yazar (`routines/sol-research.md`, sol-research-v8).

## Long / short sinyalleri
`src/trend-signals.js` (trend-signals-v1): SMA50/SMA200 rejimi + 55 günlük kırılım veya trend içi geri çekilme; giriş ertesi açılış, stop 2×ATR, hedef 2R, en fazla 40 seans. Short ABD, kripto ve VİOP vadelisi olan BIST paylarında (`src/bist-universe.json`); diğer BIST paylarında azalt/çık uyarısı. Sanal işlem defteri her veri yenilemesinde ilerler. Geçmiş testi: `node scripts/backtest-trend-signals.js --save`.

## Teknik indikatörler (her varlık)
RSI(14), MACD(12,26,9), SMA 20/50/200, EMA 12/26, Bollinger (%B, genişlik), ATR, yıllık volatilite,
OBV, getiriler (1h/1a/3a/6a/1y), 52H bant konumu, altın/ölüm kesişimi.
→ **5 alt-skor** (Momentum / Trend / Hacim / Volatilite / Temel) → **kısa-vade ağırlıklı bileşik puan** (0–100)
→ etiket: GÜÇLÜ AL · AL · TUT · AZALT · SAT.

## Veri kaynakları (hepsi ücretsiz)
- **ABD:** Yahoo Finance (OHLC serisi) + Finnhub (analist, temel, **ekonomik & bilanço takvimi**, haber)
- **BIST:** Yahoo Finance
- **Kripto:** Binance (OHLCV) + CoinGecko (piyasa değeri/ATH)

## Takip listesi
`config.json` → `watchlists` (us / bist / crypto). Değiştir, kaydet, panelde **↻ Yenile**.

---

## Önemli dosyalar
```
src/indicators.js   teknik indikatör matematiği
src/analyze.js      skorlama + Türkçe yorum
src/fetch-all.js    veri toplama orkestrasyonu
src/report.js       günlük temel rapor + takvim
src/calendar.js     Finnhub ekonomik/bilanço takvimi + haber
routines/daily-report-prompt.md   AI rutin talimatı (CFO senaryo)
server.js           panel sunucusu + /api/report
public/             panel arayüzü (koyu tema + animasyonlar)
data/report/        base.json (deterministik) + ai.json (AI katmanı)
```

Gereksinim: **Node.js 22+**, `npm ci`, Supabase yapılandırması ve AI araştırması için oturum açılmış **Codex CLI**. Projeye özel CLI sürümü bağımlılıklarda sabitlenmiştir.
