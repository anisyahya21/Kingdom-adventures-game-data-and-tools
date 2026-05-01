import { MaterialIcon } from "@/lib/material-icons";
import { cn } from "@/lib/utils";

type MaterialCostField = "grass" | "wood" | "food" | "ore" | "mystic";

export type MaterialCostRecord = Record<MaterialCostField, number>;

const MATERIAL_COST_ICONS: { field: MaterialCostField; matId: number; style: "flat" | "outlined" | "crystal" }[] = [
  { field: "grass",  matId: 0, style: "outlined" },
  { field: "wood",   matId: 1, style: "flat" },
  { field: "food",   matId: 2, style: "flat" },
  { field: "ore",    matId: 3, style: "crystal" },
  { field: "mystic", matId: 4, style: "flat" },
];

type CostPillsProps = {
  costs: MaterialCostRecord;
  emptyLabel?: string;
  className?: string;
};

export function CostPills({ costs, emptyLabel = "Free to build", className }: CostPillsProps) {
  const parts = MATERIAL_COST_ICONS.filter((item) => costs[item.field] > 0);

  if (parts.length === 0) {
    return <span className="text-[11px] text-muted-foreground italic">{emptyLabel}</span>;
  }

  return (
    <div className={cn("flex flex-wrap gap-2 items-center", className)}>
      {parts.map((item) => (
        <span key={item.field} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MaterialIcon id={item.matId} style={item.style} size={18} />
          {costs[item.field]}
        </span>
      ))}
    </div>
  );
}
