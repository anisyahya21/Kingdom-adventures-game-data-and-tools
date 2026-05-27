#!/usr/bin/env python
"""Generate a standalone Town Hall layer composer for visual placement work."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
OUT = ROOT / "tools" / "asset_extractor" / "generated" / "townhall_composer.html"
PARTS_DIR = OUT.parent / "townhall_composer_parts"

FENCE_05_CANVAS = {"w": 48, "h": 72}

FENCE_05_RECTS = [
    # label, source x/y/w/h, draw x/y inside the 48x72 logical opt canvas
    ("canopy", 0, 0, 48, 52, 0, 18),
    ("pillar", 48, 0, 24, 34, 11, 30),
    ("corner_base", 48, 34, 31, 19, 9, 45),
]

FENCE_05_COMPAT_RECTS = [
    ("fence_05_canopy_x0_y0_w48_h41.png", "canopy", 0, 0, 48, 52, 0, 18),
    ("fence_05_canopy_x0_y0_w56_h52.png", "canopy", 0, 0, 48, 52, 0, 18),
    ("fence_05_pillar_x48_y0_w24_h32.png", "pillar", 48, 0, 24, 34, 11, 30),
    ("fence_05_pillar_x48_y0_w24_h53.png", "pillar", 48, 0, 24, 34, 11, 30),
    ("fence_05_corner_base_x48_y31_w31_h22.png", "corner_base", 48, 34, 31, 19, 9, 45),
]


def image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.width, image.height


def make_fence_05_parts() -> list[dict[str, object]]:
    source_folder = "wall"
    source_file = "fence_05.png"
    source_path = ASSET_ROOT / source_folder / source_file
    if not source_path.exists():
        return []

    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    parts: list[dict[str, object]] = []
    for label, left, top, width, height, draw_x, draw_y in FENCE_05_RECTS:
        part_file = f"fence_05_{label}_x{left}_y{top}_w{width}_h{height}.png"
        source.crop((left, top, left + width, top + height)).save(PARTS_DIR / part_file, "PNG")
        parts.append(
            {
                "folder": "composer_part",
                "file": part_file,
                "label": f"part/{part_file}",
                "src": f"townhall_composer_parts/{part_file}",
                "width": width,
                "height": height,
                "sourceFolder": source_folder,
                "sourceFile": source_file,
                "sourceRect": {"x": left, "y": top, "w": width, "h": height},
                "optCanvas": FENCE_05_CANVAS,
                "drawOffset": {"x": draw_x, "y": draw_y},
            }
        )

    for part_file, label, left, top, width, height, draw_x, draw_y in FENCE_05_COMPAT_RECTS:
        source.crop((left, top, left + width, top + height)).save(PARTS_DIR / part_file, "PNG")
        parts.append(
            {
                "folder": "composer_part",
                "file": part_file,
                "label": f"part/{part_file} legacy alias corrected to {width}x{height}",
                "src": f"townhall_composer_parts/{part_file}",
                "width": width,
                "height": height,
                "sourceFolder": source_folder,
                "sourceFile": source_file,
                "sourceRect": {"x": left, "y": top, "w": width, "h": height},
                "optCanvas": FENCE_05_CANVAS,
                "drawOffset": {"x": draw_x, "y": draw_y},
                "sliceKind": label,
                "legacyAlias": True,
            }
        )

    return parts


def collect_assets() -> list[dict[str, object]]:
    assets: list[dict[str, object]] = []
    for folder in ["building", "chip", "wall"]:
        for path in sorted((ASSET_ROOT / folder).glob("*.png"), key=lambda item: item.name.lower()):
            width, height = image_size(path)
            assets.append(
                {
                    "folder": folder,
                    "file": path.name,
                    "label": f"{folder}/{path.name}",
                    "src": f"../../../artifacts/kingdom-adventures/tmp/KA_assets/{folder}/{path.name}",
                    "width": width,
                    "height": height,
                }
            )
    assets.extend(make_fence_05_parts())
    return assets


def initial_layers() -> list[dict[str, object]]:
    return [
        {
            "id": "platform-chip-94",
            "mode": "floor",
            "folder": "chip",
            "file": "chip_94.png",
            "name": "Floor replacement chip_94",
            "tileX": 1,
            "tileY": 2,
            "floorOffsetX": 0,
            "floorOffsetY": 0,
            "x": 0,
            "y": 0,
            "z": -100,
            "scale": 2,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": "souko-00",
            "mode": "floor",
            "folder": "chip",
            "file": "souko_00.png",
            "name": "Floor replacement souko_00",
            "tileX": 0,
            "tileY": 2,
            "floorOffsetX": 0,
            "floorOffsetY": 0,
            "x": 0,
            "y": 0,
            "z": -90,
            "scale": 2,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": "base-58",
            "mode": "overlay",
            "folder": "building",
            "file": "town_hall_base_00.png",
            "name": "Chip 58 base",
            "x": 208,
            "y": 250,
            "z": 10,
            "scale": 2,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": "flag-60",
            "mode": "overlay",
            "folder": "building",
            "file": "flag_00.png",
            "name": "Chip 60 flag_00",
            "x": 302,
            "y": 150,
            "z": 20,
            "scale": 2,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": "tower-59",
            "mode": "overlay",
            "folder": "building",
            "file": "town_hall_tower_00.png",
            "name": "Chip 59 tower",
            "x": 208,
            "y": 186,
            "z": 30,
            "scale": 2,
            "opacity": 1,
            "visible": True,
        },
        {
            "id": "fence-05-canopy",
            "mode": "overlay",
            "folder": "composer_part",
            "file": "fence_05_canopy_x0_y0_w48_h52.png",
            "name": "Fence 05 canopy slice",
            "x": 142,
            "y": 256,
            "z": 35,
            "scale": 2,
            "opacity": 1,
            "visible": True,
            "sourceFolder": "wall",
            "sourceFile": "fence_05.png",
            "sourceRect": {"x": 0, "y": 0, "w": 48, "h": 52},
            "optCanvas": {"w": 48, "h": 72},
            "drawOffset": {"x": 0, "y": 18},
        },
        {
            "id": "fence-05-pillar",
            "mode": "overlay",
            "folder": "composer_part",
            "file": "fence_05_pillar_x48_y0_w24_h34.png",
            "name": "Fence 05 pillar slice",
            "x": 428,
            "y": 238,
            "z": 36,
            "scale": 2,
            "opacity": 1,
            "visible": True,
            "sourceFolder": "wall",
            "sourceFile": "fence_05.png",
            "sourceRect": {"x": 48, "y": 0, "w": 24, "h": 34},
            "optCanvas": {"w": 48, "h": 72},
            "drawOffset": {"x": 11, "y": 30},
        },
        {
            "id": "fence-05-corner",
            "mode": "overlay",
            "folder": "composer_part",
            "file": "fence_05_corner_base_x48_y34_w31_h19.png",
            "name": "Fence 05 corner base slice",
            "x": 418,
            "y": 348,
            "z": 37,
            "scale": 2,
            "opacity": 1,
            "visible": True,
            "sourceFolder": "wall",
            "sourceFile": "fence_05.png",
            "sourceRect": {"x": 48, "y": 34, "w": 31, "h": 19},
            "optCanvas": {"w": 48, "h": 72},
            "drawOffset": {"x": 9, "y": 45},
        },
    ]


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>KA Town Hall Layer Composer</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0f1419;
    --panel: #171d24;
    --panel-2: #111821;
    --line: #2a3540;
    --text: #e7edf5;
    --muted: #9caabb;
    --accent: #8fb8ff;
    --good: #86d99d;
    --warn: #ffd47c;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 13px/1.35 Segoe UI, Arial, sans-serif; }
  header { padding: 12px 16px; border-bottom: 1px solid var(--line); background: #0b1015; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; font-size: 18px; }
  .app { display: grid; grid-template-columns: 292px 1fr 340px; min-height: calc(100vh - 52px); }
  aside { border-right: 1px solid var(--line); background: var(--panel); padding: 12px; overflow: auto; max-height: calc(100vh - 52px); }
  aside.right { border-right: 0; border-left: 1px solid var(--line); }
  main { padding: 14px; overflow: auto; }
  button, input, select, textarea { font: inherit; }
  button { border: 1px solid var(--line); background: #202936; color: var(--text); border-radius: 6px; padding: 6px 9px; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button.primary { background: #1f3b5f; border-color: #315d94; }
  button.danger { background: #3a2025; border-color: #7b3340; }
  input, select, textarea { width: 100%; border: 1px solid var(--line); background: #0d131a; color: var(--text); border-radius: 6px; padding: 6px 8px; }
  textarea { min-height: 160px; resize: vertical; font-family: Consolas, monospace; font-size: 12px; }
  label { display: grid; gap: 4px; color: var(--muted); margin-bottom: 9px; }
  label.inline { display: flex; align-items: center; gap: 6px; margin: 0; }
  label.inline input[type="checkbox"] { width: auto; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .stage-shell { width: max-content; margin: 0 auto; border: 1px solid var(--line); background: #080b0f; padding: 10px; border-radius: 8px; }
  #stage { position: relative; width: 720px; height: 620px; overflow: hidden; background-color: #151b21; }
  #stage.no-grid #tile-grid { display: none; }
  #tile-grid { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .axis { position: absolute; pointer-events: none; opacity: .25; z-index: 9000; }
  .axis.x { left: 0; right: 0; top: 310px; border-top: 1px solid var(--warn); }
  .axis.y { top: 0; bottom: 0; left: 360px; border-left: 1px solid var(--warn); }
  .piece { position: absolute; transform-origin: top left; image-rendering: pixelated; user-select: none; cursor: move; }
  .piece.floor { cursor: crosshair; }
  .piece.selected { outline: 1px dashed var(--accent); outline-offset: 2px; }
  .layer-list { display: grid; gap: 7px; }
  .layer-row { border: 1px solid var(--line); background: var(--panel-2); border-radius: 7px; padding: 7px; cursor: pointer; }
  .layer-row.selected { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(143, 184, 255, .25) inset; }
  .layer-title { color: var(--text); font-weight: 600; }
  .layer-meta { color: var(--muted); font-size: 12px; margin-top: 3px; overflow-wrap: anywhere; }
  .asset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .asset-card { min-height: 96px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); display: grid; grid-template-rows: 1fr auto; gap: 5px; padding: 6px; cursor: pointer; }
  .asset-card:hover { border-color: var(--accent); }
  .asset-card img { max-width: 100%; max-height: 62px; object-fit: contain; image-rendering: pixelated; margin: auto; display: block; }
  .asset-card span { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .section-title { margin: 14px 0 8px; color: var(--accent); font-weight: 700; }
  .hint { color: var(--muted); margin: 0 0 10px; }
  .status { color: var(--good); }
  .snap-panel { display: grid; grid-template-columns: auto 72px 1fr; gap: 8px; align-items: center; margin-bottom: 10px; }
  .tile-panel { display: grid; gap: 8px; margin-bottom: 10px; }
  .tile-nudge { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .small-note { color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>KA Town Hall Layer Composer</h1>
  <div class="toolbar">
    <button id="save-layout" class="primary">Save layout</button>
    <button id="export-json">Export JSON</button>
    <button id="export-png">Export PNG</button>
    <button id="toggle-grid">Grid</button>
    <button id="reset-layout" class="danger">Reset</button>
    <span id="status" class="status"></span>
  </div>
</header>
<div class="app">
  <aside>
    <p class="hint">The floor grid is the map plane. Floor chips replace tiles; buildings and fence pieces stack above it.</p>
    <div class="snap-panel">
      <label class="inline"><input id="snap-enabled" type="checkbox" checked> Snap</label>
      <input id="snap-size" type="number" min="1" step="1" value="4" title="Pixel snap size">
      <button id="snap-selected">Snap selected</button>
    </div>
    <div class="section-title">Tile Floor</div>
    <div class="tile-panel">
      <div class="row">
        <label>Tile W <input id="tile-width" type="number" min="8" step="1" value="96"></label>
        <label>Tile H <input id="tile-height" type="number" min="8" step="1" value="48"></label>
      </div>
      <div class="row">
        <label>Origin X <input id="tile-origin-x" type="number" step="1" value="360"></label>
        <label>Origin Y <input id="tile-origin-y" type="number" step="1" value="154"></label>
      </div>
      <div class="row">
        <label>Build W <input id="tile-build-w" type="number" min="1" step="1" value="4"></label>
        <label>Build H <input id="tile-build-h" type="number" min="1" step="1" value="4"></label>
      </div>
      <div class="row">
        <label>Tile X <input id="place-tile-x" type="number" step="1" value="0"></label>
        <label>Tile Y <input id="place-tile-y" type="number" step="1" value="0"></label>
      </div>
      <div class="tile-nudge">
        <button id="tile-north">Tile N</button>
        <button id="tile-east">Tile E</button>
        <button id="tile-west">Tile W</button>
        <button id="tile-south">Tile S</button>
        <button id="tile-place">Place at tile</button>
        <button id="tile-from-selected">Read selected tile</button>
      </div>
      <div class="small-note">Alt + arrow moves the selected layer by one map tile.</div>
    </div>
    <div class="section-title">Layers</div>
    <div id="layer-list" class="layer-list"></div>
    <div class="section-title">Add Asset</div>
    <label>Search
      <input id="asset-search" value="town hall chip_94 souko fence_05 obj building flag" autocomplete="off">
    </label>
    <div id="asset-grid" class="asset-grid"></div>
  </aside>
  <main>
    <div class="stage-shell">
      <div id="stage">
        <canvas id="tile-grid" width="720" height="620"></canvas>
        <div class="axis x"></div>
        <div class="axis y"></div>
      </div>
    </div>
  </main>
  <aside class="right">
    <div class="section-title">Selected Layer</div>
    <div id="empty-controls" class="hint">Select a layer or click an asset.</div>
    <div id="layer-controls" hidden>
      <label>Name <input id="layer-name"></label>
      <label>Mode
        <select id="layer-mode"><option value="overlay">overlay</option><option value="floor">floor tile</option></select>
      </label>
      <div class="row">
        <label>X <input id="layer-x" type="number" step="1"></label>
        <label>Y <input id="layer-y" type="number" step="1"></label>
      </div>
      <div class="row">
        <label>Tile X <input id="layer-tile-x" type="number" step="1"></label>
        <label>Tile Y <input id="layer-tile-y" type="number" step="1"></label>
      </div>
      <div class="row">
        <label>Floor off X <input id="layer-floor-offset-x" type="number" step="1"></label>
        <label>Floor off Y <input id="layer-floor-offset-y" type="number" step="1"></label>
      </div>
      <div class="row">
        <label>Z <input id="layer-z" type="number" step="1"></label>
        <label>Scale <input id="layer-scale" type="number" step="0.25" min="0.25"></label>
      </div>
      <label>Opacity <input id="layer-opacity" type="number" step="0.05" min="0" max="1"></label>
      <label>Visible
        <select id="layer-visible"><option value="true">true</option><option value="false">false</option></select>
      </label>
      <div class="toolbar">
        <button id="move-up">Layer up</button>
        <button id="move-down">Layer down</button>
        <button id="duplicate-layer">Duplicate</button>
        <button id="delete-layer" class="danger">Delete</button>
      </div>
      <div class="section-title">Alignment</div>
      <div class="toolbar">
        <button id="snap-layer-here">Snap XY</button>
        <button id="snap-all-layers">Snap all</button>
        <button id="center-on-tile">Center on tile</button>
      </div>
      <div class="section-title">Dock To Layer</div>
      <label>Target <select id="dock-target"></select></label>
      <div class="toolbar">
        <button id="dock-same">Same tile/XY</button>
        <button id="dock-left">Touch left</button>
        <button id="dock-right">Touch right</button>
        <button id="dock-above">Touch above</button>
        <button id="dock-below">Touch below</button>
      </div>
      <div class="toolbar" style="margin-top:8px">
        <button id="dock-tile-n">Tile N</button>
        <button id="dock-tile-e">Tile E</button>
        <button id="dock-tile-w">Tile W</button>
        <button id="dock-tile-s">Tile S</button>
      </div>
    </div>
    <div class="section-title">Import / Export</div>
    <textarea id="layout-json" spellcheck="false"></textarea>
    <div class="toolbar" style="margin-top:8px">
      <button id="copy-json">Copy JSON</button>
      <button id="import-json">Import JSON</button>
    </div>
  </aside>
</div>
<script>
const ASSETS = __ASSETS__;
const INITIAL_LAYERS = __INITIAL_LAYERS__;
const STORAGE_KEY = "kaTownHallComposerLayout.v3";
const stage = document.getElementById("stage");
const tileGrid = document.getElementById("tile-grid");
const layerList = document.getElementById("layer-list");
const assetGrid = document.getElementById("asset-grid");
const assetSearch = document.getElementById("asset-search");
const statusEl = document.getElementById("status");
const layoutJson = document.getElementById("layout-json");
const snapEnabled = document.getElementById("snap-enabled");
const snapSizeInput = document.getElementById("snap-size");
const tileWidthInput = document.getElementById("tile-width");
const tileHeightInput = document.getElementById("tile-height");
const tileOriginXInput = document.getElementById("tile-origin-x");
const tileOriginYInput = document.getElementById("tile-origin-y");
const tileBuildWInput = document.getElementById("tile-build-w");
const tileBuildHInput = document.getElementById("tile-build-h");
const placeTileXInput = document.getElementById("place-tile-x");
const placeTileYInput = document.getElementById("place-tile-y");
const dockTarget = document.getElementById("dock-target");
let layers = loadLayout();
let selectedId = layers[0]?.id || null;
let dragState = null;

function assetFor(layer) {
  return ASSETS.find(asset => asset.folder === layer.folder && asset.file === layer.file);
}

function srcFor(layer) {
  return assetFor(layer)?.src || "";
}

function snapStep() {
  return Math.max(1, Number(snapSizeInput.value) || 1);
}

function snapValue(value) {
  if (!snapEnabled.checked) return Math.round(value);
  const step = snapStep();
  return Math.round(value / step) * step;
}

function tileSettings() {
  return {
    width: Math.max(8, Number(tileWidthInput.value) || 96),
    height: Math.max(8, Number(tileHeightInput.value) || 48),
    originX: Number(tileOriginXInput.value) || 0,
    originY: Number(tileOriginYInput.value) || 0,
    buildW: Math.max(1, Number(tileBuildWInput.value) || 4),
    buildH: Math.max(1, Number(tileBuildHInput.value) || 4),
  };
}

function tileToScreen(tileX, tileY) {
  const tile = tileSettings();
  return {
    x: tile.originX + (tileX - tileY) * tile.width / 2,
    y: tile.originY + (tileX + tileY) * tile.height / 2,
  };
}

function screenToTile(x, y) {
  const tile = tileSettings();
  const dx = x - tile.originX;
  const dy = y - tile.originY;
  return {
    x: Math.round((dy / (tile.height / 2) + dx / (tile.width / 2)) / 2),
    y: Math.round((dy / (tile.height / 2) - dx / (tile.width / 2)) / 2),
  };
}

function layerSize(layer) {
  const asset = assetFor(layer);
  return {
    width: (asset?.width || 0) * (Number(layer.scale) || 1),
    height: (asset?.height || 0) * (Number(layer.scale) || 1),
  };
}

function floorPosition(layer) {
  const point = tileToScreen(Number(layer.tileX) || 0, Number(layer.tileY) || 0);
  const size = layerSize(layer);
  return {
    x: snapValue(point.x - size.width / 2 + (Number(layer.floorOffsetX) || 0)),
    y: snapValue(point.y + (Number(layer.floorOffsetY) || 0)),
  };
}

function layerPosition(layer) {
  if (layer.mode === "floor") return floorPosition(layer);
  return { x: Number(layer.x) || 0, y: Number(layer.y) || 0 };
}

function syncFloorPositions() {
  for (const layer of layers) {
    if (layer.mode !== "floor") continue;
    const position = floorPosition(layer);
    layer.x = position.x;
    layer.y = position.y;
  }
}

function loadLayout() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.tile) applyTileSettings(parsed.tile);
      return Array.isArray(parsed) ? parsed : parsed.layers;
    }
  } catch {}
  return structuredClone(INITIAL_LAYERS);
}

function applyTileSettings(tile) {
  if (!tile) return;
  if (tile.width !== undefined) tileWidthInput.value = tile.width;
  if (tile.height !== undefined) tileHeightInput.value = tile.height;
  if (tile.originX !== undefined) tileOriginXInput.value = tile.originX;
  if (tile.originY !== undefined) tileOriginYInput.value = tile.originY;
  if (tile.buildW !== undefined) tileBuildWInput.value = tile.buildW;
  if (tile.buildH !== undefined) tileBuildHInput.value = tile.buildH;
}

function layoutPayload() {
  syncFloorPositions();
  return { tile: tileSettings(), layers };
}

function saveLayout() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutPayload(), null, 2));
  flash("saved");
}

function flash(text) {
  statusEl.textContent = text;
  window.clearTimeout(flash.timer);
  flash.timer = window.setTimeout(() => statusEl.textContent = "", 1400);
}

function selectedLayer() {
  return layers.find(layer => layer.id === selectedId) || null;
}

function sortedLayers() {
  return [...layers].sort((left, right) => Number(left.z) - Number(right.z));
}

function displayZ(layer) {
  const logicalZ = Number(layer.z) || 0;
  if (layer.mode === "floor") return 200 + logicalZ;
  return 1000 + logicalZ;
}

function drawTileGrid() {
  const context = tileGrid.getContext("2d");
  const tile = tileSettings();
  context.clearRect(0, 0, tileGrid.width, tileGrid.height);
  context.lineWidth = 1;
  for (let y = -2; y < tile.buildH + 2; y += 1) {
    for (let x = -2; x < tile.buildW + 2; x += 1) {
      const point = tileToScreen(x, y);
      const inside = x >= 0 && y >= 0 && x < tile.buildW && y < tile.buildH;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(point.x + tile.width / 2, point.y + tile.height / 2);
      context.lineTo(point.x, point.y + tile.height);
      context.lineTo(point.x - tile.width / 2, point.y + tile.height / 2);
      context.closePath();
      if (inside) {
        context.fillStyle = "rgba(143, 184, 255, 0.06)";
        context.fill();
      }
      context.strokeStyle = inside ? "rgba(143, 184, 255, 0.72)" : "rgba(143, 184, 255, 0.22)";
      context.stroke();
    }
  }
}

function renderStage() {
  syncFloorPositions();
  drawTileGrid();
  stage.querySelectorAll("img.piece").forEach(node => node.remove());
  for (const layer of sortedLayers()) {
    if (!layer.visible) continue;
    const position = layerPosition(layer);
    const image = document.createElement("img");
    image.className = "piece " + (layer.mode === "floor" ? "floor" : "overlay") + (layer.id === selectedId ? " selected" : "");
    image.src = srcFor(layer);
    image.dataset.id = layer.id;
    image.draggable = false;
    image.style.left = `${position.x}px`;
    image.style.top = `${position.y}px`;
    image.style.zIndex = String(displayZ(layer));
    image.style.opacity = String(layer.opacity ?? 1);
    image.style.transform = `scale(${Number(layer.scale) || 1})`;
    image.addEventListener("pointerdown", startDrag);
    image.addEventListener("click", event => { event.stopPropagation(); selectLayer(layer.id); });
    stage.appendChild(image);
  }
}

function renderLayerList() {
  layerList.innerHTML = "";
  for (const layer of sortedLayers().reverse()) {
    const position = layerPosition(layer);
    const tileText = layer.mode === "floor" ? ` tile ${layer.tileX},${layer.tileY}` : "";
    const row = document.createElement("div");
    row.className = "layer-row" + (layer.id === selectedId ? " selected" : "");
    row.innerHTML = `<div class="layer-title">${escapeHtml(layer.name || layer.file)}</div><div class="layer-meta">${escapeHtml(layer.mode || "overlay")} · ${escapeHtml(layer.folder)}/${escapeHtml(layer.file)}${tileText} · x ${position.x} y ${position.y} z ${layer.z}</div>`;
    row.addEventListener("click", () => selectLayer(layer.id));
    layerList.appendChild(row);
  }
}

function renderDockTargets() {
  const previous = dockTarget.value;
  dockTarget.innerHTML = "";
  for (const layer of sortedLayers().reverse()) {
    if (layer.id === selectedId) continue;
    const option = document.createElement("option");
    option.value = layer.id;
    option.textContent = layer.name || layer.file;
    dockTarget.appendChild(option);
  }
  if ([...dockTarget.options].some(option => option.value === previous)) dockTarget.value = previous;
}

function renderControls() {
  const layer = selectedLayer();
  document.getElementById("empty-controls").hidden = Boolean(layer);
  document.getElementById("layer-controls").hidden = !layer;
  renderDockTargets();
  if (!layer) return;
  const position = layerPosition(layer);
  document.getElementById("layer-name").value = layer.name || "";
  document.getElementById("layer-mode").value = layer.mode || "overlay";
  document.getElementById("layer-x").value = position.x;
  document.getElementById("layer-y").value = position.y;
  document.getElementById("layer-tile-x").value = layer.tileX ?? "";
  document.getElementById("layer-tile-y").value = layer.tileY ?? "";
  document.getElementById("layer-floor-offset-x").value = layer.floorOffsetX ?? 0;
  document.getElementById("layer-floor-offset-y").value = layer.floorOffsetY ?? 0;
  document.getElementById("layer-z").value = layer.z;
  document.getElementById("layer-scale").value = layer.scale;
  document.getElementById("layer-opacity").value = layer.opacity;
  document.getElementById("layer-visible").value = String(layer.visible !== false);
}

function renderAssets() {
  const terms = assetSearch.value.toLowerCase().split(/\s+/).filter(Boolean);
  const preferred = ["town_hall", "flag_00", "chip_94", "souko", "fence_05", "composer_part", "obj_", "building_"];
  const matches = ASSETS.filter(asset => {
    const label = asset.label.toLowerCase();
    return terms.every(term => label.includes(term)) || preferred.some(term => label.includes(term));
  }).sort((left, right) => assetRank(left) - assetRank(right)).slice(0, 80);
  assetGrid.innerHTML = "";
  for (const asset of matches) {
    const card = document.createElement("button");
    card.className = "asset-card";
    card.innerHTML = `<img src="${asset.src}" alt=""><span>${escapeHtml(asset.label)}</span>`;
    card.addEventListener("click", () => addLayer(asset));
    assetGrid.appendChild(card);
  }
}

function assetRank(asset) {
  const label = asset.label.toLowerCase();
  if (asset.folder === "composer_part" && !asset.legacyAlias) return 0;
  if (asset.folder === "composer_part") return 1;
  if (label.includes("town_hall") || label.includes("chip_94") || label.includes("souko")) return 2;
  if (label.includes("flag_00")) return 3;
  return 10;
}

function renderJson() {
  layoutJson.value = JSON.stringify(layoutPayload(), null, 2);
}

function renderAll() {
  renderStage();
  renderLayerList();
  renderControls();
  renderJson();
}

function selectLayer(id) {
  selectedId = id;
  renderAll();
}

function defaultModeFor(asset) {
  return asset.folder === "chip" ? "floor" : "overlay";
}

function addLayer(asset) {
  const mode = defaultModeFor(asset);
  const layer = {
    id: `${asset.folder}-${asset.file.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`,
    mode,
    folder: asset.folder,
    file: asset.file,
    name: asset.label,
    tileX: Number(placeTileXInput.value) || 0,
    tileY: Number(placeTileYInput.value) || 0,
    floorOffsetX: 0,
    floorOffsetY: 0,
    x: 300,
    y: 260,
    z: Math.max(0, ...layers.map(layer => Number(layer.z) || 0)) + 10,
    scale: 2,
    opacity: 1,
    visible: true,
  };
  if (mode === "floor") layer.z = -80;
  if (asset.sourceFolder) layer.sourceFolder = asset.sourceFolder;
  if (asset.sourceFile) layer.sourceFile = asset.sourceFile;
  if (asset.sourceRect) layer.sourceRect = asset.sourceRect;
  if (asset.optCanvas) layer.optCanvas = asset.optCanvas;
  if (asset.drawOffset) layer.drawOffset = asset.drawOffset;
  layers.push(layer);
  selectLayer(layer.id);
}

function updateSelected(values) {
  const layer = selectedLayer();
  if (!layer) return;
  Object.assign(layer, values);
  renderAll();
}

function startDrag(event) {
  const layer = layers.find(item => item.id === event.currentTarget.dataset.id);
  if (!layer) return;
  selectedId = layer.id;
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    layerX: Number(layer.x) || 0,
    layerY: Number(layer.y) || 0,
    floorOffsetX: Number(layer.floorOffsetX) || 0,
    floorOffsetY: Number(layer.floorOffsetY) || 0,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
}

stage.addEventListener("pointermove", event => {
  if (!dragState) return;
  const layer = selectedLayer();
  if (!layer) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  if (layer.mode === "floor") {
    layer.floorOffsetX = snapValue(dragState.floorOffsetX + dx);
    layer.floorOffsetY = snapValue(dragState.floorOffsetY + dy);
  } else {
    layer.x = snapValue(dragState.layerX + dx);
    layer.y = snapValue(dragState.layerY + dy);
  }
  renderAll();
});

stage.addEventListener("pointerup", () => dragState = null);
stage.addEventListener("click", () => { selectedId = null; renderAll(); });

function moveSelectedByTile(deltaX, deltaY) {
  const layer = selectedLayer();
  if (!layer) return;
  if (layer.mode === "floor") {
    layer.tileX = (Number(layer.tileX) || 0) + deltaX;
    layer.tileY = (Number(layer.tileY) || 0) + deltaY;
  } else {
    const tile = tileSettings();
    layer.x = snapValue((Number(layer.x) || 0) + (deltaX - deltaY) * tile.width / 2);
    layer.y = snapValue((Number(layer.y) || 0) + (deltaX + deltaY) * tile.height / 2);
  }
  renderAll();
}

document.addEventListener("keydown", event => {
  const layer = selectedLayer();
  if (!layer || event.target.matches("input, textarea, select")) return;
  if (event.altKey) {
    if (event.key === "ArrowLeft") moveSelectedByTile(-1, 0);
    else if (event.key === "ArrowRight") moveSelectedByTile(1, 0);
    else if (event.key === "ArrowUp") moveSelectedByTile(0, -1);
    else if (event.key === "ArrowDown") moveSelectedByTile(0, 1);
    else return;
    event.preventDefault();
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  if (layer.mode === "floor") {
    if (event.key === "ArrowLeft") layer.floorOffsetX -= step;
    else if (event.key === "ArrowRight") layer.floorOffsetX += step;
    else if (event.key === "ArrowUp") layer.floorOffsetY -= step;
    else if (event.key === "ArrowDown") layer.floorOffsetY += step;
    else return;
  } else {
    if (event.key === "ArrowLeft") layer.x -= step;
    else if (event.key === "ArrowRight") layer.x += step;
    else if (event.key === "ArrowUp") layer.y -= step;
    else if (event.key === "ArrowDown") layer.y += step;
    else return;
  }
  event.preventDefault();
  renderAll();
});

for (const [id, property, parser] of [
  ["layer-name", "name", value => value],
  ["layer-mode", "mode", value => value],
  ["layer-x", "x", value => Number(value)],
  ["layer-y", "y", value => Number(value)],
  ["layer-tile-x", "tileX", value => Number(value)],
  ["layer-tile-y", "tileY", value => Number(value)],
  ["layer-floor-offset-x", "floorOffsetX", value => Number(value)],
  ["layer-floor-offset-y", "floorOffsetY", value => Number(value)],
  ["layer-z", "z", value => Number(value)],
  ["layer-scale", "scale", value => Number(value)],
  ["layer-opacity", "opacity", value => Number(value)],
  ["layer-visible", "visible", value => value === "true"],
]) {
  document.getElementById(id).addEventListener("input", event => updateSelected({ [property]: parser(event.target.value) }));
}

function snapLayer(layer) {
  if (layer.mode === "floor") {
    layer.floorOffsetX = snapValue(Number(layer.floorOffsetX) || 0);
    layer.floorOffsetY = snapValue(Number(layer.floorOffsetY) || 0);
  } else {
    layer.x = snapValue(Number(layer.x) || 0);
    layer.y = snapValue(Number(layer.y) || 0);
  }
}

function targetLayer() {
  return layers.find(layer => layer.id === dockTarget.value) || null;
}

function layerBounds(layer) {
  const size = layerSize(layer);
  const position = layerPosition(layer);
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

function dockSelected(mode) {
  const layer = selectedLayer();
  const target = targetLayer();
  if (!layer || !target) return;
  if (mode === "same" && layer.mode === "floor" && target.mode === "floor") {
    layer.tileX = Number(target.tileX) || 0;
    layer.tileY = Number(target.tileY) || 0;
    layer.floorOffsetX = Number(target.floorOffsetX) || 0;
    layer.floorOffsetY = Number(target.floorOffsetY) || 0;
    renderAll();
    return;
  }
  const own = layerBounds(layer);
  const other = layerBounds(target);
  if (mode === "same") { layer.x = other.x; layer.y = other.y; }
  if (mode === "left") { layer.x = other.x - own.width; layer.y = other.y; }
  if (mode === "right") { layer.x = other.x + other.width; layer.y = other.y; }
  if (mode === "above") { layer.x = other.x; layer.y = other.y - own.height; }
  if (mode === "below") { layer.x = other.x; layer.y = other.y + other.height; }
  if (layer.mode === "floor") layer.mode = "overlay";
  snapLayer(layer);
  renderAll();
}

function dockSelectedByTile(deltaX, deltaY) {
  const layer = selectedLayer();
  const target = targetLayer();
  if (!layer || !target) return;
  if (target.mode === "floor") {
    layer.tileX = (Number(target.tileX) || 0) + deltaX;
    layer.tileY = (Number(target.tileY) || 0) + deltaY;
    if (layer.mode !== "floor") {
      const point = tileToScreen(layer.tileX, layer.tileY);
      layer.x = snapValue(point.x);
      layer.y = snapValue(point.y);
    }
  } else {
    const tile = tileSettings();
    layer.x = snapValue((Number(target.x) || 0) + (deltaX - deltaY) * tile.width / 2);
    layer.y = snapValue((Number(target.y) || 0) + (deltaX + deltaY) * tile.height / 2);
  }
  renderAll();
}

document.getElementById("move-up").addEventListener("click", () => { const layer = selectedLayer(); if (layer) updateSelected({ z: Number(layer.z) + 10 }); });
document.getElementById("move-down").addEventListener("click", () => { const layer = selectedLayer(); if (layer) updateSelected({ z: Number(layer.z) - 10 }); });
document.getElementById("duplicate-layer").addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  const duplicate = { ...layer, id: `${layer.id}-copy-${Date.now()}`, name: `${layer.name} copy`, x: Number(layer.x) + 12, y: Number(layer.y) + 12, z: Number(layer.z) + 1 };
  if (duplicate.mode === "floor") duplicate.tileX = Number(duplicate.tileX) + 1;
  layers.push(duplicate);
  selectLayer(duplicate.id);
});
document.getElementById("delete-layer").addEventListener("click", () => { layers = layers.filter(layer => layer.id !== selectedId); selectedId = layers[0]?.id || null; renderAll(); });
document.getElementById("snap-selected").addEventListener("click", () => { const layer = selectedLayer(); if (layer) { snapLayer(layer); renderAll(); } });
document.getElementById("snap-layer-here").addEventListener("click", () => { const layer = selectedLayer(); if (layer) { snapLayer(layer); renderAll(); } });
document.getElementById("snap-all-layers").addEventListener("click", () => { layers.forEach(snapLayer); renderAll(); });
document.getElementById("center-on-tile").addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  const tileX = Number(placeTileXInput.value) || 0;
  const tileY = Number(placeTileYInput.value) || 0;
  if (layer.mode === "floor") {
    layer.tileX = tileX;
    layer.tileY = tileY;
    layer.floorOffsetX = 0;
    layer.floorOffsetY = 0;
  } else {
    const point = tileToScreen(tileX, tileY);
    const size = layerSize(layer);
    layer.x = snapValue(point.x - size.width / 2);
    layer.y = snapValue(point.y);
  }
  renderAll();
});
document.getElementById("tile-north").addEventListener("click", () => moveSelectedByTile(0, -1));
document.getElementById("tile-east").addEventListener("click", () => moveSelectedByTile(1, 0));
document.getElementById("tile-west").addEventListener("click", () => moveSelectedByTile(-1, 0));
document.getElementById("tile-south").addEventListener("click", () => moveSelectedByTile(0, 1));
document.getElementById("tile-place").addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  const tileX = Number(placeTileXInput.value) || 0;
  const tileY = Number(placeTileYInput.value) || 0;
  if (layer.mode === "floor") {
    layer.tileX = tileX;
    layer.tileY = tileY;
    layer.floorOffsetX = 0;
    layer.floorOffsetY = 0;
  } else {
    const point = tileToScreen(tileX, tileY);
    layer.x = snapValue(point.x);
    layer.y = snapValue(point.y);
  }
  renderAll();
});
document.getElementById("tile-from-selected").addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  const tile = layer.mode === "floor" ? { x: Number(layer.tileX) || 0, y: Number(layer.tileY) || 0 } : screenToTile(Number(layer.x) || 0, Number(layer.y) || 0);
  placeTileXInput.value = tile.x;
  placeTileYInput.value = tile.y;
});
document.getElementById("dock-same").addEventListener("click", () => dockSelected("same"));
document.getElementById("dock-left").addEventListener("click", () => dockSelected("left"));
document.getElementById("dock-right").addEventListener("click", () => dockSelected("right"));
document.getElementById("dock-above").addEventListener("click", () => dockSelected("above"));
document.getElementById("dock-below").addEventListener("click", () => dockSelected("below"));
document.getElementById("dock-tile-n").addEventListener("click", () => dockSelectedByTile(0, -1));
document.getElementById("dock-tile-e").addEventListener("click", () => dockSelectedByTile(1, 0));
document.getElementById("dock-tile-w").addEventListener("click", () => dockSelectedByTile(-1, 0));
document.getElementById("dock-tile-s").addEventListener("click", () => dockSelectedByTile(0, 1));
for (const input of [snapEnabled, snapSizeInput, tileWidthInput, tileHeightInput, tileOriginXInput, tileOriginYInput, tileBuildWInput, tileBuildHInput]) {
  input.addEventListener("input", renderAll);
  input.addEventListener("change", renderAll);
}
document.getElementById("save-layout").addEventListener("click", saveLayout);
document.getElementById("reset-layout").addEventListener("click", () => { layers = structuredClone(INITIAL_LAYERS); selectedId = layers[0]?.id || null; saveLayout(); renderAll(); });
document.getElementById("toggle-grid").addEventListener("click", () => stage.classList.toggle("no-grid"));
document.getElementById("export-json").addEventListener("click", () => downloadText("townhall_layout.json", JSON.stringify(layoutPayload(), null, 2), "application/json"));
document.getElementById("copy-json").addEventListener("click", async () => { await navigator.clipboard.writeText(layoutJson.value); flash("copied"); });
document.getElementById("import-json").addEventListener("click", () => {
  const parsed = JSON.parse(layoutJson.value);
  if (Array.isArray(parsed)) {
    layers = parsed;
  } else {
    applyTileSettings(parsed.tile);
    layers = parsed.layers;
  }
  selectedId = layers[0]?.id || null;
  saveLayout();
  renderAll();
});
assetSearch.addEventListener("input", renderAssets);

document.getElementById("export-png").addEventListener("click", async () => {
  syncFloorPositions();
  const canvas = document.createElement("canvas");
  canvas.width = stage.clientWidth;
  canvas.height = stage.clientHeight;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of sortedLayers()) {
    if (!layer.visible) continue;
    const image = await loadImage(srcFor(layer));
    const position = layerPosition(layer);
    context.globalAlpha = Number(layer.opacity ?? 1);
    context.drawImage(image, position.x, position.y, image.naturalWidth * (Number(layer.scale) || 1), image.naturalHeight * (Number(layer.scale) || 1));
  }
  context.globalAlpha = 1;
  canvas.toBlob(blob => downloadBlob("townhall_composite.png", blob), "image/png");
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadText(filename, text, type) {
  downloadBlob(filename, new Blob([text], { type }));
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });
}

renderAssets();
renderAll();
</script>
</body>
</html>
'''


def main() -> int:
    assets = collect_assets()
    html = TEMPLATE.replace("__ASSETS__", json.dumps(assets, ensure_ascii=True)).replace(
        "__INITIAL_LAYERS__", json.dumps(initial_layers(), ensure_ascii=True)
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"assets {len(assets)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
