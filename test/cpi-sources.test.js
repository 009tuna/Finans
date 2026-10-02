'use strict';
const assert=require('node:assert/strict');const test=require('node:test');const fs=require('node:fs');const {parseSchedule,parseFirstRelease,archiveUrl,createCpiSource,fetchText}=require('../src/cpi-sources');
const URL='https://www.bls.gov/news.release/archives/cpi_09112026.htm',html=fs.readFileSync(require('node:path').join(__dirname,'fixtures/cpi-first-20260911.html'),'utf8');
const tableHtml = fs.readFileSync(require('node:path').join(__dirname, 'fixtures/cpi-table-a-small.html'), 'utf8');
const options = { sourceUrl: URL, observedAt: '2026-10-01T14:00:00Z' };
test('real Table A independently maps exact current month and annual cells', () => {
  assert.deepEqual(parseFirstRelease(tableHtml, options).values,
    { us_cpi_headline_mom_sa: 0.4, us_cpi_core_mom_sa: 0.3, us_cpi_headline_yoy_nsa: 3.4, us_cpi_core_yoy_nsa: 2.4 });
});
test('explicit zero and negative current table values are preserved', () => {
  const changed = tableHtml.replace('>0.4</span>', '>-0.4</span>').replace('>0.3</span></td>\n\t<td headers="cpi_pressa.r.1.3 cpi_pressa.h.1.9"', '>0.0</span></td>\n\t<td headers="cpi_pressa.r.1.3 cpi_pressa.h.1.9"');
  assert.equal(parseFirstRelease(changed, options).values.us_cpi_headline_mom_sa, -0.4);
  const coreZero = tableHtml.replace(/(headers="[^"\n]*cpi_pressa.h.2.8"[^>]*><span class="datavalue">)0.3/, '$10.0');
  assert.equal(parseFirstRelease(coreZero, options).values.us_cpi_core_mom_sa, 0);
});
test('wrong table period or seasonal policy cannot supply monthly rates', () => {
  for (const changed of [tableHtml.replace('Aug.<br />2026</th>', 'Sep.<br />2026</th>'), tableHtml.replace('Seasonally adjusted changes from preceding month', 'Unadjusted changes from preceding month')]) {
    const result = parseFirstRelease(changed, options);
    assert.equal(result.values.us_cpi_headline_mom_sa, undefined);
    assert.equal(result.values.us_cpi_core_mom_sa, undefined);
  }
});
test('December period stays in previous year when January publication is acquired', () => {
  const changed = html.replace('2026 M08', '2025 M12').replace('Friday, September 11, 2026', 'Tuesday, January 13, 2026');
  const result = parseFirstRelease(changed, { ...options, sourceUrl: archiveUrl('2026-01-13') });
  assert.equal(result.period, '2025-12');
  assert.equal(result.publishedAt, '2026-01-13T13:30:00.000Z');
});
test('impossible dates and missing acquisition time fail instead of normalizing', () => {
  assert.equal(parseFirstRelease(html.replace('September 11', 'September 31'), options).available, false);
  assert.equal(parseFirstRelease(html, { sourceUrl: URL }).reason, 'invalid_acquisition_time');
  assert.throws(() => require('../src/cpi-sources').easternIso('2026-03-08', 2, 30), /invalid_eastern_date/);
});
test('disallowed URLs rejected before fetch and timeout signal aborts transport', async () => {
  let calls = 0;
  await assert.rejects(fetchText('https://www.bls.gov@evil.test/news.release/archives/cpi_09112026.htm', { fetchImpl: async () => { calls++; } }), /invalid_source_url/);
  assert.equal(calls, 0);
  await assert.rejects(fetchText(URL, { timeoutMs: 2, fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }), /timeout/);
});
test('real archived fixture parses all four metrics',()=>{const r=parseFirstRelease(html,{sourceUrl:URL,observedAt:'2026-10-01T14:00:00Z'});assert.equal(r.available,true);assert.deepEqual(r.values,{us_cpi_headline_mom_sa:.4,us_cpi_core_mom_sa:.3,us_cpi_headline_yoy_nsa:3.4,us_cpi_core_yoy_nsa:2.4});assert.equal(r.period,'2026-08');assert.equal(r.publishedAt,'2026-09-11T12:30:00.000Z');});
test('schedule DST and dated archive URL',()=>{const e=parseSchedule('August 2026 September 11, 2026 8:30 AM')[0];assert.equal(e.period,'2026-08');assert.equal(e.scheduledAt,'2026-09-11T12:30:00.000Z');assert.equal(archiveUrl('2026-09-11'),URL);});
test('mutable URL and period mismatch rejected',()=>{const r=parseFirstRelease(html,{sourceUrl:'https://www.bls.gov/news.release/cpi.htm',observedAt:'2026-10-01T14:00:00Z'});assert.equal(r.reason,'unverified_archive_source');});
test('publication chronology rejects prepublication acquisition',()=>{const r=parseFirstRelease(html,{sourceUrl:URL,observedAt:'2026-09-11T12:29:59Z'});assert.equal(r.reason,'retrieval_precedes_publication');});
test('partial narrative reports missing metric without filling it',()=>{const r=parseFirstRelease(html.replace('rose 2.4 percent over the year','rose percent over the year'),{sourceUrl:URL,observedAt:'2026-10-01T14:00:00Z'});assert.equal(r.available,true);assert.equal(r.values.us_cpi_core_yoy_nsa,undefined);assert.ok(r.missing.includes('us_cpi_core_yoy_nsa'));});
test('unsupported header and invalid archive date fail safely',()=>{assert.equal(parseFirstRelease('garbage',{sourceUrl:URL,observedAt:'2026-10-01T14:00:00Z'}).available,false);assert.throws(()=>archiveUrl('bad'),/invalid_archive_date/);});
test('bounded transport rejects redirects and oversized fallback',async()=>{await assert.rejects(()=>fetchText(URL,{fetchImpl:async()=>new Response('',{status:302,headers:{location:'https://evil.test'}})}),/http_302/);await assert.rejects(()=>fetchText(URL,{maxBytes:3,fetchImpl:async()=>new Response('12345')}),/source_too_large/);});
test('production source timestamps after archive fetch',async()=>{let calls=[];const source=createCpiSource({clock:()=> '2026-10-01T14:00:00Z',fetcher:async u=>{calls.push(u);return u.includes('schedule')?'August 2026 September 11, 2026 8:30 AM':html;}});const e=(await source.getSchedule())[0];const r=await source.getFirstRelease(e,'2026-10-01T14:00:00Z');assert.equal(r.values.us_cpi_headline_mom_sa,.4);assert.deepEqual(calls,[ 'https://www.bls.gov/schedule/news_release/cpi.htm',URL]);});
