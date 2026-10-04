'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const source = app.slice(app.indexOf('function renderLiteracyView()'), app.indexOf('function updatePositionCalculator()'));
const literacy = html.slice(html.indexOf('id="view-literacy"'), html.indexOf('id="view-forecast"'));
const headings = [...literacy.matchAll(/<article class="editorial-section[^>]*>[\s\S]*?<h3>(.*?)<\/h3>/g)].map((match) => match[1].replace(/&amp;/g, '&'));
assert.equal(headings.length, 6, 'fixture follows all six existing guide sections, including calculator and archive');
assert.match(literacy, /id="position-calculator-state"[^>]*role="status"[^>]*aria-live="polite"/, 'calculator feedback remains available after the results');
assert.ok(literacy.indexOf('id="res-pos-amount"') < literacy.indexOf('id="position-calculator-state"'), 'calculator feedback follows its result values');
for (const id of ['calc-capital', 'calc-risk-pct', 'calc-price', 'calc-atr', 'res-entry', 'res-stop', 'res-target', 'res-risk-amount', 'res-units', 'res-pos-amount', 'tipsArchiveList']) {
  assert.equal((literacy.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' retains its existing integration hook');
}
assert.match(literacy, />Risk bütçesi<\/div>/);
assert.match(literacy, />Model adedi<\/div>/);
assert.match(literacy, /aynı para biriminde girin/);
assert.match(literacy, /100\.000 TL[\s\S]*%1 risk bütçesi[\s\S]*%20 pozisyon ağırlığı/);
assert.match(literacy, /%50 isabet tek başına kâr garanti etmez/);
assert.doesNotMatch(literacy, /%2–5|uçurur|çakar|50–70 sağlıklı|faiz indirimi tersine/i, 'guide avoids the previous unconditional claims');
assert.match(literacy, /<footer class="muted-note literacy-sources">\s*<details>\s*<summary>Kaynaklar ve ek okuma<\/summary>/, 'sources use a small closed footer rather than another article or card');
const sourceLinks = [...literacy.matchAll(/<a href="(https:[^"]+)" target="_blank" rel="noopener noreferrer">/g)].map((match) => new URL(match[1]));
assert.ok(sourceLinks.length >= 3, 'official sources remain accessible in the guide');
for (const url of sourceLinks) assert.ok(['www.finra.org', 'www.sec.gov', 'www.investor.gov', 'www.cfainstitute.org', 'rpc.cfainstitute.org', 'www.tradingview.com', 'www.bollingerbands.com'].includes(url.hostname), 'source uses a verified regulator, CFA or official indicator domain');

function fixture({ empty = false, reduceMotion = false } = {}) {
  let document;
  class Element {
    constructor(tag, classes = '') {
      this.tagName = tag.toUpperCase(); this.className = classes; this.children = []; this.listeners = {}; this.attributes = {};
    }
    appendChild(node) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
      node.parentElement = this; this.children.push(node); return node;
    }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    insertBefore(node, reference) { node.parentElement = this; this.children.splice(this.children.indexOf(reference), 0, node); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    matches(selector) { return selector.startsWith('.') ? this.className.split(/\s+/).includes(selector.slice(1)) : selector.startsWith('#') ? this.id === selector.slice(1) : this.tagName.toLowerCase() === selector; }
    querySelectorAll(selector) {
      if (selector.startsWith(':scope > ')) return this.children.filter((child) => child.matches(selector.slice(9)));
      return this.children.flatMap((child) => (child.matches(selector) ? [child] : []).concat(child.querySelectorAll(selector)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    scrollIntoView(options) { this.scrollOptions = options; }
    focus(options) { this.focusOptions = options; document.activeElement = this; }
  }
  const view = new Element('section'); view.id = 'view-literacy';
  const container = new Element('div', 'editorial-container');
  const guides = new Element('div', 'editorial-content');
  view.append(container); container.append(guides);
  const sections = (empty ? [] : headings).map((title, index) => {
    const article = new Element('article', 'editorial-section');
    const heading = new Element('h3'); heading.textContent = title;
    article.append(heading); guides.append(article);
    if (index === 0) {
      article.id = 'existing-indicator-guide';
      const grid = new Element('div', 'lit-grid'); grid.append(new Element('div', 'lit')); article.append(grid);
    }
    return article;
  });
  const inputs = Object.fromEntries(['calc-capital', 'calc-risk-pct', 'calc-price', 'calc-atr'].map((id) => {
    const input = new Element('input'); input.id = id; input.value = 'edited value'; return ['#' + id, input];
  }));
  if (sections.length) sections.at(-2).append(...Object.values(inputs));
  document = { createElement: (tag) => new Element(tag), activeElement: null };
  const context = vm.createContext({
    document, reduceMotion, calculatorListenersAttached: false, console,
    $: (selector) => selector === '#view-literacy' ? view : selector === '#view-literacy .editorial-content' ? guides : selector === '#view-literacy .lit-grid' ? view.querySelector('.lit-grid') : inputs[selector] || view.querySelector(selector),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ tipsArchive: [] }) }),
    renderTipsArchive() {}, updatePositionCalculator() {}, triggerRevealAnimations() {},
  });
  vm.runInContext(source, context);
  return { context, document, container, guides, sections, inputs, render: () => context.renderLiteracyView() };
}

for (const reduceMotion of [false, true]) {
  const state = fixture({ reduceMotion });
  const grid = state.sections[0].querySelector('.lit-grid');
  state.render();
  const nav = state.container.querySelector('#literacyContents');
  const links = nav.querySelectorAll('a');
  assert.deepEqual(links.map((link) => link.textContent), headings, 'menu targets real section headings rather than indicator card children');
  assert.equal(nav.attributes['aria-label'], 'Öğrenme konuları');
  assert.equal(state.guides.parentElement.className, 'literacy-reading-layout', 'layout wraps the complete guide instead of narrowing only its first grid');
  assert.equal(grid.parentElement, state.sections[0], 'existing guide content retains its article and reading order');
  assert.equal(links[0].href, '#existing-indicator-guide', 'existing section ids remain valid');
  links.forEach((link, index) => {
    let prevented = false;
    link.listeners.click[0]({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(link.href, '#' + state.sections[index].id);
    assert.equal(state.document.activeElement, state.sections[index], 'topic activation moves focus to its matching content');
    assert.equal(state.sections[index].tabIndex, -1);
    assert.equal(state.sections[index].scrollOptions.behavior, reduceMotion ? 'instant' : 'smooth');
    assert.equal(state.sections[index].focusOptions.preventScroll, true);
  });
  state.render();
  assert.equal(state.container.querySelectorAll('#literacyContents').length, 1, 'returning to the page does not duplicate the menu');
  assert.equal(nav.querySelectorAll('a').length, headings.length);
  for (const input of Object.values(state.inputs)) {
    assert.equal(input.value, 'edited value', 'navigation mounting preserves calculator drafts');
    assert.equal(input.listeners.input.length, 1, 'returning to the guide does not duplicate calculator listeners');
  }
}
const empty = fixture({ empty: true });
empty.render();
assert.equal(empty.container.querySelector('#literacyContents'), null, 'a guide without valid section headings does not create an empty side rail');
assert.equal(empty.guides.parentElement, empty.container);
console.log('literacy navigation: actual topics, complete reading flow, focus, motion, draft retention and repeat entry passed');
