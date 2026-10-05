# Cumulative Learning Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sinyal adayları ve makro tahminlerden zamana uygun, değişmez eğitim örnekleri üretmek; sürümlü aday modelleri bağımsız test ve gölge karşılaştırmayla değerlendirmek.

**Architecture:** Karar/sonuç kanıtları mevcut Supabase `api_cache` CAS sözleşmesiyle ayrı anahtarlarda saklanır. Saf özellik, etiket, veri seti, kalibrasyon ve model değerlendirme modülleri; toplama/kalıcılık orchestration'ından ayrılır. Öğrenme raporu mevcut `/api/report?resource=learning` üzerinden okunur; eğitim veya aktif sürüm değiştirme halka açık API'den yapılamaz.

**Tech Stack:** Mevcut Node.js 22+, CommonJS, `node:crypto`, `node:assert/strict`, mevcut Supabase client ve saf browser modülleri. Yeni paket, servis veya tablo gerekmiyor.

**Spec:** `docs/research-audit/2026-10-04-cumulative-learning-architecture.md`; strateji araştırması: `docs/research-audit/2026-10-04-trade-strategy-literature-review.md`.

## Global Constraints

- İlk karar/plan ve karar anındaki kanıt değişmezdir; düzeltmeler yeni olay/sürüm olarak eklenir.
- Bu öneride 90/180 gün takvim günüdür; piyasa takvimindeki işlem günü sayısı ayrıca tutulur.
- NFP, CPI aylık ve CPI yıllık farklı hedeflerdir; ham hataları tek ortalamada birleştirilmez.
- Aynı olay için her gün yazılan yorumlar ek bağımsız eğitim/test sonucu sayılmaz.
- Eğitim yalnız kesit tarihinde gözlenmiş ve kanıtı tamamlanmış sonuçlardan oluşur.
- Aktif model eski tahminleri yeniden yazmaz.
- n=0 veya yetersiz kanıtta başarı yüzdesi üretilmesin.
- Portföy, manuel not, alarm ve mevcut araştırma defteri bu sistemin yazma hedefi değildir. Mevcut journal CAS korunur.
- DB okuma hatası boş koleksiyon değildir. Conflict retry en fazla üç; diğer hatalar başarısızlık olarak görünür.
- Fiyat tahmini başarısı, gerçekleşmiş işlem/net getiri veya kalibre olasılık olarak sunulmaz.
- Araştırma kodu öğrenmenin başarılı olduğunu varsaymaz; eski `learningRules` yeni model olarak aktive edilmez.

## Release Boundary

Bu paket bağımsız çalışır: yeni veri kesitlerini biriktirir, makro hata düzeltme adayları ve sayısal fiyat tahmini modelleri eğitir, gölge tahminleri dondurur ve sonuçlarını ölçer. Sanal işlem yürütme iyileştirmesi ayrı teslimdir: `docs/superpowers/specs/2026-10-04-structural-signals-paper-trades-design.md` araştırmadaki çıkış politikalarıyla güncellenip ayrıca uygulanmalıdır. Eski stop/hedef resolver'ın sonuçları yeni fiyat modelinin eğitim etiketi veya doğrulanmış ekonomik üstünlük kanıtı değildir. Bu paket mevcut AL/stop/hedef davranışına öğrenilmiş puan eklemez.

Fiyat modeli hedefi: doğrulanmış kapanıştan 90 veya 180 takvim günü sonrasındaki ilk doğrulanmış tamamlanmış seans kapanışına brüt fiyat değişimi. Bu bir fiyat tahmini görevidir; giriş/çıkış gerçekleşme iddiası yoktur. Benchmark varsa ayrı hedef/para birimi/fiyat temeliyle uyumlu fark ölçülür; benchmark yokluğu sıfır fark değildir.

## Review Focus

1. Aynı kimlikle farklı içerik, yinelenen aylık olay veya yinelenen günlük bar: ilk kayıt korunmalı; çatışma görünür olmalı. Task 1/3.
2. Yarım bar, quote-only fiyat, eksik takvim günü veya split/fiyat temeli değişimi: öğrenme kanıtı olarak sessiz kabul edilmemeli. Task 2/3.
3. Eğitim sonucunun test tahmini zamanından sonra öğrenilmiş olması: dataset bu kaydı dışlamalı; yalnız satır tarihi ayrımı yeterli değil. Task 4.
4. DB timeout/409 ve aynı anda çalıştırma: gerçek defter kaybı, çift eğitim veya yanlış başarı olmamalı. Task 1/7.
5. Seçilmiş modelin testine tekrar bakılması, yeni adayın yetersiz gölge sonucu veya model sürümü karışması: terfi ve performans iddiası engellenmeli. Task 5/6/8.

