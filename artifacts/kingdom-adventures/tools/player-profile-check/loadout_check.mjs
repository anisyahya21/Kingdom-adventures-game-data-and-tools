import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { localSharedData } from "../../src/lib/local-shared-data.ts";
import { STAT_CANONICAL } from "../../src/game-data/stat-parameter-ids.ts";
import { residentStatItemBonuses } from "../../src/game-data/resident-stat-items.ts";

// Execute the actual page calculations and its expanded-editor memo expression.
// The legal fixture isolates inventory/level propagation from native admission checks.
const source = readFileSync(new URL("../../src/pages/loadout.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("loadout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["statAtLevel", "getStatLevel", "normStat", "calcJobStats", "withProfileInventory", "calcEquipStats", "calcStats"]);
const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(declarations.length, names.size);
let editorMemo;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "equipStats") editorMemo = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(editorMemo);
const compiled = ts.transpileModule(declarations.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { STAT_CANONICAL, residentStatItemBonuses, getEquipRuleState: () => ({ blocked: false, appliesPenalty: false }), useMemo: (compute) => compute() };
const functions = runInNewContext(`${compiled}\n({calcStats, calcEquipStats, withProfileInventory})`, context);
const loadout = { jobName: "Merchant", rank: "D", statLevels: { hp: 12 }, useProfileInventory: true,
  equipment: [{ name: "F/ Wooden Club", level: 17 }, { name: "F/ Wooden Spear", level: 99 }], residentStatItems: { life: 4 } };
const profileEquipment = { "F/ Wooden Club": 23 };
const totals = functions.calcStats(loadout, localSharedData, profileEquipment);
assert.equal(totals.hp, 185, "HP level12 + live owned club23 + four waters, without locked spear");
assert.equal(totals.atk, 34);
assert.equal(functions.withProfileInventory(loadout, profileEquipment).equipment.length, 1);
assert.equal(loadout.equipment[0].level, 17, "calculations must not mutate stored drafts");
assert.equal(functions.calcStats(loadout, localSharedData, {}).atk, 8, "locking all equipment removes its bonus");
assert.equal(functions.calcStats({ ...loadout, residentStatItems: {} }, localSharedData, profileEquipment).hp, 145, "zero water counts stay authoritative");
const sandbox = { ...loadout, useProfileInventory: false, equipment: [loadout.equipment[0]] };
assert.equal(functions.calcStats(sandbox, localSharedData, profileEquipment).atk, 28, "sandbox retains manual level17");
assert.equal(runInNewContext(`${compiled}\n${editorMemo}`, { ...context, loadout, data: localSharedData, profileEquipment }).atk, 26, "expanded editor must forward live inventory to the calculation");
console.log(JSON.stringify({ outcome: "PASS", checks: "live equipment levels, locked exclusions, sandbox levels, water zeros, expanded-editor totals" }));
