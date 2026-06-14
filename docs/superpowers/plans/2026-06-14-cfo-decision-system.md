# CFO Decision System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CFO-grade decision cockpit, capital allocation risk budget, and screen-grade investment committee memo mode to the existing Finans dashboard.

**Architecture:** Keep pure decision logic in `public/action-layer.js`, render-only work in `public/app.js`, and stable containers in `public/index.html`. Use current `node/assert` tests and avoid server/API changes unless a later phase requires persistence.

**Tech Stack:** Node.js CommonJS, static browser JS, existing JSON data, existing CSS design system, no build step.

---

## File Structure

- Modify: `public/action-layer.js`
  - Add `buildCfoDecisionCockpit`, enrich `buildPortfolioRiskPlan`, add `buildInvestmentCommitteeMemo`.
- Modify: `public/app.js`
  - Render the new cockpit on Overview, render richer risk budget on Portfolio, render memo in asset detail.
- Modify: `public/index.html`
  - Add `#cfoDecisionCockpit` container in Overview.
- Modify: `public/styles.css`
  - Add compact styles for cockpit rows, risk budget, and memo blocks.
- Modify: `test/action-layer.test.js`
  - Add deterministic tests for the three new pure helpers.
- Modify: `test/ui-contract.test.js`
  - Assert stable containers and renderer functions exist.

## Phase 1: CFO Decision Cockpit

- [ ] Add failing `test/action-layer.test.js` coverage for `buildCfoDecisionCockpit`.
- [ ] Implement `buildCfoDecisionCockpit(snapshot, journal, reportBase)`.
- [ ] Add `#cfoDecisionCockpit` after `#execSummary` in Overview.
- [ ] Add `renderCfoDecisionCockpit()` in `public/app.js`.
- [ ] Call it from the existing render/load flow where Overview decision helpers are called.
- [ ] Add focused CSS.
- [ ] Run `node test/action-layer.test.js` and `node test/ui-contract.test.js`.

## Phase 2: Capital Allocation And Risk Budget

- [ ] Extend `buildPortfolioRiskPlan` tests for NAV, risk budget, target allocations, and binding constraint.
- [ ] Enrich `buildPortfolioRiskPlan` without breaking current fields.
- [ ] Update `renderPortfolioRiskPlan()` to show risk budget, constraints, and allocation actions.
- [ ] Add focused CSS.
- [ ] Run `node test/action-layer.test.js` and `npm test`.

## Phase 3: Investment Committee Memo Mode

- [ ] Add pure tests for `buildInvestmentCommitteeMemo`.
- [ ] Implement the memo helper using existing tearsheet, comps, journal, and overlay evidence.
- [ ] Render memo inside asset detail via `assetResearchCard` or the current detail composition point.
- [ ] Add focused CSS.
- [ ] Run `node test/action-layer.test.js`, `node test/ui-contract.test.js`, and `npm test`.

## Final Verification

- [ ] Run `node --check public/action-layer.js`.
- [ ] Run `node --check public/app.js`.
- [ ] Run `npm test`.
- [ ] Start `node server.js`.
- [ ] Smoke `http://localhost:5174/api/data`, `/api/report`, and the browser surface.
- [ ] Confirm no relevant console errors.
