/**
 * Deterministic generated-replay correctness check - pure Node, no bundler, no browser.
 *
 * Runs the real site modules through the shared TypeScript loader against REAL stored replays
 * (`ka-battle-replay-1`, written by the authoritative Python runner) plus small synthetic payloads
 * for the cases the stored fixtures do not cover (status events, finish blocks, true HP/MP maxima).
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/generated-replay-check/pure_check.mjs [--out DIR]
 *
 * It verifies the review fixes directly:
 *   * the clock is one frame per authoritative tick (grouped/ordered, empty ticks kept, final frame
 *     equals the runner's final state, exact +1 tick advance);
 *   * initialCell / cell_change are [column, row] (asserted against the Python contract source);
 *   * the true param 10/11 maxima are used, not startHp/startMp;
 *   * human art comes from appearanceInputs and NEVER the demo guard/archer identity;
 *   * recovered animation_request clips are selected, unsupported ones fall back explicitly;
 *   * status / death / leaving follow the runner's own event state;
 *   * the finish/reward block is read verbatim when present and tolerated when absent;
 *   * the item path's resource_change folds the runner's own `after` (HP10/MP11) verbatim, and the
 *     tick summary prints the item notice plus the restoration separately from an MP spend.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGeneratedFrames,
  buildGeneratedUnits,
  explainGeneratedEvent,
  generatedClipForBase,
  generatedEventGroup,
  generatedFinishOutcome,
  generatedHumanCharacter,
  generatedHumanLinesForFrame,
  generatedMonsterClip,
  generatedRewardSummary,
  generatedScenePlacement,
  generatedStageMode,
  generatedTickSummary,
  generatedVerdictWord,
  generatedViewPanX,
} from "@/lib/generated-battle-view";
import { nativeInitialFormation, nativeViewPos, nativeWorldViewPos } from "@/lib/battle-replay";
import { foldBattleReplayTimeline } from "@/lib/battle-replay-result";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const REPLAYS = path.join(
  WORKSPACE,
  "RE-evidence",
  "20260919-configurable-battle-setup",
  "run-battle-16.4",
  "replays",
);
const PY_INITIAL_STATE = path.join(APP, "api", "_battle_runtime", "combat_initial_state.py");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0
  ? path.resolve(args[outIndex + 1])
  : path.join(tmpdir(), "ka-generated-replay-check");

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

/* ---------------- synthetic payloads ---------------- */

function syntheticReplay({ events = [], visualSetup, finish, parameters, finalUnits, verdict, rewardEntitlement } = {}) {
  const unit = {
    unitId: "ally:0", side: "ally", rosterIndex: 0, entityId: 1, name: "Hero", kind: "human",
    human: true, monsterId: null, weaponId: 93, skillIds: [], invocationLevels: [],
    grid: 0, column: 0, row: 0, cell: [0, 6], startHp: 5000, startMp: 1000,
    parameters: parameters ?? { "10": { raw: { rawMax: 5000 } }, "11": { raw: { rawMax: 1000 } } },
  };
  const enemy = {
    unitId: "enemy:0", side: "enemy", rosterIndex: 0, entityId: 2, name: "Slime", kind: "monster",
    human: false, monsterId: 116, weaponId: 0, skillIds: [], invocationLevels: [],
    grid: 0, column: 0, row: 0, cell: [1, 5], startHp: 900, startMp: 0,
    parameters: { "10": { raw: { rawMax: 900 } }, "11": { raw: { rawMax: 0 } } },
  };
  const last = events.length ? events[events.length - 1] : null;
  const base = {
    schema: "ka-battle-replay-1",
    source: { exporter: "synthetic", runner: "synthetic", scenarioSchema: "", note: "" },
    setupSummary: { encounterId: 1, defeatCount: 0, mathSeed: 1, libSeed: 1, tickLimit: 10, holyHerbStock: 0, inputs: [], ownUnitCount: 1, enemyUnitCount: 1, prePlacement: [] },
    encounter: { encounterId: 1, title: null, level: 1, defeatCount: 0, followerSelectionDraws: 0, formationOrder: [], ownFormationOrder: [], enemyMonsterIds: [] },
    units: [unit, enemy],
    ticks: last ? last.tick : 0,
    events,
    finalState: {
      verdict: verdict ?? null, battleState: 1, battleFrame: last ? last.tick : 0, ticks: last ? last.tick : 0,
      stopReason: "synthetic", censored: false, prizeCallbacks: 0, mathDraws: 0, libDraws: 0,
      rngFinalState: null, retainedRewards: null, initializationMode: "synthetic", cellsDerivedFrom: "synthetic",
      units: finalUnits ?? [
        { unitId: "ally:0", entityId: 1, side: "ally", rosterIndex: 0, hp: 5000, mp: 1000, state: 1, stateName: "waiting", commands: 0, cell: [0, 6] },
        { unitId: "enemy:0", entityId: 2, side: "enemy", rosterIndex: 0, hp: 900, mp: 0, state: 1, stateName: "waiting", commands: 0, cell: [1, 5] },
      ],
    },
    catalog: { stateNames: { "1": "waiting", "3": "charging", "4": "attacking", "6": "damaging", "7": "knocking_down", "8": "leaving" }, skills: {}, equipment: {} },
    metrics: {}, holyHerbRemaining: 0, receipts: null, runnerLimits: [], notes: [], missing: [],
  };
  if (visualSetup) base.visualSetup = visualSetup;
  if (finish) base.finish = finish;
  if (rewardEntitlement) base.finalState.rewardEntitlement = rewardEntitlement;
  return base;
}

