'use strict';
// Local CLI launcher only; excluded from deployment. Preserves TLS/auth, changes HTTP transport.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { windowsFetch } = require('../src/windows-fetch');
const MAX_TEXT_BODY = 8 * 1024 * 1024;
async function textBody(body) {
  if (body == null || typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  let buffer;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) buffer = Buffer.from(body instanceof ArrayBuffer ? body : body.buffer, body.byteOffset || 0, body.byteLength);
  else if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = []; let size = 0;
    for await (const part of body) { const chunk = Buffer.from(part); size += chunk.length; if (size > MAX_TEXT_BODY) throw new Error('CLI text request too large'); chunks.push(chunk); }
    buffer = Buffer.concat(chunks);
  } else throw new Error('Unsupported CLI request body; native transport required');
  if (buffer.length > MAX_TEXT_BODY) throw new Error('CLI text request too large');
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) throw new Error('Binary upload not supported by this local text transport');
  return text;
}
function installTransport() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const parsed = new URL(url);
    const discovery = parsed.hostname === 'vercel.com' && parsed.pathname === '/.well-known/openid-configuration';
    if (parsed.protocol !== 'https:' || (parsed.hostname !== 'api.vercel.com' && !discovery)) return nativeFetch(input, init);
    const request = input instanceof Request ? input : null;
    return windowsFetch(url, { ...init, method: init.method || request?.method,
      headers: init.headers || request?.headers, body: await textBody(init.body || request?.body),
      signal: init.signal || request?.signal || AbortSignal.timeout(25000) });
  };
}
async function run(args = process.argv.slice(2)) {
  const cli = path.join(process.env.APPDATA, 'npm', 'node_modules', 'vercel', 'dist', 'vc.js');
  if (!fs.existsSync(cli)) throw new Error('Installed Vercel CLI entry not found');
  installTransport();
  process.argv = [process.execPath, cli, ...args];
  await import(pathToFileURL(cli).href);
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { textBody, installTransport };
