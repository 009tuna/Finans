'use strict';
// Exercise the actual backend payload shape through the frontend cache boundary.
const assert = require('node:assert/strict');
const {handleIntelligence} = require('../src/intelligence-api');
const {KEY,initial} = require('../src/macro-store');
const {empty} = require('../src/research-ledger');
const macro = require('../public/macro');
const clone = value => structuredClone(value);
const metric = 'us_nonfarm_payroll_change', unit = 'thousand_jobs';
const firstNow = '2099-01-03T10:00:00.000Z';
const laterNow = '2099-02-06T10:00:00.000Z';
const sourceEvent = {eventId:metric+':2099-01',metric,unit,period:'2099-01',scheduledAt:'2099-02-05T13:30:00.000Z',
  sourceUrl:'https://www.bls.gov/schedule/news_release/empsit.htm',observedAt:firstNow,contentHash:'a'.repeat(64)};
const sourceValue = {...clone(initial),events:[sourceEvent],updatedAt:firstNow,sourceStatus:{status:'available',lastSuccessfulAt:firstNow},
  observations:[{metric,unit,period:'2098-12',value:162,vintage:'first_release',publishedAt:'2099-01-02T13:30:00.000Z',
    observedAt:firstNow,sourceUrl:'https://www.bls.gov/news.release/archives/empsit_01022099.htm',contentHash:'b'.repeat(64)}]};
function ledger(period, estimate) {
  const value = empty();
  if (!period) return value;
  const scheduledAt = period==='2099-01' ? sourceEvent.scheduledAt : '2099-03-05T13:30:00.000Z';
  value.forecasts.push({id:'model-'+period,eventId:'research-'+period,runId:'run-'+period,metric,unit,period,pointEstimate:estimate,
    createdAt:firstNow,recordedAt:firstNow,knowledgeCutoff:firstNow,scheduledAt,market:'us',symbol:'',
    resolution:{provider:'bls-first-release',field:'nonfarmPayrollChange',sourceUrl:'https://www.bls.gov/news.release/archives/empsit_'+scheduledAt.slice(5,7)+scheduledAt.slice(8,10)+scheduledAt.slice(0,4)+'.htm'},
    rationale:'Synthetic model evidence; no real prediction.',sourceEvidence:[]});
  return value;
}
function database(research, failNfp) {return {getCache:async key=>{
  if(key===KEY && failNfp)throw new Error('test-only NFP read failure');
  const value = key===KEY ? sourceValue : key==='research_ledger_v1' ? research : null;
  return value ? {value:clone(value),revision:'fixture-revision'} : null;
}};}
function mount() {let html='';return {get innerHTML(){return html;},set innerHTML(value){html=value;},querySelectorAll(){return [];}};}
function clientFor(node, current) {return macro.createClient({document:{getElementById:id=>id==='macroWorkspace'?node:null},
  fetch:async url=>({ok:true,json:async()=>url==='/api/macro'?current():{groups:{us:[],bist:[],crypto:[]}}})});}
(async()=>{
  const originalNow = Date.now;
  let now = firstNow;
  Date.now = ()=>Date.parse(now);
  try {
    let response = await handleIntelligence({method:'GET'},{database:database(ledger('2099-01',100),false),now});
    assert.equal(response.status,200);
    const node=mount();let body=response.body;
    const client=clientFor(node,()=>body);
    await client.refresh();assert.match(node.innerHTML,/162 bin kişi/);
    response=await handleIntelligence({method:'GET'},{database:database(ledger('2099-01',100),true),now});
    assert.equal(response.status,200);
    assert.equal(response.body.events[0].scheduleVerification,'model-cited-web-research','failed NFP store still returns a model-cited event');
    body=response.body;await client.refresh({force:true});
    assert.match(node.innerHTML,/162 bin kişi/,'model-derived fallback schedule must not erase cached independent observations');
    assert.match(node.innerHTML,/100 bin kişi/,'available research model remains visible during source outage');
    const coldNode=mount();const cold=clientFor(coldNode,()=>body);await cold.refresh();
    assert.match(coldNode.innerHTML,/100 bin kişi/,'cold load can show available model context without an independent source snapshot');
    assert.doesNotMatch(coldNode.innerHTML,/doğrulanmış son kayıtlar korunuyor/,'cold read failure must not claim an independent cache');
    const multiple=ledger('2099-01',100);
    multiple.forecasts.push(...ledger('2099-02',200).forecasts);
    const multiBody=(await handleIntelligence({method:'GET'},{database:database(multiple,true),now})).body;
    const multiNode=mount();const multiClient=clientFor(multiNode,()=>multiBody);await multiClient.refresh();
    assert.match(multiNode.innerHTML,/100 bin kişi/,'cold model context selects the earliest upcoming event');
    assert.equal(multiClient.getState().macro.events.length,2,'both model-cited event identities remain available for rollover');
    now=laterNow;
    body=(await handleIntelligence({method:'GET'},{database:database(ledger('2099-02',200),true),now})).body;
    await client.refresh({force:true});
    assert.match(node.innerHTML,/200 bin kişi/,'new model-cited event remains usable after the cached source event has expired');
    assert.equal(client.getState().macro.modelForecasts[0].period,'2099-02');
    body=(await handleIntelligence({method:'GET'},{database:database(empty(),false),now})).body;
    await client.refresh({force:true});
    assert.equal(client.getState().macro.modelForecasts.length,0,'healthy empty model ledger clears old predictions');
  } finally {Date.now=originalNow;}
  console.log('Macro backend/frontend contract: model-cited fallback, independent cache, cold failure, rollover and empty recovery passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
