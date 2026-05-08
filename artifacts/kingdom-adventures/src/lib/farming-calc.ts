import { KAIRO_ROOM_LOOT_GROUPS, WAIRO_DUNGEON_LOOT_GROUP, type EncounterLoot } from "./special-boss-loot";

export type Difficulty = EncounterLoot["difficulty"];

const KAIRO_BASE_COSTS: Record<Difficulty, number> = {
  Easy: 300,
  Normal: 450,
  Hard: 500,
  Extreme: 650,
};

const WAIRO_BASE_COSTS: Record<Difficulty, number> = {
  Easy: 60,
  Normal: 65,
  Hard: 70,
  Extreme: 80,
};

/** Kairo Room: energy per run = base_difficulty_cost + 8 × fighters */
export function kairoRunEnergy(difficulty: Difficulty, fighters: number): number {
  return KAIRO_BASE_COSTS[difficulty] + 8 * fighters;
}

/**
 * Wairo Dungeon: energy per run = max(base × max(50 × mines, maxEnergy) / 100, 1)
 * maxEnergy = energy storage + town hall storage (the value shown when energy is full).
 */
export function wairoRunEnergy(
  difficulty: Difficulty,
  mines: number,
  maxEnergy: number,
): number {
  const factor = Math.max(50 * mines, maxEnergy);
  return Math.max((WAIRO_BASE_COSTS[difficulty] * factor) / 100, 1);
}

/**
 * Expected drops of targetItem per run for an encounter.
 * The two loot tables are assumed 50/50 probability.
 */
export function encounterExpectedDrops(encounter: EncounterLoot, targetItem: string): number {
  if (encounter.tables.length === 0) return 0;
  const tableEvs = encounter.tables.map((table) => {
    let ev = 0;
    for (const line of table) {
      if (line.item === targetItem) {
        ev += (line.chancePercent / 100) * ((line.minQty + line.maxQty) / 2);
      }
    }
    return ev;
  });
  return tableEvs.reduce((sum, ev) => sum + ev, 0) / tableEvs.length;
}

/** All unique droppable items across all Kairo Room encounters, sorted. */
export function getAllKairoItems(): string[] {
  const items = new Set<string>();
  for (const group of KAIRO_ROOM_LOOT_GROUPS) {
    for (const enc of group.encounters) {
      for (const table of enc.tables) {
        for (const line of table) items.add(line.item);
      }
    }
  }
  return [...items].sort((a, b) => a.localeCompare(b));
}

/** All unique droppable items across all Wairo Dungeon encounters, sorted. */
export function getAllWairoItems(): string[] {
  const items = new Set<string>();
  for (const enc of WAIRO_DUNGEON_LOOT_GROUP.encounters) {
    for (const table of enc.tables) {
      for (const line of table) items.add(line.item);
    }
  }
  return [...items].sort((a, b) => a.localeCompare(b));
}
