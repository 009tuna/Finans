'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

const overview = section(html, '<section class="view" id="view-overview">', '<!-- PAZAR GÖRÜNÜMÜ');
assert.match(overview, /class="overview-workspace"/, 'overview has a bounded workspace composition');
assert.match(overview, /id="overviewPortfolioSummary"[^>]*overview-span-all/, 'portfolio summary spans the decision and context columns');
assert.match(overview, /class="workspace-core"/, 'decision content receives the primary column');
assert.match(overview, /data-overview-tab="decisions"/, 'decisions is the default center task');
assert.match(overview, /overview-task-toolbar[\s\S]*?<\/div>\s*<div id="overviewWorkspaceStatus" class="workspace-status overview-span-all"/, 'status copy sits below the full-label task tabs');
assert.match(overview, /data-overview-tab="forecasts"[\s\S]*?id="macroWorkspace"/, 'macro details remain in their named center task');
assert.match(overview, /data-overview-tab="signals"[\s\S]*?id="dailyDigest"/, 'signal digest remains reachable in its named center task');
assert.match(overview, /data-overview-context-tab="markets"[\s\S]*?data-overview-context-tab="news"[\s\S]*?data-overview-context-tab="calendar"/, 'context uses separate market, news, and calendar tasks');
assert.doesNotMatch(overview, /workspace-heading/, 'overview avoids a repeated page-level heading below the top bar');
assert.match(overview, /class="overview-context"/, 'market and research context receives a side rail');
assert.match(overview, /id="macroWorkspace"/, 'macro integration has a stable mount in visible context');
assert.match(overview, /id="macroWorkspace"[^>]*class="macro-workspace"/, 'macro workspace uses a dedicated central panel hook');
assert.match(overview, /id="marketNewsOverview"/, 'overview has a distinct source-feed mount');
assert.match(overview, /<details class="overview-advanced overview-span-all"/, 'secondary analytics use a native expandable section');
assert.doesNotMatch(overview, /<details[^>]*open/, 'secondary analytics do not lengthen the initial overview');

const retainedTargets = [
  'dailyDigest', 'cfoDecisionCockpit', 'signalOverlayPanel', 'ideaFunnel', 'catalystCalendar',
  'overviewBriefing', 'kpis', 'execSummary', 'predictionScorecard', 'decisionLearningPanel',
  'topPicks', 'allocChart', 'marketRegime', 'moversChart', 'fxWidget',
];
for (const id of retainedTargets) assert.match(overview, new RegExp(`id="${id}"`), `overview retains ${id}`);
assert.match(app, /function renderOverviewPortfolioSummary\(\)/, 'portfolio summary renderer remains available');
assert.match(app, /function renderCfoDecisionCockpit\(\)/, 'decision renderer remains available');
assert.match(app, /function renderIdeaFunnel\(\)/, 'idea funnel renderer remains available');
assert.match(app, /id="marketNewsWorkspace"[^>]*class="market-news-report"/, 'report developments provide a source-feed mount');
assert.match(app, /FinansResearch\.researchHtml\(ai && ai\.research\)/, 'existing model research developments remain in the report');
assert.match(app, /if \(window\.FinansMacro && typeof window\.FinansMacro\.refresh === 'function'\) window\.FinansMacro\.refresh\(\);/, 'overview and report renders refresh optional macro mounts');
assert.equal((html.match(/href="\/macro\.css"/g) || []).length, 1, 'macro stylesheet is loaded once');
assert.equal((html.match(/src="\/macro\.js"/g) || []).length, 1, 'macro module is loaded once');

assert.match(css, /html \{ font-size: 14px; \}/, 'desktop UI uses the requested dense base type size');
assert.match(css, /grid-template-columns: 176px minmax\(0, 1fr\)/, 'desktop navigation balances full labels with a wide primary workspace');
assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(240px, 260px\)/, 'context rail stays compact beside a flexible decision column');
assert.match(css, /\.overview-workspace \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'overview columns collapse based on available container width');
assert.match(css, /#content input, #content select, #content textarea \{ font-size: 16px; \}/, 'mobile input text prevents browser zoom');
assert.match(css, /prefers-reduced-motion/, 'reduced-motion support remains present');

console.log('workspace density composition tests passed');
