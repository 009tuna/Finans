const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('public/app.js', 'utf8');
const start = source.indexOf('async function loadPortfolio()');
const end = source.indexOf('\nasync function load()', start);
assert.ok(start >= 0 && end > start, 'portfolio loader functions must exist');
const loader = source.slice(start, end);

async function run(fetchImpl, initial) {
  const element = { innerHTML: '', addEventListener() {} };
  const context = { fetch: fetchImpl, console, Promise, esc: (x) => x, $: () => element };
  const code = 'let portfolioData = ' + JSON.stringify(initial) + '; let portfolioState = "loading"; let portfolioLoadError = ""; ' + loader + '; globalThis.exercise = async () => { const result = await loadPortfolio(); return { result, portfolioData, portfolioState, portfolioLoadError, html: ' + JSON.stringify('') + ' }; };';
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.exercise();
}

(async () => {
  const firstFailure = await run(async () => ({ ok: false }), null);
  assert.equal(firstFailure.result, false);
  assert.equal(firstFailure.portfolioData, null);
  assert.equal(firstFailure.portfolioState, 'unavailable');

  const old = { us: [{ symbol: 'AAPL', amount: 1, avgPrice: 100 }], bist: [], crypto: [] };
  const stale = await run(async () => { throw new Error('offline'); }, old);
  assert.deepEqual(stale.portfolioData, old);
  assert.equal(stale.portfolioState, 'stale');

  const fresh = { us: [], bist: [], crypto: [] };
  const ready = await run(async () => ({ ok: true, json: async () => fresh }), old);
  assert.deepEqual(ready.portfolioData, fresh);
  assert.equal(ready.portfolioState, 'ready');
  for (const invalid of [null, { us: [] }, { us: [{ symbol: 'AAPL', amount: '1', avgPrice: 100 }], bist: [], crypto: [] }, { us: [], bist: [null], crypto: [] }]) {
    const rejected = await run(async () => ({ ok: true, json: async () => invalid }), old);
    assert.deepEqual(rejected.portfolioData, old, 'malformed successful response cannot erase previously known holdings');
    assert.equal(rejected.portfolioState, 'stale');
    assert.equal(rejected.result, false);
  }
  console.log('portfolio UI state tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
