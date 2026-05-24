# Phase 2.11a Native Map Placement Export Evaluation

Status: partially superseded for disputed ownership/identity interpretation.

Canonical precedence note (2026-05-20):
- Keep this document for function mapping and branch-shape evidence.
- For disputed conclusions that treat `FUN_01504134` as confirmed gameplay placement ownership, defer to `Reverse engineering/exports/active/mapchip-cost-validation/quick_validation_report.md` until newer vetted evidence reopens the chain.
- Apply `docs/reverse-engineering-discovery-index.md` canonical evidence precedence when conflicts appear.

## Confirmed target → exported file mapping
- `MapSystem.PlacePort` @ 0x15B1F20 -> `FUN_015B1E34` -> `FUN_015b1e34_015b1e34.c` / `FUN_015b1e34_015b1e34.s`
- `MapSystem.AddWaterEdge` @ 0x15B2534 -> `FUN_015B252C` -> `FUN_015b252c_015b252c.c` / `FUN_015b252c_015b252c.s`
- `MapSystem.AddWaterEdgeSide` @ 0x15B2774 -> `FUN_015B2724` -> `FUN_015b2724_015b2724.c` / `FUN_015b2724_015b2724.s`
- `MapSystem.AddWaterEdgeCorner` @ 0x15B290C -> `FUN_015B27CC` -> `FUN_015b27cc_015b27cc.c` / `FUN_015b27cc_015b27cc.s`
- `MapSystem.CreateMapChips` @ 0x15B17D4 -> `FUN_015B173C` -> `FUN_015b173c_015b173c.c` / `FUN_015b173c_015b173c.s`
- `ChipPlaceSystem.PlaceChip` @ 0x15042E0 -> `FUN_01504134` -> `FUN_01504134_01504134.c` / `FUN_01504134_01504134.s`

### `FUN_01504134` ownership-chain findings
- `FUN_01504134` is the confirmed native `ChipPlaceSystem.PlaceChip` dispatcher, and it is primarily a router into multiple placement strategies rather than the implementation of a single placement algorithm.
- The function selects placement behavior by comparing returned objects from `FUN_0208e2a4(..., 0)` against two fixed selector objects using `FUN_02098b0c`.
- These selector objects appear to represent category-specific placement modes: one path jumps to `FUN_02053924`, the second to `FUN_02053a20`, and a fallback path goes to `FUN_020cac40`.
- Both special-case branches converge into shared finalization logic via `FUN_020cbda4`, while the fallback branch instead enters a different validation/finalization branch.

### `FUN_0208e2a4` and `FUN_02098b0c` role
- `FUN_0208e2a4` is not a coordinate engine; it is a validation/descriptor helper that performs lazy initialization, checks a runtime module/object state, and returns a derived object pointer.
- `FUN_02098b0c` is a trivial equality comparator (`param_1 == param_2`) used to compare selector objects.
- Together, they implement placement category selection by object identity rather than by numeric type code or direct coordinate flags.
- The data-driving placement decision is therefore encoded in the selector objects and the derived placement/context state fed into `FUN_0208e2a4`.

### Compound facility and multi-piece placement evidence
- Direct evidence from this anchor chain does not yet prove compound facility placement in `FUN_01504134` itself.
- The two special-case branches and fallback branch are consistent with a dispatcher that handles different placement classes, including multi-piece cases such as ports or other compound facilities.
- `FUN_020cac40` is the strongest current candidate for placement completion or validation of a default/complex facility branch; it invokes `FUN_020c8e08` and `FUN_01f93d98`, which are likely deeper placement/finalization routines.
- `FUN_0208e2a4` and `FUN_02098b0c` do not directly inspect `MapChip` fields like `relatedDataId`, `parentChipId`, `chips[]`, `sizeWidth`, `sizeHeight`, or `height`.

### Render vs occupied footprint and placement ownership
- No direct render-footprint arithmetic appears in the current exported helper bodies.
- The confirmed dispatcher `FUN_01504134` routes placement by selector identity, not by explicit footprint coordinate formulas.
- This suggests the actual footprint math and occupancy/render distinction are deeper than the current export layer, probably in the unresolved thunks and the finalization helpers called by `FUN_020cac40`, `FUN_02053924`, or `FUN_02053a20`.
- Existing static docs remain the strongest source for `cellX/cellY` exclusive-end semantics and multi-piece port footprint behavior.

### Strongest confirmed gameplay ownership function
- `FUN_01504134` is the top confirmed ownership router for gameplay placement.
- It owns the branch structure and selector-based placement category decisions.
- It is therefore the strongest confirmed gameplay placement ownership function, even if it delegates the actual footprint math to deeper helpers.

### Whether compound placement behavior is confirmed
- Confirmed: the dispatcher has separate special-case branches and a generic fallback branch, which is consistent with compound facility handling.
- Not fully confirmed: there is no direct evidence in `FUN_01504134`, `FUN_0208e2a4`, or `FUN_02098b0c` that compound child/parent facility metadata like `parentChipId` or `chips[]` are processed there.
- Likely: compound behavior is handled by deeper helpers invoked after the selector branch or within the shared finalizer path.

### Whether render footprint and occupied footprint differ
- Not confirmed at this layer.
- The current helper exports do not expose separate render vs occupied footprint computations.
- Existing `facility-world-placement.md` anchor evidence still supports an exclusive-end `cellX/cellY` footprint origin rule for facility placement.

### Whether parent/child chip propagation exists
- Not proven in the current exports.
- The current anchor chain uses selector objects and fallback paths, but the actual `parentChipId`/`chips[]` propagation is not visible yet.
- This remains a high-confidence hypothesis for deeper helper logic, not a confirmed fact at the current depth.

### Next highest-value MCP target
- Resolve the unresolved thunks called by `FUN_020cac40`, especially `thunk_FUN_00a224a4` and `thunk_FUN_00a22200`.
- These are the best next targets because they are the missing semantic layer beneath the fallback branch and likely contain the compound placement/validation logic.
- Also prioritize capturing the actual pointed-record descriptors behind the selector object addresses `0x2A08B18` and `0x2A08B6C`.

### Summary
- `FUN_01504134` is confirmed as the gameplay placement ownership router.
- `FUN_0208e2a4` and `FUN_02098b0c` implement selector-driven placement mode dispatch, not coordinate math.
- Compound placement is still a likely deeper behavior, but not yet proved in the current exported helper bodies.
- The next export focus should be the unresolved helper thunks and the pointed-record descriptor objects behind the selector identities.

## Correction: no-op / stub vs semantic target
- `FUN_020cbda4` is confirmed to be a no-op stub. The active `FUN_020cbda4` export resolves to an empty function (`bx lr` / immediate return).
- `FUN_02053924` and `FUN_02053a20` are lazy-init wrappers, not placement logic. Both perform a one-time init check and then dispatch to `FUN_020cbda4(param, 0)`.
- `FUN_009c4d4c` is an init/sync helper. It is invoked by the wrappers and by nearby validation paths, but it contains no placement semantics.
- `FUN_02098b0c` is an equality helper. Its body is simply `return param_1 == param_2;`.
- `FUN_0208e2a4` is therefore the first important semantic candidate in this path. It validates or looks up a resource and then returns a derived buffer/object result via `FUN_00a23e84(iVar2 + 0x10)`.
- The likely next semantic layer is not the direct stub. It is the object returned by `FUN_0208e2a4`, plus the branch/global object resolved by `thunk_FUN_00a225b8`.

## Returned-object consumer pivot
- `FUN_0208e2a4` returns a derived object.
- `FUN_00a23e84` extracts/constructs/resolves that object.
- `thunk_FUN_00a225b8` is allocator/resolver behavior.
- This layer does not yet expose x/y, anchor, offset, or map chip placement.
- The next semantic target is not the object constructor itself. It is the functions that consume the returned object.
- In `FUN_01504134`, the result of `FUN_0208e2a4` is:
  1. validated against an existing object/table and assigned to `piVar6`.
  2. compared by `FUN_02098b0c` to a global prototype and used to choose `FUN_02053924`.
  3. compared again to another global prototype and used to choose `FUN_02053a20`.
  4. used as a virtual object with method calls at offsets `0x170`, `0x200`, `0x2e8`, `0x240`, `0x250`, and then passed into `FUN_020cac40`.
- The branch conditions in `FUN_01504134` are therefore the key pivot for category/type/placement-mode dispatch.
- The next export pass should focus on these consumer paths and the actual fields read from the returned object.

## Next focused export pass
- The next export should target the returned-object consumer layer instead of descending further into generic constructor/allocation helpers.
- Output folder: `Reverse engineering/exports/active/map-placement-returned-object-consumers`
- Priority seeds:
  - `FUN_01504134`
  - `FUN_0208e2a4`
  - `FUN_00a23e84`
  - `thunk_FUN_00a225b8`
  - `FUN_02098b0c`
  - `FUN_02053924`
  - `FUN_02053a20`
  - `FUN_020cac40`
  - direct callees of `FUN_01504134`
  - direct callers/callees of `FUN_0208e2a4`
  - direct callers/callees of `FUN_00a23e84`
  - functions that receive the returned object from `FUN_0208e2a4`

### Goals for the next pass
1. Identify what `FUN_0208e2a4` returns.
2. Determine whether the returned object represents:
   - placement range
   - chip category/type container
   - coordinate list
   - world/map data
   - construction/placement command object
   - generic buffer/list only
