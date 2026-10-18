import assert from "node:assert/strict";
import supportData from "../../src/game-data/farming-research-supports.json" with { type: "json" };
import { applyFarmingResearchSupports, farmingResearchSupportDescription, farmingResearchSupportLoadouts } from "../../src/lib/farming-research-supports.ts";
import { createDefaultBattleSetup, createHumanUnit } from "../../src/lib/battle-setup.ts";

assert.equal(supportData.units.length, 5);
assert.equal(supportData.units.some((unit) => unit.name === "Synthetic DPS"), false);
assert.equal(supportData.units[0].parameters["11"].rawValue, 10_000_000);
assert.equal(supportData.units[0].parameters["15"].rawValue, 4456);
assert.deepEqual(supportData.units[0].skills, [37, 107]);
assert.deepEqual(supportData.units.slice(1).map((unit) => Object.values(unit.parameters).map((parameter) => parameter.rawValue)), [
  [150, 43, 176, 46, 42, 43, 43, 43, 91, 67, 72, 77],
  [150, 43, 176, 46, 42, 43, 43, 43, 91, 67, 72, 77],
  [150, 43, 176, 46, 42, 43, 43, 43, 91, 67, 72, 77],
  [150, 43, 176, 46, 42, 43, 43, 43, 91, 67, 72, 77],
]);
assert.equal(supportData.note.includes("MP 10000000 appears only on the healer"), true);
assert.equal(supportData.source.sha256, "dd57655526c902e2ae1462117bd84b07a228723ef17cea2fe24e91753dc119a0");

const loadouts = farmingResearchSupportLoadouts();
assert.equal(loadouts.length, 5);
assert.equal(loadouts[0].jobName, "Wizard");
assert.equal(loadouts[0].rank, "S");
assert.equal(loadouts[0].awakening, 20);
assert.deepEqual(loadouts[0].skills, ["Heal Maddy", "Backup"]);
assert.deepEqual(loadouts[0].skillInvocations, [0, 0]);
assert.equal(loadouts.slice(1).every((loadout) => loadout.jobName === "Scholar" && loadout.rank === "D"), true);

const setup = createDefaultBattleSetup(3);
setup.playerTeam = Array.from({ length: 6 }, (_, index) => ({
  ...createHumanUnit(index + 1),
  name: index === 0 ? "User DPS" : `Support ${index}`,
  parameters: { ...createHumanUnit(index + 1).parameters, "11": { rawValue: index === 0 ? 1598 : 100, rawMax: 1000, extraValue: 0, extraMax: 0, trainingLevel: 1 } },
  skills: index === 1 ? [{ skillId: 37, invocationLevel: 0 }, { skillId: 107, invocationLevel: 0 }] : [],
}));
setup.playerTeam[0].parameters["13"].rawValue = 292;
setup.playerTeam[0].parameters["15"].rawValue = 415;
setup.playerTeam[0].parameters["16"].rawValue = 622;
setup.playerTeam[0].parameters["19"].rawValue = 11;
setup.households = { "untouched top-level": [] };
setup.inputs = [{ tick: 5, phase: "before_fighters", type: "finish" }];
const original = structuredClone(setup);
const dpsIdentity = setup.playerTeam[0];
const result = applyFarmingResearchSupports(setup);
assert.equal(result !== setup, true);
assert.equal(result.playerTeam !== setup.playerTeam, true);
assert.equal(result.playerTeam[0], dpsIdentity);
assert.deepEqual(result.playerTeam[0], original.playerTeam[0]);
assert.deepEqual(result.playerTeam[0].parameters, original.playerTeam[0].parameters);
assert.equal(result.playerTeam[0].parameters["11"].rawValue, 1598);
assert.equal(result.playerTeam[0].parameters["13"].rawValue, 292);
assert.equal(result.playerTeam[0].parameters["15"].rawValue, 415);
assert.equal(result.playerTeam[0].parameters["16"].rawValue, 622);
assert.equal(result.playerTeam[0].parameters["19"].rawValue, 11);
assert.equal(result.playerTeam[1].parameters["11"].rawValue, 10_000_000);
assert.equal(result.playerTeam[1].parameters["15"].rawValue, 4456);
assert.deepEqual(result.playerTeam[1].skills, original.playerTeam[1].skills);
assert.deepEqual(result.playerTeam.slice(2).map((unit) => unit.parameters["10"].rawValue), [150, 150, 150, 150]);
assert.deepEqual(setup, original, "input setup stays unmutated");
for (const field of Object.keys(setup)) if (field !== "playerTeam") assert.equal(result[field], setup[field], `${field} top-level identity is preserved`);
assert.throws(() => applyFarmingResearchSupports({ ...setup, playerTeam: setup.playerTeam.slice(0, 5) }), /exactly six human roles/);
assert.throws(() => applyFarmingResearchSupports({ ...setup, playerTeam: setup.playerTeam.map((unit, index) => index === 5 ? { kind: "monster", name: "bad", monsterId: 1, parameters: {}, skills: [] } : unit) }), /exactly six human roles/);
const description = farmingResearchSupportDescription();
assert.equal(description.formationId, null);
assert.equal(description.roles[0].parameters["11"].rawValue, 10_000_000);
assert.equal(description.roles[0].parameters["15"].rawValue, 4456);
console.log("PASS: support template is pinned; DPS and top-level setup are preserved; only support raw parameters change.");
