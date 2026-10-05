'use strict';
const {evaluateSignal}=require('./structural-signals');
const {makeRecord,acknowledgeSimulation,advancePaperTrade}=require('./paper-trade-engine');
const {canRegister}=require('./structural-journal');
function replayObservations(observations,{config={}}={}) {
  let records=[];
  for(const o of [...observations].sort((a,b)=>Date.parse(a.generationCutoffAt)-Date.parse(b.generationCutoffAt))) {
    records=records.map(r=>r.market===o.market && r.symbol===o.symbol?advancePaperTrade(r,o,{preparedAt:o.sourceObservedAt}):r);
    const signal=evaluateSignal(o,{config});
    if(signal.status==='candidate' && canRegister(records,signal,o)) records.push(acknowledgeSimulation(makeRecord(signal,o,o.generationCutoffAt),o.generationCutoffAt));
  }
  const closed=records.filter(r=>r.execution.state==='closed' && r.evidence.status==='verified' && Number.isFinite(r.netResultPct));
  return {kind:'historical-simulation',records,scorecard:{closed:closed.length,winRate:closed.length?closed.filter(r=>r.netResultPct>0).length/closed.length*100:null,avgNetResultPct:closed.length?closed.reduce((s,r)=>s+r.netResultPct,0)/closed.length:null},limitations:['current-watchlist survivorship bias','revised provider history','historical decision-cut eligibility assumption; no live receipt','no split/dividend total return','observations must preserve each actual decision prefix']};
}
module.exports={replayObservations};
