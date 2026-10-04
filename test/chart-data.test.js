const assert = require('assert');
const {
  normalizeYahooChart,
  normalizeBinanceKlines,
  resolveChartSymbol,
} = require('../src/chart-data');

const yahooFixture = {
  chart: {
    result: [{
      meta: { currency: 'USD', longName: 'Apple Inc.' },
      timestamp: [1717372800, 1717459200, 1717545600],
      indicators: {
        quote: [{
          open: [100, 102, null],
          high: [104, 106, 108],
          low: [99, 101, 103],
          close: [103, 105, null],
          volume: [1000, 1200, 900],
        }],
      },
    }],
  },
};

const yahooBars = normalizeYahooChart(yahooFixture, {
  market: 'us',
  symbol: 'AAPL',
  interval: '1d',
  range: '1y',
  sourceSymbol: 'AAPL',
});

assert.equal(yahooBars.source, 'yahoo');
assert.equal(yahooBars.currency, 'USD');
assert.equal(yahooBars.bars.length, 2);
assert.deepEqual(yahooBars.bars[0], {
  time: 1717372800,
  sourceTime: 1717372800,
  open: 100,
  high: 104,
  low: 99,
  close: 103,
  closeVerified: true,
  volume: 1000,
});

const binanceBars = normalizeBinanceKlines([
  [1717372800000, '67000.5', '68100', '66500', '67850.25', '123.45'],
  [1717459200000, '67850.25', '69000', '67200', '68800', '98.76'],
], {
  market: 'crypto',
  symbol: 'BTC',
  interval: '1d',
  sourceSymbol: 'BTCUSDT',
});

assert.equal(binanceBars.source, 'binance');
assert.equal(binanceBars.currency, 'USDT');
assert.equal(binanceBars.technicalData.calendar.provider, 'binance');
assert.equal(binanceBars.technicalData.calendar.timeZone, 'UTC');
assert.equal(binanceBars.bars.length, 2);
assert.equal(binanceBars.bars[0].time, 1717372800);
assert.equal(binanceBars.bars[0].close, 67850.25);
assert.equal(binanceBars.bars[1].volume, 98.76);

assert.equal(resolveChartSymbol('bist', 'THYAO'), 'THYAO.IS');
assert.equal(resolveChartSymbol('bist', 'GARAN.IS'), 'GARAN.IS');
assert.equal(resolveChartSymbol('crypto', 'btc'), 'BTCUSDT');
assert.equal(resolveChartSymbol('crypto', 'ETHUSDT'), 'ETHUSDT');

console.log('chart data tests passed');
