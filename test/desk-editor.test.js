'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const section = (begin, end) => source.slice(source.indexOf(begin), source.indexOf(end, source.indexOf(begin)));
const elements = {
  '#port-market-sel': {value: 'bist'}, '#port-symbol-sel': {value: 'ASTOR'},
  '#port-amount-input': {value: '151'}, '#port-price-input': {value: '301'},
  '#portfolioStatus': {textContent: ''}, '#portfolioEditPreview': {textContent: ''},
  '#portfolio-form': {querySelector: () => ({})}
};
const context = vm.createContext({$: (id) => elements[id], Number, Date, Intl,
  portfolioData: {bist: [{symbol:'ASTOR', amount:150, avgPrice:300}, {symbol:'MISSING', amount:1, avgPrice:10}]},
  DATA: {bist: [{symbol:'ASTOR'}]}, portfolioSaving:false,
  fmtQty: String, fmtPrice: String});
vm.runInContext(section('function portfolioSymbolOptions(', 'function editPortfolioAsset('), context);
context.syncPortfolioEditor({type:'input'});
assert.equal(elements['#port-amount-input'].value, '151', 'typing must not restore the saved amount');
assert.equal(elements['#port-price-input'].value, '301', 'typing must not restore the saved cost');
context.syncPortfolioEditor();
assert.equal(elements['#port-amount-input'].value, '151', 'data refresh preserves the position draft');
assert.match(elements['#portfolioEditPreview'].textContent, /150.*151/);
context.syncPortfolioEditor(true);
assert.equal(elements['#port-amount-input'].value, 150, 'explicit edit prefills existing position');
assert.equal(context.portfolioSymbolOptions('bist').length, 2, 'unpriced holdings remain selectable for editing');
vm.runInContext(section('function fullTimestamp(', 'function fullDate('), context);
assert.notEqual(context.fullTimestamp('1790676000'), 'Zaman doğrulanamadı', 'Unix seconds in string form remain readable');
assert.equal(context.fullTimestamp('invalid'), 'Zaman doğrulanamadı');

let fields = [{id:'amount', value:'10'}]; const handlers = {};
const form = {dataset:{}, querySelectorAll: () => fields, addEventListener: (name, handler) => handlers[name] = handler};
const status = {textContent:''}; const result = {dataset:{inputStamp:'[["amount","10"]]', resultDescription:'10 adet'}, querySelector:()=>status};
vm.runInContext(section('function inputStamp(', 'function valuationStamp('), context);
context.bindResultInputs(form, result, 'test');
fields[0].value = '20'; handlers.input();
assert.match(status.textContent, /^Önceki test sonucu/, 'a changed input must not relabel an old result as current');
fields[0].value = '10'; handlers.change();
assert.match(status.textContent, /^Güncel test sonucu/);
console.log('Desk position draft, unavailable holding, timestamp and result provenance tests passed');
