import monsterCsv from "../../../../data/Sheet csv/KA GameData - Monster.csv?raw";
import itemCsv from "../../../../data/Sheet csv/KA GameData - Item.csv?raw";
import treasureCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Treasure_lookup.csv?raw";
import areaCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Area_lookup.csv?raw";
import surveyCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Survey.csv?raw";
import dungeonCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Dungeon.csv?raw";
import terrainCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Terrain.csv?raw";
import specialBossCsv from "../../../../data/Sheet csv/KA GameData - SpecialBoss.csv?raw";
import facilityCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv?raw";
import { DAILY_RANK_REWARDS } from "@/game-data/daily-rank-rewards";
import { localSharedData } from "@/lib/local-shared-data";
import { parseCsv } from "@/lib/monster-truth";

export type SourceKind = "Monster" | "Terrain" | "Area reward" | "Survey" | "Dungeon" | "Kairo Room" | "Wairo Dungeon" | "Daily Rank Reward" | "Item Shop" | "Restaurant" | "Orchard" | "Skill Shop" | "Skill crafting" | "Treasure table";
export type SourceTargetType = "item" | "skill" | "equipment" | "furniture" | "job" | "valuable";
export type SourceTarget = { name: string; type: SourceTargetType; sources: ItemSource[] };
export type ItemSource = { kind: SourceKind; title: string; details: string; confidence: "confirmed" | "derived"; key: string };

const clean = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const headers = (rows: string[][], preferred = 0) => rows[preferred]?.length ? rows[preferred].map(clean) : [];
const index = (header: string[], name: string) => header.findIndex((v) => v.toLowerCase() === name.toLowerCase());
const val = (row: string[], header: string[], name: string) => clean(row[index(header, name)]);
const range = (min: string, max: string) => min && max && min !== max ? `${min}-${max}` : (min || max || "");

const targets = new Map<string, SourceTarget>();
function add(name: string, type: SourceTargetType, source: Omit<ItemSource, "key">) {
  const display = name.replace(/^\d+\s*x\s*/i, "").trim();
  if (!display || display === "-1" || display === "0" || display.toLowerCase() === "n/a") return;
  const key = norm(display);
  const target = targets.get(key) ?? { name: display, type, sources: [] };
  if (!targets.has(key)) targets.set(key, target);
  const full = { ...source, key: `${source.kind}|${source.title}|${source.details}` };
  if (!target.sources.some((entry) => entry.key === full.key)) target.sources.push(full);
}

type Reward = { name: string; type: SourceTargetType; rate: string; quantity: string };
type Treasure = { id: number; group: number; name: string; source: string; minLevel: string; maxLevel: string; rewards: Reward[] };
const treasureRows = parseCsv(treasureCsv); const treasureHeader = headers(treasureRows);
const rewardsFor = (row: string[], header: string[]): Reward[] => {
  const rewards: Reward[] = [];
  const lanes: Array<[string, SourceTargetType, string, string, number]> = [["equip", "equipment", "equipRate", "equipNum", 3], ["item", "item", "itemRate", "minItemNum", 3], ["furniture", "furniture", "furnitureRate", "furnitureNum", 1], ["valuable", "valuable", "valuableRate", "valuableNum", 1], ["skill", "skill", "skillRate", "skillNum", 1], ["job", "job", "jobRate", "jobNum", 1]];
  for (const [lane, type, rateName, quantityName, slotCount] of lanes) {
    for (let slot = 1; slot <= slotCount; slot++) {
      const suffix = slotCount === 1 ? "" : String(slot);
      const name = val(row, header, `${lane}${suffix}`); const id = val(row, header, `${lane}Id${suffix}`);
      if (!name || id === "-1" || id === "0") continue;
      const rate = val(row, header, `${rateName}${suffix}`); const quantity = val(row, header, `${quantityName}${suffix}`);
      rewards.push({ name, type, rate: rate ? `${rate}%` : "-", quantity: quantity || "1" });
    }
  }
  return rewards;
};
const treasures = new Map<number, Treasure>();
for (const row of treasureRows.slice(1)) {
  const id = number(val(row, treasureHeader, "id"), -1); if (id < 0) continue;
  treasures.set(id, { id, group: number(val(row, treasureHeader, "group"), -1), name: val(row, treasureHeader, "name") || `Treasure #${id}`, source: val(row, treasureHeader, "source"), minLevel: val(row, treasureHeader, "minLevel"), maxLevel: val(row, treasureHeader, "maxLevel"), rewards: rewardsFor(row, treasureHeader) });
}

