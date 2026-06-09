# Görev: Öğrenme Döngüsü — İsabet Karnesi, Kalibrasyon, Etkileşimli Okuryazarlık

> Bu dosya bağımsız bir görev tarifidir. Başka bir ajan (Antigravity/Codex) bu konuşmanın
> bağlamı olmadan uygulayabilsin diye yazıldı. İş bittiğinde ayrı bir ajan kod incelemesi yapacak;
> kabul kriterleri buna göre net yazıldı.

## Amaç (büyük resim)

Panel şu an her gün tahmin üretiyor (AL/SAT etiketleri, senaryolar) ama **hiçbir tahmin sonradan
notlanmıyor** — döngü kapanmıyor. Bu görev üç şeyi ekliyor:

1. **Faz 1 — İsabet karnesi:** Sistem sinyalleri otomatik tahmin olarak kaydedilsin, her gün
   çözülsün (hedef/stop/vade), panelde "sistemin isabeti" görünsün, haftalık rapora
   "geçen hafta ne dedik, ne oldu" retrosu girsin.
2. **Faz 2 — Kalibrasyon borçları:** Ajan günlüğünde 4 çalıştırmadır tekrarlanan iki skorlama
   düzeltmesi artık koda dönüşsün (tepe-riski düzeltmesi + snapshot zaman damgası).
3. **Faz 3 — Etkileşimli okuryazarlık:** Pozisyon hesaplayıcı aracı, günlük ipucu arşivi,
   güne bağlı quiz sorusu.

Fazlar **sıralı ve bağımsız commit'lenebilir** olmalı: Faz 1 bitmeden Faz 2'ye geçme.
Faz 4 (kâğıt portföy arenası) **kapsam dışı** bırakıldı — ayrı görev olacak.

## Proje bağlamı (stack)

- Bağımlılığı az Node.js paneli; **build adımı yok** — `public/` doğrudan servis edilir
  (vanilla JS, Chart.js + lightweight-charts vendored).
- Yerel: `node server.js` (port 5174). Bulut: Vercel serverless (`api/*.js`) + Supabase
  (`src/db.js` üzerinden `saveSnapshot`/`appendHistory`). Veri dosyaları `data/*.json`.
- Günlük akış iki yerde çalışıyor — **ikisine de dokunulacak**:
  - `daily-update.bat` (Windows Görev Zamanlayıcı, 09:00)
  - `.github/workflows/daily-refresh.yml` (GH Actions; data persist deseni neyse onu izle)
- Test: `npm test` → `package.json`'da zincirlenmiş **13 düz node test dosyası** (framework yok,
  `assert` ile). Yeni test dosyaları aynı desende yazılıp test script'ine **eklenmeli**.
- Windows + CRLF: satır sonlarına dikkat.
- **Tasarım kısıtları** (`DESIGN.md` + `PRODUCT.md` oku, uy): gradyan metin YOK, glassmorphism YOK,
  kartların solunda renkli şerit (side-strip border) YOK, dev neon sayılar YOK. Renk yalnızca
  durum bildirir. UI metinleri Türkçe.

## İlgili mevcut kod (önce oku)

