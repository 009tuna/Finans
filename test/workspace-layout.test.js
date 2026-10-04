'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/workspace.js'), 'utf8');

// Minimal DOM fixture: exercise the complete production controller through its
// public buttons and observer, without exporting internal layout state.
function createWorkspace(options = {}) {
  let document;
  class Element {
    constructor(tag = 'div', classes = '') {
      this.nodeType = 1;
      this.tagName = tag.toUpperCase();
      this.childNodes = [];
      this.parentElement = null;
      this.attributes = {};
      this.listeners = {};
      this.dataset = {};
      this.hidden = false;
      this.className = classes;
      this.classList = {
        contains: (name) => this.className.split(/\s+/).includes(name),
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
        toggle: (name, force) => {
          const enabled = force === undefined ? !this.classList.contains(name) : force;
          const names = this.className.split(/\s+/).filter(Boolean).filter((item) => item !== name);
          if (enabled) names.push(name);
          this.className = names.join(' ');
          return enabled;
        },
      };
    }
    appendChild(node) { node.parentElement = this; this.childNodes.push(node); return node; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    prepend(node) { node.parentElement = this; this.childNodes.unshift(node); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    click() { (this.listeners.click || []).forEach((callback) => callback()); }
    focus() { document.activeElement = this; }
    contains(node) { return this === node || this.childNodes.some((child) => child.nodeType === 1 && child.contains(node)); }
    matches(selector) { return selector.startsWith('.') && this.classList.contains(selector.slice(1)); }
    closest(selector) { for (let item = this; item; item = item.parentElement) if (item.matches(selector)) return item; return null; }
    querySelectorAll(selector) {
      const matches = [];
      const walk = (node) => node.childNodes.forEach((child) => {
        if (child.nodeType !== 1) return;
        if (child.matches(selector)) matches.push(child);
        walk(child);
      });
      walk(this);
      return matches;
    }
    querySelector(selector) {
      if (selector === '.portfolio-primary-grid > .card:last-child') {
        const grid = this.querySelector('.portfolio-primary-grid');
        const last = grid && grid.childNodes.at(-1);
        return last && last.matches('.card') ? last : null;
      }
      return this.querySelectorAll(selector)[0] || null;
    }
  }
  const root = new Element('html');
  const content = new Element('main');
  const nav = new Element('button');
  const focus = new Element('button');
  const navItem = new Element('button', 'navitem');
  const icon = new Element('span', 'ni');
  const label = { nodeType: 3, textContent: '  Genel Bakış  ', remove() { this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this); } };
  navItem.append(icon, label);
  root.append(content, nav, focus, navItem);
  const views = {};
  const panelMap = {};
  const definitions = {
    overview: ['overview-workspace', 'overview-context'],
    report: ['report-layout', 'report-source-rail'],
    portfolio: ['portfolio-primary-grid', 'card'],
  };
  const addPanel = (name) => {
    const [layoutClass, panelClass] = definitions[name];
    const layout = new Element('div', layoutClass);
    const panel = new Element('aside', panelClass);
    const body = new Element('section', 'retained-content');
    const input = new Element('input');
    input.value = 'unsaved editing remains';
    body.append(input);
    panel.append(body);
    layout.append(panel);
    views[name].append(layout);
    panelMap[name] = panel;
    return panel;
  };
  Object.keys(definitions).forEach((name) => {
    views[name] = new Element('section', 'view');
    views[name].hidden = name !== 'overview';
    content.append(views[name]);
    addPanel(name);
  });
  views.market = new Element('section', 'view');
  views.market.hidden = true;
  content.append(views.market);
  document = {
    documentElement: root,
    activeElement: null,
    getElementById: (id) => ({ content, navCollapse: nav, focusWorkspace: focus })[id] || null,
    createElement: (tag) => new Element(tag),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
  };
  const saved = options.saved || new Map();
  const frames = [];
  const window = { innerWidth: options.width || 1440, listeners: {}, addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); } };
  let observed;
  const storage = {
    getItem(key) { if (options.storageUnavailable) throw new Error('storage denied'); return saved.get(key) ?? null; },
    setItem(key, value) { if (options.storageUnavailable) throw new Error('storage denied'); saved.set(key, value); },
  };
  const flush = () => {
    let count = 0;
    while (frames.length) { assert.ok(++count < 10, 'layout observer must settle without an animation frame loop'); frames.shift()(); }
  };
  vm.runInNewContext(source, {
    document, window, localStorage: storage,
    MutationObserver: class { constructor(callback) { observed = callback; } observe() {} },
    requestAnimationFrame: (callback) => { frames.push(callback); },
  });
  return {
    root, document, nav, focus, navItem, icon, saved, window, panelMap, frames,
    panel: (name) => panelMap[name],
    toggle: (name) => panelMap[name].querySelector('.aux-panel-toggle'),
    route(name) { Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; }); observed(); flush(); },
    resize(width) { window.innerWidth = width; window.listeners.resize.forEach((callback) => callback()); flush(); },
    replaceReport() { views.report.childNodes = []; const next = addPanel('report'); observed(); flush(); return next; },
    notify() { observed(); },
    flush,
  };
}

