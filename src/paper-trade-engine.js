'use strict';
const {DAY,hash,ms,iso,localDate,expectedSessions}=require('./structural-data');
const {STRATEGY,netGate}=require('./structural-signals');
const EXECUTION='observed-open-paper-v1', RESOLVER='structural-paper-resolver-v1';
const TERMINAL=new Set(['closed','missed-entry','expired-entry']);
const clone=value=>JSON.parse(JSON.stringify(value));
const barHash=b=>hash([b.date,b.open,b.high,b.low,b.close,b.volume,b.openVerified,b.rangeVerified]);
function event(record,type,identity,details={}) {
  const id=hash([record.id,type,identity]);
  if(!record.events.some(e=>e.id===id)) record.events.push({id,type,...details});
}
function makeRecord(signal,observation,signalCreatedAt) {
  if(signal.status!=='candidate' || !Number.isFinite(ms(signalCreatedAt))) throw new Error('accepted structural signal and timestamp required');
  const plan={...clone(signal.plan),entryExpiresAt:null};
  const criticalDates=new Set([signal.triggerDate,...plan.supportEvidence.pivots.map(p=>p.date),...plan.resistanceEvidence.pivots.map(p=>p.date)]);
  const record={id:hash([STRATEGY,signal.parameterHash,observation.market,observation.symbol,signal.setupId]),market:observation.market,symbol:observation.symbol,source:'system',strategyVersion:STRATEGY,parameterHash:signal.parameterHash,setupId:signal.setupId,
    executionVersion:EXECUTION,resolverVersion:RESOLVER,signalCreatedAt,createdAt:signalCreatedAt,generationCutoffAt:observation.generationCutoffAt,sourceSnapshotId:observation.evidenceHash,
    sourceEvidence:{hash:observation.evidenceHash,provider:observation.provider,sourceSymbol:observation.sourceSymbol,currency:observation.currency,priceBasis:observation.priceBasis,sourceObservedAt:observation.sourceObservedAt,criticalBars:observation.bars.filter(b=>criticalDates.has(b.date)).map(b=>({date:b.date,hash:barHash(b)}))},
    plan,planHash:hash(plan),execution:{state:'registered',eligibilityAt:null,registrationRevision:null,fillPrice:null},evidence:{status:'verified',reasons:[],verifiedThrough:null,entryWindowExpired:false,checkpoint:{completedHashes:{}}},events:[],outcome:'open',netResultPct:null,grossResultPct:null,resolvedAt:null};
  event(record,'registered',record.id,{preparedAt:signalCreatedAt});
  return record;
}
function acknowledgeRegistration(record,{revision,responseAt}) {
  if(record.execution.state!=='registered') return clone(record);
  if(!revision || !Number.isFinite(ms(responseAt)) || ms(responseAt)<ms(record.signalCreatedAt)) throw new Error('persisted registration receipt required');
  const r=clone(record), lifetime=r.market==='crypto'?2*DAY:7*DAY;
  r.execution={...r.execution,state:'pending-entry',registrationRevision:revision,eligibilityAt:responseAt};
  r.plan.entryExpiresAt=iso(ms(responseAt)+lifetime);r.planHash=hash(r.plan);
  event(r,'registration-receipt',revision,{responseAt,eligibilityAt:responseAt});
  return r;
}
function acknowledgeSimulation(record,decisionCutAt) {
  const r=clone(record);
  if(!Number.isFinite(ms(decisionCutAt))) throw Error('simulation decision cut required');
  r.source='historical-simulation';r.events=[];
  r.execution={...r.execution,state:'pending-entry',eligibilityAt:decisionCutAt,registrationRevision:null};
  r.plan.entryExpiresAt=iso(ms(decisionCutAt)+(r.market==='crypto'?2:7)*DAY);r.planHash=hash(r.plan);
  r.simulation={kind:'historical-simulation',eligibilityBasis:'decision-cut-assumption'};
  event(r,'simulation-registered',r.id,{decisionCutAt});return r;
}
function advancePaperTrade(record,observation,{preparedAt=observation.sourceObservedAt}={}) {
  const r=clone(record), cut=ms(observation.effectiveCutoffAt), observed=ms(observation.sourceObservedAt);
  if(r.execution.state==='registered') return r;
  const issue=(status,reasons)=>{
    r.evidence={...r.evidence,status,reasons:[...new Set(reasons)],entryWindowExpired:r.execution.state==='pending-entry' && Number.isFinite(cut) && cut>ms(r.plan.entryExpiresAt)};
    event(r,'evidence-issue',r.evidence.reasons.join('|'),{status,reasons:r.evidence.reasons,observedAt:observation.sourceObservedAt});return r;
  };
  if(r.strategyVersion!==STRATEGY || r.executionVersion!==EXECUTION || r.resolverVersion!==RESOLVER || hash(r.plan)!==r.planHash) return issue('evidence-incomplete',['policy-or-plan-conflict']);
  if(!Number.isFinite(cut) || !Number.isFinite(observed) || !Number.isFinite(ms(preparedAt)) || ms(preparedAt)<observed) return issue('evidence-incomplete',['observation-time-unverified']);
  if(observation.provider!==r.sourceEvidence.provider || observation.currency!==r.plan.currency || observation.priceBasis!==r.plan.priceBasis || observation.sourceSymbol!==r.plan.sourceSymbol) return issue('evidence-incomplete',['source-price-basis-conflict']);
  const dangerous=(observation.reasons || []).filter(reason=>!['session-coverage-gap','calendar-unverified'].includes(reason));
  if(dangerous.length) return issue('evidence-incomplete',dangerous);
  if(observation.corporateActions?.splits && Object.values(observation.corporateActions.splits).some(x=>!Number.isFinite(x.date) || x.date*1000>=ms(r.signalCreatedAt))) return issue('evidence-incomplete',['corporate-action-conflict']);
  const byDate=new Map(observation.bars.map(b=>[b.date,b]));
  if(byDate.size!==observation.bars.length) return issue('evidence-incomplete',['source-order-conflict']);
  for(const proof of r.sourceEvidence.criticalBars || []) {
    const current=byDate.get(proof.date);
    if(current?.completed && barHash(current)!==proof.hash) return issue('evidence-incomplete',['decision-source-revision']);
  }
  for(const [date,digest] of Object.entries(r.evidence.checkpoint?.completedHashes || {})) {
    const current=byDate.get(date);
    if(current?.completed && ms(current.barEndAt)<=cut && barHash(current)!==digest) return issue('evidence-incomplete',['execution-source-revision']);
  }
  if(r.execution.fillPrice!=null) {
    const entry=byDate.get(r.execution.entryDate);
    if(entry && (entry.open!==r.execution.fillPrice || !entry.openVerified)) return issue('evidence-incomplete',['entry-source-revision']);
  }
  if(TERMINAL.has(r.execution.state)) return r;
  const close=(outcome,bar,exitPrice,mode)=>{
    r.execution.state='closed';r.outcome=outcome;r.exitPrice=exitPrice;
    r.exitObservedAt=observation.sourceObservedAt;r.resultPreparedAt=preparedAt;r.resolvedAt=preparedAt;
    r.exitEffectiveAt=mode==='open'?bar.barStartAt:null;
    r.exitTimeBounds=mode==='range'?{startAt:bar.barStartAt,endAt:bar.barEndAt}:null;
    r.exitEvidence={sourceSnapshotId:observation.evidenceHash,date:bar.date,hash:barHash(bar),mode,continuityVerified:true};
    r.grossResultPct=exitPrice==null?null:(exitPrice/r.execution.fillPrice-1)*100;
    r.netResultPct=exitPrice==null?null:(exitPrice/r.execution.fillPrice*(1-r.plan.costModel.roundTrip/2)**2-1)*100;
    r.evidence.status=outcome==='ambiguous'?'ambiguous':'verified';r.evidence.reasons=outcome==='ambiguous'?['same-bar-stop-and-target']:[];
    event(r,'closed',outcome+':'+bar.date,{outcome,exitPrice,preparedAt,sourceSnapshotId:observation.evidenceHash});return r;
  };
  if(r.execution.state==='pending-entry') {
    const expiry=ms(r.plan.entryExpiresAt), eligibility=ms(r.execution.eligibilityAt);
    if(cut<=eligibility) return r;
    const sessions=expectedSessions(observation,eligibility,Math.min(cut,expiry));
    if(!sessions) return issue('data-pending',['entry-calendar-unverified']);
    const first=sessions[0];
    if(!first) {
      if(cut>expiry) {r.execution.state='expired-entry';r.outcome='not-entered';r.resolvedAt=preparedAt;r.evidence.status='verified';r.evidence.reasons=[];event(r,'expired-entry',r.id,{preparedAt});}
      return r;
    }
    const b=byDate.get(first.date);
    if(!b || !b.openVerified || b.barStartAt!==first.startAt || ms(b.barStartAt)>cut || !(b.open>0)) return issue('data-pending',['first-required-open-missing']);
    const gate=netGate(b.open,r.plan.stop,r.plan.target,r.plan.costModel);
    if(b.open<r.plan.entryZone[0] || b.open>r.plan.entryZone[1] || !gate.pass || (b.open-r.plan.stop)/b.open>.1) {
      r.execution.state='missed-entry';r.outcome='not-entered';r.resolvedAt=preparedAt;r.evidence.status='verified';r.evidence.reasons=[];
      r.execution.entryEvidence={date:b.date,open:b.open,startAt:b.barStartAt,sourceSnapshotId:observation.evidenceHash};
      event(r,'missed-entry',b.date,{open:b.open,preparedAt,sourceSnapshotId:observation.evidenceHash});return r;
    }
    r.execution={...r.execution,state:'filled',entryDate:b.date,fillEffectiveAt:b.barStartAt,fillObservedAt:observation.sourceObservedAt,fillPreparedAt:preparedAt,fillPrice:b.open,entryEvidence:{date:b.date,open:b.open,startAt:b.barStartAt,sourceSnapshotId:observation.evidenceHash}};
    event(r,'filled',b.date,{fillPrice:b.open,fillEffectiveAt:b.barStartAt,fillObservedAt:observation.sourceObservedAt,preparedAt,sourceSnapshotId:observation.evidenceHash});
  }
  r.evidence.status='verified';r.evidence.reasons=[];r.evidence.entryWindowExpired=false;
  const sessions=expectedSessions(observation,ms(r.execution.fillEffectiveAt)-1,cut);
  if(!sessions) return issue('evidence-incomplete',['exit-calendar-unverified']);
  const fillDate=localDate(ms(r.execution.fillEffectiveAt),observation.timeZone);
  const horizonDate=iso(Date.parse(fillDate+'T00:00:00Z')+r.plan.horizonDays*DAY).slice(0,10);
  for(const session of sessions) {
    const b=byDate.get(session.date);
    if(!b || !b.openVerified || b.barStartAt!==session.startAt || !Number.isFinite(ms(b.barStartAt))) return issue('evidence-incomplete',['required-session-open-missing:'+session.date]);
    if(b.open<=r.plan.stop) return close('stop-hit',b,b.open,'open');
    if(b.open>=r.plan.target) return close('target-hit',b,r.plan.target,'open');
    if(b.date>=horizonDate) return close('time-exit',b,b.open,'open');
    if(!b.completed || ms(session.endAt)>cut) return r;
    if(!b.rangeVerified || b.barEndAt!==session.endAt || !Number.isFinite(ms(b.barEndAt)) || b.high<Math.max(b.open,b.close) || b.low>Math.min(b.open,b.close)) return issue('evidence-incomplete',['required-completed-range-missing:'+session.date]);
    r.evidence.checkpoint.completedHashes[b.date]=barHash(b);
    r.evidence.verifiedThrough=b.barEndAt;
    const stop=b.low<=r.plan.stop,target=b.high>=r.plan.target;
    if(stop && target) return close('ambiguous',b,null,'range');
    if(stop) return close('stop-hit',b,r.plan.stop,'range');
    if(target) return close('target-hit',b,r.plan.target,'range');
    if(b.date>=iso(Date.parse(fillDate+'T00:00:00Z')+90*DAY).slice(0,10)) event(r,'90-day-review',r.id,{observedAt:observation.sourceObservedAt,price:b.close,intermediate:true});
  }
  return r;
}
module.exports={EXECUTION,RESOLVER,TERMINAL,barHash,makeRecord,acknowledgeRegistration,acknowledgeSimulation,advancePaperTrade};
