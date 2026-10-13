export type ExactStrategyPoint = {
  stats: number[];
  seedRange?: number[];
};

export type ExactStrategyPanel<TPoint extends ExactStrategyPoint = ExactStrategyPoint> = {
  id: string;
  encounter: number;
  stats: number[];
  seedRange?: number[];
  variants: TPoint[];
};

export type ExactStrategyEvidence<TPanel extends { id: string }> = {
  panels: TPanel[];
};

/** Exact target panels only; multiple cohort panels for one target are kept. */
export function measuredPanelsFor<TPanel extends { id: string }>(
  evidence: ExactStrategyEvidence<TPanel>,
  id: string,
): TPanel[] {
  return evidence.panels.filter((panel) => panel.id === id);
}

/** Match all four stats exactly and carry the source panel's cohort with a variant. */
export function measuredPointFor<
  TPoint extends ExactStrategyPoint,
  TPanel extends ExactStrategyPanel<TPoint>,
>(
  evidence: { panels: TPanel[] },
  encounter: number,
  stats: number[],
): (TPoint & { seedRange?: number[]; panelId: string }) | (TPanel & { panelId: string }) | null {
  for (const panel of [...evidence.panels].reverse()) {
    if (panel.encounter !== encounter) continue;
    if (panel.stats.length === 4 && panel.stats.every((value, index) => value === stats[index])) {
      return { ...panel, panelId: panel.id };
    }
    const variant = panel.variants.find(
      (point) => point.stats.length === 4 && point.stats.every((value, index) => value === stats[index]),
    );
    if (variant) return { ...variant, seedRange: panel.seedRange, panelId: panel.id };
  }
  return null;
}
