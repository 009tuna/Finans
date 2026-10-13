'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildEquityCalendar } = require('../src/equity-calendar');
const { normalizeSeries } = require('../src/yahoo');
const { normalizeObservation, expectedSessions } = require('../src/structural-data');
const meta = { exchangeName:'NMS',exchangeTimezoneName:'America/New_York',currency:'USD',instrumentType:'EQUITY' };
const options = {dates:['2025-10-13','2026-10-13'],observedAt:'2026-10-13T18:00:00Z'};
const session = (c,date) => c.sessions.find(s => s.date === date);
test('official US schedule includes full holidays, exceptional mourning day and early closes', () => {
  for (const exchangeName of ['NMS','NGM','NCM','NYQ','ASE','PCX']) {
    const c = buildEquityCalendar({...meta,exchangeName},options);
    assert.equal(c.status,'verified',exchangeName);
    for (const date of ['2025-01-09','2025-07-04','2026-04-03','2026-07-03','2026-11-26','2026-10-11']) assert.equal(session(c,date),undefined,date);
    for (const date of ['2025-07-03','2025-11-28','2025-12-24','2026-11-27','2026-12-24']) assert.equal(session(c,date).earlyClose,true,date);
    assert.equal(session(c,'2026-07-02').earlyClose,false,'July2 is a full day in the official2026 schedule');
    assert.equal(session(c,'2026-11-27').endAt,'2026-11-27T18:00:00.000Z');
    assert.ok(session(c,'2026-10-12'),'ColumbusDay is not a US equity exchange holiday');
    assert.match(c.evidenceHash,/^[a-f0-9]{64}$/);
    assert.ok(c.sources.some(s => s.sha256 && s.httpStatus===200));
    assert.ok(c.sources.every(s => c.exchange==='NASDAQ' ? /nasdaq/.test(s.url) : /nyse|theice/.test(s.url)));
  }
});
test('New York DST conversion changes UTC sessions while local exchange hours stay fixed', () => {
  const c = buildEquityCalendar(meta,options);
  assert.equal(session(c,'2026-03-06').startAt,'2026-03-06T14:30:00.000Z');
  assert.equal(session(c,'2026-03-09').startAt,'2026-03-09T13:30:00.000Z');
  assert.equal(session(c,'2026-10-30').endAt,'2026-10-30T20:00:00.000Z');
  assert.equal(session(c,'2026-11-02').endAt,'2026-11-02T21:00:00.000Z');
});
test('unsupported years/exchanges/instruments/timezones fail closed, without suffix inference', () => {
  for (const bad of [{exchangeName:'LSE'},{exchangeName:undefined},{currency:'EUR'},{instrumentType:'OPTION'},{exchangeTimezoneName:'UTC'}]) assert.equal(buildEquityCalendar({...meta,...bad},options).status,'unverified');
  for (const date of ['2024-12-31','2027-01-04','2028-01-03']) assert.ok(buildEquityCalendar(meta,{...options,dates:[date]}).reasons.includes('calendar-coverage-unverified'));
  assert.ok(buildEquityCalendar(meta,{...options,observedAt:null}).reasons.includes('source-cut-unverified'));
  const c=buildEquityCalendar(meta,options);
  assert.equal(expectedSessions({calendar:c},'2026-12-31T12:00:00Z','2027-01-04T18:00:00Z'),null,'no invented calendar beyond inspected coverage');
  assert.equal(buildEquityCalendar(meta,{...options,dates:['2026-02-30']}).status,'unverified','invalid dates are not silently rolled into March');
  assert.equal(buildEquityCalendar(meta,{...options,observedAt:'2026-10-13'}).status,'unverified');
});
test('NYSE future coverage is bounded to its actual2027 publication, without assigning it to Nasdaq', () => {
  const c=buildEquityCalendar({...meta,exchangeName:'NYQ'},{...options,dates:['2027-01-04']});
  assert.equal(c.status,'verified');
  assert.equal(session(c,'2027-06-18'),undefined);
  assert.equal(session(c,'2027-12-24'),undefined);
  assert.equal(session(c,'2027-11-26').endAt,'2027-11-26T18:00:00.000Z');
  assert.ok(expectedSessions({calendar:c},'2026-12-31T12:00:00Z','2027-01-04T18:00:00Z').length);
  assert.equal(buildEquityCalendar(meta,{...options,dates:['2027-01-04']}).status,'unverified');
});
test('provider regular boundaries are checked against the same date and holiday schedule', () => {
  const regular=(start,end)=>({currentTradingPeriod:{regular:{start:Date.parse(start)/1000,end:Date.parse(end)/1000}}});
  const good=buildEquityCalendar({...meta,...regular('2026-11-27T14:30:00Z','2026-11-27T18:00:00Z')},options);
  assert.equal(good.status,'verified');
  const mismatch=buildEquityCalendar({...meta,...regular('2026-11-27T14:30:00Z','2026-11-27T21:00:00Z')},options);
  assert.equal(mismatch.status,'unverified');
  assert.ok(mismatch.reasons.includes('session-boundary-conflict'));
  assert.equal(mismatch.conflicts[0].officialEndAt,'2026-11-27T18:00:00.000Z');
  const wrongOffset={...meta,...regular('2026-11-27T14:30:00Z','2026-11-27T18:00:00Z')};
  wrongOffset.currentTradingPeriod.regular.gmtoffset=-14400;
  assert.ok(buildEquityCalendar(wrongOffset,options).reasons.includes('session-boundary-conflict'));
  assert.equal(buildEquityCalendar(meta,{...options,dates:['2026-07-03']}).status,'unverified','a source bar on a holiday conflicts with calendar');
});
test('BIST preserves official holidays and precise known timing conflict instead of fabricating an opening instant', () => {
  const m={exchangeName:'IST',exchangeTimezoneName:'Europe/Istanbul',currency:'TRY',instrumentType:'EQUITY',currentTradingPeriod:{regular:{start:Date.parse('2026-10-13T06:30:00Z')/1000,end:Date.parse('2026-10-13T15:00:00Z')/1000}}};
  const c=buildEquityCalendar(m,options);
  assert.equal(c.status,'unverified');
  assert.ok(c.reasons.includes('session-boundary-conflict'));
  assert.ok(c.reasons.includes('opening-time-unverified'));
  assert.equal(session(c,'2026-10-29'),undefined);
  assert.equal(session(c,'2026-03-19').endAt,'2026-03-19T09:40:00.000Z');
  assert.equal(session(c,'2026-10-13').endAt,'2026-10-13T15:10:00.000Z');
  assert.equal(session(c,'2026-10-13').startAt,null);
  assert.deepEqual(c.conflicts[0].openingTimeBounds,['2026-10-13T06:55:00.000Z','2026-10-13T07:00:00.000Z']);
});
test('Yahoo normalization supplies an evidenced US calendar and an unfinished current bar remains unfinished', () => {
  const payload={chart:{result:[{meta:{...meta,currentTradingPeriod:{regular:{start:Date.parse('2026-11-27T14:30:00Z')/1000,end:Date.parse('2026-11-27T18:00:00Z')/1000}}},
    timestamp:['2026-11-25T14:30:00Z','2026-11-27T14:30:00Z'].map(s=>Date.parse(s)/1000),
    indicators:{quote:[{open:[100,102],close:[101,103],high:[102,104],low:[99,101],volume:[1000,100]}]}}]}};
  const y=normalizeSeries(payload,'AAPL',{observedAt:'2026-11-27T17:00:00Z'});
  assert.equal(y.series.sessionCalendar.status,'verified');
  const o=normalizeObservation({series:y.series,market:'us',provider:'yahoo',currency:'USD'},'2026-11-27T17:01:00Z');
  assert.equal(o.status,'verified');
  assert.deepEqual(o.bars.map(b=>b.completed),[true,false]);
  assert.deepEqual(o.coverage.missingDates,[],'Thanksgiving must not create a missing session');
  assert.equal(o.bars[1].barEndAt,'2026-11-27T18:00:00.000Z');
  const closed=normalizeObservation({series:{...y.series,observedAt:'2026-11-27T18:00:01Z'},market:'us',provider:'yahoo',currency:'USD'},'2026-11-27T18:00:02Z');
  assert.equal(closed.bars[1].completed,true);
});
