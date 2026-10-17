// Analist katmanı: AI'a verilecek veri takvimi ve AI'ın takvim/Türkiye/piyasa görüşü çıktısının temizlenmesi.
// Geçersiz tek bir analist kaydı bütün raporu düşürmez; kayıt ayıklanır, ölçülebilir tahmin doğrulaması ayrı kalır.
'use strict';
const EC = require('../public/econ-calendar');

const DAY = 86400000;
const MARKETS = ['us', 'bist', 'crypto'];
const CONVICTION = ['düşük', 'orta', 'yüksek'];

// Önümüzdeki 7 gün + son 3 günde açıklananlar; AI'ın okuyacağı sade biçim.
function buildDataCalendar(calendar, now) {
  const nowMs = Date.parse(now);
  return ((calendar && calendar.events) || [])
    .filter((event) => {
      const at = Date.parse(event.scheduledAt);
      return Number.isFinite(at) && at <= nowMs + 7 * DAY && at >= nowMs - 3 * DAY;
    })
    .map((event) => {
      const surprise = EC.surpriseOf(event);
      return {
        id: event.id, title: event.titleTr, sourceTitle: event.title, country: event.country, scheduledAt: event.scheduledAt,
        impact: event.impact, category: event.category,
        previous: event.previous ? event.previous.text : null,
        revisedPrevious: event.revisedPrevious ? event.revisedPrevious.text : null,
        forecast: event.forecast ? event.forecast.text : null,
        actual: event.actual ? event.actual.text : null,
        surprise: surprise ? { direction: surprise.direction, diff: Number(surprise.diff.toFixed(4)), unit: surprise.unit } : null,
      };
    });
}

const text = (value) => typeof value === 'string' && value.trim().length > 0;
function cleanMarkets(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const market of MARKETS) { if (!text(value[market])) return null; out[market] = value[market].trim(); }
  return out;
}
function cleanSources(ids, sources) {
  return (Array.isArray(ids) ? ids : []).filter((id) => sources.has(id));
}

function sanitizeAnalystLayer(research, context, now = new Date().toISOString()) {
  const sources = new Set(((research && research.sources) || []).map((s) => s.id));
  const known = new Set(((context && context.dataCalendar) || []).map((event) => event.id));
  const out = Object.assign({}, research);
  const dropped = [];

  if (research.marketViews && typeof research.marketViews === 'object') {
    const views = {};
    for (const market of MARKETS) {
      const view = research.marketViews[market];
      if (!view || !['olumlu', 'nötr', 'olumsuz'].includes(view.stance) || !CONVICTION.includes(view.conviction) || !text(view.thesis)) { dropped.push('marketViews.' + market); continue; }
      views[market] = { stance: view.stance, conviction: view.conviction, thesis: view.thesis.trim(),
        drivers: (view.drivers || []).filter(text).slice(0, 4), risks: (view.risks || []).filter(text).slice(0, 3), watch: text(view.watch) ? view.watch.trim() : '' };
    }
    out.marketViews = views;
  }

  if (Array.isArray(research.calendarAnalysis)) {
    const seen = new Set();
    out.calendarAnalysis = research.calendarAnalysis.filter((item) => {
      const ok = item && known.has(item.eventId) && !seen.has(item.eventId) && text(item.view) && CONVICTION.includes(item.conviction)
        && cleanMarkets(item.above) && cleanMarkets(item.below);
      if (!ok) { dropped.push('calendarAnalysis.' + String(item && item.eventId).slice(0, 60)); return false; }
      seen.add(item.eventId);
      return true;
    }).map((item) => ({ eventId: item.eventId, view: item.view.trim(), forecast: text(item.forecast) ? item.forecast.trim() : '', conviction: item.conviction,
      above: cleanMarkets(item.above), below: cleanMarkets(item.below), sourceIds: cleanSources(item.sourceIds, sources) }));
  }

  if (Array.isArray(research.turkeyCalendar)) {
    const nowMs = Date.parse(now), seen = new Set();
    out.turkeyCalendar = research.turkeyCalendar.filter((item) => {
      const at = Date.parse(item && item.scheduledAt);
      const ok = item && text(item.id) && !seen.has(item.id) && text(item.title) && Number.isFinite(at) && /(?:Z|[+-]\d{2}:\d{2})$/.test(item.scheduledAt)
        && at <= nowMs + 15 * DAY && at >= nowMs - 4 * DAY && ['high', 'medium'].includes(item.impact) && text(item.view)
        && CONVICTION.includes(item.conviction) && cleanMarkets(item.above) && cleanMarkets(item.below);
      if (!ok) { dropped.push('turkeyCalendar.' + String(item && item.id).slice(0, 60)); return false; }
      seen.add(item.id);
      return true;
    }).map((item) => ({ id: item.id.trim(), title: item.title.trim(), scheduledAt: new Date(Date.parse(item.scheduledAt)).toISOString(), impact: item.impact,
      previous: text(item.previous) ? item.previous.trim() : '', forecast: text(item.forecast) ? item.forecast.trim() : '', actual: text(item.actual) ? item.actual.trim() : '',
      view: item.view.trim(), conviction: item.conviction, above: cleanMarkets(item.above), below: cleanMarkets(item.below), sourceIds: cleanSources(item.sourceIds, sources) }));
  }
  if (dropped.length) out.analystDropped = dropped;
  return out;
}

module.exports = { buildDataCalendar, sanitizeAnalystLayer };