| Dosya | Ne işe yarar |
|---|---|
| `src/decision-journal.js` | Journal API: `recordPrediction` (outcome:'open', horizonDays:30), `buildPredictionScorecard` (winRate hesaplar), `readJournalFile`/`writeJournalFile`. **Çözücü yok — bu görevde yazılacak.** |
| `data/journal.json` | `{notes:{}, alerts:[], predictions:[]}` — şu an boş |
| `api/journal.js` + `server.js:130` | GET/POST /api/journal (Vercel + yerel). **Sözleşmeyi bozma.** |
| `src/decision.js` → `buildTradePlan` | ATR planı: entry=fiyat, stop=fiyat−1.5×ATR, target=+2R. Snapshot'ta her varlıkta `asset.decision.tradePlan` olarak mevcut. |
| `src/analyze.js` | Skorlama. `labelFor`: ≥75 GÜÇLÜ AL, ≥60 AL, ≥45 TUT, ≥30 AZALT. Alt-skor fonksiyonları `reasons` dizileri döndürür: `['pos'|'neg'|'neutral', 'metin']`. |
| `src/indicators.js:283` | `pos52`: 52 haftalık bant konumu **0–1 arası** (0.93 = zirveye %93 yakın). `ind.macd.histogram` mevcut. |
| `src/fetch-all.js` → `runAll()` | Günlük veri toplama; sonunda `attachDecisionMetadata(snapshot, history, cfg)` + `saveSnapshot`. Sistem tahmin kaydı **buraya** eklenecek. |
| `src/backtest-engine.js:20-37` | Pazar→seri çekme deseni (AYNEN KOPYALA): us→`fetchYahooSeries(symbol)`, bist→`fetchYahooSeries(symbol+'.IS')`, crypto→`fetchBinanceSeries(symbol+'USDT')`. |
| `src/report.js` | `data/report/base.json` üretir (AI rutininin tek veri kaynağı). |
| `routines/daily-report-prompt.md` | AI rutin talimatı + `ai.json` şeması. Faz 1d ve 3c'de genişletilecek. |
| `public/app.js` (~3200 satır) | Tüm panel render'ı. `public/action-layer.js` deterministik/test-edilebilir UI yardımcıları — yeni saf UI mantığını oraya koy. |
| `test/decision-journal.test.js`, `test/ui-contract.test.js` | Mevcut sözleşme testleri — kırma, genişlet. |

---

## FAZ 1 — Tahmin döngüsü: kayıt → çözüm → karne → retro

### 1a) Sistem tahminlerinin otomatik kaydı

`src/fetch-all.js` içinde, `attachDecisionMetadata`'dan SONRA:

- Her varlık için: `analysis.score >= 70` (AL/GÜÇLÜ AL bölgesi) **ve** `decision.tradePlan.available`
  ise sistem tahmini kaydet.
- `recordPrediction`'a yeni alan: `source: 'system'` (mevcut çağrılar için varsayılan `'user'` —
  geriye uyumlu, mevcut test kırılmamalı).
- **Mükerrer engeli:** aynı `market:symbol` için zaten `outcome:'open'` bir tahmin varsa YENİ KAYIT AÇMA
  (mevcut id şeması `market:symbol:tarih` sadece aynı günü engelliyor; açık pozisyon kontrolü ekle).
- Alanlar: `entry/target/stop` = `decision.tradePlan`'dan; `score`, `label`; `horizonDays: 30`.
- Journal'ı `data/journal.json`'a `writeJournalFile` ile yaz (okuma→güncelleme→yazma; dosya yoksa boş başlar).

### 1b) Tahmin çözücü — `src/prediction-resolver.js` (yeni dosya)

İki katman:

**Saf fonksiyon (test edilebilir):**
```js
// resolveOne(prediction, series, now) -> güncellenmiş prediction (veya değişiklik yoksa aynısı)
// series: { dates:[], highs:[], lows:[], closes:[] } — createdAt SONRASI günler
```
Kurallar (gün gün, kronolojik):
- `high >= target` → `outcome:'target-hit'`
- `low <= stop` → `outcome:'stop-hit'`
- Aynı gün ikisi birden → **muhafazakâr davran: 'stop-hit'** (hangisinin önce olduğu bilinemez)
- `createdAt + horizonDays` geçti, ikisi de tetiklenmedi → son kapanış `> entry` ise
  `'expired-win'`, değilse `'expired-loss'`
