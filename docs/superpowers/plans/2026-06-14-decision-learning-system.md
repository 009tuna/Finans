# Decision Learning System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a closed-loop decision learning system that records every system decision, resolves outcomes, classifies why calls worked or failed, and feeds bounded lessons back into reports and overlays without mutating technical scores.

**Architecture:** Extend the existing journal/prediction/overlay spine instead of creating a second memory system. Keep raw decisions append-only in `data/journal.json`, derive audits in deterministic Node modules, expose summaries through `src/report.js`, and render only compact Turkish surfaces in the dashboard.

**Tech Stack:** Node.js CommonJS, static browser JS, existing Supabase/file fallback pattern, `node/assert` tests, no build step.

---

## File Structure

- Modify: `src/decision-journal.js`
  - Normalize new append-only fields: `decisionAudits`, `learningRules`, `reviewQueue`.
  - Add helpers for appending audit rows and computing calibration by market, label, score bucket, catalyst type, and holding period.
- Create: `src/decision-auditor.js`
  - Deterministically converts resolved predictions into audit rows with attribution tags and learning candidates.
- Modify: `src/prediction-resolver.js`
  - After resolving predictions, call the auditor so resolved calls immediately produce audit evidence.
- Modify: `src/signal-overlay.js`
  - Add a bounded `learningCalibration` component based on closed audit evidence; never overwrite `analysis.score`, never exceed existing `MAX_ADJUSTMENT`.
- Modify: `src/report.js`
  - Add `decisionLearning` to `data/report/base.json`: scorecard, recent audit lessons, calibration warnings, and review queue.
- Modify: `routines/daily-report-prompt.md`
  - Instruct AI to write a Turkish `weeklyRetro` only from `decisionLearning` evidence and not invent explanations.
- Modify: `public/action-layer.js`
  - Add pure helpers for learning dashboard rows and review queue rows.
- Modify: `public/app.js`
  - Render a compact "Karar Hafızası" panel in Overview and a per-asset audit snippet in asset detail.
- Modify: `public/index.html`
  - Add `#decisionLearningPanel` container near the existing scorecard/cockpit area.
- Modify: `public/styles.css`
  - Add restrained styles; no side-strip accent, no neon, no gradient text.
- Create: `test/decision-auditor.test.js`
  - Unit tests for attribution, audit append idempotency, calibration buckets, and bounded learning rule output.
- Modify: `test/decision-journal.test.js`, `test/signal-overlay.test.js`, `test/action-layer.test.js`, `test/ui-contract.test.js`, `package.json`
  - Extend existing tests and include the new test file in `npm test`.

## Data Contract

Append these fields to the normalized journal. Existing fields must remain backward-compatible.

```js
{
  notes: {},
  alerts: [],
  predictions: [],
  theses: {},
  catalysts: [],
  riskRules: [],
  decisionAudits: [
    {
      id: 'bist:AKBNK:2026-06-12:audit',
      predictionId: 'bist:AKBNK:2026-06-12',
      market: 'bist',
      symbol: 'AKBNK',
      source: 'system',
      label: 'GUCLU AL',
      score: 87,
      scoreBucket: '80-100',
      entry: 72.15,
      target: 80.01,
      stop: 68.22,
      outcome: 'target-hit',
      resultPct: 10.9,
      createdAt: '2026-06-12T10:22:14.731Z',
      resolvedAt: '2026-06-20T20:59:59.000Z',
      holdingDays: 8,
      attributionTags: ['trend-follow-through', 'bank-momentum'],
      failureTags: [],
      lesson: 'BIST banka momentumu hedefe hızlı ulaştı; aynı koşulda stop mesafesi korunabilir.',
      confidence: 0.72
    }
  ],
  learningRules: [
    {
      id: 'bist:GUCLU_AL:80-100:bank-momentum',
      scope: { market: 'bist', label: 'GUCLU AL', scoreBucket: '80-100' },
      sampleSize: 7,
      winRate: 71,
      avgResultPct: 4.8,
      adjustment: 1,
      confidence: 0.66,
      reason: 'Son kapanan BIST güçlü al çağrıları pozitif kalibre oldu.',
      asOf: '2026-06-14T12:00:00.000Z',
      expiresAt: '2026-06-21T12:00:00.000Z'
    }
  ],
  reviewQueue: [
    {
      id: 'crypto:BTC:liquidity-review:2026-06-14',
      market: 'crypto',
      symbol: 'BTC',
      priority: 'high',
      reason: 'Kripto AL/AZALT çağrılarında düşük isabet ve makro likidite hassasiyeti var.',
      nextAction: 'BTC likidite filtresini ve vade varsayımını yeniden test et.',
      createdAt: '2026-06-14T12:00:00.000Z',
      status: 'open'
    }
  ]
}
```

