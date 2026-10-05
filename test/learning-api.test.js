'use strict';
const assert=require('node:assert/strict');
const {handleLearning}=require('../src/learning-api');
const {memoryDatabase,example}=require('./learning-fixtures');
const {appendLearningRecords}=require('../src/learning-store');
(async()=>{const database=memoryDatabase();assert.equal((await handleLearning({method:'POST'},{database})).status,405);const empty=await handleLearning({method:'GET'},{database});assert.equal(empty.body.counts.examples,0);assert.equal(empty.body.status,'awaiting_evidence');await appendLearningRecords({examples:[example()]},database);const r=await handleLearning({method:'GET'},{database,asOf:'2026-03-01T00:00:00Z'});assert.equal(r.body.counts.pending,1);assert.ok(!JSON.stringify(r.body).includes('evidenceHash'));assert.ok(!JSON.stringify(r.body).includes('"features":'));assert.equal((await handleLearning({method:'GET'},{database:{getCache:async()=>{throw Error('secret timeout');}}})).status,503);console.log('learning-api: PASS');})().catch(e=>{console.error(e);process.exitCode=1;});
