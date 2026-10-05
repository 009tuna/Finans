'use strict';
// Explicit offline evidence input; this command cannot read/write the live journal.
const fs=require('node:fs');
const {replayObservations}=require('../src/structural-replay');
const file=process.argv[2];
if(!file) {console.error('Usage: node scripts/replay-structural.js observations.json');process.exitCode=1;}
else {const observations=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(observations))throw Error('observation array required');process.stdout.write(JSON.stringify(replayObservations(observations),null,2)+'\n');}
