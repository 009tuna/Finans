# Decision Action Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard from a signal display into a decision workflow with daily change detection, portfolio actions, asset theses, report provenance, alert rules, and a prediction scorecard.

**Architecture:** Keep decision logic in small testable browser/Node UMD modules under `public/`, and keep persistence behind narrow JSON-backed API endpoints. `public/app.js` remains the renderer; pure logic lives in `public/action-layer.js` and persistent journal logic lives in `src/decision-journal.js`.

**Tech Stack:** Node.js CommonJS, static browser JS, existing `server.js` API routing, JSON files under `data/`, Chart.js/lightweight-charts only where already used, existing `node test/*.test.js` test style.

---

## File Structure

- Modify: `public/action-layer.js`
  - Pure calculations for daily digest, portfolio actions, asset thesis, report trust, alert rule suggestions, and scorecard summaries.
- Modify: `public/app.js`
  - Render decision workflow cards and bind journal/alert UI actions.
- Modify: `public/index.html`
  - Load `action-layer.js` and provide stable containers for new surfaces.
- Modify: `public/styles.css`
  - Style action cards, persistent notes, alert rules, and scorecard views.
- Create: `src/decision-journal.js`
  - JSON-backed persistence helpers for user thesis notes, alert rules, and prediction outcomes.
- Create: `api/journal.js`
  - Vercel/serverless endpoint for `GET` and `POST` journal state.
- Modify: `server.js`
  - Local API route for `/api/journal`.
- Create/Modify: `data/journal.json`
  - Local persisted journal state. Shape:

```json
{
  "notes": {
    "us:AAPL": {
      "thesis": "Alim tezi: fiyat 50g ustunde kalirsa izlenir.",
      "invalidation": "Stop altinda tez bozulur.",
      "updatedAt": "2026-06-08T20:00:00.000Z"
    }
  },
  "alerts": [
    {
      "id": "us:AAPL:stop:1717876800000",
      "market": "us",
      "symbol": "AAPL",
      "trigger": "AAPL stop $291 altina inerse",
      "action": "Pozisyonu azalt.",
      "enabled": true,
      "createdAt": "2026-06-08T20:00:00.000Z"
    }
  ],
  "predictions": [
    {
      "id": "us:AAPL:2026-06-08",
      "market": "us",
      "symbol": "AAPL",
      "label": "TUT",
      "score": 59,
      "entry": 301.54,
      "target": 321.91,
      "stop": 291.36,
      "createdAt": "2026-06-08T20:00:00.000Z",
      "horizonDays": 30,
      "resolvedAt": null,
      "outcome": "open"
    }
  ]
}
```

- Create: `test/decision-journal.test.js`
  - Unit tests for persistence normalization, note merge, alert upsert, and prediction scorecard.
- Modify: `test/action-layer.test.js`
  - Add scorecard summary tests once prediction outcomes exist.
- Modify: `package.json`
  - Include new tests in `npm test`.

---

## Current Baseline Already Implemented

- `public/action-layer.js` exists with pure functions:
  - `buildDailyChangeDigest`
  - `buildPortfolioActions`
  - `buildAssetThesis`
  - `buildReportTrust`
  - `buildAlertRules`
- `public/app.js` renders:
  - `Bugün Ne Değişti?`
  - `Portföy Aksiyon Planı`
  - `Rapor Güven İzi`
  - `Varlık Tezi`
  - `Alarm Kuralları`
- `test/action-layer.test.js` covers the current pure action layer.

The remaining work in this plan upgrades those surfaces from generated text into a usable workflow with persistence and feedback loops.

---

### Task 1: Persistent Decision Journal Core

**Files:**
- Create: `src/decision-journal.js`
- Create: `test/decision-journal.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Add this file:

```js
// Decision journal persistence tests.
'use strict';

const assert = require('assert');
const {
  normalizeJournal,
  upsertNote,
  upsertAlert,
  recordPrediction,
  buildPredictionScorecard,
} = require('../src/decision-journal.js');

const empty = normalizeJournal(null);
assert.deepEqual(empty.notes, {});
assert.deepEqual(empty.alerts, []);
assert.deepEqual(empty.predictions, []);

