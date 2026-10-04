'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const journalCode = source.slice(source.indexOf('let JOURNAL = '), source.indexOf('async function loadPortfolio()'));
const cardCode = source.slice(source.indexOf('function assetThesisSummaryHtml('), source.indexOf('function assetResearchCard('));
const eventCode = source.slice(source.indexOf('// Delegated event listeners for note-saving'));
const validJournal = (revision = 'r1') => ({ notes: { 'us:AAPL': { thesis: 'saved thesis', invalidation: 'saved stop' } }, alerts: [{ id: 'us:AAPL:stop', enabled: true }], predictions: [], _revision: revision });

function harness() {
  const listeners = {};
  const forms = [];
  const statuses = [{ innerHTML: '', hidden: false }, { innerHTML: '', hidden: false }];
  const reads = [];
  const writes = [];
  const context = {
    console: { error() {} },
    window: { FinansActionLayer: { buildAlertRules: () => [{ trigger: 'stop', action: 'review' }] } },
    DATA: {}, portfolioData: null, esc: (value) => String(value),
    fetch: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
    authedFetch: (url, options) => new Promise((resolve, reject) => writes.push({ resolve, reject, body: JSON.parse(options.body) })),
    document: {
      addEventListener(type, listener) { listeners[type] = listener; },
      getElementById() { return null; },
      querySelectorAll(selector) {
        if (selector === '.journal-load-status') return statuses;
        if (selector === '.asset-note-form') return forms.filter((form) => form.kind === 'note');
        if (selector === '.alert-toggle-form') return forms.filter((form) => form.kind === 'alert');
        if (selector === '.asset-note-form button[type="submit"], .alert-toggle-form input[type="checkbox"]') return forms.map((form) => form.control);
        return [];
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`let journalSaving = false; const noteDrafts = Object.create(null);
    ${journalCode} ${cardCode} ${eventCode}
    globalThis.inspect = () => JSON.parse(JSON.stringify({ JOURNAL, JOURNAL_READY, journalState, noteDrafts }));
    globalThis.reloadJournal = loadJournal;
    globalThis.noteCard = assetThesisCard;
    globalThis.alertCard = alertRulesCard;`, context);
  function note() {
    const form = {
      kind: 'note', dataset: { market: 'us', symbol: 'AAPL' }, status: { textContent: '' }, control: { disabled: false },
      elements: { thesis: { name: 'thesis', value: '' }, invalidation: { name: 'invalidation', value: '' } },
      querySelector(selector) { return selector.includes('status') ? this.status : this.control; },
      closest(selector) { return selector === '.asset-note-form' ? this : null; },
    };
    Object.values(form.elements).forEach((field) => { field.closest = (selector) => selector.includes(',') ? field : form; });
    forms.push(form);
    return form;
  }
  function alert() {
    const form = {
      kind: 'alert', dataset: { market: 'us', symbol: 'AAPL', trigger: 'stop', action: 'review' }, status: { textContent: '' },
      querySelector(selector) { return selector.includes('status') ? this.status : this.control; },
      classList: { add() {}, remove() {} },
    };
    form.control = { checked: false, disabled: false, closest(selector) { return selector.includes('input[') ? this : form; } };
    forms.push(form);
    return form;
  }
  const input = (form, name, value) => { form.elements[name].value = value; listeners.input({ target: form.elements[name] }); };
  const submit = (form) => listeners.submit({ target: form, preventDefault() {} });
  const toggle = (form) => listeners.change({ target: form.control });
  const finishRead = (value, ok = true, index = reads.length - 1) => reads[index].resolve({ ok, json: async () => value });
  const finishWrite = (value, status = 200) => writes[writes.length - 1].resolve({ ok: status >= 200 && status < 300, status, json: async () => value });
  return { context, statuses, forms, reads, writes, note, alert, input, submit, toggle, finishRead, finishWrite, inspect: context.inspect, load: context.reloadJournal };
}

(async () => {
  const first = harness();
  const note = first.note();
  const alarm = first.alert();
  const read = first.load();
  assert.ok(note.control.disabled && alarm.control.disabled);
  first.reads[0].reject(new Error('offline'));
  assert.equal(await read, false);
  assert.equal(first.inspect().journalState, 'unavailable');
  assert.match(first.statuses[0].innerHTML, /boş olduğu doğrulanmadı/);
  assert.match(first.statuses[0].innerHTML, /data-journal-retry/);
  assert.match(first.context.noteCard({ market: 'us', symbol: 'AAPL' }), /type="submit"[^>]*disabled/);
  assert.match(first.context.alertCard({ market: 'us', symbol: 'AAPL' }), /type="checkbox"[^>]*disabled/);

  // Even synthetic events cannot mutate unknown remote records or start a POST.
  first.input(note, 'thesis', 'my draft');
  await first.submit(note);
  alarm.control.checked = true;
  await first.toggle(alarm);
  assert.equal(first.writes.length, 0);
  assert.equal(Object.keys(first.inspect().JOURNAL.notes).length, 0);
  assert.equal(alarm.control.checked, false);

  // A retry updates untouched fields and saved alerts, preserving the most recent draft.
  const retry = first.load();
  const duplicate = first.load();
  assert.equal(first.reads.length, 2, 'retry reads share one in-flight request');
  first.input(note, 'thesis', 'draft edited while reading');
  first.finishRead(validJournal());
  assert.equal(await retry, true);
  assert.equal(await duplicate, true);
  assert.equal(note.elements.thesis.value, 'draft edited while reading');
  // Submitting during the outage captured the then-empty invalidation as a draft too.
  assert.equal(note.elements.invalidation.value, '');
  assert.equal(alarm.control.checked, true);
  assert.ok(!note.control.disabled && !alarm.control.disabled);
  assert.ok(first.statuses.every((status) => status.hidden));

  const stale = first.load();
  first.finishRead({ error: 'unavailable' }, false);
  assert.equal(await stale, false);
  assert.equal(first.inspect().journalState, 'stale');
  assert.equal(first.inspect().JOURNAL.notes['us:AAPL'].thesis, 'saved thesis');
  assert.equal(first.inspect().JOURNAL._revision, 'r1');
  assert.equal(first.inspect().noteDrafts['us:AAPL'].thesis, 'draft edited while reading');
  assert.match(first.statuses[0].innerHTML, /Son doğrulanmış kayıt/);

  // Missing revisions and malformed records do not become an editable empty journal.
  for (const bad of [null, [], { notes: {}, alerts: [], predictions: [] }, { ...validJournal(), notes: [] },
    { ...validJournal(), _revision: undefined }, { ...validJournal(), _revision: 0 },
    { ...validJournal(), notes: { 'us:AAPL': null } }, { ...validJournal(), alerts: [null] },
    { ...validJournal(), predictions: null }, { ...validJournal(), riskRules: {} }]) {
    const pending = first.load();
    first.finishRead(bad);
    assert.equal(await pending, false);
    assert.equal(first.inspect().JOURNAL._revision, 'r1');
    assert.equal(first.inspect().JOURNAL_READY, false);
  }

  const empty = harness();
  const emptyRead = empty.load();
  empty.finishRead({ notes: {}, alerts: [], predictions: [], _revision: null });
  assert.equal(await emptyRead, true, 'a confirmed absent revision is the valid new-journal case');

  const conflict = harness();
  const conflictNote = conflict.note();
  const initial = conflict.load();
  conflict.finishRead(validJournal());
  await initial;
  assert.equal(conflictNote.elements.invalidation.value, 'saved stop', 'untouched fields receive successful read data');
  conflict.input(conflictNote, 'thesis', 'my pending edit');
  const saving = conflict.submit(conflictNote);
  assert.equal(await conflict.load(), false, 'a read cannot replace optimistic state during a write');
  assert.equal(conflict.reads.length, 1);
  conflict.finishWrite({ error: 'Günlük değişti' }, 409);
  await saving;
  assert.equal(conflict.inspect().JOURNAL_READY, false);
  assert.equal(conflictNote.control.disabled, true);
  assert.equal(conflict.inspect().JOURNAL.notes['us:AAPL'].thesis, 'saved thesis');
  assert.equal(conflict.inspect().noteDrafts['us:AAPL'].thesis, 'my pending edit');
  await conflict.submit(conflictNote);
  assert.equal(conflict.writes.length, 1, 'conflicts require a fresh revision before retrying a write');
  const refreshed = conflict.load();
  conflict.finishRead(validJournal('r2'));
  await refreshed;
  assert.equal(conflictNote.elements.thesis.value, 'my pending edit');
  const next = conflict.submit(conflictNote);
  assert.equal(conflict.writes[1].body._revision, 'r2');
  conflict.finishWrite({ ...conflict.writes[1].body, _revision: 'r3' });
  await next;
  assert.equal(conflict.inspect().JOURNAL_READY, true);
  assert.equal(conflict.inspect().noteDrafts['us:AAPL'], undefined);
  assert.equal(conflict.inspect().JOURNAL.notes['us:AAPL'].thesis, 'my pending edit');

  const invalidSave = conflict.submit(conflictNote);
  conflict.finishWrite({ notes: {}, alerts: [], predictions: [] });
  await invalidSave;
  assert.equal(conflict.inspect().JOURNAL_READY, false);
  assert.equal(conflict.inspect().JOURNAL._revision, 'r3');
  assert.match(conflictNote.status.textContent, /Kayıt yanıtı doğrulanamadı/);

  // A committed response with unreadable JSON is uncertain; a known conflict is blocked even without JSON.
  for (const status of [200, 409]) {
    const unreadable = harness();
    const form = unreadable.note();
    const loaded = unreadable.load();
    unreadable.finishRead(validJournal());
    await loaded;
    unreadable.input(form, 'thesis', 'preserved draft');
    const pending = unreadable.submit(form);
    unreadable.writes[0].resolve({ ok: status === 200, status, json: async () => { throw new SyntaxError('bad JSON'); } });
    await pending;
    assert.equal(unreadable.inspect().JOURNAL_READY, false);
    assert.equal(form.control.disabled, true);
    assert.equal(unreadable.inspect().JOURNAL._revision, 'r1');
    assert.equal(unreadable.inspect().noteDrafts['us:AAPL'].thesis, 'preserved draft');
  }
  console.log('journal UI source-state tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
