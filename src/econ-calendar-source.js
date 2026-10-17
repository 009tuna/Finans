// Ekonomik veri takvimi kaynağı: Forex Factory haftalık akışı (saat, etki, beklenti, önceki)
// + Nasdaq ekonomik takvimi (gerçekleşen). Birleşik kayıt api_cache'te tutulur; böylece hafta
// devrildiğinde geçen haftanın sonuçları kaybolmaz ve kaynak geçici düşerse son kayıt sunulur.
'use strict';
const EC = require('../public/econ-calendar');

const FF_FEEDS = [
  ['thisweek', 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'],
  ['nextweek', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'],
];
const NASDAQ_URL = 'https://api.nasdaq.com/api/calendar/economicevents?date=';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json' };
const CACHE_KEY = 'econ_calendar_v1';
const KEEP_DAYS = 21;
const ACTUAL_LOOKBACK_DAYS = 10;
const MAX_NASDAQ_DATES = 12;
const MEMORY_TTL_MS = 10 * 60 * 1000;
const FF_MIN_INTERVAL_MS = 30 * 60 * 1000;
const AHEAD_DAYS = 7;
const DAY = 86400000;

async function getJson(url, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message || err) };
  } finally { clearTimeout(timer); }
}

async function fetchForexFactory({ fetchImpl } = {}) {
  const feeds = {}, events = [], ranges = [];
  for (const [name, url] of FF_FEEDS) {
    const res = await getJson(url, { fetchImpl });
    if (!res.ok || !Array.isArray(res.data)) {
      feeds[name] = { status: res.status === 404 ? 'not_published' : 'unavailable', httpStatus: res.status };
      continue;
    }
    const times = res.data.map((row) => Date.parse(row && row.date)).filter(Number.isFinite);
    if (times.length) ranges.push([Math.min(...times), Math.max(...times)]);
    const normalized = res.data.map(EC.normalizeForexFactory).filter(Boolean);
    events.push(...normalized);
    feeds[name] = { status: 'available', rows: res.data.length, events: normalized.length };
  }
  return { events, feeds, ranges };
}

async function fetchNasdaqDays(dates, { fetchImpl } = {}) {
  const rowsByDate = {}, failures = [];
  await Promise.all(dates.map(async (date) => {
    const res = await getJson(NASDAQ_URL + date, { fetchImpl, timeoutMs: 10000 });
    const rows = res.ok && res.data && res.data.data && Array.isArray(res.data.data.rows) ? res.data.data.rows : null;
    if (rows) rowsByDate[date] = rows; else failures.push(date);
  }));
  return { rowsByDate, failures };
}

