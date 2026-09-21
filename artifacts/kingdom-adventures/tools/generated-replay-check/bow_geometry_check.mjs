/**
 * Bow geometry / render composition checks for the user`s REAL bow loadout
 * (Champion S + S/ Champion`s Bow: equip 166 -> img 299 -> weapon_19_4.png).
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/generated-replay-check/bow_geometry_check.mjs
 *
 * The earlier "banner bow" pass pinned the wrong repro (Archer C + D/ Bow, equip 162 ->
 * weapon_19.png). This file pins the reported one, from the same real sources the other
 * generated-replay checks use: the real modules (`humanIdleResolution`, `generatedHumanLinesForFrame`,
 * `generatedAttackClipId`) against the real baked `character-rules.json`,
 * `human-battle-animation.json` and the real shipped PNGs. Pure Node: no browser, no server, no
 * re-simulation, no image library.
 *
 * It asserts, for the loadout the user actually fields:
 *   * the equipped weapon slot resolves the canonical bow image (equip 166 -> img 299 -> its sheet);
 *   * the attacking champion really plays `attackBowUp` (weapon motion 11) even when the runner asked
 *     for another clip;
 *   * the weapon line draws that sheet through its OWN OPT cell crop - one source rectangle, natural
 *     size, inside the real PNG, inside the SEB record`s 60x60 cell, anchored at
 *     SEB(transX, transY) + OPT(destX, destY);
 *   * the crop is not stretched over the cell, and the drawn pixels are the crop at 1:1 (the DOM
 *     contract the stage paints is pinned here as well);
 *   * the OPT cell the battle picks is the cell the SEB crop names;
 *   * the shared loadout preview`s static pose resolves the SAME OPT entry, slot key, source rectangle
 *     and SEB anchor as the battle layer, so preview and fight cannot disagree about the bow;
 *   * the bow layer is gender-variant independent, so a gender selection cannot break it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { humanIdleResolution } from "@/lib/human-battle-idle";
import {
  generatedAttackClipId,
  generatedFrameClipId,
  generatedHumanCharacterFromRules,
  generatedHumanLinesForFrame,
} from "@/lib/generated-battle-view";
import { HUMAN_CLIPS } from "@/lib/human-battle-animation";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const FIXTURES = path.join(WORKSPACE, "RE-evidence", "20260921-battle-ship", "fixtures");

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

/** A PNG`s own pixel size, straight out of its IHDR - no image library in the check. */
const pngSize = (assetUrl) => {
  const bytes = readFileSync(path.join(APP, "public", assetUrl.replace(/^\//, "")));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

const rules = JSON.parse(readFileSync(path.join(APP, "public", "character_sprites", "character-rules.json"), "utf8"));
const partRules = { spriteBase: rules.spriteBase, dirs: rules.dirs };
const fixture = JSON.parse(readFileSync(path.join(FIXTURES, "champion-bow-loadout.json"), "utf8"));
const stageSource = readFileSync(path.join(APP, "src", "components", "native-human-body.tsx"), "utf8");

const fixtureUnit = (caseFixture, weaponId) => ({
  unitId: "fixture", entityId: 1, side: "ally", rosterIndex: 0, name: "fixture", human: true, monsterId: null, kind: "human",
  jobId: caseFixture.jobId, rank: caseFixture.rank, gender: caseFixture.gender, weaponId, shieldId: null,
  weaponMotion: null, skillIds: [], invocationLevels: [], initialCell: [0, 6], initialGrid: 0, startHp: 1, startMp: 1, maxHp: 1, maxMp: 1,
  animationCoverage: "FULL", coverageNotes: [],
});

/** The weapon layer of one drawn frame, or null. */
const weaponDraw = (character, lines) => humanIdleResolution(character, partRules, lines).draws.find((draw) => draw.part === "weapon") ?? null;

/** The shared loadout renderer`s own OPT slot rule, replayed for a static pose (no canvas needed). */
const previewWeaponSlot = (poseName, stem, cellW, cellH) => {
  const entry = rules.dirs.weapon.opts[stem];
  const ops = rules.poses[poseName]?.[0] ?? [];
  const op = ops.find((candidate) => candidate.type === 11);
  if (!entry || !op) return null;
  const slotKey = `${op.v},${op.u}`;
  const slot = entry.slots[slotKey] ?? (op.v !== 0 ? entry.slots[`0,${op.u}`] : undefined);
  if (!slot) return null;
  return {
    poseName,
    slotKey: Object.keys(entry.slots).find((key) => entry.slots[key] === slot) ?? slotKey,
    src: [slot.srcX, slot.srcY, slot.w, slot.h],
    dest: [slot.destX, slot.destY],
    trans: [op.ox, op.oy],
    cell: [cellW, cellH],
  };
};

let reported = null;

for (const caseFixture of fixture.cases) {
  const { label } = caseFixture;
  const unit = fixtureUnit(caseFixture, caseFixture.weaponId);
  const character = generatedHumanCharacterFromRules(unit, rules);
  checkTrue(`${label}: the loadout resolves to a native 17-slot character`, Boolean(character), "generatedHumanCharacterFromRules returned null");
  if (!character) continue;

  /* 1. the equipped weapon slot carries the canonical bow image, not a guess */
  check(`${label}: weapon slot imgIds[11] is the canonical bow image`, character.imgIds[11], caseFixture.image);
  check(`${label}: no shield image for this loadout`, character.imgIds[12], -2);
  const sheet = rules.dirs.weapon.inf.img[String(character.imgIds[11])];
  check(`${label}: the image index names the bow sheet`, sheet, caseFixture.sheet);
  const stem = sheet.replace(/\.[^.]*$/, "");
  const entry = rules.dirs.weapon.opts[stem];
  checkTrue(`${label}: the bow sheet has a baked OPT grid`, Boolean(entry), `${sheet} has no OPT entry`);
  if (!entry) continue;
  const size = pngSize(`/character_sprites/weapon/${sheet}`);
  check(`${label}: the bow PNG is the shipped sheet`, size, caseFixture.png);
  check(`${label}: the OPT cell is the SEB record's own cell`, [entry.cellW, entry.cellH], [60, 60]);

  /* 2. the attacking fighter really plays the bow clip */
  check(`${label}: weapon motion ${caseFixture.motion} selects ${caseFixture.clipId}`, generatedAttackClipId(caseFixture.motion), caseFixture.clipId);
  check(
    `${label}: an attacking bow fighter plays the bow clip even when the runner asked for another`,
    generatedFrameClipId({ ...unit, weaponMotion: caseFixture.motion }, { tick: 0, visual: "attacking", clipId: "equipWaitUp", clipFrame: 0, state: 4, stateTick: 0 }),
    caseFixture.clipId,
  );

  /* 3. every attack frame composes the bow through its own OPT cell crop */
  const clip = HUMAN_CLIPS[caseFixture.clipId];
  const frames = [];
  for (let frame = 0; frame < clip.maxFrame; frame += 1) {
    const lines = generatedHumanLinesForFrame({ tick: 0, visual: "attacking", clipId: caseFixture.clipId, clipFrame: frame, state: 4, stateTick: 0 }, 0, caseFixture.clipId) ?? [];
    const draw = weaponDraw(character, lines);
    // The clip carries the equipped item on its own weapon line (texId 11); the shield slot line
    // shares the resource group but resolves to -2 for this loadout, so match the record to the draw.
    const record = draw ? lines.find((line) => line.line === draw.line) ?? null : null;
    frames.push({
      frame,
      record: record ? { u: record.u, v: record.v, w: record.w, h: record.h, trans: [record.transX, record.transY] } : null,
      draw: draw ? { file: draw.file, src: draw.src, dest: draw.dest, trans: [draw.transX, draw.transY], cell: [draw.cellRow, draw.cellColumn], tex: draw.tex } : null,
    });
  }
  checkTrue(`${label}: every attack frame draws the bow on the weapon line`, frames.every((frame) => frame.draw && frame.record), JSON.stringify(frames.filter((frame) => !frame.draw || !frame.record).map((frame) => frame.frame)));
  checkTrue(
    `${label}: every drawn bow crop stays inside the real sheet`,
    frames.every((frame) => frame.draw.src.w > 0 && frame.draw.src.h > 0 && frame.draw.src.x >= 0 && frame.draw.src.y >= 0 && frame.draw.src.x + frame.draw.src.w <= size[0] && frame.draw.src.y + frame.draw.src.h <= size[1]),
    JSON.stringify(frames.map((frame) => frame.draw.src)),
  );
  checkTrue(
    `${label}: every drawn bow crop stays inside the SEB record's own 60x60 cell`,
    frames.every((frame) => frame.draw.dest.x >= 0 && frame.draw.dest.y >= 0 && frame.draw.dest.x + frame.draw.src.w <= frame.record.w && frame.draw.dest.y + frame.draw.src.h <= frame.record.h),
    JSON.stringify(frames.map((frame) => [frame.draw.dest, frame.draw.src.w, frame.draw.src.h, frame.record.w, frame.record.h])),
  );
  checkTrue(
    `${label}: the bow keeps its own crop size instead of being stretched over the SEB cell`,
    frames.every((frame) => frame.draw.src.w < frame.record.w && frame.draw.src.h < frame.record.h),
    JSON.stringify(frames.map((frame) => [frame.draw.src.w, frame.draw.src.h, frame.record.w, frame.record.h])),
  );
  checkTrue(
    `${label}: the stage paints the crop 1:1 (no scaling in the DOM contract)`,
    /width:\s*draw\.src\.w/.test(stageSource) && /height:\s*draw\.src\.h/.test(stageSource) && /left:\s*-draw\.src\.x/.test(stageSource) && /top:\s*-draw\.src\.y/.test(stageSource) && /maxWidth:\s*"none"/.test(stageSource),
    "native-human-body.tsx no longer copies the OPT crop at its natural size",
  );
  checkTrue(
    `${label}: the OPT cell the battle picks is the cell the SEB crop names`,
    frames.every((frame) => frame.draw.cell[0] === frame.record.v / entry.cellH && frame.draw.cell[1] === frame.record.u / entry.cellW),
    JSON.stringify(frames.map((frame) => [frame.draw.cell, frame.record.u, frame.record.v])),
  );
  checkTrue(
    `${label}: the bow's drawn geometry changes across the clip (the attack is animated)`,
    new Set(frames.map((frame) => JSON.stringify([frame.draw.src.x, frame.draw.src.y, frame.draw.src.w, frame.draw.src.h, frame.draw.dest.x, frame.draw.dest.y]))).size > 1,
    JSON.stringify(frames.map((frame) => [frame.draw.src.x, frame.draw.dest.x])),
  );

  /* 4. the shared loadout preview's static pose must resolve the same OPT cell crop as the fight */
  const battleFrame0 = frames.find((frame) => frame.draw && frame.draw.cell[0] === 0 && frame.draw.cell[1] === 0)?.draw ?? null;
  checkTrue(`${label}: the attack clip has a frame on OPT cell 0,0`, Boolean(battleFrame0), JSON.stringify(frames.map((frame) => frame.draw.cell)));
  for (const poseName of ["equip_wait_right.seb", "equip_wait_up.seb"]) {
    const preview = previewWeaponSlot(poseName, stem, entry.cellW, entry.cellH);
    checkTrue(`${label}: the loadout preview pose ${poseName} draws the bow`, Boolean(preview), "no weapon op in the baked pose");
    if (!preview || !battleFrame0) continue;
    check(
      `${label}: ${poseName} preview crop equals the battle layer's cell-0,0 crop`,
      preview.src,
      [battleFrame0.src.x, battleFrame0.src.y, battleFrame0.src.w, battleFrame0.src.h],
    );
    check(
      `${label}: ${poseName} OPT destination equals the battle layer's cell-0,0 destination`,
      preview.dest,
      [battleFrame0.dest.x, battleFrame0.dest.y],
    );
    check(
      `${label}: ${poseName} SEB anchor equals the battle layer's SEB translation`,
      preview.trans,
      battleFrame0.trans,
    );
  }

  if (!reported) {
    reported = {
      loadout: `${unit.jobId} ${unit.rank}`,
      weapon: caseFixture.name,
      equipId: caseFixture.weaponId,
      imageIndex: character.imgIds[11],
      sheet,
      png: size,
      optCell: [entry.cellW, entry.cellH],
      frame0: battleFrame0 ? { src: battleFrame0.src, dest: battleFrame0.dest, trans: battleFrame0.trans, optCell: battleFrame0.cell, paintedBox: [battleFrame0.trans[0] + battleFrame0.dest.x, battleFrame0.trans[1] + battleFrame0.dest.y, battleFrame0.src.w, battleFrame0.src.h] } : null,
    };
  }
}

/* 5. the bow layer is gender-variant independent, so it cannot be broken by a gender selection */
const bowLayerForGender = (gender) => {
  const caseFixture = fixture.cases[0];
  const unit = fixtureUnit({ ...caseFixture, gender }, caseFixture.weaponId);
  const character = generatedHumanCharacterFromRules(unit, rules);
  if (!character) return null;
  const lines = generatedHumanLinesForFrame({ tick: 0, visual: "attacking", clipId: caseFixture.clipId, clipFrame: 0, state: 4, stateTick: 0 }, 0, caseFixture.clipId) ?? [];
  const draw = weaponDraw(character, lines);
  return draw ? { file: draw.file, src: draw.src, dest: draw.dest, trans: [draw.transX, draw.transY] } : null;
};
check("both genders compose the identical bow layer", bowLayerForGender(0), bowLayerForGender(1));

const failed = checks.filter((entry) => !entry.passed);
process.stdout.write(`${JSON.stringify({ fixture: fixture.note, checks: checks.length, passed: checks.length - failed.length, failed: failed.length, geometry: reported, failures: failed }, null, 2)}\n`);
process.exit(failed.length === 0 ? 0 : 1);
