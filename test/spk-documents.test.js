'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { inspectBulletin, parseBulletinIdentity, categoryFor, MAX_BYTES } = require('../src/spk-documents');

function makePdf(text, pages = 1) {
  const lines = text.split('\n').map((line) => line.replace(/([\\()])/g, '\\$1'));
  const stream = `BT /F1 11 Tf 40 760 Td ${lines.map((line, i) => `${i ? '0 -18 Td ' : ''}(${line}) Tj`).join(' ')} ET`;
  const pageIds = Array.from({ length: pages }, (_, i) => 3 + i);
  const contentIds = Array.from({ length: pages }, (_, i) => 3 + pages + i);
  const fontId = 3 + 2 * pages;
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  for (let i = 0; i < pages; i++) {
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentIds[i]} 0 R >>`;
    objects[contentIds[i]] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let id = 1; id < objects.length; id++) { offsets[id] = Buffer.byteLength(pdf); pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}
const officialItem = { id: 'spk:2026/66', publishedDate: '2026-12-30', url: 'https://spk.gov.tr/data/6aba95a58f95db35c0bc956f/2026-66.pdf' };
const bulletinText = 'SPK BULTENI 2026/66 30.12.2026\nA. ONAYLANAN ISLEMLER (TRHOL)\n1. SERMAYE ARTIRIMI\nBireysel bildirim ayrintisi';

(async () => {
  assert.deepEqual(parseBulletinIdentity('SPK BÜLTENİ 2026/66 30 Aralık 2026'), { ok: true, year: 2026, number: 66, publishedDate: '2026-12-30' });
  assert.equal(parseBulletinIdentity('SPK BÜLTENİ 2026/65 30 Aralık 2026').number, 65);
  assert.equal(categoryFor('A. SUÇ DUYURUSU'), 'enforcement');
  assert.equal(categoryFor('1. SERMAYE ARTIRIMI'), 'capital_issue');
  assert.equal(categoryFor('2. KURUL ONAYI'), 'approval');
  assert.equal(categoryFor('C. KURUL KARARI'), 'regulatory_notice');

  const bytes = makePdf(bulletinText);
  const result = await inspectBulletin(officialItem, { fetchBinary: async (url, opts) => { assert.equal(url, officialItem.url); assert.equal(opts.timeoutMs, 20000); return bytes; }, now: () => new Date('2026-12-30T12:00:00.000Z') });
  assert.equal(result.available, true); assert.equal(result.contentStatus, 'text_extracted');
  assert.equal(result.verification, 'official_document_text'); assert.equal(result.id, officialItem.id);
  assert.equal(result.documentHash, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.pages, 1); assert.equal(result.publishedDate, officialItem.publishedDate);
  assert.equal(result.sections[0].category, 'approval'); assert.ok(result.sections.some((x) => x.category === 'capital_issue'));
  assert.ok(result.sections.some((x) => x.symbols.includes('TRHOL')));
  assert.ok(!JSON.stringify(result).includes('Bireysel bildirim ayrintisi'));
  assert.ok(result.summary.includes('yorumlanmadı'));

  let fetched = false;
  const badUrl = await inspectBulletin({ ...officialItem, url: 'https://evil.example/data/6aba95a58f95db35c0bc956f/2026-66.pdf' }, { fetchBinary: async () => { fetched = true; return bytes; } });
  assert.equal(badUrl.reason, 'untrusted_document_url'); assert.equal(fetched, false);
  const badId = await inspectBulletin({ ...officialItem, id: 'spk:2025/66' }, { fetchBinary: async () => bytes });
  assert.equal(badId.reason, 'document_identity_mismatch');
  const mismatch = await inspectBulletin(officialItem, { fetchBinary: async () => makePdf('SPK BULTENI 2026/65 30.12.2026 A. ONAYLANAN ISLEMLER') });
  assert.equal(mismatch.reason, 'bulletin_identity_mismatch');
  const mismatchDate = await inspectBulletin(officialItem, { fetchBinary: async () => makePdf('SPK BULTENI 2026/66 29.12.2026 A. ONAYLANAN ISLEMLER') });
  assert.equal(mismatchDate.reason, 'bulletin_identity_mismatch');
  const badBody = await inspectBulletin(officialItem, { fetchBinary: async () => Buffer.from('<html>not a pdf</html>') });
  assert.equal(badBody.reason, 'invalid_pdf_body');
  const tooLarge = await inspectBulletin(officialItem, { fetchBinary: async () => Buffer.alloc(MAX_BYTES + 1) });
  assert.equal(tooLarge.reason, 'document_too_large');
  const tooManyPages = await inspectBulletin(officialItem, { fetchBinary: async () => makePdf(bulletinText, 81) });
  assert.equal(tooManyPages.reason, 'too_many_pages');
  const imageOnly = await inspectBulletin(officialItem, { fetchBinary: async () => makePdf('') });
  assert.equal(imageOnly.reason, 'ocr_needed');
  console.log('SPK bulletin documents: URL/header/date validation, PDF extraction, privacy filters, and resource limits passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
