# Asset identity sources

Collected and verified on 4 October 2026 for the current watchlist: 12 US equities, 100 BIST equities and 21 cryptocurrencies. All images are served locally. No logo API, API key or browser request to an external image host is introduced.

`sources.json` records each exact source URL, provider, verification time, local filename, content type, byte count and SHA-256 digest. It also records the source snapshot timestamp. `bist-sources.json` preserves the ticker-page identity verification separately.

- US images came from the existing QA snapshot's `logo` field, populated by `src/finnhub.js` from Finnhub company-profile `logo`. Documentation: [Finnhub company profile](https://finnhub.io/docs/api/company-profile2).
- Crypto images came from the same snapshot's `logo` field, populated by `src/coingecko.js` from the coin-markets `image` field. Documentation: [CoinGecko coins with market data](https://docs.coingecko.com/reference/coins-markets). The helper keeps market/ticker identity separate and rejects an explicitly different coin ID.
- BIST images were read from each exact TradingView symbol page's `img` element whose `alt` equals `BIST:SYMBOL`. The manifest records the page's visible company name and exact `src`; slugs and company domains were not inferred. Every source page and image returned HTTP 200. Downloaded SVG bodies were checked for an SVG root, supported content size and absence of scripts, event handlers, foreign objects and external embedded image references. Example verification pages: [ENERY](https://tr.tradingview.com/symbols/BIST-ENERY/), [BERA](https://tr.tradingview.com/symbols/BIST-BERA/), [BRSAN](https://tr.tradingview.com/symbols/BIST-BRSAN/).

`public/asset-identity.js` embeds the verified manifest lookup so candidate rendering is synchronous. It ignores arbitrary `asset.logo` input and returns a symbol monogram for unknown identities. `bindLogoFallback` also restores the monogram if the local image fails to load. Logos are decorative beside the existing company/symbol text; they are not the only identification channel.

Validation: `node test/asset-identity.test.js` checks manifest/file hashes, watchlist coverage, market and coin-ID separation, escaping, image failure recovery and repeated-render listener behavior. The helper and image markup contain no font-size declarations.