// Taze akış kapsadığı hafta için otoritedir: o aralıkta artık bulunmayan eski kayıt
// (ertelenen/iptal edilen olay) düşer. Kapsam dışındaki eski kayıtlar sonuçlarıyla korunur.
function mergeEvents(stored, fresh, ranges, nowMs) {
  const inFreshRange = (event) => ranges.some(([from, to]) => {
    const at = Date.parse(event.scheduledAt);
    return at >= from && at <= to;
  });
  const byId = new Map();
  (stored || []).forEach((event) => {
    if (!event || !event.id || Date.parse(event.scheduledAt) < nowMs - KEEP_DAYS * DAY) return;
    if (inFreshRange(event)) return;
    byId.set(event.id, event);
  });
  const previous = new Map((stored || []).filter((e) => e && e.id).map((e) => [e.id, e]));
  fresh.forEach((event) => {
    const old = previous.get(event.id);
    const merged = Object.assign({}, event);
    if (old) {
      if (!merged.actual && old.actual) { merged.actual = old.actual; merged.actualSource = old.actualSource; }
      if (!merged.revisedPrevious && old.revisedPrevious) merged.revisedPrevious = old.revisedPrevious;
      if (old.ai) merged.ai = old.ai;
    }
    byId.set(event.id, merged);
  });
  return [...byId.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function nasdaqDatesFor(events, nowMs) {
  const dates = new Set();
  events.forEach((event) => {
    const at = Date.parse(event.scheduledAt);
    if (event.actual || at > nowMs || at < nowMs - ACTUAL_LOOKBACK_DAYS * DAY) return;
    if (!event.forecast && !event.previous) return;
    dates.add(event.localDate);
    dates.add(new Date(Date.parse(event.localDate + 'T00:00:00Z') + DAY).toISOString().slice(0, 10));
  });
  return [...dates].sort().reverse().slice(0, MAX_NASDAQ_DATES);
}

// Forex Factory yalnız içinde bulunulan haftayı yayınlar. Haftanın kapsamadığı önümüzdeki günler
// Nasdaq'ın ileri tarihli ABD takviminden tamamlanır (sorgu tarihi = olay günü + 1).
async function fetchNasdaqAhead(ranges, nowMs, { fetchImpl } = {}) {
  const covered = ranges.length ? Math.max(...ranges.map((r) => r[1])) : nowMs - DAY;
  const days = [];
  const first = Date.parse(new Date(Math.max(covered, nowMs - DAY)).toISOString().slice(0, 10) + 'T00:00:00Z');
  for (let at = first; at <= nowMs + AHEAD_DAYS * DAY; at += DAY) days.push(new Date(at).toISOString().slice(0, 10));
  if (!days.length) return { events: [], ranges: [], rowsByDate: {}, failures: [] };
  const queryDates = days.map((day) => new Date(Date.parse(day + 'T00:00:00Z') + DAY).toISOString().slice(0, 10));
  const fetched = await fetchNasdaqDays(queryDates, { fetchImpl });
  const events = [], okRanges = [];
  queryDates.forEach((queryDate) => {
    if (!fetched.rowsByDate[queryDate]) return;
    const day = new Date(Date.parse(queryDate + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
    const from = Date.parse(day + 'T04:00:00Z'), to = from + DAY - 1;
    if (to <= covered) return;
    okRanges.push([Math.max(from, covered + 1), to]);
    events.push(...EC.normalizeNasdaqDay(fetched.rowsByDate[queryDate], queryDate).filter((e) => Date.parse(e.scheduledAt) > covered));
  });
  return { events, ranges: okRanges, rowsByDate: fetched.rowsByDate, failures: fetched.failures };
}

function defaultStore() {
  const db = require('./db');
  return {
    read: async () => { const row = await db.getCache(CACHE_KEY); return row && row.value; },
    write: (value) => db.setCache(CACHE_KEY, value),
  };
}

async function buildEconomicCalendar({ now = new Date().toISOString(), fetchImpl, store = defaultStore() } = {}) {
  const nowMs = Date.parse(now);
  const stored = await store.read().catch(() => null);
  // Forex Factory sık istekte 429 döner; son başarılı çekim yeterince yeniyse kayıtlı takvimi kullan.
  const lastOk = Date.parse(stored && stored.coverage && stored.coverage.lastSuccessfulAt);
  const reuse = Number.isFinite(lastOk) && nowMs - lastOk >= 0 && nowMs - lastOk < FF_MIN_INTERVAL_MS;
  const ff = reuse ? { events: [], feeds: { cache: { status: 'available', reusedFrom: stored.coverage.lastSuccessfulAt } }, ranges: [] } : await fetchForexFactory({ fetchImpl });
  const ahead = reuse ? { events: [], ranges: [], rowsByDate: {}, failures: [] } : await fetchNasdaqAhead(ff.ranges, nowMs, { fetchImpl });
  let events = mergeEvents(stored && stored.events, ff.events.concat(ahead.events), ff.ranges.concat(ahead.ranges), nowMs);
  const dates = nasdaqDatesFor(events, nowMs).filter((date) => !ahead.rowsByDate[date]);
  const nasdaq = dates.length ? await fetchNasdaqDays(dates, { fetchImpl }) : { rowsByDate: {}, failures: [] };
  events = EC.attachActuals(events, Object.assign({}, ahead.rowsByDate, nasdaq.rowsByDate));
  const ffAvailable = Object.values(ff.feeds).some((feed) => feed.status === 'available');
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    events,
    coverage: {
      status: ffAvailable ? (nasdaq.failures.length ? 'partial' : 'available') : events.length ? 'stale' : 'unavailable',
      sources: {
        forexfactory: ff.feeds,
        nasdaq: { status: !dates.length ? 'not_needed' : nasdaq.failures.length === dates.length ? 'unavailable' : nasdaq.failures.length ? 'partial' : 'available', dates, failures: nasdaq.failures },
        nasdaqAhead: { status: reuse ? 'cache' : ahead.ranges.length ? (ahead.failures.length ? 'partial' : 'available') : ahead.failures.length ? 'unavailable' : 'not_needed', events: ahead.events.length, failures: ahead.failures },
      },
      lastSuccessfulAt: ffAvailable && !reuse ? new Date(nowMs).toISOString() : (stored && stored.coverage && stored.coverage.lastSuccessfulAt) || null,
    },
  };
  if (ffAvailable || nasdaq.failures.length < dates.length) await Promise.resolve(store.write(payload)).catch(() => {});
  return payload;
}

let memory = null;
async function getEconomicCalendar(options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  // Başarısız sonuç kısa tutulur; kaynağı da hız sınırına sokmamak için hemen tekrar denenmez.
  const ttl = memory && memory.payload.events.length ? MEMORY_TTL_MS : 2 * 60 * 1000;
  if (!options.fresh && memory && nowMs - memory.at < ttl) return memory.payload;
  const payload = await buildEconomicCalendar(options);
  memory = { at: nowMs, payload };
  return payload;
}

// Eski tüketiciler (sinyal katmanı, eylem katmanı) için Finnhub biçimli satırlar.
function legacyEconomicRows(events, from, to) {
  return (events || [])
    .filter((event) => { const d = event.scheduledAt.slice(0, 10); return d >= from && d <= to; })
    .map((event) => ({
      id: event.id,
      date: event.scheduledAt.slice(0, 10),
      time: event.scheduledAt.slice(11, 16),
      scheduledAt: event.scheduledAt,
      country: event.country,
      event: event.title,
      titleTr: event.titleTr,
      category: event.category,
      impact: event.impact,
      estimate: event.forecast ? event.forecast.text : null,
      prev: event.previous ? event.previous.text : null,
      actual: event.actual ? event.actual.text : null,
      unit: event.forecast ? event.forecast.unit : '',
    }));
}

async function handleCalendar(req, options = {}) {
  if (req && req.method && req.method !== 'GET') return { status: 405, body: { error: 'Method not allowed' } };
  try {
    return { status: 200, body: await getEconomicCalendar(options) };
  } catch (_) {
    return { status: 503, body: { error: 'Ekonomik takvime ulaşılamadı.' } };
  }
}

module.exports = { CACHE_KEY, buildEconomicCalendar, getEconomicCalendar, legacyEconomicRows, handleCalendar, mergeEvents, nasdaqDatesFor };
