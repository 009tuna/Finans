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
const econSource = require('../src/econ-calendar-source');

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
  db.saveReport = async () => { throw new Error('draft generation must not publish'); };
  journal.readJournal = async () => journal.normalizeJournal(null);
  econSource.getEconomicCalendar = async () => { throw new Error('economic offline'); };
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
  assert.deepEqual(base.calendar.events, []);
  assert.equal(base.calendar.eventsCoverage.status, 'unavailable');
  assert.equal(base.calendar.earnings.length, 1, 'one failing provider must not erase other results');
  assert.equal(base.calendar.companyNews.length, 1);
  assert.equal(base.signalOverlay.summary.boosted, 0);
  const reportDir = path.join(os.tmpdir(), 'finans-no-publish-' + Date.now());
  await run({ reportDir });
  assert.ok(fs.existsSync(path.join(reportDir, 'base-stage.json')), 'base generation stages a frozen base and price snapshot');
  snapshot = { ...snapshot, generatedAt: '2026-01-01T00:00:00Z' };
  await assert.rejects(buildBaseReport(), /Guncel snapshot yok/);
  snapshot = null;
  await assert.rejects(buildBaseReport(), /Guncel snapshot yok/);
  console.log('Report generation: provider isolation, provenance and frozen draft staging tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