{
  const app = createWorkspace();
  assert.equal(app.nav.getAttribute('aria-expanded'), 'true');
  app.nav.click();
  assert.equal(app.root.dataset.navCompact, 'true', 'navigation shrinks after its toggle');
  assert.equal(app.nav.getAttribute('aria-expanded'), 'false', 'navigation announces collapsed state');
  assert.match(app.nav.getAttribute('aria-label'), /genişlet/, 'collapsed navigation advertises its next action');
  const reloaded = createWorkspace({ saved: app.saved });
  assert.equal(reloaded.root.dataset.navCompact, 'true', 'compact navigation survives reload');
  reloaded.nav.click();
  assert.equal(reloaded.root.dataset.navCompact, 'false', 'compact navigation can expand again');
  assert.equal(reloaded.saved.get('finans-nav-compact'), 'false');
  assert.equal(app.navItem.getAttribute('aria-label'), 'Genel Bakış', 'icon navigation retains an accessible name');
  assert.equal(app.navItem.querySelector('.nav-label').textContent, 'Genel Bakış');
  assert.ok(app.navItem.childNodes.includes(app.icon), 'label wrapping retains original navigation icon');
}

{
  const app = createWorkspace();
  const retained = app.panel('overview').querySelector('.retained-content');
  const input = retained.childNodes[0];
  input.focus();
  app.toggle('overview').click();
  assert.equal(app.toggle('overview').getAttribute('aria-expanded'), 'false');
  assert.equal(app.document.activeElement, app.toggle('overview'), 'collapse moves focus from newly hidden content to its visible control');
  assert.equal(app.panel('overview').querySelector('.retained-content'), retained, 'collapse preserves mounted content');
  assert.equal(input.value, 'unsaved editing remains', 'collapse preserves form editing');
  assert.equal(app.toggle('report').getAttribute('aria-expanded'), 'true', 'each auxiliary panel has an independent preference');
  assert.equal(app.toggle('portfolio').getAttribute('aria-expanded'), 'true');
  assert.equal(app.toggle('overview').getAttribute('aria-controls'), app.panel('overview').id);
  app.route('report');
  assert.equal(app.toggle('report').getAttribute('aria-expanded'), 'true', 'route changes preserve a different panel state');
  const reloaded = createWorkspace({ saved: app.saved });
  assert.equal(reloaded.toggle('overview').getAttribute('aria-expanded'), 'false', 'panel preferences survive reload');
  assert.equal(reloaded.toggle('report').getAttribute('aria-expanded'), 'true');
}

{
  const app = createWorkspace();
  app.toggle('portfolio').click();
  const previousPreferences = new Map(app.saved);
  app.focus.click();
  assert.equal(app.focus.getAttribute('aria-pressed'), 'true');
  assert.equal(app.root.dataset.navCompact, 'true');
  for (const name of ['overview', 'report', 'portfolio']) assert.equal(app.toggle(name).getAttribute('aria-expanded'), 'false', 'focus mode collapses every auxiliary panel');
  assert.deepEqual(app.saved, previousPreferences, 'temporary focus mode does not overwrite saved panel preferences');
  app.route('report');
  app.focus.click();
  assert.equal(app.focus.getAttribute('aria-pressed'), 'false');
  assert.equal(app.root.dataset.navCompact, 'false', 'leaving focus restores original navigation width');
  assert.equal(app.toggle('overview').getAttribute('aria-expanded'), 'true');
  assert.equal(app.toggle('report').getAttribute('aria-expanded'), 'true');
  assert.equal(app.toggle('portfolio').getAttribute('aria-expanded'), 'false', 'leaving focus restores individually collapsed panels');
  assert.deepEqual(app.saved, previousPreferences);
}