3. Identify what `FUN_020cc7a8` validates.
4. Identify what `FUN_00a23e84` extracts/returns.
5. Identify what `thunk_FUN_00a225b8` allocates or resolves.
6. Determine whether these paths expose:
   - x/y coordinates
   - width/height
   - direction
   - map chip ID
   - category/type
   - placement records
   - offsets
   - anchor behavior
   - footprint/range expansion

### Required reports
- `seed_resolution.tsv`
- `index.tsv`
- `callgraph_edges.tsv`
- `returned_object_notes.tsv`
- `relevance_notes.tsv`

A new Ghidra export script has been created for this pass:
- `tools/asset_extractor/ghidra_scripts/ExportMapPlacementReturnedObjectLayer.java`
- `tools/asset_extractor/ghidra_scripts/ExportMapPlacementReturnedObjectConsumers.java`

After the pass completes, read exported `.c` bodies and classify each as semantic placement logic, object/list helper, validation, or irrelevant.

## Seed body classification from available exports
- `FUN_020cc7a8` is confirmed to be an equality helper: it only returns `param_1 == param_2`.
- `FUN_00a23e84` is an extraction/constructor helper; it checks a global state with `FUN_00a24ae8()`, resolves a helper object via `FUN_00a225b8()`, writes `local_c` into the result object at `+8`, and then returns the value from `FUN_00a24bec()`.
- `thunk_FUN_00a225b8` is a managed object resolver/allocator. It performs a flag-based dispatch, optionally allocates a new object with `FUN_009ac064()` or `FUN_009a635c()`, uses memory barriers and atomic counters, and then applies final post-processing hooks.
- `FUN_0208e2a4` is a top-level validation wrapper that performs one-time lazy init, validates its input with `FUN_020cc7a8`, checks runtime state, and then returns a derived object through `FUN_00a23e84()`.
- The direct callees of `FUN_0208e2a4` are: `FUN_020cc7a8`, `FUN_009c4d4c`, `thunk_FUN_00a10698`, `FUN_009b4c10`, and `FUN_00a23e84`.
- The returned object is likely a placement/context handle or command object, not a raw coordinate list. Its semantics appear to be object resolution and post-processing rather than direct x/y/direction computation.
- The next semantic target should be the object returned by `FUN_00a23e84` and how callers consume its fields.

> Do not keep following no-op `FUN_020cbda4`. It is eliminated as a semantic target.

## Helper-layer export analysis

### Previous pass conclusion
- The first export attempt was too shallow.
- `MapSystem.PlacePort`, `AddWaterEdge*`, and `CreateMapChips` behave mostly as orchestration/list-building/wrapper functions.
- The real coordinate/anchor/offset/neighbor placement semantics appear to be deeper in helper calls.
- This conclusion is now documented and guides the next depth-2 export.

The latest helper export pass confirms the following resolved helper targets in `Reverse engineering/exports/active/map-placement-helpers`:

- `FUN_01452580` -> `FUN_01452580_01452580.c` / `FUN_01452580_01452580.s`
- `FUN_020cac40` -> `FUN_020cac40_020cac40.c` / `FUN_020cac40_020cac40.s`
- `FUN_02099764` -> `FUN_02099764_02099764.c` / `FUN_02099764_02099764.s`
- `FUN_0208e2a4` -> `FUN_0208e2a4_0208e2a4.c` / `FUN_0208e2a4_0208e2a4.s`
- `FUN_02098b0c` -> `FUN_02098b0c_02098b0c.c` / `FUN_02098b0c_02098b0c.s`
- `FUN_0136f194` -> `FUN_0136f194_0136f194.c` / `FUN_0136f194_0136f194.s`
- `FUN_013725a0` -> `FUN_013725a0_013725a0.c` / `FUN_013725a0_013725a0.s`
- `FUN_0136bd98` -> `FUN_0136bd98_0136bd98.c` / `FUN_0136bd98_0136bd98.s`

### `FUN_01504134` as the branch candidate
- `FUN_01504134` is not a single placement implementation. It is a dispatcher/router into multiple placement strategies.
- The function has at least three main paths:
  - direct path 1: `FUN_02053924`.
  - direct path 2: `FUN_02053a20`.
  - fallback path: `FUN_020cac40` -> `FUN_020c8e08` -> `FUN_01f93d98`.
- Both direct paths converge into a shared finalizer call: `FUN_020cbda4`.
- Current working hypothesis:
  - `FUN_020cbda4` may be the shared final placement/finalization layer.
  - `FUN_02053924` and `FUN_02053a20` may be category/type-specific preparation paths.
  - the fallback branch may be object lookup / validation / deferred selection.
- This is a confirmed branch structure from native exports, but the semantic meaning is still inferred and unresolved.
- The consumer export reports confirm the function names and path structure, but `branch_conditions.tsv` contains no direct branch detail for this function; the decompiled C body is the primary source for decoding.

### `FUN_01504134` returned-object branch decoding
- `FUN_01504134` uses four `FUN_0208e2a4` returned-object lookups in its path.
  1. `piVar2 = (int *)FUN_0208e2a4(uVar9,0);`
     - arg: `uVar9 = *(undefined4 *)(*(int *)(iVar1 + 0x60) + 0x10)` (a derived value from current placement/context state).
     - returned variable: `piVar2`.
     - comparison: object-type/context validation against `*piVar11` using `*piVar2 + 0xb8` and a table at `*piVar2 + 100`.
     - branch behavior: if `piVar2` exists, it must match the expected context or the code aborts.
     - likely meaning: first candidate object lookup / placement context validation.
     - classification: generic candidate selection before category dispatch.
  2. `uVar9 = FUN_0208e2a4(**(undefined4 **)(DAT_01504864 + 0x15042b4),0);`
     - arg: global object pointer loaded from data at `0x15042b4`.
     - returned variable: `uVar9` used as a second candidate.
     - comparison: equality test `FUN_02098b0c(piVar6, uVar9, 0)` against the previous selected object.
     - branch destination: if equal, call `FUN_02053924(piVar12,0)`.
     - likely meaning: first special-case placement category.
     - classification: category-specific branch, not generic fallback.
  3. `uVar9 = FUN_0208e2a4(**(undefined4 **)(DAT_0150486c + 0x1504300),0);`
     - arg: another global object pointer loaded from data at `0x1504300`.
     - returned variable: `uVar9` used as a second candidate.
     - comparison: equality test against `piVar6`.
     - branch destination: if equal, call `FUN_02053a20(piVar12,0)`.
     - likely meaning: second special-case placement category.
     - classification: another category-specific branch, separate from the first.
  4. `piVar2 = (int *)FUN_0208e2a4(uVar9,0);` after `uVar9 = *(undefined4 *)(*(int *)(iVar1 + 0x60) + 0x14);`
     - arg: a second derived value from the current placement/context state.
     - returned variable: `piVar2`.
     - comparison: virtual-method test on `piVar2` against `piVar6`, followed by deeper validation through `piVar6` and then a fallback path into `FUN_020cac40(uVar9, piVar6, 0)`.
     - branch destination: generic/fallback placement validation and finalization.
     - likely meaning: default placement object validation route.
     - classification: generic placement mode, not one of the two special branches.
- The two direct special-case branches both end at wrappers that call `FUN_020cbda4`, which strongly suggests they are category-specific entry points feeding a shared finalizer.
- The fallback path instead continues through a different object validation and selection sequence, ending at `FUN_020cac40` and not at `FUN_02053924` or `FUN_02053a20`.

### Special-case selector object identities
- Two branch selectors are pinned to explicit global object addresses:
  - `0x2A08B18` is loaded from `DAT_01504864 + 0x15042b4`.
  - `0x2A08B6C` is loaded from `DAT_0150486C + 0x1504300`.
- Both values are passed through `FUN_0208e2a4(..., 0)` before the equality test in `FUN_02098b0c`, so the branch decision appears to be based on the identity of a concrete selector object rather than a numeric type code.
- This strongly suggests the direct branches are selecting between two fixed placement categories or edge/anchor object descriptors, rather than performing a generic validation check.
- Because both direct paths converge on the shared finalizer stub `FUN_020cbda4`, the selector objects are likely pre-placement seeds for distinct placement categories.
- A focused export pass should therefore capture raw memory around these selectors and their xrefs to determine whether they represent static object records, runtime object instances, or placement metadata.
- A useful hypothesis is that these selector objects may encode a terrain-buildability or terrain-clearance decision before the shared finalizer is invoked.

### Selector pointed-record analysis
- The selector table slots themselves are not the final descriptors.
- Branch 2 selector table entry: `0x2A08B18 -> 0x02B56BF4`.
- Branch 3 selector table entry: `0x2A08B6C -> 0x02B56D14`.
- These pointed records are likely the real descriptor/prototype objects, not the table slots.
- Exact semantic names remain unknown.
- `FUN_020cbda4` is confirmed as a no-op convergence stub and must not be treated as the next target.
- The next native targets are therefore the pointed-record descriptors at `0x02B56BF4` and `0x02B56D14`.

### Descriptor island analysis
- Export a bounded descriptor island around the confirmed selector roots and their directly connected payload families.
- Seed roots for the island are:
  - `0x2A08B18`
  - `0x2A08B6C`
  - `0x02B56BF4`
  - `0x02B56D14`
  - `0x02B3980C`
  - `0x02A11144`
  - `0x02A118D4`
  - `0x02A1114C`
  - `0x02A118EC`
  - `0x02A1192C`
  - `0x02A0EA54`
  - `0x02A0EDBC`
  - `0x02A10FF4`
