# SEB Render Reverse Engineering — Handoff Document

**Date:** 2026-05-16 → 2026-05-18  
**Status:** Work in progress. Significant structural facts confirmed. Semantic closure NOT achieved.  
**Purpose:** Restart point after context loss. Covers what was done, what was built, where files live, and what is still needed.

---

## IMPORTANT CORRECTION — Entry Point Status

The previous report (`SEB_SEMANTICS_FINAL_REPORT.md`) claimed "SEMANTIC CLOSURE ACHIEVED" and labeled the missing entry points as not mattering. **That claim was wrong. The entry point status is also more nuanced than the session summary implied.**

**Boundary confirmation** (from `docs/native-render-transform-analysis.md`, Attempt E):

| Public API | IL2CPP RVA | Ghidra function containing it | File in export |
|---|---|---|---|
| DrawSebImg | `0x013EB4C8` | `FUN_013eb4c0 @ 013eb4c0` | ✓ exported |
| DrawSebEx | `0x013EB3D4` | `FUN_013eb2ac @ 013eb2ac` | ✓ exported |
| DrawScaledSeb (primary) | `0x013EBED8` | `FUN_013ebb5c @ 013ebb5c` | ✓ exported |
| DrawScaledSeb (variant) | `0x013EBF90` | `FUN_013ebb5c @ 013ebb5c` | ✓ exported |
| DrawScaledSeb (entry) | `0x013EC2B8` | `FUN_013ec0d0 @ 013ec0d0` | ✓ exported |

**The public API entry points are NOT separate Ghidra functions. Each is an offset within a larger function that Ghidra merged together.** We have the code. We have not fully decoded it.

---

## What We Did

### 1. IL2CPP Dump and RVA targeting
- Extracted and decoded IL2CPP metadata from the APK.
- Produced `dump.cs`, `script.json`, and `il2cpp.h`.
- Mapped public method names to native RVA addresses.
- Result: all SEB draw API RVAs are confirmed and boundary-tested.

### 2. Bulk Ghidra export (12,179 files — superseded)
- First export pass was too broad. Not useful directly.
- Located at: `Reverse Engineering/exports/archive/` (moved or cleaned up).

### 3. Surgical Ghidra export (1,025 files — exported 2026-05-16)
- Used script: `tools/asset_extractor/ghidra_scripts/BulkExportSebRender.java`
- Force-seeded with SEB entry point neighborhoods and their callees.
- Produced 1,025 decompiled `.c` files.
- **These files were in `Reverse Engineering/exports/seb-render-functions/` but that folder is now empty** (files may have been cleaned or moved).
- The 16 key SEB functions (`FUN_013ebXXX`, `FUN_013ecXXX`) were identified and partially analyzed.

### 4. Function-level analysis (manually confirmed traces)
Manually read and confirmed from decompiler output:
- `FUN_013eb4c0` — SEB render orchestrator (DrawSebImg entry, contains 0x13EB4C8)
- `FUN_013eb2ac` — Staged triple emitter / secondary path emitter (DrawSebEx entry)
- `FUN_013ebb5c` — Staged record insert/update (DrawScaledSeb region)
- `FUN_013eb0d4` — Staged buffer reset / lifecycle cleanup
- `FUN_013eb144` — Boolean wrapper over FUN_013eb720 (inverted)
- `FUN_013eb164` — Entry-list predicate scan (two-mode: direct field check and comparator)
- `FUN_013eb720` — Keyed candidate-search over staged record chain
- `FUN_013eba88` — Manager init / handle setup
- `FUN_015c38c0` — Pure 3-value packer (no math, confirmed passthrough)
- `FUN_01f530c4` — Draw dispatch/state-selection function (confirmed no coordinate math)
- `FUN_013ec0d0` — Contains DrawScaledSeb at 0x13EC2B8 (partially analyzed)

### 5. Mirror family confirmation
A second mirrored family (`FUN_013e7e70`, `FUN_013e7c5c`, `FUN_013e850c`, `FUN_015c381c`) confirms the same staging layout and pipeline pattern in a parallel context.

### 6. Data table correlation
Identified a dense pointer table starting at `0x02A28900` containing references to SEB system top-level functions. These functions appear called via IL2CPP metadata tables, not direct code calls.

---

## What We Know (Confirmed)

### Call chain
```
Public API (DrawSebImg / DrawSebEx / DrawScaledSeb)
   → offsets inside FUN_013eb4c0 / FUN_013eb2ac / FUN_013ebb5c
        |
        ├── BASE PATH: FUN_01f530c4 (draw dispatch)
        |
        └── SECONDARY PATH (conditional on *(param_1+8) != 0):
              FUN_009c4dac (delta: A - B)
              FUN_013eb2ac (triple-emit stage)
              FUN_01f530c4 (second draw submission)
```

