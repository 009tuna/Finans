(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansReportIntegrity = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MAX_AGE_MS = 36 * 60 * 60 * 1000;
  function isFresh(iso, now) {
    var time = typeof iso === 'string' ? Date.parse(iso) : NaN;
    var current = Date.parse(now);
    return Number.isFinite(time) && Number.isFinite(current) && time <= current && current - time < MAX_AGE_MS;
  }
  function snapshotId(snapshot) { return snapshot && (snapshot.snapshotId || snapshot.generatedAt) || null; }
  function assess(base, ai, snapshot, now) {
    now = now || new Date().toISOString();
    var currentId = snapshotId(snapshot);
    var baseStatus = !base ? 'missing' : !base.snapshotId ? 'unverified'
      : !isFresh(base.generatedAt, now) ? 'stale'
      : !currentId || !isFresh(snapshot.generatedAt, now) ? 'unverified'
      : base.snapshotId !== currentId ? 'snapshot-mismatch' : 'current';
    var aiStatus = !ai ? 'missing' : !isFresh(ai.generatedAt, now) ? 'stale'
      : !base || baseStatus !== 'current' || !base.runId || ai.runId !== base.runId || ai.snapshotId !== base.snapshotId ? 'context-mismatch' : 'current';
    return {
      baseStatus: baseStatus, aiStatus: aiStatus,
      reportGeneratedAt: base && base.generatedAt || null,
      reportSnapshotId: base && base.snapshotId || null,
      latestSnapshotId: currentId,
      usableOverlay: baseStatus === 'current' && aiStatus === 'current',
    };
  }
  function envelope(record, snapshot, now) {
    var integrity = assess(record.base, record.ai, snapshot, now);
    var base = record.base ? Object.assign({}, record.base) : null;
    var overlay = base && base.signalOverlay;
    var current = Date.parse(now || new Date().toISOString());
    if (base && (!integrity.usableOverlay || !overlay || overlay.schemaVersion !== 2
      || !isFresh(overlay.generatedAt, now || new Date().toISOString()) || !(Date.parse(overlay.expiresAt) > current))) {
      base.signalOverlay = null;
    }
    return { base: base, ai: integrity.aiStatus === 'current' ? record.ai : null, date: record.date || null, integrity: integrity };
  }
  return { isFresh: isFresh, snapshotId: snapshotId, assess: assess, envelope: envelope };
});
