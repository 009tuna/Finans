'use strict';
const {canonicalHash,instant}=require('./learning-contract');
const {appendLearningRecords,readLearningRecords,readLearningIdentity}=require('./learning-store');
const {buildSignalExample}=require('./learning-features');
const {resolvePriceLabel,addCalendarDays}=require('./learning-labels');
const {collectMacroExamples}=require('./learning-macro');
const {buildLearningDataset}=require('./learning-dataset');
const {fitMacroBias,fitPriceRidge,predictModel}=require('./learning-models');
const {registerCandidate,freezeShadowForecast,DEFAULT_POLICY}=require('./learning-registry');
const {evaluateForecasts}=require('./learning-evaluation');
function semanticExample(e) { const {createdAt,knowledgeCutoff,sourceObservedAt,...semantic}=e; return canonicalHash(semantic); }
async function preserveExample(example,database) {
 const existing=await readLearningIdentity('example',example.id,database);
 if(existing) {
   if(semanticExample(existing)!==semanticExample(example))return {status:'conflict',example:existing};
   // Also completes a previous shard/catalog interruption with the FIRST payload.
   await appendLearningRecords({examples:[existing]},database); return {status:'existing',example:existing};
 }
 try {await appendLearningRecords({examples:[example]},database);return {status:'appended',example};}
 catch(e){if(e.code!=='identity_conflict')throw e;const won=await readLearningIdentity('example',example.id,database);if(won&&semanticExample(won)===semanticExample(example)){await appendLearningRecords({examples:[won]},database);return {status:'existing',example:won};}return {status:'conflict',example:won};}
}
async function freezeForCandidates(examples,database,asOf,records) {
 const candidates=records.filter(r=>r.type==='modelEvent'&&r.record.status==='candidate').map(r=>r.record);
 let frozen=0;
 for(const e of examples) for(const c of candidates) {
   if(e.cohort!==c.cohort||e.eligibility.status!=='eligible'||instant(c.artifact.availableAt)>instant(e.knowledgeCutoff))continue;
   const prediction=predictModel({artifact:c.artifact,example:e});if(prediction.status!=='available')continue;
   const id='forecast:'+c.modelId+':'+e.id+':'+c.artifact.targetId;
   const old=await readLearningIdentity('run',id,database);
   if(old){await appendLearningRecords({runs:[old]},database);continue;}
   const forecast=freezeShadowForecast({modelId:c.modelId,artifact:c.artifact,example:e,prediction,createdAt:asOf});
   await appendLearningRecords({runs:[forecast]},database);if(forecast.mode==='forward_shadow')frozen++;
 }
 return frozen;
}
async function captureLearningSnapshot({snapshot,sourceSeriesByKey,createdAt=snapshot.generatedAt,database=require('./db')}) {
 const summary={status:'available',appended:0,existing:0,conflicts:0,ineligible:0,shadowForecasts:0,checkedAt:createdAt},captured=[];
 try {
   for(const market of ['us','bist','crypto']) for(const asset of snapshot[market]||[]) {
     const {example}=buildSignalExample({asset:{...asset,market},sourceSeries:sourceSeriesByKey[market+':'+asset.symbol],createdAt,knowledgeCutoff:createdAt,marketRegime:snapshot.marketRegime?.[market]?.regime});
     const result=await preserveExample(example,database);summary[result.status==='conflict'?'conflicts':result.status]++;
     if(result.example?.eligibility.status==='ineligible')summary.ineligible++;
     if(result.status!=='conflict')captured.push(result.example);
   }
   const {records}=await readLearningRecords({asOf:createdAt},database);
   summary.shadowForecasts=await freezeForCandidates(captured,database,createdAt,records);
   if(summary.conflicts||summary.ineligible)summary.status='partial';
 } catch(_){summary.status='unavailable';summary.errorCode='learning_capture_failed';}
 snapshot.learning={...summary};return summary;
}
async function defaultHistory(example,asOf) {
 const {fetchAssetChart}=require('./chart-data'),{completedChartHistory}=require('./daily-history');
 const market=example.cohort.split('/')[0];
 const chart=await fetchAssetChart({market,symbol:example.source.symbol,interval:'1d',range:'2y',limit:1000});
 const completed=completedChartHistory(chart,market,instant(asOf)),observedAt=chart.observedAt||chart.technicalData?.fetchedAt;
 const observations=completed.bars.map(b=>({date:b.date,close:b.close,completed:true,effectiveAt:new Date(Date.parse(b.date+'T00:00:00Z')+86400000-1).toISOString(),observedAt,currency:completed.currency,priceBasis:example.reference.priceBasis,evidenceHash:canonicalHash({provider:chart.source,date:b.date,close:b.close,observedAt})}));
 // A continuous Binance UTC calendar proves expected sessions; Yahoo bars alone
 // cannot prove exchange holidays, missing sessions or corporate-action coverage.
 let coverage=null;
 if(market==='crypto' && chart.technicalData?.calendar?.provider==='binance') {
   const startDate=observations[0]?.date,endDate=observations.at(-1)?.date;
   if(startDate&&endDate){const sessionDates=[];for(let d=startDate;d<=endDate;d=addCalendarDays(d,1))sessionDates.push(d);coverage={verified:true,startDate,endDate,sessionDates,observedAt,provider:example.source.provider,symbol:example.source.symbol,currency:completed.currency,priceBasis:example.reference.priceBasis,evidenceHash:canonicalHash({calendar:chart.technicalData.calendar,startDate,endDate,observedAt})};}
 }
 return {observations,coverage};
}
async function refreshLearning({database=require('./db'),asOf=new Date().toISOString(),fetchHistory=defaultHistory,train=false,macroPayload,splitDates}={}) {
 instant(asOf);const summary={status:'available',checkedAt:asOf,macroExamples:0,newLabels:0,pending:0,unresolved:0,excluded:0,conflicts:0,candidates:0,shadowForecasts:0,training:[]};
 const initial=await readLearningRecords({asOf},database);
 if(!macroPayload) {
   const ledger=(await require('./research-ledger').readLedger(database)).value;
   macroPayload=await require('./macro-store').getMacroPayload({database,researchLedger:ledger,now:asOf});
   if(macroPayload.status==='unavailable'||macroPayload.families?.us_cpi?.sourceStatus?.status==='unavailable')summary.status='partial';
 }
 const imported=collectMacroExamples({macroPayload,asOf});summary.excluded+=imported.exclusions.length;
 const captured=[];
 for(const e of imported.examples){const saved=await preserveExample(e,database);if(saved.status==='conflict'){summary.conflicts++;continue;}captured.push(saved.example);summary.macroExamples++;}
 for(const label of imported.labels){const old=await readLearningIdentity('label',label.id,database);await appendLearningRecords({labels:[old||label]},database);if(!old)summary.newLabels++;}
 const all=(await readLearningRecords({asOf},database)).records,examples=all.filter(r=>r.type==='example').map(r=>r.record),labels=all.filter(r=>r.type==='label').map(r=>r.record),history=new Map();
 const known=new Set(labels.map(l=>l.id));
 for(const e of examples.filter(e=>e.kind==='price'&&e.eligibility.status==='eligible')) for(const horizonDays of [90,180]) {
   const id='label:'+e.id+':price-return-'+horizonDays+'d';if(known.has(id))continue;
   if(addCalendarDays(e.reference.barDate,horizonDays)>asOf.slice(0,10)){summary.pending++;continue;}
   const key=e.cohort;
   if(!history.has(key))history.set(key,Promise.resolve().then(()=>fetchHistory(e,asOf)).catch(()=>null));
   const data=await history.get(key);if(!data){summary.unresolved++;continue;}
   const resolved=resolvePriceLabel({example:e,...data,horizonDays,asOf});
   if(resolved.label){const old=await readLearningIdentity('label',id,database);await appendLearningRecords({labels:[old||resolved.label]},database);labels.push(old||resolved.label);known.add(id);if(!old)summary.newLabels++;}
   else summary[resolved.status==='excluded'?'excluded':resolved.status==='pending'?'pending':'unresolved']++;
 }
 summary.shadowForecasts=await freezeForCandidates(captured,database,asOf,initial.records);
 if(train) {
   const tasks=new Map();for(const l of labels)tasks.set(l.cohort+'|'+l.targetId,{cohort:l.cohort,targetId:l.targetId});
   for(const task of tasks.values()) {
     const eligible=examples.filter(e=>e.cohort===task.cohort&&e.eligibility.status==='eligible'),times=[...new Set(eligible.map(e=>e.knowledgeCutoff))].sort();
     if(times.length<3){summary.training.push({...task,status:'insufficient_sample'});continue;}
     const dates=splitDates||{validationStart:times[Math.floor(times.length*.6)],testStart:times[Math.floor(times.length*.8)]};
     const dataset=buildLearningDataset({examples:eligible,labels,...task,asOf,splitDates:dates});
     if(all.some(r=>r.type==='modelEvent'&&r.record.artifact?.fitFingerprint===dataset.fitFingerprint)){summary.training.push({...task,status:'unchanged_dataset'});continue;}
     const fit=(eligible[0].kind==='macro'?fitMacroBias:fitPriceRidge)({dataset});summary.training.push({...task,status:fit.status});if(!fit.artifact)continue;
     const forecasts=dataset.test.map(r=>({id:'test:'+r.example.id,exampleId:r.example.id,cohort:task.cohort,targetId:task.targetId,estimate:predictModel({artifact:fit.artifact,example:r.example}).estimate,createdAt:r.predictionAt,decisionDate:r.decisionDate}));
     const baselineForecasts=forecasts.map(f=>({...f,id:'baseline:'+f.id,estimate:eligible[0].kind==='macro'?dataset.test.find(r=>r.example.id===f.exampleId).example.features.rawEstimate:0}));
     const evaluation=evaluateForecasts({forecasts,labels:dataset.test.map(r=>r.label),baselineForecasts,asOf});
     const event=registerCandidate({artifact:fit.artifact,evaluation,policy:DEFAULT_POLICY,createdAt:asOf});await appendLearningRecords({modelEvents:[event]},database);summary.candidates++;
   }
 }
 if(summary.conflicts||summary.unresolved||summary.excluded)summary.status='partial';return summary;
}
module.exports={captureLearningSnapshot,refreshLearning,defaultHistory,semanticExample};
