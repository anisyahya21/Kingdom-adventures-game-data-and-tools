import assert from 'node:assert/strict';
import { loadResearchBank, getResearchGroup, findResearchMeasurement } from '../../src/lib/research-strategy-bank.ts';
const originalFetch=globalThis.fetch;
const make=(id,n,mean)=>({id,encounter:3,stats:[300,600,320,13],n,mean,highest:100,median:10,low:0,defeats:0,meanDpsMp:1000,meanHealerMp:2000,profileId:'fixed',cohortId:id,formationId:'fixed',finishPolicy:'on-verdict',rewardMeasurementMethod:'queued-at-victory',provenanceHash:'a'.repeat(64)});
let calls=0;
globalThis.fetch=async url=>{calls++;return {ok:true,json:async()=>({schema:'ka-full-combat-hub-encounter-catalog-v1',encounter:3,groups:[make('small-high',20,90),make('large-low',200,10)]})}};
try {
  const all=await loadResearchBank(3);
  assert.equal(all.length,2,'separate cohorts must not be pooled');
  await loadResearchBank(3); assert.equal(calls,1,'selected encounter is cached');
  assert.equal(findResearchMeasurement(3,{atk:300,spd:600,lck:320,dex:13}).id,'large-low','select by sample count, never largest mean');
  assert.equal(findResearchMeasurement(3,{atk:300,spd:600,lck:320,dex:14}),null,'DEX is mandatory in exact reward lookup');
  assert.equal(findResearchMeasurement(3,{atk:301,spd:600,lck:320,dex:13}),null,'nearby stats must not inherit rewards');
  assert.equal((await getResearchGroup(3,'small-high')).mean,90,'explicitly selected cohort retains its own sample');
  globalThis.fetch=async()=>({ok:true,json:async()=>({schema:'ka-full-combat-hub-encounter-catalog-v1',encounter:4,groups:[{...make('bad',0,5),encounter:4}]})});
  await assert.rejects(loadResearchBank(4),/invalid cohort/);
  assert.equal(findResearchMeasurement(4,[300,600,320,13]),null,'failed files cannot populate evidence cache');
  console.log('PASS: cohort separation, exact four-stat rewards, sample-based selection, cached loading and invalid-data rejection.');
} finally {globalThis.fetch=originalFetch}
