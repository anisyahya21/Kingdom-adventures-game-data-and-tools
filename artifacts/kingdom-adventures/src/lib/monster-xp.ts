import monsterCsv from "../../../../data/Sheet csv/KA GameData - Monster.csv?raw";
import { NATIVE_AREA_LEVELS, parseCsv } from "./monster-truth";

export const XP_STAT_COLUMNS = ["HP", "MP", "Vigor", "Atk", "Def", "Spd", "Luck", "Owned??", "Int", "Dex", "Gather", "Move", "Heart"] as const;
export const XP_UP_BONUSES = { 1: 0.25, 2: 0.5, 3: 0.75 } as const;

export type XpTerrain = "Ground/dirt" | "Grass" | "Sand" | "Rock" | "Snow" | "Swamp" | "Volcano";

export type XpMonster = {
  id: number;
  name: string;
  terrain: XpTerrain;
  minLevel: number;
  maxLevel: number;
  stats: number[];
  averageMultiplier: number;
};

export type XpResult = {
  terrain: XpTerrain;
  level: number;
  monsters: XpMonster[];
  averageMultiplier: number;
  averageXp: number;
  minXp: number;
  maxXp: number;
  bonusMultiplier: number;
};

const rows = parseCsv(monsterCsv);
const header = rows[0] ?? [];
const index = (name: string) => header.indexOf(name);
const terrainIndex = index("terrain");
const minIndex = index("areaLevelMin");
const maxIndex = index("areaLevelMax");
const nameIndex = index("name");
const idIndex = index("id");
const typeIndex = index("type");
const statIndexes = XP_STAT_COLUMNS.map(index);

const terrainByCode: Record<number, XpTerrain> = {
  1: "Ground/dirt",
  2: "Grass",
  3: "Sand",
  4: "Rock",
  5: "Volcano",
  6: "Snow",
  7: "Swamp",
};

function parseMonster(row: string[]): XpMonster | null {
  const name = row[nameIndex]?.trim();
  const terrain = terrainByCode[Number(row[terrainIndex])];
  // Monster type 1 entries are farmable animals/pets, not combat monsters.
  if (!name || !terrain || Number(row[typeIndex]) === 1) return null;

  const stats = statIndexes
    .map((statIndex) => Number(row[statIndex]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (stats.length === 0) return null;

  return {
    id: Number(row[idIndex]),
    name,
    terrain,
    minLevel: Number(row[minIndex]),
    maxLevel: Number(row[maxIndex]),
    stats,
    averageMultiplier: stats.reduce((sum, value) => sum + value, 0) / stats.length,
  };
}

export const COMBAT_MONSTERS = rows.slice(1).map(parseMonster).filter((monster): monster is XpMonster => Boolean(monster));

export const XP_TERRAINS: XpTerrain[] = ["Ground/dirt", "Grass", "Sand", "Rock", "Snow", "Swamp", "Volcano"];

export function getEligibleMonsters(terrain: XpTerrain, level: number) {
  return COMBAT_MONSTERS.filter((monster) => monster.terrain === terrain && monster.minLevel <= level && monster.maxLevel >= level);
}

export function getXpResult(terrain: XpTerrain, level: number, enabledXpUps: number[] = []): XpResult {
  const monsters = getEligibleMonsters(terrain, level);
  const bonusMultiplier = 1 + enabledXpUps.reduce((sum, skill) => sum + XP_UP_BONUSES[skill as 1 | 2 | 3], 0);
  const averageMultiplier = monsters.length === 0 ? 0 : monsters.reduce((sum, monster) => sum + monster.averageMultiplier, 0) / monsters.length;
  const xpFor = (monster: XpMonster) => 30 * monster.averageMultiplier * level / 100 * bonusMultiplier;
  const values = monsters.map(xpFor);

  return {
    terrain,
    level,
    monsters,
    averageMultiplier,
    averageXp: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    minXp: values.length === 0 ? 0 : Math.min(...values),
    maxXp: values.length === 0 ? 0 : Math.max(...values),
    bonusMultiplier,
  };
}

export const ALL_AREA_LEVELS = Array.from(new Set(Object.values(NATIVE_AREA_LEVELS).flat())).sort((a, b) => a - b);

export function nativeTerrainAtLevel(level: number) {
  return XP_TERRAINS.filter((terrain) => terrain === "Ground/dirt" || (NATIVE_AREA_LEVELS[terrain] ?? []).includes(level));
}
