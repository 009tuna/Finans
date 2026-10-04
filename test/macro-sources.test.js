'use strict';
const assert = require('assert/strict');
const { parseSchedule, parseFirstRelease, extractRevisions, archiveUrl, easternIso, createBlsMacroSource, fetchText } = require('../src/macro-sources');
const scheduleHtml = `<table><tr><th>Reference Month</th><th>Release Date</th><th>Release Time</th></tr><tr><td>August 2026</td><td>Sep. 04, 2026</td><td>08:30 AM</td></tr><tr><td>September 2026</td><td>Oct. 02, 2026</td><td>08:30 AM</td></tr></table>`;
const events = parseSchedule(scheduleHtml);
assert.equal(events.length, 2); assert.equal(events[0].period, '2026-08');
assert.equal(events[0].scheduledAt, '2026-09-04T12:30:00.000Z'); // EDT
assert.equal(events[1].scheduledAt, '2026-10-02T12:30:00.000Z');
assert.equal(easternIso('2026-01-09'), '2026-01-09T13:30:00.000Z'); // EST
assert.equal(archiveUrl('2026-09-04T12:30:00.000Z'), 'https://www.bls.gov/news.release/archives/empsit_09042026.htm');
// Text reproduced from the public BLS August 2026 Employment Situation archive.
const release = `<pre>Transmission of material in this news release is embargoed until 8:30 a.m. (ET) Friday, September 4, 2026
THE EMPLOYMENT SITUATION - AUGUST 2026
Total nonfarm payroll employment increased by 162,000 in August, and the unemployment rate was unchanged at 4.1 percent, the U.S. Bureau of Labor Statistics reported today.
Household Survey Data
Employment in industries continues to reflect recent revisions.
Establishment Survey Data
The change in total nonfarm payroll employment for June was revised up by 11,000, from +20,000 to +31,000, and the change for July was revised up by 44,000, from -23,000 to +21,000.
HOUSEHOLD DATA</pre>`;
const officialArchive = 'https://www.bls.gov/news.release/archives/empsit_09042026.htm';
const parsed = parseFirstRelease(release, { sourceUrl: officialArchive, observedAt: '2026-09-04T13:00:00Z' });
assert.equal(parsed.available, true); assert.equal(parsed.value, 162); assert.equal(parsed.unit, 'thousand_jobs');
assert.equal(parsed.period, '2026-08'); assert.equal(parsed.vintage, 'first_release');
assert.equal(parsed.publishedAt, '2026-09-04T12:30:00.000Z'); assert.equal(parsed.observedAt, '2026-09-04T13:00:00.000Z'); assert.notEqual(parsed.publishedAt, parsed.observedAt);
assert.equal(parsed.revisions.length, 2);
assert.deepEqual(parsed.revisions.map((r) => [r.period, r.previousValue, r.value, r.revisionChange]), [['2026-06', 20, 31, 11], ['2026-07', -23, 21, 44]]);
assert.equal(parseFirstRelease(release.replace('embargoed until 8:30', 'embargoed until USDL-26-1435 8:30'), { sourceUrl: officialArchive, observedAt: '2026-09-04T13:00:00Z' }).available, true);
assert.equal(parseFirstRelease(release.replace('in August', 'in July')).available, false);
const parseVariant = (text) => parseFirstRelease(text, { sourceUrl: officialArchive, observedAt: '2026-09-04T13:00:00Z' });
assert.equal(parseVariant(release.replace('increased by 162,000 in August', 'changed little (+22,000) in August')).value, 22);
assert.equal(parseVariant(release.replace('increased by 162,000 in August', 'decreased by 23,000 in August')).value, -23);
assert.equal(parseVariant(release.replace('increased by 162,000 in August', 'was essentially unchanged (+0) in August')).value, 0);
assert.equal(parseFirstRelease('latest unrevised release').available, false);
const julyArchive = 'https://www.bls.gov/news.release/archives/empsit_08072026.htm';
const julyHeadline = `<pre>Transmission of material in this news release is embargoed until 8:30 a.m. (ET) Friday, August 7, 2026
THE EMPLOYMENT SITUATION — JULY 2026
Both nonfarm payroll employment (−23,000) and the unemployment rate (4.3 percent) changed little in July.
Household Survey Data
Household employment increased by 500,000 in July.
Establishment Survey Data
Total nonfarm payroll employment changed little in July (−23,000).
HOUSEHOLD DATA</pre>`;
const julyParsed = parseFirstRelease(julyHeadline, { sourceUrl: julyArchive, observedAt: '2026-08-07T13:00:00Z' });
assert.equal(julyParsed.available, true);
assert.equal(julyParsed.period, '2026-07');
assert.equal(julyParsed.value, -23);
assert.equal(julyParsed.vintage, 'first_release');
const householdOnly = julyHeadline.replace('Both nonfarm payroll employment (−23,000) and the unemployment rate (4.3 percent) changed little in July.', '')
  .replace('Total nonfarm payroll employment changed little in July (−23,000).', 'Payrolls changed little in July (−23,000).');
