'use strict';
const assert=require('node:assert/strict');
const {collectMacroExamples}=require('../src/learning-macro');
const {captureLearningSnapshot,refreshLearning}=require('../src/learning-pipeline');
const {appendLearningRecords,readLearningRecords}=require('../src/learning-store');
const {handleLearning,writeLearningProjection}=require('../src/learning-api');
const {series}=require('./learning-features.test');
const {memoryDatabase}=require('./learning-fixtures');
const {payload}=require('./learning-macro.test');
const cases=[];
function test(name,run){cases.push({name,run});}
test('immutable frozen schedule survives later official refresh',()=>{
 const p=structuredClone(payload),f=p.forecasts[0];f.scheduleObservedAt=p.events[0].observedAt;f.scheduleContentHash=p.events[0].contentHash;f.scheduleSourceUrl=p.events[0].sourceUrl;
 p.events[0].observedAt='2026-03-01T00:00:00Z';p.events[0].contentHash='d'.repeat(64);
 const r=collectMacroExamples({macroPayload:p,asOf:'2026-03-02T00:00:00Z'});assert.equal(r.examples[0].eligibility.status,'eligible');assert.equal(r.labels.length,1);
});
test('first captured schedule also survives legacy CPI/model payload refresh',()=>{
 const p=structuredClone(payload),first=collectMacroExamples({macroPayload:p,asOf:'2026-02-02T00:00:00Z'}).examples;
 p.events[0].observedAt='2026-03-01T00:00:00Z';p.events[0].contentHash='d'.repeat(64);
 const r=collectMacroExamples({macroPayload:p,asOf:'2026-03-02T00:00:00Z',frozenExamples:first});assert.equal(r.labels.length,1);assert.equal(r.examples[0].evidenceHash,first[0].evidenceHash);
});
test('native NFP records without IDs match period/hash rather than undefined IDs',()=>{
 const p=structuredClone(payload),a=p.observations[0];delete a.id;delete p.outcomes[0].actualId;
 p.outcomes[0]={...p.outcomes[0],...a,actual:a.value,value:undefined};delete p.outcomes[0].value;
 p.observations.unshift({...a,period:'2025-12',value:999,contentHash:'d'.repeat(64)});
 assert.equal(collectMacroExamples({macroPayload:p,asOf:'2026-03-01T00:00:00Z'}).labels.length,1);
});
test('claim-only interruption resumes first payload after clock advances',async()=>{
 const db=memoryDatabase(),s=series(),snapshot={generatedAt:s.observedAt,us:[{symbol:'ABC',market:'us'}],bist:[],crypto:[]},cas=db.compareAndSetCache;let fail=true;
 db.compareAndSetCache=async(k,v,r)=>{if(fail&&k.startsWith('learning:record:')){fail=false;throw Error('interrupted');}return cas(k,v,r);};
 const input={snapshot,sourceSeriesByKey:{'us:ABC':s},database:db};assert.equal((await captureLearningSnapshot(input)).status,'unavailable');
 const next={...s,observedAt:s.observedAt.replace('12:00','13:00')};assert.equal((await captureLearningSnapshot({...input,sourceSeriesByKey:{'us:ABC':next},createdAt:next.observedAt})).status,'available');
 const records=(await readLearningRecords({},db)).records;assert.equal(records.length,1);assert.equal(records[0].record.createdAt,s.observedAt);
});
test('independent source outage is visible rather than available zeroes',async()=>{
 const result=await refreshLearning({database:memoryDatabase(),asOf:'2026-03-01T00:00:00Z',macroPayload:{events:[],forecasts:[],storeStatus:{status:'unavailable'}}});assert.equal(result.status,'partial');
});
test('post-fetch acquisition resolves mature crypto label without a second refresh',async()=>{
 const db=memoryDatabase();
 const {example}=require('../src/learning-features').buildSignalExample({asset:{market:'crypto',symbol:'ABC'},sourceSeries:{...series(),provider:'binance',currency:'USDT',calendar:{provider:'binance',interval:'1d',timeZone:'UTC',basis:'binance_klines_default_timezone'},technicalData:{fetchedAt:series().observedAt}},createdAt:series().observedAt,knowledgeCutoff:series().observedAt});
 await appendLearningRecords({examples:[example]},db);
 const target=require('../src/learning-labels').addCalendarDays(example.reference.barDate,90),observedAt=target+'T23:59:59Z',asOf=target+'T23:59:00Z';
 let calls=0;
 const result=await refreshLearning({database:db,asOf,live:true,macroPayload:{events:[]},clock:()=>observedAt,fetchHistory:async()=>{calls++;return {coverage:{verified:true,startDate:target,endDate:target,sessionDates:[target],observedAt,provider:'binance',symbol:'ABC',currency:'USDT',priceBasis:example.reference.priceBasis,evidenceHash:'b'.repeat(64)},observations:[{date:target,close:300,completed:true,effectiveAt:target+'T23:00:00Z',observedAt,currency:'USDT',priceBasis:example.reference.priceBasis,evidenceHash:'c'.repeat(64)}]};}});
 assert.equal(result.newLabels,1);assert.equal(calls,1);
 const historical=await refreshLearning({database:db,asOf,macroPayload:{events:[]},fetchHistory:async()=>{throw Error('already resolved');}});assert.equal(historical.newLabels,0);
});
test('public projection read stays constant while evidence accumulates',async()=>{
 const db=memoryDatabase();await writeLearningProjection({database:db,asOf:'2026-03-01T00:00:00Z'});
 const get=db.getCache;let calls=0;db.getCache=async(...args)=>{calls++;return get(...args);};
 const result=await handleLearning({method:'GET'},{database:db,asOf:'2026-03-02T00:00:00Z'});assert.equal(result.status,200);assert.equal(calls,1);
});
(async()=>{let failed=0;for(const c of cases){try{await c.run();console.log('PASS '+c.name);}catch(e){failed++;console.error('FAIL '+c.name+': '+e.message);}}if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
