# Structural signals and evidenced paper execution

Approved design: `../specs/2026-10-04-structural-signals-paper-trades-design.md`.
Execution: Native managed worktree, inline TDD. Existing user approval covers this decomposition and Git/Vercel delivery. No new trading service, broker orders, calendar guesses or learned-model activation.

## Task 1: Preserve and normalize source evidence
Files: `src/yahoo.js`, `src/crypto-market-data.js`, `src/daily-history.js`, new `src/structural-data.js`, `test/structural-data.test.js`.
Write failing tests for real opens, legacy provenance, aligned cuts, missing daily sessions, currency and unknown equity calendars. Preserve provider timestamps separately from proven session opens. Normalize completed and developing observations; Binance UTC calendar proves expected sessions; equities require explicit verified schedule coverage. Run source regressions and commit.

## Task 2: Implement the pure structural strategy
Files: new `src/structural-signals.js`, `test/structural-signals.test.js`, fixture helpers.
RED then GREEN: strict confirmed pivots, bounded deterministic clusters, trend/extension gates, support pullback and preconfirmed breakout/retest, first obstruction, invalidated roots, costs, stable parameter/setup identity. Only completed source-cut bars, >=220 real observations, last expected completed session and fresh sources. Commit tested pure engine.

## Task 3: Implement frozen paper lifecycle
Files: new `src/paper-trade-engine.js`, `test/paper-trade-engine.test.js`.
RED then GREEN: registered receipt eligibility, first expected strictly later open, no skipping missing/outside opens, late proof and expiry, gap losses, completed range touches, ambiguous bars, missing continuity, price revisions, fixed 90/180 day horizon and frozen net costs. Deterministic events/checkpoints; preserve plan. Commit.

## Task 4: Persist evidence and receipts with CAS
Files: new `src/structural-journal.js`, shared public record classifier, `src/decision-journal.js`, tests.
RED then GREEN: evidence-by-content-hash before journal transitions, two-CAS receipt response cut, crash recovery, three bounded conflict retries preserving notes, legacy/nonterminal locks, terminal cooldown + new triggers, shared cohort denominator and n=0. No fake commit timestamps; failures propagate. Commit.

## Task 5: Integrate collection, refresh, resolver and replay
Files: `src/fetch-all.js`, `src/decision.js`, `src/prediction-resolver.js`, new structural replay module/script, workflows and tests.
RED then GREEN: shared source observations and engine for local/manual/workflow paths, no legacy 30-day automatic recording, current snapshot attaches only persisted plans, direct frozen-pair Binance observations survive spot feed outage, replay never writes live journal. Use completed bars for indicators. Observation workflow uses existing GitHub mechanism including crypto weekends. Commit.

## Task 6: Present one frozen record across surfaces
Files: `public/app.js`, `public/index.html`, shared classifier, report/scorecard adapters, UI tests.
RED then GREEN: chart/card/report same immutable entry zone or actual filled entry, explicit pending/missed/evidence states, structural verified net cohorts separate legacy/manual records. Keep moderate type and collapsible Air panels. Verify browser desktop/mobile/focus and reload, record screenshots. Commit.

## Task 7: Verify and publish
Run full tests and replay/source integration checks. One fresh whole-branch review; one fix pass for important issues with RED/GREEN evidence. Commit delivery note with rulings, proof gaps and actual checks. Push branch/attach PR, merge after checks, verify exact production SHA and API/UI. Preserve primary dirty data; archive managed worktree after deliverables are durable.

## Rulings and risks
- Unknown equity calendar remains blocked: Yahoo bar labels and observed weekdays cannot prove holidays, open times or uninterrupted coverage. Crypto is the first live verifiable cohort; equity fixtures exercise the same engine without inventing live proof.
- Parameters are hypotheses, not evidence of profitability. ML remains shadow-only; this phase creates trustworthy outcomes for future learning.
- Keep reader, resolver and schema together. Legacy records stay intact and outside structural performance. Manual ATR sizing stays a manual scenario.

Validation uses injected clocks, calendars and in-memory stores. No mutable pipeline runs on primary user data or live Supabase as a test.