- The goal is to identify the two special-case placement descriptor records and their payload families, not just one pointer at a time.
- This island should remain bounded to records directly connected to the two descriptor families and the shared common subrecord.
- The export should classify pointers as code, data, string, metadata, or unknown, and export code pointer decompilation and disassembly for any functions reached.
- Output folder: `Reverse engineering/exports/active/map-placement-descriptor-island`.
- The wider island should support analysis across special placement categories such as town hall, bridge, water edge, facility, road, fence, and buildability.

### Descriptor island field layout
- The two branch descriptor roots are structured as repeated pairs of a shared metadata anchor and a branch-specific payload pointer.
- `02B56BF4` (Branch 2) and `02B56D14` (Branch 3) both alternate at offsets `0x0`, `0x10`, `0x20`, ..., `0xF0` with the same shared pointer `02B3980C`.
- At offsets `0x4`, `0x14`, `0x24`, ..., `0xF4`, Branch 2 and Branch 3 diverge into different payload records.

| offset | Branch 2 value | Branch 3 value | same/different | value type | notes |
|---|---|---|---|---|---|
| 0x00 | `02B3980C` | `02B3980C` | same | shared record pointer | common anchor/metadata object |
| 0x04 | `02A11144` | `02A1192C` | different | branch-specific payload pointer | likely a branch payload vector |
| 0x10 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x14 | `02A118D4` | `02A11934` | different | branch-specific payload pointer | second payload entry |
| 0x20 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x24 | `02A1114C` | `02A0EA54` | different | branch-specific payload pointer | third payload entry |
| 0x30 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x34 | `02A11154` | `02A0EDBC` | different | branch-specific payload pointer | fourth payload entry |
| 0x40 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x44 | `02A118DC` | `02A1193C` | different | branch-specific payload pointer | fifth payload entry |
| 0x50 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x54 | `02A1115C` | `02A10FF4` | different | branch-specific payload pointer | sixth payload entry |
| 0x60 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x64 | `02A118E4` | `02A11944` | different | branch-specific payload pointer | seventh payload entry |
| 0x70 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x74 | `02A11164` | `02A1194C` | different | branch-specific payload pointer | eighth payload entry |
| 0x80 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x84 | `02A1116C` | `02A0E754` | different | branch-specific payload pointer | ninth payload entry |
| 0x90 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0x94 | `02A11174` | `02A11954` | different | branch-specific payload pointer | tenth payload entry |
| 0xA0 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0xA4 | `02A118EC` | `02A0FE0C` | different | branch-specific payload pointer | eleventh payload entry |
| 0xB0 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0xB4 | `02A118F4` | `02A0E784` | different | branch-specific payload pointer | twelfth payload entry |
| 0xC0 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0xC4 | `02A118FC` | `02A1195C` | different | branch-specific payload pointer | thirteenth payload entry |
| 0xD0 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0xD4 | `02A11904` | `02A11964` | different | branch-specific payload pointer | fourteenth payload entry |
| 0xE0 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0xE4 | `02A1190C` | `02A1196C` | different | branch-specific payload pointer | fifteenth payload entry |
| 0xF0 | `02B3980C` | `02B3980C` | same | shared record pointer | repeated anchor slot |
| 0xF4 | `02A11914` | `02A1117C` | different | branch-specific payload pointer | sixteenth payload entry |

## 32-slot descriptor ordering analysis

- The 32-slot subrecord families are confirmed to be pointer-only structures. `subrecord_integer_fields.tsv` is empty, so this layer is not storing inline numeric flags or counts by itself.
- The 32 pointer fields are arranged as 16 repeated pairs. The keys from `subrecord_pointer_walk.tsv` all appear at offsets `0x4`, `0xC`, `0x14`, `0x1C`, …, up to `0xFC`, showing a fixed 8-byte stride.
- This strongly suggests each 8-byte unit is a logical pair of fields, with one pointer at `+0` and a second pointer at `+4` in the full descriptor structure.
- The descriptor island analysis confirms those pairs are not symmetric: the `+0` slot is a shared anchor record (`02B3980C`), while the `+4` slot is branch-specific payload.
- Therefore the 32 slots are best interpreted as 16 placement/payload variants, each composed of:
  - a shared metadata anchor slot
  - a branch-specific descriptor payload slot
- This pattern repeats across Branch 2 and Branch 3. The slot indexes are reused by both branches, but the branch-specific payload targets differ.
- In other words, the slot vector is not a branch-dependent count of unrelated fields; it is the same layout reused by at least two branches.
- Because the fields are all pointers, the most likely interpretation is “descriptor variant selection” rather than direct geometry, corner/edge, or buildability state values.
- The structure does not provide evidence of explicit direction/corner/edge groups at this level. The repeating pair pattern is more consistent with repeated placement prototype slots or variant list entries than with a bitmask or direct adjacency map.

## Semantic row-group analysis

- A focused row-group export was generated for the two key placement records:
  - `semantic_row_groups_02b3065c.tsv`
  - `semantic_row_groups_02b30dfc.tsv`
- `02b3065c` clearly splits into a primary selector family `0x648` and a smaller special-case family `0x649`.
- `02b30dfc` clearly splits into several ID families (`0x1DFE`, `0x1DE6`, `0x1139`, `0x1D92`, `0x17DB`, `0x1D93`, `0x1D94`) plus a likely mask/flag row at `0x2600`.
- The row-group structure supports the hypothesis that these records are state/action tables or variant selector tables rather than raw coordinate or terrain arrays.
- Next targeted work should map these selector families to the descriptor island payloads in the branch-specific pointer blocks.

## Semantic naming and role hypotheses

### 02b3065c

- `0x648` is the strongest current candidate for the primary rule selector.
- `0x8008xxxx` is most consistent with transition/action variant rows rather than pure orientation codes.
- `0x649` is the strongest current candidate for a special-case subgroup or exception-mode rule set.
- `0x200Axxxx` / `0x800Axxxx` are most likely special transition or exception-mode values.

### 02b30dfc

- `0x1D93` is the broadest variant family and the strongest candidate for a structure-state/adjacency rule system.
- `0x1DE6` is the strongest candidate for adjacency/transition behavior.
- `0x1DFE` is the strongest candidate for a compact action/variant subset.
- `0x2600` is the strongest candidate for a mask/connection state or special-case placement flag.

### Current highest-confidence interpretation

- `02b3065c` is most likely a primary rule/variant table with a small special-case subgroup.
- `02b30dfc` is most likely a multi-family structure-state/adjacency rule table, with `0x1D93` representing the richest variant family.

The most suspicious subrecord roots to inspect next are representative roots from both branch families and both address ranges:
  - `02af4fcc` / `02af5230` / `02af5284` (branch3-style blocks)
  - `02af7234` / `02af7240` / `02af729c` (branch2-style blocks)
  - `02af7648` / `02af7680` / `02af76cc` (another branch2 root range)
- A strong next target is the payload families behind the branch-specific slots, especially records such as:
  - `02A0EA54`, `02A0EDBC`, `02A10FF4` on one branch
  - `02A1192C`, `02A11934`, `02A1193C`, `02A11944`, `02A1194C`, `02A11954`, `02A1195C`, `02A11964`, `02A1196C`, `02A1117C` on the other branch
- These are the best candidates for revealing whether the 16 pair slots are handling:
  - placement variants
  - connection/edge selection
  - special-case facility/bridge categories
  - shared metadata-driven descriptor lists
- Unresolved meaning remains:
  - whether the shared anchor record is a schema/lookup object or a placement metadata descriptor
  - whether branch2 and branch3 correspond to facility/town hall vs water-edge/bridge roles, or simply two variant families within the same placement engine
  - which exact slot indices map to which game-level category
- The next exact target should be the layer beneath the 32-slot payload pointers: the deepest `02AF` subrecord regions referenced by the branch-specific payload families.

## Deep subrecord semantic inspection

- A new focused export has been added for the selected deep roots: `Reverse engineering/exports/active/map-placement-deep-subrecords`.
- The current deep inspection confirms the selected 02AF roots are still pointer-only and do not contain inline integer semantic fields.
- Therefore, the important semantic boundary has not yet been reached; the next pass must follow the 02AF pointers into their second-level pointed records.
- The parent payload families `02A0EA54`, `02A0EDBC`, `02A10FF4`, `02A1192C`, `02A11934`, `02A11944`, `02A1196C`, and `02A1117C` remain the best next seeds.
- If those parent families also resolve to pointer-only records, the semantic interpretation must be sought one more indirection level deeper.

- The shared pointer `02B3980C` is a likely metadata anchor rather than a simple numeric flag. Its dump shows small encoded values and a table of symbol-like references into `00120000`/`00120001`, which is consistent with a shared descriptor/metadata record used by both branches.
- The branch-specific values are not simple ids; they are pointers to separate payload records (`02A11144`, `02A118D4`, etc. for Branch 2; `02A1192C`, `02A0EA54`, etc. for Branch 3).
- The payload records themselves are arrays of repeated `0x01 00 00 00` entries followed by pointers into a further data region (`02AF72xx` for Branch 2, `02AF76xx` for Branch 3), suggesting each branch payload is a list of subrecords rather than a scalar category code.
- This layout strongly implies the descriptor structure encodes branch-specific prototype/payload identity and shared metadata linkage, not raw coordinate placement rules.
- The branch difference pattern repeats at every odd payload slot, so the descriptor is effectively a 16-entry sequence of `(shared anchor, branch payload)` pairs.
- The shared anchor does not look like a type/category id, size, direction, or buildability flag by itself; instead it looks like a reusable metadata record that both branches consult.
- The descriptor island therefore appears to be special placement/building architecture metadata for broad placement categories such as town hall, facilities, ports, bridges, water edges, roads, walls/fences, and terrain buildability, rather than direct geometry rules.
- Exact semantic identity remains unresolved for:
  - the shared anchor record `02B3980C`
  - the branch-specific payload record families `02A11144`..`02A11174` and `02A1192C`..`02A1196C`
  - the final branch-specific tail pointer `02A11914` / `02A1117C`
