'use strict';

const MARKETS = Object.freeze(['us', 'bist', 'crypto']);
const SYMBOL = /^[A-Z0-9][A-Z0-9._^=-]{0,63}$/;
const plainRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function fail(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function normalizedSymbol(value, statusCode) {
  if (typeof value !== 'string') fail('Geçerli bir portföy sembolü gerekir.', statusCode);
  const symbol = value.trim().toUpperCase();
  if (!SYMBOL.test(symbol)) fail('Geçerli bir portföy sembolü gerekir.', statusCode);
  return symbol;
}

// Validate the complete replacement before any transport or write is attempted.
function normalizePortfolioInput(portfolio) {
  if (!plainRecord(portfolio) || Object.keys(portfolio).some(key => !MARKETS.includes(key))
    || MARKETS.some(market => !Object.hasOwn(portfolio, market) || !Array.isArray(portfolio[market]))) {
    fail('Portföy us, bist ve crypto listelerinin tamamını içermelidir.', 400);
  }
  const rows = [];
  const seen = new Set();
  for (const market of MARKETS) {
    for (const holding of portfolio[market]) {
      if (!plainRecord(holding) || !validNumber(holding.amount) || !validNumber(holding.avgPrice)) {
        fail('Adet ve ortalama maliyet sonlu, sıfır veya pozitif sayılar olmalıdır.', 400);
      }
      const symbol = normalizedSymbol(holding.symbol, 400);
      const key = market + ':' + symbol;
      if (seen.has(key)) fail('Aynı piyasa ve sembol portföyde tekrarlanamaz.', 400);
      seen.add(key);
      rows.push({ market, symbol, amount: holding.amount, avg_price: holding.avgPrice });
    }
  }
  return rows;
}

// A successful empty query is empty; malformed records never become an empty portfolio.
function portfolioFromRows(rows) {
  if (!Array.isArray(rows)) fail('Portföy kaynağı geçerli bir kayıt listesi döndürmedi.', 503);
  const portfolio = { us: [], bist: [], crypto: [] };
  const seen = new Set();
  for (const row of rows) {
    if (!plainRecord(row) || typeof row.market !== 'string' || !MARKETS.includes(row.market)
      || !validNumber(row.amount) || !validNumber(row.avg_price)) {
      fail('Portföy kaynağında doğrulanamayan kayıt var.', 503);
    }
    const symbol = normalizedSymbol(row.symbol, 503);
    if (row.symbol !== symbol) fail('Portföy kaynağında standart olmayan sembol kaydı var.', 503);
    const key = row.market + ':' + symbol;
    if (seen.has(key)) fail('Portföy kaynağında tekrarlanan kayıt var.', 503);
    seen.add(key);
    portfolio[row.market].push({ symbol, amount: row.amount, avgPrice: row.avg_price });
  }
  return portfolio;
}

function completePortfolioRows(result) {
  if (!plainRecord(result)) fail('Portföy kaynağının yanıtı doğrulanamadı.', 503);
  if (result.error) throw result.error;
  portfolioFromRows(result.data);
  if (!Number.isSafeInteger(result.count) || result.count !== result.data.length) {
    fail('Portföy kaynağının tam kayıt listesi doğrulanamadı.', 503);
  }
  return result.data;
}

function samePortfolioRows(actual, expected) {
  portfolioFromRows(actual);
  portfolioFromRows(expected);
  if (actual.length !== expected.length) return false;
  const lookup = new Map(expected.map(row => [row.market + ':' + row.symbol, row]));
  return actual.every(row => {
    const other = lookup.get(row.market + ':' + row.symbol);
    return other && row.amount === other.amount && row.avg_price === other.avg_price;
  });
}

// PostgREST OR accepts a list of AND groups. Only verified snapshot rows are
// eligible, and the timestamp prevents deleting a row changed after that read.
function removedPortfolioFilter(rows) {
  portfolioFromRows(rows);
  return rows.map(row => {
    const stamp = row.updated_at;
    if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(stamp)
      || !Number.isFinite(Date.parse(stamp)) || Number(stamp.slice(11, 13)) > 23
      || new Date(stamp.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== stamp.slice(0, 10)) {
      fail('Kaldırılacak portföy kaydının sürümü doğrulanamadı.', 503);
    }
    return 'and(market.eq.' + row.market + ',symbol.eq.' + JSON.stringify(row.symbol)
      + ',updated_at.eq.' + JSON.stringify(stamp) + ')';
  }).join(',');
}

module.exports = { MARKETS, normalizePortfolioInput, portfolioFromRows, completePortfolioRows,
  samePortfolioRows, removedPortfolioFilter };
