'use strict';
const assert=require('node:assert/strict');
const {buildSignalExample}=require('../src/learning-features');
const {clone}=require('./learning-fixtures');
function series() {
  const dates=Array.from({length:241},(_,i)=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10));
  return {symbol:'ABC',provider:'yahoo',currency:'USD',priceBasis:'unadjusted-close-v1',timeZone:'UTC',dateBasis:'exchange_timezone',observedAt:dates.at(-1)+'T12:00:00Z',
    dates,sourceTimestamps:dates.map(d=>d+'T00:00:00Z'),closes:dates.map((_,i)=>100+i/2),highs:dates.map((_,i)=>102+i/2),lows:dates.map((_,i)=>98+i/2),volumes:dates.map(()=>1000),rangeVerified:dates.map(()=>true),volumeVerified:dates.map(()=>true)};
}
const raw=series(), input={asset:{symbol:'ABC',market:'us',price:999,analysis:{score:20}},sourceSeries:raw,createdAt:raw.observedAt,knowledgeCutoff:raw.observedAt};
const a=buildSignalExample(input); assert.equal(a.example.eligibility.status,'eligible'); assert.equal(a.example.reference.close,219.5);
const unfinished=clone(raw); unfinished.closes[240]=99999;
assert.deepEqual(buildSignalExample({...input,asset:{...input.asset,price:1},sourceSeries:unfinished}).example.features,a.example.features);
const changed=clone(raw); changed.closes[239]=220; assert.notDeepEqual(buildSignalExample({...input,sourceSeries:changed}).example.features,a.example.features);
for(const mutate of [s=>s.closes.splice(0,230),s=>s.closes[10]=NaN,s=>s.rangeVerified[2]=false,s=>s.highs.pop(),s=>s.currency='USDT',s=>s.symbol='OTHER']) {
  const bad=clone(raw); mutate(bad); assert.equal(buildSignalExample({...input,sourceSeries:bad}).example.eligibility.status,'ineligible');
}
const crypto=clone(raw); Object.assign(crypto,{provider:'binance',currency:'USDT',calendar:{provider:'binance',interval:'1d',timeZone:'UTC',basis:'binance_klines_default_timezone'},technicalData:{fetchedAt:raw.observedAt}});
assert.equal(buildSignalExample({...input,asset:{symbol:'ABC',market:'crypto',currency:'USD'},sourceSeries:crypto}).example.reference.currency,'USDT');
console.log('learning-features: PASS');
module.exports={series};
