'use strict';
const {DAY,iso,hash}=require('../../src/structural-data');
function observation(n=240) {
  const start=Date.parse('2026-01-01T00:00:00Z');
  const bars=Array.from({length:n},(_,i)=>{
    const close=i<170?80+i*.12:101+(i-170)*.006;
    const low=i<170?close-1:100.8, high=i<170?close+1:105;
    return {date:iso(start+i*DAY).slice(0,10),barStartAt:iso(start+i*DAY),barEndAt:iso(start+(i+1)*DAY-1),open:close,close,high,low,volume:100,openVerified:true,rangeVerified:true,volumeVerified:true,completed:true,evidenceHash:hash({i,close}),timestampRole:'session_open'};
  });
  for(const i of [180,200]) if(bars[i]) {bars[i].low=100;bars[i].high=115;}
  if(bars[n-2]) {bars[n-2].close=100.2;bars[n-2].low=100.15;}
  if(bars[n-1]) {bars[n-1].close=100.4;bars[n-1].low=100.1;}
  const at=iso(start+n*DAY+12*3600000);
  return {provider:'binance',market:'crypto',symbol:'BTC',sourceSymbol:'BTCUSDT',currency:'USDT',priceBasis:'unadjusted',timeZone:'UTC',sourceObservedAt:at,generationCutoffAt:at,effectiveCutoffAt:at,status:'verified',reasons:[],bars,calendar:{status:'verified',version:'binance-utc-daily-v1',provider:'binance',interval:'1d',timeZone:'UTC',basis:'binance_klines_default_timezone'},coverage:{missingDates:[]},evidenceHash:hash(bars)};
}
function freshBar(date,{open=101,high=103,low=100,close=102,completed=true,...extra}={}) {
  const start=Date.parse(date+'T00:00:00Z');
  return {date,open,high,low,close,volume:100,openVerified:true,rangeVerified:true,volumeVerified:true,completed,barStartAt:iso(start),barEndAt:iso(start+DAY-1),evidenceHash:hash({date,open,high,low,close}),...extra};
}
module.exports={observation,freshBar};