const withNote = upsertNote(empty, 'us', 'AAPL', {
  thesis: 'Trend devam ederse izlenir.',
  invalidation: 'Stop altinda tez bozulur.',
}, '2026-06-08T20:00:00.000Z');
assert.equal(withNote.notes['us:AAPL'].thesis, 'Trend devam ederse izlenir.');
assert.equal(withNote.notes['us:AAPL'].invalidation, 'Stop altinda tez bozulur.');

const withAlert = upsertAlert(withNote, {
  market: 'us',
  symbol: 'AAPL',
  trigger: 'AAPL stop $291 altina inerse',
  action: 'Pozisyonu azalt.',
}, '2026-06-08T20:01:00.000Z');
assert.equal(withAlert.alerts.length, 1);
assert.equal(withAlert.alerts[0].enabled, true);

const withPrediction = recordPrediction(withAlert, {
  market: 'us',
  symbol: 'AAPL',
  label: 'AL',
  score: 65,
  entry: 100,
  target: 110,
  stop: 95,
  horizonDays: 30,
}, '2026-06-08T20:02:00.000Z');
assert.equal(withPrediction.predictions.length, 1);
assert.equal(withPrediction.predictions[0].outcome, 'open');

const scorecard = buildPredictionScorecard({
  predictions: [
    { outcome: 'target-hit', label: 'AL' },
    { outcome: 'stop-hit', label: 'AL' },
    { outcome: 'open', label: 'TUT' },
  ],
});
assert.equal(scorecard.closed, 2);
assert.equal(scorecard.winRate, 50);
assert.equal(scorecard.open, 1);

console.log('decision journal tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/decision-journal.test.js
```

Expected:

```text
Error: Cannot find module '../src/decision-journal.js'
```

- [ ] **Step 3: Implement journal helpers**

Create `src/decision-journal.js`:

```js
'use strict';

function normalizeJournal(input) {
  return {
    notes: input && input.notes && typeof input.notes === 'object' ? input.notes : {},
    alerts: Array.isArray(input && input.alerts) ? input.alerts : [],
    predictions: Array.isArray(input && input.predictions) ? input.predictions : [],
  };
}

function keyOf(market, symbol) {
  return String(market || '').toLowerCase() + ':' + String(symbol || '').toUpperCase();
}

function cloneJournal(journal) {
  const j = normalizeJournal(journal);
  return JSON.parse(JSON.stringify(j));
}

function upsertNote(journal, market, symbol, note, nowIso) {
  const j = cloneJournal(journal);
  const key = keyOf(market, symbol);
  j.notes[key] = {
    thesis: String(note && note.thesis ? note.thesis : '').trim(),
    invalidation: String(note && note.invalidation ? note.invalidation : '').trim(),
    updatedAt: nowIso,
  };
  return j;
}

function alertId(alert) {
  return [String(alert.market || '').toLowerCase(), String(alert.symbol || '').toUpperCase(), String(alert.trigger || '').toLowerCase()].join(':');
}

function upsertAlert(journal, alert, nowIso) {
  const j = cloneJournal(journal);
  const next = {
    id: alert.id || alertId(alert),
    market: String(alert.market || '').toLowerCase(),
    symbol: String(alert.symbol || '').toUpperCase(),
    trigger: String(alert.trigger || '').trim(),
    action: String(alert.action || '').trim(),
    enabled: alert.enabled !== false,
    createdAt: alert.createdAt || nowIso,
  };
  const idx = j.alerts.findIndex((x) => x.id === next.id);
  if (idx >= 0) j.alerts[idx] = Object.assign({}, j.alerts[idx], next);
  else j.alerts.push(next);
  return j;
}

function recordPrediction(journal, prediction, nowIso) {
  const j = cloneJournal(journal);
  const id = prediction.id || [String(prediction.market || '').toLowerCase(), String(prediction.symbol || '').toUpperCase(), nowIso.slice(0, 10)].join(':');
  if (!j.predictions.some((x) => x.id === id)) {
    j.predictions.push({
      id,
      market: String(prediction.market || '').toLowerCase(),
      symbol: String(prediction.symbol || '').toUpperCase(),
      label: prediction.label || '',
      score: prediction.score,
      entry: prediction.entry,
      target: prediction.target,
      stop: prediction.stop,
      createdAt: nowIso,
      horizonDays: prediction.horizonDays || 30,
      resolvedAt: null,
      outcome: 'open',
    });
  }
  return j;
}

function buildPredictionScorecard(journal) {
  const predictions = normalizeJournal(journal).predictions;
  const closedItems = predictions.filter((x) => x.outcome && x.outcome !== 'open');
  const wins = closedItems.filter((x) => x.outcome === 'target-hit').length;
  return {
    total: predictions.length,
    open: predictions.length - closedItems.length,
    closed: closedItems.length,
    wins,
    losses: closedItems.length - wins,
    winRate: closedItems.length ? Math.round((wins / closedItems.length) * 100) : 0,
  };
}

module.exports = {
  normalizeJournal,
  upsertNote,
  upsertAlert,
  recordPrediction,
  buildPredictionScorecard,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node test/decision-journal.test.js
```

Expected:

```text
decision journal tests passed
```

- [ ] **Step 5: Add to package test script**

Modify `package.json` so `npm test` includes:

```text
node test/decision-journal.test.js
```

Run:

```powershell
npm test
```

Expected: all existing tests pass.

---

### Task 2: Local and Vercel Journal API

**Files:**
- Create: `api/journal.js`
- Modify: `server.js`
- Create: `data/journal.json`
- Test: `test/decision-journal.test.js`

- [ ] **Step 1: Extend failing test for file IO**

Add to `test/decision-journal.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJournalFile, writeJournalFile } = require('../src/decision-journal.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finans-journal-'));
const file = path.join(dir, 'journal.json');
const initial = readJournalFile(file);
assert.deepEqual(initial.notes, {});
writeJournalFile(file, withPrediction);
const roundtrip = readJournalFile(file);
assert.equal(roundtrip.predictions.length, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/decision-journal.test.js
```

Expected: fails because `readJournalFile` is not exported.

- [ ] **Step 3: Implement file IO**

Add to `src/decision-journal.js`:

```js
const fs = require('fs');
const path = require('path');

function readJournalFile(filePath) {
  try {
    return normalizeJournal(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (_) {
    return normalizeJournal(null);
  }
}

function writeJournalFile(filePath, journal) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeJournal(journal), null, 2) + '\n');
}
```

Export both functions.

- [ ] **Step 4: Add API endpoint**

Create `api/journal.js`:

```js
'use strict';

