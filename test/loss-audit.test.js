'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildLossAudit, renderLossAuditMarkdown, scoreBucket } = require('../src/loss-audit');
const { main, parseArgs } = require('../scripts/audit-losses');
const at = '2026-10-13T12:00:00Z';
const base = overrides => ({ id: 'one', market: 'bist', symbol: 'PRIVATE-SYMBOL', source: 'system', strategyVersion: 'technical-rules-v1', score: 75,
  createdAt: '2026-09-01T12:00:00Z', resolvedAt: '2026-09-03T12:00:00Z', entry: 100, target: 120, stop: 90,
  closePrice: 90, resultPct: -10, outcome: 'stop-hit', ...overrides });
const audit = predictions => buildLossAudit({ predictions }, { auditedAt: at });
const total = report => report.allRecords;

// No malformed/missing journal may silently masquerade as zero evidence.
assert.throws(() => buildLossAudit({}), /predictions array/);
assert.throws(() => audit(null), /predictions array/);
assert.throws(() => buildLossAudit({ predictions: [] }, { auditedAt: 'bad' }), /timestamp/);
assert.equal(total(audit([])).rawResult.meanPct, null);
assert.equal(total(audit([])).evidence.independentlyVerifiedExecutions, null);

// Metadata and unknown denomination never become independent execution proof.
const evidenceOnly = base({ outcomeEvidence: 'daily_bar_range', resolverVersion: 'daily-bar-resolver-v3' });
const metadataReport = audit([evidenceOnly]);
assert.equal(total(metadataReport).evidence.closedWithOutcomeAndResolverMetadata, 1);
assert.equal(total(metadataReport).evidence.metadataIsExecutionVerification, false);
assert.equal(total(metadataReport).rawResult.meanPct, -10);
assert.equal(total(metadataReport).rawResult.unknownCurrencyCount, 1);
assert.equal(total(metadataReport).evidence.missingFieldCounts['decision-source-proof'], 1);
assert.equal(total(metadataReport).evidence.independentlyVerifiedExecutions, null);

// Exactly one partition per record, and manual/simulated/missing-source rows stay separate.
const partitionInput = [base(), base({ id: 'manual', source: 'user' }), base({ id: 'unknown', source: undefined }),
  base({ id: 'simulation', source: 'historical-simulation' }),
  base({ id: 'pending', resolvedAt: null, outcome: 'open', closePrice: null, resultPct: null }),
  base({ id: 'ambiguous', outcome: 'ambiguous', outcomeEvidence: 'ambiguous_bar', closePrice: null, resultPct: null }),
  base({ id: 'not-entered', outcome: 'not-entered', closePrice: null, resultPct: null }),
  base({ id: 'unknown-outcome', outcome: 'private-note-outcome', resultPct: null }),
  base({ id: 'zero', closePrice: 100, resultPct: 0, outcome: 'expired-loss' }),
  base({ id: 'incomplete', closePrice: undefined })];
const partition = audit(partitionInput);
assert.equal(Object.values(partition.cohorts).reduce((n, x) => n + x.total, 0), partitionInput.length);
assert.equal(Object.values(total(partition).outcomePartition).reduce((a, b) => a + b, 0), partitionInput.length);
assert.equal(partition.cohorts.manual.total, 1);
assert.equal(partition.cohorts['historical-simulation'].total, 1);
assert.equal(partition.cohorts['unknown-source'].total, 1);
assert.equal(total(partition).outcomePartition.pending, 1);
assert.equal(total(partition).outcomePartition.ambiguous, 1);
assert.equal(total(partition).outcomePartition['not-entered'], 1);
assert.equal(total(partition).outcomePartition.zero, 1);
assert.equal(total(partition).outcomePartition.incomplete, 1);
assert.equal(total(partition).outcomePartition.unknown, 1);
assert.equal(total(partition).rawResult.mixedCohorts, true);
assert.equal(total(partition).rawResult.meanPct, null);
assert.equal(JSON.stringify(partition).includes('private-note-outcome'), false);

// Price arithmetic, order, actual numeric types, signs and duplicate ids fail closed.
const bad = audit([
  base({ id: 'arithmetic', resultPct: -11 }),
  base({ id: 'sign', resultPct: 20, closePrice: 120, outcome: 'expired-loss' }),
  base({ id: 'order', resolvedAt: '2026-08-31T12:00:00Z' }),
  base({ id: 'future', createdAt: '2027-01-01T00:00:00Z', resolvedAt: '2027-01-03T00:00:00Z' }),
  base({ id: 'numeric-string', resultPct: '-10' }),
  base({ id: 'zero-entry', entry: 0 }),
  base({ id: 'wrong-stop', stop: 80 }),
  base({ id: 'pending-resolution', outcome: 'open' }),
  base({ id: 'ambiguous-result', outcome: 'ambiguous', outcomeEvidence: 'ambiguous_bar' }),
  base({ id: 'duplicate' }), base({ id: 'duplicate', market: 'us' }),
]);
assert.equal(total(bad).rawResult.sampleSize, 0);
assert.equal(total(bad).outcomePartition.invalid, 11);
assert.equal(bad.inventory.duplicateIdGroups, 1);
assert.equal(bad.inventory.duplicateIdRows, 2);
assert.equal(total(bad).evidence.issueCounts['return-price-arithmetic-conflict'], 1);
assert.equal(total(bad).evidence.issueCounts['outcome-return-sign-conflict'], 1);
assert.equal(total(bad).evidence.issueCounts['duplicate-id'], 2);

