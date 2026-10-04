'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = require('../src/portfolio-storage');
const root = path.resolve(__dirname, '..');
const copy = x => JSON.parse(JSON.stringify(x));
const empty = () => ({ us: [], bist: [], crypto: [] });
const candidate = () => ({ us: [{ symbol: ' aapl ', amount: 2, avgPrice: 150 }], bist: [], crypto: [] });
const holding = (symbol = 'MSFT', extra = {}) => ({ market: 'us', symbol, amount: 1, avg_price: 100, updated_at: '2026-10-03T12:00:00+00:00', ...extra });

// The stateful transport exercises failures and competing writes without a real database.
function database({ rows = [], configured = true, service = true, hooks = {} } = {}) {
  let stored = copy(rows);
  let reads = 0;
  const calls = [];
  const response = data => ({ data: copy(data), count: data.length, error: null });
  const read = () => { calls.push({ operation: 'read' }); reads++; return hooks.read?.({ reads, stored, calls }) || response(stored); };
  const anon = { from: () => ({ select: async () => read() }) };
  const admin = { from(table) {
    assert.equal(table, 'portfolio');
    let action = 'read', payload, filter;
    return {
      upsert(value, options) { action = 'upsert'; payload = value; assert.equal(options.onConflict, 'market,symbol'); assert.equal(options.count, 'exact'); return this; },
      delete(options) { action = 'delete'; assert.equal(options.count, 'exact'); return this; },
      or(value) { filter = value; return this; },
      async select() {
        if (action === 'read') return read();
        calls.push({ operation: action, payload: copy(payload || []), filter });
        const error = hooks[action]?.({ stored, calls, payload, filter });
        if (error) return error;
        if (action === 'upsert') {
          for (const row of payload) { const i = stored.findIndex(old => old.market === row.market && old.symbol === row.symbol); if (i < 0) stored.push(copy(row)); else stored[i] = copy(row); }
          return hooks.upsertResponse?.({ stored, payload }) || response(payload);
        }
        assert.ok(filter, 'cleanup never uses an unbounded delete');
        const selectors = [...filter.matchAll(/and\(market\.eq\.([^,]+),symbol\.eq\.("(?:\\.|[^"\\])*"),updated_at\.eq\.("(?:\\.|[^"\\])*")\)/g)]
          .map(match => ({ market: match[1], symbol: JSON.parse(match[2]), stamp: JSON.parse(match[3]) }));
        assert.ok(selectors.length);
        const matches = row => selectors.some(s => s.market === row.market && s.symbol === row.symbol && s.stamp === row.updated_at);
        const deleted = stored.filter(matches); stored = stored.filter(row => !matches(row)); return response(deleted);
      },
    };
  } };
  const sandbox = {
    module: { exports: {} }, __dirname: path.join(root, 'src'), console: { error() {} },
    process: { platform: 'linux', env: configured ? { SUPABASE_URL: 'https://portfolio-test.invalid', SUPABASE_ANON_KEY: 'unit-read', ...(service ? { SUPABASE_SERVICE_ROLE_KEY: 'unit-write' } : {}) } : {} },
    require(name) { if (name === 'dotenv') return { config() {} }; if (name === '@supabase/supabase-js') return { createClient: (_, key) => key === 'unit-write' ? admin : anon }; if (name === './portfolio-storage') return storage; return require(name); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/db.js'), 'utf8'), sandbox);
  return { api: sandbox.module.exports, calls, rows: () => copy(stored) };
}
function api(databaseApi, authorized = true) {
  const sandbox = { module: { exports: {} }, console: { error() {} }, require(name) { if (name === '../src/db') return databaseApi; if (name === '../src/admin-auth') return { isAuthorized: () => authorized }; throw new Error('Unexpected API dependency'); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'api/portfolio.js'), 'utf8'), sandbox);
  return async req => { const res = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(code) { this.code = code; return this; }, json(value) { this.body = copy(value); return this; } }; await sandbox.module.exports(req, res); return res; };
}

