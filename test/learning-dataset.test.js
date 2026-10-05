'use strict';
const assert=require('node:assert/strict');
const {buildLearningDataset}=require('../src/learning-dataset');
const {example}=require('./learning-fixtures');
const cohort=example().cohort,targetId='price-return-90d';
function pair(id,date,available,value=1) {
 const e=example({id,createdAt:date,knowledgeCutoff:date,sourceObservedAt:date,reference:{barDate:date.slice(0,10),currency:'USD',priceBasis:'raw'}});
 return {e,l:{schemaVersion:1,id:'label:'+id,exampleId:id,kind:'price',cohort,targetId,value,unit:'percent_return',currency:'USD',priceBasis:'raw',createdAt:available,availableAt:available,effectiveAt:available,observedAt:available,eligibility:{status:'eligible',reasons:[]}}};
}
const pairs=[pair('a','2025-01-01T00:00:00Z','2025-04-01T00:00:00Z'),pair('b','2025-05-01T00:00:00Z','2025-08-01T00:00:00Z'),pair('c','2025-09-01T00:00:00Z','2025-12-01T00:00:00Z')];
const input={examples:pairs.map(x=>x.e),labels:pairs.map(x=>x.l),cohort,targetId,asOf:'2026-01-01T00:00:00Z',splitDates:{validationStart:'2025-05-01T00:00:00Z',testStart:'2025-09-01T00:00:00Z'}};
const d=buildLearningDataset(input); assert.deepEqual([d.train.length,d.validation.length,d.test.length],[1,1,1]);
assert.equal(d.datasetId,buildLearningDataset({...input,examples:input.examples.toReversed(),labels:input.labels.toReversed()}).datasetId);
assert.equal(d.fitFingerprint,buildLearningDataset({...input,asOf:'2026-02-01T00:00:00Z'}).fitFingerprint);
const late={...pairs[0].l,availableAt:'2025-07-01T00:00:00Z'}; assert.equal(buildLearningDataset({...input,labels:[late,...input.labels.slice(1)]}).train.length,0);
const mismatch={...pairs[0].l,currency:'USDT'}; assert.equal(buildLearningDataset({...input,labels:[mismatch,...input.labels.slice(1)]}).train.length,0);
const doubled=buildLearningDataset({...input,examples:[...input.examples,pairs[0].e]}); assert.equal(doubled.train.length,1); assert.ok(doubled.exclusions.some(x=>x.reason==='duplicate_example'));
assert.throws(()=>buildLearningDataset({...input,targetId:undefined})); assert.throws(()=>buildLearningDataset({...input,splitDates:{random:true}}));
assert.equal(buildLearningDataset({...input,examples:[],labels:[]}).coverage.total,0);
console.log('learning-dataset: PASS');
module.exports={pair,input};
