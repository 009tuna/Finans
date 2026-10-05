'use strict';
const {sma,atr}=require('./indicators');
const {roundTripCost}=require('./costs');
const {hash,ms,iso,expectedSessions}=require('./structural-data');
const STRATEGY='structural-long-v1';
const DEFAULTS=Object.freeze({minBars:220,structureWindow:252,pivotLeft:3,pivotRight:3,pivotSpacing:10,clusterAtr:.75,stopAtr:.25,zoneAtr:.75,touchAtr:.5,extensionAtr:3,maxStopFraction:.10,minNetRR:1.5,breakoutVolume:1.3,retestBars:10,cooldownBars:10,horizonDays:180,selection:'newest-trigger,B,nearest-root,setupId'});
function confirmedPivots(bars,config=DEFAULTS) {
  const result=[];
  for(let i=config.pivotLeft;i+config.pivotRight<bars.length;i++) for(const [type,field,sign] of [['support','low',-1],['resistance','high',1]]) {
    const price=bars[i][field]; let strict=true;
    for(let j=i-config.pivotLeft;j<=i+config.pivotRight;j++) if(j!==i && !(sign*price>sign*bars[j][field])) strict=false;
    if(strict) result.push({type,price,index:i,date:bars[i].date,confirmedIndex:i+config.pivotRight,confirmedAt:bars[i+config.pivotRight].barEndAt,id:hash([type,bars[i].date,price])});
  }
  return result;
}
function clusterLevels(pivots,atrValue,config=DEFAULTS) {
  const result=[];
  for(const type of ['support','resistance']) {
    const sorted=pivots.filter(p=>p.type===type).sort((a,b)=>a.price-b.price || a.confirmedIndex-b.confirmedIndex || a.index-b.index);
    for(let i=0;i<sorted.length;) {
      const group=[sorted[i++]];
      while(i<sorted.length && sorted[i].price-group[0].price<=config.clusterAtr*atrValue) group.push(sorted[i++]);
      if(group.length<2 || !group.some(a=>group.some(b=>Math.abs(a.index-b.index)>=config.pivotSpacing))) continue;
      const prices=group.map(p=>p.price), mid=Math.floor(group.length/2);
      result.push({id:hash(group.map(p=>p.id || [p.type,p.index,p.price])),type,lower:prices[0],upper:prices.at(-1),center:group.length%2?prices[mid]:(prices[mid-1]+prices[mid])/2,pivots:group,knownIndex:Math.max(...group.map(p=>p.confirmedIndex))});
    }
  }
  return result;
}
function netGate(entry,stop,target,costModel,minRR=DEFAULTS.minNetRR) {
  const factor=(1-costModel.roundTrip/2)**2;
  const reward=target/entry*factor-1, risk=1-stop/entry*factor;
  const netRR=risk>0?reward/risk:null;
  return {netTargetReturn:reward,netRisk: risk,netRR,pass:[entry,stop,target,factor].every(v=>Number.isFinite(v)&&v>0) && stop<entry && target>entry && reward>0 && netRR>=minRR};
}
function selectTarget(levels,zone,atrValue,excludedId=null,config=DEFAULTS) {
  const overhead=levels.filter(l=>l.type!=='support' && l.id!==excludedId && l.upper>zone[0]).sort((a,b)=>a.lower-b.lower || a.id.localeCompare(b.id))[0];
  if(!overhead) return {reason:'target-unverified'};
  if(overhead.lower<=zone[1] || overhead.lower-config.stopAtr*atrValue<=zone[1]) return {reason:'first-resistance-overlaps',resistance:overhead};
  return {target:overhead.lower-config.stopAtr*atrValue,resistance:overhead};
}
function evaluateSignal(observation,{config:overrides={}}={}) {
  const config={...DEFAULTS,...overrides};
  if(![90,180].includes(config.horizonDays)) throw new Error('structural horizon must be 90 or 180 days');
  const parameterHash=hash({strategy:STRATEGY,market:observation.market,config,costVersion:'market-costs-v1',roundTrip:roundTripCost(observation.market)});
  const watch=reasons=>({status:'watch',strategyVersion:STRATEGY,parameterHash,reasons:[...new Set(reasons)]});
  const cut=ms(observation.effectiveCutoffAt), generated=ms(observation.generationCutoffAt), observed=ms(observation.sourceObservedAt);
  if(!Number.isFinite(cut) || !Number.isFinite(observed) || !Number.isFinite(generated) || generated<observed || generated-observed>3600000) return watch(['source-stale-or-unverified']);
  if(observation.status!=='verified' || observation.reasons?.length) return watch(observation.reasons?.length?observation.reasons:['source-unverified']);
  const bars=observation.bars.filter(b=>b.completed===true && Number.isFinite(ms(b.barEndAt)) && ms(b.barEndAt)<=cut && ms(b.barStartAt)<=cut);
  if(bars.length<config.minBars) return watch(['history-under-220']);
  if(new Set(bars.map(b=>b.date)).size!==bars.length || bars.some((b,i)=>i && b.date<=bars[i-1].date)) return watch(['history-order-conflict']);
  if(bars.some(b=>!b.rangeVerified || !b.volumeVerified || !b.openVerified || ![b.open,b.close,b.high,b.low].every(v=>Number.isFinite(v)&&v>0) || b.low>Math.min(b.open,b.close) || b.high<Math.max(b.open,b.close))) return watch(['ohlcv-unverified']);
  const sessions=expectedSessions(observation,ms(bars[0].barStartAt)-1,cut);
  if(!sessions) return watch(['calendar-unverified']);
  const expected=sessions.filter(s=>ms(s.endAt)<=cut);
  if(expected.at(-1)?.date!==bars.at(-1).date || expected.some(s=>!bars.some(b=>b.date===s.date))) return watch(['completed-session-coverage-gap']);
  const closes=bars.map(b=>b.close), highs=bars.map(b=>b.high), lows=bars.map(b=>b.low), last=bars.at(-1), previous=bars.at(-2);
  const sma200=sma(closes,200),sma50=sma(closes,50),sma50Before=sma(closes.slice(0,-10),50),atrValue=atr(highs,lows,closes,14);
  if(![sma200,sma50,sma50Before,atrValue].every(v=>Number.isFinite(v)&&v>0)) return watch(['indicators-unverified']);
  if(!(last.close>sma200 && sma50>sma200 && sma50>sma50Before)) return watch(['trend-gate']);
  if(last.close-sma50>config.extensionAtr*atrValue || last.close-bars.at(-6).close>config.extensionAtr*atrValue) return watch(['extension-gate']);
  if(!(last.volume>0 && sma(bars.slice(0,-1).map(b=>b.volume),20)>0)) return watch(['volume-unverified']);
  const allPivots=confirmedPivots(bars,config),offset=Math.max(0,bars.length-config.structureWindow);
  const at=(index,referenceAtr)=>clusterLevels(allPivots.filter(p=>p.index>=Math.max(0,index+1-config.structureWindow) && p.confirmedIndex<=index),referenceAtr,config);
  const levels=clusterLevels(allPivots.filter(p=>p.index>=offset),atrValue,config),candidates=[],reasons=[];
  const costModel={version:'market-costs-v1',roundTrip:roundTripCost(observation.market),assumption:true};
  function candidate(setup,root,referenceAtr,referenceIndex,breakoutIndex=null) {
    const stop=root.lower-config.stopAtr*referenceAtr, zone=[root.upper,root.upper+config.zoneAtr*referenceAtr];
    if(!(last.low>=stop && last.low<=root.upper+config.touchAtr*referenceAtr && last.close>root.upper && last.close<=zone[1]) || (setup==='A' && !(last.close>previous.close))) return;
    const invalid=bars.some((b,i)=>i>root.knownIndex && i<(breakoutIndex==null?bars.length:breakoutIndex) && b.close<stop);
    if(invalid && setup==='A') {reasons.push('support-invalidated');return;}
    if(breakoutIndex!=null && bars.slice(breakoutIndex+1).some(b=>b.close<stop)) {reasons.push('breakout-invalidated');return;}
    const target=selectTarget(levels,zone,referenceAtr,setup==='B'?root.id:null,config);
    if(target.reason) {reasons.push(target.reason);return;}
    const gate=netGate(zone[1],stop,target.target,costModel,config.minNetRR);
    if((zone[1]-stop)/zone[1]>config.maxStopFraction || !gate.pass) {reasons.push('net-risk-reward-gate');return;}
    const setupId=hash({strategy:STRATEGY,parameterHash,market:observation.market,symbol:observation.symbol,setup,root:root.id,trigger:last.date,breakout:breakoutIndex==null?null:bars[breakoutIndex].date});
    candidates.push({status:'candidate',strategyVersion:STRATEGY,parameterHash,setupId,triggerDate:last.date,triggerIndex:bars.length-1,reasons:[],plan:{setup,entryZone:zone,stop,target:target.target,supportEvidence:root,resistanceEvidence:target.resistance,atrReference:{value:referenceAtr,date:bars[referenceIndex].date},horizonDays:config.horizonDays,currency:observation.currency,priceBasis:observation.priceBasis,sourceSymbol:observation.sourceSymbol,costModel,netRiskReward:gate.netRR,triggerDate:last.date,breakoutDate:breakoutIndex==null?null:bars[breakoutIndex].date}});
  }
  const support=levels.filter(l=>l.type==='support' && l.upper<last.close).sort((a,b)=>b.upper-a.upper || a.id.localeCompare(b.id))[0];
  if(support) candidate('A',support,atrValue,bars.length-1);
  for(let b=Math.max(21,bars.length-1-config.retestBars);b<bars.length-1;b++) {
    const prior=bars.slice(0,b), ref=atr(prior.map(x=>x.high),prior.map(x=>x.low),prior.map(x=>x.close),14);
    const avg=sma(prior.map(x=>x.volume),20);
    if(!(ref>0 && avg>0 && bars[b].volume>=config.breakoutVolume*avg)) continue;
    for(const root of at(b-1,ref).filter(l=>l.type==='resistance')) if(bars[b].close>root.upper+config.stopAtr*ref && bars[b-1].close<=root.upper+config.stopAtr*ref) candidate('B',root,ref,b-1,b);
  }
  candidates.sort((a,b)=>b.triggerDate.localeCompare(a.triggerDate) || b.plan.setup.localeCompare(a.plan.setup) || (last.close-a.plan.entryZone[0])-(last.close-b.plan.entryZone[0]) || a.setupId.localeCompare(b.setupId));
  return candidates[0] || watch(reasons.length?reasons:['no-structural-trigger']);
}
module.exports={STRATEGY,DEFAULTS,confirmedPivots,clusterLevels,netGate,selectTarget,evaluateSignal};
