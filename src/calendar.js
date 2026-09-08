// Katalizör takvimi — Finnhub: ekonomik takvim + bilanço (earnings) takvimi + şirket haberleri.
// "Bu hafta hangi veriler geliyor, beklenti ne, hangi şirket bilanço açıklıyor" sorusunun kaynağı.
'use strict';
const { fetchJson, mapLimit } = require('./util');
const BASE = 'https://finnhub.io/api/v1';

// Yüksek etkili / piyasayı hareket ettiren olaylar
const KEY_EVENTS = /nonfarm|payroll|\bcpi\b|inflation|\bpce\b|interest rate|fed|fomc|\bgdp\b|unemployment|retail sales|\bpmi\b|\becb\b|jobless|\bppi\b|consumer confidence|durable goods|ism|nonfarm|core/i;
const MAJOR = ['US', 'EU', 'EA', 'GB', 'TR', 'CN', 'JP', 'DE'];

async function fetchEconomic(token, from, to) {
  const data = await fetchJson(BASE + '/calendar/economic?token=' + token);
  if (!data || data.__error || !Array.isArray(data.economicCalendar)) throw new Error('Ekonomik takvim kaynagi kullanilamiyor');
  const list = (data && data.economicCalendar) || [];
  return list
    .filter((e) => {
      const d = (e.time || '').slice(0, 10);
      if (!d || d < from || d > to) return false;
      const high = e.impact === 'high';
      const key = KEY_EVENTS.test(e.event || '');
      return (high || key) && MAJOR.includes(e.country);
    })
    .map((e) => ({
      date: (e.time || '').slice(0, 10),
      time: (e.time || '').slice(11, 16),
      country: e.country,
      event: e.event,
      impact: e.impact,
      estimate: e.estimate,
      prev: e.prev,
      actual: e.actual,
      unit: e.unit,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

async function fetchEarnings(token, from, to, watchlist) {
  const data = await fetchJson(BASE + '/calendar/earnings?from=' + from + '&to=' + to + '&token=' + token);
  if (!data || data.__error || !Array.isArray(data.earningsCalendar)) throw new Error('Bilanco takvimi kaynagi kullanilamiyor');
  const list = (data && data.earningsCalendar) || [];
  const wl = new Set(watchlist || []);
  return list
    .map((e) => ({
      date: e.date,
      symbol: e.symbol,
      hour: e.hour || '',
      epsEstimate: e.epsEstimate,
      revenueEstimate: e.revenueEstimate,
      watch: wl.has(e.symbol),
    }))
    .sort((a, b) => (b.watch ? 1 : 0) - (a.watch ? 1 : 0) || a.date.localeCompare(b.date));
}

async function fetchCompanyNews(token, symbols, from, to) {
  const errors = [];
  const out = await mapLimit(symbols, 3, async (s) => {
    const data = await fetchJson(BASE + '/company-news?symbol=' + s + '&from=' + from + '&to=' + to + '&token=' + token).catch(() => null);
    if (!Array.isArray(data)) { errors.push(s + ': haber kaynagi kullanilamiyor'); return []; }
    return data.filter((n) => Number.isFinite(n.datetime) && n.url && n.headline)
      .sort((a, b) => b.datetime - a.datetime).slice(0, 3)
      .map((n) => ({ symbol: s, headline: n.headline, source: n.source, url: n.url, datetime: n.datetime, publishedAt: new Date(n.datetime * 1000).toISOString() }));
  });
  const seen = new Set();
  const items = out.flat().filter((n) => {
    const key = n.symbol + ':' + n.url;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  items.sourceErrors = errors;
  return items;
}

module.exports = { fetchEconomic, fetchEarnings, fetchCompanyNews };
