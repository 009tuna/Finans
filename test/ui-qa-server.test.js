'use strict';
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createQaServer } = require('../scripts/ui-qa-server');

(async () => {
  const upstreamCalls = [];
  const initialPortfolio = {us:[],bist:[],crypto:[]};
  const initialJournal = {
    notes:{},alerts:[],predictions:[{id:'protected-prediction',outcome:'open'}],
    decisionAudits:[],learningRules:[],reviewQueue:[],_revision:'upstream-revision'
  };
  const server = await createQaServer({
    sourceUrl:'http://fixture.invalid',writeDelayMs:25,
    fetchImpl:async (url, options) => {
      upstreamCalls.push({path:new URL(url).pathname,method:options?.method || 'GET'});
      const pathname = new URL(url).pathname;
      return {status:200,json:async()=>structuredClone(pathname === '/api/portfolio' ? initialPortfolio : pathname === '/api/journal' ? initialJournal : {})};
    }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(path, cookie, method='GET', value) {
    const response = await fetch(base + path,{
      method,headers:{Cookie:cookie,'Content-Type':'application/json'},
      ...(value === undefined ? {} : {body:JSON.stringify(value)})
    });
    return {status:response.status,value:await response.json()};
  }
  try {
    const success = 'qa_fixture=success; qa_session=test-success';
    const other = 'qa_fixture=success; qa_session=test-other';
    const portfolio = {us:[{symbol:'aapl',amount:2,avgPrice:170}],bist:[],crypto:[]};
    const began = Date.now();
    assert.deepEqual(await request('/api/portfolio',success,'POST',portfolio),{status:200,value:{success:true}});
    assert.ok(Date.now()-began >= 20,'mock save exposes pending state');
    assert.equal((await request('/api/portfolio',success)).value.us[0].symbol,'AAPL');
    assert.deepEqual((await request('/api/portfolio',other)).value,initialPortfolio,'sessions do not share edits');

    const journal = (await request('/api/journal',success)).value;
    journal.notes['us:AAPL']={thesis:'QA note',invalidation:'QA invalidation',updatedAt:'2026-09-30T10:00:00.000Z'};
    const noteSaved = await request('/api/journal',success,'POST',journal);
    assert.equal(noteSaved.status,200);
    assert.notEqual(noteSaved.value._revision,journal._revision);
    assert.equal((await request('/api/journal',success)).value.notes['us:AAPL'].thesis,'QA note');
    const stale = await request('/api/journal',success,'POST',journal);
    assert.equal(stale.status,409,'stale journal requests cannot overwrite a newer revision');
    const protectedChange = {...noteSaved.value,predictions:[]};
    assert.equal((await request('/api/journal',success,'POST',protectedChange)).status,400);

    const alarmCandidate = structuredClone(noteSaved.value);
    alarmCandidate.alerts.push({id:'us:AAPL:price',market:'us',symbol:'AAPL',trigger:'price',action:'Watch',enabled:true,createdAt:'2026-09-30T10:00:00.000Z'});
    const parallel = await Promise.all([
      request('/api/journal',success,'POST',alarmCandidate),request('/api/journal',success,'POST',alarmCandidate)
    ]);
    assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409],'simultaneous journal saves preserve CAS');
    assert.equal((await request('/api/journal',success)).value.alerts.length,1);
    let state = (await request('/api/qa-state',success)).value;
    assert.equal(state.attempts.portfolio,1);
    assert.equal(state.successes.portfolio,1);
    assert.equal(state.successes.note,1);
    assert.equal(state.successes.alert,1);
    assert.equal(state.realWrites,0);

    const retry = 'qa_fixture=retry; qa_session=test-retry';
    assert.equal((await request('/api/portfolio',retry,'POST',portfolio)).status,500);
    assert.deepEqual((await request('/api/portfolio',retry)).value,initialPortfolio);
    assert.equal((await request('/api/portfolio',retry,'POST',portfolio)).status,200);
    const retryNote = (await request('/api/journal',retry)).value;
    retryNote.notes['us:AAPL']={thesis:'retry note'};
    assert.equal((await request('/api/journal',retry,'POST',retryNote)).status,500);
    const retryNoteSaved = await request('/api/journal',retry,'POST',retryNote);
    assert.equal(retryNoteSaved.status,200);
    const retryAlert = {...retryNoteSaved.value,alerts:alarmCandidate.alerts};
    assert.equal((await request('/api/journal',retry,'POST',retryAlert)).status,500);
    assert.equal((await request('/api/journal',retry,'POST',retryAlert)).status,200);
    state = (await request('/api/qa-state',retry)).value;
    for (const operation of ['portfolio','note','alert']) {
      assert.equal(state.attempts[operation],2);
      assert.equal(state.successes[operation],1);
      assert.equal(state.failures[operation],1);
    }

    for (const fixture of ['full','portfolio-error','empty']) {
      assert.equal((await request('/api/portfolio','qa_fixture='+fixture,'POST',portfolio)).status,500);
      assert.equal((await request('/api/journal','qa_fixture='+fixture,'POST',journal)).status,500);
    }
    assert.equal((await request('/api/unknown-write',success,'POST',{})).status,500);
    assert.equal((await request('/api/portfolio',success,'PUT',portfolio)).status,405);
    assert.equal((await request('/api/chart',success,'DELETE')).status,405);
    assert.ok(upstreamCalls.every(call=>call.method === 'GET'),'no portfolio, journal or unknown write reaches upstream');
    assert.deepEqual(initialPortfolio,{us:[],bist:[],crypto:[]});
    assert.deepEqual(initialJournal.notes,{});

    const page = await fetch(base+'/?qa=success');
    assert.ok(page.headers.getSetCookie().some(cookie=>cookie.startsWith('qa_session=')));
    const html = await page.text();
    assert.ok(html.includes('id = \'qa-metrics\''));
    assert.ok(html.includes("observe('layout-shift'"));
    assert.ok(html.includes("observe('event'"));
    console.log('UI QA fixture HTTP roundtrips, retry, session isolation, CAS, counters, and upstream write protection passed');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
