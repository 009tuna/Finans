'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { KEY: MACRO_KEY, initial: macroInitial, macroPayload, getMacroPayload } = require('../src/macro-store');
const { KEY: CONSENSUS_KEY, refreshMacroConsensus } = require('../src/macro-consensus');
const { updateStore } = require('../src/intelligence-store');
const { createMacroEventLedger, METHODS, METRIC, UNIT } = require('../src/macro-events');
const { run: refreshIntelligence } = require('../scripts/refresh-intelligence');

const clone = (value) => JSON.parse(JSON.stringify(value));
function database() {
  const rows = new Map(); let revision = 0;
  return {
    rows,
    async getCache(key) { return rows.has(key) ? clone(rows.get(key)) : null; },
    async compareAndSetCache(key, value, expected) {
      assert.equal(rows.get(key)?.revision || null, expected);
      const nextRevision = `r${++revision}`;
      rows.set(key, { value: clone(value), revision: nextRevision });
      return nextRevision;
    },
  };
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const period = '2026-09';
const event = { eventId: `${METRIC}:${period}`, metric: METRIC, unit: UNIT, period,
  scheduledAt: '2026-10-02T12:30:00.000Z', sourceUrl: 'https://www.bls.gov/schedule/news_release/empsit.htm',
  contentHash: hash('official BLS September schedule'), observedAt: '2026-10-01T07:00:00.000Z' };
const rawConsensus = `<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle',
  headline: 'US private payrolls growth picks up in September, ADP says', datePublished: '2026-09-30T12:27:36.000Z',
  author: [{ name: 'Reuters' }], articleBody: 'WASHINGTON, Sept 30 (Reuters) - Private employment rose by 90,000 jobs, and economists forecast 70,000. Nonfarm payrolls are expected to have advanced by 90,000 jobs after accelerating 162,000 in August.' })}</script>`;

function seededMacroValue() {
  const observation = { metric: METRIC, unit: UNIT, period: '2026-08', value: 100, vintage: 'first_release',
    publishedAt: '2026-08-07T12:30:00.000Z', observedAt: '2026-08-07T12:35:00.000Z',
    sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_08072026.htm', contentHash: hash('august first release') };
  const ledger = createMacroEventLedger({ observations: [observation] });
  const forecast = ledger.createForecast({ event, methodId: METHODS.last_observation,
    createdAt: '2026-10-01T07:30:00.000Z', knowledgeCutoff: '2026-10-01T07:29:00.000Z' });
  assert.equal(forecast.estimate, 100);
  return { ...macroInitial, events: [event], observations: [observation], forecasts: [forecast],
    sourceStatus: { status: 'available', failures: [] }, updatedAt: '2026-10-01T07:30:00.000Z' };
}

async function main() {
  {
    const db = database();
    await updateStore(MACRO_KEY, macroInitial, () => seededMacroValue(), db);
    await refreshMacroConsensus({ database: db, event, fetchText: async () => rawConsensus,
      now: () => '2026-10-01T08:00:00.000Z' });
    const payload = await getMacroPayload({ database: db, now: '2026-10-01T08:01:00.000Z' });
    const frozen = payload.forecasts.find((forecast) => forecast.eventId === event.eventId && forecast.methodId === METHODS.last_observation);
    assert.equal(frozen.estimate, 100, 'current consensus never rewrites a frozen forecast');
    assert.equal(frozen.knowledgeCutoff, '2026-10-01T07:29:00.000Z');
    assert.equal(payload.consensus.value, 90);
    assert.equal(payload.consensus.eventId, event.eventId);
    assert.equal(payload.consensusHistory.length, 1);
    assert.equal(payload.consensusStatus.status, 'available');
    assert.match(payload.consensusScope, /September 2026/);
    await updateStore(MACRO_KEY, macroInitial, (current) => ({ ...current, events: current.events.map((item) => item.eventId === event.eventId
      ? { ...item, observedAt: '2026-10-01T08:30:00.000Z', contentHash: hash('same date schedule hash refresh') } : item) }), db);
    const refreshedCalendarPayload = await getMacroPayload({ database: db, now: '2026-10-01T08:31:00.000Z' });
    assert.equal(refreshedCalendarPayload.consensus.id, payload.consensus.id,
      'daily schedule hash/observation refresh cannot invalidate an immutable consensus vintage');
  }

  {
    const db = database();
    await updateStore(MACRO_KEY, macroInitial, () => seededMacroValue(), db);
    const databaseWithConsensusReadFailure = {
      getCache: async (key) => {
        if (key === CONSENSUS_KEY) throw new Error('private backend detail');
        return db.getCache(key);
      },
      compareAndSetCache: (...args) => db.compareAndSetCache(...args),
    };
    const payload = await getMacroPayload({ database: databaseWithConsensusReadFailure, now: '2026-10-01T08:01:00.000Z' });
    assert.equal(payload.forecasts[0].estimate, 100);
    assert.equal(payload.consensus, null);
    assert.equal(payload.consensusHistory.length, 0);
    assert.equal(payload.consensusStatus.status, 'unavailable');
    assert.equal(payload.consensusStatus.failures[0].code, 'consensus_store_unavailable');
  }

  {
    const base = seededMacroValue();
    const projection = { current: { eventId: event.eventId, value: 90 }, records: [],
      sourceStatus: { status: 'available' }, scope: 'current panel only' };
    const payload = macroPayload(base, {}, '2026-10-01T08:00:00.000Z', projection);
    assert.equal(payload.consensus.value, 90);
    assert.equal(payload.forecasts[0].estimate, 100);
  }

  {
    const original = { id: 'old-model-forecast', metric: METRIC, unit: UNIT, period,
      eventId: 'research-event-7', pointEstimate: 95, runId: 'run-old' };
    const ledger = { forecasts: [original], runs: [{ runId: 'run-old', research: {
      generatedAt: '2026-09-30T21:43:20.134Z', analysisAsOf: null,
    } }] };
    const projected = macroPayload({ ...macroInitial, events: [event] }, ledger, '2026-10-01T08:00:00.000Z');
    assert.equal(projected.modelForecasts[0].knowledgeCutoff, '2026-09-30T21:43:20.134Z');
    assert.equal(projected.modelForecasts[0].knowledgeCutoffBasis, 'research_generated_at');
    assert.equal(Object.hasOwn(projected.modelForecasts[0], 'createdAt'), false, 'projection does not invent a retrieval/creation timestamp');
    assert.deepEqual(original, { id: 'old-model-forecast', metric: METRIC, unit: UNIT, period,
      eventId: 'research-event-7', pointEstimate: 95, runId: 'run-old' }, 'historical source records remain unchanged');
  }

  {
    const events = [];
    let gets = 0;
    const originalLog = console.log;
    console.log = () => {};
    let output;
    try {
      output = await refreshIntelligence({ now: '2026-10-01T08:00:00.000Z',
        refreshMacro: async () => { events.push('macro'); return { status: 'available' }; },
        refreshMarketNews: async () => { events.push('news'); return { status: 'available' }; },
        refreshCpi: async () => { events.push('cpi'); return { status: 'available' }; },
        getMacroPayload: async () => { gets += 1; events.push(`get${gets}`); return { nextEvent: event, consensus: null }; },
        refreshMacroConsensus: async ({ event: suppliedEvent }) => {
          events.push('consensus'); assert.equal(suppliedEvent.eventId, event.eventId);
          return { status: 'unavailable', errorCode: 'source_unavailable' };
        },
        resolveBlsResearch: async () => { events.push('model'); return { status: 'no_op' }; },
      });
    } finally { console.log = originalLog; }
    assert.equal(output.consensus.status, 'unavailable');
    assert.equal(output.macroPayload.nextEvent.eventId, event.eventId);
    assert.equal(output.macroPayload.consensus, null);
    assert.equal(Object.hasOwn(output.macroPayload, 'forecasts'), false, 'refresh logs do not emit complete ledgers');
    assert.equal(output.modelOutcomes.status, 'no_op', 'consensus failure does not block model resolution');
    assert.ok(events.indexOf('macro') < events.indexOf('get1'));
    assert.ok(events.indexOf('get1') < events.indexOf('consensus'));
    assert.ok(events.indexOf('consensus') < events.indexOf('get2'));
    assert.ok(events.includes('model'));
  }

  {
    const db = database();
    let fetches = 0;
    const wrongPeriod = { ...event, period: '2026-10', eventId: `${METRIC}:2026-10` };
    const result = await refreshMacroConsensus({ database: db, event: wrongPeriod,
      fetchText: async () => { fetches += 1; return rawConsensus; }, now: '2026-10-01T08:00:00.000Z' });
    assert.equal(fetches, 0, 'unreviewed periods do not poll a guessed source');
    assert.equal(result.sourceStatus.status, 'unavailable');
    assert.equal(result.sourceStatus.failures[0].code, 'unsupported_event_or_source');
  }
  console.log('macro-consensus integration tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
