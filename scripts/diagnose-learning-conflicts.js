'use strict';
// Read-only probe: no journal, identity, label or model writes.
const fs=require('node:fs/promises');
const path=require('node:path');
const {windowsFetch}=require('../src/windows-fetch');
const {fetchSeries}=require('../src/yahoo');
const {buildSignalExample}=require('../src/learning-features');
const {readLearningIdentity}=require('../src/learning-store');
const {canonicalHash}=require('../src/learning-contract');
const {semanticExample}=require('../src/learning-pipeline');
async function diagnose({snapshot,fetch=fetchSeries,read=readLearningIdentity}) {
  const rows=[];
  for(const asset of snapshot.us || []) {
    try {
      const fetched=await fetch(asset.symbol);
      if(fetched.__error)throw Error(fetched.__error);
      const series={...fetched.series,symbol:asset.symbol,sourceSymbol:asset.symbol,provider:'yahoo',currency:fetched.currency,priceBasis:'yahoo-chart-close-v1'};
      const observedAt=series.observedAt,cut=new Date(Math.max(Date.now(),Date.parse(observedAt))).toISOString();
      const {example}=buildSignalExample({asset:{...asset,market:'us'},sourceSeries:series,createdAt:cut,knowledgeCutoff:cut,marketRegime:snapshot.marketRegime?.us?.regime});
      const original=await read('example',example.id);
      if(!original){rows.push({market:'us',symbol:asset.symbol,referenceDate:example.reference?.barDate||null,status:'new_identity'});continue;}
      const changedFields=Object.keys(example).filter(k=>!['createdAt','knowledgeCutoff','sourceObservedAt'].includes(k)&&canonicalHash(original[k]??null)!==canonicalHash(example[k]??null));
      const featureChanges=Object.keys(example.features).filter(k=>original.features[k]!==example.features[k]);
      rows.push({market:'us',symbol:asset.symbol,referenceDate:example.reference?.barDate||null,status:semanticExample(original)===semanticExample(example)?'same':'changed',originalRecordedAt:original.createdAt,observedAt:cut,changedFields,featureChanges,originalEligibility:original.eligibility,incomingEligibility:example.eligibility,referenceChanged:canonicalHash(original.reference)!==canonicalHash(example.reference),originalRegime:original.marketRegime,incomingRegime:example.marketRegime,evidenceChanged:original.evidenceHash!==example.evidenceHash});
    } catch(e) {rows.push({market:'us',symbol:asset.symbol,status:'unavailable',reason:e.code||e.name||'read_failed'});}
  }
  return {schemaVersion:1,checkedAt:new Date().toISOString(),snapshotGeneratedAt:snapshot.generatedAt,mode:'read-only',scope:'Latest US source compared with the first frozen example for the same reference date; no original evidence payload is reconstructed.',rows};
}
async function main(args=process.argv.slice(2)) {
  let output=null;
  for(let i=0;i<args.length;i++){if(args[i]==='--output'&&args[i+1])output=args[++i];else throw Error('Use --output <aggregate-report.json>');}
  if(output){const target=path.resolve(output).toLowerCase(),dataRoot=path.resolve(__dirname,'../data').toLowerCase();if(path.extname(target)!=='.json'||target===dataRoot||target.startsWith(dataRoot+path.sep))throw Error('Output must be a JSON report outside application data');}
  const response=await windowsFetch('https://finans-dashboard-iota.vercel.app/api/data');
  if(!response.ok)throw Error('Snapshot read failed: '+response.status);
  const result=await diagnose({snapshot:await response.json()});
  if(output){await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify({checkedAt:result.checkedAt,rows:result.rows}));
  if(result.rows.some(r=>r.status==='unavailable'))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
module.exports={diagnose};
