export type FarmingDpsRank = {
  id: string;
  measuredMean: number | null;
  deviation: number;
};

/** Exact measured builds rank by their observed mean; unmeasured builds rank only by stat distance. */
export function compareFarmingDpsRank(a: FarmingDpsRank, b: FarmingDpsRank): number {
  const aMeasured = a.measuredMean !== null;
  const bMeasured = b.measuredMean !== null;
  if (aMeasured !== bMeasured) return aMeasured ? -1 : 1;
  if (aMeasured && bMeasured && a.measuredMean !== b.measuredMean) return b.measuredMean! - a.measuredMean!;
  if (!aMeasured && !bMeasured && a.deviation !== b.deviation) return a.deviation - b.deviation;
  return a.id.localeCompare(b.id);
}
