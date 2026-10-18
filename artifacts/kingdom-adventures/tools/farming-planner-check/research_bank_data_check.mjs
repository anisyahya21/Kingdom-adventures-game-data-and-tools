import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadResearchBank,findResearchMeasurement} from '../../src/lib/research-strategy-bank.ts';
const root=new URL('../../public/research-strategy-bank/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
let n=0,groups=0;const tuples=new Set();const original=globalThis.fetch;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL(path.basename(url),root)))});
try {
for(const record of manifest.counts){
 const bytes=fs.readFileSync(new URL(`encounter-${String(record.encounter).padStart(2,'0')}.json`,root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
 const data=await loadResearchBank(record.encounter);
 assert.equal(data.length,record.groups);
 for(const g of data){
   assert.ok(g.stats[2]>0,'zero Luck is not a legal published build');
   assert.equal(g.provenanceHash.length,64);
   assert.ok(g.highest>=g.mean && g.mean>=0);
   n+=g.n;groups++;tuples.add([record.encounter,...g.stats].join('/'));
   const point=findResearchMeasurement(record.encounter,g.stats);
   assert.ok(point && point.n>=g.n);
 }
}
assert.equal(n,manifest.trials);assert.equal(groups,manifest.groups);assert.equal(tuples.size,manifest.tuples);
console.log(`PASS: all20 static files hashed and schema-validated; ${tuples.size} tuples, ${groups} separate cohorts, ${n} eligible trials.`);
}finally{globalThis.fetch=original}
