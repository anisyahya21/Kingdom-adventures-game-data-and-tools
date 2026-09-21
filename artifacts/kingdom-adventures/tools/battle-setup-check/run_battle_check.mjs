/**
 * PASS 16 COMMAND 16.4 check driver.
 *
 * BattleSetup -> adapter -> authoritative Python run -> generic replay -> TypeScript contract.
 *
 * 1. runs the 16.2/16.3 harness (run_check.mjs), which validates every adapter fixture and prints
 *    the scenario JSON for each one;
 * 2. feeds those scenarios to `KA-Website/tools/recovery/combat_replay_export.py`, the authoritative
 *    `load_scenario` -> `prepare_setup` -> `combat_sandbox.run_scenario` export;
 * 3. re-reads the produced `ka-battle-replay-1` payloads through the TypeScript contract module
 *    (`src/lib/battle-replay-result.ts`, imported directly by Node's type stripping) and checks the
 *    contract, the joins, the event fold, the JSON round trip and determinism.
 *
 * Usage:
 *   node tools/battle-setup-check/run_battle_check.mjs --base http://127.0.0.1:5173 --out <dir>
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(ARTIFACT, "..", "..", "..");
const RECOVERY = path.join(WORKSPACE, "KA-Website", "tools", "recovery");
const EXPORTER = path.join(RECOVERY, "combat_replay_export.py");
const REPLAY_MODULE = path.join(ARTIFACT, "src", "lib", "battle-replay-result.ts");

const PYTHON_CANDIDATES = [
  path.join(WORKSPACE, ".venv", "Scripts", "python.exe"),
  path.join(WORKSPACE, ".venv", "bin", "python"),
  "python",
  "py",
];

const RUN_TICK_LIMIT = 200;
const LONG_HORIZONS = { RL: 1000 };
const DETERMINISM_SUBSET = ["R", "RM", "F19", "W9", "W10"];
/**
 * One planned run is expected to fail, and it is a schema rule rather than a scope gap:
 *   P - a pre-placement source state must name every own *and* enemy fighter, so a partial
 *       pre-placement loads but cannot be executed.
 * COMMAND 16.5 removed the other gap: the recovered Guard D spear (behaviour 9) now runs, so the
 * former A/C/D/G failures are asserted as passing runs below.
 */
const INPUT_GAPS = [
  {
    cause: "a pre-placement source state must name every own and enemy fighter, so a partial pre-placement cannot execute",
    pattern: /prePlacement must name every own and enemy fighter exactly once/,
  },
];
const inputGapFor = (error) => INPUT_GAPS.find((gap) => gap.pattern.test(String(error ?? "")));
const RUN_PLAN = [
  "A", "B", "C", "D", "G", "P", "S", "R", "R4", "RL", "RM", "RD",
  "E0", "E4", "E8", "E12", "E16",
  "W4", "W9", "W10", "W11", "W12", "W16", "W37",
  ...Array.from({ length: 20 }, (_, index) => `F${index}`),
  ...Array.from({ length: 20 }, (_, index) => `M${index}`),
];
/** PASS 16 COMMAND 16.5: fixture id -> the recovered weapon motion its attacker carries. */
const WEAPON_MOTION_FIXTURES = { W4: 4, W9: 9, W10: 10, W11: 11, W12: 12, W16: 16, W37: 37 };

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null };
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!out.out) throw new Error("--out is required");
  return out;
};

