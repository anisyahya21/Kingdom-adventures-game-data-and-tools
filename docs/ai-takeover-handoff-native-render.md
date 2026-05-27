# AI Takeover Handoff: Map + Native Render (Master)

Date: 2026-05-17
Status: single canonical handoff for crash recovery and continuation
Scope rule: implementation now progresses in parallel with reverse engineering; do not block visible map/builder improvements on perfect native transform closure.

## Purpose

This is the one-file restart point after context loss.
It captures achieved work, exact file/data linkage, storage conventions, and the staged continuation plan.

## Stage Model (Current Position)

Stage 0: Extraction and dump setup
- Complete.
- IL2CPP runtime, metadata, and dump artifacts are present.

Stage 1: Symbol and RVA targeting
- Complete.
- High-value render and map-system targets are mapped.

Stage 2: SEB downstream semantic reconstruction
- Complete at orchestration/staging level.
- Evidence in SEB final reports confirms staging and emission behavior.

Stage 3: Public-parameter-to-formula closure
- In progress, but no longer blocks visible implementation.
- Continue only where it improves visible placement, layering, alignment, facility rendering, camera feel, or overlay information.

Stage 4: Controlled integration in runtime map flow
- Active.
- Apply good-enough, clearly labeled visual rules now; refine with evidence as reverse engineering closes gaps.

Stage 5: Builder-safe contracts and rollout
- Not started.
- Distill into website-safe data contracts and implementation follow-through.

## User Goal

Extract and prove native IL2CPP render transform behavior (no visual guessing) for:
1. DrawSebEx
2. DrawSebImg
3. DrawScaledSeb
4. ChipPlaceSystem.Draw
5. ChipReplaceSystem.Draw
6. MapSystem.CreateMapChips
7. TownNatureSystem handlers (if relevant)

Primary reporting target:
- docs/native-render-transform-analysis.md

## Current User Priority Hierarchy

1. Complete the map visually and informationally.
   - Informational completion includes loot type when verified.
   - Do not invent map or loot facts; use canonical game-data/source documents when present.
2. Learn how facilities are built and composed from components/pieces.
   - This supports facility icons now.
   - It also supports a future world-builder map where facilities can be placed correctly.
3. Start a combat knowledge foundation only by preserving leads.
   - Do not build the combat simulator yet.
   - When combat/reward leads are found, record enough detail to return later.
   - Current combat interest areas: damage formulas, attack/defense/stat scaling, turn order or speed logic, hit/miss/crit logic, skill activation logic, enemy/monster reward logic, loot/drop tables, chest/reward/multi-box handling, dungeon battle flow, party/unit targeting rules, battle result/reward settlement, and functions/classes related to combat, rewards, boxes, drops, or loot.
   - Lead ledger: docs/combat-loot-foundation-leads.md

4. Secondary watch item: land-state and monster-spawn mechanics.
   - Preserve evidence encountered naturally during map/render/facility tracing.
   - Main question: whether a tile/area becoming wasteland affects monster spawning.
   - Watch for wasteland, land reclamation, terrain state changes, monster spawn zones, spawn eligibility, spawn level/rank, and biome-based spawning.
   - Lead ledger: docs/land-state-monster-spawn-leads.md

## World-Builder Scope Clarification

The website builder's goal is a visually accurate 2D presentation/planning tool for the world map and facility placement, not a full game-engine simulator.

The project is now implementation-guided:
- get visible map progress working now,
- alternate implementation and research,
- prefer good-enough visual progress over waiting for perfect engine reconstruction,
- lower any reverse-engineering branch that does not improve visible placement, layering, alignment, facility rendering, camera feel, or overlay information.

Two map modes progress in parallel:
- visual/presentation map: terrain visuals, nature visuals, static facilities/unlocks, camera/zoom/pan, clean presentation,
- flat/debug/logic map: spawn highlights, overlays, terrain states, filters, points of interest, and analysis layers.

Prioritize:
1. visual correctness,
2. placement correctness,
3. layering correctness,
4. performance and browser simplicity.

