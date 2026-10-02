'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { IR_COMPANIES: companies, parseCompanyPage, publisherDate, safeDisclosureUrl, fetchCompanyHtml, collectCompanyDisclosures, MAX_BYTES } = require('../src/company-ir');
const now = '2026-10-01T17:00:00.000Z';
const ford = fs.readFileSync(require.resolve('./fixtures/company-ir-ford.html'), 'utf8');
const tupras = fs.readFileSync(require.resolve('./fixtures/company-ir-tupras.html'), 'utf8');
const options = { observedAt: now };
function fordPage(rows) { return '<table><thead>KATEGORİ TARİH BAŞLIK</thead>' + rows.map(row => '<tr><td>Özel Durum Açıklamaları</td><td>' + row.date + '</td><td><a href="' + row.href + '">' + row.title + '</a></td></tr>').join('') + '</table>'; }

test('real issuer fixtures: dated list membership, selected year and separate acquisition proof', () => {
  const a = parseCompanyPage(ford, companies[0], options);
  const b = parseCompanyPage(tupras, companies[1], options);
  assert.equal(a.items.length, 20);
  assert.equal(b.items.length, 56);
  assert.equal(a.source.latestPublishedDate, '2026-09-06');
  assert.equal(b.source.latestPublishedDate, '2026-09-09');
  for (const result of [a, b]) {
    assert.equal(result.source.todayDateOnlyCount, 0);
    assert.ok(result.items.every(item => item.publishedAt === null && item.observedAt === now && item.listingHash === result.source.listingHash));
    assert.ok(result.items.every(item => item.market === 'bist' && item.publishedDate.startsWith('2026-')));
  }
  assert.equal(a.source.status, 'available');
  assert.equal(b.source.status, 'partial');
  assert.equal(b.source.conflictCount, 2);
  assert.ok(b.items.filter(item => item.url.endsWith('/1575803')).every(item => item.manualReviewRequired && item.evidenceStatus === 'company_listing_link_conflict'));
  assert.ok(b.items.some(item => item.url === 'https://www.kap.org.tr/tr/Bildirim/1661253'));
  assert.ok(!b.items.some(item => /mergerAndSplit|Entek.*devredilmesi/i.test(item.url)), 'other page sections do not become disclosures');
  assert.match(a.source.reason, /ilk sayfası/);
  assert.match(b.source.reason, /seçili yıl/);
});

test('invalid calendar dates, future dates, missing anchors and unsafe links produce partial status', () => {
  assert.equal(publisherDate('31.02.2026'), null);
  assert.equal(publisherDate('29 Şubat 2026'), null);
  assert.equal(publisherDate('29 Şubat 2024'), '2024-02-29');
  const result = parseCompanyPage(fordPage([
    { date: '1 Ekim 2026', href: '/doc/one', title: 'Valid &#214;DA &amp; source' },
    { date: '2 Ekim 2026', href: '/doc/two', title: 'Future' },
    { date: '31 Şubat 2026', href: '/doc/three', title: 'Invalid' },
    { date: '1 Ekim 2026', href: 'javascript:alert(1)', title: 'Unsafe' },
  ]), companies[0], options);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, 'Valid ÖDA & source');
  assert.equal(result.source.filteredCount, 3);
  assert.equal(result.source.status, 'partial');
  assert.equal(result.source.todayDateOnlyCount, 1);
  const missing = parseCompanyPage('<table>KATEGORİ TARİH<tr><td>Özel Durum Açıklamaları</td><td>1 Ekim 2026</td><td>No link</td></tr></table>', companies[0], options);
  assert.equal(missing.source.filteredCount, 1);
  assert.equal(missing.source.status, 'unverified');
  assert.equal(missing.source.todayDateOnlyCount, null);
});

test('host/path allowlists reject lookalikes, credentials, scripts and non-disclosure KAP links', () => {
  for (const link of ['http://www.fordotosan.com.tr/doc/x', 'https://www.fordotosan.com.tr.evil.test/doc/x', 'https://user@www.fordotosan.com.tr/doc/x', 'https://www.fordotosan.com.tr:8443/doc/x', 'https://www.kap.org.tr/api/data', 'https://www.kap.org.tr/tr/Bildirim/123?token=x', '/doc/x\n']) {
    assert.equal(safeDisclosureUrl(link, companies[0]), null, link);
  }
  assert.equal(safeDisclosureUrl('/doc/okay', companies[0]), 'https://www.fordotosan.com.tr/doc/okay');
  assert.equal(safeDisclosureUrl('/assets/all-pdfs/okay.pdf', companies[1]), 'https://www.tupras.com.tr/assets/all-pdfs/okay.pdf');
  assert.equal(safeDisclosureUrl('https://kap.org.tr/tr/Bildirim/123', companies[1]), 'https://kap.org.tr/tr/Bildirim/123');
});