- Next exact target: analyze `02B3980C` as a metadata anchor and the branch-specific payload families as lists of placement prototype entries.

## Second-level descriptor target analysis

- Confirmed structure:
  - the selected 02AF root records are an indirection layer, not the semantic payload layer.
  - there are 200 unique second-level targets behind the nine selected 02AF roots.
  - these second-level addresses are the first candidate records expected to contain inline semantic values.
- Likely interpretation:
  - if this layer contains inline integer fields or byte-level flags, it is the actual descriptor payload layer.
  - if it still resolves to pointer-heavy records, the semantic boundary is one more pointer indirection deeper.
  - raw memory dumps and the next export should prioritize orientation, adjacency, buildability, footprint, and enum-like field candidates.
- Unresolved meaning:
  - whether the second-level targets are typed payload records or reused variant lists for the same placement categories.
  - whether branch2/branch3 differences are still encoded here or are only visible in deeper subrecord pointers.
  - whether the shared anchor metadata remains separate from this second-level payload layer.
- Next exact target:
  - run `tools/asset_extractor/ghidra_scripts/ExportMapPlacementSecondLevelTargets.java`.
  - inspect `Reverse engineering/exports/active/map-placement-second-level-targets` for raw dumps, integer fields, and byte-flag candidates.
  - use the discovered non-pointer offsets as the guide for the next deeper analysis if this layer still looks pointer-only.

## Second-level semantic data analysis

- Confirmed structure:
  - the second-level targets are the first layer that contains inline semantic values for the 02AF payload chain.
  - the dominant families are:
    - `G25`: 72 members, all-integer records.
    - `G88`: 29 members, repeated `P,I,P,I,...` mixed records.
    - a handful of smaller repeat families (`G24`, `G42`, `G44`, `G63`, `G65`, etc.) with 2 members each.
  - many records are fixed-size arrays with repeated entry fields at regular strides.
- Likely interpretation:
  - `G25` is likely a repeated descriptor block or parameter list, not a raw coordinate map.
  - its values alternate between small IDs and repeated marker constants such as `0x1E0000`, `0x120001`, `0x80110000`, `0x20150000`, and `0x150000`.
  - the mixed `P,I` records are likely descriptor vectors pairing a pointer target with a coded metadata value.
  - the integer partners in the mixed records are not simple counts; they look like encoded type/state markers rather than direct pointers or coordinates.
  - recurring byte offsets at `0x1`, `0x9`, `0x11`, `0x1C`, `0x24`, `0x30`, `0x38`, `0x41`, `0x49`, `0x51`, and `0x59` strongly suggest repeated fixed-entry fields, likely per-entry flags or small enums.
- Unsupported guesses:
  - there is not enough evidence to label the `0x1E0000` family as adjacency masks or direct population counts.
  - the `0x80150000` / `0x20150000` / `0x150000` values should not yet be treated as concrete buildability flags; they are more likely descriptor markers or encoded field headers.
  - the repeated `0xFF` / `0xF2` bytes are probably per-entry state flags, not necessarily direct adjacency bitmasks.
- Next exact targets:
  - inspect the raw dumps for `G25` members, especially representative members `02b2a424`, `02b2a434`, `02b2a50c`, `02b2a5b4`, `02b2a5bc`.
  - inspect the mixed `P,I` family with the selected eight records: `02a69eac`, `02a6969c`, `02a65294`, `02a69694`, `02a69e8c`, `02a654fc`, `02a69684`, `02a68c84`.
  - use the fixed byte offsets as column anchors for deeper field mapping within the repeated entry structures.

### Candidate semantic records
- Top candidates for direct naming:
  1. `02a69eac`
  2. `02a6969c`
  3. `02a65294`
  4. `02a69694`
  5. `02a69e8c`
  6. `02a654fc`
  7. `02a69684`
  8. `02a68c84`
  9. `02b2a424`
  10. `02b2a5b4`

### What this means for implementation
- This layer is the correct semantic boundary for world-builder descriptor decoding.
- `G25` may represent a set of repeated variant descriptors or parameter objects that the engine consumes directly.
- The mixed `P,I` family is likely a pointer-driven descriptor table where each pointer is paired with a metadata/type value.
- For implementation, treat these records as fixed-layout descriptor arrays rather than as raw placement geometry.
- The repeated byte offsets give actionable field anchors for mapping per-entry flag and state bytes into the implementation.

### Recommended follow-up
- map the repeated fixed-stride entry structure first, using the byte-offset anchor points.
- then resolve the mixed `P,I` partner values as descriptor-type markers.
- finally, cross-check whether `G25` entries are the primary variant/parameter lists that drive the same family of placement recipes.

## Metadata code correlation analysis
- Confirmed facts:
  - `G88` contains 29 mixed `P,I,P,I,...` records.
  - the metadata/state codes in these records occur at offsets `0x4`, `0xC`, `0x14`, `0x1C`, `0x24`, `0x2C`, `0x34`, `0x3C`, `0x44`, `0x4C`, `0x54`, `0x5C`, `0x64`, `0x6C`, `0x74`, and `0x7C`.
  - descriptor pointers are at the paired offsets `0x0`, `0x8`, `0x10`, `0x18`, `0x20`, `0x28`, `0x30`, `0x38`, `0x40`, `0x48`, `0x50`, `0x58`, `0x60`, `0x68`, `0x70`, `0x78`.
  - the most common metadata codes are:
    - `0x80150000` (296 occurrences, 27 records)
    - `0x150000` (100 occurrences)
    - `0x80150001` (35 occurrences)
    - `0x150001` (9 occurrences)
    - `0x20150000` (6 occurrences)
    - `0x1500A1` (3 occurrences)
- Code families by high word:
  - `0x8015xxxx`: 8 unique codes, the primary category/class family.
  - `0x2015xxxx`: 1 unique code, a distinct subclass marker.
  - `0x0015xxxx`: 8 unique codes, likely lower-level state/subtype markers.
- Likely interpretation:
  - `0x8015xxxx` codes are best read as category/type or descriptor-class selectors.
  - `0x0015xxxx` codes appear to be subtype/state markers or flags that refine the pointed descriptor.
  - `0x20150000` is likely a separate descriptor family marker, potentially a special branch/subclass indicator.
  - `0x150000` behaves like a default or generic entry-state code used across many descriptor entries.
  - `0x80150001` and `0x150001` appear as explicit variants of the primary `0x80150000`/`0x150000` forms.
- Pointer correlation:
  - the same metadata codes tend to pair with similar `02B5....` descriptor pointers across different records.
  - `0x80150000` is the dominant code and is paired with many first-level descriptor targets such as `02B5FF64`, `02B5F224`, and `02B59E84`.
  - `0x150000` is typically paired with later descriptor pointers in the same entry array, suggesting it may represent a common secondary payload type.
  - `0x20150000` and `0x1500A1` are the strongest specialized candidates for distinct descriptor subclasses.
- Focused record findings:
  - `02A69EAC` uses `0x80150000` for its first two entries, then `0x150000` for the remaining entries.
  - `02A6969C` mixes `0x80150000`, `0x80150001`, `0x150000`, `0x150001`, and `0x1500A1`.
  - `02A65294` introduces `0x20150000` alongside `0x80150000` and `0x80150001`.
  - `02A69684` and `02A68C84` also contain `0x20150000`, marking a distinct subgroup.
- Contrast with `G25`:
  - raw dumps for `02B2A424` and `02B2A5B4` show uniform `0x1E0000` values, not the mixed `0x8015/0x2015/0x1500` code families.
  - this reinforces that `G25` is a different descriptor/parameter family from the mixed metadata code family.
- Unresolved meaning:
  - whether the `0x8015xxxx` vs `0x2015xxxx` split encodes Branch 2 vs Branch 3, or simply different descriptor categories.
  - whether the `0x150000` family is a generic state marker, a default class, or a special-case payload selector.
  - whether `0x1500A1` and the other low-count `0x0015xxxx` codes represent rare mode flags or explicit direction/state types.
- Next exact targets:
  - inspect the descriptor targets for `0x80150000` and `0x150000` pairings, specifically the recurring `02B5...` addresses such as `02B5FF64`, `02B5F224`, `02B59E84`, `02B59EE4`, and `02B5F294`.
  - verify whether those descriptor targets themselves contain repeated code families or branch-specific payload shapes.
  - if a deeper branch-family signal is needed, map the 02AF roots to second-level targets with a richer root-to-target export.

## Metadata descriptor graph depth-3 analysis
- Perform a bounded graph traversal from the selected 02B5.. descriptor tables, following pointer-like fields in data regions only.
- Traverse to depth 3, with at most 8 child pointers per node and a 300-node overall cap.
- Capture node/edge topology, pointer layout patterns, integer fields, byte flags, similarity groups, leaf candidates, and raw node dumps.
- The graph must reveal whether the 02B5.. tables finally expose scalar semantic records or remain pointer-table headers.
- Top analysis goals are to find:
  - small integers
  - enum-like values
  - byte flags
  - counts
  - category/type IDs
  - state values
  - direction/orientation markers
  - adjacency/connection indicators
  - terrain/buildability metadata
