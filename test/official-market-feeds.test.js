'use strict';

const assert = require('node:assert/strict');
const {
  MAX_BYTES, REQUEST_TIMEOUT_MS, KAP_API_DOC, KAP_PUBLIC_PAGE, FEEDS,
  localDate, checkedFeed, safeItemUrl, parsePublisherDate, parseFeed, readFeed, readFeedSnapshot, collectOfficialFeeds,
} = require('../src/official-market-feeds');
const { refreshMarketNews, getMarketNews } = require('../src/market-news');

const now = '2026-10-01T12:00:00.000Z';
const eth = FEEDS.find((feed) => feed.id === 'ethereum');
const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Foundation <b>update</b> &amp; research]]></title><link>https://blog.ethereum.org/2026/09/30/update</link><guid>https://blog.ethereum.org/2026/09/30/update</guid><pubDate>Wed, 30 Sep 2026 09:30:00 +0000</pubDate><description><![CDATA[<p>Publisher text <script>run()</script> kept.</p>]]></description></item>
<item><title>Same item</title><link>https://blog.ethereum.org/2026/09/29/same</link><pubDate>2026-09-29</pubDate></item>
<item><title>Future item</title><link>https://blog.ethereum.org/2026/10/02/future</link><pubDate>Fri, 02 Oct 2026 09:30:00 +0000</pubDate></item>
<item><title>Unzoned timestamp</title><link>https://blog.ethereum.org/2026/09/28/local-time</link><pubDate>Mon, 28 Sep 2026 09:30:00</pubDate></item>
<item><title>Untrusted host</title><link>https://example.com/fake</link><pubDate>Mon, 28 Sep 2026 09:30:00 GMT</pubDate></item>
<item><title>Subdomain host</title><link>https://evil.blog.ethereum.org/fake</link><pubDate>Mon, 28 Sep 2026 09:30:00 GMT</pubDate></item>
<item><title>Malformed date</title><link>https://blog.ethereum.org/2026/09/27/bad</link><pubDate>2026-02-30</pubDate></item>
</channel></rss>`;

assert.equal(checkedFeed(eth), 'https://blog.ethereum.org/feed.xml');
assert.equal(localDate('2026-09-30T22:00:00.000Z'), '2026-10-01', 'day-only publication is compared with Istanbul calendar day');
assert.equal(REQUEST_TIMEOUT_MS <= 20_000, true);
assert.equal(MAX_BYTES, 2 * 1024 * 1024);
assert.equal(safeItemUrl('http://blog.ethereum.org/a', eth), null);
assert.equal(safeItemUrl('https://blog.ethereum.org.evil.test/a', eth), null);
assert.equal(parsePublisherDate('2026-09-29').publishedAt, null, 'date-only publisher values never acquire a time');
assert.equal(parsePublisherDate('2026-09-29').publishedDate, '2026-09-29');
assert.equal(parsePublisherDate('Mon, 28 Sep 2026 09:30:00').publishedAt, null, 'unverifiable timezone is not guessed');

const parsed = parseFeed(rss, eth, { now, observedAt: now });
assert.equal(parsed.length, 4, 'future and non-allowlisted entries are excluded; unzoned dates remain undated rather than being guessed');
assert.equal(parsed[0].publishedAt, '2026-09-30T09:30:00.000Z', 'timezone-aware publisher time is preserved as an exact instant');
assert.equal(parsed[0].publishedDate, null);
assert.equal(parsed[1].publishedAt, null);
assert.equal(parsed[1].publishedDate, '2026-09-29');
const unzoned = parsed.find((item) => item.title === 'Unzoned timestamp');
assert.equal(unzoned.publishedAt, null);
assert.equal(unzoned.publishedDate, null);
assert.equal(parsed.every((item) => item.market === 'crypto' && item.kind === 'primary' && item.evidenceStatus === 'official_feed'), true);
assert.ok(parsed.every((item) => item.observedAt === now && /^[a-f0-9]{64}$/.test(item.contentHash)));
assert.match(parsed[0].title, /Foundation update & research/);
assert.match(parsed[0].evidence, /Publisher text kept/);
assert.doesNotMatch(parsed[0].evidence, /run\(\)|<script/i, 'feed markup and scripts are never executed or retained');
assert.ok(parsed.every((item) => item.type === 'research_event' && item.url.startsWith('https://blog.ethereum.org/')));
assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', eth, { now }), /xml_entities_not_supported/);
assert.doesNotThrow(() => parseFeed('<rss><channel><item><title>Invalid numeric &#x110000; entity</title><link>https://blog.ethereum.org/entity</link></item></channel></rss>', eth, { now }));

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Solana release</title><link rel="alternate" href="https://solana.com/changelog/release"/><published>2026-09-30T11:42:00+03:00</published><summary>Official changelog entry.</summary></entry></feed>`;
const solana = FEEDS.find((feed) => feed.id === 'solana');
const atomItem = parseFeed(atom, solana, { now, observedAt: now })[0];
assert.equal(atomItem.publishedAt, '2026-09-30T08:42:00.000Z');
assert.equal(atomItem.url, 'https://solana.com/changelog/release');
const atomWithSelfFirst = '<feed><entry><title>Atom links</title><link rel="self" href="https://solana.com/self"/><link rel="alternate" href="https://solana.com/alternate"/></entry></feed>';
assert.equal(parseFeed(atomWithSelfFirst, solana, { now })[0].url, 'https://solana.com/alternate');

