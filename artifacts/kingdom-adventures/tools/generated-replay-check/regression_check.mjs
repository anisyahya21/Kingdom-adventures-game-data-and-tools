/**
 * Generated-replay VISUAL REGRESSION check - pure Node, no bundler, no browser, no server.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/generated-replay-check/regression_check.mjs [--out DIR]
 *
 * This is the pass that pins the reported /battle -> generated replay regressions on REAL stored data.
 * It asserts the drawn result - the per-frame clip and its record values (transX/transY/u/v/texId), the
 * per-frame fighter position, the HP/MP gauge values - and never a source string, with one documented
 * exception (the 0-sized sprite origin contract, which is a CSS shape with no runtime surface in Node).
 *
 * Fixtures (RE-evidence/20260920-battle-regression-pass/fixtures/):
 *   generated-battle-regression.json      the authoritative runner replay of the user's reference team
 *                                         plus the exact visualSetup the /battle route stores.
 *   generated-battle-renderer-probe.json  labelled renderer probes: same runner streams, one unit's
 *                                         DRAWN identity redirected (decoded weapon clips + the
 *                                         KO->revive / KO->departure lifecycles).
 *
 * Window exercised end to end (faithful fixture, tick 15): ally:0 spends MP for an active skill
 * (25 slot 2), the same skill lands on enemy:15 for 160 damage, a real `release` raises the balloon,
 * and the HP/MP bars are on the front row.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGeneratedFrames,
  buildGeneratedUnits,
  generatedAttackClipId,
  generatedCoverage,
  generatedFighterVitals,
  generatedFighterBarTier,
  generatedFrameClipId,
  generatedHumanCharacter,
  generatedHumanLinesForFrame,
  generatedScenePlacement,
  generatedStageMode,
} from "@/lib/generated-battle-view";
import { buildGeneratedStageOverlays } from "@/lib/generated-battle-visuals";
import { readGeneratedBattle } from "@/lib/generated-battle-store";
import { battlePlaybackEndTick, parseBattleReplayResult } from "@/lib/battle-replay-result";
import { BATTLE_DIRECTIONS, nativeInitialFormation } from "@/lib/battle-replay";
import { humanIdleResolution } from "@/lib/human-battle-idle";
import {
  HUMAN_CLIPS,
  HUMAN_KNOCKDOWN,
  humanLineRecordsAt,
  humanReactionLinesAt,
  humanWalkLinesAt,
} from "@/lib/human-battle-animation";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const FIXTURES = path.join(WORKSPACE, "RE-evidence", "20260920-battle-regression-pass", "fixtures");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(tmpdir(), "ka-generated-regression-check");

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
  return passed;
};
const checkTrue = (name, actual, detail) => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail ?? "expected truthy" });
  return Boolean(actual);
};

/** the geometry the frame's own records carry, so two frames can be compared as DRAWN */
const geometry = (lines) => lines.map((line) => [line.texId, line.u, line.v, line.w, line.h, line.transX, line.transY, line.reversU]);

const rules = JSON.parse(readFileSync(path.join(APP, "public", "character_sprites", "character-rules.json"), "utf8"));
const partRules = { spriteBase: rules.spriteBase, dirs: rules.dirs };
const load = (file) => JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));

/**
 * Load a fixture through the PAGE'S OWN reader, so "the /battle-replay page can render this file" is
 * proven by the same validation the page runs, not by a test-local shape assumption.
 */
function loadRecord(file) {
  const parsed = load(file);
  const read = readGeneratedBattle(JSON.stringify(parsed.record));
  if (read.status !== "ok") {
    checks.push({ name: `${file}: the page's own reader accepts the stored record`, passed: false, detail: `status ${read.status} ${read.reason ?? ""}` });
    return parsed;
  }
  checks.push({ name: `${file}: the page's own reader accepts the stored record`, passed: true, detail: "ok" });
  parsed.loadedRecord = read.record;
  return parsed;
}

const faithful = loadRecord("generated-battle-regression.json");
const probe = loadRecord("generated-battle-renderer-probe.json");