// Legacy rounded returns allow half a tenth, but never a materially wrong value.
const rounded = audit([base({ id: 'rounding', closePrice: 90.049, stop: 90.049, resultPct: -10 })]);
assert.equal(total(rounded).rawResult.sampleSize, 1);
assert.equal(total(audit([base({ closePrice: 90.051, stop: 90.051 })])).rawResult.sampleSize, 0);
assert.equal(total(audit([base({ resultPct: null })])).rawResult.sampleSize, 0);
assert.equal(total(audit([base({ outcome: 'expired-win', closePrice: 100.01, resultPct: 0 })])).outcomePartition.zero, 1);
assert.equal(total(audit([base({ createdAt: '2026-02-30T12:00:00Z' })])).rawResult.sampleSize, 0);

// Magnitudes are descriptive; dates and scores come only from saved records.
const magnitudes = audit([base(), base({ id: 'gain', closePrice: 120, resultPct: 20, outcome: 'target-hit', market: 'us', score: 100 })]);
assert.equal(total(magnitudes).rawResult.meanPct, 5);
assert.equal(total(magnitudes).rawResult.descriptivePayoffMagnitudeRatio, 2);
assert.equal(total(magnitudes).savedLongPlan.avgRewardRiskRatio, 2);
assert.equal(total(magnitudes).createdDateConcentration.largestDayShareOfAllPct, 100);
assert.equal(magnitudes.cohorts['legacy-system'].byMarket.bist.rawResult.meanPct, -10);
assert.equal(magnitudes.cohorts['legacy-system'].byMarket.us.rawResult.meanPct, 20);
assert.equal(magnitudes.cohorts['legacy-system'].byScoreBucket['80-100'].total, 1);
assert.equal(scoreBucket(null), 'unknown');
assert.equal(scoreBucket('99'), 'unknown');
assert.equal(scoreBucket(101), 'outside-0-100');
const invalidScore = total(audit([base({ score: 101 })]));
assert.equal(invalidScore.evidence.warningCounts['invalid-saved-score'], 1);
assert.equal(invalidScore.rawResult.sampleSize, 1);

// Structural records retain their own execution schema. Metadata-complete
// paper closures are still not independently verified by this diagnostic.
const structural = {
  id: 'structural', market: 'crypto', source: 'system', strategyVersion: 'structural-long-v1',
  executionVersion: 'observed-open-paper-v1', resolverVersion: 'structural-paper-resolver-v1',
  parameterHash: 'frozen', sourceSnapshotId: 'decision', sourceEvidence: { hash: 'decision', currency: 'USD', priceBasis: 'unadjusted' },
  createdAt: '2026-09-01T12:00:00Z', resolvedAt: '2026-09-03T12:00:00Z',
  plan: { stop: 90, target: 120, entryZone: [98, 102], currency: 'USD', priceBasis: 'unadjusted', horizonDays: 180, costModel: { version: 'market-costs-v1', roundTrip: 0.01 } },
  execution: { state: 'closed', registrationRevision: 'receipt', eligibilityAt: '2026-09-01T12:01:00Z', fillEffectiveAt: '2026-09-02T00:00:00Z', fillObservedAt: '2026-09-02T00:01:00Z', fillPreparedAt: '2026-09-02T00:02:00Z', fillPrice: 100, entryEvidence: { sourceSnapshotId: 'entry' } },
  evidence: { status: 'verified' }, exitEvidence: { mode: 'open', sourceSnapshotId: 'exit', continuityVerified: true },
  exitEffectiveAt: '2026-09-03T00:00:00Z', exitObservedAt: '2026-09-03T00:01:00Z', resultPreparedAt: '2026-09-03T12:00:00Z',
  outcome: 'time-exit', exitPrice: 110, grossResultPct: 10, netResultPct: (1.1 * 0.995 ** 2 - 1) * 100,
};
const structuralReport = audit([structural]);
assert.equal(structuralReport.cohorts['structural-system'].total, 1);
assert.equal(total(structuralReport).rawResult.meanPct, 10);
assert.equal(total(structuralReport).savedLongPlan.basisCounts['saved-paper-fill'], 1);
assert.equal(total(structuralReport).evidence.missingFieldCounts['structural-contract-metadata'], undefined);
assert.equal(total(structuralReport).evidence.independentlyVerifiedExecutions, null);
const noFill = { ...structural, id: 'no-fill', outcome: 'open', resolvedAt: null, execution: { state: 'pending-entry' }, grossResultPct: null, netResultPct: null, exitPrice: null };
assert.equal(total(audit([noFill])).savedLongPlan.knownCount, 0);
assert.equal(total(audit([{ ...structural, netResultPct: 99 }])).rawResult.sampleSize, 0);
assert.equal(total(audit([{ ...structural, sourceEvidence: { ...structural.sourceEvidence, currency: 'TRY' } }])).rawResult.sampleSize, 0);

