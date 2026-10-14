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
const TEMPORAL_FIELDS=new Set(['createdAt','knowledgeCutoff','sourceObservedAt']);
const FIELD_REASONS={reference:'reference_changed',features:'features_changed',evidenceHash:'source_evidence_changed',eligibility:'eligibility_changed',marketRegime:'market_regime_changed',candidate:'candidate_context_changed'};
function semanticExample(e) { const {createdAt,knowledgeCutoff,sourceObservedAt,...semantic}=e; return canonicalHash(semantic); }
function exampleDifference(original,incoming) {
 const fields=[...new Set([...Object.keys(original),...Object.keys(incoming)])].filter(k=>!TEMPORAL_FIELDS.has(k)).sort().filter(k=>canonicalHash(Object.hasOwn(original,k)?{value:original[k]}:{})!==canonicalHash(Object.hasOwn(incoming,k)?{value:incoming[k]}:{}));
 const reasons=[...new Set(fields.map(k=>FIELD_REASONS[k]||'other_semantic_change'))];
 const knownCandidate=c=>c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['strategyVersion','reason'].includes(k)&&typeof c[k]==='string');
 const unknownCandidate=fields.includes('candidate')&&(!knownCandidate(original.candidate)||!knownCandidate(incoming.candidate));
 if(unknownCandidate&&!reasons.includes('other_semantic_change'))reasons.push('other_semantic_change');
 const blocking=unknownCandidate||fields.some(k=>!['marketRegime','candidate','evidenceHash'].includes(k));
 const classification=blocking?(fields.includes('eligibility')?'eligibility_change':fields.some(k=>['reference','features'].includes(k))?'source_revision':'unclassified_change'):fields.includes('evidenceHash')?'evidence_change':'context_change';
 return {fields,reasons,blocking,classification};
}
function evidenceSummary(evidence) {
 if(!evidence||!Array.isArray(evidence.bars))return null;
 const hash=canonicalHash(evidence);
 return {barCount:evidence.bars.length,firstBarDate:evidence.bars[0]?.date||null,lastBarDate:evidence.bars.at(-1)?.date||null,evidenceHash:hash,cacheKey:'learning:evidence:v1:'+hash};
}
function verifiedEvidence(row,hash) {
 if(!row)return null;
 if(!row.revision||row.value?.schemaVersion!==1||row.value.evidenceHash!==hash||canonicalHash(row.value.evidence)!==hash)throw Error('corrupt learning evidence');
 return row.value.evidence;
}
function evidenceDifference(original,incoming) {
 if(!original||!incoming)return null;
 const before=new Map(original.bars.map(b=>[b.date,b])),after=new Map(incoming.bars.map(b=>[b.date,b]));
 const changes=[],valueFields=['close','high','low','volume'];let numericBarChanges=0,metadataBarChanges=0;
 for(const [date,b] of before){const a=after.get(date);if(!a)continue;const fields=[...valueFields,'sourceTimestamp'].filter(k=>canonicalHash(b[k]??null)!==canonicalHash(a[k]??null));if(!fields.length)continue;if(fields.some(k=>valueFields.includes(k)))numericBarChanges++;if(fields.includes('sourceTimestamp'))metadataBarChanges++;if(changes.length<10)changes.push({date,fields});}
 return {originalBarCount:before.size,incomingBarCount:after.size,addedBars:[...after.keys()].filter(d=>!before.has(d)).length,removedBars:[...before.keys()].filter(d=>!after.has(d)).length,numericBarChanges,metadataBarChanges,changes,limit:10};
}
async function preserveEvidence(evidence,hash,database) {
 if(!evidence)return;
 if(canonicalHash(evidence)!==hash)throw Error('learning evidence hash mismatch');
 // Keep full source cuts out of the all-record catalog and never truncate a
 // body while claiming its original hash. Current Yahoo/Binance inputs fit.
 if(evidence.bars.length>512||Buffer.byteLength(JSON.stringify(evidence),'utf8')>131072)throw Error('learning evidence capacity exceeded');
 const key='learning:evidence:v1:'+hash;
 for(let attempt=0;attempt<3;attempt++){
   if(verifiedEvidence(await database.getCache(key,{strict:true}),hash))return;
   try{await database.compareAndSetCache(key,{schemaVersion:1,evidenceHash:hash,evidence},null);}
   catch(e){if(e.statusCode===409)continue;throw e;}
   if(!verifiedEvidence(await database.getCache(key,{strict:true}),hash))throw Error('learning evidence write verification failed');
   return;
 }
 throw Error('learning evidence CAS retry exhausted');
}
async function preserveObservation(record,database) {
 const old=await readLearningIdentity('run',record.id,database);
 if(old){await appendLearningRecords({runs:[old]},database);return 'existing';}
 try{await appendLearningRecords({runs:[record]},database);return 'appended';}
 catch(e){if(e.code!=='identity_conflict')throw e;const won=await readLearningIdentity('run',record.id,database);if(!won)throw e;await appendLearningRecords({runs:[won]},database);return 'existing';}
}
async function preserveExample(example,database,{observedAt=example.createdAt,evidence=null}={}) {
 await preserveEvidence(evidence,example.evidenceHash,database);
 const existing=await readLearningIdentity('example',example.id,database);
 if(existing) {
   // Always complete an interrupted catalog write with the FIRST payload.
   await appendLearningRecords({examples:[existing]},database);
   if(semanticExample(existing)===semanticExample(example))return {status:'existing',example:existing};
   instant(observedAt);if(instant(observedAt)<instant(existing.createdAt))throw Error('observation precedes frozen example');
   const difference=exampleDifference(existing,example),incomingHash=semanticExample(example);
   // Macro proof changes can affect label provenance even when the estimate is
   // identical. The nonblocking evidence-only rule is specific to price cuts.
   if(existing.kind!=='price'&&difference.fields.includes('evidenceHash')){difference.blocking=true;if(difference.classification==='evidence_change')difference.classification='unclassified_change';}
   const originalEvidence=existing.kind==='price'?verifiedEvidence(await database.getCache('learning:evidence:v1:'+existing.evidenceHash,{strict:true}),existing.evidenceHash):null;
   const evidenceComparison=evidenceDifference(originalEvidence,evidence);
   if(evidenceComparison?.numericBarChanges){difference.blocking=true;if(difference.classification!=='eligibility_change')difference.classification='source_revision';difference.reasons.push('source_bar_values_changed');}
   const observation={schemaVersion:1,id:'observation:'+canonicalHash({exampleId:example.id,incomingHash}),recordType:'exampleObservation',kind:existing.kind,cohort:existing.cohort,exampleId:existing.id,createdAt:observedAt,
     classification:difference.classification,blocking:difference.blocking,reasons:difference.reasons,changedFields:difference.fields.slice(0,16),changedFieldCount:difference.fields.length,
     originalHash:semanticExample(existing),incomingHash,originalEvidenceHash:existing.evidenceHash,incomingEvidenceHash:example.evidenceHash,
     originalFeatureHash:canonicalHash(existing.features),incomingFeatureHash:canonicalHash(example.features),
     originalReference:existing.reference||null,incomingReference:example.reference||null,incomingEvidence:evidenceSummary(evidence),evidenceComparison,
     comparisonLimit:existing.kind!=='price'?'source_evidence_body_not_recorded':originalEvidence?null:'original_evidence_body_not_recorded',incomingExample:example};
   const observationStatus=await preserveObservation(observation,database);
   return {status:difference.blocking?'conflict':'existing',example:existing,observation,observationStatus};
 }
 try {await appendLearningRecords({examples:[example]},database);return {status:'appended',example};}
 catch(e){if(e.code!=='identity_conflict')throw e;return preserveExample(example,database,{observedAt,evidence});}
}
function observationCounters(){return {contextChanges:0,evidenceChanges:0,sourceRevisions:0,eligibilityChanges:0,unclassifiedChanges:0,observationsAppended:0,observationsExisting:0,reasonCounts:{}};}
function countObservation(summary,result) {
 if(!result.observation)return;
 const keys={context_change:'contextChanges',evidence_change:'evidenceChanges',source_revision:'sourceRevisions',eligibility_change:'eligibilityChanges',unclassified_change:'unclassifiedChanges'};
 summary[keys[result.observation.classification]]++;
 summary[result.observationStatus==='appended'?'observationsAppended':'observationsExisting']++;
 for(const reason of result.observation.reasons)summary.reasonCounts[reason]=(summary.reasonCounts[reason]||0)+1;
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
 const scopeMarkets=['us','bist','crypto'].filter(m=>Array.isArray(snapshot[m])&&snapshot[m].length);
 const summary={status:'available',appended:0,existing:0,conflicts:0,ineligible:0,shadowForecasts:0,checkedAt:createdAt,scope:{markets:scopeMarkets,assetCount:scopeMarkets.reduce((n,m)=>n+snapshot[m].length,0)},...observationCounters()},captured=[];
 try {
   for(const market of ['us','bist','crypto']) for(const asset of snapshot[market]||[]) {
     const {example,evidence}=buildSignalExample({asset:{...asset,market},sourceSeries:sourceSeriesByKey[market+':'+asset.symbol],createdAt,knowledgeCutoff:createdAt,marketRegime:snapshot.marketRegime?.[market]?.regime});
     const result=await preserveExample(example,database,{observedAt:createdAt,evidence});summary[result.status==='conflict'?'conflicts':result.status]++;countObservation(summary,result);
     if(example.eligibility.status==='ineligible'||result.example?.eligibility.status==='ineligible')summary.ineligible++;
     if(result.status!=='conflict')captured.push(result.example);
   }
   const {records}=await readLearningRecords({asOf:createdAt},database);
   summary.shadowForecasts=await freezeForCandidates(captured,database,createdAt,records);
   if(summary.conflicts||summary.ineligible)summary.status='partial';
   await require('./learning-api').writeLearningProjection({database,asOf:createdAt,collectionStatus:summary});
 } catch(_){summary.status='unavailable';summary.errorCode='learning_capture_failed';}
 snapshot.learning={...summary};return summary;
}
async function defaultHistory(example,asOf,{live=false}={}) {
 const {fetchAssetChart}=require('./chart-data'),{completedChartHistory}=require('./daily-history');
 const market=example.cohort.split('/')[0];
 const chart=await fetchAssetChart({market,symbol:example.source.symbol,interval:'1d',range:'2y',limit:1000});
 const observedAt=chart.observedAt||chart.technicalData?.fetchedAt;
 const completed=completedChartHistory(chart,market,instant(live?observedAt:asOf));
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
async function refreshLearning({database=require('./db'),asOf,clock=()=>new Date().toISOString(),live=asOf==null,fetchHistory=defaultHistory,train=false,macroPayload,splitDates}={}) {
 asOf=asOf||clock();
 instant(asOf);const summary={status:'available',checkedAt:asOf,macroExamples:0,newLabels:0,pending:0,unresolved:0,excluded:0,conflicts:0,candidates:0,shadowForecasts:0,training:[],...observationCounters()};
 const initial=await readLearningRecords({asOf},database);
 if(!macroPayload) {
   const ledger=(await require('./research-ledger').readLedger(database)).value;
   macroPayload=await require('./macro-store').getMacroPayload({database,researchLedger:ledger,now:asOf});
 }
 summary.sourceStatuses={nfp:macroPayload.storeStatus?.status||macroPayload.sourceStatus?.status||macroPayload.status||'unknown',cpi:macroPayload.families?.us_cpi?.sourceStatus?.status||'not_supplied'};
 if(Object.values(summary.sourceStatuses).some(s=>s==='unavailable'||s==='partial'))summary.status='partial';
 const imported=collectMacroExamples({macroPayload,asOf,frozenExamples:initial.records.filter(r=>r.type==='example').map(r=>r.record)});summary.excluded+=imported.exclusions.length;
 const captured=[],conflictedExamples=new Set();
 for(const e of imported.examples){const saved=await preserveExample(e,database,{observedAt:asOf});countObservation(summary,saved);if(saved.status==='conflict'){summary.conflicts++;conflictedExamples.add(e.id);continue;}captured.push(saved.example);summary.macroExamples++;}
 for(const label of imported.labels){if(conflictedExamples.has(label.exampleId))continue;const old=await readLearningIdentity('label',label.id,database);await appendLearningRecords({labels:[old||label]},database);if(!old)summary.newLabels++;}
 const all=(await readLearningRecords({asOf},database)).records,examples=all.filter(r=>r.type==='example').map(r=>r.record),labels=all.filter(r=>r.type==='label').map(r=>r.record),history=new Map();
 const known=new Set(labels.map(l=>l.id));
 for(const e of examples.filter(e=>e.kind==='price'&&e.eligibility.status==='eligible')) for(const horizonDays of [90,180]) {
   const id='label:'+e.id+':price-return-'+horizonDays+'d';if(known.has(id))continue;
   if(addCalendarDays(e.reference.barDate,horizonDays)>asOf.slice(0,10)){summary.pending++;continue;}
   const key=e.cohort;
   if(!history.has(key))history.set(key,Promise.resolve().then(()=>fetchHistory(e,asOf,{live})).catch(()=>null));
   const data=await history.get(key);if(!data){summary.unresolved++;continue;}
   const resolutionAt=live?clock():asOf;
   const resolved=resolvePriceLabel({example:e,...data,horizonDays,asOf:resolutionAt});
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
     const reusedTest=all.some(r=>r.type==='modelEvent'&&r.record.artifact?.finalTestIds?.some(id=>fit.artifact.finalTestIds.includes(id)));
     const artifact=reusedTest?{...fit.artifact,testUsage:'final_assessment_reused'}:fit.artifact;
     const event=registerCandidate({artifact,evaluation,policy:DEFAULT_POLICY,createdAt:asOf});await appendLearningRecords({modelEvents:[event]},database);summary.candidates++;
   }
 }
 if(summary.conflicts||summary.unresolved||summary.excluded)summary.status='partial';
 summary.checkedAt=live?clock():asOf;
 await require('./learning-api').writeLearningProjection({database,asOf:summary.checkedAt,collectionStatus:summary});
 return summary;
}
module.exports={captureLearningSnapshot,refreshLearning,defaultHistory,semanticExample};
