// Ekonomik veri takvimi: normalleştirme, gerçekleşen eşleştirme, sürpriz ve görünüm testleri.
'use strict';
const assert = require('assert');
const EC = require('../public/econ-calendar');
const { buildEconomicCalendar, legacyEconomicRows, mergeEvents } = require('../src/econ-calendar-source');

const ffWeek = require('./fixtures/econ-ff-thisweek-2026-10-17.json');
const nasdaq = {
  '2026-10-15': require('./fixtures/econ-nasdaq-2026-10-15.json'),
  '2026-10-16': require('./fixtures/econ-nasdaq-2026-10-16.json'),
};
const NOW = '2026-10-17T12:00:00.000Z';

function fakeFetch(calls) {
  return async (url) => {
    calls.push(url);
    let body = null;
    if (url.endsWith('ff_calendar_thisweek.json')) body = ffWeek;
    const m = url.match(/date=(\d{4}-\d{2}-\d{2})$/);
    if (m && nasdaq[m[1]]) body = nasdaq[m[1]];
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
  };
}
function memoryStore(initial) {
  const store = { value: initial || null, writes: 0 };
  store.read = async () => store.value;
  store.write = async (value) => { store.value = value; store.writes++; };
  return store;
}

(async () => {
  console.log('🧪 Ekonomik takvim testleri başlatılıyor...\n');

  console.log('1. Sayı ayrıştırma ve eşitlik...');
  assert.deepStrictEqual(EC.parseFigure('0.6%'), { text: '0.6%', value: 0.6, unit: '%', decimals: 1 });
  assert.strictEqual(EC.parseFigure('1,710K').value, 1710);
  assert.strictEqual(EC.parseFigure('-11.120M').unit, 'M');
  assert.strictEqual(EC.parseFigure('&nbsp;'), null);
  assert.strictEqual(EC.parseFigure(''), null);
  assert.ok(EC.sameFigure(EC.parseFigure('0.3%'), EC.parseFigure('0.30%')));
  assert.ok(!EC.sameFigure(EC.parseFigure('0.3%'), EC.parseFigure('0.3')));
  console.log('   ✓ Yüzde, bin/milyon ve boş değerler doğru okunuyor.');

  console.log('2. Forex Factory satırı → olay modeli ve filtre...');
  const cpi = EC.normalizeForexFactory({ title: 'CPI m/m', country: 'USD', date: '2026-10-14T08:30:00-04:00', impact: 'High', forecast: '0.6%', previous: '0.4%' });
  assert.strictEqual(cpi.scheduledAt, '2026-10-14T12:30:00.000Z');
  assert.strictEqual(cpi.titleTr, 'TÜFE (aylık)');
  assert.strictEqual(cpi.category, 'inflation');
  assert.strictEqual(cpi.localDate, '2026-10-14');
  assert.strictEqual(EC.normalizeForexFactory({ title: 'BRC Retail Sales Monitor y/y', country: 'GBP', date: '2026-10-12T19:01:00-04:00', impact: 'Low' }), null);
  assert.strictEqual(EC.normalizeForexFactory({ title: 'GDP m/m', country: 'GBP', date: '2026-10-15T02:00:00-04:00', impact: 'High' }), null, 'İngiltere listede yok');
  assert.strictEqual(EC.titleTr('Fed Chairman Warsh Speaks'), 'Fed Başkanı Warsh konuşuyor');
  assert.strictEqual(EC.categoryOf('Unemployment Claims'), 'labor-weak');
  assert.strictEqual(EC.categoryOf('Non-Farm Employment Change'), 'labor-strong');
  assert.strictEqual(EC.categoryOf('Crude Oil Inventories'), 'energy');
  console.log('   ✓ UTC zaman, Türkçe ad, kategori ve etki filtresi doğru.');

  console.log('3. Fixture ile birleşik takvim ve gerçekleşen eşleştirme...');
  const calls = [];
  const store = memoryStore();
  const payload = await buildEconomicCalendar({ now: NOW, fetchImpl: fakeFetch(calls), store });
  const byTitle = (title) => payload.events.find((e) => e.title === title);
  assert.ok(payload.events.length >= 8, 'ABD yüksek/orta etkili olaylar gelmeli');
  assert.strictEqual(byTitle('CPI m/m').actual.text, '0.6%');
  assert.strictEqual(byTitle('CPI y/y').actual.text, '3.7%');
  assert.strictEqual(byTitle('Core CPI m/m').actual.text, '0.3%');
  assert.strictEqual(byTitle('Core CPI y/y').actual.text, '2.6%');
  assert.strictEqual(byTitle('PPI m/m').actual.text, '1.3%');
  assert.strictEqual(byTitle('Core PPI m/m').actual.text, '0.7%');
  const retail = byTitle('Retail Sales m/m');
  assert.strictEqual(retail.actual.text, '0.8%', 'Retail Control değil, manşet perakende eşleşmeli');
  assert.strictEqual(retail.revisedPrevious.text, '1.3%', 'Önceki değer revizyonu korunmalı');
  assert.strictEqual(byTitle('Core Retail Sales m/m').actual.text, '0.9%');
  assert.strictEqual(byTitle('Fed Chairman Warsh Speaks').actual, null);
  assert.strictEqual(store.writes, 1);
  assert.strictEqual(payload.coverage.sources.forexfactory.nextweek.status, 'not_published');
  console.log('   ✓ TÜFE, ÜFE, perakende sonuçları doğru veriyle eşleşti; revizyon ayrı tutuldu.');

  console.log('4. Sürpriz yönü ve fark...');
  const s1 = EC.surpriseOf(byTitle('CPI m/m'));
  assert.strictEqual(s1.direction, 'inline');
  const s2 = EC.surpriseOf(byTitle('Core CPI m/m'));
  assert.strictEqual(s2.direction, 'above');
  assert.strictEqual(EC.fmtDiff(s2), '+0,1 puan');
  assert.strictEqual(EC.surpriseOf(retail).direction, 'above');
  assert.strictEqual(EC.surpriseOf({ actual: EC.parseFigure('199K'), forecast: EC.parseFigure('210K') }).direction, 'below');
  console.log('   ✓ Paralel/üstü/altı ayrımı beklentinin hassasiyetiyle ölçülüyor.');

  console.log('5. Kayıtlı takvim korunur, sık istekte kaynak tekrar çağrılmaz...');
  const calls2 = [];
  const again = await buildEconomicCalendar({ now: '2026-10-17T12:10:00.000Z', fetchImpl: fakeFetch(calls2), store });
  assert.ok(!calls2.some((u) => u.includes('faireconomy')), '30 dk içinde Forex Factory çağrılmamalı');
  assert.strictEqual(again.events.length, payload.events.length);
  assert.strictEqual(again.events.find((e) => e.title === 'CPI m/m').actual.text, '0.6%');
  const later = await buildEconomicCalendar({ now: '2026-10-26T12:00:00.000Z', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }), store });
  assert.strictEqual(later.coverage.status, 'stale');
  assert.ok(later.events.some((e) => e.title === 'CPI m/m' && e.actual), 'Kaynak düşerse geçen haftanın sonuçları kaybolmamalı');
  console.log('   ✓ Önbellek, hız sınırı ve kaynak kesintisinde son kayıt sunuluyor.');

  console.log('6. Hafta akışı otoritedir: kaldırılan olay düşer, sonuç ve AI alanı taşınır...');
  const old = [
    { id: 'US:old:2026-10-14T12:30', scheduledAt: '2026-10-14T12:30:00.000Z' },
    { id: 'US:keep:2026-10-01T12:30', scheduledAt: '2026-10-01T12:30:00.000Z' },
    { id: 'US:cpi:2026-10-14T12:30', scheduledAt: '2026-10-14T12:30:00.000Z', actual: EC.parseFigure('0.6%'), ai: { view: 'x' } },
  ];
  const merged = mergeEvents(old, [{ id: 'US:cpi:2026-10-14T12:30', scheduledAt: '2026-10-14T12:30:00.000Z', actual: null }], [[Date.parse('2026-10-11T00:00:00Z'), Date.parse('2026-10-17T23:00:00Z')]], Date.parse(NOW));
  assert.deepStrictEqual(merged.map((e) => e.id), ['US:keep:2026-10-01T12:30', 'US:cpi:2026-10-14T12:30']);
  assert.strictEqual(merged[1].actual.text, '0.6%');
  assert.deepStrictEqual(merged[1].ai, { view: 'x' });
  console.log('   ✓ Birleştirme kuralları doğru.');

  console.log('7. Senaryo ve görünüm...');
  const rule = EC.ruleScenarios(byTitle('CPI m/m'));
  assert.ok(rule.above.us && rule.above.bist && rule.above.crypto && rule.below.us);
  const withAi = Object.assign({}, byTitle('CPI m/m'), { ai: { view: 'Benzin etkisi geçici.', forecast: '%0,5', scenarios: { above: { us: 'a', bist: 'b', crypto: 'c' }, below: { us: 'd', bist: 'e', crypto: 'f' } } } });
  assert.strictEqual(EC.scenariosFor(withAi).source, 'ai');
  const html = EC.calendarHtml({ events: payload.events }, { now: '2026-10-14T06:00:00.000Z' });
  assert.ok(html.includes('TÜFE (aylık)'));
  assert.ok(html.includes('Beklenti üstü gelirse') && html.includes('Beklenti altı gelirse'));
  assert.ok(html.includes('BIST') && html.includes('Kripto'));
  assert.ok(html.includes('Şahin ton'), 'Konuşmalarda şahin/güvercin başlığı');
  const after = EC.calendarHtml({ events: payload.events }, { now: NOW });
  assert.ok(after.includes('Son açıklananlar'));
  assert.ok(after.includes('Beklenti üstü · +0,5 puan'), 'Perakende sürprizi tabloda');
  assert.ok(!/<img/i.test(EC.calendarHtml({ events: [Object.assign({}, cpi, { titleTr: '<img onerror=x>' })] }, { now: '2026-10-13T00:00:00Z' })));
  const card = EC.eventCardHtml(byTitle('Core CPI m/m'), Date.parse(NOW));
  assert.ok(card.includes('is-realized'), 'Gerçekleşen senaryo vurgulanmalı');
  assert.ok(EC.calendarHtml({ events: [], coverage: { status: 'unavailable' } }).includes('ulaşılamıyor'));
  console.log('   ✓ Kartlar, senaryo vurgusu ve kaçış doğru.');

  console.log('8. Eski tüketiciler için satırlar...');
  const legacy = legacyEconomicRows(payload.events, '2026-10-14', '2026-10-14');
  const legacyCpi = legacy.find((r) => r.event === 'CPI m/m');
  assert.strictEqual(legacyCpi.date, '2026-10-14');
  assert.strictEqual(legacyCpi.estimate, '0.6%');
  assert.strictEqual(legacyCpi.actual, '0.6%');
  assert.strictEqual(legacyCpi.impact, 'high');
  assert.strictEqual(legacyCpi.country, 'US');
  console.log('   ✓ Finnhub biçimi korunuyor.');

  console.log('9. Haftalık akışın kapsamadığı günler Nasdaq ile tamamlanır...');
  const partialWeek = ffWeek.filter((row) => row.date < '2026-10-15');
  const aheadFetch = async (url) => {
    if (url.endsWith('ff_calendar_thisweek.json')) return { ok: true, status: 200, json: async () => partialWeek };
    const m = url.match(/date=(\d{4}-\d{2}-\d{2})$/);
    return m && nasdaq[m[1]] ? { ok: true, status: 200, json: async () => nasdaq[m[1]] } : { ok: false, status: 404, json: async () => ({}) };
  };
  const aheadPayload = await buildEconomicCalendar({ now: '2026-10-14T20:00:00.000Z', fetchImpl: aheadFetch, store: memoryStore() });
  const ppi = aheadPayload.events.filter((e) => e.titleTr === 'ÜFE (aylık)');
  assert.strictEqual(ppi.length, 1);
  assert.strictEqual(ppi[0].source, 'nasdaq');
  assert.strictEqual(ppi[0].scheduledAt, '2026-10-15T12:30:00.000Z');
  assert.strictEqual(ppi[0].forecast.text, '0.6%');
  assert.strictEqual(aheadPayload.events.filter((e) => e.titleTr === 'TÜFE (aylık)').length, 1, 'Haftalık akıştaki olay tekrar eklenmez');
  assert.strictEqual(aheadPayload.events.find((e) => e.titleTr === 'Perakende satışlar (aylık)').impact, 'high');
  assert.strictEqual(EC.easternToUtc('2026-12-10', '08:30'), '2026-12-10T13:30:00.000Z', 'Kış saati');
  console.log('   ✓ İleri tarihli ABD verileri saat dilimi doğru ve tekrarsız ekleniyor.');

  console.log('\n🎉 Tüm ekonomik takvim testleri geçti.');
})().catch((err) => { console.error(err); process.exit(1); });
