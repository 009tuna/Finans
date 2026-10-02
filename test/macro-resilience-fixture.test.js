'use strict';
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {createQaServer} = require('../scripts/ui-qa-server');
const {createStages,toolbar} = require('../scripts/macro-resilience-ui-qa');
(async()=>{
  const original = {status:'available',observations:[],modelForecasts:[{id:'qa-nfp'}],families:{}};
  const before = structuredClone(original);
  const stages = createStages(original);
  assert.deepEqual(original,before,'acceptance stages do not mutate the input');
  const calls = [];
  const server = await createQaServer({macroFixture:{stages,toolbar},fetchImpl:async(url,options)=>{
    calls.push({path:new URL(url).pathname,method:options?.method || 'GET'});
    return {status:200,json:async()=>({})};
  }});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = 'http://127.0.0.1:'+server.address().port;
  async function request(path,cookie,method='GET',body) {
    const response = await fetch(base+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,value:await response.json()};
  }
  try {
    const cookie = 'qa_fixture=cpi-model; qa_session=resilience-test';
    const independent = 'qa_fixture=cpi-model; qa_session=other-test';
    assert.equal((await request('/api/macro',cookie)).value.families.us_cpi.modelForecasts.length,4);
    assert.equal((await request('/api/qa-macro-stage',cookie,'POST',{stage:'research-error'})).status,200);
    const degraded = await request('/api/macro',cookie);
    assert.equal(degraded.status,200);
    assert.equal(degraded.value.researchStatus,'unavailable');
    assert.equal(degraded.value.families.us_cpi.metrics[0].previousFirstRelease.value,0.6);
    assert.equal(degraded.value.families.us_cpi.modelForecasts.length,0);
    assert.equal((await request('/api/macro',independent)).value.researchStatus,'available','sessions do not share failed stages');
    assert.equal((await request('/api/qa-macro-stage',cookie,'POST',{stage:'__proto__'})).status,400);
    assert.equal((await request('/api/qa-macro-stage',cookie,'POST',{stage:'offline'})).status,200);
    assert.equal((await request('/api/macro',cookie)).status,503);
    assert.equal((await request('/api/qa-macro-stage',cookie,'POST',{stage:'recovered-empty'})).status,200);
    const recovered = await request('/api/macro',cookie);
    assert.equal(recovered.value.researchStatus,'available');
    assert.equal(recovered.value.families.us_cpi.modelForecasts.length,0);
    assert.equal((await request('/api/qa-state',cookie)).value.realWrites,0);
    assert.equal((await request('/api/portfolio',cookie,'POST',{us:[]})).status,500);
    assert.ok(calls.every(call=>call.method==='GET'),'no test writes reach upstream');
    const page = await fetch(base+'/?qa=cpi-model');
    const html = await page.text();
    assert.match(html,/güncellenen değerler sentetiktir/);
    assert.match(html,/qa-macro-stage/);
  } finally {await new Promise(resolve=>server.close(resolve));}
  console.log('Macro failure fixture: session isolation, recovery, 503, mutation and upstream write guards passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
