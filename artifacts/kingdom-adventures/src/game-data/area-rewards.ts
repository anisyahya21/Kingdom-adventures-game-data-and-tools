import areaCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Area_lookup.csv?raw";
import chipCsv from "../../../../data/sheet-research/raw-copies/KA GameData - MapChip.csv?raw";
import facilities from "@/game-data/native-map-facilities.json";
import { TERRAIN_NAMES } from "@/game-data/terrain-labels";
import { parseCsv } from "@/lib/csv";
import { mapTerrainCodeToType } from "@/lib/monster-truth";
import { TREASURE_BY_ID, TREASURE_MONSTERS } from "@/lib/treasure-lookup";

const [columns, ...rows] = parseCsv(areaCsv);
const [chipColumns, ...chips] = parseCsv(chipCsv);
const chipById = new Map(chips.map(row => [Number(row[0]), row]));
const monsterById = new Map(TREASURE_MONSTERS.map(monster => [monster.id, monster.name]));

export const AREA_REWARDS = rows.filter(row => /^\d+$/.test(row[0])).map(row => {
  const get = (name: string) => row[columns.indexOf(name)] ?? "";
  const id = Number(get("id"));
  const level = Number(get("level"));
  const terrainId = Number(get("terrain"));
  const treasureId = Number(get("treasureId"));
  const chip = chipById.get(Number(get("secretChipId")));
  const facilityId = chip ? Number(chip[chipColumns.indexOf("relatedDataId")]) : null;
  const facility = facilities.find(entry => entry.id === facilityId && entry.unlockLevel === level);
  const unlock = facility?.name ?? chip?.[chipColumns.indexOf("name")].replace(/\s+/g, " ").trim();
  const rewardType = Number(get("rewardType"));
  const bossId = Number(get("boss"));
  return {
    id, level, terrainId, treasureId,
    terrain: TERRAIN_NAMES[terrainId],
    chest: TREASURE_BY_ID.get(treasureId),
    boss: bossId > 0 ? monsterById.get(bossId) : undefined,
    bossLevel: bossId > 0 ? Number(get("bossLevel")) : undefined,
    directReward: rewardType === 1 ? "Town Hall" : rewardType === 2 ? get("job").replace(/\bRank\b/g, "Grade") : undefined,
    recruitVariant: get("gender") === "1" ? 2 as const : 1 as const,
    unlock,
    facility,
  };
}).sort((a, b) => a.level - b.level || a.id - b.id);

export type AreaReward = typeof AREA_REWARDS[number];

// MapSystem.Init (0x15b11d4–0x15b1310) loads this row-major ID array
// from global-metadata.dat (G2.1, 0x4f43e8; SHA-256 ae4bafb602d1afd8f2ef24225a98b4698626ee8af4bd203e6c4abe97b611a940).
const AREA_IDS_BY_TILE = [
  [90, 91, 92, 93, 94, 95, 96, 97, 98, 99],
  [89, 72, 73, 74, 75, 76, 77, 78, 79, 80],
  [88, 71, 56, 57, 58, 59, 60, 61, 62, 63],
  [87, 70, 55, 42, 43, 44, 45, 46, 47, 48],
  [86, 69, 54, 41, 30, 31, 32, 33, 34, 35],
  [85, 68, 53, 40, 29, 20, 21, 22, 23, 24],
  [84, 67, 52, 39, 28, 19, 12, 13, 14, 15],
  [83, 66, 51, 38, 27, 18, 11, 6, 7, 8],
  [82, 65, 50, 37, 26, 17, 10, 5, 2, 3],
  [81, 64, 49, 36, 25, 16, 9, 4, 1, 0],
];

const areaById = new Map(AREA_REWARDS.map(area => [area.id, area]));

export const AREA_REWARD_MAP = AREA_IDS_BY_TILE.map(row => row.map(id => {
  const area = areaById.get(id);
  if (!area) throw new Error(`Missing map reward record for area #${id}`);
  return { area, terrain: mapTerrainCodeToType(area.terrainId) };
}));
