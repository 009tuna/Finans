'use strict';
const string = { type: 'string' };
const number = { type: 'number' };
const nullableNumber = { type: ['number', 'null'] };
const strings = { type: 'array', items: string };
const market = { type: 'string', enum: ['us', 'bist', 'crypto'] };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (properties) => ({ type: 'array', items: object(properties) });
const schema = object({
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
// Historical runs remain valid. The current generator requires this field so a
// missing numeric estimate has an explicit, displayable evidence gap.
schema.properties.forecastAbstentions = array({ market, metric: string, unit: string, period: string,
  scheduledAt: string, reason: string, missingEvidence: strings, sourceIds: strings });
schema.properties.expectationReassessments = array({ market, metric: string, unit: string, period: string,
  scheduledAt: string, status: { type: 'string', enum: ['unchanged', 'updated', 'abstained'] }, reason: string, sourceIds: strings });
// Analist katmanı (sol-research-v8). Eski çalışmalar bu alanlar olmadan geçerli kalır.
const perMarket = object({ us: string, bist: string, crypto: string });
const conviction = { type: 'string', enum: ['düşük', 'orta', 'yüksek'] };
const marketView = object({ stance: { type: 'string', enum: ['olumlu', 'nötr', 'olumsuz'] }, conviction, thesis: string, drivers: strings, risks: strings, watch: string });
schema.properties.marketViews = object({ us: marketView, bist: marketView, crypto: marketView });
schema.properties.calendarAnalysis = array({ eventId: string, view: string, forecast: string, conviction, above: perMarket, below: perMarket, sourceIds: strings });
schema.properties.turkeyCalendar = array({ id: string, title: string, scheduledAt: string, impact: { type: 'string', enum: ['high', 'medium'] },
  previous: string, forecast: string, actual: string, view: string, conviction, above: perMarket, below: perMarket, sourceIds: strings });
module.exports = schema;
