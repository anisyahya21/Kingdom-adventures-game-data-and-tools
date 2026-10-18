import {
  stoneFootprint,
  eastFrontSpawn,
  stoneDirectionalBounds,
  withinStoneDirectionalRange,
  movementEnvelope,
  cardinalStepsInRange,
  getProfileTargets,
} from "@/lib/chaos-rules";
import {
  findChaosLayouts,
  completeChaosLayout,
  resolveChaosLevel,
  type ChaosPlannerContext,
} from "@/lib/chaos-planner";
import {
  CHAOS_PLAN_KEY,
  decodeChaosPlan,
  encodeChaosPlan,
  emptyChaosPlan,
  type ChaosSetupGroup,
} from "@/lib/chaos-plan";
import { fitChaosSetup } from "@/lib/chaos-planner-view";
import { builderDraws, hitBuilder } from "@/lib/world-builder-render";
import {
  BUILDER_ASSETS,
  initialWorld,
  placementIndex,
  makeItem,
  validatePlacement,
  type BuilderState,
} from "@/lib/world-builder";
import { BuilderSpriteCache } from "@/lib/builder-sprite-cache";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  Plus,
  Minus,
  Undo2,
  LocateFixed,
  Eye,
  HelpCircle,
  Move,
  Trash2,
  Hammer,
  Sparkles,
  Users,
} from "lucide-react";
import { HUMAN_IDLE_CHARACTERS } from "@/lib/human-battle-idle";
import { getMonsterSprite } from "@/lib/monster-sprites";
import {
  loadHumanSceneFrames,
  loadSceneImage,
  makeChaosScene,
  type HumanSceneFrames,
} from "@/lib/chaos-scene";
import signboardSpriteUrl from "../../../../website_icons/facilities_confirmed/facility_068_info_board.png";
import RuntimeWorldRenderTestPage, {
  type RuntimeCellHighlightOverlay,
} from "./runtime-world-render-test";
import {
  NATIVE_MAP,
  mapTerrainCodeToType,
  parseTerrainMapCsv,
  type TerrainType,
} from "@/lib/monster-truth";
import fullTerrainCsv from "../data/full-terrain-map.csv?raw";
import chaosStoneSpriteUrl from "../../../../website_icons/facilities_confirmed/facility_191_chaos_stone.png";

type Tool =
  | "none"
  | "stone"
  | "board"
  | "monster"
  | "unit"
  | "reclaim"
  | "erase";
type Piece = "stone" | "board";
type DemoSeamMode = "auto" | "first" | "last";
type ReclaimMode = "claim" | "unclaim";
type ResultCycleState = {
  options: Point[][];
  index: number;
  focus: Point;
  basePaintedSeaTiles: Set<string>;
  baseReclaimedTiles: Set<string>;
};

type Point = { x: number; y: number };
type SetupSnapshot = {
  pieces: Map<string, Piece>;
  paintedSea: Set<string>;
  reclaimed: Set<string>;
  monster: Point | null;
  unit: Point | null;
  area: Point | null;
  groups: ChaosSetupGroup[];
  activeGroup: string | null;
};

const FULL_TERRAIN_MAP = parseTerrainMapCsv(fullTerrainCsv);
const ROWS = FULL_TERRAIN_MAP.length;
const COLS = FULL_TERRAIN_MAP[0]?.length ?? 0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 14;
const CHAOS_STONE_SPRITE = chaosStoneSpriteUrl;
const LEGENDARY_CAVE_FACILITY_ID = 196;
const VISIBLE_MAP_FACILITIES = [LEGENDARY_CAVE_FACILITY_ID];
const HIDDEN_MAP_NATURE = {
  terrain: false,
  resources: false,
  humans: false,
  special: false,
};

function terrainAt(x: number, y: number): TerrainType | undefined {
  return mapTerrainCodeToType(FULL_TERRAIN_MAP[y]?.[x]);
}

function getNativeIndex(index: number, cellCount: number, nativeCount: number) {
  return Math.min(
    nativeCount - 1,
    Math.floor((index * nativeCount) / cellCount),
  );
}

function levelAt(x: number, y: number): number | undefined {
  if (!inside(x, y)) return undefined;
  const nativeRows = NATIVE_MAP.length;
  const nativeCols = NATIVE_MAP[0]?.length ?? 0;
  const ny = getNativeIndex(y, ROWS, nativeRows);
  const nx = getNativeIndex(x, COLS, nativeCols);
  const raw = NATIVE_MAP[ny]?.[nx]?.level;
  if (!Number.isFinite(raw)) return undefined;
  return raw;
}

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

function isSeaAtKey(
  key: string,
  baseSea: Set<string>,
  paintedSea: Set<string>,
  reclaimed: Set<string>,
) {
  if (reclaimed.has(key)) return false;
  return baseSea.has(key) || paintedSea.has(key);
}

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +value.toFixed(2)));
}

