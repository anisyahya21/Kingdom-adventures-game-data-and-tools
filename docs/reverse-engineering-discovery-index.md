# Reverse-Engineering Discovery Index

Date created: 2026-05-17
Status: permanent index for curated findings

## Canonical Evidence Precedence Rule

When two reports conflict, treat the newest vetted report as canonical.

Additional guardrail:
- If a chain is later shown to be system/runtime metadata rather than gameplay logic, mark older gameplay interpretations as superseded.
- Do not continue analysis from superseded chains unless new evidence explicitly reopens them.
- Record superseded status in summary/index docs so downstream work does not inherit stale assumptions.

## Artifact Rule

Raw Ghidra export files are temporary research artifacts, not permanent project knowledge.

When useful code is found:
- Extract useful evidence into the appropriate docs file.
- Store only important function names, addresses, file paths, field offsets, formulas, short snippets, and interpretation.
- If exact code matters, copy only the smallest relevant snippet or pseudocode, not a whole decompiled function.
- Mark whether the raw export file is still needed:
  - KEEP: still actively needed for unresolved analysis
  - CURATED: useful information extracted into docs
  - DISPOSABLE: junk, duplicate, unrelated, or fully extracted
- Prefer permanent docs and manifests over permanent bulk export folders.
- Before deleting exports, generate or update `Reverse engineering/exports/cleanup-manifest.md`.

## Reporting Rule

When explaining reverse-engineering progress, describe the practical map/builder meaning first.

Always answer:
- What this means for the actual map or builder.
- What visual/game behavior it affects.
- Whether it moves us closer to correct terrain, nature placement, camera feel, facility rendering, building placement, zoom/perspective, accurate layering, or interactive builder features.

Use low-level function names, address issues, staged payloads, caller reports, tuple packers, and data-table wording only as secondary details.

## Secondary Watch Item: Land State and Monster Spawning

While tracing map/render/facility files, also preserve evidence about land-state and monster-spawn mechanics when encountered naturally.

Primary practical question:
- Does a tile or area becoming wasteland affect monster spawning?

Watch terms and systems:
- wasteland
- land reclamation
- terrain state changes
- monster spawn zones
- spawn eligibility
- spawn level/rank
- biome-based spawning

Record strong findings in `docs/land-state-monster-spawn-leads.md` under `Monster Spawn Rules`:
- Function/class/file
- Evidence
- Practical meaning for map builder
- Confidence

Record weaker clues under `Possible Leads`:
- Function/class/file
- Why it might matter
- What needs confirmation later

## World-Builder Priority Rule

The website builder's goal is a visually accurate 2D presentation/planning tool for world map and facility placement, not a full game-engine simulator.

The project is now in implementation-guided reverse engineering:
- ship visible map improvements continuously,
- use reverse engineering where it improves visible placement, layering, alignment, facility rendering, camera feel, or useful overlay information,
- document low-priority runtime/engine discoveries and move on.

The website has two parallel map modes:
- visual/presentation map: terrain, nature, static facilities, camera/zoom/pan, and clean presentation,
- flat/debug/logic map: spawn highlights, overlays, terrain states, filters, points of interest, and analysis layers.

Prioritize evidence that helps:
1. visual correctness,
2. placement correctness,
3. layering correctness,
4. performance and browser simplicity.

Most useful evidence areas:
- terrain appearance,
- nature alignment,
- facility visual composition,
- footprint and occupied tiles,
- anchor/alignment,
- draw order/layering,
- entrance or orientation when relevant,
- camera/projection/zoom/pan feel.

Useful builder features:
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
- active/inactive runtime lifecycle,
- damage/repair state,
- full state machines,
- AI behavior,
- physics,
- internal update loops,
- fully reproducing every add/update/remove visual-record behavior.
- perfect game-engine renderer behavior,
- hidden cache/update systems.

Version 1 facility placement rule:
- most facilities can be represented as static sprites with known footprints, mostly `2x2`,
- ports and special structures may need custom assembly later,
- good-enough visual alignment is preferred over perfect engine reconstruction.

When analyzing visual-record lifecycle helpers:
- treat them as evidence for how objects/facilities are composed and changed,
- do not over-prioritize full runtime state simulation,
- for `FUN_028b3358`, ask the practical question: does this help render static facilities correctly for planning?
- if the answer is mostly lifecycle-only, document it and move on.

## Current Curated Discoveries

### Ghidra MCP Bridge Connectivity Snapshot (2026-05-20)

Source:
- Terminal runtime observation from local PowerShell process query.

Evidence:
- Bridge process is active:
  - ProcessId: 14000
  - Name: py.exe
  - CommandLine: py -3.12 C:\GhydraMCP\bridge_mcp_hydra.py

Confidence:
- High (direct runtime process inspection).

Practical meaning:
- Ghidra MCP bridge is live and available for focused pull tasks.