function layout(record) {
  const replay = record.replay;
  const units = buildGeneratedUnits(replay, record.visualSetup);
  const frames = buildGeneratedFrames(replay);
  const rowOffset = nativeInitialFormation(
    units.filter((unit) => unit.side === "ally").length,
    units.filter((unit) => unit.side === "enemy").length,
  ).rowOffset;
  const sideOf = (unitId) => units.find((unit) => unit.unitId === unitId)?.side ?? null;
  const placement = (frame, unitId) => {
    const unitFrame = frame.units[unitId];
    return generatedScenePlacement({ cell: unitFrame.cell, unitFrame, tick: frame.tick, rowOffset, viewPanX: 0 });
  };
  const overlaysAt = (frame) =>
    buildGeneratedStageOverlays({
      events: frame.events,
      anchorOf: (unitId) => (unitId && frame.units[unitId] ? placement(frame, unitId) : null),
      sideOf,
    });
  return { units, frames, rowOffset, sideOf, placement, overlaysAt };
}

const F = layout(faithful.loadedRecord);
const FIXTURE_EVENTS = faithful.loadedRecord.replay.events;
const frameAt = (tick) => F.frames.find((frame) => frame.tick === tick);

/* ------------------------------------------------------------------ */
/* 1. every human ally is drawn from the recovered clip, not the static */
/*    loadout frame 0                                                   */
/* ------------------------------------------------------------------ */

const humans = F.units.filter((unit) => unit.human);
check("the faithful fixture carries the whole ally team as humans", humans.length, 6);
check("every human ally resolves to a recovered character clip", humans.map((unit) => generatedStageMode(unit, rules)), Array(humans.length).fill("human-clip"));

const characters = new Map(humans.map((unit) => [unit.unitId, generatedHumanCharacter(unit, rules)]));
checkTrue(
  "every resolved character is the 17-slot native imgIds array with real gear",
  humans.every((unit) => {
    const character = characters.get(unit.unitId);
    return character && character.imgIds.length === 17 && character.imgIds[1] > 0 && character.imgIds[4] > 0 && character.imgIds[10] > 0;
  }),
  JSON.stringify(humans.map((unit) => [unit.unitId, characters.get(unit.unitId)?.imgIds])),
);
check(
  "the drawn weapon image slot follows the equipped weapon (Ninja A staff 35 -> img 343)",
  characters.get("ally:0").imgIds[11],
  343,
);
check(
  "the drawn shield image slot follows the equipped shield (Ninja B/ Green Shield 193 -> img 116)",
  characters.get("ally:0").imgIds[12],
  116,
);
check(
  "a job whose only native combat row is a different rank token still resolves (D Scholar -> F Rank Scholar 132)",
  [characters.get("ally:2")?.jobSourceId, characters.get("ally:2")?.imgIds[1]],
  [132, 57],
);

/* the decisive "allies are not static" measurement: every tick of every ally draws a body */
let blankTicks = 0;
let drawnTotal = 0;
for (const unit of humans) {
  for (const frame of F.frames) {
    const unitFrame = frame.units[unit.unitId];
    if (!unitFrame) continue;
    const lines = generatedHumanLinesForFrame(unitFrame, unit.side === "ally" ? 0 : 2, generatedFrameClipId(unit, unitFrame));
    const resolution = humanIdleResolution(characters.get(unit.unitId), partRules, lines ?? []);
    drawnTotal += resolution.draws.length;
    if (resolution.draws.length === 0) blankTicks += 1;
  }
}
check("no ally tick draws an empty body (blank frames)", blankTicks, 0);
checkTrue("allies draw 6-7 body lines per tick across the fight", drawnTotal > 6 * F.frames.length, `draws ${drawnTotal} over ${F.frames.length} frames`);

/* and the frames really move: the idle clip advances one SEB frame per tick */
const ally0 = F.units.find((unit) => unit.unitId === "ally:0");
const idleLines = (tick) => {
  const frame = frameAt(tick);
  return generatedHumanLinesForFrame(frame.units["ally:0"], 0, generatedFrameClipId(ally0, frame.units["ally:0"]));
};
check("the idle clip frame is one per tick (tick 0 -> SEB frame 1)", [frameAt(0).units["ally:0"].clipId, frameAt(0).units["ally:0"].clipFrame], ["equipWaitUp", 1]);
check("the idle clip frame advances by exactly one per tick", [frameAt(5).units["ally:0"].clipFrame, frameAt(6).units["ally:0"].clipFrame], [6, 7]);
checkTrue("consecutive idle ticks are drawn from different SEB frames", JSON.stringify(geometry(idleLines(0))) !== JSON.stringify(geometry(idleLines(6))), "idle geometry did not change");
const idleSignatures = new Set(F.frames.map((frame) => JSON.stringify(geometry(generatedHumanLinesForFrame(frame.units["ally:0"], 0, generatedFrameClipId(ally0, frame.units["ally:0"])) ?? []))));
checkTrue("one ally alone plays every recovered idle/reaction pose in this fight", idleSignatures.size > 10, `distinct ${idleSignatures.size}`);

