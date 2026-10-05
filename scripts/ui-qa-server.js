// Isolated local UI acceptance server. Never forwards portfolio/journal writes.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const source = process.env.UI_QA_SOURCE || 'http://127.0.0.1:5190';
const port = Number(process.env.UI_QA_PORT || 5191);
const root = path.resolve(__dirname, '../public');
const allowedReads = ['/api/data', '/api/portfolio', '/api/journal', '/api/report', '/api/history', '/api/research', '/api/macro', '/api/market-news'];
const mathPaths = new Set(['/api/backtest', '/api/forecast/montecarlo', '/api/forecast/correlation', '/api/forecast/dcf', '/api/forecast/scenarios']);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };
const liveDraftDefaults = {
  draftPath: path.resolve(__dirname, '../docs/design-air/live-expectations-draft.json'),
  inputPath: path.resolve(__dirname, '../docs/design-air/live-expectations-draft-input.json'),
  validationPath: path.resolve(__dirname, '../docs/design-air/live-expectations-draft-validation.json'),
  stagePath: path.resolve(__dirname, '../data/report/base-stage.json'),
};
async function readLiveDraft(paths) {
  const [draft, input, validation, stage] = await Promise.all(['draftPath','inputPath','validationPath','stagePath'].map(async key => {
    try { return JSON.parse(await fs.promises.readFile(paths[key], 'utf8')); }
    catch (error) { throw new Error('QA canlı taslak dosyası okunamadı (' + key + '): ' + error.message); }
  }));
  const requireMatch = (condition, message) => { if (!condition) throw new Error('QA canlı taslak kabul edilmedi: ' + message); };
  requireMatch(draft?.status === 'isolated_draft' && draft.persistedToPublication === false && draft.persistedToLedger === false && !draft.error,
    'yalnız doğrulanmış, yayınlanmamış izole taslak okunabilir; reddedilmiş yanıt rapor değildir');
  requireMatch(input?.status === 'isolated_draft_input' && validation?.status === 'validated_draft_only', 'girdi ve kabul kaydı eksik');
  const checks = ['generationSchema','researchSemantics','expectationCoverage','reportSnapshotIntegrity','frozenFirstRecordsUnchanged','actualLedgerRevisionUnchanged','actualLedgerContentUnchanged'];
  requireMatch(checks.every(key => validation.checks?.[key] === true), 'kabul kontrollerinin tümü geçmeli');
  const ai = draft.ai, research = ai?.research, context = input.context;
  requireMatch(stage?.base && stage.snapshot && ai && research && context, 'donmuş temel rapor, fiyat kesiti veya model içeriği eksik');
  requireMatch(draft.sourceRunId === input.sourceRunId && draft.sourceRunId === stage.base.runId && draft.draftRunId === input.draftRunId
    && draft.draftRunId === ai.runId && draft.draftRunId === context.runId, 'çalışma kimlikleri eşleşmiyor');
  requireMatch(draft.pricesAsOf === input.pricesAsOf && draft.pricesAsOf === stage.snapshot.generatedAt && draft.pricesAsOf === stage.base.snapshotId
    && draft.pricesAsOf === context.snapshotId && draft.pricesAsOf === ai.snapshotId && input.baseGeneratedAt === stage.base.generatedAt,
    'taslak kendi donmuş fiyat kesitiyle eşleşmiyor');
  requireMatch(draft.analysisAsOf === context.analysisAsOf && draft.analysisAsOf === research.analysisAsOf
    && draft.generatedAt === ai.generatedAt && draft.generatedAt === research.generatedAt, 'araştırma ve üretim zamanları eşleşmiyor');
  const instants = [draft.pricesAsOf, stage.base.generatedAt, draft.analysisAsOf, draft.generatedAt, validation.checkedAt].map(value => Date.parse(value));
  requireMatch(instants.every(Number.isFinite) && instants.every((value,index) => !index || value >= instants[index - 1]), 'zaman sırası geçersiz');
  const frozenAssets = ['us','bist','crypto'].flatMap(market => (stage.snapshot[market] || []).map(asset => ({
    market, symbol:asset.symbol, name:asset.name, price:asset.price, currency:asset.currency || null,
    quoteTime:asset.quoteTime || null, technicalScore:asset.analysis?.score,
    pe:Number.isFinite(asset.pe) ? asset.pe : null, marketCap:Number.isFinite(asset.marketCap) ? asset.marketCap : null,
  })));
  requireMatch(isDeepStrictEqual(frozenAssets, context.assets), 'fiyatlar veya fiyat zamanları gerçek model girdisinden farklı');
  requireMatch(research.model === 'gpt-6.1-sol' && research.promptVersion === 'sol-research-v7'
    && validation.model === research.model && validation.promptVersion === research.promptVersion, 'model veya üretim sözleşmesi farklı');
  // These existing validators are pure here: no generation, ledger, publication or database method is called.
  const schema = require('../src/research-schema');
  const { checkSchema, toAiReport } = require('../src/research-runner');
  const { validateResearch } = require('../src/research-ledger');
  const { validateExpectationCoverage } = require('../src/research-expectations');
  const { validateAiReport } = require('../src/ai-publication');
  const generatedFields = Object.fromEntries(Object.keys(schema.properties).map(key => [key,research[key]]));
  checkSchema(generatedFields, {...schema, required:Object.keys(schema.properties)});
  validateResearch(research,draft.generatedAt);
  validateExpectationCoverage(research,context.expectationAgenda,draft.generatedAt);
  const base = {...structuredClone(stage.base),runId:draft.draftRunId,signalOverlay:null};
  requireMatch(isDeepStrictEqual(ai,toAiReport(research,base)), 'rapor alanları doğrulanmış araştırma içeriğinden farklı');
  validateAiReport(ai,base,stage.snapshot,draft.generatedAt);
  return {data:structuredClone(stage.snapshot),base,ai:structuredClone(ai),date:base.date,
    qa:{kind:'live-model-draft',published:false,ledgerWritten:false,sourceRunId:draft.sourceRunId,draftRunId:draft.draftRunId}};
}
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function body(req) { let value=''; for await (const part of req) value += part; return value; }
// Copy the journal's pure normalization contract without importing persistence/db modules.
function normalizeJournal(value) {
  return {
    ...(value && Object.prototype.hasOwnProperty.call(value, '_revision') ? {_revision:value._revision} : {}),
    notes:value && value.notes && typeof value.notes === 'object' ? value.notes : {},
    alerts:Array.isArray(value?.alerts) ? value.alerts : [],
    predictions:Array.isArray(value?.predictions) ? value.predictions : [],
    theses:value && value.theses && typeof value.theses === 'object' ? value.theses : {},
    catalysts:Array.isArray(value?.catalysts) ? value.catalysts : [],
    riskRules:Array.isArray(value?.riskRules) ? value.riskRules : [],
    decisionAudits:Array.isArray(value?.decisionAudits) ? value.decisionAudits : [],
    learningRules:Array.isArray(value?.learningRules) ? value.learningRules : [],
    reviewQueue:Array.isArray(value?.reviewQueue) ? value.reviewQueue : []
  };
}
function createFixtureState(snapshots, fixture) {
  const journal = normalizeJournal(structuredClone(snapshots.get('/api/journal')?.value));
  journal._revision = 'qa-' + randomUUID();
  const state = {
    fixture, isolated:true, realWrites:0,
    attempts:{portfolio:0,journal:0,note:0,alert:0},
    successes:{portfolio:0,journal:0,note:0,alert:0},
    failures:{portfolio:0,journal:0,note:0,alert:0},
    portfolio:structuredClone(snapshots.get('/api/portfolio')?.value || {us:[],bist:[],crypto:[]}),
    journal
  };
  if (['missing-fx','priced-portfolio'].includes(fixture)) {
    state.portfolio = {us:[],bist:[],crypto:[]};
    state.syntheticPortfolio = true;
    state.seedMissingMarkets = [];
    const data = snapshots.get('/api/data')?.value;
    for (const market of ['us','bist']) {
      const asset = (Array.isArray(data?.[market]) ? data[market] : []).find(item=>item
        && typeof item.symbol === 'string' && item.symbol.trim()
        && typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0 && !item.__error);
      if (asset) state.portfolio[market].push({symbol:asset.symbol,amount:1,avgPrice:asset.price * 0.9});
      else state.seedMissingMarkets.push(market);
    }
  }
  return state;
}
async function fixtureWrite(req, res, state, delayMs) {
  const route = req.url.split('?')[0] === '/api/portfolio' ? 'portfolio' : 'journal';
  let candidate;
  try { candidate = JSON.parse(await body(req)); }
  catch (_) { return json(res, 400, {error:'Gecersiz JSON verisi'}); }
  const operations = route === 'portfolio' ? ['portfolio'] : ['journal',
    ...(!isDeepStrictEqual(candidate?.notes, state.journal.notes) ? ['note'] : []),
    ...(!isDeepStrictEqual(candidate?.alerts, state.journal.alerts) ? ['alert'] : [])];
  operations.forEach(key=>state.attempts[key]++);
  const firstAttempt = operations.some(key=>key !== 'journal' && state.attempts[key] === 1)
    || (operations.length === 1 && state.attempts[route] === 1);
  await new Promise(resolve=>setTimeout(resolve,delayMs));
  function fail(status, error) { operations.forEach(key=>state.failures[key]++); return json(res,status,{error}); }
  if (state.fixture === 'retry' && firstAttempt) return fail(500,'QA: ilk kayıt başarısız. Tekrar deneyin. Gerçek veriye yazılmadı.');
  if (route === 'portfolio') {
    if (!candidate || ['us','bist','crypto'].some(key=>!Array.isArray(candidate[key]))) return fail(400,'Gecersiz portfoy');
    state.portfolio = Object.fromEntries(['us','bist','crypto'].map(key=>[key,candidate[key].filter(item=>item && item.symbol).map(item=>({
      symbol:String(item.symbol).toUpperCase().trim(),amount:parseFloat(item.amount)||0,avgPrice:parseFloat(item.avgPrice)||0
    }))]));
    operations.forEach(key=>state.successes[key]++);
    return json(res,200,{success:true});
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || !candidate.notes || typeof candidate.notes !== 'object' || Array.isArray(candidate.notes)
    || !Array.isArray(candidate.alerts) || !Array.isArray(candidate.predictions)) {
    return fail(400,'Gecersiz gunluk: notes, alerts ve predictions gerekli');
  }
  if (candidate._revision !== state.journal._revision) return fail(409,'Gunluk degisti. Yeniden yukleyip duzenlemenizi uygulayin.');
  const next = normalizeJournal(candidate);
  if (['predictions','decisionAudits','learningRules','reviewQueue'].some(key=>!isDeepStrictEqual(next[key],state.journal[key]))) {
    return fail(400,'Sistem tahminleri ve sonuc kayitlari bu ekrandan degistirilemez');
  }
  next._revision = 'qa-' + randomUUID();
  state.journal = next;
  operations.forEach(key=>state.successes[key]++);
  return json(res,200,next);
}
const metricsScript = `<script data-qa-instrumentation>
(() => {
  const node = document.createElement('div'); node.id = 'qa-metrics'; node.hidden = true;
  document.documentElement.appendChild(node);
  const metrics = {kind:'local-observation',supported:PerformanceObserver.supportedEntryTypes || [],lcp:null,cls:0,longTasks:[],events:[],renders:[]};
  function observe(type, handler) { if (!metrics.supported.includes(type)) return; try { new PerformanceObserver(list=>list.getEntries().forEach(handler)).observe({type,buffered:true,...(type === 'event' ? {durationThreshold:16} : {})}); } catch (_) {} }
  observe('largest-contentful-paint',e=>{metrics.lcp={startTime:e.startTime,size:e.size,tag:e.element?.tagName || null};});
  observe('layout-shift',e=>{if(!e.hadRecentInput) metrics.cls+=e.value;});
  observe('longtask',e=>{metrics.longTasks.push({startTime:e.startTime,duration:e.duration});metrics.longTasks=metrics.longTasks.slice(-100);});
  observe('event',e=>{metrics.events.push({name:e.name,startTime:e.startTime,duration:e.duration,interactionId:e.interactionId});metrics.events=metrics.events.slice(-100);});
  document.addEventListener('click',event=>{
    const control=event.target.closest('button'); if(!control) return;
    const start=performance.now(),label=control.textContent.trim();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      metrics.renders.push({label,view:document.querySelector('#viewTitle')?.textContent,duration:performance.now()-start});
      metrics.renders=metrics.renders.slice(-100);publish();
    }));
  },true);
  function publish(){
    const nav=performance.getEntriesByType('navigation')[0];
    metrics.navigation=nav ? {type:nav.type,duration:nav.duration,domContentLoaded:nav.domContentLoadedEventEnd,load:nav.loadEventEnd} : null;
    metrics.chartResources=performance.getEntriesByType('resource').filter(e=>new URL(e.name,location.href).pathname==='/api/chart').map(e=>({url:e.name,startTime:e.startTime,duration:e.duration,transferSize:e.transferSize}));
    metrics.calculationResources=performance.getEntriesByType('resource').filter(e=>['/api/backtest','/api/forecast/dcf','/api/forecast/montecarlo'].includes(new URL(e.name,location.href).pathname)).map(e=>({url:e.name,duration:e.duration}));
    metrics.canvasCount=document.querySelectorAll('canvas').length;
    metrics.domCount=document.querySelectorAll('*').length;
    node.setAttribute('data-json',JSON.stringify(metrics));
  }
  publish();setInterval(publish,250);document.addEventListener('visibilitychange',publish);
  if (['success','retry'].includes(new URL(location.href).searchParams.get('qa'))) {
    async function readWriteCounts() {
      try { const state = await (await fetch('/api/qa-state')).json(); metrics.writes = {fixture:state.fixture,isolated:state.isolated,attempts:state.attempts,successes:state.successes,failures:state.failures}; publish(); } catch (_) {}
    }
    readWriteCounts();setInterval(readWriteCounts,1000);
  }
})();
</script>`;
async function createQaServer({ sourceUrl = source, fetchImpl = fetch, writeDelayMs = 600, macroSnapshot, macroFixture, newsSnapshot, liveDraftPaths, learningSnapshot } = {}) {
  const snapshots = new Map();
  const chartCache = new Map();
  const fixtureStates = new Map();
  let liveDraft;
  const loadLiveDraft = async () => {
    if (!liveDraft) liveDraft = await readLiveDraft({...liveDraftDefaults,...liveDraftPaths});
    return liveDraft;
  };
  await Promise.all(allowedReads.map(async route => {
    const response = await fetchImpl(sourceUrl + route);
    snapshots.set(route, {status: response.status, value: await response.json()});
  }));
  if (macroSnapshot) snapshots.set('/api/macro', { status: 200, value: structuredClone(macroSnapshot) });
  if (newsSnapshot) snapshots.set('/api/market-news', { status: 200, value: structuredClone(typeof newsSnapshot === 'function' ? newsSnapshot(snapshots.get('/api/market-news')?.value) : newsSnapshot) });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const cookies = req.headers.cookie || '';
      const fixture = decodeURIComponent(/(?:^|;\s*)qa_fixture=([^;]+)/.exec(cookies)?.[1] || 'full');
      const session = /(?:^|;\s*)qa_session=([^;]+)/.exec(cookies)?.[1] || 'default';
      const stateKey = fixture + ':' + session;
      if (!fixtureStates.has(stateKey)) fixtureStates.set(stateKey,createFixtureState(snapshots,fixture));
      const state = fixtureStates.get(stateKey);
      if (macroFixture) state.macroStage ||= 'healthy';
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && url.pathname === '/api/qa-state') return json(res,200,state);
        if (macroFixture && req.method === 'POST' && url.pathname === '/api/qa-macro-stage') {
          let candidate;
          try { candidate = JSON.parse(await body(req)); } catch (_) { return json(res,400,{error:'Invalid QA stage'}); }
          if (!Object.prototype.hasOwnProperty.call(macroFixture.stages, candidate?.stage)) return json(res,400,{error:'Unknown QA stage'});
          state.macroStage = candidate.stage;
          return json(res,200,{stage:state.macroStage,isolated:true,realWrites:0});
        }
        if (macroFixture && req.method === 'GET' && url.pathname === '/api/macro') {
          const stage = macroFixture.stages[state.macroStage];
          return json(res,stage.status || 200,structuredClone(stage.value));
        }
        if (req.method === 'POST' && ['success','retry'].includes(fixture) && ['/api/portfolio','/api/journal'].includes(url.pathname)) return await fixtureWrite(req,res,state,writeDelayMs);
        if (req.method === 'POST' && !mathPaths.has(url.pathname)) return json(res, 500, {error:'QA: kayıt başarısızlığı. Gerçek veriye yazılmadı.'});
        if (req.method !== 'GET' && !(req.method === 'POST' && mathPaths.has(url.pathname))) return json(res,405,{error:'QA: method unavailable; no real writes'});
        if (mathPaths.has(url.pathname) || url.pathname === '/api/forecast/scenarios') {
          const response = await fetchImpl(sourceUrl + req.url, {method:req.method, headers:{'Content-Type':'application/json'}, ...(req.method==='POST'?{body:await body(req)}:{})});
          return json(res, response.status, await response.json());
        }
        if (url.pathname === '/api/chart') {
          if (!chartCache.has(req.url)) chartCache.set(req.url, fetchImpl(sourceUrl + req.url).then(async response => ({status:response.status,value:await response.json()})));
          const chart = await chartCache.get(req.url);
          if (fixture === 'slow-chart' && url.searchParams.get('symbol') === 'AAPL') await new Promise(resolve=>setTimeout(resolve, 1800));
          return json(res, chart.status, chart.value);
        }
        const record = snapshots.get(url.pathname);
        if (!record) return json(res, 404, {error:'QA route unavailable'});
        if (url.pathname === '/api/report' && url.searchParams.get('resource') === 'learning' && learningSnapshot) {
          if (fixture === 'learning-error') return json(res, 503, {status:'unavailable'});
          if (fixture === 'learning-empty') return json(res, 200, {schemaVersion:1,status:'awaiting_evidence',counts:{examples:0,matured:0,pending:0,excluded:0},cohorts:[],models:[],lastRecordedAt:null});
          return json(res, 200, structuredClone(learningSnapshot));
        }
        if (fixture === 'live-draft' && ['/api/report','/api/data'].includes(url.pathname)) {
          try {
            const draft = await loadLiveDraft();
            if (url.pathname === '/api/data') return json(res,200,draft.data);
            const {data,...report} = draft;
            if (record.value?.automation) report.automation = structuredClone(record.value.automation);
            return json(res,200,report);
          } catch (error) { return json(res,503,{error:error.message,fixture:'live-draft',published:false,ledgerWritten:false}); }
        }
        if (fixture === 'portfolio-error' && url.pathname === '/api/portfolio') return json(res, 500, {error:'QA: portföy alınamadı'});
        if (fixture === 'journal-error' && url.pathname === '/api/journal') return json(res, 500, {error:'QA: not ve alarm kaynağı alınamadı. Gerçek veriye yazılmadı.'});
        if (['missing-fx','priced-portfolio'].includes(fixture) && url.pathname === '/api/portfolio') {
          if (state.seedMissingMarkets.length) return json(res,503,{error:'QA: sentetik portföy için fiyatı bilinen ABD ve BIST varlığı bulunamadı',missingMarkets:state.seedMissingMarkets});
          return json(res,200,state.portfolio);
        }
        if (['success','retry'].includes(fixture) && url.pathname === '/api/portfolio') return json(res,200,state.portfolio);
        if (['success','retry'].includes(fixture) && url.pathname === '/api/journal') return json(res,200,state.journal);
        const value = structuredClone(record.value);
        if (fixture === 'missing-fx' && url.pathname === '/api/data' && value.fx && typeof value.fx === 'object') {
          delete value.fx.usdtry;
          if (value.fx.rates && typeof value.fx.rates === 'object') delete value.fx.rates['USD/TRY'];
        }
        if (fixture.startsWith('research-') && ['/api/report', '/api/research'].includes(url.pathname)) {
          // Synthetic workflow states exist only in this isolated acceptance server.
          const now = new Date().toISOString();
          const failed = fixture === 'research-failed';
          const running = fixture === 'research-running';
          value.automation = {
            runId: 'QA-automation', status: failed ? 'failed' : running ? 'running' : 'completed',
            startedAt: now, finishedAt: running ? null : now, updatedAt: now,
            stages: ['data','outcomes','base','research','validation','publication'].map((id,index) => ({
              id, status: index < 3 ? 'completed' : index === 3 ? (failed ? 'failed' : running ? 'running' : 'completed') : (failed || running ? 'pending' : 'completed'),
              startedAt: index <= 3 || !failed && !running ? now : null,
              finishedAt: index < 3 || !failed && !running ? now : null
            })),
            lastSuccessful: {runId: 'QA-previous-publication', publishedAt: new Date(Date.now() - 3600000).toISOString()},
            ...(failed ? {errorCode: 'generation_failed'} : {})
          };
        }
        if (fixture === 'empty' && url.pathname === '/api/portfolio') return json(res, 200, {us:[],bist:[],crypto:[]});
        if (fixture === 'unpriced' && url.pathname === '/api/portfolio') value.crypto=[{symbol:'QA-MISSING',amount:2,avgPrice:1}];
        if (fixture === 'partial' && url.pathname === '/api/data') { value.crypto=[]; value.errors=[...(value.errors||[]),'QA: kripto kaynağı erişilemiyor']; }
        if (fixture === 'stale' && url.pathname === '/api/data') value.generatedAt='2026-09-01T10:00:00.000Z';
        if (fixture === 'long' && url.pathname === '/api/data') {
          for (const market of ['us','bist','crypto']) for (const asset of value[market]||[]) asset.name='Uzun şirket adı ve farklı faaliyet alanlarında çalışan uluslararası yatırım kuruluşu — '+asset.symbol;
        }
        if (fixture === 'zero-results' && url.pathname === '/api/journal') value.predictions=[];
        return json(res, record.status, value);
      }
      if (url.pathname === '/' && url.searchParams.has('qa')) {
        const nextFixture = url.searchParams.get('qa');
        const nextSession = session === 'default' || nextFixture !== fixture || url.searchParams.get('reset') === '1' ? randomUUID() : session;
        res.setHeader('Set-Cookie',[
          'qa_fixture='+encodeURIComponent(nextFixture)+'; Path=/; SameSite=Strict; HttpOnly',
          'qa_session='+nextSession+'; Path=/; SameSite=Strict; HttpOnly'
        ]);
      }
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep)) return json(res,403,{error:'outside root'});
      let content = await fs.promises.readFile(file);
      if (path.extname(file) === '.html') {
        content = content.toString().replace('</head>',metricsScript + '</head>');
        const pageFixture = url.searchParams.get('qa') || fixture;
        if (pageFixture === 'live-draft') content = content.replace(/(<body[^>]*>)/,
          '$1<div data-qa-report="live-model-draft" style="padding:10px 16px;background:#332a12;color:#ffe4a3;font-size:14px" role="status">Canlı model taslağı · Yayınlanmadı. Manuel inceleme; tahmin defterine yazılmadı. Otomasyon durumu mevcut gerçek kayda aittir.</div>');
        if (['missing-fx','priced-portfolio'].includes(pageFixture)) content = content.replace(/(<body[^>]*>)/,
          '$1<div data-qa-portfolio="synthetic" style="padding:8px 16px;background:#332a12;color:#ffe4a3;font-size:14px" role="status">QA: ABD ve BIST pozisyonları kaynak fiyatlarından oluşturulmuş sentetik kabul verisidir. Gerçek portföy değildir; kayıt yazılmaz.'
            + (pageFixture === 'missing-fx' ? ' USD/TRY kuru bu senaryoda kaldırıldı.' : '') + '</div>');
        if (fixture === 'cpi-model' || url.searchParams.get('qa') === 'cpi-model') content = content.replace('<body', '<body data-qa-cpi="synthetic"').replace(/(<body[^>]*>)/, '$1<div style="padding:8px 16px;background:#332a12;color:#ffe4a3;font-size:14px" role="status">CPI model kayıtları sentetik kabul verisidir. Canlı tahmin veya ölçülmüş sonuç değildir.</div>');
        if (newsSnapshot) content = content.replace(/(<body[^>]*>)/, '$1<div style="padding:8px 16px;background:#332a12;color:#ffe4a3;font-size:14px" role="status">Şirket kaynakları: resmî liste okumasının yerel kabul kesiti. Bu ekran bulut yayını değildir; gerçek kayıt yazılmaz.</div>');
        if (macroFixture) content = content.replace('</body>', macroFixture.toolbar + '</body>');
      }
      res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
      res.end(content);
    } catch (error) { json(res, 500, {error:error.message}); }
  });
  return server;
}
async function start() {
  const server = await createQaServer();
  server.listen(port,'127.0.0.1',()=>console.log('Isolated UI QA: http://127.0.0.1:'+port+'/?qa=full (success/retry writes are memory-only)'));
}
module.exports = {createQaServer,readLiveDraft};
if (require.main === module) start().catch(error=>{console.error(error.message);process.exitCode=1;});
