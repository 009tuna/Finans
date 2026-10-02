'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createQaServer } = require('./ui-qa-server');
const { mergeCompanySnapshot } = require('../src/company-ir-store');
const { buildMarketFeeds, initial } = require('../src/market-news');
async function start() {
  const snapshot = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/research-audit/2026-10-01-company-ir-probe.json'), 'utf8'));
  if (!snapshot.items.length || snapshot.modelCalled !== false || snapshot.storageWrites !== 0) throw new Error('Verified public source probe required');
  const server = await createQaServer({ newsSnapshot: previous => {
    const store = { ...initial, items: Object.values(previous?.groups || {}).flat(), sources: previous?.sources || {} };
    return buildMarketFeeds(mergeCompanySnapshot(store, snapshot), null);
  } });
  server.listen(5194, '127.0.0.1', () => console.log('Company IR acceptance: http://127.0.0.1:5194/?qa=company-ir#view=report (no cloud writes)'));
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { start };