assert.equal(parseFirstRelease(householdOnly, { sourceUrl: julyArchive, observedAt: '2026-08-07T13:00:00Z' }).available, false);
const juneArchive = 'https://www.bls.gov/news.release/archives/empsit_07022026.htm';
const juneHeadline = `<pre>Transmission of material in this news release is embargoed until 8:30 a.m. (ET) Thursday, July 2, 2026
THE EMPLOYMENT SITUATION - JUNE 2026
Both total nonfarm payroll employment (+57,000) and the unemployment rate (4.2 percent) changed little in June.
Household Survey Data
The number of people employed increased by 400,000 in June.
Establishment Survey Data
Total nonfarm payroll employment changed little in June (+57,000).
HOUSEHOLD DATA</pre>`;
const juneParsed = parseFirstRelease(juneHeadline, { sourceUrl: juneArchive, observedAt: '2026-07-02T13:00:00Z' });
assert.equal(juneParsed.available, true);
assert.equal(juneParsed.period, '2026-06');
assert.equal(juneParsed.value, 57);
const januaryRevision = extractRevisions('THE EMPLOYMENT SITUATION - JANUARY 2027 The change in total nonfarm payroll employment for December was revised up by 10,000, from +20,000 to +30,000. HOUSEHOLD DATA', {
  releasePeriod: '2027-01', publishedAt: '2027-02-05T13:30:00.000Z', observedAt: '2027-02-05T14:00:00.000Z',
  sourceUrl: 'https://www.bls.gov/news.release/archives/empsit_02052027.htm', contentHash: 'hash',
});
assert.deepEqual(januaryRevision.map((x) => [x.period, x.previousValue, x.value]), [['2026-12', 20, 30]]);
const captured = [];
const source = createBlsMacroSource({ fetchText: async (url) => { captured.push(url); return url.includes('schedule') ? scheduleHtml : release; }, now: () => '2026-09-04T13:00:00Z' });
(async () => {
  const fetched = await source.getSchedule(); assert.equal(fetched[0].observedAt, '2026-09-04T13:00:00.000Z');
  const first = await source.getFirstRelease(events[0]); assert.equal(first.value, 162); assert.ok(captured.some((u) => u.endsWith('empsit_09042026.htm')));
  let retrievalClock = '2026-09-04T13:00:00.000Z';
  const timestampedSource = createBlsMacroSource({ fetchText: async () => { retrievalClock = '2026-09-04T13:02:00.000Z'; return release; }, now: () => retrievalClock });
  const timestamped = await timestampedSource.getFirstRelease(events[0]);
  assert.equal(timestamped.observedAt, '2026-09-04T13:02:00.000Z');
  const future = await source.getFirstRelease(events[1]); assert.equal(future.reason, 'not_yet_published');
  const unavailable = createBlsMacroSource({ fetchText: async () => '<html>unsupported</html>' });
  await assert.rejects(unavailable.getSchedule(), /schedule unavailable/);
  const originalFetch = global.fetch;
  try {
    global.fetch = async (_url, init) => ({ ok: true, status: 200, headers: new Headers({ 'content-length': '4' }), arrayBuffer: async () => new TextEncoder().encode('BLS!').buffer, init });
    assert.equal(await fetchText('https://www.bls.gov/test', { maxBytes: 4, timeoutMs: 1000 }), 'BLS!');
    global.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': '8' }), arrayBuffer: async () => new TextEncoder().encode('too large').buffer });
    await assert.rejects(fetchText('https://www.bls.gov/test', { maxBytes: 4 }), /too large/);
    let streamCancelled = false;
    let streamRead = 0;
    global.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => { throw new Error('should stream'); }, body: { getReader: () => ({
      read: async () => ({ done: false, value: new Uint8Array(++streamRead === 1 ? [1, 2, 3] : [4, 5, 6]) }),
      cancel: async () => { streamCancelled = true; },
    }) } });
    await assert.rejects(fetchText('https://www.bls.gov/test', { maxBytes: 4 }), /too large/);
    assert.equal(streamCancelled, true);
    global.fetch = async () => ({ ok: false, status: 403, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) });
    await assert.rejects(fetchText('https://www.bls.gov/test'), /BLS HTTP 403/);
    global.fetch = async () => ({ ok: true, status: 200, url: 'https://www.bls.gov/news.release/empsit.nr0.htm', headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) });
    await assert.rejects(fetchText('https://www.bls.gov/news.release/archives/empsit_09042026.htm'), /unexpected URL/);
  } finally {
    global.fetch = originalFetch;
  }
  console.log('BLS macro sources: official schedule parsing, DST, archived first estimate and retrieval chronology passed');
})().catch((err) => { console.error(err); process.exitCode = 1; });