Related path-normalization note:
- Input `C:///////////////////////////////////////////////////////////////////////////////////////////` normalizes to `C:\` on Windows.

### Disputed PlaceChip Chain - Canonical Evidence Table (2026-05-20)

Purpose:
- Resolve conflicting interpretations around `FUN_01504134` and enforce newest-vetted canonical status.

| Source | Evidence type | Confidence | Related function/address | Finding | Next action |
|---|---|---|---|---|---|
| `Reverse engineering/exports/active/FUN_01504134_01504134.c` | Direct decompiled function body | High | `FUN_01504134 @ 0x15042E0` | Dispatcher behavior: branch to `FUN_02053924` and `FUN_02053a20`, fallback to `FUN_020cac40`; no direct coordinate formula exposed in this body. | Treat as router-level evidence only; avoid claiming final placement math ownership from this function alone. |
| `Reverse engineering/exports/active/FUN_02053924_02053924.c` | Direct decompiled function body | High | `FUN_02053924 @ 0x2053924` | Thin wrapper: one-time init then call to `FUN_020cbda4(param_1,0)`. | Do not classify as gameplay placement logic without deeper callee proof. |
| `Reverse engineering/exports/active/FUN_02053a20_02053a20.c` | Direct decompiled function body | High | `FUN_02053a20 @ 0x2053a20` | Thin wrapper: one-time init then call to `FUN_020cbda4(param_1,0)`. | Same handling as `FUN_02053924`; wrapper-level only. |
| `Reverse engineering/exports/active/FUN_0208e2a4_0208e2a4.c` | Direct decompiled function body | High | `FUN_0208e2a4 @ 0x208e2a4` | Validation/lookup-resolver shape (`FUN_020cc7a8`, `FUN_009b4c10`, `FUN_00a23e84`), not explicit coordinate computation. | Keep in resolver/system layer until a downstream gameplay consumer is proven. |
| `docs/phase2-11a-native-map-placement-export-evaluation.md` (correction block) | Curated cross-check note | Medium | `FUN_020cbda4` | `FUN_020cbda4` documented as no-op stub in this analysis pass. | Re-verify only if newer vetted MCP evidence contradicts no-op status. |
| `Reverse engineering/exports/active/mapchip-cost-validation/quick_validation_report.md` | Canonical validation report | High | Disputed `FUN_01504134` chain + `0x02B` records | Current canonical interpretation: chain appears runtime/system metadata-oriented for this question; stop treating it as primary world-builder anchor. | Use this as governing interpretation until newer vetted evidence reopens the chain. |

Canonical resolution:
- Current canonical status: disputed `FUN_01504134` identity/ownership claims are downgraded for world-builder anchor purposes.
- Continue using this chain only as router/context evidence, not as confirmed placement-rule ownership.

### Gameplay-Only Target Queue (2026-05-20)

Goal:
- Keep analysis on gameplay-visible map/facility behavior and avoid drifting into generic runtime wrappers.

Evidence-backed gameplay anchors (current pass):

| Source | Evidence type | Confidence | Related function/address | Gameplay meaning | Next action |
|---|---|---|---|---|---|
| `Reverse engineering/exports/active/FUN_015b173c_015b173c.c` | Direct decompiled function body | High | `FUN_015b173c @ 0x15B173C` | List/build pass that appends map-related entries through `FUN_0136bd98` and writes staged values into output array slots. | Trace output consumer to identify exact chip/category semantics per written value. |
| `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1e34_015b1e34.c` | Direct decompiled function body | High | `FUN_015b1e34 @ 0x15B1E34` | Port placement assembly variant; same list/output pattern with `FUN_0136f194` producer. | Compare producer outputs against known port tiles to map field meaning. |
| `Reverse engineering/exports/active/map-placement-helpers/FUN_015b252c_015b252c.c` | Direct decompiled function body | High | `FUN_015b252c @ 0x15B252C` | Water-edge assembly path using `FUN_013725a0`, iterating records and emitting output entries. | Decode emitted record tuple to isolate edge piece IDs and ordering rules. |
| `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2724_015b2724.c` | Direct decompiled function body | Medium-High | `FUN_015b2724 @ 0x15B2724` | Side-piece helper invokes `FUN_01452580` and commits through `thunk_FUN_00a22200`; likely gameplay-side side-edge finalization. | Pull `FUN_01452580` and immediate callers to recover side-piece selection criteria. |
| `Reverse engineering/exports/active/map-placement-helpers/FUN_015b27cc_015b27cc.c` | Direct decompiled function body | High | `FUN_015b27cc @ 0x15B27CC` | Corner/edge validation-and-emit path: checks list state, resolves objects, branches into `FUN_015b252c`, and writes resulting entries. | Decode branch conditions and lookup object roles to map corner placement constraints. |

Gameplay targeting rule for next passes:
- Prioritize `0x15B17xx` to `0x15B27xx` MapSystem family and direct helpers first.
- Treat resolver/equality/init wrappers as secondary unless they expose direct mapchip/footprint fields.
- Promote only evidence that changes visible builder behavior (footprint, anchor, tile IDs, layering, water-edge composition).

### Gameplay Breakthrough: 15B Map Piece Emitter Pattern (2026-05-20)

Source evidence (direct bodies):
- `Reverse engineering/exports/active/FUN_015b173c_015b173c.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1e34_015b1e34.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b252c_015b252c.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b19d8_015b19d8.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b20d0_015b20d0.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b27cc_015b27cc.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_02099764_02099764.c`

Confirmed behavior:
- `015B173C`, `015B1E34`, and `015B252C` are gameplay emitters that append map-piece IDs into an output list (`param_2 + 0x10 + index*4`).
- Emission is filtered by record validity: only records with non-negative marker at record offset `+0x10` are emitted; emitted value comes from record offset `+0x18`.
- Capacity checks are explicit and gameplay-facing: remaining output capacity must satisfy a required count before emission.
- `FUN_0136bd98`, `FUN_0136f194`, `FUN_013725a0` are count primitives, all resolving to the same span formula:
  - `requiredCount = *(src + 0x10) - *(src + 0x18)`
- Wrapper validators `015B19D8`, `015B20D0`, `015B27CC` enforce shape rules on input containers (`thunk_FUN_00a3d458 == 1`, `thunk_FUN_00a3d410 == 0`) and output bounds.
- `FUN_02099764` computes source cardinality as product of dimensions (`d0 * d1 * ...`), then wrappers compare it against the current write index (`param_3`).
- Fast path: when a context-specific mapping object exists (`thunk_FUN_00a224a4(param_2, contextKey)`), wrappers call the direct emitter (`015B173C` / `015B1E34` / `015B252C`).
- Fallback path: wrappers remap each candidate ID through `thunk_FUN_00a22200(context + 0x20, &id)` and append remapped IDs into a validated target container.

Practical gameplay meaning:
- This is a concrete map assembly pipeline for gameplay pieces (base chips/port/water-edge family), not a purely system metadata chain.
- It provides a directly usable builder rule: generate candidate piece IDs from source records, filter invalid entries, optionally remap through context map, then append compactly into output list.
- Water-edge/port composition likely differs by which emitter (`015B252C` vs `015B1E34` etc.) is selected, while write/validation mechanics stay consistent.

Confidence:
- High for emitter/filter/capacity/remap mechanics (direct code evidence).
- Medium for exact semantic labels of each emitted ID (needs final mapping against visible tiles/assets).

Next smallest useful action:
- Correlate emitted IDs from this pipeline with `MapChip.csv`/rendered water-edge variants to bind each emitter family to visible piece categories.

### Gameplay Correlation Pass: Revisited Wrapper Family (2026-05-20)

Source evidence (revisited):
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b16e8_015b16e8.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1718_015b1718.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b19d8_015b19d8.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b20d0_015b20d0.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2508_015b2508.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b252c_015b252c.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b27cc_015b27cc.c`
- `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2c04_015b2c04.c`
- `Reverse engineering/exports/active/mapchip-placement-anchor/mapchip_related_placement_model.csv`
- `data/sheet-research/raw-copies/KA GameData - MapChip.csv`

Confirmed delta:
- `015B16E8` is an init/attach wrapper (`FUN_020cbda4`, then store source pointer), not a selector itself.
- `015B1718`, `015B2508`, and `015B2C04` are adapter wrappers that package a small tuple and call deeper kernels (`FUN_014512f8`, `FUN_01452580`, `FUN_01452e38`) before commit.
- `015B19D8`, `015B20D0`, and `015B27CC` remain the decision-bearing wrappers for emission/remap behavior.

MapChip-family correlation candidates (evidence-linked):
- Port family candidate set: IDs `67-70` (`Port`) with linked wharf/water-side pieces (`66`, plus water IDs `2-3` in grouped model evidence).
- Bridge/water-edge candidate set: IDs `35`, `36`, and `192` (`Bridge`/`Log Bridge`) from grouped placement model and MapChip names.
- These sets are consistent with prior labels (`PlacePort` / `AddWaterEdge`) and with the shared remap+emit mechanics observed in `015B20D0` and `015B27CC` paths.

Current blocker for full semantic lock:
- The selector kernels `FUN_014512f8` and `FUN_01452e38` are referenced by wrappers but are not present in current active exports, so we cannot yet prove exact per-emitter ID generation rules from direct function bodies.

Confidence:
- High for wrapper role partition (init vs adapter vs decision/emitter).
- Medium for exact emitter-to-chip-set binding until `FUN_014512f8` / `FUN_01452e38` are exported and decoded.

Next smallest useful action:
- Export and decode `FUN_014512f8` and `FUN_01452e38`, then bind each of (`015B173C`, `015B1E34`, `015B252C`) to explicit MapChip ID sets with no hypothesis label.

### Broad Export Validation Pass (No-Analysis Mode) (2026-05-20)

Purpose:
- Complete a less-surgical export pass while preventing analyzer-crash noise from polluting gameplay conclusions.

Source evidence:
- Headless runs against project `KAHeadlessNoAnal` with `-noanalysis`:
  - `ExportMapPlacementSelectorObjects.java`
  - `ExportMapPlacementSemanticPatterns.java`
- Updated artifacts:
  - `Reverse engineering/exports/active/map-placement-selector-objects/seed_resolution.tsv`
  - `Reverse engineering/exports/active/map-placement-semantic-patterns/semantic_patterns.tsv`
  - `Reverse engineering/exports/active/map-placement-semantic-patterns/semantic_candidate_enums.tsv`

Confirmed findings:
- Selector-object pass (`0x02A08B18`, `0x02A08B6C`) resolved as in-memory data addresses with no instruction/function ownership at target addresses.
- Semantic-pattern pass resolved all configured 02B/validated roots as data records and completed writes for pattern/group/enum/bitmask/transition outputs.
- Repeating enum-like values in semantic tables include stable IDs such as `0x648` and grouped `0x8008xxxx` families, supporting structured-data interpretation rather than direct code-path ownership.

System vs gameplay separation outcome:
- `map-placement-selector-objects` outputs currently behave as descriptor/data-node evidence, not direct gameplay logic functions.
- `map-placement-semantic-patterns` outputs are useful gameplay-adjacent data evidence (record semantics and ID families), but still require code-path cross-linking before claiming final placement rules.

Confidence:
- High for export execution status and artifact content.
- Medium-High for data-layer interpretation; medium for direct gameplay-rule mapping until linked to emitter call sites.

Next smallest useful action:
- Crosswalk `semantic_patterns.tsv` value families (`0x648`, `0x8008xxxx`, `0x8011xxxx`) against `MapChip.csv` and the 15B emitter outputs to classify which IDs are gameplay placement categories versus generic descriptor scaffolding.

### Facility Composition Crosswalk (Port, Town Hall, Storehouse)

Source evidence:
- `data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv`
- `data/sheet-research/raw-copies/KA GameData - Facility.csv`
- `data/sheet-research/raw-copies/KA GameData - MapChip.csv`

Method:
- Treated `Facility_lookup.csv` as canonical named mapping.
- Used `combinatoin`, `parentChipId`, and `chips[]` from facility rows to determine declared multi-part composition.
- Resolved each chip id against `MapChip.csv` (`id -> relatedDataId -> facility id`) to verify actual part identity.

