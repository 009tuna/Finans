'use strict';
const {canonicalHash,instant}=require('./learning-contract');
function addCalendarDays(date,days) {
  if(!/^\d{4}-\d\d-\d\d$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw Error('invalid reference date');
  const d=new Date(date+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
function resolvePriceLabel({example,observations=[],coverage,horizonDays,asOf}) {
  if(![90,180].includes(horizonDays)) throw Error('unsupported horizon');
  const cutoff=instant(asOf), result=(status,reason)=>({status,label:null,reasons:[reason]});
  if(example.kind!=='price'||example.eligibility.status!=='eligible'||!(example.reference?.close>0)) return result('excluded','ineligible_example');
  const targetDate=addCalendarDays(example.reference.barDate,horizonDays);
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:example.reference.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(cutoff));
  if(localDate<targetDate) return result('pending','horizon_open');
  const hash=/^[a-f0-9]{64}$/;
  if(!coverage?.verified || !hash.test(coverage.evidenceHash) || !Array.isArray(coverage.sessionDates) || coverage.startDate>targetDate || coverage.endDate<targetDate) return result('unresolved','session_coverage_missing');
  if(instant(coverage.observedAt)>cutoff) return result('pending','coverage_not_observed');
  for(const key of ['provider','symbol','currency','priceBasis']) if(coverage[key]!==example.source[key]) return result('excluded','coverage_source_mismatch');
  const dates=coverage.sessionDates;
  if(dates.some((d,i)=>!/^\d{4}-\d\d-\d\d$/.test(d)||i&&d<=dates[i-1])) return result('unresolved','invalid_session_calendar');
  const terminalDate=dates.find(d=>d>=targetDate && d<=coverage.endDate);
  if(!terminalDate) return result('unresolved','first_session_not_proven');
  const bars=observations.filter(b=>b.date===terminalDate);
  if(bars.length!==1) return result('unresolved','first_session_close_missing_or_duplicate');
  const bar=bars[0];
  if(bar.splitDetected || bar.currency!==example.reference.currency || bar.priceBasis!==example.reference.priceBasis) return result('excluded','price_basis_changed');
  if(bar.completed!==true || !Number.isFinite(bar.close)||bar.close<=0||!hash.test(bar.evidenceHash)) return result('unresolved','close_not_verified');
  const effective=instant(bar.effectiveAt), observed=instant(bar.observedAt);
  if(effective>cutoff||observed>cutoff) return result('pending','close_not_observed');
  if(observed<effective) return result('excluded','invalid_observation_order');
  const targetId='price-return-'+horizonDays+'d', value=(bar.close/example.reference.close-1)*100;
  if(!Number.isFinite(value)) return result('excluded','nonfinite_return');
  const availableAt=new Date(Math.max(observed,instant(coverage.observedAt),cutoff)).toISOString();
  const label={schemaVersion:1,id:'label:'+example.id+':'+targetId,kind:'price',cohort:example.cohort,exampleId:example.id,targetId,horizonDays,targetDate,terminalDate,createdAt:asOf,effectiveAt:bar.effectiveAt,observedAt:bar.observedAt,availableAt,
    value,unit:'percent_return',referenceClose:example.reference.close,terminalClose:bar.close,currency:bar.currency,priceBasis:bar.priceBasis,evidenceHash:canonicalHash({reference:example.evidenceHash,terminal:bar.evidenceHash,coverage:coverage.evidenceHash}),eligibility:{status:'eligible',reasons:[]}};
  return {status:'resolved',label,reasons:[]};
}
module.exports={resolvePriceLabel,addCalendarDays};
