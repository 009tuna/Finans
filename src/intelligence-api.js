'use strict';
const { getMacroPayload } = require('./macro-store');
const { getMarketNews } = require('./market-news');
const { readLedger } = require('./research-ledger');
async function handleIntelligence(req, { database, resource = 'macro', now } = {}) {
  if (req.method !== 'GET') return { status: 405, body: { error: 'Method not allowed' } };
  const researchCheckedAt = (() => { const date = new Date(now || Date.now()); return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(); })();
  try {
    // Independent sources remain usable when the optional model ledger is inaccessible.
    let research = {}; let researchStatus = 'available';
    try { research = (await readLedger(database)).value; } catch (_) { researchStatus = 'unavailable'; }
    const body = resource === 'market-news' ? await getMarketNews({ database, report: research.publication, now }) : await getMacroPayload({ database, researchLedger: research, now });
    const decorated = { ...body, researchStatus, researchCheckedAt };
    if (resource === 'macro' && decorated.storeStatus?.status === 'unavailable' && decorated.families?.us_cpi?.storeStatus?.status === 'unavailable') {
      return { status: 503, body: { error: 'Kaynak ve tahmin kayıtlarına erişilemedi. Son başarılı içerik korunur.', researchStatus, researchCheckedAt } };
    }
    return { status: 200, body: decorated };
  } catch (_) { return { status: 503, body: { error: 'Kaynak ve tahmin kayıtlarına erişilemedi. Son başarılı içerik korunur.' } }; }
}
module.exports = { handleIntelligence };
