'use strict';
const assert=require('node:assert/strict');
const {handleLearning,writeLearningProjection,PROJECTION_KEY}=require('../src/learning-api');
const {memoryDatabase,example}=require('./learning-fixtures');
const {appendLearningRecords}=require('../src/learning-store');
(async()=>{
 const database=memoryDatabase();assert.equal((await handleLearning({method:'POST'},{database})).status,405);
 const empty=await handleLearning({method:'GET'},{database});assert.equal(empty.body.counts.examples,0);assert.equal(empty.body.status,'awaiting_evidence');assert.equal(empty.body.observations.count,0);
 await appendLearningRecords({examples:[example()]},database);
 const runs=Array.from({length:13},(_,i)=>({schemaVersion:1,id:'observation:'+i,kind:'price',cohort:example().cohort,recordType:'exampleObservation',exampleId:example().id,createdAt:i===12?'2026-03-02T00:00:00Z':'2026-02-'+String(i+1).padStart(2,'0')+'T00:00:00Z',classification:i%2?'evidence_change':'source_revision',blocking:!(i%2),reasons:i%2?['source_evidence_changed']:['features_changed','source_evidence_changed'],comparisonLimit:'original_evidence_body_not_recorded',incomingExample:{source:{symbol:'ABC'},features:{private:999},evidenceHash:'a'.repeat(64)},incomingReference:{barDate:'2026-01-01'}}));
 await appendLearningRecords({runs},database);await appendLearningRecords({runs:[runs[0]]},database);
 const r=await handleLearning({method:'GET'},{database,asOf:'2026-03-01T00:00:00Z',readFresh:true});assert.equal(r.body.counts.pending,1);assert.equal(r.body.counts.examples,1);assert.equal(r.body.counts.labels,0);assert.equal(r.body.counts.models,0);assert.equal(r.body.observations.count,12);assert.equal(r.body.observations.evidenceChanges,6);assert.equal(r.body.observations.sourceRevisions,6);assert.equal(r.body.observations.recent.length,10);assert.equal(r.body.observations.reasonCounts.source_evidence_changed,12);assert.equal(r.body.observations.reasonCounts.features_changed,6);assert.equal(r.body.exclusions.futureRecords,1);
 assert.ok(r.body.observations.recent.every(o=>o.createdAt<'2026-03-01T00:00:00Z'));assert.equal(r.body.observations.recent[0].comparisonLimit,'original_evidence_body_not_recorded');assert.ok(!JSON.stringify(r.body).includes('evidenceHash'));assert.ok(!JSON.stringify(r.body).includes('"features":'));assert.ok(!JSON.stringify(r.body).includes('incomingExample'));
 const projection=await writeLearningProjection({database,asOf:'2026-03-01T00:00:00Z',collectionStatus:{status:'partial',checkedAt:'2026-03-01T00:00:00Z',conflicts:6,evidenceChanges:6,sourceRevisions:6,observationsAppended:12,reasonCounts:{features_changed:6}}});assert.equal(projection.collectionStatus.evidenceChanges,6);
 const old=database.rows.get(PROJECTION_KEY),legacy=structuredClone(old.value);delete legacy.observations;await database.compareAndSetCache(PROJECTION_KEY,legacy,old.revision);
 const cached=await handleLearning({method:'GET'},{database,asOf:'2026-03-01T00:00:00Z'});assert.equal(cached.body.observations.status,'not_recorded');assert.equal(cached.body.observations.count,null);assert.deepEqual(cached.body.observations.recent,[]);
 assert.equal((await handleLearning({method:'GET'},{database:{getCache:async()=>{throw Error('secret timeout');}}})).status,503);console.log('learning-api: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