### Staged entry structure (20-byte stride, CONFIRMED)
```c
struct StagedEntry {
  /* +0x10 */ int match_key;      // searchable ID, used by FUN_013eb720
  /* +0x14 */ int chain_link;     // linked list index for chain walk
  /* +0x18 */ int payload_1;      // piVar7[2] in source, entry[2] in emitter
  /* +0x1c */ int payload_2;      // piVar7[3] in source, entry[3] in emitter
  /* +0x20 */ int payload_3;      // piVar7[4] in source, entry[4] in emitter
};
// stride = 0x14 = 20 bytes confirmed from loop increment piVar9 = piVar9 + 5
```

### Confirmed non-transform functions
These functions do NOT contain x/y/anchor/layer arithmetic. They are setup, dispatch, packing, or management only:
- `FUN_015c38c0`, `FUN_01f530c4`, `FUN_013eb420`, `FUN_013eb450`
- `FUN_013ebb5c`, `FUN_013eba88`, `FUN_013edd24`, `FUN_013ecbd0`

### Confirmed single-frame lifecycle
- `FUN_013eb0d4` performs an explicit buffer clear+reset between frames.
- A monotonic tick `*(param_1 + 0x1c)` increments unconditionally on each reset.

### Confirmed dual-path rendering
- Every DrawSebImg call can issue a base draw (mandatory) and a secondary draw (conditional on secondary handle at `*(param_1+8)`).
- The secondary path emits a pre-computed triple-buffer before the second draw.
- `FUN_015c38c0` packs the triple but does zero math — the arithmetic must occur before it.

---

## What We Do NOT Know (Open Gaps)

### 1. Payload field semantic identity — CRITICAL UNKNOWN
The three payload fields (`entry[2]`, `entry[3]`, `entry[4]` = struct offsets `+0x18`, `+0x1c`, `+0x20`) are extracted from the Seb sprite record array and passed through the entire pipeline.

**We do not know what they represent.** Candidate interpretations:
- `(x, y, depth)` — likely, given rendering context
- `(frame, image_id, layer)` — possible, if draw-variant metadata
- `(render_group, depth_band, mode)` — possible, affects layering/occlusion logic
- `(id, variant, mode)` — possible, if lookup-key-only

**Why this matters:** If payload_1/payload_2 are NOT raw screen x/y, then the facility placement, shadow rendering, overlay draw order, and large-structure composition will all be wrong in any visual implementation that assumes they are.

**How to resolve:**
1. Open `tools/asset_extractor/il2cpp_dump/dump.cs` and find the SebObject or SebSprite class. Locate fields at byte offsets corresponding to array indices [2], [3], [4] (each is 4 bytes, so offsets +8, +12, +16 from array base).
2. The field names in `dump.cs` will directly answer this.
3. Alternatively, trace one call to `FUN_013ebb5c` (the insert/update function) from a known draw call and watch what values flow in.

### 2. Coordinate normalization before entry
The orchestrator `FUN_013eb4c0` receives an already-prepared staging manager. The public API parameters (x, y, frame, imgId, anchor, layer, scale) are converted to the staging structure before this function runs. We have not confirmed what transformations occur in that conversion.

### 3. Frame fallback path
`FUN_013edd24(...)` is called when frame value is zero. Its semantics are not confirmed. It may perform default frame selection, atlas lookup, or error handling.

### 4. Delta arithmetic identity
`FUN_009c4dac(...)` computes `PRIMARY_A - PRIMARY_B` (from fields `*(param_1+0x10)` and `*(param_1+0x18)`). What these two fields represent (x/y pair? render depth pair? count delta?) is not confirmed.

### 5. `FUN_013eb720` comparator callback
The search function uses a virtual method at vtable offset `0x100`. Its semantic meaning in terms of what "matching" means for staged entries is not confirmed.

---

## Files: Where Everything Lives

### Ghidra project
```
Reverse Engineering/KingdomAdventures.rep/
```
The full analyzed program is here. Open this in Ghidra to access all decompiler output, disassembly, and symbol tables.

### IL2CPP dump artifacts
```
tools/asset_extractor/il2cpp_dump/
  dump.cs         ← C# class/method dump with field names and RVA offsets
  script.json     ← symbol map for RVA resolution
  il2cpp.h        ← native struct type headers
```

### Export scripts (Ghidra)
```
tools/asset_extractor/ghidra_scripts/
  BulkExportSebRender.java       ← surgical SEB export (used in this session)
  export_seb_decomp.py           ← Python version (preferred, from ghidra-export-targets.md)
  export_placechip_decomp.py     ← PlaceChip-focused export
```

