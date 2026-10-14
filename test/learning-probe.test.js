'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {run}=require('../scripts/record-learning-observations');
(async()=>{
 // Rejected before any network or database read/write; source files stay intact.
 await assert.rejects(run({write:true,output:path.join(__dirname,'../data/journal.json')}),/outside application data/);
 await assert.rejects(run({output:path.join(__dirname,'../docs/probe.txt')}),/JSON report/);
 console.log('learning-probe: protected outputs rejected before source access');
})().catch(e=>{console.error(e);process.exitCode=1});
