'use strict';
const assert = require('node:assert/strict');
const Experience = require('../public/experience');
const Action = require('../public/action-layer');

const at = (day) => '2026-10-' + String(day).padStart(2, '0') + 'T12:00:00.000Z';
const points = [{ at: at(1), score: 40 }, { at: at(2), score: 60 }, { at: at(3), score: 45 }];
const before = structuredClone(points);
assert.match(Experience.historyTraceHtml(points), /3 kayıt/);
assert.match(Experience.historyTraceHtml(points), /Dikey ölçek 0–100/);
assert.match(Experience.historyTraceHtml(points, { compact: true }), /^<span class="technical-trace technical-trace-compact">/);
assert.doesNotMatch(Experience.historyTraceHtml(points, { compact: true }), /<details|<table|<button|<figure/, 'A candidate button cannot contain another interactive control or flow-only figure.');
assert.deepEqual(points, before, 'The mini trace cannot rewrite source history.');
assert.equal(Experience.historyTraceHtml([{ at: at(1), score: 40 }, { at: at(1), score: 40 }]), '', 'One unique timestamp is not a series.');
assert.equal(Experience.historyTraceHtml([{ at: at(1), score: 40 }, { at: at(1), score: 41 }, { at: at(2), score: 60 }]), '', 'Conflicting timestamps cannot be evidence.');
assert.equal(Experience.historyTraceHtml([{ at: '2026-10-01', score: 40 }, { at: at(2), score: '60' }, { at: at(3), score: NaN }]), '', 'Unknown timezone, string score and non-finite score cannot draw history.');
assert.equal(Experience.historyTraceHtml(points, { asOf: at(1) }), '', 'After-cutoff history cannot be shown.');
assert.equal(Experience.historyTraceHtml(points, { asOf: 'invalid' }), '');
const thirty = Experience.historyTraceHtml(Array.from({ length: 31 }, (_, i) => ({ at: new Date(Date.parse(at(1)) + i * 86400000).toISOString(), score: i })));
assert.match(thirty, /Son 30 kaydedilen puan/);
assert.equal((thirty.match(/<tr>/g) || []).length, 31, 'Thirty points plus the table header are available without chart vision.');
assert.doesNotMatch(Experience.historyTraceHtml(points, { label: '<img src=x onerror=evil()>' }), /<img/);

const snapshot = { generatedAt: at(4), us: [{ market: 'us', symbol: 'TEST', analysis: { score: 60 }, decision: { confidence: { previousScore: 50 } } }] };
const digest = Action.buildDailyChangeDigest(snapshot);
const input = { snapshot, digest, now: at(4), research: { forecasts: [{ metric: 'us_cpi_headline_mom', period: '2026-09', scheduledAt: at(10) }], forecastAbstentions: [{ metric: 'us_nonfarm_payroll_change', period: '2026-09', scheduledAt: at(3) }] }, cockpit: { rows: [{ market: 'us', symbol: 'TEST', evidenceGaps: ['tez notu yok'], nextAction: 'Tez notunu yaz' }] } };
const inputBefore = structuredClone(input);
const brief = Experience.buildDailyBrief(input);
assert.equal(brief.lines.length, 3);
assert.match(brief.lines[0].text, /önceki teknik kayda.*10 puan|önceki teknik kayda.*\+10 puan/);
assert.match(brief.lines[0].text, /Karşılaştırma: 1\/1/);
assert.equal(brief.lines[1].scheduledAt, at(10), 'A passed event is not the next release.');
assert.match(brief.lines[2].text, /TEST.*Tez notunu yaz/);
assert.deepEqual(input, inputBefore, 'The brief is a presentation only.');
assert.match(Experience.dailyBriefHtml(brief), /data-brief-market="us".*data-brief-symbol="TEST"/);
const noEvidence = Experience.buildDailyBrief({ now: at(4), snapshot: { macro: { status: 'unavailable', nextEvent: { title: 'Unavailable schedule', scheduledAt: at(5) } } }, research: { forecasts: [{ metric: 'test', scheduledAt: at(3) }, { metric: 'conflict', scheduledAt: at(5), scheduleConflict: true }] } });
assert.match(noEvidence.lines[0].text, /ölçülemedi/);
assert.match(noEvidence.lines[1].text, /doğrulanamadı/);
assert.match(noEvidence.lines[2].text, /henüz hesaplanmadı/);
assert.equal(Experience.buildDailyBrief({ now: 'not-a-time', research: { forecasts: [{ metric: 'test', scheduledAt: at(5) }] } }).lines[1].scheduledAt, undefined);
for (const metric of ['us_cpi_headline_mom_sa', 'us_cpi_core_mom_sa', 'us_cpi_headline_yoy_nsa', 'us_cpi_core_yoy_nsa', 'tr_cpi_mom', 'tr_cpi_yoy', 'tcmb_policy_rate']) {
  const text = Experience.buildDailyBrief({ now: at(4), research: { forecasts: [{ metric, scheduledAt: at(5) }] } }).lines[1].text;
  assert.doesNotMatch(text, /\b(?:us_|tr_|tcmb_)/, 'A live measurement identifier must not leak into the daily summary.');
  assert.doesNotMatch(text, /Ölçüm açıklaması/, 'Known measurements have readable labels.');
}
assert.match(Experience.buildDailyBrief({ now: at(4), events: [{ metric: 'unknown_measurement', title: 'Doğrulanmış takvim başlığı', scheduledAt: at(5) }] }).lines[1].text, /^Doğrulanmış takvim başlığı/);
assert.match(Experience.buildDailyBrief({ now: at(4), events: [{ metric: 'unknown_measurement', title: 'unknown_measurement', scheduledAt: at(5) }] }).lines[1].text, /^Ölçüm açıklaması/);
assert.match(Experience.buildDailyBrief({ now: at(4), events: [{ metric: 'unknown_measurement', scheduledAt: at(5) }] }).lines[1].text, /^Ölçüm açıklaması/);

