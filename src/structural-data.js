'use strict';
const crypto = require('node:crypto');
const DAY = 86400000;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ms = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
const iso = value => Number.isFinite(value) ? new Date(value).toISOString() : null;
function localDate(value,timeZone='UTC') {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function expectedSessions(observation, from, through) {
  const a=typeof from==='number'?from:ms(from), z=typeof through==='number'?through:ms(through);
  if (!Number.isFinite(a) || !Number.isFinite(z) || z<a || observation.calendar?.status!=='verified') return null;
  const c=observation.calendar;
  if(c.basis==='binance_klines_default_timezone') {
    const result=[];
    for(let t=Math.floor(a/DAY)*DAY;t<=z;t+=DAY) if(t>a) result.push({date:localDate(t),startAt:iso(t),endAt:iso(t+DAY-1)});
    return result;
  }
  if(ms(c.validFrom)>a || ms(c.validThrough)<z || !Number.isFinite(ms(c.validFrom)) || !Number.isFinite(ms(c.validThrough))) return null;
  return c.sessions.filter(s=>ms(s.startAt)>a && ms(s.startAt)<=z).sort((x,y)=>ms(x.startAt)-ms(y.startAt));
}
function normalizeObservation(input, generationCutoffAt) {
  const s=input.series || {}, reasons=[];
  const sourceObservedAt=s.technicalData?.fetchedAt || s.observedAt || null;
  const observed=ms(sourceObservedAt), generated=ms(generationCutoffAt), cut=Math.min(observed,generated);
  const market=input.market, timeZone=market==='crypto'?'UTC':s.timeZone;
  if(!Number.isFinite(cut)) reasons.push('source-cut-unverified');
  if(!['us','bist','crypto'].includes(market) || input.provider!==(market==='crypto'?'binance':'yahoo')) reasons.push('provider-unverified');
  if(input.currency!==({us:'USD',bist:'TRY',crypto:'USDT'})[market]) reasons.push('currency-unverified');
  let cutDate;
  try { cutDate=localDate(cut,timeZone); } catch(_){ reasons.push('timezone-unverified'); }
  const n=s.closes?.length || 0;
  const fields=['dates','closes','highs','lows','volumes','opens','openVerified','rangeVerified','volumeVerified','sourceTimestamps'];
  if(!n || fields.some(f=>!Array.isArray(s[f]) || s[f].length!==n)) reasons.push('array-alignment');
  for(const f of ['barStartAt','barEndAt','sessionEvidence','closeTimes','closeTimeProvided']) if(s[f]!=null && (!Array.isArray(s[f]) || s[f].length!==n)) reasons.push('array-alignment');
  const binance=market==='crypto' && s.calendar?.provider==='binance' && s.calendar.interval==='1d' && s.calendar.timeZone==='UTC' && s.calendar.basis==='binance_klines_default_timezone';
  const equityCalendar=s.sessionCalendar;
  let calendar=binance?{status:'verified',version:'binance-utc-daily-v1',...s.calendar}:equityCalendar?.status==='verified' && equityCalendar.evidenceHash && Array.isArray(equityCalendar.sessions)
    ? JSON.parse(JSON.stringify(equityCalendar)) : {status:'unverified',timeZone};
  if(calendar.status!=='verified') reasons.push('calendar-unverified');
  const bars=[], seen=new Set();
  if(!reasons.includes('array-alignment') && Number.isFinite(cut)) for(let i=0;i<n;i++) {
    const date=s.dates[i], stamp=ms(s.sourceTimestamps[i]);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp)) {reasons.push('source-date-unverified');continue;}
    if(seen.has(date) || (bars.length && date<bars.at(-1).date)) reasons.push('source-order-conflict');
    seen.add(date);
    let start=ms(s.barStartAt?.[i]), end=ms(s.barEndAt?.[i]);
    let sessionEvidence=s.sessionEvidence?.[i] || null;
    if(binance) {
      const midnight=Date.parse(date+'T00:00:00.000Z');
      if(stamp!==midnight) {reasons.push('daily-boundary-conflict');continue;}
      start=stamp;
      const supplied=s.closeTimeProvided?.[i]===true || s.closeTimes?.[i]!=null;
      if(supplied && ms(s.closeTimes?.[i])!==start+DAY-1) {reasons.push('close-time-conflict');end=NaN;}
      else end=start+DAY-1;
      sessionEvidence={basis:calendar.basis,...sessionEvidence};
    } else if(calendar.status==='verified') {
      const session=calendar.sessions.find(x=>x.date===date);
      if(session) {start=ms(session.startAt);end=ms(session.endAt);sessionEvidence={basis:calendar.version,evidenceHash:calendar.evidenceHash};}
    }
    if(sessionEvidence?.sourceConflict) reasons.push('source-revision-conflict');
    if(stamp>cut || (Number.isFinite(start) && start>cut)) continue;
    const values={date,open:s.opens[i],high:s.highs[i],low:s.lows[i],close:s.closes[i],volume:s.volumes[i]};
    const rangeVerified=s.rangeVerified[i]===true && [values.high,values.low,values.close].every(v=>typeof v==='number' && Number.isFinite(v) && v>0) && values.low<=values.close && values.high>=values.close && values.high>=values.low;
    const openVerified=s.openVerified[i]===true && typeof values.open==='number' && Number.isFinite(values.open) && values.open>0;
    const volumeVerified=s.volumeVerified[i]===true && typeof values.volume==='number' && Number.isFinite(values.volume) && values.volume>=0;
    const completed=Number.isFinite(end)?end<=cut:market!=='crypto' && date<cutDate;
    bars.push({...values,openVerified,rangeVerified,volumeVerified,barStartAt:iso(start),barEndAt:iso(end),sourceTimestamp:iso(stamp),timestampRole:s.timestampRole || (binance?'session_open':'bar_label'),sessionEvidence,completed,
      evidenceHash:hash({...values,openVerified,rangeVerified,volumeVerified})});
  }
  const result={provider:input.provider,market,symbol:input.symbol || null,sourceSymbol:input.sourceSymbol || input.symbol || null,currency:input.currency || null,priceBasis:input.priceBasis || 'unadjusted',sourceObservedAt:iso(observed),generationCutoffAt:iso(generated),effectiveCutoffAt:iso(cut),timeZone:timeZone || null,bars,calendar,corporateActions:s.corporateActions || null,reasons:[]};
  const sessions=bars.length?expectedSessions(result,ms(bars[0].barStartAt || bars[0].sourceTimestamp)-1,cut):null;
  const missingDates=sessions?sessions.filter(x=>!bars.some(b=>b.date===x.date)).map(x=>x.date):[];
  if(missingDates.length) reasons.push('session-coverage-gap');
  result.coverage={startDate:bars[0]?.date || null,endDate:bars.at(-1)?.date || null,missingDates,expectedSessionDates:sessions?.map(x=>x.date) || null};
  result.reasons=[...new Set(reasons)]; result.status=result.reasons.length?'evidence-incomplete':'verified';
  result.evidenceHash=hash(result);
  return result;
}
module.exports={DAY,hash,ms,iso,localDate,expectedSessions,normalizeObservation};