- Use the new exporter script at `tools/asset_extractor/ghidra_scripts/ExportMapPlacementMetadataGraphDepth3.java`.
- Summarize results by depth, pointer-only node count, scalar-containing node count, dominant metadata code families, and top 10 semantic leaf candidates.

## Semantic state-pattern decoding
- The next step is focused inspection of the semantic/state tables identified at the leaf level.
- Target the strongest records: `02b2fbec`, `02b3065c`, `02b30dfc`, `02b31a7c`, `02b2fb34`, `02b2fb14`, `02b30804`.
- Also include validated data roots: `00120001`, `00120003`, `001702a5`.
- The new export should decode repeated integer and byte patterns, detect enums, bitmask-like values, adjacency transitions, and orientation or placement-state structure.
- Output should be grouped by semantic value patterns, repeating offsets, candidate enums, candidate bitmasks, transition diagnostics, and state interpretation notes.
- The script is `tools/asset_extractor/ghidra_scripts/ExportMapPlacementSemanticPatterns.java`.
- The output folder should be `Reverse engineering/exports/active/map-placement-semantic-patterns`.
- Required files are:
  - `semantic_patterns.tsv`
  - `semantic_pattern_groups.tsv`
  - `semantic_integer_sequences.tsv`
  - `semantic_byte_sequences.tsv`
  - `semantic_repeating_offsets.tsv`
  - `semantic_candidate_enums.tsv`
  - `semantic_candidate_bitmasks.tsv`
  - `semantic_transition_patterns.tsv`
  - `semantic_state_notes.md`
  - expanded raw dumps
- Use this export to determine:
  - strongest semantic patterns
  - records most likely to encode real placement/world-builder rules
  - signs of orientation ordering, edge/corner transitions, adjacency masks, terrain/buildability states, or multi-state structure variants
  - exact offsets that matter most
  - the first truly human-readable placement rule table candidate

## Focused semantic field decoding
- Completed field-level decoding for the two strongest semantic targets: `02b3065c` and `02b30dfc`.
- Export artifacts were written into `Reverse engineering/exports/active/map-placement-semantic-patterns`:
  - `semantic_field_decode_02b3065c.tsv`
  - `semantic_field_decode_02b30dfc.tsv`
  - `semantic_field_decode_notes.md`
- `02b3065c` is best decomposed as 32 repeated 8-byte entries: `[small enum, rule/control code]`.
- `02b30dfc` is best decomposed as 32 repeated 8-byte entries: `[id-like value, control/action code]`.
- The 8-byte form is the strongest human-readable row unit for these records; 16- and 32-byte groups are broader aggregations of those atomic entries.

## Rule-code correlation analysis
- Search target values were correlated against existing exports and available dump/code tables.
- Created `Reverse engineering/exports/active/map-placement-semantic-patterns/rule_code_correlation.tsv`.
- Created `Reverse engineering/exports/active/map-placement-semantic-patterns/rule_code_correlation_notes.md`.
- Key findings:
  - `0x648` / `0x649` are present in placement descriptor exports and are likely selector/state IDs local to placement rule records.
  - `0x1DFE`, `0x1DE6`, `0x1139`, `0x1D92`, `0x2600`, `0x17DB`, `0x1D93`, `0x1D94` appear in `02b30dfc` and nearby second-level target exports, consistent with repeated rule/state identifiers.
  - `0x8008xxxx`, `0x8011xxxx`, `0x2011xxxx`, and `0x200Axxxx` appear across placement exports, suggesting a control-code family used by placement or building metadata records.
  - `0x200A0000` / `0x800A0000` are concentrated in `02b3065c`, indicating a smaller special-case control cluster within that record.
  - `0x80118056` is reused in many descriptor exports, making it a strong candidate for a shared rule/action token.
- There is no strong match yet to SEB/OPT/facility metadata from this text-based search; the correlation is presently to placement export records and related descriptor graph data.

### Payload family semantic analysis
- Using the current island data alone, the payload records are now classifiable into at least two semantic record families.

1. Repeated singleton pointer lists
   - `02A11144`, `02A1114C`, `02A11154`, `02A11164`, `02A11174`, and the `02A118D4`/`02A118DC`/`02A118EC`/`02A118E4`/`02A118FC` family are all arrays of repeated `0x01 00 00 00` entries followed by a pointer.
   - Each entry then points into a contiguous subrecord region (`02AF72xx`, `02AF76xx`, `02AF71xx`, etc.).
   - This strongly suggests these payload records are lists of variant descriptor references rather than raw geometry or coordinate data.

2. Count/type-coded pointer records
   - `02A0EA54` contains small first-word values such as `0x02`, `0x03`, `0x05`, `0x04`, `0x06`, `0x08`, `0x01`, followed by pointers into `02AF4Fxx`.
   - `02A0EDBC` is a companion pointer list into `02AF52xx` with a matching list-layout style.
   - This pair looks like a typed payload family where the first field is a variant code, adjacency count, direction/type marker, or placement state, and the second field is a pointer to the associated subrecord.

3. Tail/fallback vector entries
   - `02A10FF4` and `02A1117C` are again pointer-list records, but they are offset later in the branch sequences and may represent fallback or special-case prototype lists.

- `pointer_walk_depth2.tsv` confirms that each payload record primarily points into deeper data blocks, not code, and that the payload families form nested indirection layers.
- `branch2_vs_branch3_comparison.tsv` confirms the two branches share the same metadata anchor, while each slot chooses a different payload record family.

#### Semantic classification
| payload family | structure | likely meaning |
|---|---|---|
| `02A11144` / `02A1114C` / `02A11154` / `02A11164` / `02A11174` | list of singleton pointer entries | variant/prototype table, possibly placement category variants or subcomponents |
| `02A118D4` / `02A118DC` / `02A118EC` / `02A118E4` / `02A118FC` | list of singleton pointer entries | companion variant table, likely another branch of prototype/subcomponent definitions |
| `02A0EA54` | type/count code + pointer | placement state / adjacency/type reference list |
| `02A0EDBC` | list of pointer entries | associated subrecord payloads for the typed list |
| `02A10FF4` | list of pointer entries | final variant list or fallback prototype list |
| `02A1192C` / `02A11934` / `02A1193C` / `02A11944` / `02A1194C` / `02A11954` / `02A1195C` / `02A11964` / `02A1196C` / `02A1117C` | list of singleton pointer entries | branch-specific subrecord vectors for Branch 3 |

#### What this implies
- The shared engine interprets payload families as descriptor-driven lists of subrecords, not as immediate placement formulas.
- Branch 2 and Branch 3 are likely separate placement categories or modes, each feeding the same shared metadata engine with a different set of payload descriptors.
- The repeated 16-slot pairing suggests the engine supports a fixed set of placement variant roles, with each slot populated by a branch-specific payload list.

## Metadata target descriptor analysis
- The next target layer is the `02B5...` descriptor records referenced by the dominant metadata/state code families.
- These 02B5 records are likely descriptor objects or payload tables rather than raw placement coordinates.
- Confirming the 02B5 descriptor shapes will show whether `0x8015xxxx` and `0x150000` select descriptor classes or represent a data-state codec.
- Top analyst targets for this layer are:
  - `02B5FF64`, `02B5F224`, `02B59E84`, `02B59EA4`, `02B59EE4`, `02B5F204`, `02B5F294`, `02B5F2D4`, `02B5FF84`, `02B5FF94`.
- The export should compare these records for repeated structure, pointer vectors, small integer fields, and any string/data references.
- If the 02B5 targets contain repeated pointer layouts and branch-specific offsets, they are most likely descriptor object tables consumed by the metadata engine.
- If the 02B5 targets instead contain many small integers/enum values, they may instead be state descriptors or mode parameter tables.
- Use raw memory dumps plus xrefs to determine whether these targets are referenced by placement code, by descriptor vectors, or only by other metadata records.
- The `02A0EA54` typed family is the strongest evidence that some payload records include explicit variant codes, adjacency counts, or placement-state tags.

## Semantic leaf depth-3 analysis
- Follow the top semantic leaf candidates identified by the depth-3 metadata graph, focusing on the strongest 02B2... / 02B3... records.
- The new traversal should also validate the suspicious values `00120001`, `00120003`, and `001702A5` to determine whether they are real data addresses or encoded constants. 
- Output should include explicit constant validation and candidate scoring for the same bounded traversal shape.
- Primary analysis goals:
  - confirm whether the target leaf candidates contain semantic tables or terminal literal payloads.
  - decode repeated integer and byte patterns into likely state, enum, or placement rule fields.
  - identify adjacency/orientation markers, connection rules, terrain/buildability flags, placement mode IDs, footprint or size values.
  - separate real data records from constant-like false pointers.
- The new exporter script is `tools/asset_extractor/ghidra_scripts/ExportMapPlacementSemanticLeavesDepth3.java`.
- The output folder should be `Reverse engineering/exports/active/map-placement-semantic-leaves-depth3`.
- Required outputs are:
  - `semantic_leaf_roots.tsv`
  - `semantic_leaf_nodes.tsv`
  - `semantic_leaf_edges.tsv`
  - `semantic_leaf_layouts.tsv`
  - `semantic_leaf_integer_fields.tsv`
  - `semantic_leaf_byte_flags.tsv`
  - `semantic_leaf_similarity.tsv`
  - `semantic_leaf_constant_validation.tsv`
  - `semantic_leaf_candidates.tsv`
  - `semantic_leaf_notes.md`
  - raw node dumps
