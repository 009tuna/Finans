# Görev: Varlık grafiğine RSI & MACD ayrı pano (toggle'lı)

> Bu dosya bağımsız bir görev tarifidir. Başka bir ajan (Antigravity/Codex) bu konuşmanın
> bağlamı olmadan uygulayabilsin diye yazıldı. Saf frontend işi, build adımı yok.

## Amaç
Varlık detay grafiğinde (lightweight-charts) **RSI** ve **MACD**'yi, fiyatın altında
**ayrı panolar** olarak çizilebilir hale getir; her biri **aç/kapa toggle**'ı ile.
Şu an RSI/MACD yalnızca **sayısal** gösteriliyor (çizilmiyor); SMA overlay + hacim panosu zaten var.

## Proje bağlamı (stack)
- Bağımlılıksız/az-bağımlı Node.js paneli; **build adımı yok** — `public/` doğrudan servis edilir.
- Grafik kütüphanesi: **lightweight-charts v5** (vendored: `public/vendor/lightweight-charts.standalone.production.js`; `package.json` → `lightweight-charts ^5.2.0`). Diğer grafikler Chart.js.
- Yerel çalıştırma: `node server.js` (port 5174) veya preview. Test: `npm test` (mevcut 11 test dosyası, bu iş için yeni test gerekmez ama mevcutları kırma).
- Windows + CRLF: dosyaları düzenlerken satır sonlarına dikkat.

## İlgili kod (hepsi `public/app.js` içinde)
- `drawAssetDeskChart(payload, asset)` — grafiği kuran ana fonksiyon. Şunları yapıyor:
  - `lw.createChart(container, {...})` ile chart oluşturur (`container = #assetChart`).
  - **Hacim panosu** deseni (ÖRNEK AL): `HistogramSeries`, `priceScaleId: 'volume'`,
    sonra `chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })`.
  - Ana seri (candle/line) + `addTradePriceLines` (giriş/stop/hedef çizgileri).
  - `assetDeskState.showSMA` ise SMA20/50 çizgilerini overlay ekler.
  - Sayısal panel: `#ind-rsi-val`, `#ind-macd-val`, `#ind-sma20-val`, `#ind-sma50-val` güncellenir.
- `addLwSeries(chart, name, options)` — v4/v5 fallback yardımcısı (`'LineSeries'`, `'HistogramSeries'`, `'CandlestickSeries'`). **Pano (paneIndex) DESTEKLEMİYOR** — v5 pano için genişletilmesi gerek.
- `calculateRSI(closes, period=14)` → **yalnızca SON değeri** döndürür (skaler).
- `calculateMACD(closes, 12,26,9)` → `{ macd, signal, histogram }` **son değer** (skaler).
- `calculateEMA(closes, period)` → tüm seri (dizi). `calculateSMA(bars, period)` → `[{time,value}]`.
- `assetDeskState` — grafik durumu: `{ market, symbol, interval, mode, showSMA, ... }`.
- `updateSmaButtonVisual()` + `#deskSmaToggleBtn` — SMA toggle görseli; tıklama olayı
  `assetDeskState.showSMA`'yı çevirip grafiği yeniden çiziyor. **RSI/MACD toggle'ları bunu taklit etmeli.**
- `index.html` — chart desk kontrolleri (interval/mod/SMA toggle) pazar görünümünde (`#view-market`);
  SMA toggle butonu `#deskSmaToggleBtn`. RSI/MACD toggle butonlarını **bunun yanına** ekle.

## Yapılacaklar

### 1) Seri üreten indikatör fonksiyonları (yeni)
Mevcut `calculateRSI`/`calculateMACD` yalnızca son değeri veriyor. Çizim için **tüm seri** gerekli:
- `calculateRSISeries(bars, period=14)` → `[{ time, value }]` (Wilder RSI, her bar için).
- `calculateMACDSeries(bars, 12,26,9)` → `{ macdLine:[{time,value}], signalLine:[{time,value}], hist:[{time,value,color}] }`.
  - `calculateEMA` zaten var; MACD = EMA12−EMA26, signal = EMA9(MACD), hist = MACD−signal.
  - Histogram renk: `value >= 0 ? '#28d793' : '#ef4444'`.
