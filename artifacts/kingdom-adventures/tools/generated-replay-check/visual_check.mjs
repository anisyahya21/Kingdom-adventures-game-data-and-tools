/**
 * Generated-replay VISUAL checks - pure Node, no bundler, no browser, no server.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/generated-replay-check/visual_check.mjs [--out DIR]
 *
 * Runs the real site modules against REAL stored replays (written by the authoritative Python runner)
 * plus small synthetic payloads for the event shapes the stored fixtures do not cover. It verifies the
 * visual pass directly:
 *   * the chest counter comes from the runner's own `prize` events and every drawn chest sprite is the
 *     canonical treasure icon for that id (a missing/unknown id draws no sprite, never a guessed one);
 *   * the queued count is kept separate from the runner's certified entitlement, and an absent
 *     entitlement is reported as unknown rather than as zero;
 *   * stage effects are emitted only for real runner events: hits carry the recovered damage-number
 *     style (critical row on a crit, attacker side otherwise), `hit:false` draws Missed and no number,
 *     `attack_batch` bookkeeping draws nothing, and only a `release` with `used:true` draws a skill
 *     balloon (with the canonical skill name/icon);
 *   * the invocation level shown for a release is joined from the replay unit's own declared
 *     `skillIds` / `invocationLevels` slot (BUILDER-CONTRACT.md section 3) and is labelled with the
 *     contract's Low / Normal / High words - never guessed, never a raw index;
 *   * consumable rows take support/scope/stock from the interaction helpers and only mark a row
 *     "usable now" when the recovered usable condition actually holds;
 *   * the equipped-preview inputs follow BUILDER-CONTRACT.md (gender -> variant, weapon/shield names).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGeneratedStageOverlays,
  generatedChestDrops,
  generatedChestSummary,
  generatedChestsAt,
  generatedConsumableRows,
  generatedEquippedPreview,
  generatedFrameIndexForTick,
  generatedImpactFrame,
  generatedImpactScale,
  generatedReleaseInvocation,
  generatedSkillIdentity,
  generatedSkillReleases,
} from "@/lib/generated-battle-visuals";
import { buildGeneratedFrames, generatedFinishOutcome } from "@/lib/generated-battle-view";
import { invocationLabel } from "@/lib/battle-team-draft";
import { EQUIPMENT_BY_ID } from "@/lib/battle-setup";
import { renderSkillName } from "@/lib/battle-legality";
import { getSkillIcon } from "@/lib/skill-icons";
import { getItemIcon } from "@/lib/equipment-icons";
import { TREASURE_BY_ID } from "@/lib/treasure-lookup";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const REPLAYS = path.join(WORKSPACE, "RE-evidence", "20260919-configurable-battle-setup", "run-battle-16.4", "replays");
const PUBLIC = path.join(APP, "public");

/** A PNG's own pixel size, straight out of its IHDR - no image library in the check. */
const pngSize = (assetUrl) => {
  const bytes = readFileSync(path.join(PUBLIC, assetUrl.replace(/^\//, "")));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(tmpdir(), "ka-generated-visual-check");

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

const replay = (file) => JSON.parse(readFileSync(path.join(REPLAYS, file), "utf8"));

function syntheticReplay({ events = [], rewardEntitlement } = {}) {
  const unit = (unitId, side, rosterIndex, cell, human) => ({
    unitId, side, rosterIndex, entityId: rosterIndex + 1, name: unitId, kind: human ? "human" : "monster",
    human, monsterId: human ? null : 116, weaponId: 0, skillIds: [], invocationLevels: [],
    grid: 0, column: cell[0], row: cell[1], cell, startHp: 100, startMp: 50,
    parameters: { "10": { raw: { rawMax: 100 } }, "11": { raw: { rawMax: 50 } } },
  });
  const last = events.length ? events[events.length - 1] : null;
  return {
    schema: "ka-battle-replay-1",
    source: { exporter: "synthetic", runner: "synthetic", scenarioSchema: "", note: "" },
    setupSummary: { encounterId: 1, defeatCount: 0, mathSeed: 1, libSeed: 1, tickLimit: 100, holyHerbStock: 2,
      items: { "Recovery Potion (L)": { bonusCategory: 3, bonusType: 0, bonusMinValue: 50, bonusMaxValue: 50 },
              "Recovery Potion (S)": { bonusCategory: 3, bonusType: 1, bonusMinValue: 50, bonusMaxValue: 50 } },
      itemStock: { "Recovery Potion (L)": 2, "Recovery Potion (S)": 1 },
      inputs: [], ownUnitCount: 2, enemyUnitCount: 1, prePlacement: [] },
    encounter: { encounterId: 1, title: null, level: 1, defeatCount: 0, followerSelectionDraws: 0, formationOrder: [], ownFormationOrder: [], enemyMonsterIds: [] },
    units: [unit("ally:0", "ally", 0, [0, 6], true), unit("ally:1", "ally", 1, [1, 6], true), unit("enemy:0", "enemy", 0, [0, 5], false)],
    ticks: last ? last.tick : 0,
    events,
    finalState: {
      verdict: 1, battleState: 1, battleFrame: last ? last.tick : 0, ticks: last ? last.tick : 0,
      stopReason: "synthetic", censored: false, prizeCallbacks: 0, mathDraws: 0, libDraws: 0,
      rngFinalState: null, retainedRewards: null, initializationMode: "synthetic", cellsDerivedFrom: "synthetic",
      units: [
        { unitId: "ally:0", entityId: 1, side: "ally", rosterIndex: 0, hp: 100, mp: 50, state: 1, stateName: "waiting", commands: 0, cell: [0, 6] },
        { unitId: "ally:1", entityId: 2, side: "ally", rosterIndex: 1, hp: 80, mp: 50, state: 1, stateName: "waiting", commands: 0, cell: [1, 6] },
        { unitId: "enemy:0", entityId: 3, side: "enemy", rosterIndex: 0, hp: 0, mp: 0, state: 8, stateName: "leaving", commands: 0, cell: [0, 5] },
      ],
      ...(rewardEntitlement ? { rewardEntitlement } : {}),
    },
    catalog: { stateNames: {}, skills: {}, equipment: {} },
    metrics: {}, holyHerbRemaining: 1, itemRemaining: { "Recovery Potion (L)": 2, "Recovery Potion (S)": 1 },
    receipts: null, runnerLimits: [], notes: [], missing: [],
  };
}

function frameUnitsOf(replayValue) {
  const frames = buildGeneratedFrames(replayValue);
  return frames[frames.length - 1].units;
}

const RL = replay("RL.json");
const F14 = replay("F14.json");
const RD = replay("RD.json");
const S = replay("S.json");

/* ---------------- chest counter ---------------- */

check("no prize events means no queued chests (RL)", generatedChestDrops(RL), []);
check("the live counter stays 0 with no prize events (RL)", generatedChestsAt(generatedChestDrops(RL), 100000), 0);

/* canonical ids the treasure catalog really knows */
const knownTreasures = [47, 50].filter((id) => TREASURE_BY_ID.has(id));
checkTrue("the fixture treasure ids exist in the canonical treasure catalog", knownTreasures.length === 2, `${knownTreasures.join(",")}`);

const prizeReplay = syntheticReplay({
  events: [
    { seq: 0, tick: 10, phase: "fighters", kind: "state", targetUnitId: "enemy:0", new: 8, stateName: "leaving" },
    { seq: 1, tick: 10, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[0] },
    { seq: 2, tick: 20, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[1] },
  ],
});
const drops = generatedChestDrops(prizeReplay);
check("one drop per prize event, in seq order", drops.map((drop) => [drop.seq, drop.tick, drop.treasureId]),
  [[1, 10, knownTreasures[0]], [2, 20, knownTreasures[1]]]);
check("each drop carries the canonical treasure name and sprite path",
  drops.map((drop) => [drop.name, drop.icon]),
  knownTreasures.map((id) => [TREASURE_BY_ID.get(id).name, TREASURE_BY_ID.get(id).icon]));
checkTrue("every drawn chest sprite file exists on disk",
  drops.every((drop) => drop.icon && existsSync(path.join(PUBLIC, drop.icon.replace(/^\//, "").split("?")[0]))),
  JSON.stringify(drops.map((drop) => drop.icon)));
check("the live counter is 0 before the first drop", generatedChestsAt(drops, 9), 0);
check("the live counter counts the drop at its own tick", generatedChestsAt(drops, 10), 1);
check("the live counter reaches 2 after the second drop", generatedChestsAt(drops, 20), 2);
check("the live counter does not invent drops after the last one", generatedChestsAt(drops, 9999), 2);

const unknownPrize = generatedChestDrops(syntheticReplay({
  events: [
    { seq: 0, tick: 5, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: 999999 },
    { seq: 1, tick: 6, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: null },
  ],
}));
check("an unknown or absent treasure id yields no name and no sprite",
  unknownPrize.map((drop) => [drop.name, drop.icon]), [[null, null], [null, null]]);

const baseNoEntitlement = generatedChestSummary(generatedFinishOutcome(syntheticReplay({
  events: [{ seq: 0, tick: 10, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[0] }],
})), generatedChestDrops(syntheticReplay({
  events: [{ seq: 0, tick: 10, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[0] }],
})));
check("without an entitlement report the credited count is unknown, not zero", baseNoEntitlement.awarded, null);
checkTrue("the queued count is still reported without an entitlement", baseNoEntitlement.queued === 1, JSON.stringify(baseNoEntitlement));

const entitledReplay = syntheticReplay({
  events: [{ seq: 0, tick: 10, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[0] }],
  rewardEntitlement: {
    certificateId: "synthetic", certificate: { holds: true, frame: 9 },
    battleVerdict: 1, victoryRequired: true, pendingChestCount: 1, capturedPendingAtVerdict: 1,
    awardedChestCount: 1, awardedChestCountBasis: "synthetic", rewardCountSettled: true, rewardCountReason: "synthetic",
    postCertificateQueueChanged: false, postCertificateQueueDelta: 0,
  },
});
const entitledSummary = generatedChestSummary(generatedFinishOutcome(entitledReplay), generatedChestDrops(entitledReplay));
check("a certified entitlement is reported as the credited count", entitledSummary.awarded, 1);
check("the queued and credited counts stay separate fields", [entitledSummary.queued, entitledSummary.pending], [1, 1]);
checkTrue("the note never calls a chest collected inventory", !/inventory/i.test(entitledSummary.note), entitledSummary.note);

const uncertifiedSummary = generatedChestSummary(generatedFinishOutcome(syntheticReplay({
  events: [{ seq: 0, tick: 10, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[0] }],
  rewardEntitlement: {
    certificateId: "synthetic", certificate: { holds: false, frame: null },
    battleVerdict: 1, victoryRequired: true, pendingChestCount: 1, capturedPendingAtVerdict: null,
    awardedChestCount: null, awardedChestCountBasis: "synthetic", rewardCountSettled: false, rewardCountReason: "synthetic",
    postCertificateQueueChanged: true, postCertificateQueueDelta: 1,
  },
})), generatedChestDrops(syntheticReplay({
  events: [{ seq: 0, tick: 10, phase: "fighters", kind: "prize", targetUnitId: "enemy:0", treasureId: knownTreasures[0] }],
})));
check("an uncertified queue leaves the credited count unknown and the drop provisional",
  [uncertifiedSummary.awarded, uncertifiedSummary.queued], [null, 1]);
checkTrue("the uncertified note says the queued count is provisional", /provisional/i.test(uncertifiedSummary.note), uncertifiedSummary.note);

/* ---------------- stage overlays ---------------- */

const positionOf = (replayValue) => {
  const cells = new Map(replayValue.units.map((unit) => [unit.unitId, unit.cell]));
  const sides = new Map(replayValue.units.map((unit) => [unit.unitId, unit.side]));
  return {
    anchorOf: (unitId) => {
      const cell = unitId ? cells.get(unitId) : undefined;
      return cell ? { left: `${cell[0] * 24}px`, top: `${cell[1] * 12}px` } : null;
    },
    sideOf: (unitId) => (unitId ? sides.get(unitId) ?? null : null),
  };
};

/* real replay: every overlay must come from a real event, and attacks must carry the recovered style */
const f14Events = F14.events;
const f14Positions = positionOf(F14);
/* RD carries both an ally attacker and an enemy attacker, so the number-row rule can be checked */
const rdPositions = positionOf(RD);
const f14Attacks = f14Events.filter((event) => event.kind === "attack" && event.tick === 179);
const f14Crit = f14Attacks.find((event) => event.critical === true);
checkTrue("the F14 fixture has a real critical hit at tick 179", Boolean(f14Crit), "no critical attack at 179");
const critOverlays = buildGeneratedStageOverlays({ events: f14Attacks, ...f14Positions }).filter((item) => item.key.includes(String(f14Crit.seq)));
check("a critical hit draws its damage number with the critical (yellow) style",
  critOverlays.filter((item) => item.kind === "damage").map((item) => [item.amount, item.style]), [[f14Crit.damage, "critical"]]);
check("a critical hit draws the recovered Critical Hit text",
  critOverlays.filter((item) => item.kind === "combat-text").map((item) => item.label), ["Critical Hit"]);
check("a critical hit scales the recovered impact to 1.5 (CONFIRMED CreateEffect note: 150)",
  critOverlays.filter((item) => item.kind === "impact").map((item) => item.scale), [1.5]);
checkTrue("a critical hit also draws the attacker-to-target arrow",
  critOverlays.some((item) => item.kind === "arrow"), JSON.stringify(critOverlays));

const missed = F14.events.find((event) => event.kind === "attack" && event.hit === false);
checkTrue("the F14 fixture has a real miss", Boolean(missed), "no miss in F14");
const missOverlays = buildGeneratedStageOverlays({ events: [missed], ...f14Positions });
check("a miss draws the recovered Missed text and no damage number",
  [missOverlays.filter((item) => item.kind === "combat-text").map((item) => item.label), missOverlays.filter((item) => item.kind === "damage").length],
  [["Missed"], 0]);

/* the batch record is bookkeeping: it must not double-draw an attack */
const batchEvent = F14.events.find((event) => event.kind === "attack_batch");
checkTrue("the F14 fixture has an attack_batch record", Boolean(batchEvent), "no attack_batch in F14");
check("an attack_batch record draws no overlay at all",
  buildGeneratedStageOverlays({ events: [batchEvent], ...f14Positions }).length, 0);

/* hostile attacks use the enemy number row, friendly attacks the ally row */
const normalAttack = (replayValue, prefix) =>
  replayValue.events.find(
    (event) => event.kind === "attack" && event.attackerUnitId?.startsWith(prefix) && event.hit !== false && !event.critical,
  );
const allyAttack = normalAttack(RD, "ally:");
const enemyAttack = normalAttack(RD, "enemy:");
checkTrue("the RD fixture has a plain ally attack and a plain enemy attack", Boolean(allyAttack && enemyAttack), "missing plain attacks");
check("an ally attacker uses the ally number row",
  buildGeneratedStageOverlays({ events: [allyAttack], ...rdPositions }).filter((item) => item.kind === "damage").map((item) => item.style), ["ally"]);
check("an enemy attacker uses the enemy number row",
  buildGeneratedStageOverlays({ events: [enemyAttack], ...rdPositions }).filter((item) => item.kind === "damage").map((item) => item.style), ["enemy"]);

/* heals use the healing number */
const healEvent = F14.events.find((event) => event.kind === "heal" && typeof event.amount === "number" && event.targetUnitId);
checkTrue("the F14 fixture has a real heal with an amount", Boolean(healEvent), "no heal in F14");
check("a heal draws the healing number at the target",
  buildGeneratedStageOverlays({ events: [healEvent], ...f14Positions }).filter((item) => item.kind === "heal").map((item) => item.amount),
  [healEvent.amount]);
const f14Hits = f14Events.filter((event) => event.kind === "attack" && event.hit !== false);
check("the whole F14 timeline draws one impact per landed attack and none for a miss",
  buildGeneratedStageOverlays({ events: f14Events, ...f14Positions }).filter((item) => item.kind === "impact").length,
  f14Hits.length);
check("the whole F14 timeline draws no overlay for its attack_batch records",
  buildGeneratedStageOverlays({ events: f14Events.filter((event) => event.kind === "attack_batch"), ...f14Positions }).length, 0);

/* an event whose fighter has no anchor draws nothing */
check("an event for an unknown fighter draws nothing",
  buildGeneratedStageOverlays({ events: [{ ...f14Attacks[0], attackerUnitId: "ally:999", targetUnitId: "ally:998" }], ...f14Positions }).length, 0);

/* ---------------- skill triggers ---------------- */

const releases = generatedSkillReleases(RL);
const realReleases = RL.events.filter((event) => event.kind === "release" && event.used === true && typeof event.skillId === "number");
check("one release entry per used release event", releases.length, realReleases.length);
checkTrue("every release keeps the runner's own tick and skill id",
  releases.every((release) => realReleases.some((event) => event.seq === release.seq && event.tick === release.tick && event.skillId === release.skillId)),
  JSON.stringify(releases.slice(0, 3)));
checkTrue("every skill name comes from the canonical catalog row, never invented",
  releases.every((release) => {
    const identity = generatedSkillIdentity(release.skillId);
    return identity ? release.name === renderSkillName({ nameText: identity.name, nameArg: "" }) || release.name === identity.name : release.name === null;
  }),
  JSON.stringify(releases.map((release) => [release.skillId, release.name]).slice(0, 5)));
const iconReleases = releases.filter((release) => release.icon !== null);
checkTrue("each resolved skill icon is the canonical skill-icon URL", iconReleases.every((release) => /^\/website_icons\/skills\/skill_icon_\d+\.png/.test(release.icon)), JSON.stringify(iconReleases.slice(0, 3)));
checkTrue("the fixture has at least one skill with a canonical icon", iconReleases.length > 0, `releases ${releases.length}`);

const usedRelease = realReleases[0];
check("a used release draws the skill balloon with the canonical identity",
  buildGeneratedStageOverlays({ events: [usedRelease], ...positionOf(RL) }).map((item) => [item.kind, item.skillId, item.name, item.icon]),
  [["skill", usedRelease.skillId, generatedSkillIdentity(usedRelease.skillId).name, generatedSkillIdentity(usedRelease.skillId).icon]]);
check("an unused release draws nothing",
  buildGeneratedStageOverlays({ events: [{ ...usedRelease, used: false }], ...positionOf(RL) }).length, 0);
const failedInvocation = RL.events.find((event) => event.kind === "invocation" && event.passed === false);
checkTrue("the RL fixture has a failed invocation check", Boolean(failedInvocation), "no failed invocation in RL");
check("a failed invocation check draws no skill balloon",
  buildGeneratedStageOverlays({ events: [failedInvocation], ...positionOf(RL) }).length, 0);

/* the declared invocation level behind a release (BUILDER-CONTRACT.md section 3) */

const balloonItems = buildGeneratedStageOverlays({ events: [usedRelease], ...positionOf(RL) })
  .filter((item) => item.kind === "skill");
check("the skill balloon carries the releasing unit", balloonItems.map((item) => item.casterUnitId), [usedRelease.casterUnitId]);

const declaredRelease = generatedSkillReleases(RL).find((release) => release.casterUnitId === "enemy:11") ?? usedRelease;
check("the declared invocation level is joined from the replay unit's own slot",
  generatedReleaseInvocation(declaredRelease, RL.units), 1);
check("a slot that names another skill resolves no level",
  generatedReleaseInvocation({ ...declaredRelease, skillId: declaredRelease.skillId + 1 }, RL.units), null);
check("the event's own level wins over the join",
  generatedReleaseInvocation({ ...declaredRelease, invocationLevel: 0 }, RL.units), 0);
check("an unknown caster resolves no level",
  generatedReleaseInvocation({ ...declaredRelease, casterUnitId: "enemy:999" }, RL.units), null);
check("an unplaced release resolves its single matching declaration",
  generatedReleaseInvocation({ invocationLevel: null, casterUnitId: "ally:0", skillId: 37, slot: null }, replay("RD.json").units), 1);
check("a skill declared in two slots without a reported slot resolves no level",
  generatedReleaseInvocation({ invocationLevel: null, casterUnitId: "ally:0", skillId: 8, slot: null },
    [{ unitId: "ally:0", skillIds: [8, 8], invocationLevels: [1, 2] }]), null);
check("the level is labelled with the builder contract's own words",
  [0, 1, 2].map((level) => invocationLabel(level)), ["High", "Normal", "Low"]);

/* after a branch the clock is re-anchored on the clicked tick, not reset */

const rlFrames = buildGeneratedFrames(RL);
const branchTick = generatedSkillReleases(RL)[0].tick;
const branchIndex = generatedFrameIndexForTick(rlFrames, branchTick);
check("the clicked tick is found in the new timeline", rlFrames[branchIndex].tick, branchTick);
check("a tick past the last frame clamps to the last frame",
  generatedFrameIndexForTick(rlFrames, rlFrames[rlFrames.length - 1].tick + 500), rlFrames.length - 1);
check("a tick before the first frame clamps to the first frame", generatedFrameIndexForTick(rlFrames, -50), 0);
check("an empty frame list has no index", generatedFrameIndexForTick([], 3), -1);

/* ---------------- consumables ---------------- */

const sRows = generatedConsumableRows({ replay: S, tick: 0, scenario: undefined, frameUnits: frameUnitsOf(S) });
const herb = sRows.find((row) => row.key === "holy_herb");
checkTrue("the holy-herb fight shows a holy-herb row", Boolean(herb), JSON.stringify(sRows));
check("the herb row reads the declared stock from the scenario", [herb.parameter, herb.parameterName, herb.declaredStock, herb.supported], [11, "MP", 3, true]);
check("the herb icon is the canonical item sprite", herb.icon, getItemIcon("Holy Herb"));
checkTrue("the canonical herb sprite exists on disk", existsSync(path.join(PUBLIC, herb.icon.replace(/^\//, "").split("?")[0])), herb.icon);

const stockReplay = syntheticReplay({
  events: [
    { seq: 0, tick: 5, phase: "before_fighters", kind: "battle_item", item: "holy_herb", used: true, remaining: 1, parameter: 11, targetUnitIds: ["ally:0"] },
    { seq: 1, tick: 5, phase: "before_fighters", kind: "resource_change", targetUnitId: "ally:0", parameter: 11, before: 10, after: 50, max: 50, sourceItem: "holy_herb" },
  ],
});
const stockRows = generatedConsumableRows({ replay: stockReplay, tick: 5, frameUnits: frameUnitsOf(stockReplay) });
const stockHerb = stockRows.find((row) => row.key === "holy_herb");
check("stock at a tick comes from the runner's own remaining value", [stockHerb.declaredStock, stockHerb.stockAtTick], [2, 1]);
const stockBefore = generatedConsumableRows({ replay: stockReplay, tick: 4, frameUnits: frameUnitsOf(stockReplay) }).find((row) => row.key === "holy_herb");
check("stock before the use is still the declared stock", stockBefore.stockAtTick, 2);

const potionRows = generatedConsumableRows({ replay: syntheticReplay({}), tick: 0, frameUnits: frameUnitsOf(syntheticReplay({})) });
const largePotion = potionRows.find((row) => row.key === "Recovery Potion (L)");
const smallPotion = potionRows.find((row) => row.key === "Recovery Potion (S)");
check("an all-resident declared item is supported", [largePotion.supported, largePotion.scope, largePotion.parameter], [true, "all", 10]);
checkTrue("a single-resident declared item is disabled with a reason",
  smallPotion.supported === false && typeof smallPotion.disabledReason === "string" && smallPotion.disabledReason.length > 20,
  JSON.stringify(smallPotion));
check("the single-resident row keeps its canonical sprite for the disabled icon", smallPotion.icon, getItemIcon("Recovery Potion (S)"));

/* the usable condition: full MP means the herb is not offered, low MP means it is */
const fullFrame = { "ally:0": { hp: 100, mp: 50, maxHp: 100, maxMp: 50, state: 1 } };
const lowFrame = { "ally:0": { hp: 100, mp: 20, maxHp: 100, maxMp: 50, state: 1 } };
const leavingFrame = { "ally:0": { hp: 100, mp: 20, maxHp: 100, maxMp: 50, state: 8 } };
const herbAtFull = generatedConsumableRows({ replay: S, tick: 0, frameUnits: fullFrame }).find((row) => row.key === "holy_herb");
const herbAtLow = generatedConsumableRows({ replay: S, tick: 0, frameUnits: lowFrame }).find((row) => row.key === "holy_herb");
const herbWhileLeaving = generatedConsumableRows({ replay: S, tick: 0, frameUnits: leavingFrame }).find((row) => row.key === "holy_herb");
check("a full-MP party is not highlighted as usable", [herbAtFull.usableAtTick, herbAtFull.usableReason], [false, "every fighter is already at full MP"]);
check("a party below full MP is highlighted as usable now", [herbAtLow.usableAtTick, herbAtLow.usableReason], [true, "a fighter is below full MP"]);
check("a leaving fighter is not an eligible recipient", herbWhileLeaving.usableAtTick, false);
const endedReplay = { ...S, finalState: { ...S.finalState, verdictTick: 10 } };
const herbAfterEnding = generatedConsumableRows({ replay: endedReplay, tick: 10, frameUnits: lowFrame }).find((row) => row.key === "holy_herb");
check("items cannot be used after the verdict even with missing MP", [herbAfterEnding.usableAtTick, herbAfterEnding.usableReason], [false, "The battle has ended."]);

/* ---------------- equipped preview (BUILDER-CONTRACT section 2) ---------------- */

const guardWeapon = [...EQUIPMENT_BY_ID.values()].find((entry) => entry.id > 0 && entry.motion && entry.name);
const previewUnit = {
  human: true, jobId: "Guard", rank: "D", gender: 1, weaponId: guardWeapon.id, shieldId: null,
};
const preview = generatedEquippedPreview(previewUnit);
check("a female fighter renders with variant 2", preview.variant, 2);
check("the preview keeps the builder's job name and rank", [preview.jobName, preview.rank], ["Guard", "D"]);
check("the preview names the equipped weapon from the recovered equipment catalog", preview.weaponName, guardWeapon.name);
check("no shield means no shield sprite name", preview.shieldName, null);
check("a male fighter renders with variant 1", generatedEquippedPreview({ ...previewUnit, gender: 0 }).variant, 1);
check("a human without a job identity has no preview inputs", generatedEquippedPreview({ human: true, weaponId: 0 }), null);
check("a monster has no equipped preview", generatedEquippedPreview({ human: false, jobId: "Guard", weaponId: 0 }), null);

/* ---------------- the impact effect: one recovered frame with its own lifetime ---------------- */

/*
 * The impact is the recovered `effect/effect_00` burst. Its SEB plays ten frames and its OPT says
 * the shipped 114x35 PNG is the optimizer's pack of all five cells, so the drawn effect must be one
 * cell crop that grows through its life - not the whole sheet (the reported "repeated large yellow
 * crosses") and not a one-tick flash.
 */
const hitEvent = { seq: 900, tick: 40, phase: "fighters", kind: "attack", attackerUnitId: "ally:0", targetUnitId: "enemy:0", hit: true, damage: 7, critical: false };
const critHitEvent = { ...hitEvent, seq: 901, damage: 12, critical: true };
const missHitEvent = { ...hitEvent, seq: 902, hit: false };
const impactPositions = {
  anchorOf: (unitId) => (unitId ? { left: "120px", top: "60px" } : null),
  sideOf: () => "ally",
};
/** the overlays a caller sees at `tick`, with the window covering the hit at tick 40 */
const impactsAt = (events, tick) =>
  buildGeneratedStageOverlays({
    events: events.filter((event) => event.tick === tick),
    ...impactPositions,
    impactEvents: events,
    impactTick: tick,
  }).filter((item) => item.kind === "impact");

check("a landed hit draws its impact on the tick it lands, at the effect's first frame",
  impactsAt([hitEvent], 40).map((item) => item.frame), [0]);
check("the impact keeps playing through the recovered ten frames",
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((elapsed) => impactsAt([hitEvent], 40 + elapsed).map((item) => item.frame)),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((frame) => [frame]));
check("the impact stops after its ten-frame lifetime",
  impactsAt([hitEvent], 50), []);
check("a hit that has not landed yet draws nothing",
  impactsAt([{ ...hitEvent, tick: 45 }], 40), []);
check("a miss never draws an impact, inside the window or out",
  [40, 45].map((tick) => impactsAt([missHitEvent], tick).length), [0, 0]);
check("a critical hit keeps the recovered 1.5 scale through its whole life",
  [40, 45, 49].map((tick) => impactsAt([critHitEvent], tick).map((item) => item.scale)), [[1.5], [1.5], [1.5]]);
check("a plain hit keeps the recovered 1.0 scale",
  generatedImpactScale(false), 1);
check("without a window a caller keeps the single-tick behaviour",
  buildGeneratedStageOverlays({ events: [hitEvent], ...impactPositions })
    .filter((item) => item.kind === "impact").map((item) => item.frame), [0]);
check("the impact window still draws every other overlay kind of its own tick",
  buildGeneratedStageOverlays({
    events: [{ ...hitEvent, tick: 45 }, { ...usedRelease, tick: 45 }],
    ...impactPositions,
    impactEvents: [hitEvent, { ...usedRelease, tick: 45 }],
    impactTick: 45,
  }).map((item) => item.kind).sort(),
  ["arrow", "damage", "impact", "skill"]);

/* the drawn cell: a growing crop of the real sheet, never the whole 114x35 pack */
const impactSheet = pngSize("/battle-assets/effects/impact-effect_00.png");
const impactFrames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((frame) => generatedImpactFrame(frame));
check("the shipped impact art really is the multi-cell pack (114x35)", impactSheet, [114, 35]);
checkTrue("every drawn impact frame stays inside the sheet it is cut from",
  impactFrames.every((frame) => frame.sourceX >= 0 && frame.sourceY >= 0
    && frame.sourceX + frame.width <= impactSheet[0] && frame.sourceY + frame.height <= impactSheet[1]),
  JSON.stringify(impactFrames));
checkTrue("no drawn impact frame is the whole sheet",
  impactFrames.every((frame) => frame.width < impactSheet[0]),
  JSON.stringify(impactFrames.map((frame) => [frame.width, frame.height])));
check("the burst grows through its recovered cells",
  impactFrames.map((frame) => [frame.width, frame.height]),
  [[12, 11], [12, 11], [18, 17], [18, 17], [28, 27], [28, 27], [32, 31], [32, 31], [36, 35], [36, 35]]);
check("every impact frame is centred on the target it hit",
  impactFrames.map((frame) => frame.centerX), Array(10).fill(0));
checkTrue("the burst never drifts off the target vertically",
  impactFrames.every((frame) => Math.abs(frame.centerY) <= 3),
  JSON.stringify(impactFrames.map((frame) => frame.centerY)));

/* ---------------- skill balloon markup: the label sits inside the banner ---------------- */

/*
 * The native balloon is one opaque speech bubble, so the skill name/invocation label belongs on the
 * banner. The reported defect was a second black pill under the balloon, which this guards against:
 * the label must be a descendant of the element that carries the balloon art.
 */
const replaySource = readFileSync(path.join(APP, "src", "components", "generated-battle-replay.tsx"), "utf8");
const skillBranchStart = replaySource.indexOf("const balloonFrame = item.side");
const skillBranchEnd = replaySource.indexOf("/* Chest strip", skillBranchStart);
const skillBranch = replaySource.slice(skillBranchStart, skillBranchEnd);
checkTrue("the skill branch was found in the stage overlay layer",
  skillBranchStart >= 0 && skillBranchEnd > skillBranchStart, `start \${skillBranchStart} end \${skillBranchEnd}`);
checkTrue("the skill balloon draws no second black pill",
  !/bg-black/.test(skillBranch), "a bg-black pill is still rendered in the skill branch");
checkTrue("the balloon frame and its label are both rendered",
  skillBranch.includes("data-skill-balloon-frame") && skillBranch.includes("data-skill-balloon-label"),
  "missing data-skill-balloon-frame / data-skill-balloon-label");
const labelAt = skillBranch.indexOf("data-skill-balloon-label");
const frameOpenAt = skillBranch.lastIndexOf("<div", skillBranch.indexOf("data-skill-balloon-frame"));
const frameToLabel = skillBranch.slice(frameOpenAt, labelAt);
check("no element closes between the banner frame's opening tag and the label",
  (frameToLabel.match(/<\/div>/g) ?? []).length, 0);
check("the label is the banner frame's own child element, not a sibling",
  (frameToLabel.match(/<div\b/g) ?? []).length, 2);
checkTrue("the banner is scaled with the sheet's own size instead of a wrapper transform",
  /backgroundSize/.test(skillBranch) && !/transform: "scale\(1\.35\)"/.test(skillBranch),
  "the balloon is still scaled by a wrapper transform");

/* ---------------- report ---------------- */

const failed = checks.filter((entry) => !entry.passed);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "visual-check.json"), JSON.stringify({ passed: checks.length - failed.length, total: checks.length, failed, checks }, null, 2) + "\n");
console.log(JSON.stringify({ passed: checks.length - failed.length, total: checks.length, failed: failed.map((entry) => entry.name), out: OUT }, null, 1));
if (failed.length > 0) process.exitCode = 1;
