'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/db');
const { readJournal, writeJournal, normalizeJournal, upsertNote } = require('../src/decision-journal');
const { handleJournal } = require('../src/journal-api');

(async () => {
  // No network; the deliberately invalid filesystem path detects cloud filesystem writes.
  process.env.SUPABASE_URL = 'https://unit-test.invalid';
  process.env.SUPABASE_ANON_KEY = 'test-only';
  process.env.ADMIN_SECRET = 'test-secret';
  let revision = '2026-09-07T11:00:00.000Z';
  let persisted = normalizeJournal({ predictions: [{ id: 'p1', source: 'system', outcome: 'open' }] });
  db.getCache = async (_, opts) => { assert.equal(opts.strict, true); return { value: persisted, revision }; };
  db.compareAndSetCache = async (_, next, expected) => {
    if (expected !== revision) { const error = new Error('Conflict'); error.statusCode = 409; throw error; }
    persisted = structuredClone(next);
    revision = new Date(Date.parse(revision) + 1).toISOString();
    return revision;
  };
  const file = path.join(os.tmpdir(), 'nonexistent-finans-journal-parent-' + Date.now(), 'journal.json');
  const response = await handleJournal({ method: 'GET' }, file);
  assert.equal(response.status, 200);
  const initial = response.body;
  const changed = upsertNote(initial, 'us', 'AAPL', { thesis: 'Evidence', invalidation: 'Break' }, revision);
  assert.equal(changed._revision, revision);
  const unauthorized = await handleJournal({ method: 'POST', body: changed, headers: {} }, file);
  assert.equal(unauthorized.status, 401);
  const headers = { 'x-admin-secret': 'test-secret' };
  const saved = await handleJournal({ method: 'POST', body: changed, headers }, file);
  assert.equal(saved.status, 200);
  assert.notEqual(saved.body._revision, initial._revision);
  assert.equal(fs.existsSync(file), false, 'cloud writes must not touch local filesystem');
  assert.equal((await handleJournal({ method: 'POST', body: changed, headers }, file)).status, 409);
  assert.equal((await handleJournal({ method: 'POST', body: {}, headers }, file)).status, 400);
  assert.equal((await handleJournal({ method: 'POST', body: { ...saved.body, predictions: [] }, headers }, file)).status, 400);
  // A concurrent background update after the HTTP read is caught by persistence CAS.
  const before = await readJournal(file);
  revision = '2026-09-07T12:00:00.000Z';
  await assert.rejects(writeJournal(file, before), /Conflict/);
  db.getCache = async () => { throw new Error('offline'); };
  assert.equal((await handleJournal({ method: 'GET' }, file)).status, 503);
  await assert.rejects(readJournal(file), /offline/);
  db.getCache = async () => null;
  assert.equal((await readJournal(file))._revision, null);
  assert.equal((await readJournal(file)).predictions.length, 0, 'no stale file resurrection');

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finans-cas-test-'));
  const local = path.join(dir, 'journal.json');
  const empty = await readJournal(local);
  const localSaved = await writeJournal(local, { ...empty, notes: { test: { thesis: 'local' } } });
  assert.ok(localSaved._revision);
  await assert.rejects(writeJournal(local, empty), /degisti/);
  fs.writeFileSync(local, '{broken');
  await assert.rejects(readJournal(local), SyntaxError);
  fs.unlinkSync(local);
  fs.rmdirSync(dir);
  console.log('Journal shared API, authorization, conflict and failure tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
