'use strict';
const assert = require('assert/strict');
const { curlConfig, parseResponse } = require('../src/windows-fetch');
const config = curlConfig('https://example.com/a?x=1&y=2', { method: 'POST', headers: { apikey: 'test-only' }, body: JSON.stringify({ text: 'quote" newline\n' }) });
assert.ok(config.includes('header = "apikey: test-only"'));
assert.ok(!config.includes('insecure'));
assert.equal(config.split('\n').filter((line) => line.startsWith('data-binary')).length, 1);
(async () => {
  const r = parseResponse(Buffer.from('HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Range: 0-0/1\r\n\r\n{"ok":true}'));
  assert.equal(r.status, 201); assert.equal(r.headers.get('content-range'), '0-0/1'); assert.deepEqual(await r.json(), { ok: true });
  const empty = parseResponse(Buffer.from('HTTP/2 204 No Content\r\n\r\n'));
  assert.equal(await empty.text(), '');
  assert.throws(() => parseResponse(Buffer.from('bad')));
  console.log('Windows HTTPS transport: config quoting, HTTP headers, body and empty response passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
