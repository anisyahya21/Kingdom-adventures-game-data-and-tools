/** Reviewed supplements to original wording. Native ids, never inferred name aliases.
 * Authority: docs/reverse-engineering/skill-catalog-audit.md and wagon-and-fog.md.
 * Original wording remains in native-skill-descriptions.json.
 */
export type SkillEffectDetail = { description: string; evidence: "code" | "unused"; sources: string[] };
export const SKILL_EFFECT_DETAILS: Record<number, SkillEffectDetail> = {};
function add(ids: number[], description: string, ...sources: string[]) {
  for (const id of ids) SKILL_EFFECT_DETAILS[id] = { description, evidence: "code", sources };
}
add([0], "An ordinary physical attack using Attack against the target's Defense.", "BattleHelper.Attack 0x168d1e8");
add([1], "Ordinary bow attack. Uses Attack; projectile damage resolves against occupants of the impact cell.", "ProcessProjectileImpact 0x168f034");
add([2], "Ordinary gun attack. Uses Attack; projectile damage resolves against occupants of the impact cell.", "ProcessProjectileImpact 0x168f034");
add([3], "A critical physical attack. Criticals reduce the target's effective Defense to one eighth for the damage calculation.", "CalcDamage 0x168cf80");
add(Array.from({ length: 15 }, (_, i) => i + 5), "Area magic using Intelligence against Defense, centered on the target cell. Damage differences between spell tiers still need investigation.", "UseSkill 0x15e0c2c", "CalcDamage 0x168cf80", "special-combat.md incoming skill.value audit");
add([27], "When activated against an attack, halves its damage, rounding down with a minimum of 1. Spends MP on activation.", "Attack 0x168d1e8");
add([26], "When activated in response to an enemy attack, queues a counterattack. MP is paid when the queued skill executes.", "Attack 0x168d1e8");
add([28], "When activated against an attack, spends MP and cancels that attack's damage, hit and critical result.", "Attack 0x168d1e8");
add([29], "While active, multiplies the incoming hit chance by 0.6, rounding down. It does not add 40 percentage points to dodge chance.", "LotHit 0x168cde4");
add([30], "While active, multiplies the Luck-based critical chance by 1.3, rounding down. It does not add 30 percentage points.", "LotCritical 0x168cc54");
add([108], "While active, multiplies the Luck-based critical chance by 1.5, rounding down. It does not add 50 percentage points.", "LotCritical 0x168cc54");
add([42], "Enables farming work, doubles the Dexterity-based wasteland-restoration amount, and reduces eligible crop production time by 10–50 percentage points as Gathering rises to 999.", "DecideFarming 0x1494884", "UpdateWastelandRestoring 0x14ad6a4", "CalcCraftTimeFrame 0x14b7bc0");
add([43], "Contributes 2 construction-progress units per work call instead of 1, and is used when selecting and prioritizing builders.", "ProgressConstruction 0x151b808", "SearchAndConstruction 0x1519b24");
add([46], "Increases wagon and wheelbarrow travel speed by 50%. Wagon Yard also works without this skill.", "GetMoveSpeed 0x148c3cc", "EnterTransport 0x149c21c");
for (const [id, reduction] of [[48, 5], [49, 10], [50, 25], [51, 30]]) add([id], `Reduces the research duration calculated at research start by ${reduction}%, with a minimum duration of 1 second.`, "StartResearch 0x15daf58");
for (const [id, reduction] of [[54, 0], [55, 5], [56, 10], [57, 25], [58, 30], [127, 0], [128, 5], [129, 10], [130, 25], [131, 30]]) {
  add([id], `${id >= 127 ? "Studio" : "Workshop"} crafting skill. ${reduction ? `Subtracts ${reduction} percentage points from the base time rate` : "Removes the double-time penalty for lacking the matching crafting skill"}. Known products start at 100%; undiscovered products start at 200%.`, "CalcCraftTimeFrame 0x14b7bc0");
}
add([59], "May instantly finish construction or repair when its activity-skill check succeeds. Requires enough MP and an activation roll; it does not make every job instant.", "UpdateConstruct 0x14a3008", "UpdateRepairing 0x14af008", "UseActivitySkillIfSatisfyConditions 0x15e1e50");
add([60], "May instantly finish eligible crafting or facility-production work when its activity-skill check succeeds. Requires enough MP and an activation roll.", "UpdateCraft 0x14a51d4", "UpdateUseFurniture 0x14a9734", "UpdateUseOutdoorFacility 0x14af564");
add([61], "May teleport at route start, including loaded wagon trips, when the destination is at least 35 cells away (Manhattan distance). Costs 12–144 MP based on average stat levels; activation chance 36%/18%/9%.", "UseTeleportIfSatisfyConditions 0x148be14", "CalcUseMP 0x16323a4");
add([62], "May skip natural-resource harvesting work when its activity-skill check succeeds. Requires enough MP and an activation roll.", "ScrGather 0x1485d2c");
add([63], "May instantly complete treasure analysis when its activity-skill check succeeds. Requires enough MP and an activation roll.", "UpdateTreasureAnalysing 0x14ab378");
add([64], "Adds 1 to travel speed after other movement multipliers, including during wagon transport.", "GetMoveSpeed 0x148c3cc");
add([65], "Doubles walking and wagon travel speed and avoids the empty-Vigor speed penalty.", "UpdateResident 0x1482578", "GetMoveSpeed 0x148c3cc");
add([67], "Adds 2 map cells to the job's deployment range.", "GetDispatchRange 0x15362e0");
add([68], "Adds 4 map cells to the job's deployment range.", "GetDispatchRange 0x15362e0");
add([69], "Adds 1 to the job's fog-clearing range. Heart determines damage dealt to fog each clearing pulse.", "UpdateExplore 0x14a0354");
for (const [id, value] of [[70, 25], [71, 50], [72, 75]]) add([id], `Increases received battle EXP by ${value}%, with integer rounding down.`, "CalcGainExp 0x156dae0");
for (const [id, value] of [[73, 5], [74, 10]]) add([id], `Subtracts ${value} Energy from the calculated deployment cost, with a minimum final cost of 0. This is a flat discount to the deployment resource cost, not the resident's Vigor.`, "GetCost 0x1536974", "DispatchAreaSelectSystem.Update 0x1535068–0x153507c", "AppData.PayCost 0x1674730");
for (const [id, value] of [[40, 50], [41, 100]]) add([id], `Revives an ally with ${value}% of maximum HP, rounding down. The revived unit's current MP is unchanged; the caster pays the spell's MP cost.`, "BattleHelper.Cure 0x168e3c4", "FighterSystem.OnCure 0x1587e64", "FighterSystem.EnterMoving 0x1584194");
for (const [id, stat] of [[75, "HP"], [76, "MP"], [77, "Vigor"]] as const) add([id], `Restores 5 ${stat} per recovery pulse while the resident update is active and that stat is below full. Pulses occur every 100 resident updates (nominally 5 game seconds), not per walking cell.`, "UpdateResident 0x1482b54–0x1482bd4", "Define.SKILL_AUTO_RECOVERY_INTERVAL_SECONDS = 5");
for (const [id, stat] of [[78, "HP"], [79, "Vigor"], [80, "MP"]] as const) add([id], `Multiplies the facility's ${stat} recovery rate by 1.2, rounding down before applying it to maximum ${stat}. Recovery is limited by the amount missing.`, "CalcRecoveryValue 0x14b8acc");
add([101], "Prevents the resident from entering the normal search-and-battle path when enemies attack. It does not grant damage immunity.", "SearchAndBattle 0x1483de8");
add([102], "Restricts ordinary gathering choices to town territory and favors continued in-town resource work. It is not a percentage bonus to material yield.", "DecideGathering 0x1493f2c", "<DecideGathering>b__0 0x14d7668", "EnterGather 0x149b208");
for (const [id, value] of [[111, 30], [112, 100]]) add([id], `Extends the daily crafting-time allowance by ${value}% (${value === 30 ? "18,720" : "28,800"} internal seconds instead of 14,400). Does not shorten each item's crafting time.`, "CalcCraftTimeSecInOneDay 0x1493168");
for (const [id, bonus] of [[117, 15], [118, 10], [119, 5]]) add([id], `Attempts to put the enemy to sleep. Adds ${bonus} percentage points to the DEX-versus-target-Luck debuff roll; INT determines a 2–5 duration count. Higher tier does not mean a larger accuracy bonus in the original table.`, "CalcBuffAccuracy 0x168e66c", "CalcBuffTurnNum 0x168e760");
for (const [id, bonus] of [[133, 3], [134, 5], [135, 8]]) add([id], `Adds ${bonus} affection points to a normal chat's base gain of 1. Both partners' Chat bonuses are added. Dates use a separate, smaller rounded bonus.`, "UpdateTalking 0x14b42ac", "StartDate 0x1521184");
for (const [id, intended] of [[96, "indoor activity priority"], [98, "outdoor facility priority"], [99, "wasteland restoration priority"], [100, "scouting priority"], [103, "farming priority"], [104, "full recovery before deployment"]] as const) {
  SKILL_EFFECT_DETAILS[id] = { description: `Marked unused in the game's text. Intended role: ${intended}. Whether this effect works in gameplay still needs investigation.`, evidence: "unused", sources: ["Original Skill.txt: 未使用", "SkillData type constants, dump.cs"] };
}
