'use strict';
const { isAuthorized } = require('./admin-auth');
const { readLedger, updateLedger, scorecard, resolveForecast } = require('./research-ledger');
async function handleResearch(req) {
  if (!['GET', 'POST'].includes(req.method)) return { status: 405, body: { error: 'Method not allowed' } };
  if (req.method === 'POST' && !isAuthorized(req)) return { status: 401, body: { error: 'Admin yetkisi gerekli' } };
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body?.action !== 'resolve' || body.confirmed !== true) return { status: 400, body: { error: 'Kaynak ve gerceklesen deger insan tarafindan kontrol edilmeli' } };
      await updateLedger((ledger) => resolveForecast(ledger, body, new Date().toISOString()));
    }
    const { value } = await readLedger();
    return { status: 200, body: { scorecard: scorecard(value), forecasts: value.forecasts.slice(-100).reverse(), outcomes: value.outcomes,
      latestRun: value.runs.length ? { runId: value.runs.at(-1).runId, recordedAt: value.runs.at(-1).recordedAt } : null } };
  } catch (e) {
    return { status: e instanceof SyntaxError ? 400 : e.statusCode || 503,
      body: { error: e.statusCode === 400 ? e.message : 'Arastirma gunlugune erisilemedi veya kayit cakisti' } };
  }
}
module.exports = { handleResearch };
