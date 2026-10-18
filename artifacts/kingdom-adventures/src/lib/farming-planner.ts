import { ENCOUNTER_VARIANTS } from "@/lib/battle-setup";
import type { SavedLoadout } from "@/lib/battle-legality";
import type { DraftCharacter, DraftConsumables } from "@/lib/battle-team-draft";

export type FarmingPlannerSettings = {
  version: 1;
  encounterId: number;
  goal: "rewards" | "clear";
  useProfile: boolean;
  levelUpGear: boolean;
  trainCharacters: boolean;
  placeholderSupports: boolean;
  allowConsumables: boolean;
  maximizeStats: Array<"hp" | "mp" | "def">;
  holyHerbLimit: number;
  recoveryPotionLimit: number;
  startingTeamId: string;
  maxGearLevel: string;
  trainingCap: string;
  targetMatching: "nearby" | "exact";
  excludedCharacters: string[];
  reservedEquipment: string[];
};

export const FARMING_PLANNER_KEY = "ka_farming_planner_settings_v1";
export const ENCOUNTER_FAMILIES = Array.from(new Map(ENCOUNTER_VARIANTS.map((row) => [row.familyId, { id: row.familyId, name: row.familyName }])).values());
export const DEFAULT_FARMING_SETTINGS: FarmingPlannerSettings = {
  version: 1,
  encounterId: ENCOUNTER_VARIANTS.find((row) => row.familyId.includes("wairo") && row.difficulty === 2)?.id ?? ENCOUNTER_VARIANTS[0].id,
  goal: "rewards", useProfile: true, levelUpGear: false, trainCharacters: false,
  placeholderSupports: true, allowConsumables: true, maximizeStats: [], holyHerbLimit: 0, recoveryPotionLimit: 0,
  startingTeamId: "", maxGearLevel: "99", trainingCap: "999", targetMatching: "nearby",
  excludedCharacters: [], reservedEquipment: [],
};

export function normalizeFarmingSettings(value: unknown): FarmingPlannerSettings {
  const raw = value && typeof value === "object" ? value as Partial<FarmingPlannerSettings> : {};
  const result = { ...DEFAULT_FARMING_SETTINGS };
  if (ENCOUNTER_VARIANTS.some((row) => row.id === raw.encounterId)) result.encounterId = raw.encounterId!;
  for (const key of ["useProfile", "levelUpGear", "trainCharacters", "placeholderSupports", "allowConsumables"] as const) {
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  }
  for (const key of ["holyHerbLimit", "recoveryPotionLimit"] as const) {
    if (typeof raw[key] === "number" && Number.isFinite(raw[key])) result[key] = Math.max(0, Math.min(999, Math.trunc(raw[key])));
  }
  if (Array.isArray(raw.maximizeStats)) result.maximizeStats = [...new Set(raw.maximizeStats.filter((stat): stat is "hp" | "mp" | "def" => ["hp", "mp", "def"].includes(stat)))];
  if (raw.goal === "clear") result.goal = "clear";
  if (raw.targetMatching === "exact") result.targetMatching = "exact";
  for (const key of ["startingTeamId", "maxGearLevel", "trainingCap"] as const) {
    if (typeof raw[key] === "string") result[key] = raw[key];
  }
  for (const key of ["excludedCharacters", "reservedEquipment"] as const) {
    if (Array.isArray(raw[key])) result[key] = raw[key]!.filter((entry): entry is string => typeof entry === "string");
  }
  return result;
}

export function switchEncounterFamily(settings: FarmingPlannerSettings, familyId: string): FarmingPlannerSettings {
  const current = ENCOUNTER_VARIANTS.find((row) => row.id === settings.encounterId);
  const options = ENCOUNTER_VARIANTS.filter((row) => row.familyId === familyId);
  const next = options.find((row) => row.difficulty === current?.difficulty) ?? options[0];
  return next ? { ...settings, encounterId: next.id } : settings;
}

/** Finite stock enforces the cap throughout a fight, regardless of its duration. */
export function farmingConsumableStock(settings: FarmingPlannerSettings) {
  return { holyHerbStock: settings.allowConsumables ? settings.holyHerbLimit : 0,
    itemStock: { "Recovery Potion (L)": settings.allowConsumables ? settings.recoveryPotionLimit : 0 } };
}

export type FarmingSearchRequest = { id: number; settings: FarmingPlannerSettings };

/** One-shot handoff from a farming result. The loadout is inline so Simulate never creates a
 * duplicate saved character or depends on a storage write racing navigation. */
export type FarmingSimulationHandoff = {
  schema: "ka-farming-simulation-handoff-1";
  loadout: SavedLoadout;
  encounterId: number;
  placeholderSupports: boolean;
  allowConsumables: boolean;
  consumables: DraftConsumables;
  startingTeamId: string;
  startingRoster?: DraftCharacter[];
  partyBonus?: number;
};

export const FARMING_SIMULATION_HANDOFF_KEY = "ka_farming_simulation_handoff";

export function farmingDpsSkills(requiredEquipmentSkills: string[] = []): string[] {
  return [...new Set(["Counter", "7-Hit Attack", "5-Hit Attack", "4-Hit Attack", "3-Hit Attack", "2-Hit Attack", ...requiredEquipmentSkills])];
}

export function writeFarmingSimulationHandoff(
  handoff: Omit<FarmingSimulationHandoff, "schema">,
): boolean {
  try {
    window.sessionStorage.setItem(
      FARMING_SIMULATION_HANDOFF_KEY,
      JSON.stringify({ ...handoff, schema: "ka-farming-simulation-handoff-1" }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Read and clear a pending one-shot handoff; malformed storage never leaks into another visit. */
export function readFarmingSimulationHandoff(): FarmingSimulationHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(FARMING_SIMULATION_HANDOFF_KEY);
    window.sessionStorage.removeItem(FARMING_SIMULATION_HANDOFF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FarmingSimulationHandoff>;
    if (value.schema !== "ka-farming-simulation-handoff-1" || !value.loadout ||
        !Number.isInteger(value.encounterId) || typeof value.placeholderSupports !== "boolean" ||
        typeof value.allowConsumables !== "boolean" || !value.consumables ||
        typeof value.startingTeamId !== "string") return null;
    if (value.startingRoster !== undefined && !Array.isArray(value.startingRoster)) return null;
    return value as FarmingSimulationHandoff;
  } catch {
    return null;
  }
}
