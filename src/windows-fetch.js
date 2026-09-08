'use strict';
const { spawn } = require('child_process');
const quote = (value) => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
function curlConfig(url, init) {
  const lines = ['url = ' + quote(url), 'request = ' + quote(init.method || 'GET'), 'silent', 'show-error', 'include', 'max-time = 25', 'connect-timeout = 10'];
  new Headers(init.headers || {}).forEach((value, name) => lines.push('header = ' + quote(name + ': ' + value)));
  if (init.body != null) {
    if (typeof init.body !== 'string') throw new Error('Windows database transport expects a string body');
    lines.push('data-binary = ' + quote(init.body));
  }
  return lines.join('\n') + '\n';
}
function parseResponse(buffer) {
  let raw = buffer;
  while (true) {
    const boundary = raw.indexOf(Buffer.from('\r\n\r\n'));
    if (boundary < 0) throw new Error('Invalid database HTTP response');
    const header = raw.subarray(0, boundary).toString('utf8');
    const lines = header.split('\r\n');
    const status = Number(lines.shift().split(' ')[1]);
    raw = raw.subarray(boundary + 4);
    if (status < 200 || (status === 200 && /connection established/i.test(header))) continue;
    const headers = new Headers();
    for (const line of lines) { const i = line.indexOf(':'); if (i > 0) headers.append(line.slice(0, i), line.slice(i + 1).trim()); }
    return new Response([204, 205, 304].includes(status) ? null : raw, { status, headers });
  }
}
async function windowsFetch(input, init = {}) {
  const config = curlConfig(input instanceof URL ? input.href : String(input), init);
  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) return reject(init.signal.reason);
    const child = spawn('curl.exe', ['--config', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let size = 0;
    const abort = () => { child.kill(); reject(init.signal.reason); };
    init.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => { size += chunk.length; if (size > 30 * 1024 * 1024) { child.kill(); reject(new Error('Database response too large')); } else chunks.push(chunk); });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      init.signal?.removeEventListener('abort', abort);
      if (code !== 0) return reject(new Error('Windows database transport failed (curl ' + code + ')'));
      try { resolve(parseResponse(Buffer.concat(chunks))); } catch (e) { reject(e); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(config);
  });
}
module.exports = { windowsFetch, curlConfig, parseResponse };
