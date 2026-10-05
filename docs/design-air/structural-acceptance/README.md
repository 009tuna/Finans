# Structural paper UI acceptance

2026-10-05. Screenshots `desktop.jpg` and `mobile.jpg` contain **synthetic acceptance records**, injected only into a local server. They are not live signals, fills or outcomes. The server never forwards journal/portfolio writes.

Checked 1440x900 and 390x844: pending zone, actual filled entry and missed-entry labels; separate BIST/US/crypto coverage; n=0 has no success rate; frozen USDT levels do not use CoinGecko USD; plain inline plans retain the Air typography and collapsible panels. Direct report navigation and reload populate the ledger. Tab reaches the evidence disclosure, Enter expands it, visible focus is retained. Mobile document width 385px <= viewport 390px; plan values form one column. Browser error log was empty.

Chart contract tests check entry-zone lines versus actual filled entry and reject a chart with different provider/currency. Source/execution tests, rather than screenshots, establish the trading semantics.

Binance UTC daily/open-time semantics were checked against [official market-data documentation](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market). Live equities remain blocked without a verified session calendar; observed Yahoo weekdays or daily labels cannot fill that gap.
