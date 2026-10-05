(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.FinansLearning=api;api.bind(root.document,root.fetch.bind(root));}})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('tr-TR',{maximumFractionDigits:2}):'Bekleniyor';
 const unit=value=>value==='thousand_jobs'?'bin kişi':value==='percent'?'yüzde puan':'yüzde getiri';
 function metrics(label,m,u){return '<tr><th scope="row">'+label+'</th><td>'+number(m.n)+'</td><td>'+number(m.distinctDates)+'</td><td>'+number(m.mae)+' '+(m.mae===null?'':u)+'</td><td>'+number(m.improvement)+' '+(m.improvement===null?'':u)+'</td></tr>';}
 function renderLearning(data){
   if(data?.status==='unavailable')return '<p class="learning-state" role="status">Öğrenme kayıtları okunamadı. Kayıtların durumunu doğrulamak için yeniden dene.</p><button type="button" class="btn btn-secondary" data-learning-retry>Yeniden dene</button>';
   if(!data?.counts)return '<p class="learning-state" role="status">Öğrenme kayıtları yükleniyor…</p>';
   const c=data.counts;
   const description=c.matured?'İlk kararlar korunuyor; gerçekleşen sonuçlar kendi tahminleriyle karşılaştırılıyor.':'Öğrenme için doğrulanmış sonuç bekleniyor';
   const rows=(data.models||[]).map(m=>'<details class="learning-model"><summary><span>'+escape(m.kind==='price'?'Fiyat tahmini':m.targetId)+'</span><span class="learning-model-mode">Gölge · '+number(m.cumulative.n)+' sonuç</span></summary><p>Hata birimi: '+unit(m.unit)+'. Referansa göre farkın pozitif olması daha düşük hata anlamına gelir.</p><div class="learning-table-scroll" tabindex="0" aria-label="Model hata karşılaştırması"><table><thead><tr><th scope="col">Dönem</th><th scope="col">Sonuç</th><th scope="col">Farklı tarih</th><th scope="col">Ortalama mutlak hata</th><th scope="col">Referansa göre fark</th></tr></thead><tbody>'+metrics('Birikimli',m.cumulative,unit(m.unit))+metrics('Son 90 gün',m.recent,unit(m.unit))+'</tbody></table></div><dl class="learning-version"><dt>Model</dt><dd>'+escape(m.modelId)+'</dd><dt>Veri seti</dt><dd>'+escape(m.datasetId)+'</dd><dt>Politika</dt><dd>'+escape(m.policyVersion)+'</dd></dl></details>').join('');
   return '<p class="learning-state" role="status">'+description+'</p><dl class="learning-counts"><div><dt>Kaydedilen kesit</dt><dd>'+number(c.examples)+'</dd></div><div><dt>Sonucu gözlenen</dt><dd>'+number(c.matured)+'</dd></div><div><dt>Sonuç bekleyen</dt><dd>'+number(c.pending)+'</dd></div><div><dt>Eğitim dışı</dt><dd>'+number(c.excluded)+'</dd></div></dl><p class="learning-policy">Aktif öğrenilmiş model: yok. Adaylar önce gölgede izlenir.</p>'+rows+'<details class="learning-coverage"><summary>Kaynak kapsamı ve ölçüm sınırları</summary><p>Fiyat tahmini işlem başarı oranı veya net getiri değildir. Aynı olayın tekrarları bağımsız sonuç sayılmaz. BIST/ABD seans takvimi ve fiyat düzeltme kanıtı eksikse sonuç etiketi bekler.</p><ul>'+(data.cohorts||[]).map(c=>'<li><span>'+escape(c.cohort)+'</span> · '+number(c.examples)+' kesit, '+number(c.distinctDates)+' farklı tarih, '+number(c.excluded)+' eğitim dışı</li>').join('')+'</ul><p>Son kayıt: '+escape(data.lastRecordedAt?new Date(data.lastRecordedAt).toLocaleString('tr-TR'):'Henüz yok')+'</p></details>';
 }
 function bind(document,fetcher){
   const host=document.getElementById('learningContent'),panel=document.getElementById('learningPanel');if(!host||!panel)return;
   let loaded=false,pending=false;
   async function load(){if(pending)return;pending=true;host.innerHTML=renderLearning(null);try{const response=await fetcher('/api/report?resource=learning',{cache:'no-store'});if(!response.ok)throw Error('read failed');host.innerHTML=renderLearning(await response.json());loaded=true;}catch(_){host.innerHTML=renderLearning({status:'unavailable'});}finally{pending=false;}}
   panel.addEventListener('toggle',()=>{if(panel.open&&!loaded)load();});host.addEventListener('click',event=>{if(event.target.closest('[data-learning-retry]'))load();});
 }
 return {renderLearning,bind};
});
