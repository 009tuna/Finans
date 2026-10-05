'use strict';
const clone = value => JSON.parse(JSON.stringify(value));
function memoryDatabase() {
  const rows = new Map(); let revision = 0;
  return { rows,
    async getCache(key) { return rows.has(key) ? clone(rows.get(key)) : null; },
    async compareAndSetCache(key, value, expected) {
      const old = rows.get(key);
      if ((old ? old.revision : null) !== expected) { const e = new Error('CAS'); e.statusCode = 409; throw e; }
      const next = String(++revision); rows.set(key, {value:clone(value), revision:next}); return next;
    },
  };
}
function example(overrides = {}) {
  return { schemaVersion:1, id:'price:US:ABC:2026-01-01', kind:'price', cohort:'US/ABC/yahoo/USD/unadjusted/price-features-v1',
    createdAt:'2026-01-02T10:00:00Z', knowledgeCutoff:'2026-01-02T10:00:00Z', sourceObservedAt:'2026-01-02T09:00:00Z',
    featureSchemaVersion:'price-features-v1', features:{return21:1,return63:2,return126:3,atrPct:1,rsi14:50,distanceSma50Atr:1,distanceSma200Atr:2},
    evidenceHash:'a'.repeat(64), eligibility:{status:'eligible',reasons:[]}, ...overrides };
}
module.exports = {memoryDatabase,example,clone};
