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

/** Prefer the largest sample for headline comparisons; use cohort recency only to break ties. */
export function bestMeasuredPanel<TPanel extends { n?: number; seedRange?: number[] }>(panels: TPanel[]): TPanel | null {
  return panels.reduce<TPanel | null>((best, panel) => {
    if (!best) return panel;
    const n = Number.isFinite(panel.n) ? panel.n! : 0;
    const bestN = Number.isFinite(best.n) ? best.n! : 0;
    const end = panel.seedRange?.[1] ?? panel.seedRange?.[0] ?? 0;
    const bestEnd = best.seedRange?.[1] ?? best.seedRange?.[0] ?? 0;
    return n > bestN || (n === bestN && end > bestEnd) ? panel : best;
  }, null);
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
  let best: { point: TPoint | TPanel; panel: TPanel; n: number; cohortEnd: number; panelOrder: number; isPanel: boolean } | null = null;
  for (const [panelOrder, panel] of evidence.panels.entries()) {
    if (panel.encounter !== encounter) continue;
    const panelMatch = panel.stats.length === 4 && panel.stats.every((value, index) => value === stats[index]);
    const variant = panel.variants.find((point) => point.stats.length === 4 && point.stats.every((value, index) => value === stats[index]));
    if (!panelMatch && !variant) continue;
    const point = (panelMatch ? panel : variant!) as (TPoint | TPanel) & { n?: number };
    const panelWithN = panel as TPanel & { n?: number };
    const n = Number.isFinite(point.n) ? point.n! : Number.isFinite(panelWithN.n) ? panelWithN.n! : 0;
    const cohortEnd = panel.seedRange?.[1] ?? panel.seedRange?.[0] ?? 0;
    if (!best || n > best.n || (n === best.n && cohortEnd > best.cohortEnd) ||
        (n === best.n && cohortEnd === best.cohortEnd && panelOrder > best.panelOrder)) {
      best = { point, panel, n, cohortEnd, panelOrder, isPanel: panelMatch };
    }
  }
  if (!best) return null;
  return best.isPanel
    ? { ...best.point, panelId: best.panel.id } as (TPanel & { panelId: string })
    : { ...best.point, seedRange: best.panel.seedRange, panelId: best.panel.id } as (TPoint & { seedRange?: number[]; panelId: string });
}
