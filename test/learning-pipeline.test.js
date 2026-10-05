'use strict';
const assert=require('node:assert/strict');
const {captureLearningSnapshot,refreshLearning}=require('../src/learning-pipeline');
const {memoryDatabase}=require('./learning-fixtures');
const {series}=require('./learning-features.test');
const {readLearningRecords}=require('../src/learning-store');
(async()=>{
 const db=memoryDatabase(),s=series(),snapshot={generatedAt:s.observedAt,us:[{symbol:'ABC',market:'us',analysis:{score:1}}],bist:[],crypto:[]};
 const input={snapshot,sourceSeriesByKey:{'us:ABC':s},createdAt:s.observedAt,database:db};
 const a=await captureLearningSnapshot(input);assert.equal(a.status,'available');assert.equal(a.appended,1);
 const next=structuredClone(s);next.observedAt=next.observedAt.replace('12:00','13:00');
 const b=await captureLearningSnapshot({...input,sourceSeriesByKey:{'us:ABC':next},createdAt:next.observedAt});assert.equal(b.existing,1);assert.equal((await readLearningRecords({},db)).records.length,1);
 next.closes[239]+=1;const conflict=await captureLearningSnapshot({...input,sourceSeriesByKey:{'us:ABC':next},createdAt:next.observedAt});assert.equal(conflict.status,'partial');assert.equal(conflict.conflicts,1);assert.equal((await readLearningRecords({},db)).records.length,1);
 const refresh=await refreshLearning({database:db,asOf:s.observedAt,macroPayload:{events:[],forecasts:[]},fetchHistory:async()=>{throw Error('must not fetch before maturity');}});assert.equal(refresh.status,'available');
 const failing={getCache:async()=>{throw Error('timeout');}};await assert.rejects(refreshLearning({database:failing,asOf:s.observedAt,macroPayload:{events:[]}}),/timeout/);
 const failure=await captureLearningSnapshot({...input,database:failing});assert.equal(failure.status,'unavailable');
 console.log('learning-pipeline: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
