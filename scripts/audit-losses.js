'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildLossAudit, renderLossAuditMarkdown } = require('../src/loss-audit');
const { windowsFetch } = require('../src/windows-fetch');
const LIVE_BASE = 'https://finans-dashboard-iota.vercel.app';
function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--live') options.live = true;
    else if (arg === '--help') options.help = true;
    else if (['--journal', '--snapshot', '--output', '--base-url'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(arg + ' requires a value');
      options[arg.slice(2)] = args[++i];
    } else throw new Error('Unknown argument: ' + arg);
  }
  if (options.help) return options;
  if (Boolean(options.live) === Boolean(options.journal)) throw new Error('Choose exactly one of --journal <file> or --live');
  if (options.live && options.snapshot) throw new Error('--snapshot is for local journal audits; --live reads /api/data separately');
  if (!options.live && options['base-url']) throw new Error('--base-url requires --live');
  if (options['base-url']) {
    const url = new URL(options['base-url']);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Live URL must use HTTPS or local HTTP');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use a base origin without credentials, paths, query or hash');
  }
  return options;
}
async function readJson(url, transport) {
  const response = await transport(url, { method: 'GET', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Read-only endpoint returned HTTP ' + response.status);
  try { return await response.json(); }
  catch (_) { throw new Error('Read-only endpoint returned invalid JSON; raw content omitted'); }
}
function readLocalJson(file) {
  let content;
  try { content = fs.readFileSync(path.resolve(file), 'utf8'); }
  catch (_) { throw new Error('Local audit input could not be read'); }
  try { return JSON.parse(content); }
  catch (_) { throw new Error('Local audit input is invalid JSON; raw content omitted'); }
}
async function main(args = process.argv.slice(2), { transport = process.platform === 'win32' ? windowsFetch : fetch, stdout = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) {
    stdout('node scripts/audit-losses.js --journal <file> [--snapshot <file>] [--output <report.json>]\nnode scripts/audit-losses.js --live [--base-url <origin>] [--output <report.json>]\nOnly GET reads. Outputs aggregates, never a raw journal. --output writes JSON and a sibling Markdown report.');
    return null;
  }
  let journal, snapshot = null, snapshotReadWarning = null;
  if (options.live) {
    const base = options['base-url'] || LIVE_BASE;
    journal = await readJson(new URL('/api/journal', base).href, transport);
    try { snapshot = await readJson(new URL('/api/data', base).href, transport); }
    catch (_) { snapshotReadWarning = 'Current snapshot read failed; no past evidence or missing data inferred'; }
  } else {
    journal = readLocalJson(options.journal);
    if (options.snapshot) snapshot = readLocalJson(options.snapshot);
  }
  const report = buildLossAudit(journal, { snapshot, inputMode: options.live ? 'live-separate-get-reads-not-atomic' : 'local-file' });
  if (snapshotReadWarning) report.snapshotCoverage.warning = snapshotReadWarning;
  if (options.output) {
    const file = path.resolve(options.output);
    if (path.extname(file).toLowerCase() !== '.json') throw new Error('--output must name a .json report (a sibling .md report is also written)');
    const markdown = file.slice(0, -5) + '.md';
    const sources = [options.journal, options.snapshot].filter(Boolean).map(x => path.resolve(x).toLowerCase());
    const protectedData = path.resolve(__dirname, '../data').toLowerCase() + path.sep;
    if ([file, markdown].some(x => sources.includes(x.toLowerCase()) || x.toLowerCase().startsWith(protectedData))) throw new Error('Report output cannot overwrite source inputs or the application data directory');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(markdown, renderLossAuditMarkdown(report));
    stdout(JSON.stringify({ auditedAt: report.auditedAt, inventory: report.inventory,
      cohorts: Object.fromEntries(Object.entries(report.cohorts).filter(([, s]) => s.total).map(([key, s]) => [key, {
        total: s.total, outcomes: s.outcomePartition, rawResultSampleSize: s.rawResult.sampleSize, meanSavedGrossPct: s.rawResult.meanPct,
        outcomeAndResolverMetadataCount: s.evidence.closedWithOutcomeAndResolverMetadata,
        independentlyVerifiedExecutions: s.evidence.independentlyVerifiedExecutions,
      }])), meaning: report.methodology.returnMeaning, output: { json: file, markdown } }, null, 2));
  } else {
    stdout(JSON.stringify(report, null, 2));
  }
  return report;
}
if (require.main === module) main().catch(error => { console.error('Loss audit failed: ' + error.message); process.exitCode = 1; });
module.exports = { main, parseArgs };
