# Graphics and World Builder Reverse-Engineering Roadmap

Date: 2026-05-16
Scope: roadmap and evidence targeting only. No renderer code edits yet. No lab code edits yet.

## Mission

Primary graphics/world-building objective:
- Fully assembled visual map
- Correctly rendered nature and objects
- Correctly assembled facilities and buildings
- Future base/map builder for plan, save, export, and share

## Legal and Repository Guardrails

- Keep reverse-engineering artifacts local and out of commits.
- Treat these paths as local research-only:
  - Reverse engineering/
  - tools/asset_extractor/il2cpp_dump/
  - tools/asset_extractor/apk_runtime_extract/
- Commit only distilled website-ready data products (project-owned JSON/spec outputs) after review.
- Before any commit, verify no reverse-engineering binaries/databases are staged.

## Available Evidence and Assets

- IL2CPP dump outputs:
  - [tools/asset_extractor/il2cpp_dump/dump.cs](tools/asset_extractor/il2cpp_dump/dump.cs)
  - [tools/asset_extractor/il2cpp_dump/script.json](tools/asset_extractor/il2cpp_dump/script.json)
  - [tools/asset_extractor/il2cpp_dump/il2cpp.h](tools/asset_extractor/il2cpp_dump/il2cpp.h)
  - [tools/asset_extractor/il2cpp_dump/decompiled_Assembly-CSharp/Assembly-CSharp.decompiled.cs](tools/asset_extractor/il2cpp_dump/decompiled_Assembly-CSharp/Assembly-CSharp.decompiled.cs)
- Native target map:
  - [docs/native-rva-targets.md](docs/native-rva-targets.md)
- Current native status and blockers:
  - [docs/native-render-transform-analysis.md](docs/native-render-transform-analysis.md)
- Ghidra project/database location:
  - [Reverse engineering/KingdomAdventures.rep](Reverse%20engineering/KingdomAdventures.rep)

## Current Confirmed Facts

- Runtime is IL2CPP.
- Primary native binary used: arm64 libil2cpp.so.
- High-value render and map-system RVAs are identified.
- Draw function signatures expose key defaults:
  - frame default -1
  - scale default 100
  - anchor default 17
  - layer default -1
- Candidate runtime systems for map visuals are confirmed present:
  - DrawSebEx, DrawSebImg, DrawScaledSeb
  - ChipPlaceSystem.Draw, ChipReplaceSystem.Draw
  - MapSystem.CreateMapChips
  - TownNatureSystem change/growth handlers

## What Is Already Good Enough and Should Not Be Redone

- APK discovery and extraction setup
- IL2CPP dump generation and base artifacts
- Initial RVA target selection and grouping
- Signature-level class/function discovery from dump outputs
- Research-only reports already produced

Do not restart these unless evidence integrity is in question.

## Remaining Graphics Problems to Solve

1. Nature transform math
- Actual x/y offset pipeline
- Anchor and pivot interpretation
- Animation transform integration

2. Object crop and frame selection
- SEB frame lookup and fallback behavior
- Img selection and multi-image path behavior
- Crop source rect derivation

3. Facility and construction assembly
- Multi-part facility composition order
- Construction state to visual-part mapping
- Replace path visual deltas

4. Draw order and layers
- Layer fallback when layer is -1
- Interactions between map, facility, nature, overlays

5. Placement footprint logic
- Exact occupancy and footprint rules
- Rotation/entrance direction effects
- Roads, bridges, floors, replacement chips interactions

## Prioritized Ghidra and RVA Target List

Priority A: direct render primitives
1. DrawSebEx at RVA 0x13EB3D4
2. DrawSebImg at RVA 0x13EB4C8
3. DrawSebImg overload at RVA 0x13EBC0C
4. DrawScaledSeb at RVAs 0x13EBED8, 0x13EC2B8, 0x13EBF90
5. UpdateImageAnimation at RVA 0x13EBA9C
6. PopOut at RVA 0x13EBD14
7. SwingUpDown at RVA 0x13EBDF8

