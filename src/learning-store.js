'use strict';
const {canonicalHash,validateLearningExample,validateRecord,instant}=require('./learning-contract');
const INDEX='learning:index:v1', LIMIT=1000;
const identityKey=(type,id)=>'learning:id:'+canonicalHash({type,id});
const shardKey=(type,record)=>'learning:shard:v1:'+type+':'+canonicalHash(record.cohort)+':'+new Date(record.createdAt).toISOString().slice(0,7)+':'+canonicalHash(record.id).slice(0,2);
function error(code) { const e=Error(code); e.code=code; return e; }
async function row(database,key) {
  const found=await database.getCache(key,{strict:true});
  if(found && (!found.value || typeof found.value!=='object' || !found.revision)) throw error('corrupt cache row');
  return found;
}
async function rows(database,keys) {
  const unique=[...new Set(keys)], result={};
  if(database.getCaches) {
    const batch=await database.getCaches(unique,{strict:true});
    for(const key of unique) {
      if(!Object.prototype.hasOwnProperty.call(batch,key)) throw error('incomplete cache batch');
      const found=batch[key];
      if(found&&(!found.value||typeof found.value!=='object'||!found.revision))throw error('corrupt cache row');
      result[key]=found;
    }
  } else {
    for(let offset=0;offset<unique.length;offset+=6) await Promise.all(unique.slice(offset,offset+6).map(async key=>{result[key]=await row(database,key);}));
  }
  return result;
}
async function immutable(database,key,value) {
  for(let attempt=0;attempt<3;attempt++) {
    const old=await row(database,key);
    if(old) { if(canonicalHash(old.value)!==canonicalHash(value)) throw error('identity_conflict'); return false; }
    try { await database.compareAndSetCache(key,value,null); }
    catch(e) { if(e.statusCode===409) continue; throw e; }
    const saved=await row(database,key);
    if(!saved || canonicalHash(saved.value)!==canonicalHash(value)) throw error('write verification failed');
    return true;
  }
  throw error('CAS retry exhausted');
}
async function addReference(database,key,field,entry) {
  for(let attempt=0;attempt<3;attempt++) {
    const old=await row(database,key), value=old?old.value:{schemaVersion:1,[field]:[]};
    if(value.schemaVersion!==1 || !Array.isArray(value[field])) throw error('corrupt learning index');
    const match=value[field].find(x=>x.id===entry.id);
    if(match) { if(canonicalHash(match)!==canonicalHash(entry)) throw error('identity_conflict'); return; }
    if(field==='refs' && value.refs.length>=LIMIT) throw error('learning shard capacity exceeded');
    const next={schemaVersion:1,[field]:[...value[field],entry].sort((a,b)=>a.id.localeCompare(b.id))};
    try { await database.compareAndSetCache(key,next,old?old.revision:null); }
    catch(e) { if(e.statusCode===409) continue; throw e; }
    const saved=await row(database,key);
    if(!saved || !Array.isArray(saved.value[field]) || !saved.value[field].some(x=>canonicalHash(x)===canonicalHash(entry))) throw error('write verification failed');
    return;
  }
  throw error('CAS retry exhausted');
}
async function appendLearningRecords(batch={}, database=require('./db')) {
  const entries=[];
  for(const [collection,type] of [['examples','example'],['labels','label'],['runs','run'],['modelEvents','modelEvent']]) {
    if(batch[collection]!==undefined && !Array.isArray(batch[collection])) throw error('invalid batch');
    for(const record of batch[collection]||[]) { (type==='example'?validateLearningExample:validateRecord)(record); entries.push({type,record,hash:canonicalHash(record)}); }
  }
  const summary={appended:0,existing:0};
  for(const {type,record,hash} of entries) {
    await immutable(database,identityKey(type,record.id),{schemaVersion:1,type,id:record.id,hash,record});
    const inserted=await immutable(database,'learning:record:'+hash,{schemaVersion:1,type,record});
    const key=shardKey(type,record);
    await addReference(database,key,'refs',{id:record.id,hash});
    await addReference(database,INDEX,'shards',{id:key,type,kind:record.kind,cohort:record.cohort,month:new Date(record.createdAt).toISOString().slice(0,7)});
    summary[inserted?'appended':'existing']++;
  }
  return summary;
}
async function readLearningIdentity(type,id,database=require('./db')) {
  const claim=await row(database,identityKey(type,id)); if(!claim) return null;
  if(claim.value.type!==type || claim.value.id!==id || !/^[a-f0-9]{64}$/.test(claim.value.hash)) throw error('corrupt identity claim');
  const saved=await row(database,'learning:record:'+claim.value.hash);
  if(!saved) {
    if(!claim.value.record || canonicalHash(claim.value.record)!==claim.value.hash) throw error('corrupt incomplete identity claim');
    (type==='example'?validateLearningExample:validateRecord)(claim.value.record);
    return claim.value.record;
  }
  if(saved.value.type!==type || canonicalHash(saved.value.record)!==claim.value.hash) throw error('corrupt immutable record');
  return saved.value.record;
}
async function readLearningRecords({asOf,kind,cohort}={}, database=require('./db')) {
  const cutoff=asOf?instant(asOf):Infinity, records=[], exclusions=[];
  const index=await row(database,INDEX); if(!index) return {records,exclusions};
  if(index.value.schemaVersion!==1 || !Array.isArray(index.value.shards)) throw error('corrupt learning index');
  const refs=index.value.shards.filter(ref=>!(kind&&ref.kind!==kind||cohort&&ref.cohort!==cohort));
  for(const ref of refs)if(typeof ref.id!=='string'||!ref.id.startsWith('learning:shard:v1:'))throw error('corrupt shard reference');
  const shards=await rows(database,refs.map(r=>r.id)),recordKeys=[],claimKeys=[];
  for(const ref of refs) {
    const shard=shards[ref.id];
    if(!shard||shard.value.schemaVersion!==1||!Array.isArray(shard.value.refs)||shard.value.refs.length>LIMIT)throw error('corrupt learning shard');
    for(const item of shard.value.refs){recordKeys.push('learning:record:'+item.hash);claimKeys.push(identityKey(ref.type,item.id));}
  }
  const payloads=await rows(database,recordKeys),claims=await rows(database,claimKeys),seen=new Set();
  for(const ref of refs) {
    if(typeof ref.id!=='string'||!ref.id.startsWith('learning:shard:v1:')) throw error('corrupt shard reference');
    if(kind&&ref.kind!==kind || cohort&&ref.cohort!==cohort) continue;
    const shard=shards[ref.id];
    if(!shard || shard.value.schemaVersion!==1 || !Array.isArray(shard.value.refs) || shard.value.refs.length>LIMIT) throw error('corrupt learning shard');
    for(const item of shard.value.refs) {
      const stored=payloads['learning:record:'+item.hash];
      if(!stored || stored.value.type!==ref.type || canonicalHash(stored.value.record)!==item.hash || stored.value.record.id!==item.id) throw error('corrupt immutable record');
      const record=stored.value.record;
      (ref.type==='example'?validateLearningExample:validateRecord)(record);
      if(record.cohort!==ref.cohort||record.kind!==ref.kind) throw error('corrupt cohort reference');
      const identity=claims[identityKey(ref.type,record.id)]?.value;
      if(!identity || identity.type!==ref.type || identity.id!==record.id || identity.hash!==item.hash || identity.record&&canonicalHash(identity.record)!==item.hash) throw error('corrupt identity binding');
      if(instant(record.createdAt)>cutoff) { exclusions.push({id:record.id,reason:'future_record'}); continue; }
      if(!seen.has(item.hash)) { records.push({type:ref.type,hash:item.hash,record}); seen.add(item.hash); }
    }
  }
  records.sort((a,b)=>a.record.id.localeCompare(b.record.id)); return {records,exclusions};
}
module.exports={appendLearningRecords,readLearningRecords,readLearningIdentity,shardKey};
