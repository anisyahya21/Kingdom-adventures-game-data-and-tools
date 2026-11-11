import monsterCsv from "../../../../data/Sheet csv/KA GameData - Monster.csv?raw";
import itemCsv from "../../../../data/Sheet csv/KA GameData - Item.csv?raw";
import { parseCsv } from "@/lib/csv";
import { renderSkillName, SKILL_BY_ID } from "@/lib/battle-setup";


export type EggStat = "Attack" | "Defense" | "Balanced" | "Special";
export type EggBand = "None" | "Low" | "Medium" | "High" | "Over";

export interface EggMonsterOutcome {
  eggColor: string;
  monsterName: string;
  monsterId: number;
  requiredStat: EggStat;
  thresholds: Record<Exclude<EggBand, "None">, number | null>;
  startingSkill: string;
  secondSkillItem: string;
}

export interface EggFeedItem {
  name: string;
  copperCoins: number | null;
  stats: Record<EggStat, number>;
  exp: number;
  hatchTimeSeconds: number | null;
  remarks: string;
}

export interface EggReferenceData {
  monsters: EggMonsterOutcome[];
  feedItems: EggFeedItem[];
  eggColors: string[];
}

export function getReachedBand(total: number, thresholds: Record<Exclude<EggBand, "None">, number | null>): EggBand {
  if (thresholds.Over !== null && total >= thresholds.Over) return "Over";
  if (thresholds.High !== null && total >= thresholds.High) return "High";
  if (thresholds.Medium !== null && total >= thresholds.Medium) return "Medium";
  if (thresholds.Low !== null && total >= thresholds.Low) return "Low";
  return "None";
}

export function getNextThreshold(
  total: number,
  thresholds: Record<Exclude<EggBand, "None">, number | null>
): { band: Exclude<EggBand, "None">; remaining: number } | null {
  const order: Array<Exclude<EggBand, "None">> = ["Low", "Medium", "High", "Over"];
  for (const band of order) {
    const threshold = thresholds[band];
    if (threshold !== null && total < threshold) {
      return { band, remaining: threshold - total };
    }
  }
  return null;
}

const EGG_COLORS = ["White", "Blue", "Green", "Red", "Purple", "Black", "Yellow", "Rainbow"];
const EGG_STATS: EggStat[] = ["Attack", "Defense", "Balanced", "Special"];

function dataRows(csv: string, headerIndex: number) {
  const rows = parseCsv(csv);
  return rows.slice(headerIndex + 1)
    .filter((row) => /^\d+$/.test(row[0]))
    .map((row) => Object.fromEntries(rows[headerIndex].map((key, index) => [key, row[index]])));
}

export async function fetchEggReferenceData(): Promise<EggReferenceData> {
  const items = dataRows(itemCsv, 1);
  const itemsById = new Map(items.map((item) => [Number(item.id), item.name]));
  const monsters = dataRows(monsterCsv, 2).flatMap((row): EggMonsterOutcome[] => {
    const eggColor = EGG_COLORS[Number(row.eggId)];
    const requiredStat = EGG_STATS[Number(row.hatchCategory)];
    if (!eggColor || !requiredStat) return [];
    const min = Number(row.minHatchBasis);
    const max = Number(row.maxHatchBasis);
    const span = max - min;
    const skillId = Number(row.skillId);
    const itemId = Number(row.skillAdditionItemId);
    const skill = SKILL_BY_ID.get(skillId);
    return [{
      eggColor,
      requiredStat,
      monsterName: row.name,
      monsterId: Number(row.id),
      // The Low, Medium and High bands start at 0%, 30% and 85% of the hatch range.
      thresholds: { Low: min, Medium: min + Math.ceil(span * 30 / 100), High: min + Math.ceil(span * 85 / 100), Over: max + 1 },
      startingSkill: skill ? renderSkillName(skill) : skillId < 0 ? "None" : "Skill ID " + skillId,
      secondSkillItem: itemsById.get(itemId) ?? (itemId < 0 ? "None" : "Item ID " + itemId),
    }];
  }).sort((a, b) => a.eggColor.localeCompare(b.eggColor) || a.monsterName.localeCompare(b.monsterName));

  const feedItems = items.flatMap((item): EggFeedItem[] => {
    const type = Number(item.eggBonusType);
    const bonus = Number(item.eggBonusValue);
    const exp = Number(item.eggBonusExp);
    const seconds = Number(item.eggBonusTime);
    if (!(bonus > 0 || exp > 0 || seconds > 0)) return [];
    const coins = Number(item.copperCoinExchangeRateNum);
    const points = (stat: number) => type === 4 || type === stat ? bonus : 0;
    return [{
      name: item.name,
      copperCoins: coins > 0 ? coins : null,
      stats: { Attack: points(0), Defense: points(1), Balanced: points(2), Special: points(3) },
      exp,
      hatchTimeSeconds: seconds > 0 ? seconds : null,
      remarks: "",
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { monsters, feedItems, eggColors: EGG_COLORS };
}