Confirmed mappings:
- Port root facility id `7` (`Port`) declares `combinatoin=2`, `parentChipId=67`, `chips=[68,69,70]`.
  - This is a 4-part declared composition in data: one parent chip + three child chips.
  - MapChip `67-70` each resolve to Port facilities (`relatedDataId 7,8,9,10`).
- Town Hall root facility id `17` (`Town Hall`) declares `combinatoin=1`, `parentChipId=58`, `chips=[59,60]`.
  - This is a 3-part declared composition in data: one parent chip + two child chips.
  - MapChip `58-60` resolve to Town Hall facilities (`relatedDataId 17,18,19`).
- Storehouse family (`33-40`, names `Storehouse (...)`) does not declare multi-part chip composition (`combinatoin=0` rows).
  - MapChip `84-91` are one-to-one entries back to storehouse facility ids (`relatedDataId 33-40`).
  - No declared `chips[]` expansion for these core storehouse variants.

Confidence:
- High for declared composition contract (Facility/MapChip data is explicit and internally consistent).
- Medium for any additional runtime-only visuals not represented in `chips[]` declarations (would require live spawn tracing or deeper renderer payload logging).

Next smallest useful action:
- Bind 15B emitter outputs to these exact chip ids (`58-60`, `67-70`, `84-91`) to verify whether any runtime extra parts are injected beyond declared composition.

### SEB/Public Entrypoint Boundary Pass

Source export folder:
- `Reverse engineering/exports/seb-render-functions`

Permanent docs:
- `docs/native-render-transform-analysis.md`
- `docs/seb-draw-transform-rule.md`
- `docs/SEB_SEMANTICS_FINAL_REPORT.md`

Findings:
- `dump.cs` public method RVA/VA addresses do not correspond to clean Ghidra function starts in the current analyzed program.
- `0x013EB4C8` lands inside `FUN_013eb4c0 @ 013eb4c0`.
- `0x013EB3D4` lands inside `FUN_013eb2ac @ 013eb2ac`.
- `0x013EBC0C`, `0x013EBED8`, and `0x013EBF90` land inside `FUN_013ebb5c @ 013ebb5c`.
- `0x013EC2B8` lands inside `FUN_013ec0d0 @ 013ec0d0`.
- `dump.cs` Offset target `0x013E73D4` was initially not in a containing function, then a forced disassembly pass identified it as a tiny thunk:

```asm
013e73d4: b 0x013e73dc
```

Interpretation:
- Current public-entrypoint investigation is blocked by address-space/function-boundary uncertainty, not by absence of helper exports.
- The next export should target entrypoint boundary correction or caller/callee context around the actual containing functions, not another broad dump.

### Offset-Side SEB Mirror Cluster

Source files:
- `Reverse engineering/exports/seb-render-functions/FUN_013e7e70_013e7e70.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013e80d0_013e80d0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ec0d0_013ec0d0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013e850c_013e850c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013e7c5c_013e7c5c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_015c381c_015c381c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013e6ed0_013e6ed0.c`

Findings:
- `FUN_013e7e70` mirrors the orchestration shape of `FUN_013eb4c0`.
  - It writes base draw count/payload via `FUN_01f46848`.
  - It emits a primary object via `FUN_01f530c4`.
  - When `param_1 + 0x08` is non-null, it indexes context offset `+0xb8` with `(*(param_1+0x10) - *(param_1+0x18))`.
  - It then calls `FUN_013e7c5c` and emits the selected array/object via `FUN_01f530c4`.
- `FUN_013e7c5c` mirrors the triple-emitter shape of `FUN_013eb2ac`.
  - It reads staged record fields at record positions equivalent to payload 1/2/3.
  - It packs them through `FUN_015c381c`.
  - It writes the packed triple to an output array with 0x0c stride.
- `FUN_015c381c` is a pure 3-value packer:

```c
out[0] = a;
out[1] = b;
out[2] = c;
```

- `FUN_013e850c` mirrors the staged insert/update shape of `FUN_013ebb5c`.
  - It increments manager offset `+0x1c`.
  - It writes the staged record key at `+0x10`.
  - It writes linkage at `+0x14`.
  - It writes payload fields at `+0x18`, `+0x1c`, and `+0x20`.
- `FUN_013e80d0` is a keyed staged-record lookup/matcher.
  - It hashes or resolves a key, scans bucket/chain entries, compares payload fields, and returns a matched staged-record index or sentinel.
- Available `FUN_013e80d0` callers in the current slice are staging lookup wrappers, not public draw entrypoints:
  - `FUN_013e77b8` returns staged `+0x20` for a matched key, or records a miss.
  - `FUN_013e78ec` tests staged `+0x20` against another value through a comparator.
  - `FUN_013e79a0` conditionally calls `FUN_013e9100` after a successful `+0x20` comparison.
  - `FUN_013e94cc` writes staged `+0x20` to an output pointer and returns success/failure.
  - `FUN_013e9b44` obtains a two-value key from an object and returns staged `+0x20` on match.
  - `FUN_013ea27c` obtains a two-value key from an object and returns only match presence.
- `FUN_013ec0d0` is a setup/population path that resolves render-related collections from a local payload, initializes the manager, and inserts triples through `FUN_013ebb5c`.

Interpretation:
- There are at least two highly similar SEB staging/orchestration families in the exports: an `013e...` family and an `013eb.../013ec...` family.
- The staged record layout is reinforced across both families.
- The staged `+0x20` field is retrievable and testable through lookup helpers, so it is an auxiliary payload with identity beyond transient packing.
- The final semantic names of the triple fields are still not closed. Current evidence names them only as payload fields, not as x/y/layer/frame/anchor.
- The public method addresses from `dump.cs` are still unreliable as direct Ghidra function starts. Future work should compare call sites and metadata references to determine which family corresponds to the public `ResourceManagerExtension` methods.

### Caller-Correlation Pass

Source file:
- `Reverse engineering/exports/seb-render-functions/caller-correlation-report.md`

Findings:
- Top-level producer/orchestrator/setup functions do not have normal code callers in Ghidra:
  - `FUN_013e6ed0`: `getCallingFunctions count: 0`
  - `FUN_013e7e70`: `getCallingFunctions count: 0`
  - `FUN_013ea520`: `getCallingFunctions count: 0`
  - `FUN_013eb4c0`: `getCallingFunctions count: 0`
  - `FUN_013ec0d0`: `getCallingFunctions count: 0`
  - `FUN_013ecbd0`: `getCallingFunctions count: 0`
- Those same functions do have DATA references around `0x02a289xx` and `0x02a28axx`:
  - `FUN_013e6ed0` entry referenced from `0x02a28934`
  - `FUN_013e7e70` entry referenced from `0x02a2895c`
  - `FUN_013ea520` entry referenced from `0x02a28a08`
  - `FUN_013eb4c0` entry referenced from `0x02a28a30`
  - `FUN_013ec0d0` entry referenced from `0x02a28a3c`
  - `FUN_013ecbd0` entry referenced from `0x02a28a74`
- Internal lookup/insert helpers do have normal code callers:
  - `FUN_013e80d0`: 7 code callers.
  - `FUN_013e850c`: 8 code callers.
  - `FUN_013eb720`: 7 code callers.
  - `FUN_013ebb5c`: 8 code callers.
- Exact public RVA/VA targets generally have no exact-address references.
- Exact Offset targets generally have no exact-address references, except conditional jumps inside existing helper bodies.

Interpretation:
- Current evidence suggests top-level SEB functions may be reached through IL2CPP metadata/delegate/function-pointer tables rather than direct code calls.
- The next surgical export should dump and decode the data region around `0x02a28900..0x02a28b00`, resolving each pointer-sized entry to a function name/address where possible.
- This is missing code/data linkage, not missing interpretation of the staged helpers.

### Map Construction Chain Pass: Dispatch vs Selector Layer

Scope:
- Continue strict separation between static CSV truth and runtime consumer truth.
- Target the unresolved chain:
  - `CSV ids/flags -> dispatch/routing -> wrapper selection -> selector kernel -> emitted ids -> final remap result`

Source evidence:
- Static inputs:
  - `data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv`
  - `data/sheet-research/raw-copies/KA GameData - MapChip.csv`