---

### Task 1: Immutable evidence and append-only learning store

**Files:** Create `src/learning-contract.js`, `src/learning-store.js`, `test/learning-store.test.js`.

**Interfaces:**
- `canonicalHash(value) -> string`: desteklenen JSON tipleri, sonlu sayılar, alfabetik object keys, dizi sırası korunur; SHA256.
- `validateLearningExample(example) -> example`: `schemaVersion=1`, `id`, `kind`, `cohort`, `createdAt`, `knowledgeCutoff`, `sourceObservedAt`, `featureSchemaVersion`, `features`, `evidenceHash`, `eligibility` alanları. Tüm feature isimleri önceden sürümlüdür; null eksik değerdir, 0 değildir.
- `appendLearningRecords({examples=[],labels=[],runs=[],modelEvents=[]}, database) -> summary`: hash'e göre immutable ayrı `learning:record:<hash>` kayıtlarını idempotent saklar. `learning:index:v1` yalnız aylık shard referanslarını taşır; kayıt referansları kind/cohort/UTC ayı/id-hash ilk iki hex karakteriyle ayrılmış shard'lardadır. Aynı shard 1.000 kayıt referansını aşarsa görünür kapasite hatası verir; kayıt atılmaz. Ham fiyat serisi veya kişisel veri index'e girmez.
- `readLearningRecords({asOf, kind, cohort}, database) -> {records, exclusions}`. Yerel çalışma/test için aynı arayüzde injectable memory/file store; üretimde cloud yetkilidir.

- [ ] **Step 1:** Tests: canonical ordering same hash; nonfinite/undefined/function rejection; same id same content no-op; same id different content non-retryable identity conflict; source time after cutoff rejected; unknown schema rejected; aylık shard ayrımı ve kapasite sınırı korunur.
- [ ] **Step 2:** `node test/learning-store.test.js` fails because modules do not exist.
- [ ] **Step 3:** Implement validation, immutable record insert, shard/catalog CAS with three retries and post-write verification. Interrupted record/shard/catalog writes can resume without duplicating records; no swallowed DB error. Depolama kapsamı tek büyük JSON defterine dönüşmez.
- [ ] **Step 4:** Run tests; injected concurrent index write preserves both batches; timeout/corrupt row never returns empty success.
- [ ] **Step 5:** Commit only Task 1 files: `feat: add immutable learning evidence store`.

### Task 2: Point-in-time feature capture for every price candidate

**Files:** Create `src/learning-features.js`, `test/learning-features.test.js`. Modify `src/fetch-all.js` only after pure module tests pass; integration itself belongs to Task 7.

**Interfaces:**
- `buildSignalExample({asset, sourceSeries, completion, marketRegime, createdAt, knowledgeCutoff}) -> {example,evidence}`.
- Consumes `completedYahooHistory`/`completedCryptoHistory` from `src/daily-history.js`; completion and source observations belong to the same provider/symbol/currency.
- Feature schema `price-features-v1`: completed-close `return21`, `return63`, `return126`, `atrPct`, `rsi14`, `distanceSma50Atr`, `distanceSma200Atr`. Recompute using completed history, never copy current quote-derived analysis. Optional regime stored separately; no unverified fundamental feature enters this version.
- Cohort includes market/symbol/provider/currency/price basis/feature schema. Reference close/bar date, candidate reason and existing strategy version are frozen; missing inputs yield an explicit ineligible record, not a fill or probability.

- [ ] **Step 1:** Tests: changing an unfinished candle or quote must not change the feature vector; confirmed closed history does; short/unaligned/NaN history ineligible; crypto USD view cannot replace Binance USDT features; candidate recorded regardless of current AL score.
- [ ] **Step 2:** `node test/learning-features.test.js` fails for missing function.
- [ ] **Step 3:** Implement finite feature extraction from source-completed observations with at least 220 usable bars; preserve input/evidence reference and exact feature missingness. Do not store portfolio notes or token/config fields.
- [ ] **Step 4:** Run new tests plus `node test/daily-history.test.js` and `node test/forecast-input-integrity.test.js`.
- [ ] **Step 5:** Commit pure module and tests: `feat: freeze completed-bar learning features`.

