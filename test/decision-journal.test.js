// Decision journal persistence tests.
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeJournal,
  upsertNote,
  upsertAlert,
  recordPrediction,
  buildPredictionScorecard,
  readJournalFile,
  writeJournalFile,
} = require('../src/decision-journal.js');

const empty = normalizeJournal(null);
assert.deepEqual(empty.notes, {});
assert.deepEqual(empty.alerts, []);
assert.deepEqual(empty.predictions, []);
assert.deepEqual(empty.theses, {});
assert.deepEqual(empty.catalysts, []);
assert.deepEqual(empty.riskRules, []);

const withNote = upsertNote(empty, 'us', 'AAPL', {
  thesis: 'Trend devam ederse izlenir.',
  invalidation: 'Stop altinda tez bozulur.',
}, '2026-06-08T20:00:00.000Z');
assert.equal(withNote.notes['us:AAPL'].thesis, 'Trend devam ederse izlenir.');
assert.equal(withNote.notes['us:AAPL'].invalidation, 'Stop altinda tez bozulur.');

const withAlert = upsertAlert(withNote, {
  market: 'us',
  symbol: 'AAPL',
  trigger: 'AAPL stop $291 altina inerse',
  action: 'Pozisyonu azalt.',
}, '2026-06-08T20:01:00.000Z');
assert.equal(withAlert.alerts.length, 1);
assert.equal(withAlert.alerts[0].enabled, true);

const withPrediction = recordPrediction(withAlert, {
  market: 'us',
  symbol: 'AAPL',
  label: 'AL',
  score: 65,
  entry: 100,
  target: 110,
  stop: 95,
  horizonDays: 30,
}, '2026-06-08T20:02:00.000Z');
assert.equal(withPrediction.predictions.length, 1);
assert.equal(withPrediction.predictions[0].outcome, 'open');

const scorecard = buildPredictionScorecard({
  predictions: [
    { outcome: 'target-hit', label: 'AL' },
    { outcome: 'stop-hit', label: 'AL' },
    { outcome: 'open', label: 'TUT' },
  ],
});
assert.equal(scorecard.closed, 2);
assert.equal(scorecard.winRate, 50);
assert.equal(scorecard.open, 1);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finans-journal-'));
const file = path.join(dir, 'journal.json');
const initial = readJournalFile(file);
assert.deepEqual(initial.notes, {});
writeJournalFile(file, withPrediction);
const roundtrip = readJournalFile(file);
assert.equal(roundtrip.predictions.length, 1);
assert.equal(roundtrip.notes['us:AAPL'].thesis, 'Trend devam ederse izlenir.');

const normalizedExtended = normalizeJournal({
  theses: { 'us:AAPL': { status: 'watch', nextReview: '2026-06-30' } },
  catalysts: [{ market: 'us', symbol: 'AAPL', event: 'WWDC', date: '2026-06-10' }],
  riskRules: [{ market: 'us', symbol: 'AAPL', trigger: 'weight > 20%', action: 'trim' }],
});
assert.equal(normalizedExtended.theses['us:AAPL'].status, 'watch');
assert.equal(normalizedExtended.catalysts[0].event, 'WWDC');
assert.equal(normalizedExtended.riskRules[0].action, 'trim');

console.log('decision journal tests passed');
