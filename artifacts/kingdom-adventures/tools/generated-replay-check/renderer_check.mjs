/**
 * Renderer composition checks - the sprite/SEB composition the 2026-09-21 ship pass repaired.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/generated-replay-check/renderer_check.mjs [--out DIR]
 *
 * Pure Node: the real site modules, the real stored reference-team fixture and the real baked
 * `character-rules.json` / `human-battle-animation.json` / `human-part-atlas.json`. No browser, no
 * server, no re-simulation. It asserts, per the user's reported symptoms:
 *
 *   * every ally the user actually fields (Beast Tamer, Ninja, Wizard, Scholar) composes a head
 *     line (the rank-variant face sheet, incl. the unbaked atlas sheets) and its equipped weapon;
 *   * the three clips exported in this pass resolve from the runner`s own requested bases
 *     (16 sword, 48 magic, 56 gun) and their frame variation really changes the drawn geometry;
 *   * every ally's HP/MP block is drawn and carries the folded frame's own values (the native
 *     front-row rule for the enemy side, and the labelled all-allied-bar product rule for a
 *     rear-rank ally), and the Healer's skill/heal request plays the exported magic clip.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HUMAN_IDLE_LINES,
  humanIdleResolution,
  humanPartAtlasSize,
  HUMAN_PART_ATLAS,
} from "@/lib/human-battle-idle";
import {
  generatedAttackClipId,
  generatedClipForBase,
  generatedFrameClipId,
  generatedFighterVitals,
  generatedFighterBarTier,
  generatedHumanCharacterFromRules,
  generatedHumanLinesForFrame,
  buildGeneratedFrames,
  buildGeneratedUnits,
  generatedStageMode,
} from "@/lib/generated-battle-view";
import { HUMAN_CLIPS, humanClipFrame } from "@/lib/human-battle-animation";
import { nativeInitialFormation } from "@/lib/battle-replay";
import { readGeneratedBattle } from "@/lib/generated-battle-store";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const FIXTURES = path.join(WORKSPACE, "RE-evidence", "20260920-battle-regression-pass", "fixtures");

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

/** A PNG's own pixel size, straight out of its IHDR - no image library in the check. */
const pngSize = (assetUrl) => {
  const bytes = readFileSync(path.join(APP, "public", assetUrl.replace(/^\//, "")));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

const rules = JSON.parse(readFileSync(path.join(APP, "public", "character_sprites", "character-rules.json"), "utf8"));
const partRules = { spriteBase: rules.spriteBase, dirs: rules.dirs };

const unit = (jobId, rank, gender, weaponId, name) => ({
  unitId: name, entityId: 1, side: "ally", rosterIndex: 0, name, human: true, monsterId: null, kind: "human",
  jobId, rank, gender, weaponId, shieldId: null, weaponMotion: null, skillIds: [], invocationLevels: [],
  initialCell: [0, 6], initialGrid: 0, startHp: 1, startMp: 1, maxHp: 1, maxMp: 1,
  animationCoverage: "FULL", coverageNotes: [],
});

const CASES = [
  ["Beast Tamer D (pike 72)", unit("Beast Tamer", "D", 0, 72, "bt-d")],
  ["Beast Tamer S female", unit("Beast Tamer", "S", 1, 0, "bt-s")],
  ["Ninja A (staff 35)", unit("Ninja", "A", 0, 35, "ninja-a")],
  ["Wizard S (staff 27)", unit("Wizard", "S", 0, 27, "wiz-s")],
  ["Scholar D (bare-handed)", unit("Scholar", "D", 0, 0, "scholar-d")],
];
const resolved = CASES.map(([label, u]) => [label, u, generatedHumanCharacterFromRules(u, rules)]);
const drawsOf = (character, lines) => humanIdleResolution(character, partRules, lines);

check("every user-fielded job resolves to a native 17-slot character", resolved.map(([, , c]) => Boolean(c)), resolved.map(() => true));

/* 1. head composition: the rank-variant face sheet must draw for every case */
for (const [label, , character] of resolved) {
  const { draws, skipped } = drawsOf(character);
  const head = draws.find((draw) => draw.line === 6);
  checkTrue(
    `${label}: the head line draws`,
    Boolean(head),
    `line 6 skipped: ${JSON.stringify(skipped.filter((s) => s.line === 6))}`,
  );
  checkTrue(
    `${label}: the head crop paints real pixels of its own sheet`,
    head ? head.w > 0 && head.h > 0 && head.dest.x >= 0 && head.dest.y >= 0 : false,
    JSON.stringify(head),
  );
}

/* the Beast Tamer head is one of the sheets the original assets ship without an .opt */
const btHead = (() => {
  const [, , character] = resolved[0];
  return drawsOf(character).draws.find((draw) => draw.line === 6);
})();
check("the Beast Tamer rank-D head is drawn through the derived cell grid", [btHead.dir, btHead.file, btHead.atlasCell === true], ["face", "m_face_32_0.png", true]);
check("the derived head grid cell is the SEB crop itself", [btHead.src.x, btHead.src.y, btHead.src.w, btHead.src.h, btHead.dest.x, btHead.dest.y], [0, 0, 24, 24, 0, 0]);
checkTrue("the atlas document really lists that sheet", humanPartAtlasSize("face", "m_face_32_0.png") !== null, JSON.stringify(HUMAN_PART_ATLAS.sheets.face));

/* 2. weapon composition: an equipped weapon must draw, bare hands must not */
const weaponCases = [
  ["Beast Tamer D (pike 72)", 12, "weapon_14.png"],
  ["Ninja A (staff 35)", 12, "weapon_28_3.png"],
  ["Wizard S (staff 27)", 12, "weapon_25.png"],
  ["Scholar D (bare-handed)", null, null],
];
for (const [label, line, file] of weaponCases) {
  const entry = resolved.find(([name]) => name === label);
  const draw = drawsOf(entry[2]).draws.find((d) => d.line === 12) ?? null;
  check(`${label}: weapon line`, draw ? [draw.line, draw.file] : null, line === null ? null : [line, file]);
  if (draw) checkTrue(`${label}: the weapon crop paints pixels`, draw.w > 0 && draw.h > 0, JSON.stringify(draw));
}

/* the Ninja weapon sheet is an unbaked atlas too */
const ninjaWeapon = drawsOf(resolved.find(([name]) => name.startsWith("Ninja"))[2]).draws.find((d) => d.line === 12);
check("the Ninja staff is drawn through the derived cell grid", [ninjaWeapon.atlasCell === true, ninjaWeapon.src.w, ninjaWeapon.src.h], [true, 60, 60]);

/* 3. the exported attack clips resolve from the runner`s own requested bases */
const clipCases = [
  ["sword (motion 4 -> base 16)", 16, "attackSwordUp"],
  ["magic (behaviour 31 -> base 48)", 48, "attackMagicUp"],
  ["gun (motion 10 -> base 56)", 56, "attackGunUp"],
  ["spear (motion 9 -> base 72)", 72, "attackSpearUp"],
  ["bow (motion 11 -> base 68)", 68, "attackBowUp"],
  ["idle (behaviour 3 -> base 12)", 12, "equipWaitUp"],
];
for (const [label, base, clipId] of clipCases) {
  check(`${label} resolves to ${clipId}`, generatedClipForBase(base, 0), clipId);
  checkTrue(`${clipId} is exported with real frames`, (HUMAN_CLIPS[clipId]?.frames.length ?? 0) > 0, JSON.stringify(HUMAN_CLIPS[clipId]?.frames?.length));
}
check("the ally direction offset resolves the enemy twin of base 16", generatedClipForBase(18, 2), "attackSwordUp");
check("the weapon motion map now reports motion 4 as decoded", generatedAttackClipId(4), "attackSwordUp");
check("the skill motion 31 resolves to the magic clip", generatedAttackClipId(31), "attackMagicUp");
check("no idle clip is substituted for a decoded attack", generatedAttackClipId(4) === "equipWaitUp", false);

/* 4. frame variation: consecutive attack frames must be different drawn geometry */
for (const clipId of ["attackSwordUp", "attackMagicUp", "attackGunUp", "attackSpearUp", "attackBowUp"]) {
  const clip = HUMAN_CLIPS[clipId];
  const geometry = (frame) =>
    JSON.stringify(
      humanIdleResolution(resolved[2][2], partRules, generatedHumanLinesForFrame(
        { tick: 0, visual: "attacking", clipId, clipFrame: frame, state: 4, stateTick: 0 },
        0,
        clipId,
      ) ?? []).draws.map((d) => [d.line, d.src.x, d.src.y, d.transX, d.transY]),
    );
  const first = geometry(0);
  const later = geometry(Math.min(humanClipFrame(clip, 6), clip.maxFrame - 1));
  checkTrue(`${clipId}: frame 6 differs from frame 0`, first !== later, "both frames resolve to identical geometry");
  check(`${clipId}: the attack window stays inside the clip`, humanClipFrame(clip, 19) < clip.maxFrame, true);
}

/* 4b. the bow: the recovered clip selection and the drawn geometry of one attack */

/*
 * The reported "stretched/oversized bow" must not cost the recovered composition. Archer C's D/ Bow
 * (equip 162, motion 11) is drawn from `weapon_19.png` through the weapon line's own OPT crop, at
 * that crop's natural size, inside the 60x60 cell the SEB record names. These assertions pin it: the
 * attacking archer resolves `attackBowUp` even when the runner requested another clip, every drawn
 * frame's crop is inside the real PNG and its own OPT cell, and no frame's whole drawn box exceeds
 * the fighter's own two-cell envelope.
 */
const archer = unit("Archer", "C", 0, 162, "bow-c");
const archerCharacter = generatedHumanCharacterFromRules(archer, rules);
check("Archer C's D/ Bow resolves to the weapon slot's own sheet",
  [archerCharacter.imgIds[11], archerCharacter.imgIds[12]], [295, -2]);
check("the bow's weapon motion selects the exported bow clip", generatedAttackClipId(11), "attackBowUp");
check(
  "an attacking archer plays the bow clip even when the runner requested another one",
  generatedFrameClipId(
    { ...archer, weaponMotion: 11 },
    { tick: 0, visual: "attacking", clipId: "equipWaitUp", clipFrame: 0, state: 4, stateTick: 0 },
  ),
  "attackBowUp",
);
const bowFrames = [];
for (let frame = 0; frame < HUMAN_CLIPS.attackBowUp.maxFrame; frame += 1) {
  const draws = drawsOf(archerCharacter, generatedHumanLinesForFrame(
    { tick: 0, visual: "attacking", clipId: "attackBowUp", clipFrame: frame, state: 4, stateTick: 0 },
    0,
    "attackBowUp",
  ) ?? []).draws;
  const weapon = draws.find((draw) => draw.line === 2);
  const boxes = draws.map((draw) => ({
    x: draw.transX + draw.dest.x, y: draw.transY + draw.dest.y, w: draw.src.w, h: draw.src.h,
  }));
  bowFrames.push({
    frame,
    weapon: weapon
      ? { file: weapon.file, sheet: pngSize(weapon.png), w: weapon.src.w, h: weapon.src.h, destX: weapon.dest.x, destY: weapon.dest.y }
      : null,
    box: {
      w: Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)),
      h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)),
    },
  });
}
check("every attack frame draws the bow on the weapon line from its own sheet",
  bowFrames.map((entry) => entry.weapon?.file), Array(HUMAN_CLIPS.attackBowUp.maxFrame).fill("weapon_19.png"));
