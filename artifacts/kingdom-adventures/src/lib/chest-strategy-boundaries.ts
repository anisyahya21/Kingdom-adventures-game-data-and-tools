import evidence from "@/game-data/chest-strategy-boundaries.json";
import { measuredPanelsFor, measuredPointFor } from "@/lib/chest-strategy-boundary-access";
import { findResearchMeasurement } from "@/lib/research-strategy-bank";

type BoundaryPoint = {
  stats: number[];
  mean: number;
  median: number;
  n: number;
  low: number;
  defeats: number;
  highest: number;
  role?: string;
  delta?: number;
  ci?: number[];
  lowCI95Wilson?: number[];
  defeatCI95Wilson?: number[];
  retention90?: string;
  retention80?: string;
  seedRange?: number[];
  meanDpsMp?: number;
  meanHealerMp?: number;
  setupId?: string;
  sourceCohort?: string;
  mpMode?: "sufficient";
};

type BoundaryPanel = BoundaryPoint & {
  id: string;
  encounter: number;
  variants: BoundaryPoint[];
};

const boundaryEvidence = evidence as { panels: BoundaryPanel[] };

/** Finite exact measurements, never an interpolated tolerance window. */
export function measuredStrategyBoundaries(id: string) {
  return measuredPanelsFor(boundaryEvidence, id);
}

export function measuredStrategyBuild(encounter: number, stats: Record<string, number>) {
  const tuple = [stats.atk, stats.spd, stats.lck, stats.dex];
  const current = measuredPointFor<BoundaryPoint, BoundaryPanel>(boundaryEvidence, encounter, tuple) as (BoundaryPoint & { panelId: string }) | null;
  const bank = findResearchMeasurement(encounter, stats);
  if (!bank || current && current.n >= bank.n) return current;
  return {stats: bank.stats, mean: bank.mean, highest: bank.highest, median: bank.median, n: bank.n,
    low: bank.low, defeats: bank.defeats, meanDpsMp: bank.meanDpsMp ?? undefined,
    meanHealerMp: bank.meanHealerMp ?? undefined, setupId: bank.profileId ?? undefined,
    sourceCohort: bank.cohortId ?? bank.id, mpMode: "sufficient" as const, panelId: `research:${bank.id}`};
}
