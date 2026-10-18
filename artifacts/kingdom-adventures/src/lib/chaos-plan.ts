import { inBounds, MAP_SIZE } from "@/lib/world-builder";
export const CHAOS_PLAN_KEY = "ka-chaos-plan-v2";
export type ChaosSetupGroup = {
  id: string;
  area: { x: number; y: number };
  pieceKeys: string[];
  reclaimedKeys?: string[];
  monster: { x: number; y: number } | null;
  unit: { x: number; y: number } | null;
};
export type ChaosPlan = {
  pieces: Map<string, "stone" | "board">;
  paintedSea: Set<string>;
  reclaimed: Set<string>;
  monster: { x: number; y: number } | null;
  unit: { x: number; y: number } | null;
  area: { x: number; y: number } | null;
  groups?: ChaosSetupGroup[];
  activeGroup?: string | null;
};
export function emptyChaosPlan(): ChaosPlan {
  return {
    pieces: new Map(),
    paintedSea: new Set(),
    reclaimed: new Set(),
    monster: null,
    unit: null,
    area: null,
    groups: [],
    activeGroup: null,
  };
}
function validKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d+,\d+$/.test(value)) return false;
  const [x, y] = value.split(",").map(Number);
  return inBounds({ x, y });
}
export function encodeChaosPlan(plan: ChaosPlan): string {
  return JSON.stringify({
    version: 2,
    pieces: [...plan.pieces],
    paintedSea: [...plan.paintedSea],
    reclaimed: [...plan.reclaimed],
    monster: plan.monster,
    unit: plan.unit,
    area: plan.area,
    groups: plan.groups ?? [],
    activeGroup: plan.activeGroup ?? null,
  });
}
export function decodeChaosPlan(text: string): ChaosPlan {
  const data = JSON.parse(text);
  if (
    data?.version !== 2 ||
    !Array.isArray(data.pieces) ||
    data.pieces.length > MAP_SIZE * MAP_SIZE
  )
    throw Error("Unsupported Chaos Stone plan");
  const pieces = new Map<string, "stone" | "board">();
  for (const entry of data.pieces) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !validKey(entry[0]) ||
      !["stone", "board"].includes(entry[1]) ||
      pieces.has(entry[0])
    )
      throw Error("Invalid saved piece");
    const [x, y] = entry[0].split(",").map(Number);
    if (entry[1] === "stone" && !inBounds({ x: x + 1, y: y + 1 }))
      throw Error("Stone outside map");
    pieces.set(entry[0], entry[1]);
  }
  const keys = (value: unknown) => {
    if (
      !Array.isArray(value) ||
      value.length > MAP_SIZE * MAP_SIZE ||
      !value.every(validKey)
    )
      throw Error("Invalid saved land");
    return new Set<string>(value);
  };
  const cell = (value: unknown) => {
    if (value === null) return null;
    if (
      !value ||
      typeof value !== "object" ||
      !inBounds(value as { x: number; y: number })
    )
      throw Error("Invalid saved position");
    const { x, y } = value as { x: number; y: number };
    return { x, y };
  };
  const groups: ChaosSetupGroup[] = [];
  if (data.groups !== undefined) {
    if (!Array.isArray(data.groups) || data.groups.length > MAP_SIZE * MAP_SIZE)
      throw Error("Invalid saved setups");
    for (const group of data.groups) {
      if (
        !group ||
        typeof group.id !== "string" ||
        groups.some((g) => g.id === group.id)
      )
        throw Error("Invalid saved setup");
      const area = cell(group.area);
      if (!area) throw Error("Missing setup area");
      const pieceKeys = [...keys(group.pieceKeys)];
      const reclaimedKeys =
        group.reclaimedKeys === undefined ? [] : [...keys(group.reclaimedKeys)];
      groups.push({
        id: group.id,
        area,
        pieceKeys,
        reclaimedKeys,
        monster: cell(group.monster),
        unit: cell(group.unit),
      });
    }
  }
  if (
    data.activeGroup != null &&
    !groups.some((g) => g.id === data.activeGroup)
  )
    throw Error("Invalid active setup");
  return {
    pieces,
    paintedSea: keys(data.paintedSea),
    reclaimed: keys(data.reclaimed),
    monster: cell(data.monster),
    unit: cell(data.unit),
    area: cell(data.area),
    groups,
    activeGroup: data.activeGroup ?? null,
  };
}