- Runtime wrappers/emitters/adapters:
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b19d8_015b19d8.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b20d0_015b20d0.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b27cc_015b27cc.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2ec4_015b2ec4.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b173c_015b173c.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1e34_015b1e34.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b252c_015b252c.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2c28_015b2c28.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1718_015b1718.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2508_015b2508.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2c04_015b2c04.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1930_015b1930.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b1984_015b1984.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2e1c_015b2e1c.c`
  - `Reverse engineering/exports/active/map-placement-helpers/FUN_015b2e70_015b2e70.c`

Confirmed runtime partition (RUNTIME FACT):
- The `015B19D8 / 015B20D0 / 015B27CC / 015B2EC4` family is orchestration:
  - input/container checks (`thunk_FUN_00a3d458`, `thunk_FUN_00a3d410`, `FUN_02099764`),
  - capacity checks (`FUN_0136bd98`, `FUN_0136f194`, `FUN_013725a0`, `FUN_01375d8c`),
  - direct/fallback remap write path (`thunk_FUN_00a224a4`, `thunk_FUN_00a22200`),
  - final list append.
- Emission write is explicit plumbing at `param_2 + 0x10 + index*4` across emitters:
  - `015B173C`, `015B1E34`, `015B252C`, `015B2C28`.

Confirmed selector-adapter layer (RUNTIME FACT):
- `FUN_014512f8` is invoked by adapter wrappers:
  - `015B1718`, `015B1930`, `015B1984`.
- `FUN_01452e38` is invoked by adapter wrappers:
  - `015B2C04`, `015B2E1C`, `015B2E70`.
- `FUN_01452580` is present and small (tuple shaping), called by `015B2508`.

Important correction (RUNTIME FACT):
- `01452E38` is not currently provable as water-only selector logic.
- It is reused in both `015B2C04` and `015B2E1C/015B2E70` paths, so current labeling must remain generic until bodies and caller routing are decoded.

Static-to-runtime linkage state:
- STATIC FACT:
  - Port root `id=7` declares composite `parentChipId=67`, `chips=[68,69,70]`.
  - Town Hall root `id=17` declares composite `parentChipId=58`, `chips=[59,60]`.
  - Wall/Gate chips include flags like `Straight Select`, `Wall Place`, `Overridable` in `MapChip.csv`.
- LINKED FACT:
  - Runtime has multi-record emission/remap pipelines compatible with CSV composite/grouped data.
  - Runtime has branchable selector adapters (`014512f8`/`01452e38`) that sit before output append.
- INFERENCE (still unresolved):
  - Exact dispatch rule from CSV ids/flags -> selected wrapper (`015B19D8` vs `015B20D0` vs `015B27CC` vs `015B2EC4` vs other sibling families).
  - Exact selector internals for neighbor analysis, orientation, cornering, gate attachment, and transition choice inside `014512f8` and `01452e38`.
  - Exact replacement precedence order during remap conflict resolution.

Surgical export requests (next smallest useful action):
- 1) XREF caller extraction for wrapper selection:
  - `FUN_015b19d8`, `FUN_015b20d0`, `FUN_015b27cc`, `FUN_015b2ec4`.
  - Goal: prove dispatch/routing entry criteria.
- 2) Function body exports for selector kernels:
  - `FUN_014512f8`, `FUN_01452e38`.
  - Goal: decode adjacency/orientation/corner/transition choice logic.
- 3) Dispatch-struct decode around wrapper context reads:
  - fields under `*(param_4 + 0x10) -> +0x60` consumed at offsets `+0x0c`, `+0x14`, `+0x20`, `+0x2c`.
  - Goal: bind CSV-derived ids/flags to runtime route selection.
- 4) Remap helper deep decode:
  - callers/callees of `thunk_FUN_00a22200` and `thunk_FUN_00a224a4` in placement paths.
  - Goal: prove replacement/remap precedence and correction order.

Confidence:
- High for wrapper/emitter/orchestration-vs-selector partition.
- Medium for selector-role labeling (`014512f8` vs `01452e38`) until bodies are exported.
- Low for final per-system behavior claims (Port, Wall/Gate, Water-edge) until dispatch and selector internals are decoded.

### Render Function Table Pass

Map/builder meaning:
- We found what appears to be one of the game's internal directories for map/sprite drawing helpers.
- This matters because the builder needs to know which game routines work together to:
  - choose the sprite/object to draw,
  - find stored render information for that object,
  - submit it to the draw pipeline,
  - and preserve draw order/layering information.
- This moves us closer to accurate layering and facility/object rendering, but it still does not give the final screen-position/camera formula.

Source file:
- `Reverse engineering/exports/seb-render-functions/data-table-correlation-report.md`

Findings:
- The pointer table starting at `0x02A28900` resolved to a dense list of render/staging functions.
- It contains the offset-side family:
  - `0x02a28934 -> FUN_013e6ed0`
  - `0x02a28954 -> FUN_013e80d0`
  - `0x02a2895c -> FUN_013e7e70`
  - `0x02a289e0 -> FUN_013e850c`
- It also contains the rva-side family:
  - `0x02a28a08 -> FUN_013ea520`
  - `0x02a28a24 -> FUN_013eb2ac`
  - `0x02a28a28 -> FUN_013eb720`
  - `0x02a28a30 -> FUN_013eb4c0`
  - `0x02a28a3c -> FUN_013ec0d0`
  - `0x02a28a74 -> FUN_013ecbd0`
  - `0x02a28ab4 -> FUN_013ebb5c`

Interpretation:
- The previous DATA references are confirmed as entries inside a contiguous function-pointer table.
- This reinforces that the top-level render helpers are likely invoked by table dispatch rather than direct code calls.
- Next useful step: group the table into method-sized clusters and correlate cluster positions with `script.json`/`dump.cs` method order, so we can identify which cluster maps to `ResourceManagerExtension.DrawSebEx`, `DrawSebImg`, and `DrawScaledSeb`.

### Step 5: Render Table to Public Draw Method Mapping

Map/builder meaning:
- We are trying to label the game's internal draw helpers with practical names like "draw one sprite image", "draw a scaled sprite", and "draw a repeated sprite strip".
- This affects future world-builder accuracy because named helpers tell us which path controls:
  - sprite/image choice,
  - frame selection,
  - scale,
  - anchor/pivot behavior,
  - draw layer,
  - and whether an object is drawn once, repeated, or with multiple image ids.
- This moves us closer to accurate object and facility rendering. It does not yet solve the final terrain-to-screen position or camera feel.

Sources:
- `tools/asset_extractor/il2cpp_dump/script.json`
- `tools/asset_extractor/il2cpp_dump/dump.cs`
- `Reverse engineering/exports/seb-render-functions/data-table-correlation-report.md`

Useful public method addresses from `ResourceManagerExtension`:
- `DrawSebEx`: `0x013EB3D4`
- `DrawSebImg` single image: `0x013EB4C8`
- `DrawSebImg` int array: `0x013EBC0C`
- `DrawScaledSeb` simple: `0x013EBED8`
- `DrawScaledSeb` full: `0x013EBF90`
- `DrawScaledSeb` frame overload: `0x013EC2B8`
- `DrawSebRepeatHorizontal`: `0x013ED0E0`

Correlation found:
- `DrawSebImg` single image at `0x013EB4C8` lands inside `FUN_013eb4c0`, and that function appears in the render table at `0x02a28a30`.
- `DrawScaledSeb` frame overload at `0x013EC2B8` lands inside `FUN_013ec0d0`, and that function appears in the render table at `0x02a28a3c`.
- `DrawSebEx` at `0x013EB3D4` lands inside `FUN_013eb2ac`, and that function appears in the render table at `0x02a28a24`.
- `DrawSebImg` int array, `DrawScaledSeb` simple, and `DrawScaledSeb` full land inside `FUN_013ebb5c`, and that function appears in the render table at `0x02a28ab4`.
- `DrawSebRepeatHorizontal` has a direct public address match to `0x013ED0E0`, and that address appears in the table at `0x02a28a7c`.

Interpretation:
- The render table is definitely useful for locating map/object drawing code.
- The table is not a clean one-row-per-public-method list yet. Several public method addresses land inside larger Ghidra functions, and several public methods overlap the same containing function.
- Treat this as a partial label map:
  - high confidence that `FUN_013eb4c0` belongs to the single-image draw path,
  - high confidence that `FUN_013ec0d0` belongs to a scaled draw/setup path,
  - medium confidence that `FUN_013eb2ac` is near or inside `DrawSebEx`,
  - medium confidence that `FUN_013ebb5c` is a shared staging/helper body used by several draw overloads.
- Missing evidence is still entrypoint separation: Ghidra may be grouping several real game draw methods into broader decompiler functions.

### Step 6: Current Draw-Path Meaning Pass

Map/builder meaning:
- The current exports show how the game stores sprite/object draw requests, updates duplicate draw records, and submits prepared records to the graphics pipeline.
- This is most useful for future facility rendering and object layering:
  - repeated building pieces or UI strips may be stored as multiple records,
  - the same sprite key can update an existing record instead of creating a duplicate,
  - one draw path gathers stored records and emits them as compact triples,
  - another draw path submits the main sprite/object and optional extra draw data.
- This does not yet solve terrain placement, camera angle, zoom behavior, or exact tile-to-screen coordinates.

Source files:
- `Reverse engineering/exports/seb-render-functions/FUN_013ec0d0_013ec0d0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eb4c0_013eb4c0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ebb5c_013ebb5c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eb2ac_013eb2ac.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eba88_013eba88.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ec540_013ec540.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ecbd0_013ecbd0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ed0e0_013ed0e0.c`

Findings:
- `FUN_013ec0d0` prepares a draw container from a source object, records a primary draw reference at `param_1 + 0x20`, initializes list storage through `FUN_013eba88`, then loops through triples and inserts them through `FUN_013ebb5c`.
- `FUN_013eb4c0` submits the prepared draw data to the graphics-like object:
  - writes one count/value from `param_1 + 0x1c`,
  - submits a primary object/reference through `FUN_01f530c4`,
  - if extra stored records exist at `param_1 + 0x08`, it emits those records through `FUN_013eb2ac` and submits the selected array/object through `FUN_01f530c4`.
- `FUN_013ebb5c` is the draw-record insert/update manager:
  - increments `param_1 + 0x1c`,
  - initializes record storage if needed,
  - computes a key from the incoming pair,
  - searches an existing bucket/chain,
  - inserts a new record or updates the `+0x20` payload when mode `param_5 == 1`,
  - rejects or reports duplicate/invalid records when mode `param_5 == 2`.
- `FUN_013eb2ac` exports stored records into a compact array of 3-value entries using `FUN_015c38c0`.
- `FUN_013eba88` initializes two backing arrays/lists for the draw-record manager and resets the active link/index.
- `FUN_013ec540` rebuilds or grows the backing record arrays when the active record count reaches capacity, preserving per-bucket links.
- `FUN_013ecbd0` is a flexible exporter for the same stored draw records:
  - if the output object supports the expected 3-value collection, it delegates to `FUN_013eb2ac`,
  - otherwise it can convert records into alternate 2-value or object-list shapes.
- `FUN_013ed0e0` is not proven to be the body of repeat-horizontal drawing. The current decompile only shows lazy initialization/cache retrieval of an object at `param_1 + 0x2c`.

Short pseudocode evidence:

```c
// FUN_013ebb5c record payload layout
record[+0x10] = computed_key;
record[+0x14] = previous_link;
record[+0x18] = param_2;
record[+0x1c] = param_3;
record[+0x20] = param_4;
```

Interpretation:
- We can now treat the draw system as a record manager plus a submission path, not as a single direct "draw sprite now" function.
- The record payload fields are still not safely named as x/y/layer/frame. They are confirmed as a 3-value visual payload used by draw/export paths.
- Current evidence moves us closer to accurate layering and facility/object assembly, because we can see how multiple sprite pieces are stored and later emitted.
- Missing evidence remains the public argument boundary and caller-side parameter meaning: we need to know where map/facility code fills `param_2`, `param_3`, `param_4`, and mode `param_5`.

### Step 7: Draw-Record Payload Caller Pass

Map/builder meaning:
- We traced who fills the stored visual records.
- The current evidence is enough to say the first two payload fields work together as the lookup/matching pair for a visual record.
- The third payload field is the stored value/reference returned later by lookup helpers.
- This helps object/facility composition because it shows how the game prevents duplicate visual pieces and how it updates an existing piece's attached draw value.
- This still does not prove whether the first two fields are x/y, frame/image, tile coordinates, or another sprite key pair.

Source files:
- `Reverse engineering/exports/seb-render-functions/FUN_013ea520_013ea520.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ec0d0_013ec0d0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ed26c_013ed26c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ed5cc_013ed5cc.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eb720_013eb720.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eae08_013eae08.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ecb14_013ecb14.c`

Findings:
- `FUN_013ed26c` calls `FUN_013ebb5c` with:
  - payload 1 from `thunk_FUN_00a2274c(param_2)[0]`
  - payload 2 from `thunk_FUN_00a2274c(param_2)[1]`
  - payload 3 from a lookup on `param_3`
  - mode `1`, which updates an existing record's `+0x20` stored value when a matching pair exists.
- `FUN_013ed5cc` uses the same payload source pattern, but calls `FUN_013ebb5c` with mode `2`, which rejects/reports duplicate matching records instead of updating them.
- `FUN_013ea520` and `FUN_013ec0d0` both insert multiple records by looping through existing 3-value entries and passing them into `FUN_013ebb5c` with mode `2`.
- `FUN_013eb720` is the matching/lookup partner for `FUN_013ebb5c`:
  - it searches records using the same first-two-field pair,
  - compares candidate records against incoming pair values,
  - and returns the matching record index or sentinel.
- `FUN_013eae08` and `FUN_013ecb14` retrieve stored `record + 0x20` for a matching first-two-field pair.

Short pseudocode evidence:

```c
// Mode 1 caller shape from FUN_013ed26c
pair = thunk_FUN_00a2274c(source_object);
stored_value = lookup_optional_reference(param_3);
FUN_013ebb5c(manager, pair[0], pair[1], stored_value, 1, context);
```

Interpretation:
- Rename the confirmed roles cautiously:
  - payload 1 and payload 2: `record_match_pair`
  - payload 3: `stored_draw_value`
- Do not rename the pair as x/y yet.
- Missing code: upstream callers of `FUN_013ed26c`, `FUN_013ed5cc`, `FUN_013ea520`, `FUN_013ec0d0`, and the tiny table wrapper entries are needed to connect the pair to public draw parameters or facility/map objects.
- Next export should be surgical caller-context extraction around those addresses, not a broad export.

### Step 8: Draw-Record Lookup/Test/Removal Pass

Map/builder meaning:
- The stored visual-record system can now be described as more than "store pieces and submit them."
- It also supports:
  - checking whether a visual piece exists,
  - reading the stored value attached to that piece,
  - comparing that stored value against another value,
  - and removing/clearing an existing visual piece.
- This matters for facility/world-builder work because facilities may have pieces that appear, update, or disappear based on state. The current evidence shows the game has a record manager capable of those state changes.
- This still does not prove whether the record match pair is tile x/y, image/frame, or another visual key.

Source files:
- `Reverse engineering/exports/seb-render-functions/FUN_013ed18c_013ed18c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ed8c4_013ed8c4.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ed9f8_013ed9f8.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ed564_013ed564.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eaf3c_013eaf3c.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013eaff0_013eaff0.c`
- `Reverse engineering/exports/seb-render-functions/FUN_013ec750_013ec750.c`
- `Reverse engineering/exports/seb-render-functions/data-table-correlation-report.md`
- `Reverse engineering/exports/seb-render-functions/caller-correlation-report.md`

Findings:
- `FUN_013ed18c` validates that an input object has the expected record-pair shape, extracts the same two-value pair with `thunk_FUN_00a2274c`, looks it up through `FUN_013eb720`, and returns stored `record + 0x20`.
- `FUN_013ed8c4` validates the same pair shape and returns whether the matching visual record exists.
- `FUN_013ed9f8` validates the same pair shape and removes/clears the matching visual record through `FUN_013ec750`.
- `FUN_013eaf3c` looks up a match pair and compares the stored `+0x20` value with another argument.
- `FUN_013eaff0` performs that comparison and, when it matches, calls `FUN_013ec750` to remove/clear the record.
- `FUN_013ec750` is the record removal/clear path:
  - finds a matching record using the same pair comparison,
  - unlinks it from its bucket/chain,
  - clears `record + 0x20`,
  - marks `record + 0x10` as `0xffffffff`,
  - moves the record into the free-list through manager offsets `+0x14` and `+0x18`,
  - and increments `param_1 + 0x1c`.
- `FUN_013ed564` confirms the input object contains the expected pair-shaped field before lookup/update/remove helpers use it.
- `caller-correlation-report.md` found `FUN_028b3358` as a caller of `FUN_013ecb14` and `FUN_013eaed0`, but it was not exported because low-address helper expansion filled the 900-file cap first.

Interpretation:
- Cautious names remain:
  - payload 1 and payload 2: `record_match_pair`
  - payload 3 / `record + 0x20`: `stored_draw_value`
- Stronger confirmed behavior:
  - mode `1` updates stored value,
  - mode `2` inserts/rejects duplicates,
  - lookup helpers retrieve/test stored value,
  - removal helpers clear/unlink records.
- Missing code:
  - `FUN_028b3358` is the next key upstream dispatcher/caller needed to connect these helpers to public draw methods or actual game object/facility state.
- Script action taken:
  - `tools/asset_extractor/ghidra_scripts/BulkExportSebRender.java` now seeds `0x028B3358` and prioritizes high-value target functions before export truncation.

Land-state/spawn watch result:
- No wasteland, land-reclamation, terrain-state, or monster-spawn code was naturally encountered in this render-focused export pass.

### Step 9: Visual-Record Caller Relevance Check

Map/builder meaning:
- `FUN_028b3358` does not appear to help us draw static facilities, place buildings, calculate footprints, set entrances, align objects to terrain, or reproduce camera/layering.
- Instead, it shows that the same visual-record helper pattern can be used by unrelated runtime storage/cache code.
- For the world builder, this is a useful stop sign: do not spend more time on this path unless a later facility/map caller points back to it.
- This keeps the investigation focused on static facility composition and placement correctness, not full game-engine lifecycle simulation.

Source files:
- `Reverse engineering/exports/seb-render-functions/FUN_028b3358_028b3358.c`
- `Reverse engineering/exports/seb-render-functions/disasm_window_028b3358.asm`
- `Reverse engineering/exports/seb-render-functions/caller-correlation-report.md`
- `tools/asset_extractor/il2cpp_dump/script.json`

Findings:
- Metadata maps the surrounding method group to `System.Data.Common.Int32Storage`, including `Int32Storage$$Copy`, `Int32Storage$$Get`, `Int32Storage$$Set`, and `Int32Storage$$SetCapacity`.
- `FUN_028b3358` is the native body for the exported Ghidra address `0x028b3358`; metadata lists the matching method area as `System.Data.Common.Int32Storage$$Get` at the corresponding dump address.
- The function checks a cache-like record with `FUN_013ecb14`.
- If the record is not present, it reads the integer storage array, builds boxed/object values, and stores the result through `FUN_013eaed0`.
- The immediate caller reported by `caller-correlation-report.md` is `FUN_028b327c`, also within the same storage method region.

Interpretation:
- `FUN_013ecb14` and `FUN_013eaed0` are not exclusively map/facility visual helpers.
- They are generic record/cache helpers reused by framework/runtime code.
- `FUN_028b3358` should be marked CURATED after this note; it is not a current KEEP target for static builder work.
- Next course: move from visual-record lifecycle helpers toward facility/map-specific callers that can reveal:
  - facility footprint or occupied tile data,
  - facility sprite/component assembly,
  - anchor/alignment rules,
  - draw order/layering for buildings and nature.

Land-state/spawn watch result:
- No wasteland, land-reclamation, terrain-state, monster-spawn, spawn-zone, or biome-spawn evidence was encountered in this Step 9 storage/cache path.

### Step 11: Static Builder Export Prep

Map/builder meaning:
- The next useful export should focus on the systems that decide whether buildings/facilities fit on the map and how their previews are drawn.
- This directly supports the website builder goals:
  - correct occupied footprint,
  - no overlap,
  - correct facility sprite/id/frame,
  - entrance/orientation,
  - believable draw order/layering,
  - and future visual placement previews.
- We are not tracing full facility lifecycle behavior unless it reveals static placement or drawing facts.

Immediate metadata evidence from `dump.cs`:
- `MapChipData` already exposes the key static-builder fields:
  - visual ids: `res` at field `0x48`, `img` at `0x4c`, `seb` at `0x50`, `frame` at `0x54`,
  - alignment/state hints: `height` at `0x68`, `layer` at `0x74`, `rotation` at `0x78`,
  - visual/object size: `sizeWidth` at `0x7c`, `sizeHeight` at `0x80`,
  - occupied footprint candidates: `unitWidth` at `0x84`, `unitHeight` at `0x88`.
- `MapChipData` categories include builder-relevant constants:
  - `CATEGORY_FACILITY = 38`,
  - `CATEGORY_WASTELAND = 49`,
  - `CATEGORY_DUNGEON_WAIRO = 89`,
  - `CATEGORY_DUNGEON_KAIRO = 90`,
  - `CATEGORY_RECLAIM = 98`,
  - `CATEGORY_ENEMY_GENERATOR = 99`.

Script action taken:
- `tools/asset_extractor/ghidra_scripts/BulkExportSebRender.java` was retargeted for Step 11.
- Default export folder is now `Reverse engineering/exports/active`.
- The script now seeds:
  - `ChipPlaceSystem` placement, range, draw, entrance-direction, and preview methods,
  - `ChipReplaceSystem` replacement/range/draw/check methods,
  - `FacilitySystem` static/dynamic facility draw and placed-chip hooks,
  - `MapSystem` chip creation, rectangle lookup, height, modify-state, and entrance direction helpers,
  - `MapChipData` getters for visual ids and footprint dimensions.
- Expansion was reduced to direct callers/callees only:
  - callee depth `1`,
  - caller depth `1`,
  - max export cap `700`.

Next action:
- Run `BulkExportSebRender.java` in Ghidra.
- Use the default export folder unless Ghidra prompts and you want to override it:
  - `C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active`
- After export completes, analyze the active files and curate findings into docs before cleanup.

Land-state/spawn watch result:
- `MapChipData` metadata confirms wasteland and reclaim categories exist.
- This does not yet prove monster-spawn behavior.
- Step 11 export includes `MapSystem.GetModifyState` and `MapSystem.SetModifyState` as natural land-state watch targets.

### Step 12: Implementation-Guided Pivot and First Map UI Change

Map/builder meaning:
- The project is no longer waiting for perfect reverse engineering before visible work.
- Reverse engineering now answers: "what do we still need to make the visible 2D map/builder better?"
- The active export set was moved into `Reverse engineering/exports/active` for the current pass:
  - 239 files moved,
  - `Reverse engineering/exports/seb-render-functions` returned to 0 files,
  - no files deleted.

Implementation action taken:
- `artifacts/kingdom-adventures/src/pages/world-map.tsx` now has explicit map modes:
  - `Visual`: terrain, roads, facilities, chaos/setup structures, water; analysis overlays hidden,
  - `Logic`: levels, POI, deployments, reclaimed tiles, grid, roads, water, facilities, chaos/setup structures, and survey pins.
- Normal desktop zoom-out was expanded:
  - `MIN_TILE_SIZE` changed from `2` to `0.5`.
- This supports the new split:
  - visual/presentation map for nice viewing and layout planning,
  - flat/debug/logic map for overlays and gameplay information layers.

Verification:
- `npm run typecheck` passed in `artifacts/kingdom-adventures`.
- Local dev server responded at `http://localhost:5173`.