checkTrue("every drawn bow crop stays inside the real weapon_19.png and its own OPT cell",
  bowFrames.every((entry) => entry.weapon && entry.weapon.w > 0 && entry.weapon.h > 0
    && entry.weapon.w <= entry.weapon.sheet[0] && entry.weapon.h <= entry.weapon.sheet[1]
    && entry.weapon.destX >= 0 && entry.weapon.destY >= 0
    && entry.weapon.destX + entry.weapon.w <= 60 && entry.weapon.destY + entry.weapon.h <= 60),
  JSON.stringify(bowFrames.map((entry) => [entry.weapon, entry.frame])));
checkTrue("the bow keeps its own crop size instead of being stretched over the 60x60 SEB cell",
  bowFrames.every((entry) => entry.weapon.w < 60 && entry.weapon.h < 60),
  JSON.stringify(bowFrames.map((entry) => [entry.weapon.w, entry.weapon.h])));
checkTrue("the whole archer box stays inside the fighter's own envelope on every attack frame",
  bowFrames.every((entry) => entry.box.w <= 48 && entry.box.h <= 60),
  JSON.stringify(bowFrames.map((entry) => entry.box)));
checkTrue("the bow's drawn geometry really changes across the clip (the attack is animated)",
  new Set(bowFrames.map((entry) => JSON.stringify([entry.weapon.w, entry.weapon.h, entry.weapon.destX, entry.weapon.destY]))).size > 1,
  JSON.stringify(bowFrames.map((entry) => [entry.weapon.w, entry.weapon.h, entry.weapon.destX, entry.weapon.destY])));

