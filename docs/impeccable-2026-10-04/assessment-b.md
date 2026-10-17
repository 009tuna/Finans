# Assessment B - detector and browser evidence

Target: `C:/Users/Monster/Downloads/Finans/public/index.html` and `public/` UI source. Analysis only. This assessment was kept independent of Assessment A; do not read it before A is complete.

## Actual detector run

Command: `node C:\Users\Monster\.codex\skills\impeccable\scripts\detect.mjs --json public`

Cwd: `C:\Users\Monster\Downloads\Finans`.

Detector exit code: **2** (findings, not a crash). Full untruncated output is in `detector.json`; stderr is empty. Artifact timestamp: **2026-10-04T01:00:38.3414619Z**. Artifact SHA256: `FBDCB22FFE5BEAFAE2C1D67DB50C91764A08C85A43C6AAED7623C54C5276A170`.

The directory contains 15 scannable files: 2 HTML, 3 CSS, 10 JavaScript including 2 vendor bundles. Provider-specific optional rules were not enabled. No repeated detector run was needed.

### Counts

| Rule | Count |
| --- | ---: |
| `overused-font` | 5 |
| `side-tab` | 6 |
| `single-font` | 2 |
| Total | 13 |

| File | Count |
| --- | ---: |
| `public/index.html` | 2 |
| `public/styles.css` | 7 |
| `public/visual-proposal.html` | 3 |
| `public/workspace.css` | 1 |

`visual-proposal.html` is an auxiliary proposal surface, not the main dashboard: its 3 findings must be separated from the 10 main-source findings. These are repeated source signals, not 13 unique user-facing defects.

### Exact detector locations at scan time

* `index.html:9` overused font, Google Fonts Plus Jakarta Sans; `index.html:1` single font.
* `styles.css:54` and `styles.css:2006` overused font declarations.
* `styles.css:2411` sidebar `border-right: 1px solid var(--border)`.
* `styles.css:2456` summary-grid cell dividers `border-right: 1px solid var(--border)`.
* `styles.css:2515` KPI divider `border-left: 1px solid var(--border)`.
* `styles.css:2651` allocation segment separator `border-right: 2px solid var(--card)`.
* `styles.css:2735` report-integrity `border-left: 2px solid var(--accent)`.
* `workspace.css:179` context-panel divider `border-left: 1px solid var(--border)`.
* Proposal-only: `visual-proposal.html:9,31` overused-font; line 31 single-font.

### False positives and coverage limitations

**Product-register exception:** `reference/product.md` explicitly permits one UI family and familiar sans defaults. Both `single-font` findings are contextually inappropriate as fix requests. `overused-font` repeats the same family across imports/declarations and does not establish a usability defect. Font replacement is not a justified priority.

**Five side-tab findings are neutral separators:** sidebar, summary columns, KPI division, allocation segments, and context rail. They are not ornamental colored accent stripes. The regex does not resolve `var(--border)` or `var(--card)` when excluding neutral colors. The report-integrity accent stripe is a literal candidate matching PRODUCT.md's anti-reference, but its active appearance is not proven: later-loaded `workspace.css:313` replaces the border with `1px solid var(--border)`. Do not report all six as confirmed decorative accents.

**Actual engine was degraded:** the CLI attempts static HTML parsing but silently falls back to regex when parser imports fail (`detect-html.mjs` catch -> `detectText`). Direct read-only package probes from the detector's scripts directory reported `ERR_MODULE_NOT_FOUND` for **htmlparser2, css-select, css-tree, domutils**. Thus this successful CLI scan does not validate the rendered DOM, resolved CSS cascade, runtime-populated content, actual contrast, focus behavior, or responsive overflow. Browser evidence is the fallback; no packages were installed.

## Browser evidence

Created a NEW isolated hidden IAB tab at `http://127.0.0.1:5196/?qa=full#view=overview`. Default desktop viewport: **1280 x 720**. Existing QA server was reused and was not stopped.

### Initial loaded functional page

The initial load displayed the functional market-candidate workspace. Desktop screenshot: `b-overview-desktop.jpg`.

Read-only rendered-DOM measurements: main page width 1280; document scrollWidth 1274 (no horizontal page overflow in this state). Theme `mist`. Ten labeled navigation destinations arranged under four section labels; 3 overview task tabs; 3 context tabs. Candidate buttons are native buttons with detailed accessible labels and delayed-price status; context collapse has an accessible name.

