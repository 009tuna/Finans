'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const helpersStart = source.indexOf('function marketStatus(');
const helpersEnd = source.indexOf('function countUp(', helpersStart);
const rendererStart = source.indexOf('function renderMarketStatus(');
const rendererEnd = source.indexOf('function technicalDataNotice(', rendererStart);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && rendererStart >= 0 && rendererEnd > rendererStart);
const fixedNow = Date.parse('2026-01-15T18:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
const quote = '2026-01-15T17:00:00Z';
const snapshot = '2026-01-15T18:00:00Z';

function page(data = {}, market = 'us') {
  const box = { className: '', innerHTML: '', dataset: {} };
  const copy = { textContent: '' };
  const context = vm.createContext({
    Date: FixedDate, Intl, DATA: data, activeView: market,
    $: selector => selector === '#marketStatus' ? box : selector === '#marketStatusCopy' ? copy : null,
    fullTimestamp: value => 'TIME[' + value + ']',
    esc: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
  });
  vm.runInContext(source.slice(helpersStart, helpersEnd) + source.slice(rendererStart, rendererEnd), context);
  return { context, box, copy };
}

test('NYSE winter session uses 09:30–16:00 America/New_York rather than a summer UTC offset', () => {
  const { context } = page();
  assert.equal(context.marketStatus('us', '2026-01-15T13:30:00Z').open, false);
  assert.equal(context.marketStatus('us', '2026-01-15T14:29:00Z').open, false);
  assert.equal(context.marketStatus('us', '2026-01-15T14:30:00Z').open, true);
  assert.equal(context.marketStatus('us', '2026-01-15T20:59:00Z').open, true);
  assert.equal(context.marketStatus('us', '2026-01-15T21:00:00Z').open, false);
  assert.equal(context.marketStatus('us', quote).timeZone, 'America/New_York');
});

test('NYSE summer session shifts UTC boundaries while preserving the same local session hours', () => {
  const { context } = page();
  assert.equal(context.marketStatus('us', '2026-07-15T13:29:00Z').open, false);
  assert.equal(context.marketStatus('us', '2026-07-15T13:30:00Z').open, true);
  assert.equal(context.marketStatus('us', '2026-07-15T19:59:00Z').open, true);
  assert.equal(context.marketStatus('us', '2026-07-15T20:00:00Z').open, false);
});

test('weekends are evaluated in the exchange timezone, not the UTC weekday', () => {
  const { context } = page();
  const status = context.marketStatus('us', '2026-07-20T02:00:00Z');
  assert.equal(status.open, false);
  assert.match(status.label, /hafta sonu/);
});

test('Istanbul BIST boundaries remain 10:00–18:00 in both winter and summer', () => {
  const { context } = page();
  for (const day of ['2026-01-15', '2026-07-15']) {
    assert.equal(context.marketStatus('bist', day + 'T06:59:00Z').open, false);
    assert.equal(context.marketStatus('bist', day + 'T07:00:00Z').open, true);
    assert.equal(context.marketStatus('bist', day + 'T14:59:00Z').open, true);
    assert.equal(context.marketStatus('bist', day + 'T15:00:00Z').open, false);
  }
  assert.equal(context.marketStatus('bist', quote).timeZone, 'Europe/Istanbul');
});

test('normal session labels disclose unverified holidays instead of claiming an official open status', () => {
  const { context } = page();
  const christmas = context.marketStatus('us', '2026-12-25T16:00:00Z');
  assert.equal(christmas.basis, 'normal_session_hours');
  assert.match(christmas.label, /Normal seans takvimine göre/);
  assert.match(christmas.context, /tatiller ve özel kapanışlar doğrulanmadı/);
});

test('crypto continuous trading hours never claim a live price feed', () => {
  const { context } = page();
  const status = context.marketStatus('crypto', '2026-07-19T12:00:00Z');
  assert.equal(status.open, true);
  assert.match(status.label, /7\/24 işlem/);
  assert.doesNotMatch(status.label, /canlı|canli|live/i);
  assert.match(status.context, /güncelliği ayrı/);
});

test('an error-only market is unavailable in both status surfaces despite array length and cached metadata', () => {
  const { context, box, copy } = page({
    generatedAt: snapshot, market: { usAsOf: quote },
    us: [{ symbol: 'ERROR', __error: 'provider unavailable', price: 123, quoteTime: quote }],
  });
  context.renderMarketStatus();
  assert.equal(box.dataset.noShownPrices, 'true');
  assert.match(box.className, /closed unavailable/);
  for (const text of [box.innerHTML, copy.textContent]) {
    assert.match(text, /Fiyat kaynağı alınamadı/);
    assert.match(text, /Gösterilebilen doğrulanmış fiyat yok/);
    assert.doesNotMatch(text, /Fiyat zamanı:|Fiyat anlık görüntüsü:/);
  }
});

test('zero, nonfinite, negative and nonnumeric price records cannot establish a market quote', () => {
  const records = [0, -1, Infinity, NaN, '100', null, undefined].map((price, index) => ({ symbol: 'BAD' + index, price, quoteTime: quote }));
  records.push({ symbol: 'UNAVAILABLE', price: 100, status: 'unavailable', quoteTime: quote });
  const { context, box, copy } = page({ us: records, generatedAt: snapshot, market: { usAsOf: quote } });
  const info = context.marketPriceContext(context.DATA, 'us');
  assert.equal(info.priceCount, 0);
  assert.equal(info.marketAsOf, null);
  context.renderMarketStatus();
  assert.equal(box.dataset.noShownPrices, 'true');
  assert.match(copy.textContent, /Fiyat kaynağı alınamadı/);
});

test('explicit provider error markers cannot supply quote evidence through a positive cached price', () => {
  for (const failure of [{ error: 'provider rejected quote' }, { status: 'error' }, { status: 'failed' },
    { sourceStatus: { status: 'unavailable' } }, { sourceStatus: { status: 'error' } }, { sourceStatus: { error: 'provider failed' } }]) {
    const { context, box, copy } = page({ us: [{ price: 100, quoteTime: quote, ...failure }], generatedAt: snapshot, market: { usAsOf: quote } });
    const info = context.marketPriceContext(context.DATA, 'us');
    assert.equal(info.priceCount, 0); assert.equal(info.datedPriceCount, 0); assert.equal(info.marketAsOf, null);
    context.renderMarketStatus();
    for (const text of [box.innerHTML, copy.textContent]) {
      assert.match(text, /Fiyat kaynağı alınamadı/);
      assert.doesNotMatch(text, /Fiyat zamanı:|Fiyat anlık görüntüsü:/);
    }
  }
});

test('a stale historical price remains dated without claiming a live source', () => {
  const { context, box } = page({ us: [{ price: 100, quoteTime: quote, status: 'stale' }], generatedAt: snapshot });
  assert.equal(context.marketPriceContext(context.DATA, 'us').priceCount, 1);
  context.renderMarketStatus();
  assert.match(box.innerHTML, /Fiyat zamanı: TIME/);
  assert.doesNotMatch(box.innerHTML, /canlı|live/i);
});

test('a genuine positive quoted price retains its quote timestamp separately from the data snapshot', () => {
  const { context, box, copy } = page({ generatedAt: snapshot, market: { usAsOf: quote }, us: [{ price: 100, quoteTime: quote }] });
  context.renderMarketStatus();
  assert.equal(box.dataset.noShownPrices, 'false');
  assert.match(box.innerHTML, /Fiyat zamanı: TIME\[2026-01-15T17:00:00Z\]/);
  assert.match(box.innerHTML, /Veri kesiti: TIME\[2026-01-15T18:00:00Z\]/);
  assert.match(copy.textContent, /Fiyat zamanı: TIME\[2026-01-15T17:00:00Z\]/);
  assert.match(copy.textContent, /Normal seans takvimine göre/);
});

test('a positive price without quote evidence cannot borrow generatedAt or marketAsOf as a quote time', () => {
  const { context, box, copy } = page({ generatedAt: snapshot, market: { usAsOf: quote }, us: [{ price: 100 }] });
  const info = context.marketPriceContext(context.DATA, 'us');
  assert.equal(info.priceCount, 1);
  assert.equal(info.datedPriceCount, 0);
  assert.equal(info.marketAsOf, null);
  context.renderMarketStatus();
  for (const text of [box.innerHTML, copy.textContent]) {
    assert.match(text, /Fiyat zamanı doğrulanamadı/);
    assert.match(text, /Veri kesiti: TIME\[2026-01-15T18:00:00Z\]/);
    assert.doesNotMatch(text, /Fiyat zamanı: TIME|Fiyat anlık görüntüsü:/);
  }
});

test('unrelated marketAsOf timestamps cannot override actual asset quote evidence', () => {
  const { context, box } = page({ generatedAt: snapshot, market: { usAsOf: '2026-01-15T17:45:00Z' }, us: [{ price: 100, quoteTime: quote }] });
  assert.equal(context.marketPriceContext(context.DATA, 'us').marketAsOf, null);
  context.renderMarketStatus();
  assert.match(box.innerHTML, /Fiyat zamanı: TIME\[2026-01-15T17:00:00Z\]/);
  assert.doesNotMatch(box.innerHTML, /17:45:00/);
});

test('mixed quote ages show their range and missing timestamp coverage without a marketwide freshness claim', () => {
  const older = '2026-01-12T17:00:00Z';
  const { context, box } = page({ generatedAt: snapshot, market: { cryptoAsOf: quote }, crypto: [
    { price: 1, quoteTime: older, analysis: { score: 0 } },
    { price: 2, quoteTime: quote, analysis: { score: 80 } },
    { price: 3, analysis: { score: Infinity } },
    { price: 0, quoteTime: quote, analysis: { score: 90 } },
  ] }, 'crypto');
  context.renderMarketStatus();
  assert.match(box.innerHTML, /Fiyat zamanları: TIME\[2026-01-12T17:00:00Z\] – TIME\[2026-01-15T17:00:00Z\]/);
  assert.match(box.innerHTML, /Geçerli fiyat: 3\/4/);
  assert.match(box.innerHTML, /Zamanı doğrulanan: 2\/3/);
  assert.match(box.innerHTML, /Teknik puan: 2\/4/);
  assert.doesNotMatch(box.innerHTML, /Canlı|Canli|Güncel teknik/);
});

test('date-only, timezone-less and invalid calendar timestamps remain unverified', () => {
  const { context } = page();
  for (const quoteTime of ['2026-01-15', '2026-01-15T17:00:00', 'invalid', '2026-02-30T17:00:00Z', '2026-01-15T24:00:00Z']) {
    const info = context.marketPriceContext({ us: [{ price: 100, quoteTime }], generatedAt: '2026-01-15' }, 'us');
    assert.equal(info.priceCount, 1);
    assert.equal(info.datedPriceCount, 0);
    assert.equal(info.snapshotAt, null);
  }
  const offset = context.marketPriceContext({ us: [{ price: 100, quoteTime: '2026-01-15T20:00:00+03:00' }], market: { usAsOf: quote } }, 'us');
  assert.equal(offset.datedPriceCount, 1);
  assert.equal(offset.marketAsOf, quote, 'equivalent explicitly zoned timestamps retain the same price evidence');
});
