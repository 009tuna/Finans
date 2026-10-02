'use strict';
// Public issuer source probe; no database/model imports or writes.
const fs = require('node:fs');
const path = require('node:path');
const { collectCompanyDisclosures, fetchCompanyHtml } = require('../src/company-ir');
async function run({ output = path.resolve(__dirname, '../docs/research-audit/2026-10-01-company-ir-probe.json'), updateFixtures = false } = {}) {
  const snapshot = await collectCompanyDisclosures({ force: true, fetchHtml: async company => {
    const html = await fetchCompanyHtml(company);
    if (updateFixtures) fs.writeFileSync(path.resolve(__dirname, '../test/fixtures/company-ir-' + (company.symbol === 'FROTO' ? 'ford' : 'tupras') + '.html'), html);
    return html;
  } });
  const result = { checkedAt: new Date().toISOString(), ...snapshot, storageWrites: 0, modelCalled: false, documentBodiesFetched: 0, fixturesUpdated: updateFixtures };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ file: output, sources: snapshot.sources, count: snapshot.items.length, storageWrites: 0, modelCalled: false }));
  return result;
}
if (require.main === module) run({ updateFixtures: process.argv.includes('--update-fixtures') })
  .then(result => { if (!result.items.length || Object.values(result.sources).some(source => source.status === 'unavailable')) process.exitCode = 1; })
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run };