### Task 3: Evidence-gated delayed labels and typed macro examples

**Files:** Create `src/learning-labels.js`, `src/learning-macro.js`, `test/learning-labels.test.js`, `test/learning-macro.test.js`.

**Interfaces:**
- `resolvePriceLabel({example, observations, coverage, horizonDays, asOf}) -> {status,label|null,reasons}`. Horizon only 90 or 180 calendar days; market-local date, not fixed milliseconds. Label includes `targetDate`, effective/observed times, source evidence hashes, reference/terminal closes, gross return and price basis.
- `collectMacroExamples({macroPayload, asOf}) -> {examples,labels,exclusions}`. NFP system/model and four CPI metrics retain distinct method/metric/unit cohorts. First forecast and first-release outcome only; later reviews/revisions separate. Model-cited evidence and independently verified official evidence retain different grades; only verified chronological training grade enters fitting.

- [ ] **Step 1:** Tests: open horizon pending; missing first required session unresolved despite later price; DST/calendar horizon correct; late observation excluded at earlier asOf; split/price basis mismatch excluded; duplicate forecasts for one month not independent; CPI m/m and y/y not pooled; revision cannot replace first release.
- [ ] **Step 2:** Run both new tests and observe missing-module failures.
- [ ] **Step 3:** Implement conservative label resolution. Source gaps require explicit coverage/timetable evidence; no guessed holidays or synthetic closes. Macro normalization consumes existing validated family payloads and corroborating source proof, never raw journal lessons.
- [ ] **Step 4:** Run new tests plus `node test/macro-calibration.test.js`, `node test/cpi-store.test.js`, `node test/cpi-model-surface.test.js`.
- [ ] **Step 5:** Commit: `feat: add chronological learning labels and macro cohorts`.

### Task 4: Reproducible training partitions and exclusion accounting

**Files:** Create `src/learning-dataset.js`, `test/learning-dataset.test.js`.

**Interfaces:**
- `buildLearningDataset({examples,labels,cohort,asOf,splitDates}) -> {datasetId,train,validation,test,exclusions,coverage}`.
- `splitDates={validationStart,testStart}` explicit and chronological. Train labels must already be observed before validation prediction time; validation labels before test prediction time. Feature scaling learned only in train. Identical source event id is one observation per task/method; no missing label converted to loss.
- Dataset id hashes exact record IDs/labels/splits/feature schema/asOf. Test set consumed for final assessment is marked in the experiment record; later retuning creates a new candidate and does not reclassify that test as untouched.

- [ ] **Step 1:** Tests: random split rejected; 180-day overlapping labels purged; result observed after cutoff excluded even if its bar date is old; unknown units/currencies/features excluded; duplicate event id rejected; source/cost/model cohorts not pooled; empty dataset yields null metrics and reasons.
- [ ] **Step 2:** `node test/learning-dataset.test.js` fails for missing module.
- [ ] **Step 3:** Implement deterministic chronological partitions and dataset manifest. Coverage reports records and distinct decision dates/monthly events; correlated assets are not reported as independent sample count.
- [ ] **Step 4:** Run tests and compare identical inputs for identical dataset hash; input order must not affect it.
- [ ] **Step 5:** Commit: `feat: build leakage-resistant learning datasets`.

### Task 5: Small numerical models and honest forecast evaluation

**Files:** Create `src/learning-models.js`, `src/learning-evaluation.js`, `test/learning-models.test.js`, `test/learning-evaluation.test.js`.

