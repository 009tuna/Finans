// Ortak yardimcilar: yeniden denemeli fetch, eszamanlilik siniri, sayisal kistirma.
'use strict';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// JSON getirir; 429/5xx durumlarinda artan beklemeyle yeniden dener.
async function fetchJson(url, { headers = {}, retries = 3, timeoutMs = 15000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        throw new Error('HTTP ' + res.status);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { __error: 'HTTP ' + res.status, __body: text.slice(0, 160) };
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) {
        return { __error: String((err && err.message) || err) };
      }
      await sleep(700 * (attempt + 1));
    }
  }
}

// Listeyi sinirli eszamanlilikla isler (API limitlerini asmamak icin).
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const n = Math.min(limit, items.length) || 1;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

module.exports = { sleep, fetchJson, mapLimit, clamp };
