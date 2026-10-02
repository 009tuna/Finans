'use strict';
// Isolated failure/recovery preview. Values and failures are acceptance fixtures.
// No model invocation, source refresh, database write or production mutation.
const { createQaServer } = require('./ui-qa-server');
const { createModelFixture } = require('./cpi-model-ui-qa');
const clone = value => structuredClone(value);
const modelKeys = ['modelForecasts', 'modelForecastReviews', 'modelOutcomes', 'modelScenarios', 'modelForecastExclusions', 'modelReviewExclusions'];
function clearModels(layer) {
  for (const key of modelKeys) layer[key] = [];
  if (layer.modelScorecard) layer.modelScorecard = { ...layer.modelScorecard, n:0, sampleSize:0, mae:null, bias:null };
  for (const metric of layer.metrics || []) clearModels(metric);
}
function createStages(snapshot) {
  const healthy = clone(snapshot);
  healthy.storeStatus = {status:'available',checkedAt:'2026-10-01T14:35:00.000Z'};
  healthy.researchStatus = 'available';
  healthy.researchCheckedAt = '2026-10-01T14:35:00.000Z';
  healthy.families.us_cpi = createModelFixture().family;
  healthy.families.us_cpi.storeStatus = {...healthy.storeStatus};
  const researchError = clone(healthy);
  researchError.researchStatus = 'unavailable';
  researchError.researchCheckedAt = '2026-10-01T14:40:00.000Z';
  clearModels(researchError);
  clearModels(researchError.families.us_cpi);
  // Distinct value proves independent observations update during a model outage.
  researchError.families.us_cpi.metrics[0].previousFirstRelease.value = 0.6;
  const nfpError = clone(healthy);
  nfpError.status = 'unavailable';
  nfpError.storeStatus = {status:'unavailable',checkedAt:'2026-10-01T14:41:00.000Z',errorCode:'macro_store_unavailable'};
  nfpError.sourceStatus = {status:'unavailable',failures:[{code:'macro_store_unavailable'}]};
  for (const key of ['observations','forecasts','outcomes','events','methodAbstentions','sourceVerifications','provenanceExclusions']) nfpError[key] = [];
  nfpError.nextEvent = null;
  nfpError.consensus = null;
  nfpError.families.us_cpi.metrics[0].previousFirstRelease.value = 0.7;
  const cpiError = clone(healthy);
  cpiError.families.us_cpi = {family:'us_cpi',nextEvent:null,metrics:[],events:[],sourceStatus:{status:'unavailable',failures:[{code:'cpi_store_unavailable'}]},
    storeStatus:{status:'unavailable',checkedAt:'2026-10-01T14:42:00.000Z',errorCode:'cpi_store_unavailable'}};
  const empty = clone(healthy);
  empty.researchCheckedAt = '2026-10-01T14:45:00.000Z';
  clearModels(empty); clearModels(empty.families.us_cpi);
  const nextPeriod = clone(researchError);
  nextPeriod.families.us_cpi.nextEvent = {eventId:'us_cpi:2026-10',period:'2026-10',scheduledAt:'2026-11-10T13:30:00.000Z'};
  return {healthy:{value:healthy},'research-error':{value:researchError},'nfp-store-error':{value:nfpError},'cpi-store-error':{value:cpiError},
    offline:{status:503,value:{error:'QA: iki bağımsız depoya erişilemiyor'}},recovered:{value:healthy},'recovered-empty':{value:empty},'next-period-error':{value:nextPeriod}};
}
const toolbar = `<aside aria-label="İzole kabul kontrolü" style="position:fixed;bottom:8px;right:8px;z-index:10000;max-width:calc(100% - 16px);padding:10px;background:#332a12;color:#ffe4a3;font-size:12px;border:1px solid #9d8240;border-radius:6px">
<p style="margin:0 0 6px">Hata senaryoları ve güncellenen değerler sentetiktir; gerçek kayıtlara yazılmaz.</p>
<label for="qa-macro-stage">Kabul durumu</label>
<select id="qa-macro-stage" style="min-height:44px">
<option value="healthy">Sağlıklı</option><option value="research-error">Model deposu hatası</option>
<option value="nfp-store-error">İstihdam deposu hatası</option><option value="cpi-store-error">Enflasyon deposu hatası</option>
<option value="offline">İki kaynak hatası</option><option value="recovered">Toparlandı</option><option value="recovered-empty">Toparlandı, model kaydı yok</option><option value="next-period-error">Yeni dönem, model hatası</option>
</select> <button type="button" id="qa-macro-apply" style="min-height:44px">Durumu uygula</button>
<output id="qa-macro-status" aria-live="polite"></output></aside>
<script>document.getElementById('qa-macro-apply').addEventListener('click',async function(){
const button=this, output=document.getElementById('qa-macro-status');button.disabled=true;
try { const stage=document.getElementById('qa-macro-stage').value;
const result=await fetch('/api/qa-macro-stage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage})});
if(!result.ok)throw new Error('Kabul durumu değişmedi');
await window.FinansMacro.refresh({force:true});output.textContent=' · Uygulandı: '+stage;
}catch(error){output.textContent=' · '+error.message;}finally{button.disabled=false;}
});</script>`;
async function start() {
  const response = await fetch('http://127.0.0.1:5190/api/macro');
  if (!response.ok) throw new Error('Yerel makro önizleme erişilemiyor');
  const snapshot = await response.json();
  const server = await createQaServer({macroFixture:{stages:createStages(snapshot),toolbar}});
  server.listen(5193,'127.0.0.1',()=>console.log('İzole kaynak hata kabulü: http://127.0.0.1:5193/?qa=cpi-model#view=overview'));
}
module.exports = {createStages,toolbar};
if(require.main === module) start().catch(error=>{console.error(error.message);process.exitCode=1;});
