'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateDCF } = require('../src/forecast');
const base = (extra = {}) => ({
  currentPrice: 1, revenue: 1, sharesOutstanding: 1,
  revenueGrowthY1Y5: 0, revenueGrowthY6Y10: 0,
  ebitMargin: 25, taxRate: 0, capexAsPctOfRev: 0, daAsPctOfRev: 0, nwcChangeAsPctOfRev: 0,
  wacc: 10, terminalGrowthRate: 0, netDebt: 0, ...extra,
});
const close = (actual, expected, precision = 0.0051) => assert.ok(Math.abs(actual - expected) <= precision, `${actual} should be within ${precision} of ${expected}`);

test('DCF uses the unrounded terminal cash flow and matches a constant-cash perpetuity identity', () => {
  const result = calculateDCF(base());
  assert.equal(result.forecast[9].fcf, 0.25);
  assert.equal(result.terminalValue, 2.5, '0.25 next-year cash flow / 10% discount rate');
  assert.equal(result.enterpriseValue, 2.5, '10 discounted years plus continuation equal the same perpetuity');
  assert.equal(result.fairValue, 2.5);
  assert.equal(result.marginOfSafety, 60);
  assert.equal(result.sensitivity.matrix[2][2], result.fairValue);
});

test('DCF is invariant to a consistent currency conversion and never treats money amounts as millions', () => {
  const result = calculateDCF(base({ revenue: 1.2, currentPrice: 1, netDebt: 0.2 }));
  const converted = calculateDCF(base({ revenue: 48, currentPrice: 40, netDebt: 8 }));
  assert.equal(result.fairValue, 2.8);
  assert.equal(converted.fairValue, 112);
  close(converted.fairValue, result.fairValue * 40);
  assert.equal(converted.marginOfSafety, result.marginOfSafety);
  assert.equal(converted.metadata.currencyBasis, 'all_monetary_inputs_same_currency');
});

test('zero first-period growth does not erase the explicitly supplied second-period growth in sensitivity', () => {
  const result = calculateDCF(base({ revenue: 1000, sharesOutstanding: 100, revenueGrowthY6Y10: 12 }));
  assert.equal(result.sensitivity.matrix[2][2], result.fairValue);
  assert.equal(result.sensitivity.fixedGrowthY6Y10, 12);
  assert.equal(result.sensitivity.colLabel, '1–5 yıl büyüme');
  const lowerFirstPeriod = calculateDCF(base({ revenue: 1000, sharesOutstanding: 100, revenueGrowthY1Y5: -4, revenueGrowthY6Y10: 12 }));
  assert.equal(result.sensitivity.matrix[2][0], lowerFirstPeriod.fairValue);
});

test('sensitivity varies its declared input only and never invents -120% second-period revenue growth', () => {
  const inputs = base({ revenue: 1000, sharesOutstanding: 100, revenueGrowthY1Y5: 1, revenueGrowthY6Y10: 40, ebitMargin: 20 });
  const result = calculateDCF(inputs);
  const changed = calculateDCF({ ...inputs, revenueGrowthY1Y5: -3 });
  assert.equal(result.sensitivity.matrix[2][0], changed.fairValue);
  assert.equal(result.sensitivity.fixedGrowthY6Y10, 40);
  assert.ok(changed.forecast.every(row => row.revenue > 0));
  assert.equal(result.sensitivity.matrix[2][2], result.fairValue);
});

test('DCF rejects missing, blank, string, nonfinite and nonpositive required numbers', () => {
  for (const field of ['currentPrice', 'revenue', 'sharesOutstanding']) {
    for (const value of [undefined, null, '', '1', '12bad', NaN, Infinity, -Infinity, 0, -1]) {
      assert.throws(() => calculateDCF(base({ [field]: value })), /sonlu sayısal|pozitif/);
    }
  }
  for (const field of ['revenueGrowthY1Y5', 'revenueGrowthY6Y10', 'ebitMargin', 'taxRate', 'capexAsPctOfRev', 'daAsPctOfRev', 'nwcChangeAsPctOfRev', 'wacc', 'terminalGrowthRate', 'netDebt']) {
    for (const value of [null, '', '1', NaN, Infinity]) {
      assert.throws(() => calculateDCF(base({ [field]: value })), /sonlu sayısal/);
    }
  }
});

