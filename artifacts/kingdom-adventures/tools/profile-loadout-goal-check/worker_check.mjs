import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { searchProfileGoalBuildPages } from "../../src/lib/profile-loadout-goal-planner.ts";
import { prepareProfileWorkerInput } from "../../src/lib/profile-goal-worker-protocol.ts";

const character = (id, goals = { atk: { mode: "min", min: 0 } }, baseStats = { atk: 1, lck: 1 }) => ({
  id, name: id, available: true, eligible: true,
  input: { goals, baseStats, slots: [{ slot: "Weapon", items: ["owned", "unowned"] }],
    contribution: (_item, level) => ({ atk: level, lck: level % 3 }) },
});
const inventory = [{ item: "owned", ownership: "owned", currentLevel: 1 }];
const cases = [
  { name: "multiple-pages", characters: Array.from({ length: 45 }, (_, i) => character(String(i))), upgrades: false },
  { name: "upgrades", characters: [character("upgrade")], upgrades: true },
  { name: "nearest-upgrades", characters: [character("closest", {})], upgrades: true, nearestTargets: { atk: 51, lck: 2 } },
  { name: "no-matches", characters: [character("none", { atk: { mode: "min", min: 1000 } })], upgrades: false },
  { name: "multi-page-frontier", characters: Array.from({ length: 45 }, (_, i) => ({ ...character(String(i), { atk: { mode: "maximize" }, lck: { mode: "maximize" } }, { atk: i, lck: 45 - i }), input: { ...character(String(i)).input, slots: [], baseStats: { atk: i, lck: 45 - i }, goals: { atk: { mode: "maximize" }, lck: { mode: "maximize" } } } })), upgrades: false },
];
if (!process.argv[2]) {
  for (const test of cases) execFileSync(process.execPath, ["--import", "./tools/battle-setup-check/register.mjs", fileURLToPath(import.meta.url), test.name], { stdio: "inherit" });
  process.exit(0);
}
for (const test of cases.filter((entry) => entry.name === process.argv[2])) {
  const input = { characters: test.characters, inventory };
  const prepared = structuredClone(await prepareProfileWorkerInput(input, test.upgrades, new AbortController().signal, () => {}));
  const expected = [];
  for await (const page of searchProfileGoalBuildPages(input, { nearestTargets: test.nearestTargets, pageSize: 40, nodeSliceSize: 1500, inventoryPolicy: test.upgrades ? "owned-upgrades" : "owned-current", includeCurrentBuilds: test.upgrades })) {
    if (!page.optimizing || page.completedCharacters === page.totalCharacters) expected.push(...page.builds);
  }
  const messages = [];
  globalThis.self = { postMessage: (message) => messages.push(structuredClone(message)) };
  await import("../../src/workers/profile-goal-search.worker.ts");
  await self.onmessage({ data: { type: "start", input: prepared, upgrades: test.upgrades, nearestTargets: test.nearestTargets } });
  assert.equal(messages.find((message) => message.type === "error"), undefined);
  assert.equal(messages.at(-1).progress.complete, true);
  assert.equal(messages.at(-1).progress.matchingBuilds, expected.length);
  const actual = [];
  for (let page = 0; page < Math.ceil(expected.length / 40); page++) {
    await self.onmessage({ data: { type: "page", page } });
    actual.push(...messages.at(-1).builds);
  }
  assert.deepEqual(actual, expected, test.name);
  await self.onmessage({ data: { type: "page", page: 0 } });
  assert.deepEqual(messages.at(-1).builds, expected.slice(0, 40));
  console.log(`${test.name}: ${actual.length} results, all pages match existing evaluator`);
}
const aborted = new AbortController(); aborted.abort();
await assert.rejects(prepareProfileWorkerInput({ characters: [], inventory: [] }, false, aborted.signal, () => {}), { name: "AbortError" });
console.log("Aborted preparation rejected; serialized inputs contain no functions.");
