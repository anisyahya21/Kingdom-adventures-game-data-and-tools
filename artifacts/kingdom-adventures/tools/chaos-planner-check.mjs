import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parseNativeMapBinary} from '../src/runtime/world-builder/native-map.ts';
import {initialWorld,placementIndex} from '../src/lib/world-builder.ts';
import {findChaosLayouts,resolveChaosLevel} from '../src/lib/chaos-planner.ts';
import {stoneFootprint,eastFrontSpawn,movementEnvelope,withinStoneDirectionalRange} from '../src/lib/chaos-rules.ts';
const key=c=>`${c.x},${c.y}`;
const binary=fs.readFileSync('public/world-assets/map/map_160_160.bin');
const map=parseNativeMapBinary(binary);
const ground=JSON.parse(fs.readFileSync('src/game-data/native-map-ground.json','utf8'));
const land=new Set(map.cells.filter(c=>c.fields.f1!==0).map(key));
for(const [x,y] of ground.facilityGround)land.add(`${x},${y}`);
for(const port of ground.ports)for(const [x,y] of port.ground)land.add(`${x},${y}`);
const blocked=new Set(placementIndex(initialWorld(),land).occupied.keys());
const source=fs.readFileSync('src/lib/monster-truth.ts','utf8');
const areaTable=JSON.parse(source.match(/export const NATIVE_MAP:[^=]+?=\s*(\[[\s\S]*?\]);/)[1].replace(/\b(terrain|level):/g,'"$1":'));
const levelAt=c=>areaTable[Math.floor(c.y/16)][Math.floor(c.x/16)].level;
const byLevel=new Map();for(const cell of map.cells){const lv=levelAt(cell);if(!byLevel.has(lv))byLevel.set(lv,[]);byLevel.get(lv).push({x:cell.x,y:cell.y});}
function context(level){const all=byLevel.get(level);const focus=resolveChaosLevel(String(level),all,land,null);return {focus,land,blocked,areaCells:all.filter(c=>Math.floor(c.x/16)===Math.floor(focus.x/16)&&Math.floor(c.y/16)===Math.floor(focus.y/16))};}
function validate(plan,ctx,count){
 assert.equal(plan.anchors.length,count);
 const ground=new Set([...land,...plan.reclaimed.map(key)]);
 const reached=new Set(land),queue=[...land];
 for(let index=0;index<queue.length;index++){const [x,y]=queue[index].split(',').map(Number);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const next=`${x+dx},${y+dy}`;if(ground.has(next)&&!reached.has(next)){reached.add(next);queue.push(next);}}}
 for(const cell of plan.reclaimed){assert(!land.has(key(cell)));assert(reached.has(key(cell)),'Disconnected reclamation');}
 const occupied=new Set();for(const anchor of plan.anchors){assert(ctx.areaCells.some(c=>key(c)===key(eastFrontSpawn(anchor))));for(const cell of stoneFootprint(anchor)){assert(ground.has(key(cell)));assert(!blocked.has(key(cell)));assert(!occupied.has(key(cell)));occupied.add(key(cell));}}
 for(const cell of [plan.monster,plan.unit,...plan.boards]){assert(ground.has(key(cell)));assert(!blocked.has(key(cell)));assert(!occupied.has(key(cell)));}
 assert.equal(Math.abs(plan.monster.x-plan.unit.x)+Math.abs(plan.monster.y-plan.unit.y),1);
 for(const anchor of plan.anchors){assert(withinStoneDirectionalRange(anchor,plan.monster));assert(withinStoneDirectionalRange(anchor,plan.unit));}
 const boards=new Set(plan.boards.map(key));assert.equal(boards.size,plan.boards.length);
 assert(!boards.has(key(plan.unit))&&!boards.has(key(plan.monster)));
 const expected=new Set(plan.anchors.flatMap(a=>[...movementEnvelope(a)]).filter(k=>ground.has(k)&&!blocked.has(k)&&!occupied.has(k)&&k!==key(plan.monster)&&k!==key(plan.unit)));
 assert.deepEqual(boards,expected);
}
const fingerprint=crypto.createHash('sha256').update(fs.readFileSync('src/lib/chaos-planner.ts')).update(fs.readFileSync('src/lib/chaos-rules.ts')).update(fs.readFileSync('tools/chaos-planner-check.mjs')).update(binary).digest('hex');
const file='../../docs/chaos-stone-review/connected-land-scenarios.json';
const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
const cases=old?.fingerprint===fingerprint?old.cases:[];
const smoke=process.argv.includes('--smoke');const requested=(smoke?[135,3200,9999]:[135,3200,9999,4800,6000,2400,5100]).flatMap(level=>(smoke?[7]:[1,3,7]).map(count=>({level,count})));
for(const {level,count} of requested){if(cases.some(c=>c.level===level&&c.count===count))continue;const ctx=context(level);const start=performance.now();const result=findChaosLayouts(ctx,count);for(const layout of result.layouts)validate(layout,ctx,count);const elapsedMs=performance.now()-start;const entry={level,count,elapsedMs:Math.round(elapsedMs),existingLandInArea:ctx.areaCells.filter(c=>land.has(key(c))).length,candidates:result.candidates,layouts:result.layouts.length,first:result.layouts[0]??null};cases.push(entry);fs.writeFileSync(file,JSON.stringify({fingerprint,landCells:land.size,f1Values:[...new Set(map.cells.map(c=>c.fields.f1))],cases},null,2));console.log(JSON.stringify({level,count,elapsedMs:entry.elapsedMs,layouts:entry.layouts,candidates:entry.candidates,boards:entry.first?.boards.length,ally:entry.first?.unit}));}
const water={land:new Set(),blocked:new Set(),areaCells:[{x:10,y:10}],focus:{x:10,y:10}};assert.equal(findChaosLayouts(water,1).layouts.length,0);
assert.equal(resolveChaosLevel('135junk',byLevel.get(135),land,null),null);
console.log(JSON.stringify({status:'pass',cases:cases.length,landCells:land.size}));
