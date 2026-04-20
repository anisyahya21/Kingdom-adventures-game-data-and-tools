import monsterCsv from "../../../../data/Sheet csv/KA GameData - Monster.csv?raw";

export type MonsterSpawn = { area: string; level: number };

export type MinedMonsterSummary = {
  id: number;
  name: string;
  terrainCode: number;
  terrainName: string;
  areaLevelMin: number;
  areaLevelMax: number;
  nativeMapSpawns: MonsterSpawn[];
  spawnNote?: string;
};

export type CommunitySighting = {
  area: string;
  level: number;
};

export const NATIVE_AREA_LEVELS: Record<string, number[]> = {
  Grass: [2, 3, 5, 7, 11, 15, 18, 21, 24, 33, 48, 50, 62, 74, 454, 777],
  Ground: [1],
  Sand: [1, 2, 8, 10, 13, 20, 23, 26, 30, 31, 35, 37, 41, 45, 54, 58, 60, 76, 88, 92, 121, 265, 311],
  Rock: [10, 12, 14, 16, 19, 22, 25, 27, 28, 29, 32, 34, 40, 44, 51, 52, 56, 61, 72, 82],
  Snow: [43, 46, 55, 65, 70, 75, 90, 135, 142, 208, 320, 360, 592, 624, 2400, 6000],
  Swamp: [69, 85, 112, 120, 162, 225, 888, 1020, 1100, 1600, 3200, 5100],
  Volcano: [250, 525, 4800, 9999],
};

export const TERRAIN_CODE_TO_NAME: Record<number, string> = {
  0: "Water",
  1: "Ground",
  2: "Grass",
  3: "Sand",
  4: "Rock",
  5: "Volcano",
  6: "Snow",
  7: "Swamp",
  [-1]: "Special",
};

const COMMUNITY_SIGHTINGS_KEY = "ka_monster_community_sightings";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseTerrainMapCsv(text: string, headerRows = 0): number[][] {
  return parseCsv(text)
    .slice(headerRows)
    .map((row) => row.map((cell) => Number(cell)));
}

export type TerrainType = "grass" | "sand" | "volcano" | "swamp" | "rock" | "snow" | "ground";

const TERRAIN_CODE_TO_TERRAIN_TYPE: Record<number, TerrainType> = {
  1: "ground",
  15: "ground",
  2: "grass",
  13: "grass",
  3: "sand",
  9: "sand",
  4: "rock",
  11: "rock",
  5: "volcano",
  10: "volcano",
  6: "snow",
  8: "snow",
  7: "swamp",
  12: "swamp",
};

export function mapTerrainCodeToType(code: number): TerrainType | undefined {
  return TERRAIN_CODE_TO_TERRAIN_TYPE[code];
}

function buildMinedMonsters(rawCsv: string): MinedMonsterSummary[] {
  const rows = parseCsv(rawCsv);
  if (rows.length < 4) return [];

  const header = rows[2];
  const terrainIndex = header.indexOf("terrain");
  const minIndex = header.indexOf("areaLevelMin");
  const maxIndex = header.indexOf("areaLevelMax");

  return rows.slice(3)
    .filter((row) => row[0] && row[1])
    .map((row) => {
      const id = Number(row[0] ?? "");
      const name = row[1] ?? `Monster ${row[0] ?? ""}`;
      const terrainCode = Number(row[terrainIndex] ?? "");
      const areaLevelMin = Number(row[minIndex] ?? "");
      const areaLevelMax = Number(row[maxIndex] ?? "");
      const terrainName = TERRAIN_CODE_TO_NAME[terrainCode] || "Special";
      const nativeMapSpawns =
        (NATIVE_AREA_LEVELS[terrainName] ?? [])
          .filter((level) => level >= areaLevelMin && level <= areaLevelMax)
          .map((level) => ({ area: terrainName, level }));

      let spawnNote: string | undefined;
      if (terrainCode === 0) {
        spawnNote = "Water terrain in mined Monster.csv. Exact water-level mapping still needs decoding.";
      } else if (terrainCode === 1 && nativeMapSpawns.length === 0) {
        spawnNote = "Ground terrain in mined Monster.csv. Higher ground-level mapping still needs decoding.";
      } else if (terrainCode === -1) {
        spawnNote = "Special/non-standard terrain case in mined Monster.csv.";
      }

      return {
        id: Number.isFinite(id) ? id : 0,
        name,
        terrainCode,
        terrainName,
        areaLevelMin: Number.isFinite(areaLevelMin) ? areaLevelMin : 0,
        areaLevelMax: Number.isFinite(areaLevelMax) ? areaLevelMax : 0,
        nativeMapSpawns,
        spawnNote,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export const MINED_MONSTER_SUMMARIES = buildMinedMonsters(monsterCsv);

export const MINED_MONSTER_SUMMARY_MAP = Object.fromEntries(
  MINED_MONSTER_SUMMARIES.map((monster) => [monster.name, monster]),
) as Record<string, MinedMonsterSummary>;

export function readCommunitySightings(): Record<string, CommunitySighting[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COMMUNITY_SIGHTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([name, value]) => [
        name,
        Array.isArray(value)
          ? value
              .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const area = String((entry as { area?: unknown }).area ?? "").trim();
                const level = Number((entry as { level?: unknown }).level ?? NaN);
                if (!area || !Number.isFinite(level)) return null;
                return { area, level };
              })
              .filter((entry): entry is CommunitySighting => Boolean(entry))
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

export function writeCommunitySightings(value: Record<string, CommunitySighting[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMMUNITY_SIGHTINGS_KEY, JSON.stringify(value));
}

export function mergeUniqueSpawns(...groups: Array<MonsterSpawn[] | undefined>): MonsterSpawn[] {
  const seen = new Set<string>();
  const merged: MonsterSpawn[] = [];
  for (const group of groups) {
    for (const spawn of group ?? []) {
      const key = `${spawn.area.trim().toLowerCase()}|${spawn.level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(spawn);
    }
  }
  return merged.sort((left, right) => {
    const areaCmp = left.area.localeCompare(right.area);
    if (areaCmp !== 0) return areaCmp;
    return left.level - right.level;
  });
}
