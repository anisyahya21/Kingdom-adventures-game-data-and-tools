import assert from "node:assert/strict";
import {
  FACILITY_TRAINING_DATA,
  TRAINING_FACILITIES,
  XP_EMITTERS,
} from "../../src/game-data/training-facilities.ts";
import {
  createTrainingLayout,
  effectiveTrainingLevel,
  eligibleEmitters,
  emitterXpEffects,
  getBaseXp,
  getTrainingXp,
  normalizeTrainingLayout,
  placeXpEmitter,
  removeXpEmitter,
  trainingBonuses,
  trainingFootprint,
  trainingRoomOptions,
  xpEffectValue,
} from "../../src/lib/training-xp.ts";
import { placementIndex, validatePlacement } from "../../src/lib/world-builder.ts";
import { FACILITIES } from "../../src/game-data/facilities.ts";

const checks = [];
const failures = [];
function check(name, fn) {
  try {
    fn();
    checks.push(name);
  } catch (error) {
    failures.push({ name, error: String(error) });
  }
}
function expectPlacementError(result, fragment, label) {
  assert.match(result.error ?? "", new RegExp(fragment, "i"), label);
}
function add(layout, facilityId, x, y) {
  const result = placeXpEmitter(layout, facilityId, x, y);
  assert.equal(result.error, undefined, `expected facility ${facilityId} at ${x},${y} to be placeable`);
  return result.layout;
}
function record(id) {
  const facility = FACILITY_TRAINING_DATA.find((entry) => entry.id === id);
  assert.ok(facility, `missing source facility ${id}`);
  return facility;
}
function ids(sources) {
  return sources.map((source) => source.facilityId);
}

const bench = record(91);
const defensiveArmor = record(128);
const decorativePlant = record(119);
const chair = record(106);
const canal = record(41);
const restStop = record(75);
const ancestorStatue = record(182);
const orchardTree = record(223);
const orchardTreeSmall = record(229);
const santaRoom = record(236);
const sled = record(237);
const fountain = record(82);
const magicGround = record(134);
const goddessStatue = record(83);

check("catalog retains all source rows/effects and exposes exactly 45 FLAG_USE trainers", () => {
  assert.equal(FACILITY_TRAINING_DATA.length, 243);
  assert.equal(XP_EMITTERS.length, 57);
  const trainers = TRAINING_FACILITIES.filter((facility) => facility.flags & 4);
  assert.equal(trainers.length, 45);
  assert.equal(TRAINING_FACILITIES.length, 45);
  assert.equal(TRAINING_FACILITIES.every((facility) => facility.flags & 4), true);
  for (const id of [85, 86, 87, 88, 106, 135, 241]) {
    assert.equal(trainers.some((facility) => facility.id === id), false, `facility ${id} is not a trainer`);
  }
});

check("non-trainer lookup XP pairs and real emitter rows remain available as source data", () => {
  const expectedStats = new Map([
    [85, { Vigor: [5, 7], Dexterity: [5, 7], Move: [5, 7] }],
    [86, { Vigor: [10, 3], Intelligence: [5, 3], Gather: [5, 3], Heart: [5, 3] }],
    [87, { Vigor: [10, 4], Dexterity: [5, 4], Move: [5, 4] }],
    [88, { Vigor: [10, 6], Intelligence: [5, 6], Gather: [5, 6], Heart: [5, 6] }],
    [106, { Vigor: [20, 7], Intelligence: [5, 7] }],
    [135, { Move: [10, 5] }],
    [241, { Luck: [10, 90], Intelligence: [5, 90], Move: [5, 90], Heart: [15, 90] }],
  ]);
  for (const [id, stats] of expectedStats) {
    const facility = record(id);
    assert.equal(facility.flags & 4, 0);
    for (const [name, [initial, increment]] of Object.entries(stats)) {
      assert.deepEqual(facility.baseXp[name], { initial, increment }, `${facility.name} ${name}`);
    }
  }
  assert.deepEqual(XP_EMITTERS.filter((effect) => [85, 86, 87, 88, 135].includes(effect.facilityId)), []);
  assert.deepEqual(XP_EMITTERS.filter((effect) => effect.facilityId === 106).map(({ type, min, max }) => ({ type, min, max })), [{ type: 22, min: 5, max: 25 }]);
  assert.deepEqual(XP_EMITTERS.filter((effect) => effect.facilityId === 241).map(({ type, min, max }) => ({ type, min, max })), [{ type: 20, min: 5, max: 25 }]);
});

