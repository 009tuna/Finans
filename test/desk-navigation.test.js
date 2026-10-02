'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
const begin = source.indexOf('function routeHash(');
const end = source.indexOf('function setView(', begin);
assert.ok(begin >= 0 && end > begin, 'navigation contract is available');
const window = {location:{hash:''}, history:{calls:[], pushState(state, title, hash){this.calls.push({method:'push',state,hash});window.location.hash=hash;},replaceState(state,title,hash){this.calls.push({method:'replace',state,hash});window.location.hash=hash;}}};
const context = vm.createContext({window,URLSearchParams,Object,console,VIEW_META:Object.fromEntries(['overview','us','bist','crypto','portfolio','screener','backtest','forecast','report','literacy'].map(x=>[x,[]])),routeApplying:false,assetDeskState:{market:'us',symbol:'MSFT'},marketUi:{us:{symbol:'MSFT'},bist:{symbol:'ASTOR'},crypto:{symbol:'BTCUSDT'}},DATA:{us:[{symbol:'MSFT'}],bist:[{symbol:'ASTOR'}],crypto:[{symbol:'BTCUSDT'}]},setView(view){context.selectedView=view;},$:()=>null});
vm.runInContext(source.slice(begin,end),context);

assert.equal(context.routeHash('bist','bist','ASTOR'),'#view=market&market=bist&symbol=ASTOR','market routes use the public deep-link format');
window.location.hash='#view=market&market=bist&symbol=ASTOR';
assert.equal(context.readRoute().view,'bist','direct market URL resolves to the BIST screen');
assert.equal(context.readRoute().symbol,'ASTOR');
window.location.hash='#view=bist&symbol=ASTOR';
assert.equal(context.readRoute().view,'bist','older market-specific links stay compatible');
window.location.hash='#view=made-up&symbol=ASTOR';
assert.equal(context.readRoute().view,'overview','unknown screen safely falls back');
window.location.hash='';
context.writeRoute('portfolio');
assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('view'),'portfolio');
const calls=window.history.calls.length;
context.writeRoute('portfolio');
assert.equal(window.history.calls.length,calls,'same destination does not add duplicate history entries');
context.routeApplying=true;
context.writeRoute('bist');
assert.equal(window.history.calls.length,calls,'restoring browser history cannot create a new history entry');
context.routeApplying = false;
context.marketUi.us.query = 'Apple';
context.marketUi.us.sort = 'name';
const snapshot = context.captureRouteUi();
context.marketUi.us.query = 'Microsoft';
window.history.state = {ui:snapshot};
window.location.hash = '#view=market&market=us&symbol=MSFT';
context.applyRoute();
assert.equal(context.marketUi.us.query, 'Apple', 'restoring history restores its own filter snapshot');
assert.equal(context.marketUi.us.sort, 'name', 'restoring history restores its own sort snapshot');
assert.equal(context.selectedView, 'us');

// Exercise the actual market renderer: restoring variables alone does not prove that
// the narrow-layout detail pane is visible after a deep link or browser history.
const classes = new Set();
const elements = {
  '#view-market': {classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},remove(name){classes.delete(name);}}},
  '#marketChartTitle': {}, '#marketWorkspaceTitle': {}, '#marketSearch': {}, '#sortSel': {},
  '#marketRouteNotice': {}, '#tableWrap': {scrollTop:0},
};
Object.assign(context, {
  $: id => elements[id], marketDetailOpen:false, marketScroll:{us:72},
  currentList: () => context.DATA[context.activeView],
  renderMarketStatus(){}, renderScoreChart(){}, renderTable(){}, renderErrors(){},
  triggerRevealAnimations(){}, requestAnimationFrame: fn => fn(),
  renderAssetDesk(asset){context.renderedSymbol=asset?.symbol;},
  setView(view){context.activeView=view;context.renderView();},
});
context.DATA.us[0].analysis={score:80};
const renderStart = source.indexOf('function renderView()');
vm.runInContext(source.slice(renderStart,source.indexOf('/* ---------- Günlük Rapor',renderStart)),context);

window.history.state = {ui:{markets:{us:{query:'Microsoft',sort:'name',symbol:'MSFT'}},scroll:{us:72},detailOpen:true}};
window.location.hash='#view=market&market=us&symbol=MSFT';
context.applyRoute();
assert.equal(classes.has('is-detail-open'),true,'history restoration opens the actual detail pane');
assert.equal(context.renderedSymbol,'MSFT');
assert.equal(elements['#marketSearch'].value,'Microsoft');
assert.equal(elements['#tableWrap'].scrollTop,72);

window.history.state={ui:{markets:{us:{query:'Microsoft',sort:'name',symbol:'MSFT'}},detailOpen:false}};
window.location.hash='#view=market&market=us';
context.applyRoute();
assert.equal(classes.has('is-detail-open'),false,'list history hides the detail pane without losing the selected asset');
assert.equal(context.marketUi.us.symbol,'MSFT');
assert.equal(elements['#marketSearch'].value,'Microsoft');

window.location.hash='#view=market&market=us&symbol=MSFT';
context.applyRoute();
assert.equal(classes.has('is-detail-open'),true,'a symbol URL opens details even with a stale list snapshot');

// The real return-button handler creates a list route and leaves the detail entry
// intact, so Back can restore it and Forward can restore the filtered list.
const events={};
elements['#sortSel'].addEventListener=()=>{};
elements['#marketSearch'].addEventListener=()=>{};
elements['#assetReturnBtn']={addEventListener:(name,fn)=>{events[name]=fn;}};
context.detailReturnFocus=null;
vm.runInContext(source.slice(source.indexOf("$('#sortSel').addEventListener"),source.indexOf("$('#refreshBtn').addEventListener")),context);
const beforeReturn=window.history.calls.length;
events.click();
const returnCalls=window.history.calls.slice(beforeReturn);
const preservedDetail=returnCalls.find(call=>call.method==='replace'&&call.hash.includes('symbol=MSFT'));
const listEntry=returnCalls.find(call=>call.method==='push');
assert.equal(preservedDetail.state.ui.detailOpen,true,'leaving the detail preserves its own history snapshot');
assert.equal(listEntry.hash,'#view=market&market=us','the list route omits the detail symbol');
assert.equal(listEntry.state.ui.markets.us.symbol,'MSFT','the list remembers selection independently of the URL');
assert.equal(listEntry.state.ui.detailOpen,false);
window.history.state=preservedDetail.state;window.location.hash=preservedDetail.hash;context.applyRoute();
assert.equal(classes.has('is-detail-open'),true,'Back restores the actual detail layout');
window.history.state=listEntry.state;window.location.hash=listEntry.hash;context.applyRoute();
assert.equal(classes.has('is-detail-open'),false,'Forward restores the filtered list layout');

window.history.state=null;window.location.hash='#view=market&market=us&symbol=MISSING';context.applyRoute();
assert.equal(classes.has('is-detail-open'),false,'an invalid symbol cannot show another asset as its detail');
assert.match(elements['#marketRouteNotice'].textContent,/MISSING/);
console.log('Karar Masası deep links, compatibility and history tests passed');