Reverse-engineering interpretation:
- The new active export confirms Step 11 hit the intended area, but many public methods still land inside larger Ghidra function bodies.
- Continue using `target-boundary-report.md` before trusting a function filename.
- The useful metadata remains stronger than raw decompile names for immediate V1 work:
  - static facility visual fields are already available from `MapChipData`,
  - V1 should use static sprites and known footprints first,
  - deeper runtime placement helpers are only worth following when they improve visible placement/alignment/layering.

Land-state/spawn watch result:
- No new monster-spawn rule was confirmed in this first Step 12 pass.
- Wasteland/reclaim remain known map categories, not yet proven spawn mechanics.

### Step 13.20: Nature/Object Placement Evidence Pass

Map/builder meaning:
- The visual map should not stack multiple nature/object candidates on the same chip.
- `Terrain.txt res=20` is best treated as the object sprite/render-definition table.
- The current map file contains a possible tile-level visual signal: `mapCell.f2` sometimes points directly to a `Terrain.txt` row whose `res=20`.
- A direct `f2 -> Terrain.id` rule was tested, but it produced visually impossible biome mixing, such as green trees appearing on snow.
- Current V1 presentation rule: choose at most one visible nature/resource/human/special object per chip from rows where `Terrain.type === mapCell.f1`, using deterministic category chances so spawn-heavy areas still read as spawn-heavy.

