'use strict';
const {canonicalHash,instant,validateLearningExample,PRICE_FEATURES}=require('./learning-contract');
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function validDataset(d,kind) {
 try {
   const boundaries={train:instant(d.splitDates.validationStart),validation:instant(d.splitDates.testStart),test:instant(d.asOf)+1},ids=new Set();
   if(boundaries.train>=boundaries.validation||boundaries.validation>=boundaries.test)return false;
   for(const p of ['train','validation','test']) for(const r of d[p]) {
     const e=r.example,l=r.label;validateLearningExample(e);
     const prediction=instant(e.knowledgeCutoff),available=Math.max(...['availableAt','effectiveAt','createdAt','observedAt'].map(k=>instant(l[k])));
     if(e.kind!==kind||e.cohort!==d.cohort||l.cohort!==d.cohort||l.targetId!==d.targetId||e.eligibility.status!=='eligible'||l.exampleId!==e.id||!Number.isFinite(l.value)||available>=boundaries[p]||instant(l.effectiveAt)<=prediction||prediction>=boundaries[p]||p!=='train'&&prediction<(p==='validation'?boundaries.train:boundaries.validation)||ids.has(e.id))return false;
     ids.add(e.id);
   }
   return true;
 } catch(_){return false;}
}
function artifactBase(d,type) {
 return {schemaVersion:1,type,kind:d.train[0].example.kind,cohort:d.cohort,targetId:d.targetId,featureSchemaVersion:d.train[0].example.featureSchemaVersion,datasetId:d.datasetId,fitFingerprint:d.fitFingerprint,availableAt:d.asOf,fittedAt:d.asOf,errorConvention:'estimate_minus_actual',
   trainingIds:d.train.map(r=>r.example.id),validationIds:d.validation.map(r=>r.example.id),finalTestIds:d.test.map(r=>r.example.id),testUsage:'final_assessment',unit:d.train[0].label.unit};
}
function finish(artifact) {if(!Object.values(artifact).every(v=>typeof v!=='number'||Number.isFinite(v)))return {status:'numerical_failure',artifact:null};return {status:'candidate',artifact:{...artifact,modelId:'model:'+canonicalHash(artifact)}};}
function fitMacroBias({dataset:d}) {
 if(!validDataset(d,'macro'))return {status:'invalid_dataset',artifact:null};
 if(d.train.length<12||d.validation.length<3||d.test.length<3)return {status:'insufficient_sample',artifact:null};
 const errors=d.train.map(r=>r.example.features.rawEstimate-r.label.value),bias=mean(errors);
 if(!Number.isFinite(bias))return {status:'numerical_failure',artifact:null};
 return finish({...artifactBase(d,'macro-bias-v1'),correction:-bias});
}
function solve(matrix,vector) {
 const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
 for(let col=0;col<n;col++) {
   let pivot=col;for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
   [a[col],a[pivot]]=[a[pivot],a[col]];const scale=a[col][col];if(!Number.isFinite(scale)||Math.abs(scale)<1e-12)throw Error('singular');
   for(let j=col;j<=n;j++)a[col][j]/=scale;
   for(let i=0;i<n;i++)if(i!==col){const multiplier=a[i][col];for(let j=col;j<=n;j++)a[i][j]-=multiplier*a[col][j];}
 }
 const result=a.map(row=>row[n]);if(!result.every(Number.isFinite))throw Error('overflow');return result;
}
function fitPriceRidge({dataset:d}) {
 if(!validDataset(d,'price'))return {status:'invalid_dataset',artifact:null};
 const minimums={train:[120,20],validation:[30,10],test:[30,10]};
 if(Object.entries(minimums).some(([p,[n,dates]])=>d[p].length<n||new Set(d[p].map(r=>r.decisionDate)).size<dates))return {status:'insufficient_sample',artifact:null};
 try {
   const stats=PRICE_FEATURES.map(name=>{const values=d.train.map(r=>r.example.features[name]),m=mean(values),std=Math.sqrt(mean(values.map(v=>(v-m)**2)));if(!Number.isFinite(m)||!Number.isFinite(std))throw Error('overflow');return {name,m,std};}).filter(s=>s.std>1e-12);
   const names=stats.map(s=>s.name),means=stats.map(s=>s.m),stds=stats.map(s=>s.std);
   const vector=e=>[1,...stats.map(s=>(e.features[s.name]-s.m)/s.std)];
   const xs=d.train.map(r=>vector(r.example)),ys=d.train.map(r=>r.label.value),n=names.length+1;
   const gram=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>xs.reduce((s,x)=>s+x[i]*x[j],0))),rhs=Array.from({length:n},(_,i)=>xs.reduce((s,x,k)=>s+x[i]*ys[k],0));
   let best=null;
   for(const lambda of [1,10,100]) {
     const coefficients=solve(gram.map((row,i)=>row.map((v,j)=>v+(i===j&&i>0?lambda:0))),rhs);
     const score=mean(d.validation.map(r=>Math.abs(vector(r.example).reduce((s,x,i)=>s+x*coefficients[i],0)-r.label.value)));
     if(!Number.isFinite(score))throw Error('overflow');
     if(!best||score<best.score-1e-12||Math.abs(score-best.score)<=1e-12&&lambda>best.lambda)best={score,lambda,coefficients};
   }
   return finish({...artifactBase(d,'price-ridge-v1'),featureNames:names,means,stds,coefficients:best.coefficients,lambda:best.lambda,validationMae:best.score});
 } catch(_){return {status:'numerical_failure',artifact:null};}
}
function predictModel({artifact:a,example:e}) {
 const abstain=reason=>({status:'abstain',estimate:null,reasons:[reason]});
 try{validateLearningExample(e);}catch(_){return abstain('invalid_example');}
 if(e.eligibility.status!=='eligible'||a.cohort!==e.cohort||a.featureSchemaVersion!==e.featureSchemaVersion)return abstain('task_or_features_mismatch');
 let estimate;
 if(a.type==='macro-bias-v1')estimate=e.features.rawEstimate+a.correction;
 else if(a.type==='price-ridge-v1'&&a.featureNames?.length===a.means?.length&&a.means.length===a.stds?.length&&a.coefficients?.length===a.featureNames.length+1&&a.stds.every(v=>v>0))estimate=a.coefficients[0]+a.featureNames.reduce((s,k,i)=>s+(e.features[k]-a.means[i])/a.stds[i]*a.coefficients[i+1],0);
 else return abstain('invalid_artifact');
 return Number.isFinite(estimate)?{status:'available',estimate,reasons:[]} : abstain('nonfinite_prediction');
}
module.exports={fitMacroBias,fitPriceRidge,predictModel};