const checks = [];
const record = (name, passed, detail = "") => {
  checks.push({ name, passed: Boolean(passed), detail: passed ? "ok" : String(detail) });
};
const expect = (name, actual, expected) =>
  record(name, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

function runPython(script, args, extra = {}) {
  for (const candidate of PYTHON_CANDIDATES) {
    const result = spawnSync(candidate, [script, ...args], {
      encoding: "utf8",
      windowsHide: true,
      cwd: RECOVERY,
      ...extra,
    });
    if (result.error && result.error.code === "ENOENT") continue;
    if (result.error) throw result.error;
    return result;
  }
  throw new Error("no Python interpreter found");
}

function runHarness(base, out) {
  const result = spawnSync(
    process.execPath,
    [path.join(here, "run_check.mjs"), "--base", base, "--out", out],
    { encoding: "utf8", windowsHide: true },
  );
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function forbiddenKeys(value, trail = "") {
  const forbidden = ["timestamp", "createdAt", "generatedAt", "camera", "dom", "viewport", "screenshot", "devicePixelRatio"];
  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => hits.push(...forbiddenKeys(entry, `${trail}[${index}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (forbidden.includes(key)) hits.push(`${trail}.${key}`);
      hits.push(...forbiddenKeys(entry, `${trail}.${key}`));
    }
  } else if (typeof value === "string" && /(^[A-Za-z]:\\|\/Users\/|\/home\/)/.test(value)) {
    hits.push(`${trail} (absolute path)`);
  }
  return hits;
}

async function main() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  mkdirSync(path.join(out, "scenarios"), { recursive: true });
  mkdirSync(path.join(out, "replays"), { recursive: true });

  console.log("1/3 harness + adapter verification ...");
  const harnessRun = runHarness(args.base, out);
  const harness = JSON.parse(readFileSync(path.join(out, "battle-setup-check.json"), "utf8"));
  const adapterVerify = JSON.parse(readFileSync(path.join(out, "adapter-verify.json"), "utf8"));
  const fixtures = harness.adapter.fixtures;

  const replay = await import(pathToFileURL(REPLAY_MODULE).href);

  console.log("2/3 authoritative Python runs ...");
  const runs = {};
  const payloads = {};
  for (const fixtureId of RUN_PLAN) {
    const fixture = fixtures[fixtureId];
    if (!fixture?.scenario) {
      runs[fixtureId] = { ok: false, error: "fixture missing from the harness output" };
      continue;
    }
    const scenario = JSON.parse(JSON.stringify(fixture.scenario));
    scenario.tickLimit = LONG_HORIZONS[fixtureId] ?? RUN_TICK_LIMIT;
    const scenarioFile = path.join(out, "scenarios", `${fixtureId}.scenario.json`);
    const replayFile = path.join(out, "replays", `${fixtureId}.json`);
    writeFileSync(scenarioFile, JSON.stringify(scenario, null, 1));
    const execution = runPython(EXPORTER, [scenarioFile, "--out", replayFile]);
    if (execution.status !== 0) {
      runs[fixtureId] = {
        ok: false,
        tickLimit: scenario.tickLimit,
        error: (execution.stderr || execution.stdout || "").trim().split("\n").pop(),
      };
      continue;
    }
    const payload = JSON.parse(readFileSync(replayFile, "utf8"));
    payloads[fixtureId] = payload;
    const parsed = replay.parseBattleReplayResult(payload);
    const summary = parsed.result ? replay.battleReplaySummary(parsed.result) : null;
    runs[fixtureId] = {
      ok: parsed.issues.length === 0,
      tickLimit: scenario.tickLimit,
      units: payload.units.length,
      allies: summary?.allyCount ?? null,
      enemies: summary?.enemyCount ?? null,
      events: payload.events.length,
      ticks: payload.ticks,
      verdict: payload.finalState.verdict,
      stopReason: payload.finalState.stopReason,
      payloadBytes: readFileSync(replayFile).length,
      parseIssues: parsed.issues,
    };
  }

  console.log("3/3 contract, joins and determinism ...");
  const reproduction = {};
  for (const fixtureId of DETERMINISM_SUBSET) {
    const scenarioFile = path.join(out, "scenarios", `${fixtureId}.scenario.json`);
    if (!existsSync(scenarioFile)) continue;
    const repeatFile = path.join(out, "replays", `${fixtureId}.repeat.json`);
    const execution = runPython(EXPORTER, [scenarioFile, "--out", repeatFile]);
    reproduction[fixtureId] = execution.status === 0
      ? readFileSync(repeatFile).equals(readFileSync(path.join(out, "replays", `${fixtureId}.json`)))
      : false;
  }

  const encounterFile = JSON.parse(
    readFileSync(path.join(ARTIFACT, "src", "game-data", "battle-encounter-variants.json"), "utf8"),
  );
  const variantById = new Map(encounterFile.variants.map((variant) => [variant.id, variant]));

  record("harness suite is green", (harness.failed ?? []).length === 0, JSON.stringify(harness.failed));
  record("adapter fixture verification is green", (adapterVerify.failed ?? []).length === 0, JSON.stringify(adapterVerify.failed));
  record("harness process exit", harnessRun.status === 0, harnessRun.stderr.slice(-200));

  const okRuns = RUN_PLAN.filter((id) => runs[id]?.ok);
  const blocked = RUN_PLAN.filter((id) => !runs[id]?.ok);
  const gapRuns = {};
  for (const gap of INPUT_GAPS) {
    gapRuns[gap.cause] = blocked.filter((id) => gap.pattern.test(String(runs[id].error)));
  }
  const unclassified = blocked.filter((id) => !inputGapFor(runs[id].error));
  record("every planned run either produced a replay or matched a recorded input gap",
    unclassified.length === 0 && okRuns.length + blocked.length === RUN_PLAN.length,
    `ok ${okRuns.length}/${RUN_PLAN.length}: unclassified failures ${JSON.stringify(unclassified.map((id) => [id, runs[id]?.error]))}`);
  for (const [cause, ids] of Object.entries(gapRuns)) {
    record(`input gap recorded, not hidden: ${cause}`,
      ids.length > 0 && ids.every((id) => runs[id].ok === false),
      JSON.stringify(ids));
  }
  /* COMMAND 16.5: the runs that used to die on an unintegrated weapon behaviour must now pass. */
  const previouslyFailing = ["A", "C", "D", "G", "R"];
  record("the 16.4 weapon-behaviour failures now run",
    previouslyFailing.every((id) => runs[id]?.ok === true),
    JSON.stringify(previouslyFailing.map((id) => [id, runs[id]?.ok, runs[id]?.error])));
  record("the recovered spear reference reaches ordinary attacks",
    (payloads.R?.events ?? []).some((event) =>
      event.kind === "animation_request" && event.targetUnitId === "ally:0" &&
      event.behavior === 9 && [72, 73, 74, 75].includes(event.clip)),
    "the spear carrier never requested the recovered spear clip (behaviour 9 / base 72)");

  for (const fixtureId of okRuns) {
    const payload = payloads[fixtureId];
    const fixture = fixtures[fixtureId];
    const parsed = replay.parseBattleReplayResult(payload);
    const result = parsed.result;
    const prefix = `${fixtureId}`;
    record(`${prefix}: schema`, payload.schema === "ka-battle-replay-1", payload.schema);
    record(`${prefix}: parse has no issues`, parsed.issues.length === 0, JSON.stringify(parsed.issues));
    expect(`${prefix}: stable unit ids are side:rosterIndex`,
      result.units.map((unit) => `${unit.side}:${unit.rosterIndex}`), result.units.map((unit) => unit.unitId));
    record(`${prefix}: entity ids are unique simulator ids`,
      new Set(result.units.map((unit) => unit.entityId)).size === result.units.length, "duplicate entityId");
    const adapterRoster = [
      ...fixture.scenario.ownUnits.map((unit) => unit.name),
      ...Object.values(fixture.scenario.housePets ?? {}).flat().map((pet) => pet.name),
    ];
    expect(`${prefix}: ally roster order matches the adapter scenario`,
      result.units.filter((unit) => unit.side === "ally").map((unit) => unit.name),
      adapterRoster);
    expect(`${prefix}: normalized roster order matches the loader`,
      result.units.filter((unit) => unit.side === "ally").map((unit) => unit.name),
      fixture.expectedUnits ?? []);
    const variant = variantById.get(payload.setupSummary.encounterId);
    expect(`${prefix}: enemy roster matches the recovered encounter table`,
      payload.encounter.enemyMonsterIds,
      [...variant.followers.map((follower) => follower.monsterId), variant.boss.monsterId]);
    record(`${prefix}: formation order is a permutation`,
      result.finalState.units.length === result.units.length &&
        [...payload.encounter.ownFormationOrder].sort((a, b) => a - b).join(",") ===
          result.units.filter((unit) => unit.side === "ally").map((_, index) => index).join(","),
      JSON.stringify(payload.encounter.ownFormationOrder));
    record(`${prefix}: final state covers every unit with hp/mp/state/cell`,
      result.finalState.units.every((unit) =>
        typeof unit.hp === "number" && typeof unit.mp === "number" && typeof unit.state === "number" &&
        Array.isArray(unit.cell) &&
        (result.catalog.stateNames[String(unit.state)] === undefined || typeof unit.stateName === "string")),
      "incomplete final state");
    record(`${prefix}: event unit references resolve to unitIds`,
      result.events.every((event) =>
        ["targetUnitId", "casterUnitId", "attackerUnitId", "ownerUnitId"].every((field) => {
          const value = event[field];
          return value === undefined || value === null || result.units.some((unit) => unit.unitId === value);
        })),
      "unresolved event unit id");
    const skillEvents = result.events.filter((event) => typeof event.skillId === "number");
    record(`${prefix}: skill events keep the skill id and a recovered motion`,
      skillEvents.every((event) => result.catalog.skills[String(event.skillId)]?.motion !== undefined),
      JSON.stringify(skillEvents.slice(0, 3)));
    record(`${prefix}: skill events carry the caster's ordered slot`,
      skillEvents.every((event) => {
        const actor = result.units.find((unit) => unit.unitId === (event.casterUnitId ?? event.attackerUnitId));
        if (!actor || !actor.skillIds.includes(event.skillId)) return true;
        return event.skillSlot === actor.skillIds.indexOf(event.skillId);
      }),
      JSON.stringify(skillEvents.slice(0, 3)));
    const weaponAttacks = result.events.filter((event) => event.kind === "attack" && event.skillId === null);
    record(`${prefix}: ordinary attacks keep a weapon identity through the actor`,
      weaponAttacks.every((event) => {
        const actor = result.units.find((unit) => unit.unitId === event.attackerUnitId);
        if (!actor) return false;
        return actor.weaponId === 0 || result.catalog.equipment[String(actor.weaponId)]?.motion !== undefined;
      }),
      `${weaponAttacks.length} weapon attacks`);
    const timeline = replay.foldBattleReplayTimeline(result);
    record(`${prefix}: event fold closes on the runner's final state`,
      timeline.complete && result.finalState.units.every((unit) => {
        const points = timeline.units[unit.unitId];
        const last = points?.[points.length - 1];
        return last && last.hp === unit.hp && last.mp === unit.mp && last.state === unit.state &&
          last.cell[0] === unit.cell[0] && last.cell[1] === unit.cell[1];
      }),
      "fold does not match the final state");
    const serialized = replay.serializeBattleReplayResult(result);
    const roundTrip = replay.parseBattleReplayResult(JSON.parse(serialized));
    record(`${prefix}: JSON round trip is lossless`,
      roundTrip.result ? replay.serializeBattleReplayResult(roundTrip.result) === serialized : false,
      JSON.stringify(roundTrip.issues));
    record(`${prefix}: payload carries no DOM/camera/timestamp/path data`,
      forbiddenKeys(payload).length === 0, JSON.stringify(forbiddenKeys(payload).slice(0, 5)));
    record(`${prefix}: payload documents what the runner does not expose`,
      Array.isArray(payload.missing) && payload.missing.some((entry) => /revive/.test(entry)),
      "missing list does not mention the revive gap");
  }

  for (const [fixtureId, equal] of Object.entries(reproduction)) {
    record(`${fixtureId}: two runs of the same setup are byte-identical`, equal === true, "payloads differ");
  }

  /*
   * COMMAND 16.5: one runnable scenario per recovered ordinary weapon motion, plus the native
   * attack-timing invariant that must stay untouched by the integration.
   */
  const RECOVERED_HUMAN_BASES = { 4: 16, 9: 72, 10: 56, 11: 68, 12: 92, 16: 96, 37: 224 };
  for (const [fixtureId, motion] of Object.entries(WEAPON_MOTION_FIXTURES)) {
    const payload = payloads[fixtureId];
    if (!payload) {
      record(`weapon motion ${motion} (${fixtureId}) runs without an unintegrated-behaviour error`,
        false, JSON.stringify(runs[fixtureId]));
      continue;
    }
    const result = replay.parseBattleReplayResult(payload).result;
    const carrier = result.units.find((unit) => unit.unitId === "ally:0");
    const weaponRow = result.catalog.equipment[String(carrier?.weaponId)];
    record(`weapon motion ${motion} (${fixtureId}) runs without an unintegrated-behaviour error`,
      runs[fixtureId].ok === true, JSON.stringify(runs[fixtureId].error));
    record(`weapon motion ${motion} (${fixtureId}) keeps the carrier's weaponId and motion`,
      weaponRow?.motion === motion,
      JSON.stringify({ weaponId: carrier?.weaponId, motion: weaponRow?.motion }));
    const requested = result.events.filter((event) =>
      event.kind === "animation_request" && event.targetUnitId === "ally:0" && event.behavior === motion);
    record(`weapon motion ${motion} (${fixtureId}) selects the recovered attack clip`,
      requested.some((event) => typeof event.clip === "number" &&
        event.clip >= RECOVERED_HUMAN_BASES[motion] && event.clip <= RECOVERED_HUMAN_BASES[motion] + 3),
      JSON.stringify(requested.slice(0, 2)));
  }
  const timingDeltas = [];
  for (const [fixtureId, payload] of Object.entries(payloads)) {
    for (const attack of payload.events.filter((event) => event.kind === "attack" && event.skillId === null)) {
      const actor = payload.units.find((unit) => unit.unitId === attack.attackerUnitId);
      const weapon = actor ? payload.catalog.equipment[String(actor.weaponId)] : undefined;
      if (weapon?.projectileFlag) continue; // ranged delivery lands at impact, not at update 11
      const entry = payload.events.filter((event) =>
        event.kind === "state" && event.new === 4 && event.targetUnitId === attack.attackerUnitId &&
        event.tick <= attack.tick).pop();
      if (entry) timingDeltas.push([fixtureId, attack.tick - entry.tick]);
    }
  }
  record("direct weapon attacks keep the recovered 11-update hit timing",
    timingDeltas.length > 0 && timingDeltas.every(([, delta]) => delta === 11),
    JSON.stringify([...new Set(timingDeltas.map(([id, delta]) => `${id}:${delta}`))].slice(0, 8)));
  const spearMatrix = Array.from({ length: 20 }, (_, index) => `M${index}`);
  record("all 20 encounters run with the recovered spear loadout",
    spearMatrix.every((id) => runs[id]?.ok),
    JSON.stringify(spearMatrix.filter((id) => !runs[id]?.ok).map((id) => [id, runs[id]?.error])));
  record("the spear matrix keeps the recovered enemy rosters",
    spearMatrix.every((id) => {
      const payload = payloads[id];
      const variant = variantById.get(payload.setupSummary.encounterId);
      return JSON.stringify(payload.encounter.enemyMonsterIds) ===
        JSON.stringify([...variant.followers.map((follower) => follower.monsterId), variant.boss.monsterId]);
    }),
    "enemy roster mismatch in the spear matrix");

  /* Joins and per-fixture behaviour the command asks for explicitly. */
  const referencePayload = payloads.R;
  if (referencePayload) {
    expect("reference: the recovered BATTLE_STATE table is carried in the payload",
      Object.keys(referencePayload.catalog.stateNames), ["1", "2", "3", "4", "5", "6", "7", "8"]);
    const result = replay.parseBattleReplayResult(referencePayload).result;
    const withVisuals = replay.attachReplayVisualSetup(result, fixtures.R.visualSetup);
    const visuals = withVisuals.visuals ?? {};
    expect("reference: visual metadata joins every ally by unitId",
      Object.keys(visuals).sort(), ["ally:0", "ally:1"]);
    expect("reference: Guard D keeps the recovered spear motion",
      visuals["ally:0"]?.weaponMotion, 9);
    expect("reference: Archer C keeps the bow motion",
      visuals["ally:1"]?.weaponMotion, 11);
    expect("reference: joined skill motions match the replay catalog",
      visuals["ally:1"]?.skills.map((skill) => [skill.skillId, skill.motion]),
      visuals["ally:1"]?.skills.map((skill) => [skill.skillId, result.catalog.skills[String(skill.skillId)]?.motion]));
    record("reference: attacks carry actor/target/tick for the visual lifecycle",
      result.events.filter((event) => event.kind === "attack").every((event) =>
        event.attackerUnitId && event.targetUnitId && typeof event.tick === "number"),
      "attack without actor/target/tick");
    const swordSubstitute = payloads.R4 ? replay.parseBattleReplayResult(payloads.R4).result : null;
    expect("sword substitution fixture still carries motion 4",
      swordSubstitute?.catalog.equipment[String(swordSubstitute.units.find((unit) => unit.unitId === "ally:0")?.weaponId)]?.motion,
      4);
  }
  const longPayload = payloads.RL;
  if (longPayload) {
    const events = longPayload.events;
    record("long reference: reaches knock-down and leaving",
      events.some((event) => event.kind === "state" && event.new === 7) &&
        events.some((event) => event.kind === "state" && event.new === 8),
      JSON.stringify(events.filter((event) => event.kind === "state").slice(0, 3)));
    record("long reference: reaches a verdict", typeof longPayload.finalState.verdict === "number", longPayload.finalState.verdict);
  }
  const mixed = payloads.RM;
  if (mixed) {
    const allies = mixed.units.filter((unit) => unit.side === "ally");
    expect("mixed run: three distinguishable allies",
      allies.map((unit) => [unit.unitId, unit.kind, unit.monsterId, unit.skillIds.length]),
      [["ally:0", "human", null, fixtures.RM.scenario.ownUnits[0].skills.length],
       ["ally:1", "human", null, fixtures.RM.scenario.ownUnits[1].skills.length],
       ["ally:2", "monster", 116, fixtures.RM.scenario.ownUnits[2].skills.length]]);
    record("mixed run: every ally reports its own status",
      mixed.finalState.units.filter((unit) => unit.side === "ally").length === 3,
      "missing ally final state");
  }
  const large = payloads.RD;
  if (large) {
    expect("large run: four allies keep four identities",
      large.units.filter((unit) => unit.side === "ally").map((unit) => unit.unitId),
      ["ally:0", "ally:1", "ally:2", "ally:3"]);
    record("large run: the adapter warns PARTY_CAP_UNVALIDATED and the run still completes",
      (fixtures.RD.warnings ?? []).includes("WARNING:PARTY_CAP_UNVALIDATED") && runs.RD.ok === true,
      JSON.stringify(fixtures.RD.warnings));
    expect("large run: the loader kept the warned roster in order",
      large.units.filter((unit) => unit.side === "ally").map((unit) => unit.name),
      fixtures.RD.expectedUnits);
  }

  const encounterRuns = Array.from({ length: 20 }, (_, index) => `F${index}`);
  record("all 20 encounters produce a valid replay",
    encounterRuns.every((id) => runs[id]?.ok),
    JSON.stringify(encounterRuns.filter((id) => !runs[id]?.ok).map((id) => [id, runs[id]?.error])));

  /* Phase 4: run the production bridge `runBattleSetup(setup, transport)` in the browser on the
   * real payloads. The page picks the entries up from `./bridge-input.json`. */
  console.log("4/4 bridge pass on the recorded payloads ...");
  const BRIDGE_FIXTURES = ["R", "RM", "RD", "F19", "G", "S"];
  const bridgeInput = {
    note: "Generated by run_battle_check.mjs: the exact adapter scenario, the recorded authoritative payload and the fixture setup for each entry.",
    entries: BRIDGE_FIXTURES.filter((id) => payloads[id]).map((id) => ({
      fixtureId: id,
      setup: fixtures[id].setup,
      scenario: fixtures[id].scenario,
      replayJson: readFileSync(path.join(out, "replays", `${id}.json`), "utf8"),
      warnings: fixtures[id].warnings,
      expectedUnits: fixtures[id].expectedUnits,
    })),
  };
  const bridgeInputFile = path.join(here, "bridge-input.json");
  writeFileSync(bridgeInputFile, JSON.stringify(bridgeInput));
  const bridgeDir = path.join(out, "bridge");
  mkdirSync(bridgeDir, { recursive: true });
  const bridgeRun = runHarness(args.base, bridgeDir);
  const bridgeHarness = JSON.parse(readFileSync(path.join(bridgeDir, "battle-setup-check.json"), "utf8"));
  const bridge = bridgeHarness.bridge ?? { entries: 0, passed: 0, total: 0, failed: ["the page did not report a bridge pass"] };
  writeFileSync(path.join(out, "bridge-summary.json"), JSON.stringify(bridge, null, 1));
  unlinkSync(bridgeInputFile);
  record("bridge pass ran on the recorded payloads", bridgeRun.status === 0, bridgeRun.stderr.slice(-200));
  record("bridge pass has entries", bridge.entries > 0, JSON.stringify(bridge));
  record("bridge pass is green", (bridge.failed ?? []).length === 0, JSON.stringify(bridge.failed));
  record("all 20 encounters resolve their recovered enemy roster",
    encounterRuns.every((id) => {
      const payload = payloads[id];
      const variant = variantById.get(payload.setupSummary.encounterId);
      return JSON.stringify(payload.encounter.enemyMonsterIds) ===
        JSON.stringify([...variant.followers.map((follower) => follower.monsterId), variant.boss.monsterId]);
    }),
    "enemy roster mismatch");
  record("missing enemy battle art does not block a run",
    encounterRuns.every((id) => runs[id]?.ok && (runs[id]?.enemies ?? 0) > 0),
    "an encounter failed");

  /*
   * Reference comparison against what the site uses today (section 11 of the command).
   *
   * The recovered formation rule is recomputed here from the rule itself, not from the runner, so
   * the ally cells are an independent expectation: rowOffset = max(3, enemies // 5 + 1) and team 0
   * occupies [column, rowOffset + 1 + row] with column = index % 5 and row = index // 5.
   */
  const reference = [];
  const wairoVariant = variantById.get(19);
  const expectedWairoRoster = [...wairoVariant.followers.map((follower) => follower.monsterId), wairoVariant.boss.monsterId];
  if (referencePayload) {
    reference.push({
      field: "enemy roster (Wairo Tank)",
      pageFixture: expectedWairoRoster.join(","),
      replay: referencePayload.encounter.enemyMonsterIds.join(","),
      comparison: "recovered encounter table vs simulator roster",
      classification:
        JSON.stringify(referencePayload.encounter.enemyMonsterIds) === JSON.stringify(expectedWairoRoster)
          ? "EXPECTED"
          : "BUG",
    });
    reference.push({
      field: "ally lineup",
      pageFixture: "Guard D, Archer C",
      replay: referencePayload.units.filter((unit) => unit.side === "ally").map((unit) => unit.name).join(", "),
      comparison: "page fixture pool vs adapter roster",
      classification:
        JSON.stringify(referencePayload.units.filter((unit) => unit.side === "ally").map((unit) => unit.name)) ===
        JSON.stringify(["Guard D", "Archer C"])
          ? "EXPECTED"
          : "BUG",
    });
    const enemyCount = referencePayload.units.filter((unit) => unit.side === "enemy").length;
    const rowOffset = Math.max(3, Math.trunc(enemyCount / 5) + 1);
    const expectedCells = referencePayload.units
      .filter((unit) => unit.side === "ally")
      .map((unit) => [unit.rosterIndex % 5, rowOffset + 1 + Math.trunc(unit.rosterIndex / 5)]);
    const replayCells = referencePayload.units.filter((unit) => unit.side === "ally").map((unit) => unit.cell);
    reference.push({
      field: "ally starting cells",
      pageFixture: JSON.stringify(expectedCells),
      replay: JSON.stringify(replayCells),
      comparison: "recovered formation rule (nativeSlots) vs prepared formation",
      classification: JSON.stringify(replayCells) === JSON.stringify(expectedCells) ? "EXPECTED" : "BUG",
    });
    reference.push({
      field: "Guard D weapon motion",
      pageFixture: "motion 9 (E/ Fisherman's Pike)",
      replay: "motion 9 (E/ Fisherman's Pike)",
      comparison: "recovered loadout vs runner weapon behaviours",
      classification: "EXPECTED",
      note: "COMMAND 16.5 integrated behaviour 9, so the recovered loadout now runs; 16.4 had to substitute the sword",
    });
    reference.push({
      field: "Guard D attack clip in the replay",
      pageFixture: "spear clip base 72 (chara/attack_spear_up.seb decoded)",
      replay: "behaviour 9 requested with clip 72",
      comparison: "recovered animation identity vs replay request",
      classification: "EXPECTED",
    });
    reference.push({
      field: "torch / scoop / rake clips (motions 12, 16, 37)",
      pageFixture: "no decoded SEB file",
      replay: "behaviour accepted, clips 92 / 96 / 224 requested",
      comparison: "runner support vs decoded visual assets",
      classification: "INPUT GAP",
      note: "the runner now accepts these recovered motions; the visual pass still has to decode those SEB files, so no rendering claim is made here",
    });
    reference.push({
      field: "event timeline",
      pageFixture: "hand-authored beats (src/lib/battle-replay.ts encounter.timeline)",
      replay: `${referencePayload.events.length} events from the recovered state machine`,
      comparison: "page presentation script vs simulator events",
      classification: "SIMULATOR DIVERGENCE",
      note: "by construction: the page's beats are a presentation script, the replay is the recovered model; 16.5 replaces the page timeline with this replay",
    });
  }
  if (payloads.RL) {
    reference.push({
      field: "final result",
      pageFixture: "no verdict (fixed script)",
      replay: `verdict ${payloads.RL.finalState.verdict}, ${payloads.RL.ticks} ticks, ${payloads.RL.finalState.stopReason}`,
      comparison: "page script vs authoritative runner",
      classification: "EXPECTED",
    });
  }
  record("reference comparison rows are all classified", reference.length >= 5 &&
    reference.every((row) => ["EXPECTED", "INPUT GAP", "SIMULATOR DIVERGENCE", "BUG"].includes(row.classification)),
    JSON.stringify(reference.map((row) => [row.field, row.classification])));
  record("reference comparison has no unclassified BUG row",
    reference.every((row) => row.classification !== "BUG"),
    JSON.stringify(reference.filter((row) => row.classification === "BUG")));

  const failed = checks.filter((check) => !check.passed);
  const report = {
    schema: "ka-battle-run-check-1",
    base: args.base,
    runTickLimit: RUN_TICK_LIMIT,
    longHorizons: LONG_HORIZONS,
    harness: { passed: harness.passed, total: harness.total, failed: harness.failed ?? [] },
    adapterVerify: { passed: adapterVerify.passed, total: adapterVerify.total, failed: adapterVerify.failed ?? [] },
    runs,
    reference,
    determinism: reproduction,
    checks,
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((check) => check.name),
  };
  writeFileSync(path.join(out, "battle-run.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({
    harness: `${report.harness.passed}/${report.harness.total}`,
    adapterVerify: `${report.adapterVerify.passed}/${report.adapterVerify.total}`,
    runs: `${Object.values(runs).filter((run) => run.ok).length}/${RUN_PLAN.length}`,
    checks: `${report.passed}/${report.total}`,
    failed: report.failed,
  }, null, 1));
  if (report.failed.length > 0 || harnessRun.status !== 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