Sources checked:
- `docs/nature-render-reverse-engineering-report.md`
- `docs/ai-takeover-handoff-native-render.md`
- `docs/native-render-transform-analysis.md`
- `docs/reverse-engineering-discovery-index.md`
- `Reverse engineering/exports/active`
- `tools/asset_extractor/il2cpp_dump/dump.cs`
- `tools/asset_extractor/il2cpp_dump/script.json`
- `artifacts/kingdom-adventures/tmp/KA_assets/map/map_160_160.map`
- `artifacts/kingdom-adventures/tmp/KA_assets/xls/English.lproj/Terrain.txt`
- `artifacts/kingdom-adventures/tmp/KA_assets/nature/img.inf`

Findings:
- Current active exports do not contain `TownNatureSystem` native bodies around:
  - `0x15EFB14` `TownNatureSystem.OnChangeMapChip`
  - `0x15EFD80` `TownNatureSystem.OnChangeMapChips`
  - `0x15F0878` `TownNatureSystem.OnGrowNature`
- Active exports include `MapSystem.CreateMapChips` around `0x15B17D4`, but the available decompile does not prove nature object selection, weighting, rarity, or random placement.
- No current export evidence was found for native object weighting, rarity, random distribution, spacing, or anti-clumping.
- Data-level evidence from `map_160_160.map`:
  - `mapCell.f2` points to a `Terrain.txt res=20` row on `10,142 / 25,600` cells.
  - Example exact mappings:
    - `f2=69 -> Terrain.id=69 -> rock_tree01.png`
    - `f2=70 -> Terrain.id=70 -> rock_tree00.png`
    - `f2=74 -> Terrain.id=74 -> volcano_obj03.png`
    - `f2=52 -> Terrain.id=52 -> soil_obj03.png`

