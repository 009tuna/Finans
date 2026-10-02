'use strict';
const { getReportPayload } = require('../src/report-api');
const { handleResearch } = require('../src/research-api');
const { handleIntelligence } = require('../src/intelligence-api');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const resource = req.query?.resource || new URL(req.url || '/', 'http://localhost').searchParams.get('resource');
  if (resource === 'research') {
    const result = await handleResearch(req);
    return res.status(result.status).json(result.body);
  }
  if (resource === 'macro' || resource === 'market-news') {
    const result = await handleIntelligence(req, { resource });
    return res.status(result.status).json(result.body);
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try { return res.status(200).json(await getReportPayload()); }
  catch (_) { return res.status(503).json({ error: 'Rapor kaynagina erisilemedi. Lutfen tekrar deneyin.' }); }
};
