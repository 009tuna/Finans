'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { IR_COMPANIES, collectCompanyDisclosures, parseCompanyPage } = require('../src/company-ir');
const { mergeCompanySnapshot, refreshCompanyIr } = require('../src/company-ir-store');
const { KEY, initial, refreshMarketNews, getMarketNews, buildMarketFeeds } = require('../src/market-news');
const clone = value => JSON.parse(JSON.stringify(value));
const NOW = '2026-10-01T17:00:00.000Z';
const ford = fs.readFileSync(require.resolve('./fixtures/company-ir-ford.html'), 'utf8');
const tupras = fs.readFileSync(require.resolve('./fixtures/company-ir-tupras.html'), 'utf8');
function memoryDb() {
  const rows = new Map(); let writes = 0, conflict = false;
  return { rows, get writes() { return writes; }, race() { conflict = true; },
    getCache: async key => clone(rows.get(key) || null),
    compareAndSetCache: async (key, value, expected) => {
      if (conflict) { conflict = false; const error = new Error('CAS race'); error.statusCode = 409; throw error; }
      assert.equal(rows.get(key)?.revision || null, expected); writes++;
      rows.set(key, { value: clone(value), revision: 'r' + writes });
    } };
}
const snapshot = (now = NOW) => collectCompanyDisclosures({ now, force: true, fetchHtml: async company => company.symbol === 'FROTO' ? ford : tupras });
const page = title => '<table>KATEGORİ TARİH<tr><td>Özel Durum Açıklamaları</td><td>1 Ekim 2026</td><td><a href="/doc/first">' + title + '</a></td></tr></table>';
function one(title, now) { const parsed = parseCompanyPage(page(title), IR_COMPANIES[0], { observedAt: now }); return { items: parsed.items, sources: { [IR_COMPANIES[0].id]: parsed.source } }; }

test('scoped publication retains 76 descriptions, 75 document links and conflict evidence without touching other ledgers', async () => {
  const db = memoryDb(); db.rows.set('macro_event_ledger_v1', { value: { immutable: 'forecast' }, revision: 'old' });
  db.race(); let calls = 0;
  const result = await refreshCompanyIr({ database: db, collector: async options => { calls++; assert.deepEqual(options.previousSources, {}); return snapshot(); } });
  assert.equal(calls, 1, 'CAS retry does not repeat network acquisition');
  assert.equal(result.retained, 76); assert.equal(result.status, 'partial');
  assert.equal(result.sources.company_ir_tupras.count, 56); assert.equal(result.sources.company_ir_tupras.documentLinkCount, 55);
  assert.equal(result.sources.company_ir_tupras.conflictCount, 2);
  assert.equal(result.sources.company_ir_tupras.lastSuccessfulAt, null);
  assert.deepEqual(db.rows.get('macro_event_ledger_v1'), { value: { immutable: 'forecast' }, revision: 'old' });
  const news = await getMarketNews({ database: db, now: NOW });
  assert.equal(news.groups.bist.length, 76);
  assert.equal(news.groups.bist.filter(item => item.manualReviewRequired).length, 2);
  assert.match(news.coverage.find(row => row.market === 'bist').reason, /yalnız FROTO ve TUPRS/);
});

test('source outage preserves first records, last verified list and dated counts without inventing a new zero', async () => {
  const original = mergeCompanySnapshot(initial, await snapshot());
  const later = '2026-10-02T17:00:00.000Z';
  const failed = await collectCompanyDisclosures({ now: later, force: true, fetchHtml: async () => { throw new Error('timeout'); } });
  const retained = mergeCompanySnapshot(original, failed);
  assert.deepEqual(retained.items, original.items);
  for (const company of IR_COMPANIES) {
    const source = retained.sources[company.id], first = original.sources[company.id];
    assert.equal(source.status, 'unavailable'); assert.equal(source.checkedAt, later);
    assert.equal(source.listingHash, first.listingHash); assert.equal(source.listingVerifiedAt, NOW);
    assert.equal(source.todayDateOnlyAt, NOW); assert.equal(source.todayDateOnlyDate, '2026-10-01');
    assert.equal(source.lastCompletedAt, NOW); assert.equal(source.discoveredCount, null);
  }
  const neverSucceeded = mergeCompanySnapshot(initial, failed);
  assert.equal(neverSucceeded.sources.company_ir_ford_otosan.todayDateOnlyCount, null);
});

test('title corrections append, repeated checks do not version unchanged records, and a publisher reversion is visible', () => {
  const a = one('First', NOW), b = one('Corrected', '2026-10-02T17:00:00.000Z');
  const first = mergeCompanySnapshot(initial, a);
  const second = mergeCompanySnapshot(first, b);
  assert.deepEqual(second.items[0], first.items[0]); assert.equal(second.items.length, 2);
  assert.equal(second.items[1].supersedes, first.items[0].id);
  const repeated = mergeCompanySnapshot(second, one('Corrected', '2026-10-03T17:00:00.000Z'));
  assert.equal(repeated.items.length, 2);
  assert.equal(buildMarketFeeds(repeated, null, '2026-10-03T18:00:00Z').groups.bist[0].title, 'Corrected');
  const reverted = mergeCompanySnapshot(repeated, one('First', '2026-10-04T17:00:00.000Z'));
  assert.equal(reverted.items.length, 3);
  assert.equal(buildMarketFeeds(reverted, null, '2026-10-04T18:00:00Z').groups.bist[0].title, 'First');
});

