import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { combatTrailsAt } from "@/lib/combat-trails";
import { battleCamera } from "@/lib/battle-replay";
import nativeDraw from "@/game-data/combat-trails.json";
const event={kind:"effect_birth",seq:1,tick:10,type:17,lifetime:10,position:[24,15,72],screen:[-40,38]};
const camera=battleCamera(3);
let checks=0;
for(let age=0;age<9;age++){
  const [line]=combatTrailsAt([event],10+age,3,7);
  assert.equal(line.x1,-48-camera.x-7);assert.equal(line.y1,33-camera.y);
  assert.equal(line.x2,-40-camera.x-7);assert.equal(line.y2,38-camera.y);
  assert.equal(line.alpha,nativeDraw.frames[age+1].alpha);assert.equal(line.width,2);checks+=6;
}
assert.deepEqual(combatTrailsAt([event],9,3,7),[]);checks++;
assert.deepEqual(combatTrailsAt([event],19,3,7),[]);checks++;
assert.deepEqual(combatTrailsAt([{...event,position:undefined}],10,3,7),[]);checks++;
assert.deepEqual(combatTrailsAt([{...event,position:[NaN,0,0]}],10,3,7),[]);checks++;
assert.equal(combatTrailsAt([event,{...event,seq:2,tick:11}],11,3,7).length,2);checks++;
assert.equal(combatTrailsAt([event],12,3,17)[0].x1,combatTrailsAt([event],12,3,7)[0].x1-10);checks++;
const recorded=JSON.parse(readFileSync(new URL('../../../../../RE-evidence/20261011-combat-feedback/trail-feedback-events.json',import.meta.url)));
const births=recorded.filter((event)=>event.kind==='effect_birth' && event.type===17);
assert.ok(births.length>0);checks++;
for(const birth of births){
  assert.equal(combatTrailsAt([birth],birth.tick,3,0).length,1);
  assert.equal(combatTrailsAt([birth],birth.tick+9,3,0).length,0);checks+=2;
}
console.log(JSON.stringify({passed:checks,failed:0}));