export default function ChaosSetupLabPage() {
  const [loadedPlan] = useState(() => {
    try {
      const saved = localStorage.getItem(CHAOS_PLAN_KEY);
      return {
        plan: saved ? decodeChaosPlan(saved) : emptyChaosPlan(),
        error: "",
      };
    } catch {
      return {
        plan: emptyChaosPlan(),
        error:
          "Saved plan could not be loaded. The stored copy has been preserved.",
      };
    }
  });
  const [saveError, setSaveError] = useState(loadedPlan.error);
  const [setupGroups, setSetupGroups] = useState<ChaosSetupGroup[]>(
    loadedPlan.plan.groups ?? [],
  );
  const [activeSetupId, setActiveSetupId] = useState<string | null>(
    loadedPlan.plan.activeGroup ?? null,
  );
  const restoredFocus = useRef(false);
  const mapCanvasContainerRef = useRef<HTMLDivElement | null>(null);
  const workspacePanelRef = useRef<HTMLElement | null>(null);
  const mapPanelRef = useRef<HTMLDivElement | null>(null);
  const [undoStack, setUndoStack] = useState<SetupSnapshot[]>([]);
  const [tool, setTool] = useState<Tool>("none");
  const [panel, setPanel] = useState<"plan" | "build" | "view" | "help" | null>(
    "plan",
  );
  const [suggestedStoneCount, setSuggestedStoneCount] = useState<number | null>(
    null,
  );
  const [buildStage, setBuildStage] = useState<
    "all" | "land" | "stones" | "boards" | "ally"
  >("all");
  const [structureOpacity, setStructureOpacity] = useState(0.65);
  const [animateActors, setAnimateActors] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [humanId, setHumanId] = useState("archer-c");
  const [humanFrames, setHumanFrames] = useState<HumanSceneFrames | null>(null);
  const [monsterImage, setMonsterImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [movingPiece, setMovingPiece] = useState<string | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{
    factor: number;
    token: number;
  } | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [reclaimMode, setReclaimMode] = useState<ReclaimMode>("claim");
  const [showCoverageCheck, setShowCoverageCheck] = useState<boolean>(false);
  const [demoStoneCount, setDemoStoneCount] = useState<number>(() => {
    const active = loadedPlan.plan.groups?.find(
      (group) => group.id === loadedPlan.plan.activeGroup,
    );
    const count = active?.pieceKeys.filter(
      (key) => loadedPlan.plan.pieces.get(key) === "stone",
    ).length;
    return Math.min(7, Math.max(1, count ?? 7));
  });
  const demoAxis = "x" as const;
  const demoSeamMode = "auto" as const;
  const [showLevelOverlay, setShowLevelOverlay] = useState<boolean>(false);
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [pickSetupAreaFromMap, setPickSetupAreaFromMap] =
    useState<boolean>(false);
  const [selectedSetupArea, setSelectedSetupArea] = useState<Point | null>(
    loadedPlan.plan.area,
  );
  const [nativeLand, setNativeLand] = useState<Set<string> | null>(null);
  const onTerrainReady = useCallback((land: Set<string>) => {
    setNativeLand((previous) =>
      previous?.size === land.size &&
      [...land].every((key) => previous.has(key))
        ? previous
        : land,
    );
  }, []);
  const [hoverTile, setHoverTile] = useState<Point | null>(null);
  const [locationInput, setLocationInput] = useState<string>(() =>
    loadedPlan.plan.area
      ? String(levelAt(loadedPlan.plan.area.x, loadedPlan.plan.area.y) ?? "")
      : "",
  );
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const [paintedSeaTiles, setPaintedSeaTiles] = useState<Set<string>>(
    () => loadedPlan.plan.paintedSea,
  );
  const [reclaimedTiles, setReclaimedTiles] = useState<Set<string>>(
    () => loadedPlan.plan.reclaimed,
  );
  const [pieces, setPieces] = useState<Map<string, Piece>>(
    () => loadedPlan.plan.pieces,
  );
  const [openMonsterTile, setOpenMonsterTile] = useState<Point | null>(
    loadedPlan.plan.monster,
  );
  const [openUnitTile, setOpenUnitTile] = useState<Point | null>(
    loadedPlan.plan.unit,
  );
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [resultCycle, setResultCycle] = useState<ResultCycleState | null>(null);
  const [runtimeFocusCell, setRuntimeFocusCell] = useState<{
    x: number;
    y: number;
    token: number;
  } | null>(null);

  useEffect(() => {
    if (loadedPlan.error) return;
    try {
      localStorage.setItem(
        CHAOS_PLAN_KEY,
        encodeChaosPlan({
          pieces,
          paintedSea: paintedSeaTiles,
          reclaimed: reclaimedTiles,
          monster: openMonsterTile,
          unit: openUnitTile,
          area: selectedSetupArea,
          groups: currentGroups(),
          activeGroup: activeSetupId,
        }),
      );
      setSaveError("");
    } catch {
      setSaveError(
        "Device storage is unavailable. Keep this tab open to preserve the layout.",
      );
    }
  }, [
    pieces,
    paintedSeaTiles,
    reclaimedTiles,
    openMonsterTile,
    openUnitTile,
    selectedSetupArea,
    loadedPlan.error,
    setupGroups,
    activeSetupId,
  ]);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(null), 4500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  useEffect(() => {
    if (!nativeLand || restoredFocus.current) return;
    restoredFocus.current = true;
    if (loadedPlan.plan.pieces.size) {
      const active = loadedPlan.plan.groups?.find(
        (group) => group.id === loadedPlan.plan.activeGroup,
      );
      fitSetupView(
        (active?.pieceKeys ?? [...loadedPlan.plan.pieces.keys()]).map(parseKey),
        null,
      );
      setPanel("plan");
    }
  }, [nativeLand, loadedPlan]);

  useEffect(() => {
    let live = true;
    const character = HUMAN_IDLE_CHARACTERS.find(
      (item) => item.id === humanId,
    )!;
    setHumanFrames(null);
    loadHumanSceneFrames(character)
      .then((frames) => {
        if (live) setHumanFrames(frames);
      })
      .catch(() => {
        if (live) setAssetError("Fighter art could not load. Reload to retry.");
      });
    return () => {
      live = false;
    };
  }, [humanId]);
  useEffect(() => {
    let live = true;
    const sprite = getMonsterSprite("Diamondoom")!;
    loadSceneImage(
      `${import.meta.env.BASE_URL}${sprite.src.replace(/^\//, "")}`,
    )
      .then((image) => {
        if (live) setMonsterImage(image);
      })
      .catch(() => {
        if (live) setAssetError("Monster art could not load. Reload to retry.");
      });
    return () => {
      live = false;
    };
  }, []);

  const baseSeaTiles = useMemo(() => {
    const out = new Set<string>();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        // Real map mask: non-terrain cells are outside playable shape.
        if (nativeLand ? !nativeLand.has(keyOf(x, y)) : !terrainAt(x, y)) {
          out.add(keyOf(x, y));
        }
      }
    }
    return out;
  }, [nativeLand]);

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
    anchors.sort((a, b) => a.y - b.y || a.x - b.x);
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
      const owner = setupGroups.find((group) =>
        group.pieceKeys.includes(keyOf(anchor.x, anchor.y)),
      );
      const monster =
        owner && owner.id !== activeSetupId ? owner.monster : openMonsterTile;
      const distanceToM = monster
        ? cardinalStepsInRange(anchor, spawn, monster)
        : null;
      const canReachM = distanceToM != null;
      return { id, anchor, spawn, canReachM, distanceToM };
    });
  }, [
    stoneAnchors,
    stoneIdByAnchorKey,
    openMonsterTile,
    setupGroups,
    activeSetupId,
  ]);

  const stoneLevelSummary = useMemo(() => {
    const levels = stoneAnchors
      .map((a) => levelAt(a.x, a.y))
      .filter((lv): lv is number => Number.isFinite(lv));
    if (levels.length === 0) return { min: null, max: null, avg: null };
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    const avg = Math.round(
      levels.reduce((sum, lv) => sum + lv, 0) / levels.length,
    );
    return { min, max, avg };
  }, [stoneAnchors]);

  const levelOptions = useMemo(() => {
    const out = new Set<number>();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const lv = levelAt(x, y);
        if (lv == null) continue;
        out.add(lv);
      }
    }
    return Array.from(out).sort((a, b) => a - b);
  }, []);

  const levelTilesByLevel = useMemo(() => {
    const byLevel = new Map<number, Point[]>();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const lv = levelAt(x, y);
        if (lv == null) continue;
        const list = byLevel.get(lv) ?? [];
        list.push({ x, y });
        byLevel.set(lv, list);
      }
    }
    return byLevel;
  }, []);

  useEffect(() => {
    setResultCycle(null);
    setGeneratorError(null);
    setSuggestedStoneCount(null);
  }, [selectedSetupArea]);

  const distanceProfile = useMemo(() => {
    const stoneCount = stoneAnchors.length;
    const target = getProfileTargets(stoneCount);
    const distances = stoneReachChecks
      .map((s) => s.distanceToM)
      .filter((d): d is number => typeof d === "number");
    const maxDistance = distances.length > 0 ? Math.max(...distances) : null;
    const minDistance = distances.length > 0 ? Math.min(...distances) : null;
    const spread =
      maxDistance != null && minDistance != null
        ? maxDistance - minDistance
        : null;
    const allReach = stoneReachChecks.every((s) => s.canReachM);
    const distancePass =
      maxDistance != null ? maxDistance <= target.maxDistance : false;
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
      return pa.y - pb.y || pa.x - pb.x;
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

  const blockedFacilityTiles = useMemo(() => {
    const native = initialWorld();
    const fixed = { ...native, items: native.items.filter((i) => i.fixed) };
    return new Set(placementIndex(fixed, new Set()).occupied.keys());
  }, []);

  const mapPlacing =
    ["stone", "board", "monster", "unit"].includes(tool) &&
    !pickSetupAreaFromMap;
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTool("none");
        setPickSetupAreaFromMap(false);
        setHoverTile(null);
        setMovingPiece(null);
        setSelectedPiece(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const placementPreview = useMemo(() => {
    const cells = new Set<string>();
    if (
      !hoverTile ||
      (tool !== "stone" &&
        tool !== "board" &&
        tool !== "monster" &&
        tool !== "unit")
    ) {
      return {
        kind: null as "stone" | "board" | "monster" | "unit" | null,
        valid: false,
        cells,
      };
    }

    if (tool === "monster" || tool === "unit") {
      const k = keyOf(hoverTile.x, hoverTile.y);
      cells.add(k);
      const valid =
        inside(hoverTile.x, hoverTile.y) &&
        !seaTiles.has(k) &&
        !occupiedByStones.has(k) &&
        !blockedFacilityTiles.has(k);
      return { kind: tool, valid, cells };
    }

    if (tool === "board") {
      const k = keyOf(hoverTile.x, hoverTile.y);
      cells.add(k);
      const valid =
        inside(hoverTile.x, hoverTile.y) &&
        !seaTiles.has(k) &&
        !occupiedByStones.has(k) &&
        !blockedFacilityTiles.has(k) &&
        !(
          openMonsterTile?.x === hoverTile.x &&
          openMonsterTile.y === hoverTile.y
        ) &&
        !(openUnitTile?.x === hoverTile.x && openUnitTile.y === hoverTile.y);
      return {
        kind: "board" as const,
        valid: valid && !piecePlacementError("board", hoverTile),
        cells,
      };
    }

    const valid =
      !piecePlacementError("stone", hoverTile) &&
      !stoneFootprint(hoverTile).some(
        (p) =>
          (openMonsterTile?.x === p.x && openMonsterTile.y === p.y) ||
          (openUnitTile?.x === p.x && openUnitTile.y === p.y),
      );
    stoneFootprint(hoverTile).forEach((p) => {
      if (inside(p.x, p.y)) cells.add(keyOf(p.x, p.y));
    });
    return { kind: "stone" as const, valid, cells };
  }, [
    blockedFacilityTiles,
    hoverTile,
    tool,
    seaTiles,
    occupiedByStones,
    pieces,
    openMonsterTile,
    openUnitTile,
    movingPiece,
    nativeLand,
    reclaimedTiles,
  ]);

  const [spriteCache] = useState(() => new BuilderSpriteCache());
  const [spriteVersion, setSpriteVersion] = useState(0);
  const plannedWorld = useMemo<BuilderState>(
    () => ({
      version: 1,
      reclaimed: [],
      items: [...pieces].map(([id, piece]) => ({
        ...makeItem("facility", piece === "stone" ? 191 : 68),
        id,
        ...parseKey(id),
      })),
    }),
    [pieces],
  );
  const placementGhost =
    hoverTile && (tool === "stone" || tool === "board")
      ? {
          ...makeItem("facility", tool === "stone" ? 191 : 68),
          id: movingPiece ?? "placement-preview",
          ...hoverTile,
        }
      : null;
  const facilityDraws = useMemo(
    () => builderDraws(plannedWorld, placementGhost, placementPreview.valid),
    [
      plannedWorld,
      tool,
      hoverTile?.x,
      hoverTile?.y,
      placementPreview.valid,
      movingPiece,
    ],
  );
  useEffect(
    () => spriteCache.subscribe(() => setSpriteVersion((v) => v + 1)),
    [spriteCache],
  );
  useEffect(() => {
    for (const id of new Set(facilityDraws.map((d) => d.sprite))) {
      const sprite = BUILDER_ASSETS.sprites[id];
      if (sprite)
        spriteCache.load(
          id,
          `${import.meta.env.BASE_URL}${sprite.url.replace(/^\//, "")}`,
        );
    }
  }, [facilityDraws, spriteCache]);
  const sceneActors = useMemo(() => {
    const actors: {
      cell: Point;
      kind: "monster" | "unit";
      preview?: boolean;
    }[] = [];
    for (const group of setupGroups)
      if (group.id !== activeSetupId) {
        if (group.monster)
          actors.push({ cell: group.monster, kind: "monster" });
        if (group.unit) actors.push({ cell: group.unit, kind: "unit" });
      }
    for (const kind of ["monster", "unit"] as const) {
      const preview = tool === kind && !!hoverTile;
      const cell = preview
        ? hoverTile
        : kind === "monster"
          ? openMonsterTile
          : openUnitTile;
      if (cell) actors.push({ cell, kind, preview });
    }
    return actors;
  }, [
    tool,
    hoverTile,
    openMonsterTile,
    openUnitTile,
    setupGroups,
    activeSetupId,
  ]);
  const drawScene = useMemo(
    () =>
      makeChaosScene({
        structures: facilityDraws.map((draw) => ({
          ...draw,
          opacity:
            draw.opacity *
            (buildStage === "stones"
              ? pieces.get(draw.itemId) === "stone"
                ? 1
                : 0.12
              : buildStage === "boards"
                ? pieces.get(draw.itemId) === "board"
                  ? 0.95
                  : 0.18
                : buildStage === "ally" || buildStage === "land"
                  ? 0.22
                  : 1),
        })),
        images: spriteCache.images,
        actors: sceneActors,
        human: humanFrames,
        monster: monsterImage,
        opacity: buildStage === "all" ? structureOpacity : 1,
        animate: animateActors,
      }),
    [
      facilityDraws,
      buildStage,
      pieces,
      spriteCache,
      spriteVersion,
      sceneActors,
      humanFrames,
      monsterImage,
      structureOpacity,
      animateActors,
    ],
  );

  const runtimeMapZoom = useMemo(() => {
    return Math.max(0.14, Math.min(3.2, mapZoom * 0.2));
  }, [mapZoom]);

  const runtimeLandOverrideCells = useMemo(() => {
    return Array.from(reclaimedTiles).map(parseKey);
  }, [reclaimedTiles]);

  const runtimeReclaimedTintCells = useMemo(() => {
    return Array.from(reclaimedTiles).map(parseKey);
  }, [reclaimedTiles]);

  const combinedEnvelope = useMemo(() => {
    const all = new Set<string>();
    stoneAnchors.forEach((anchor) => {
      movementEnvelope(anchor).forEach((k) => all.add(k));
    });
    return all;
  }, [stoneAnchors]);

  const extraOpenInEnvelope = useMemo(() => {
    const allowed = new Set<string>();
    setupGroups.forEach((group) => {
      if (group.id !== activeSetupId)
        for (const cell of [group.monster, group.unit])
          if (cell) allowed.add(keyOf(cell.x, cell.y));
    });
    if (openMonsterTile)
      allowed.add(keyOf(openMonsterTile.x, openMonsterTile.y));
    if (openUnitTile) allowed.add(keyOf(openUnitTile.x, openUnitTile.y));

    let count = 0;
    combinedEnvelope.forEach((k) => {
      if (allowed.has(k)) return;
      if (seaTiles.has(k)) return;
      if (occupiedByStones.has(k)) return;
      if (blockedFacilityTiles.has(k)) return;
      if (pieces.get(k) === "board") return;
      count += 1;
    });
    return count;
  }, [
    blockedFacilityTiles,
    setupGroups,
    activeSetupId,
    combinedEnvelope,
    seaTiles,
    occupiedByStones,
    pieces,
    openMonsterTile,
    openUnitTile,
  ]);

  const leakTiles = useMemo(() => {
    const leaks = new Set<string>();
    const allowed = new Set<string>();
    setupGroups.forEach((group) => {
      if (group.id !== activeSetupId)
        for (const cell of [group.monster, group.unit])
          if (cell) allowed.add(keyOf(cell.x, cell.y));
    });
    if (openMonsterTile)
      allowed.add(keyOf(openMonsterTile.x, openMonsterTile.y));
    if (openUnitTile) allowed.add(keyOf(openUnitTile.x, openUnitTile.y));

    combinedEnvelope.forEach((k) => {
      if (allowed.has(k)) return;
      if (seaTiles.has(k)) return;
      if (occupiedByStones.has(k)) return;
      if (blockedFacilityTiles.has(k)) return;
      if (pieces.get(k) === "board") return;
      leaks.add(k);
    });
    return leaks;
  }, [
    blockedFacilityTiles,
    setupGroups,
    activeSetupId,
    combinedEnvelope,
    seaTiles,
    occupiedByStones,
    pieces,
    openMonsterTile,
    openUnitTile,
  ]);

  const stoneCoverageChecks = useMemo(() => {
    const allowed = new Set<string>();
    setupGroups.forEach((group) => {
      if (group.id !== activeSetupId)
        for (const cell of [group.monster, group.unit])
          if (cell) allowed.add(keyOf(cell.x, cell.y));
    });
    if (openMonsterTile)
      allowed.add(keyOf(openMonsterTile.x, openMonsterTile.y));
    if (openUnitTile) allowed.add(keyOf(openUnitTile.x, openUnitTile.y));

    return stoneAnchors.map((anchor) => {
      const id = stoneIdByAnchorKey.get(keyOf(anchor.x, anchor.y)) ?? 0;
      const envelope = movementEnvelope(anchor);
      let leakCount = 0;
      envelope.forEach((k) => {
        if (allowed.has(k)) return;
        if (seaTiles.has(k)) return;
        if (occupiedByStones.has(k)) return;
        if (blockedFacilityTiles.has(k)) return;
        if (pieces.get(k) === "board") return;
        leakCount += 1;
      });
      return { id, anchor, leakCount, covered: leakCount === 0 };
    });
  }, [
    blockedFacilityTiles,
    setupGroups,
    activeSetupId,
    stoneAnchors,
    stoneIdByAnchorKey,
    seaTiles,
    occupiedByStones,
    pieces,
    openMonsterTile,
    openUnitTile,
  ]);

  const runtimeCoverageOverlays = useMemo<RuntimeCellHighlightOverlay[]>(() => {
    const overlays: RuntimeCellHighlightOverlay[] = [];
    if (buildStage === "land")
      (
        setupGroups.find((group) => group.id === activeSetupId)
          ?.reclaimedKeys ?? [...reclaimedTiles]
      ).forEach((key) =>
        overlays.push({
          ...parseKey(key),
          fillColor: "rgba(56,189,248,0.35)",
          strokeColor: "#38bdf8",
          lineWidth: 2,
        }),
      );
    if (buildStage === "ally" && openUnitTile)
      overlays.push({
        ...openUnitTile,
        fillColor: "rgba(56,189,248,0.4)",
        strokeColor: "#38bdf8",
        lineWidth: 3,
      });
    if (selectedPiece) {
      const anchor = parseKey(selectedPiece);
      const selectedCells =
        pieces.get(selectedPiece) === "stone"
          ? stoneFootprint(anchor)
          : [anchor];
      selectedCells.forEach((cell) =>
        overlays.push({
          ...cell,
          fillColor: "rgba(56,189,248,0.16)",
          strokeColor: "#38bdf8",
          lineWidth: 2,
        }),
      );
    }
    placementPreview.cells.forEach((k) =>
      overlays.push({
        ...parseKey(k),
        fillColor: placementPreview.valid
          ? "rgba(34,197,94,0.35)"
          : "rgba(239,68,68,0.4)",
        strokeColor: placementPreview.valid ? "#22c55e" : "#ef4444",
        lineWidth: 2,
      }),
    );
    if (!showCoverageCheck) return overlays;

    combinedEnvelope.forEach((k) => {
      if (leakTiles.has(k)) return;
      if (seaTiles.has(k)) return;

      const p = parseKey(k);
      const isCovered = occupiedByStones.has(k) || pieces.get(k) === "board";
      const isReservedOpen =
        (openMonsterTile &&
          openMonsterTile.x === p.x &&
          openMonsterTile.y === p.y) ||
        (openUnitTile && openUnitTile.x === p.x && openUnitTile.y === p.y);
      if (!isCovered && !isReservedOpen) {
        overlays.push({
          x: p.x,
          y: p.y,
          fillColor: "rgba(252, 211, 77, 0.42)",
          strokeColor: "rgba(245, 158, 11, 0.72)",
          lineWidth: 1,
        });
      }
    });

    leakTiles.forEach((k) => {
      const p = parseKey(k);
      overlays.push({
        x: p.x,
        y: p.y,
        fillColor: "rgba(251, 113, 133, 0.74)",
        strokeColor: "rgba(239, 68, 68, 0.96)",
        lineWidth: 1.2,
      });
    });

    return overlays;
  }, [
    selectedSetupArea,
    buildStage,
    reclaimedTiles,
    setupGroups,
    activeSetupId,
    panel,
    selectedPiece,
    placementPreview,
    showCoverageCheck,
    combinedEnvelope,
    leakTiles,
    seaTiles,
    occupiedByStones,
    pieces,
    openMonsterTile,
    openUnitTile,
  ]);

  function rememberSetup() {
    setUndoStack((previous) => [
      ...previous.slice(-19),
      {
        pieces: new Map(pieces),
        paintedSea: new Set(paintedSeaTiles),
        reclaimed: new Set(reclaimedTiles),
        monster: openMonsterTile,
        unit: openUnitTile,
        area: selectedSetupArea,
        groups: currentGroups(),
        activeGroup: activeSetupId,
      },
    ]);
  }

  function currentGroups() {
    return setupGroups.map((group) => ({
      ...group,
      pieceKeys: group.pieceKeys.filter((key) => pieces.has(key)),
      ...(group.id === activeSetupId
        ? { monster: openMonsterTile, unit: openUnitTile }
        : {}),
    }));
  }

  function undoSetup() {
    const snapshot = undoStack.at(-1);
    if (!snapshot) return;
    setSelectedPiece(null);
    setMovingPiece(null);
    setPieces(snapshot.pieces);
    setPaintedSeaTiles(snapshot.paintedSea);
    setReclaimedTiles(snapshot.reclaimed);
    setOpenMonsterTile(snapshot.monster);
    setOpenUnitTile(snapshot.unit);
    setSelectedSetupArea(snapshot.area);
    setSetupGroups(snapshot.groups);
    setActiveSetupId(snapshot.activeGroup);
    setLocationInput(
      snapshot.area
        ? String(levelAt(snapshot.area.x, snapshot.area.y) ?? "")
        : "",
    );
    setUndoStack((previous) => previous.slice(0, -1));
    setResultCycle(null);
    setGeneratorError(null);
    setTool("none");
    setPickSetupAreaFromMap(false);
    setHoverTile(null);
    setCopyStatus("Last change undone.");
  }

  function clearAll() {
    rememberSetup();
    setSelectedSetupArea(null);
    setPickSetupAreaFromMap(false);
    setTool("none");
    setSelectedPiece(null);
    setMovingPiece(null);
    setPieces(new Map());
    setSetupGroups([]);
    setActiveSetupId(null);
    setPaintedSeaTiles(new Set());
    setReclaimedTiles(new Set());
    setOpenMonsterTile(null);
    setOpenUnitTile(null);
    setGeneratorError(null);
    setCopyStatus(null);
    setShowCoverageCheck(false);
    setLocationInput("");
    setResultCycle(null);
    setHoverTile(null);
  }

  function focusSetupView(
    stage?: "land" | "stones" | "boards" | "ally" | null,
  ) {
    const focusPoints: Point[] = [];
    const activeKeys = setupGroups.find(
      (group) => group.id === activeSetupId,
    )?.pieceKeys;
    const include = (key: string) => !activeKeys || activeKeys.includes(key);
    stoneAnchors.forEach((anchor) => {
      if (include(keyOf(anchor.x, anchor.y)))
        focusPoints.push(...stoneFootprint(anchor));
    });
    pieces.forEach((piece, k) => {
      if (piece === "board" && include(k)) focusPoints.push(parseKey(k));
    });
    if (openMonsterTile) focusPoints.push(openMonsterTile);
    if (openUnitTile) focusPoints.push(openUnitTile);
    if (stage === "land")
      (
        setupGroups.find((group) => group.id === activeSetupId)
          ?.reclaimedKeys ?? [...reclaimedTiles]
      ).forEach((key) => focusPoints.push(parseKey(key)));

    if (focusPoints.length === 0) {
      setCopyStatus("No setup tiles to focus yet.");
      return;
    }

    fitSetupView(focusPoints, stage);
  }

  function fitSetupView(
    points: readonly Point[],
    stage?: "land" | "stones" | "boards" | "ally" | null,
  ) {
    const viewport = mapCanvasContainerRef.current;
    if (!viewport) return;
    const guided = stage !== null && (stage !== undefined || panel === "plan");
    const activeStage = stage ?? buildStage;
    const width = viewport.clientWidth,
      height = viewport.clientHeight;
    const left = guided && width >= 760 ? 350 : 0;
    let top =
      guided && width < 760
        ? activeStage === "boards"
          ? 340
          : activeStage === "ally"
            ? 310
            : 260
        : 80;
    if (
      guided &&
      width < 760 &&
      panel === "plan" &&
      activeStage === buildStage
    ) {
      const panelRect = workspacePanelRef.current?.getBoundingClientRect();
      if (panelRect)
        top = panelRect.bottom - viewport.getBoundingClientRect().top + 20;
    }
    const bottom = 80;
    const fit = fitChaosSetup(points, {
      width: Math.max(160, width - left),
      height: Math.max(80, height - top - bottom),
    });
    if (!fit) return;
    const zoom = clampZoom(fit.zoom / 0.2) * 0.2;
    setMapZoom(zoom / 0.2);
    const dx = left / 2 / (24 * zoom),
      dy = (top - bottom) / 2 / (12 * zoom);
    setRuntimeFocusCell({
      x: fit.x - (dx + dy) / 2,
      y: fit.y - (dy - dx) / 2,
      token: Date.now(),
    });
  }

  useEffect(() => {
    if (panel !== "plan") return;
    const observer = new ResizeObserver(() =>
      focusSetupView(buildStage === "all" ? undefined : buildStage),
    );
    if (workspacePanelRef.current) observer.observe(workspacePanelRef.current);
    if (mapCanvasContainerRef.current)
      observer.observe(mapCanvasContainerRef.current);
    return () => observer.disconnect();
  }, [panel, buildStage, pieces, openMonsterTile, openUnitTile]);

  function resolveLevelInput(input: string) {
    const level = /^\d+$/.test(input.trim()) ? Number(input.trim()) : NaN;
    return resolveChaosLevel(
      input,
      levelTilesByLevel.get(level) ?? [],
      nativeLand ?? new Set(),
      selectedSetupArea,
    );
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
          if (
            openMonsterTile &&
            openMonsterTile.x === x &&
            openMonsterTile.y === y
          ) {
            row += "M";
          } else if (
            openUnitTile &&
            openUnitTile.x === x &&
            openUnitTile.y === y
          ) {
            row += "U";
          } else if (spawnIdByKey.has(k)) {
            row += "S";
          } else if (blockedFacilityTiles.has(k)) {
            row += "F";
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
        "legend: B=board S=spawn X=stone M=monster U=unit F=facility ~=sea .=open",
        ...rows,
      ].join("\n");
    };

    const lines: string[] = [];
    lines.push(
      `stones=${stoneAnchors.length} boards=${boardIdByKey.size} reclaimed=${reclaimedTiles.size}`,
    );
    lines.push(
      `extraOpenInEnvelope=${extraOpenInEnvelope} mStandable=${monsterTileStandable} uStandable=${unitTileStandable} unitAdj=${unitAdjMonster}`,
    );
    lines.push(
      `M=${openMonsterTile ? `(${openMonsterTile.x},${openMonsterTile.y})` : "-"} U=${openUnitTile ? `(${openUnitTile.x},${openUnitTile.y})` : "-"}`,
    );
    stoneReachChecks.forEach(
      ({ id, anchor, spawn, canReachM, distanceToM }) => {
        lines.push(
          `S${id}: anchor=(${anchor.x},${anchor.y}) spawn=(${spawn.x},${spawn.y}) reach=${canReachM} steps=${distanceToM ?? "-"}`,
        );
      },
    );
    lines.push(
      `profile: n=${stoneAnchors.length} targetMax=${distanceProfile.target.maxDistance} targetSpread=${distanceProfile.target.maxSpread}`,
    );
    lines.push(
      `profile: max=${distanceProfile.maxDistance ?? "-"} min=${distanceProfile.minDistance ?? "-"} spread=${distanceProfile.spread ?? "-"}`,
    );
    lines.push(
      `profile: allReach=${distanceProfile.allReach} maxPass=${distanceProfile.distancePass} spreadPass=${distanceProfile.spreadPass} overall=${distanceProfile.overallPass}`,
    );
    lines.push("ascii-layout:");
    lines.push(renderAsciiMap());

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyStatus("Diagnostics copied. Paste them here.");
    } catch {
      setCopyStatus(
        "Copy failed. You can manually copy the diagnostics panel text.",
      );
    }
  }

  function isStoneAnchorValid(
    anchor: Point,
    mapSea: Set<string>,
    mapPieces: Map<string, Piece>,
    blockedTiles: Set<string>,
  ) {
    if (!inside(anchor.x, anchor.y) || !inside(anchor.x + 1, anchor.y + 1))
      return false;
    const fp = stoneFootprint(anchor);
    const footprintKeys = new Set(fp.map((p) => keyOf(p.x, p.y)));

    // Prevent any 2x2 footprint intersection with already placed stones.
    for (const [k, piece] of mapPieces.entries()) {
      if (piece !== "stone") continue;
      const existingAnchor = parseKey(k);
      const existingFootprint = stoneFootprint(existingAnchor);
      if (existingFootprint.some((p) => footprintKeys.has(keyOf(p.x, p.y)))) {
        return false;
      }
    }

    for (const p of fp) {
      const k = keyOf(p.x, p.y);
      if (mapSea.has(k)) return false;
      if (blockedTiles.has(k)) return false;
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

  function piecePlacementError(piece: Piece, cell: Point) {
    if (!nativeLand) return "Wait for the map to load.";
    const state: BuilderState = {
      version: 1,
      reclaimed: [...reclaimedTiles].map(parseKey),
      items: [
        ...initialWorld().items,
        ...[...pieces]
          .filter(([id]) => id !== movingPiece)
          .map(([id, kind]) => ({
            ...makeItem("facility", kind === "stone" ? 191 : 68),
            id: `chaos-${id}`,
            ...parseKey(id),
          })),
      ],
    };
    const item = {
      ...makeItem("facility", piece === "stone" ? 191 : 68),
      id: movingPiece ? `chaos-${movingPiece}` : "chaos-draft",
      ...cell,
    };
    // The edited object stays in the state for native move/budget checks; omit only its occupancy.
    if (movingPiece) {
      const kind = pieces.get(movingPiece)!;
      state.items.push({
        ...makeItem("facility", kind === "stone" ? 191 : 68),
        id: item.id,
        ...parseKey(movingPiece),
      });
    }
    return (
      validatePlacement(
        item,
        state,
        placementIndex(state, nativeLand, movingPiece ? item.id : undefined),
        { ignoreAcquisitionLimit: piece === "stone" },
      ).error ?? null
    );
  }

  function beginTool(next: Tool) {
    setTool(next);
    setMovingPiece(null);
    setSelectedPiece(null);
    setHoverTile(null);
    setPickSetupAreaFromMap(false);
    setPanel(null);
    setCopyStatus(null);
  }

  function cancelPlacement() {
    setTool("none");
    setHoverTile(null);
    setMovingPiece(null);
  }

  function moveSelected() {
    if (!selectedPiece) return;
    const piece = pieces.get(selectedPiece);
    if (!piece) return;
    setMovingPiece(selectedPiece);
    setTool(piece);
    setHoverTile(null);
    setSelectedPiece(null);
    setPanel(null);
  }

  function removeSelected() {
    if (!selectedPiece) return;
    rememberSetup();
    setPieces((previous) => {
      const next = new Map(previous);
      next.delete(selectedPiece);
      return next;
    });
    setSelectedPiece(null);
    setResultCycle(null);
    setCopyStatus("Piece removed. Undo restores it.");
  }

  function onCellClick(x: number, y: number) {
    const k = keyOf(x, y);
    if (!pickSetupAreaFromMap && tool === "none") {
      const hit = [...pieces].find(([id, kind]) =>
        kind === "stone"
          ? stoneFootprint(parseKey(id)).some((p) => p.x === x && p.y === y)
          : id === k,
      );
      setSelectedPiece(hit?.[0] ?? null);
      return;
    }

    if (pickSetupAreaFromMap) {
      const lv = levelAt(x, y);
      if (lv != null) {
        setSelectedSetupArea({ x, y });
        setLocationInput(String(lv));
        setGeneratorError(null);
        setPickSetupAreaFromMap(false);
        setPanel("plan");
        setCopyStatus(`Picked location: (${x},${y}) Lv ${lv}.`);
      } else {
        setCopyStatus(
          "Selected tile has no valid level data. Pick another tile.",
        );
      }
      return;
    }

    if (tool !== "none") {
      if (tool === "stone" || tool === "board") {
        const error = piecePlacementError(tool, { x, y });
        if (error) {
          setCopyStatus(error);
          return;
        }
        const occupiedByMarker = (
          tool === "stone" ? stoneFootprint({ x, y }) : [{ x, y }]
        ).some(
          (p) =>
            (openMonsterTile?.x === p.x && openMonsterTile.y === p.y) ||
            (openUnitTile?.x === p.x && openUnitTile.y === p.y),
        );
        if (occupiedByMarker) {
          setCopyStatus("Keep the monster and fighter tiles open.");
          return;
        }
        rememberSetup();
        setPieces((previous) => {
          const next = new Map(previous);
          if (movingPiece) next.delete(movingPiece);
          next.set(k, tool);
          return next;
        });
        setSetupGroups((previous) =>
          previous.map((group) =>
            !(movingPiece
              ? group.pieceKeys.includes(movingPiece)
              : group.id === `${Math.floor(x / 16)},${Math.floor(y / 16)}`)
              ? group
              : {
                  ...group,
                  pieceKeys: [
                    ...group.pieceKeys.filter(
                      (key) => key !== movingPiece && key !== k,
                    ),
                    k,
                  ],
                },
          ),
        );
        setResultCycle(null);
        setGeneratorError(null);
        setCopyStatus(movingPiece ? "Piece moved." : "Piece placed.");
        setSelectedPiece(k);
        setMovingPiece(null);
        setTool("none");
        setHoverTile(null);
        return;
      }
      if (!nativeLand) {
        setCopyStatus("Wait for the map to load.");
        return;
      }
      if (
        (tool === "monster" || tool === "unit") &&
        (seaTiles.has(k) ||
          occupiedByStones.has(k) ||
          blockedFacilityTiles.has(k))
      ) {
        setCopyStatus("Markers need an open land tile.");
        return;
      }
      if (
        tool === "reclaim" &&
        !(reclaimMode === "claim" ? seaTiles.has(k) : reclaimedTiles.has(k))
      ) {
        setCopyStatus(
          reclaimMode === "claim"
            ? "Claim works only on sea tiles."
            : "Unclaim works only on reclaimed tiles.",
        );
        return;
      }
      rememberSetup();
      setResultCycle(null);
      setGeneratorError(null);
      setCopyStatus(null);
    }
    if (tool === "reclaim") {
      const currentlyReclaimed = reclaimedTiles.has(k);
      const currentlySea = seaTiles.has(k);
      if (reclaimMode === "unclaim" && currentlyReclaimed) {
        // Unclaim: turn tile back into sea and clear pieces and markers on that tile.
        if (openMonsterTile?.x === x && openMonsterTile.y === y)
          setOpenMonsterTile(null);
        if (openUnitTile?.x === x && openUnitTile.y === y)
          setOpenUnitTile(null);
        setReclaimedTiles((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
        setPaintedSeaTiles((prev) => {
          const next = new Set(prev);
          if (baseSeaTiles.has(k)) {
            next.delete(k);
          } else {
            next.add(k);
          }
          return next;
        });
        setPieces((prev) => {
          const next = new Map(prev);
          next.delete(k);
          removeStoneCovering(k, next);
          return next;
        });
      } else if (reclaimMode === "claim" && currentlySea) {
        // Claim: convert sea to usable land.
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
      } else {
        setCopyStatus(
          reclaimMode === "claim"
            ? "Claim works only on sea tiles."
            : "Unclaim works only on reclaimed tiles.",
        );
      }
      return;
    }

    if (tool === "erase") {
      if (
        openMonsterTile &&
        openMonsterTile.x === x &&
        openMonsterTile.y === y
      ) {
        setOpenMonsterTile(null);
      }
      if (openUnitTile && openUnitTile.x === x && openUnitTile.y === y) {
        setOpenUnitTile(null);
      }
      setPieces((prev) => {
        const next = new Map(prev);
        next.delete(k);
        removeStoneCovering(k, next);
        return next;
      });
      return;
    }

    if (tool === "monster" || tool === "unit") {
      if (
        seaTiles.has(k) ||
        occupiedByStones.has(k) ||
        blockedFacilityTiles.has(k)
      ) {
        setCopyStatus("M/U markers can only be placed on open land tiles.");
        return;
      }

      setPieces((prev) => {
        const next = new Map(prev);
        next.delete(k);
        return next;
      });

      if (tool === "monster") {
        setOpenMonsterTile({ x, y });
        if (openUnitTile && openUnitTile.x === x && openUnitTile.y === y) {
          setOpenUnitTile(null);
        }
      } else {
        setOpenUnitTile({ x, y });
        if (
          openMonsterTile &&
          openMonsterTile.x === x &&
          openMonsterTile.y === y
        ) {
          setOpenMonsterTile(null);
        }
      }
    }
  }

  function plannerContext(focus: Point): ChaosPlannerContext {
    const level = levelAt(focus.x, focus.y)!;
    const areaWidth = COLS / NATIVE_MAP[0].length,
      areaHeight = ROWS / NATIVE_MAP.length;
    const areaX = Math.floor(focus.x / areaWidth),
      areaY = Math.floor(focus.y / areaHeight);
    const id = `${areaX},${areaY}`;
    const replacing = new Set(
      setupGroups.find((group) => group.id === id)?.pieceKeys ?? [],
    );
    const blocked = new Set(blockedFacilityTiles);
    pieces.forEach((kind, key) => {
      if (replacing.has(key)) return;
      (kind === "stone"
        ? stoneFootprint(parseKey(key))
        : [parseKey(key)]
      ).forEach((cell) => blocked.add(keyOf(cell.x, cell.y)));
    });
    for (const group of currentGroups())
      if (group.id !== id) {
        for (const cell of [group.monster, group.unit])
          if (cell) blocked.add(keyOf(cell.x, cell.y));
      }
    return {
      land: new Set([...(nativeLand ?? []), ...retainedReclaimed(id)]),
      blocked,
      focus,
      areaCells: (levelTilesByLevel.get(level) ?? []).filter(
        (cell) =>
          Math.floor(cell.x / areaWidth) === areaX &&
          Math.floor(cell.y / areaHeight) === areaY,
      ),
    };
  }

  function retainedReclaimed(replacingId: string) {
    const replacing = setupGroups.find((group) => group.id === replacingId);
    const replacingKeys = new Set(replacing?.pieceKeys ?? []);
    const needed = new Set<string>();
    pieces.forEach((kind, key) => {
      if (replacingKeys.has(key)) return;
      (kind === "stone"
        ? stoneFootprint(parseKey(key))
        : [parseKey(key)]
      ).forEach((cell) => needed.add(keyOf(cell.x, cell.y)));
    });
    for (const group of currentGroups())
      if (group.id !== replacingId) {
        group.reclaimedKeys?.forEach((key) => needed.add(key));
        for (const cell of [group.monster, group.unit])
          if (cell) needed.add(keyOf(cell.x, cell.y));
      }
    const retained = new Set(reclaimedTiles);
    replacing?.reclaimedKeys?.forEach((key) => {
      if (!needed.has(key)) retained.delete(key);
    });
    return retained;
  }

  function applyAnchorsAsSetup(
    anchors: Point[],
    focus: Point,
    _painted: Set<string>,
    _reclaimed: Set<string>,
    resultIndex: number,
    resultTotal: number,
  ) {
    const layout = completeChaosLayout(anchors, plannerContext(focus));
    if (!layout) {
      setGeneratorError(
        "This layout cannot connect to existing land. Generate a new layout.",
      );
      return false;
    }
    rememberSetup();
    const id = `${Math.floor(focus.x / 16)},${Math.floor(focus.y / 16)}`;
    let groups = currentGroups();
    if (!groups.length && pieces.size) {
      const area = stoneAnchors[0]
        ? eastFrontSpawn(stoneAnchors[0])
        : (selectedSetupArea ?? focus);
      groups = [
        {
          id: `${Math.floor(area.x / 16)},${Math.floor(area.y / 16)}`,
          area,
          pieceKeys: [...pieces.keys()],
          monster: openMonsterTile,
          unit: openUnitTile,
        },
      ];
    }
    const next = new Map<string, Piece>(pieces);
    groups
      .find((group) => group.id === id)
      ?.pieceKeys.forEach((key) => next.delete(key));
    const newKeys: string[] = [];
    layout.anchors.forEach((anchor) => {
      const key = keyOf(anchor.x, anchor.y);
      next.set(key, "stone");
      newKeys.push(key);
    });
    layout.boards.forEach((cell) => {
      const key = keyOf(cell.x, cell.y);
      next.set(key, "board");
      newKeys.push(key);
    });
    const usedGround = new Set<string>(
      [
        ...layout.anchors.flatMap(stoneFootprint),
        ...layout.boards,
        layout.monster,
        layout.unit,
      ].map((cell) => keyOf(cell.x, cell.y)),
    );
    const plannedLand = new Set([
      ...layout.reclaimed.map((cell) => keyOf(cell.x, cell.y)),
      ...[...retainedReclaimed(id)].filter((key) => usedGround.has(key)),
    ]);
    setSetupGroups([
      ...groups.filter((group) => group.id !== id),
      {
        id,
        area: focus,
        pieceKeys: newKeys,
        reclaimedKeys: [...plannedLand],
        monster: layout.monster,
        unit: layout.unit,
      },
    ]);
    setActiveSetupId(id);
    setPieces(next);
    setReclaimedTiles(
      new Set([
        ...retainedReclaimed(id),
        ...layout.reclaimed.map((cell) => keyOf(cell.x, cell.y)),
      ]),
    );
    setOpenMonsterTile(layout.monster);
    setOpenUnitTile(layout.unit);
    setSelectedPiece(null);
    setMovingPiece(null);
    setTool("none");
    setHoverTile(null);
    setPickSetupAreaFromMap(false);
    setGeneratorError(null);
    setSuggestedStoneCount(null);
    setPanel("plan");
    setBuildStage("all");
    setShowLevelOverlay(false);
    setShowCoverageCheck(false);
    fitSetupView(
      newKeys.map(parseKey).concat([layout.monster, layout.unit]),
      undefined,
    );
    setCopyStatus(null);
    return true;
  }

  function cycleToNextResult() {
    if (!resultCycle || resultCycle.options.length < 2) return;
    const index = (resultCycle.index + 1) % resultCycle.options.length;
    if (
      applyAnchorsAsSetup(
        resultCycle.options[index],
        resultCycle.focus,
        new Set(),
        new Set(),
        index,
        resultCycle.options.length,
      )
    )
      setResultCycle((previous) =>
        previous ? { ...previous, index } : previous,
      );
  }

  function generateSetup(count = demoStoneCount) {
    const focus = selectedSetupArea ?? resolveLevelInput(locationInput);
    if (!focus || !nativeLand) return;
    const context = plannerContext(focus);
    const { layouts } = findChaosLayouts(context, count);
    if (!layouts.length) {
      let suggested: number | null = null;
      for (let smaller = count - 1; smaller >= 1; smaller--)
        if (findChaosLayouts(context, smaller, 1).layouts.length) {
          suggested = smaller;
          break;
        }
      setSuggestedStoneCount(suggested);
      fitSetupView(context.areaCells, "stones");
      setGeneratorError(
        `No ${count}-stone layout found at Lv ${levelAt(focus.x, focus.y)} with connected land and two open positions. ${suggested ? `Try ${suggested} stone${suggested === 1 ? "" : "s"}, or pick another area.` : "Pick another area."}`,
      );
      setResultCycle(null);
      setBuildStage("all");
      return;
    }
    const options = layouts.map((layout) => layout.anchors);
    if (
      applyAnchorsAsSetup(
        options[0],
        focus,
        new Set(),
        new Set(),
        0,
        options.length,
      )
    )
      setResultCycle({
        options,
        index: 0,
        focus,
        basePaintedSeaTiles: new Set(),
        baseReclaimedTiles: new Set(),
      });
  }

  function fillMissingBoards() {
    const added = [...leakTiles].filter(
      (key) => !piecePlacementError("board", parseKey(key)),
    );
    if (!added.length) return;
    rememberSetup();
    setPieces((previous) => {
      const next = new Map(previous);
      added.forEach((key) => next.set(key, "board"));
      return next;
    });
    setResultCycle(null);
    setCopyStatus(
      `Added ${added.length} board${added.length === 1 ? "" : "s"}.`,
    );
  }

  const unitAdjMonster =
    openMonsterTile && openUnitTile
      ? Math.abs(openMonsterTile.x - openUnitTile.x) +
          Math.abs(openMonsterTile.y - openUnitTile.y) ===
        1
      : false;

  const monsterTileStandable = openMonsterTile
    ? !seaTiles.has(keyOf(openMonsterTile.x, openMonsterTile.y)) &&
      !occupiedByStones.has(keyOf(openMonsterTile.x, openMonsterTile.y)) &&
      !blockedFacilityTiles.has(keyOf(openMonsterTile.x, openMonsterTile.y))
    : false;

  const unitTileStandable = openUnitTile
    ? !seaTiles.has(keyOf(openUnitTile.x, openUnitTile.y)) &&
      !occupiedByStones.has(keyOf(openUnitTile.x, openUnitTile.y)) &&
      !blockedFacilityTiles.has(keyOf(openUnitTile.x, openUnitTile.y))
    : false;
  const selectedKind = selectedPiece ? pieces.get(selectedPiece) : null;
  const guideKeys = setupGroups.find(
    (group) => group.id === activeSetupId,
  )?.pieceKeys;
  const guideReclaimedCount =
    setupGroups.find((group) => group.id === activeSetupId)?.reclaimedKeys
      ?.length ?? reclaimedTiles.size;
  const guideStoneCount = [...pieces].filter(
    ([key, kind]) =>
      kind === "stone" && (!guideKeys || guideKeys.includes(key)),
  ).length;
  const guideBoardCount = [...pieces].filter(
    ([key, kind]) =>
      kind === "board" && (!guideKeys || guideKeys.includes(key)),
  ).length;
  const togglePanel = (next: NonNullable<typeof panel>) => {
    setPanel((previous) => (previous === next ? null : next));
    setSelectedPiece(null);
    setBuildStage("all");
    cancelPlacement();
    setPickSetupAreaFromMap(false);
  };
  const panelClass =
    "absolute left-3 top-[72px] z-30 max-h-[calc(100%-168px)] w-[min(330px,calc(100%-24px))] overflow-y-auto rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur";

  return (
    <div className="p-2 sm:p-3">
      <div
        ref={mapPanelRef}
        className="relative isolate h-[calc(100dvh-80px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card"
        aria-label="Chaos Stone workspace"
      >
        <div ref={mapCanvasContainerRef} className="absolute inset-0">
          <RuntimeWorldRenderTestPage
            publicMode
            fillHeight
            editorCellPicking
            interactiveInPublicMode
            hideNatureToggleButtons
            initialNatureVisibility={HIDDEN_MAP_NATURE}
            onTerrainReady={onTerrainReady}
            mapPlacement={
              mapPlacing
                ? {
                    width: tool === "stone" ? 2 : 1,
                    height: tool === "stone" ? 2 : 1,
                    label: tool === "unit" ? "fighter" : tool,
                    valid: !!nativeLand && placementPreview.valid,
                    onChange: (cell) =>
                      setHoverTile((previous) =>
                        previous?.x === cell.x && previous.y === cell.y
                          ? previous
                          : cell,
                      ),
                    onConfirm: (cell) => onCellClick(cell.x, cell.y),
                    onCancel: cancelPlacement,
                  }
                : undefined
            }
            controlledZoom={runtimeMapZoom}
            zoomRequest={zoomRequest}
            showCellGrid={false}
            showLevelOverlay={showLevelOverlay}
            visibleOnePieceFacilityIds={VISIBLE_MAP_FACILITIES}
            landOverrideCells={runtimeLandOverrideCells}
            reclaimedTintCells={runtimeReclaimedTintCells}
            focusCell={runtimeFocusCell}
            drawSceneLayer={drawScene}
            animateScene={
              animateActors &&
              !!humanFrames &&
              sceneActors.some((actor) => actor.kind === "unit")
            }
            cellHighlightOverlays={runtimeCoverageOverlays}
            onCellClick={
              mapPlacing ? undefined : (cell) => onCellClick(cell.x, cell.y)
            }
            onEditorObjectClick={(point, camera) => {
              if (tool !== "none" || pickSetupAreaFromMap) return false;
              const id = hitBuilder(
                point,
                camera,
                facilityDraws,
                spriteCache.alpha,
              );
              if (!id || id === "placement-preview") return false;
              setSelectedPiece(id);
              setPanel(null);
              return true;
            }}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
            <img
              src={CHAOS_STONE_SPRITE}
              alt=""
              className="h-8 w-8 object-contain [image-rendering:pixelated]"
            />
            <div>
              <h1 className="text-sm font-semibold sm:text-base">
                Chaos Stone
              </h1>
              <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                {activeSetupId &&
                setupGroups.find((group) => group.id === activeSetupId)
                  ? `Lv ${levelAt(setupGroups.find((group) => group.id === activeSetupId)!.area.x, setupGroups.find((group) => group.id === activeSetupId)!.area.y)} · ${guideStoneCount} stone${guideStoneCount === 1 ? "" : "s"}`
                  : `${stoneAnchors.length} stones on map`}
              </p>
            </div>
          </div>
          <div className="pointer-events-auto flex gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
            <Button
              size="icon"
              variant={panel === "view" ? "secondary" : "ghost"}
              aria-label="View settings"
              aria-pressed={panel === "view"}
              onClick={() => togglePanel("view")}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={panel === "help" ? "secondary" : "ghost"}
              aria-label="Planner help"
              aria-pressed={panel === "help"}
              onClick={() => togglePanel("help")}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {panel && (
          <section
            ref={workspacePanelRef}
            className={panelClass}
            aria-label={
              panel === "plan"
                ? "Generate setup"
                : panel === "build"
                  ? "Build tools"
                  : panel === "view"
                    ? "View settings"
                    : "Planner help"
            }
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {panel === "plan"
                  ? "Generate"
                  : panel === "build"
                    ? "Edit your layout"
                    : panel === "view"
                      ? "Map view"
                      : "About this planner"}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close panel"
                className="h-7 w-7"
                onClick={() => {
                  setPanel(null);
                  setBuildStage("all");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {panel === "plan" && (
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-3">
                  <label className="min-w-0 text-xs font-medium">
                    Area level
                    <input
                      ref={locationInputRef}
                      value={locationInput}
                      list="chaos-levels"
                      inputMode="numeric"
                      placeholder="e.g. 135"
                      aria-label="Map level"
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      onChange={(event) => {
                        setLocationInput(event.target.value);
                        setSelectedSetupArea(
                          resolveLevelInput(event.target.value),
                        );
                        setResultCycle(null);
                        setCopyStatus(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          generateSetup();
                        }
                      }}
                    />
                    <datalist id="chaos-levels">
                      {levelOptions.map((level) => (
                        <option key={level} value={level} />
                      ))}
                    </datalist>
                  </label>
                  <label className="text-xs font-medium">
                    Stones
                    <select
                      aria-label="Stone count"
                      value={demoStoneCount}
                      onChange={(event) => {
                        setDemoStoneCount(Number(event.target.value));
                        setResultCycle(null);
                        setGeneratorError(null);
                        setSuggestedStoneCount(null);
                      }}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {!selectedSetupArea && locationInput.trim() && (
                  <p className="text-xs text-destructive">
                    Choose an exact map level from the suggestions.
                  </p>
                )}
                <Button
                  aria-label="Generate setup"
                  className="w-full gap-2"
                  disabled={!selectedSetupArea || !nativeLand}
                  onClick={() => {
                    setGeneratorError(null);
                    generateSetup();
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate
                </Button>
                {activeSetupId &&
                  selectedSetupArea &&
                  setupGroups.find((group) => group.id === activeSetupId)
                    ?.id ===
                    `${Math.floor(selectedSetupArea.x / 16)},${Math.floor(selectedSetupArea.y / 16)}` && (
                    <p className="text-xs text-muted-foreground" role="status">
                      {guideStoneCount} stone{guideStoneCount === 1 ? "" : "s"}{" "}
                      · {guideBoardCount} boards
                      {guideReclaimedCount
                        ? ` · Reclaim ${guideReclaimedCount} tiles`
                        : ""}
                    </p>
                  )}
                {generatorError && (
                  <p role="alert" className="text-xs text-destructive">
                    {generatorError}
                  </p>
                )}
                {suggestedStoneCount !== null && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setDemoStoneCount(suggestedStoneCount);
                      generateSetup(suggestedStoneCount);
                    }}
                  >
                    Generate with {suggestedStoneCount} stone
                    {suggestedStoneCount === 1 ? "" : "s"}
                  </Button>
                )}
              </div>
            )}
            {panel === "build" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-20 flex-col gap-1"
                    onClick={() => beginTool("stone")}
                  >
                    <img
                      src={CHAOS_STONE_SPRITE}
                      alt=""
                      className="h-9 w-9 object-contain [image-rendering:pixelated]"
                    />
                    Add stone
                  </Button>
                  <Button
                    variant="outline"
                    className="h-20 flex-col gap-1"
                    onClick={() => beginTool("board")}
                  >
                    <img
                      src={signboardSpriteUrl}
                      alt=""
                      className="h-9 w-9 object-contain [image-rendering:pixelated]"
                    />
                    Board
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 flex-col gap-1"
                    onClick={() => beginTool("unit")}
                  >
                    <Users className="h-5 w-5" />
                    Fighter position
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 flex-col gap-1"
                    onClick={() => beginTool("monster")}
                  >
                    <img
                      src={getMonsterSprite("Diamondoom")?.src}
                      alt=""
                      className="h-7 w-7 object-contain [image-rendering:pixelated]"
                    />
                    Monster position
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tap an existing structure to move or remove it.
                </p>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Land & reset
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReclaimMode("claim");
                        beginTool("reclaim");
                      }}
                    >
                      Reclaim
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReclaimMode("unclaim");
                        beginTool("reclaim");
                      }}
                    >
                      Unclaim
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        clearAll();
                        setPanel(null);
                      }}
                    >
                      Clear layout
                    </Button>
                  </div>
                </details>
              </div>
            )}
            {panel === "view" && (
              <div className="space-y-4">
                <label className="block text-xs">
                  Structure opacity{" "}
                  <span className="float-right text-muted-foreground">
                    {Math.round(structureOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min="25"
                    max="100"
                    value={Math.round(structureOpacity * 100)}
                    onChange={(event) =>
                      setStructureOpacity(Number(event.target.value) / 100)
                    }
                    aria-label="Structure opacity"
                    className="mt-2 block w-full accent-primary"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={showLevelOverlay ? "secondary" : "outline"}
                    aria-pressed={showLevelOverlay}
                    onClick={() => setShowLevelOverlay((previous) => !previous)}
                  >
                    Area levels
                  </Button>
                  <Button
                    size="sm"
                    variant={showCoverageCheck ? "secondary" : "outline"}
                    aria-pressed={showCoverageCheck}
                    onClick={() =>
                      setShowCoverageCheck((previous) => !previous)
                    }
                  >
                    Coverage
                  </Button>
                  <Button
                    size="sm"
                    variant={animateActors ? "secondary" : "outline"}
                    aria-pressed={animateActors}
                    onClick={() => setAnimateActors((previous) => !previous)}
                  >
                    Animate fighter
                  </Button>
                </div>
                <label className="block text-xs">
                  Fighter preview
                  <select
                    aria-label="Fighter preview"
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={humanId}
                    onChange={(event) => setHumanId(event.target.value)}
                  >
                    {HUMAN_IDLE_CHARACTERS.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {panel === "help" && (
              <div className="space-y-3 text-xs text-muted-foreground">
                <p>
                  {saveError ||
                    "Your layout saves automatically on this device."}
                </p>
                <p>
                  Drag or pinch the map. Add a piece, move the map beneath it,
                  then confirm. Tap a structure for Move or Remove. Escape
                  cancels.
                </p>
                <p>
                  Generated layouts use the existing experimental containment
                  model. The animated fighter and representative monster show
                  positions; they do not simulate spawning or combat.
                </p>
                <p>
                  In game, pay the 50 diamonds when removing a Chaos Stone to
                  keep it. Reclaimed cells here are planning overlays; your town
                  still needs to permit reclamation.
                </p>
                <details>
                  <summary className="cursor-pointer">Support details</summary>
                  <div className="mt-2 space-y-2">
                    <p>
                      {stoneAnchors.length} stones | {boardIdByKey.size} boards
                      | {reclaimedTiles.size} reclaimed tiles
                    </p>
                    <p>
                      {stoneAnchors.length
                        ? `${leakTiles.size} open tiles in the current model`
                        : "No layout yet."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyDiagnostics}
                    >
                      Copy diagnostics
                    </Button>
                  </div>
                </details>
              </div>
            )}
          </section>
        )}

        {selectedKind && (
          <section
            className="absolute bottom-[84px] left-3 z-20 w-[min(300px,calc(100%-24px))] rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur"
            aria-label="Selected structure"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">
                {selectedKind === "stone" ? "Chaos Stone" : "Info Board"}
              </p>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Deselect structure"
                className="h-7 w-7"
                onClick={() => setSelectedPiece(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={moveSelected}>
                <Move className="mr-2 h-4 w-4" />
                Move
              </Button>
              <Button size="sm" variant="outline" onClick={removeSelected}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          </section>
        )}

        {(tool !== "none" || pickSetupAreaFromMap) && (
          <div
            className="absolute left-3 bottom-[84px] z-20 flex w-[min(380px,calc(100%-24px))] items-center justify-between gap-2 rounded-xl border bg-card/95 px-3 py-2 text-xs shadow-lg"
            role="status"
          >
            <span>
              {pickSetupAreaFromMap
                ? "Tap an area to plan here"
                : tool === "reclaim"
                  ? `Tap a tile to ${reclaimMode} land`
                  : `Move the map under the ${tool === "unit" ? "fighter" : tool}, then confirm`}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cancel active tool"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                cancelPlacement();
                setPickSetupAreaFromMap(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {((generatorError && panel !== "plan") ||
          assetError ||
          saveError ||
          (copyStatus && tool === "none")) &&
          !selectedKind && (
            <div
              role={
                generatorError || assetError || saveError ? "alert" : "status"
              }
              className="pointer-events-none absolute bottom-[84px] right-3 z-10 max-w-[min(320px,calc(100%-24px))] rounded-lg bg-card/90 px-3 py-2 text-xs shadow backdrop-blur"
            >
              {generatorError || assetError || saveError || copyStatus}
            </div>
          )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-2">
          <div
            role="toolbar"
            aria-label="Layout tools"
            className="pointer-events-auto flex items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-xl backdrop-blur"
          >
            <Button
              className="h-12 flex-col gap-0.5 px-3 text-[10px]"
              variant={panel === "build" ? "secondary" : "ghost"}
              onClick={() => togglePanel("build")}
            >
              <Hammer className="h-5 w-5" />
              Build
            </Button>
            <Button
              className="h-12 flex-col gap-0.5 px-3 text-[10px]"
              variant={panel === "plan" ? "secondary" : "ghost"}
              onClick={() => togglePanel("plan")}
            >
              <Sparkles className="h-5 w-5" />
              Generate
            </Button>
            <Button
              className="h-12 w-10 flex-col gap-0.5 p-1 text-[10px]"
              variant="ghost"
              disabled={undoStack.length === 0}
              onClick={undoSetup}
            >
              <Undo2 className="h-5 w-5" />
              Undo
            </Button>
            <Button
              className="h-12 w-10 flex-col gap-0.5 p-1 text-[10px]"
              variant="ghost"
              aria-label="Focus layout"
              disabled={pieces.size === 0 && !openMonsterTile && !openUnitTile}
              onClick={() => focusSetupView()}
            >
              <LocateFixed className="h-5 w-5" />
              Focus
            </Button>
          </div>
          <div
            className="pointer-events-auto flex flex-col rounded-xl border bg-card/95 p-1 shadow-xl backdrop-blur"
            role="toolbar"
            aria-label="Map zoom controls"
          >
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom in"
              onClick={() => setZoomRequest({ factor: 1.3, token: Date.now() })}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom out"
              onClick={() =>
                setZoomRequest({ factor: 1 / 1.3, token: Date.now() })
              }
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {!nativeLand && (
          <p
            role="status"
            className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-card p-3 text-xs shadow"
          >
            Loading map...
          </p>
        )}
      </div>
    </div>
  );
}
