'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const start = app.indexOf('function renderScreenerView()');
const end = app.indexOf('function navigateToAsset', start);
assert.ok(start >= 0 && end > start, 'screener renderer exists');
const source = app.slice(start, end);

function fixture(initialState = {}) {
  let document;
  let renderCount = 0;
  let savedRoutes = 0;
  const focusCalls = [];

  class Element {
    constructor(tag, attributes = {}) {
      this.tagName = tag.toUpperCase();
      this.attributes = { ...attributes };
      this.id = attributes.id || '';
      this.className = attributes.class || '';
      this.disabled = Object.hasOwn(attributes, 'disabled');
      this.tabIndex = attributes.tabindex === undefined ? undefined : Number(attributes.tabindex);
      this.value = attributes.value || '';
      this.dataset = {};
      this.children = [];
      this.listeners = {};
      for (const [name, value] of Object.entries(attributes)) {
        if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      }
    }
    appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
    insertBefore(node, reference) {
      node.parentElement = this;
      const index = this.children.indexOf(reference);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
    }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
      const attribute = selector.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      if (attribute) return Object.hasOwn(this.attributes, attribute[1]) && (attribute[2] === undefined || this.attributes[attribute[1]] === attribute[2]);
      return this.tagName.toLowerCase() === selector;
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => (child.matches(selector) ? [child] : []).concat(child.querySelectorAll(selector)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'tabindex') this.tabIndex = Number(value);
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    dispatch(type) {
      assert.ok(!this.disabled, 'the fixture only activates enabled controls');
      for (const handler of this.listeners[type] || []) handler({ target: this, preventDefault() {} });
    }
    focus(options) {
      if (this.disabled) return;
      assert.ok(document.body.contains(this), 'removed controls cannot receive restored focus');
      focusCalls.push({ element: this, options });
      document.activeElement = this;
    }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    get innerHTML() { return this.html || ''; }
    set innerHTML(html) {
      // Replacing real DOM children sends focus on a removed child back to the body.
      if (this.contains(document.activeElement) && document.activeElement !== this) document.activeElement = document.body;
      this.children.forEach((child) => { child.parentElement = null; });
      this.children = [];
      this.html = html;
      renderCount++;
      for (const match of html.matchAll(/<(input|select|button|span)\b([^>]*)>/g)) {
        const attributes = {};
        for (const attribute of match[2].matchAll(/([^\s=]+)(?:\s*=\s*"([^"]*)")?/g)) attributes[attribute[1]] = attribute[2] ?? '';
        if (!attributes.id && !Object.keys(attributes).some((name) => name.startsWith('data-'))) continue;
        const node = new Element(match[1], attributes);
        const closing = html.indexOf('</' + match[1] + '>', match.index + match[0].length);
        node.textContent = closing < 0 ? '' : html.slice(match.index + match[0].length, closing).replace(/<[^>]*>/g, '');
        this.appendChild(node);
      }
    }
  }

  const body = new Element('body');
  const view = body.appendChild(new Element('section', { id: 'view-screener' }));
  const mount = view.appendChild(new Element('div', { id: 'screenerTableMount' }));
  const oldGrid = view.appendChild(new Element('div', { class: 'screener-grid' }));
  const outside = body.appendChild(new Element('button', { id: 'outsideControl' }));
  document = {
    body, activeElement: body,
    createElement: (tag) => new Element(tag),
    getElementById: (id) => body.querySelector('#' + id),
    querySelector: (selector) => body.querySelector(selector),
  };
  const assets = (count, prefix) => Array.from({ length: count }, (_, index) => ({
    symbol: prefix + String(index).padStart(3, '0'), name: 'Şirket ' + index,
    price: 100 + index, currency: prefix === 'BIST' ? 'TRY' : 'USD', changePct: index,
    analysis: { score: 90 - index }, ind: { rsi: 32, signals: {} },
  }));
  const context = vm.createContext({
    document, console,
    DATA: { us: assets(40, 'AAA'), bist: assets(15, 'BIST'), crypto: assets(15, 'COIN') },
    screenerState: { query: '', market: 'all', category: 'all', sort: 'score', page: 1, pageSize: 25, ...initialState },
    $: (selector) => document.querySelector(selector),
    esc: (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    fmtPrice: (value) => String(value),
    saveRouteUi: () => { savedRoutes++; },
    navigateToAsset() {}, setView() {}, setTimeout() {}, Event: class Event {},
  });
  vm.runInContext(source, context);
  return {
    context, document, mount, outside, oldGrid, focusCalls, Element,
    control: (id) => document.getElementById(id),
    render: () => context.renderScreenerView(),
    get renderCount() { return renderCount; },
    get savedRoutes() { return savedRoutes; },
  };
}

function activate(state, id, type, value) {
  const original = state.control(id);
  original.focus();
  if (value !== undefined) original.value = value;
  original.dispatch(type);
  assert.notEqual(state.control(id), original, 'rerender creates a new ' + id + ' node');
  return original;
}

function assertRestored(state, id) {
  const control = state.control(id);
  assert.equal(state.document.activeElement, control, id + ' keeps keyboard focus after replacing the toolbar');
  const call = state.focusCalls.at(-1);
  assert.equal(call.element, control);
  assert.equal(call.options?.preventScroll, true, 'restoring focus does not jump the page');
}

for (const [id, key, value] of [
  ['screenerMarket', 'market', 'us'],
  ['screenerCategory', 'category', 'Aşırı satım'],
  ['screenerPageSize', 'pageSize', '50'],
]) {
  const state = fixture({ page: 2 });
  state.render();
  activate(state, id, 'change', value);
  assert.equal(state.context.screenerState[key], key === 'pageSize' ? Number(value) : value);
  assert.equal(state.context.screenerState.page, 1, 'changing a filter starts on the first result page');
  assertRestored(state, id);
  assert.equal(state.renderCount, 2);
}

const clear = fixture({ query: 'AAA', market: 'us', category: 'Aşırı satım', sort: 'name', pageSize: 50 });
clear.render();
activate(clear, 'screenerClear', 'click');
assert.deepEqual(JSON.parse(JSON.stringify(clear.context.screenerState)), { query: '', market: 'all', category: 'all', sort: 'score', page: 1, pageSize: 50 });
assertRestored(clear, 'screenerClear');

const pagination = fixture();
pagination.render();
activate(pagination, 'screenerNext', 'click');
assert.equal(pagination.context.screenerState.page, 2);
assertRestored(pagination, 'screenerNext');
activate(pagination, 'screenerNext', 'click');
assert.equal(pagination.context.screenerState.page, 3);
assert.equal(pagination.control('screenerNext').disabled, true);
assertRestored(pagination, 'screenerPageStatus');
assert.equal(pagination.control('screenerPageStatus').tabIndex, -1, 'pagination status can receive fallback focus without joining the tab order');
assert.match(pagination.control('screenerPageStatus').textContent, /70 sonuç · Sayfa 3\/3/);
activate(pagination, 'screenerPrev', 'click');
assert.equal(pagination.context.screenerState.page, 2);
assertRestored(pagination, 'screenerPrev');
activate(pagination, 'screenerPrev', 'click');
assert.equal(pagination.context.screenerState.page, 1);
assert.equal(pagination.control('screenerPrev').disabled, true);
assertRestored(pagination, 'screenerPageStatus');

const removed = fixture();
removed.render();
const removedControl = removed.mount.appendChild(new removed.Element('button', { id: 'obsoleteScreenerControl' }));
removedControl.focus();
removed.render();
assert.equal(removed.control('obsoleteScreenerControl'), null);
assertRestored(removed, 'screenerPageStatus');

const outside = fixture();
outside.outside.focus();
const externalFocusCount = outside.focusCalls.length;
outside.render();
outside.render();
assert.equal(outside.document.activeElement, outside.outside, 'refreshing the screener never steals focus from another workspace control');
assert.equal(outside.focusCalls.length, externalFocusCount);
assert.equal(outside.oldGrid.hidden, true);

const search = fixture();
search.render();
const input = search.control('screenerQuery');
input.focus(); input.value = 'AAA00'; input.selectionStart = 3;
input.dispatch('input');
assert.equal(search.document.activeElement, search.control('screenerQuery'));
assert.equal(search.context.screenerState.query, 'AAA00');
assert.equal(search.control('screenerQuery').selectionStart, 3, 'search keeps its caret position while results change');
assert.equal(search.control('screenerQuery').selectionEnd, 3);

const sort = fixture({ page: 2 });
sort.render();
const originalSort = sort.mount.querySelector('[data-screen-sort="name"]');
originalSort.focus(); originalSort.dispatch('click');
const newSort = sort.mount.querySelector('[data-screen-sort="name"]');
assert.notEqual(newSort, originalSort);
assert.equal(sort.document.activeElement, newSort, 'sorting retains focus on the matching new header button');
assert.equal(sort.context.screenerState.sort, 'name');
assert.equal(sort.context.screenerState.page, 1);
assert.equal(sort.savedRoutes, 1, 'sorting still saves its route state');

console.log('screener focus: filters, clear, pagination, disabled and removed fallback, outside focus, search caret and sorting passed');
