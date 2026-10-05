'use strict';
const {createHash} = require('node:crypto');
const PRICE_FEATURES = Object.freeze(['return21','return63','return126','atrPct','rsi14','distanceSma50Atr','distanceSma200Atr']);
function canonical(value, seen = new Set()) {
  if(value===null || typeof value==='boolean' || typeof value==='string') return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if(typeof value!=='object' || seen.has(value)) throw Error('unsupported JSON value');
  const prototype=Object.getPrototypeOf(value);
  if(!Array.isArray(value) && prototype!==Object.prototype && prototype!==null) throw Error('unsupported JSON object');
  seen.add(value); let result;
  if(Array.isArray(value)) {
    if(Object.keys(value).length!==value.length) throw Error('unsupported sparse array');
    result='['+Array.from(value,item=>canonical(item,seen)).join(',')+']';
  } else {
    if(Object.getOwnPropertySymbols(value).length) throw Error('unsupported symbol');
    result='{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],seen)).join(',')+'}';
  }
  seen.delete(value); return result;
}
const canonicalHash = value => createHash('sha256').update(canonical(value)).digest('hex');
function instant(value) {
  if(typeof value!=='string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('invalid timestamp');
  return Date.parse(value);
}
function text(value,name) { if(typeof value!=='string'||!value.length||value.length>2048) throw Error('invalid '+name); }
function validateRecord(value) {
  canonicalHash(value);
  if(value.schemaVersion!==1) throw Error('unknown schema');
  for(const name of ['id','kind','cohort']) text(value[name],name);
  instant(value.createdAt); return value;
}
function validateLearningExample(value) {
  validateRecord(value);
  if(!['price','macro'].includes(value.kind)) throw Error('unknown example kind');
  const cutoff=instant(value.knowledgeCutoff);
  if(instant(value.sourceObservedAt)>cutoff || cutoff>instant(value.createdAt)) throw Error('future source observation');
  const keys=value.featureSchemaVersion==='price-features-v1' ? PRICE_FEATURES : value.featureSchemaVersion==='macro-features-v1' ? ['rawEstimate'] : null;
  if(!keys || !value.features || Object.keys(value.features).length!==keys.length || keys.some(k=>!(k in value.features)||value.features[k]!==null && !Number.isFinite(value.features[k]))) throw Error('unknown features');
  if(!/^[a-f0-9]{64}$/.test(value.evidenceHash)) throw Error('invalid evidence hash');
  if(!value.eligibility || !['eligible','ineligible'].includes(value.eligibility.status) || !Array.isArray(value.eligibility.reasons) || value.eligibility.reasons.some(r=>typeof r!=='string')) throw Error('invalid eligibility');
  if(value.eligibility.status==='eligible' && keys.some(k=>value.features[k]===null)) throw Error('eligible missing feature');
  return value;
}
module.exports={canonicalHash,validateLearningExample,validateRecord,instant,PRICE_FEATURES};