(async () => {

  const feedBody = (title, link) => `<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>Wed, 30 Sep 2026 09:30:00 GMT</pubDate></item></channel></rss>`;
  const redirectRequests = [];
  const redirectedItems = await readFeed(eth, { now, fetchImpl: async (url, options) => {
    redirectRequests.push({ url, options });
    return redirectRequests.length === 1
      ? new Response('Moved', { status: 301, headers: { location: '/en/feed.xml' } })
      : new Response(feedBody('ETH redirected official', 'https://blog.ethereum.org/en/posts/1'));
  } });
  assert.equal(redirectRequests.length, 2, 'a same-host canonical feed redirect is followed once');
  assert.ok(redirectRequests.every((request) => request.options.redirect === 'manual' && request.options.signal));
  assert.ok(redirectedItems[0].title.includes('ETH redirected official'));
  assert.deepEqual(await readFeed(eth, { now, fetchImpl: async () => new Response('<rss><channel></channel></rss>') }), [], 'well-formed empty feeds are successful empty results');
  await assert.rejects(() => readFeed(eth, { now, fetchImpl: async () => new Response('<rss><channel></rss>') }), /feed_xml_invalid/);
  const bitcoincore = FEEDS.find((feed) => feed.id === 'bitcoin_core');
  const rssWithAtomSelfLink = '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><atom:link href="https://bitcoincore.org/en/rss.xml" rel="self" type="application/rss+xml" /><item><title>Bitcoin Core format</title><description>&lt;p&gt;Publisher text&lt;/p&gt;</description><pubDate>Mon, 13 Jul 2026 00:00:00 -0400</pubDate><link>https://bitcoincore.org/en/2026/07/13/release-29.4/</link><guid isPermaLink="true">https://bitcoincore.org/en/2026/07/13/release-29.4/</guid></item></channel></rss>';
  const bitcoinFeed = await readFeed(bitcoincore, { now, fetchImpl: async () => new Response(rssWithAtomSelfLink) });
  assert.equal(bitcoinFeed.length, 1, 'RSS channel atom:self links using XML self-closing syntax are accepted');
  await assert.rejects(() => readFeed(bitcoincore, { now, fetchImpl: async () => new Response(rssWithAtomSelfLink.replace('</channel>', '</rss>')) }), /feed_xml_invalid/);
  let responseReturned = false; let clockCalls = 0;
  const retrieval = await readFeedSnapshot(eth, { clock: () => { assert.equal(responseReturned, true); clockCalls++; return '2026-10-01T13:00:00.000Z'; }, fetchImpl: async () => { responseReturned = true; return new Response(feedBody('Retrieved after fetch', 'https://blog.ethereum.org/2026/10/retrieved')); } });
  assert.equal(clockCalls, 1); assert.equal(retrieval.retrievedAt, '2026-10-01T13:00:00.000Z');
  assert.equal(retrieval.items[0].observedAt, retrieval.retrievedAt);
  await assert.rejects(() => readFeed(eth, { now, fetchImpl: async () => new Response('Moved', { status: 302, headers: { location: 'https://example.com/rss.xml' } }) }), /feed_redirect_not_allowlisted/);

  const fixtures = new Map([
    [FEEDS[0].url, new Response(feedBody('ETH official', 'https://blog.ethereum.org/2026/09/eth'))],
    [FEEDS[1].url, new Response(feedBody('BTC official', 'https://bitcoincore.org/en/blog/btc'))],
    [FEEDS[2].url, new Response(feedBody('SOL official', 'https://solana.com/changelog/sol'))],
  ]);
  const requested = [];
  const result = await collectOfficialFeeds({ now, observedAt: now, fetchImpl: async (url, options) => {
    requested.push({ url, options });
    return fixtures.get(url);
  } });
  assert.equal(requested.length, 3, 'each configured primary feed is fetched exactly once');
  assert.deepEqual(new Set(requested.map((request) => new URL(request.url).hostname)), new Set(['blog.ethereum.org', 'bitcoincore.org', 'solana.com']));
  assert.ok(requested.every(({ options }) => options.method === 'GET' && options.redirect === 'manual' && options.cache === 'no-store' && options.signal));
  assert.equal(result.items.length, 3);
  assert.equal(result.sources.ethereum.status, 'available');
  assert.equal(result.sources.bitcoin_core.status, 'available');
  assert.equal(result.sources.solana.status, 'available');
  assert.equal(result.sources.kap.status, 'unverified');
  assert.equal(result.sources.kap.errorCode, 'public_feed_not_verified');
  assert.equal(result.sources.kap.sourceUrl, KAP_PUBLIC_PAGE);
  assert.equal(result.sources.kap.apiDocumentationUrl, KAP_API_DOC);
  assert.match(result.sources.kap.reason, /resmî bildirim arama sayfası/);

  let callCount = 0;
  const failed = await collectOfficialFeeds({ now, fetchImpl: async (url) => {
    callCount += 1;
    return url === FEEDS[1].url ? new Response('denied', { status: 403 }) : new Response('<html>not a feed</html>');
  } });
  assert.equal(callCount, 3);
  assert.equal(failed.sources.bitcoin_core.errorCode, 'http_403');
  assert.equal(failed.sources.ethereum.errorCode, 'feed_invalid');
  assert.equal(failed.sources.solana.errorCode, 'feed_invalid');
  assert.equal(failed.sources.kap.status, 'unverified');

  const dateOnlyResult = await collectOfficialFeeds({ now, fetchImpl: async (url) => {
    const host = new URL(url).hostname;
    const path = host === 'blog.ethereum.org' ? 'https://blog.ethereum.org/date-only' : host === 'bitcoincore.org' ? 'https://bitcoincore.org/date-only' : 'https://solana.com/date-only';
    return new Response(`<rss><channel><item><title>Date only</title><link>${path}</link><pubDate>2026-10-01</pubDate></item></channel></rss>`);
  } });
  assert.equal(dateOnlyResult.sources.ethereum.last24HoursCount, 0, 'date-only metadata is not presented as a precise rolling-24-hour count');
  assert.equal(dateOnlyResult.sources.ethereum.todayDateOnlyCount, 1, 'date-only metadata is separately labeled as a calendar-day count');

  const memoryDb = () => {
    const rows = new Map(); let revision = 0;
    return { rows, getCache: async (key) => rows.has(key) ? structuredClone(rows.get(key)) : null,
      compareAndSetCache: async (key, value, expected) => {
        assert.equal(rows.get(key)?.revision || null, expected);
        const next = 'revision-' + (++revision); rows.set(key, { value: structuredClone(value), revision: next }); return next;
      } };
  };
  const newsDb = memoryDb();
  const datedFeed = (title) => `<rss><channel><item><title>${title}</title><link>https://blog.ethereum.org/2026/09/stored</link><pubDate>Wed, 30 Sep 2026 09:30:00 GMT</pubDate></item></channel></rss>`;
  const fetchFeeds = (body, stamp, status = 'available') => async () => {
    const items = status === 'available' ? parseFeed(body, eth, { now: stamp, observedAt: stamp }) : [];
    const last24HoursCount = items.filter((item) => item.publishedAt && Date.parse(item.publishedAt) >= Date.parse(stamp) - 24 * 60 * 60 * 1000).length;
    return { items, sources: { ethereum: { status, checkedAt: stamp, lastSuccessfulAt: status === 'available' ? stamp : null, count: items.length,
      latestPublishedAt: items[0]?.publishedAt || null, last24HoursCount } } };
  };
  const noSpk = async () => '<html>SPK temporarily inaccessible</html>';
  await refreshMarketNews({ collectCompanyIr: false, database: newsDb, fetchText: noSpk, collectAnnouncements: false, collectKap: false, collectFeeds: fetchFeeds(datedFeed('Retained official item'), now), now });
  await refreshMarketNews({ collectCompanyIr: false, database: newsDb, fetchText: noSpk, collectAnnouncements: false, collectKap: false, collectFeeds: fetchFeeds('', '2026-10-01T13:00:00.000Z', 'unavailable'), now: '2026-10-01T13:00:00.000Z' });
  let storedNews = await getMarketNews({ database: newsDb, now: '2026-10-01T13:00:00.000Z' });
  assert.equal(storedNews.groups.crypto.filter((item) => item.feedId === 'ethereum').length, 1, 'failure keeps the prior successful feed item');
  assert.equal(storedNews.sources.ethereum.lastSuccessfulAt, now, 'failure keeps the prior success timestamp');
  assert.equal(storedNews.sources.ethereum.status, 'unavailable');
  assert.equal(storedNews.sources.ethereum.last24HoursAt, now, 'failed checks expose the age of the last successful 24-hour count');
  await refreshMarketNews({ collectCompanyIr: false, database: newsDb, fetchText: noSpk, collectAnnouncements: false, collectKap: false, collectFeeds: fetchFeeds('<rss><channel></channel></rss>', '2026-10-01T14:00:00.000Z'), now: '2026-10-01T14:00:00.000Z' });
  storedNews = await getMarketNews({ database: newsDb, now: '2026-10-01T14:00:00.000Z' });
  assert.equal(storedNews.sources.ethereum.status, 'available', 'a valid empty feed is still a successful retrieval');
  assert.equal(storedNews.sources.ethereum.last24HoursCount, 0);
  assert.equal(storedNews.sources.ethereum.lastSuccessfulAt, '2026-10-01T14:00:00.000Z');
  assert.equal(storedNews.groups.crypto.filter((item) => item.feedId === 'ethereum').length, 1, 'empty success preserves the collected archive without presenting it as newly published');
  await refreshMarketNews({ collectCompanyIr: false, database: newsDb, fetchText: noSpk, collectAnnouncements: false, collectKap: false, collectFeeds: fetchFeeds(datedFeed('Retained official item'), '2026-10-01T15:00:00.000Z'), now: '2026-10-01T15:00:00.000Z' });
  assert.equal((await getMarketNews({ database: newsDb })).groups.crypto.filter((item) => item.feedId === 'ethereum').length, 1, 'repeated collection deduplicates stable items');

  let releaseOldFetch;
  const olderRefresh = refreshMarketNews({ collectCompanyIr: false, database: newsDb, fetchText: noSpk, collectAnnouncements: false, collectKap: false, now: '2026-10-01T16:00:00.000Z', collectFeeds: () => new Promise((resolve) => { releaseOldFetch = resolve; }) });
  while (!releaseOldFetch) await new Promise((resolve) => setImmediate(resolve));
  await refreshMarketNews({ collectCompanyIr: false, database: newsDb, fetchText: noSpk, collectAnnouncements: false, collectKap: false, now: '2026-10-01T17:00:00.000Z',
    collectFeeds: fetchFeeds(datedFeed('Newer official item'), '2026-10-01T17:00:00.000Z') });
  releaseOldFetch(await fetchFeeds(datedFeed('Stale official item'), '2026-10-01T16:00:00.000Z')());
  await olderRefresh;
  storedNews = await getMarketNews({ database: newsDb });
  assert.equal(storedNews.groups.crypto.some((item) => item.title === 'Stale official item'), false, 'a slower older source result cannot overwrite a newer CAS refresh');
  assert.equal(storedNews.groups.crypto.some((item) => item.title === 'Newer official item'), true);

  const aggregateDb = memoryDb();
  const stampSource = (status, count = 0) => ({ status, checkedAt: now, lastSuccessfulAt: status === 'available' ? now : null, count,
    last24HoursCount: count, last24HoursAt: now });
  const aggregate = await refreshMarketNews({ collectCompanyIr: false, database: aggregateDb, fetchText: async () => '<a href="https://www.spk.gov.tr/dosya/2026-1.pdf">Bülten No : 2026/1 Yayımlanma : 28 Eyl&#252;l 2026</a>', collectKap: false,
    documentLimit: 0, collectAnnouncements: false, now, collectFeeds: async () => ({ items: [], sources: {
      ethereum: stampSource('available'), bitcoin_core: stampSource('available'), solana: { ...stampSource('unavailable'), errorCode: 'timeout' },
      kap: { ...stampSource('unverified'), errorCode: 'public_feed_not_verified' },
    } }) });
  assert.equal(aggregate.status, 'partial', 'a failed non-SPK feed cannot be reported as a fully available refresh');
  assert.deepEqual(aggregate.failures.map((item) => item.source).sort(), ['kap', 'solana'].sort(), 'aggregate health includes every unavailable/unverified source');
  assert.ok(aggregate.countsBySource.ethereum);
  assert.equal(aggregate.sources.spk.status, 'available');

  await assert.rejects(() => readFeed({ ...eth, url: 'http://blog.ethereum.org/feed.xml' }, {
    now, fetchImpl: async () => { throw new Error('fetch must not be called for an untrusted feed URL'); },
  }), /feed_url_not_allowlisted/);
  await assert.rejects(() => readFeed(eth, { now, maxBytes: 8, fetchImpl: async () => new Response('<rss><channel></channel></rss>') }), /response_too_large/);
  console.log('official market feeds tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
