// AI analist katmanı: takvim girdisi, çıktı temizliği, takvimle birleşme ve piyasa görüşü görünümü.
'use strict';
const assert = require('assert');
const { mock } = require('node:test');
const EC = require('../public/econ-calendar');
const { marketViewsHtml } = require('../public/analyst-views');
const { buildDataCalendar, sanitizeAnalystLayer } = require('../src/research-analyst');
const { buildContext, checkSchema } = require('../src/research-runner');
const schema = require('../src/research-schema');

const NOW = '2026-10-17T12:00:00.000Z';
const ffWeek = require('./fixtures/econ-ff-thisweek-2026-10-17.json');
const events = EC.attachActuals(ffWeek.map(EC.normalizeForexFactory).filter(Boolean), {
  '2026-10-15': require('./fixtures/econ-nasdaq-2026-10-15.json').data.rows,
  '2026-10-16': require('./fixtures/econ-nasdaq-2026-10-16.json').data.rows,
});
const cpi = events.find((e) => e.title === 'CPI m/m');
const markets = (prefix) => ({ us: prefix + ' ABD', bist: prefix + ' BIST', crypto: prefix + ' Kripto' });

console.log('🧪 AI analist katmanı testleri başlatılıyor...\n');

console.log('1. AI girdisi: veri takvimi sade biçimde ve pencere içinde...');
const calendar = buildDataCalendar({ events }, NOW);
const cpiRow = calendar.find((e) => e.id === cpi.id);
assert.strictEqual(cpiRow.title, 'TÜFE (aylık)');
assert.strictEqual(cpiRow.forecast, '0.6%');
assert.strictEqual(cpiRow.actual, '0.6%');
assert.strictEqual(cpiRow.surprise.direction, 'inline');
assert.ok(!buildDataCalendar({ events }, '2026-10-30T00:00:00Z').length, '3 günden eski açıklamalar girdiye girmez');
const contextBase = { runId: 'r', snapshotId: NOW, markets: {}, quality: {}, calendar: { economic: [], events, eventsCoverage: { status: 'available' } } };
// The fixture calendar must use its own clock. Scheduled workflows run this
// suite every day, after these October events have left the analysis window.
let context;
mock.timers.enable({ apis: ['Date'], now: new Date(NOW) });
try { context = buildContext(contextBase, {}, {}); }
finally { mock.timers.reset(); }
assert.strictEqual(context.analysisAsOf, NOW);
assert.ok(Array.isArray(context.dataCalendar) && context.dataCalendar.length);
assert.deepStrictEqual(context.dataCalendar, calendar);
assert.strictEqual(context.calendar.events, undefined, 'Takvim olayları girdide iki kez yer almaz');
mock.timers.enable({ apis: ['Date'], now: new Date('2030-01-01T12:00:00.000Z') });
try {
  const laterContext = buildContext(contextBase, {}, {});
  assert.strictEqual(laterContext.analysisAsOf, '2030-01-01T12:00:00.000Z');
  assert.deepStrictEqual(laterContext.dataCalendar, [], 'Eski örnek olaylar araştırma gününe göre elenir; snapshot tarihi güncel zaman yerine geçmez');
} finally { mock.timers.reset(); }
console.log('   ✓ dataCalendar önceki/beklenti/gerçekleşen/sürpriz taşıyor.');

console.log('2. Şema: yeni alanlar zorunlu üretim şemasında, eski çalışmalar geçerli...');
const generationSchema = { ...schema, required: Object.keys(schema.properties) };
assert.ok(generationSchema.required.includes('marketViews') && generationSchema.required.includes('calendarAnalysis') && generationSchema.required.includes('turkeyCalendar'));
const legacy = { macroSummary: 'x', todayFocus: 'x', commentary: markets('x'), coverage: [], sources: [], events: [], forecasts: [], scenarios: [], signals: [], unresolvedQuestions: [] };
checkSchema(legacy);
const view = { stance: 'olumlu', conviction: 'orta', thesis: 'Tez', drivers: ['a'], risks: ['b'], watch: 'c' };
checkSchema({ ...legacy, marketViews: { us: view, bist: view, crypto: view }, calendarAnalysis: [], turkeyCalendar: [] });
assert.throws(() => checkSchema({ ...legacy, marketViews: { us: { ...view, stance: 'al' }, bist: view, crypto: view } }));
console.log('   ✓ Şema uyumlu.');