## Task 1: Journal Schema Extension

**Files:**
- Modify: `src/decision-journal.js`
- Modify: `test/decision-journal.test.js`

- [ ] **Step 1: Add failing normalization test**

```js
const normalizedLearning = normalizeJournal({
  decisionAudits: [{ id: 'a1' }],
  learningRules: [{ id: 'r1' }],
  reviewQueue: [{ id: 'q1' }],
});
assert.equal(normalizedLearning.decisionAudits.length, 1);
assert.equal(normalizedLearning.learningRules.length, 1);
assert.equal(normalizedLearning.reviewQueue.length, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/decision-journal.test.js`

Expected: FAIL because the new arrays are not normalized yet.

- [ ] **Step 3: Extend `normalizeJournal`**

Add these keys to the returned object:

```js
decisionAudits: Array.isArray(input && input.decisionAudits) ? input.decisionAudits : [],
learningRules: Array.isArray(input && input.learningRules) ? input.learningRules : [],
reviewQueue: Array.isArray(input && input.reviewQueue) ? input.reviewQueue : [],
```

- [ ] **Step 4: Add append helper contract**

Export an `appendDecisionAudit(journal, audit)` helper that preserves append-only behavior and ignores duplicate `audit.id`.

```js
function appendDecisionAudit(journal, audit) {
  const j = cloneJournal(journal);
  if (!audit || !audit.id) return j;
  if (!j.decisionAudits.some((x) => x.id === audit.id)) {
    j.decisionAudits.push(audit);
  }
  return j;
}
```

- [ ] **Step 5: Verify**

Run: `node test/decision-journal.test.js`

Expected: PASS.

## Task 2: Decision Auditor Module

**Files:**
- Create: `src/decision-auditor.js`
- Create: `test/decision-auditor.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for resolved prediction auditing**

Test a resolved winner, a stop-hit loser, and an expired-loss. Assert stable `audit.id`, `scoreBucket`, `holdingDays`, attribution/failure tags, and Turkish lesson text.

```js
const { auditPrediction, buildLearningSummary } = require('../src/decision-auditor');

const audit = auditPrediction({
  id: 'bist:AKBNK:2026-06-12',
  market: 'bist',
  symbol: 'AKBNK',
  label: 'GUCLU AL',
  score: 87,
  entry: 72.15,
  target: 80.01,
  stop: 68.22,
  source: 'system',
  outcome: 'target-hit',
  resultPct: 10.9,
  createdAt: '2026-06-12T10:22:14.731Z',
  resolvedAt: '2026-06-20T20:59:59.000Z',
});