check("Bench parameter XP follows the source curve at levels 1 and 99", () => {
  assert.equal(getBaseXp(bench, "Speed", 1), 5);
  assert.equal(getBaseXp(bench, "Speed", 99), 299);
  assert.deepEqual(bench.baseXp.Speed, { initial: 5, increment: 3 });
});

check("native 5-to-25 effect interpolation uses expected level endpoints and interior values", () => {
  for (const [level, expected] of [[1, 5], [25, 9], [50, 14], [75, 19], [99, 24], [100, 25]]) {
    assert.equal(xpEffectValue(5, 25, level), expected, `effect at level ${level}`);
  }
});

check("shared same-facility levels stack once per source and round only after summing", () => {
  let layout = createTrainingLayout(defensiveArmor, "15-XL");
  layout = add(layout, 128, 5, 5);
  layout = add(layout, 128, 7, 5);
  const bonuses = trainingBonuses(layout, { 128: 50 });
  assert.equal(bonuses.Defence, 28); // Two level-50 +14 contributions.
  assert.equal(getTrainingXp(defensiveArmor, "Defence", 1, bonuses), 25); // trunc(20 * 1.28)
  assert.equal(getBaseXp(defensiveArmor, "Defence", 99), 412);
});

check("small base XP retains native truncation when two same-type sources stack", () => {
  let layout = createTrainingLayout(decorativePlant, "15-XL");
  layout = add(layout, 149, 6, 5);
  layout = add(layout, 149, 8, 5);
  const bonuses = trainingBonuses(layout, { 119: 1, 149: 1 });
  assert.equal(bonuses.Speed, 10);
  assert.equal(getTrainingXp(decorativePlant, "Speed", 1, bonuses), 3); // trunc(3 * 1.10)
});

check("immune targets reject effect layouts and do not receive a supplied percent", () => {
  assert.equal((canal.flags & 2097152) !== 0, true);
  assert.equal(eligibleEmitters(canal).length, 0);
  assert.deepEqual(trainingBonuses(createTrainingLayout(canal), { 23: 100 }), {});
  assert.equal(getTrainingXp(canal, "Gather", 1, { Gather: 100 }), getBaseXp(canal, "Gather", 1));
});

check("a non-upgradeable emitter stays at its level-one effect value", () => {
  const layout = add(createTrainingLayout(bench), 226, 1, 1);
  assert.equal(effectiveTrainingLevel(record(226), 100), 1);
  assert.equal(trainingBonuses(layout, { 226: 100 }).Gather, 5);
});

check("layouts reject full-footprint overlap, out-of-bounds, incompatible, and built-in manual sources", () => {
  let layout = createTrainingLayout(restStop);
  assert.deepEqual(trainingFootprint(75), { width: 2, height: 2 });
  layout = add(layout, 75, 6, 0);
  expectPlacementError(placeXpEmitter(layout, 75, 5, 0), "another facility occupies", "overlapping 2x2 source is rejected");
  expectPlacementError(placeXpEmitter(layout, 75, 7, 0), "whole facility inside", "partial out-of-bounds footprint is rejected");
  expectPlacementError(placeXpEmitter(layout, 23, 0, 0), "cannot be added", "incompatible source rejected");
  const nonInn = createTrainingLayout(chair, "9-XL");
  expectPlacementError(placeXpEmitter(nonInn, 155, 9, 4), "cannot be added", "host-supplied Guest Bed cannot be placed manually");
});

check("a compound Rest Stop target receives each valid 2x2 emitter exactly once", () => {
  let layout = createTrainingLayout(restStop);
  assert.deepEqual(layout.target, { x: 3, y: 3, width: 2, height: 2 });
  layout = add(layout, 75, 6, 0); // Only the expanded rectangle reaches its partial target edge.
  assert.deepEqual(trainingBonuses(layout, { 75: 1 }), { Heart: 5 });
  layout = add(layout, 75, 0, 6);
  assert.deepEqual(trainingBonuses(layout, { 75: 1 }), { Heart: 10 });
});

check("compound sources can reach by their expanded footprint rather than their anchor cell", () => {
  let layout = createTrainingLayout(bench);
  layout = add(layout, 75, 4, 0); // 2x2 footprint reaches the target's (3,3) corner cell.
  assert.equal(trainingBonuses(layout, { 75: 1 }).Heart, 5);
});

check("fixed host selection uses the native Royal Room target and host sources", () => {
  const options = trainingRoomOptions(ancestorStatue);
  assert.equal(options.some((option) => option.key === "1-XL:2"), true);
  const layout = createTrainingLayout(ancestorStatue, "1-XL:2");
  assert.deepEqual(layout.target, { x: 4, y: 11, width: 1, height: 1 });
  assert.deepEqual(layout.sources, []);
});

