'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateGraham, calculateDDM } = require('../src/forecast');

const grahamInputs = { currentPrice: 100, eps: 5, growthRate: 8, aaaBondYield: 4.4 };
const ddmInputs = { currentPrice: 80, recentDividend: 3.5, dividendGrowthRate: 5, wacc: 10 };

test('Graham retains percentage-point growth and yield units and its current coefficients', () => {
  const result = calculateGraham(grahamInputs);
  assert.equal(result.fairValue, 122.5);
  assert.equal(result.marginOfSafety, 18.37);
  assert.equal(result.sensitivity.matrix[2][2], result.fairValue);
  assert.deepEqual(result.parameters, grahamInputs);
  assert.deepEqual(result.metadata, {
    valuationStatus: 'calculated', marginOfSafetyReason: null,
    rateUnit: 'percent', currencyBasis: 'all_monetary_inputs_same_currency',
  });
});

test('DDM values the next annual per-share dividend from the most recent annual dividend', () => {
  const result = calculateDDM(ddmInputs);
  // D1 = 3.5 * 1.05 = 3.675; P = 3.675 / (0.10 - 0.05) = 73.5.
  assert.equal(result.fairValue, 73.5);
  assert.equal(result.marginOfSafety, -8.84);
  assert.equal(result.sensitivity.matrix[2][2], result.fairValue);
  assert.deepEqual(result.parameters, ddmInputs);
});

test('changing the monetary unit scales income-model values and leaves their margin unchanged', () => {
  const graham = calculateGraham(grahamInputs);
  const scaledGraham = calculateGraham({ ...grahamInputs, currentPrice: 1000, eps: 50 });
  assert.equal(scaledGraham.fairValue, graham.fairValue * 10);
  assert.equal(scaledGraham.marginOfSafety, graham.marginOfSafety);
  const ddm = calculateDDM(ddmInputs);
  const scaledDDM = calculateDDM({ ...ddmInputs, currentPrice: 800, recentDividend: 35 });
  assert.equal(scaledDDM.fairValue, ddm.fairValue * 10);
  assert.equal(scaledDDM.marginOfSafety, ddm.marginOfSafety);
});

test('income models reject absent required inputs and every nonnumeric or nonfinite supplied input', () => {
  const invalid = [null, '', '5', '5suffix', NaN, Infinity, -Infinity, true, [], {}];
  for (const [calculate, inputs] of [[calculateGraham, grahamInputs], [calculateDDM, ddmInputs]]) {
    for (const key of Object.keys(inputs)) {
      for (const value of invalid) {
        assert.throws(() => calculate({ ...inputs, [key]: value }), `${key} accepted ${String(value)}`);
      }
    }
    for (const key of ['currentPrice', calculate === calculateGraham ? 'eps' : 'recentDividend']) {
      const missing = { ...inputs };
      delete missing[key];
      assert.throws(() => calculate(missing), `${key} was omitted`);
    }
  }
});

test('optional defaults remain numeric and are included in captured parameters', () => {
  assert.deepEqual(calculateGraham({ currentPrice: 100, eps: 5 }).parameters, {
    currentPrice: 100, eps: 5, growthRate: 10, aaaBondYield: 4.5,
  });
  assert.deepEqual(calculateDDM({ currentPrice: 100, recentDividend: 5 }).parameters, {
    currentPrice: 100, recentDividend: 5, dividendGrowthRate: 5, wacc: 9.5,
  });
});

test('income models require positive price and income and Graham requires a positive AAA yield', () => {
  for (const value of [0, -1]) {
    assert.throws(() => calculateGraham({ ...grahamInputs, currentPrice: value }));
    assert.throws(() => calculateDDM({ ...ddmInputs, currentPrice: value }));
    assert.throws(() => calculateGraham({ ...grahamInputs, eps: value }));
    assert.throws(() => calculateDDM({ ...ddmInputs, recentDividend: value }));
    assert.throws(() => calculateGraham({ ...grahamInputs, aaaBondYield: value }), /AAA kurumsal tahvil faizi sıfırdan büyük olmalıdır/);
  }
});

