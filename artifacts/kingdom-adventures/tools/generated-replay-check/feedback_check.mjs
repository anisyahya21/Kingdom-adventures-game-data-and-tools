import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { projectilePosition, projectileAngle, combatProjectilesAt } from "@/lib/combat-projectiles";
import { feedbackAlive, feedbackDraw, monsterHitOffset } from "@/lib/combat-feedback";
import { buildGeneratedStageOverlays } from "@/lib/generated-battle-visuals";

const evidence = new URL("../../../../../RE-evidence/20261011-combat-feedback/", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("projectile-reference.json", evidence)));
let checks = 0;
const angleReference = JSON.parse(readFileSync(new URL("native-angle-reference.json", evidence)));
for (const {dx, dy, nativeHelperDegrees} of angleReference.cases) {
  assert.equal(projectileAngle(dx, dy), Math.trunc(nativeHelperDegrees + (dy < 0 ? 180 : 0)) + 90);
  checks++;
}
for (const c of cases) {
  const actual = projectilePosition(c.start, c.end, c.speed, c.age);
  assert.deepEqual(actual.position, c.position, JSON.stringify(c));
  assert.equal(actual.impacted, c.impacted);
  checks += 2;
}
const reference = JSON.parse(readFileSync(new URL("native-draw-reference.json", evidence))).tables;
for (let age = 0; age < 29; age++) {
  const expected = reference.damage[age + 1];
  const actual = feedbackDraw("damage", age);
  assert.equal(actual.offsetY, -20 - (age + 1) + expected.y);
  assert.equal(actual.scale, expected.scale);
  assert.equal(actual.alpha, expected.alpha);
  assert.equal(feedbackDraw("critical", age).offsetY, -15 + reference.critical[age + 1].y);
  assert.equal(feedbackDraw("stationary", age).offsetY, -15);
  checks += 5;
}
assert.equal(feedbackAlive(28, 30), true);
assert.equal(feedbackAlive(29, 30), false);
assert.equal(feedbackAlive(18, 20), true);
assert.equal(feedbackAlive(19, 20), false);
assert.deepEqual([0,1,2,3,4,5,6].map(monsterHitOffset), [-3,2,-2,1,-1,0,0]);
checks += 5;
const hit = { tick: 40, seq: 1, kind: "attack", attackerUnitId: "enemy:0", targetUnitId: "ally:0", hit: true, damage: 12, critical: true };
const anchorOf = (_id, tick) => ({ left: `${tick}px`, top: "100px" });
const overlays = (tick) => buildGeneratedStageOverlays({ events: [hit], impactEvents: [hit], impactTick: tick,
  anchorOf, sideOf: () => "enemy" });
assert.equal(overlays(68).find((o) => o.kind === "damage").style, "enemy");
assert.equal(overlays(68).find((o) => o.kind === "damage").anchor.left, "40px");
assert.equal(overlays(69).length, 0);
assert.equal(overlays(40).some((o) => o.kind === "arrow"), false);
checks += 4;
const event = { seq: 1, tick: 0, kind: "projectile_launch", skillId: 1, projectileId: 123, start: [24,15,72], end: [24,0,144] };
assert.equal(combatProjectilesAt([event], 0, 3, 0).length, 1);
assert.equal(combatProjectilesAt([{...event, start: undefined}], 0, 3, 0).length, 0);
assert.equal(combatProjectilesAt([event], 49, 3, 0).length, 0);
checks += 3;
const release = { seq: 100, tick: 100, kind: "release", casterUnitId: "ally:0", skillId: 8, commandId: 1, index: 0, used: true };
const bubbles = (events, tick) => buildGeneratedStageOverlays({ events, impactTick: tick, anchorOf, sideOf: () => "ally" }).filter((o) => o.kind === "skill");
assert.equal(bubbles([release, {...release,seq:101,tick:105,index:1}, {...release,seq:102,tick:110,index:2}], 110).length, 1);
assert.equal(bubbles([{...release,used:false}], 100).length, 0);
assert.equal(bubbles([{...release,index:undefined}], 100).length, 0);
const second = {...release,seq:103,tick:110,commandId:2};
assert.deepEqual(bubbles([release,second], 110).map((b) => [b.key,b.age,b.anchor.left]), [["skill-100",10,"100px"],["skill-103",0,"110px"]]);
assert.equal(bubbles([release,second], 118).length, 2);
assert.deepEqual(bubbles([release,second], 119).map((b) => b.key), ["skill-103"]);
assert.equal(bubbles([release,second], 128).length, 1);
assert.equal(bubbles([release,second], 129).length, 0);
checks += 8;
const replay = JSON.parse(readFileSync(new URL("../20260919-configurable-battle-setup/run-battle-16.4/replays/R.json", evidence)));
const birthTicks = replay.events.filter((e) => e.kind === "effect_birth" && e.type === 15).map((e) => e.tick);
const renderedTicks = replay.events.flatMap((e) => bubbles([e], e.tick).map(() => e.tick));
assert.equal(renderedTicks.length, 12);
assert.deepEqual(renderedTicks, birthTicks);
checks += 2;
writeFileSync(new URL("feedback-check.json", evidence), JSON.stringify({ passed: checks, failed: 0,
  scope: "Frontend versus original ARM64 draw arguments and existing native-checked float32 flight model" }, null, 2) + "\n");
console.log(JSON.stringify({passed: checks, failed: 0}));
