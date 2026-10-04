'use strict';
const {readStore,updateStore}=require('./intelligence-store');
const {METRICS,archiveUrl,createCpiSource}=require('./cpi-sources');
const {METHODS,forecastFor,scorecards,valid}=require('./cpi-events');
const {BLS_FORECAST_POLICIES,forecastReviews,policyForForecast,validateBlsForecastPolicy,forecastKey}=require('./research-ledger');
const KEY='cpi_event_ledger_v1';
const initial={schemaVersion:1,events:[],observations:[],forecasts:[],outcomes:[],correctionReviews:[],sourceStatus:{status:'not_initialized'},updatedAt:null};
const time=Date.parse;
const CPI_MODEL_FIELDS=Object.freeze(Object.fromEntries(METRICS.map(metric=>{
 const policy=Object.values(BLS_FORECAST_POLICIES||{}).find(item=>item.metric===metric.metric);
 return [metric.metric,policy?.field];
})));
const validSchedule=(event,cutoff)=>event && /^us_cpi:\d{4}-(0[1-9]|1[0-2])$/.test(event.eventId) && event.eventId==='us_cpi:'+event.period && Number.isFinite(time(event.scheduledAt)) && event.sourceUrl==='https://www.bls.gov/schedule/news_release/cpi.htm' && /^[a-f0-9]{64}$/i.test(event.contentHash||'') && Number.isFinite(time(event.observedAt)) && time(event.observedAt)<=time(cutoff);
const iso=value=>new Date(typeof value==='function'?value():value===undefined?Date.now():value).toISOString();
function verifiedForecast(forecast) {
 if(forecast.id!==forecast.metric+':'+forecast.period+':'+forecast.methodId||!Object.values(METHODS).includes(forecast.methodId)||!Array.isArray(forecast.inputProof))return false;
 const derived=forecastFor({period:forecast.period,metric:forecast.metric},forecast.methodId,forecast.inputProof,forecast.knowledgeCutoff);
 return derived.status==='frozen'&&derived.estimate===forecast.estimate&&JSON.stringify(derived.inputIds)===JSON.stringify(forecast.inputIds)&&JSON.stringify(derived.inputHashes)===JSON.stringify(forecast.inputHashes)&&forecast.inputProof.every(row=>valid(row)&&time(row.observedAt)<=time(forecast.knowledgeCutoff));
}
async function refreshCpi({database,source,now}={}) {
 const requested=iso(now),src=source||createCpiSource(),saved=(await readStore(KEY,initial,database)).value;
 let schedule=[],fresh=[],failures=[];
 try {schedule=await src.getSchedule();} catch(error) {failures.push({scope:'schedule',errorCode:error.message||'source_unavailable'});}
 const due=(schedule.length?schedule:saved.events).filter(e=>time(e.scheduledAt)<=time(requested)&&!e.scheduleConflict).sort((a,b)=>time(b.scheduledAt)-time(a.scheduledAt)).slice(0,4);
 for(const event of due) {
  try {
   const release=await src.getFirstRelease(event,requested);
   if(!release.available) {failures.push({scope:event.eventId,errorCode:release.reason||'release_unavailable'});continue;}
   if(release.period!==event.period||time(release.publishedAt)!==time(event.scheduledAt)) {failures.push({scope:event.eventId,errorCode:'release_period_or_publication_mismatch'});continue;}
   for(const metric of METRICS) {
    const observation={...metric,id:metric.metric+':'+release.period+':first_release',period:release.period,value:release.values?.[metric.metric],vintage:'first_release',publishedAt:release.publishedAt,observedAt:release.observedAt,sourceUrl:release.sourceUrl,contentHash:release.contentHash};
    if(valid(observation)) fresh.push(observation);
    else failures.push({scope:event.eventId,metric:metric.metric,errorCode:'missing_or_invalid_metric_proof'});
   }
  } catch(error) {failures.push({scope:event.eventId,errorCode:error.message||'source_unavailable'});}
 }
 const completed=iso(now);
 for(const event of schedule)if(!validSchedule(event,completed))failures.push({scope:event.eventId||'schedule',errorCode:'invalid_schedule_proof'});
 fresh=fresh.filter(row=>{if(time(row.observedAt)<=time(completed))return true;failures.push({scope:row.id,errorCode:'acquisition_after_refresh_clock'});return false;});
 const result=await updateStore(KEY,initial,current=>{
  const events=new Map(current.events.map(row=>[row.eventId,row]));
  for(const event of schedule) {
   if(!validSchedule(event,completed))continue;
   const old=events.get(event.eventId);
   if(old && time(old.observedAt)>time(event.observedAt))continue;
   events.set(event.eventId,old&&time(old.scheduledAt)!==time(event.scheduledAt)?{...old,scheduleConflict:{observedScheduledAt:event.scheduledAt,detectedAt:completed}}:{...old,...event});
  }
  const observations=[...current.observations],correctionReviews=[...current.correctionReviews];
  for(const row of fresh) {
   const old=observations.find(item=>item.id===row.id);
   if(!old) observations.push(row);
   else if(old.value!==row.value||old.contentHash!==row.contentHash) {
    if(!correctionReviews.some(review=>review.conflictWith===old.id&&review.incoming.contentHash===row.contentHash&&review.incoming.value===row.value))correctionReviews.push({incoming:row,conflictWith:old.id,detectedAt:completed});
   }
  }
  const contested=new Set(correctionReviews.map(review=>review.conflictWith));
  const forecasts=[...current.forecasts],outcomes=[...current.outcomes];
  const eligible=observations.map(row=>({...row,contested:contested.has(row.id)}));
  const future=[...events.values()].filter(event=>time(event.scheduledAt)>time(completed)&&!event.scheduleConflict&&validSchedule(event,completed)).sort((a,b)=>time(a.scheduledAt)-time(b.scheduledAt));
  for(const event of future.slice(0,1))for(const metric of METRICS)for(const methodId of Object.values(METHODS)) {
   const prediction=forecastFor({...event,metric:metric.metric},methodId,eligible,completed),fid=metric.metric+':'+event.period+':'+methodId;
   if(prediction.status==='frozen'&&!forecasts.some(row=>row.id===fid))forecasts.push({...prediction,id:fid,eventId:event.eventId,metric:metric.metric,methodId,period:event.period,createdAt:completed,knowledgeCutoff:completed});
  }
  for(const event of events.values()) {
   if(time(event.scheduledAt)>time(completed)||event.scheduleConflict)continue;
   for(const forecast of forecasts.filter(row=>row.eventId===event.eventId&&row.period===event.period&&row.status==='frozen'&&row.unit==='percent'&&Number.isFinite(row.estimate)&&time(row.knowledgeCutoff)<=time(row.createdAt)&&time(row.createdAt)<time(event.scheduledAt)&&verifiedForecast(row))) {
    const actual=observations.find(row=>row.metric===forecast.metric&&row.period===event.period&&row.unit===forecast.unit&&valid(row)&&time(row.publishedAt)===time(event.scheduledAt)&&time(row.observedAt)<=time(completed));
    if(actual&&!contested.has(actual.id)&&!forecast.inputIds?.some(id=>contested.has(id))&&!outcomes.some(row=>row.forecastId===forecast.id))outcomes.push({forecastId:forecast.id,actualId:actual.id,eventId:event.eventId,metric:forecast.metric,methodId:forecast.methodId,unit:forecast.unit,actual:actual.value,error:actual.value-forecast.estimate,errorUnit:'percentage_point',errorConvention:'actual_minus_estimate',resolvedAt:completed,acquiredAt:actual.observedAt});
   }
  }
  const status={status:failures.length?(events.size?'partial':'unavailable'):correctionReviews.length||[...events.values()].some(event=>event.scheduleConflict)?'partial':'available',auditRequired:Boolean(correctionReviews.length||[...events.values()].some(event=>event.scheduleConflict)),checkedAt:completed,failures,lastSuccessfulAt:failures.length?current.sourceStatus.lastSuccessfulAt||null:completed};
  return {...current,events:[...events.values()],observations,forecasts,outcomes,correctionReviews,updatedAt:time(current.updatedAt)>time(completed)?current.updatedAt:completed,sourceStatus:time(current.sourceStatus.checkedAt)>time(completed)?current.sourceStatus:status};
 },database);
 return {status:result.sourceStatus.status,events:result.events.length,observations:result.observations.length,forecasts:result.forecasts.length,outcomes:result.outcomes.length,failures:result.sourceStatus.failures};
}
const hasTime=value=>Number.isFinite(time(value));
const clone=value=>value==null?value:structuredClone(value);
function runFor(ledger,record) {
 const runs=ledger?.runs||[];
 if(record?.runId)return runs.find(run=>run.runId===record.runId)||null;
 let key=null;
 try { key=forecastKey(record); } catch (_) { return null; }
 if(!key||record?.id!==key)return null;
 return runs.find(run=>Array.isArray(run.forecastIds)&&run.forecastIds.includes(key)
   ||(run.research?.forecasts||[]).some(item=>item&&item.id===key))||null;
}
function rawRunForecast(run,record) {
 return run?.research?.forecasts?.find(item=>item && record && item.metric===record.metric && item.unit===record.unit && item.period===record.period && item.pointEstimate===record.pointEstimate) || null;
}
function modelCutoff(record,run) {
 const raw=rawRunForecast(run,record);
 const explicit=[record?.knowledgeCutoff,raw?.knowledgeCutoff].find(value=>hasTime(value));
 if(explicit && record?.knowledgeCutoffBasis!=='research_analysis_as_of')return {value:explicit,basis:record?.knowledgeCutoffBasis||raw?.knowledgeCutoffBasis||'recorded_forecast'};
 if(hasTime(raw?.knowledgeCutoff)&&raw?.knowledgeCutoffBasis!=='research_analysis_as_of')return {value:raw.knowledgeCutoff,basis:raw.knowledgeCutoffBasis||'recorded_forecast'};
 if(hasTime(run?.research?.generatedAt))return {value:run.research.generatedAt,basis:'research_generated_at'};
 if(hasTime(run?.recordedAt))return {value:run.recordedAt,basis:'run_recorded_at'};
 if(hasTime(record?.recordedAt))return {value:record.recordedAt,basis:'recorded_forecast'};
 if(hasTime(record?.createdAt))return {value:record.createdAt,basis:'recorded_forecast'};
 return {value:null,basis:'unknown'};
}
function sourceEvidenceFor(record,run) {
 const own=Array.isArray(record?.sourceEvidence)?record.sourceEvidence:[];
 if(own.length)return own.map(clone);
 const ids=new Set(Array.isArray(record?.sourceIds)?record.sourceIds:[]);
 return (run?.research?.sources||[]).filter(source=>ids.has(source.id)).map(clone);
}
function validCpiModelRecord(record,event,ledger,now,review=false) {
 if(!record||!event||record.market!=='us'||record.symbol!=='')return null;
 const metric=METRICS.find(item=>item.metric===record.metric),policy=policyForForecast(record),field=CPI_MODEL_FIELDS[record.metric];
 if(!metric||!policy||policy.metric!==record.metric||record.unit!=='percent'||record.period!==event.period||time(record.scheduledAt)!==time(event.scheduledAt)||record.resolution?.provider!=='bls-first-release'||record.resolution?.field!==field||record.resolution?.sourceUrl!==archiveUrl(event.scheduledAt.slice(0,10))||!Number.isFinite(record.pointEstimate))return null;
 if(review!==true&&record.reviewOnly===true)return null;
 if(review===true&&record.reviewOnly!==true)return null;
 const run=runFor(ledger,record);
 if(record.runId&&!run)return null;
 const cutoff=modelCutoff(record,run),created=record.recordedAt||record.createdAt;
 const release=time(event.scheduledAt),at=time(now);
 if(!hasTime(created)||!hasTime(cutoff.value)||time(created)>=release||time(created)>at||time(cutoff.value)>=release||time(cutoff.value)>at||time(cutoff.value)>time(created))return null;
 const evidence=sourceEvidenceFor(record,run);
 if(!evidence.length)return null;
 const evidenceOk=evidence.every(source=>source&&typeof source.url==='string'&&(source.publishedAt===null||(hasTime(source.publishedAt)&&time(source.publishedAt)<=time(cutoff.value))));
 const hasDatedNumeric=evidence.some(source=>source&&hasTime(source.publishedAt)&&time(source.publishedAt)<=time(cutoff.value));
 let policyOk=false;
 try { policyOk=validateBlsForecastPolicy(record,new Map(evidence.map(source=>[source.id,source])),cutoff.value); } catch (_) { policyOk=false; }
 if(!evidenceOk||!hasDatedNumeric||!policyOk)return null;
 return {record,run,cutoff,evidence,metric};
}
function projectCpiModelRecord(item,event,kind) {
 const record=clone(item.record),researchEventId=record.eventId;
 return {...record,eventId:event.eventId,researchEventId,knowledgeCutoff:item.cutoff.value,knowledgeCutoffBasis:item.cutoff.basis,sourceUrl:record.sourceUrl||record.resolution?.sourceUrl,sourceEvidence:clone(item.evidence),sourceVerification:record.sourceVerification||item.run?.research?.sourceVerification||null,modelRecordKind:kind};
}
function validCpiModelOutcome(outcome,forecast,event,actual,now) {
 if(!outcome||!forecast||!event||!actual||outcome.forecastId!==forecast.id||outcome.metric!==forecast.metric||outcome.unit!=='percent'||outcome.period!==event.period||!Number.isFinite(outcome.value)||outcome.value!==actual.value||outcome.verification!=='bls-official-first-release'||outcome.vintage!=='first_release'||outcome.sourceUrl!==actual.sourceUrl||outcome.contentHash!==actual.contentHash||!/^[a-f0-9]{64}$/i.test(outcome.contentHash||'')||!hasTime(outcome.publishedAt)||time(outcome.publishedAt)!==time(event.scheduledAt)||!hasTime(outcome.observedAt)||time(outcome.observedAt)<time(outcome.publishedAt)||time(outcome.observedAt)>time(now)||!valid(actual)||actual.period!==event.period||time(actual.publishedAt)!==time(event.scheduledAt)||time(actual.observedAt)>time(now))return false;
 if(outcome.sourceUrl!==archiveUrl(event.scheduledAt.slice(0,10)))return false;
 return true;
}
function modelExclusionReason(record,event,ledger,now,review=false) {
 if(!event)return 'event_period_or_schedule_mismatch';
 if(review&&record.reviewOnly!==true)return 'review_marker_missing';
 if(!review&&record.reviewOnly===true)return 'review_record_in_frozen_set';
 const metric=METRICS.find(item=>item.metric===record.metric),policy=policyForForecast(record),field=CPI_MODEL_FIELDS[record.metric];
 if(!metric||!policy||policy.metric!==record.metric||record.unit!=='percent'||record.period!==event.period||time(record.scheduledAt)!==time(event.scheduledAt)||record.resolution?.provider!=='bls-first-release'||record.resolution?.field!==field||record.resolution?.sourceUrl!==archiveUrl(event.scheduledAt.slice(0,10))||!Number.isFinite(record.pointEstimate))return 'typed_metric_period_field_or_archive_mismatch';
 const run=runFor(ledger,record);
 if(record.runId&&!run)return 'missing_recorded_run_provenance';
 const cutoff=modelCutoff(record,run),created=record.recordedAt||record.createdAt,at=time(now),release=time(event.scheduledAt);
 if(!hasTime(created)||!hasTime(cutoff.value))return 'missing_timestamped_creation_or_cutoff';
 if(time(created)>=release||time(created)>at||time(cutoff.value)>=release||time(cutoff.value)>at||time(cutoff.value)>time(created))return 'post_release_or_future_cutoff';
 const evidence=sourceEvidenceFor(record,run);
 if(!evidence.length)return 'missing_copied_source_evidence';
 if(!evidence.some(source=>source&&hasTime(source.publishedAt)&&time(source.publishedAt)<=time(cutoff.value)))return 'missing_prior_dated_numeric_evidence';
 return 'source_policy_or_calendar_evidence_mismatch';
}
function modelScorecard(outcomes,metric) {
 const rows=outcomes.filter(row=>row.metric===metric&&!row.contested&&Number.isFinite(row.error));
 if(!rows.length)return {n:0,sampleSize:0,mae:null,bias:null,errorUnit:'percentage_point',errorConvention:'actual_minus_estimate',status:'insufficient_sample'};
 return {n:rows.length,sampleSize:rows.length,mae:rows.reduce((sum,row)=>sum+Math.abs(row.error),0)/rows.length,bias:rows.reduce((sum,row)=>sum+row.error,0)/rows.length,errorUnit:'percentage_point',errorConvention:'actual_minus_estimate',status:'descriptive_only'};
}
function scenarioKey(scenario,event) { return [event.eventId,scenario.condition||'',scenario.impact||'',scenario.invalidation||'',scenario.horizon||'',scenario.market||'',scenario.symbol||''].join('|'); }
function projectModelScenarios(ledger,forecasts,reviews,events,now) {
 const publication=ledger?.publication,publicationRunId=publication?.ai?.runId,publicationRun=(ledger.runs||[]).find(run=>run.runId===publicationRunId)||null,publicationResearch=publication?.ai?.research,currentResearch=publicationRun?.research||{};
 const scenarios=Array.isArray(publicationResearch?.scenarios)?publicationResearch.scenarios:Array.isArray(currentResearch.scenarios)?currentResearch.scenarios:[];
 if(!publicationRunId||!scenarios.length)return [];
 const sourceList=Array.isArray(publicationResearch?.sources)&&publicationResearch.sources.length?publicationResearch.sources:(Array.isArray(currentResearch.sources)?currentResearch.sources:[]),byKey=new Map();
 for(const scenario of scenarios) {
  const currentRunForecasts=(currentResearch.forecasts||[]).filter(item=>item&&item.eventId===scenario.eventId&&item.market===scenario.market&&item.symbol===scenario.symbol&&(!scenario.metric||scenario.metric===item.metric)&&(!scenario.unit||scenario.unit===item.unit));
  const matches=currentRunForecasts.flatMap(raw=>{
   const event=events.find(candidate=>candidate.period===raw.period&&time(candidate.scheduledAt)===time(raw.scheduledAt)&&candidate.eventId==='us_cpi:'+candidate.period);
   const timedRaw={...raw,runId:publicationRunId,recordedAt:publicationRun?.recordedAt,createdAt:publicationRun?.recordedAt,knowledgeCutoff:publicationRun?.research?.generatedAt||publicationRun?.recordedAt};
   if(!event||!validCpiModelRecord(timedRaw,event,ledger,now,false))return [];
   const review=reviews.find(item=>item.runId===publicationRunId&&item.researchEventId===scenario.eventId&&item.metric===raw.metric&&item.period===raw.period);
   const frozen=forecasts.find(item=>item.researchEventId===scenario.eventId&&item.metric===raw.metric&&item.period===raw.period);
   return review||frozen?[review||frozen]:[];
  });
  if(!matches.length)continue;
  const event=events.find(candidate=>candidate.eventId===matches[0].eventId);
  if(!event)continue;
  const key=scenarioKey(scenario,event),refs=matches.map(item=>({metric:item.metric,metricId:item.metric,unit:item.unit,period:item.period,pointEstimate:item.pointEstimate,referenceEstimate:item.pointEstimate,referenceKind:item.reviewOnly?'current_model_opinion':'frozen_forecast',forecastId:item.id,runId:item.runId}));
  const existing=byKey.get(key);
  if(existing) { const seen=new Set(existing.references.map(item=>item.metric)); for(const ref of refs)if(!seen.has(ref.metric))existing.references.push(ref); existing.metricIds=[...new Set(existing.references.map(item=>item.metric))]; continue; }
  const sources=sourceList.filter(source=>Array.isArray(scenario.sourceIds)&&scenario.sourceIds.includes(source.id)&&typeof source.url==='string').map(clone);
  if(!sources.length)continue;
  const first=refs.length===1?refs[0]:null;
  byKey.set(key,{...clone(scenario),researchEventId:scenario.eventId,eventId:event.eventId,period:event.period,metricIds:refs.map(item=>item.metric),references:refs,referenceEstimate:first?first.referenceEstimate:null,referenceKind:first?first.referenceKind:'shared_cpi_event',sourceEvidence:sources,runId:publicationRunId});
 }
 return [...byKey.values()];
}
function cpiPayload(value,now,researchLedger={}) {
 const source=value||initial,at=iso(now),contested=new Set((source.correctionReviews||[]).map(row=>row.conflictWith));
 const forecasts=(source.forecasts||[]).map(row=>({...row,contested:row.inputIds?.some(id=>contested.has(id))||Boolean((source.events||[]).find(e=>e.eventId===row.eventId)?.scheduleConflict)}));
 const outcomes=(source.outcomes||[]).map(row=>({...row,contested:contested.has(row.actualId)||Boolean(forecasts.find(f=>f.id===row.forecastId)?.contested)}));
 const next=(source.events||[]).filter(e=>time(e.scheduledAt)>time(at)).sort((a,b)=>time(a.scheduledAt)-time(b.scheduledAt))[0]||null;
 const eventList=(source.events||[]).filter(event=>event&&event.eventId&&event.period&&hasTime(event.scheduledAt));
 const allModelForecasts=[],allModelReviews=[],modelForecastExclusions=[],modelReviewExclusions=[];
 for(const record of researchLedger?.forecasts||[]) {
   const isCpi=METRICS.some(metric=>metric.metric===record.metric); if(!isCpi)continue;
   const event=eventList.find(candidate=>candidate.period===record.period&&time(candidate.scheduledAt)===time(record.scheduledAt)&&candidate.eventId==='us_cpi:'+candidate.period);
   if(!event){modelForecastExclusions.push({id:record.id||null,metric:record.metric,period:record.period||null,reason:'event_period_or_schedule_mismatch'});continue;}
   const item=validCpiModelRecord(record,event,researchLedger,at,false);
   if(item)allModelForecasts.push(projectCpiModelRecord(item,event,'frozen_forecast'));
   else modelForecastExclusions.push({id:record.id||null,metric:record.metric,period:record.period,reason:modelExclusionReason(record,event,researchLedger,at,false)});
 }
 let rawReviews=[];
 try {rawReviews=forecastReviews(researchLedger||{});} catch (_) {rawReviews=[];}
 for(const record of rawReviews) {
  if(!METRICS.some(metric=>metric.metric===record?.metric))continue;
  const event=eventList.find(candidate=>candidate.period===record.period&&time(candidate.scheduledAt)===time(record.scheduledAt)&&candidate.eventId==='us_cpi:'+candidate.period);
   if(!event){modelReviewExclusions.push({id:record.id||null,metric:record.metric,period:record.period||null,reason:'event_period_or_schedule_mismatch'});continue;}
   const item=validCpiModelRecord(record,event,researchLedger,at,true);
   if(item&&allModelForecasts.some(forecast=>forecast.id===record.originalForecastId))allModelReviews.push(projectCpiModelRecord(item,event,'review'));
   else if(item)modelReviewExclusions.push({id:record.id||null,metric:record.metric,period:record.period,reason:'original_forecast_not_projected'});
 }
 const originalById=new Map(allModelForecasts.map(item=>[item.id,item])),contestedActualIds=new Set((source.correctionReviews||[]).map(item=>item.conflictWith)),modelOutcomes=[];
 for(const outcome of researchLedger?.outcomes||[]) {
  const forecast=originalById.get(outcome.forecastId); if(!forecast)continue;
  const event=eventList.find(candidate=>candidate.eventId===forecast.eventId);
  const actual=(source.observations||[]).find(row=>row.metric===forecast.metric&&row.period===event?.period&&valid(row)&&time(row.publishedAt)===time(event.scheduledAt)&&Number.isFinite(row.value)&&row.value===outcome.value&&row.contentHash===outcome.contentHash);
  if(!validCpiModelOutcome(outcome,{...forecast,id:outcome.forecastId},event,actual,at))continue;
  const contestedOutcome=Boolean(outcome.contested||event.scheduleConflict||(actual&&contestedActualIds.has(actual.id))||(outcome.actualId&&contestedActualIds.has(outcome.actualId)));
  modelOutcomes.push({...clone(outcome),eventId:event.eventId,metric:forecast.metric,unit:'percent',period:event.period,forecastId:forecast.id,actual:outcome.value,error:outcome.value-forecast.pointEstimate,errorUnit:'percentage_point',errorConvention:'actual_minus_estimate',contested:contestedOutcome});
 }
 const modelScenarios=projectModelScenarios(researchLedger,allModelForecasts,allModelReviews,eventList,at);
 const modelForecastByMetric=id=>allModelForecasts.filter(item=>item.metric===id);
 const modelReviewByMetric=id=>allModelReviews.filter(item=>item.metric===id);
 const modelOutcomeByMetric=id=>modelOutcomes.filter(item=>item.metric===id);
 return {family:'us_cpi',nextEvent:next?{eventId:next.eventId,period:next.period,scheduledAt:next.scheduledAt,scheduleConflict:next.scheduleConflict||null}:null,metrics:METRICS.map(metric=>({...metric,status:next?.scheduleConflict?'schedule_conflict':'available',previousFirstRelease:(source.observations||[]).filter(row=>row.metric===metric.metric&&valid(row)&&!contested.has(row.id)&&time(row.observedAt)<=time(at)).sort((a,b)=>b.period.localeCompare(a.period))[0]||null,forecasts:forecasts.filter(row=>row.metric===metric.metric),outcomes:outcomes.filter(row=>row.metric===metric.metric),scorecards:scorecards(outcomes,metric.metric),consensus:null,consensusStatus:{status:'not_connected'},modelForecasts:modelForecastByMetric(metric.metric),modelForecastReviews:modelReviewByMetric(metric.metric),modelOutcomes:modelOutcomeByMetric(metric.metric),modelScorecard:modelScorecard(modelOutcomeByMetric(metric.metric),metric.metric),modelForecastExclusions:modelForecastExclusions.filter(row=>row.metric===metric.metric),modelReviewExclusions:modelReviewExclusions.filter(row=>row.metric===metric.metric),calibration:{status:'insufficient_sample'},methodAbstentions:next?Object.values(METHODS).map(methodId=>({methodId,...forecastFor({...next,metric:metric.metric},methodId,(source.observations||[]).map(row=>({...row,contested:contested.has(row.id)})),at)})).filter(row=>row.status!=='frozen'):[]})),events:source.events||[],sourceStatus:source.sourceStatus,observations:source.observations||[],proof:(source.observations||[]).map(row=>({id:row.id,sourceUrl:row.sourceUrl,publishedAt:row.publishedAt,observedAt:row.observedAt,contentHash:row.contentHash})),correctionReviews:source.correctionReviews||[],modelForecasts:allModelForecasts,modelForecastReviews:allModelReviews,modelOutcomes,modelScenarios,modelForecastExclusions,modelReviewExclusions};
}
async function getCpiPayload({database,now,researchLedger}={}) {return cpiPayload((await readStore(KEY,initial,database)).value,now,researchLedger||{});}
module.exports={KEY,initial,refreshCpi,getCpiPayload,cpiPayload,CPI_MODEL_FIELDS,validCpiModelRecord};



