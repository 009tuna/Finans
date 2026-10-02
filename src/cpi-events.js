'use strict';
const { createHash } = require('node:crypto');
const { METRICS, archiveUrl } = require('./cpi-sources');
const METHODS = Object.freeze({ last_first_release_v1: 'last_first_release_v1', consecutive_three_first_releases_v1: 'consecutive_three_first_releases_v1' });
const time = value => Date.parse(value);
function valid(row) {
 const policy = METRICS.find(m => m.metric === row?.metric);
 return Boolean(policy && row.unit === policy.unit && row.adjustment === policy.adjustment && row.frequency === policy.frequency && typeof row.id === 'string' && row.vintage === 'first_release' && Number.isFinite(row.value) && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.period) && Number.isFinite(time(row.publishedAt)) && Number.isFinite(time(row.observedAt)) && time(row.publishedAt) <= time(row.observedAt) && /^[a-f0-9]{64}$/i.test(row.contentHash || '') && row.sourceUrl === archiveUrl(row.publishedAt.slice(0,10)));
}
const id = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,24);
function previous(period, count) {
 const [year, month] = period.split('-').map(Number);
 return Array.from({length:count}, (_, index) => { const d = new Date(Date.UTC(year,month-2-index,1)); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0'); }).reverse();
}
function forecastFor(event, method, observations, cutoff) {
 const periods = previous(event.period, method === METHODS.last_first_release_v1 ? 1 : 3);
 const eligible = observations.filter(row => row.metric === event.metric && valid(row) && !row.contested && time(row.publishedAt) <= time(cutoff) && time(row.observedAt) <= time(cutoff));
 const inputs = periods.map(period => eligible.find(row => row.period === period));
 const proof = inputs.filter(Boolean).map(row => structuredClone(row));
 const status = !Object.values(METHODS).includes(method) || inputs.some(row => !row) ? 'insufficient_history' : 'frozen';
 return {status, estimate:status === 'frozen' ? proof.reduce((sum,row)=>sum+row.value,0)/proof.length : null, unit:'percent', inputIds:proof.map(row=>row.id), inputHashes:proof.map(row=>row.contentHash), inputProof:proof, requiredPeriods:periods};
}
function scorecards(outcomes, metric) {
 return Object.values(METHODS).map(methodId => {
  const rows = outcomes.filter(row => row.metric === metric && row.methodId === methodId && !row.contested && Number.isFinite(row.error));
  return {methodId,status:rows.length?'available':'insufficient_sample',sampleSize:rows.length,mae:rows.length?rows.reduce((sum,row)=>sum+Math.abs(row.error),0)/rows.length:null,bias:rows.length?rows.reduce((sum,row)=>sum+row.error,0)/rows.length:null,errorConvention:'actual_minus_estimate',errorUnit:'percentage_point'};
 });
}
module.exports = {METHODS,valid,previous,forecastFor,scorecards,id};