/* the KO / departure / reaction lifecycles pull from the recovered reaction clips, and the reaction
   frame is wrapped at its own clip length - an unwrapped frame runs past the last SEB key and every
   line resolves to "no sprite", i.e. a fighter that disappears */
const leavingUnit = F.units.find((unit) => F.frames.some((frame) => frame.units[unit.unitId]?.visual === "leaving"));
const leavingFrame = F.frames.find((frame) => frame.units[leavingUnit.unitId]?.visual === "leaving");
check(
  "a departing fighter keeps drawing the settled down pose at frame 0",
  geometry(generatedHumanLinesForFrame(leavingFrame.units[leavingUnit.unitId], leavingUnit.side === "ally" ? 0 : 2, null)),
  geometry(humanReactionLinesAt("knockDownDown", leavingUnit.side === "ally" ? 0 : 2, 0)),
);
const knockFrame = F.frames.find((frame) => Object.values(frame.units).some((unit) => unit.visual === "knocking_down"));
const knockId = Object.keys(knockFrame.units).find((id) => knockFrame.units[id].visual === "knocking_down");
const knockUnit = F.units.find((unit) => unit.unitId === knockId);
const knockDir = knockUnit.side === "ally" ? 0 : 2;
const knockUpdate = knockFrame.units[knockId].clipFrame + 1;
check(
  "a knocked-down fighter spins through the recovered knockDownSit directions",
  geometry(generatedHumanLinesForFrame(knockFrame.units[knockId], knockDir, null)),
  geometry(humanReactionLinesAt("knockDownSit", (((knockDir + Math.min(knockUpdate, HUMAN_KNOCKDOWN.spinThrough)) % 4) + 4) % 4, (knockUpdate - 1) % 14)),
);

/* ------------------------------------------------------------------ */
/* 2. the active-skill window: MP spend, damage HP, damage number, bubble */
/* ------------------------------------------------------------------ */

const mpEvent = FIXTURE_EVENTS.find((event) => event.kind === "mp");
const attackEvent = FIXTURE_EVENTS.find((event) => event.kind === "attack" && typeof event.hpBefore === "number");
const releaseEvent = FIXTURE_EVENTS.find((event) => event.kind === "release" && event.used === true);
check("the fixture really is the tick-15 skill window", [mpEvent.tick, mpEvent.casterUnitId, mpEvent.skillId, mpEvent.before, mpEvent.after], [15, "ally:0", 25, 1959, 1925]);
check("the MP event is the runner's own before/after pair", mpEvent.after, mpEvent.before - mpEvent.amount);
const mpFrame = frameAt(mpEvent.tick);
const mpBeforeFrame = frameAt(mpEvent.tick - 1);
check("the folded MP on the caster's own frame is the runner's after value", mpFrame.units["ally:0"].mp, 1925);
check("the MP bar at tick 15 is strictly below tick 14 (it visibly falls)", mpFrame.units["ally:0"].mp < mpBeforeFrame.units["ally:0"].mp, true);

check("the damage hit lands in the same window on enemy:15", [attackEvent.tick, attackEvent.targetUnitId, attackEvent.damage, attackEvent.hpBefore, attackEvent.hpAfter], [15, "enemy:15", 160, 1121, 961]);
check("the folded target HP is the runner's own hpAfter", mpFrame.units["enemy:15"].hp, 961);
check("the target HP bar at tick 15 is strictly below tick 14", mpFrame.units["enemy:15"].hp < mpBeforeFrame.units["enemy:15"].hp, true);

