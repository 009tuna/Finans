'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generate, MODEL, PROMPT_VERSION } = require('../src/research-runner');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finans-draft-isolation-'));
  const mockCli = path.join(directory, 'mock-codex.js');
  const mockResponse = path.join(directory, 'mock-response.json');
  const rejection = path.join(directory, 'rejected.json');
  const productionRejection = path.join(__dirname, '../data/report/sol-rejected.json');
  const productionBefore = fs.existsSync(productionRejection) ? fs.readFileSync(productionRejection) : null;
  const originalCli = process.env.FINANS_CODEX_JS;
  fs.writeFileSync(mockCli, `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    const output = args[args.indexOf('--output-last-message') + 1];
    process.stdin.resume();
    process.stdin.on('end', () => {
      fs.writeFileSync(output, fs.readFileSync(require('node:path').join(__dirname, 'mock-response.json')));
      process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }) + '\\n');
    });
  `);
  process.env.FINANS_CODEX_JS = mockCli;
  try {
    fs.writeFileSync(mockResponse, '{}');
    const cutoff = new Date().toISOString();
    await assert.rejects(generate({ analysisAsOf: cutoff, independent: {}, expectationAgenda: [] },
      { rejectedOutputPath: rejection, timeoutMs: 15000 }), /research\.macroSummary: eksik/);
    assert.ok(fs.existsSync(rejection), 'an invalid model response must leave an inspectable isolated diagnostic');
    const diagnostic = JSON.parse(fs.readFileSync(rejection, 'utf8'));
    assert.deepEqual(diagnostic.research, {});
    assert.equal(diagnostic.provenance.model, MODEL);
    assert.equal(diagnostic.provenance.promptVersion, PROMPT_VERSION);
    assert.equal(diagnostic.provenance.analysisAsOf, cutoff);
    assert.ok(Number.isFinite(Date.parse(diagnostic.generatedAt)));
    const schemaValidMissingReview = { macroSummary: 'Synthetic acceptance fixture', todayFocus: 'Synthetic test',
      commentary: { us: 'Synthetic test', bist: 'Missing evidence in test', crypto: 'Missing evidence in test' },
      coverage: ['us', 'bist', 'crypto'].map(market => ({ market, status: 'insufficient_evidence', reason: 'Synthetic fixture only' })),
      sources: [], events: [], forecasts: [], scenarios: [], signals: [], unresolvedQuestions: [],
      forecastAbstentions: [], expectationReassessments: [] };
    fs.writeFileSync(mockResponse, JSON.stringify(schemaValidMissingReview));
    const target = { market: 'us', metric: 'us_cpi_core_mom_sa', unit: 'percent', period: '2026-09',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(), firstFrozenForecast: { pointEstimate: 0.3 } };
    await assert.rejects(generate({ analysisAsOf: cutoff, independent: {}, expectationAgenda: [target] },
      { rejectedOutputPath: rejection, timeoutMs: 15000 }), /yeniden degerlendirme/);
    const semanticDiagnostic = JSON.parse(fs.readFileSync(rejection, 'utf8'));
    assert.match(semanticDiagnostic.error, /yeniden degerlendirme/);
    assert.deepEqual(semanticDiagnostic.research, schemaValidMissingReview,
      'a schema-valid report that skips today\'s frozen-forecast review must leave the actual rejected response inspectable');
    const productionAfter = fs.existsSync(productionRejection) ? fs.readFileSync(productionRejection) : null;
    assert.deepEqual(productionAfter, productionBefore, 'isolated validation failure must not overwrite the current publication diagnostic');
    console.log('Research draft isolation: rejected live-response diagnostics preserve the production file and actual cutoff');
  } finally {
    if (originalCli === undefined) delete process.env.FINANS_CODEX_JS;
    else process.env.FINANS_CODEX_JS = originalCli;
    for (const file of [mockCli, mockResponse, rejection]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
