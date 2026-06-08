# 📈 Finans Otomasyonu

ABD hisseleri, BIST 20 ve seçili kripto paraları **gerçek teknik analiz** (RSI, MACD, Bollinger…) ile
takip eden, görsel bir panele döken, **her varlık için yatırım puanı + yorum** üreten ve her sabah
**CFO mantığıyla kapsamlı bir günlük rapor** (makro + haftalık katalizör takvimi + senaryo analizi)
hazırlayan kişisel sistem.

> ⚠️ **Yatırım tavsiyesi değildir.** Puanlar teknik göstergelerden üretilen otomatik tahminlerdir.

---

## 🚀 Hızlı Başlangıç
**`start-dashboard.bat`** → tarayıcıda panel açılır: **http://localhost:5174**
Veri yoksa **↻ Yenile**'ye basın.

## ⏰ Her Sabah 09:00 — Otomatik Günlük Akış
Windows Görev Zamanlayıcı'daki `FinansOtomasyonu` görevi `daily-update.bat`'i çalıştırır:
1. **Veri çek** — ABD+BIST+Kripto fiyat/indikatör
2. **Temel rapor** — teknik özet + bu haftanın takvimi (`node src/report.js`)
3. **Panel aç** — tarayıcıda gösterir
4. **AI katmanı** — `claude` (headless) web'de makro/haber/consensus araştırıp senaryo analizli raporu yazar

```powershell
schtasks /Run /TN "FinansOtomasyonu"   # şimdi elle çalıştır (test)
schtasks /Query /TN "FinansOtomasyonu" # durumu gör
```

---

## 📊 Panel Sekmeleri (sol menü)
- **Genel Bakış** — KPI'lar, öne çıkan fırsatlar, önerilen dağılım, en iyi 12 fırsat grafiği
- **ABD / BIST / Kripto** — her pazar için puan grafiği + sıralanabilir tablo. Satıra tıkla → tüm indikatörler + alt-skorlar + yorum + mini grafik
- **📰 Günlük Rapor** — duyarlılık, makro & dünya durumu, **bu haftanın veri/katalizör takvimi + CFO senaryo analizi** (düşük/yüksek gelirse), fırsatlar, teknik sinyaller, pazar yorumu, riskler
- **📚 Finansal Okuryazarlık** — indikatör rehberi, risk yönetimi, makro etkisi, sık hatalar

## 🧮 Teknik İndikatörler (her varlık)
RSI(14), MACD(12,26,9), SMA 20/50/200, EMA 12/26, Bollinger (%B, genişlik), ATR, yıllık volatilite,
OBV, getiriler (1h/1a/3a/6a/1y), 52H bant konumu, altın/ölüm kesişimi.
→ **5 alt-skor** (Momentum / Trend / Hacim / Volatilite / Temel) → **kısa-vade ağırlıklı bileşik puan** (0–100)
→ etiket: GÜÇLÜ AL · AL · TUT · AZALT · SAT.

## 🌐 Veri Kaynakları (hepsi ücretsiz)
- **ABD:** Yahoo Finance (OHLC serisi) + Finnhub (analist, temel, **ekonomik & bilanço takvimi**, haber)
- **BIST:** Yahoo Finance
- **Kripto:** Binance (OHLCV) + CoinGecko (piyasa değeri/ATH)

## 🔧 Takip Listesi
`config.json` → `watchlists` (us / bist / crypto). Değiştir, kaydet, panelde **↻ Yenile**.

---

## 📁 Önemli Dosyalar
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

Gereksinim: **Node.js** + **claude CLI** (AI raporu için). Ek npm paketi gerekmez.