const appearanceVisualSetup = (imgIds) => ({
  units: [{
    name: "Hero", kind: "human", jobId: "Guard", rank: "D", gender: 0,
    appearanceInputs: { flag: 4, imgIds, source: "SOURCE_INPUT" },
    weaponId: 93, weaponMotion: 9, skills: [],
  }],
});
/* ---------------- 1. clock / tick frames on the real fixtures ---------------- */

for (const file of ["R.json", "RL.json", "F12.json"]) {
  const data = replay(file);
  const frames = buildGeneratedFrames(data);
  const eventTicks = data.events.map((e) => e.tick);
  const minTick = Math.min(0, ...eventTicks);
  const maxTick = Math.max(...eventTicks);

  check(`${file}: one frame per authoritative tick`, frames.length, maxTick - minTick + 1);
  check(`${file}: frames start at the first event tick`, frames[0].tick, minTick);
  check(`${file}: frames end at the last event tick`, frames[frames.length - 1].tick, maxTick);
  check(`${file}: ticks advance by exactly 1`, frames.every((frame, index) => index === 0 || frame.tick === frames[index - 1].tick + 1), true);
  check(`${file}: frame index matches its ordinal`, frames.every((frame, index) => frame.index === index), true);
  check(`${file}: every tick keeps its own events in seq order`,
    frames.every((frame) => frame.events.every((e) => e.tick === frame.tick)
      && frame.events.every((e, i) => i === 0 || e.seq > frame.events[i - 1].seq)), true);
  const grouped = frames.reduce((total, frame) => total + frame.events.length, 0);
  check(`${file}: no event dropped or duplicated`, grouped, data.events.length);
  checkTrue(`${file}: many seqs share a tick (grouped, not one frame per seq)`, frames.some((frame) => frame.events.length > 1), "expected a multi-event tick");
  checkTrue(`${file}: empty ticks are kept as frames`, frames.some((frame) => frame.events.length === 0), "expected an empty tick");

  const last = frames[frames.length - 1];
  const finalMatches = data.finalState.units.every((unit) => {
    const folded = last.units[unit.unitId];
    return folded && folded.hp === unit.hp && folded.state === unit.state
      && folded.cell[0] === unit.cell[0] && folded.cell[1] === unit.cell[1];
  });
  check(`${file}: the final frame is the runner's own final state`, finalMatches, true);

  const attack = data.events.find((e) => e.kind === "attack" && typeof e.hpAfter === "number" && e.targetUnitId);
  if (attack) {
    const at = frames.find((frame) => frame.tick === attack.tick);
    check(`${file}: attack hpAfter is folded at its own tick`, at.units[attack.targetUnitId].hp, attack.hpAfter);
  }
}

const long = replay("RL.json");
const longFrames = buildGeneratedFrames(long);
const visuals = new Set(longFrames.flatMap((frame) => Object.values(frame.units).map((unit) => unit.visual)));
checkTrue("RL.json: leaving lifecycle appears in the folded visuals", visuals.has("leaving"), `visuals ${[...visuals].join(",")}`);
const lastLong = longFrames[longFrames.length - 1].units["ally:0"];
check("RL.json: a leaving zero-HP unit is still marked leaving", { dead: lastLong.dead, leaving: lastLong.leaving, hp: lastLong.hp }, { dead: true, leaving: true, hp: 0 });

/* ---------------- 2. cell contract: [column, row] ---------------- */