### Export output directories
```
Reverse Engineering/exports/
  active/                              ← in-progress exports (PlaceChip, map-placement)
    target-boundary-report.md          ← confirms which RVAs land inside which functions
    caller-correlation-report.md       ← caller graphs for PlaceChip targets
    data-table-correlation-report.md   ← 0x02A28900 function-pointer table analysis
    mapchip-placement-anchor/          ← current active research area
    (many map-placement-* folders)
  seb-render-functions/               ← WAS 1,025 SEB decompiled .c files (now empty)
  curated/                            ← selected functions kept for reference
  archive/                            ← bulk/superseded exports
```

**Note:** The 1,025-file SEB export from 2026-05-16 no longer exists on disk. The key analyzed functions need to be re-exported if raw code needs review. The analysis results ARE preserved in documents.

### Research documents
```
docs/
  ai-takeover-handoff-native-render.md      ← master project/implementation handoff
  seb-draw-transform-rule.md                ← confirmed function trace notes (most detailed)
  seb-draw-final-summary.md                 ← distilled confirmed facts + open gaps
  SEB_SEMANTICS_FINAL_REPORT.md             ← DISPUTED — claims closure that was not achieved
  SURGICAL_EXPORT_PLAN.md                   ← plan for surgical export approach
  ghidra-export-targets.md                  ← export script usage instructions
  native-render-transform-analysis.md       ← attempt log and boundary report facts
  phase2-1-world-rendering-summary.md       ← Phase 2 master navigation index
  reverse-engineering-discovery-index.md    ← evidence curation rules and discovery map
  graphics-world-builder-reverse-roadmap.md ← priority list for future research
  architecture/facility-world-placement.md  ← facility placement rules (derived)
```

---

## What Needs to Be Fixed

### 1. `SEB_SEMANTICS_FINAL_REPORT.md` — Mark as DISPUTED
The status header "✓ SEMANTIC CLOSURE ACHIEVED" is wrong. The payload fields are unidentified. This document should be updated to reflect what IS confirmed (staging structure, call chain) versus what IS NOT (payload semantics, coordinate mapping, anchor logic).

### 2. Identify payload fields from dump.cs — HIGHEST PRIORITY
Open `tools/asset_extractor/il2cpp_dump/dump.cs` and find the class that holds the Seb sprite data (likely `SebObject`, `SebSprite`, or `SebData`). The fields at the offsets corresponding to array positions [2], [3], [4] will reveal what `payload_1`, `payload_2`, `payload_3` actually mean. This single step resolves the most critical unknown.

### 3. Re-export SEB functions if raw code review needed
The `seb-render-functions/` output folder is empty. To re-read the code:
- Option A: Open the Ghidra project and navigate to the functions manually.
- Option B: Re-run `export_seb_decomp.py` from `tools/asset_extractor/ghidra_scripts/`.
- The functions to prioritize for re-reading: `FUN_013eb4c0`, `FUN_013ebb5c`, `FUN_013ec0d0`, `FUN_013ec540`, `FUN_013ec750`.

### 4. Do not assume payload fields are x/y/depth until confirmed
Any implementation that maps `payload_1` → screen_x, `payload_2` → screen_y should be labeled `// UNCONFIRMED` until the dump.cs lookup in step 2 above is done.

---

## Current Research Focus (as of 2026-05-18)

The active research has shifted away from SEB entry points and toward **map/world placement**:

```
Reverse Engineering/exports/active/mapchip-placement-anchor/   ← CURRENT FOCUS
```

The SEB semantic gap is known and documented. It does not block map progress. The team decision (from `ai-takeover-handoff-native-render.md`) is:

> **Stage 3 (public-parameter-to-formula closure) is in progress but no longer blocks visible implementation.** Apply good-enough, clearly labeled visual rules now; refine with evidence as reverse engineering closes gaps.

---

## Priority Order for Resuming SEB Work

1. **Resolve payload identity:** look up SebSprite/SebObject fields in `dump.cs` at offsets +8, +12, +16 from array base. 30-minute task.
2. **Update `SEB_SEMANTICS_FINAL_REPORT.md`** to replace the "CLOSURE ACHIEVED" header with accurate status and add the confirmed call chain plus the open unknowns.
3. **Re-read `FUN_013ec540` and `FUN_013ec750`** (not analyzed). These are in the same function cluster and may contain anchor or layer arithmetic.
4. **Trace `FUN_009c4dac`** to confirm whether the A-B delta is a coordinate delta or a count/depth delta.
5. **Trace `FUN_013edd24`** (frame fallback) to confirm whether it is frame selection or something else.

---

*This handoff supersedes the prior session summary's claim that the entry points were "critically missing." They are present in the exported functions as offsets within larger Ghidra function bodies. The actual open question is the semantic meaning of the payload fields, which is resolvable from `dump.cs` without additional Ghidra export work.*
