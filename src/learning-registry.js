'use strict';
const {canonicalHash,instant,validateLearningExample}=require('./learning-contract');
const DEFAULT_POLICY=Object.freeze({version:'learning-shadow-v1',activation:'shadow-only',minIndependentEvents:30,minDistinctDates:20,minMeanImprovement:0});
function registerCandidate({artifact,evaluation,policy=DEFAULT_POLICY,createdAt}) {
 instant(createdAt);instant(artifact.availableAt);
 if(instant(artifact.availableAt)>instant(createdAt)||!artifact.modelId||!artifact.targetId)throw Error('candidate availability invalid');
 return {schemaVersion:1,id:'candidate:'+artifact.modelId,kind:artifact.kind,cohort:artifact.cohort,createdAt,status:'candidate',modelId:artifact.modelId,artifact,evaluation,policy,policyHash:canonicalHash(policy)};
}
function freezeShadowForecast({modelId,artifact,example,prediction,createdAt}) {
 validateLearningExample(example);
 if(!artifact||artifact.modelId!==modelId||artifact.cohort!==example.cohort||prediction.status!=='available'||!Number.isFinite(prediction.estimate))throw Error('invalid shadow task');
 const recorded=instant(createdAt),cutoff=instant(example.knowledgeCutoff),available=instant(artifact.availableAt);
 const forward=available<=cutoff && recorded>=cutoff && recorded-cutoff<=3600000 && (!example.scheduledAt||recorded<instant(example.scheduledAt));
 const baselineEstimate=example.kind==='macro'?example.features.rawEstimate:0;
 return {schemaVersion:1,id:'forecast:'+modelId+':'+example.id+':'+artifact.targetId,recordType:'shadowForecast',kind:example.kind,cohort:example.cohort,modelId,exampleId:example.id,targetId:artifact.targetId,createdAt,knowledgeCutoff:example.knowledgeCutoff,modelAvailableAt:artifact.availableAt,mode:forward?'forward_shadow':'replay',estimate:prediction.estimate,baselineEstimate,decisionDate:example.period||example.reference?.barDate||example.createdAt.slice(0,10),evidenceHash:example.evidenceHash};
}
function assessPromotion({candidate,incumbent=null,pairedShadowResults=[],policy=DEFAULT_POLICY,asOf}) {
 const cutoff=instant(asOf),reasons=[],seen=new Set(),rows=[];
 if(canonicalHash(policy)!==candidate.policyHash)reasons.push('policy_changed_after_forecast');
 if(candidate.artifact.testUsage!=='final_assessment')reasons.push('final_test_reused');
 for(const r of pairedShadowResults) {
   if(seen.has(r.key))continue;seen.add(r.key);
   if(r.mode!=='forward_shadow'||r.modelId!==candidate.modelId||r.cohort!==candidate.cohort||r.targetId!==candidate.artifact.targetId||!Number.isFinite(Date.parse(r.availableAt))||Date.parse(r.availableAt)>cutoff||!Number.isFinite(r.improvement)||!Number.isFinite(r.candidateError)||!Number.isFinite(r.baselineError))continue;
   rows.push(r);
 }
 const independent=new Map();for(const r of rows){const list=independent.get(r.eventId)||[];list.push(r.improvement);independent.set(r.eventId,list);}
 const blocks=[...independent.values()].map(v=>v.reduce((s,x)=>s+x,0)/v.length),mean=blocks.length?blocks.reduce((s,x)=>s+x,0)/blocks.length:null;
 const evidence={n:rows.length,independentEvents:blocks.length,distinctDates:new Set(rows.map(r=>r.date)).size,meanImprovement:mean,uncertainty:'dependence-aware forward uncertainty not yet established'};
 if(incumbent&&incumbent.cohort!==candidate.cohort)reasons.push('incumbent_task_mismatch');
 if(reasons.length)return {status:'blocked',reasons,evidence};
 if(blocks.length<policy.minIndependentEvents||evidence.distinctDates<policy.minDistinctDates)return {status:'insufficient_evidence',reasons:['forward_sample_insufficient'],evidence};
 if(mean<=policy.minMeanImprovement)return {status:'not_improved',reasons:['baseline_not_beaten'],evidence};
 // V1 never authorizes activation from sample counts or a positive mean alone.
 return {status:'shadow_only',reasons:['activation_policy_shadow_only','forward_uncertainty_required'],evidence};
}
function applyModelEvent({registry,event}) {
 if(!registry||!Array.isArray(registry.events)||!['candidate','shadow','active','retired'].includes(event.status))throw Error('invalid registry event');
 const old=registry.events.find(e=>e.id===event.id);
 if(old){if(canonicalHash(old)!==canonicalHash(event))throw Error('identity_conflict');return registry;}
 if(event.status==='active')throw Error('shadow-only policy forbids activation in v1');
 if(event.status!=='candidate'&&!registry.events.some(e=>e.modelId===event.modelId&&e.status==='candidate'))throw Error('candidate missing');
 return {...registry,events:[...registry.events,event].sort((a,b)=>instant(a.createdAt)-instant(b.createdAt)||a.id.localeCompare(b.id))};
}
module.exports={registerCandidate,freezeShadowForecast,assessPromotion,applyModelEvent,DEFAULT_POLICY};
