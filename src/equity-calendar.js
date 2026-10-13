'use strict';
// Reviewed official schedules, not a weekday-only heuristic. Yahoo daily labels
// remain labels: only this bounded exchange schedule can attest session times.
const { hash, localDate } = require('./structural-data');
const sourceData = require('./data/equity-calendar-sources.json');
const VERSION = 'official-equity-calendars-2025-2027-v1';
const US = {
  2025: { closed: ['01-01','01-09','01-20','02-17','04-18','05-26','06-19','07-04','09-01','11-27','12-25'], early: ['07-03','11-28','12-24'] },
  2026: { closed: ['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'], early: ['11-27','12-24'] },
  // NYSE publishes2027. Nasdaq's inspected US pages publish2026 only;
  // sharing a country does not prove another exchange's future schedule.
  2027: { closed: ['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'], early: ['11-26'] },
};
const BIST = {
  2025: { closed: ['01-01','03-29','03-30','03-31','04-01','04-23','05-01','05-19','06-06','06-07','06-08','06-09','07-15','08-30','10-29'], early: ['06-05','10-28'] },
  2026: { closed: ['01-01','03-20','03-21','03-22','04-23','05-01','05-19','05-27','05-28','05-29','05-30','07-15','08-30','10-29'], early: ['03-19','05-26','10-28'] },
};
const EXCHANGES = {
  NMS: { exchange: 'NASDAQ', timeZone: 'America/New_York', currency: 'USD' },
  NGM: { exchange: 'NASDAQ', timeZone: 'America/New_York', currency: 'USD' },
  NCM: { exchange: 'NASDAQ', timeZone: 'America/New_York', currency: 'USD' },
  NYQ: { exchange: 'NYSE', timeZone: 'America/New_York', currency: 'USD' },
  ASE: { exchange: 'NYSE_AMERICAN', timeZone: 'America/New_York', currency: 'USD' },
  PCX: { exchange: 'NYSE_ARCA', timeZone: 'America/New_York', currency: 'USD' },
  IST: { exchange: 'BIST', timeZone: 'Europe/Istanbul', currency: 'TRY' },
};
const formatterCache = new Map();
function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }));
  return formatterCache.get(timeZone);
}
// IANA timezone conversion, including each date's DST offset. Never reuse the
// provider's current gmtoffset for a previous or future trading session.
function atLocal(date, clock, timeZone) {
  const target = Date.parse(`${date}T${clock}:00Z`);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += target - wall;
  }
  return new Date(instant).toISOString();
}
function buildEquityCalendar(meta = {}, { dates = [], observedAt = null } = {}) {
  const config = EXCHANGES[meta.exchangeName];
  const reasons = [];
  if (!config) reasons.push('exchange-unverified');
  if (config && (meta.exchangeTimezoneName !== config.timeZone || meta.currency !== config.currency)) reasons.push('exchange-metadata-conflict');
  if (!['EQUITY','ETF'].includes(meta.instrumentType)) reasons.push('instrument-type-unverified');
  if (typeof observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(observedAt) || !Number.isFinite(Date.parse(observedAt))) reasons.push('source-cut-unverified');
  const refs = sourceData.sources.filter(s => config?.exchange === 'BIST' ? s.id.startsWith('bist-')
    : config?.exchange === 'NASDAQ' ? s.id.startsWith('nasdaq-') : config && s.id.startsWith('nyse-'));
  const result = { status: 'unverified', version: VERSION, exchange: config?.exchange || null,
    providerExchange: meta.exchangeName || null, timeZone: config?.timeZone || meta.exchangeTimezoneName || null,
    sources: refs, reviewedOn: '2026-10-13', validFrom: null, validThrough: null, sessions: [], reasons, conflicts: [] };
  if (reasons.length) return result;
  const observedDate = localDate(Date.parse(observedAt), config.timeZone);
  const coveredDates = [...dates, observedDate];
  const maxYear = config.exchange.startsWith('NYSE') ? 2027 : 2026;
  if (coveredDates.some(d => typeof d!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + 'T00:00:00Z'))
    || new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d || Number(d.slice(0,4))<2025 || Number(d.slice(0,4))>maxYear)) {
    reasons.push('calendar-coverage-unverified'); return result;
  }
  const firstYear = Math.min(...coveredDates.map(d => Number(d.slice(0,4))));
  const lastYear = maxYear;
  result.validFrom = atLocal(`${firstYear}-01-01`, '00:00', config.timeZone);
  result.validThrough = new Date(Date.parse(atLocal(`${lastYear + 1}-01-01`, '00:00', config.timeZone)) - 1).toISOString();
  const schedule = config.exchange === 'BIST' ? BIST : US;
  for (let year = firstYear; year <= lastYear; year++) {
    for (let t = Date.UTC(year,0,1); t < Date.UTC(year+1,0,1); t += 86400000) {
      const d = new Date(t), date = d.toISOString().slice(0,10), mmdd = date.slice(5);
      if ([0,6].includes(d.getUTCDay()) || schedule[year].closed.includes(mmdd)) continue;
      const earlyClose = schedule[year].early.includes(mmdd);
      if (config.exchange === 'BIST') {
        // The official auction starts at 09:55+ with random call termination.
        // Do not invent a precise opening price timestamp from these bounds.
        result.sessions.push({ date, startAt: null, endAt: atLocal(date, earlyClose ? '12:40' : '18:10', config.timeZone),
          earlyClose, openingTimeBounds: [atLocal(date,'09:55',config.timeZone),atLocal(date,'10:00',config.timeZone)] });
      } else result.sessions.push({ date, startAt: atLocal(date,'09:30',config.timeZone),
        endAt: atLocal(date,earlyClose ? '13:00' : '16:00',config.timeZone), earlyClose });
    }
  }
  const current = meta.currentTradingPeriod?.regular;
  if (current && (current.start != null || current.end != null)) {
    const start = typeof current.start === 'number' ? current.start * 1000 : NaN;
    const end = typeof current.end === 'number' ? current.end * 1000 : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= start) reasons.push('session-boundary-conflict');
    else {
      const date = localDate(start,config.timeZone), session = result.sessions.find(s => s.date === date);
      const p=Object.fromEntries(formatter(config.timeZone).formatToParts(new Date(start)).map(x=>[x.type,x.value]));
      const offset=(Date.parse(`${date}T${p.hour}:${p.minute}:${p.second}Z`)-start)/1000;
      const offsetConflict=current.gmtoffset!=null && (typeof current.gmtoffset!=='number' || current.gmtoffset!==offset);
      if (!session || Date.parse(session.startAt) !== start || Date.parse(session.endAt) !== end || offsetConflict) {
        reasons.push('session-boundary-conflict');
        result.conflicts.push({date,providerStartAt:new Date(start).toISOString(),providerEndAt:new Date(end).toISOString(),
          officialStartAt:session?.startAt || null,officialEndAt:session?.endAt || null,openingTimeBounds:session?.openingTimeBounds || null,
          ...(offsetConflict?{providerGmtOffset:current.gmtoffset,officialGmtOffset:offset}:{} )});
      }
    }
  }
  // BIST holiday coverage is sourced, but its auction instant and Yahoo daily
  // boundaries are not currently sufficient evidence for observed-open fills.
  if (config.exchange === 'BIST') reasons.push('opening-time-unverified');
  for (const date of dates) if (!result.sessions.some(s => s.date === date)) {
    reasons.push('source-session-date-conflict'); break;
  }
  result.reasons = [...new Set(reasons)];
  result.evidenceHash = hash({version:VERSION,exchange:result.exchange,timeZone:result.timeZone,
    validFrom:result.validFrom,validThrough:result.validThrough,sessions:result.sessions,sources:refs});
  result.evidenceHashBasis = 'reviewed_schedule_and_source_metadata';
  result.status = result.reasons.length ? 'unverified' : 'verified';
  return result;
}
module.exports = { buildEquityCalendar };