console.log('3. Temizlik: geçersiz analist kaydı ayıklanır, rapor düşmez...');
const research = {
  ...legacy,
  sources: [{ id: 's1' }],
  marketViews: { us: view, bist: { ...view, thesis: '' }, crypto: { ...view, stance: 'olumsuz', drivers: ['1', '2', '3', '4', '5'] } },
  calendarAnalysis: [
    { eventId: cpi.id, view: 'Benzin etkisi geçici.', forecast: '0.5%', conviction: 'orta', above: markets('üst'), below: markets('alt'), sourceIds: ['s1', 'yok'] },
    { eventId: cpi.id, view: 'tekrar', forecast: '', conviction: 'orta', above: markets('x'), below: markets('y'), sourceIds: [] },
    { eventId: 'US:bilinmeyen:2026-10-20T12:30', view: 'x', forecast: '', conviction: 'orta', above: markets('x'), below: markets('y'), sourceIds: [] },
    { eventId: events[1].id, view: 'x', forecast: '', conviction: 'orta', above: { us: 'a', bist: '', crypto: 'c' }, below: markets('y'), sourceIds: [] },
  ],
  turkeyCalendar: [
    { id: 'tr-ppk-2026-10-22', title: 'TCMB faiz kararı', scheduledAt: '2026-10-22T11:00:00Z', impact: 'high', previous: '40.5%', forecast: '%39,0', actual: '', view: 'İndirim sürer.', conviction: 'orta', above: markets('şahin'), below: markets('güvercin'), sourceIds: ['s1'] },
    { id: 'tr-eski', title: 'Eski', scheduledAt: '2026-09-01T07:00:00Z', impact: 'high', previous: '', forecast: '', actual: '', view: 'x', conviction: 'orta', above: markets('a'), below: markets('b'), sourceIds: [] },
    { id: 'tr-saatsiz', title: 'Saat yok', scheduledAt: '2026-10-20', impact: 'high', previous: '', forecast: '', actual: '', view: 'x', conviction: 'orta', above: markets('a'), below: markets('b'), sourceIds: [] },
  ],
};
const clean = sanitizeAnalystLayer(research, { dataCalendar: calendar }, NOW);
assert.deepStrictEqual(Object.keys(clean.marketViews).sort(), ['crypto', 'us']);
assert.strictEqual(clean.marketViews.crypto.drivers.length, 4);
assert.strictEqual(clean.calendarAnalysis.length, 1);
assert.deepStrictEqual(clean.calendarAnalysis[0].sourceIds, ['s1']);
assert.deepStrictEqual(clean.turkeyCalendar.map((t) => t.id), ['tr-ppk-2026-10-22']);
assert.ok(clean.analystDropped.length >= 5);
console.log('   ✓ Tekrar, bilinmeyen olay, eksik piyasa, eski ve saatsiz kayıtlar ayıklandı.');

console.log('4. Takvimle birleşme...');
const merged = EC.mergeAnalysis(events, clean);
const mergedCpi = merged.find((e) => e.id === cpi.id);
assert.strictEqual(mergedCpi.ai.view, 'Benzin etkisi geçici.');
assert.strictEqual(EC.scenariosFor(mergedCpi).source, 'ai');
assert.strictEqual(EC.scenariosFor(mergedCpi).above.bist, 'üst BIST');
const tr = merged.find((e) => e.country === 'TR');
assert.strictEqual(tr.countryLabel, 'Türkiye');
assert.strictEqual(tr.forecast.value, 39);
assert.strictEqual(tr.previous.value, 40.5);
assert.strictEqual(tr.localTime, '14:00');
assert.strictEqual(tr.category, 'policy-rate');
// Kaynak değişince (Forex Factory → Nasdaq) kimlik farklı olsa da analiz aynı veriye bağlanır.
const nasdaqRetail = { ...events.find((e) => e.title === 'Retail Sales m/m'), id: 'US:retail-sales:2026-10-15T12:30', title: 'Retail Sales' };
const crossSource = EC.mergeAnalysis([nasdaqRetail], { calendarAnalysis: [{ eventId: 'US:retail-sales-m-m:2026-10-15T12:30', view: 'Güçlü', forecast: '', conviction: 'düşük', above: markets('a'), below: markets('b') }] });
assert.strictEqual(crossSource[0].ai.view, 'Güçlü');
const html = EC.calendarHtml({ events: merged }, { now: '2026-10-14T06:00:00Z' });
assert.ok(html.includes('AI görüşü · güven orta'));
assert.ok(html.includes('AI tahmini') && html.includes('%0,5'));
assert.ok(!html.includes('Genel aktarım kuralı · olaya özel AI analizi eklendiğinde değişir</p></article><article class="ec-card ec-high ec-upcoming" data-event-id="' + cpi.id), 'AI senaryolu kartta kural notu yok');
const trHtml = EC.calendarHtml({ events: merged }, { now: '2026-10-20T06:00:00Z' });
assert.ok(trHtml.includes('TCMB faiz kararı') && trHtml.includes('Türkiye') && trHtml.includes('güvercin BIST'));
console.log('   ✓ AI görüşü, AI tahmini ve Türkiye verisi takvimde.');

console.log('5. Piyasa görüşü görünümü...');
const viewsHtml = marketViewsHtml(clean.marketViews, { bist: 'Eski BIST yorumu' });
assert.ok(viewsHtml.includes('Olumlu') && viewsHtml.includes('Olumsuz'));
assert.ok(viewsHtml.includes('Eski BIST yorumu'), 'Eksik görüşte düz yorum yedeği');
assert.ok(viewsHtml.includes('Görüşü bozacaklar'));
assert.ok(!marketViewsHtml(clean.marketViews, null, { compact: true }).includes('Destekleyenler'));
assert.ok(!/<img/.test(marketViewsHtml({ us: { ...view, thesis: '<img src=x>' } })));
assert.strictEqual(marketViewsHtml(null, null), '');
console.log('   ✓ Görüş, yön, güven ve kaçış doğru.');

console.log('\n🎉 Tüm AI analist katmanı testleri geçti.');
