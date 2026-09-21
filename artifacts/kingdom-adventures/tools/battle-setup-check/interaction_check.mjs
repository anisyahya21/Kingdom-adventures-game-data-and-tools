/**
 * Interactive-consumable helper contract check - pure Node, no bundler, no browser.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/interaction_check.mjs
 *
 * Runs the real `@/lib/battle-interaction` module against REAL stored data:
 *   * the canonical recovery catalogue decides which icons are supported (single-resident rows are
 *     disabled with the recovered reason);
 *   * the displayed tick/stock/prefix indicators are read from the replay the page is showing;
 *   * a realistic `ka-battle-interaction-1` payload (built from a recorded `ka-battle-replay-1`) is
 *     parsed and accepted, and a refusal envelope stays a refusal with its own code;
 *   * the store's source scenario survives a round trip, and its absence is reported instead of guessed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BATTLE_INTERACTION_POLL_SCHEMA,
  BATTLE_INTERACTION_SCHEMA,
  BATTLE_INTERACTION_WINDOW_TICKS,
  buildBattleInteractionRequest,
  consumableAvailability,
  inlineBattleInteractionTransport,
  interactionFromTick,
  interactionCapabilities,
  interactionScenarioFromRecord,
  mergeBranchExtension,
  parseBattleInteractionPoll,
  parseBattleInteractionResponse,
  planConsumableClick,
  preservedPrefixLength,
  replayTickIndicators,
  requestBattleInteraction,
  requestBattleBranchPoll,
  stockAtTick,
} from "@/lib/battle-interaction";
import { GENERATED_BATTLE_STORE_VERSION, readGeneratedBattle, withGeneratedBattleScenario } from "@/lib/generated-battle-store";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const REPLAYS = path.join(WORKSPACE, "RE-evidence", "20260919-configurable-battle-setup", "run-battle-16.5", "replays");

const checks = [];
function check(name, actual, expected) {
  checks.push({ name, actual, expected, passed: JSON.stringify(actual) === JSON.stringify(expected) });
}
function ok(name, condition) {
  checks.push({ name, actual: condition, expected: true, passed: Boolean(condition) });
}

const replay = JSON.parse(readFileSync(path.join(REPLAYS, "A.json"), "utf8"));
const scenario = {
  schema: "ka-special-combat-research-1",
  encounterId: 19,
  defeatCount: 0,
  mathSeed: 7,
  libSeed: 8,
  tickLimit: replay.setupSummary.tickLimit,
  holyHerbStock: 2,
  items: {
    "Recovery Potion (L)": { bonusCategory: 3, bonusType: 0, bonusMinValue: 50, bonusMaxValue: 50 },
    "Recovery Potion (S)": { bonusCategory: 3, bonusType: 1, bonusMinValue: 50, bonusMaxValue: 50 },
  },
  itemStock: { "Recovery Potion (L)": 2, "Recovery Potion (S)": 1 },
  inputs: [],
};

const rows = interactionCapabilities({ scenario });
const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
check("capabilities cover herb plus declared rows", rows.map((row) => row.name), [
  "holy_herb",
  "Recovery Potion (L)",
  "Recovery Potion (S)",
]);
check("all-residents row is supported", [byName["Recovery Potion (L)"].supported, byName["Recovery Potion (L)"].parameter], [true, 10]);
check("single-resident row is disabled", [byName["Recovery Potion (S)"].supported, byName["Recovery Potion (S)"].scope], [false, "single"]);
ok("disabled row states the recovered reason", /null single target/.test(byName["Recovery Potion (S)"].disabledReason));
check("declared stock is read from the scenario", [byName.holy_herb.declaredStock, byName["Recovery Potion (L)"].declaredStock], [2, 2]);
check("aliases come from the canonical catalogue", byName["Recovery Potion (L)"].aliases.includes("Large Potion"), true);
check("availability combines support and stock", [
  consumableAvailability(byName["Recovery Potion (L)"], 1).usable,
  consumableAvailability(byName["Recovery Potion (L)"], 0).reason,
  consumableAvailability(byName["Recovery Potion (S)"], 5).usable,
], [true, "no stock left at the displayed tick", false]);

const indicators = replayTickIndicators(replay);
check("tick indicator reports the stored event stream", [indicators.replayTicks, indicators.lastEventTick], [replay.ticks, Math.max(...replay.events.map((event) => event.tick))]);
ok("tick indicator names its source", /replay\.events\[\]\.tick/.test(indicators.source));

const tick = replay.events[Math.floor(replay.events.length / 2)].tick; // a mid-fight tick, not initialization (-1)
ok("the checked tick is a running-fight tick", tick > 0);
const withItem = {
  ...replay,
  setupSummary: { ...replay.setupSummary, holyHerbStock: 2 },
  events: [
    ...replay.events.filter((event) => event.tick < tick),
    { seq: 9000, tick, phase: "fighters", kind: "battle_item", item: "holy_herb", used: true, remaining: 1 },
    ...replay.events.filter((event) => event.tick >= tick),
  ],
};
check("stock at tick reads the runner's own remaining", stockAtTick(withItem, "holy_herb", tick), 1);
check("stock before that dispatch is the declared value", stockAtTick(withItem, "holy_herb", tick - 1), 2);

const built = buildBattleInteractionRequest({ scenario, item: "holy_herb", tick, displayedReplay: replay });
ok("request builds for a valid tick", built.ok === true);
check("request carries the displayed prefix guard", built.body.expectedPrefixEventCount, replay.events.filter((event) => event.tick < tick).length);
check("request names the envelope", built.body.schema, BATTLE_INTERACTION_SCHEMA);
ok("request refuses a non-integer tick", buildBattleInteractionRequest({ scenario, item: "holy_herb", tick: 1.5 }).ok === false);
ok("request refuses a foreign scenario", buildBattleInteractionRequest({ scenario: { schema: "ka-other-1" }, item: "holy_herb", tick: 1 }).ok === false);

const branch = { ...replay, events: replay.events.map((event, index) => (index === 7 ? { ...event, hp: 1 } : event)) };
check("prefix length is the full pre-command prefix", preservedPrefixLength(replay, replay, tick), replay.events.filter((event) => event.tick < tick).length);
ok("prefix comparison stops at a changed event", preservedPrefixLength(replay, branch, tick) === 7);

const response = {
  schema: BATTLE_INTERACTION_SCHEMA,
  status: "accepted",
  command: {
    tick,
    phase: "before_fighters",
    item: "holy_herb",
    resolved: { type: "holy_herb", parameter: 11, scope: "all", supported: true, declaredStock: 2 },
    scheduleIndex: 0,
    scheduledInputs: [{ tick, type: "holy_herb", phase: "before_fighters" }],
  },
  acceptance: {
    accepted: true,
    used: true,
    blocked: null,
    reason: "the runner restored at least one resident and spent one unit of stock",
    parameter: 11,
    scope: "all",
    percent: 100,
    targetUnitIds: ["ally:0", "ally:1"],
    changed: [{ unitId: "ally:1", parameter: 11, before: 900, after: 1000, max: 1000, seq: 12 }],
    stock: { item: "holy_herb", declared: 2, before: 1, after: 0, spent: true },
  },
  prefix: {
    commandTick: tick,
    eventCount: replay.events.filter((event) => event.tick < tick).length,
    lastTick: tick - 1,
    digest: `sha256:${"0".repeat(64)}`,
    displayedTick: tick,
  },
  indicators: {
    tick: { ...indicators, commandTick: tick, phase: "before_fighters", displayedTick: tick },
    stock: { item: "holy_herb", declared: 2, before: 1, after: 0, spent: true },
  },
  consumables: rows,
  scenario,
  replay,
  limits: ["one command per request"],
};
const parsed = parseBattleInteractionResponse(response);
check("a realistic payload parses", parsed.issues, []);
check("parsed acceptance keeps the runner's numbers", parsed.result.acceptance.stock, { item: "holy_herb", declared: 2, before: 1, after: 0, spent: true });
check("parsed branch replay is the authoritative payload", parsed.result.replay.schema, replay.schema);
ok("a malformed payload is rejected", parseBattleInteractionResponse({ ...response, replay: {} }).result === undefined);

const delivered = await requestBattleInteraction(built.body, inlineBattleInteractionTransport(() => ({ ok: true, status: 200, text: JSON.stringify(response) })));
ok("transport round trip succeeds", delivered.ok === true && delivered.result.prefix.commandTick === tick);
const refused = await requestBattleInteraction(
  built.body,
  inlineBattleInteractionTransport(() => ({
    ok: false,
    status: 409,
    text: JSON.stringify({
      schema: "ka-battle-run-error-1",
      status: 409,
      code: "interaction-no-stock",
      message: "the runner refused the dispatch at tick 54: no stock",
      acceptance: response.acceptance,
    }),
  })),
);
ok("a refusal keeps its own code and acceptance", refused.ok === false && refused.code === "interaction-no-stock" && refused.status === 409 && refused.acceptance.stock.after === 0);
const unavailable = interactionScenarioFromRecord({ storeVersion: GENERATED_BATTLE_STORE_VERSION, replay, warnings: [], summary: {} });
ok("a record without a source scenario says so", unavailable.ok === false && /no source scenario/.test(unavailable.reason));
const record = withGeneratedBattleScenario({ storeVersion: GENERATED_BATTLE_STORE_VERSION, replay, warnings: [], summary: {} }, JSON.stringify(scenario));
ok("the scenario survives the record round trip", interactionScenarioFromRecord(record).ok === true);
const read = readGeneratedBattle(JSON.stringify(record));
ok("the store still reads a record with a scenario", read.status === "ok" && typeof read.record.scenarioJson === "string");
ok("the store still reads a legacy record", readGeneratedBattle(JSON.stringify({ ...record, scenarioJson: undefined })).status === "ok");

/* ------------------------------------------------------------------ */
/* Fast path: the live window, the branch-job poll and the click plan   */
/* ------------------------------------------------------------------ */