// Current data cannot repair a past record. Frozen input stays byte-identical.
const frozen = { notes: { secret: 'DO-NOT-EXPORT' }, predictions: [base({ entry: undefined })] };
const before = JSON.stringify(frozen);
const withSnapshot = buildLossAudit(frozen, { auditedAt: at, snapshot: { generatedAt: at, bist: [{ symbol: 'PRIVATE', price: 100, rsi: 42 }], notes: 'DO-NOT-EXPORT' } });
assert.equal(JSON.stringify(frozen), before);
assert.equal(total(withSnapshot).rawResult.sampleSize, 0);
assert.equal(withSnapshot.snapshotCoverage.marketAssetCounts.bist, 1);
assert.equal(JSON.stringify(withSnapshot).includes('DO-NOT-EXPORT'), false);
assert.equal(JSON.stringify(withSnapshot).includes('PRIVATE'), false);
assert.equal(renderLossAuditMarkdown(withSnapshot).includes('DO-NOT-EXPORT'), false);

assert.throws(() => parseArgs([]), /exactly one/);
assert.throws(() => parseArgs(['--live', '--journal', 'j.json']), /exactly one/);
assert.throws(() => parseArgs(['--live', '--snapshot', 's.json']), /local/);
assert.throws(() => parseArgs(['--live', '--base-url', 'https://user:secret@example.test']), /credentials/);
assert.throws(() => parseArgs(['--live', '--base-url', 'http://example.test']), /HTTPS/);
assert.throws(() => parseArgs(['--journal']), /requires a value/);

(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finans-loss-audit-'));
  try {
    const journalFile = path.join(folder, 'journal.json'), outputFile = path.join(folder, 'report.json');
    fs.writeFileSync(journalFile, before);
    const output = [];
    await main(['--journal', journalFile, '--output', outputFile], { stdout: x => output.push(x), transport: () => { throw Error('No network permitted'); } });
    assert.equal(fs.readFileSync(journalFile, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(folder, 'report.md')), true);
    assert.equal(fs.readFileSync(outputFile, 'utf8').includes('DO-NOT-EXPORT'), false);
    assert.equal(output.join('').includes('DO-NOT-EXPORT'), false);
    assert.equal(JSON.parse(output[0]).allRecords, undefined);
    assert.equal(JSON.parse(output[0]).output.json, outputFile);
    const beforeFiles = fs.readdirSync(folder);
    const fullOutput = [];
    await main(['--journal', journalFile], { stdout: x => fullOutput.push(x), transport: () => { throw Error('No network permitted'); } });
    assert.equal(JSON.parse(fullOutput[0]).allRecords.total, 1);
    assert.deepEqual(fs.readdirSync(folder), beforeFiles);
    const corrupt = path.join(folder, 'corrupt.json');
    fs.writeFileSync(corrupt, 'PRIVATE-TOKEN invalid json');
    await assert.rejects(() => main(['--journal', corrupt], { stdout() {} }), error => !error.message.includes('PRIVATE-TOKEN') && /invalid JSON/.test(error.message));
    await assert.rejects(() => main(['--journal', journalFile, '--output', journalFile], { stdout() {} }), /overwrite/);
    const calls = [];
    const transport = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => url.endsWith('/api/journal') ? { predictions: [base()] } : { generatedAt: at, bist: [] } };
    };
    const live = await main(['--live', '--base-url', 'http://localhost:3000'], { transport, stdout() {} });
    assert.equal(calls.length, 2);
    assert.equal(calls.every(c => c.init.method === 'GET' && !c.init.body), true);
    assert.equal(live.inputMode, 'live-separate-get-reads-not-atomic');
    await assert.rejects(() => main(['--live'], { transport: async () => ({ ok: false, status: 503 }), stdout() {} }), /HTTP 503/);
    const noSnapshot = await main(['--live'], { transport: async url => { if (url.endsWith('/api/data')) throw Error('private transport details'); return { ok: true, json: async () => ({ predictions: [base()] }) }; }, stdout() {} });
    assert.equal(noSnapshot.snapshotCoverage.present, false);
    assert.equal(JSON.stringify(noSnapshot).includes('private transport details'), false);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  console.log('loss-audit: evidence partition, arithmetic, privacy and read-only CLI passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