- `time` değerleri ana `bars[i].time` ile birebir hizalı olmalı (lightweight-charts zaman ekseni paylaşımı için).

### 2) Toggle state + butonlar
- `assetDeskState`'e `showRSI: false`, `showMACD: false` ekle.
- `index.html`'de `#deskSmaToggleBtn` yanına `#deskRsiToggleBtn` ve `#deskMacdToggleBtn` ekle (aynı stil).
- SMA toggle olay dinleyicisinin yanına RSI/MACD için aynısını ekle: tıklayınca ilgili flag'i çevir,
  `updateXButtonVisual()` çağır, `drawAssetDeskChart(...)`'ı mevcut payload ile yeniden çağır (yeniden çiz).
  (Son payload'u sakla — `assetDeskState.lastPayload` gibi — ya da `renderAssetDesk`'i yeniden çağır.)

### 3) Çizim (lightweight-charts v5 panosu) — `drawAssetDeskChart` içinde
**Önerilen yol — v5 multi-pane API** (temiz, ayrı pano):
- v5'te seriyi belirli panoya koymak için `chart.addSeries(SeriesType, options, paneIndex)` kullanılır
  (ya da `series.moveToPane(idx)`). `addLwSeries`'i opsiyonel `paneIndex` alacak şekilde genişlet.
- `assetDeskState.showRSI` ise: pane 1'e RSI `LineSeries` (`calculateRSISeries`) +
  30 ve 70 seviyelerine yatay referans çizgileri (`createPriceLine({ price:70, ... })` RSI serisinde,
  ya da iki ince LineSeries). RSI ekseni 0–100 sabit: `priceScale.applyOptions({ autoScale:false })` +
  uygun min/max (v5: `series.priceScale().applyOptions({ ... })`).
- `assetDeskState.showMACD` ise: ayrı panoya MACD `HistogramSeries` (hist, renkli) + macd/signal
  `LineSeries` (ör. `#4382ff` / `#ff9f43`).
- Panolar açıldıkça grafik yüksekliği bölünür; pano yükseklikleri makul olsun (örn. fiyat %55, alt panolar bölüşür).

**Alternatif yol — v4-uyumlu (ayrı priceScaleId + scaleMargins bandı, hacim deseni gibi):**
- RSI'yi `priceScaleId:'rsi'` ile alt banda koy: `scaleMargins: { top: 0.80, bottom: 0.10 }`.
- Aynı anda hacim + RSI + MACD bantları ÜST ÜSTE binerse kalabalıklaşır → ya **mutually exclusive**
  (alt bant seçici: Hacim / RSI / MACD), ya da scaleMargins'leri dikkatle ayır. v5 panosu daha temiz; mümkünse onu seç.

### 4) Sayısal panel uyumu
Mevcut `#ind-rsi-val` / `#ind-macd-val` güncellemeleri **kalsın** (çizim açık değilken bile değer görünür).
Toggle açıkken hem çizgi hem sayı görünür.

## Kabul kriterleri
- [ ] Grafik desk'inde **RSI** ve **MACD** için ayrı aç/kapa butonları var (SMA toggle gibi davranıyor).
- [ ] RSI açıkken: fiyatın altında 0–100 ölçekli ayrı panoda RSI çizgisi + 30/70 referans çizgileri.
- [ ] MACD açıkken: ayrı panoda renkli histogram + MACD/Signal çizgileri.
- [ ] Zaman ekseni ana grafikle hizalı; sembol/interval değişince doğru yeniden çiziliyor.
- [ ] Konsol hatası yok; `npm test` hâlâ 11/11 geçiyor.
- [ ] Mobil/dar ekranda grafik bozulmuyor (panolar makul yükseklikte).

## Kapsam dışı
- Backtest grafiği (Chart.js) — orada al/sat marker'ları + Sharpe/Sortino ZATEN var, dokunma.
- Yeni indikatör türleri (Bollinger/ADX panosu vb.) — sadece RSI + MACD.

## Doğrulama ipucu
Yerelde `node server.js` (veya preview), bir pazar (ABD/BIST/Kripto) sekmesinde bir satıra tıkla →
grafik desk açılır; RSI/MACD toggle'larını dene. `assetDeskState` global; tarayıcı konsolundan
durum incelenebilir.
