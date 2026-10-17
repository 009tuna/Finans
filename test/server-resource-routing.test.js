'use strict';
// Exercise the actual Node entrypoint, including the path Vercel rewrites before dispatch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { once } = require('node:events');
const { handleIntelligence } = require('../src/intelligence-api');
const { handleLearning } = require('../src/learning-api');
const database = { getCache: async () => null };
const root = path.resolve(__dirname, '..');
let reportReads = 0;
let stressCalculations = 0;
let stressSourceReads = 0;
const visiblePortfolio = { us: [{ symbol: 'VISIBLE', amount: 2, avgPrice: 10 }], bist: [], crypto: [] };
const visibleData = { generatedAt: '2026-10-03T08:00:00Z', us: [{ symbol: 'VISIBLE', price: 12 }], bist: [], crypto: [] };
function runStressTest(portfolio, data) {
  stressCalculations++;
  assert.deepEqual(JSON.parse(JSON.stringify(portfolio)), visiblePortfolio);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), visibleData);
  return { calculatedFrom: data.generatedAt, symbols: portfolio.us.map(row => row.symbol) };
}
const modules = {
  './src/fetch-all': { runAll: () => { throw new Error('No real refresh in routing test'); } },
  './src/backtest-engine': {}, './src/chart-data': {}, './src/forecast': { runStressTest }, './src/db': {
    getPortfolio: async () => { stressSourceReads++; throw new Error('A posted calculation must not reread a different portfolio'); },
    getLatestSnapshot: async () => { stressSourceReads++; throw new Error('A posted calculation must not reread a different snapshot'); },
  },
  './src/admin-auth': { isAuthorized: () => false }, './src/journal-api': {},
  './src/report-api': { getReportPayload: async () => { reportReads++; return { base: { runId: 'routing-fixture' } }; } },
  './src/research-api': { handleResearch: async () => ({ status: 200, body: { forecasts: [] } }) },
  './src/intelligence-api': { handleIntelligence: (req, options) => handleIntelligence(req, { ...options, database }) },
  './src/learning-api': { handleLearning: req => handleLearning(req, { database, asOf: '2026-10-05T00:00:00Z' }) },
  './src/econ-calendar-source': { handleCalendar: async req => req.method === 'GET' ? { status: 200, body: { events: [{ id: 'US:cpi' }], coverage: { status: 'available' } } } : { status: 405, body: { error: 'Method not allowed' } } },
};
const portfolioContext = vm.createContext({ module: { exports: {} }, console: { error() {} }, require: name => {
  if (name === '../src/db') return modules['./src/db'];
  if (name === '../src/admin-auth') return modules['./src/admin-auth'];
  throw new Error('Unexpected portfolio dependency ' + name);
} });
vm.runInContext(fs.readFileSync(path.join(root, 'api/portfolio.js'), 'utf8'), portfolioContext);
modules['./api/portfolio'] = portfolioContext.module.exports;
(async () => {
  const context = vm.createContext({ __dirname: root, Buffer, URL, console: { log() {}, error() {} },
    process: { env: { PORT: '0' }, exit: code => { throw new Error('Unexpected server exit ' + code); } },
    setInterval() {}, require: name => {
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name === 'dotenv') return { config() {} };
      if (['http', 'fs', 'path'].includes(name)) return require(name);
      throw new Error('Unexpected import ' + name);
    } });
  vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context, { filename: 'server.js' });
  const server = vm.runInContext('server', context);
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const learningResponse = await fetch(base + '/api/report?resource=learning');
    assert.equal(learningResponse.status, 200);
    const learningBody = await learningResponse.json();
    assert.equal(learningBody.measurement, 'forecast_error');
    assert.equal(learningBody.counts.examples, 0);
    assert.equal((await fetch(base + '/api/report?resource=learning', { method: 'POST' })).status, 405);
    const vercelContext = vm.createContext({ module: { exports: {} }, URL, require: name => {
      if (name === '../src/learning-api') return modules['./src/learning-api'];
      if (name === '../src/intelligence-api') return modules['./src/intelligence-api'];
      if (name === '../src/report-api') return modules['./src/report-api'];
      if (name === '../src/research-api') return modules['./src/research-api'];
      if (name === '../src/econ-calendar-source') return modules['./src/econ-calendar-source'];
      throw Error('Unexpected Vercel dependency ' + name);
    } });
    vm.runInContext(fs.readFileSync(path.join(root, 'api/report.js'), 'utf8'), vercelContext);
    let vercelBody;
    await vercelContext.module.exports({ method: 'GET', query: { resource: 'learning' } }, {
      setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(value) { vercelBody = value; },
    });
    assert.deepEqual(JSON.parse(JSON.stringify(vercelBody)), learningBody);
    for (const resource of ['market-news', 'macro']) {
      const rewritten = await fetch(base + '/api/report?resource=' + resource);
      assert.equal(rewritten.status, 200);
      assert.equal(rewritten.headers.get('cache-control'), 'no-store');
      const data = await rewritten.json();
      assert.ok(resource === 'market-news' ? data.groups && data.coverage : Array.isArray(data.forecasts));
      assert.equal(data.base, undefined, '200 is insufficient: a report body is the wrong resource contract');
      const direct = await (await fetch(base + '/api/' + resource)).json();
      assert.deepEqual(Object.keys(data).sort(), Object.keys(direct).sort());
      assert.equal((await fetch(base + '/api/report?resource=' + resource, { method: 'POST' })).status, 405);
    }
    const calendar = await fetch(base + '/api/report?resource=calendar');
    assert.equal(calendar.status, 200);
    assert.equal(calendar.headers.get('cache-control'), 'no-store');
    assert.equal((await calendar.json()).events[0].id, 'US:cpi');
    assert.equal((await fetch(base + '/api/report?resource=calendar', { method: 'POST' })).status, 405);
    let vercelCalendar;
    await vercelContext.module.exports({ method: 'GET', query: { resource: 'calendar' } }, {
      setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(value) { vercelCalendar = value; },
    });
    assert.equal(vercelCalendar.events[0].id, 'US:cpi');
    const research = await (await fetch(base + '/api/report?resource=research')).json();
    assert.ok(Array.isArray(research.forecasts));
    assert.equal(reportReads, 0, 'rewritten intelligence/research requests never invoke report projection');
    assert.equal((await (await fetch(base + '/api/report')).json()).base.runId, 'routing-fixture');
    assert.equal(reportReads, 1);
    const stress = await fetch(base + '/api/forecast/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolio: visiblePortfolio, data: visibleData }) });
    assert.equal(stress.status, 200);
    assert.deepEqual(await stress.json(), { calculatedFrom: visibleData.generatedAt, symbols: ['VISIBLE'] });
    assert.equal(stressSourceReads, 0);
    const invalid = await fetch(base + '/api/forecast/scenarios', { method: 'POST', body: 'null' });
    assert.equal(invalid.status, 400);
    assert.equal(stressSourceReads, 0, 'invalid POST cannot fall back to server-owned inputs');

    const handlerContext = vm.createContext({ module: { exports: {} }, console: { error() {} }, require: name => {
      if (name === '../../src/forecast') return { runStressTest };
      if (name === '../../src/db') return modules['./src/db'];
      throw new Error('Unexpected handler dependency ' + name);
    } });
    vm.runInContext(fs.readFileSync(path.join(root, 'api/forecast/scenarios.js'), 'utf8'), handlerContext);
    const handlerResponse = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await handlerContext.module.exports({ method: 'POST', body: { portfolio: visiblePortfolio, data: visibleData } }, handlerResponse);
    assert.equal(handlerResponse.code, 200);
    assert.equal(stressSourceReads, 0, 'the cloud calculation has the same input cut and no write/read substitution');
    assert.equal(stressCalculations, 3, 'two valid routes plus one rejected input were dispatched');
    const unavailablePortfolio = await fetch(base + '/api/portfolio');
    assert.equal(unavailablePortfolio.status, 503, 'Node and Vercel both expose a portfolio outage instead of an empty portfolio');
    assert.equal(unavailablePortfolio.headers.get('cache-control'), 'no-store');
    const portfolioError = await unavailablePortfolio.json();
    assert.ok(portfolioError.error);
    assert.equal(portfolioError.error.includes('posted calculation'), false, 'internal source errors are not exposed');
    const sourceReads = stressSourceReads;
    assert.equal((await fetch(base + '/api/portfolio', { method: 'POST', body: '{}' })).status, 401);
    assert.equal(stressSourceReads, sourceReads, 'unauthorized portfolio requests never reach the database');
    assert.equal((await fetch(base + '/api/portfolio', { method: 'PATCH' })).status, 405);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log('Node/Vercel resource routing: payload shape, methods, direct aliases and unchanged report passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
