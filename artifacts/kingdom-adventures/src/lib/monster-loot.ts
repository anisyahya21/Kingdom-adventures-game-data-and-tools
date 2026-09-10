import monsterCsv from "../../../../data/Sheet csv/KA GameData - Monster.csv?raw";
import treasureCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Treasure_lookup.csv?raw";
import itemCsv from "../../../../data/Sheet csv/KA GameData - Item.csv?raw";
import { NATIVE_AREA_LEVELS, parseCsv } from "./monster-truth";
import { getItemIcon } from "./equipment-icons";

export type LootTerrain = "Ground/dirt" | "Grass" | "Sand" | "Rock" | "Snow" | "Swamp" | "Volcano";
export type LootItem = { id: number; name: string; icon?: string };
type LootSlot = { itemId: number; itemName: string; rate: number; min: number; max: number };
type Treasure = { id: number; minLevel: number; maxLevel: number; slots: LootSlot[] };
export type LootMonster = { id: number; name: string; minLevel: number; maxLevel: number; treasureChance: number; itemChance: number; expectedQuantity: number };
export type LootResult = {
  terrain: LootTerrain;
  level: number;
  monsters: LootMonster[];
  droppers: LootMonster[];
  averageChance: number;
  averageQuantity: number;
  minChance: number;
  maxChance: number;
};

const terrainByCode: Record<number, LootTerrain> = { 1: "Ground/dirt", 2: "Grass", 3: "Sand", 4: "Rock", 5: "Volcano", 6: "Snow", 7: "Swamp" };
const monsterRows = parseCsv(monsterCsv);
const monsterHeader = monsterRows[2] ?? [];
const treasureRows = parseCsv(treasureCsv);
const treasureHeader = treasureRows[0] ?? [];
const itemRows = parseCsv(itemCsv);
const itemHeader = itemRows[1] ?? [];
const col = (header: string[], name: string) => header.indexOf(name);
const numberAt = (row: string[], index: number, fallback = 0) => {
  const value = Number(row[index]);
  return Number.isFinite(value) ? value : fallback;
};

const itemNameById = new Map<number, string>();
for (const row of itemRows.slice(2)) {
  const id = numberAt(row, col(itemHeader, "id"), -1);
  const name = row[col(itemHeader, "name")]?.trim();
  if (id >= 0 && name) itemNameById.set(id, name);
}

const treasures = new Map<number, Treasure>();
for (const row of treasureRows.slice(1)) {
  const id = numberAt(row, col(treasureHeader, "id"), -1);
  if (id < 0) continue;
  const slots: LootSlot[] = ([1, 2, 3] as const).flatMap((slot) => {
    const itemId = numberAt(row, col(treasureHeader, `itemId${slot}`), -1);
    const itemName = itemNameById.get(itemId) ?? row[col(treasureHeader, `item${slot}`)]?.trim() ?? "";
    if (itemId < 0 || !itemName) return [];
    return [{ itemId, itemName, rate: numberAt(row, col(treasureHeader, `itemRate${slot}`)) / 100, min: numberAt(row, col(treasureHeader, `minItemNum${slot}`)), max: numberAt(row, col(treasureHeader, `maxItemNum${slot}`)) }];
  });
  treasures.set(id, { id, minLevel: numberAt(row, col(treasureHeader, "minLevel")), maxLevel: numberAt(row, col(treasureHeader, "maxLevel"), 9999), slots });
}

const itemSet = new Map<number, LootItem>();
for (const treasure of treasures.values()) for (const slot of treasure.slots) itemSet.set(slot.itemId, { id: slot.itemId, name: slot.itemName, icon: getItemIcon(slot.itemName) });
export const LOOT_ITEMS = [...itemSet.values()].sort((a, b) => a.name.localeCompare(b.name));

const rawMonsters = monsterRows.slice(3).flatMap((row) => {
  const name = row[col(monsterHeader, "name")]?.trim();
  const terrain = terrainByCode[numberAt(row, col(monsterHeader, "terrain"))];
  const type = numberAt(row, col(monsterHeader, "type"), -1);
  if (!name || !terrain || type === 1) return [];
  return [{ id: numberAt(row, col(monsterHeader, "id"), -1), name, terrain, minLevel: numberAt(row, col(monsterHeader, "areaLevelMin")), maxLevel: numberAt(row, col(monsterHeader, "areaLevelMax"), 9999), dropDataId: numberAt(row, col(monsterHeader, "dropDataId"), -1), treasureChance: numberAt(row, col(monsterHeader, "dropRate")) / 100 }];
});

export const LOOT_TERRAINS: LootTerrain[] = ["Ground/dirt", "Grass", "Sand", "Rock", "Snow", "Swamp", "Volcano"];
export const LOOT_AREA_LEVELS = Array.from(new Set(Object.values(NATIVE_AREA_LEVELS).flat())).sort((a, b) => a - b);
export function nativeLootTerrainsAtLevel(level: number) {
  return LOOT_TERRAINS.filter((terrain) => terrain === "Ground/dirt" ? (NATIVE_AREA_LEVELS.Ground ?? []).includes(level) : (NATIVE_AREA_LEVELS[terrain] ?? []).includes(level));
}

function slotForItem(treasure: Treasure | undefined, itemId: number, level: number) {
  if (!treasure || level < treasure.minLevel || level > treasure.maxLevel) return undefined;
  return treasure.slots.find((slot) => slot.itemId === itemId);
}

export function getLootResult(terrain: LootTerrain, level: number, itemId: number): LootResult {
  const monsters = rawMonsters.filter((monster) => monster.terrain === terrain && monster.minLevel <= level && monster.maxLevel >= level).map((monster) => {
    const slot = slotForItem(treasures.get(monster.dropDataId), itemId, level);
    const itemChance = slot ? monster.treasureChance * slot.rate : 0;
    const expectedQuantity = itemChance * ((slot?.min ?? 0) + (slot?.max ?? 0)) / 2;
    return { id: monster.id, name: monster.name, minLevel: monster.minLevel, maxLevel: monster.maxLevel, treasureChance: monster.treasureChance, itemChance, expectedQuantity };
  });
  const droppers = monsters.filter((monster) => monster.itemChance > 0);
  const chances = monsters.map((monster) => monster.itemChance * 100);
  return { terrain, level, monsters, droppers, averageChance: monsters.length ? chances.reduce((sum, value) => sum + value, 0) / monsters.length : 0, averageQuantity: monsters.length ? monsters.reduce((sum, monster) => sum + monster.expectedQuantity, 0) / monsters.length : 0, minChance: chances.length ? Math.min(...chances) : 0, maxChance: chances.length ? Math.max(...chances) : 0 };
}