check("Orchard fixture options preserve separate fixed fruit-tree instances", () => {
  const options = trainingRoomOptions(orchardTreeSmall);
  assert.equal(new Set(options.map((option) => option.key)).size, options.length);
  assert.equal(options.some((option) => option.key === "18-S:2"), true);
  assert.equal(options.some((option) => option.key === "18-S:3"), true);
  const first = createTrainingLayout(orchardTreeSmall, "18-S:2");
  assert.deepEqual(first.target, { x: 4, y: 7, width: 1, height: 1 });
});

check("second Orchard S Fruit Tree option targets its own fixture location", () => {
  const second = createTrainingLayout(orchardTreeSmall, "18-S:3");
  assert.deepEqual(second.target, { x: 7, y: 7, width: 1, height: 1 });
});

check("short Orchard S target uses the fixed 2x2 Fruit Tree location", () => {
  const short = createTrainingLayout(orchardTree, "18-S:1");
  assert.deepEqual(short.target, { x: 6, y: 4, width: 2, height: 2 });
});

check("short Orchard S receives one +5 Gather from each fixed small Fruit Tree", () => {
  const short = createTrainingLayout(orchardTree, "18-S:1");
  assert.deepEqual(ids(short.sources), [229, 229]);
  assert.deepEqual(short.sources.map(({ x, y }) => ({ x, y })), [{ x: 4, y: 7 }, { x: 7, y: 7 }]);
  assert.equal(trainingBonuses(short, {}).Gather, 10);
});

check("XL Orchard keeps its two sources but neither reaches the fixed Fruit Tree", () => {
  const xl = createTrainingLayout(orchardTree, "18-XL:1");
  assert.deepEqual(ids(xl.sources), [229, 229]);
  assert.equal(trainingBonuses(xl, {}).Gather ?? 0, 0);
});

check("Santa House layouts preserve both fixed target coordinates and reciprocal XP sources", () => {
  const roomXL = createTrainingLayout(santaRoom, "19-XL:1");
  assert.deepEqual(roomXL.target, { x: 8, y: 4, width: 2, height: 2 });
  assert.deepEqual(ids(roomXL.sources), [237]);
  const sledXL = createTrainingLayout(sled, "19-XL:2");
  assert.deepEqual(sledXL.target, { x: 4, y: 11, width: 1, height: 1 });
  assert.deepEqual(ids(sledXL.sources), [236]);
  const sledShort = createTrainingLayout(sled, "19-S:2");
  assert.equal(trainingBonuses(sledShort, {}).Heart, 5);
});

check("indoor training accepts an in-range outdoor emitter just outside the room", () => {
  const layout = createTrainingLayout(chair, "9-XL");
  assert.deepEqual(layout.target, { x: 5, y: 4, width: 1, height: 1 });
  const placed = placeXpEmitter(layout, 24, 2, 4);
  assert.equal(placed.error, undefined);
  assert.equal(trainingBonuses(placed.layout, {}).Vigor, 5);
});

check("Inn starts with two fixed Guest Beds, enforces two maximum, and permits remove/re-add", () => {
  let layout = createTrainingLayout(fountain, "7-XL");
  let beds = layout.sources.filter((source) => source.facilityId === 155);
  assert.equal(beds.length, 2);
  assert.equal(beds.every((source) => source.provided && !source.fixed), true);
  assert.equal(trainingBonuses(layout, {}).Vigor, 5); // Only the nearby Guest Bed is in range.
  const removed = beds[0];
  layout = removeXpEmitter(layout, removed.id);
  assert.equal(layout.sources.filter((source) => source.facilityId === 155).length, 1);
  layout = add(layout, 155, removed.x, removed.y);
  assert.equal(layout.sources.filter((source) => source.facilityId === 155).length, 2);
  expectPlacementError(placeXpEmitter(layout, 155, 8, 4), "two Guest Beds", "third Guest Bed rejected by host limit");
});

check("legacy Magic Training Ground coordinates survive room-padding migration", () => {
  const legacy = {
    targetId: 134,
    width: 8,
    height: 10,
    target: { x: 3, y: 4, width: 2, height: 2 },
    sources: [{ id: "legacy-magic-source", facilityId: 134, x: 2, y: 2, width: 1, height: 1 }],
    blocked: [],
  };
  const normalized = normalizeTrainingLayout(legacy, magicGround);
  const source = normalized.sources.find((entry) => entry.id === "legacy-magic-source");
  assert.deepEqual(source && { x: source.x, y: source.y, width: source.width, height: source.height }, { x: 5, y: 5, width: 1, height: 1 });
  assert.equal(normalized.warning, undefined);
});

