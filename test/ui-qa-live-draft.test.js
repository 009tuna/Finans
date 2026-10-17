'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {createQaServer,readLiveDraft} = require('../scripts/ui-qa-server');
const {toAiReport} = require('../src/research-runner');
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'finans-qa-live-draft-'));
  const paths=Object.fromEntries(['draft','input','validation','stage'].map(key=>[key+'Path',path.join(directory,key+'.json')]));
  const cut='2026-10-03T10:00:00.000Z', generated='2026-10-03T10:20:00.000Z';
  const stage={base:{date:'2026-10-03',runId:'source-run',snapshotId:cut,generatedAt:'2026-10-03T10:01:00.000Z'},snapshot:{generatedAt:cut,us:[],bist:[],crypto:[]}};
  const research={macroSummary:'Synthetic acceptance fixture',todayFocus:'Synthetic fixture only',commentary:{us:'Evidence missing',bist:'Evidence missing',crypto:'Evidence missing'},
    coverage:['us','bist','crypto'].map(market=>({market,status:'insufficient_evidence',reason:'Synthetic acceptance fixture'})),
    sources:[],events:[],forecasts:[],scenarios:[],signals:[],unresolvedQuestions:[],forecastAbstentions:[],expectationReassessments:[],
    marketViews:Object.fromEntries(['us','bist','crypto'].map(market=>[market,{stance:'nötr',conviction:'düşük',thesis:'Synthetic fixture',drivers:[],risks:[],watch:''}])),calendarAnalysis:[],turkeyCalendar:[],
    model:'gpt-6.1-sol',promptVersion:require('../src/research-runner').PROMPT_VERSION,runId:'draft-run',snapshotId:cut,analysisAsOf:'2026-10-03T10:10:00.000Z',generatedAt:generated};
  const ai=toAiReport(research,{...stage.base,runId:'draft-run',signalOverlay:null});
  const draft={status:'isolated_draft',persistedToPublication:false,persistedToLedger:false,sourceRunId:'source-run',draftRunId:'draft-run',pricesAsOf:cut,analysisAsOf:research.analysisAsOf,generatedAt:generated,ai};
  const input={status:'isolated_draft_input',sourceRunId:'source-run',draftRunId:'draft-run',pricesAsOf:cut,baseGeneratedAt:stage.base.generatedAt,context:{runId:'draft-run',snapshotId:cut,analysisAsOf:research.analysisAsOf,assets:[],expectationAgenda:[]}};
  const checks=['generationSchema','researchSemantics','expectationCoverage','reportSnapshotIntegrity','frozenFirstRecordsUnchanged','actualLedgerRevisionUnchanged','actualLedgerContentUnchanged'];
  const validation={status:'validated_draft_only',checkedAt:'2026-10-03T10:21:00.000Z',model:research.model,promptVersion:research.promptVersion,checks:Object.fromEntries(checks.map(key=>[key,true]))};
  const fixture={draft,input,validation,stage};
  const write=()=>Object.entries(fixture).forEach(([key,value])=>fs.writeFileSync(paths[key+'Path'],JSON.stringify(value)));
  let server;
  try {
    write();
    const preview=await readLiveDraft(paths);
    assert.deepEqual(preview.data,stage.snapshot,'preview prices must be the actual frozen model input');
    assert.equal(preview.base.runId,'draft-run');
    assert.equal(preview.qa.published,false);
    assert.equal(preview.qa.ledgerWritten,false);
    assert.deepEqual(preview.ai,ai);
    fixture.draft={...draft,error:'Rejected model response'};write();
    await assert.rejects(readLiveDraft(paths),/reddedilmiş yanıt/);
    fixture.draft={...draft,pricesAsOf:'2026-10-03T09:00:00.000Z'};write();
    await assert.rejects(readLiveDraft(paths),/fiyat kesitiyle eşleşmiyor/);
    fixture.draft=structuredClone(draft);fixture.draft.ai.macroSummary='Changed after validation';write();
    await assert.rejects(readLiveDraft(paths),/araştırma içeriğinden farklı/);
    fixture.draft=draft;fixture.validation={...validation,checks:{...validation.checks,actualLedgerContentUnchanged:false}};write();
    await assert.rejects(readLiveDraft(paths),/kontrollerinin tümü/);
    fixture.validation=validation;write();
    const upstream=[];
    server=await createQaServer({sourceUrl:'http://fixture.invalid',liveDraftPaths:paths,fetchImpl:async(url,options)=>{
      upstream.push({path:new URL(url).pathname,method:options?.method||'GET'});
      return {status:200,json:async()=>new URL(url).pathname==='/api/report'?{automation:{status:'failed',lastError:'Existing real failure'}}:new URL(url).pathname==='/api/data'?{generatedAt:'2000-01-01T00:00:00Z'}:{us:[],bist:[],crypto:[]}};
    }});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const url='http://127.0.0.1:'+server.address().port;
    const headers={Cookie:'qa_fixture=live-draft; qa_session=test-live-draft'};
    const response=await fetch(url+'/api/report',{headers});assert.equal(response.status,200);
    const report=await response.json();assert.equal(report.ai.runId,'draft-run');
    assert.equal(report.automation.status,'failed','a manual draft cannot manufacture completed automation status');
    const data=await (await fetch(url+'/api/data',{headers})).json();assert.deepEqual(data,stage.snapshot);
    const html=await (await fetch(url+'/?qa=live-draft')).text();assert.match(html,/Canlı model taslağı · Yayınlanmadı/);
    for(const route of ['/api/journal','/api/portfolio']) assert.equal((await fetch(url+route,{headers,method:'POST',body:'{}'})).status,500);
    assert.ok(upstream.every(call=>call.method==='GET'),'fixture cannot write through to the real app');
    console.log('Live draft QA verifies frozen inputs, rejects altered/rejected reports and preserves real automation state without writes');
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    for(const file of Object.values(paths)) if(fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
