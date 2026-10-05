'use strict';
const assert=require('node:assert/strict');
const {observation,freshBar}=require('./helpers/structural-fixtures');
const {DAY,iso,hash}=require('../src/structural-data');
const {evaluateSignal}=require('../src/structural-signals');
const {makeRecord,acknowledgeRegistration,advancePaperTrade}=require('../src/paper-trade-engine');
const {classifyRecord,buildScorecard}=require('../public/structural-records');
const {createStructuralJournal}=require('../src/structural-journal');
const {collectObservations,applyStructuralDecisions}=require('../src/structural-pipeline');
const {explainDecision}=require('../public/insights');
const ui=require('../public/structural-ui');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const base=observation(),pending=acknowledgeRegistration(makeRecord(evaluateSignal(base),base,base.sourceObservedAt),{revision:'first-cas',responseAt:base.sourceObservedAt});
const start=Math.floor(Date.parse(base.sourceObservedAt)/DAY)*DAY+DAY,entry=101;
const day=i=>iso(start+i*DAY).slice(0,10);
const first=freshBar(day(0),{open:entry,high:102,low:100,close:101});
const obs=(bars,at=start+2*DAY)=>({...base,bars,sourceObservedAt:iso(at),generationCutoffAt:iso(at),effectiveCutoffAt:iso(at),evidenceHash:hash(bars)});
const run=(record,o)=>advancePaperTrade(record,o,{preparedAt:o.sourceObservedAt});
const gapBar=freshBar(day(1),{open:80,high:85,low:75,close:82});
const gap=run(pending,obs([first,gapBar]));
test('completed gap and time exit revisions are excluded',()=>{
  const revised=run(gap,obs([first,{...gapBar,open:90,high:95,low:85,close:92}]));
  assert.equal(classifyRecord(revised).category,'incomplete');assert.ok(revised.evidence.reasons.includes('exit-source-revision'));
  const ninety=acknowledgeRegistration(makeRecord(evaluateSignal(base,{config:{horizonDays:90}}),base,base.sourceObservedAt),{revision:'ninety',responseAt:base.sourceObservedAt});
  const bars=Array.from({length:91},(_,i)=>freshBar(day(i),{open:entry,high:102,low:100,close:101}));
  const timed=run(ninety,obs(bars,start+91*DAY));assert.equal(timed.outcome,'time-exit');
  bars[90]={...bars[90],open:102};assert.equal(classifyRecord(run(timed,obs(bars,start+91*DAY))).category,'incomplete');
});
test('developing gap exit range evolution preserves verified open proof',()=>{
  const developing=run(pending,obs([first,{...gapBar,completed:false}],start+DAY+3600000));
  const complete=run(developing,obs([first,{...gapBar,high:95,low:70,close:90}]));
  assert.equal(classifyRecord(complete).category,'verified');assert.equal(complete.exitPrice,80);
  assert.equal(classifyRecord(run(complete,obs([first,{...gapBar,open:81}]))).category,'incomplete');
});
test('closed persisted proof survives outage and actual revision can recover only with full proof',()=>{
  const full=obs([...base.bars,first,gapBar]);const closed=run(pending,full);
  const outage={...obs([]),reasons:['array-alignment'],status:'evidence-incomplete'};
  assert.equal(classifyRecord(run(closed,outage)).category,'verified');
  const revised=run(closed,{...full,bars:full.bars.map(b=>b.date===day(1)?{...b,open:90,high:95,low:85,close:92}:b)});
  assert.equal(classifyRecord(revised).category,'incomplete');
  assert.equal(classifyRecord(run(revised,outage)).category,'incomplete');
  assert.equal(classifyRecord(run(revised,full)).category,'verified');
});
test('broken support needs two newly formed confirmed pivots',()=>{
  const broken=structuredClone(base);broken.bars[210].close=90;broken.bars[210].low=89;broken.bars[225].low=100;
  assert.equal(evaluateSignal(broken).status,'watch');
  broken.bars[215].low=100;
  const renewed=evaluateSignal(broken);assert.equal(renewed.status,'candidate',JSON.stringify(renewed.reasons));
  assert.deepEqual(renewed.plan.supportEvidence.pivots.map(p=>p.index),[215,225]);
});
test('legacy open lifecycle advances through common collector and CAS without structural promotion',async()=>{
  const legacy={id:'old',market:'crypto',symbol:'BTC',source:'system',strategyVersion:'technical-rules-v1',outcome:'open',createdAt:iso(start-40*DAY),entry:100,stop:70,target:200,horizonDays:30};
  let calls=0;const series={dates:[day(0)],opens:[101],openVerified:[true],highs:[102],lows:[100],closes:[101],volumes:[100],rangeVerified:[true],volumeVerified:[true],sourceTimestamps:[iso(start)],calendar:base.calendar,technicalData:{fetchedAt:iso(start+2*DAY)}};
  const observations=await collectObservations({}, {predictions:[legacy]},iso(start+2*DAY),{fetchCryptoSeries:async()=>{calls++;return series;}});
  assert.equal(calls,1);assert.equal(observations.length,1);
  let j={_revision:'old0',predictions:[legacy],notes:{keep:true}};
  const process=createStructuralJournal({read:async()=>structuredClone(j),write:async value=>(j={...value,_revision:'old1'}),persistEvidence:async o=>hash(o),now:()=>start+2*DAY});
  await process(observations);assert.equal(j.predictions[0].outcome,'expired-win');assert.equal(j.notes.keep,true);
  assert.equal(buildScorecard(j.predictions).verified,0);assert.equal(buildScorecard(j.predictions).exclusions.legacy,1);
});
test('decision summary uses shared terminal and evidence states',()=>{
  for(const [state,status,expected] of [['missed-entry','verified',/Giriş kaçtı/],['expired-entry','verified',/Giriş süresi doldu/],['pending-entry','data-pending',/Açılış kanıtı bekleniyor/],['filled','evidence-incomplete',/Kanıt eksik/]]){
    const r=structuredClone(pending);r.execution.state=state;r.evidence.status=status;
    const snapshot={crypto:[{market:'crypto',symbol:'BTC',analysis:{score:70,tone:'buy'},decision:{}}]};
    applyStructuralDecisions(snapshot,{predictions:[r]},[]);const plan=explainDecision(snapshot.crypto[0]).plan;
    assert.match(plan,expected);assert.doesNotMatch(plan,/Sanal giriş bekleniyor/);
  }
});
test('verified scorecard reports distributions, honest holding bounds and matching open benchmark',()=>{
  assert.equal(gap.holdingTime.mode,'exact');assert.equal(gap.holdingTime.days,1);
  assert.equal(gap.benchmark.exitPrice,80);assert.equal(gap.benchmark.netResultPct,gap.netResultPct);
  const range=run(pending,obs([freshBar(day(0),{open:entry,high:pending.plan.target+1,low:100,close:101})],start+DAY));
  assert.equal(range.benchmark.status,'unverified');assert.equal(range.benchmark.netResultPct,null);
  assert.equal(range.holdingTime.mode,'bounded');assert.equal(range.holdingTime.minDays,0);
  const card=buildScorecard([gap,range]);assert.equal(card.stopHits,1);assert.equal(card.targetHits,1);assert.equal(card.timeExits,0);
  assert.equal(card.holdingTime.exactCount,1);assert.equal(card.holdingTime.boundedCount,1);assert.equal(card.benchmark.verified,1);
  assert.match(ui.renderPerformance([gap,range]),/stop 1/);assert.match(ui.renderPerformance([gap,range]),/Al ve tut/);
});
test('complete persisted lifecycle and JSONB key reorder produce one shared verified result',async()=>{
  let tick=Date.parse(base.sourceObservedAt),revision=0,j={_revision:'r0',predictions:[],notes:{mine:'keep'}};
  const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,reorder(v[k])])):v;
  const process=createStructuralJournal({read:async()=>reorder(structuredClone(j)),write:async v=>{tick+=1000;return j=reorder({...v,_revision:'r'+(++revision)});},persistEvidence:async o=>hash(o),now:()=>tick});
  await process([base]);tick=start+3600000;await process([obs([...base.bars,{...first,completed:false}],tick)]);
  assert.equal(j.predictions[0].execution.state,'filled');const frozen=structuredClone(j.predictions[0].plan);
  tick=start+2*DAY;await process([obs([...base.bars,first,gapBar],tick)]);
  assert.equal(j.predictions.length,1);assert.equal(classifyRecord(j.predictions[0]).category,'verified');assert.deepEqual(j.predictions[0].plan,frozen);
  const snapshot={crypto:[{market:'crypto',symbol:'BTC',currency:'USD',decision:{}}]};applyStructuralDecisions(snapshot,j,[]);
  assert.equal(snapshot.structural.scorecard.verified,1);assert.equal(snapshot.crypto[0].decision.trade.entry,entry);assert.equal(j.notes.mine,'keep');
});
(async()=>{let failed=0;for(const [name,fn]of tests){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
