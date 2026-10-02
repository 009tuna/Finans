'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderMarketNews } = require('../public/macro');
const source = { status: 'available', checkedAt: '2026-10-01T21:30:00Z', count: 20, todayDateOnlyCount: 0, todayDateOnlyAt: '2026-10-01T21:30:00Z', todayDateOnlyDate: '2026-10-02', reason: 'Yalnız ilk sayfa.' };
const company = { type: 'company_disclosure', symbol: 'FROTO', sourceId: 'company_ir_ford_otosan', title: 'Şirket açıklaması <unsafe>', publishedDate: '2026-09-06', observedAt: source.checkedAt,
  url: 'https://www.fordotosan.com.tr/doc/first', sourceUrl: 'https://www.fordotosan.com.tr/tr/yatirimcilar/duyurular/ozel-durum-aciklamalari', evidenceStatus: 'company_listing_link_verified', evidence: 'Resmî liste.' };
const news = { groups: { us: [], bist: [company, { type: 'regulatory_announcement', title: 'SPK regulatory', url: 'https://spk.gov.tr/duyuru' }, { type: 'research_event', title: 'Model event', url: 'https://example.com' }], crypto: [] }, sources: { company_ir_ford_otosan: source } };
test('company filter separates disclosure from regulation and model events without deleting either', () => {
  const html = renderMarketNews(news, 'marketNewsOverview', { market: 'bist', kind: 'company' });
  assert.match(html, /FROTO · Şirket açıklaması/); assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /SPK regulatory|Model event/);
  assert.match(html, /data-news-kind="company" aria-pressed="true"/);
  const all = renderMarketNews(news, 'marketNewsOverview', { market: 'bist' });
  assert.match(all, /SPK regulatory/); assert.match(all, /Model event/);
  const regulatory = renderMarketNews(news, 'marketNewsOverview', { market: 'bist', kind: 'regulatory' });
  assert.match(regulatory, /SPK regulatory/); assert.doesNotMatch(regulatory, /&lt;unsafe&gt;|Model event/);
});
test('date-only precision, source coverage and KAP body boundary are visible with honest archival counts', () => {
  const html = renderMarketNews(news, 'marketNewsOverview', { market: 'bist', kind: 'company' });
  assert.match(html, /Yayıncı tarihi 6 Eyl 2026/);
  assert.doesNotMatch(html, /Yayıncı tarihi 6 Eyl 2026 \d{2}:\d{2}/);
  assert.match(html, /PDF veya KAP belgesi içeriği okunmadı/);
  assert.match(html, /20 kaynak kaydı \(günlük haber sayısı değildir\)/);
  assert.match(html, /Kontrol gününe ait 0 kayıt \(2 Eki 2026\)/);
  assert.match(html, /Şirketin resmî açıklama listesi/);
});
test('conflicting references and retained outage records never receive verified document wording', () => {
  const html = renderMarketNews({ ...news, groups: { ...news.groups, bist: [{ ...company, evidenceStatus: 'company_listing_link_conflict', manualReviewRequired: true }] },
    sources: { company_ir_ford_otosan: { ...source, status: 'unavailable', errorCode: 'timeout' } } }, 'marketNewsOverview', { market: 'bist', kind: 'company' });
  assert.match(html, /Bağlantı eşleşmesi inceleme gerektiriyor/);
  assert.match(html, /Önceki liste gözlemi; güncel kaynak erişimi doğrulanamadı/);
  assert.match(html, /2 Eki 2026; önceki kontrol/);
  assert.doesNotMatch(html, /Resmî listede bağlantı doğrulandı|company_listing_link_conflict<\/span>/);
});
test('empty filter exposes recovery and company filters do not affect another market', () => {
  const empty = renderMarketNews({ ...news, groups: { ...news.groups, bist: [] } }, 'marketNewsOverview', { market: 'bist', kind: 'company' });
  assert.match(empty, /Seçili kaynak türünde doğrulanmış kayıt yok/); assert.match(empty, /Filtreyi temizle/);
  const us = renderMarketNews({ ...news, groups: { ...news.groups, us: [{ type: 'research_event', title: 'US event', url: 'https://example.com' }] } }, 'marketNewsOverview', { market: 'us', kind: 'company' });
  assert.match(us, /US event/); assert.doesNotMatch(us, /data-news-kind/);
});
