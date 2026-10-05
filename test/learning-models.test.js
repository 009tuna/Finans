'use strict';
const assert=require('node:assert/strict');
const {fitMacroBias,fitPriceRidge,predictModel}=require('../src/learning-models');
const {example}=require('./learning-fixtures');
function dataset(kind='macro') {
 const cohort=kind==='macro'?'macro/NFP/thousand_jobs/system/macro-features-v1':example().cohort;
 const targetId=kind==='macro'?'NFP:first-release':'price-return-90d';
 const splitDates={validationStart:'2024-01-01T00:00:00Z',testStart:'2025-01-01T00:00:00Z'};
 const make=(count,year)=>Array.from({length:count},(_,i)=>{
   const date=new Date(Date.UTC(year,0,1+i)).toISOString(), available=new Date(Date.UTC(year,0,2+i)).toISOString();
   const features=kind==='macro'?{rawEstimate:100+i}:{return21:i,return63:1,return126:1,atrPct:1,rsi14:50,distanceSma50Atr:1,distanceSma200Atr:1};
   const e=example({id:year+':'+i,kind,cohort,createdAt:date,knowledgeCutoff:date,sourceObservedAt:date,featureSchemaVersion:kind==='macro'?'macro-features-v1':'price-features-v1',features,unit:'thousand_jobs',reference:{barDate:date.slice(0,10),currency:'USD',priceBasis:'raw'}});
   return {example:e,label:{id:'l:'+e.id,exampleId:e.id,cohort,targetId,value:kind==='macro'?95+i:i*2+1,unit:kind==='macro'?'thousand_jobs':'percent_return',availableAt:available,effectiveAt:available,createdAt:available,observedAt:available},eventId:e.id,decisionDate:date.slice(0,10),predictionAt:date};
 });
 return {cohort,targetId,asOf:'2026-01-01T00:00:00Z',datasetId:'dataset',fitFingerprint:'fingerprint',splitDates,train:make(kind==='macro'?12:120,2023),validation:make(kind==='macro'?3:30,2024),test:make(kind==='macro'?3:30,2025)};
}
const m=dataset(), fit=fitMacroBias({dataset:m}); assert.equal(fit.status,'candidate'); assert.equal(fit.artifact.correction,-5);
assert.equal(predictModel({artifact:fit.artifact,example:m.test[0].example}).estimate,95);
assert.equal(predictModel({artifact:{...fit.artifact,correction:-200},example:m.test[0].example}).estimate,-100);
const shock=structuredClone(m);shock.test.forEach(r=>r.label.value=-10000);assert.equal(fitMacroBias({dataset:shock}).artifact.correction,-5);
const leak=structuredClone(m);leak.train[0].label.availableAt='2025-01-01T00:00:00Z';assert.equal(fitMacroBias({dataset:leak}).status,'invalid_dataset');
const price=dataset('price'),ridge=fitPriceRidge({dataset:price});assert.equal(ridge.status,'candidate');assert.deepEqual(ridge.artifact.featureNames,['return21']);assert.ok(predictModel({artifact:ridge.artifact,example:price.test[5].example}).estimate>10);
assert.equal(ridge.artifact.means[0],59.5);
assert.equal(predictModel({artifact:ridge.artifact,example:{...price.test[0].example,cohort:'other'}}).status,'abstain');
const tie=dataset('price');for(const rows of [tie.train,tie.validation,tie.test]) for(const r of rows) {r.example.features.return21=1;r.label.value=2;}
assert.equal(fitPriceRidge({dataset:tie}).artifact.lambda,100);
const overflow=dataset('price');overflow.train[1].example.features.return21=1e308;assert.equal(fitPriceRidge({dataset:overflow}).status,'numerical_failure');
console.log('learning-models: PASS'); module.exports={dataset};
