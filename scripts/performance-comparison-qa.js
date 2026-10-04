'use strict';
// Previous published assets against the SAME frozen API cut as localhost:5196.
// A local comparison only; ui-qa-server never forwards portfolio/journal writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {createQaServer} = require('./ui-qa-server');
async function run() {
  const inner = await createQaServer({sourceUrl:'http://127.0.0.1:5196'});
  const assets = new Map([
    ['/app.js','2026-10-02-reading-deployed-app.js'],
    ['/action-layer.js','2026-10-02-performance-before-action-layer.js'],
    ['/styles.css','2026-10-02-reading-deployed-styles.css'],
  ]);
  const buffers = new Map([...assets].map(([route,name])=>[route,fs.readFileSync(path.join(__dirname,'../docs/research-audit',name))]));
  const server = http.createServer((req,res)=>{
    const route = req.url.split('?')[0];
    if (!buffers.has(route)) return inner.emit('request',req,res);
    res.writeHead(200,{'Content-Type':route.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});
    res.end(buffers.get(route));
  });
  server.listen(5197,'127.0.0.1',()=>console.log('Previous release / frozen cut comparison: http://127.0.0.1:5197/?qa=full'));
}
if (require.main === module) run().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports = {run};
