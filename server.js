// Basit web sunucusu: dashboard'u sunar + veri uclari saglar.
// /            -> panel (public/index.html)
// /api/data    -> en son veri (Supabase market_snapshots)
// /api/history -> gunluk trend gecmisi (Supabase market_history)
// /api/chart   -> sembol bazli OHLCV mum verisi
// /api/refresh -> verileri yeniden ceker (POST)
'use strict';
// Local dev icin .env.local yukle
try { require('dotenv').config({ path: require('path').join(__dirname, '.env.local') }); } catch (_) {}
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runAll } = require('./src/fetch-all');
const { runBacktest } = require('./src/backtest-engine');
const { fetchAssetChart } = require('./src/chart-data');
const { runMonteCarlo, calculateDCF, runStressTest, calculateCorrelationMatrix, calculateGraham, calculateDDM } = require('./src/forecast');
const { getPortfolio, savePortfolio, getLatestSnapshot, getHistory, getReport, getCache } = require('./src/db');
const { isAuthorized } = require('./src/admin-auth');
const { handleJournal } = require('./src/journal-api');
const { getReportPayload } = require('./src/report-api');
const { handleResearch } = require('./src/research-api');
const { handleIntelligence } = require('./src/intelligence-api');

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
const PORT = process.env.PORT || cfg.port || 5174;

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
    if (p === '/api/macro' || p === '/api/market-news'
      || (p === '/api/report' && ['macro', 'market-news'].includes(url.searchParams.get('resource')))) {
      const resource = p === '/api/report' ? url.searchParams.get('resource') : p.slice('/api/'.length);
      const result = await handleIntelligence(req, { resource });
      res.writeHead(result.status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(result.body));
    }
    if (p === '/api/data') {
      const data = await getLatestSnapshot();
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify(data || { empty: true }));
    }
    if (p === '/api/history') {
      const hist = await getHistory();
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify(Array.isArray(hist) ? hist : []));
    }
    if (p === '/api/research' || (p === '/api/report' && url.searchParams.get('resource') === 'research')) {
      if (req.method === 'POST') req.body = await readBody(req);
      const result = await handleResearch(req);
      res.writeHead(result.status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(result.body));
    }
    if (p === '/api/report') {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      try {
        const payload = await getReportPayload();
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(payload));
      } catch (_) {
        res.writeHead(503, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: 'Rapor kaynagina erisilemedi. Lutfen tekrar deneyin.' }));
      }
    }
    if (p === '/api/refresh' && req.method === 'POST') {
      if (!isAuthorized(req)) {
        res.writeHead(401, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: 'Yetkisiz: admin parolası gerekli' }));
      }
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
      if (req.method === 'GET') {
        const portfolio = await getPortfolio();
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(portfolio));
      }
      if (req.method === 'POST') {
        if (!isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': MIME['.json'] });
          return res.end(JSON.stringify({ error: 'Yetkisiz: admin parolası gerekli' }));
        }
        const bodyStr = await readBody(req);
        try {
          const parsed = JSON.parse(bodyStr);
          await savePortfolio(parsed);
          res.writeHead(200, { 'Content-Type': MIME['.json'] });
          return res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400);
          return res.end('Gecersiz JSON verisi');
        }
      }
    }
    if (p === '/api/journal') {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const result = await handleJournal({ method: req.method, headers: req.headers, body }, path.join(DATA, 'journal.json'));
      res.writeHead(result.status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(result.body));
    }
    if (p === '/api/backtest' && req.method === 'POST') {
      try {
        const result = await runBacktest(JSON.parse(await readBody(req)));
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    if (p === '/api/forecast/montecarlo' && req.method === 'POST') {
      const bodyStr = await readBody(req);
      try {
        const params = JSON.parse(bodyStr);
        const result = await runMonteCarlo(params);
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: (e && e.message) || 'Monte Carlo hatasi' }));
      }
    }
    if (p === '/api/forecast/correlation' && req.method === 'POST') {
      const bodyStr = await readBody(req);
      try {
        const params = JSON.parse(bodyStr);
        const result = await calculateCorrelationMatrix(params);
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: (e && e.message) || 'Korelasyon matrisi hatasi' }));
      }
    }
    if (p === '/api/forecast/dcf' && req.method === 'POST') {
      const bodyStr = await readBody(req);
      try {
        const params = JSON.parse(bodyStr);
        let result;
        if (params.modelType === 'graham') {
          result = calculateGraham(params);
        } else if (params.modelType === 'ddm') {
          result = calculateDDM(params);
        } else {
          result = calculateDCF(params);
        }
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: (e && e.message) || 'Değerleme hatası' }));
      }
    }
    if (p === '/api/forecast/scenarios' && req.method === 'GET') {
      try {
        const [portfolio, latestData] = await Promise.all([getPortfolio(), getLatestSnapshot()]);
        const usdtry = latestData && latestData.fx && latestData.fx.usdtry;
        const result = runStressTest(portfolio, latestData, usdtry);
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ error: (e && e.message) || 'Stres testi hatasi' }));
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
