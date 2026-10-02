'use strict';
const string = { type: 'string' };
const number = { type: 'number' };
const nullableNumber = { type: ['number', 'null'] };
const strings = { type: 'array', items: string };
const market = { type: 'string', enum: ['us', 'bist', 'crypto'] };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (properties) => ({ type: 'array', items: object(properties) });
module.exports = object({
  macroSummary: string,
  todayFocus: string,
  commentary: object({ us: string, bist: string, crypto: string }),
  coverage: array({ market, status: { type: 'string', enum: ['available', 'partial', 'insufficient_evidence'] }, reason: string }),
  sources: array({ id: string, url: string, title: string, publishedAt: { type: ['string', 'null'] }, kind: { type: 'string', enum: ['primary', 'secondary'] }, evidence: string }),
  events: array({ id: string, title: string, market, sourceIds: strings, whatChanged: string, expectationGap: string, counterEvidence: string }),
  forecasts: array({ eventId: string, market, symbol: string, metric: string, unit: string, period: string,
    scheduledAt: string, pointEstimate: number, consensus: nullableNumber, consensusSourceId: string,
    probabilityAboveConsensus: nullableNumber, rationale: string, sourceIds: strings,
    resolution: object({ provider: { type: 'string', enum: ['finnhub-earnings', 'bls-first-release', 'manual'] },
      field: { type: 'string', enum: ['epsActual', 'revenueActual', 'nonfarmPayrollChange', 'cpiHeadlineMomSa', 'cpiCoreMomSa', 'cpiHeadlineYoyNsa', 'cpiCoreYoyNsa', 'manual'] }, sourceUrl: string }),
  }),
  scenarios: array({ eventId: string, market, symbol: string, condition: string, impact: string, horizon: string, invalidation: string, sourceIds: strings }),
  signals: array({ eventId: string, market, symbol: string, adjustment: number, confidence: number, sourceId: string, asOf: string, expiresAt: string, reason: string }),
  unresolvedQuestions: strings,
});