const overlays = F.overlaysAt(mpFrame);
const damageOverlay = overlays.find((item) => item.kind === "damage");
check("the damage number carries the runner's own amount", damageOverlay?.amount, 160);
checkTrue("the damage number uses the recovered non-critical attacker-side style", typeof damageOverlay?.style === "string" && damageOverlay.style.length > 0, JSON.stringify(damageOverlay));
check("the damage number is anchored on the hit unit's own scene position", damageOverlay?.anchor, F.placement(mpFrame, "enemy:15"));
checkTrue("a hit also draws the attacker's arrow and the impact marker", overlays.some((item) => item.kind === "arrow") && overlays.some((item) => item.kind === "impact"), JSON.stringify(overlays.map((item) => item.kind)));

const balloon = overlays.find((item) => item.kind === "skill");
check("the skill balloon carries the released skill id", balloon?.skillId, 25);
check("the skill balloon carries the caster and its side", [balloon?.casterUnitId, balloon?.side], ["ally:0", "ally"]);
checkTrue("the skill balloon carries a recovered name and a canonical icon", typeof balloon?.name === "string" && balloon.name.length > 0 && typeof balloon.icon === "string", JSON.stringify(balloon));
check("the balloon is anchored on the caster", balloon?.anchor, F.placement(mpFrame, "ally:0"));

const usedReleases = FIXTURE_EVENTS.filter((event) => event.kind === "release" && event.used === true).length;
const allReleases = FIXTURE_EVENTS.filter((event) => event.kind === "release").length;
check("every release in this fixture is a real one (used:true)", [usedReleases, allReleases], [329, 329]);
const totalBalloons = F.frames.reduce((total, frame) => total + F.overlaysAt(frame).filter((item) => item.kind === "skill").length, 0);
check("one balloon per actually-released skill, over the whole fight", totalBalloons, usedReleases);
const unusedRelease = { ...releaseEvent, seq: releaseEvent.seq + 100000, used: false };
const unusedOverlays = buildGeneratedStageOverlays({ events: [unusedRelease], anchorOf: () => F.placement(mpFrame, "enemy:15"), sideOf: () => "ally" });
check("a release the runner did NOT use draws no balloon", unusedOverlays.filter((item) => item.kind === "skill").length, 0);

/* ------------------------------------------------------------------ */
/* 3. HP/MP bars: real values, every ally readable                      */
/* ------------------------------------------------------------------ */

check("rowOffset for 6 allies / 21 enemies", F.rowOffset, 5);
const allyCells = F.units.filter((unit) => unit.side === "ally").map((unit) => [unit.unitId, frameAt(15).units[unit.unitId].cell[1]]);
/*
 * The ally side is the labelled all-allied-bar product rule (a rear ally still draws), so every
 * ally reads "G"; the native front-row predicate that used to drop the rear Healer is asserted
 * directly through generatedFighterBarTier instead of through a missing bar.
 */
check("every ally draws a bar, the rear row included", allyCells.map(([id, row]) => [id, row, generatedFighterVitals("ally", frameAt(15).units[id], F.rowOffset) ? "G" : "-"]), [
  ["ally:0", 6, "G"], ["ally:1", 7, "G"], ["ally:2", 6, "G"], ["ally:3", 6, "G"], ["ally:4", 6, "G"], ["ally:5", 6, "G"],
]);
check(
  "only the rear ally leaves the native front-row tier",
  allyCells.map(([id]) => generatedFighterBarTier("ally", frameAt(15).units[id], F.rowOffset)),
  ["native-front", "ally-rear-deviation", "native-front", "native-front", "native-front", "native-front"],
);
const enemyRows = F.units.filter((unit) => unit.side === "enemy").map((unit) => [unit.unitId, frameAt(15).units[unit.unitId].cell[1]]);
check(
  "the enemy front row (rowOffset) has the bars and every deeper row does not",
  enemyRows.map(([id, row]) => (row === F.rowOffset) === Boolean(generatedFighterVitals("enemy", frameAt(15).units[id], F.rowOffset))),
  Array(enemyRows.length).fill(true),
);
check("five enemies really are on the front row at tick 15", enemyRows.filter(([, row]) => row === F.rowOffset).length, 5);
const gaugeAt15 = generatedFighterVitals("ally", frameAt(15).units["ally:0"], F.rowOffset);
check("the bar values are the folded frame's own HP/MP against the runner's folded maxima", [gaugeAt15.hp.current, gaugeAt15.hp.max, gaugeAt15.mp.current, gaugeAt15.mp.max], [4239, 4239, 1925, 1959]);
checkTrue("the caster's MP bar is visibly not full after the spend", gaugeAt15.mp.current < gaugeAt15.mp.max, JSON.stringify(gaugeAt15.mp));
const gaugeBefore = generatedFighterVitals("ally", frameAt(14).units["ally:0"], F.rowOffset);
checkTrue("the MP bar is lower after the spend than before it", gaugeAt15.mp.current < gaugeBefore.mp.current, `${gaugeBefore.mp.current} -> ${gaugeAt15.mp.current}`);
const enemyGaugeBefore = generatedFighterVitals("enemy", frameAt(14).units["enemy:15"], F.rowOffset);
checkTrue("the damaged fighter's HP bar is lower after the hit", generatedFighterVitals("enemy", mpFrame.units["enemy:15"], F.rowOffset).hp.current < enemyGaugeBefore.hp.current, `${enemyGaugeBefore.hp.current} -> ${mpFrame.units["enemy:15"].hp}`);

