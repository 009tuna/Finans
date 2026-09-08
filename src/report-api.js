'use strict';
const db = require('./db');
const { envelope } = require('../public/report-integrity');
async function getReportPayload() {
  const [record, snapshot, tips] = await Promise.all([
    db.getReport(undefined, { strict: true }), db.getLatestSnapshot({ strict: true }), db.getCache('tips_archive'),
  ]);
  return { ...envelope(record, snapshot), tipsArchive: tips && Array.isArray(tips.value) ? tips.value : [] };
}
module.exports = { getReportPayload };
