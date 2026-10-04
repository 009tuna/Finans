'use strict';
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createQaServer } = require('../scripts/ui-qa-server');

(async () => {
  const upstreamCalls = [];
  const initialPortfolio = {us:[],bist:[],crypto:[]};
  const initialData = {
    us:[{symbol:'BAD-US',price:null,__error:true},{symbol:'SOURCE-US',price:200}],
    bist:[{symbol:'BAD-BIST',price:NaN},{symbol:'SOURCE-BIST',price:80}],
    crypto:[{symbol:'SOURCE-CRYPTO',price:500}],
    fx:{usdtry:41,rates:{
      'USD/TRY':{base:'USD',quote:'TRY',price:41,quoteTime:'2026-10-03T08:00:00.000Z'},
      'EUR/TRY':{base:'EUR',quote:'TRY',price:46,quoteTime:'2026-10-03T08:00:00.000Z'}
    }}
  };
  const dataBefore = structuredClone(initialData);
  const initialJournal = {
    notes:{},alerts:[],predictions:[{id:'protected-prediction',outcome:'open'}],
    decisionAudits:[],learningRules:[],reviewQueue:[],_revision:'upstream-revision'
  };
  const server = await createQaServer({
    sourceUrl:'http://fixture.invalid',writeDelayMs:25,
    fetchImpl:async (url, options) => {
      upstreamCalls.push({path:new URL(url).pathname,method:options?.method || 'GET'});
      const pathname = new URL(url).pathname;
      return {status:200,json:async()=>structuredClone(pathname === '/api/portfolio' ? initialPortfolio : pathname === '/api/journal' ? initialJournal : pathname === '/api/data' ? initialData : {})};
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

    const journalError = 'qa_fixture=journal-error; qa_session=test-journal-error';
    assert.equal((await request('/api/journal',journalError)).status,500);
    assert.deepEqual((await request('/api/portfolio',journalError)).value,initialPortfolio,'journal outage does not alter portfolio read');
    assert.deepEqual((await request('/api/data',journalError)).value,JSON.parse(JSON.stringify(initialData)),'journal outage leaves market/FX data unchanged');
    assert.equal((await request('/api/report',journalError)).status,200);
    assert.equal((await request('/api/macro',journalError)).status,200);

    const syntheticPortfolio = {us:[{symbol:'SOURCE-US',amount:1,avgPrice:180}],bist:[{symbol:'SOURCE-BIST',amount:1,avgPrice:72}],crypto:[]};
    for (const fixture of ['missing-fx','priced-portfolio']) {
      const cookie = 'qa_fixture='+fixture+'; qa_session=test-'+fixture;
      assert.deepEqual((await request('/api/portfolio',cookie)).value,syntheticPortfolio,'seed picks valid symbols from source markets and uses their observed prices');
      const data = (await request('/api/data',cookie)).value;
      assert.deepEqual(data.us,JSON.parse(JSON.stringify(initialData.us)));
      assert.deepEqual(data.bist,JSON.parse(JSON.stringify(initialData.bist)));
      assert.deepEqual(data.fx.rates['EUR/TRY'],initialData.fx.rates['EUR/TRY'],'unrelated FX pairs remain available');
      if (fixture === 'missing-fx') {
        assert.equal('usdtry' in data.fx,false);
        assert.equal('USD/TRY' in data.fx.rates,false,'both scalar fallback and identified FX quote are missing');
      } else {
        assert.deepEqual(data.fx,initialData.fx,'priced fixture preserves the observed FX quote');
      }
      assert.equal((await request('/api/portfolio',cookie,'POST',portfolio)).status,500,'read-only fixture does not accept synthetic or real writes');
      assert.equal((await request('/api/journal',cookie,'POST',journal)).status,500);
      assert.deepEqual((await request('/api/portfolio',cookie)).value,syntheticPortfolio,'rejected save does not modify fixture holdings');
      const fixtureState = (await request('/api/qa-state',cookie)).value;
      assert.equal(fixtureState.syntheticPortfolio,true);
      assert.equal(fixtureState.realWrites,0);
      assert.equal(fixtureState.attempts.portfolio,0,'write-success handling remains limited to success/retry fixtures');
      const fixturePage = await fetch(base+'/?qa='+fixture);
      const fixtureHtml = await fixturePage.text();
      assert.ok(fixtureHtml.includes('data-qa-portfolio="synthetic"'));
      assert.ok(fixtureHtml.includes('Gerçek portföy değildir; kayıt yazılmaz.'));
      if (fixture === 'missing-fx') assert.ok(fixtureHtml.includes('USD/TRY kuru bu senaryoda kaldırıldı.'));
    }
    assert.deepEqual(initialData,dataBefore,'fixture FX deletion and seeds never mutate upstream snapshots');
    assert.deepEqual((await request('/api/portfolio','qa_fixture=full')).value,initialPortfolio,'real empty portfolio remains empty outside seed fixtures');
    assert.deepEqual((await request('/api/data','qa_fixture=full')).value,JSON.parse(JSON.stringify(initialData)),'normal fixtures retain source FX');

    for (const fixture of ['full','portfolio-error','empty','journal-error']) {
      assert.equal((await request('/api/portfolio','qa_fixture='+fixture,'POST',portfolio)).status,500);
      assert.equal((await request('/api/journal','qa_fixture='+fixture,'POST',journal)).status,500);
    }
    assert.equal((await request('/api/unknown-write',success,'POST',{})).status,500);
    assert.equal((await request('/api/portfolio',success,'PUT',portfolio)).status,405);
    assert.equal((await request('/api/chart',success,'DELETE')).status,405);
    assert.ok(upstreamCalls.every(call=>call.method === 'GET'),'no portfolio, journal or unknown write reaches upstream');
    const mathCalls = upstreamCalls.length;
    assert.equal((await request('/api/forecast/scenarios',success,'POST',{portfolio:initialPortfolio,data:initialData})).status,200);
    assert.deepEqual(upstreamCalls.slice(mathCalls),[{path:'/api/forecast/scenarios',method:'POST'}],'only the explicit read-only calculation is forwarded');
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