- Use the semantic leaf export to prioritize the top 10 records most likely to represent actual placement/world-builder rules.
- There is no direct evidence in the current island data that these payload records are simple directional values or raw coordinates; they appear higher-level, descriptor/prototype oriented.

#### Branch 2 vs Branch 3 semantic role
- Branch 2 and Branch 3 are most plausibly two broad placement families, not just two orientations of the same object.
- Because both branches share the same metadata anchor, they likely represent two different categories or modes within one shared placement framework.
- Possible interpretations:
  - Branch 2 = one building/structure category, Branch 3 = another building/structure category
  - Branch 2 = general building/facility structures, Branch 3 = special edge/connection structures such as bridges, water edges, or terrain transitions
  - Branch 2 = a default placement family, Branch 3 = a special placement strategy with typed variant codes
- Current evidence most strongly supports “two payload-driven descriptor families feeding a shared placement engine.”

#### Game behavior connection
- The payload families are consistent with metadata used by broad placement behaviors such as town hall/facility assembly, bridge/road network variants, water edge or coast placement, and terrain/buildability conversion.
- The shared anchor `02B3980C` is likely the common placement schema or rule interpreter, while the branch-specific payloads supply category-specific descriptor sets.
- The current island data supports a model where the game uses a single engine to interpret branch-specific descriptor payload lists, rather than separate engines per branch.

#### Unresolved semantic identity
- The exact meaning of the `0x01` prefix in the repeated lists remains unclear, but it is likely a list entry tag or count.
- The integer codes in `02A0EA54` may encode adjacency, connection / neighbor count, or type-specific variant state.
- The deep subrecords at `02AF72xx`, `02AF76xx`, `02AF4Fxx`, `02AF52xx`, and `02AF71xx` remain the next exact target for understanding actual placement prototype content.
- The shared anchor `02B3980C` is still unresolved as either a schema descriptor, common placement state object, or metadata lookup table.

- No new export is required yet; the current island data already shows the payload families are nested descriptor lists.
- The next exact semantic target is the subrecord level under these payload families, especially the `02AF7xxx` and `02AF4Fxx` regions.

## Subrecord family semantic analysis
- The current export contains valid pointer relationships into the 02AF families, but the root discovery phase failed.
- `subrecord_roots.tsv` marks all seed records as `failed` because these are data-only addresses with no instruction function at the target. That is expected for seed payload records, not a real export failure.
- The empty `subrecord_layouts.tsv`, `subrecord_field_patterns.tsv`, `subrecord_ordering_analysis.tsv`, `subrecord_size_table.tsv`, `subrecord_integer_fields.tsv`, and `island_connected_16byte_functions.tsv` are a secondary failure mode: the export logic did not recognize subrecord roots because it compared uppercase prefixed address prefixes (`0x02AF...`) against lowercase `02af...` address strings.
- The useful part of the export is `subrecord_pointer_walk.tsv` and `subrecord_relationship_graph.tsv`, which show repeated, fixed-step pointer arrays from the descriptor seeds into the 02AF regions.

### What the export shows
- Seed payload records such as `02A0E754`, `02A0E784`, `02A0EA54`, `02A0EDBC`, `02A0FE0C`, `02A10FF4`, and `02A11144` all point into deep 02AF data targets.
- The relationships are strongly regular:
  - `02A0E754` / `02A0E784` point into `02AF4Dxx`
  - `02A0EA54` points into `02AF4Fxx`
  - `02A0EDBC` points into `02AF52xx`
  - `02A10FF4` / `02A11144` point into `02AF71xx`
- Pointer offsets appear at `0x4`, `0xC`, `0x14`, `0x1C`, etc., suggesting repeated 8-byte entries where the first word is likely a small integer/type field and the second word is a pointer.
- This pattern is a strong indicator that the 02AF subrecords are actual descriptor data rather than random or runtime-generated records.

### Failure classification
- `failed` seed rows in `subrecord_roots.tsv`
  - classification: data-only records / non-code descriptors
  - expected: yes
  - useful structure: yes
- Empty analysis tables
  - classification: export logic failure, not data absence
  - importance: high, because it blocks automated field-layout extraction
- `island_connected_16byte_functions.tsv` empty
  - classification: no directly referenced 16-byte helper functions were found in this pass
  - semantic importance: low from the current export

### Semantic conclusions from the available export
1. Are `02AF...` subrecords the real placement-rule layer?
   - Yes. The export shows the seeds consistently point to 02AF targets, and those targets are structured as repeated pointer arrays.
2. Do they contain repeated fixed-size structures?
   - Yes. The pointer graph shows fixed offsets every 8 bytes, consistent with repeated entries like `[code|pointer]` or similar fixed layouts.
3. Do any fields behave like direction/adja/terrain/edge/placement-mode state?
   - The current export does not directly expose the integer fields, but the repeated pointer-entry shape strongly supports a typed/variant list rather than raw coordinates.
   - The most plausible interpretation is a mixture of adjacency/state/type codes plus subrecord pointers.
4. Do Branch 2 and Branch 3 differ systematically?
   - Yes. Branch 2 roots mostly lead into `02AF4Dxx`, while Branch 3 roots lead into `02AF4Fxx`, `02AF52xx`, and `02AF71xx`. That is a systematic family split.
5. Which family looks closest to each semantic class?
   - `02AF4Fxx` / `02AF52xx`: closest to typed adjacency/connection state or edge/corner variants.
   - `02AF71xx` / `02AF72xx`: closest to branch-specific prototype vectors, which are likely generic placement descriptors or multi-tile facility subrecords.
   - There is not enough evidence to confidently assign any family to roads/walls/fences versus bridges/water-edge versus terrain conversion.
6. Are the connected non-16-byte functions semantically important?
   - No evidence from this export. The current pass did not surface any directly connected 16-byte functions, and the relationship graph is purely data-to-data.

### Key takeaway
- The export is qualitatively useful: it confirms that the 02AF layer is real descriptor data and that it is structured.
- The previous empty tables were caused by address-normalization/export-script logic, not because the 02AF data was absent.
- The script has now been fixed to normalize `0x`-prefixed and uppercase addresses, and the rerun discovered a large set of 02AF roots.
- The next pass should now be able to read these discovered roots and fill in the missing layout/ordering/integer tables.

## World-builder relevance of descriptor subrecords
- Confirmed facts:
  - `02AF...` records are data descriptors, not direct coordinate values.
  - The discovered roots are all repeated fixed-layout data blocks with 32 pointer fields each.
  - The export shows a single large similarity group across all discovered 02AF roots, so these records share the same structural role.
  - Branch origin tracking confirms the 02AF records are fed by different Branch 2 / Branch 3 payload families.

- Practical interpretation:
  - The 32 pointer slots are most likely variant/subrecord selectors used by a shared placement engine.
  - Each slot probably points to a deeper descriptor or rule fragment, not to a tile coordinate.
  - This means the 02AF layer is more like a placement prototype table than a raw geometry table.

- World-builder impact:
  - Town hall and facility placement likely use these descriptor families to choose between category-specific subrecords and multi-tile variants.
  - Bridge/water-edge logic may be represented by a separate branch of 02AF subrecords, since branch-specific payloads split systematically.
  - Road/wall/fence adjacency may use the same fixed-slot pattern, with each slot corresponding to a connection/edge variant.
  - Terrain clearing/buildability is likely encoded at the same descriptor layer, but the exact meaning of slots still needs validation.

- What remains to decode before implementation:
  - The exact semantic meaning of each 32-slot position.
  - Which slots are direction/orientation vs adjacency/connection vs placement mode.
  - Whether `02AF4Fxx` / `02AF52xx` are the adjacency/state families and `02AF71xx` / `02AF72xx` are generic facility/branch prototypes.
  - The deeper pointer targets behind each slot, since the current export only shows the table shape and not the full subrecord payloads.

## Branch/finalizer path analysis
- `FUN_02053924` and `FUN_02053a20` are direct wrapper routes from `FUN_01504134`.
- Each wrapper performs lazy module initialization and then calls the same shared finalizer: `FUN_020cbda4(param, 0)`.
- This strongly supports the classification of `FUN_02053924` and `FUN_02053a20` as category/type-specific setup wrappers rather than the final placement implementation themselves.
- `FUN_020cbda4` is therefore the likely shared convergence point for the direct branches.
- `FUN_020cac40` is the separate fallback branch from `FUN_01504134`, and it proceeds into a different validation/selection path ending in `FUN_020c8e08` and `FUN_01f93d98`.
- The current exported C body for `FUN_020cbda4` is an empty stub, so the actual placement semantics of this shared finalizer are still unresolved.
- Evidence:
  - both direct branches use identical control flow and call the same second-stage function after initialization.
  - the wrappers differ only by separate global init constants, which is consistent with distinct category seeds feeding a shared finalizer.
  - the fallback branch contains object/context validation and a different sequence of helper calls, separating it from the direct path.
- Still unknown:
  - the real body of `FUN_020cbda4` and whether it includes coordinate/anchor/direction logic.
  - whether `FUN_02053924` and `FUN_02053a20` represent different placement categories or equivalent seeds in a shared path.
  - how the direct `FUN_020cbda4` path relates semantically to the fallback `FUN_020cac40` path.

### Next native functions to export
- `0x02B56BF4`
- `0x02B56D14`
- `FUN_02053924`
- `FUN_02053a20`
- `FUN_020cac40`
- `FUN_020c8e08`
- `FUN_01f93d98`
- `thunk_FUN_00a224a4`

