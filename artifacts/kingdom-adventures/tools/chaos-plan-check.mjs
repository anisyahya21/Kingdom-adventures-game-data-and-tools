import assert from 'node:assert/strict';
import { emptyChaosPlan, encodeChaosPlan, decodeChaosPlan } from '../src/lib/chaos-plan.ts';
import {makeItem,placementIndex,validatePlacement} from '../src/lib/world-builder.ts';
const plan = emptyChaosPlan();
plan.pieces.set('30,46','stone'); plan.pieces.set('32,46','board');
plan.reclaimed.add('29,46'); plan.monster={x:32,y:47}; plan.unit={x:33,y:47}; plan.area={x:31,y:47};
assert.deepEqual(decodeChaosPlan(encodeChaosPlan(plan)),plan);
assert.deepEqual(decodeChaosPlan(encodeChaosPlan(emptyChaosPlan())),emptyChaosPlan());
const multi=emptyChaosPlan();
for(let i=0;i<14;i++)multi.pieces.set(`${20+i*2},20`,'stone');
multi.groups=[{id:'a',area:{x:20,y:20},pieceKeys:[...multi.pieces.keys()].slice(0,7),reclaimedKeys:[],monster:{x:19,y:20},unit:{x:19,y:21}},{id:'b',area:{x:40,y:20},pieceKeys:[...multi.pieces.keys()].slice(7),reclaimedKeys:[],monster:{x:39,y:20},unit:{x:39,y:21}}];
multi.activeGroup='b';
assert.deepEqual(decodeChaosPlan(encodeChaosPlan(multi)),multi);
const legacy=JSON.parse(encodeChaosPlan(plan));delete legacy.groups;delete legacy.activeGroup;
assert.equal(decodeChaosPlan(JSON.stringify(legacy)).pieces.size,plan.pieces.size);
const state={version:1,reclaimed:[],items:[...multi.pieces.keys()].map((key,index)=>({...makeItem('facility',191),id:`stone-${index}`,x:20+index*2,y:20}))};
const item={...makeItem('facility',191),id:'another',x:60,y:60};
const land=new Set(['60,60','61,60','60,61','61,61']);
const index=placementIndex(state,land);
assert.match(validatePlacement(item,state,index).error,/limit reached/);
assert.equal(validatePlacement(item,state,index,{ignoreAcquisitionLimit:true}).error,undefined);
const occupied={...item,x:20,y:20};
assert(validatePlacement(occupied,state,placementIndex(state,new Set([...land,'20,20','21,20','20,21','21,21'])),{ignoreAcquisitionLimit:true}).error);
for (const mutate of [
 d=>d.version=3,
 d=>d.pieces.push(['160,0','board']),
 d=>d.pieces.push(['159,159','stone']),
 d=>d.pieces.push(['1,1','unknown']),
 d=>d.pieces.push(['30,46','stone']),
 d=>d.monster={x:1.5,y:1},
 d=>d.reclaimed=['-1,1'],
 d=>d.area={x:NaN,y:1},
]) {const data=JSON.parse(encodeChaosPlan(plan)); mutate(data); assert.throws(()=>decodeChaosPlan(JSON.stringify(data)));}
console.log(JSON.stringify({status:'pass',roundTrips:3,legacyMigration:true,workspaceStones:14,workspacePlacementBeyondSeven:true,worldBuilderLimitPreserved:true,invalidSavesRejected:8}));
