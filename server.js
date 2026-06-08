// Basit, bagimliliksiz web sunucusu: dashboard'u sunar + veri uclari saglar.
// /            -> panel (public/index.html)
// /api/data    -> en son veri (data/latest.json)
// /api/history -> gunluk trend gecmisi
// /api/chart   -> sembol bazli OHLCV mum verisi
// /api/refresh -> verileri yeniden ceker (POST)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runAll } = require('./src/fetch-all');
const { runBacktest } = require('./src/backtest-engine');
const { fetchAssetChart } = require('./src/chart-data');

const ROOT = __dirname;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', err => reject(err));
  });
}
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = cfg.port || 5174;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendFile(res, file, mime, fallback) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      if (fallback != null) {
        res.writeHead(200, { 'Content-Type': mime });
        return res.end(fallback);
      }
      res.writeHead(404);
      return res.end('bulunamadi');
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/data') {
      return sendFile(res, path.join(DATA, 'latest.json'), MIME['.json'], '{"empty":true}');
    }
    if (p === '/api/history') {
      return sendFile(res, path.join(DATA, 'history.json'), MIME['.json'], '[]');
    }
    if (p === '/api/report') {
      const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
      const base = readJson(path.join(DATA, 'report', 'base.json'));
      const ai = readJson(path.join(DATA, 'report', 'ai.json'));
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify({ base, ai }));
    }
    if (p === '/api/refresh' && req.method === 'POST') {
      const snap = await runAll();
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify(snap));
    }
    if (p === '/api/chart') {
      try {
        const result = await fetchAssetChart({
          market: url.searchParams.get('market'),
          symbol: url.searchParams.get('symbol'),
          interval: url.searchParams.get('interval'),
          range: url.searchParams.get('range'),
          limit: url.searchParams.get('limit'),
        });
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: (e && e.message) || 'Chart verisi alinamadi' }));
      }
    }
    if (p === '/api/portfolio') {
      const pFile = path.join(DATA, 'portfolio.json');
      if (req.method === 'GET') {
        if (!fs.existsSync(pFile)) {
          const defaultPortfolio = { us: [], bist: [], crypto: [] };
          fs.writeFileSync(pFile, JSON.stringify(defaultPortfolio, null, 2));
        }
        return sendFile(res, pFile, MIME['.json']);
      }
      if (req.method === 'POST') {
        const bodyStr = await readBody(req);
        try {
          const parsed = JSON.parse(bodyStr);
          fs.writeFileSync(pFile, JSON.stringify(parsed, null, 2));
          res.writeHead(200, { 'Content-Type': MIME['.json'] });
          return res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400);
          return res.end('Gecersiz JSON verisi');
        }
      }
    }
    if (p === '/api/backtest' && req.method === 'POST') {
      const bodyStr = await readBody(req);
      try {
        const params = JSON.parse(bodyStr);
        const result = await runBacktest(params);
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: (e && e.message) || 'Bilinmeyen backtest hatasi' }));
      }
    }
    if (p === '/' || p === '') p = '/index.html';
    const file = path.join(PUB, p.replace(/^\/+/, ''));
    if (!file.startsWith(PUB)) {
      res.writeHead(403);
      return res.end('yasak');
    }
    const ext = path.extname(file).toLowerCase();
    return sendFile(res, file, MIME[ext] || 'application/octet-stream');
  } catch (e) {
    res.writeHead(500);
    res.end('hata: ' + (e && e.message));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('Sunucu zaten calisiyor: http://localhost:' + PORT);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log('  Finans paneli calisiyor:  http://localhost:' + PORT);
  console.log('  Kapatmak icin bu pencerede Ctrl+C');
  console.log('==================================================');
});

// Sunucu acikken her sabah 09:00'da otomatik tazeleme (dakika basi kontrol).
let lastAuto = '';
setInterval(async () => {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  if (now.getHours() === 9 && now.getMinutes() === 0 && lastAuto !== stamp) {
    lastAuto = stamp;
    try {
      await runAll();
      console.log('[' + now.toLocaleString('tr-TR') + '] 09:00 otomatik guncelleme tamam.');
    } catch (e) {
      console.error('Otomatik guncelleme hatasi:', e && e.message);
    }
  }
}, 60 * 1000);