{
  const app = createWorkspace();
  app.toggle('portfolio').click();
  app.focus.click();
  app.toggle('report').click();
  assert.equal(app.focus.getAttribute('aria-pressed'), 'false', 'opening an individual panel exits focus mode');
  assert.equal(app.root.dataset.navCompact, 'false', 'opening a focus-hidden panel restores the previous navigation width');
  assert.equal(app.saved.has('finans-nav-compact'), false, 'opening a focus-hidden panel does not rewrite navigation preference');
  assert.equal(app.toggle('report').getAttribute('aria-expanded'), 'true', 'requested panel expands after exiting focus');
  assert.equal(app.toggle('portfolio').getAttribute('aria-expanded'), 'false', 'exiting focus retains another panel collapse preference');
  const compact = createWorkspace({ saved: new Map([['finans-nav-compact', 'true']]) });
  compact.focus.click();
  compact.toggle('overview').click();
  assert.equal(compact.root.dataset.navCompact, 'true', 'opening a focus-hidden panel also preserves a previously compact navigation');
}

{
  const app = createWorkspace({ storageUnavailable: true });
  assert.doesNotThrow(() => { app.nav.click(); app.toggle('report').click(); app.focus.click(); app.focus.click(); });
  assert.equal(app.root.dataset.navCompact, 'true', 'navigation remains usable when browser storage is unavailable');
  assert.equal(app.toggle('report').getAttribute('aria-expanded'), 'false', 'panels remain usable when browser storage is unavailable');
  const corrupt = createWorkspace({ saved: new Map([['finans-nav-compact', '{'], ['finans-aux-panels', '[]']]) });
  assert.equal(corrupt.root.dataset.navCompact, 'false', 'invalid saved preferences use a working default');
  assert.equal(corrupt.toggle('overview').getAttribute('aria-expanded'), 'true');
}

{
  const app = createWorkspace();
  app.route('report');
  app.toggle('report').click();
  const replacement = app.replaceReport();
  const button = app.toggle('report');
  assert.equal(replacement.querySelectorAll('.aux-panel-heading').length, 1, 'async report replacement receives exactly one heading');
  assert.equal(button.getAttribute('aria-expanded'), 'false', 'async report replacement inherits saved collapse state');
  app.notify(); app.notify();
  assert.equal(app.frames.length, 1, 'multiple content mutations are batched into one layout update');
  app.flush();
  assert.equal(replacement.querySelectorAll('.aux-panel-heading').length, 1, 'observer refresh does not duplicate controls');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true', 'remounted report control remains interactive');
  assert.equal(app.saved.get('finans-aux-panels'), '{"report":false}');
}

{
  const app = createWorkspace({ width: 390 });
  assert.equal(app.focus.hidden, false, 'mobile routes with auxiliary panels expose focus control');
  app.route('market');
  assert.equal(app.focus.hidden, true, 'mobile routes without auxiliary panels omit an idle focus control');
  app.resize(1440);
  assert.equal(app.focus.hidden, false, 'desktop focus control stays available for navigation width');
  app.resize(390);
  app.route('overview');
  assert.equal(app.focus.hidden, false, 'returning to a panel route restores mobile focus control');
  app.focus.click();
  app.route('market');
  assert.equal(app.focus.hidden, false, 'mobile route without a panel still exposes an exit while focus mode is active');
  assert.equal(app.focus.getAttribute('aria-pressed'), 'true');
  app.focus.click();
  assert.equal(app.focus.getAttribute('aria-pressed'), 'false', 'mobile focus mode remains escapable after a route change');
  assert.equal(app.focus.hidden, true, 'idle focus control hides again when its mobile route has no panel');
  app.route('overview');
  assert.equal(app.toggle('overview').getAttribute('aria-expanded'), 'true', 'mobile focus exit restores the panel on return');
}

{
  const app = createWorkspace();
  app.route('portfolio');
  app.toggle('portfolio').click();
  app.toggle('report').click();
  app.focus.click();
  const draft = app.panel('portfolio').querySelector('.retained-content').childNodes[0];
  assert.equal(app.window.FinansWorkspace.openPanel('portfolio'), true);
  assert.equal(app.focus.getAttribute('aria-pressed'), 'false', 'editing exits focus mode');
  assert.equal(app.toggle('portfolio').getAttribute('aria-expanded'), 'true', 'editing reveals its target panel');
  assert.equal(app.toggle('report').getAttribute('aria-expanded'), 'false', 'editing retains other panel preferences');
  assert.equal(draft.value, 'unsaved editing remains', 'opening the editor preserves its draft');
  assert.equal(app.window.FinansWorkspace.openPanel('unknown'), false, 'unknown panels do not alter layout');
}

console.log('workspace layout: navigation and panel persistence, focus restoration, keyboard focus, storage failures, route changes, editing reveal and async remount passed');
