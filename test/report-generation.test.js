'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('../src/util');
let apiResponse = { __error: 'HTTP 403' };
util.fetchJson = async () => apiResponse;
const calendar = require('../src/calendar');
const db = require('../src/db');
const journal = require('../src/decision-journal');

(async () => {
  await assert.rejects(calendar.fetchEconomic('test', '2026-09-07', '2026-09-13'), /kullanilamiyor/);
  await assert.rejects(calendar.fetchEarnings('test', '2026-09-07', '2026-09-13', []), /kullanilamiyor/);
  const missing = await calendar.fetchCompanyNews('test', ['AAPL'], '2026-09-04', '2026-09-07');
  assert.equal(missing.length, 0);
  assert.equal(missing.sourceErrors.length, 1);
  apiResponse = [
    { headline: 'Old', url: 'https://example.com/old', datetime: 1788771600 },
    { headline: 'New', url: 'https://example.com/new', datetime: 1788775200 },
    { headline: 'New copy', url: 'https://example.com/new', datetime: 1788775200 },
  ];
  const news = await calendar.fetchCompanyNews('test', ['AAPL'], '2026-09-04', '2026-09-07');
  assert.equal(news[0].headline, 'New');
  assert.equal(news.length, 2);
  assert.equal(news[0].publishedAt, new Date(1788775200 * 1000).toISOString());

  let snapshot = { generatedAt: new Date().toISOString(), errors: ['one source failed'], us: [], bist: [], crypto: [] };
  process.env.FINNHUB_TOKEN = 'unit-test-token';
  db.getLatestSnapshot = async () => snapshot;
  db.saveReport = async () => { throw new Error('publish unavailable'); };
  journal.readJournal = async () => journal.normalizeJournal(null);
  calendar.fetchEconomic = async (token) => { assert.equal(token, 'unit-test-token'); throw new Error('economic offline'); };
  calendar.fetchEarnings = async () => [{ symbol: 'AAPL', date: new Date().toISOString().slice(0, 10) }];
  calendar.fetchCompanyNews = async (_, symbols, from, to) => {
    assert.ok(from < to, 'news must query the past, not future calendar window');
    return [{ symbol: 'AAPL', headline: 'Evidence', datetime: Date.now() / 1000 }];
  };
  const { buildBaseReport, run } = require('../src/report');
  const base = await buildBaseReport();
  assert.equal(base.snapshotId, snapshot.generatedAt);
  assert.ok(base.runId);
  assert.equal(base.quality.status, 'partial');
  assert.equal(base.calendar.coverage.economic.status, 'unavailable');
  assert.equal(base.calendar.earnings.length, 1, 'one failing provider must not erase other results');
  assert.equal(base.calendar.companyNews.length, 1);
  assert.equal(base.signalOverlay.summary.boosted, 0);
  const reportDir = path.join(os.tmpdir(), 'finans-no-publish-' + Date.now());
  await assert.rejects(run({ reportDir }), /publish unavailable/);
  assert.equal(fs.existsSync(reportDir), false, 'failed cloud publication must not update local AI inputs');
  snapshot = { ...snapshot, generatedAt: '2026-01-01T00:00:00Z' };
  await assert.rejects(buildBaseReport(), /Guncel snapshot yok/);
  snapshot = null;
  await assert.rejects(buildBaseReport(), /Guncel snapshot yok/);
  console.log('Report generation: provider isolation, provenance and publish failure tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
