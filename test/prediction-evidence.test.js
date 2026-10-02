'use strict';
const assert = require('node:assert/strict');
const {classify,group} = require('../public/prediction-evidence');
const now = '2026-10-02T08:00:00Z';
const valid = {id:'us:A:2026-09-28',source:'system',market:'us',strategyVersion:'technical-rules-v1',resolverVersion:'daily-bar-resolver-v3',
  entry:100,target:112,stop:94,closePrice:112,resultPct:12,outcome:'target-hit',outcomeEvidence:'daily_bar_range',
  createdAt:'2026-09-28T08:00:00Z',resolvedAt:'2026-10-01T22:00:00Z',barDate:'2026-09-30',barEndAt:'2026-10-01T03:59:59Z'};
assert.equal(classify(valid,now).eligible,true);
assert.equal(classify({...valid,source:'user'},now).eligible,true);
assert.equal(classify({...valid,outcome:'expired-win',outcomeEvidence:'completed_daily_close'},now).eligible,true);
assert.equal(classify({...valid,strategyVersion:undefined},now).status,'legacy');
assert.equal(classify({...valid,resolverVersion:undefined,outcomeEvidence:undefined},now).status,'legacy');
assert.equal(classify({...valid,resolvedAt:'2026-10-03T00:00:00Z'},now).status,'invalid');
assert.equal(classify({...valid,barEndAt:'2026-10-02T10:00:00Z'},now).status,'invalid');
assert.equal(classify({...valid,outcomeEvidence:'ambiguous_bar'},now).status,'ambiguous');
assert.equal(classify({...valid,outcome:'ambiguous',closePrice:null,resultPct:null},now).status,'ambiguous');
assert.equal(classify({...valid,resolverVersion:'daily-bar-resolver-v1'},now).eligible,false);
assert.equal(classify({...valid,outcomeEvidence:'completed_daily_close'},now).eligible,false);
assert.equal(classify({...valid,resultPct:'12'},now).eligible,false);
assert.equal(classify({...valid,resultPct:20},now).eligible,false);
assert.equal(classify({...valid,id:null},now).eligible,false);
assert.equal(classify({...valid,barDate:'2026-02-30'},now).eligible,false);
assert.equal(classify({...valid,barDate:'2026-09-28'},now).eligible,false);
assert.equal(classify({...valid,barDate:'2026-10-01'},now).eligible,false);
assert.equal(classify({...valid,stop:120},now).eligible,false);
assert.equal(classify({...valid,outcome:'unrecognized'},now).eligible,false);
const open={...valid,outcome:'open',resolvedAt:null,resolverVersion:null,barEndAt:null,resultPct:null,closePrice:null};
assert.equal(classify(open,now).status,'versioned_open');
const legacy={...open,strategyVersion:null};
const before=JSON.stringify([valid,open,legacy]);
const result=group([valid,{...open,id:'open'},{...legacy,id:'legacy'},{...valid,id:'v2',strategyVersion:'technical-rules-v2'},{...valid,id:'bist',market:'bist',barEndAt:'2026-09-30T20:59:59Z'},{...valid,id:'user',source:'user'}],now);
assert.equal(result.groups.length,6,'source, market, strategy and open/result state stay separate');
assert.equal(result.counts.versioned_result,4);
assert.equal(result.counts.versioned_open,1);
assert.equal(result.counts.legacy,1);
assert.equal(JSON.stringify([valid,open,legacy]),before,'classification never backfills version or timestamps');
assert.equal(group([valid,valid],now).counts.invalid,2,'duplicate IDs cannot multiply a measured sample');
const {resolveOne}=require('../src/prediction-resolver');
for (const market of ['us','bist','crypto']) {
  const prediction={...open,id:market+':REAL:2026-09-28',market};
  const resolved=resolveOne(prediction,{dates:['2026-09-30'],highs:[113],lows:[99],closes:[112]},new Date(now));
  assert.equal(classify(resolved,now).eligible,true,'actual resolver output is eligible for '+market);
}
console.log('Technical result evidence gates chronology, versions, outcome provenance and cohort separation');