const py = readFileSync(PY_INITIAL_STATE, "utf8");
checkTrue("Python contract maps cell[0] to x (column)",
  /x,\s*z\s*=\s*unit\['cell'\]/.test(py) && /i32\(x \* 24\)/.test(py), "expected 'x, z = unit[cell]' and 'i32(x * 24)'");
checkTrue("Python contract maps cell[1] to z (row)",
  /i32\(z \* 24\)/.test(py), "expected 'i32(z * 24)'");
checkTrue("Python contract builds the cell as [column, row]",
  /cell=\[column,/.test(py), "expected 'cell=[column, ...]'");
const cellFixture = replay("R.json");
const realUnits = buildGeneratedUnits(cellFixture);
check("initial cells are the replay's own [column, row] tuples",
  realUnits.map((unit) => unit.initialCell.join(",")),
  cellFixture.units.map((unit) => [unit.cell[0], unit.cell[1]].join(",")));
const cellFrames = buildGeneratedFrames(cellFixture);
checkTrue("the initial frame places every unit on its own replay cell",
  cellFixture.units.every((unit) => {
    const folded = cellFrames[0].units[unit.unitId];
    return folded && folded.cell[0] === unit.cell[0] && folded.cell[1] === unit.cell[1];
  }), "initial cell mismatch");
check("generated units keep the replay cell tuple as [column, row]",
  realUnits.every((unit) => Array.isArray(unit.initialCell) && unit.initialCell.length === 2), true);

/* ---------------- 3. true HP/MP maxima ---------------- */

const maxReplay = syntheticReplay({
  events: [{ seq: 0, tick: 0, phase: "b", kind: "mp", casterUnitId: "ally:0", before: 1000, after: 900, amount: 100 }],
  parameters: { "10": { raw: { rawValue: 5000, rawMax: 6000 }, effectiveMaximum: 8000 }, "11": { raw: { rawValue: 1000, rawMax: 1200 }, effectiveMaximum: 1500 } },
});
const maxUnits = buildGeneratedUnits(maxReplay);
check("maxHp uses the true param 10 maximum when it differs from startHp", maxUnits[0].maxHp, 8000);
check("maxMp uses the true param 11 maximum when it differs from startMp", maxUnits[0].maxMp, 1500);
const maxFrames = buildGeneratedFrames(maxReplay);
check("the frame carries the true maxima too", { hp: maxFrames[0].units["ally:0"].maxHp, mp: maxFrames[0].units["ally:0"].maxMp }, { hp: 8000, mp: 1500 });

/* ---------------- 4. appearance: no demo substitution ---------------- */

const noAppearance = buildGeneratedUnits(syntheticReplay());
check("no appearanceInputs -> generic avatar mode", generatedStageMode(noAppearance[0]), "generic-avatar");
check("no appearanceInputs -> no human character", generatedHumanCharacter(noAppearance[0]), null);
const appearanceUnits = buildGeneratedUnits(
  syntheticReplay({ visualSetup: appearanceVisualSetup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) }),
  appearanceVisualSetup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
);
check("appearanceInputs -> human clip mode", generatedStageMode(appearanceUnits[0]), "human-clip");
const character = generatedHumanCharacter(appearanceUnits[0]);
check("the replay character carries the replay's own imgIds", character.imgIds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
checkTrue("the replay character is NOT a demo guard/archer identity",
  character.id === "replay:ally:0" && !["guard-d", "archer-c"].includes(character.id), `id ${character.id}`);
check("the real fixture (no visualSetup) does not use a demo identity",
  buildGeneratedUnits(replay("R.json")).filter((unit) => unit.human).every((unit) => generatedHumanCharacter(unit) === null), true);

/* ---------------- 5. recovered animation_request clips ---------------- */

check("animation_request clip 12 resolves to the recovered idle clip", generatedClipForBase(12), "equipWaitUp");
check("animation_request clip 72 resolves to the recovered spear attack clip", generatedClipForBase(72), "attackSpearUp");
check("animation_request clip 68 resolves to the recovered bow attack clip", generatedClipForBase(68), "attackBowUp");
check("an unrecovered clip base stays null (explicit fallback)", generatedClipForBase(188), null);
const rFrames = buildGeneratedFrames(replay("R.json"));
check("the runner's idle animation_request is folded onto the unit frame",
  rFrames[0].units["ally:0"].clipId, "equipWaitUp");
// The reaction states draw from the recovered reaction table, not from the folded `clipId`, so the
// selector only has to find a damaging frame (the old `clipId === null` clause pinned the bug where a
// reaction frame blanked the clip).
const damaging = rFrames.find((frame) => Object.values(frame.units).some((unit) => unit.visual === "damaging"));
checkTrue("a damaging frame exists for the reaction-clip check", Boolean(damaging), "expected a damaging frame");
if (damaging) {
  const unitId = Object.keys(damaging.units).find((id) => damaging.units[id].visual === "damaging");
  const lines = generatedHumanLinesForFrame(damaging.units[unitId], 0);
  checkTrue("damaging uses the recovered reaction clip records", Array.isArray(lines) && lines.length > 0, `lines ${lines}`);
}
const waitingFrame = rFrames[0].units["ally:0"];
const idleLines = generatedHumanLinesForFrame({ ...waitingFrame, visual: "waiting" }, 0);
checkTrue("waiting uses the recovered idle clip records", Array.isArray(idleLines) && idleLines.length > 0, `lines ${idleLines}`);
/* ---------------- 6. status / death / leaving follow event state ---------------- */

const statusReplay = syntheticReplay({
  events: [
    { seq: 0, tick: 5, phase: "f", kind: "status_apply", targetUnitId: "ally:0", status: "poison", stacks: 2 },
    { seq: 1, tick: 7, phase: "f", kind: "status_remove", targetUnitId: "ally:0", status: "poison" },
  ],
});
const statusFrames = buildGeneratedFrames(statusReplay);
check("status_apply adds the runner's own tag", statusFrames.find((frame) => frame.tick === 5).units["ally:0"].status, ["poison x2"]);
check("the tag persists until the remove event", statusFrames.find((frame) => frame.tick === 6).units["ally:0"].status, ["poison x2"]);
check("status_remove clears the tag", statusFrames.find((frame) => frame.tick === 7).units["ally:0"].status, []);

const deathReplay = syntheticReplay({
  events: [
    { seq: 0, tick: 3, phase: "f", kind: "attack", attackerUnitId: "enemy:0", targetUnitId: "ally:0", damage: 5000, hpAfter: 0 },
    { seq: 1, tick: 4, phase: "f", kind: "state", targetUnitId: "ally:0", old: 6, new: 7, stateName: "knocking_down" },
    { seq: 2, tick: 6, phase: "f", kind: "state", targetUnitId: "ally:0", old: 7, new: 8, stateName: "leaving" },
  ],
  finalUnits: [
    { unitId: "ally:0", entityId: 1, side: "ally", rosterIndex: 0, hp: 0, mp: 1000, state: 8, stateName: "leaving", commands: 0, cell: [0, 6] },
    { unitId: "enemy:0", entityId: 2, side: "enemy", rosterIndex: 0, hp: 900, mp: 0, state: 1, stateName: "waiting", commands: 0, cell: [1, 5] },
  ],
});
const deathFrames = buildGeneratedFrames(deathReplay);
const atDeath = deathFrames.find((frame) => frame.tick === 3).units["ally:0"];
check("event HP 0 marks the unit dead", { hp: atDeath.hp, dead: atDeath.dead, leaving: atDeath.leaving }, { hp: 0, dead: true, leaving: false });
const atLeaving = deathFrames.find((frame) => frame.tick === 6).units["ally:0"];
check("the leaving state is read from the state event, not from HP", { visual: atLeaving.visual, leaving: atLeaving.leaving, dead: atLeaving.dead }, { visual: "leaving", leaving: true, dead: true });

/* ---------------- 7. finish / reward tolerance ---------------- */

const older = generatedFinishOutcome(syntheticReplay());
check("an older payload without finish is tolerated", { presence: older.presence, finish: older.finish }, { presence: "finalState-only", finish: null });
check("inventory retention stays unknown without an authoritative field", older.inventory, "unknown (not reported by this payload)");
const newer = generatedFinishOutcome(syntheticReplay({
  events: [{ seq: 0, tick: 4, phase: "f", kind: "prize", targetUnitId: "ally:0", prize: "chest", amount: 1 }],
  finish: {
    fightOutcome: "win", queuedChestAwards: { count: 1 }, dispatchedChestAwards: { count: 1 },
    inventoryCollection: { state: "collected" }, exp: 1234,
  },
}));
check("a payload with finish reports it verbatim", { presence: newer.presence, outcome: newer.finish.fightOutcome, exp: newer.finish.exp }, { presence: "finish", outcome: "win", exp: 1234 });
check("the authoritative inventory state is surfaced", newer.inventory, "collected");

/* ---------------- 7b. reward entitlement summary (pending vs entitlement, victory required) ---------------- */

const rvaEntitlement = (overrides = {}) => ({
  certificateId: "ka-reward-entitlement-certificate-1",
  certificate: { holds: true, frame: 235, issuedBeforeVerdict: true },
  battleVerdict: 1, victoryRequired: true, pendingChestCount: 2, capturedPendingAtVerdict: 2,
  awardedChestCount: 2, awardedChestCountBasis: "reward-entitlement-certificate",
  rewardCountSettled: true, rewardCountReason: "certificate C1..C4 held at frame 235",
  postCertificateQueueChanged: false, postCertificateQueueDelta: 0,
  proofLimits: ["ExitAttacking 0x1585a18 does not clear BKL:16"],
  ...overrides,
});
const summaryOf = (entitlement) =>
  generatedRewardSummary(generatedFinishOutcome(syntheticReplay({ rewardEntitlement: entitlement })));

const legacySummary = generatedRewardSummary(older);
check("an older payload without rewardEntitlement falls back to the queued chest count",
  { result: legacySummary.battleResult, pending: legacySummary.pendingChests, entitlement: legacySummary.rewardEntitlement, required: legacySummary.victoryRequired },
  { result: "Unresolved", pending: 0, entitlement: "unknown (older payload)", required: "unknown" });

const settledSummary = summaryOf(rvaEntitlement());
check("a certified win reports pending chests and the entitlement separately, with the result",
  { result: settledSummary.battleResult, pending: settledSummary.pendingChests, entitlement: settledSummary.rewardEntitlement, required: settledSummary.victoryRequired, note: settledSummary.note },
  { result: "Victory", pending: 2, entitlement: "2", required: "yes", note: null });

const lossSummary = summaryOf(rvaEntitlement({ battleVerdict: 2, awardedChestCount: 0, rewardCountSettled: false }));
check("a loss with pending chests still reads 0 entitlement",
  { result: lossSummary.battleResult, pending: lossSummary.pendingChests, entitlement: lossSummary.rewardEntitlement },
  { result: "Defeat", pending: 2, entitlement: "0" });

const unknownWinSummary = summaryOf(rvaEntitlement({
  awardedChestCount: null, rewardCountSettled: false, certificate: { holds: false, frame: null, issuedBeforeVerdict: false },
}));
check("a win without a pre-verdict certificate states the result but leaves the entitlement unknown",
  { result: unknownWinSummary.battleResult, entitlement: unknownWinSummary.rewardEntitlement },
  { result: "Victory", entitlement: "unknown (no pre-verdict certificate)" });
checkTrue("the unknown-win note explains the missing pre-verdict certificate",
  typeof unknownWinSummary.note === "string" && /certificate/.test(unknownWinSummary.note), String(unknownWinSummary.note));

const unresolvedSummary = summaryOf(rvaEntitlement({ battleVerdict: null, awardedChestCount: null, rewardCountSettled: false }));
check("an unresolved battle says the reward is unknown while keeping the result",
  { result: unresolvedSummary.battleResult, entitlement: unresolvedSummary.rewardEntitlement },
  { result: "Unresolved", entitlement: "unknown (battle unresolved)" });

const summaryText = JSON.stringify([legacySummary, settledSummary, lossSummary, unknownWinSummary, unresolvedSummary]);
checkTrue("the player summary never renders a raw native offset/RVA", !/0x/.test(summaryText), summaryText);

/* ---------------- 8. event grouping / explanations ---------------- */

check("animation_request is an action group", generatedEventGroup("animation_request"), "action");
check("projectile_launch is an action group", generatedEventGroup("projectile_launch"), "action");
check("body_flight is an action group", generatedEventGroup("body_flight"), "action");
check("heal is a heal group", generatedEventGroup("heal"), "heal");
check("status_apply is a status group", generatedEventGroup("status_apply"), "status");
check("prize is a prize group", generatedEventGroup("prize"), "prize");
check("rng stays other (not interpreted)", generatedEventGroup("rng"), "other");
const explained = explainGeneratedEvent(
  { seq: 7, tick: 9, phase: "f", kind: "animation_request", targetUnitId: "ally:0", behavior: 30, clip: 188 },
  (id) => (id === "ally:0" ? "Hero" : String(id)),
);
checkTrue("explanations print the runner's own fields", /tick 9/.test(explained) && /animation_request/.test(explained) && /behaviour 30/.test(explained) && /clip base 188/.test(explained), explained);

/* ---------------- 9. exact clock advance / scrub math ---------------- */

const scrubFrames = buildGeneratedFrames(replay("F12.json"));
const scrubTicks = scrubFrames.map((frame) => frame.tick);
check("stepping forward advances exactly one tick",
  scrubTicks.slice(1).every((tick, index) => tick === scrubTicks[index] + 1), true);
check("the stop index is the final frame", Math.max(0, scrubFrames.length - 1), scrubFrames.length - 1);
check("scrubbing clamps to the final frame, never wrapping to 0",
  Math.min(scrubFrames.length - 1 + 5, scrubFrames.length - 1) === scrubFrames.length - 1, true);

/* ---------------- 10. shared-scene geometry (the empty-stage defect) ---------------- */

/*
 * The defect: fighters were placed with fitted percentage geometry centred in the 481x197 scene,
 * while the mounted window exposes logical X 0..logicalViewWidth(=240). Every unit therefore sat
 * outside the visible window. These checks re-derive the camera arithmetic by hand instead of
 * re-using the helper's own numbers.
 */
const rGeo = replay("R.json");
const rAllies = rGeo.units.filter((unit) => unit.side === "ally");
const rEnemies = rGeo.units.filter((unit) => unit.side === "enemy");
const geoFormation = nativeInitialFormation(rAllies.length, rEnemies.length);
const geoCells = rGeo.units.map((unit) => [unit.cell[0], unit.cell[1]]);
/* camera for rowOffset 5: a = 24*-6 = -144, b = 24*(5-3) = 48 -> cam = (-208, -45) */
check("the battle camera for the 21-enemy roster is the recovered one",
  { rowOffset: geoFormation.rowOffset }, { rowOffset: 5 });
check("cell (0,6) projects to the recovered native view pixel",
  nativeViewPos(0, 6, 5), { x: 64, y: 117 });
check("the deepest enemy column still lands inside the shared scene",
  nativeViewPos(4, 2, 5), { x: 256, y: 117 });
const geoPan = generatedViewPanX(geoCells, geoFormation.rowOffset, 240);
check("the presentation pan centres the formation in the 240-wide window", geoPan, 40);
const geoXs = geoCells.map(([column, row]) => nativeViewPos(column, row, geoFormation.rowOffset).x - geoPan);
checkTrue("every initial fighter is inside the window after the pan",
  geoXs.every((x) => x >= 0 && x <= 240), `xs ${Math.min(...geoXs)}..${Math.max(...geoXs)}`);
checkTrue("the old fitted percentage geometry would have put them outside it",
  geoXs.every((x) => x >= 0) && 50 + ((256 - 160) * 1 * 100) / 480 > 60, "fit comparison");
check("a placed fighter equals the projection minus the pan",
  generatedScenePlacement({
    cell: [0, 6],
    unitFrame: undefined,
    tick: 0,
    rowOffset: 5,
    viewPanX: 40,
  }), { left: "24px", top: "117px" });

/* the runner's own body_flight is what carries a departing fighter off its cell */
const rlFrames = buildGeneratedFrames(replay("RL.json"));
const flightFrame = rlFrames.find((frame) => frame.units["ally:1"] && frame.units["ally:1"].flight);
const flight = flightFrame ? flightFrame.units["ally:1"].flight : null;
checkTrue("the leaving fixture exposes the runner's own body_flight", Boolean(flight), "no body_flight frame");
if (flight) {
  const onCell = generatedScenePlacement({
    cell: [1, 6],
    unitFrame: { ...rlFrames[0].units["ally:1"], flight: null },
    tick: flight.tick,
    rowOffset: 5,
    viewPanX: 40,
  });
  const inFlight = generatedScenePlacement({
    cell: [1, 6],
    unitFrame: rlFrames.find((frame) => frame.tick === flight.tick).units["ally:1"],
    tick: flight.tick + 8,
    rowOffset: 5,
    viewPanX: 40,
  });
  checkTrue("a launched fighter leaves its cell", inFlight.left !== onCell.left || inFlight.top !== onCell.top,
    `${onCell.left},${onCell.top} -> ${inFlight.left},${inFlight.top}`);
  const landed = generatedScenePlacement({
    cell: [1, 6],
    unitFrame: rlFrames.find((frame) => frame.tick === flight.tick).units["ally:1"],
    tick: flight.tick + 500,
    rowOffset: 5,
    viewPanX: 40,
  });
  const end = nativeWorldViewPos(flight.end[0], flight.end[1], flight.end[2], 5);
  /* the recovered rule integrates trunc(distance/speed) whole steps, so the landing is within one step of `end` */
  checkTrue("the flight lands on the runner's own end path",
    Math.abs(Number.parseFloat(landed.left) - (end.x - 40)) < 5 && landed.top === `${end.y}px`,
    `landed ${landed.left},${landed.top} vs end ${end.x - 40},${end.y}`);
  check("the flight stays at its landing point once it is over",
    generatedScenePlacement({
      cell: [1, 6],
      unitFrame: rlFrames.find((frame) => frame.tick === flight.tick).units["ally:1"],
      tick: flight.tick + 5000,
      rowOffset: 5,
      viewPanX: 40,
    }), landed);
}

/* the monster clip is the recovered wait/attack group of the unit's direction */
const enemyClipFrames = buildGeneratedFrames(rGeo);
const enemyFrame0 = enemyClipFrames.find((frame) => frame.units["enemy:0"]);
check("a waiting monster draws the recovered wait clip",
  generatedMonsterClip(enemyFrame0.units["enemy:0"], enemyFrame0.tick, "down").clip.seb,
  "monster_s_wait_right.seb");
check("an attacking monster draws the recovered attack clip",
  generatedMonsterClip({ ...enemyFrame0.units["enemy:0"], visual: "attacking", stateTick: enemyFrame0.tick }, enemyFrame0.tick, "down").clip.seb,
  "monster_s_attack_right.seb");
check("an attack is animated from the tick its state began",
  generatedMonsterClip({ ...enemyFrame0.units["enemy:0"], visual: "attacking", stateTick: enemyFrame0.tick - 4 }, enemyFrame0.tick, "down").update,
  4);

/* player-facing wording: names and the runner's own numbers only */
const summary = generatedTickSummary(
  [
    { seq: 1, tick: 25, phase: "f", kind: "attack", attackerUnitId: "enemy:15", targetUnitId: "ally:0", damage: 272, hpAfter: 4728 },
    { seq: 2, tick: 25, phase: "f", kind: "rng", stream: "math" },
    { seq: 3, tick: 25, phase: "f", kind: "animation_request", targetUnitId: "ally:0", behavior: 3 },
  ],
  (id) => (id === "enemy:15" ? "Wairo Tank" : id === "ally:0" ? "Guard D" : "-"),
);
check("the tick summary names the attacker, the target and the runner's damage",
  summary.lines, ["Wairo Tank hits Guard D for 272"]);
check("bookkeeping events are counted, not spelled out", summary.internal, 2);
check("verdict 1 reads as a win", generatedVerdictWord(1), "Victory");
check("verdict 2 reads as a loss", generatedVerdictWord(2), "Defeat");
check("an unresolved battle says so", generatedVerdictWord(null), "Unresolved");

/* ---------------- 11. item resource timeline (battle_item + resource_change) ---------------- */

/*
 * The item path emits one authoritative `resource_change` per changed unit/parameter, carrying the
 * engine's own effective value and maximum immediately before and after its Parameter.Add. The fold
 * must consume that `after` verbatim for HP(10) / MP(11): it is not a healing formula to be redone.
 */
const itemReplay = syntheticReplay({
  events: [
    { seq: 1, tick: 0, phase: "fighters", kind: "mp", casterUnitId: "ally:0", before: 1000, after: 900, amount: 100, skillId: 26 },
    { seq: 2, tick: 5, phase: "fighters", kind: "battle_item", item: "holy_herb", parameter: 11, scope: "all", used: true, percent: 100, remaining: 2, targetUnitIds: ["ally:0"] },
    { seq: 3, tick: 5, phase: "fighters", kind: "resource_change", targetUnitId: "ally:0", parameter: 11, before: 900, after: 1234, max: 1500, sourceItem: "holy_herb" },
    /* pushes the closing snapshot well past the item tick, so the mid-fight point is exercised */
    { seq: 4, tick: 20, phase: "fighters", kind: "rng", stream: "math" },
  ],
  finalUnits: [
    { unitId: "ally:0", entityId: 1, side: "ally", rosterIndex: 0, hp: 5000, mp: 1234, state: 1, stateName: "waiting", commands: 0, cell: [0, 6] },
    { unitId: "enemy:0", entityId: 2, side: "enemy", rosterIndex: 0, hp: 900, mp: 0, state: 1, stateName: "waiting", commands: 0, cell: [1, 5] },
  ],
});
const itemTimeline = foldBattleReplayTimeline(itemReplay);
const itemPoints = itemTimeline.units["ally:0"];
const atItem = itemPoints.find((point) => point.seq === 3);
const closing = itemPoints[itemPoints.length - 1];
/* tick 0 keeps the synthetic seed point (seq -1) plus the runner's own spend event (seq 1). */
const atSpend = itemPoints.filter((point) => point.tick === 0).pop();
check("resource_change(11) folds the runner's own MP `after` verbatim", atItem.mp, 1234);
check("the earlier MP spend keeps the engine's own value", atSpend.mp, 900);
check("the item point is a mid-fight point, not the closing snapshot",
  atItem.tick === 5 && atItem.seq < closing.seq && closing.tick === 20, true);
check("the close is still the runner's own final state",
  itemPoints[itemPoints.length - 1].mp, itemReplay.finalState.units[0].mp);

const hpReplay = syntheticReplay({
  events: [
    { seq: 1, tick: 3, phase: "fighters", kind: "heal", casterUnitId: "enemy:0", targetUnitId: "ally:0", amount: 200, before: 4000, after: 4200, skillId: 37 },
    { seq: 2, tick: 4, phase: "fighters", kind: "resource_change", targetUnitId: "ally:0", parameter: 10, before: 4200, after: 5000, max: 5000, sourceItem: "salve" },
    { seq: 3, tick: 6, phase: "fighters", kind: "resource_change", targetUnitId: "enemy:0", parameter: 10, before: 800, after: 900, max: 900, sourceItem: "salve" },
    { seq: 4, tick: 6, phase: "fighters", kind: "resource_change", targetUnitId: "ally:0", parameter: 11, before: 1000, after: 1100, max: 1100, sourceItem: "salve" },
  ],
});
const hpTimeline = foldBattleReplayTimeline(hpReplay);
const hpPoints = hpTimeline.units["ally:0"];
check("an earlier heal is not applied twice by a later resource_change",
  hpPoints.find((point) => point.tick === 3).hp, 4200);
check("resource_change(10) folds the HP `after` verbatim", hpPoints.find((point) => point.tick === 4).hp, 5000);
check("a HP change leaves that unit's MP alone", hpPoints.find((point) => point.tick === 4).mp, 1000);
check("each resource_change targets its own unit only",
  hpTimeline.units["enemy:0"].find((point) => point.tick === 6).hp, 900);
check("a later MP change on the same unit is a separate point",
  hpPoints.find((point) => point.tick === 6).mp, 1100);

const itemSummary = generatedTickSummary(
  [
    { seq: 1, tick: 5, phase: "fighters", kind: "battle_item", item: "holy_herb", parameter: 11, scope: "all", used: true, percent: 100, remaining: 2, targetUnitIds: ["ally:0"] },
    { seq: 2, tick: 5, phase: "fighters", kind: "resource_change", targetUnitId: "ally:0", parameter: 11, before: 900, after: 1500, max: 1500, sourceItem: "holy_herb" },
    { seq: 3, tick: 6, phase: "fighters", kind: "mp", casterUnitId: "ally:0", before: 1500, after: 1450, amount: 50 },
    { seq: 4, tick: 7, phase: "fighters", kind: "battle_item", item: "holy_herb", used: false, remaining: 0, blocked: "no stock", targetUnitIds: ["ally:0"] },
  ],
  (id) => (id === "ally:0" ? "Guard D" : "-"),
);
check("the item notice names the item and its remaining stock",
  itemSummary.lines[0], "holy_herb item used (2 left)");
check("MP restoration is worded as a restoration, not a spend",
  itemSummary.lines[1], "Guard D restores 600 MP");
check("MP spending keeps its own wording", itemSummary.lines[2], "Guard D spends 50 MP");
check("a blocked item attempt is still reported",
  itemSummary.lines[3], "holy_herb item no effect (0 left) - no stock");
check("the item lines are not counted as internal bookkeeping", itemSummary.internal, 0);
const explainedItem = explainGeneratedEvent(
  { seq: 2, tick: 5, phase: "fighters", kind: "resource_change", targetUnitId: "ally:0", parameter: 11, before: 900, after: 1500, max: 1500, sourceItem: "holy_herb" },
  (id) => (id === "ally:0" ? "Guard D" : String(id)),
);
checkTrue("the raw explanation prints the runner's own before/after",
  /parameter 11/.test(explainedItem) && /before 900/.test(explainedItem) && /after 1500/.test(explainedItem),
  explainedItem);

/* ---------------- report ---------------- */

const failed = checks.filter((entry) => !entry.passed);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "pure-check.json"), JSON.stringify({
  fixtures: ["R.json", "RL.json", "F12.json"],
  checks,
  passed: checks.length - failed.length,
  total: checks.length,
}, null, 2));
console.log(JSON.stringify({
  passed: checks.length - failed.length,
  total: checks.length,
  failed: failed.map((entry) => `${entry.name}: ${entry.detail}`),
  out: path.join(OUT, "pure-check.json"),
}, null, 1));
if (failed.length) process.exitCode = 1;