test('two titles for one link/date in the same issuer list remain separately visible as a conflict', () => {
  const html = page('First').replace('</table>', '') + page('Second').match(/<tr>[\s\S]*?<\/tr>/)[0] + '</table>';
  const parsed = parseCompanyPage(html, IR_COMPANIES[0], { observedAt: NOW });
  const result = mergeCompanySnapshot(initial, { items: parsed.items, sources: { [IR_COMPANIES[0].id]: parsed.source } });
  const visible = buildMarketFeeds(result, null, NOW).groups.bist;
  assert.equal(visible.length, 2); assert.equal(result.sources.company_ir_ford_otosan.count, 2);
  assert.ok(visible.every(item => item.manualReviewRequired));
});

test('late old snapshot and cooldown are semantic no-ops; isolated successful source survives other source failure', async () => {
  const newer = mergeCompanySnapshot(initial, await snapshot('2026-10-02T17:00:00.000Z'));
  assert.deepEqual(mergeCompanySnapshot(newer, await snapshot()), newer);
  const db = memoryDb(); db.rows.set(KEY, { value: newer, revision: 'existing' });
  await refreshCompanyIr({ database: db, now: '2026-10-02T18:00:00.000Z', collector: options => collectCompanyDisclosures({ ...options, fetchHtml: async () => { throw new Error('must not fetch'); } }) });
  assert.equal(db.writes, 0);
  const partial = await collectCompanyDisclosures({ now: NOW, force: true, fetchHtml: async company => { if (company.symbol === 'TUPRS') throw new Error('timeout'); return ford; } });
  const result = mergeCompanySnapshot(initial, partial);
  assert.equal(result.items.length, 20); assert.equal(result.sources.company_ir_ford_otosan.status, 'available');
  assert.equal(result.sources.company_ir_tupras.status, 'unavailable');
});

test('daily market collector includes the pilot in aggregate health and keeps successful regulatory evidence', async () => {
  const db = memoryDb(); let called = 0;
  const result = await refreshMarketNews({ database: db, now: NOW, documentLimit: 0, collectFeeds: false, collectKap: false, collectAnnouncements: false,
    fetchText: async () => '<a href="https://spk.gov.tr/data/2026-1.pdf">Bülten No : 2026/1 Yayımlanma : 1 Ekim 2026</a>',
    collectCompanyIr: async options => { called++; assert.deepEqual(options.previousSources, {}); return snapshot(); } });
  assert.equal(called, 1); assert.equal(result.status, 'partial');
  assert.ok(result.failures.some(item => item.source === 'company_ir_tupras' && item.errorCode === 'company_link_conflict'));
  assert.equal(result.sources.spk.status, 'available'); assert.equal(result.countsBySource.company_ir_ford_otosan.count, 20);
  assert.equal((await getMarketNews({ database: db, now: NOW })).groups.bist.length, 77);
});

test('malformed collector records cannot insert unrelated symbols, URLs, IDs or unverifiable metadata', () => {
  const valid = one('First', NOW);
  for (const mutation of [{ symbol: 'OTHER' }, { market: 'us' }, { url: 'https://evil.test/doc/first' }, { id: 'forged' }, { observedAt: '2000-01-01' }, { listingHash: 'forged' }, { title: 'tampered' }, { sourceUrl: 'https://evil.test' }]) {
    const result = mergeCompanySnapshot(initial, { ...valid, items: [{ ...valid.items[0], ...mutation }] });
    assert.equal(result.items.length, 0);
  }
});

test('research context contains bounded issuer references separately from regulatory entries and states their evidence limits', async () => {
  const db = memoryDb();
  await refreshCompanyIr({ database: db, collector: () => snapshot() });
  const { getIntelligenceContext } = require('../src/intelligence-context');
  const context = await getIntelligenceContext({ database: db, now: NOW });
  assert.equal(context.marketSources.companyDisclosures.length, 8);
  assert.ok(context.marketSources.companyDisclosures.every(item => item.type === 'company_disclosure' && item.publishedAt === null && item.publishedDate && item.observedAt === NOW));
  assert.match(context.marketSources.limits, /No document body or KAP API was fetched/);
  assert.match(context.marketSources.limits, /not necessarily today's news/);
  assert.equal(db.rows.size, 1, 'preparing research context creates no forecast or model record');
});

test('scoped CLI defaults to a source-backed preview; explicit publication verifies store state', async () => {
  const db = memoryDb();
  const { run } = require('../scripts/refresh-company-ir');
  const preview = await run({ database: db, collector: () => snapshot(), now: NOW });
  assert.equal(preview.mode, 'publication_preview'); assert.equal(preview.storageWritesRequested, false);
  assert.equal(preview.after.companyRecords, 76); assert.equal(db.writes, 0);
  const published = await run({ database: db, collector: () => snapshot(), now: NOW, publish: true });
  assert.equal(published.mode, 'published_and_read_back'); assert.equal(published.modelCalled, false);
  assert.equal(db.writes, 1); assert.equal(db.rows.get(KEY).value.items.length, 76);
});