/* 5. bars: every allied bar readable/current, enemy side on the native front-row gate */
const fixture = JSON.parse(readFileSync(path.join(FIXTURES, "generated-battle-regression.json"), "utf8"));
const record = readGeneratedBattle(JSON.stringify(fixture.record)).record;
const units = buildGeneratedUnits(record.replay, record.visualSetup);
const frames = buildGeneratedFrames(record.replay);
const rowOffset = nativeInitialFormation(
  units.filter((u) => u.side === "ally").length,
  units.filter((u) => u.side === "enemy").length,
).rowOffset;
check("every ally unit resolves to the recovered human clip path", units.filter((u) => u.side === "ally").map((u) => generatedStageMode(u, rules)), Array(6).fill("human-clip"));
const firstFrame = frames.find((frame) => frame.tick === 15);
const allyBars = units.filter((u) => u.side === "ally").map((u) => generatedFighterVitals("ally", firstFrame.units[u.unitId], rowOffset) !== null);
check("every ally draws a bar block, the rear-rank Healer included", allyBars, [true, true, true, true, true, true]);
const allyTiers = units
  .filter((u) => u.side === "ally")
  .map((u) => generatedFighterBarTier("ally", firstFrame.units[u.unitId], rowOffset));
check(
  "the front row keeps the native rule and only the rear ally uses the labelled deviation",
  allyTiers,
  ["native-front", "ally-rear-deviation", "native-front", "native-front", "native-front", "native-front"],
);
const rear = units.find((u) => u.unitId === "ally:1");
const rearFrame = firstFrame.units[rear.unitId];
const rearGauge = generatedFighterVitals("ally", rearFrame, rowOffset);
check(
  "the rear ally's bar carries the folded frame's own HP/MP, not a substitute",
  [rearGauge.hp.current, rearGauge.hp.max, rearGauge.mp.current, rearGauge.mp.max],
  [rearFrame.hp, rearFrame.maxHp, rearFrame.mp, rearFrame.maxMp],
);
checkTrue(
  "the rear ally's bar is visibly filled (non-zero rate), not a dark block",
  rearGauge.hp.max > 0 && rearGauge.mp.max > 0 && Math.trunc((rearGauge.hp.current * 100) / rearGauge.hp.max) > 0,
  JSON.stringify(rearGauge),
);
check(
  "the enemy side keeps the recovered front-row gate verbatim",
  units.filter((u) => u.side === "enemy").map((u) => generatedFighterBarTier("enemy", firstFrame.units[u.unitId], rowOffset) !== null),
  units.filter((u) => u.side === "enemy").map((u) => u.cell?.[1] === rowOffset || firstFrame.units[u.unitId].cell[1] === rowOffset),
);
const ninjaFrame = [14, 15, 16].map((tick) => frames.find((f) => f.tick === tick)?.units["ally:0"]);
check("the Ninja`s MP bar falls exactly on the runner`s mp-spend tick", [ninjaFrame[0].mp > ninjaFrame[1].mp, ninjaFrame[1].mp], [true, 1925]);
checkTrue("the bar carries live HP/MP maxima from the runner's own parameters", ninjaFrame[1].maxHp > 0 && ninjaFrame[1].maxMp > 0, JSON.stringify([ninjaFrame[1].maxHp, ninjaFrame[1].maxMp]));

