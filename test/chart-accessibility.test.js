const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start);
  return source.slice(from, source.indexOf(end, from));
}
const elements = {};
function canvas(id) {
  const parent = { insertions: [], insertBefore(node, sibling) { this.insertions.push({ node, sibling }); elements[node.id] = node; } };
  const box = { parentElement: parent, nextSibling: { after: id } };
  const node = { id, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, closest() { return box; } };
  elements[id] = node;
  return { node, parent, box };
}
const charts = {};
for (const id of ['allocChart', 'moversChart', 'scoreChart', 'backtestChart', 'mcChart']) charts[id] = canvas(id);
const context = vm.createContext({
  document: { documentElement: {}, getElementById: (id) => elements[id], createElement: () => ({ innerHTML: '', open: false }) },
  getComputedStyle: () => ({ getPropertyValue: () => '  #aabbcc  ' }),
  chartCssColor: (token) => { assert.equal(token, '--muted'); return '#aabbcc'; },
  $: (selector) => elements[selector.slice(1)], window: { Chart: true },
  Chart: function (node, config) { this.config = config; this.destroy = () => {}; },
  allScored: () => [{ market: 'us', symbol: 'AAPL', analysis: { score: 82, tone: 'buy' } }],
  currentList: () => [{ market: 'us', symbol: 'AAPL', analysis: { score: 82, tone: 'buy' } }],
  marketShortLabel: () => 'ABD', chartGradient: () => 'gradient', reduceMotion: true,
});
vm.runInContext(`let DATA = { allocation: [{label: 'ABD', weight: 35}, {label: 'BIST', weight: 0}] };
  let allocChart = null, moversChart = null, scoreChart = null, backtestChart = null, mcChart = null;
  ${section('function fmtNum(', 'function fmtPrice(')}
  ${source.slice(source.indexOf('function esc('), source.indexOf('\n', source.indexOf('function esc(')))}
  ${section('const CHART =', '// Smooth alan')}
  ${section('function chartLabelColor(', '/* ---------- Döviz Kurları Widget')}
  ${section('function renderScoreChart(', 'function deskDefaultInterval(')}
  ${section('function drawBacktestChart(', 'let forecastInitialized')}
  ${section('function drawMCChart(', 'function loadDCFDefaults(')}
  globalThis.inspectChart = (name) => ({allocChart, moversChart, scoreChart, backtestChart, mcChart})[name].config;
`, context);

context.renderAlloc();
context.renderMovers();
context.renderScoreChart();
assert.match(elements['allocChart-data-table'].innerHTML, /Ağırlık \(%\)/);
assert.match(elements['allocChart-data-table'].innerHTML, /35,00/);
assert.doesNotMatch(elements['allocChart-data-table'].innerHTML, /<th scope="row">BIST/);
assert.match(elements['moversChart-data-table'].innerHTML, /AAPL.*ABD.*82/);
assert.match(elements['scoreChart-data-table'].innerHTML, /AAPL.*82/);
assert.equal(context.inspectChart('scoreChart').options.scales.x.ticks.color, '#aabbcc');
assert.equal(context.inspectChart('allocChart').options.plugins.legend.labels.font.size, 12);

context.drawBacktestChart({
  initialCapital: 100,
  equityCurve: [{ day: 0, total: 100, price: 10 }, { day: 1, total: 105, price: 11 }],
  trades: [{ day: 1, type: 'BUY' }],
});
assert.match(elements['backtestChart-data-table'].innerHTML, /105,00.*110,00.*Alış/);
assert.equal(context.inspectChart('backtestChart').data.datasets[0].data[1], 105);
context.drawMCChart({ horizon: 1, percentiles: { pessimistic: [100, 90], median: [100, 110], optimistic: [100, 130] } });
assert.match(elements['mcChart-data-table'].innerHTML, /Gün 1.*90,00.*110,00.*130,00/);

for (const id of Object.keys(charts)) {
  assert.equal(charts[id].node.attributes.role, 'img');
  assert.match(charts[id].node.attributes['aria-label'], /tabloda okunabilir/);
  assert.equal(charts[id].parent.insertions.length, 1, 'table is inserted once outside chart-box');
  assert.equal(charts[id].parent.insertions[0].sibling, charts[id].box.nextSibling);
  assert.match(elements[id + '-data-table'].innerHTML, /<caption>.*<th scope="col">.*<th scope="row">/);
}
elements['allocChart-data-table'].open = true;
context.renderAlloc();
assert.equal(charts.allocChart.parent.insertions.length, 1);
assert.equal(elements['allocChart-data-table'].open, true, 'refresh preserves expanded data table');
context.renderChartDataTable(charts.allocChart.node, '<unsafe>', ['A'], [['<script>']]);
assert.match(elements['allocChart-data-table'].innerHTML, /&lt;script&gt;/);
context.window.Chart = false;
context.drawMCChart({ horizon: 0, percentiles: { pessimistic: [90], median: [100], optimistic: [130] } });
assert.match(elements['mcChart-data-table'].innerHTML, /Gün 0.*90,00.*100,00.*130,00/, 'data remains accessible without canvas library');
console.log('chart accessibility tests passed');