const path = require('path');
const { readJournalFile, writeJournalFile, normalizeJournal } = require('../src/decision-journal');

const JOURNAL_PATH = path.join(process.cwd(), 'data', 'journal.json');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(readJournalFile(JOURNAL_PATH));
  }
  if (req.method === 'POST') {
    const next = normalizeJournal(req.body || {});
    writeJournalFile(JOURNAL_PATH, next);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(next);
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
```

Modify `server.js` to handle `/api/journal` with the same `GET` and `POST` semantics using the helpers above.

- [ ] **Step 5: Verify API**

Run local server:

```powershell
node server.js
```

In another shell:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5174/api/journal
```

Expected: HTTP 200 with `notes`, `alerts`, and `predictions`.

---

### Task 3: Editable Asset Thesis Notes

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Test: `test/ui-contract.test.js`

- [ ] **Step 1: Add failing UI contract assertions**

Add to `test/ui-contract.test.js`:

```js
assert.match(html, /id="dailyDigest"/);
assert.match(html, /id="portfolioActions"/);
assert.match(html, /action-layer\.js/);
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
assert.match(app, /loadJournal/);
assert.match(app, /saveJournal/);
assert.match(app, /asset-note-form/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/ui-contract.test.js
```

Expected: fails on `loadJournal` or `asset-note-form`.

- [ ] **Step 3: Implement frontend journal state**

Add to `public/app.js`:

```js
let JOURNAL = { notes: {}, alerts: [], predictions: [] };

async function loadJournal() {
  try {
    const res = await fetch('/api/journal', { cache: 'no-store' });
    JOURNAL = await res.json();
  } catch (_) {
    JOURNAL = { notes: {}, alerts: [], predictions: [] };
  }
}

async function saveJournal() {
  await fetch('/api/journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(JOURNAL),
  });
}
```

Call `await loadJournal()` once after data and portfolio load.

- [ ] **Step 4: Render note form in asset detail**

Add an `asset-note-form` block under `assetThesisCard(x)` with two textareas:

```html
<form class="asset-note-form" data-market="us" data-symbol="AAPL">
  <label>Tez notu<textarea name="thesis"></textarea></label>
  <label>Bozulma notu<textarea name="invalidation"></textarea></label>
  <button type="submit" class="btn">Notu Kaydet</button>
</form>
```

On submit, update `JOURNAL.notes[market + ':' + symbol]`, call `saveJournal()`, and re-render the current table detail.

- [ ] **Step 5: Verify**

Run:

```powershell
node test/ui-contract.test.js
npm test
```

Expected: all tests pass.

---

### Task 4: Alert Rule Persistence

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Test: `test/ui-contract.test.js`

- [ ] **Step 1: Add failing UI contract assertions**

Add:

```js
assert.match(app, /saveAlertRule/);
assert.match(app, /data-alert-trigger/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/ui-contract.test.js
```

Expected: fails on `saveAlertRule`.

- [ ] **Step 3: Implement alert save controls**

In `alertRulesCard(x)`, render each suggested alert with:

```html
<button class="mini-btn" data-alert-trigger="AAPL stop..." data-alert-action="Pozisyonu azalt">Kaydet</button>
```

Add:

```js
async function saveAlertRule(market, symbol, trigger, action) {
  const alert = { id: market + ':' + symbol + ':' + trigger.toLowerCase(), market, symbol, trigger, action, enabled: true, createdAt: new Date().toISOString() };
  JOURNAL.alerts = (JOURNAL.alerts || []).filter((x) => x.id !== alert.id).concat(alert);
  await saveJournal();
}
```

Bind clicks in `renderTable()` after detail HTML is inserted.

- [ ] **Step 4: Verify**

Run:

```powershell
npm test
```

Expected: all tests pass.

---

### Task 5: Prediction Scorecard

**Files:**
- Modify: `public/action-layer.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `test/action-layer.test.js`

- [ ] **Step 1: Add failing pure scorecard test**

Add to `test/action-layer.test.js`:

```js
const scorecard = require('../public/action-layer.js').buildScorecardSummary({
  predictions: [
    { outcome: 'target-hit', label: 'AL' },
    { outcome: 'stop-hit', label: 'AL' },
    { outcome: 'open', label: 'TUT' },
  ],
});
assert.equal(scorecard.winRate, 50);
assert.equal(scorecard.open, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/action-layer.test.js
```

Expected: `buildScorecardSummary is not a function`.

- [ ] **Step 3: Implement pure scorecard summary**

Add to `public/action-layer.js`:

```js
function buildScorecardSummary(journal) {
  const predictions = Array.isArray(journal && journal.predictions) ? journal.predictions : [];
  const closed = predictions.filter((x) => x.outcome && x.outcome !== 'open');
  const wins = closed.filter((x) => x.outcome === 'target-hit').length;
  return {
    total: predictions.length,
    open: predictions.length - closed.length,
    closed: closed.length,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
  };
}
```

Export it.

- [ ] **Step 4: Render scorecard**

Add a `#scorecardPanel` container to Overview after `dailyDigest`, and render:

- total predictions
- open predictions
- closed predictions
- win rate

- [ ] **Step 5: Verify**

Run:

```powershell
npm test
```

Expected: all tests pass.

---

### Task 6: Rendered QA

**Files:**
- No source changes unless QA finds an issue.

- [ ] **Step 1: Start local server**

Run:

```powershell
node server.js
```

- [ ] **Step 2: Browser smoke**

Verify:

- Overview renders `Bugün Ne Değişti?` and prediction scorecard.
- Portfolio renders `Portföy Aksiyon Planı`.
- Daily Report renders `Rapor Güven İzi`.
- US market detail opens a row and shows `Varlık Tezi`, note form, and alert buttons.
- Saving a note updates `/api/journal`.
- Saving an alert updates `/api/journal`.
- Console has no relevant errors or warnings.
- 390px mobile viewport has no body horizontal overflow.

- [ ] **Step 3: Final verification commands**

Run:

```powershell
npm test
```

Expected: all tests pass.

---

## Self-Review

- Spec coverage: all high-value additions are covered: daily change, portfolio actions, asset thesis/notes, report trust, alert rules, and prediction scorecard.
- Placeholder scan: no `TBD` or unresolved implementation placeholders are intentionally left.
- Type consistency: journal keys use `market:symbol`; alert and prediction objects use the same fields across tests, API, and UI.
