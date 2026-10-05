'use strict';
const {normalizeObservation}=require('./structural-data');
const {evaluateSignal}=require('./structural-signals');
const {createStructuralJournal}=require('./structural-journal');
const {isStructural,selectActiveRecord,classifyRecord,buildScorecard}=require('../public/structural-records');
async function collectObservations(sourceSeriesByKey,journal,cutoffAt,{fetchCryptoSeries,fetchYahooSeries}={}) {
  fetchCryptoSeries ||= require('./coingecko').fetchSeries;fetchYahooSeries ||= require('./yahoo').fetchSeries;
  const inputs=new Map(Object.entries(sourceSeriesByKey || {}));
  for(const record of journal.predictions || []) if((isStructural(record) || record.source==='system' && record.outcome==='open') && !inputs.has(record.market+':'+record.symbol)) {
    inputs.set(record.market+':'+record.symbol,{missing:true,sourceSymbol:record.plan?.sourceSymbol || (record.market==='crypto'?record.symbol+'USDT':record.market==='bist'?record.symbol+'.IS':record.symbol),currency:record.plan?.currency || ({crypto:'USDT',bist:'TRY',us:'USD'})[record.market],priceBasis:record.plan?.priceBasis || 'unadjusted',provider:record.sourceEvidence?.provider || (record.market==='crypto'?'binance':'yahoo')});
  }
  const observations=[];
  for(const [key,original] of inputs) {
    const [market,symbol]=key.split(':');let source=original;
    if(original.missing || !original.closes?.length) {
      try {
        if(market==='crypto') {const series=await fetchCryptoSeries(original.sourceSymbol || symbol+'USDT');source={...original,...series};}
        else {const data=await fetchYahooSeries(original.sourceSymbol || (market==='bist'?symbol+'.IS':symbol));source={...original,...data.series,currency:data.currency};}
      } catch(error) {source={...original,sourceError:error.message};}
    }
    observations.push(normalizeObservation({series:source,market,symbol,sourceSymbol:source.sourceSymbol || (market==='crypto'?symbol+'USDT':market==='bist'?symbol+'.IS':symbol),provider:source.provider || (market==='crypto'?'binance':'yahoo'),currency:source.currency,priceBasis:source.priceBasis},cutoffAt));
  }
  return observations;
}
function applyStructuralDecisions(snapshot,journal,observations) {
  const byKey=new Map(observations.map(o=>[o.market+':'+o.symbol,o]));
  const records=journal.predictions || [];
  for(const market of ['us','bist','crypto']) for(const asset of snapshot[market] || []) {
    const o=byKey.get(market+':'+asset.symbol),current=o?evaluateSignal(o):asset.decision?.structural || {status:'watch',reasons:['source-unavailable']};
    asset.decision ||= {activeSignal:null};
    const active=selectActiveRecord(records,market,asset.symbol);
    const recent=active || records.filter(r=>isStructural(r)&&r.market===market && r.symbol===asset.symbol).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
    asset.decision.structural={strategyVersion:'structural-long-v1',status:current.status,reasons:current.reasons,sourceObservedAt:o?.sourceObservedAt || asset.decision.structural?.sourceObservedAt || null,calendarStatus:o?.calendar?.status || asset.decision.structural?.calendarStatus || 'unverified'};
    asset.decision.structuralRecord=isStructural(recent)?recent:null;
    if(isStructural(recent)) {
      const p=recent.plan,e=recent.execution,state=classifyRecord(recent);
      asset.decision.trade={available:true,status:e.state,entry:e.fillPrice || null,entryZone:p.entryZone,stop:p.stop,target:p.target,riskReward:p.netRiskReward,horizonDays:p.horizonDays,currency:p.currency,sourceSnapshotId:recent.sourceSnapshotId,predictionId:recent.id,frozen:true,structural:true};
      asset.decision.activeSignal={available:true,predictionId:recent.id,status:e.state,label:state.label,reason:recent.evidence.reasons.join(', ') || 'Plan ilk kayıtta sabitlendi; sonraki fiyat planı değiştirmez.',entry:e.fillPrice || null,entryZone:p.entryZone,stop:p.stop,target:p.target,currency:p.currency,horizonDays:p.horizonDays,createdAt:recent.createdAt,structural:true,record:recent};
    } else asset.decision.trade={available:false,status:'structural-watch',reason:current.reasons.join(', ') || 'Yapısal giriş koşulları bekleniyor.',structural:true};
  }
  snapshot.structural={strategyVersion:'structural-long-v1',executionVersion:'observed-open-paper-v1',mode:'paper',scorecard:buildScorecard(records),sources:observations.map(o=>({market:o.market,symbol:o.symbol,status:o.status,reasons:o.reasons,calendarStatus:o.calendar.status,sourceObservedAt:o.sourceObservedAt}))};
  return snapshot;
}
async function processStructuralObservations(snapshot,sourceSeriesByKey,{readJournal,processJournal,collector=collectObservations}={}) {
  readJournal ||= ()=>require('./decision-journal').readJournal(require('node:path').join(__dirname,'..','data','journal.json'));
  const initial=await readJournal();
  const observations=await collector(sourceSeriesByKey,initial,snapshot.generatedAt);
  processJournal ||= createStructuralJournal();
  const journal=await processJournal(observations);
  require('./decision').attachSignalHealth(snapshot,journal);
  applyStructuralDecisions(snapshot,journal,observations);
  return {journal,observations};
}
module.exports={collectObservations,applyStructuralDecisions,processStructuralObservations};