Live typography in this state is genuinely small: view subtitle 11px, freshness status 10.5px, candidate explanation 11px, score descriptor `Teknik puan` 10px, delayed-price binding 10.5px, candidate caution `Puan, başarı olasılığı değildir` 10.5px. Example candidate row height about 93.65px, 680.8px wide. Density is a product permission, but risk/interpretation context being smaller than core scores remains a credible design issue. The detector did not catch this due to runtime content and degraded engine. Source support in unchanged `workspace.css`: lines 159,175,176,228,235,236.

Initial browser error/warning logs were empty. This functional browser state was cached before subsequent external concurrent edits, and must not be described as current disk validation.

### First fresh reload: transient runtime blocking defect during concurrent edits

Parent reported external concurrent source edits. A single fresh reload at approximately **2026-10-04T01:02:53Z** confirmed that the current app is broken, rather than merely showing a source-only conflict.

Fresh DOM shows `<<<<<<< HEAD`, `=======`, `>>>>>>> origin/master` directly to the user, duplicated navigation/app shells, and `Yükleniyor...` with no populated dashboard. Screenshot: `b-overview-fresh.jpg`; DOM: `b-fresh-dom.txt`; logs: `b-fresh-console.json`.

Console recorded `SyntaxError: Unexpected token '<<'` for `insights.js`, `action-layer.js`, `research.js`, `app.js`, `macro.js`; HTML duplication caused some scripts to be loaded twice. Read-only syntax checks at that time independently confirmed:

* `node --check public/insights.js`: exit 1, conflict marker line 1.
* `node --check public/app.js`: exit 1, conflict marker line 20.

Source conflict starts at that time included `index.html:1`, `app.js:20`, `insights.js:1`, `action-layer.js:423`, `research.js:22`, `macro.js:1`, `styles.css:1`, `macro.css:5`. This was a runtime blocker during the run, distinct from visual critique. It was subsequently resolved by external changes, as verified below; **do not carry it forward as an active P0 design finding**. No conflict resolution or app/data changes were performed by Assessment B.

Source hashes and last-write times during the transient conflict are in `b-source-digests.json`, captured **2026-10-04T01:02:39.5684142Z**. The source hashes were captured after the detector scan, not at scan time. Several files have last-write time 01:01:13Z, later than the 01:00:38Z detector artifact, so detector locations above belong to the scan snapshot and may have shifted on disk. This input drift must be disclosed; do not combine old detector line numbers and later source hashes as an immutable run.

### Final confirmation after external resolution

Parent reported the source had been resolved externally. One additional final reload was authorized to establish the final state, instead of leaving a stale P0 assertion. Final reload started **2026-10-04T01:05:23.148Z**; new warning/error logs since that reload were **empty**. After normal asynchronous content population, the dashboard again showed 9 market-candidate buttons and MSFT, AMD, NVDA; conflict markers were absent. Final screenshot `b-overview-final.jpg` is the authoritative current browser evidence; `b-final-dom.txt`, `b-final-console.json` preserve the final state. Final read-only metrics again showed 1280 x 720, scrollWidth 1274.

Final syntax checks for **both public/app.js and public/insights.js passed (exit 0)**. Final current source hashes are in `b-source-digests-final.json`, captured **2026-10-04T01:05:12.1665445Z**, with externally changed sources having last-write time about 01:03:57Z. The final browser is functional, so unresolved source conflicts are a **run limitation and transient event**, not an active final P0.

## Skipped steps / completion limits

* Mutable injection unavailable: documented IAB Playwright `evaluate`, locator `evaluate`, and `evaluateAll` operate in a **read-only** page scope. Per parent instruction and browser documentation, no title mutation/script-injection preflight was attempted. There is **no verified user-visible detector overlay** and no browser-console detector result.
* No Impeccable overlay live server started; no cleanup required for one. Existing QA server left running. Browser stayed hidden; no Human tab or visibility claim. Assessment B's temporary tab was closed after evidence capture.
* Assessment B browser coverage is the overview view at default desktop size, including initial functional, transient broken, and final functional states. No full keyboard, mobile, multi-view or error-injection audit was performed. The 3-5-page overlay requirement was inapplicable because mutable injection was unavailable. No viewport override was applied.
* No actual portfolio saves, app/data edits, repair, dependencies installation, or screenshots via external browser tools. Only evidence files under `docs/impeccable-2026-10-04` were written.
* No disposable temp files used; detector JSON, stderr, summary, digests, screenshots, DOM and console are intentional retained evidence artifacts.

Assessment B is usable with the above declared degraded detector coverage and concurrent-source limitation. Root should synthesize only after Assessment A is complete.
