'use strict';
function hydrateStructuralSnapshot(snapshot,journal) {
  if(!snapshot) return {empty:true};
  const copy=JSON.parse(JSON.stringify(snapshot));
  const prior=copy.structural;
  require('./decision').attachSignalHealth(copy,journal);
  require('./structural-pipeline').applyStructuralDecisions(copy,journal,[]);
  if(prior?.sources) copy.structural.sources=prior.sources;
  return copy;
}
async function readStructuralSnapshot({readSnapshot,readJournal}={}) {
  readSnapshot ||= require('./db').getLatestSnapshot;
  readJournal ||= ()=>require('./decision-journal').readJournal(require('node:path').join(__dirname,'..','data','journal.json'));
  const snapshot=await readSnapshot();
  if(!snapshot) return {empty:true};
  return hydrateStructuralSnapshot(snapshot,await readJournal());
}
module.exports={hydrateStructuralSnapshot,readStructuralSnapshot};
