'use strict';
const {canonicalHash,validateLearningExample,instant}=require('./learning-contract');
function buildLearningDataset({examples,labels,cohort,targetId,asOf,splitDates}) {
  if(!Array.isArray(examples)||!Array.isArray(labels)||typeof cohort!=='string'||typeof targetId!=='string'||!targetId) throw Error('invalid dataset task');
  const cutoff=instant(asOf),validationAt=instant(splitDates?.validationStart),testAt=instant(splitDates?.testStart);
  if(validationAt>=testAt || testAt>cutoff || Object.keys(splitDates).some(k=>!['validationStart','testStart'].includes(k))) throw Error('chronological splits required');
  const partitions={train:[],validation:[],test:[]},exclusions=[],seen=new Set(),events=new Set();
  const labelMap=new Map();
  for(const l of labels) {if(l.cohort!==cohort||l.targetId!==targetId)continue;const values=labelMap.get(l.exampleId)||[];values.push(l);labelMap.set(l.exampleId,values);}
  for(const e of [...examples].sort((a,b)=>String(a.id).localeCompare(String(b.id)))) {
    const reject=reason=>exclusions.push({id:e.id,reason});
    if(e.cohort!==cohort) {reject('cohort_mismatch');continue;}
    if(seen.has(e.id)){reject('duplicate_example');continue;} seen.add(e.id);
    try {validateLearningExample(e);} catch(_){reject('invalid_example');continue;}
    if(e.eligibility.status!=='eligible'){reject('ineligible_example');continue;}
    const predictionAt=instant(e.knowledgeCutoff);
    if(predictionAt>cutoff || instant(e.createdAt)>cutoff) {reject('future_prediction');continue;}
    const matched=labelMap.get(e.id)||[];
    if(matched.length!==1){reject(matched.length?'conflicting_labels':'pending_label');continue;}
    const l=matched[0];
    if(l.eligibility?.status!=='eligible'||!Number.isFinite(l.value)||l.kind!==e.kind||l.unit!==(e.kind==='price'?'percent_return':e.unit)||e.kind==='price'&&(l.currency!==e.reference?.currency||l.priceBasis!==e.reference?.priceBasis)) {reject('label_task_mismatch');continue;}
    let available,effective;try{available=Math.max(...['availableAt','observedAt','createdAt','effectiveAt'].map(k=>instant(l[k])));effective=instant(l.effectiveAt);}catch(_){reject('label_availability_missing');continue;}
    const partition=predictionAt<validationAt?'train':predictionAt<testAt?'validation':'test',boundary=partition==='train'?validationAt:partition==='validation'?testAt:cutoff+1;
    if(available>cutoff||available>=boundary||effective>=boundary||effective<=predictionAt){reject('label_not_known_before_partition');continue;}
    const eventId=e.eventId||e.id,key=eventId+':'+targetId;
    if(events.has(key)){reject('duplicate_event');continue;} events.add(key);
    partitions[partition].push({example:e,label:l,eventId,predictionAt:e.knowledgeCutoff,decisionDate:e.kind==='macro'?e.period:e.reference?.barDate||e.knowledgeCutoff.slice(0,10)});
  }
  for(const rows of Object.values(partitions)) rows.sort((a,b)=>instant(a.predictionAt)-instant(b.predictionAt)||a.example.id.localeCompare(b.example.id));
  const manifest={schemaVersion:1,cohort,targetId,splitDates,partitions:Object.fromEntries(Object.entries(partitions).map(([p,rows])=>[p,rows.map(r=>({exampleId:r.example.id,exampleHash:canonicalHash(r.example),labelId:r.label.id,labelHash:canonicalHash(r.label)}))]))};
  const fitFingerprint=canonicalHash(manifest),datasetId=canonicalHash({...manifest,asOf});
  return {datasetId,fitFingerprint,cohort,targetId,asOf,splitDates,manifest,...partitions,exclusions,coverage:{total:Object.values(partitions).flat().length,...Object.fromEntries(Object.entries(partitions).map(([p,rows])=>[p,{records:rows.length,distinctDates:new Set(rows.map(r=>r.decisionDate)).size,distinctEvents:new Set(rows.map(r=>r.eventId)).size}]))}};
}
module.exports={buildLearningDataset};
