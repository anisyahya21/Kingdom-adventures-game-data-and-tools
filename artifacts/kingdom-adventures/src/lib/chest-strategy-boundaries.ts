import evidence from "@/game-data/chest-strategy-boundaries.json";
import { measuredPanelsFor, measuredPointFor } from "@/lib/chest-strategy-boundary-access";

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
  return measuredPointFor<BoundaryPoint, BoundaryPanel>(boundaryEvidence, encounter, tuple) as (BoundaryPoint & { panelId: string }) | null;
}