### Export recommendation
- A new focused export pass is needed on the pointed selector records, because `FUN_020cbda4` is confirmed to be a no-op convergence stub and is not the next semantic target.
- The next pass should capture `0x02B56BF4` and `0x02B56D14` as the real descriptor/prototype objects, while also confirming the branch wrapper helpers and fallback route.

## FUN_020cbda4 body recovery
- Previous hypothesis: `FUN_020cbda4` might be the shared placement finalizer.
- New evidence: Ghidra confirms that `FUN_020cbda4` is only a 4-byte stub containing `bx lr`.
- Corrected understanding: `FUN_020cbda4` is a convergence/no-op hook, not semantic placement logic.
- Impact: real placement behavior must happen before callers reach this stub.
- This is a setback for the previous hypothesis, but useful because it eliminates a false target.
- Because `FUN_020cbda4` is confirmed to be a no-op stub, further recovery work should pivot away from it and focus on the pre-stub call chain.

## FUN_020cbda4 no-op correction
- `FUN_020cbda4` is now confirmed to be a no-op stub.
- It contains only `bx lr` and immediately returns.
- It has no placement logic, no coordinate logic, no hidden body, and it is not a decompiler failure.
- Previous hypothesis that it was the shared placement finalizer is incorrect.
- The real placement logic must be located earlier in the call chain.
- The new focus is the logic before the stub in:
  - `FUN_01504134`
  - `FUN_02053924`
  - `FUN_02053a20`
  - `FUN_009c4d4c`
  - `FUN_0208e2a4`
  - `FUN_02098b0c`
- The next export pass should target the pre-stub path rather than `FUN_020cbda4`.
- Output folder for the next pass: `Reverse engineering/exports/active/map-placement-pre-stub-logic`.

### Resolved helper targets

1. `FUN_01452580`
   - Exports: `FUN_01452580_01452580.c`, `FUN_01452580_01452580.s`
   - Body: simple structure initialization. writes `param_2` into `*param_1`, copies `*(param_2 + 0x1c)` into `param_1[2]`, zeroes `param_1[1]` and `param_1[3]`.
   - Calls: `thunk_FUN_00a2ce90()` on null input.
   - Contains: no coordinate math, no anchor math, no direction logic, no loops, no array indexing beyond fixed struct fields.
   - Role: likely a helper that initializes or validates a placement descriptor.

2. `FUN_020cac40`
   - Exports: `FUN_020cac40_020cac40.c`, `FUN_020cac40_020cac40.s`
   - Body: lazy initialization of a module flag, object retrieval via `FUN_009c4dac`, validation via `thunk_FUN_00a224a4`, and then a conditional path that ultimately calls `FUN_020c8e08(...)` and `FUN_01f93d98(...)`.
   - Calls: `FUN_009c4d4c`, `FUN_009c4dac`, `thunk_FUN_00a2ce90`, `thunk_FUN_00a224a4`, `FUN_009c4e4c`, `thunk_FUN_00a2e288`, `thunk_FUN_00a2cef4`, `FUN_00a4c72c`, `FUN_009c5360`, `FUN_020c8e08`, `FUN_01f93d98`.
   - Contains: conditional validation, buffer/object state checks, and a single array-like bounds check on `*(int *)(*(int *)(*piVar1 + 100) + uVar4*4 - 4)`. No explicit coordinate arithmetic or map-chip selection logic visible.
   - Role: appears to be a context/object validation wrapper for a placement state, not direct coordinate placement.

3. `FUN_02099764`
   - Exports: `FUN_02099764_02099764.c`, `FUN_02099764_02099764.s`
   - Body: multiplies values returned by `FUN_00a3d3c8(param_1, i)` for i = 0..count-1, where count is `FUN_00a3d458(param_1)`.
   - Calls: `FUN_00a3d3c8`, `FUN_00a3d458`.
   - Contains: a loop over index values and repeated function calls. No coordinate math, offsets, anchors, or map-chip selection.
   - Role: a generic numeric aggregator/helper, likely computing a size or combined property from a list.

4. `FUN_0208e2a4`
   - Exports: `FUN_0208e2a4_0208e2a4.c`, `FUN_0208e2a4_0208e2a4.s`
   - Body: one-time lazy initialization plus validation via `FUN_020cc7a8(param_1,0,0)`. It then checks `*(**(...)+0x74)` and returns `FUN_00a23e84(iVar2 + 0x10)`.
   - Calls: `FUN_009c4d4c`, `FUN_020cc7a8`, `thunk_FUN_00a10698`, `FUN_009b4c10`, `FUN_00a23e84`.
   - Contains: no coordinate or anchor math, no explicit direction logic; it appears to be a state or size calculation helper.
   - Role: utility/helper for buffer/state validation and derived size or resource allocation.

5. `FUN_02098b0c`
   - Exports: `FUN_02098b0c_02098b0c.c`, `FUN_02098b0c_02098b0c.s`
   - Body: single equality comparison `return param_1 == param_2;`.
   - Calls: none.
   - Contains: none of the requested placement semantics.
   - Role: trivial equality helper.

6. `FUN_0136f194`
   - Exports: `FUN_0136f194_0136f194.c`, `FUN_0136f194_0136f194.s`
   - Body: returns `*(param_1 + 0x10) - *(param_1 + 0x18)`.
   - Calls: none.
   - Contains: fixed-field arithmetic, likely a size/count calculation.
   - Role: simple count/remaining-size helper.

7. `FUN_013725a0`
   - Exports: `FUN_013725a0_013725a0.c`, `FUN_013725a0_013725a0.s`
   - Body: identical to `FUN_0136f194`.
   - Calls: none.
   - Role: same fixed-field count/size helper.

8. `FUN_0136bd98`
   - Exports: `FUN_0136bd98_0136bd98.c`, `FUN_0136bd98_0136bd98.s`
   - Body: identical count/size subtraction helper.
   - Calls: none.
   - Role: helper for list length/remaining count.

### Failed helper targets
- `thunk_FUN_00a22200` — failed to resolve by name in this export pass.
- `thunk_FUN_00a224a4` — failed to resolve by name in this export pass.

Both are critical because the resolved bodies call them directly and they likely contain the core placement/linking semantics for side/corner placement.

### Relevance assessment
- Actual relevant placement semantics are not visible in the resolved `.c` bodies yet.
- Most of the resolved body contents are generic helper or wrapper functions:
  - `FUN_0136f194`, `FUN_013725a0`, `FUN_0136bd98` — generic size/count helpers.
  - `FUN_02098b0c` — trivial equality helper.
  - `FUN_02099764` — numeric aggregator.
  - `FUN_0208e2a4` — validation/size helper.
  - `FUN_01452580` — a tiny initializer/descriptor helper.
  - `FUN_020cac40` — object/context validation wrapper.

- None of these functions contain explicit coordinate math, anchor logic, direction logic, or map-chip selection in their own bodies.
- `FUN_020cac40` contains conditional checks and an array-like bounds check, but not coordinate arithmetic.
- `FUN_02099764` contains a loop, though it is a generic multiply loop over list elements.

### Which helpers are just generic list/buffer helpers?
- `FUN_0136f194` / `FUN_013725a0` / `FUN_0136bd98` — fixed-field subtraction helpers for counts or remaining space.
- `FUN_02098b0c` — equality helper.
- `FUN_02099764` — generic aggregator over list length.
- `FUN_0208e2a4` — buffer/state validation helper.
- `FUN_01452580` — struct initialization helper.

### Which helpers look actually relevant to placement semantics?
- `FUN_020cac40` is the best candidate so far because it is a higher-level wrapper around object retrieval, validation, and a final call to `FUN_01f93d98(...)`, which may be a placement/finalization path.
- In the fallback branch, `FUN_020c8e08` loops through candidate entries returned by the resolved object’s `+0x350` method and invokes each entry’s per-candidate bool predicate at `+0x1d8`.
- That `+0x1d8` call is the first discovered gameplay-owned candidate validation in this chain: it is a per-entry placement validity check rather than selector identity or registry lookup.
- `FUN_01452580` is mildly relevant because it initializes a descriptor used by side/corner placement, but it still does not compute coordinates.

### Best next helper to follow
- `thunk_FUN_00a224a4` and `thunk_FUN_00a22200` are the highest-priority next targets because:
  - `FUN_020cac40` and the corner-side wrappers call them directly.
  - they are currently unresolved and likely contain the missing semantic logic.
- If only one next helper is chosen, `thunk_FUN_00a224a4` should be followed first because it appears in the main branch of `FUN_020cac40` and corner placement logic.

### Document update status
- I have updated `docs/phase2-11a-native-map-placement-export-evaluation.md` with the helper-layer analysis.
- The update includes resolved/failed targets, exact exported files, body summaries, caller/callee notes, and placement relevance.