Most important visual/planning targets:
- terrain looks correct,
- nature aligns correctly,
- facilities visually fit correctly,
- footprint and occupied tiles are correct,
- anchor/alignment is believable,
- draw order/layering is correct enough for planning,
- entrance/orientation is shown when relevant,
- camera/projection/zoom/pan feel like the game.

Target builder capabilities:
- place facilities/buildings,
- show occupied footprint,
- show correct visual sprite/parts,
- avoid overlap,
- optionally show entrance/road direction,
- save/share/export layouts.

Lower priority:
- monster movement,
- character walking,
- pathfinding,
- combat simulation,
- construction state transitions,
- upgrade animation states,
- active/inactive internal lifecycle,
- damage/repair state,
- full state machines,
- AI behavior,
- physics,
- internal update loops,
- every runtime add/update/remove visual-record behavior,
- hidden cache/update systems,
- perfect game-engine renderer behavior.

Version 1 facility rule:
- most facilities are static sprites with known footprints, mostly `2x2`,
- ports and special structures can get extra assembly logic later,
- visual alignment only needs to be good enough for planning until better evidence lands.

For visual-record lifecycle helpers:
- use them as evidence for facility/object composition and change behavior,
- do not chase full lifecycle simulation unless it directly helps static planning,
- `FUN_028b3358` is useful only if it identifies a game/UI/render system relevant to static facility rendering, footprint, layering, orientation, or camera feel,
- if it is mostly lifecycle-only, document it and move on.

## Achieved So Far

- Runtime map test pages are active and linked:
  - artifacts/kingdom-adventures/src/pages/runtime-world-render-test.tsx
  - artifacts/kingdom-adventures/src/pages/runtime-world-grid-test.tsx
- Canonical map section-A parser is implemented:
  - artifacts/kingdom-adventures/src/runtime/world-builder/map-loader.ts
- IL2CPP dump and target mapping are complete:
  - docs/runtime-code-target-report.md
  - docs/native-rva-targets.md
- SEB semantic closure reached at staging/orchestrator layer:
  - docs/SEB_SEMANTICS_FINAL_REPORT.md
  - docs/seb-draw-final-summary.md

## Data Linkage (CSV/TXT/INF/SEB/OPT to Runtime)

Primary visual runtime inputs are declared in:
- artifacts/kingdom-adventures/src/pages/runtime-world-render-test.tsx

Linked source files:
- /tmp/KA_assets/map/map_160_160.map
- /tmp/KA_assets/xls/English.lproj/MapChip.txt
- /tmp/KA_assets/xls/English.lproj/Terrain.txt
- /tmp/KA_assets/chip/img.inf
- /tmp/KA_assets/chip/seb.inf
- /tmp/KA_assets/image_atlas/ImageAtlas0.txt

Pipeline shape in runtime-world-render-test.tsx:
1. Load map/tables/inf/atlas
2. Parse map/mapchip/terrain/inf/atlas
3. Resolve used IDs
4. Fetch and parse OPT and SEB binaries
5. Build image cache and draw command pipeline

Key parse helpers currently in-page:
- parseMapChipRows
- parseTerrainRows
- parseInfTable
- parseImageAtlas
- parseOptSequential
- parseSeb

Top-view linkage:
- runtime-world-grid-test.tsx consumes parseMapBinarySectionA from map-loader.ts and visualizes f0..f5.

## Exact Files and Locations

Core runtime extraction inputs:
- tools/asset_extractor/apk_runtime_extract/extracted/lib/arm64-v8a/libil2cpp.so
- tools/asset_extractor/apk_runtime_extract/extracted/assets/bin/Data/Managed/Metadata/global-metadata.dat

Dump outputs:
- tools/asset_extractor/il2cpp_dump/dump.cs
- tools/asset_extractor/il2cpp_dump/script.json
- tools/asset_extractor/il2cpp_dump/il2cpp.h
- tools/asset_extractor/il2cpp_dump/stringliteral.json
- tools/asset_extractor/il2cpp_dump/DummyDll/Assembly-CSharp.dll
- tools/asset_extractor/il2cpp_dump/decompiled_Assembly-CSharp/Assembly-CSharp.decompiled.cs

