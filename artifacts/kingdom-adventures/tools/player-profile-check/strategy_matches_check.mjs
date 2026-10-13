import assert from "node:assert/strict";
import { compareProfileStrategies, strategyMatchDeviation } from "../../src/lib/profile-strategy-matches.ts";

const input = {
  characters: [{ id: "owned-resident", name: "Resident", available: true, eligible: true, input: {
    baseStats: { atk: 100, spd: 50, lck: 20, dex: 18 }, goals: {},
    slots: [{ slot: "Weapon", items: ["Owned Sword"] }],
    contribution: (_item, level) => ({ atk: level * 10, spd: 0, lck: 0 }),
  }}],
  inventory: [{ item: "Owned Sword", ownership: "owned", currentLevel: 1 }],
};
const targets = [{id:"exact",atk:110,spd:50,lck:20}, {id:"near",atk:115,spd:50,lck:20}, {id:"far-luck",atk:110,spd:50,lck:10}];
let result;
for await (const progress of compareProfileStrategies(input, targets, false)) result = progress;
assert.equal(result.complete,true);
assert.equal(result.matches.length,3);
assert.equal(strategyMatchDeviation(result.matches[0],targets[0]),0);
assert.equal(result.matches[0].build.picks[0].item,"Owned Sword");
assert.equal(result.matches[0].build.picks[0].level,1);
assert.ok(strategyMatchDeviation(result.matches[1],targets[1])<=0.1);
assert.equal(strategyMatchDeviation(result.matches[2],targets[2]),1,"double Luck must not be labeled nearby");
const upgradeTarget = {id:"upgrade",atk:200,spd:50,lck:20};
for await (const progress of compareProfileStrategies(input,[upgradeTarget],true)) result = progress;
assert.equal(strategyMatchDeviation(result.matches[0],upgradeTarget),0);
assert.equal(result.matches[0].build.addedLevels,9);
assert.equal(result.matches[0].build.requiredUpgrades[0].requiredLevel,10);
console.log("PASS profile comparison: exact owned gear, nearby stats, double-Luck mismatch and required upgrades.");

assert.ok(strategyMatchDeviation({ ...result.matches[0], build: { ...result.matches[0].build, stats: { atk: 200, spd: 50, lck: 20, dex: 49 } } }, upgradeTarget) > 1, 'DEX mismatch must prevent exact performance matching');