**Interfaces:**
- `fitMacroBias({dataset}) -> {status,artifact|null}`: constant bias correction trained separately per method/metric/unit. Retains existing minimum 12 training/3 holdout events for candidate eligibility; these minimums do not authorize activation or calibrated confidence.
- `fitPriceRidge({dataset}) -> {status,artifact|null}`: standardized features; intercept; ridge penalty selected from `[1,10,100]` on validation MAE only, deterministic tie chooses larger penalty. Train-only means/std; constant features dropped. Operational minimum: train 120 records/20 dates, validation/test 30 records/10 dates each. These are fit guards, not independence or proof of advantage.
- `predictModel({artifact,example}) -> {estimate,status,reasons}`. Artifact freezes coefficients, feature schema, source/cohort/target, training/validation IDs and dataset hash. Output is a numeric target estimate, never a win probability or AL order.
- `evaluateForecasts({forecasts,labels,baselineForecasts,asOf}) -> metrics`: n, distinct event/date counts, MAE, median absolute error, signed bias, paired baseline differences; empty result null. A defined probability task may add Brier/log loss later; current technical score is not probability.

- [ ] **Step 1:** Tests: known synthetic bias recovered; chronology leak blocks fit; holdout shock not used for coefficients; ridge train-only scaler and constant feature behavior; deterministic penalty choice; mismatched features abstain; NaN/overflow rejected; negative estimates valid for signed NFP/returns; n=0 has null error and skill.
- [ ] **Step 2:** Run new tests and observe missing exports.
- [ ] **Step 3:** Implement tiny pure numerical fit/evaluation without adding dependencies. Baselines frozen for same cutoff/task: uncorrected macro method; zero-return price forecast. Benchmark price return is an economic comparison, not a known future forecasting baseline.
- [ ] **Step 4:** Run tests and an explicit adversarial synthetic regime shift: candidate must be allowed to lose to baseline; no forced improvement output.
- [ ] **Step 5:** Commit: `feat: train versioned learning candidates with baseline evaluation`.

### Task 6: Model registry, frozen shadow forecasts and promotion assessment

**Files:** Create `src/learning-registry.js`, `test/learning-registry.test.js`.

**Interfaces:**
- `registerCandidate({artifact,evaluation,policy,createdAt}) -> modelEvent`.
- `freezeShadowForecast({modelId,example,prediction,createdAt}) -> forecast`: one model/example/target id; same id cannot change estimate or cutoff.
- `assessPromotion({candidate,incumbent,pairedShadowResults,policy,asOf}) -> {status,reasons,evidence}`.
- `applyModelEvent({registry,event}) -> registry`: append-only status `candidate`, `shadow`, `active`, `retired`; `activationEffectiveAt` strictly before any forecast claiming the new active version. Historical model-specific predictions remain attached to their original model.

- [ ] **Step 1:** Tests: no shadow results blocks promotion; same event repeated does not raise n; bad baseline comparison/coverage/currency blocks promotion; final test reused for tuning blocks assessment; new model cannot alter old forecast; stale CAS events preserve concurrent candidate; rollback is new registry event.
- [ ] **Step 2:** `node test/learning-registry.test.js` fails for missing module.
- [ ] **Step 3:** Implement policy-hashed assessment. V1 default activation policy `shadow-only`: automatic collection/training/comparison, explicit `eligible_for_activation` only after enough independent chronological evidence and predeclared error/risk criteria. A future policy can permit automatic activation; it requires paired, dependence-aware uncertainty and a separate policy version. Operational fit minimum alone cannot pass this gate.
- [ ] **Step 4:** Run tests; verify that a great historical backtest with zero forward shadow observations cannot become active.
- [ ] **Step 5:** Commit: `feat: track learning candidates and shadow comparisons`.

### Task 7: Daily collection, scheduled research and read-only API

**Files:** Create `src/learning-pipeline.js`, `src/learning-api.js`, `scripts/refresh-learning.js`, `test/learning-pipeline.test.js`, `test/learning-api.test.js`. Modify `src/fetch-all.js`, `scripts/daily-research.js`, `.github/workflows/daily-refresh.yml`, `api/report.js`, `server.js`, `package.json`.

**Interfaces:**
- `captureLearningSnapshot({snapshot,sourceSeriesByKey,createdAt,database}) -> summary`: capture raw-source-derived examples before raw series leave runAll scope. Snapshot gets compact learning collection status, never false empty success.
- `refreshLearning({database,asOf,fetchHistory,train=false}) -> summary`: idempotently import independently verified macro records, resolve only matured price labels, evaluate shadow forecasts; train eligible candidate on request. Identical dataset/candidate hash does not refit duplicate run.
- `handleLearning({method}, {database,asOf}) -> {status,body}` GET-only. Projection exposes cohort counts, exclusions, candidate/active versions, recent paired metrics and freshness; no raw evidence/private journal/environment values.
- Scripts `learning:refresh` and `learning:train`; existing workflow calls refresh after outcomes. Training script is internal; no public mutation endpoint or new app reminder/automation.

