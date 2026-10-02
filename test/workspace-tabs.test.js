'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const start = app.indexOf('function activateOverviewTask');
const end = app.indexOf('function setView', start);
assert.ok(start >= 0 && end > start, 'task selection functions exist');

function makeTabs(prefix, attr, values) {
  const panels = new Map();
  const tabs = values.map((value) => {
    const listeners = {};
    const attributes = { 'aria-controls': `${prefix}-panel-${value}` };
    const tab = {
      dataset: { [attr]: value }, attributes, listeners, focused: false,
      setAttribute(name, item) { attributes[name] = item; },
      getAttribute(name) { return attributes[name]; },
      addEventListener(name, fn) { listeners[name] = fn; },
      focus() { this.focused = true; },
    };
    panels.set(attributes['aria-controls'], { hidden: false });
    return tab;
  });
  return { tabs, panels };
}

const center = makeTabs('overview', 'overviewTab', ['decisions', 'forecasts', 'signals']);
const contextTabs = makeTabs('context', 'overviewContextTab', ['markets', 'news', 'calendar']);
const saved = new Map([['finans-overview-task', 'forecasts'], ['finans-overview-context', 'news']]);
const store = { getItem(key) { return saved.get(key) || null; }, setItem(key, value) { saved.set(key, value); } };
const document = {
  querySelectorAll(selector) { return selector === '.overview-task-tab' ? center.tabs : selector === '[data-overview-context-tab]' ? contextTabs.tabs : []; },
  getElementById(id) { return center.panels.get(id) || contextTabs.panels.get(id) || null; },
};
const sandbox = { document, sessionStorage: store };
vm.runInNewContext(app.slice(start, end), sandbox);
sandbox.overviewTaskSelection = 'invalid';
sandbox.overviewContextSelection = 'invalid';
sandbox.initOverviewTaskTabs();
sandbox.initOverviewContextTabs();
assert.equal(center.tabs[0].attributes['aria-selected'], 'true', 'invalid stored center tab falls back to decisions');
assert.equal(center.panels.get('overview-panel-decisions').hidden, false);
assert.equal(center.panels.get('overview-panel-forecasts').hidden, true);
assert.equal(contextTabs.tabs[0].attributes['aria-selected'], 'true', 'invalid context selection falls back to markets');
assert.equal(saved.get('finans-overview-task'), 'decisions');

let prevented = false;
center.tabs[0].listeners.keydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(center.tabs[1].attributes['aria-selected'], 'true', 'arrow navigation selects the next task');
assert.equal(center.tabs[1].focused, true, 'keyboard task selection moves focus to its tab');
assert.equal(center.panels.get('overview-panel-forecasts').hidden, false);
assert.equal(center.panels.get('overview-panel-decisions').hidden, true);
center.tabs[1].listeners.keydown({ key: 'End', preventDefault() {} });
assert.equal(center.tabs[2].attributes.tabindex, '0', 'End selects last tab using roving tabindex');
center.tabs[2].listeners.keydown({ key: 'Home', preventDefault() {} });
assert.equal(center.tabs[0].attributes['aria-selected'], 'true', 'Home selects first task');
center.tabs[1].listeners.click();
for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
  let modifiedPrevented = false;
  center.tabs[1].listeners.keydown({ key: 'Home', [modifier]: true, preventDefault() { modifiedPrevented = true; } });
  assert.equal(modifiedPrevented, false, `${modifier}+Home keeps native browser behavior on task tabs`);
  assert.equal(center.tabs[1].attributes['aria-selected'], 'true', `${modifier}+Home does not change task selection`);
}
contextTabs.tabs[0].listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
assert.equal(contextTabs.tabs[1].attributes['aria-selected'], 'true', 'context keyboard navigation works independently');
assert.equal(saved.get('finans-overview-context'), 'news', 'context tab selection persists for this view');
for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
  let modifiedPrevented = false;
  contextTabs.tabs[1].listeners.keydown({ key: 'Home', [modifier]: true, preventDefault() { modifiedPrevented = true; } });
  assert.equal(modifiedPrevented, false, `${modifier}+Home keeps native browser behavior on context tabs`);
  assert.equal(contextTabs.tabs[1].attributes['aria-selected'], 'true', `${modifier}+Home does not change context selection`);
}
sandbox.activateOverviewTask('forecasts');
assert.equal(saved.get('finans-overview-task'), 'forecasts', 'returning task selection remains persisted');
console.log('overview task tab keyboard, focus, fallback and session-memory tests passed');
