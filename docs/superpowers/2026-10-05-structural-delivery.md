# Structural signals and frozen paper execution delivery

Approved scope: structural-long-v1, 90/180 calendar days, evidenced paper execution; no broker orders or learned-model activation. Implementation started at 43fb17e.

## Behavior

The deterministic strategy uses confirmed support/resistance pivots, trend/extension gates, the first overhead resistance and frozen cost assumptions. A quote update never moves the entry zone, stop or target. A broken support needs two new, separated, confirmed pivots after its break.

Source observations are content-addressed before journal transitions. Initial registration and its post-CAS response receipt use separate CAS writes; eligibility begins after that real response. Only the first expected opening strictly after eligibility is considered. Missing proof stays pending; an opening outside the region is missed. Later attractive prices cannot substitute an entry. Completed ranges, gap openings, fixed horizon exits and ambiguous double touches retain distinct evidence.

Cards, charts and reports use the same journal record. Structural results are separated by market, setup, parameter version, execution/resolver version, horizon, source, currency, price basis and cost policy. Net wins, zeroes, losses, exit distribution and holding duration are distinct. n=0 remains null.

Buy-and-hold comparison uses the same actual fill opening, the exact exit opening, currency and round-trip costs. Range exits have an unknown intraday timestamp, so their comparison stays unverified/null. Exact holding duration and daily-bar holding bounds are counted separately. This is a per-trade comparison, not portfolio performance.

The refresh, CLI resolver and offline replay use the same strategy/engine. Replay is explicitly historical simulation with assumed decision-cut eligibility, no fabricated live receipt and no database writes. GitHub observations include crypto weekends. Existing open system records continue under the legacy resolver; no forced conversion/cancellation or structural performance inclusion occurs.

## Independent review and consolidated fixes

One read-only whole-branch review of 43fb17e..0e80898 found five Important issues, no Critical. Each reproduction is covered in `test/structural-regressions.test.js`:

1. Exit-opening revisions now invalidate frozen gap/time results. Developing range evolution alone does not revise the exact observed open; completed exit evidence is also compared when it was already completed at closure.
2. Support formation and invalidation are processed in chronological order. One later pivot cannot erase an old break; renewed evidence uses only new pivots.
3. Legacy open records are collected and resolved through the common CAS publication flow under their original policy, releasing locks only on evidenced legacy outcomes.
4. Persisted closed proof survives absent observations. Actual contradictions stay excluded until complete matching frozen evidence returns.
5. Decision summaries use the shared lifecycle/evidence classifier for missed, expired, pending and incomplete records.

The minor reporting omission was completed: target/stop/time distribution, exact/bounded holding duration and a disclosed benchmark basis. Arbitrary mixed input to the old public scorecard remains a legacy-only helper; the production caller filters structural records. No unsupported profitability judgment was made.

## Validation

- New review regression file: RED with seven failing cases and one passing end-to-end case, then all eight GREEN.
- Full `npm test` passed at the consolidated fix tree (119 command entries); source, strategy, engine, CAS, reader, replay, UI and legacy suites included.
- Complete in-memory registration → receipt → actual opening → gap exit → shared verified cohort, including JSONB key reorder and preserved concurrent notes.
- Browser: direct report navigation/reload, populated ledger, pending/filled/missed synthetic records, explicit USDT, desktop 1440 × 900, mobile 390 × 844 without horizontal overflow, visible keyboard focus and disclosure activation. Synthetic screenshots are in `docs/design-air/structural-acceptance`; they are not live signals.
- No mutable pipeline was run against production as a test. Publication and the first legitimate observation are checked separately after merge.

## Limits and activation

Live equity calendars remain unverified; BIST/US automatic structural registrations fail closed. Yahoo daily labels do not prove historical session openings or holidays. Binance daily open evidence is usable only with its verified UTC/USDT contract. Source gaps, revisions and corporate-action conflicts remain explicit.

Thresholds are hypotheses; profitability is unproven. Learning stays in shadow mode and cannot autonomously replace the production strategy. Reliable outcome accumulation and out-of-sample evaluation must precede model promotion. Current-watchlist survivorship, revised provider history and missing split/dividend total return constrain replay.

Primary checkout user data is not staged or replaced. GitHub CI, exact production SHA, API health, public static assets and the live ledger must be verified before claiming publication complete.


## Production acceptance — 2026-10-06

- PR #5 merged to master: b55424c7c6eb0ffc9fa96b2404368dd1f74f8308. Its tree exactly matches tested db7cb1f. PR CI 37366789796 and master CI 37367747393 both passed.
- Production deployment dpl_wZaDQMCZsMw4v9PNBYpAAkhBwriu is READY with that exact Git SHA and the existing finans-dashboard-iota.vercel.app alias. Data/journal/report and both shared structural assets returned HTTP 200.
- The first manually dispatched observation 37367841613 never acquired a runner during the GitHub Actions incident and failed without executing a source step. Later scheduled runs 37400667435 and 37422494965 completed successfully on the production code, with 12 US, 100 BIST and 21 crypto assets.
- Latest source cut: 2026-10-06T06:13:19.966Z. All 21 crypto observations are verified. All 112 equity observations explicitly report calendar-unverified. No structural candidate was registered; the structural scorecard correctly remains n=0 with null success/net averages.
- Before/after live journal comparison retains all 374 prediction IDs and notes. Only one existing legacy US row transitions open to target-hit under its original resolver. Its entry/stop/target fields are preserved; no legacy result enters structural performance. Remaining legacy open records: US 6, BIST 8, crypto 18.
- Production reload/disclosure and desktop/mobile acceptance passed. Widths: 1434 <= 1440 and 385 <= 390; browser error log empty. production.jpg shows actual live data; desktop.jpg/mobile.jpg remain synthetic fixtures.
- Learning capture on the second observation reused 132 examples and preserved the first immutable payload for one semantic identity conflict (partial, no ineligible inputs). The public API does not identify its symbol/field, so that diagnosis is unverified. A later macro projection has 151 examples, 135 pending, 16 excluded, zero eligible labels and zero models. This is evidence collection with shadow-only policy, not demonstrated adaptive profitability.
- Primary checkout preservation was verified after fast-forward: seven dirty tracked file hashes and all 266 preexisting untracked paths unchanged. No user data was staged, reset or deleted.

Successful observation runs: https://github.com/009tuna/Finans/actions/runs/37400667435 and https://github.com/009tuna/Finans/actions/runs/37422494965.