function addTreasureRewards(treasure: Treasure, kind: SourceKind, title: string, details: string, confidence: ItemSource["confidence"] = "confirmed") {
  for (const reward of treasure.rewards) add(reward.name, reward.type, { kind, title, details: `${details}; reward chance ${reward.rate}; quantity ${reward.quantity}`, confidence });
}
for (const treasure of treasures.values()) {
  const kind: SourceKind = treasure.group >= 400 && treasure.group < 500 ? "Wairo Dungeon" : treasure.group >= 1000 && treasure.group < 1500 ? "Kairo Room" : treasure.group >= 2000 ? "Survey" : treasure.group >= 100 && treasure.group < 108 ? "Terrain" : "Treasure table";
  addTreasureRewards(treasure, kind, treasure.source || treasure.name, `Treasure #${treasure.id}${treasure.group >= 0 ? `; group ${treasure.group}` : ""}; level ${range(treasure.minLevel, treasure.maxLevel) || "all"}`);
}

const monsterRows = parseCsv(monsterCsv); const monsterHeader = headers(monsterRows, 2); const terrainNames: Record<string, string> = { "1": "Ground/dirt", "2": "Grass", "3": "Sand", "4": "Rock", "5": "Volcano", "6": "Snow", "7": "Swamp" };
for (const row of monsterRows.slice(3)) {
  if (val(row, monsterHeader, "type") === "1" || val(row, monsterHeader, "dropDataType") !== "2") continue;
  const treasure = treasures.get(number(val(row, monsterHeader, "dropDataId"), -1)); if (!treasure) continue;
  const monster = val(row, monsterHeader, "name"); if (!monster) continue;
  const details = `${terrainNames[val(row, monsterHeader, "terrain")] || "Unknown terrain"}; area level ${val(row, monsterHeader, "areaLevelMin") || "1"}+; monster drop chance ${val(row, monsterHeader, "dropRate") || "0"}%`;
  for (const reward of treasure.rewards) add(reward.name, reward.type, { kind: "Monster", title: monster, details: `${details}; Treasure #${treasure.id}; treasure slot ${reward.rate}; combined chance is the monster drop chance × slot chance`, confidence: "derived" });
}

function addDirectTreasure(raw: string, headerRow: number, idField: string, kind: SourceKind, title: (row: string[], header: string[]) => string, details: (row: string[], header: string[]) => string) {
  const rows = parseCsv(raw); const header = headers(rows, headerRow); const idIndex = index(header, idField); if (idIndex < 0) return;
  for (const row of rows.slice(headerRow + 1)) { const treasure = treasures.get(number(row[idIndex], -1)); if (treasure) addTreasureRewards(treasure, kind, title(row, header), details(row, header)); }
}
addDirectTreasure(areaCsv, 0, "treasureId", "Area reward", (r,h) => `Area #${val(r,h,"id")} (level ${val(r,h,"level")})`, (r,h) => `Area reward; terrain code ${val(r,h,"terrain")}; Treasure #${val(r,h,"treasureId")}`);
addDirectTreasure(surveyCsv, 0, "rewardTreasureId", "Survey", (r,h) => `Survey #${val(r,h,"id")}`, (r,h) => `Survey reward; Treasure #${val(r,h,"rewardTreasureId")}`);
addDirectTreasure(dungeonCsv, 0, "rewardTreasure", "Dungeon", (r,h) => `Dungeon #${val(r,h,"id")}`, (r,h) => `Dungeon reward; Treasure #${val(r,h,"rewardTreasure")}`);

const specialRows = parseCsv(specialBossCsv); const specialHeader = headers(specialRows, 1); const rewardGroupIndex = index(specialHeader, "rewardGroupId");
if (rewardGroupIndex >= 0) for (const row of specialRows.slice(2)) { const group = number(row[rewardGroupIndex], -1); if (group < 0) continue; const kind: SourceKind = group >= 400 && group < 500 ? "Wairo Dungeon" : "Kairo Room"; const treasure = [...treasures.values()].find((entry) => entry.group === group); if (treasure) addTreasureRewards(treasure, kind, val(row, specialHeader, "title") || `Reward group ${group}`, `Special boss reward group ${group}; level ${val(row, specialHeader, "level") || "-"}`); }

