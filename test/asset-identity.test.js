'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Identity = require('../public/asset-identity');
const directory = path.join(__dirname, '..', 'public', 'assets', 'asset-logos');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json'), 'utf8'));
const expected = { us: 0, bist: 0, crypto: 0 };
for (const logo of manifest.assets) {
  if (!logo.localPath) continue;
  expected[logo.market]++;
  assert.equal(Identity.getLogo({ market: logo.market, symbol: logo.symbol, id: logo.id }), logo.localPath, 'Each logo belongs to its verified market and ticker.');
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'public', logo.localPath));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), logo.sha256, 'The recorded source hash matches the shipped asset.');
  assert.ok(logo.bytes > 0 && logo.checkedAt && logo.logoUrl && logo.provider);
  assert.match(Identity.logoHtml({ market: logo.market, symbol: logo.symbol }), /src="\/assets\/asset-logos\//);
  if (logo.market === 'bist') {
    assert.equal(logo.sourcePage, 'https://tr.tradingview.com/symbols/BIST-' + logo.symbol + '/');
    assert.equal(new URL(logo.logoUrl).hostname, 's3-symbol-logo.tradingview.com');
    assert.match(bytes.toString('utf8'), /<svg\b/);
    assert.doesNotMatch(bytes.toString('utf8'), /<(?:script|foreignObject)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i);
  }
}
assert.deepEqual(Identity.getCoverage(), expected);
assert.ok(expected.us >= 12 && expected.bist >= 100 && expected.crypto >= 21, 'All current watchlist identities are covered independently of candidate ranking.');
assert.equal(Identity.getLogo({ market: 'bist', symbol: 'ENERY.IS' }), '/assets/asset-logos/bist-enery.svg');
assert.equal(Identity.getLogo({ market: 'US', symbol: 'msft' }), '/assets/asset-logos/us-msft.png');
assert.equal(Identity.getLogo({ market: 'crypto', symbol: 'BTC', id: 'different-bitcoin-token' }), null, 'An unrelated token sharing a symbol cannot inherit Bitcoin identity.');
assert.equal(Identity.getLogo({ market: 'bist', symbol: 'MSFT', logo: 'https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/MSFT.png' }), null, 'A foreign field cannot override market-scoped identity.');
assert.equal(Identity.getLogo({ market: 'us', symbol: 'UNKNOWN', logo: 'javascript:alert(1)' }), null);
const unknown = Identity.getIdentity({ market: 'bist', symbol: 'NEWCO', name: 'Yeni şirket' });
assert.equal(unknown.monogram, 'NEWCO');
assert.match(Identity.logoHtml({ market: 'us', symbol: 'NEWCO' }), /asset-logo-monogram">NEW<\/span>/, 'The logo slot keeps a bounded fallback while the card carries the full symbol.');
assert.equal(unknown.src, null);
assert.equal(unknown.name, 'Yeni şirket');
assert.equal(Identity.getIdentity({ market: 'us', symbol: '<img src=x onerror=x>' }).monogram, '?');
assert.doesNotMatch(Identity.logoHtml({ market: '<svg onload=x>', symbol: '<img src=x>' }, { className: 'candidate-logo bad" onclick="x' }), /<svg|<img|"\s+(?:onclick|onload)=/);
assert.match(Identity.logoHtml({ market: 'us', symbol: 'MSFT' }, { className: 'candidate-logo' }), /class="asset-logo candidate-logo"/);
assert.match(Identity.logoHtml({ market: 'us', symbol: 'MSFT' }), /aria-hidden="true"/);
assert.doesNotMatch(Identity.logoHtml({ market: 'us', symbol: 'MSFT' }), /onerror=|onload=|font(?:-size)?\s*:/);

function imageFixture(complete, naturalWidth) {
  const monogram = { hidden: false };
  const classes = new Set();
  const box = { querySelector: () => monogram, classList: { toggle: (name, active) => active ? classes.add(name) : classes.delete(name) } };
  const image = { complete, naturalWidth, hidden: false, parentElement: box, matches: selector => selector === '[data-asset-logo] > img' };
  return { image, monogram, classes };
}
const loaded = imageFixture(true, 40), failed = imageFixture(true, 0), pending = imageFixture(false, 0);
const handlers = {};
let listenerCount = 0;
const scope = { querySelectorAll: () => [loaded.image, failed.image, pending.image], addEventListener: (type, handler, capture) => { assert.equal(capture, true); handlers[type] = handler; listenerCount++; } };
Identity.bindLogoFallback(scope);
assert.equal(loaded.monogram.hidden, true, 'A complete successful image hides the temporary monogram.');
assert.equal(loaded.image.hidden, false);
assert.equal(failed.monogram.hidden, false, 'An already-failed image keeps the symbol visible.');
assert.equal(failed.image.hidden, true);
assert.equal(pending.monogram.hidden, false, 'Pending loading never leaves the identity empty.');
pending.image.naturalWidth = 40;
handlers.load({ target: pending.image });
assert.equal(pending.monogram.hidden, true);
handlers.error({ target: pending.image });
assert.equal(pending.monogram.hidden, false, 'A later image failure restores the fallback.');
assert.equal(pending.image.hidden, true);
assert.ok(pending.classes.has('logo-unavailable'));
assert.ok(!pending.classes.has('has-logo'));
Identity.bindLogoFallback(scope);
assert.equal(listenerCount, 2, 'Repeated candidate renders do not multiply delegated listeners.');
assert.doesNotThrow(() => handlers.error({ target: {} }), 'Unrelated errors are ignored.');
assert.doesNotThrow(() => Identity.bindLogoFallback(null));
console.log('Asset identity passed: verified local files and hashes, complete watchlist, market/token isolation, escaped HTML, image-error monograms, and idempotent delegated bindings.');
