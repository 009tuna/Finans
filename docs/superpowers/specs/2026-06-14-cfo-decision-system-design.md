# CFO Decision System Design

## Goal

Make the existing Finans dashboard useful as a CFO-style decision system: it should show what decision is ready, what blocks reliance, what risk constrains capital, and what memo-quality evidence is missing before a position is added, trimmed, exited, or watched.

## Current Baseline

The app already has the right primitives:

- Decision journal and prediction resolver.
- Daily change digest, idea funnel, catalyst calendar, portfolio risk plan.
- Macro signal overlay with thesis, calibration, tearsheet, comps, and scenario gap components.
- Company tearsheet and comps snapshot helpers.
- Forecast, backtest, DCF, Monte Carlo, stress, and correlation surfaces.

The missing layer is not another signal card. The missing layer is a tighter decision spine that turns those primitives into CFO-readable actions.

## Phase 1: CFO Decision Cockpit

Add a first-read cockpit to Overview that ranks the top decision items across the portfolio and watchlist.

Each row should answer:

- What am I deciding now?
- Is it ready, gated, or blocked?
- What is the binding reason?
- What evidence is missing?
- What is the next workflow?

The cockpit should use existing data only: `DATA`, `JOURNAL`, and `REPORT_CACHE.base.signalOverlay`. It must not mutate technical scores or present final investment advice.

## Phase 2: Capital Allocation And Risk Budget

Upgrade `buildPortfolioRiskPlan` from concentration flags into a risk budget view.

The plan should include:

- Portfolio NAV in USD.
- Single-name, market, weak-holding, missing-thesis, and open-prediction constraints.
- Suggested max allocation per asset based on risk status.
- Binding constraint and retained exposure.
- Add, trim, exit, watch, or wait-for-proof actions.

The first implementation can use deterministic defaults rather than new user settings:

- Max single-name weight: 35%.
- Max crypto weight: 50%.
- Weak holding threshold: score below 40.
- Gated idea threshold: score above 60 with missing thesis or valuation/comps evidence.

## Phase 3: Investment Committee Memo Mode

Add a screen-grade committee memo generator for a selected asset. This should be a structured HTML block in the asset detail, not a downloadable artifact yet.

The memo should include:

- Decision ask.
- Snapshot.
- What we believe.
- Evidence gaps.
- Risk transmission.
- Required next actions.
- Readiness verdict.

Readiness labels:

- `blocked`: missing source/model/context prevents reliance.
- `screen-grade`: useful for early review, not circulation-ready.
- `senior-review-ready`: coherent internal draft, still needs human review.

The first version should stay screen-grade unless a thesis, invalidation, trade plan, fresh snapshot, and no material overlay gaps are present.

## Boundaries

- This is analytical support, not personal investment advice.
- Do not invent market data, live prices, valuation multiples, or consensus.
- Keep source gaps visible inside the decision output.
- Do not redesign the app shell.
- Preserve existing JSON API contracts and Supabase/Vercel-safe behavior.

## Verification

Required checks:

- `npm test`
- `node --check public/action-layer.js`
- `node --check public/app.js`
- Local server smoke on `http://localhost:5174`
- Browser/HTTP smoke should confirm the new Overview cockpit, Portfolio risk budget, and asset memo surfaces render without console errors.