/* 6. the healing/skill request really plays the exported magic clip (Heal Maddy, skill 37) */
const healer = units.find((u) => u.unitId === "ally:1");
const healRequestFrame = frames.find((frame) => frame.tick === 81);
const healRequestUnit = healRequestFrame.units["ally:1"];
check(
  "the Healer's runner request (behaviour 31, clip 48) resolves to the exported magic clip",
  [healRequestUnit.clipBehavior, generatedClipForBase(48, 0), healRequestUnit.clipId],
  [31, "attackMagicUp", "attackMagicUp"],
);
check(
  "the Healer's drawn clip during the cast window is the magic clip, not the idle clip",
  [81, 82, 83, 84, 85].map((tick) => generatedFrameClipId(healer, frames.find((f) => f.tick === tick).units["ally:1"])),
  Array(5).fill("attackMagicUp"),
);
const healerCharacter = generatedHumanCharacterFromRules(healer, rules);
const magicGeometryAt = (tick) => {
  const unitAtTick = frames.find((f) => f.tick === tick).units["ally:1"];
  const lines = generatedHumanLinesForFrame(unitAtTick, 0, "attackMagicUp") ?? [];
  return JSON.stringify(
    humanIdleResolution(healerCharacter, partRules, lines).draws.map((d) => [d.line, d.file, d.src.x, d.src.y, d.transX, d.transY]),
  );
};
const magicTicks = [81, 82, 83, 84, 85];
const magicShapes = magicTicks.map(magicGeometryAt);
checkTrue(
  "the magic clip varies across the cast window (a real animation, not a frozen pose)",
  magicShapes.filter((shape) => shape !== magicShapes[0]).length > 0,
  JSON.stringify(magicTicks.map((tick, i) => [tick, magicShapes[i] === magicShapes[0]])),
);