Classification:
- `Terrain.txt res=20`: render-definition/candidate-definition data.
- `nature/img.inf` and `nature/seb.inf`: render-definition data.
- `mapCell.f2` when it points to `Terrain.id` with `res=20`: possible object-selection signal, but not safe enough alone for the visual map because observed output crossed biome boundaries.
- `mapCell.f1`: current reliable terrain/biome gate for preventing impossible object pools.
- Native weighting/grouping/rarity: not found in current exports.

Implementation action:
- `runtime-world-render-test.tsx` and `runtime-world-grid-test.tsx` now use a one-visual-per-chip rule for nature/object overlays.
- Candidate pools are constrained by `Terrain.type === mapCell.f1`, so snow uses snow-compatible rows instead of grass/forest trees.
- Category choice is deterministic, not random: terrain nature, resources/treasure, humans, and special objects each have per-terrain chances to represent likely spawn frequency without overlapping multiple objects on one chip.
- Kept category toggles for terrain nature, resources, humans, and special/unknown.
- Set the nature debug overlay off by default to avoid pink marker spam in the presentation view.
- Set the default isometric camera to start nearer the map center at `0.65x` zoom, so screenshots and first load show a useful world-wide distribution instead of only the top strip.

Verification:
- `npm run typecheck` passed.
- `/runtime-world-render-test` and `/runtime-world-grid-test` returned HTTP 200.
- Headless Edge screenshot from the centered default camera showed snow using snowy trees/objects and rocky/desert regions retaining resources and rocks without multi-object stacking on each chip.

Remaining uncertainty:
- Because `TownNatureSystem` bodies were not present in the active export set, this is still data-level evidence, not native function-level proof.
- If exact game behavior is ever needed, the next surgical export should target:
  - `TownNatureSystem.AddNaturesInRect` at `0x15EF2C4`
  - `TownNatureSystem.RemoveNaturesInRect` at `0x15EF794`
  - `TownNatureSystem.CanAddNature` at `0x15F05CC`
  - `TownNatureSystem.AddNature` at `0x15F062C`
  - `TownNatureSystem.RemoveNature` at `0x15F07A0`
  - `TownNatureSystem.OnChangeMapChip` at `0x15EFB14`
  - `TownNatureSystem.OnChangeMapChips` at `0x15EFD80`
  - `TownNatureSystem.OnGrowNature` at `0x15F0878`

### Step 14: One-Piece Facility Placement Evidence Pass

Map/builder meaning:
- Nature distribution is good enough for now; facility work starts with visible placement of map-unlocked facilities.
- Ports are intentionally skipped for the first render pass because the data marks them as multi-piece structures.
- The first useful version should show one-piece facility/unlock markers at plausible map-zone positions without changing base terrain or nature.

Sources checked:
- `docs/ai-takeover-handoff-native-render.md`
- `docs/reverse-engineering-discovery-index.md`
- `docs/native-render-transform-analysis.md`
- `data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv`
- `data/sheet-research/raw-copies/Kingdom Adventurers EN - Map.csv`
- `data/sheet-research/raw-copies/Kingdom Adventurers EN - Map full.csv`
- `artifacts/kingdom-adventures/src/game-data/facilities.ts`
- `artifacts/kingdom-adventures/src/pages/world-map.tsx`
- `artifacts/kingdom-adventures/tmp/KA_assets/map/map_160_160.map`
- `artifacts/kingdom-adventures/tmp/KA_assets/xls/English.lproj/MapChip.txt`
- `Reverse engineering/exports/active`

Evidence summary:
| Source | Meaning for builder | Confidence |
| --- | --- | --- |
| `Facility_lookup.csv` ids `165-181`, `196` | Confirms the requested IDs are facility lookup entries and gives names/type fields. | High for identity, low for exact x/y. |
| `facilities.ts` map-tab entries | Confirms map-unlock levels and 2x2 size labels for the requested facilities. | High for unlock level and V1 footprint label. |
| `world-map.tsx` `NATIVE_MAP` + `MAP_FACILITY_UNLOCKS` | Existing site logic maps each unlock level to a 10x10 world zone and distributes same-level facilities one-to-one across matching zones. | Medium/high for V1 visual placement. |
| `map_160_160.map` section A | Contains `f2` map chips for Town Hall, caves, ports, floors, and terrain objects, but direct matching by facility lookup `type` creates many repeated clusters, not one clean facility coordinate. | Medium as supporting evidence, not final one-piece placement. |
| `Reverse engineering/exports/active` | Confirms static `MapChipData` fields and that further native placement code is still boundary-limited; no better one-piece facility coordinate table was found in current exports. | Medium; no new exact coordinate proof. |

One-piece V1 facility placement table:
| Facility ID | Facility | Unlock level | 10x10 zone | Runtime map center | Render status | Notes |
| --- | --- | ---: | --- | --- | --- | --- |
| 172 | Ranking Board | 2 | 6,8 | 104,136 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 171 | Trophy Room | 3 | 8,6 | 136,104 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 167 | Briefing Room | 5 | 6,9 | 104,152 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 166 | Friend Post Office | 10 | 6,6 | 104,104 | one-piece marker/icon | Shares level 10; assigned to first matching zone by existing order. |
| 175 | Material Shop | 10 | 9,5 | 152,88 | one-piece marker/icon | Shares level 10; assigned to second matching zone by existing order. |
| 165 | Master Smithy | 11 | 5,8 | 88,136 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 170 | Monster Farm | 14 | 7,5 | 120,88 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 181 | Underground Arena | 20 | 5,5 | 88,88 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 169 | Treasure Room | 21 | 4,9 | 72,152 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 168 | Weekly Conquest Bonus | 22 | 6,4 | 104,72 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 173 | Friends Agency | 30 | 4,6 | 72,104 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 174 | Job Center | 35 | 3,6 | 56,104 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 177 | Instructor's Room | 41 | 2,5 | 40,88 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 178 | Monster Fusion Lab | 45 | 5,4 | 88,72 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 180 | Kairo Room | 58 | 3,5 | 56,88 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |
| 196 | Legendary Cave | 120 | 5,1 | 88,24 | one-piece marker/icon | Existing `NATIVE_MAP` zone placement. |

Port handling:
- Facility lookup IDs `7-10` are Port entries and `7` has `parentChipId=67` plus child pieces.
- MapChip evidence shows ports use multiple pieces (`67`, `69`, `70`, and wharf-like `66`; `68` did not appear in current section-A `f2`).
- Do not render ports as one-piece facilities in this pass.

Implementation action:
- Use the existing world-zone placement as the first visible facility placement rule for `/runtime-world-render-test`.
- Prefer confirmed facility icons from `public/website_icons/facilities_confirmed/` for the first visual pass.
- Keep base terrain and nature untouched.
- Added a `facilities` toggle to `/runtime-world-render-test`; it defaults on.
- Facility overlays draw a subtle 2x2 footprint diamond plus the confirmed facility icon.