Priority B: map placement and draw feeders
1. ChipPlaceSystem.Draw at RVA 0x15094A8
2. ChipReplaceSystem.Draw at RVA 0x15107B8
3. MapSystem.CreateMapChips at RVA 0x15B17D4

Priority C: nature and state mutation systems
1. TownNatureSystem.OnChangeMapChip at RVA 0x15EFB14
2. TownNatureSystem.OnChangeMapChips at RVA 0x15EFD80
3. TownNatureSystem.OnGrowNature at RVA 0x15F0878
4. MapChipColorSystem.SetMapChipColors at RVA 0x15AE224

## Exact Methods and Classes to Inspect First

Start order for fastest answers:
1. ResourceManagerExtension.DrawSebImg
- Must answer: frame to source rect mapping, img selection path, crop behavior, OPT and OPTINFO touchpoints

2. ResourceManagerExtension.DrawSebEx
- Must answer: orchestration path, default handling, anchor and layer routing

3. ResourceManagerExtension.DrawScaledSeb overload with full args
- Must answer: scale arithmetic, anchor correction, layer finalization, rounding

4. ChipPlaceSystem.Draw
- Must answer: how map-space coordinates become draw coordinates and which render primitives are called

5. ChipReplaceSystem.Draw
- Must answer: replacement visual deltas, overlay/order handling

6. MapSystem.CreateMapChips
- Must answer: construction of chip entities, initial visual state and footprint-related fields

7. TownNatureSystem handlers
- Must answer: what nature events alter visual representation vs only data/state

## Evidence Capture Template per Target

For each target, capture:
- Function and RVA
- Entry disassembly block
- Key call chain (bl targets)
- Register-level argument mapping to semantic parameters
- Constants and branches affecting:
  - source rect
  - frame and crop
  - x/y offset
  - scale
  - pivot and anchor
  - layer and order
- Confirmed formulas
- Unknowns and confidence level

## How Findings Translate into Website Features

1. Completed world renderer
- Implement deterministic transform pipeline from confirmed native formulas
- Use explicit frame/crop/anchor/layer mapping tables derived from evidence
- Keep nature disabled on main map until formulas are validated in lab first

2. Facility composition lab
- Build assembly graph for facilities and construction states
- Visualize part ordering and offsets by layer
- Validate against extracted evidence before promoting to map renderer

3. Map/base builder
- Implement placement footprint and rotation rules from ChipPlace and MapSystem evidence
- Add replacement-chip rules from ChipReplace evidence
- Support roads, bridges, floors, and replacement interactions

4. Save/share layout format
- Define project-owned JSON schema for:
  - map dimensions and base seed
  - chip placements and rotations
  - facility state and construction stage
  - optional cosmetic render state where proven
- Use stable versioning and deterministic serialization for sharing

## Phased Execution Plan

Phase 1: close native render math gaps
- Finish disassembly evidence for Priority A
- Produce confirmed formulas for crop, offset, anchor, scale, layer

Phase 2: close map and facility assembly gaps
- Finish Priority B and C
- Produce placement and assembly rule docs

Phase 3: transform rules into internal data contracts
- Create website-owned JSON specs for graphics assembly and placement
- Keep raw reverse-engineering artifacts local

Phase 4: controlled implementation
- First in lab and isolated tools
- Then main world renderer and builder after verification gates

## Explicit Not-Now Items

- Do not edit renderer code yet
- Do not re-enable nature on main map yet
- Do not start combat simulator implementation work
- Do record combat, reward, drop, box, and loot leads in [combat-loot-foundation-leads.md](combat-loot-foundation-leads.md) when encountered during source or native investigation

## Completion Criteria for This Roadmap Stage

- Every priority target has a function-level evidence entry with confirmed or unknown status
- Transform formulas are confirmed for render primitives
- Facility assembly and placement footprint rules are documented with evidence
- Builder JSON schema draft is ready and independent from reverse-engineering raw artifacts
