'use strict';
const path=require('node:path');
const {hash,iso,ms}=require('./structural-data');
const {evaluateSignal}=require('./structural-signals');
const {makeRecord,acknowledgeRegistration,advancePaperTrade,TERMINAL}=require('./paper-trade-engine');
const {isStructural}=require('../public/structural-records');
function createEvidenceStore(database=require('./db')) {
  return async function persist(observation) {
    const {evidenceHash:ignored,...body}=observation, digest=hash(body), key='structural:evidence:v1:'+digest;
    const value={schemaVersion:1,hash:digest,observation:body};
    for(let attempt=0;attempt<3;attempt++) {
      const old=await database.getCache(key,{strict:true});
      if(old) {if(hash(old.value)!==hash(value))throw Error('structural evidence identity conflict');return digest;}
      try {await database.compareAndSetCache(key,value,null);}
      catch(e){if(e.statusCode===409)continue;throw e;}
      const saved=await database.getCache(key,{strict:true});
      if(!saved || hash(saved.value)!==hash(value)) throw Error('structural evidence write verification failed');
      return digest;
    }
    throw Error('structural evidence CAS retry exhausted');
  };
}
function canRegister(records,signal,observation) {
  const relevant=records.filter(r=>r.market===observation.market && r.symbol===observation.symbol && r.source!=='user' && r.source!=='manual');
  if(relevant.some(r=>isStructural(r)?!TERMINAL.has(r.execution?.state):r.outcome==='open')) return false;
  if(relevant.some(r=>r.setupId===signal.setupId)) return false;
  const last=relevant.filter(r=>r.resolvedAt).sort((a,b)=>Date.parse(b.resolvedAt)-Date.parse(a.resolvedAt))[0];
  if(last) {
    const terminalAt=ms(last.exitTimeBounds?.endAt || last.exitEffectiveAt || last.resolvedAt);
    const since=observation.bars.filter(b=>b.completed && ms(b.barEndAt)>terminalAt && ms(b.barEndAt)<=ms(observation.effectiveCutoffAt));
    if(since.length<=10 || signal.triggerDate<=since[9].date) return false;
  }
  return true;
}
function createStructuralJournal({read,write,persistEvidence,now=()=>Date.now(),filePath=path.join(__dirname,'..','data','journal.json')}={}) {
  if(!read || !write) {const journal=require('./decision-journal');read ||= ()=>journal.readJournal(filePath);write ||= value=>journal.writeJournal(filePath,value);}
  persistEvidence ||= createEvidenceStore();
  async function cas(apply,{force=false}={}) {
    for(let attempt=0;attempt<3;attempt++) {
      const current=await read(),next=apply(JSON.parse(JSON.stringify(current)));
      if(!force && hash(current)===hash(next)) return {journal:current,written:false};
      try {
        const committed=await write(next),responseAt=iso(now());
        if(!committed?._revision) throw Error('structural journal write receipt missing');
        return {journal:committed,responseAt,written:true};
      } catch(e) {if(e.statusCode===409)continue;throw e;}
    }
    throw Error('structural journal CAS retry exhausted');
  }
  return async function processObservations(observations) {
    const prepared=[];
    for(const input of observations) {
      const observation=JSON.parse(JSON.stringify(input));observation.evidenceHash=await persistEvidence(observation);prepared.push(observation);
    }
    const byKey=new Map(prepared.map(o=>[o.market+':'+o.symbol,o]));
    const candidates=prepared.map(o=>({observation:o,signal:evaluateSignal(o)})).filter(x=>x.signal.status==='candidate');
    const initial=await read(), hasRegistered=initial.predictions?.some(r=>isStructural(r)&&r.execution?.state==='registered');
    const first=await cas(j=>{
      j.predictions ||= [];
      j.predictions=j.predictions.map(r=>{
        const o=byKey.get(r.market+':'+r.symbol);
        if(!o)return r;
        if(isStructural(r))return advancePaperTrade(r,o,{preparedAt:iso(Math.max(now(),ms(o.sourceObservedAt)))});
        if(r.source!=='system' || r.outcome!=='open')return r;
        // Finish old records under their old daily-bar policy. They never
        // acquire a structural fill, receipt or structural performance label.
        const series={dates:o.bars.map(b=>b.date),highs:o.bars.map(b=>b.high),lows:o.bars.map(b=>b.low),closes:o.bars.map(b=>b.close),rangeVerified:o.bars.map(b=>b.rangeVerified),barComplete:o.bars.map(b=>b.completed),dateBasis:'exchange_timezone',timeZone:o.timeZone};
        return require('./prediction-resolver').resolveOne(r,series,new Date(Math.min(now(),ms(o.effectiveCutoffAt))));
      });
      for(const {observation:o,signal} of candidates) if(canRegister(j.predictions,signal,o)) j.predictions.push(makeRecord(signal,o,iso(now())));
      return j;
    },{force:hasRegistered});
    const registered=first.journal.predictions.filter(r=>isStructural(r)&&r.execution?.state==='registered').map(r=>r.id);
    if(!registered.length) return first.journal;
    if(!first.written) throw Error('registration receipt requires a completed CAS');
    const second=await cas(j=>{j.predictions=j.predictions.map(r=>registered.includes(r.id)?acknowledgeRegistration(r,{revision:first.journal._revision,responseAt:first.responseAt}):r);return j;});
    return second.journal;
  };
}
module.exports={createEvidenceStore,canRegister,createStructuralJournal};
