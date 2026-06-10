// GET /api/journal  - persisted decision journal
// POST /api/journal - replace persisted decision journal
'use strict';

const path = require('path');
const { normalizeJournal, readJournalFile, writeJournalFile } = require('../src/decision-journal');

const JOURNAL_PATH = path.join(process.cwd(), 'data', 'journal.json');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    return res.status(200).json(readJournalFile(JOURNAL_PATH));
  }

  if (req.method === 'POST') {
    try {
      const next = normalizeJournal(req.body || {});
      writeJournalFile(JOURNAL_PATH, next);
      return res.status(200).json(next);
    } catch (e) {
      console.error('[api/journal POST] hata:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
