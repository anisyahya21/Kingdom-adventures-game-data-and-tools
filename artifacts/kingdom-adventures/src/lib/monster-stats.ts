import { parseCsv } from "@/lib/monster-truth";
import monsterCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Monster.csv?raw";

export type StatKey = "HP" | "MP" | "ATK" | "DEF" | "SPEED" | "LUCK" | "DEX";
type StatLevels = {
  level1: number;
  level100: number;
  level1000: number;
  level10000: number;
};
export type MonsterStatRecord = {
  id: number;
  name: string;
  eggId: number | null;
  hatchCategory: number | null;
  allyExpRate: number | null;
  stats: Record<StatKey, StatLevels>;
};
export type StatLevelKey = keyof StatLevels;
export type StatLevelColumn = { key: StatLevelKey; label: string } | { key: "custom"; label: string; level: number };
export type SortField = "name" | "id" | StatKey;

export const STAT_KEYS: StatKey[] = ["HP", "MP", "ATK", "DEF", "SPEED", "LUCK", "DEX"];
export const STAT_LEVEL_KEYS: StatLevelKey[] = ["level1", "level100", "level1000", "level10000"];
export const STAT_LABELS: Record<StatKey, string> = {
  HP: "HP",
  MP: "MP",
  ATK: "Attack",
  DEF: "Def",
  SPEED: "Speed",
  LUCK: "Luck",
  DEX: "Dex",
};
export const STAT_LEVEL_LABELS: Record<StatLevelKey, string> = {
  level1: "Lv 1",
  level100: "Lv 100",
  level1000: "Lv 1k",
  level10000: "Lv 10k",
};

export function statValueAtLevel(stat: StatLevels, level: number) {
  const checkpoints = [
    { level: 1, value: stat.level1 },
    { level: 100, value: stat.level100 },
    { level: 1000, value: stat.level1000 },
    { level: 10000, value: stat.level10000 },
  ];
  const target = Math.max(1, Math.round(level));

  if (target <= checkpoints[0].level) return checkpoints[0].value;

  for (let index = 1; index < checkpoints.length; index += 1) {
    const left = checkpoints[index - 1];
    const right = checkpoints[index];
    if (target <= right.level) {
      const progress = (target - left.level) / (right.level - left.level);
      return Math.round(left.value + (right.value - left.value) * progress);
    }
  }

  const left = checkpoints[checkpoints.length - 2];
  const right = checkpoints[checkpoints.length - 1];
  const progress = (target - left.level) / (right.level - left.level);
  return Math.round(left.value + (right.value - left.value) * progress);
}

export function valueForStatColumn(stat: StatLevels, column: StatLevelColumn) {
  return column.key === "custom" ? statValueAtLevel(stat, column.level) : stat[column.key];
}

export function compactLevelLabel(level: number) {
  return level >= 1000 && level % 1000 === 0 ? `${level / 1000}k` : level.toLocaleString();
}

function parseNumber(value: string | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMaybeNumber(value: string | undefined): number | null {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeaderCell(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function buildMonsterStats(rawCsv: string): MonsterStatRecord[] {
  const rows = parseCsv(rawCsv).map((row) => row.map((cell) => cell.trim()));
  if (rows.length < 2) return [];

  const dataHeaderIndex = rows.findIndex((row) => {
    return normalizeHeaderCell(row[0]) === "ID" && normalizeHeaderCell(row[1]) === "NAME";
  });
  if (dataHeaderIndex < 0) return [];

  const dataHeader = rows[dataHeaderIndex];
  const statHeader = dataHeaderIndex > 0 ? rows[dataHeaderIndex - 1] : [];
  const statStarts = new Map<StatKey, number>();

  for (let index = 0; index < dataHeader.length; index += 1) {
    const statLabel = normalizeHeaderCell(statHeader[index]);
    const dataLabel = normalizeHeaderCell(dataHeader[index]);
    for (const key of STAT_KEYS) {
      if (statLabel === key || dataLabel.startsWith(key)) {
        if (!statStarts.has(key)) statStarts.set(key, index);
      }
    }
  }

  const eggIdIndex = dataHeader.indexOf("eggId");
  const hatchCategoryIndex = dataHeader.indexOf("hatchCategory");
  const allyExpRateIndex = dataHeader.indexOf("allyExpRate");

  return rows.slice(dataHeaderIndex + 1).map((cols) => {
    const stats = {} as Record<StatKey, StatLevels>;

    STAT_KEYS.forEach((key) => {
      const start = statStarts.get(key);
      if (start == null) {
        stats[key] = { level1: 0, level100: 0, level1000: 0, level10000: 0 };
        return;
      }
      stats[key] = {
        level1: parseNumber(cols[start]),
        level100: parseNumber(cols[start + 1]),
        level1000: parseNumber(cols[start + 2]),
        level10000: parseNumber(cols[start + 3]),
      };
    });

    return {
      id: parseNumber(cols[0]),
      name: cols[1] ?? `Monster ${cols[0] ?? ""}`,
      eggId: eggIdIndex >= 0 ? parseMaybeNumber(cols[eggIdIndex]) : null,
      hatchCategory: hatchCategoryIndex >= 0 ? parseMaybeNumber(cols[hatchCategoryIndex]) : null,
      allyExpRate: allyExpRateIndex >= 0 ? parseMaybeNumber(cols[allyExpRateIndex]) : null,
      stats,
    };
  }).filter((monster) => monster.name.trim().length > 0);
}

export const MONSTERS = buildMonsterStats(monsterCsv);
