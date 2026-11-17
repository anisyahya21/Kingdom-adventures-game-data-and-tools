import valuableCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Valuable.csv?raw";
import { parseCsv } from "@/lib/csv";
import { AREA_REWARDS } from "./area-rewards";
import { PLAYER_VALUABLES } from "./player-valuables";
import arenaData from "./valuable-arena-rewards.json";

const [columns, ...rows] = parseCsv(valuableCsv);
const saleColumn = columns.findIndex(column => column.trim() === "saleTerm [][]");
const buyColumn = columns.findIndex(column => column.trim() === "buyTerm [][]");
const get = (row: string[], name: string) => row[columns.indexOf(name)] ?? "";

// Arrays in the game table store a term count, then a length and arguments for each term.
function readTerms(row: string[], start: number): number[][] {
  let cursor = start + 1;
  return Array.from({ length: Number(row[start]) }, () => {
    const length = Number(row[cursor++]);
    const term = row.slice(cursor, cursor + length).map(Number);
    cursor += length;
    return term;
  });
}

const byId = new Map(rows.filter(row => /^\d+$/.test(get(row, "id")))
  .map(row => [Number(get(row, "id")), row]));
const arenaByValuable = new Map(arenaData.rewards.map(([level, id, quantity]) => [id, { level, quantity }]));

type ChestSource = { level: number; terrain: string; rate: number; min: number; max: number };
const chestsByValuable = new Map<number, ChestSource[]>();
for (const area of AREA_REWARDS) {
  for (const { id, type, rate, min, max } of area.chest?.rewards ?? []) {
    if (type !== "valuable" || rate <= 0) continue;
    const matches = chestsByValuable.get(id) ?? [];
    matches.push({ level: area.level, terrain: area.terrain, rate, min, max });
    chestsByValuable.set(id, matches);
  }
}

// Item IDs read by CheckTerm kind 23. These are the currency records used in buyTerm.
const TROPHY_NAMES: Readonly<Record<number, string>> = {
  66: "Bronze Trophy",
  67: "Silver Trophy",
  68: "Gold Trophy",
  69: "Kairo Grail",
  70: "Crown of Courage",
};

function describeSaleTerm([kind, value, second, comparator]: number[]): string {
  // CheckTerm 0x1676d98 and Compare 0x1678910: comparator 1 means >=.
  if (kind === 15 && second === 1) return `Reach Town Hall rank ${value}`;
  if (kind === 91 && comparator === 1) {
    return `Own ${second > 1 ? `${second} × ` : ""}${byId.get(value)?.[1] ?? "the required Valuable"}`;
  }
  if (kind === 100 && second === 1) return `Have ${value} or more residents with a rank EXP rate of at least 100%`;
  return "Additional shop requirement";
}

function valuableVariant(id: number) {
  const row = byId.get(id);
  if (!row) throw new Error(`Missing Valuable record ${id}`);
  const flags = Number(get(row, "flag"));
  const saleTerms = readTerms(row, saleColumn);
  const shop = (flags & 1) !== 0 ? {
    requirements: saleTerms.map(describeSaleTerm),
    // TownSystem.GetMaxTownRank 0x1600b00 clamps the rank cap to 99.
    aboveRankCap: saleTerms.some(([kind, rank, comparator]) => kind === 15 && comparator === 1 && rank > 99),
    costs: readTerms(row, buyColumn).map(([kind, item, quantity, comparator]) => ({
      name: kind === 23 && comparator === 1 ? TROPHY_NAMES[item] : undefined, quantity,
    })),
    once: (flags & 2) !== 0,
  } : undefined;
  return {
    id,
    name: get(row, "name"),
    effect: get(row, "explain"),
    shop,
    arena: arenaByValuable.get(id),
    chests: chestsByValuable.get(id) ?? [],
  };
}

export const VALUABLE_GROUPS = PLAYER_VALUABLES.map(group => ({
  ...group,
  variants: group.sourceIds.map(valuableVariant),
}));

export const VALUABLE_TOTAL = VALUABLE_GROUPS.reduce((sum, group) => sum + group.variants.length, 0);
export const VALUABLE_NORMAL_SOURCE_COUNT = VALUABLE_GROUPS.flatMap(group => group.variants)
  .filter(variant => (variant.shop && !variant.shop.aboveRankCap) || variant.arena || variant.chests.length > 0).length;
export const TREASURE_ROOM_LEVEL = AREA_REWARDS.find(area => area.unlock === "Treasure Room")?.level;
export const VALUABLE_ARENA_UNLOCK_LEVEL = AREA_REWARDS.find(area => area.unlock === "Underground Arena")?.level;
export type ValuableVariant = ReturnType<typeof valuableVariant>;
