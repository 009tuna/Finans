const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const handlerStart = source.indexOf("$('#portfolio-form').addEventListener('submit', async");
const handler = source.slice(handlerStart, source.indexOf('\n    });', handlerStart) + '\n    });'.length);
const helperStart = source.indexOf('function noteFormButton(');
const helpers = source.slice(helperStart, source.indexOf('function renderPortfolioChart(', helperStart));
const stampStart = source.indexOf('function inputStamp(');
const stamp = source.slice(stampStart, source.indexOf('function bindResultInputs(', stampStart));

function harness() {
  const requests = [];
  const inputs = [
    { id: 'port-market-sel', value: 'us' }, { id: 'port-symbol-sel', value: 'AAPL' },
    { id: 'port-amount-input', value: '2' }, { id: 'port-price-input', value: '20' },
  ];
  const elements = Object.fromEntries(inputs.map((input) => ['#' + input.id, input]));
  const button = { disabled: false };
  const form = {
    querySelectorAll: () => inputs, querySelector: () => button,
    addEventListener(type, fn) { this.handler = fn; },
  };
  elements['#portfolio-form'] = form;
  elements['#portfolioStatus'] = { textContent: '' };
  const context = vm.createContext({
    $: (selector) => elements[selector], console: { error() {} }, window: {},
    confirm: () => { context.confirmCount++; return true; }, confirmCount: 0, renderCount: 0,
    renderPortfolioView: () => { context.renderCount++; },
    authedFetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, body: JSON.parse(options.body), resolve, reject })),
  });
  vm.runInContext(`let portfolioData = {us:[{symbol:'AAPL',amount:1,avgPrice:10}],bist:[],crypto:[]};
    let portfolioSaving = false;
    let portfolioState = 'ready';
    ${helpers}
    ${stamp}
    ${handler}
    globalThis.inspect = () => JSON.parse(JSON.stringify({portfolioData, portfolioSaving}));
    globalThis.setSourceState = (state) => { portfolioState = state; };`, context);
  return { context, elements, requests, button, form, submit: () => form.handler({ preventDefault() {}, currentTarget: form }),
    finish: (ok = true, acknowledgement = { success: true }) => requests.at(-1).resolve({ ok, json: async () => acknowledgement }),
    finishMalformed: () => requests.at(-1).resolve({ ok: true, json: async () => { throw new SyntaxError('malformed acknowledgement'); } }) };
}

(async () => {
  const h = harness();
  h.context.setSourceState('stale');
  await h.submit();
  await h.context.deletePortfolioAsset('us', 'AAPL');
  assert.equal(h.requests.length, 0, 'unknown current source cannot be overwritten by a save or deletion');
  assert.equal(h.context.confirmCount, 0);
  assert.equal(h.elements['#port-amount-input'].value, '2', 'source failure preserves the draft');
  h.context.setSourceState('ready');
  const save = h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.button.disabled, true);
  h.elements['#port-amount-input'].value = '3';
  h.elements['#port-price-input'].value = '30';
  await h.submit();
  await h.context.deletePortfolioAsset('us', 'AAPL');
  assert.equal(h.requests.length, 1, 'delete and duplicate submit cannot race pending save');
  assert.equal(h.context.confirmCount, 0, 'busy delete is rejected before confirmation');
  h.finish();
  await save;
  assert.equal(h.context.inspect().portfolioData.us[0].amount, 2);
  assert.equal(h.elements['#port-amount-input'].value, '3');
  assert.equal(h.elements['#port-price-input'].value, '30');
  assert.match(h.elements['#portfolioStatus'].textContent, /Yeni değişiklikler taslak/);
  assert.equal(h.button.disabled, false);
  const next = h.submit();
  h.finish();
  await next;
  assert.equal(h.context.inspect().portfolioData.us[0].amount, 3);
  assert.equal(h.elements['#port-amount-input'].value, '');
  assert.equal(h.elements['#port-price-input'].value, '');

  const failure = harness();
  const failedSave = failure.submit();
  failure.elements['#port-amount-input'].value = '4';
  failure.finish(false);
  await failedSave;
  assert.equal(failure.context.inspect().portfolioData.us[0].amount, 1);
  assert.equal(failure.elements['#port-amount-input'].value, '4');
  assert.equal(failure.context.inspect().portfolioSaving, false);
  assert.equal(failure.button.disabled, false);

  for (const acknowledgement of [{ success: false }, {}, null]) {
    const rejected = harness();
    const rejectedSave = rejected.submit();
    rejected.finish(true, acknowledgement);
    await rejectedSave;
    assert.equal(rejected.context.inspect().portfolioData.us[0].amount, 1, 'an HTTP success without an explicit success acknowledgement cannot replace confirmed positions');
    assert.equal(rejected.elements['#port-amount-input'].value, '2', 'unacknowledged saves preserve the draft');
    assert.equal(rejected.context.inspect().portfolioSaving, false);
    assert.equal(rejected.button.disabled, false);
    assert.match(rejected.elements['#portfolioStatus'].textContent, /kaydedilemedi/i);
  }
  const malformed = harness();
  const malformedSave = malformed.submit();
  malformed.finishMalformed();
  await malformedSave;
  assert.equal(malformed.context.inspect().portfolioData.us[0].amount, 1, 'a malformed acknowledgement cannot replace confirmed positions');
  assert.equal(malformed.elements['#port-amount-input'].value, '2');
  assert.equal(malformed.button.disabled, false);
  const deletion = failure.context.deletePortfolioAsset('us', 'AAPL');
  await failure.submit();
  await failure.context.deletePortfolioAsset('us', 'AAPL');
  assert.equal(failure.requests.length, 2, 'one delete serializes other portfolio writes');
  assert.equal(failure.context.confirmCount, 1);
  failure.requests[1].reject(new Error('offline'));
  await deletion;
  assert.equal(failure.context.inspect().portfolioSaving, false);
  assert.equal(failure.context.inspect().portfolioData.us.length, 1);
  assert.equal(failure.button.disabled, false);

  const market = {value: '', dispatchEvent() { market.changed = true; }};
  const symbol = {value: '', dispatchEvent() { assert.equal(market.changed, true); symbol.changed = true; }};
  let editorOpen = false;
  const amount = {scrollIntoView() { assert.equal(editorOpen, true); }, focus() { assert.equal(symbol.changed, true); assert.equal(editorOpen, true); }};
  const editorContext = vm.createContext({ window: { FinansWorkspace: { openPanel(key) { assert.equal(key, 'portfolio'); editorOpen = true; } } }, $: (id) => ({'#port-market-sel':market, '#port-symbol-sel':symbol, '#port-amount-input':amount})[id], Event: class {} });
  const editStart = source.indexOf('function editPortfolioAsset(');
  vm.runInContext(source.slice(editStart, source.indexOf('window.editPortfolioAsset', editStart)), editorContext);
  editorContext.editPortfolioAsset('bist', 'ASTOR');
  assert.equal(symbol.value, 'ASTOR', 'explicit edit prefill completes synchronously before user typing');
  console.log('portfolio UI save tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
