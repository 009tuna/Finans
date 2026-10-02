'use strict';
// Exercise the actual Node entrypoint, including the path Vercel rewrites before dispatch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { once } = require('node:events');
const { handleIntelligence } = require('../src/intelligence-api');
const database = { getCache: async () => null };
const root = path.resolve(__dirname, '..');
let reportReads = 0;
const modules = {
  './src/fetch-all': { runAll: () => { throw new Error('No real refresh in routing test'); } },
  './src/backtest-engine': {}, './src/chart-data': {}, './src/forecast': {}, './src/db': {},
  './src/admin-auth': { isAuthorized: () => false }, './src/journal-api': {},
  './src/report-api': { getReportPayload: async () => { reportReads++; return { base: { runId: 'routing-fixture' } }; } },
  './src/research-api': { handleResearch: async () => ({ status: 200, body: { forecasts: [] } }) },
  './src/intelligence-api': { handleIntelligence: (req, options) => handleIntelligence(req, { ...options, database }) },
};
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
    const research = await (await fetch(base + '/api/report?resource=research')).json();
    assert.ok(Array.isArray(research.forecasts));
    assert.equal(reportReads, 0, 'rewritten intelligence/research requests never invoke report projection');
    assert.equal((await (await fetch(base + '/api/report')).json()).base.runId, 'routing-fixture');
    assert.equal(reportReads, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log('Node/Vercel resource routing: payload shape, methods, direct aliases and unchanged report passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