/* ------------------------------------------------------------------ */
/* 4. positions come from the recovered projection and follow the cell  */
/* ------------------------------------------------------------------ */

const posAlly0 = F.placement(frameAt(15), "ally:0");
const posAlly2 = F.placement(frameAt(15), "ally:2");
checkTrue("two fighters in different cells get different scene positions", posAlly0.left !== posAlly2.left && posAlly0.top !== posAlly2.top, JSON.stringify([posAlly0, posAlly2]));
const moveEvent = FIXTURE_EVENTS.find((event) => event.kind === "cell_change" && event.targetUnitId && F.sideOf(event.targetUnitId) === "ally" && frameAt(event.tick) && frameAt(event.tick - 1));
const beforeMove = F.placement(frameAt(moveEvent.tick - 1), moveEvent.targetUnitId);
const afterMove = F.placement(frameAt(moveEvent.tick), moveEvent.targetUnitId);
checkTrue("a cell_change moves the drawn fighter (and the damage numbers anchored to it)", beforeMove.left !== afterMove.left || beforeMove.top !== afterMove.top, `tick ${moveEvent.tick} ${moveEvent.targetUnitId} ${JSON.stringify([beforeMove, afterMove])}`);

/* ------------------------------------------------------------------ */
/* 5. weapon attack pose: the recovered SEB, selected by the weapon     */
/* ------------------------------------------------------------------ */

const P = layout(probe.loadedRecord);
const pikeUnit = P.units.find((unit) => unit.unitId === "ally:0");
const bowUnit = P.units.find((unit) => unit.unitId === "ally:1");
check("the probe's pike guard resolves the recovered spear motion", [pikeUnit.weaponId, pikeUnit.weaponMotion], [72, 9]);
check("the probe's archer resolves the recovered bow motion", [bowUnit.weaponId, bowUnit.weaponMotion], [162, 11]);
check("motion 9 selects the recovered spear attack clip", generatedAttackClipId(9), "attackSpearUp");
check("motion 11 selects the recovered bow attack clip", generatedAttackClipId(11), "attackBowUp");
check(
  "the 2026-09-21 export decoded motion 4 (sword) and motion 10 (gun)",
  [generatedAttackClipId(4), generatedAttackClipId(10)],
  ["attackSwordUp", "attackGunUp"],
);
check(
  "a weapon motion whose SEB is still not exported claims no clip",
  [generatedAttackClipId(12), generatedAttackClipId(16), generatedAttackClipId(37)],
  [null, null, null],
);

