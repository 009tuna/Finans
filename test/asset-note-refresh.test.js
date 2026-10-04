'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const actionLayer = require('../public/action-layer');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

// A small DOM fixture keeps node identity, focus and selection observable. It
// parses only the ordinary HTML and selectors used by the asset note surfaces.
const decode = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentElement = null; this.attributes = {};
    this.dataset = {}; this.style = {}; this.listeners = {};
    this.value = ''; this.checked = false; this.disabled = false;
    this.hidden = false; this.open = false; this.selectionStart = 0; this.selectionEnd = 0;
    this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
      remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
      toggle: (name, force) => { const on = force === undefined ? !this.classList.contains(name) : force; this.classList[on ? 'add' : 'remove'](name); return on; },
    };
  }
  get className() { return this.attributes.class || ''; }
  set className(value) { this.attributes.class = value; }
  get id() { return this.attributes.id || ''; }
  set id(value) { this.attributes.id = value; }
  get name() { return this.attributes.name || ''; }
  get type() { return this.attributes.type || ''; }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.firstChild; }
  get parentNode() { return this.parentElement; }
  get childNodes() { return this.children; }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  get elements() { return Object.fromEntries(this.querySelectorAll('[name]').map(node => [node.getAttribute('name'), node])); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this._text = String(value); }
  get innerHTML() { return this._text + this.children.map(node => node.outerHTML).join(''); }
  set innerHTML(value) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this._text = ''; parseHtml(String(value), this); }
  get outerHTML() {
    const attrs = { ...this.attributes, ...Object.fromEntries(Object.entries(this.dataset).map(([key, value]) => ['data-' + key.replace(/[A-Z]/g, char => '-' + char.toLowerCase()), value])) };
    return '<' + this.tagName.toLowerCase() + Object.entries(attrs).map(([key, value]) => ' ' + key + '="' + value + '"').join('') + '>' + this.innerHTML + '</' + this.tagName.toLowerCase() + '>';
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'checked') this.checked = true;
    if (name === 'disabled') this.disabled = true;
    if (name === 'hidden') this.hidden = true;
    if (name === 'open') this.open = true;
  }
  getAttribute(name) { return name.startsWith('data-') ? this.dataset[dataKey(name)] ?? null : this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; }
  appendChild(node) { node.remove(); node.parentElement = this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  insertBefore(node, anchor) { if (!anchor) return this.appendChild(node); node.remove(); node.parentElement = this; this.children.splice(this.children.indexOf(anchor), 0, node); return node; }
  replaceWith(node) { const parent = this.parentElement; if (parent) { parent.insertBefore(node, this); this.remove(); } }
  remove() { if (this.parentElement) { const parent = this.parentElement; parent.children.splice(parent.children.indexOf(this), 1); this.parentElement = null; } }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  matches(selector) { return selector.split(',').some(part => matchesSelector(this, part.trim())); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { const nodes = []; const visit = node => node.children.forEach(child => { if (child.matches(selector)) nodes.push(child); visit(child); }); visit(this); return nodes; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  focus() { this.ownerDocument.activeElement = this; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  insertAdjacentElement(where, node) { if (where === 'beforeend') return this.appendChild(node); if (where === 'afterbegin') return this.insertBefore(node, this.firstChild); if (where === 'beforebegin') return this.parentElement.insertBefore(node, this); return this.parentElement.insertBefore(node, this.parentElement.children[this.parentElement.children.indexOf(this) + 1]); }
}
function matchesSimple(node, selector) {
  const tag = selector.match(/^[a-z][\w-]*/i);
  if (tag && node.tagName !== tag[0].toUpperCase()) return false;
  const id = selector.match(/#([\w-]+)/);
  if (id && node.id !== id[1]) return false;
  for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(name)) return false;
  for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
    const actual = node.getAttribute(name);
    if (actual == null || (value !== undefined && actual !== value)) return false;
  }
  return true;
}
function matchesSelector(node, selector) {
  const parts = selector.split(/\s+(?![^\[]*\])/);
  if (!matchesSimple(node, parts.pop())) return false;
  let ancestor = node.parentElement;
  while (parts.length) {
    const relation = parts.at(-1) === '>' ? parts.pop() : null;
    const part = parts.pop();
    if (relation === '>') {
      if (!ancestor || !matchesSimple(ancestor, part)) return false;
      ancestor = ancestor.parentElement;
      continue;
    }
    while (ancestor && !matchesSimple(ancestor, part)) ancestor = ancestor.parentElement;
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}
function parseHtml(html, container) {
  const stack = [container];
  for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
    if (/^<\//.test(token)) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
      const node = container.ownerDocument.createElement(tag);
      for (const [, name, quoted, single, plain] of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(name, decode(quoted ?? single ?? plain ?? ''));
      stack[stack.length - 1].appendChild(node);
      if (!['input', 'br', 'hr', 'img'].includes(tag) && !token.endsWith('/>')) stack.push(node);
    } else {
      const parent = stack[stack.length - 1]; parent._text += decode(token);
      if (parent.tagName === 'TEXTAREA') parent.value += decode(token);
    }
  }
}
function functionSource(name) {
  const match = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(source);
  assert.ok(match, name + ' must be present');
  const end = source.indexOf('\n}', match.index);
  assert.notEqual(end, -1, name + ' needs a complete declaration');
  return source.slice(match.index, end + 2);
}
const asset = (symbol = 'AAPL', stop = 90) => ({
  market: 'us', symbol, name: 'Synthetic ' + symbol, currency: 'USD', price: 100,
  quoteTime: '2026-10-03T12:00:00Z',
  analysis: { score: 70, label: 'AL', tone: 'buy', summary: 'Synthetic technical summary', reasons: [] },
  decision: { score: 70, status: 'ready', freshness: { status: 'fresh' }, activeSignal: { available: true, entry: 100, stop, target: 120 } },
  ind: { rsi: 50, atr: 2, atrPct: 2, macd: { histogram: 1 } },
});
function harness() {
  const listeners = {}, requests = [], reads = [];
  const document = {
    activeElement: null,
    createElement(tag) { return new Element(tag, document); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    querySelector(selector) { return this.body.querySelector(selector); },
    getElementById(id) { return this.querySelector('#' + id); },
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  document.body = document.createElement('body');
  const selected = document.createElement('div'); selected.id = 'selectedAssetDetail'; document.body.appendChild(selected);
  const assets = [asset(), asset('MSFT')];
  const context = vm.createContext({
    document, console: { error() {} }, window: { FinansActionLayer: actionLayer },
    DATA: { generatedAt: '2026-10-03T12:00:00Z', us: assets, bist: [], crypto: [] },
    JOURNAL: { notes: {}, alerts: [], predictions: [], _revision: 'r1' }, JOURNAL_READY: true,
    journalState: 'ready', journalReadRequest: null, journalSaving: false, noteDrafts: Object.create(null),
    portfolioData: null, REPORT_CACHE: { base: {} }, assetDetailTabs: { 'us:AAPL': 'notes' },
    $: selector => document.querySelector(selector),
    esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    fullTimestamp: value => value, technicalDataNotice: () => '', decisionInsightCard: () => '', decisionPanel: () => '',
    indGrid: () => '', subBars: () => '', reasonList: () => '', assetSignalOverlayCard: () => '', assetLearningCard: () => '',
    currentList: () => assets, setView() {},
    fetch: (url, options) => new Promise(resolve => reads.push({ url, options, resolve })),
    authedFetch: (url, options) => new Promise(resolve => requests.push({ url, body: JSON.parse(options.body), resolve })),
  });
  const functions = ['validJournalPayload', 'journalLoadStateHtml', 'refreshJournalLoadState', 'syncJournalReadFields', 'loadJournal', 'saveJournal',
    'assetResearchCard', 'committeeMemoCard', 'verdictLabel', 'renderSelectedAssetDetail'];
  const cardFunctions = source.slice(source.indexOf('function assetThesisSummaryHtml('), source.indexOf('function assetResearchCard('));
  assert.ok(cardFunctions.includes('function refreshAssetJournalReadouts('), 'note readout helpers must be included');
  vm.runInContext(functions.map(functionSource).join('\n') + '\n' + cardFunctions + '\n' + source.slice(source.indexOf('// Delegated event listeners for note-saving')), context);
  context.renderSelectedAssetDetail(assets[0]);
  const noteForm = selected.querySelector('.asset-note-form');
  const input = (form, name, value) => { const field = form.elements[name]; field.value = value; listeners.input({ target: field }); return field; };
  const submit = form => listeners.submit({ target: form, preventDefault() {} });
  const finish = () => { const request = requests.at(-1); request.resolve({ ok: true, json: async () => ({ ...request.body, _revision: 'r2' }) }); };
  const finishRead = journal => reads.at(-1).resolve({ ok: true, json: async () => journal });
  return { context, document, selected, assets, requests, reads, listeners, noteForm, input, submit, finish, finishRead };
}

test('saving a selected-asset note refreshes its saved summary and research gaps without rebuilding the form', async () => {
  const h = harness(), form = h.noteForm, summary = h.selected.querySelector('.asset-thesis');
  assert.match(h.selected.querySelector('[data-asset-panel="research"]').textContent, /Kayıtlı tez notu eksik/);
  h.input(form, 'thesis', 'Saved investment thesis'); h.input(form, 'invalidation', 'Saved failure condition');
  const pending = h.submit(form); assert.equal(h.requests.length, 1); h.finish(); await pending;
  assert.equal(h.selected.querySelector('.asset-note-form'), form);
  assert.equal(h.selected.querySelector('.asset-thesis'), summary);
  assert.match(summary.textContent, /Kayıtlı tez.*Saved investment thesis/);
  assert.match(summary.textContent, /Kayıtlı bozulma koşulu.*Saved failure condition/);
  assert.doesNotMatch(h.selected.querySelector('[data-asset-panel="research"]').textContent, /Kayıtlı tez notu eksik|Kayıtlı tez bozulma koşulu eksik/);
  assert.match(h.selected.querySelector('.committee-memo-card').textContent, /Kayıtlı bozulma koşulu: Saved failure condition/);
  assert.match(h.selected.querySelector('.committee-memo-card').textContent, /Pozisyon boyutunu risk bütçesiyle birlikte incele/);
  assert.match(form.querySelector('.note-status').textContent, /Kaydedildi/);
  assert.equal(h.context.noteDrafts['us:AAPL'], undefined);
});

test('editing during the save retains the new draft, focused textarea selection, active tab and open panel', async () => {
  const h = harness(), form = h.noteForm, field = h.input(form, 'thesis', 'Submitted thesis');
  h.input(form, 'invalidation', 'Submitted failure condition');
  const disclosure = h.document.createElement('details'); disclosure.open = true;
  h.selected.querySelector('[data-asset-panel="notes"]').appendChild(disclosure);
  const tabs = h.selected.querySelectorAll('[data-asset-tab]');
  const selectedTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
  const pending = h.submit(form);
  h.input(form, 'thesis', 'New draft while request is pending'); field.focus(); field.setSelectionRange(4, 13);
  h.finish(); await pending;
  assert.equal(form.elements.thesis, field);
  assert.equal(field.value, 'New draft while request is pending');
  assert.equal(h.document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [4, 13]);
  assert.equal(h.context.JOURNAL.notes['us:AAPL'].thesis, 'Submitted thesis');
  assert.equal(h.context.noteDrafts['us:AAPL'].thesis, field.value);
  assert.match(form.querySelector('.note-status').textContent, /Önceki not kaydedildi/);
  assert.equal(h.selected.querySelectorAll('[data-asset-tab]').find(tab => tab.getAttribute('aria-selected') === 'true'), selectedTab);
  assert.equal(disclosure.open, true); assert.equal(disclosure.isConnected, true);
});

test('a failed note save refreshes risk readouts from saved truth and keeps the newest draft', async () => {
  const h = harness();
  h.context.JOURNAL.notes['us:AAPL'] = { thesis: 'Verified earlier thesis', invalidation: 'Verified earlier condition' };
  h.context.refreshAssetJournalReadouts(h.assets[0]);
  const form = h.noteForm, field = h.input(form, 'thesis', 'Rejected submitted thesis');
  h.input(form, 'invalidation', 'Rejected submitted condition');
  const pending = h.submit(form);
  h.input(form, 'thesis', 'New draft during failed request'); field.focus(); field.setSelectionRange(3, 9);
  h.requests.at(-1).resolve({ ok: false, status: 409, json: async () => ({ error: 'Remote revision changed' }) });
  await pending;
  assert.equal(h.context.JOURNAL.notes['us:AAPL'].thesis, 'Verified earlier thesis');
  assert.equal(h.context.JOURNAL.notes['us:AAPL'].invalidation, 'Verified earlier condition');
  assert.match(h.selected.querySelector('.asset-thesis').textContent, /Tez taslağınız.*New draft during failed request/);
  const riskReadout = h.selected.querySelector('.committee-memo-card').textContent;
  assert.match(riskReadout, /Kayıtlı tez: Verified earlier thesis/);
  assert.match(riskReadout, /Kayıtlı bozulma koşulu: Verified earlier condition/);
  assert.doesNotMatch(riskReadout, /Rejected submitted|New draft during failed/);
  assert.equal(form, h.selected.querySelector('.asset-note-form'));
  assert.equal(field, form.elements.thesis); assert.equal(h.document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [3, 9]);
  assert.match(form.querySelector('.note-status').textContent, /Kaydedilemedi/);
  assert.equal(form.querySelector('button[type="submit"]').disabled, true, 'a revision conflict requires a read before another save');
});

test('a readout refresh for another asset preserves the selected asset draft and alert choice', () => {
  const h = harness(), form = h.noteForm;
  const field = h.input(form, 'thesis', 'Unsaved AAPL draft'); field.focus(); field.setSelectionRange(2, 7);
  const alert = h.selected.querySelector('.alert-toggle-form'), checkbox = alert.querySelector('input[type="checkbox"]');
  checkbox.checked = true; alert.querySelector('.field-status').textContent = 'Unsubmitted checkbox choice';
  const panel = h.document.createElement('section');
  panel.innerHTML = h.context.assetThesisCard(h.assets[1]); h.document.body.appendChild(panel);
  const otherForm = panel.querySelector('.asset-note-form');
  h.context.JOURNAL.notes['us:MSFT'] = { thesis: 'Saved MSFT thesis', invalidation: 'Saved MSFT condition' };
  h.context.refreshAssetJournalReadouts(h.assets[1]);
  assert.match(panel.querySelector('.asset-thesis').textContent, /Saved MSFT thesis/);
  assert.equal(h.selected.querySelector('.asset-note-form'), form);
  assert.equal(form.elements.thesis.value, 'Unsaved AAPL draft');
  assert.equal(h.document.activeElement, field); assert.deepEqual([field.selectionStart, field.selectionEnd], [2, 7]);
  assert.equal(h.selected.querySelector('.alert-toggle-form'), alert);
  assert.equal(checkbox.checked, true);
  assert.equal(alert.querySelector('.field-status').textContent, 'Unsubmitted checkbox choice');
  assert.equal(otherForm.isConnected, true);
});

test('the journal readout refresh reaches every matching note wrapper and leaves each editor intact', () => {
  const h = harness();
  const forms = [h.noteForm], wrappers = [h.selected.querySelector('.asset-thesis-wrapper')];
  for (let copy = 0; copy < 2; copy++) {
    const holder = h.document.createElement('section');
    holder.innerHTML = h.context.assetThesisCard(h.assets[0]); h.document.body.appendChild(holder);
    forms.push(holder.querySelector('.asset-note-form')); wrappers.push(holder.querySelector('.asset-thesis-wrapper'));
  }
  forms.forEach((form, index) => { form.elements.thesis.value = 'Editor contents ' + index; });
  h.context.JOURNAL.notes['us:AAPL'] = { thesis: 'New shared saved thesis', invalidation: 'New shared saved condition' };
  h.context.refreshAssetJournalReadouts(h.assets[0]);
  wrappers.forEach((wrapper, index) => {
    assert.match(wrapper.querySelector('.asset-thesis').textContent, /New shared saved thesis/);
    assert.match(wrapper.querySelector('.asset-thesis').textContent, /New shared saved condition/);
    assert.equal(wrapper.querySelector('.asset-note-form'), forms[index]);
    assert.equal(forms[index].elements.thesis.value, 'Editor contents ' + index);
  });
});

test('a changed stop adds the new suggestion and preserves an enabled old rule with explicit previous context', () => {
  const h = harness(), form = h.noteForm;
  const alert = h.selected.querySelector('.alert-toggle-form'), checkbox = alert.querySelector('input[type="checkbox"]');
  const id = ['us', 'AAPL', alert.dataset.trigger.toLowerCase()].join(':');
  h.context.JOURNAL.alerts.push({ id, enabled: true }); checkbox.checked = true;
  const status = alert.querySelector('.field-status'); status.textContent = 'Old rule still enabled';
  h.assets[0].decision.activeSignal.stop = 95;
  h.context.renderSelectedAssetDetail(h.assets[0]);
  const alerts = h.selected.querySelectorAll('.alert-toggle-form');
  assert.equal(form, h.selected.querySelector('.asset-note-form'));
  assert.ok(alerts.includes(alert)); assert.equal(checkbox, alert.querySelector('input[type="checkbox"]'));
  assert.equal(checkbox.checked, true); assert.equal(status.textContent, 'Old rule still enabled');
  assert.equal(alert.dataset.suggestionState, 'previous');
  assert.ok(alert.querySelector('.alert-rule-context')?.textContent.trim(), 'the retained old rule needs a visible explanation');
  assert.ok(alerts.some(node => node !== alert && node.dataset.trigger.includes('95')));
  assert.match(h.selected.querySelector('.asset-thesis').textContent, /95/);
});

test('unchanged matching rules retain node state and obsolete inactive untouched rules are removed', () => {
  const h = harness(), alert = h.selected.querySelector('.alert-toggle-form');
  const checkbox = alert.querySelector('input[type="checkbox"]'); checkbox.checked = false;
  h.context.renderSelectedAssetDetail(h.assets[0]);
  assert.equal(h.selected.querySelector('.alert-toggle-form'), alert);
  h.assets[0].decision.activeSignal.stop = 96;
  h.context.renderSelectedAssetDetail(h.assets[0]);
  assert.equal(alert.isConnected, false);
  assert.ok(h.selected.querySelectorAll('.alert-toggle-form').some(node => node.dataset.trigger.includes('96')));
});

test('an obsolete focused or locally changed rule remains a previous suggestion without losing its checkbox', () => {
  for (const protection of ['focus', 'draft']) {
    const h = harness(), alert = h.selected.querySelector('.alert-toggle-form'), checkbox = alert.querySelector('input[type="checkbox"]');
    if (protection === 'focus') checkbox.focus(); else checkbox.checked = true;
    h.assets[0].decision.activeSignal.stop = 97;
    h.context.renderSelectedAssetDetail(h.assets[0]);
    assert.equal(alert.isConnected, true, protection + ' must preserve the old form');
    assert.equal(alert.dataset.suggestionState, 'previous');
    assert.equal(alert.querySelector('input[type="checkbox"]'), checkbox);
    if (protection === 'focus') assert.equal(h.document.activeElement, checkbox);
    else assert.equal(checkbox.checked, true);
    assert.ok(alert.querySelector('.alert-rule-context')?.textContent.trim());
  }
});

test('a successful journal GET refreshes saved readouts and research while retaining dirty text, selection, tabs and alarm choice', async () => {
  for (const localChoice of [true, false]) {
    const h = harness(), form = h.noteForm, summary = h.selected.querySelector('.asset-thesis');
    const field = h.input(form, 'thesis', 'Local draft during journal reread'); field.focus(); field.setSelectionRange(6, 14);
    const alert = h.selected.querySelector('.alert-toggle-form'), checkbox = alert.querySelector('input[type="checkbox"]');
    const id = ['us', 'AAPL', alert.dataset.trigger.toLowerCase()].join(':');
    const previousSavedChoice = !localChoice;
    h.context.JOURNAL.alerts = [{ id, enabled: previousSavedChoice }]; checkbox.checked = localChoice;
    const selectedTab = h.selected.querySelectorAll('[data-asset-tab]').find(tab => tab.getAttribute('aria-selected') === 'true');
    const notePanel = h.selected.querySelector('[data-asset-panel="notes"]');
    const disclosure = h.document.createElement('details'); disclosure.open = true; notePanel.appendChild(disclosure);
    const hiddenPanels = h.selected.querySelectorAll('[data-asset-panel]').map(panel => [panel, panel.hidden]);
    const pending = h.context.loadJournal();
    assert.equal(h.reads.length, 1); assert.equal(h.reads[0].url, '/api/journal');
    assert.equal(h.reads[0].options.cache, 'no-store'); assert.equal(h.requests.length, 0, 'retry is read-only');
    h.finishRead({
      notes: { 'us:AAPL': { thesis: 'Remote saved thesis', invalidation: 'Remote saved condition' } },
      alerts: [{ id, enabled: previousSavedChoice }], predictions: [], _revision: 'remote-r3',
    });
    assert.equal(await pending, true);
    assert.equal(h.context.JOURNAL._revision, 'remote-r3');
    assert.equal(h.context.JOURNAL.notes['us:AAPL'].thesis, 'Remote saved thesis');
    assert.equal(form, h.selected.querySelector('.asset-note-form'));
    assert.equal(summary, h.selected.querySelector('.asset-thesis'));
    assert.equal(form.elements.thesis, field); assert.equal(field.value, 'Local draft during journal reread');
    assert.equal(form.elements.invalidation.value, 'Remote saved condition');
    assert.equal(h.document.activeElement, field); assert.deepEqual([field.selectionStart, field.selectionEnd], [6, 14]);
    assert.match(summary.textContent, /Tez taslağınız.*Local draft during journal reread/);
    assert.match(summary.textContent, /Kayıtlı bozulma koşulu.*Remote saved condition/);
    assert.doesNotMatch(h.selected.querySelector('[data-asset-panel="research"]').textContent, /Kayıtlı tez notu eksik|Kayıtlı tez bozulma koşulu eksik/);
    assert.match(h.selected.querySelector('[data-asset-panel="research"]').textContent, /Remote saved thesis/);
    assert.equal(alert, h.selected.querySelector('.alert-toggle-form'));
    assert.equal(alert.querySelector('input[type="checkbox"]'), checkbox); assert.equal(checkbox.checked, localChoice);
    assert.match(alert.querySelector('.field-status').textContent, /Taslak seçim; henüz kaydedilmedi/);
    assert.equal(h.selected.querySelectorAll('[data-asset-tab]').find(tab => tab.getAttribute('aria-selected') === 'true'), selectedTab);
    hiddenPanels.forEach(([panel, hidden]) => assert.equal(panel.hidden, hidden));
    assert.equal(notePanel, h.selected.querySelector('[data-asset-panel="notes"]'));
    assert.equal(disclosure.open, true); assert.equal(disclosure.isConnected, true);
    assert.equal(h.selected.querySelector('.journal-load-status').hidden, true);
    assert.equal(h.context.journalReadRequest, null);
  }
});

test('a journal GET without local alarm changes uses server truth and refreshes every existing asset note wrapper', async () => {
  const h = harness(), alert = h.selected.querySelector('.alert-toggle-form'), checkbox = alert.querySelector('input[type="checkbox"]');
  const id = ['us', 'AAPL', alert.dataset.trigger.toLowerCase()].join(':');
  assert.equal(checkbox.checked, false);
  const holder = h.document.createElement('section');
  holder.innerHTML = h.context.assetThesisCard(h.assets[1]); h.document.body.appendChild(holder);
  const otherForm = holder.querySelector('.asset-note-form');
  const pending = h.context.loadJournal();
  h.finishRead({ notes: {
    'us:AAPL': { thesis: 'New AAPL source thesis', invalidation: 'New AAPL source condition' },
    'us:MSFT': { thesis: 'New MSFT source thesis', invalidation: 'New MSFT source condition' },
  }, alerts: [{ id, enabled: true }], predictions: [], _revision: 'remote-r4' });
  assert.equal(await pending, true);
  assert.equal(h.requests.length, 0); assert.equal(h.reads.length, 1);
  assert.equal(checkbox.checked, true); assert.equal(alert.querySelector('.field-status').textContent, '');
  assert.equal(h.selected.querySelector('.alert-toggle-form'), alert);
  assert.match(h.selected.querySelector('.asset-thesis').textContent, /Kayıtlı tez.*New AAPL source thesis/);
  assert.match(holder.querySelector('.asset-thesis').textContent, /Kayıtlı tez.*New MSFT source thesis/);
  assert.equal(holder.querySelector('.asset-note-form'), otherForm);
  assert.equal(otherForm.elements.thesis.value, 'New MSFT source thesis');
});

test('a cleared note draft does not borrow the technical suggestion under a user-draft heading', () => {
  const h = harness();
  h.context.JOURNAL.notes['us:AAPL'] = { thesis: 'Still saved thesis', invalidation: 'Still saved condition' };
  h.input(h.noteForm, 'thesis', ''); h.input(h.noteForm, 'invalidation', '   ');
  h.context.refreshAssetJournalReadouts(h.assets[0]);
  const summary = h.selected.querySelector('.asset-thesis');
  assert.match(summary.textContent, /Tez taslağınız boş; kayıtlı not henüz silinmedi/);
  assert.match(summary.textContent, /Bozulma taslağınız boş; kayıtlı not henüz silinmedi/);
  assert.doesNotMatch(summary.textContent, /Synthetic technical summary|Still saved thesis|Still saved condition/);
  assert.equal(h.noteForm.elements.thesis.value, '');
  assert.equal(h.context.JOURNAL.notes['us:AAPL'].thesis, 'Still saved thesis');
});

test('a saved obsolete alarm remains visible when a note surface is created anew', () => {
  const h = harness();
  const old = { id: 'us:AAPL:old stop < 85', trigger: 'Old stop < 85', action: 'Check prior thesis', enabled: true };
  h.context.JOURNAL.alerts.push(old, { id: 'us:MSFT:other rule', enabled: true }, { id: 'us:AAPL:disabled rule', enabled: false });
  const holder = h.document.createElement('section'); holder.innerHTML = h.context.alertRulesCard(h.assets[0]); h.document.body.appendChild(holder);
  const previous = holder.querySelectorAll('.alert-toggle-form').filter(form => form.dataset.suggestionState === 'previous');
  assert.equal(previous.length, 1);
  assert.equal(previous[0].dataset.trigger, old.trigger);
  assert.equal(previous[0].querySelector('input[type="checkbox"]').checked, true);
  assert.match(previous[0].querySelector('.alert-rule-context').textContent, /Kayıtlı kural; güncel teknik önerilerde yer almıyor/);
  assert.doesNotMatch(holder.textContent, /other rule|disabled rule/);
});

test('a journal reread adds a remote saved obsolete alarm once and allows it to be disabled by its original ID', async () => {
  const h = harness(), form = h.noteForm;
  const oldId = 'us:AAPL:remote prior rule';
  const pending = h.context.loadJournal();
  h.finishRead({ notes: {}, alerts: [{ id: oldId, enabled: true }], predictions: [], _revision: 'r3' });
  assert.equal(await pending, true);
  h.context.refreshAssetJournalReadouts(h.assets[0]); h.context.refreshAssetJournalReadouts(h.assets[0]);
  const previous = h.selected.querySelectorAll('.alert-toggle-form').filter(form => form.dataset.trigger === 'remote prior rule');
  assert.equal(previous.length, 1, 'repeat readout refreshes cannot duplicate a retained saved alarm');
  const checkbox = previous[0].querySelector('input[type="checkbox"]');
  assert.equal(checkbox.checked, true);
  checkbox.checked = false;
  const saving = h.listeners.change({ target: checkbox });
  assert.equal(h.requests.length, 1);
  assert.ok(!h.requests[0].body.alerts.some(alert => alert.id === oldId));
  h.finish(); await saving;
  assert.equal(h.selected.querySelector('.asset-note-form'), form);
  assert.equal(checkbox.checked, false);
  assert.equal(h.context.JOURNAL.alerts.some(alert => alert.id === oldId), false);
});

test('current technical alert templates and saved rule text have distinct provenance without rewriting saved text', () => {
  const h = harness();
  let alert = h.selected.querySelector('.alert-toggle-form');
  assert.equal(alert.dataset.actionSource, 'model');
  assert.match(alert.querySelector('.alert-rule-context').textContent, /Teknik takip taslağı; henüz kaydedilmedi/);
  const id = ['us', 'AAPL', alert.dataset.trigger.toLowerCase()].join(':');
  const savedAction = 'My saved plan: inspect position < 5%';
  h.context.JOURNAL.alerts = [{ id, enabled: true, action: savedAction }];
  const holder = h.document.createElement('section'); holder.innerHTML = h.context.alertRulesCard(h.assets[0]); h.document.body.appendChild(holder);
  const newForm = holder.querySelector('.alert-toggle-form');
  assert.equal(newForm.dataset.actionSource, 'saved'); assert.equal(newForm.dataset.action, savedAction);
  assert.equal(newForm.querySelector('div > span').textContent, savedAction);
  assert.match(newForm.querySelector('.alert-rule-context').textContent, /Kayıtlı takip kuralı; kayıtlı metin korunuyor/);
  h.context.refreshAssetJournalReadouts(h.assets[0]);
  assert.equal(h.selected.querySelector('.alert-toggle-form'), alert, 'the original editor node stays intact');
  assert.equal(alert.dataset.actionSource, 'saved'); assert.equal(alert.dataset.action, savedAction);
  assert.equal(alert.querySelector('div > span').textContent, savedAction);
  assert.equal(h.context.JOURNAL.alerts[0].action, savedAction);
});

test('saving a technical alert changes its visible provenance while preserving the dirty note and checkbox node', async () => {
  const h = harness(), form = h.noteForm, field = h.input(form, 'thesis', 'Unsaved personal note');
  field.focus(); field.setSelectionRange(2, 8);
  const alert = h.selected.querySelector('.alert-toggle-form'), checkbox = alert.querySelector('input[type="checkbox"]');
  const modelAction = alert.dataset.action;
  assert.doesNotMatch(modelAction, /Tez bozuldu|pozisyonu azalt veya kapat/);
  checkbox.checked = true;
  const pending = h.listeners.change({ target: checkbox }); h.finish(); await pending;
  assert.equal(h.selected.querySelector('.alert-toggle-form'), alert);
  assert.equal(alert.querySelector('input[type="checkbox"]'), checkbox);
  assert.equal(alert.dataset.actionSource, 'saved');
  assert.equal(alert.dataset.action, modelAction);
  assert.match(alert.querySelector('.alert-rule-context').textContent, /Kayıtlı takip kuralı/);
  assert.equal(h.context.JOURNAL.alerts[0].action, modelAction);
  assert.equal(h.selected.querySelector('.asset-note-form'), form);
  assert.equal(field.value, 'Unsaved personal note'); assert.equal(h.document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [2, 8]);
  assert.equal(h.requests.length, 1, 'readout refresh does not write a second journal revision');
});
