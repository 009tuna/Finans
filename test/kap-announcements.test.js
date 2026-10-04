'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectKapAnnouncements, fetchHtml, KAP_PUBLIC_PAGE, KAP_API_DOC } = require('../src/kap-announcements');
const { refreshMarketNews } = require('../src/market-news');

const NOW = '2026-10-01T12:00:00.000Z';
test('KAP probe contract never turns a public shell into connected coverage', async () => {
  const result = await collectKapAnnouncements({ now: NOW, fetchHtml: async () => '<a href="/tr/bildirim/123456">shell link</a>' });
  assert.equal(result.status, 'unverified');
  assert.equal(result.records.length, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.evidence.sourceUrl, KAP_API_DOC);
  assert.equal(result.evidence.status, 200);
});

test('retrieved public shell without result links is explicit unavailable coverage', async () => {
  const result = await collectKapAnnouncements({ now: NOW, fetchHtml: async () => '<html><form>Detaylı Sorgulama</form></html>' });
  assert.equal(result.status, 'unverified');
  assert.equal(result.errorCode, 'unsupported_public_listing');
  assert.equal(result.items.length, 0);
});

test('collector normalizes injected timeout and timestamps completion after request', async () => {
  const requested = '2026-10-01T10:00:00.000Z';
  const result = await collectKapAnnouncements({ now: requested, fetchHtml: async () => { const error = new Error('The operation was aborted due to timeout'); error.name = 'TimeoutError'; throw error; } });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.errorCode, 'timeout');
  assert.ok(Date.parse(result.checkedAt) >= Date.parse(requested));
  assert.equal(result.failures[0].errorCode, 'timeout');
});

test('transport rejects redirects and non-KAP URLs', async () => {
  await assert.rejects(() => fetchHtml('https://evil.example/', { fetcher: async () => new Response('') }), /invalid_source_url/);
  await assert.rejects(() => fetchHtml(KAP_PUBLIC_PAGE, { fetcher: async () => new Response('', { status: 302 }) }), /redirect_rejected/);
});

test('streaming transport cancels oversized public response', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } });
  const response = new Response(body);
  const original = response.body.getReader.bind(response.body);
  response.body.getReader = () => { const reader = original(); const cancel = reader.cancel.bind(reader); reader.cancel = (...args) => { cancelled = true; return cancel(...args); }; return reader; };
  await assert.rejects(() => fetchHtml(KAP_PUBLIC_PAGE, { maxBytes: 10, fetcher: async () => response }), /source_too_large/);
  assert.equal(cancelled, true);
});

test('KAP health is monotonic and outage retains prior company records and evidence', async () => {
  const rows = new Map(); let rev = 0;
  const db = { getCache: async (key) => rows.get(key) || null, compareAndSetCache: async (key, value, expected) => { const current = rows.get(key); assert.equal(current?.revision || null, expected); const revision = `r${++rev}`; rows.set(key, { value: structuredClone(value), revision }); return revision; } };
  const prior = { id: 'kap:prior', sourceId: 'kap_announcements', title: 'Prior disclosure', contentHash: 'x' };
  rows.set('market_sources_v1', { revision: 'seed', value: { schemaVersion: 1, items: [prior], sources: {} } });
  const snap = (checkedAt, status, evidence = null) => async () => ({ items: [], records: [], checkedAt, status, errorCode: status === 'unavailable' ? 'timeout' : 'unsupported_public_listing', sourceUrl: KAP_PUBLIC_PAGE, failures: [], evidence });
  const noSpk = async () => '';
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: noSpk, collectAnnouncements: false, collectFeeds: false, collectKap: snap('2026-10-01T10:00:00.000Z', 'unverified', { sourceUrl: KAP_API_DOC, bodyHash: 'h10' }), now: '2026-10-01T10:00:00.000Z' });
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: noSpk, collectAnnouncements: false, collectFeeds: false, collectKap: snap('2026-10-01T11:00:00.000Z', 'unavailable', { sourceUrl: KAP_API_DOC, reason: 'KAP API key required' }), now: '2026-10-01T11:00:00.000Z' });
  await refreshMarketNews({ collectCompanyIr: false, database: db, fetchText: noSpk, collectAnnouncements: false, collectFeeds: false, collectKap: snap('2026-10-01T10:30:00.000Z', 'unverified', { sourceUrl: KAP_API_DOC, bodyHash: 'late' }), now: '2026-10-01T10:30:00.000Z' });
  const stored = rows.get('market_sources_v1').value;
  assert.equal(stored.sources.kap.checkedAt, '2026-10-01T11:00:00.000Z');
  assert.equal(stored.sources.kap.errorCode, 'timeout');
  assert.equal(stored.sources.kap.evidence.bodyHash, 'h10');
  assert.equal(stored.sources.kap.evidence.sourceUrl, KAP_API_DOC);
  assert.equal(stored.items.some((item) => item.id === 'kap:prior'), true);
});
