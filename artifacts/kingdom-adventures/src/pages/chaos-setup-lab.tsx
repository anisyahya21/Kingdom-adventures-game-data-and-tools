import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Tool = "stone" | "board" | "sea" | "reclaim" | "erase";
type Piece = "stone" | "board";

type Point = { x: number; y: number };

const COLS = 42;
const ROWS = 28;
const EDGE_WATER_THICKNESS = 2;

function keyOf(x: number, y: number) {
  return `${x},${y}`;
}

function parseKey(key: string): Point {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function inside(x: number, y: number) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS;
}

function stoneFootprint(anchor: Point): Point[] {
  const { x, y } = anchor;
  return [
    { x, y },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x + 1, y: y + 1 },
  ];
}

function eastFrontSpawn(anchor: Point): Point {
  // Spawn origin is the south-east tile of the 2x2 stone footprint.
  return { x: anchor.x + 1, y: anchor.y + 1 };
}

function stoneDirectionalBounds(anchor: Point) {
  return {
    minX: anchor.x - 2,
    maxX: anchor.x + 5,
    minY: anchor.y - 3,
    maxY: anchor.y + 4,
  };
}

function withinStoneDirectionalRange(anchor: Point, p: Point) {
  const b = stoneDirectionalBounds(anchor);
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function movementEnvelope(anchor: Point): Set<string> {
  const b = stoneDirectionalBounds(anchor);
  const out = new Set<string>();
  for (let y = b.minY; y <= b.maxY; y += 1) {
    for (let x = b.minX; x <= b.maxX; x += 1) {
      if (inside(x, y)) out.add(keyOf(x, y));
    }
  }
  return out;
}

function stepDistance(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cardinalStepsInRange(anchor: Point, from: Point, to: Point): number | null {
  if (!inside(from.x, from.y) || !inside(to.x, to.y)) return null;
  if (!withinStoneDirectionalRange(anchor, from) || !withinStoneDirectionalRange(anchor, to)) return null;
  // Profile distance: cardinal movement only, without obstacle-routing bias.
  return stepDistance(from, to);
}

function getProfileTargets(stoneCount: number) {
  if (stoneCount <= 1) return { maxDistance: 4, maxSpread: 1 };
  if (stoneCount === 2) return { maxDistance: 5, maxSpread: 1 };
  if (stoneCount === 3) return { maxDistance: 6, maxSpread: 1 };
  if (stoneCount === 4) return { maxDistance: 6, maxSpread: 1 };
  if (stoneCount === 5) return { maxDistance: 7, maxSpread: 2 };
  if (stoneCount === 6) return { maxDistance: 7, maxSpread: 2 };
  return { maxDistance: 8, maxSpread: 3 };
}

export default function ChaosSetupLabPage() {
  const [tool, setTool] = useState<Tool>("stone");
  const [demoAxis, setDemoAxis] = useState<"x" | "y">("x");
  const [paintedSeaTiles, setPaintedSeaTiles] = useState<Set<string>>(() => new Set());
  const [reclaimedTiles, setReclaimedTiles] = useState<Set<string>>(() => new Set());
  const [pieces, setPieces] = useState<Map<string, Piece>>(() => new Map());
  const [openMonsterTile, setOpenMonsterTile] = useState<Point | null>(null);
  const [openUnitTile, setOpenUnitTile] = useState<Point | null>(null);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const baseSeaTiles = useMemo(() => {
    const out = new Set<string>();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (
          x < EDGE_WATER_THICKNESS ||
          y < EDGE_WATER_THICKNESS ||
          x >= COLS - EDGE_WATER_THICKNESS ||
          y >= ROWS - EDGE_WATER_THICKNESS
        ) {
          out.add(keyOf(x, y));
        }
      }
    }
    return out;
  }, []);

  const seaTiles = useMemo(() => {
    const out = new Set<string>();
    baseSeaTiles.forEach((k) => {
      if (!reclaimedTiles.has(k)) out.add(k);
    });
    paintedSeaTiles.forEach((k) => {
      if (!reclaimedTiles.has(k)) out.add(k);
    });
    return out;
  }, [baseSeaTiles, reclaimedTiles, paintedSeaTiles]);

  const stoneAnchors = useMemo(() => {
    const anchors: Point[] = [];
    pieces.forEach((piece, k) => {
      if (piece === "stone") anchors.push(parseKey(k));
    });
    anchors.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return anchors;
  }, [pieces]);

  const stoneIdByAnchorKey = useMemo(() => {
    const out = new Map<string, number>();
    stoneAnchors.forEach((anchor, idx) => {
      out.set(keyOf(anchor.x, anchor.y), idx + 1);
    });
    return out;
  }, [stoneAnchors]);

  const spawnIdByKey = useMemo(() => {
    const out = new Map<string, number>();
    stoneAnchors.forEach((anchor, idx) => {
      const spawn = eastFrontSpawn(anchor);
      if (inside(spawn.x, spawn.y)) out.set(keyOf(spawn.x, spawn.y), idx + 1);
    });
    return out;
  }, [stoneAnchors]);

  const stoneReachChecks = useMemo(() => {
    return stoneAnchors.map((anchor) => {
      const id = stoneIdByAnchorKey.get(keyOf(anchor.x, anchor.y)) ?? 0;
      const spawn = eastFrontSpawn(anchor);
      const distanceToM = openMonsterTile
        ? cardinalStepsInRange(anchor, spawn, openMonsterTile)
        : null;
      const canReachM = distanceToM != null;
      return { id, anchor, spawn, canReachM, distanceToM };
    });
  }, [stoneAnchors, stoneIdByAnchorKey, openMonsterTile]);

  const distanceProfile = useMemo(() => {
    const stoneCount = stoneAnchors.length;
    const target = getProfileTargets(stoneCount);
    const distances = stoneReachChecks
      .map((s) => s.distanceToM)
      .filter((d): d is number => typeof d === "number");
    const maxDistance = distances.length > 0 ? Math.max(...distances) : null;
    const minDistance = distances.length > 0 ? Math.min(...distances) : null;
    const spread = maxDistance != null && minDistance != null ? maxDistance - minDistance : null;
    const allReach = stoneReachChecks.every((s) => s.canReachM);
    const distancePass = maxDistance != null ? maxDistance <= target.maxDistance : false;
    const spreadPass = spread != null ? spread <= target.maxSpread : false;
    return {
      target,
      maxDistance,
      minDistance,
      spread,
      allReach,
      distancePass,
      spreadPass,
      overallPass: stoneCount > 0 && allReach && distancePass && spreadPass,
    };
  }, [stoneAnchors.length, stoneReachChecks]);

  const boardIdByKey = useMemo(() => {
    const boardKeys: string[] = [];
    pieces.forEach((piece, k) => {
      if (piece === "board") boardKeys.push(k);
    });
    boardKeys.sort((a, b) => {
      const pa = parseKey(a);
      const pb = parseKey(b);
      return (pa.y - pb.y) || (pa.x - pb.x);
    });
    const out = new Map<string, number>();
    boardKeys.forEach((k, idx) => out.set(k, idx + 1));
    return out;
  }, [pieces]);

  const occupiedByStones = useMemo(() => {
    const occupied = new Set<string>();
    stoneAnchors.forEach((anchor) => {
      stoneFootprint(anchor).forEach((p) => {
        if (inside(p.x, p.y)) occupied.add(keyOf(p.x, p.y));
      });
    });
    return occupied;
  }, [stoneAnchors]);

  const combinedEnvelope = useMemo(() => {
    const all = new Set<string>();
    stoneAnchors.forEach((anchor) => {
      movementEnvelope(anchor).forEach((k) => all.add(k));
    });
    return all;
  }, [stoneAnchors]);

  const extraOpenInEnvelope = useMemo(() => {
    const allowed = new Set<string>();
    if (openMonsterTile) allowed.add(keyOf(openMonsterTile.x, openMonsterTile.y));
    if (openUnitTile) allowed.add(keyOf(openUnitTile.x, openUnitTile.y));

    let count = 0;
    combinedEnvelope.forEach((k) => {
      if (allowed.has(k)) return;
      if (seaTiles.has(k)) return;
      if (occupiedByStones.has(k)) return;
      if (pieces.get(k) === "board") return;
      count += 1;
    });
    return count;
  }, [combinedEnvelope, seaTiles, occupiedByStones, pieces, openMonsterTile, openUnitTile]);

  function clearAll() {
    setPieces(new Map());
    setPaintedSeaTiles(new Set());
    setReclaimedTiles(new Set());
    setOpenMonsterTile(null);
    setOpenUnitTile(null);
    setGeneratorError(null);
    setCopyStatus(null);
  }

  async function copyDiagnostics() {
    const points: Point[] = [];
    pieces.forEach((piece, k) => {
      if (piece !== "board") return;
      points.push(parseKey(k));
    });
    occupiedByStones.forEach((k) => points.push(parseKey(k)));
    if (openMonsterTile) points.push(openMonsterTile);
    if (openUnitTile) points.push(openUnitTile);

    const renderAsciiMap = () => {
      if (points.length === 0) return "(no placed tiles)";

      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.max(0, Math.min(...xs));
      const maxX = Math.min(COLS - 1, Math.max(...xs));
      const minY = Math.max(0, Math.min(...ys));
      const maxY = Math.min(ROWS - 1, Math.max(...ys));

      const rows: string[] = [];
      for (let y = minY; y <= maxY; y += 1) {
        let row = "";
        for (let x = minX; x <= maxX; x += 1) {
          const k = keyOf(x, y);
          if (openMonsterTile && openMonsterTile.x === x && openMonsterTile.y === y) {
            row += "M";
          } else if (openUnitTile && openUnitTile.x === x && openUnitTile.y === y) {
            row += "U";
          } else if (spawnIdByKey.has(k)) {
            row += "S";
          } else if (occupiedByStones.has(k)) {
            row += "X";
          } else if (pieces.get(k) === "board") {
            row += "B";
          } else if (seaTiles.has(k)) {
            row += "~";
          } else {
            row += ".";
          }
        }
        rows.push(row);
      }

      return [
        `bbox: x=${minX}..${maxX} y=${minY}..${maxY}`,
        "legend: B=board S=spawn X=stone M=monster U=unit ~=sea .=open",
        ...rows,
      ].join("\n");
    };

    const lines: string[] = [];
    lines.push(`stones=${stoneAnchors.length} boards=${boardIdByKey.size} reclaimed=${reclaimedTiles.size}`);
    lines.push(`extraOpenInEnvelope=${extraOpenInEnvelope} mStandable=${monsterTileStandable} uStandable=${unitTileStandable} unitAdj=${unitAdjMonster}`);
    lines.push(`M=${openMonsterTile ? `(${openMonsterTile.x},${openMonsterTile.y})` : "-"} U=${openUnitTile ? `(${openUnitTile.x},${openUnitTile.y})` : "-"}`);
    stoneReachChecks.forEach(({ id, anchor, spawn, canReachM, distanceToM }) => {
      lines.push(`S${id}: anchor=(${anchor.x},${anchor.y}) spawn=(${spawn.x},${spawn.y}) reach=${canReachM} steps=${distanceToM ?? "-"}`);
    });
    lines.push(`profile: n=${stoneAnchors.length} targetMax=${distanceProfile.target.maxDistance} targetSpread=${distanceProfile.target.maxSpread}`);
    lines.push(`profile: max=${distanceProfile.maxDistance ?? "-"} min=${distanceProfile.minDistance ?? "-"} spread=${distanceProfile.spread ?? "-"}`);
    lines.push(`profile: allReach=${distanceProfile.allReach} maxPass=${distanceProfile.distancePass} spreadPass=${distanceProfile.spreadPass} overall=${distanceProfile.overallPass}`);
    lines.push("ascii-layout:");
    lines.push(renderAsciiMap());

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyStatus("Diagnostics copied. Paste them here.");
    } catch {
      setCopyStatus("Copy failed. You can manually copy the diagnostics panel text.");
    }
  }

  function isStoneAnchorValid(anchor: Point, mapSea: Set<string>, mapPieces: Map<string, Piece>) {
    if (!inside(anchor.x, anchor.y) || !inside(anchor.x + 1, anchor.y + 1)) return false;
    const fp = stoneFootprint(anchor);
    for (const p of fp) {
      const k = keyOf(p.x, p.y);
      if (mapSea.has(k)) return false;
      if (mapPieces.get(k) === "board") return false;
    }
    return true;
  }

  function removeStoneCovering(cellKey: string, next: Map<string, Piece>) {
    const target = parseKey(cellKey);
    const stoneKeys: string[] = [];
    next.forEach((piece, k) => {
      if (piece !== "stone") return;
      const fp = stoneFootprint(parseKey(k));
      if (fp.some((p) => p.x === target.x && p.y === target.y)) {
        stoneKeys.push(k);
      }
    });
    stoneKeys.forEach((k) => next.delete(k));
  }

  function onCellClick(x: number, y: number) {
    const k = keyOf(x, y);

    if (tool === "sea") {
      setReclaimedTiles((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
      setPaintedSeaTiles((prev) => {
        const next = new Set(prev);
        next.add(k);
        return next;
      });
      setPieces((prev) => {
        const next = new Map(prev);
        next.delete(k);
        removeStoneCovering(k, next);
        return next;
      });
      return;
    }

    if (tool === "reclaim") {
      setPaintedSeaTiles((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
      setReclaimedTiles((prev) => {
        const next = new Set(prev);
        next.add(k);
        return next;
      });
      return;
    }

    if (tool === "erase") {
      setPieces((prev) => {
        const next = new Map(prev);
        next.delete(k);
        removeStoneCovering(k, next);
        return next;
      });
      return;
    }

    if (tool === "board") {
      if (seaTiles.has(k) || occupiedByStones.has(k)) return;
      setPieces((prev) => {
        const next = new Map(prev);
        next.set(k, "board");
        return next;
      });
      return;
    }

    if (tool === "stone") {
      const anchor = { x, y };
      setPieces((prev) => {
        const next = new Map(prev);
        if (isStoneAnchorValid(anchor, seaTiles, next)) {
          next.set(k, "stone");
        }
        return next;
      });
    }
  }

  function buildDemoAnchors(stoneCount: number, compactAxis: "x" | "y") {
    const n = Math.max(1, Math.min(7, stoneCount));
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);

    const cols = compactAxis === "x" ? 2 : Math.ceil(n / 2);
    const rows = compactAxis === "y" ? 2 : Math.ceil(n / 2);
    const stepX = compactAxis === "x" ? 2 : 3;
    const stepY = compactAxis === "y" ? 2 : 3;

    const footprintW = (cols - 1) * stepX + 2;
    const footprintH = (rows - 1) * stepY + 2;
    const startX = Math.floor(cx - footprintW / 2);
    const startY = Math.floor(cy - footprintH / 2);

    const anchors: Point[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (anchors.length >= n) break;
        anchors.push({ x: startX + c * stepX, y: startY + r * stepY });
      }
    }
    return anchors;
  }

  function applyStoneDemo(stoneCount: number, compactAxis: "x" | "y" = "x") {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    const anchors = buildDemoAnchors(stoneCount, compactAxis);

    const nextPieces = new Map<string, Piece>();
    const nextPaintedSea = new Set<string>();
    const nextReclaimed = new Set<string>();

    anchors.forEach((a) => {
      const tempSea = new Set<string>();
      baseSeaTiles.forEach((k) => tempSea.add(k));
      nextPaintedSea.forEach((k) => tempSea.add(k));
      nextReclaimed.forEach((k) => tempSea.delete(k));
      if (isStoneAnchorValid(a, tempSea, nextPieces)) {
        nextPieces.set(keyOf(a.x, a.y), "stone");
      }
    });

    const stoneSources = anchors.map((anchor) => ({ anchor, spawn: eastFrontSpawn(anchor) }));

    const isSeaTile = (k: string) => {
      if (nextReclaimed.has(k)) return false;
      return baseSeaTiles.has(k) || nextPaintedSea.has(k);
    };

    const isStandable = (p: Point, stoneCells: Set<string>) => {
      if (!inside(p.x, p.y)) return false;
      const k = keyOf(p.x, p.y);
      return !stoneCells.has(k) && !isSeaTile(k);
    };

    const stoneCells = new Set<string>();
    anchors.forEach((a) => {
      stoneFootprint(a).forEach((p) => {
        if (inside(p.x, p.y)) stoneCells.add(keyOf(p.x, p.y));
      });
    });

    // Pick M/U by minimizing travel imbalance first, then max travel.
    const target = getProfileTargets(anchors.length);
    let best: {
      monster: Point;
      unit: Point;
      unitDirectionPriority: number;
      pairViolationCount: number;
      pairSpread: number;
      pairMaxDistance: number;
      pairVariance: number;
      pairTotalDistance: number;
      spread: number;
      maxDistance: number;
      totalDistance: number;
      violationCount: number;
      sortedDesc: number[];
      variance: number;
      unitSpread: number;
      unitMaxDistance: number;
      unitTotalDistance: number;
      unitViolationCount: number;
      unitSortedDesc: number[];
      unitVariance: number;
      centerBias: number;
    } | null = null;

    function getDistanceProfile(p: Point) {
      const distances = stoneSources.map(({ anchor, spawn }) => cardinalStepsInRange(anchor, spawn, p));
      if (distances.some((d) => d == null)) return null;
      const numericDistances = distances.filter((d): d is number => d != null);
      const maxDistance = Math.max(...numericDistances);
      const minDistance = Math.min(...numericDistances);
      const spread = maxDistance - minDistance;
      const totalDistance = numericDistances.reduce((sum, d) => sum + d, 0);
      const meanDistance = totalDistance / numericDistances.length;
      const variance = numericDistances.reduce((sum, d) => {
        const diff = d - meanDistance;
        return sum + diff * diff;
      }, 0);
      const sortedDesc = [...numericDistances].sort((a, b) => b - a);
      const violationCount =
        Number(maxDistance > target.maxDistance) +
        Number(spread > target.maxSpread);
      return {
        spread,
        maxDistance,
        totalDistance,
        violationCount,
        sortedDesc,
        variance,
      };
    }

    function getUnitDirectionPriority(monster: Point, unit: Point) {
      if (unit.x === monster.x && unit.y === monster.y - 1) return 0; // North
      if (unit.x === monster.x - 1 && unit.y === monster.y) return 1; // West
      if (unit.x === monster.x + 1 && unit.y === monster.y) return 2; // East
      if (unit.x === monster.x && unit.y === monster.y + 1) return 3; // South
      return 9;
    }

    function isCandidateBetter(candidate: {
      unitDirectionPriority: number;
      pairViolationCount: number;
      pairSpread: number;
      pairMaxDistance: number;
      pairVariance: number;
      pairTotalDistance: number;
      spread: number;
      maxDistance: number;
      totalDistance: number;
      violationCount: number;
      sortedDesc: number[];
      variance: number;
      unitSpread: number;
      unitMaxDistance: number;
      unitTotalDistance: number;
      unitViolationCount: number;
      unitSortedDesc: number[];
      unitVariance: number;
      centerBias: number;
    }, current: {
      unitDirectionPriority: number;
      pairViolationCount: number;
      pairSpread: number;
      pairMaxDistance: number;
      pairVariance: number;
      pairTotalDistance: number;
      spread: number;
      maxDistance: number;
      totalDistance: number;
      violationCount: number;
      sortedDesc: number[];
      variance: number;
      unitSpread: number;
      unitMaxDistance: number;
      unitTotalDistance: number;
      unitViolationCount: number;
      unitSortedDesc: number[];
      unitVariance: number;
      centerBias: number;
    } | null) {
      if (!current) return true;
      if (candidate.pairViolationCount !== current.pairViolationCount) return candidate.pairViolationCount < current.pairViolationCount;
      if (candidate.pairSpread !== current.pairSpread) return candidate.pairSpread < current.pairSpread;
      if (candidate.pairMaxDistance !== current.pairMaxDistance) return candidate.pairMaxDistance < current.pairMaxDistance;
      if (candidate.pairVariance !== current.pairVariance) return candidate.pairVariance < current.pairVariance;
      if (candidate.pairTotalDistance !== current.pairTotalDistance) return candidate.pairTotalDistance < current.pairTotalDistance;

      if (candidate.violationCount !== current.violationCount) return candidate.violationCount < current.violationCount;
      if (candidate.spread !== current.spread) return candidate.spread < current.spread;
      if (candidate.maxDistance !== current.maxDistance) return candidate.maxDistance < current.maxDistance;
      if (candidate.variance !== current.variance) return candidate.variance < current.variance;
      const len = Math.min(candidate.sortedDesc.length, current.sortedDesc.length);
      for (let i = 0; i < len; i += 1) {
        if (candidate.sortedDesc[i] !== current.sortedDesc[i]) {
          return candidate.sortedDesc[i] < current.sortedDesc[i];
        }
      }
      // If M quality is tied, prefer U as the other strong sink tile.
      if (candidate.unitViolationCount !== current.unitViolationCount) return candidate.unitViolationCount < current.unitViolationCount;
      if (candidate.unitSpread !== current.unitSpread) return candidate.unitSpread < current.unitSpread;
      if (candidate.unitMaxDistance !== current.unitMaxDistance) return candidate.unitMaxDistance < current.unitMaxDistance;
      if (candidate.unitVariance !== current.unitVariance) return candidate.unitVariance < current.unitVariance;
      const unitLen = Math.min(candidate.unitSortedDesc.length, current.unitSortedDesc.length);
      for (let i = 0; i < unitLen; i += 1) {
        if (candidate.unitSortedDesc[i] !== current.unitSortedDesc[i]) {
          return candidate.unitSortedDesc[i] < current.unitSortedDesc[i];
        }
      }
      if (candidate.totalDistance !== current.totalDistance) return candidate.totalDistance < current.totalDistance;
      if (candidate.unitTotalDistance !== current.unitTotalDistance) return candidate.unitTotalDistance < current.unitTotalDistance;
      if (candidate.unitDirectionPriority !== current.unitDirectionPriority) {
        return candidate.unitDirectionPriority < current.unitDirectionPriority;
      }
      return candidate.centerBias < current.centerBias;
    }

    const neighborDirs: Point[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const monsterCandidate = { x, y };
        if (!isStandable(monsterCandidate, stoneCells)) continue;
        const monsterProfile = getDistanceProfile(monsterCandidate);
        if (!monsterProfile) continue;

        for (const dir of neighborDirs) {
          const unitCandidate = { x: x + dir.x, y: y + dir.y };
          if (!isStandable(unitCandidate, stoneCells)) continue;
          const unitProfile = getDistanceProfile(unitCandidate);
          if (!unitProfile) continue;

          const centerBias = Math.abs(x - cx) + Math.abs(y - cy);

          const candidate = {
            monster: monsterCandidate,
            unit: unitCandidate,
            unitDirectionPriority: getUnitDirectionPriority(monsterCandidate, unitCandidate),
            pairViolationCount: monsterProfile.violationCount + unitProfile.violationCount,
            pairSpread: Math.max(monsterProfile.spread, unitProfile.spread),
            pairMaxDistance: Math.max(monsterProfile.maxDistance, unitProfile.maxDistance),
            pairVariance: Math.max(monsterProfile.variance, unitProfile.variance),
            pairTotalDistance: monsterProfile.totalDistance + unitProfile.totalDistance,
            spread: monsterProfile.spread,
            maxDistance: monsterProfile.maxDistance,
            totalDistance: monsterProfile.totalDistance,
            violationCount: monsterProfile.violationCount,
            sortedDesc: monsterProfile.sortedDesc,
            variance: monsterProfile.variance,
            unitSpread: unitProfile.spread,
            unitMaxDistance: unitProfile.maxDistance,
            unitTotalDistance: unitProfile.totalDistance,
            unitViolationCount: unitProfile.violationCount,
            unitSortedDesc: unitProfile.sortedDesc,
            unitVariance: unitProfile.variance,
            centerBias,
          };

          if (isCandidateBetter(candidate, best)) {
            best = {
              ...candidate,
            };
          }
        }
      }
    }

    if (!best) {
      setGeneratorError("Demo rejected: no valid M/U pair found for the current stone layout.");
      return;
    }

    const monster = best.monster;
    const unit = best.unit;

    const union = new Set<string>();
    anchors.forEach((a) => {
      movementEnvelope(a).forEach((k) => union.add(k));
    });

    const open = new Set([keyOf(monster.x, monster.y), keyOf(unit.x, unit.y)]);

    const mKey = keyOf(monster.x, monster.y);
    const uKey = keyOf(unit.x, unit.y);
    const mStandable = !stoneCells.has(mKey) && !isSeaTile(mKey);
    const uStandable = !stoneCells.has(uKey) && !isSeaTile(uKey);
    const adjacent = Math.abs(monster.x - unit.x) + Math.abs(monster.y - unit.y) === 1;
    const allSpawnsReachM = anchors.every((a) => {
      const spawn = eastFrontSpawn(a);
      const distance = cardinalStepsInRange(a, spawn, monster);
      return distance != null;
    });

    if (!mStandable || !uStandable || !adjacent || !allSpawnsReachM) {
      const reasons: string[] = [];
      if (!mStandable) reasons.push("M is not standable");
      if (!uStandable) reasons.push("U is not standable");
      if (!adjacent) reasons.push("M and U are not adjacent");
      if (!allSpawnsReachM) reasons.push("at least one spawn cannot reach M by range");
      setGeneratorError(`Demo rejected: ${reasons.join("; ")}.`);
      return;
    }

    union.forEach((k) => {
      if (open.has(k)) return;
      if (stoneCells.has(k)) return;
      if (baseSeaTiles.has(k) && !nextReclaimed.has(k)) return;
      if (nextPaintedSea.has(k) && !nextReclaimed.has(k)) return;
      nextPieces.set(k, "board");
    });

    setPieces(nextPieces);
    setPaintedSeaTiles(nextPaintedSea);
    setReclaimedTiles(nextReclaimed);
    setOpenMonsterTile(monster);
    setOpenUnitTile(unit);
    setGeneratorError(null);
  }

  function tileStyle(x: number, y: number) {
    const k = keyOf(x, y);
    if (spawnIdByKey.has(k)) return "bg-fuchsia-300 border-fuchsia-500";
    if (baseSeaTiles.has(k) && reclaimedTiles.has(k)) return "bg-cyan-300 border-cyan-400";
    if (seaTiles.has(k)) return "bg-sky-400/90 border-sky-500";
    if (occupiedByStones.has(k)) return "bg-slate-500 border-slate-600";
    if (pieces.get(k) === "board") return "bg-amber-500 border-amber-600";
    if (openMonsterTile && openMonsterTile.x === x && openMonsterTile.y === y) return "bg-red-400 border-red-500";
    if (openUnitTile && openUnitTile.x === x && openUnitTile.y === y) return "bg-emerald-400 border-emerald-500";
    return "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800";
  }

  function tileLabel(x: number, y: number) {
    const k = keyOf(x, y);
    if (openMonsterTile && openMonsterTile.x === x && openMonsterTile.y === y) return "M";
    if (openUnitTile && openUnitTile.x === x && openUnitTile.y === y) return "U";

    const spawnId = spawnIdByKey.get(k);
    if (spawnId != null) return `S${spawnId}`;

    const stoneId = stoneIdByAnchorKey.get(k);
    if (stoneId != null) return `${stoneId}`;

    const boardId = boardIdByKey.get(k);
    if (boardId != null) return `B${boardId}`;

    return "";
  }

  const unitAdjMonster =
    openMonsterTile && openUnitTile
      ? Math.abs(openMonsterTile.x - openUnitTile.x) + Math.abs(openMonsterTile.y - openUnitTile.y) === 1
      : false;

  const monsterTileStandable = openMonsterTile
    ? !seaTiles.has(keyOf(openMonsterTile.x, openMonsterTile.y)) && !occupiedByStones.has(keyOf(openMonsterTile.x, openMonsterTile.y))
    : false;

  const unitTileStandable = openUnitTile
    ? !seaTiles.has(keyOf(openUnitTile.x, openUnitTile.y)) && !occupiedByStones.has(keyOf(openUnitTile.x, openUnitTile.y))
    : false;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Chaos Setup Lab (Stripped Map)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Lightweight sandbox for chaos stones + sign boards only. Colors: gray stone, amber board, blue sea block,
            red monster sink tile, green unit tile, purple spawn tile.
          </p>
          <p>
            Spawn/movement model used in this lab: spawn from the stone's south-east tile (inside 2x2), range is measured from stone borders (West +2 from west edge, East +4 from east edge, North +3 from north edge, South +3 from south edge), with N/E/S/W cardinal movement only.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Button size="sm" variant={tool === "stone" ? "default" : "outline"} onClick={() => setTool("stone")}>Stone (2x2)</Button>
          <Button size="sm" variant={tool === "board" ? "default" : "outline"} onClick={() => setTool("board")}>Board</Button>
          <Button size="sm" variant={tool === "sea" ? "default" : "outline"} onClick={() => setTool("sea")}>Paint Sea</Button>
          <Button size="sm" variant={tool === "reclaim" ? "default" : "outline"} onClick={() => setTool("reclaim")}>Reclaim Land</Button>
          <Button size="sm" variant={tool === "erase" ? "default" : "outline"} onClick={() => setTool("erase")}>Erase Piece</Button>
          <Button size="sm" variant={demoAxis === "x" ? "default" : "outline"} onClick={() => setDemoAxis("x")}>Compact X</Button>
          <Button size="sm" variant={demoAxis === "y" ? "default" : "outline"} onClick={() => setDemoAxis("y")}>Compact Y</Button>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Button key={`demo-${n}`} size="sm" variant="secondary" onClick={() => applyStoneDemo(n, demoAxis)}>
              Apply {n}-Stone Demo
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={copyDiagnostics}>Copy Diagnostics</Button>
          <Button size="sm" variant="outline" onClick={clearAll}>Clear</Button>
          {generatorError && <div className="w-full text-xs text-red-600 dark:text-red-400">{generatorError}</div>}
          {copyStatus && <div className="w-full text-xs text-muted-foreground">{copyStatus}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-3 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 gap-1 md:grid-cols-4">
            <div>Stones: <span className="font-semibold text-foreground">{stoneAnchors.length}</span></div>
            <div>Boards: <span className="font-semibold text-foreground">{boardIdByKey.size}</span></div>
            <div>Open tiles in envelope (should be 0 extra): <span className="font-semibold text-foreground">{extraOpenInEnvelope}</span></div>
            <div>Unit adjacent to sink: <span className="font-semibold text-foreground">{unitAdjMonster ? "Yes" : "No"}</span></div>
            <div>Reclaimed tiles: <span className="font-semibold text-foreground">{reclaimedTiles.size}</span></div>
            <div>M tile standable: <span className="font-semibold text-foreground">{monsterTileStandable ? "Yes" : "No"}</span></div>
            <div>U tile standable: <span className="font-semibold text-foreground">{unitTileStandable ? "Yes" : "No"}</span></div>
          </div>
          {stoneAnchors.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="font-medium text-foreground">Stone Anchors And Spawn Tiles</div>
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
                {stoneReachChecks.map(({ id, anchor, spawn, canReachM, distanceToM }) => {
                  return (
                    <div key={keyOf(anchor.x, anchor.y)}>
                      Stone {id}: anchor ({anchor.x},{anchor.y}) spawn S{id} ({spawn.x},{spawn.y}) can reach M by range: {canReachM ? "Yes" : "No"} steps to M: {distanceToM ?? "-"}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-1 pt-1">
            <div className="font-medium text-foreground">Stone-Count Profile Check (Trial)</div>
            <div>
              N={stoneAnchors.length} targets: max distance at most {distanceProfile.target.maxDistance}, spread at most {distanceProfile.target.maxSpread}
            </div>
            <div>
              Measured: max distance {distanceProfile.maxDistance ?? "-"}, min distance {distanceProfile.minDistance ?? "-"}, spread {distanceProfile.spread ?? "-"}
            </div>
            <div>
              Checks: reachability {distanceProfile.allReach ? "PASS" : "FAIL"}, max distance {distanceProfile.distancePass ? "PASS" : "FAIL"}, spread {distanceProfile.spreadPass ? "PASS" : "FAIL"}
            </div>
            <div className={distanceProfile.overallPass ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              Overall profile status: {distanceProfile.overallPass ? "PASS" : "FAIL"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-auto p-3">
          <div
            className="grid w-max gap-[1px] rounded-md bg-border p-[1px]"
            style={{ gridTemplateColumns: `repeat(${COLS}, 24px)` }}
          >
            {Array.from({ length: ROWS }).map((_, y) =>
              Array.from({ length: COLS }).map((__, x) => {
                const k = keyOf(x, y);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onCellClick(x, y)}
                    title={`x:${x} y:${y}`}
                    className={`h-6 w-6 border text-[8px] leading-none ${tileStyle(x, y)}`}
                  >
                    {tileLabel(x, y)}
                  </button>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
