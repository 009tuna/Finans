'use strict';
const { isDeepStrictEqual } = require('util');
const { isAuthorized } = require('./admin-auth');
const { readJournal, writeJournal, normalizeJournal } = require('./decision-journal');

async function handleJournal(req, filePath) {
  if (req.method !== 'GET' && req.method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
  if (req.method === 'POST' && !isAuthorized(req)) return { status: 401, body: { error: 'Yetkisiz: admin parolasi gerekli' } };
  try {
    if (req.method === 'GET') return { status: 200, body: await readJournal(filePath) };
    const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !value.notes || typeof value.notes !== 'object' || Array.isArray(value.notes)
      || !Array.isArray(value.alerts) || !Array.isArray(value.predictions)) {
      return { status: 400, body: { error: 'Gecersiz gunluk: notes, alerts ve predictions gerekli' } };
    }
    const current = await readJournal(filePath);
    if (value._revision !== current._revision) return { status: 409, body: { error: 'Gunluk degisti. Yeniden yukleyip duzenlemenizi uygulayin.' } };
    const next = normalizeJournal(value);
    for (const key of ['predictions', 'decisionAudits', 'learningRules', 'reviewQueue']) {
      if (!isDeepStrictEqual(next[key], current[key])) return { status: 400, body: { error: 'Sistem tahminleri ve sonuc kayitlari bu ekrandan degistirilemez' } };
    }
    return { status: 200, body: await writeJournal(filePath, next) };
  } catch (e) {
    return { status: e.statusCode || (e instanceof SyntaxError ? 400 : 503), body: { error: e.statusCode || e instanceof SyntaxError ? e.message : 'Gunluk kaynagina erisilemedi; islem tamamlanmadi' } };
  }
}
module.exports = { handleJournal };