Verification:
- `npm run typecheck` passed.
- `/runtime-world-render-test` and `/runtime-world-grid-test` returned HTTP 200.
- Headless Edge screenshot confirmed one-piece facility icons appear on the visual map with terrain/nature still intact and no default debug marker spam.
- Screenshot: `artifacts/kingdom-adventures/tmp/runtime-world-render-step14-facilities.png`.

### Step 15: Facility Building Sprite Evidence Pass

Map/builder meaning:
- Facility positions can stay on the current world-zone coordinates for now; the visible problem was that facilities looked like UI icons pasted onto the map.
- The first correction is to render one-piece facilities from the game's world-building asset folder, so structures sit on terrain like map buildings instead of black-backed menu icons.
- Ports remain skipped because they are multi-piece structures and need assembly logic later.

Sources checked:
- `artifacts/kingdom-adventures/src/pages/runtime-world-render-test.tsx`
- `data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv`
- `artifacts/kingdom-adventures/tmp/KA_assets/building/img.inf`
- `artifacts/kingdom-adventures/tmp/KA_assets/building/*.png`
- `artifacts/kingdom-adventures/tmp/facility-building-candidates.png`
- `Reverse engineering/exports/active`

Evidence summary:
| Evidence | Meaning for builder | Confidence |
| --- | --- | --- |
| Runtime renderer previously loaded `/website_icons/facilities_confirmed/facility_*.png` | Those are presentation/menu icons, not in-world building sprites. | High |
| Black square was caused by the overlay backing panel in `drawOnePieceFacilityOverlays`, not PNG alpha loss | Removing the panel fixes the black-background symptom without changing coordinates. | High |
| `Facility_lookup.csv` column 2 for Kairo Room is `66`; `building/img.inf` id `66` resolves to `building_65.png` | Facility lookup type maps to building image ID for the tracked one-piece facilities. | High for asset selection |
| Building candidate contact sheet shows `building_65.png` and nearby IDs as actual world-building sprites | The correct source is `/tmp/KA_assets/building`, not chip assets or website icons. | High |
| `building_65.optinfo` references `optimize_96x128.inf` and `building_65.png` | There is additional optimized frame metadata, but V1 can safely draw the full transparent PNG. | Medium |
| Active reverse exports did not expose a clearer anchor/offset rule | Exact native building anchor remains unresolved; use bottom-center anchor for V1. | Medium |

One-piece facility building asset table:
| Facility ID | Facility | Building image ID | Building asset | Placement source | Render status | Confidence |
| --- | --- | ---: | --- | --- | --- | --- |
| 172 | Ranking Board | 70 | `building_69.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 171 | Trophy Room | 71 | `building_70.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 167 | Briefing Room | 72 | `building_71.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 166 | Friend Post Office | 68 | `building_67.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 175 | Material Shop | 76 | `building_75.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 165 | Master Smithy | 73 | `building_72.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 170 | Monster Farm | 82 | `obj_60.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 181 | Underground Arena | 80 | `obj_58.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 169 | Treasure Room | 67 | `building_66.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 168 | Weekly Conquest Bonus | 74 | `building_73.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 198 | Movers | 95 | `building_82.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 173 | Friends Agency | 77 | `building_76.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 200 | Equipment Exchange | 96 | `building_83.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 174 | Job Center | 75 | `building_74.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 201 | Trading Post | 97 | `building_84.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 177 | Instructor's Room | 81 | `obj_59.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 178 | Monster Fusion Lab | 86 | `obj_62.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 180 | Kairo Room | 66 | `building_65.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 196 | Legendary Cave | 91 | `building_78.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |
| 202 | Date Spot | 107 | `add_build05.png` | Step 14 zone placement | Full building PNG, bottom-center anchor | High asset, medium anchor |

Tracked but not rendered yet:
- Facility IDs `197`, `199`, `203`, `204`, and `205` are Scorched Earth-style entries in the same facility range, but no current one-piece world placement evidence was found for them.
- Port IDs `6-10` stay documentation-only for now because the source data marks them as multi-piece structures.

Implementation action:
- Runtime renderer now loads `building/img.inf`, resolves each one-piece facility's `buildingImageId`, and draws `/tmp/KA_assets/building/<asset>.png`.
- Removed the black rounded icon backing; facilities render as transparent world sprites over the existing 2x2 footprint preview.
- Base terrain, nature placement, and existing facility coordinates were left unchanged.

Verification:
- `npm run typecheck` passed.
- `/runtime-world-render-test` and `/runtime-world-grid-test` returned HTTP 200.
- Headless Edge screenshot confirmed the visible facility no longer has a black square background and now appears as an in-world building sprite.
- Screenshot: `artifacts/kingdom-adventures/tmp/runtime-world-render-step15-building-assets.png`.

### Step 16: Port Assembly V1

Map/builder meaning:
- Port is now treated as a compound world object, not a one-piece facility.
- The two world-map Port unlocks draw at their own map locations and use the four gate pieces plus water-side bridge/dock pieces.
- This moves the builder closer to correct special-facility rendering while keeping simple static facilities separate.

Evidence:
| Source | Finding | Practical meaning |
| --- | --- | --- |
| `Facility_lookup.csv` facility `7` | `combination=2`, `parentChipId=67`, child chips `[70,68,69]` | Port pieces are assembled horizontally from the parent chip. |
| `MapChip.csv` rows `67-70` | All four rows are named `Port`, have `sizeWidth=2`, `sizeHeight=2`, and map to facility IDs `7-10` | The Port is four 2x2 MapChip pieces. |
| `building/img.inf` | IDs `2`, `3`, `20`, `21` resolve to `gate_00.png`, `gate_01.png`, `gate_02.png`, `gate_03.png` | Gate/building sprites are in the building asset folder. |
| `chip/img.inf` and `wall/img.inf` | `hashi00.png`, `bridge_side.png`, and `bridge_wall_00.png` are available bridge/dock assets | Port needs water-side surface/wall pieces in addition to gates. |
| Map unlock grid | Port unlock levels `7` and `44` resolve to zones `(9,6)` and `(9,2)` | There are two visible Port assemblies. |

Implementation action:
- Added a dedicated `PORT_ASSEMBLIES` renderer to `/runtime-world-render-test`.
- Added a separate `ports` toggle.
- Added debug focus URLs:
  - `/runtime-world-render-test?focus=port7`
  - `/runtime-world-render-test?focus=port44`
- Kept one-piece facility rendering unchanged.

Correction after visual comparison:
- The initial Step 16 pass incorrectly drew Port children as a straight row from the combination order.
- Correct practical rule: Port is a 4x4 composed footprint. Stored `cellX,cellY` is the exclusive end of the 4x4.
- Each Port component is a 2x2 placed building inside that 4x4, using the same 2x2 exclusive-end / NW-anchor rule as other static facilities.
- The runtime page now highlights the full 4x4 and each component's 2x2 footprint.
- The page exposes manual dx/dy controls for the four Port components and stores the layout in browser local storage so the visual placement can be corrected by inspection before locking a permanent rule.
- Bridge/dock pieces are disabled by default during this placement pass; they should be decoded after the four 2x2 building anchors are right.

Remaining uncertainty:
- Exact native water-chip replacement shape and bridge-wall crop selection still need more evidence.
- Current bridge/dock placement is closer to the real Port, but remains a visual V1 approximation until the attachment rule to `hashi00`/bridge chips is fully decoded.

Verification:
- `npm run typecheck` passed.
- `/runtime-world-render-test` and `/runtime-world-grid-test` returned HTTP 200.
- Headless Edge screenshots confirmed both Port locations render with gate pieces and bridge/dock pieces:
  - `artifacts/kingdom-adventures/tmp/runtime-world-render-step16-port7-focused.png`
  - `artifacts/kingdom-adventures/tmp/runtime-world-render-step16-port44-focused.png`
- Corrected comparison screenshots after per-piece 2x2 anchors:
  - `artifacts/kingdom-adventures/tmp/runtime-world-render-step16-port7-corrected-2.png`
  - `artifacts/kingdom-adventures/tmp/runtime-world-render-step16-port44-corrected-2.png`
- Manual 4x4 layout screenshot:
  - `artifacts/kingdom-adventures/tmp/runtime-world-render-step17-port4x4-manual.png`