test('DCF rejects domains that imply negative revenue or undefined discount factors', () => {
  for (const field of ['revenueGrowthY1Y5', 'revenueGrowthY6Y10']) assert.throws(() => calculateDCF(base({ [field]: -101 })), /Gelir büyümesi/);
  assert.throws(() => calculateDCF(base({ wacc: -100, terminalGrowthRate: -101 })), /-%100/);
  assert.throws(() => calculateDCF(base({ terminalGrowthRate: -100 })), /-%100/);
  assert.throws(() => calculateDCF(base({ wacc: 2, terminalGrowthRate: 2 })), /WACC/);
  assert.throws(() => calculateDCF(base({ wacc: 2, terminalGrowthRate: 3 })), /WACC/);
  assert.throws(() => calculateDCF(base({ taxRate: 101 })), /Vergi oranı/);
  assert.throws(() => calculateDCF(base({ taxRate: -1 })), /Vergi oranı/);
  assert.throws(() => calculateDCF(base({ capexAsPctOfRev: -1 })), /CAPEX/);
  assert.throws(() => calculateDCF(base({ daAsPctOfRev: -1 })), /amortisman/);
});

test('nonpositive equity is preserved mathematically with an unavailable safety margin', () => {
  const negative = calculateDCF(base({ netDebt: 5 }));
  assert.equal(negative.equityValue, -2.5);
  assert.equal(negative.fairValue, -2.5);
  assert.equal(negative.marginOfSafety, null);
  assert.equal(negative.metadata.valuationStatus, 'non_positive_value');
  assert.equal(negative.metadata.marginOfSafetyReason, 'non_positive_fair_value');
  assert.equal(negative.sensitivity.matrix[2][2], -2.5);
  const zero = calculateDCF(base({ ebitMargin: 0 }));
  assert.equal(zero.fairValue, 0);
  assert.equal(zero.marginOfSafety, null);
});

test('negative net debt, loss margins and working-capital release remain permitted assumptions', () => {
  const result = calculateDCF(base({ netDebt: -1 }));
  assert.equal(result.fairValue, 3.5);
  const released = calculateDCF(base({ nwcChangeAsPctOfRev: -5 }));
  assert.equal(released.fairValue, 3);
  const losses = calculateDCF(base({ ebitMargin: -25 }));
  assert.equal(losses.fairValue, -2.5);
  assert.equal(losses.marginOfSafety, null);
  assert.ok(calculateDCF(base({ wacc: -1, terminalGrowthRate: -2 })).fairValue > 0, 'a mathematically valid discount factor is not rejected solely for a negative rate');
});

test('invalid sensitivity discount or growth combinations are unavailable cells, not zero prices', () => {
  const nearTerminal = calculateDCF(base({ wacc: 3, terminalGrowthRate: 2.5 }));
  assert.ok(nearTerminal.sensitivity.matrix[0].every(value => value === null));
  assert.ok(nearTerminal.sensitivity.matrix[1].every(value => value === null));
  assert.equal(nearTerminal.sensitivity.matrix[2][2], nearTerminal.fairValue);
  const contraction = calculateDCF(base({ revenueGrowthY1Y5: -98 }));
  assert.ok(contraction.sensitivity.matrix.every(row => row[0] === null));
  assert.ok(contraction.sensitivity.matrix.every(row => row[1] === 0), 'an observed valid -100% growth scenario really has zero future cash flow');
});

test('all applied cash-flow assumptions are returned in normalized parameters', () => {
  const result = calculateDCF({ currentPrice: 10, revenue: 1000, sharesOutstanding: 100 });
  assert.equal(result.parameters.taxRate, 21);
  assert.equal(result.parameters.capexAsPctOfRev, 5);
  assert.equal(result.parameters.daAsPctOfRev, 3);
  assert.equal(result.parameters.nwcChangeAsPctOfRev, 1);
  assert.equal(result.metadata.rateUnit, 'percent');
});

test('finite inputs that overflow the model fail explicitly instead of publishing Infinity or serialized null', () => {
  assert.throws(() => calculateDCF(base({ revenue: 1e308, revenueGrowthY1Y5: 100 })), /Hesaplama sonucu|Hesaplanan DCF/);
  assert.throws(() => calculateDCF(base({ revenue: 100, sharesOutstanding: Number.MIN_VALUE })), /Hesaplanan DCF/);
});