Native/reverse and roadmap docs:
- docs/apk-runtime-extraction-status.md
- docs/runtime-code-target-report.md
- docs/native-rva-targets.md
- docs/native-render-transform-analysis.md
- docs/SEB_SEMANTICS_FINAL_REPORT.md
- docs/seb-draw-final-summary.md
- docs/seb-draw-transform-rule.md
- docs/graphics-world-builder-reverse-roadmap.md
- docs/ghidra-export-targets.md
- docs/architecture/source-of-truth.md

Runtime world-builder files used in ongoing reconstruction:
- artifacts/kingdom-adventures/src/runtime/world-builder/map-loader.ts
- artifacts/kingdom-adventures/src/runtime/world-builder/mapchip-visual-resolver.ts
- artifacts/kingdom-adventures/src/runtime/world-builder/facility-placement-trace.ts

Ghidra export scripts and outputs:
- tools/asset_extractor/ghidra_scripts/export_seb_decomp.py
- tools/asset_extractor/ghidra_scripts/BulkExportSebRender.java
- Reverse engineering/exports/seb-render-functions/

## Known RVAs Already Confirmed

Render primitives:
- DrawSebEx: 0x13EB3D4
- DrawSebImg (single): 0x13EB4C8
- DrawSebImg (imgIds): 0x13EBC0C
- DrawScaledSeb: 0x13EBED8
- DrawScaledSeb overload: 0x13EC2B8
- DrawScaledSeb overload: 0x13EBF90
- UpdateImageAnimation: 0x13EBA9C
- PopOut: 0x13EBD14
- SwingUpDown: 0x13EBDF8

Map/system group:
- ChipPlaceSystem.Draw: 0x15094A8
- ChipReplaceSystem.Draw: 0x15107B8
- MapSystem.CreateMapChips: 0x15B17D4
- TownNatureSystem.OnChangeMapChip: 0x15EFB14
- TownNatureSystem.OnChangeMapChips: 0x15EFD80
- TownNatureSystem.OnGrowNature: 0x15F0878

## Where to Place New Discoveries

0. Reverse-engineering export curation
- Raw Ghidra exports are temporary research artifacts, not permanent project knowledge.
- Curate useful findings into docs before treating an export as complete.
- Maintain:
  - docs/reverse-engineering-discovery-index.md
  - Reverse engineering/exports/cleanup-manifest.md
- Mark raw exports as KEEP, CURATED, or DISPOSABLE before any cleanup.

0a. Communication rule for reverse-engineering progress
- Number the steps when reporting progress, blockers, and next actions.
- Explain game/map/world-builder meaning first, reverse-engineering terminology second.
- Prefer practical language about terrain, nature placement, camera feel, facility/building rendering, placement size, object layering, zoom/perspective, and builder features.
- Use function names, RVA ambiguity, staged payloads, caller correlation, tuple packers, and metadata/data-table terms only as supporting detail.
- Always state what the finding means for the actual map/builder and whether it moves us closer to correct terrain, correct nature placement, correct facility rendering, accurate layering, or interactive builder behavior.

0b. Land-state and monster-spawn watch rule
- While tracing map/render/facility code, preserve evidence about wasteland, land reclamation, terrain-state changes, monster spawn zones, spawn eligibility, spawn level/rank, and biome-based spawning when encountered naturally.
- Record strong rules and weaker leads in docs/land-state-monster-spawn-leads.md.
- Explain practical map-builder meaning first, especially whether the evidence affects where monsters can spawn or how dangerous a tile/area should be represented.

0c. Visual builder priority rule
- Keep analysis focused on visual planning needs: terrain appearance, nature alignment, facility composition, footprint, occupied tiles, layering/order, entrance/orientation, camera/projection/zoom/pan, and browser-friendly rendering.
- Treat lifecycle/state helpers as secondary unless they reveal static composition or placement facts.
- Avoid spending reverse-engineering time on full runtime lifecycle simulation unless the user explicitly raises it later.

1. Cross-page game facts/relationships
- Put in shared modules under artifacts/kingdom-adventures/src/game-data
- Follow docs/architecture/source-of-truth.md before adding any new mapping