/* 7. the Beast Tamer keeps its head and its weapon through the whole attack */
const beastTamer = resolved.find(([name]) => name.startsWith("Beast Tamer"))[2];
const beastLines = (frame) =>
  generatedHumanLinesForFrame({ tick: 0, visual: "attacking", clipId: "attackSwordUp", clipFrame: frame, state: 4, stateTick: 0 }, 0, "attackSwordUp") ?? [];
const beastDraws = (frame) => humanIdleResolution(beastTamer, partRules, beastLines(frame)).draws;
const beastHead = (frame) => beastDraws(frame).find((d) => d.line === 6) ?? null;
const beastWeapon = (frame) => beastDraws(frame).find((d) => d.line === 12) ?? null;
checkTrue(
  "the Beast Tamer still draws its head mid-attack",
  [0, 3, 6].every((frame) => {
    const head = beastHead(frame);
    return head && head.w > 0 && head.h > 0;
  }),
  JSON.stringify([0, 3, 6].map((f) => beastHead(f))),
);
checkTrue(
  "the Beast Tamer still draws its weapon mid-attack",
  [0, 3, 6].every((frame) => {
    const weapon = beastWeapon(frame);
    return weapon && weapon.w > 0 && weapon.h > 0;
  }),
  JSON.stringify([0, 3, 6].map((f) => beastWeapon(f))),
);
const beastFrameSignature = (frame) => JSON.stringify(beastDraws(frame).map((d) => [d.line, d.src.x, d.src.y, d.transX, d.transY]));
checkTrue(
  "the Beast Tamer's attack frames differ from each other (frame variation)",
  beastFrameSignature(0) !== beastFrameSignature(3) && beastFrameSignature(3) !== beastFrameSignature(6),
  JSON.stringify([beastFrameSignature(0) === beastFrameSignature(3), beastFrameSignature(3) === beastFrameSignature(6)]),
);

const failed = checks.filter((item) => !item.passed);
const summary = { checks: checks.length, passed: checks.length - failed.length, failed: failed.length, failures: failed.slice(0, 12) };
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
