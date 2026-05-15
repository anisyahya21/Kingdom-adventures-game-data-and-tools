/**
 * app.js — SPA shell for the KA Asset Inspector.
 *
 * Each panel registers itself here. Adding a new panel:
 * 1. Drop a file in panels/
 * 2. Import it below and add to PANELS array.
 */

import { AtlasPreviewPanel }    from "./panels/atlas_preview.js";
import { OverlayViewerPanel }   from "./panels/overlay_viewer.js";
import { SpriteSheetPanel }     from "./panels/sprite_sheet.js";
import { SearchFilterPanel }    from "./panels/search_filter.js";
import { MappingInspectorPanel }from "./panels/mapping_inspector.js";
import { LookupTesterPanel }    from "./panels/lookup_tester.js";
import { CharAssemblerPanel }   from "./panels/char_assembler.js";
import { TerrainGridPanel }     from "./panels/terrain_grid.js";
import { UnknownReviewPanel }   from "./panels/unknown_review.js";
import { FacilityInspectorPanel } from "./panels/facility_inspector.js";
import { IconEntityInspectorPanel } from "./panels/icon_entity_inspector.js";

// Panel registry — order determines tab order
const PANELS = [
  SpriteSheetPanel,
  OverlayViewerPanel,
  AtlasPreviewPanel,
  SearchFilterPanel,
  MappingInspectorPanel,
  LookupTesterPanel,
  CharAssemblerPanel,
  FacilityInspectorPanel,
  IconEntityInspectorPanel,
  TerrainGridPanel,
  UnknownReviewPanel,
];

// ---------------------------------------------------------------------------
// API helpers (shared across panels via window.KA)
// ---------------------------------------------------------------------------
async function apiFetch(route) {
  const res = await fetch(`/api/${route}`);
  if (!res.ok) throw new Error(`API ${route}: ${res.status}`);
  return res.json();
}

function imageUrl(relPath) {
  return `/api/image?path=${encodeURIComponent(relPath)}`;
}

function previewImageUrl(relPath) {
  return `/api/preview-image?path=${encodeURIComponent(relPath)}`;
}

// Serves a pre-rendered sprite from generated/sprites/{category}/{assetId}.png
function spriteUrl(category, assetId) {
  return `/api/sprite?path=${encodeURIComponent(category + '/' + assetId + '.png')}`;
}

// Expose globally so panels can use without re-importing
window.KA = { apiFetch, imageUrl, previewImageUrl, spriteUrl };

// ---------------------------------------------------------------------------
// Tab / panel management
// ---------------------------------------------------------------------------
let activePanel = null;
const panelInstances = [];

function activatePanel(idx) {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((t, i) => t.classList.toggle("active", i === idx));

  panelInstances.forEach((p, i) => {
    const el = p.el;
    if (el) el.classList.toggle("active", i === idx);
  });

  if (activePanel !== idx) {
    activePanel = idx;
    panelInstances[idx]?.onActivate?.();
  }
}

function buildUI() {
  const tabsEl = document.getElementById("panel-tabs");
  const containerEl = document.getElementById("panel-container");

  PANELS.forEach((PanelClass, idx) => {
    // Tab button
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.textContent = PanelClass.LABEL;
    btn.addEventListener("click", () => activatePanel(idx));
    tabsEl.appendChild(btn);

    // Panel element
    const panelEl = document.createElement("div");
    panelEl.className = "panel";
    panelEl.id = `panel-${PanelClass.ID}`;
    containerEl.appendChild(panelEl);

    // Instantiate
    const instance = new PanelClass(panelEl);
    panelInstances.push(instance);
    instance.init();
  });

  activatePanel(0);
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------
async function loadStatus() {
  const el = document.getElementById("header-status");
  const footer = document.getElementById("footer-info");
  try {
    const stats = await apiFetch("stats");
    el.textContent = `${stats.total ?? "?"} refs  \u2022  ${stats.auto ?? "?"} auto  \u2022  ${stats.missingSource ?? "?"} missing`;
    footer.textContent = `${stats.total ?? "?"} asset refs  \u2022  ${stats.auto ?? "?"} resolved  \u2022  ${stats.missingSource ?? "?"} missing source`;
  } catch {
    el.textContent = "no data \u2014 run pipeline";
    footer.textContent = "No data found \u2014 run: python main.py extract";
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildUI();
loadStatus();
