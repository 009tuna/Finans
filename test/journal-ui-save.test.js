const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const stateCode = source.slice(source.indexOf('function validJournalPayload('), source.indexOf('async function loadJournal()'));
const saveCode = source.slice(source.indexOf('async function saveJournal()'), source.indexOf('async function loadPortfolio()'));
const cardCode = source.slice(source.indexOf('function assetThesisSummaryHtml('), source.indexOf('function assetResearchCard('));
const eventsCode = source.slice(source.indexOf('// Delegated event listeners for note-saving'));

function harness() {
  const listeners = {};
  const forms = [];
  const requests = [];
  const document = {
    addEventListener(type, handler) { listeners[type] = handler; },
    getElementById() { return null; },
    querySelectorAll(selector) {
      if (selector === '.asset-note-form') return forms.filter((form) => form.kind === 'note');
      if (selector === '.alert-toggle-form') return forms.filter((form) => form.kind === 'alert');
      if (selector === '.asset-note-form button[type="submit"], .alert-toggle-form input[type="checkbox"]') return forms.map((form) => form.control);
      return [];
    },
  };
  const context = {
    document, console: { error() {} }, window: {}, DATA: {}, portfolioData: null, activeView: 'us',
    esc: (value) => String(value),
    authedFetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, body: JSON.parse(options.body), resolve, reject });
    }),
  };
  vm.createContext(context);
  vm.runInContext(`let JOURNAL = { notes: {}, alerts: [], predictions: [], _revision: 'r1' };
    let JOURNAL_READY = true;
    let journalState = 'ready';
    let journalSaving = false;
    const noteDrafts = Object.create(null);
    ${stateCode}
    ${saveCode}
    ${cardCode}
    ${eventsCode}
    globalThis.inspect = () => JSON.parse(JSON.stringify({ JOURNAL, noteDrafts, journalSaving }));
    globalThis.noteCard = assetThesisCard;
    globalThis.alertCard = alertRulesCard;`, context);

  function note(symbol = 'AAPL') {
    const status = { textContent: '' };
    const control = { disabled: false };
    const form = {
      kind: 'note', dataset: { market: 'us', symbol }, control, status,
      elements: { thesis: { name: 'thesis', value: 'first thesis' }, invalidation: { name: 'invalidation', value: 'first stop' } },
      closest(selector) { return selector === '.asset-note-form' ? this : null; },
      querySelector(selector) { return selector.includes('status') ? status : control; },
    };
    Object.values(form.elements).forEach((field) => { field.closest = (selector) => selector.includes('asset-note-form') ? (selector.includes(',') ? field : form) : null; });
    forms.push(form);
    return form;
  }
  function alert(symbol = 'AAPL', trigger = 'stop') {
    const status = { textContent: '' };
    const form = {
      kind: 'alert', dataset: { market: 'us', symbol, trigger, action: 'review' }, status,
      classList: { add() {}, remove() {} },
      querySelector(selector) { return selector.includes('status') ? status : this.control; },
    };
    const checkbox = { disabled: false, checked: true, closest(selector) { return selector.includes('input[') ? this : form; } };
    form.control = checkbox;
    forms.push(form);
    return form;
  }
  const submit = (form) => listeners.submit({ target: form, preventDefault() {} });
  const toggle = (form) => listeners.change({ target: form.control });
  const input = (form, field, value) => { form.elements[field].value = value; listeners.input({ target: form.elements[field] }); };
  function finish(index = requests.length - 1, ok = true) {
    const request = requests[index];
    const result = ok ? { ...request.body, _revision: 'r' + (index + 2) } : { error: 'conflict' };
    request.resolve({ ok, json: async () => result });
  }
  return { context, forms, requests, note, alert, submit, toggle, input, finish, inspect: context.inspect };
}

