'use strict';
const crypto = require('node:crypto');
const BLS_SCHEDULE = 'https://www.bls.gov/schedule/news_release/cpi.htm';
const BLS_ARCHIVE = 'https://www.bls.gov/news.release/archives/';
const MONTHS = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const METRICS = [
 {metric:'us_cpi_headline_mom_sa',unit:'percent',adjustment:'seasonally_adjusted',frequency:'monthly'},
 {metric:'us_cpi_core_mom_sa',unit:'percent',adjustment:'seasonally_adjusted',frequency:'monthly'},
 {metric:'us_cpi_headline_yoy_nsa',unit:'percent',adjustment:'not_seasonally_adjusted',frequency:'annual'},
 {metric:'us_cpi_core_yoy_nsa',unit:'percent',adjustment:'not_seasonally_adjusted',frequency:'annual'}
];
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function text(html) {
 return String(html).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
  .replace(/&minus;|&#8722;/gi,'-').replace(/\s+/g,' ').trim();
}
const pad = number => String(number).padStart(2,'0');
function validDate(date) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;
 const parsed = new Date(date+'T00:00:00Z');
 return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===date;
}
function easternIso(date,hour=8,minute=30) {
 if(!validDate(date)||!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)throw Error('invalid_eastern_date');
 const [year,month,day]=date.split('-').map(Number),wall=Date.UTC(year,month-1,day,hour,minute);
 const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'});
 let instant=wall;
 for(let i=0;i<3;i++) {
  const offset=format.formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName').value.match(/GMT([+-])(\d{2}):(\d{2})/);
  instant=wall-(offset?(offset[1]==='-'?-1:1)*(Number(offset[2])*60+Number(offset[3])):0)*60000;
 }
 // Reject nonexistent local times during the spring DST jump.
 const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const parts=Object.fromEntries(local.map(part=>[part.type,part.value]));
 if(parts.year+'-'+parts.month+'-'+parts.day!==date||Number(parts.hour)!==hour||Number(parts.minute)!==minute)throw Error('invalid_eastern_date');
 return new Date(instant).toISOString();
}
function archiveUrl(date) {
 if(!validDate(date))throw Error('invalid_archive_date');
 return BLS_ARCHIVE+'cpi_'+date.slice(5,7)+date.slice(8,10)+date.slice(0,4)+'.htm';
}
function monthNumber(value) {
 const token=value.toLowerCase().replace(/\.$/,'');
 return MONTHS[Object.keys(MONTHS).find(month=>month===token||month.slice(0,3)===token)];
}
function periodFromLabel(label) {
 const match=text(label).match(/([A-Za-z]+)\.?\s+(\d{4})$/);
 const month=match&&monthNumber(match[1]);
 return month?match[2]+'-'+pad(month):null;
}
function parseSchedule(html) {
 const pattern=/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+([A-Z][a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
 const events=[];
 for(const match of text(html).matchAll(pattern)) {
  const month=monthNumber(match[3]),hour=Number(match[6]);
  if(!month||hour<1||hour>12)continue;
  const period=match[2]+'-'+pad(monthNumber(match[1]));
  try {
   events.push({eventId:'us_cpi:'+period,period,scheduledAt:easternIso(match[5]+'-'+pad(month)+'-'+pad(Number(match[4])),hour%12+(match[8].toUpperCase()==='PM'?12:0),Number(match[7])),scheduledTimezone:'America/New_York',sourceUrl:BLS_SCHEDULE,contentHash:sha(html)});
  } catch { /* A malformed row cannot supply a publication time. */ }
 }
 return [...new Map(events.map(event=>[event.eventId,event])).values()];
}
const attribute=(tag,name)=>tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\x27]([^"\x27]*)["\x27]','i'))?.[1];
function tableValues(html,period) {
 const table=html.match(/<table\b[^>]*\bid=["']cpi_pressa["'][^>]*>[\s\S]*?<\/table>/i)?.[0];
 if(!table)return {present:false,values:{}};
 const headers=new Map();
 for(const match of table.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi))headers.set(attribute(match[1],'id'),text(match[2]));
 const monthly=headers.get('cpi_pressa.h.1.2')==='Seasonally adjusted changes from preceding month'&&periodFromLabel(headers.get('cpi_pressa.h.2.8')||'')===period;
 const annual=/^Un-?\s*adjusted\s+12-mos\.\s+ended\s+/i.test(headers.get('cpi_pressa.h.1.9')||'')&&periodFromLabel(headers.get('cpi_pressa.h.1.9')||'')===period;
 const values={};
 for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const stub=row[1].match(/<th\b([^>]*)>([\s\S]*?)<\/th>/i);
  if(!stub)continue;
  const label=text(stub[2]),rowId=attribute(stub[1],'id');
  const prefix=label==='All items'?'us_cpi_headline':label==='All items less food and energy'?'us_cpi_core':null;
  if(!prefix||!rowId)continue;
  for(const cell of row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
   const refs=(attribute(cell[1],'headers')||'').split(/\s+/),number=text(cell[2]);
   if(!refs.includes(rowId)||!/^[-+−]?\d+(?:\.\d+)?$/.test(number))continue;
   const value=Number(number.replace('−','-'));
   if(monthly&&refs.includes('cpi_pressa.h.1.2')&&refs.includes('cpi_pressa.h.2.8'))values[prefix+'_mom_sa']=value;
   if(annual&&refs.includes('cpi_pressa.h.1.9'))values[prefix+'_yoy_nsa']=value;
  }
 }
 return {present:true,values};
}
function signedValue(verb,amount) {
 if(verb==='unchanged')return 0;
 const number=Number(amount.replace('−','-')),down=/decreased|fell/.test(verb);
 if((down&&/^[+]/.test(amount))||(!down&&number<0))return undefined;
 return down?-Math.abs(number):number;
}
function narrativeValues(narrative) {
 const values={},verb='(increased|rose|decreased|fell|unchanged)',amount='(?: ([+\\-−]?\\d+(?:\\.\\d+)?) percent)?';
 const monthly=(prefix,subject,context)=> {
  const re=new RegExp(subject+' '+verb+amount+'(?: in [A-Z][a-z]+)?([^.]*)','gi');
  for(const match of narrative.matchAll(re)) {
   if(!context(match[0]))continue;
   if(match[1].toLowerCase()!=='unchanged'&&!match[2])continue;
   const value=signedValue(match[1].toLowerCase(),match[2]||'0');
   if(Number.isFinite(value))values[prefix+'_mom_sa']=value;
  }
 };
 monthly('us_cpi_headline','(?:Consumer Price Index for All Urban Consumers \\(CPI-U\\)|CPI-U\\))',sentence=>/on a seasonally adjusted basis/i.test(sentence));
 // The opening headline establishes the release summary's SA monthly context.
 const summarySa=/CPI-U\)[\s\S]{0,250}?on a seasonally adjusted basis/i.test(narrative);
 monthly('us_cpi_core','(?:The index for all items less food and energy|The all items less food and energy index)',sentence=>/on a seasonally adjusted basis/i.test(sentence)||(summarySa&&/\b(in [A-Z][a-z]+|after)\b/.test(sentence)&&!/over the (year|last 12 months)/i.test(sentence)));
 const annual=[['us_cpi_headline',new RegExp('Over the last 12 months, the all items index '+verb+amount+' before seasonal adjustment','i')],['us_cpi_core',new RegExp('(?:The )?(?:all items less food and energy index|index for all items less food and energy) '+verb+amount+' over (?:the year|the last 12 months)','i')]];
 for(const [prefix,pattern] of annual) {
  const match=narrative.match(pattern);
  if(match&&(match[1].toLowerCase()==='unchanged'||match[2])) {
   const value=signedValue(match[1].toLowerCase(),match[2]||'0');
   if(Number.isFinite(value))values[prefix+'_yoy_nsa']=value;
  }
 }
 return values;
}
function parseFirstRelease(html,{sourceUrl,observedAt}) {
 const narrative=text(String(html).split(/<table\b[^>]*\bid=["']cpi_pressa["']/i)[0]);
 const title=narrative.match(/Consumer Price Index News Release\s*[—–-]\s*(\d{4})\s+M(\d{2})\s+Results/i);
 const heading=narrative.match(/CONSUMER PRICE INDEX\s*[—–-]\s*([A-Z]+)\s+(\d{4})/i);
 const pub=narrative.match(/embargoed until\s+(\d{1,2}):(\d{2})\s+a\.m\.\s*\(ET\)\s+\w+,\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
 if(!pub||(!title&&!heading))return {available:false,reason:'unsupported_release_header'};
 const titlePeriod=title&&title[1]+'-'+title[2],headingPeriod=heading&&heading[2]+'-'+pad(monthNumber(heading[1]));
 const period=headingPeriod||titlePeriod;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||titlePeriod&&headingPeriod&&titlePeriod!==headingPeriod)return {available:false,reason:'release_period_mismatch'};
 let publishedAt;
 try {publishedAt=easternIso(pub[5]+'-'+pad(monthNumber(pub[3]))+'-'+pad(Number(pub[4])),Number(pub[1]),Number(pub[2]));}
 catch {return {available:false,reason:'invalid_publication_date'};}
 if(sourceUrl!==archiveUrl(publishedAt.slice(0,10)))return {available:false,reason:'unverified_archive_source'};
 if(!Number.isFinite(Date.parse(observedAt)))return {available:false,reason:'invalid_acquisition_time'};
 if(Date.parse(observedAt)<Date.parse(publishedAt))return {available:false,reason:'retrieval_precedes_publication'};
 const table=tableValues(html,period),prose=narrativeValues(narrative),values={},conflicts=[];
 for(const metric of METRICS) {
  const key=metric.metric,tab=table.values[key],paragraph=prose[key];
  if(Number.isFinite(tab)&&Number.isFinite(paragraph)&&tab!==paragraph)conflicts.push(key);
  else if(Number.isFinite(table.present?tab:paragraph))values[key]=table.present?tab:paragraph;
 }
 return {available:true,period,publishedAt,observedAt,sourceUrl,contentHash:sha(html),values,conflicts,missing:METRICS.map(metric=>metric.metric).filter(key=>!Number.isFinite(values[key]))};
}
function allowedUrl(value) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='www.bls.gov'||url.username||url.password||url.port||url.search||url.hash||!(url.href===BLS_SCHEDULE||/^\/news\.release\/archives\/cpi_\d{8}\.htm$/.test(url.pathname)))throw Error('invalid_source_url');
 return url.href;
}
async function fetchText(url,{fetchImpl=globalThis.fetch,maxBytes=3*1024*1024,timeoutMs=15000}={}) {
 const expected=allowedUrl(url),controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('timeout')),timeoutMs);
 let reader;
 try {
  const response=await fetchImpl(expected,{redirect:'manual',signal:controller.signal,headers:{'user-agent':'Finans macro research/1.0'}});
  if(!response.ok)throw Error('http_'+response.status);
  if(response.url&&response.url!==expected)throw Error('unexpected_response_url');
  if(Number(response.headers?.get('content-length'))>maxBytes)throw Error('source_too_large');
  reader=response.body?.getReader?.();
  if(!reader) {
   const body=await response.text();
   if(Buffer.byteLength(body)>maxBytes)throw Error('source_too_large');
   return body;
  }
  let bytes=0;const chunks=[];
  while(true) {
   const chunk=await reader.read();
   if(chunk.done)break;
   bytes+=chunk.value.byteLength;
   if(bytes>maxBytes)throw Error('source_too_large');
   chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks).toString('utf8');
 } catch(error) {if(reader)try {await reader.cancel();}catch {}throw error;}
 finally {if(reader)try {reader.releaseLock();}catch {}clearTimeout(timer);}
}
function createCpiSource({fetcher=fetchText,clock=()=>new Date().toISOString()}={}) {
 return {
  async getSchedule() {
   const html=await fetcher(BLS_SCHEDULE),observedAt=new Date(clock()).toISOString(),events=parseSchedule(html);
   if(!events.length)throw Error('schedule_unavailable');
   return events.map(event=>({...event,observedAt}));
  },
  async getFirstRelease(event,cutoff) {
   const instant=Date.parse(cutoff||clock());
   if(!Number.isFinite(instant)||!Number.isFinite(Date.parse(event.scheduledAt)))return {available:false,reason:'invalid_cutoff_or_schedule'};
   if(Date.parse(event.scheduledAt)>instant)return {available:false,reason:'not_yet_published'};
   const sourceUrl=archiveUrl(event.scheduledAt.slice(0,10)),html=await fetcher(sourceUrl),observedAt=new Date(clock()).toISOString();
   const release=parseFirstRelease(html,{sourceUrl,observedAt});
   return release.available&&release.period===event.period?release:{available:false,reason:release.reason||'release_period_mismatch'};
  }
 };
}
module.exports={BLS_SCHEDULE,BLS_ARCHIVE,METRICS,archiveUrl,easternIso,text,parseSchedule,parseFirstRelease,fetchText,createCpiSource};