const windowed = buildBattleInteractionRequest({
  scenario,
  item: "holy_herb",
  tick,
  displayedReplay: replay,
  windowTicks: BATTLE_INTERACTION_WINDOW_TICKS,
});
check("a windowed request asks for a playback window", windowed.body.windowTicks, BATTLE_INTERACTION_WINDOW_TICKS);
ok("a plain request stays the full-branch request", built.body.windowTicks === undefined);

const windowStopTick = tick + BATTLE_INTERACTION_WINDOW_TICKS;
const windowReplay = {
  ...replay,
  events: replay.events.filter((event) => event.tick <= windowStopTick),
  finalState: {
    ...replay.finalState,
    windowed: true,
    windowStopTick,
    windowHorizonTick: replay.ticks - 1,
    windowRemainingTicks: replay.ticks - 1 - windowStopTick,
    censored: true,
  },
};
const windowResponse = {
  ...response,
  replay: windowReplay,
  window: {
    stopTick: windowStopTick,
    horizonTick: replay.ticks - 1,
    remainingTicks: replay.ticks - 1 - windowStopTick,
    jobId: "branch-test-1",
    state: "running",
    complete: false,
  },
};
const parsedWindow = parseBattleInteractionResponse(windowResponse);
check("a windowed payload parses", parsedWindow.issues, []);
check("the parsed window names its job and remaining ticks", [
  parsedWindow.result.window.jobId,
  parsedWindow.result.window.remainingTicks,
  parsedWindow.result.window.complete,
], ["branch-test-1", replay.ticks - 1 - windowStopTick, false]);
check("a window keeps the declared horizon", parsedWindow.result.replay.ticks, replay.ticks);
ok(
  "a window without a job is refused (it could never be finished)",
  parseBattleInteractionResponse({ ...windowResponse, window: { ...windowResponse.window, jobId: null } }).result === undefined,
);

