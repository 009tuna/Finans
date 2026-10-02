'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const start = source.indexOf('async function load()');
const end = source.indexOf('/* ---------- Yönetici parolası', start);
const loadSource = source.slice(start, end);
function deferred() { let resolve, reject; const promise = new Promise((ok, fail) => { resolve=ok;reject=fail; }); return {promise,resolve,reject}; }
function harness(reportCache) {
  const reads = Object.fromEntries(['portfolio','journal','report'].map(key=>[key,deferred()]));
  const started = [], painted = [], status = {};
  const context = vm.createContext({
    DATA:{generatedAt:'old'},activeView:'us',booted:true,loadFailures:0,REPORT_CACHE:reportCache,
    $:()=>status,document:{querySelectorAll:()=>[]},
    fetch:async()=>({ok:true,json:async()=>({generatedAt:'new',us:[]})}),
    loadPortfolio:()=>{started.push('portfolio');return reads.portfolio.promise;},
    loadJournal:()=>{started.push('journal');return reads.journal.promise;},
    loadReportCache:()=>{started.push('report');return reads.report.promise;},
    updateFreshness(){},renderView(){painted.push({snapshot:context.DATA.generatedAt,report:context.REPORT_CACHE});},
    setTimeout(){throw new Error('healthy price data must not schedule a full-load retry');},
  });
  vm.runInContext(loadSource,context);
  return {context,reads,started,painted};
}
(async()=>{
  const oldReport={base:{runId:'last-good'},ai:{todayFocus:'Preserved research'}};
  const h=harness(oldReport);const pending=h.context.load();
  await new Promise(setImmediate);
  assert.deepEqual(h.started,['portfolio','journal','report'],'all independent reads start before any of them finishes');
  assert.equal(h.painted.length,0,'do not paint default empty portfolio/journal values as loaded state');
  h.reads.portfolio.resolve(true);h.reads.journal.resolve();
  await new Promise(setImmediate);
  assert.equal(h.painted.length,0,'a pending report is still accounted for');
  h.reads.report.reject(new Error('report unavailable'));await pending;
  assert.equal(h.context.REPORT_CACHE,oldReport,'report failure retains the last successful content');
  assert.equal(h.painted.length,1,'the usable price screen still paints after a partial failure');
  assert.equal(h.painted[0].snapshot,'new');assert.equal(h.context.loadFailures,0);
  const first=harness(null);const initial=first.context.load();await new Promise(setImmediate);
  first.reads.portfolio.resolve(false);first.reads.journal.resolve();first.reads.report.reject(new Error('no report'));await initial;
  assert.equal(first.context.REPORT_CACHE,null,'an unavailable first report is not fabricated');
  assert.equal(first.painted.length,1,'a missing report does not block technical data');
  console.log('Initial UI reads overlap and retain successful report content on partial failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