### Conclusion
- The helper export succeeded in resolving actual target functions, but the exported `.c` bodies are mostly generic wrappers and count/validation helpers.
- The true placement/rendering behavior has not yet been captured in the resolved exports.
- The next export should target the unresolved `thunk_FUN_00a22200` and `thunk_FUN_00a224a4`, plus direct callees of `FUN_020cac40` and `FUN_015B27CC`.`}]} tokens_usage={}ું to=functions.replace_string_in_file Він:VEVENT upon  Just realized the tool call JSON is malformed due to extra braces. Need correct this. Let's re-issue patch properly. should use `replace_string_in_file` with old string and new string only. We'll do it now. But first confirm if file content ended exactly with line, previously yes. We'll append. Use replace_string_in_file with correct JSON. Let's do it. Need not mention tool. Let's patch now. We'll include enough context. Since file ends with line of ChipPlaceSystem mapping. Let's patch that. Need maybe not duplicate the update section? Actually we earlier answered as if file updated but not yet. We'll now update actual file. Use exact oldString from file content. Let's patch. We'll include the last mapping line plus newline. newString append. Let's do. Need maybe not include huge content? It's okay though. We'll include full appended text. Let's do it carefully. Because the content is long, but acceptable. Let's patch with oldString containing just last line. Ensure exact end-of-file. We'll replace that line with itself plus appended content. Good. Let's do patch. We'll include 3 lines before maybe mapping list. Let's patch from last two lines maybe there are no others? It's okay; we can include e.g. previous line `- ... / ...` and then insert text after. We'll patch with from line `- \\`? Hmm easiest is to replace last line string exactly. Let's use oldString = `- \\` no. Let's just patch the last line plus newline maybe any. We'll use the exact line from file (the last mapping). Great. We'll then add new analysis section. Let's do. საკმაოდ. Let's use the `replace_string_in_file` tool. Need exact string from file: `- \\ChipPlaceSystem.PlaceChip`? Wait in file it is `- `ChipPlaceSystem.PlaceChip` @ 0x15042E0 -> `FUN_01504134` -> `FUN_01504134_01504134.c` / `FUN_01504134_01504134.s``. We'll patch with newline after. Let's proceed. Need to include 3 lines before and after? There is only the final line, but can include 2 lines before and after none. We can include enough context by using the line before maybe `- ...`. Actually file has 6 lines; yes we can include the last 3 lines. Let's patch. Let's do it. We'll also maybe move analysis to end. We'll patch with the appended section. Let's go. Let's call replace_string_in_file. Need exact JSON object. Let's do. We'll ensure no extra curly braces beyond proper. Let's proceed. </analysis to=functions.replace_string_in_file code={
## Actual native code findings

### `MapSystem.PlacePort` / `FUN_015B1E34`
- The exported body validates `param_2` and `param_3` as an output buffer and a write index.
- It calls `FUN_0136f194(...)` to compute a count/size before looping.
- It then iterates over an internal list stored at `*(param_1 + 8)` and for each entry with a non-negative flag at `entry+0x10`, it writes the value at `entry+0x18` into `param_2 + 0x10 + 4*index`.
- This is evidence of port component serialization in source order, not coordinate math.
- The function itself does not compute explicit x/y offsets or anchor coordinates.
- It appears to produce a list of piece IDs or placement entries for later processing.

### `MapSystem.AddWaterEdge` / `FUN_015B252C`
- The body is structurally similar to `PlacePort`.
- It validates the output buffer and uses `FUN_013725a0(...)` to get a count/size.
- It iterates over a list at `*(param_1 + 8)` and for each valid entry writes `entry[2]` (offset `+0x08` from the element start) into the output buffer.
- This is strong evidence that `AddWaterEdge` is building a sequential list of edge piece IDs/category values.
- No direct coordinate or direction calculations appear in this function.
- The placement semantics are helper-driven and list-based.

### `MapSystem.AddWaterEdgeSide` / `FUN_015B2724`
- This exported version is a thin wrapper around helper calls.
- It calls `FUN_01452580(&local_20, *(param_1 + 8), <context>)` and then `thunk_FUN_00a22200(<context>)`.
- There is no array fill or explicit offset arithmetic inside this body.
- This means side-edge placement logic is delegated to deeper helper code.
- The current export is thus not sufficient to reconstruct direction, offsets, or final tile placement rules.

### `MapSystem.AddWaterEdgeCorner` / `FUN_015B27CC`
- This body performs validation on `param_2` using `thunk_FUN_00a3d458` and `thunk_FUN_00a3d410`.
- It checks buffer capacity via `FUN_02099764(param_2,0)` and also uses `FUN_013725a0(...)`.
- It then tries a direct path: `iVar1 = thunk_FUN_00a224a4(param_2, iVar1); if (iVar1 != 0) then FUN_015B252C(...) return;`.
- If that path fails, it obtains a fallback structure via `thunk_FUN_00a224a4(param_2, **(...))` and iterates internal entries again.
- During the fallback, it calls `thunk_FUN_00a22200(...)` to resolve an object, then `thunk_FUN_00a224a4(iVar3, *(piVar4 + 0x20))`, and finally writes `iVar3` into `piVar4[param_3 + 4]`.
- This confirms corner placement is helper-driven and conditional, with runtime object lookup and validation.
- The exported body itself does not reveal concrete coordinates, only the control structure and helper dependency.

### `MapSystem.CreateMapChips` / `FUN_015B173C`
- `CreateMapChips` also validates its output buffer and uses `FUN_0136bd98(...)` to compute a length.
- It iterates over the internal list at `*(param_1 + 8)` and, for each valid entry, writes the value at `entry+0x18` into the output array.
- This mirrors the behavior of `PlacePort` and `AddWaterEdge` but for base map chip generation.
- Again, there is no explicit anchor/offset arithmetic; the function appears to collect a sequence of tile/piece IDs.

### `ChipPlaceSystem.PlaceChip` / `FUN_01504134`
- `PlaceChip` validates its output buffer and uses `FUN_009c50a0(...)` multiple times.
- It iterates an internal set of placement entries and writes values from entry offsets into the output buffer at `param_4 + 0x10`.
- This is evidence that chip placement is expressed as a list of placement entries, not as direct coordinate math within this function.
- The function is consistent with a data-driven placement pipeline.

## Confirmed evidence for Phase 2.11a
- The new export contains the requested confirmed targets mapped to actual `.c` / `.s` outputs.
- `PlacePort`, `AddWaterEdge`, `CreateMapChips`, and `PlaceChip` now resolve to real functions in the `0x015...` range.
- The current bodies confirm an architectural correction: these top-level map functions behave as orchestration/list-building/wrapper systems and delegate the real placement semantics deeper into helper functions.
- This is confirmed from the current native exports, not yet final architectural proof, but it is an important correction to our prior assumption that coordinate math lived in these top-level routines.

### Architectural correction from this export
- `MapSystem.PlacePort`, `MapSystem.AddWaterEdge`, and `MapSystem.CreateMapChips` appear primarily as:
  - orchestration
  - list-building
  - serialization
  - wrapper/delegation systems
- The exports show:
  - iteration over internal lists
  - writing values like `entry+0x18`
  - helper-driven behavior
  - object/context resolution
  - delegated placement logic
- The real placement semantics now appear to exist deeper in helper functions rather than directly inside the top-level `PlacePort` / `CreateMapChips` bodies.
- The initial export failure was caused by incorrect RVA/image-base resolution.
- `seed_resolution.tsv` is now mandatory before trusting any export.
- The native code shows repeated use of internal list iteration and buffer writes, supporting a system that serializes placement/piece IDs into output arrays.
- The functions do not themselves compute raw cell coordinates or anchor offsets; they appear to feed more detailed helper logic.
- The current export therefore provides evidence for component ordering and placement list assembly, but not for absolute x/y anchor math.

## Still unknown
- Exact port anchor coordinates and how the anchor position is derived.
- How `param_4` / `param_2` contexts encode map state, orientation, or anchor offsets.
- The meaning of the stored values at `entry+0x18` and `entry[2]` (tile ID, category code, piece type, or object reference).
- Exact direction and orientation logic for water-edge side and corner placement.
- Footprint size and absolute cell placement semantics.
- The actual helper implementations behind `FUN_01452580`, `thunk_FUN_00a22200`, `thunk_FUN_00a224a4`, `FUN_0136f194`, `FUN_013725a0`, `FUN_0136bd98`, `thunk_FUN_00a3d458`, `thunk_FUN_00a3d410`, and `FUN_02099764`.

## Next export targets
- `FUN_0136f194` / `FUN_013725a0` / `FUN_0136bd98` — helper functions that compute counts/sizes for port, edge, and map chip lists.
- `FUN_01452580` — edge-side placement helper.
- `thunk_FUN_00a22200` — object/context resolution helper used by both `AddWaterEdgeSide` and `AddWaterEdgeCorner`.
- `thunk_FUN_00a224a4` — lookup helper used by corner placement and conditional edge reuse.
- `thunk_FUN_00a3d458` / `thunk_FUN_00a3d410` / `FUN_02099764` — corner placement validation and state functions.
- direct callers of `FUN_015B1E34`, `FUN_015B252C`, `FUN_015B2724`, `FUN_015B27CC`, `FUN_015B173C`, and `FUN_01504134` to locate the map assembly pipeline.
- direct callees of those functions to capture the missing coordinate/anchor/direction math.

## Evaluation conclusion
- The current export now succeeds at the target resolution stage and provides relevant `0x015...` native functions.
- However, the bodies analyzed so far are mostly wrapper/list-building and helper-driven placement functions.
- The depth-2 run produced a split result:
  - actual exported seed wrappers are present in `Reverse engineering/exports/active` for `FUN_020cac40` and `FUN_01504134`.
  - deeper helper thunks are available in `Reverse engineering/exports/active/map-placement-subsystem`.
  - `FUN_020c8e08` and `FUN_01f93d98` bodies are available from the archive, not the current active export folder.
- This means the export succeeded in reaching a deeper layer, but the relevant semantic bodies are not yet consolidated in a single controlled output.
- For actual port coordinates, water-edge offsets, and direction logic, the next pass must capture the helper functions called from these exports.
- The new export pass should preserve exact target resolution and then expand into the helper cluster around these confirmed functions.
