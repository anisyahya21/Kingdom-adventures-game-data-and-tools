import {
  stoneFootprint,
  eastFrontSpawn,
  stoneDirectionalBounds,
  withinStoneDirectionalRange,
  cardinalStepsInRange,
  type Point,
} from "@/lib/chaos-rules";
import { MAP_SIZE } from "@/lib/world-builder";
export type ChaosPlannerContext = {
  land: ReadonlySet<string>;
  blocked: ReadonlySet<string>;
  areaCells: readonly Point[];
  focus: Point;
};
export type ChaosLayout = {
  anchors: Point[];
  boards: Point[];
  reclaimed: Point[];
  monster: Point;
  unit: Point;
  maxDistance: number;
  spread: number;
  score: number[];
};
const key = (cell: Point) => `${cell.x},${cell.y}`;
const point = (value: string): Point => {
  const [x, y] = value.split(",").map(Number);
  return { x, y };
};
const neighbors = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
const inside = (cell: Point) =>
  cell.x >= 0 && cell.y >= 0 && cell.x < MAP_SIZE && cell.y < MAP_SIZE;
// One deterministic breadth-first shoreline index per map, reused across every candidate.
const shorelines = new WeakMap<ReadonlySet<string>, Int32Array>();
function shoreline(land: ReadonlySet<string>) {
  const cached = shorelines.get(land);
  if (cached) return cached;
  const parent = new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  const queue = new Int32Array(parent.length);
  let head = 0,
    tail = 0;
  for (const value of land) {
    const cell = point(value);
    if (!inside(cell)) continue;
    const index = cell.y * MAP_SIZE + cell.x;
    parent[index] = index;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++],
      x = index % MAP_SIZE,
      y = Math.floor(index / MAP_SIZE);
    for (const delta of neighbors) {
      const next = { x: x + delta.x, y: y + delta.y };
      if (!inside(next)) continue;
      const child = next.y * MAP_SIZE + next.x;
      if (parent[child] !== -1) continue;
      parent[child] = index;
      queue[tail++] = child;
    }
  }
  shorelines.set(land, parent);
  return parent;
}
function connectGround(
  cells: readonly Point[],
  context: ChaosPlannerContext,
  base: ReadonlySet<string> = new Set(),
) {
  const reclaimed = new Set(base),
    parent = shoreline(context.land);
  for (const cell of cells) {
    if (!inside(cell)) return null;
    let index = cell.y * MAP_SIZE + cell.x;
    while (parent[index] !== index) {
      if (parent[index] === -1) return null;
      const value = `${index % MAP_SIZE},${Math.floor(index / MAP_SIZE)}`;
      if (context.blocked.has(value)) return null;
      if (reclaimed.has(value)) break;
      reclaimed.add(value);
      index = parent[index];
    }
  }
  return reclaimed;
}
export function resolveChaosLevel(
  input: string,
  cells: readonly Point[],
  land: ReadonlySet<string>,
  previous: Point | null,
): Point | null {
  if (
    !/^\d+$/.test(input.trim()) ||
    !Number.isSafeInteger(Number(input.trim())) ||
    !cells.length
  )
    return null;
  if (
    previous &&
    cells.some((cell) => cell.x === previous.x && cell.y === previous.y)
  )
    return previous;
  const cx = cells.reduce((sum, c) => sum + c.x, 0) / cells.length,
    cy = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
  const candidates = cells.filter((cell) => land.has(key(cell)));
  return [...(candidates.length ? candidates : cells)].sort(
    (a, b) =>
      Math.abs(a.x - cx) +
        Math.abs(a.y - cy) -
        (Math.abs(b.x - cx) + Math.abs(b.y - cy)) ||
      a.y - b.y ||
      a.x - b.x,
  )[0];
}
function layoutGround(anchors: readonly Point[], context: ChaosPlannerContext) {
  const occupied = new Set<string>();
  const allowedSpawns = new Set(context.areaCells.map(key));
  for (const anchor of anchors) {
    if (!allowedSpawns.has(key(eastFrontSpawn(anchor)))) return null;
    for (const cell of stoneFootprint(anchor)) {
      const k = key(cell);
      if (!inside(cell) || context.blocked.has(k) || occupied.has(k))
        return null;
      occupied.add(k);
    }
  }
  return occupied;
}
/** Reclamation follows cardinal paths back to existing land, never isolated patches. */
export function completeChaosLayout(
  anchors: readonly Point[],
  context: ChaosPlannerContext,
): ChaosLayout | null {
  if (!anchors.length || anchors.length > 7) return null;
  const occupied = layoutGround(anchors, context);
  if (!occupied) return null;
  const ground = connectGround(anchors.flatMap(stoneFootprint), context);
  if (!ground) return null;
  const bounds = anchors.map(stoneDirectionalBounds);
  const minX = Math.max(...bounds.map((b) => b.minX)),
    maxX = Math.min(...bounds.map((b) => b.maxX));
  const minY = Math.max(...bounds.map((b) => b.minY)),
    maxY = Math.min(...bounds.map((b) => b.maxY));
  if (minX > maxX || minY > maxY) return null;
  const available = (cell: Point) =>
    inside(cell) && !context.blocked.has(key(cell)) && !occupied.has(key(cell));
  let best: {
    monster: Point;
    unit: Point;
    score: number[];
    maxDistance: number;
    spread: number;
    reclaimed: Set<string>;
  } | null = null;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const monster = { x, y };
      if (!available(monster)) continue;
      const distances = anchors.map((anchor) =>
        cardinalStepsInRange(anchor, eastFrontSpawn(anchor), monster),
      );
      if (distances.some((d) => d === null)) continue;
      const measured = distances as number[];
      const maxDistance = Math.max(...measured),
        spread = maxDistance - Math.min(...measured);
      for (let direction = 0; direction < neighbors.length; direction++) {
        const delta = neighbors[direction],
          unit = { x: x + delta.x, y: y + delta.y };
        if (!available(unit)) continue;
        // Every open destination kept inside all stone ranges, including the ally tile.
        if (
          !anchors.every((anchor) => withinStoneDirectionalRange(anchor, unit))
        )
          continue;
        const reclaimed = connectGround([monster, unit], context, ground);
        if (!reclaimed) continue;
        const score = [
          reclaimed.size,
          maxDistance,
          spread,
          measured.reduce((a, b) => a + b, 0),
          Math.abs(x - context.focus.x) + Math.abs(y - context.focus.y),
          direction,
        ];
        if (!best || compare(score, best.score) < 0)
          best = { monster, unit, score, maxDistance, spread, reclaimed };
      }
    }
  if (!best) return null;
  const envelope = new Set<string>();
  for (const bound of bounds)
    for (let y = bound.minY; y <= bound.maxY; y++)
      for (let x = bound.minX; x <= bound.maxX; x++) {
        const cell = { x, y },
          k = key(cell);
        if (
          (context.land.has(k) || best.reclaimed.has(k)) &&
          !occupied.has(k) &&
          !context.blocked.has(k) &&
          k !== key(best.monster) &&
          k !== key(best.unit)
        )
          envelope.add(k);
      }
  return {
    anchors: anchors.map((a) => ({ ...a })),
    boards: [...envelope].map(point),
    reclaimed: [...best.reclaimed].map(point),
    monster: best.monster,
    unit: best.unit,
    maxDistance: best.maxDistance,
    spread: best.spread,
    score: [best.reclaimed.size, envelope.size, ...best.score.slice(1)],
  };
}
/** Search bounded compact patterns across the selected area, rather than around its nearest corner. */
export function findChaosLayouts(
  context: ChaosPlannerContext,
  count: number,
  limit = 6,
): { layouts: ChaosLayout[]; candidates: number } {
  if (!Number.isInteger(count) || count < 1 || count > 7)
    return { layouts: [], candidates: 0 };
  const validAnchors = context.areaCells
    .map((spawn) => ({ x: spawn.x - 1, y: spawn.y - 1 }))
    .filter((anchor) =>
      stoneFootprint(anchor).every(
        (cell) => inside(cell) && !context.blocked.has(key(cell)),
      ),
    );
  const validKeys = new Set(validAnchors.map(key));
  const seen = new Set<string>();
  const layouts: ChaosLayout[] = [];
  let candidates = 0;
  for (let cols = 1; cols <= count; cols++)
    for (const sx of [2, 3])
      for (const sy of [2, 3])
        for (const transpose of [false, true]) {
          const pattern = Array.from({ length: count }, (_, index) => {
            const x = (index % cols) * sx,
              y = Math.floor(index / cols) * sy;
            return transpose ? { x: y, y: x } : { x, y };
          });
          for (const origin of validAnchors) {
            const anchors = pattern.map((p) => ({
              x: p.x + origin.x,
              y: p.y + origin.y,
            }));
            if (!anchors.every((anchor) => validKeys.has(key(anchor))))
              continue;
            const id = anchors.map(key).sort().join("|");
            if (seen.has(id)) continue;
            seen.add(id);
            candidates++;
            const layout = completeChaosLayout(anchors, context);
            if (!layout) continue;
            layouts.push(layout);
            layouts.sort((a, b) => compare(a.score, b.score));
            if (layouts.length > limit) layouts.pop();
          }
        }
  return { layouts, candidates };
}