- [ ] **Step 1:** Tests: LLM unavailable does not block data collection; manual refresh and daily pipeline idempotent; failed record write reported and preserves previous data; workflow retry does not double count; API 405 for mutation and 503 for failed read; local/Vercel report routing same response.
- [ ] **Step 2:** Run new tests; missing pipeline/API failures expected.
- [ ] **Step 3:** Wire injectable pipeline after source fetch/outcome stages using existing store contracts. Bir varlığın aynı tamamlanmış bar/özellik sürümü için ilk kesiti korunur; sonraki manuel yenileme ek bağımsız örnek yaratmaz. Geçmiş veri provider/asset başına turda bir kez çekilir, bekleyen etiketler birlikte çözülür. Monthly eligibility may suggest training, but fresh independent labels and a new dataset hash are necessary; clock/date alone cannot authorize a new model.
- [ ] **Step 4:** Run new tests plus `node test/report-pipeline.test.js`, `node test/db-write-integrity.test.js`, `node test/server-resource-routing.test.js`, `node test/daily-history.test.js`. Use fixtures only; do not run live fetch/train against the user's actual data during tests.
- [ ] **Step 5:** Commit: `feat: integrate daily learning capture and status API`.

### Task 8: Compact learning visibility and delivery verification

**Files:** Create `public/learning.js`, `test/learning-ui.test.js`. Modify only existing insights/report surface hooks in `public/insights.js`, `public/index.html`, `public/workspace.css`; add tests to `package.json`. Delivery note `docs/research-audit/2026-10-05-learning-foundation-delivery.md`.

**Interfaces:** Browser module renders GET learning projection; existing serious/moderate typography and collapsible detail. Overview: records accumulated, results matured, excluded/pending, current model, shadow candidate and paired difference. Separate cumulative/recent windows and price forecast/macro tasks; empty state “Öğrenme için doğrulanmış sonuç bekleniyor”.

- [ ] **Step 1:** Tests: n=0/null not 0% success; raw price return not labelled trade success; old wins do not imply model improvement; unsupported/failed data source not empty success; model in shadow visibly distinct from active; family units separate; date/provider/versions available in disclosure.
- [ ] **Step 2:** `node test/learning-ui.test.js` fails for missing surface.
- [ ] **Step 3:** Implement compact disclosure and actionable missing-evidence messages. Explanations about failure causes remain hypotheses until separately supported.
- [ ] **Step 4:** Run all new tests and `npm test`. Inspect local QA in desktop/mobile with temporary fixture DB; verify no training mutation from UI. Whole diff review focuses on leakage, CAS races, label definitions and unsupported performance claims. Fix defects, then rerun affected checks.
- [ ] **Step 5:** Record actual validation and limitations, commit only intended source/tests/docs, then perform the previously authorized Git/Vercel publication after release checks. Preserve user's uncommitted data. Verify installed deployment tooling/auth and target project before publishing; no new platform migration.

## Subsequent Independent Deliveries

1. Structural/trend entries and observed-open paper execution, common live/replay rules, real costs and portfolio accounting. Required before trained ranking is allowed to alter automatic trade acceptance or any net trading performance claim.
2. Dependence-aware forward evaluation and explicit automatic activation policy, risk limits and rollback; enough genuine matured outcomes required, never fabricated.
3. Event-conditioned price response models and richer point-in-time inputs only if they add out-of-sample value. Fundamental data, LLM memory retrieval and fine-tuning remain separate controlled experiments.

## Self-review and Execution Handoff

Plan covers the first independently testable release of the approved cumulative-learning architecture. Training safeguards, frozen evidence, delayed labels, macro metric separation, independent model comparison and transparent learning status have owning tasks and tests. Automatic trading and automatic model promotion remain explicit later deliveries rather than silently using unverified legacy outcomes. Exact numerical guard values above are operational defaults, not statistical profitability claims.

Recommended execution: **Native**, because data contracts and time boundaries cross most tasks and the same engineer can keep their invariants consistent. Execute tasks in this session with test-first cycles and whole-diff review. The written plan must be reviewed and execution method selected before product implementation under the applied skill workflow.
