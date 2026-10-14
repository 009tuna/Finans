'use strict';
// Explicit, bounded US re-observation. Original examples and journal remain frozen.
const fs=require('node:fs/promises');
const path=require('node:path');
const {windowsFetch}=require('../src/windows-fetch');
const {fetchSeries}=require('../src/yahoo');
const {buildSignalExample}=require('../src/learning-features');
const {readLearningIdentity}=require('../src/learning-store');
const {captureLearningSnapshot}=require('../src/learning-pipeline');
const {canonicalHash}=require('../src/learning-contract');
async function readJournalSnapshot(){const response=await windowsFetch('https://finans-dashboard-iota.vercel.app/api/journal');if(!response.ok)throw Error('Journal verification read failed');const journal=await response.json();if(!Array.isArray(journal.predictions))throw Error('Journal verification shape unavailable');return journal;}
async function run({write=false,output=null}={}) {
 if(output){const target=path.resolve(output).toLowerCase(),dataRoot=path.resolve(__dirname,'../data').toLowerCase();if(path.extname(target)!=='.json'||target===dataRoot||target.startsWith(dataRoot+path.sep))throw Error('Output must be a JSON report outside application data');}
 const response=await windowsFetch('https://finans-dashboard-iota.vercel.app/api/data');
 if(!response.ok)throw Error('Snapshot unavailable');
 const live=await response.json(),us=live.us;
 if(!Array.isArray(us)||!us.length||us.length>50)throw Error('US probe must contain 1–50 known assets');
 const seriesByKey={};
 for(const asset of us){const source=await fetchSeries(asset.symbol);if(source.__error)throw Error('Source unavailable for '+asset.symbol);seriesByKey['us:'+asset.symbol]={...source.series,symbol:asset.symbol,sourceSymbol:asset.symbol,provider:'yahoo',currency:source.currency,priceBasis:'yahoo-chart-close-v1'};}
 const generatedAt=new Date().toISOString(),snapshot={generatedAt,us,bist:[],crypto:[],marketRegime:live.marketRegime};
 const database=require('../src/db');
 // No portfolio/journal/snapshot/model write can escape this bounded operation.
 const guarded={getCache:(...a)=>database.getCache(...a),getCaches:(...a)=>database.getCaches(...a),compareAndSetCache:(key,...a)=>{
   if(!key.startsWith('learning:')||key.startsWith('learning:model'))throw Error('Write outside learning evidence scope');
   return database.compareAndSetCache(key,...a);
 }};
 const originals=[];
 for(const asset of us){const {example}=buildSignalExample({asset:{...asset,market:'us'},sourceSeries:seriesByKey['us:'+asset.symbol],createdAt:generatedAt,knowledgeCutoff:generatedAt,marketRegime:live.marketRegime?.us?.regime});const old=await readLearningIdentity('example',example.id,guarded);originals.push({id:example.id,hash:old?canonicalHash(old):null});}
 console.log(JSON.stringify({phase:'sources-read',assets:us.length,existingIdentities:originals.filter(r=>r.hash).length,mode:write?'append-learning-evidence':'read-only'}));
 if(!write){const result={checkedAt:new Date().toISOString(),mode:'read-only',scope:{markets:['us'],assetCount:us.length},existingIdentities:originals.filter(r=>r.hash).length};if(output){await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify(result));return result;}
 const journalBefore=await readJournalSnapshot();
 const started=Date.now(),summary=await captureLearningSnapshot({snapshot,sourceSeriesByKey:seriesByKey,database:guarded});
 console.log(JSON.stringify({phase:'captured',summary,durationMs:Date.now()-started}));
 if(summary.status==='unavailable')throw Error('Capture unavailable; inspect preserved evidence before retrying');
 let preserved=0;
 for(const old of originals.filter(r=>r.hash)){const after=await readLearningIdentity('example',old.id,guarded);if(!after||canonicalHash(after)!==old.hash)throw Error('Original learning example changed');preserved++;}
 const journalAfter=await readJournalSnapshot();
 const result={checkedAt:new Date().toISOString(),mode:'append-learning-evidence',scope:summary.scope,summary,preservedOriginalExamples:preserved,journalUnchangedDuringCheck:canonicalHash(journalBefore)===canonicalHash(journalAfter),journalWriteCapability:false,trainingInvoked:false,activationInvoked:false};
 if(output){await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify(result));return result;
}
if(require.main===module){const args=process.argv.slice(2);let write=false,output=null;for(let i=0;i<args.length;i++){if(args[i]==='--write-observations')write=true;else if(args[i]==='--output'&&args[i+1])output=args[++i];else throw Error('Use [--write-observations] [--output <aggregate.json>]');}run({write,output}).catch(e=>{console.error(e.code||e.message);process.exitCode=1});}
module.exports={run};