check("nearby town-expansion emitters cannot form an impossible Torch/Night Meeting pair", () => {
  let layout = createTrainingLayout(bench);
  layout = add(layout, 29, 0, 0);
  expectPlacementError(placeXpEmitter(layout, 30, 0, 2), "too close to Torch", "night meeting place cannot overlap Torch expansion exclusion");
});

check("open-town Goddess Statue options exclude Chair and all indoor-only emitters", () => {
  const layout = createTrainingLayout(goddessStatue, "town-land");
  const eligible = eligibleEmitters(goddessStatue, layout);
  const indoorIds = new Set(FACILITIES.filter((facility) => facility.tab === "indoors").map((facility) => facility.id));
  assert.equal(eligible.some((source) => source.id === 106), false);
  assert.equal(eligible.some((source) => indoorIds.has(source.id)), false);
});

check("every listed option has at least one legal cell accepted by placeXpEmitter", () => {
  const cases = [
    [goddessStatue, "town-land"],
    [magicGround, "15-XL"],
    [orchardTree, "18-S:1"],
    [ancestorStatue, "1-XL:2"],
  ];
  for (const [target, roomKey] of cases) {
    const layout = createTrainingLayout(target, roomKey);
    for (const source of eligibleEmitters(target, layout)) {
      let validCell = false;
      for (let y = 0; y < layout.height && !validCell; y += 1) {
        for (let x = 0; x < layout.width && !validCell; x += 1) {
          validCell = placeXpEmitter(layout, source.id, x, y).error === undefined;
        }
      }
      assert.equal(validCell, true, `${target.name} listed unusable emitter ${source.id}`);
    }
  }
});

check("every trainer picker option emits a positive XP effect for a stat that trainer gains", () => {
  for (const target of TRAINING_FACILITIES) {
    const layout = createTrainingLayout(target);
    for (const emitter of eligibleEmitters(target, layout)) {
      const effects = emitterXpEffects(layout, emitter.id, {});
      assert.ok(Object.entries(effects).some(([stat, percent]) => target.stats.includes(stat) && percent > 0), `${target.id} offered unrelated emitter ${emitter.id}`);
    }
  }
});

check("valid XP emitters remain selectable when integer XP currently rounds down", () => {
  const layout = createTrainingLayout(magicGround);
  assert.ok(eligibleEmitters(magicGround, layout).some(source => source.id === 134));
  assert.deepEqual(emitterXpEffects(layout, 134, {}), { Intelligence: 5 });
  assert.equal(getTrainingXp(magicGround, "Intelligence", 1, { Intelligence: 5 }), getBaseXp(magicGround, "Intelligence", 1));
});

check("the full-grid-blocked layout offers no legal emitter options", () => {
  const layout = createTrainingLayout(goddessStatue, "town-land");
  layout.blocked = Array.from({ length: layout.width * layout.height }, (_, index) => ({
    x: index % layout.width,
    y: Math.floor(index / layout.width),
    reason: "Filled cell",
  }));
  assert.deepEqual(eligibleEmitters(goddessStatue, layout), []);
});

check("built-in Guest Bed cannot be manually added outside its Inn host", () => {
  const layout = createTrainingLayout(fountain, "town-land");
  assert.equal(eligibleEmitters(fountain, layout).some((source) => source.id === 155), false);
  expectPlacementError(placeXpEmitter(layout, 155, 1, 1), "cannot be added", "host-only source rejected outside Inn");
});

check("shared world-builder still enforces finite placement caps", () => {
  const items = Array.from({ length: 7 }, (_, index) => ({
    id: `capped-${index}`,
    kind: "facility",
    facilityId: 191,
    x: index * 3,
    y: 30,
    direction: 0,
    level: 1,
    fullness: 0,
  }));
  const state = { version: 1, items, reclaimed: [] };
  const index = placementIndex(state, new Set());
  const result = validatePlacement({ id: "capped-next", kind: "facility", facilityId: 191, x: 40, y: 30, direction: 0, level: 1, fullness: 0 }, state, index);
  assert.match(result.error ?? "", /limit reached \(7\/7\)/);
});

process.stdout.write(`${JSON.stringify({ schema: "ka-training-xp-check-2", passed: checks.length, failed: failures.length, checks, failures }, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