assert.equal(audit.id, 'bist:AKBNK:2026-06-12:audit');
assert.equal(audit.scoreBucket, '80-100');
assert.equal(audit.holdingDays, 8);
assert.ok(audit.attributionTags.includes('target-hit'));
assert.ok(audit.lesson.includes('hedef'));
```

- [ ] **Step 2: Implement score buckets and audit generation**

Rules:
- `0-29`, `30-44`, `45-59`, `60-69`, `70-79`, `80-100`.
- `target-hit` and `expired-win` are positive outcomes.
- `stop-hit` and `expired-loss` are negative outcomes.
- Include `holdingDays` from `createdAt` to `resolvedAt`.
- Lessons must be Turkish and evidence-bound; do not explain with unsupported macro narratives.

- [ ] **Step 3: Implement `buildLearningSummary(journal, nowIso)`**

Outputs:
- `calibrationByMarket`
- `calibrationByLabel`
- `calibrationByScoreBucket`
- `recentLessons`
- `learningRules`
- `reviewQueue`

Minimum evidence rule:
- Do not create a positive/negative learning rule with `sampleSize < 5`.
- Use `adjustment` only in `[-2, -1, 0, 1, 2]`.
- Confidence cannot exceed `0.75` for sample size below 10.

- [ ] **Step 4: Add test script**

Add `node test/decision-auditor.test.js` to `package.json` before `test/signal-overlay.test.js`.

- [ ] **Step 5: Verify**

Run: `node test/decision-auditor.test.js && npm test`

Expected: PASS.

## Task 3: Resolver-to-Auditor Hook

**Files:**
- Modify: `src/prediction-resolver.js`
- Modify: `test/prediction-resolver.test.js`

- [ ] **Step 1: Add test for audit creation after resolution**

Simulate an open prediction resolving to `target-hit`, then assert `decisionAudits` gets one row and a second resolver pass does not duplicate it.

- [ ] **Step 2: Update resolver main flow**

After `nextPred.outcome !== 'open'`, call:

```js
const { auditPrediction } = require('./decision-auditor');
const { appendDecisionAudit } = require('./decision-journal');
const audit = auditPrediction(nextPred);
Object.assign(journal, appendDecisionAudit(journal, audit));
```

Do not audit unresolved predictions.

- [ ] **Step 3: Verify no-op behavior**

Run: `node src/prediction-resolver.js`

Expected: It logs normally, does not crash when no predictions resolve, and does not rewrite duplicate audits.

## Task 4: Bounded Learning Overlay

**Files:**
- Modify: `src/signal-overlay.js`
- Modify: `test/signal-overlay.test.js`

- [ ] **Step 1: Add failing overlay test**

Create a journal with at least 5 closed system audits for one market/label bucket. Assert the matching asset gets one `learningCalibration` component.

```js
assert.ok(aapl.components.some((x) => x.type === 'learningCalibration'));
assert.ok(Math.abs(aapl.totalAdjustment) <= 8);
assert.equal(aapl.technicalScore, 71);
```

- [ ] **Step 2: Implement learning component**

Use `buildLearningSummary(journal, nowIso).learningRules`.

Matching hierarchy:
- exact `market + label + scoreBucket`
- fallback `market + scoreBucket`
- fallback `market`

Component shape:

```js
component(
  'learningCalibration',
  rule.adjustment,
  rule.reason,
  'journal:decisionAudits',
  nowIso,
  rule.confidence
)
```

- [ ] **Step 3: Keep guardrails**

Rules:
- Never produce direct `AL` or `SAT`.
- Never mutate `asset.analysis.score`.
- Keep total overlay impact inside existing `MAX_ADJUSTMENT`.
- Ignore expired learning rules.

- [ ] **Step 4: Verify**

Run: `node test/signal-overlay.test.js && npm test`

Expected: PASS.

## Task 5: Base Report Decision Learning Payload

**Files:**
- Modify: `src/report.js`
- Modify: `routines/daily-report-prompt.md`

- [ ] **Step 1: Add `decisionLearning` to base report**

After journal and scorecard are loaded, call:

```js
const { buildLearningSummary } = require('./decision-auditor');
const decisionLearning = buildLearningSummary(journal, generatedAt);
```

Attach:

```js
decisionLearning: {
  scorecard,
  calibrationByMarket,
  calibrationByLabel,
  calibrationByScoreBucket,
  recentLessons,
  learningRules,
  reviewQueue
}
```

- [ ] **Step 2: Update prompt**

Add instruction:

```md
If `base.decisionLearning.recentLessons` exists, write `weeklyRetro` in Turkish from those rows only.
Do not invent causes. Separate "ne tuttu", "ne tutmadı", and "hangi kural gözden geçirilmeli".
If evidence is thin, say "örneklem sınırlı" instead of overfitting.
```

- [ ] **Step 3: Verify JSON**

Run: `node src/report.js`

Expected: `data/report/base.json` contains `decisionLearning`; existing `signalOverlay` still exists.

## Task 6: Dashboard Surfaces

**Files:**
- Modify: `public/action-layer.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `test/action-layer.test.js`
- Modify: `test/ui-contract.test.js`