test('stable document identity preserves content-change evidence and rejects script pseudo-records', () => {
  const one = { date: '1 Ekim 2026', href: '/doc/same', title: 'First' };
  const first = parseCompanyPage(fordPage([one]), companies[0], options).items[0];
  const corrected = parseCompanyPage(fordPage([{ ...one, title: 'Correction' }]), companies[0], options).items[0];
  assert.equal(first.id, corrected.id);
  assert.notEqual(first.contentHash, corrected.contentHash);
  const combined = parseCompanyPage(fordPage([one, one, { ...one, title: 'Correction' }]), companies[0], options);
  assert.equal(combined.items.length, 2, 'exact duplicate is skipped, distinct source descriptions remain');
  const pseudo = parseCompanyPage('<script>' + fordPage([one]) + '</script>', companies[0], options);
  assert.equal(pseudo.items.length, 0);
  assert.equal(pseudo.source.status, 'unverified');
});

test('unsupported/empty markup and oversized response are not healthy empty news', () => {
  const empty = parseCompanyPage('<html>Loading</html>', companies[0], options);
  assert.equal(empty.source.status, 'unverified');
  assert.equal(empty.source.discoveredCount, null);
  assert.equal(empty.source.todayDateOnlyCount, null);
  assert.throws(() => parseCompanyPage('x'.repeat(MAX_BYTES + 1), companies[0], options), /source_too_large/);
});

test('fetcher rejects redirects, byte overflow and untrusted configured source before network', async () => {
  await assert.rejects(() => fetchCompanyHtml({ ...companies[0], sourceUrl: 'https://evil.test/' }, { fetcher: async () => assert.fail('network not allowed') }), /source_not_allowlisted/);
  await assert.rejects(() => fetchCompanyHtml(companies[0], { fetcher: async () => new Response('', { status: 302, headers: { location: 'https://evil.test' } }) }), /redirect_rejected/);
  await assert.rejects(() => fetchCompanyHtml(companies[0], { maxBytes: 8, fetcher: async () => new Response('123456789') }), /source_too_large/);
  await assert.rejects(() => fetchCompanyHtml(companies[0], { maxBytes: 8, fetcher: async () => ({ status: 200, ok: true, headers: new Headers(), text: async () => '123456789' }) }), /source_too_large/);
});

test('post-fetch clocks and a company outage remain independent; no KAP request is made', async () => {
  const clocks = ['2026-10-01T17:00:00Z', '2026-10-01T17:00:03Z', '2026-10-01T17:00:04Z', '2026-10-01T17:00:09Z'];
  const requested = [];
  const result = await collectCompanyDisclosures({ clock: () => clocks.shift(), fetchHtml: async company => {
    requested.push(company.sourceUrl);
    if (company.symbol === 'FROTO') return ford;
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  } });
  assert.equal(requested.length, 2);
  assert.ok(requested.every(url => !url.includes('kap.org')));
  assert.equal(result.sources[companies[0].id].checkedAt, '2026-10-01T17:00:03.000Z');
  assert.equal(result.sources[companies[1].id].checkedAt, '2026-10-01T17:00:09.000Z');
  assert.equal(result.sources[companies[1].id].errorCode, 'timeout');
  assert.equal(result.items.length, 20);
});

test('healthy daily cooldown and bounded outage retry do not pretend a new check occurred', async () => {
  const previousSources = { [companies[0].id]: { status: 'available', checkedAt: '2026-10-01T16:00:00.000Z' }, [companies[1].id]: { status: 'unavailable', checkedAt: '2026-10-01T16:30:00.000Z' } };
  const held = await collectCompanyDisclosures({ now, previousSources, fetchHtml: async () => assert.fail('still in cooldown') });
  assert.ok(Object.values(held.sources).every(source => source.skipped));
  assert.equal(held.sources[companies[0].id].checkedAt, previousSources[companies[0].id].checkedAt);
  const retried = [];
  await collectCompanyDisclosures({ now: '2026-10-01T17:31:00Z', previousSources, fetchHtml: async company => { retried.push(company.symbol); return tupras; } });
  assert.deepEqual(retried, ['TUPRS']);
});