test('complete inputs retain real zeros, normalize symbols and reject malformed or duplicate holdings', () => {
  assert.deepEqual(storage.normalizePortfolioInput(candidate()), [{ market: 'us', symbol: 'AAPL', amount: 2, avg_price: 150 }]);
  assert.equal(storage.normalizePortfolioInput({ ...empty(), crypto: [{ symbol: 'BTC', amount: 0, avgPrice: 0 }] })[0].amount, 0);
  for (const value of [null, [], {}, { us: [] }, { ...empty(), extra: [] }, { ...empty(), us: [{ symbol: 'AAPL', amount: '2', avgPrice: 1 }] },
    { ...empty(), us: [{ symbol: 'AAPL', amount: Infinity, avgPrice: 1 }] }, { ...empty(), us: [{ symbol: 'AAPL', amount: -1, avgPrice: 1 }] },
    { ...empty(), us: [{ symbol: 'AAPL', amount: 1, avgPrice: -1 }] }, { ...empty(), us: [{ symbol: 'bad,symbol', amount: 1, avgPrice: 1 }] },
    { ...empty(), us: [{ symbol: 'aapl', amount: 1, avgPrice: 1 }, { symbol: 'AAPL', amount: 2, avgPrice: 1 }] }]) assert.throws(() => storage.normalizePortfolioInput(value), e => e.statusCode === 400);
});
test('a genuine empty source differs from an unavailable, truncated or malformed source', async () => {
  assert.deepEqual(copy(await database().api.getPortfolio()), empty());
  await assert.rejects(database({ configured: false }).api.getPortfolio());
  for (const response of [{ data: null, count: 0, error: null }, { data: [], count: 1, error: null }, { data: [holding('BAD', { amount: '1' })], count: 1, error: null }, { data: [], count: 0, error: { message: 'private SQL detail' } }]) await assert.rejects(database({ hooks: { read: () => response } }).api.getPortfolio());
});
test('invalid candidates and missing service credentials cannot attempt a write', async () => {
  const invalid = database(); await assert.rejects(invalid.api.savePortfolio({ us: [] }), e => e.statusCode === 400); assert.equal(invalid.calls.length, 0);
  const unauthorized = database({ service: false }); await assert.rejects(unauthorized.api.savePortfolio(candidate())); assert.equal(unauthorized.calls.length, 0);
});
test('incomplete initial reads abort before upsert or deletion', async () => {
  const db = database({ rows: [holding()], hooks: { read: () => ({ data: [holding()], count: 2, error: null }) } });
  await assert.rejects(db.api.savePortfolio(candidate())); assert.deepEqual(db.calls.map(c => c.operation), ['read']); assert.deepEqual(db.rows(), [holding()]);
});
test('upsert failure leaves every previous holding intact and never attempts cleanup', async () => {
  const db = database({ rows: [holding()], hooks: { upsert: () => ({ data: null, count: null, error: { message: 'insert failed' } }) } });
  await assert.rejects(db.api.savePortfolio(candidate())); assert.deepEqual(db.calls.map(c => c.operation), ['read', 'upsert']); assert.deepEqual(db.rows(), [holding()]);
});
test('missing upsert evidence does not authorize deleting previous holdings', async () => {
  const db = database({ rows: [holding()], hooks: { upsertResponse: () => ({ data: [], count: 0, error: null }) } });
  await assert.rejects(db.api.savePortfolio(candidate())); assert.equal(db.calls.some(c => c.operation === 'delete'), false); assert.ok(db.rows().some(row => row.symbol === 'MSFT'));
});
test('successful replacement writes first, removes only observed revisions and verifies the final set', async () => {
  const db = database({ rows: [holding()] }); assert.equal(await db.api.savePortfolio(candidate()), true);
  assert.deepEqual(db.calls.map(c => c.operation), ['read', 'upsert', 'delete', 'read']); assert.match(db.calls[2].filter, /updated_at\.eq\./);
  assert.equal(db.rows().length, 1); assert.equal(db.rows()[0].symbol, 'AAPL'); assert.equal(db.rows()[0].amount, 2);
});
test('a cleanup failure reports uncertainty and retains the old holding', async () => {
  const db = database({ rows: [holding()], hooks: { delete: () => ({ data: null, count: null, error: { message: 'delete failed' } }) } });
  const result = await api(db.api)({ method: 'POST', body: candidate() }); assert.equal(result.code, 503); assert.match(result.body.error, /yenileyip/);
  assert.equal(result.body.success, undefined); assert.ok(db.rows().some(row => row.symbol === 'MSFT'));
});
test('a concurrently changed removed holding survives timestamp-scoped cleanup', async () => {
  const db = database({ rows: [holding()], hooks: { delete: ({ stored }) => { stored.find(row => row.symbol === 'MSFT').updated_at = '2026-10-04T00:00:00Z'; } } });
  await assert.rejects(db.api.savePortfolio(candidate())); assert.ok(db.rows().some(row => row.symbol === 'MSFT'));
});
test('a concurrent new holding prevents a false final success', async () => {
  const db = database({ hooks: { read: ({ reads, stored }) => { if (reads === 2) stored.push(holding('CONCURRENT')); } } });
  await assert.rejects(db.api.savePortfolio(candidate())); assert.equal(db.rows().length, 2);
});
test('an explicit empty replacement removes observed holdings and real zero positions remain valid otherwise', async () => {
  const db = database({ rows: [holding()] }); assert.equal(await db.api.savePortfolio(empty()), true);
  assert.deepEqual(db.calls.map(c => c.operation), ['read', 'delete', 'read']); assert.deepEqual(db.rows(), []);
  const zero = database({ rows: [holding('ZERO', { amount: 0, avg_price: 0 })] }); assert.equal((await zero.api.getPortfolio()).us[0].amount, 0);
});
test('API status and cache headers expose safe errors and deny unauthenticated writes', async () => {
  const db = database({ hooks: { read: () => ({ data: null, error: { message: 'private SQL detail' }, count: null }) } });
  const denied = await api(db.api, false)({ method: 'POST', body: candidate() }); assert.equal(denied.code, 401); assert.equal(db.calls.length, 0);
  const outage = await api(db.api)({ method: 'GET' }); assert.equal(outage.code, 503); assert.equal(outage.headers['cache-control'], 'no-store'); assert.equal(JSON.stringify(outage.body).includes('private SQL detail'), false);
  assert.equal((await api(db.api)({ method: 'POST', body: '{}' })).code, 400); assert.equal((await api(db.api)({ method: 'POST', body: '{invalid' })).code, 400);
  assert.equal((await api(db.api)({ method: 'PATCH' })).code, 405);
  const success = await api(database().api)({ method: 'POST', body: JSON.stringify(candidate()) }); assert.equal(success.code, 200); assert.deepEqual(success.body, { success: true });
});
