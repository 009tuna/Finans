'use strict';
const {instant}=require('./learning-contract');
const pairKey=r=>[r.cohort,r.exampleId,r.targetId].join('|');
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
function median(a) {if(!a.length)return null;const sorted=a.toSorted((x,y)=>x-y),m=Math.floor(a.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;}
function evaluateForecasts({forecasts=[],labels=[],baselineForecasts=[],asOf}) {
 const cutoff=instant(asOf), exclusions=[],errors=[],pairs=[],dates=new Set(),events=new Set(),seen=new Set();
 const matched=new Map(),baselines=new Map();
 for(const l of labels) {const key=pairKey(l),list=matched.get(key)||[];list.push(l);matched.set(key,list);}
 for(const b of baselineForecasts) {const key=pairKey(b);if(baselines.has(key))baselines.set(key,null);else baselines.set(key,b);}
 for(const f of forecasts) {
   const key=pairKey(f);if(seen.has(key)){exclusions.push({id:f.id,reason:'duplicate_forecast'});continue;}seen.add(key);
   const ls=matched.get(key)||[],l=ls[0];
   if(ls.length!==1||!Number.isFinite(f.estimate)||!Number.isFinite(l?.value)||!Number.isFinite(Date.parse(l?.availableAt))||Date.parse(l.availableAt)>cutoff||instant(f.createdAt)>cutoff){exclusions.push({id:f.id,reason:'unavailable_or_invalid_pair'});continue;}
   const residual=f.estimate-l.value;if(!Number.isFinite(residual)){exclusions.push({id:f.id,reason:'numerical_overflow'});continue;}
   errors.push(residual);dates.add(f.decisionDate||f.createdAt.slice(0,10));events.add(l.eventId||f.exampleId);
   const b=baselines.get(key);
   if(b&&Number.isFinite(b.estimate)&&instant(b.createdAt)<=instant(f.createdAt)) {
     const baselineError=Math.abs(b.estimate-l.value);if(Number.isFinite(baselineError))pairs.push({key,eventId:l.eventId||f.exampleId,date:f.decisionDate||f.createdAt.slice(0,10),candidateError:Math.abs(residual),baselineError,improvement:baselineError-Math.abs(residual)});
   }
 }
 return {n:errors.length,distinctDates:dates.size,distinctEvents:events.size,mae:mean(errors.map(Math.abs)),medianAbsoluteError:median(errors.map(Math.abs)),signedBias:mean(errors),errorConvention:'estimate_minus_actual',exclusions,
   paired:{n:pairs.length,improvement:mean(pairs.map(p=>p.improvement)),candidateMae:mean(pairs.map(p=>p.candidateError)),baselineMae:mean(pairs.map(p=>p.baselineError)),distinctDates:new Set(pairs.map(p=>p.date)).size,distinctEvents:new Set(pairs.map(p=>p.eventId)).size,results:pairs}};
}
module.exports={evaluateForecasts,pairKey};
