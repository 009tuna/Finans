'use strict';
const assert = require('node:assert/strict');
const { metrics } = require('../scripts/audit-research-history');
const predictions = [
  {symbol:'A',outcome:'target-hit',resultPct:8},
  {symbol:'B',outcome:'stop-hit',resultPct:-2},
  {symbol:'C',outcome:'stop-hit',outcomeEvidence:'ambiguous_bar',resultPct:-90},
  {symbol:'D',outcome:'unknown',resultPct:900},
  {symbol:'E',outcome:'open',resultPct:500},
];
const result = metrics(predictions);
assert.equal(result.closed,4);
assert.equal(result.decisive,2);
assert.equal(result.ambiguous,1);
assert.equal(result.unscored,1);
assert.equal(result.winRatePct,50);
assert.equal(result.resultSampleSize,2);
assert.equal(result.meanGrossPct,3);
assert.equal(result.medianGrossPct,3,'an even sample uses both middle values');
assert.equal(result.closedWithoutOutcomeEvidence,3,'old results are counted as legacy evidence, not retroactively validated');
assert.equal(metrics([{outcome:'stop-hit',outcomeEvidence:'ambiguous_bar',resultPct:-90}]).winRatePct,null);
assert.equal(metrics([{outcome:'unknown',resultPct:900}]).meanGrossPct,null);
assert.equal(metrics([{outcome:'target-hit',resultPct:null}]).missingReturns,1);
assert.equal(metrics([{outcome:'open'}]).resultSampleSize,0);
console.log('Historical audit excludes ambiguous/unknown/open outcomes and preserves unknown measurements');
