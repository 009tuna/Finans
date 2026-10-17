// İki yönlü trend sinyal motoru ve sanal işlem defteri testleri (sentetik fiyat serileri).
'use strict';
const assert = require('assert');
const TS = require('../src/trend-signals');
const J = require('../src/trend-signal-journal');

function day(i) { return new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10); }
// closes: kapanış dizisi; her gün açılış = önceki kapanış, gün içi aralık ±%1.
function series(closes) {
  const bars = { dates: [], opens: [], highs: [], lows: [], closes: [] };
  closes.forEach((c, i) => {
    const o = i ? closes[i - 1] : c;
    bars.dates.push(day(i)); bars.opens.push(o); bars.closes.push(c);
    bars.highs.push(Math.max(o, c) * 1.01); bars.lows.push(Math.min(o, c) * 0.99);
  });
  return bars;
}
const uptrend = (n, slope = 0.002, amp = 0.02, period = 3) => Array.from({ length: n }, (_, i) => 100 * Math.exp(slope * i) * (1 + amp * Math.sin(i / period)));
const downtrend = (n) => uptrend(n, -0.002);
const extend = (bars, closes) => series(bars.closes.concat(closes));

console.log('🧪 Trend sinyal testleri başlatılıyor...\n');

console.log('1. Göstergeler...');
assert.deepStrictEqual(TS.rollingSma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
const flat = series(Array(30).fill(100));
assert.ok(TS.rollingAtr(flat.highs, flat.lows, flat.closes, 14).slice(14).every((v) => Math.abs(v - 2) < 1e-9));
assert.strictEqual(TS.rollingRsi(Array.from({ length: 30 }, (_, i) => 100 + i), 14)[29], 100);
console.log('   ✓ SMA, ATR, RSI doğru.');

console.log('2. Rejim ve kırılım tetiği...');
const up = uptrend(260);
const breakout = series(up.concat([Math.max(...up.slice(-60)) * 1.05]));
const ind = TS.prepare(breakout);
assert.strictEqual(TS.regimeAt(ind, ind.closes.length - 1), 'up');
const trig = TS.triggerAt(ind, ind.closes.length - 1);
assert.strictEqual(trig.direction, 'long');
assert.strictEqual(trig.setup, 'breakout');
const down = downtrend(260);
const breakdown = series(down.concat([Math.min(...down.slice(-60)) * 0.95]));
const dInd = TS.prepare(breakdown);
assert.strictEqual(TS.regimeAt(dInd, dInd.closes.length - 1), 'down');
assert.deepStrictEqual(TS.triggerAt(dInd, dInd.closes.length - 1).direction, 'short');
assert.strictEqual(TS.triggerAt(TS.prepare(series(up.slice(0, 150))), 149), null, 'Kısa geçmişte sinyal yok');
console.log('   ✓ Yükselişte long, düşüşte short kırılımı; kısa geçmişte sinyal yok.');

console.log('3. Plan ve işlem ilerletme...');
const plan = TS.planFromEntry('long', 100, 2);
assert.deepStrictEqual(plan, { entry: 100, stop: 96, target: 108, risk: 4 });
const shortPlan = TS.planFromEntry('short', 100, 2);
assert.strictEqual(shortPlan.stop, 104); assert.strictEqual(shortPlan.target, 92);
const path = { dates: [day(0), day(1), day(2)], opens: [100, 101, 103], highs: [102, 104, 109], lows: [99, 100, 102], closes: [101, 103, 108], sma50: [90, 90, 90] };
const hit = TS.advanceTrade({ direction: 'long', ...plan, entryIndex: 0 }, path, 2, TS.DEFAULTS, 0);
assert.strictEqual(hit.exitReason, 'target'); assert.strictEqual(hit.r, 2);
const both = { ...path, highs: [109, 0, 0], lows: [95, 0, 0] };
assert.strictEqual(TS.advanceTrade({ direction: 'long', ...plan, entryIndex: 0 }, both, 0, TS.DEFAULTS, 0).exitReason, 'stop', 'Aynı gün stop ve hedef: stop');
const gap = { ...path, opens: [100, 94, 94], lows: [99, 93, 93] };
const gapped = TS.advanceTrade({ direction: 'long', ...plan, entryIndex: 0 }, gap, 2, TS.DEFAULTS, 0);
assert.strictEqual(gapped.exit, 94, 'Boşlukla stop altına açılışta açılıştan çıkılır');
const shortHit = TS.advanceTrade({ direction: 'short', ...shortPlan, entryIndex: 0 }, { ...path, highs: [101, 101, 101], lows: [99, 95, 91], closes: [99, 96, 92], sma50: [110, 110, 110] }, 2, TS.DEFAULTS, 0.002);
assert.strictEqual(shortHit.exitReason, 'target');
assert.ok(shortHit.r < 2 && shortHit.r > 1.9, 'Maliyet R içinden düşülür');
const trendExit = TS.advanceTrade({ direction: 'long', ...plan, entryIndex: 0 }, { ...path, closes: [101, 89.5, 100], highs: [102, 102, 102], lows: [99, 97, 97] }, 2, TS.DEFAULTS, 0);
assert.strictEqual(trendExit.exitReason, 'trend');
console.log('   ✓ Stop, hedef, boşluk, trend çıkışı ve maliyet doğru.');

console.log('4. Geçmiş testi ve özet...');
const trades = TS.backtest(series(uptrend(520, 0.004, 0.08, 6)), { market: 'us' });
assert.ok(trades.length > 0);
assert.ok(trades.every((t, i) => !i || t.entryIndex > trades[i - 1].exitIndex), 'İşlemler örtüşmez');
assert.ok(TS.backtest(series(downtrend(400)), { market: 'bist', allowShort: false }).every((t) => t.direction === 'long'), 'Short kapalıyken short açılmaz');
const s = TS.summarize([{ r: 2, returnPct: 0.04, exitReason: 'target', entryIndex: 0, exitIndex: 4, exitDate: 'b' }, { r: -1, returnPct: -0.02, exitReason: 'stop', entryIndex: 5, exitIndex: 6, exitDate: 'c' }]);
assert.strictEqual(s.trades, 2); assert.strictEqual(s.winRate, 0.5); assert.strictEqual(s.profitFactor, 2); assert.strictEqual(s.maxDrawdownR, 1);
console.log('   ✓ Örtüşmeyen işlemler ve özet istatistikler.');

console.log('5. Short izni: ABD/kripto ve VİOP vadelisi olan BIST payı...');
assert.strictEqual(J.shortModeFor('us', 'AAPL'), 'trade');
assert.strictEqual(J.shortModeFor('crypto', 'BTC'), 'trade');
assert.strictEqual(J.shortModeFor('bist', 'THYAO'), 'trade');
assert.strictEqual(J.shortModeFor('bist', 'BERA'), 'reduce');
assert.strictEqual(TS.evaluateLatest(breakdown, { market: 'bist', shortMode: 'reduce' }).action, 'reduce');
assert.strictEqual(TS.evaluateLatest(breakdown, { market: 'us', shortMode: 'trade' }).action, 'short');
console.log('   ✓ Vadelisi olmayan BIST payında short yerine azalt/çık.');

console.log('6. Sanal işlem defteri: sinyal → giriş → kapanış...');
const backtest = { summary: { 'us:long:breakout': { trades: 120, profitFactor: 1.81, winRate: 0.49, avgR: 0.43 }, 'bist:short:breakout': { trades: 77, profitFactor: 0.3, winRate: 0.18, avgR: -0.58 } } };
const NOW = '2026-10-17T12:00:00.000Z';
const day1 = J.processJournal(null, [{ market: 'us', symbol: 'TEST', bars: breakout }], { now: NOW, backtest });
assert.strictEqual(day1.journal.records.length, 1);
const rec = day1.journal.records[0];
assert.strictEqual(rec.status, 'pending'); assert.strictEqual(rec.direction, 'long');
assert.strictEqual(rec.evidence.status, 'proven');
const again = J.processJournal(day1.journal, [{ market: 'us', symbol: 'TEST', bars: breakout }], { now: NOW, backtest });
assert.strictEqual(again.journal.records.length, 1, 'Aynı gün tekrar çalışma kayıt çoğaltmaz');
const lastClose = breakout.closes.at(-1);
const nextBars = extend(breakout, [lastClose * 1.01, lastClose * 1.02]);
const day2 = J.processJournal(day1.journal, [{ market: 'us', symbol: 'TEST', bars: nextBars }], { now: NOW, backtest });
const opened = day2.journal.records.find((r) => r.id === rec.id);
assert.strictEqual(opened.status, 'open');
assert.strictEqual(opened.entryDate, nextBars.dates[breakout.dates.length]);
assert.strictEqual(opened.entry, Math.round(lastClose * 1e6) / 1e6, 'Giriş sinyalden sonraki ilk açılış');
assert.ok(Number.isFinite(opened.unrealizedR));
const crash = extend(nextBars, [lastClose * 0.6]);
const day3 = J.processJournal(day2.journal, [{ market: 'us', symbol: 'TEST', bars: crash }], { now: NOW, backtest });
const closed = day3.journal.records.find((r) => r.id === rec.id);
assert.strictEqual(closed.status, 'closed'); assert.strictEqual(closed.exitReason, 'stop');
assert.ok(closed.r < -1, 'Boşluklu stop 1R üstü kayıp olabilir');
const stale = J.processJournal({ records: [{ ...rec, signalDate: '2026-09-01' }] }, [{ market: 'us', symbol: 'TEST', bars: series(up.slice(0, 220)) }], { now: NOW, backtest });
assert.strictEqual(stale.journal.records[0].status, 'expired');
const advisory = J.processJournal(null, [{ market: 'bist', symbol: 'BERA', bars: breakdown }], { now: NOW, backtest });
assert.strictEqual(advisory.journal.records[0].status, 'advisory');
assert.strictEqual(advisory.journal.records[0].action, 'reduce');
console.log('   ✓ Bekleyen, açık, kapanan, süresi dolan ve uyarı kayıtları.');

console.log('7. Panel görünümü...');
const view = J.buildView(day3.journal, day3.latest, { now: NOW, backtest });
assert.strictEqual(view.closed.length, 1);
assert.strictEqual(view.live.all.trades, 1);
assert.strictEqual(view.evidence['us:long:breakout'].status, 'proven');
assert.strictEqual(view.evidence['bist:short:breakout'].status, 'weak');
assert.strictEqual(view.evidence['crypto:short:pullback'].status, 'untested');
assert.strictEqual(view.futuresUniverse.count, 48);
console.log('   ✓ Görünüm özetleri doğru.');

console.log('8. Kalıcı yazma: karşılaştırmalı kayıt, çakışmada yeniden dener...');
(async () => {
  let stored = null, revision = null, conflicts = 1;
  const db = {
    getCache: async (key) => key === J.JOURNAL_KEY ? (stored ? { value: stored, revision } : null) : { value: backtest },
    compareAndSetCache: async (key, value, expected) => {
      if (conflicts-- > 0) { const e = new Error('conflict'); e.statusCode = 409; throw e; }
      assert.strictEqual(expected, revision); stored = value; revision = 'r' + Date.now(); return revision;
    },
  };
  const snap = {};
  await J.processTrendSignals(snap, [{ market: 'us', symbol: 'TEST', bars: breakout }], { db, now: NOW });
  assert.strictEqual(snap.trendSignals.persisted, true);
  assert.strictEqual(stored.records.length, 1);
  const offline = {};
  await J.processTrendSignals(offline, [{ market: 'us', symbol: 'TEST', bars: breakout }], { db: { getCache: async () => { throw new Error('down'); }, compareAndSetCache: async () => {} }, now: breakout.dates.at(-1) + 'T20:00:00.000Z' });
  assert.strictEqual(offline.trendSignals.persisted, false);
  assert.strictEqual(offline.trendSignals.newSignals.length, 1, 'Kayıt yazılamasa da günün sinyali görünür');
  console.log('   ✓ Yazma, çakışma ve çevrimdışı durum.');

  console.log('9. Panel HTML...');
  const UI = require('../public/trend-signals-ui');
  const html = UI.dashboardHtml(view, { market: 'all' });
  assert.ok(html.includes('Long / short sinyalleri') && html.includes('Kapanan işlemler') && html.includes('Stop'));
  assert.ok(UI.dashboardHtml(offline.trendSignals, { market: 'all' }).includes('Test edilmedi'), 'Geçmiş testi okunamazsa kanıt iddiası yok');
  assert.ok(UI.dashboardHtml(J.buildView(stored, [], { now: breakout.dates.at(-1) + 'T20:00:00.000Z', backtest }), { market: 'all' }).includes('Geçmişte çalıştı'));
  assert.ok(UI.dashboardHtml(offline.trendSignals, { market: 'bist' }).includes('Son 3 günde yeni sinyal yok'), 'Piyasa filtresi');
  assert.ok(UI.dashboardHtml(null).includes('henüz üretilmedi'));
  const evil = J.buildView({ records: [{ ...rec, symbol: '<img src=x>', signalDate: breakout.dates.at(-1) }] }, [], { now: breakout.dates.at(-1) + 'T20:00:00.000Z' });
  assert.ok(!/<img/.test(UI.dashboardHtml(evil, { market: 'all' })));
  assert.ok(UI.summaryHtml(offline.trendSignals).includes('1</b> yeni sinyal (1 long, 0 short)'));
  console.log('   ✓ Görünüm, filtre ve kaçış doğru.');
  console.log('\n🎉 Tüm trend sinyal testleri geçti.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