test('a nonpositive Graham result retains its mathematical value and has no security margin', () => {
  const negative = calculateGraham({ currentPrice: 100, eps: 5, growthRate: -10, aaaBondYield: 4.5 });
  assert.equal(negative.fairValue, -56.22);
  assert.equal(negative.sensitivity.matrix[2][2], -56.22);
  assert.equal(negative.marginOfSafety, null);
  assert.equal(negative.metadata.valuationStatus, 'non_positive_value');
  assert.equal(negative.metadata.marginOfSafetyReason, 'non_positive_fair_value');
  const zero = calculateGraham({ ...grahamInputs, growthRate: -4.25 });
  assert.equal(zero.fairValue, 0);
  assert.equal(zero.marginOfSafety, null);
  assert.equal(zero.metadata.valuationStatus, 'non_positive_value');
});

test('Graham sensitivity marks invalid yields unavailable without clamping negative formula values', () => {
  const result = calculateGraham({ currentPrice: 100, eps: 5, growthRate: -4, aaaBondYield: 0.5 });
  assert.deepEqual(result.sensitivity.matrix[0], [null, null, null, null, null]);
  assert.deepEqual(result.sensitivity.matrix[1], [null, null, null, null, null]);
  assert.equal(result.sensitivity.matrix[2][0], -330);
  assert.equal(result.sensitivity.matrix[2][2], result.fairValue);
});

test('DDM checks both perpetuity-domain boundaries and rejects equal or lower discount rates', () => {
  for (const [growth, discount] of [[-100, -99], [-101, -99], [-150, -120], [-101, -100], [8, 8], [8, 7]]) {
    assert.throws(() => calculateDDM({ ...ddmInputs, dividendGrowthRate: growth, wacc: discount }));
  }
  const validNegativeRates = calculateDDM({ currentPrice: 18, recentDividend: 1, dividendGrowthRate: -10, wacc: -5 });
  assert.equal(validNegativeRates.fairValue, 18);
  assert.equal(validNegativeRates.marginOfSafety, 0);
});

test('DDM sensitivity distinguishes invalid growth and discount scenarios from zero valuations', () => {
  const crossing = calculateDDM({ currentPrice: 50, recentDividend: 1, dividendGrowthRate: 4, wacc: 5 });
  assert.equal(crossing.sensitivity.matrix[0][0], 102);
  assert.equal(crossing.sensitivity.matrix[0][1], null);
  assert.equal(crossing.sensitivity.matrix[2][3], null);
  assert.equal(crossing.sensitivity.matrix[2][2], 104);
  const boundary = calculateDDM({ currentPrice: 1, recentDividend: 1, dividendGrowthRate: -99, wacc: -98 });
  assert.deepEqual(boundary.sensitivity.matrix[0], [null, null, null, null, null]);
  assert.ok(boundary.sensitivity.matrix.every(row => row[0] === null && row[1] === null));
  assert.equal(boundary.sensitivity.matrix[2][2], 1);
});

test('finite inputs that overflow a main calculation are rejected instead of producing JSON null', () => {
  assert.throws(() => calculateGraham({ ...grahamInputs, eps: 1e308 }));
  assert.throws(() => calculateDDM({ ...ddmInputs, recentDividend: 1e308 }));
  // Values remain mathematically finite, but their two-decimal rounding would overflow.
  assert.throws(() => calculateGraham({ ...grahamInputs, eps: 1e306 }));
  assert.throws(() => calculateDDM({ ...ddmInputs, recentDividend: 1e306 }));
  // An extreme price cannot produce a nonfinite security-margin result either.
  assert.throws(() => calculateGraham({ ...grahamInputs, currentPrice: 1e308 }));
});

test('overflow confined to a sensitivity scenario leaves the main model intact and marks that cell unavailable', () => {
  const graham = calculateGraham({ ...grahamInputs, eps: 1e306, growthRate: -4.25 });
  assert.equal(graham.fairValue, 0);
  assert.equal(graham.sensitivity.matrix[2][2], 0);
  assert.equal(graham.sensitivity.matrix[2][0], null);
  assert.equal(graham.marginOfSafety, null);
  const ddm = calculateDDM({ currentPrice: 1, recentDividend: 1e291, dividendGrowthRate: 1, wacc: 3.0000000000000004 });
  assert.ok(Number.isFinite(ddm.fairValue));
  assert.equal(ddm.sensitivity.matrix[2][2], ddm.fairValue);
  assert.equal(ddm.sensitivity.matrix[0][2], null);
});
