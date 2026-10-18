import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { reminderGachaGroup } from "../../src/lib/event-reminder-catalog.ts";
import { FACILITY_GACHA_EVENTS } from "../../src/game-data/facility-gacha-events.ts";

// Execute the real catalog declarations without importing the full React page.
const source = readFileSync(new URL("../../src/pages/gacha-events.tsx", import.meta.url), "utf8");
const start = source.indexOf("function namedWeaponPoolTitle");
const end = source.indexOf("export function buildGachaEventWindow");
const exports = {};
runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, FACILITY_GACHA_EVENTS });
const catalog = exports.ALL_GACHA_EVENTS;
const weapons = catalog.filter((event) => event.kind === "weapons");
const included = weapons.filter((event) => reminderGachaGroup(event) !== null);
assert.equal(included.length, 36);
assert.ok(included.every((event) => event.weaponRank === "S" && event.notes.split(" | ").every((name) => name.startsWith("S/ "))));
assert.ok(weapons.filter((event) => event.title === "Kairo Series").every((event) => reminderGachaGroup(event) === null));
assert.equal(reminderGachaGroup({ kind: "items", title: "Items" }), null);
assert.equal(reminderGachaGroup({ kind: "weapons", title: "S Rank misleading title" }), null);
assert.ok(catalog.filter((event) => event.kind === "jobs").every((event) => reminderGachaGroup(event) === "S Rank Gacha"));
assert.ok(catalog.filter((event) => event.kind === "facilities").every((event) => reminderGachaGroup(event) === "S Rank Facility"));
console.log(JSON.stringify({ ok: true, sWeaponEvents: included.length, excludedOtherWeaponEvents: weapons.length - included.length, unchangedJobAndFacilityCoverage: true }));