2. Reverse-engineering conclusions and transform rules
- Update focused docs under docs/
- Keep one canonical status doc per topic and link supporting notes from it

3. Raw reverse artifacts
- Keep in local research-only paths:
  - Reverse engineering/
  - tools/asset_extractor/* outputs
- Do not treat raw dumps/exports as website source-of-truth

## What Must Not Be Changed (Until Stage 3 Closure)

- artifacts/kingdom-adventures/src/pages/terrain-composition-lab.tsx
- main website renderer/lab behavior based on unproven transform guesses

## Why Progress Previously Stalled

Two toolchain blockers occurred:
1. WSL disassembly path prompted interactive install and was aborted.
2. Python fallback path (pyelftools + capstone) was interrupted before reliable execution.

Result:
- setup and target mapping are complete,
- instruction-level transform evidence remains the remaining closure task.

## Next Steps (Concrete)

1. Re-read, in order:
- docs/SEB_SEMANTICS_FINAL_REPORT.md
- docs/seb-draw-final-summary.md
- docs/native-rva-targets.md

2. Re-establish local disassembly path (no unapproved OS installs):
- prefer available local toolchain,
- else use Python ELF path if package/runtime is stable,
- avoid WSL installation flow unless explicitly approved.

3. For each required target function:
- map RVA to executable offset/VA correctly,
- extract disassembly evidence around entry and key callees,
- map parameter flow to source-rect/frame/offset/scale/anchor/layer math.

4. Correlate against signatures in dump.cs and decompiled Assembly-CSharp.

5. Update docs/native-render-transform-analysis.md with strict sections:
- target function
- RVA/address
- disassembly evidence
- parameter interpretation
- transform formula
- constants
- confirmed facts
- unknowns
- exact future lab/map rule

6. Only after Stage 3 is closed:
- begin controlled Stage 4 integration in runtime map paths.

## Verification Checklist

- Every target in scope is analyzed or explicitly blocked with reason.
- Numeric claims (offsets, constants, divisors, anchors, layer logic) are evidence-cited.
- Confirmed vs inferred behavior is clearly separated.
- No visual-only tuning guesses are presented as facts.

## Quick Reality Summary

- Hard setup work is complete: extraction, IL2CPP dump, symbol/RVA targeting.
- Semantic downstream draw staging is strongly mapped.
- Step 9 closed `FUN_028b3358` as a storage/cache false lead for the visual builder:
  - it belongs to `System.Data.Common.Int32Storage`,
  - it does not help static facility composition, footprint, anchoring, terrain alignment, camera feel, or layering,
  - it is now CURATED, not active.
- Step 11 retargeted `BulkExportSebRender.java` for static facility/map builder evidence:
  - default output is now `Reverse engineering/exports/active`,
  - targets focus on `ChipPlaceSystem`, `ChipReplaceSystem`, `FacilitySystem`, `MapSystem`, and `MapChipData`,
  - the practical goal is footprint, occupied tiles, sprite ids/frames, entrance/orientation, and layering.
- Step 12 moved the new export set into `Reverse engineering/exports/active`:
  - 239 files active,
  - old `seb-render-functions` working folder is empty again,
  - no files deleted.
- Step 12 also made the first implementation-guided map UI change:
  - `artifacts/kingdom-adventures/src/pages/world-map.tsx` has explicit `Visual` and `Logic` map modes,
  - normal zoom-out now reaches `0.5px` tiles,
  - TypeScript typecheck passed.
- `MapChipData` metadata already identifies likely static-builder fields:
  - `res`, `img`, `seb`, `frame`,
  - `height`, `layer`, `rotation`,
  - `sizeWidth`, `sizeHeight`,
  - `unitWidth`, `unitHeight`.
- Remaining core gap is final parameter-to-formula closure for native transforms.
- Next numbered work should be Step 13: alternate visible map implementation with targeted extraction of only the rules that improve visual placement, layering, alignment, facility rendering, camera feel, or overlays.
- Keep raw reverse artifacts local; commit only distilled website-safe outputs.
