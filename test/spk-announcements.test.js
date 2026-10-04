'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectSpkAnnouncements, parseListing, selectArticle, safeDetailUrl, isNonfinancial, fetchHtml } = require('../src/spk-announcements');

const NOW = '2026-10-01T12:00:00.000Z';
const list = `<nav><a href="/duyurular/basin-duyurulari/2026/yanlis">Yanlış menü</a></nav><main><div class="liste"><a href="/duyurular/basin-duyurulari/2026/tasfiye-suresine-iliskin-basin-duyurusu"><div class="liste-item"><div class="liste-tarih">28 Eyl 2026</div><div class="liste-baslik">Tasfiye süresine ilişkin basın duyurusu</div></div></a><a href="https://evil.example/duyurular/basin-duyurulari/2026/hack"><div class="liste-baslik">link</div></a></div></main>`;
const article = `<nav><time>1 Ocak 2020</time></nav><main><div class="page-menu"><h3>Sidebar title</h3></div><h3 class="baslik">Tasfiye süresine ilişkin basın duyurusu</h3><div class="tarih">28 Eylül 2026</div><div class="spot">Kurul tasfiye süresine ilişkin açıklama yaptı.</div><div class="icerik styled-content"><p>Koşullara ilişkin kısa açıklama.</p><table><tr><td>TR001234567890123456789012</td></tr></table></div></main>`;

test('discovery only follows current-year official announcement detail URLs in main region', () => {
  const rows = parseListing(list, { sourceUrl: 'https://spk.gov.tr/duyurular/basin-duyurulari/2026', year: 2026, observedAt: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Tasfiye süresine ilişkin basın duyurusu');
  assert.equal(safeDetailUrl('https://spk.gov.tr.evil.test/duyurular/basin-duyurulari/2026/x', 2026), null);
  assert.equal(safeDetailUrl('https://spk.gov.tr/duyurular/basin-duyurulari/2025/x', 2026), null);
  assert.equal(safeDetailUrl('https://spk.gov.tr/duyurular/basin-duyurulari/2026/x?next=https://evil.test', 2026), null);
});

test('supports current official SPK h3/tarih and liste markup shape', () => {
  const rows = parseListing(list, { sourceUrl: 'https://www.spk.gov.tr/duyurular/basin-duyurulari/2026', year: 2026, observedAt: NOW });
  assert.equal(rows[0].title, 'Tasfiye süresine ilişkin basın duyurusu');
  assert.equal(selectArticle(article).publishedDate, '2026-09-28');
  assert.equal(selectArticle(article).title, 'Tasfiye süresine ilişkin basın duyurusu');
  assert.equal(require('../src/spk-announcements').safeDetailUrl('https://www.spk.gov.tr/duyurular/basin-duyurulari/2026/a', 2026), 'https://www.spk.gov.tr/duyurular/basin-duyurulari/2026/a');
});

test('article parser uses article heading/date, strips tables, and keeps announcement distinct from legal effect', async () => {
  const result = await collectSpkAnnouncements({ now: NOW, year: 2026, fetchHtml: async (url) => url.endsWith('/2026') ? list : article });
  assert.equal(result.status, 'available');
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.publishedDate, '2026-09-28');
  assert.equal(item.publishedAt, null);
  assert.equal(item.statementType, 'general_press_announcement');
  assert.equal(item.impactScope, 'announcement_evidence_only');
  assert.equal(item.manualReviewRequired, true);
  assert.equal(item.legalEffect, 'not_assessed');
  assert.ok(item.contentHash.length === 64);
  assert.ok(!item.evidence.includes('TR001234'));
  assert.equal(selectArticle('<nav><h1>Not an article</h1></nav>'), null);
  assert.equal(selectArticle('<main><h1>Announcement</h1><p>On 18 July 2026 a historical measure was published.</p></main>'), null, 'historical body dates are not publication dates');
});

test('future publication rejected and detail failure yields partial without discarding successes', async () => {
  const two = list.replace('</div></main>', '<a href="/duyurular/basin-duyurulari/2026/second"><div class="liste-baslik">İkinci</div></a></div></main>');
  const result = await collectSpkAnnouncements({ now: NOW, year: 2026, fetchHtml: async (url) => {
    if (url.endsWith('/2026')) return two;
    if (url.endsWith('/second')) throw new Error('offline');
    return article.replace('28 Eylül 2026', '2 Ekim 2026');
  } });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.items.length, 0);
  assert.equal(result.failures.length, 2);
});

test('date-only publication uses Istanbul calendar day at late UTC hours', async () => {
  const nextLocalDay = article.replace('28 Eylül 2026', '2 Ekim 2026');
  const result = await collectSpkAnnouncements({ now: '2026-10-01T21:30:00.000Z', year: 2026, fetchHtml: async (url) => url.endsWith('/2026') ? list : nextLocalDay });
  assert.equal(result.items.length, 1, '21:30 UTC is already the next publication day in Istanbul');
});

test('obvious nonfinancial announcements are filtered', () => {
  assert.equal(isNonfinancial('Personel alımı duyurusu', 'Başvuru bilgileri'), true);
  assert.equal(isNonfinancial('Yatırım fonlarına ilişkin açıklama', 'Düzenleme süreci'), false);
});

test('transport rejects redirects and caps streamed response size', async () => {
  await assert.rejects(() => fetchHtml('https://spk.gov.tr/duyurular/basin-duyurulari/2026/x', {
    fetcher: async () => new Response('', { status: 302, headers: { location: 'https://evil.example/' } }),
  }), /redirect_rejected/);
  const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } }));
  await assert.rejects(() => fetchHtml('https://spk.gov.tr/duyurular/basin-duyurulari/2026/x', { fetcher: async () => oversized, maxBytes: 10 }), /source_too_large/);
});

test('changed official article content creates a distinct append-only observation', async () => {
  const first = await collectSpkAnnouncements({ now: NOW, year: 2026, fetchHtml: async (u) => u.endsWith('/2026') ? list : article });
  const revisedHtml = article.replace('açıklama yaptı', 'açıklama yayımladı');
  const second = await collectSpkAnnouncements({ now: '2026-10-01T13:00:00.000Z', year: 2026, fetchHtml: async (u) => u.endsWith('/2026') ? list : revisedHtml });
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.notEqual(first.items[0].contentHash, second.items[0].contentHash);
  assert.equal(first.items[0].publishedDate, second.items[0].publishedDate);
  const navChanged = article.replace('<nav><time>1 Ocak 2020</time></nav>', '<nav><time>2 Ocak 2020</time><a href="/">Home</a></nav>');
  const stable = await collectSpkAnnouncements({ now: '2026-10-01T14:00:00.000Z', year: 2026, fetchHtml: async (u) => u.endsWith('/2026') ? list : navChanged });
  assert.equal(first.items[0].contentHash, stable.items[0].contentHash, 'navigation changes do not create content revisions');
});
