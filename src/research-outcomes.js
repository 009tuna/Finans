'use strict';
const { fetchJson } = require('./util');
const { readLedger, updateLedger, resolveForecast } = require('./research-ledger');
async function resolveEarnings({ database, fetcher = fetchJson, now = new Date().toISOString(), token = process.env.FINNHUB_TOKEN } = {}) {
  const { value } = await readLedger(database);
  const pending = value.forecasts.filter((f) => f.resolution.provider === 'finnhub-earnings'
    && Date.parse(f.scheduledAt) <= Date.parse(now) && !value.outcomes.some((o) => o.forecastId === f.id));
  if (!pending.length) return { resolved: 0, awaiting: 0, status: 'no_due_forecasts' };
  if (!token) throw new Error('Bilanco sonuclari icin FINNHUB_TOKEN gerekli');
  const dates = [...new Set(pending.map((f) => f.scheduledAt.slice(0, 10)))].sort();
  const rows = [];
  for (const date of dates) {
    const data = await fetcher('https://finnhub.io/api/v1/calendar/earnings?from=' + date + '&to=' + date + '&token=' + encodeURIComponent(token));
    if (!Array.isArray(data?.earningsCalendar)) throw new Error('Bilanco gerceklesen kaynagina erisilemedi');
    rows.push(...data.earningsCalendar);
  }
  const observations = [];
  for (const f of pending) {
    const matches = rows.filter((r) => r.symbol?.toUpperCase() === f.symbol.toUpperCase() && r.date === f.scheduledAt.slice(0, 10));
    if (matches.length !== 1) continue;
    const value = matches[0][f.resolution.field];
    if (!Number.isFinite(value)) continue;
    observations.push({ forecastId: f.id, value, unit: f.unit, period: f.period, metric: f.metric,
      sourceUrl: 'https://finnhub.io/api/v1/calendar/earnings?from=' + f.scheduledAt.slice(0, 10) + '&to=' + f.scheduledAt.slice(0, 10),
      publishedAt: now });
  }
  if (observations.length) await updateLedger((current) => observations.reduce((l, o) => resolveForecast(l, o, now, 'provider-first-observed'), current), database);
  return { resolved: observations.length, awaiting: pending.length - observations.length, status: 'checked', vintage: 'first-observed-not-guaranteed-first-release' };
}
module.exports = { resolveEarnings };
