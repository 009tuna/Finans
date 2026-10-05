'use strict';
const {canonicalHash,instant,PRICE_FEATURES,validateLearningExample}=require('./learning-contract');
const {completedYahooHistory,completedCryptoHistory}=require('./daily-history');
const {sma,rsi,atr}=require('./indicators');
function buildSignalExample({asset,sourceSeries,createdAt,knowledgeCutoff,marketRegime=null}) {
  const cutoff=instant(knowledgeCutoff); instant(createdAt);
  if(!asset || !['us','bist','crypto'].includes(asset.market) || typeof asset.symbol!=='string') throw Error('invalid asset');
  const provider=asset.market==='crypto'?'binance':'yahoo', schema='price-features-v1';
  const currency=sourceSeries?.currency||'unknown', priceBasis=sourceSeries?.priceBasis||'unknown';
  const cohort=[asset.market,asset.symbol,provider,currency,priceBasis,schema].join('/');
  const reasons=[],features=Object.fromEntries(PRICE_FEATURES.map(k=>[k,null])); let completed=null;
  const observed=sourceSeries?.observedAt||sourceSeries?.technicalData?.fetchedAt;
  let sourceObservedAt=knowledgeCutoff;
  try {
    if(instant(observed)>cutoff) throw Error('future_source'); sourceObservedAt=observed;
    if(sourceSeries.symbol!==asset.symbol || sourceSeries.provider!==provider || priceBasis==='unknown') throw Error('source_identity_or_basis_missing');
    if(currency!==(asset.market==='crypto'?'USDT':asset.market==='bist'?'TRY':'USD')) throw Error('currency_mismatch');
    completed=(asset.market==='crypto'?completedCryptoHistory:completedYahooHistory)(sourceSeries,cutoff);
    const s=completed.series,n=s.closes.length;
    if(n<220) throw Error('insufficient_history');
    for(const key of ['highs','lows','volumes','rangeVerified','volumeVerified']) if(!Array.isArray(s[key])||s[key].length!==n) throw Error('missing_aligned_OHLCV');
    if(new Set(s.dates).size!==n || s.dates.some((d,i)=>i&&d<=s.dates[i-1])) throw Error('unverified_bar_dates');
    for(let i=0;i<n;i++) {
      if(![s.closes[i],s.highs[i],s.lows[i]].every(v=>Number.isFinite(v)&&v>0) || !Number.isFinite(s.volumes[i]) || s.volumes[i]<0 || s.highs[i]<s.closes[i] || s.lows[i]>s.closes[i] || s.rangeVerified[i]!==true || s.volumeVerified[i]!==true) throw Error('invalid_or_unverified_OHLCV');
    }
    const close=s.closes.at(-1), a=atr(s.highs,s.lows,s.closes,14);
    if(!(a>0)) throw Error('invalid_ATR');
    Object.assign(features,{return21:(close/s.closes[n-22]-1)*100,return63:(close/s.closes[n-64]-1)*100,return126:(close/s.closes[n-127]-1)*100,atrPct:a/close*100,rsi14:rsi(s.closes,14),distanceSma50Atr:(close-sma(s.closes,50))/a,distanceSma200Atr:(close-sma(s.closes,200))/a});
    if(!Object.values(features).every(Number.isFinite)) throw Error('nonfinite_features');
  } catch(e) { reasons.push(e.message); for(const key of PRICE_FEATURES) features[key]=null; }
  const s=completed?.series;
  const bars=s?s.dates.map((date,i)=>({date,close:s.closes[i],high:s.highs?.[i]??null,low:s.lows?.[i]??null,volume:s.volumes?.[i]??null,sourceTimestamp:s.sourceTimestamps[i]})).filter(b=>[b.close,b.high,b.low,b.volume].every(v=>v===null||Number.isFinite(v))):[];
  const evidence={provider,symbol:asset.symbol,currency,priceBasis,bars};
  const reference=s?{barDate:s.dates.at(-1),close:Number.isFinite(s.closes.at(-1))?s.closes.at(-1):null,currency,priceBasis,timeZone:asset.market==='crypto'?'UTC':s.timeZone}:null;
  const example={schemaVersion:1,id:'price:'+cohort+':'+(reference?.barDate||'unavailable:'+knowledgeCutoff),kind:'price',cohort,createdAt,knowledgeCutoff,sourceObservedAt,featureSchemaVersion:schema,features,evidenceHash:canonicalHash(evidence),
    eligibility:{status:reasons.length?'ineligible':'eligible',reasons},reference,source:{provider,symbol:asset.symbol,currency,priceBasis},
    candidate:{strategyVersion:String(asset.strategyVersion||asset.analysis?.strategyVersion||'legacy-observation'),reason:'watchlist_observation'},marketRegime:typeof marketRegime==='string'?marketRegime:null};
  validateLearningExample(example); return {example,evidence};
}
module.exports={buildSignalExample};
