'use strict';
const {refreshLearning}=require('../src/learning-pipeline');
async function run(options={}) {return refreshLearning({...options,train:options.train??process.argv.includes('--train')});}
if(require.main===module)run().then(result=>{console.log(JSON.stringify(result));if(result.status==='unavailable')process.exitCode=1;}).catch(()=>{console.error('Öğrenme yenilemesi başarısız; mevcut kayıtlar korunuyor.');process.exitCode=1;});
module.exports={run};
