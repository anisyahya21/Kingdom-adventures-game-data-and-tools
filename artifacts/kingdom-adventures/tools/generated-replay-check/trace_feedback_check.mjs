import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildGeneratedFrames} from "@/lib/generated-battle-view";
import {buildGeneratedStageOverlays} from "@/lib/generated-battle-visuals";
import {combatSoundRequests} from "@/lib/combat-sounds";
const folder = new URL("../../../../../RE-evidence/20261011-combat-feedback/",import.meta.url);
const events = JSON.parse(readFileSync(new URL("trace-feedback-events.json",folder)));
const base = JSON.parse(readFileSync(new URL("../20260919-configurable-battle-setup/run-battle-16.4/replays/R.json",folder)));
const hero = {...base.units.find((u)=>u.unitId==="ally:0"),startHp:500,startMp:200};
const enemy = {...hero,unitId:"enemy:0",side:"enemy",entityId:101,cell:[0,3]};
const replay = {...base,units:[hero,enemy],events,ticks:22,finalState:{...base.finalState,ticks:22,units:[]}};
const frames = buildGeneratedFrames(replay);
let checks=0;
for (const frame of frames) {
  const last=frame.events.filter((e)=>e.kind==="animation_frame"&&e.targetUnitId==="ally:0").at(-1);
  if (!last) continue;
  assert.equal(frame.units["ally:0"].animationFrame,last.frame);
  assert.equal(frame.units["ally:0"].animationRate,last.rate);
  assert.equal(frame.units["ally:0"].clipFrame,last.frame);
  checks+=3;
}
const releases=events.filter((e)=>e.kind==="release"&&e.used&&e.skillId===24);
assert.deepEqual(releases.map((e)=>e.index),[0,1,2,3]); checks++;
for (const release of releases) {
  assert.equal(combatSoundRequests(events,release.tick-1,release.tick).length,1); checks++;
}
const births=events.filter((e)=>e.kind==="effect_birth"&&e.type===15);
const anchorOf=()=>({left:"0px",top:"0px"});
const balloons=events.flatMap((e)=>buildGeneratedStageOverlays({events:[e],impactTick:e.tick,authoritativeSkillBirths:true,anchorOf,sideOf:()=>"ally"}).filter((o)=>o.kind==="skill"));
assert.equal(balloons.length,births.length); checks++;
assert.deepEqual(balloons.map((b)=>b.skillId),births.map((e)=>e.skillId)); checks++;
for (const birth of births) {
  assert.equal(buildGeneratedStageOverlays({events:[birth],impactTick:birth.tick+19,authoritativeSkillBirths:true,anchorOf,sideOf:()=>"ally"}).length,0); checks++;
}
console.log(JSON.stringify({passed:checks,failed:0,scope:"Four-hit simulator trace through replay normalization and frontend animation/sound/bubble consumers"}));