function memoryStorage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) || null, setItem: (key, value) => items.set(key, value), items };
}
const storage = memoryStorage();
const store = Experience.createProgressStore(storage, { now: () => at(4) });
assert.equal(store.getReview('us:TEST', 'r1').reviewed, false, 'Viewing does not create completion.');
assert.equal(store.setReviewed('us:TEST', 'r1', true).persistent, true);
assert.equal(store.getReview('us:TEST', 'r1').reviewed, true);
assert.equal(store.getReview('us:TEST', 'r2').reviewed, false, 'New data requires a new explicit review.');
assert.equal(store.getReview('us:TEST', 'r2').changed, true);
store.setReviewed('us:TEST', 'r1', false);
assert.equal(store.getReview('us:TEST', 'r1').reviewed, false, 'The user can undo an optional review.');
assert.equal(store.setReviewed('us:TEST', 'r1', 'yes'), null);
assert.equal(store.saveResume('2026-10-04', 'r1', 'report-summary', 'Özet').persistent, true);
assert.equal(store.getResume('2026-10-04', 'r1').section, 'report-summary');
assert.equal(store.getResume('2026-10-04', 'r2'), null, 'A revised report cannot reuse an old reading position.');
assert.equal(store.saveResume('2026-10-04', 'r1', 'x" onclick="evil()', 'Invalid'), null);
assert.match(Experience.resumeHtml(store.getResume('2026-10-04', 'r1')), /data-resume-section="report-summary"/);
assert.doesNotMatch(Experience.resumeHtml({ section: 'report-summary', label: '<img onerror=x>' }), /<img/);
assert.match(Experience.reviewHtml('us:TEST', 'r2', store.getReview('us:TEST', 'r2')), /Veri kesiti değişti/);
assert.match(Experience.reviewHtml('us:TEST', 'r2'), /<p[^>]+role="status"[^>]+data-review-status/, 'The root can update and announce the explicit review save result.');
const blocked = Experience.createProgressStore({ getItem: () => { throw new Error('Denied'); }, setItem: () => { throw new Error('Denied'); } }, { now: () => at(4) });
assert.equal(blocked.saveResume('r', 'rev', 'summary', 'Özet').persistent, false);
assert.equal(blocked.getResume('r', 'rev').section, 'summary', 'A denied storage write keeps the current session useful.');
const readOnly = Experience.createProgressStore({ getItem: () => storage.getItem('finans-experience-v1'), setItem: () => { throw new Error('Quota'); } }, { now: () => at(4) });
assert.equal(readOnly.setReviewed('us:NEW', 'r1', true).persistent, false);
assert.equal(readOnly.getReview('us:NEW', 'r1').reviewed, true, 'A failed write cannot be undone by re-reading the old record.');

assert.equal(Experience.revisionKey({ score: 1, date: at(1) }), Experience.revisionKey({ date: at(1), score: 1 }), 'Object key ordering does not reset progress.');
assert.notEqual(Experience.revisionKey({ score: 1, date: at(1) }), Experience.revisionKey({ score: 1, date: at(2) }));
assert.notEqual(Experience.revisionKey({ score: 1 }), Experience.revisionKey({ score: '1' }));
const cycle = {}; cycle.self = cycle;
assert.equal(Experience.revisionKey(cycle), null);
assert.equal(Experience.revisionKey(null), null);