- Çözülen tahmine yaz: `resolvedAt` (ISO), `closePrice` (tetik/vade günü fiyatı),
  `resultPct` (entry'ye göre % hareket, 1 ondalık).

**CLI sarmalayıcı:** `node src/prediction-resolver.js` → journal'ı okur, açık tahminlerin
serilerini çeker (backtest-engine'deki pazar deseniyle), çözer, journal'ı yazar, tek satır özet
loglar (`[resolver] 3 çözüldü: 2 hedef, 1 stop | 5 açık`). Seri çekilemeyen sembolü ATLA
(hata fırlatma, açık bırak, uyarı logla).

**Scorecard genişletmesi** (`buildPredictionScorecard`):
- `wins` tanımını genişlet: `'target-hit'` **veya** `'expired-win'`.
- Yeni alan: `bySource: { system: {total, closed, wins, winRate}, user: {...} }`.
- Yeni alan: `avgResultPct` (kapananların ortalama `resultPct`'i).
- Mevcut alan adlarını DEĞİŞTİRME (total/open/closed/wins/losses/winRate kalsın).

### 1c) Pipeline kancaları

- `daily-update.bat`: `[1/4] fetch` adımından hemen sonra `node src\prediction-resolver.js` satırı
  ekle (adım numaralarını güncelle).
- `.github/workflows/daily-refresh.yml`: fetch adımından sonra aynı komut. `data/journal.json`
  değişikliği, workflow'daki diğer data dosyaları nasıl persist ediliyorsa (commit/Supabase)
  aynı yoldan persist edilmeli — mevcut deseni incele ve izle.
- Sıra önemli: **önce çöz (dünün tahminleri), sonra fetch içinde yeni kayıt** açılırsa da kabul;
  ama aynı sembol için aynı gün hem çözülüp hem yeniden açılma durumu tutarlı çalışmalı.

### 1d) UI: İsabet karnesi + haftalık retro

- **Genel Bakış** sekmesine kompakt bir "İsabet Karnesi" bloğu (mevcut KPI dili/stiliyle, kart
  enflasyonu yaratmadan): sistem isabet oranı (kapanan işlemler), açık tahmin sayısı, ortalama
  sonuç %, son 5 kapanan tahmin listesi (sembol · sonuç etiketi · %hareket · tarih).
  Veri: `/api/journal` GET + `buildPredictionScorecard`. Hesap/biçimleme mantığını
  `public/action-layer.js`'e saf fonksiyon olarak koy (test edilebilir), `app.js` sadece render etsin.
- **Rapor beslemesi:** `src/report.js`, base.json'a `scorecard` (özet) + `resolvedLastWeek`
  (son 7 günde kapananlar) alanlarını eklesin.
- **AI şeması:** `routines/daily-report-prompt.md`'deki ai.json şemasına opsiyonel alan ekle:
  `"weeklyRetro": "2-3 cümle: geçen haftaki çağrılarımızdan ne tuttu ne tutmadı, ders"` —
  talimata "base.json'daki scorecard/resolvedLastWeek doluysa yaz, boşsa alanı atla" notu düş.
  Rapor sekmesi bu alanı (varsa) "Geçen hafta ne dedik?" başlığıyla göstersin.

### Faz 1 testleri (yeni: `test/prediction-resolver.test.js`)

- target-hit / stop-hit / aynı-gün-ikisi(→stop) / expired-win / expired-loss / hâlâ açık senaryoları
  sentetik serilerle.
- Scorecard: bySource ayrımı + genişletilmiş win tanımı.
- Mükerrer engeli: açık tahmin varken ikinci kayıt açılmıyor.
- `package.json` test zincirine ekle. `test/decision-journal.test.js` geçmeye devam etmeli.

---

## FAZ 2 — Kalibrasyon borçları (ajan günlüğünden, 4 kez tekrarlandı)

### 2a) Tepe-riski düzeltmesi (`src/analyze.js`)

AAPL paradoksu: skor 71-AL ama 52H zirvesinin %93'ünde ve MACD negatif. Kural:

- Bileşik skor hesaplandıktan sonra, `labelFor` çağrılmadan ÖNCE:
  `score >= 70 && ind.pos52 != null && ind.pos52 >= 0.9 && ind.macd && ind.macd.histogram < 0`
  → skordan **8 puan düş** (clamp 0–100) ve reasons'a ekle:
  `['neg', '52H zirvesine çok yakın + MACD negatif — tepe riski düzeltmesi (−8 puan)']`.
- Düzeltme etiketi değiştirebilir (71→63: GÜÇLÜ AL sınırından AL'a vb.) — beklenen davranış bu.
- Test: `test/analyze-regime.test.js`'e (veya yeni dosyaya) iki vaka — koşul sağlanınca −8 + gerekçe
  var; `pos52 = 0.85` iken düzeltme YOK.

### 2b) Snapshot zaman damgası (UI güveni)

Gözlem: TUPRS aynı gün 66(AL)→56(TUT) düştü; kullanıcı sabahki skoru güncel sanabiliyor.

- Her pazar sekmesinin (ABD/BIST/Kripto) tablo başlığı yakınına sade bir damga:
  `Skorlar HH:MM anlık görüntüsüne dayanır · gün içinde değişebilir`
  (kaynak: `snapshot.generatedAt`; varlık bazında `decision.freshness` zaten var, onu BOZMA).
- Skor değişimi zaten hesaplanıyor (`decision.confidence.scoreDelta`, action-layer kullanıyor):
  tabloda skorun yanında küçük ±delta göstergesi (önceki snapshot'a göre). Renk: mevcut
  pos/neg token'ları; sıfır/null ise hiçbir şey gösterme.

---

## FAZ 3 — Etkileşimli okuryazarlık

### 3a) Pozisyon hesaplayıcı (sadece istemci tarafı)

Okuryazarlık sekmesindeki "Risk Yönetimi" bölümünün öğüdünü araca çevir:

- Girdiler: sermaye (varsayılan 100.000), işlem başına risk % (varsayılan 2, 0.5–5 arası),
  sembol seçimi (mevcut snapshot'taki varlıklardan; seçilince fiyat+ATR otomatik dolar)
  VEYA elle fiyat+ATR girişi.
- Çıktılar: stop seviyesi (fiyat − 1.5×ATR), hedef (entry + 2R), adet
  (`risk tutarı / (1.5×ATR)`) ve pozisyon tutarı.
- **Formüller `src/decision.js buildTradePlan` ile birebir aynı olmalı** (1.5×ATR, 2R) —
  tutarsız iki "plan" üretme. Hesap fonksiyonunu `public/action-layer.js`'e koy → node testi yaz.
- Sunucu çağrısı yok; mevcut snapshot zaten app.js'te yüklü.

### 3b) literacyTip arşivi

Her günün `ai.json → literacyTip`'i ertesi gün kayboluyor; biriktir:

- Yeni script `scripts/archive-tip.js`: `data/report/ai.json` okur; `data/report/tips-archive.json`
  dizisine `{date, title, body}` ekler (aynı tarih varsa ekleme — idempotent).
- Kancalar: `daily-update.bat`'te AI adımından sonra + workflow'da aynısı (persist desenine uy).
- UI: Okuryazarlık sekmesi sonuna "Günün İpuçları Arşivi" bölümü — tarih + başlık listesi,
  tıklayınca gövde açılır (editorial stil, kart yığını değil). Veri: `/api/report` cevabına
  `tipsArchive` ekle (en basit yol; hem `server.js` hem Vercel `api/` tarafında).

### 3c) Günün sorusu (quiz)

- `routines/daily-report-prompt.md` ai.json şemasına alan ekle:
  ```json
  "quiz": {"question": "bugünün makro/teknik durumuna bağlı tek soru",
           "options": ["A", "B", "C"], "answerIndex": 0,
           "explanation": "2-3 cümle: neden + bugünkü olayla bağı"}
  ```
  Talimat notu: soru ezber bilgisi değil, o günün verisine bağlı çıkarım olmalı
  ("ECB artırdı → teoride ne olmalıydı, ne oldu" tarzı).
- Rapor sekmesinde render: soru + seçenekler; seçince doğru cevap + açıklama görünür,
  ikinci deneme yok. localStorage'da seri tut (`finans-quiz-streak`): doğru → +1, yanlış → 0;
  soru yanında sade "Seri: N" rozeti. Renk taşkınlığı yok (DESIGN.md).
- `ai.json`'da quiz alanı yoksa bölüm hiç görünmesin (geriye uyumlu).

---

## Kabul kriterleri (inceleyen ajan bunları kontrol edecek)

- [ ] `npm test` geçiyor: mevcut 13 dosya + yeni testler (resolver, hesaplayıcı, tepe-riski) zincire eklenmiş.
- [ ] `node src/prediction-resolver.js` boş journal'la hatasız çalışıyor (no-op + log).
- [ ] `node src/fetch-all.js` sonrası: skor ≥70 + tradePlan'lı varlıklar `data/journal.json`'da
      `source:'system'`, `outcome:'open'` kayıtları olarak var; ikinci çalıştırma mükerrer açmıyor.
- [ ] Sentetik testlerde 5 çözüm kuralı (target/stop/aynı-gün/expired-win/expired-loss) doğru.
- [ ] Genel Bakış'ta isabet karnesi bloğu; journal boşken kırılmıyor ("Henüz kapanan tahmin yok" durumu var).
- [ ] base.json'da `scorecard` + `resolvedLastWeek`; prompt şemasında `weeklyRetro` + `quiz`.
- [ ] AAPL-tipi vaka (skor≥70, pos52≥0.9, MACD hist<0) −8 puan yiyor ve gerekçesi varlık detayında görünüyor.
- [ ] Pazar sekmelerinde snapshot saat damgası + skor yanında ±delta.
- [ ] Pozisyon hesaplayıcı `buildTradePlan` ile aynı sonuçları veriyor (aynı girdiyle aynı stop/hedef/adet).
- [ ] `scripts/archive-tip.js` idempotent; arşiv UI'da listeleniyor.
- [ ] Quiz: cevap seçimi → açıklama + streak; quiz alanı yokken bölüm gizli.
- [ ] `daily-update.bat` ve `daily-refresh.yml` yeni adımları içeriyor; journal/arşiv persist
      mevcut data-persist deseniyle uyumlu.
- [ ] Konsol hatası yok; DESIGN.md anti-pattern'leri ihlal edilmemiş (gradyan metin, side-strip,
      glassmorphism, neon taşkınlığı yok).
- [ ] `/api/journal` GET/POST sözleşmesi değişmedi (yeni alanlar eklenebilir, mevcutlar kırılamaz).

## Kapsam dışı (yapma)

- Kâğıt portföy arenası ("sen vs sistem" oto-portföy) — ayrı görev.
- Kullanıcı tahmini giriş formu (journal'da `source:'user'` altyapısı yeter; UI'ı sonra).
- Backtest, forecast, grafik desk'i — dokunma.
- Supabase şema değişikliği — journal/arşiv ilk sürümde dosya tabanlı kalabilir; workflow
  persist'i mevcut desenle çözülüyorsa yeni tablo açma.
- `data/latest.json`'ı AI prompt'una sokmak (token şişkinliği — mevcut yasak devam).

## Doğrulama ipuçları

- Resolver'ı beklemeden test etmek için: `data/journal.json`'a elle `createdAt` birkaç gün geçmiş,
  hedefi dünkü fiyatın altında bir sahte tahmin koy → `node src/prediction-resolver.js` → çözülmeli.
- Panel: `node server.js` → http://localhost:5174 → Genel Bakış (karne), pazar sekmesi (damga+delta),
  Okuryazarlık (hesaplayıcı+arşiv), Rapor (retro+quiz).
- AI katmanını çalıştırmadan UI test etmek için `data/report/ai.json`'a elle `quiz`/`weeklyRetro`
  alanı eklenebilir.