const items = parseCsv(itemCsv); const itemHeader = headers(items, 1); const flags = index(itemHeader, "flag"); const craftGroup = index(itemHeader, "craftGroup");
const facilities = parseCsv(facilityCsv); const facilityHeader = headers(facilities); const facilityCraft = index(facilityHeader, "craftGroup"); const facilityName = index(facilityHeader, "name"); const facilityByGroup = new Map<string, string[]>();
if (facilityCraft >= 0 && facilityName >= 0) for (const row of facilities.slice(1)) { const group = clean(row[facilityCraft]); if (group !== "-1" && group) facilityByGroup.set(group, [...(facilityByGroup.get(group) || []), clean(row[facilityName])]); }
for (const row of items.slice(2)) { const name = val(row, itemHeader, "name"); if (!name) continue; const flag = flags >= 0 ? number(row[flags]) : 0; const group = craftGroup >= 0 ? clean(row[craftGroup]) : "-1"; if (flag & 128) add(name, "item", { kind: "Item Shop", title: "Item Shop", details: "Available through the item shop data flag", confidence: "confirmed" }); if (flag & 1024) add(name, "item", { kind: "Restaurant", title: "Restaurant", details: "Available through the restaurant data flag", confidence: "confirmed" }); if (group === "70") add(name, "item", { kind: "Orchard", title: "Orchard", details: "Produced by orchard craft group 70", confidence: "confirmed" }); else if (group !== "-1" && group !== "") for (const facility of new Set(facilityByGroup.get(group) || [`Crafting facility (group ${group})`])) add(name, "item", { kind: "Skill crafting", title: facility, details: `Item.csv craft group ${group}`, confidence: "derived" }); }

const skills = (localSharedData.skills || {}) as Record<string, { name?: string; buyPrice?: number; studioLevel?: number | null; craftingIntelligence?: number | null }>;
for (const skill of Object.values(skills)) { if (!skill.name) continue; if (skill.buyPrice != null && skill.buyPrice > 0) add(skill.name, "skill", { kind: "Skill Shop", title: "Skill Shop", details: `Buy price ${skill.buyPrice}`, confidence: "confirmed" }); if (skill.studioLevel != null || skill.craftingIntelligence != null) add(skill.name, "skill", { kind: "Skill crafting", title: "Skill Studio", details: `Studio level ${skill.studioLevel ?? "-"}; crafting intelligence ${skill.craftingIntelligence ?? "-"}`, confidence: "confirmed" }); }

for (const day of DAILY_RANK_REWARDS) for (const reward of day.rewards) { const fields: Array<[string, string, SourceTargetType]> = [["weapon", reward.weapon, "equipment"], ["armor", reward.armor, "equipment"], ["shield", reward.shield, "equipment"], ["overallItem1", reward.overallItem1, "item"], ["overallItem2", reward.overallItem2, "item"], ["ticket", reward.ticket, "item"], ["skill", reward.skill, "skill"]]; for (const [slot, name, type] of fields) if (name) add(name, type, { kind: "Daily Rank Reward", title: `${day.day} rank ${reward.rankLabel}`, details: `${slot}; source row ${reward.sourceRowId}`, confidence: "confirmed" }); }

export const ITEM_SOURCE_TARGETS = [...targets.values()].map((target) => ({ ...target, sources: target.sources.sort((a,b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title)) })).sort((a,b) => a.name.localeCompare(b.name));
export function searchItemSources(query: string) { const q = norm(query); if (!q) return ITEM_SOURCE_TARGETS.slice(0, 30); return ITEM_SOURCE_TARGETS.filter((target) => norm(target.name).includes(q)).slice(0, 50); }
export function getItemSource(name: string) { return targets.get(norm(name)); }
export const ITEM_SOURCE_NOTES = ["Monster entries are combat monsters only; type 1 farmable animals are excluded.", "Monster chances are derived from Monster.dropRate × the matching Treasure_lookup reward-slot rate.", "Gacha item-to-pool membership is not included until the GachaItem/ItemGroup mapping can be proven from the data.", "Terrain group and some crafting links are marked derived because the game’s internal selector probability is not fully exposed."];
