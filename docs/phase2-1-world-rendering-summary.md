# Phase 2.1 World Rendering Summary

Date: 2026-05-18
Status: master index and architectural overview for Phase 1 findings

## Purpose

This document is the Phase 2.1 master summary for Kingdom Adventures world rendering and placement reverse engineering.
It collects the existing Phase 1 documentation, highlights confirmed facts versus hypotheses, identifies gaps, and provides a rapid navigation index for future work.

**Important:** this summary contains newer corrections that override older Phase 1 assumptions when they conflict. In particular, current evidence treats `mapCell.f5` / MapChip as the primary visible image driver and `mapCell.f1` as terrain classification metadata, so older generic "terrain base + optional overlay" models should not be trusted without revalidation.

- New Phase 2 evidence shows that `MapSystem.PlacePort`, `MapSystem.AddWaterEdge`, and `MapSystem.CreateMapChips` are mostly orchestration/list-building wrappers rather than the location of final coordinate-placement math. The deeper semantic placement logic now appears to be delegated to helper functions.
- Any export run must verify target RVAs with `seed_resolution.tsv` before treating the output as relevant evidence.

## What this document contains

- Inventory of Phase 1 documentation
- What each doc is best for
- Confirmed facts vs inferred behavior vs unresolved questions
- Research navigation index: which docs and extracted files to use for each topic
- Missing areas and weak assumptions
- Recommended next focus areas for Phase 2

## Key Phase 1 Documents

### 1. `docs/reverse-engineering-discovery-index.md`
- Role: master discovery index and evidence curation rules
- Contains:
  - reporting rules and practical focus for map/builder work
  - SEB/public entrypoint boundary findings
  - staged render helper clusters
  - caller/correlation and render function table pass summaries
  - current confidence and evidence status
- Best for:
  - understanding the research process
  - finding which raw exports are still needed
  - locating SEB render pipeline evidence and prioritized next exports

### 2. `docs/ai-takeover-handoff-native-render.md`
- Role: implementation handoff and native render/visual map master plan
- Contains:
  - staged project model (Stage 0..5)
  - confirmed native RVA targets for render primitives and map systems
  - data linkage for CSV/TXT/INF/SEB/OPT inputs
  - website builder scope and visual priority hierarchy
  - runtime page and asset linkage references
- Best for:
  - deciding whether a reverse-engineering lead is worth implementing now
  - where runtime assets are consumed in the site
  - the end-to-end context between native research and website implementation

### 3. `docs/graphics-world-builder-reverse-roadmap.md`
- Role: roadmap and priority list for graphics/world-builder evidence
- Contains:
  - confirmed facts about engine and target RVAs
  - remaining graphics problems to solve
  - exact target order for functions and systems
  - evidence capture template
- Best for:
  - choosing the next native extraction targets
  - tracking which engine subsystems remain unsolved
  - keeping research focused on render/placement rather than unrelated runtime code

### 4. `docs/architecture/facility-world-placement.md`
- Role: derived facility placement rules and visual anchor constants
- Contains:
  - 2×2 static facility exclusive-end anchor rule
  - NW-anchor worldToIso correction for buildings
  - exact image source mapping for static facilities
  - port composite assembly rules and component offsets
  - practical renderer implications for facility overlays
- Best for:
  - facility/world placement implementation
  - anchor/offset rules for buildings and ports
  - confirming map-chip image linkage and footprint behavior

### 5. `docs/SEB_SEMANTICS_FINAL_REPORT.md`
- Role: final SEB renderer semantics summary
- Contains:
  - confirmed SEB staging/orchestration call chain
  - staged render entry structure and payload field mapping
  - dual render path semantics for base vs secondary draw
  - public parameter mapping hypotheses for DrawSeb* APIs
- Best for:
  - SEB renderer logic and staged record layout
  - understanding what part of the draw pipeline is confirmed
  - locating the remaining unknowns in SEB semantics

### 6. `docs/seb-draw-final-summary.md`
- Role: distilled SEB draw evidence and unresolved gaps
- Contains:
  - confirmed staging manager and record behavior
  - field-level confirmation of staged records
  - identification of which functions are packing, setup, and search helpers
  - explicit list of what is still missing
- Best for:
  - quick reference to what is already solved in SEB draw flow
  - understanding what remains to close the final public parameter mapping

### 7. `artifacts/kingdom-adventures/docs/terrain-opt-report.md`
- Role: terrain asset metadata and OPT/OPTINFO analysis
- Contains:
  - terrain base vs nature category discovery
  - OPT slot/frame selection heuristics
  - anchor metadata in terrain OPT files
  - recommended PNG + OPT slot draw targets
- Best for:
  - terrain image/slot selection rules
  - identifying which terrain assets carry anchor offsets
  - practical terrain draw mapping for visual map implementation

## Confirmed Facts

