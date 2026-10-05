(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StructuralRecords=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STRATEGY='structural-long-v1', terminal=new Set(['closed','missed-entry','expired-entry']);
  function isStructural(r){return r?.strategyVersion===STRATEGY && r.source==='system';}
  function classifyRecord(r) {
    if(r?.source==='user'||r?.source==='manual') return {category:'manual',label:'Manuel senaryo'};
    if(!isStructural(r)) return {category:'legacy',label:'Eski teknik kayıt'};
    const state=r.execution?.state,status=r.evidence?.status;
    if(status==='evidence-incomplete') return {category:'incomplete',label:'Kanıt eksik'};
    if(status==='ambiguous'||r.outcome==='ambiguous') return {category:'ambiguous',label:'Sonuç belirsiz'};
    if(['registered','pending-entry','filled'].includes(state)) return {category:'pending',label:status==='data-pending'?'Açılış kanıtı bekleniyor':state==='filled'?'Sanal işlem açık':state==='registered'?'Kayıt teyidi bekleniyor':'Giriş bekleniyor'};
    if(state==='missed-entry'||state==='expired-entry') return {category:'not-entered',label:state==='missed-entry'?'Giriş kaçtı':'Giriş süresi doldu'};
    const e=r.execution,p=r.plan,cost=p?.costModel,fill=Date.parse(e?.fillEffectiveAt),exitObserved=Date.parse(r.exitObservedAt);
    const proof=state==='closed' && status==='verified' && ['target-hit','stop-hit','time-exit'].includes(r.outcome)
      && r.executionVersion==='observed-open-paper-v1' && r.resolverVersion==='structural-paper-resolver-v1'
      && typeof r.parameterHash==='string' && !!r.sourceSnapshotId && !!r.sourceEvidence?.hash
      && e?.registrationRevision && Number.isFinite(fill) && fill>Date.parse(e.eligibilityAt)
      && Date.parse(e.fillObservedAt)>=fill && Date.parse(e.fillPreparedAt)>=Date.parse(e.fillObservedAt)
      && e.entryEvidence?.sourceSnapshotId && r.exitEvidence?.sourceSnapshotId && r.exitEvidence?.continuityVerified===true
      && Number.isFinite(exitObserved) && exitObserved>=fill && Date.parse(r.resultPreparedAt)>=exitObserved
      && (r.exitEvidence.mode==='open'?Date.parse(r.exitEffectiveAt)>=fill && Date.parse(r.exitEffectiveAt)<=exitObserved
        :r.exitEvidence.mode==='range' && Date.parse(r.exitTimeBounds?.startAt)>=fill && Date.parse(r.exitTimeBounds?.endAt)<=exitObserved)
      && [90,180].includes(p?.horizonDays) && cost?.version==='market-costs-v1' && Number.isFinite(cost.roundTrip) && cost.roundTrip>=0 && cost.roundTrip<1
      && Number.isFinite(e.fillPrice) && e.fillPrice>0 && Number.isFinite(r.exitPrice) && r.exitPrice>0
      && Number.isFinite(r.netResultPct) && Number.isFinite(r.grossResultPct)
      && Math.abs(r.netResultPct-(r.exitPrice/e.fillPrice*(1-cost.roundTrip/2)**2-1)*100)<1e-8
      && Math.abs(r.grossResultPct-(r.exitPrice/e.fillPrice-1)*100)<1e-8;
    return proof?{category:'verified',label:'Doğrulanmış kapanış'}:{category:'incomplete',label:'Sonuç kanıtı eksik'};
  }
  function selectActiveRecord(records,market,symbol) {
    return (records||[]).filter(r=>r.market===market && String(r.symbol).toUpperCase()===String(symbol).toUpperCase() && r.source!=='user' && r.source!=='manual'
      && (isStructural(r)?!terminal.has(r.execution?.state):r.outcome==='open')).sort((a,b)=>Number(isStructural(b))-Number(isStructural(a)) || String(b.createdAt||'').localeCompare(String(a.createdAt||'')) || String(a.id||'').localeCompare(String(b.id||'')))[0] || null;
  }
  function cohortKey(r) {return [r.market,r.plan?.setup,r.strategyVersion,r.parameterHash,r.plan?.horizonDays,r.executionVersion,r.resolverVersion,r.plan?.costModel?.version,r.plan?.costModel?.roundTrip,r.plan?.priceBasis,r.plan?.currency,r.sourceEvidence?.provider].join('|');}
  function buildScorecard(records=[]) {
    const exclusions={pending:0,'not-entered':0,ambiguous:0,incomplete:0,manual:0,legacy:0},verified=records.filter(r=>{const c=classifyRecord(r).category;if(c!=='verified')exclusions[c]++;return c==='verified';});
    const cohorts={};for(const r of verified){const k=cohortKey(r);(cohorts[k] ||= []).push(r);}
    const summarize=rows=>{
      const exact=rows.filter(r=>r.holdingTime?.mode==='exact' && Number.isFinite(r.holdingTime.days)),bounded=rows.filter(r=>r.holdingTime?.mode==='bounded');
      const benchmarks=rows.filter(r=>r.benchmark?.status==='verified' && r.exitEvidence.mode==='open' && r.benchmark.entryPrice===r.execution.fillPrice && r.benchmark.entryAt===r.execution.fillEffectiveAt && r.benchmark.exitAt===r.exitEffectiveAt && Number.isFinite(r.benchmark.exitPrice) && Math.abs(r.benchmark.netResultPct-(r.benchmark.exitPrice/r.execution.fillPrice*(1-r.plan.costModel.roundTrip/2)**2-1)*100)<1e-8);
      return {verified:rows.length,wins:rows.filter(r=>r.netResultPct>0).length,zero:rows.filter(r=>r.netResultPct===0).length,losses:rows.filter(r=>r.netResultPct<0).length,targetHits:rows.filter(r=>r.outcome==='target-hit').length,stopHits:rows.filter(r=>r.outcome==='stop-hit').length,timeExits:rows.filter(r=>r.outcome==='time-exit').length,winRate:rows.length?rows.filter(r=>r.netResultPct>0).length/rows.length*100:null,avgNetResultPct:rows.length?rows.reduce((a,r)=>a+r.netResultPct,0)/rows.length:null,
        holdingTime:{exactCount:exact.length,boundedCount:bounded.length,unknownCount:rows.length-exact.length-bounded.length,avgExactDays:exact.length?exact.reduce((n,r)=>n+r.holdingTime.days,0)/exact.length:null},
        benchmark:{verified:benchmarks.length,unverified:rows.length-benchmarks.length,avgNetResultPct:benchmarks.length?benchmarks.reduce((n,r)=>n+r.benchmark.netResultPct,0)/benchmarks.length:null,avgStrategyNetResultPct:benchmarks.length?benchmarks.reduce((n,r)=>n+r.netResultPct,0)/benchmarks.length:null}};
    };
    return {...summarize(verified),exclusions,cohorts:Object.entries(cohorts).map(([key,rows])=>({key,market:rows[0].market,setup:rows[0].plan.setup,horizonDays:rows[0].plan.horizonDays,parameterHash:rows[0].parameterHash,currency:rows[0].plan.currency,...summarize(rows)}))};
  }
  return {STRATEGY,isStructural,classifyRecord,selectActiveRecord,cohortKey,buildScorecard};
});
