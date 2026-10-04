'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {METHODS,valid,forecastFor,previous,scorecards}=require('../src/cpi-events');
const {METRICS,archiveUrl}=require('../src/cpi-sources');
const metric=METRICS[0].metric,method=METHODS.last_first_release_v1;
function row(period='2026-08',value=0.4){return {...METRICS[0],id:period,metric,unit:'percent',period,value,vintage:'first_release',publishedAt:'2026-09-11T12:30:00.000Z',observedAt:'2026-09-11T12:31:00.000Z',sourceUrl:archiveUrl('2026-09-11'),contentHash:'a'.repeat(64)};}
const event={period:'2026-09',metric};
test('month arithmetic crosses calendar year',()=>assert.deepEqual(previous('2026-01',3),['2025-10','2025-11','2025-12']));
test('valid observation accepts negative and zero',()=>{assert.ok(valid(row('2026-08',-0.2)));assert.ok(valid(row('2026-08',0)));});
for(const [name,patch] of [['weak hash',{contentHash:'h'}],['moving URL',{sourceUrl:'https://www.bls.gov/news.release/cpi.htm'}],['wrong unit',{unit:'basis_points'}],['revision',{vintage:'revised'}],['prepublication acquisition',{observedAt:'2026-09-10T00:00:00Z'}],['missing actual',{value:null}]])test('rejects '+name,()=>assert.equal(valid({...row(),...patch}),false));
test('future acquisition never enters forecast',()=>assert.equal(forecastFor(event,method,[row()],'2026-09-11T12:30:30Z').estimate,null));
test('metric histories do not pool',()=>assert.equal(forecastFor(event,method,[{...row(),metric:METRICS[1].metric}],'2026-10-01').estimate,null));
test('three month method cannot skip missing month',()=>assert.equal(forecastFor(event,METHODS.consecutive_three_first_releases_v1,[row('2026-06'),row('2026-08')],'2026-10-01').estimate,null));
test('three consecutive values average with immutable copied proof',()=>{const rows=[row('2026-06',0),row('2026-07',0.2),row('2026-08',0.4)],f=forecastFor(event,METHODS.consecutive_three_first_releases_v1,rows,'2026-10-01');assert.ok(Math.abs(f.estimate-0.2)<1e-12);rows[0].value=99;assert.equal(f.inputProof[0].value,0);assert.equal(f.unit,'percent');});
test('contested input produces abstention',()=>assert.equal(forecastFor(event,method,[{...row(),contested:true}],'2026-10-01').estimate,null));
test('empty scorecard has null metrics',()=>{const s=scorecards([],metric)[0];assert.equal(s.sampleSize,0);assert.equal(s.bias,null);assert.equal(s.mae,null);});
test('scorecard excludes contested and other metrics and uses actual minus estimate',()=>{const s=scorecards([{metric,methodId:method,error:-0.2},{metric,methodId:method,error:10,contested:true},{metric:METRICS[1].metric,methodId:method,error:20}],metric)[0];assert.equal(s.sampleSize,1);assert.equal(s.bias,-0.2);assert.equal(s.mae,0.2);assert.equal(s.errorConvention,'actual_minus_estimate');});

test('rejects SA NSA or frequency mismatch',()=>{assert.equal(valid({...row(),adjustment:'not_seasonally_adjusted'}),false);assert.equal(valid({...row(),frequency:'annual'}),false);});
