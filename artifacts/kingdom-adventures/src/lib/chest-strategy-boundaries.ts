import evidence from "@/game-data/chest-strategy-boundaries.json";

/** Finite exact measurements, never an interpolated tolerance window. */
export function measuredStrategyBoundary(id: string) {
  return evidence.panels.find((panel) => panel.id === id);
}

export function measuredStrategyBuild(encounter: number, stats: Record<string, number>) {
  const tuple = [stats.atk, stats.spd, stats.lck, stats.dex];
  for (const panel of evidence.panels) {
    if (panel.encounter !== encounter) continue;
    if (panel.stats.every((value, i) => value === tuple[i])) return panel;
    const variant = panel.variants.find((point) => point.stats.every((value, i) => value === tuple[i]));
    if (variant) return variant;
  }
  return null;
}