(async () => {
  // A second event and another kind of journal mutation cannot start a parallel POST.
  const h = harness();
  const alarm = h.alert();
  const otherAlarm = h.alert('MSFT');
  const note = h.note();
  const pending = h.toggle(alarm);
  assert.equal(h.requests.length, 1);
  assert.ok(alarm.control.disabled && otherAlarm.control.disabled && note.control.disabled);
  alarm.control.checked = false;
  await h.toggle(alarm);
  assert.equal(alarm.control.checked, true, 'blocked duplicate event restores pending alert state');
  await h.toggle(otherAlarm);
  await h.submit(note);
  assert.equal(h.requests.length, 1);
  assert.equal(otherAlarm.control.checked, false, 'blocked other rule restores journal value');
  assert.match(note.status.textContent, /Başka bir kayıt/);
  assert.equal(Object.keys(h.inspect().JOURNAL.notes).length, 0, 'guard runs before mutation');
  assert.match(h.context.noteCard({ market: 'us', symbol: 'MSFT' }), /type="submit"[^>]*disabled/);
  h.context.window.FinansActionLayer = { buildAlertRules: () => [{ trigger: 'stop', action: 'review' }] };
  assert.match(h.context.alertCard({ market: 'us', symbol: 'MSFT' }), /type="checkbox"[^>]*disabled/);
  h.finish();
  await pending;
  assert.ok(h.forms.every((form) => !form.control.disabled));
  assert.equal(h.inspect().JOURNAL._revision, 'r2');

  // Editing during a pending note save remains a draft; the submitted snapshot alone is persisted.
  const saved = h.submit(note);
  await h.submit(note);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].body._revision, 'r2', 'next request uses server revision');
  h.input(note, 'thesis', 'new thesis while pending');
  h.finish();
  await saved;
  assert.equal(h.inspect().JOURNAL.notes['us:AAPL'].thesis, 'first thesis');
  assert.equal(h.inspect().noteDrafts['us:AAPL'].thesis, 'new thesis while pending');
  assert.match(note.status.textContent, /AAPL notu kaydedildi.*Yeni değişiklikler taslak/);
  assert.match(h.context.noteCard({ market: 'us', symbol: 'AAPL' }), /new thesis while pending/);
  const nextSave = h.submit(note);
  h.finish();
  await nextSave;
  assert.equal(h.inspect().noteDrafts['us:AAPL'], undefined);
  assert.equal(h.inspect().JOURNAL.notes['us:AAPL'].thesis, 'new thesis while pending');
  assert.match(note.status.textContent, /AAPL tez ve takip notu kaydedildi/);

  // A failed note POST restores saved data and preserves the most recent input for retry.
  h.input(note, 'invalidation', 'new stop');
  const failedSave = h.submit(note);
  h.input(note, 'thesis', 'edited after request');
  h.finish(undefined, false);
  await failedSave;
  assert.equal(h.inspect().JOURNAL.notes['us:AAPL'].invalidation, 'first stop');
  assert.equal(h.inspect().noteDrafts['us:AAPL'].thesis, 'edited after request');
  assert.equal(h.inspect().journalSaving, false);
  assert.ok(h.forms.every((form) => !form.control.disabled));
  assert.match(note.status.textContent, /Taslağınız korunuyor/);

  // Returning to a re-created alert form during a failed save also restores its checked state.
  const failure = harness();
  const oldAlarm = failure.alert();
  const failedToggle = failure.toggle(oldAlarm);
  failure.forms.splice(0, 1);
  const newAlarm = failure.alert();
  failure.finish(0, false);
  await failedToggle;
  assert.equal(newAlarm.control.checked, false);
  assert.equal(newAlarm.control.disabled, false);
  assert.match(newAlarm.status.textContent, /kaydedilemedi/);
  const retry = failure.toggle(newAlarm);
  assert.equal(failure.requests.length, 2);
  failure.requests[1].reject(new Error('offline'));
  await retry;
  assert.equal(failure.inspect().journalSaving, false);
  assert.equal(newAlarm.control.disabled, false);

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html.match(/<div id="selectedAssetDetail"[^>]*>/)[0], /aria-live/);
  assert.match(source, /class="note-status" role="status" aria-live="polite"/);
  console.log('journal UI save tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