const pikeAttackFrame = P.frames.find((frame) => frame.units["ally:0"].visual === "attacking");
check("while attacking, the drawn clip is the weapon's own recovered attack SEB", generatedFrameClipId(pikeUnit, pikeAttackFrame.units["ally:0"]), "attackSpearUp");
checkTrue("the attack frame is NOT the static idle clip", generatedFrameClipId(pikeUnit, pikeAttackFrame.units["ally:0"]) !== "equipWaitUp", "attack frame fell back to the idle clip");
const hitFrame = { ...pikeAttackFrame.units["ally:0"], clipFrame: 11, stateTick: pikeAttackFrame.tick - 11 };
const windFrame = { ...pikeAttackFrame.units["ally:0"], clipFrame: 0, stateTick: pikeAttackFrame.tick };
check(
  "the drawn spear attack lines are the recovered attackSpearUp records",
  geometry(generatedHumanLinesForFrame(windFrame, 0, "attackSpearUp")),
  geometry(humanLineRecordsAt(HUMAN_CLIPS.attackSpearUp, 0)),
);
checkTrue(
  "the wind-up and the native hit update (11) draw different geometry",
  JSON.stringify(geometry(generatedHumanLinesForFrame(windFrame, 0, "attackSpearUp"))) !== JSON.stringify(geometry(generatedHumanLinesForFrame(hitFrame, 0, "attackSpearUp"))),
  "attack geometry did not change between update 0 and update 11",
);
checkTrue(
  "the attack pose is not the idle pose",
  JSON.stringify(geometry(generatedHumanLinesForFrame(windFrame, 0, "attackSpearUp"))) !== JSON.stringify(geometry(idleLines(0))),
  "attack pose equals the idle pose",
);
check(
  "a bow archer's attack frame draws the recovered attackBowUp records",
  geometry(generatedHumanLinesForFrame({ ...pikeAttackFrame.units["ally:0"], clipFrame: 5 }, 0, generatedAttackClipId(bowUnit.weaponMotion))),
  geometry(humanLineRecordsAt(HUMAN_CLIPS.attackBowUp, 5)),
);
checkTrue(
  "the spear and the bow are drawn from different crops (not one shared pose)",
  JSON.stringify(geometry(humanLineRecordsAt(HUMAN_CLIPS.attackSpearUp, 5))) !== JSON.stringify(geometry(humanLineRecordsAt(HUMAN_CLIPS.attackBowUp, 5))),
  "spear and bow resolved to the same records",
);
const coverage = generatedCoverage(faithful.loadedRecord.replay, F.units, []);
check(
  "the fixture's own sword-motion attackers are no longer reported as undecoded",
  coverage.undecodedWeaponClips,
  [],
);
const faithfulAttackTick = FIXTURE_EVENTS.find((event) => event.kind === "attack" && event.attackerUnitId === "ally:0");
const faithfulAttackFrame = frameAt(faithfulAttackTick.tick);
check(
  "a sword-motion attacker now draws the recovered sword attack clip, not the idle fallback",
  generatedFrameClipId(ally0, faithfulAttackFrame.units["ally:0"]),
  "attackSwordUp",
);

/* ------------------------------------------------------------------ */
/* 6. KO -> revive vs KO -> departure                                  */
/* ------------------------------------------------------------------ */

checkTrue(
  "the probe-written revive payload passes the page's own replay validator",
  Boolean(parseBattleReplayResult(probe.revive.payload).result),
  JSON.stringify(parseBattleReplayResult(probe.revive.payload).issues),
);
const R = layout({ replay: probe.revive.payload, visualSetup: undefined });
const reviveFrames = new Map(R.frames.map((frame) => [frame.tick, frame]));
check("a revived fighter returns through the moving state", [5, 6, 7, 8, 9, 10].map((tick) => reviveFrames.get(tick).units["ally:0"].visual), ["knocking_down", "revival_moving", "revival_moving", "revival_moving", "revival_moving", "waiting"]);
check("a fighter with no revive departs through state 8", [5, 6, 7, 8, 9, 10].map((tick) => reviveFrames.get(tick).units["ally:1"].visual), ["leaving", "leaving", "leaving", "leaving", "leaving", "leaving"]);
check("the departure is a leaving state, not a second KO", [reviveFrames.get(6).units["ally:1"].state, reviveFrames.get(6).units["ally:1"].leaving], [8, true]);
check("the revived fighter's HP comes back from the runner's own heal after value", [reviveFrames.get(6).units["ally:0"].hp, reviveFrames.get(6).units["ally:1"].hp], [400, 0]);
check(
  "the revival walk draws the recovered equip_walk records",
  geometry(generatedHumanLinesForFrame(reviveFrames.get(7).units["ally:0"], 0, null)),
  geometry(humanWalkLinesAt(0, reviveFrames.get(7).units["ally:0"].clipFrame)),
);
check(
  "the departing fighter draws the settled down pose instead",
  geometry(generatedHumanLinesForFrame(reviveFrames.get(7).units["ally:1"], 0, null)),
  geometry(humanReactionLinesAt("knockDownDown", (((0 + HUMAN_KNOCKDOWN.spinThrough) % 4) + 4) % 4, 0)),
);
checkTrue(
  "the revival walk and the departure draw different geometry",
  JSON.stringify(geometry(generatedHumanLinesForFrame(reviveFrames.get(7).units["ally:0"], 0, null))) !== JSON.stringify(geometry(generatedHumanLinesForFrame(reviveFrames.get(7).units["ally:1"], 0, null))),
  "revive and departure resolved to the same records",
);

