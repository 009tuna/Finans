'use strict';
require('../src/db');
const { resolveEarnings } = require('../src/research-outcomes');
if (require.main === module) resolveEarnings().then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message); process.exitCode = 1; });