const calls = [];
const calculate = (...args) => { calls.push(args); return Action.calculatePosition(...args); };
const calculatorInput = { capital: 100000, riskPct: 1, price: 100, atr: 2, currency: 'TRY' };
const comparison = Experience.positionComparisonHtml(calculatorInput, calculate);
assert.deepEqual(calls, [[100000, 1, 100, 2], [100000, 0.5, 100, 2]], 'Both results use the established calculation constraints.');
assert.match(comparison, /A · mevcut girdiler/);
assert.match(comparison, /B · değiştirilen varsayım/);
assert.match(comparison, /aynı para biriminde olmalıdır: TRY/);
assert.match(comparison, /Komisyon.*fiyat kayması dahil değildir/);
assert.match(comparison, /Öğretici örnek.*Örnek bir varlığa veya güncel fiyata ait değildir/);
assert.doesNotMatch(comparison, /Öğretici TL örneği uygulanıyor/);
assert.match(Experience.positionComparisonHtml({ ...calculatorInput, currency: 'TL', example: true }, Action.calculatePosition), /Öğretici TL örneği uygulanıyor/);
calls.length = 0;
Experience.positionComparisonHtml(calculatorInput, calculate, { mode: 'atr' });
assert.deepEqual(calls[1], [100000, 1, 100, 4]);
assert.match(Experience.positionComparisonHtml(calculatorInput, Action.calculatePosition, { alternativeRiskPct: 2 }), /Risk bütçesini %2 olarak dene/);
const limited = Experience.positionComparisonHtml({ capital: 10, riskPct: 100, price: 1, atr: 0.1 }, Action.calculatePosition);
assert.match(limited, /Adet mevcut sermayeyle sınırlandı/);
const invalid = Experience.positionComparisonHtml({ ...calculatorInput, atr: 100 }, Action.calculatePosition);
assert.match(invalid, /Hesaplanamadı/);
assert.doesNotMatch(invalid, /<dd>/, 'Rejected scenarios cannot display fabricated numeric results.');
assert.equal(calculatorInput.atr, 2, 'Trying an alternative does not mutate the original inputs.');

for (const topic of ['rsi', 'consensus', 'control']) {
  const html = Experience.contextHelpHtml(topic, { value: 90 });
  assert.match(html, /<details class="context-help">/);
  assert.match(html, /Neyi ölçer/);
  assert.match(html, /Neyi söylemez/);
  assert.match(html, new RegExp('data-learning-topic="' + topic + '"'));
}
assert.equal(Experience.contextHelpHtml('invented'), '');
assert.match(Experience.contextHelpHtml('control'), /Kazanç olasılığı.*anlamına gelmez/);
assert.match(Experience.contextHelpHtml('consensus'), /kaynağı doğrulanamadığında fark hesaplanamaz/);
assert.doesNotMatch(Experience.contextHelpHtml('rsi', { value: '90' }), /Bu kayıttaki değer/);
assert.doesNotMatch([comparison, Experience.historyTraceHtml(points), Experience.contextHelpHtml('rsi'), Experience.dailyBriefHtml(brief), Experience.reviewHtml('us:TEST', 'r1')].join(''), /font(?:-size)?\s*:/, 'The approved implementation must preserve font sizes.');
const motionCalls = [];
const cards = Array.from({ length: 15 }, () => ({ animate(frames, options) {
  const handlers = {};
  const animation = { cancelled: false, cancel() { this.cancelled = true; if (handlers.cancel) handlers.cancel(); }, addEventListener(name, callback) { handlers[name] = callback; } };
  motionCalls.push({ frames, options, animation });
  return animation;
} }));
const motionContainer = { querySelectorAll() { return cards; } };
assert.equal(Experience.revealCandidateCards(motionContainer, { reducedMotion: true }), 0);
assert.equal(motionCalls.length, 0, 'Reduced motion never starts a reveal.');
assert.equal(Experience.revealCandidateCards(motionContainer), 12, 'Only a bounded number of cards can animate.');
assert.ok(motionCalls.every(call => call.options.duration + call.options.delay <= 220 && call.options.fill === 'none'));
assert.ok(motionCalls.every(call => call.frames.every(frame => frame.opacity > 0 && Object.keys(frame).every(key => ['opacity', 'transform'].includes(key)))), 'Motion cannot hide content or animate layout properties.');
Experience.cancelCandidateMotion();
assert.ok(motionCalls.every(call => call.animation.cancelled), 'A motion preference change or tab exit cancels every active reveal.');
assert.equal(Experience.revealCandidateCards({ querySelectorAll() { return [{}]; } }), 0, 'Unsupported animation APIs leave visible static cards.');
assert.equal(Experience.revealCandidateCards(null), 0);
console.log('Experience helpers passed: history, factual brief, revision-scoped progress, calculator constraints, contextual help and bounded cancellable card motion.');