check("the extension boundary is the first missing tick", interactionFromTick(windowReplay), windowStopTick + 1);
const prefixEventCount = windowReplay.events.filter((event) => event.tick <= windowStopTick).length;
const deltaReplay = {
  ...replay,
  events: replay.events.filter((event) => event.tick > windowStopTick),
};
const merged = mergeBranchExtension(windowReplay, { replay: deltaReplay, prefixEventCount, fromTick: windowStopTick + 1 });
ok("an exact prefix extension splices into the displayed branch", merged.ok === true);
check("the spliced branch is the whole branch again", merged.ok ? merged.replay.events.length : -1, replay.events.length);
ok(
  "an extension with a different prefix is refused",
  mergeBranchExtension(windowReplay, { replay: deltaReplay, prefixEventCount: prefixEventCount + 1, fromTick: windowStopTick + 1 }).ok === false,
);
ok(
  "an extension that ends earlier is refused",
  mergeBranchExtension(replay, { replay: windowReplay, prefixEventCount, fromTick: windowStopTick + 1 }).ok === false,
);

const pollReply = {
  schema: BATTLE_INTERACTION_POLL_SCHEMA,
  jobId: "branch-test-1",
  state: "ready",
  fromTick: windowStopTick + 1,
  prefixEventCount,
  window: { stopTick: null, horizonTick: replay.ticks - 1, remainingTicks: null, complete: true },
  replay: deltaReplay,
  limits: ["window"],
};
const parsedPoll = parseBattleInteractionPoll(pollReply);
check("a poll reply parses", parsedPoll.issues, []);
check("the parsed poll keeps the splice guard", [parsedPoll.reply.prefixEventCount, parsedPoll.reply.window.complete], [prefixEventCount, true]);
ok("a poll reply without a prefix count is rejected", parseBattleInteractionPoll({ ...pollReply, prefixEventCount: undefined }).reply === undefined);
const polled = await requestBattleBranchPoll(
  { schema: BATTLE_INTERACTION_POLL_SCHEMA, jobId: "branch-test-1", fromTick: windowStopTick + 1 },
  async () => ({ ok: true, status: 200, text: JSON.stringify(pollReply) }),
);
ok("the poll transport round trips", polled.ok === true && polled.reply.state === "ready");
const pendingPoll = await requestBattleBranchPoll(
  { schema: BATTLE_INTERACTION_POLL_SCHEMA, jobId: "branch-test-1", fromTick: windowStopTick + 1 },
  async () => ({
    ok: false,
    status: 409,
    text: JSON.stringify({
      schema: "ka-battle-run-error-1",
      status: 409,
      code: "interaction-job-pending",
      message: "the branch job has not finished its first stride yet; retry",
    }),
  }),
);
ok("a pending poll is an explicit retry", pendingPoll.ok === false && pendingPoll.code === "interaction-job-pending");

const frames = Array.from({ length: 40 }, (_, index) => ({ tick: index * 10 }));
check("a click captures the frame tick synchronously", planConsumableClick({ frames, step: 7, playing: true, busy: null }), { ok: true, tick: 70, resumePlaying: true });
check("a click while paused does not resume playback", planConsumableClick({ frames, step: 7, playing: false, busy: null }).resumePlaying, false);
ok("a second in-flight click is refused with a reason", planConsumableClick({ frames, step: 7, playing: true, busy: "holy_herb" }).ok === false);
ok("a click after the verdict is refused", planConsumableClick({ frames, step: 7, playing: true, busy: null, ended: true }).ok === false);
ok("a click without a branch source is refused", planConsumableClick({ frames, step: 7, playing: true, busy: null, sourceIssue: "no source scenario" }).ok === false);

const failed = checks.filter((entry) => !entry.passed);
console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failed.length, failed: failed.map((entry) => entry.name) }));
if (failed.length > 0) {
  console.error(JSON.stringify(failed, null, 1));
  process.exit(1);
}
