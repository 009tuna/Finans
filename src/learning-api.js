'use strict';
const {readLearningRecords}=require('./learning-store');
const {evaluateForecasts}=require('./learning-evaluation');
const PROJECTION_KEY='learning:projection:v1';
async function handleLearning({method},{database=require('./db'),asOf=new Date().toISOString(),readFresh=false}={}) {
 if(method!=='GET')return {status:405,body:{error:'Method not allowed'}};
 try {
   if(!readFresh) {
     const cached=await database.getCache(PROJECTION_KEY,{strict:true});
     if(cached) {
       const value=cached.value;
       if(value?.schemaVersion!==1||!value.counts||!Array.isArray(value.cohorts)||!Array.isArray(value.models)||!Number.isFinite(Date.parse(value.asOf)))throw Error('corrupt learning projection');
       if(Date.parse(value.asOf)<=Date.parse(asOf))return {status:200,body:{...value,requestedAt:asOf,projectionRecordedAt:value.asOf}};
     }
   }
   const {records,exclusions}=await readLearningRecords({asOf},database);
   const examples=records.filter(r=>r.type==='example').map(r=>r.record),labels=records.filter(r=>r.type==='label').map(r=>r.record),candidates=records.filter(r=>r.type==='modelEvent'&&r.record.status==='candidate').map(r=>r.record),forecasts=records.filter(r=>r.type==='run'&&r.record.recordType==='shadowForecast'&&r.record.mode==='forward_shadow').map(r=>r.record);
   const validLabels=labels.filter(l=>Date.parse(l.availableAt)<=Date.parse(asOf)&&l.eligibility.status==='eligible'),matured=new Set(validLabels.map(l=>l.exampleId));
   const excluded=examples.filter(e=>e.eligibility.status==='ineligible');
   const cohorts=[...new Set(examples.map(e=>e.cohort))].sort().map(cohort=>{const rows=examples.filter(e=>e.cohort===cohort);return {cohort,kind:rows[0].kind,unit:rows[0].unit||'percent_return',examples:rows.length,matured:rows.filter(e=>matured.has(e.id)).length,excluded:rows.filter(e=>e.eligibility.status==='ineligible').length,distinctDates:new Set(rows.map(e=>e.period||e.reference?.barDate||e.createdAt.slice(0,10))).size};});
   const models=candidates.map(c=>{
     const frozen=forecasts.filter(f=>f.modelId===c.modelId),baseline=frozen.map(f=>({...f,id:'baseline:'+f.id,estimate:f.baselineEstimate}));
     const cumulative=evaluateForecasts({forecasts:frozen,labels:validLabels,baselineForecasts:baseline,asOf}),recentFrom=new Date(Date.parse(asOf)-90*86400000).toISOString();
     const recent=evaluateForecasts({forecasts:frozen,labels:validLabels.filter(l=>l.availableAt>=recentFrom),baselineForecasts:baseline,asOf});
     const compact=m=>({n:m.n,distinctEvents:m.distinctEvents,distinctDates:m.distinctDates,mae:m.mae,signedBias:m.signedBias,pairedN:m.paired.n,improvement:m.paired.improvement});
     return {modelId:c.modelId,cohort:c.cohort,kind:c.kind,targetId:c.artifact.targetId,unit:c.artifact.unit,status:'shadow',availableAt:c.artifact.availableAt,datasetId:c.artifact.datasetId,policyVersion:c.policy.version,cumulative:compact(cumulative),recent:compact(recent),recentWindowDays:90};
   });
   const reasonCounts={};for(const e of excluded)for(const reason of e.eligibility.reasons)reasonCounts[reason]=(reasonCounts[reason]||0)+1;
   return {status:200,body:{schemaVersion:1,status:examples.length?'collecting':'awaiting_evidence',asOf,lastRecordedAt:records.length?records.map(r=>r.record.createdAt).sort().at(-1):null,
     recordCount:records.length,counts:{examples:examples.length,matured:matured.size,labels:validLabels.length,pending:examples.filter(e=>e.eligibility.status==='eligible'&&!matured.has(e.id)).length,excluded:excluded.length,models:models.length},cohorts,models,activeModel:null,exclusions:{futureRecords:exclusions.length,reasons:reasonCounts},policy:'shadow-only',measurement:'forecast_error',limitations:['Fiyat değişimi tahmini işlem başarısı veya net getiri değildir.','Kanıtlanmamış borsa seans takvimi ve fiyat temeli için sonuç etiketi bekler.']}};
 } catch(_){return {status:503,body:{status:'unavailable',error:'Öğrenme kayıtları okunamadı; önceki kayıtlar korunuyor.'}};}
}
async function writeLearningProjection({database=require('./db'),asOf,collectionStatus}) {
  const result=await handleLearning({method:'GET'},{database,asOf,readFresh:true});
  if(result.status!==200)throw Error('learning projection failed');
  if(collectionStatus)result.body.collectionStatus={status:collectionStatus.status,checkedAt:collectionStatus.checkedAt,sourceStatuses:collectionStatus.sourceStatuses||null,conflicts:collectionStatus.conflicts||0};
  const {updateStore}=require('./intelligence-store');
  await updateStore(PROJECTION_KEY,{schemaVersion:1,asOf:'1970-01-01T00:00:00Z'},current=>Date.parse(current.asOf)>Date.parse(asOf)||current.asOf===asOf&&current.recordCount>result.body.recordCount?current:result.body,database);
  return result.body;
}
module.exports={handleLearning,writeLearningProjection,PROJECTION_KEY};