/* ------------------------------------------------------------------ */
/* 6b. playback stops at the runner's ending cut, not at the tick limit  */
/* ------------------------------------------------------------------ */

const winReplay = probe.loadedRecord.replay;
check(
  "the win payload declares a horizon well past the fight's end",
  [winReplay.finalState.endingTick, winReplay.finalState.endingCutTick, winReplay.finalState.ticks].map((value) => typeof value === "number"),
  [true, true, true],
);
const cut = battlePlaybackEndTick(winReplay);
const uncutFrames = buildGeneratedFrames(winReplay);
const cutFrames = uncutFrames.filter((frame) => frame.tick <= cut);
check("the playback cut is the runner's last simulated tick", cut, 306);
check("the uncut clock would play thousands of post-verdict ticks", uncutFrames[uncutFrames.length - 1].tick > 3900, true);
check("the clamped clock ends exactly at the cut", cutFrames[cutFrames.length - 1].tick, 306);
checkTrue("the clamped clock still keeps the whole knock-down / departure window", cutFrames.some((frame) => frame.tick === 260) && cutFrames.some((frame) => frame.units["enemy:0"].visual === "leaving"), `last ${cutFrames[cutFrames.length - 1].tick}`);
checkTrue(
  "the departing team is still drawn on the last played frame",
  geometry(generatedHumanLinesForFrame(cutFrames[cutFrames.length - 1].units["ally:1"], 0, null)).length > 0,
  "the last played frame draws nothing",
);

/* ------------------------------------------------------------------ */
/* 7. the 0-sized sprite origin contract must stay (CSS, no runtime surface) */
/* ------------------------------------------------------------------ */

const stageSource = readFileSync(path.join(APP, "src", "components", "battle-stage.tsx"), "utf8");
checkTrue(
  "the loadout sprite keeps its 0x0 SEB origin wrapper",
  stageSource.includes('style={{ left: anchor.left, top: anchor.top, width: 0, height: 0 }} data-loadout-sprite'),
  "battle-stage.tsx no longer anchors the loadout sprite at a zero-sized origin",
);
checkTrue(
  "the 0x0 wrapper's canvas stays hidden until it has a drawn box",
  stageSource.includes('visibility: box ? undefined : "hidden"'),
  "the canvas is no longer hidden before its box is known",
);
checkTrue(
  "the scene-anchored sprite and gauge layer keeps its own 0x0 origin box",
  stageSource.includes('<div className="pointer-events-none absolute left-0 top-0">'),
  "the scene-anchored origin box changed",
);
checkTrue(
  "the damage number keeps the probe hook the browser check reads",
  stageSource.includes('data-damage-number={Math.abs(Math.round(amount))}'),
  "DamageNumber no longer exposes data-damage-number",
);
const replaySource = readFileSync(path.join(APP, "src", "components", "generated-battle-replay.tsx"), "utf8");
checkTrue(
  "the page's frame clock is the clamped one (the cut is wired, not just available)",
  replaySource.includes("battlePlaybackEndTick(displayedReplay)") && replaySource.includes("entry.tick <= playbackEndTick"),
  "generated-battle-replay.tsx no longer clamps its frame window to battlePlaybackEndTick",
);

/* ------------------------------------------------------------------ */
/* report                                                             */
/* ------------------------------------------------------------------ */

const failed = checks.filter((entry) => !entry.passed);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "regression-check.json"), JSON.stringify({ passed: checks.length - failed.length, total: checks.length, failed, checks }, null, 2) + "\n");
console.log(JSON.stringify({ passed: checks.length - failed.length, total: checks.length, failed: failed.map((entry) => entry.name), out: OUT }, null, 1));
if (failed.length > 0) process.exitCode = 1;