### Terrain and terrain assets
- Terrain rows with `category=0` are base terrain and those with `category=1` are nature/overlay.
- `Terrain.type` selects a terrain family bucket and is reliably matched to `mapCell.f1`.
- `Terrain.frame` is used as a preferred OPT slot index, with fallback to the first filled slot.
- Some terrain/nature assets carry non-zero `destX/destY` anchor metadata in OPT slots.
- `mapCell.f5` / MapChip appears to be the actual visible image driver for many world tiles, while `mapCell.f1` is more like terrain classification metadata.
- Terrain and MapChip appear to share the same image table(s) in practice, so the generic “terrain base + optional map chip overlay” model is misleading for this game.
- Do not assume `f5` is optional unless current map data proves it; treat it as a primary visual signal for MapChip-linked assets.

### Facility/world placement
- Static one-piece facilities are stored with `cellX, cellY` as the exclusive SE-end of a 2×2 footprint.
- Correct placement is `worldToIso(cellX-2, cellY-2)` for the NW tile anchor.
- `worldToIso` returns the NW-tile center; the 2×2 diamond center is one half-tile below.
- The game's facility mechanic anchor corresponds to the SE tile of the 2×2 footprint.
- Facility asset IDs are taken from `MapChip.img`, not from `Facility_lookup.type`.
- Port structures are composite: a 4×4 footprint composed of four 2×2 components, each using the same exclusive-end/NW-anchor logic.
- Gate pieces have confirmed per-chip OPT offsets, showing asset placement goes through OPT cells.

### SEB rendering and draw semantics
- The SEB draw pipeline is a staging/orchestration system with confirmed helpers and record layout.
- `FUN_013eb4c0` is an orchestrator that consumes a staging manager, resolves a base draw path, and optionally emits a secondary triple-buffered pass.
- Staged render entries use fields at offsets `+0x10`, `+0x18`, `+0x1c`, `+0x20`; keying and payload writes are confirmed.
- `FUN_013ebb5c` is a deduplicating insert/update helper for staged records.
- `FUN_013eb720` is a key-based search routine over staged entries.
- `FUN_015c381c` is a pure 3-value packer and does not contain coordinate math.
- The public API variants (`DrawSebImg`, `DrawSebEx`, `DrawScaledSeb`) likely feed shared downstream orchestrator behavior.
- Raw entrypoint addresses and public methods are still uncertain due to IL2CPP/Ghidra boundary issues.

## Strongly Inferred Behavior

- `mapCell.f2` can point to `Terrain.id` rows with `res=20`, but using it directly for object placement is unsafe; current map implementation treats it as a candidate signal only.
- Ports and other special multi-part structures are likely assembled from map-chip child lists and parent/combination metadata rather than a single monolithic sprite.
- The SEB staged delta `(A - B)` is likely related to depth/layer or scaling state, not raw screen x/y coordinates.
- The current world-builder should use good-enough visual rules for facility placement while waiting for explicit native confirmation of the final anchor math.

## Unresolved Questions

### Map and terrain placement
- What is the complete `worldToIso`/camera formula used by the game for map tile positioning, including zoom or perspective effects?
- How exactly are roads, bridges, floors, and replacement chips chosen and layered relative to base terrain?
- Are there additional placement masks or adjacency rules for ports, floors, and wall structures beyond the confirmed 2×2/4×4 footprint rules?

### SEB / rendering
- What are the exact public parameter mappings for `DrawSebImg`, `DrawSebEx`, and `DrawScaledSeb`?
- What are the semantic meanings of the SEB payload fields extracted from sprite records (`piVarX[2]`, `[3]`, `[4]`)?
- How do anchor, layer, and scale parameters propagate into the final screen position?
- Which helper function(s) contain the actual x/y/anchor arithmetic if not the confirmed staging helpers?
- How does the engine handle negative layer values and layer fallback when `layer == -1`?

### Facility composition
- What are the exact native rules for assembling a port from gate pieces and water/bridge assets?
- Which structures are placed by tile replacement, and which are placed by overlaying separate sprite assets?
- Does the game use explicit footprint tables per facility type, or are footprints deduced from `MapChip.sizeWidth/sizeHeight` and `cellX/cellY` only?

## Contradictions and Weak Assumptions

- Current port placement is partially manual: the 4×4 Port footprint and piece order are likely correct, but not fully native-proven.
- `mapCell.f2` appears to carry some object-selection signal, but using it directly caused biome-crossing visual errors; the current heuristic is still a patch, not a confirmed rule.
- The `SEB_SEMANTICS_FINAL_REPORT.md` claims semantic closure for staging/orchestration, but the exact public entrypoints and final transform math remain unresolved.
- `docs/graphics-world-builder-reverse-roadmap.md` lists map and facility systems as priority; actual proofs for those systems are still needed.

## Research Navigation Index

### Terrain / map chip / image linkage
- `artifacts/kingdom-adventures/docs/terrain-opt-report.md`
- `docs/architecture/facility-world-placement.md`
- `docs/ai-takeover-handoff-native-render.md`
- `docs/reverse-engineering-discovery-index.md`
- `artifacts/kingdom-adventures/tmp/KA_assets/xls/English.lproj/Terrain.txt`
- `artifacts/kingdom-adventures/tmp/KA_assets/xls/English.lproj/MapChip.txt`
- `artifacts/kingdom-adventures/tmp/KA_assets/chip/img.inf`
- `artifacts/kingdom-adventures/tmp/KA_assets/building/img.inf`
- map chip positioning / `mapCell.f5` visual drive is primarily documented in `docs/architecture/facility-world-placement.md`.

