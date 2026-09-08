'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the actual db.js query code without using credentials or a real database.
let row = null;
let lastFilters;
const client = {
  from: () => {
    const filters = {};
    let operation;
    let next;
    const query = {
      insert(value) { operation = 'insert'; next = value; return query; },
      update(value) { operation = 'update'; next = value; return query; },
      eq(key, value) { filters[key] = value; return query; },
      async select() {
        lastFilters = filters;
        if (operation === 'insert' && row) return { data: null, error: { code: '23505' } };
        if (operation === 'update' && (!row || row.updated_at !== filters.updated_at || row.cache_key !== filters.cache_key)) return { data: [], error: null };
        row = structuredClone(next);
        return { data: [{ updated_at: row.updated_at }], error: null };
      },
    };
    return query;
  },
};
const sandbox = {
  module: { exports: {} }, __dirname: path.resolve('src'), console, Date,
  process: { env: { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' } },
  require(name) {
    if (name === 'dotenv') return { config() {} };
    if (name === '@supabase/supabase-js') return { createClient: () => client };
    return require(name);
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/db.js'), 'utf8'), sandbox);
const db = sandbox.module.exports;
(async () => {
  const first = await db.compareAndSetCache('journal', { predictions: ['original'] }, null);
  await assert.rejects(db.compareAndSetCache('journal', {}, null), (e) => e.statusCode === 409);
  const outcomes = await Promise.allSettled([
    db.compareAndSetCache('journal', { predictions: ['winner-a'] }, first),
    db.compareAndSetCache('journal', { predictions: ['winner-b'] }, first),
  ]);
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((x) => x.status === 'rejected' && x.reason.statusCode === 409).length, 1);
  assert.equal(lastFilters.updated_at, first);
  assert.equal(lastFilters.cache_key, 'journal');
  assert.equal(row.cache_value.predictions[0], 'winner-a');
  console.log('Database conditional write and competing writer tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
