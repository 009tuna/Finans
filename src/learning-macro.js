'use strict';
const {canonicalHash,validateLearningExample}=require('./learning-contract');
const {METRICS}=require('./cpi-sources');
const METRIC_UNITS=new Map([['us_nonfarm_payroll_change','thousand_jobs'],...METRICS.map(m=>[m.metric,m.unit])]);
const time=v=>typeof v==='string'?Date.parse(v):NaN;
const hash=v=>/^[a-f0-9]{64}$/i.test(v||'');
function official(proof) { try {const u=new URL(proof.sourceUrl);return u.protocol==='https:'&&u.hostname==='www.bls.gov'&&hash(proof.contentHash)&&Number.isFinite(time(proof.observedAt));}catch(_){return false;} }
function collectMacroExamples({macroPayload,asOf,frozenExamples=[]}) {
  const cutoff=time(asOf); if(!Number.isFinite(cutoff)) throw Error('invalid asOf');
  const examples=[],labels=[],exclusions=[],seen=new Set();
  const families=[macroPayload,...(macroPayload.families?.us_cpi?[macroPayload.families.us_cpi]:[])];
  for(const family of families) {
    const surfaces=family.metrics?.length?family.metrics:[family];
    for(const surface of surfaces) {
      const entries=[...(surface.forecasts||[]).map(f=>({f,model:false})),...(surface.modelForecasts||[]).map(f=>({f,model:true}))].sort((a,b)=>time(a.f.createdAt||a.f.recordedAt)-time(b.f.createdAt||b.f.recordedAt)||String(a.f.id||a.f.forecastId).localeCompare(String(b.f.id||b.f.forecastId)));
      for(const {f,model} of entries) {
        const metric=f.metric||surface.metric,unit=f.unit,method=model?'model:'+String(f.model||f.modelId||f.methodId||'research-v1'):f.methodId;
        const raw=f.estimate??f.pointEstimate, createdAt=f.createdAt||f.recordedAt,knowledgeCutoff=f.knowledgeCutoff;
        if(!METRIC_UNITS.has(metric)||METRIC_UNITS.get(metric)!==unit || !Number.isFinite(raw)||!method||!Number.isFinite(time(createdAt))||!Number.isFinite(time(knowledgeCutoff))||time(createdAt)>cutoff||!/^\d{4}-\d\d$/.test(f.period||'')) {exclusions.push({id:f.id||f.forecastId||null,reason:'invalid_macro_record'});continue;}
        const event=(family.events||[]).find(e=>e.period===f.period && (e.metric===metric||e.eventId==='us_cpi:'+f.period));
        const scheduledAt=event?.scheduledAt||f.scheduledAt;
        const cohort=['macro',metric,unit,method,'macro-features-v1'].join('/'), businessId='macro:'+cohort+':'+f.period;
        if(seen.has(businessId)) {exclusions.push({id:f.id||f.forecastId,reason:'duplicate_event_method'});continue;} seen.add(businessId);
        const reasons=[];
        const copiedSchedule=(f.sourceEvidence||[]).find(p=>official(p)&&/\/schedule\//.test(p.sourceUrl)&&time(p.observedAt)<=time(knowledgeCutoff));
        const firstCut=frozenExamples.find(e=>e.id===businessId);
        const frozenSchedule=f.scheduleContentHash ? {sourceUrl:f.scheduleSourceUrl,contentHash:f.scheduleContentHash,observedAt:f.scheduleObservedAt} : f.scheduleProof||firstCut?.scheduleProof||copiedSchedule||event;
        if(!event||!official(frozenSchedule)||event.scheduleConflict||event.scheduleVerification==='model-cited-web-research'||time(frozenSchedule.observedAt)>time(knowledgeCutoff)||time(knowledgeCutoff)>time(createdAt)||time(createdAt)>=time(scheduledAt)||f.scheduledAt&&time(f.scheduledAt)!==time(scheduledAt)) reasons.push('unverified_pre_release_schedule');
        if(f.contested||f.chronologyStatus==='unverified'||f.provenanceIssues?.length) reasons.push('contested_forecast');
        const provenance=(family.forecastProvenance||[]).find(p=>p.forecastId===(f.forecastId||f.id));
        const proofs=f.inputProof||f.sourceEvidence||((f.inputVerificationIds||provenance?.inputVerificationIds||[]).map(id=>(family.sourceVerifications||[]).find(p=>p.id===id)));
        if(!Array.isArray(proofs)||!proofs.length||proofs.some(p=>!p||!official(p)||time(p.observedAt)>time(knowledgeCutoff)||Number.isFinite(time(p.publishedAt))&&time(p.publishedAt)>time(knowledgeCutoff))) reasons.push('input_proof_not_verified');
        const validProofs=Array.isArray(proofs)?proofs.filter(p=>p&&official(p)):[];
        const sourceObservedAt=new Date(Math.min(time(knowledgeCutoff),Math.max(time(frozenSchedule?.observedAt)||0,...validProofs.map(p=>time(p.observedAt)),0))).toISOString();
        const evidence={forecastId:f.id||f.forecastId,rawEstimate:raw,metric,unit,period:f.period,method,scheduledAt:scheduledAt||null,scheduleHash:frozenSchedule?.contentHash||null,inputHashes:validProofs.map(p=>p.contentHash)};
        const scheduleProof=official(frozenSchedule)?{sourceUrl:frozenSchedule.sourceUrl,contentHash:frozenSchedule.contentHash,observedAt:frozenSchedule.observedAt}:null;
        const example={schemaVersion:1,id:businessId,kind:'macro',cohort,createdAt,knowledgeCutoff,sourceObservedAt,featureSchemaVersion:'macro-features-v1',features:{rawEstimate:raw},evidenceHash:canonicalHash(evidence),eligibility:{status:reasons.length?'ineligible':'eligible',reasons},eventId:metric+':'+f.period,targetId:metric+':first-release',period:f.period,metric,unit,methodId:method,scheduledAt:scheduledAt||null,scheduleProof,evidenceGrade:reasons.length?'unverified':'independent_official'};
        validateLearningExample(example); examples.push(example);
        if(reasons.length) continue;
        const outcomes=(model?surface.modelOutcomes:surface.outcomes)||[];
        const matches=outcomes.filter(o=>o.forecastId===(f.id||f.forecastId)||!o.forecastId&&o.eventId===f.eventId && (!o.methodId||o.methodId===f.methodId));
        const o=matches[0]; if(!o) continue;
        const actual=(family.observations||[]).find(a=>a.id!=null&&o.actualId!=null&&a.id===o.actualId||a.metric===metric&&a.period===f.period&&a.vintage==='first_release'&&a.contentHash===o.contentHash)||o;
        const value=actual.value??actual.actual, recorded=o.resolvedAt||o.recordedAt;
        if(!official(actual)||actual.vintage!=='first_release'||actual.metric!==metric||actual.unit!==unit||actual.period!==f.period||actual.contested||!Number.isFinite(value)||time(actual.publishedAt)!==time(scheduledAt)||!Number.isFinite(time(recorded))||time(actual.observedAt)<time(actual.publishedAt)||matches.some(m=>Number.isFinite(m.actual??m.value)&&(m.actual??m.value)!==value)) {exclusions.push({id:businessId,reason:'first_release_proof_missing_or_conflicting'});continue;}
        const availableAt=new Date(Math.max(time(actual.publishedAt),time(actual.observedAt),time(recorded))).toISOString();
        if(time(availableAt)>cutoff) {exclusions.push({id:businessId,reason:'outcome_not_available'});continue;}
        labels.push({schemaVersion:1,id:'label:'+businessId+':'+example.targetId,kind:'macro',cohort,exampleId:businessId,targetId:example.targetId,eventId:example.eventId,createdAt:availableAt,availableAt,observedAt:actual.observedAt,effectiveAt:actual.publishedAt,value,unit,evidenceHash:canonicalHash({forecast:example.evidenceHash,actual:actual.contentHash}),eligibility:{status:'eligible',reasons:[]}});
      }
    }
  }
  return {examples,labels,exclusions};
}
module.exports={collectMacroExamples};
