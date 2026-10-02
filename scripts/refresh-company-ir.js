'use strict';
// Default is a real-source publication preview. --publish updates only market_sources_v1.
const fs = require('node:fs');
const path = require('node:path');
const { readStore, updateStore } = require('../src/intelligence-store');
const { collectCompanyDisclosures, IR_COMPANIES, SCOPE } = require('../src/company-ir');
const { mergeCompanySnapshot } = require('../src/company-ir-store');
const { KEY, initial, buildMarketFeeds } = require('../src/market-news');
async function run({ publish = false, force = false, database, collector = collectCompanyDisclosures, now, output } = {}) {
  const { value: previous } = await readStore(KEY, initial, database);
  const snapshot = await collector({ previousSources: previous.sources, force, ...(now === undefined ? {} : { now }) });
  const value = publish ? await updateStore(KEY, initial, current => mergeCompanySnapshot(current, snapshot), database) : mergeCompanySnapshot(previous, snapshot);
  const news = buildMarketFeeds(value, null, now);
  const result = { checkedAt: new Date().toISOString(), mode: publish ? 'published_and_read_back' : 'publication_preview', scope: SCOPE,
    storageWritesRequested: publish, modelCalled: false, documentBodiesFetched: 0, cacheKey: KEY,
    before: { allRecords: previous.items.length, companyRecords: previous.items.filter(item => item.type === 'company_disclosure').length },
    after: { allRecords: value.items.length, companyRecords: value.items.filter(item => item.type === 'company_disclosure').length,
      visibleCompanyRecords: news.groups.bist.filter(item => item.type === 'company_disclosure').length },
    sources: Object.fromEntries(IR_COMPANIES.map(company => [company.id, value.sources[company.id] || null])) };
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  return result;
}
if (require.main === module) run({ publish: process.argv.includes('--publish'), force: process.argv.includes('--force'),
  output: path.resolve(__dirname, '../docs/research-audit/2026-10-01-company-ir-publication-' + (process.argv.includes('--publish') ? 'readback' : 'preview') + '.json') })
  .then(result => { if (Object.values(result.sources).every(source => !source || source.status === 'unavailable')) process.exitCode = 1; })
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run };
