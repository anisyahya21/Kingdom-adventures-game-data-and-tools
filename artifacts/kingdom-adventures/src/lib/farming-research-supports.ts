import supportTemplate from "@/game-data/farming-research-supports.json";
import type { SavedLoadout } from "@/lib/battle-legality";
import type { BattleSetup, HumanUnit, RawParameterSet } from "@/lib/battle-setup";

type SupportTemplateUnit = {
  name: string;
  parameters: RawParameterSet;
  skills: number[];
  invocationLevels: number[];
  equipment: unknown[];
  weaponId: number;
};

const template = supportTemplate as {
  schema: string;
  profileId: string | null;
  formationId: string | null;
  encounterId: number;
  source: { path: string; sha256: string };
  note: string;
  units: SupportTemplateUnit[];
};

const healerName = "Healer (representative Wizard S, assumed/editable)";
const fodderNames = ["Scholar Fodder 1", "Scholar Fodder 2", "Scholar Fodder 3", "Scholar Fodder 4"] as const;
const statKeys = ["hp", "mp", "vig", "atk", "def", "spd", "lck", "int", "dex", "gth", "mov", "hrt"] as const;

/** Declared editable SavedLoadout inputs matching the synthetic support roles; not account facts. */
export function farmingResearchSupportLoadouts(): SavedLoadout[] {
  const healer: SavedLoadout = {
    name: healerName,
    jobName: "Wizard",
    rank: "S",
    awakening: 20,
    statLevels: Object.fromEntries(statKeys.map((stat) => [stat, stat === "hp" || stat === "mp" ? 300 : 1])),
    equipment: [],
    skills: ["Heal Maddy", "Backup"],
    skillInvocations: [0, 0],
    residentStatItems: {},
  };
  const fodder = fodderNames.map((name): SavedLoadout => ({
    name,
    jobName: "Scholar",
    rank: "D",
    awakening: 0,
    statLevels: Object.fromEntries(statKeys.map((stat) => [stat, 20])),
    equipment: [],
    skills: [],
    skillInvocations: [],
    residentStatItems: {},
  }));
  return [healer, ...fodder];
}

/**
 * Apply only the pinned synthetic E3 support parameter payload to a six-human setup.
 * The existing DPS unit and every BattleSetup field outside support parameters are preserved.
 */
export function applyFarmingResearchSupports(setup: BattleSetup): BattleSetup {
  if (setup.playerTeam.length !== 6 || setup.playerTeam.some((unit) => unit.kind !== "human")) {
    throw new Error("Synthetic farming supports require exactly six human roles with DPS at index 0 and supports at indices 1–5.");
  }

  const supportUnits = template.units;
  if (supportUnits.length !== 5) throw new Error("Pinned synthetic farming support data must contain exactly five support roles.");

  const playerTeam: HumanUnit[] = setup.playerTeam.map((unit, index) => {
    if (unit.kind !== "human") throw new Error("Synthetic farming supports require exactly six human roles.");
    if (index === 0) return unit;
    const support = supportUnits[index - 1];
    return {
      ...unit,
      parameters: Object.fromEntries(
        Object.entries(support.parameters).map(([id, parameter]) => [id, { ...parameter }]),
      ),
    };
  });
  return { ...setup, playerTeam };
}

/** Read-only provenance for surfaces that need to explain this synthetic support template. */
export function farmingResearchSupportDescription() {
  return {
    profileId: template.profileId,
    formationId: template.formationId,
    encounterId: template.encounterId,
    source: { ...template.source },
    note: template.note,
    roles: template.units.map(({ name, parameters, skills, invocationLevels }) => ({
      name,
      parameters: Object.fromEntries(Object.entries(parameters).map(([id, parameter]) => [id, { ...parameter }])),
      skills: [...skills],
      invocationLevels: [...invocationLevels],
    })),
  };
}