- [ ] **Step 1: Add pure helper tests**

Test `buildDecisionLearningPanel(reportBase)` returns:
- summary metrics
- top three lessons
- top review queue items
- empty state when no audits exist

- [ ] **Step 2: Add Overview container**

Insert near scorecard/cockpit:

```html
<section id="decisionLearningPanel"></section>
```

- [ ] **Step 3: Render "Karar Hafızası"**

Content:
- "Kapalı çağrı", "Sistem isabeti", "Ortalama sonuç", "İnceleme kuyruğu"
- last 3 lessons
- top 3 review items

No extra English labels. If empty: `Henüz kapanan karar yok; öğrenme katmanı örneklem bekliyor.`

- [ ] **Step 4: Asset detail snippet**

In asset detail, show the most relevant learning rule for that market/symbol if present:

`Bu skor aralığında geçmiş sistem çağrıları: %X isabet, ortalama sonuç %Y. Örneklem N.`

- [ ] **Step 5: Verify**

Run:

```powershell
node --check public/action-layer.js
node --check public/app.js
node test/action-layer.test.js
node test/ui-contract.test.js
npm test
```

Expected: PASS.

## Task 7: Operational Routine

**Files:**
- Modify only if needed: `daily-update.bat`, `.github/workflows/daily-refresh.yml`, automation prompt/memory files

- [ ] **Step 1: Confirm pipeline order**

Target order:

```powershell
node src/fetch-all.js
node src/prediction-resolver.js
node src/report.js
```

This is acceptable because existing duplicate-open protection prevents same-symbol spam. If we want "resolve before new entries", explicitly move resolver before fetch in a later migration, but do not mix both changes blindly.

- [ ] **Step 2: Persist only durable artifacts**

Persist:
- `data/journal.json`
- `data/report/base.json`
- `data/report/ai.json`
- `data/report/tips-archive.json`

Do not persist temporary audit support files.

- [ ] **Step 3: Verify automation**

Run the deterministic pipeline locally:

```powershell
node src/fetch-all.js
node src/prediction-resolver.js
node src/report.js
```

Expected: no crash; `decisionLearning` exists in `base.json`.

## Final Verification

- [ ] `node --check src/decision-auditor.js`
- [ ] `node --check src/decision-journal.js`
- [ ] `node --check src/prediction-resolver.js`
- [ ] `node --check src/signal-overlay.js`
- [ ] `node --check src/report.js`
- [ ] `node --check public/action-layer.js`
- [ ] `node --check public/app.js`
- [ ] `npm test`
- [ ] `node src/prediction-resolver.js`
- [ ] `node src/report.js`
- [ ] Headless DOM smoke confirms `Karar Hafızası` appears and Turkish text is intact.

## Product Guardrails

- This is a calibration layer, not a trading bot.
- Learning rules can adjust only overlay confidence/pressure, never the raw technical score.
- Sample size below 5 must produce review queue, not score adjustment.
- Every lesson must be traceable to resolved predictions or explicit journal data.
- Avoid false precision: no model weights beyond bounded `adjustment`.
- Keep UI Turkish.
- Do not call any output "ready" when source data or sample size is thin.