### Facility / world placement
- `docs/architecture/facility-world-placement.md`
- `docs/reverse-engineering-discovery-index.md`
- `docs/graphics-world-builder-reverse-roadmap.md`
- Runtime code: `artifacts/kingdom-adventures/src/pages/runtime-world-render-test.tsx`
- Map loader: `artifacts/kingdom-adventures/src/runtime/world-builder/map-loader.ts`

### SEB renderer and native draw semantics
- `docs/SEB_SEMANTICS_FINAL_REPORT.md`
- `docs/seb-draw-final-summary.md`
- `docs/reverse-engineering-discovery-index.md`
- `docs/ghidra-export-targets.md`
- Raw exports: `Reverse engineering/exports/seb-render-functions/`
- Ghidra scripts: `tools/asset_extractor/ghidra_scripts/BulkExportSebRender.java`

### World assembly / placement rules
- `docs/ai-takeover-handoff-native-render.md`
- `docs/graphics-world-builder-reverse-roadmap.md`
- `docs/reverse-engineering-discovery-index.md`
- `docs/architecture/facility-world-placement.md`

### Anchor/offset/geometry
- `docs/architecture/facility-world-placement.md`
- `artifacts/kingdom-adventures/docs/terrain-opt-report.md`
- `docs/SEB_SEMANTICS_FINAL_REPORT.md`
- `docs/seb-draw-final-summary.md`

### Important raw evidence paths
- `tools/asset_extractor/apk_runtime_extract/extracted/lib/arm64-v8a/libil2cpp.so`
- `tools/asset_extractor/il2cpp_dump/dump.cs`
- `tools/asset_extractor/il2cpp_dump/script.json`
- `Reverse engineering/exports/seb-render-functions/`
- `artifacts/kingdom-adventures/tmp/KA_assets/`

## Most Important Files for Each Focus Area

- Terrain: `terrain-opt-report.md`, `ai-takeover-handoff-native-render.md`
- Map chips: `facility-world-placement.md`, `terrain-opt-report.md`
- Facilities: `facility-world-placement.md`, `graphics-world-builder-reverse-roadmap.md`
- Rendering: `SEB_SEMANTICS_FINAL_REPORT.md`, `seb-draw-final-summary.md`, `reverse-engineering-discovery-index.md`
- Geometry: `facility-world-placement.md`, `graphics-world-builder-reverse-roadmap.md`
- Anchoring/offsets: `facility-world-placement.md`, `terrain-opt-report.md`
- SEB renderer discoveries: `SEB_SEMANTICS_FINAL_REPORT.md`, `seb-draw-final-summary.md`, `reverse-engineering-discovery-index.md`
- World assembly: `ai-takeover-handoff-native-render.md`, `graphics-world-builder-reverse-roadmap.md`
- Image linkage: `terrain-opt-report.md`, `facility-world-placement.md`
- Placement rules: `facility-world-placement.md`, `reverse-engineering-discovery-index.md`

## Missing Areas and Weak Evidence

### Missing areas
- Exact public SEB draw API to internal staging mapping
- Chip placement system math in `ChipPlaceSystem.Draw` / `ChipReplaceSystem.Draw`
- `MapSystem.CreateMapChips` assembly logic
- Town nature/terrain change render behavior
- Full port/bridge/wall placement rules from native data
- Camera/world-to-screen formula in the actual engine

### Weak assumptions
- Port component order and 4×4 anchor layout are manual/heuristic until native proof is found.
- `mapCell.f2` object hinting remains only partially validated.
- The current builder anchor rules for multi-cell facilities are based on confirmed 2×2 behavior but not on a complete placement table.
- Terrain object selection uses heuristics from `Terrain.type === mapCell.f1` and category chances rather than a fully derived native algorithm.

## Recommended Next Steps for Phase 2

1. Close SEB public API mapping
   - target `DrawSebImg`, `DrawSebEx`, `DrawScaledSeb` entrypoints
   - resolve which helper family is the actual public draw path
   - confirm x/y/anchor/layer/scale mapping from IL2CPP metadata and runtime parameters

2. Trace map placement systems
   - inspect `ChipPlaceSystem.Draw`, `ChipReplaceSystem.Draw`, `MapSystem.CreateMapChips`
   - find how `cellX/cellY` become screen coordinates and how `sizeWidth/sizeHeight` are applied

3. Verify port and bridge placement rules
   - locate native port assembly code or data tables
   - prove 4×4 footprint and drill down on bridge/water replacement logic

4. Validate terrain/nature selection logic
   - use `Terrain.txt` / `mapCell.f1/f2` evidence to confirm or replace heuristics
   - capture any native adjacency or placement masks

5. Turn confirmed rules into website-ready data
   - build stable JSON/data contracts for tile anchors, facility footprints, and SEB draw transforms
   - keep raw reverse-engineering artifacts local and commit only distilled outputs
