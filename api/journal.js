// GET /api/journal  - persisted decision journal
// POST /api/journal - replace persisted decision journal
'use strict';

const path = require('path');
const { handleJournal } = require('../src/journal-api');

const JOURNAL_PATH = path.join(process.cwd(), 'data', 'journal.json');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  res.setHeader('Cache-Control', 'no-store');
  const result = await handleJournal(req, JOURNAL_PATH);
  return res.status(result.status).json(result.body);
};
