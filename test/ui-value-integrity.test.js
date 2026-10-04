'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function fmtQty('), source.indexOf('function toneColor(')), context);
for (const value of [null, undefined, '', '   ', false, true, [], {}, NaN, Infinity, -Infinity, 'Infinity', 'no price']) {
  for (const format of ['fmtQty', 'fmtNum', 'fmtPrice', 'fmtPct', 'fmtCap']) {
    assert.equal(context[format](value), '–', format + ' must not invent a financial value from ' + String(value));
  }
}
assert.equal(context.fmtNum(0), '0,00');
assert.equal(context.fmtQty(0), '0');
assert.equal(context.fmtPrice(0, 'TRY'), '₺0,00');
assert.equal(context.fmtPct(0), '+0,00%');
assert.equal(context.fmtPrice('123.45', 'USDT'), 'USDT 123,45');
assert.equal(context.fmtPct(-2.5), '-2,50%');
assert.match(context.fmtPrice(0.000001, 'USD'), /0,000001/);
vm.runInContext(source.slice(source.indexOf('function kv('), source.indexOf('function reasonList(')), context);
for (const [direction, label] of [['up', 'yükseliyor ▲'], ['down', 'düşüyor ▼'], ['flat', 'yatay']]) {
  assert.ok(context.indGrid({ind: {obv: {direction, rising: direction === 'up'}}}).includes(label));
}
const legacy = context.indGrid({ind: {obv: {rising: false}}});
assert.match(legacy, /yön bilgisi eksik/);
assert.doesNotMatch(legacy, /düşüyor/);
Object.assign(context, {esc:String, decisionTone:()=> 'clean', decisionLabel:()=> 'Temiz'});
vm.runInContext(source.slice(source.indexOf('function freshnessText('), source.indexOf('function decisionInsightCard(')), context);
assert.equal(context.freshnessText({label:'Veri taze',ageHours:0}),'Veri taze · 0 saat');
assert.equal(context.freshnessText({label:'Veri gecikmeli',ageHours:1.5}),'Veri gecikmeli · 1,5 saat');
assert.equal(context.freshnessText({ageHours:NaN}),'Bilinmiyor');
assert.equal(context.confidenceText({scoreDelta:Infinity}),'Bilinmiyor');
const asset = {currency:'TRY',decision:{score:90,trade:{available:true,entry:100,stop:99.985,target:100.03,riskReward:2,positionRiskPct:2,unitsPer100k:133333}}};
let panel=context.decisionPanel(asset);
assert.match(panel,/Örnek risk hesabı/);
assert.match(panel,/sermaye sınırıyla doğrulanamadı/);
assert.doesNotMatch(panel,/133333|133\.333/,'legacy over-capital quantity must not be presented as a valid example');
asset.decision.trade={...asset.decision.trade,unitsPer100k:1000,capitalBase:100000,actualRiskAmount:15,capitalLimited:true};
panel=context.decisionPanel(asset);
assert.match(panel,/1\.000/);
assert.match(panel,/Adet sermayeyle sınırlandı/);
asset.decision.score=Infinity;
asset.decision.trade.riskReward=NaN;
asset.decision.trade.positionRiskPct=null;
panel=context.decisionPanel(asset);
assert.doesNotMatch(panel,/Infinity|NaN|%null/);
context.esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
context.marketShortLabel = market => market === 'crypto' ? 'Kripto' : 'ABD';
context.fullTimestamp = value => value || 'bilinmiyor';
vm.runInContext(source.slice(source.indexOf('function historicalSourceProofHtml('),source.indexOf('async function loadCorrelationMatrix(')),context);
const proof=context.historicalSourceProofHtml([{market:'crypto',symbol:'<BTC>',source:'Binance',currency:'USDT',completion:{observedAt:'2026-10-03T12:00:00Z',effectiveCutoffAt:'2026-10-03T12:00:00Z',completedObservations:250,excludedOpenBars:1,excludedUnverifiedBars:0}}]);
assert.match(proof,/&lt;BTC&gt;/);
assert.match(proof,/250 tamamlanmış günlük gözlem; açık 1, kapanışı doğrulanamayan 0/);
assert.match(proof,/USDT\/USD değişimi[^<]*modellenmez/);
assert.match(context.historicalSourceProofHtml([{symbol:'AAPL',completion:{completedObservations:null}}]),/bilinmiyor tamamlanmış/);
assert.match(context.historicalSourceProofHtml([{symbol:'AAPL'}]),/kapanış kesitinin kanıtı yok/);
vm.runInContext(source.slice(source.indexOf('function fullTimestamp('),source.indexOf('function fullDate(')),context);
for(const value of ['2026-10-02','2026-10-02T12:00:00','2026-02-30T12:00:00Z','2026-13-05T12:00:00Z','2026-10-02T25:00:00Z','bad-time',null,true,{}]) assert.equal(context.fullTimestamp(value),'Zaman doğrulanamadı');
assert.match(context.fullTimestamp('2026-10-02T12:00:00Z'),/15:00/);
assert.match(context.fullTimestamp(1790942400),/15:00/);
vm.runInContext(source.slice(source.indexOf('function relTime('),source.indexOf('function marketStatus(')),context);
assert.equal(context.relTime('bad-time'),'bilinmiyor');
assert.equal(context.relTime('2026-10-04'),'bilinmiyor');
assert.doesNotMatch(context.relTime('2020-10-02T12:00:00Z'),/kapanış|kapanisi/,'fetch or report time is not evidence of a market close');
assert.match(context.relTime('2099-10-02T12:00:00Z'),/Gelecek tarih/);
vm.runInContext(source.slice(source.indexOf('function weeklyHtml('),source.indexOf('function allScored(')),context);
function calendarCoverage(coverage) { return context.weeklyHtml({calendar:{coverage:{economic:coverage}}},null); }
assert.match(calendarCoverage({status:'unavailable',count:0}),/Ekonomik takvim: Kaynağa erişilemedi · kayıt sayısı bilinmiyor/);
assert.match(calendarCoverage({status:'empty',count:0}),/Kaynak döndü, olay bulunamadı · 0 kayıt/);
assert.match(calendarCoverage({status:'partial',count:7}),/Kısmi veri · 7 kayıt/);
for (const count of [null,undefined,'',false,-1,NaN,Infinity,'7']) assert.match(calendarCoverage({status:'available',count}),/Alındı · kayıt sayısı bilinmiyor/);
console.log('Financial formatting preserves observed zero, rejects missing/non-finite data and separates OBV directions');
