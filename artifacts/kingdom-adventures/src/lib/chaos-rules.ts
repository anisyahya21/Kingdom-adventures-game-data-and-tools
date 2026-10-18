import { MAP_SIZE } from "@/lib/world-builder";
export type Point = { x: number; y: number };
const inside = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
const keyOf = (x: number, y: number) => `${x},${y}`;
export function stoneFootprint(anchor: Point): Point[] {
  const { x, y } = anchor;
  return [
    { x, y },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x + 1, y: y + 1 },
  ];
}

export function eastFrontSpawn(anchor: Point): Point {
  // Spawn origin is the south-east tile of the 2x2 stone footprint.
  return { x: anchor.x + 1, y: anchor.y + 1 };
}

export function stoneDirectionalBounds(anchor: Point) {
  return {
    minX: anchor.x - 2,
    maxX: anchor.x + 5,
    minY: anchor.y - 3,
    maxY: anchor.y + 4,
  };
}

export function withinStoneDirectionalRange(anchor: Point, p: Point) {
  const b = stoneDirectionalBounds(anchor);
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function movementEnvelope(anchor: Point): Set<string> {
  const b = stoneDirectionalBounds(anchor);
  const out = new Set<string>();
  for (let y = b.minY; y <= b.maxY; y += 1) {
    for (let x = b.minX; x <= b.maxX; x += 1) {
      if (inside(x, y)) out.add(keyOf(x, y));
    }
  }
  return out;
}

export function stepDistance(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function cardinalStepsInRange(
  anchor: Point,
  from: Point,
  to: Point,
): number | null {
  if (!inside(from.x, from.y) || !inside(to.x, to.y)) return null;
  if (
    !withinStoneDirectionalRange(anchor, from) ||
    !withinStoneDirectionalRange(anchor, to)
  )
    return null;
  // Profile distance: cardinal movement only, without obstacle-routing bias.
  return stepDistance(from, to);
}

export function getProfileTargets(stoneCount: number) {
  if (stoneCount <= 1) return { maxDistance: 4, maxSpread: 1 };
  if (stoneCount === 2) return { maxDistance: 5, maxSpread: 1 };
  if (stoneCount === 3) return { maxDistance: 6, maxSpread: 1 };
  if (stoneCount === 4) return { maxDistance: 6, maxSpread: 1 };
  if (stoneCount === 5) return { maxDistance: 7, maxSpread: 2 };
  if (stoneCount === 6) return { maxDistance: 7, maxSpread: 2 };
  return { maxDistance: 8, maxSpread: 3 };
}
