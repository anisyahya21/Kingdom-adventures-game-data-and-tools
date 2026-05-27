# SEB Draw Final Evidence Summary

Date: 2026-05-16

This is the distilled evidence set from the exported Ghidra batch and the manually confirmed decompiler traces.

## What is now confirmed

### 1) The staging manager is real and structured

Confirmed helper cluster:
- `FUN_013eba88` initializes the manager handles and resets state.
- `FUN_013ebb5c` inserts or updates staged entries, deduplicates by key, and writes entry fields.
- `FUN_013eb0d4` clears/reset cycles the manager and advances a monotonic tick.
- `FUN_013eb720` searches staged entries by key and comparator/callback logic.
- `FUN_013eb164` is a boolean membership/predicate scan over the same staged records.
- `FUN_013eb144` is a boolean wrapper over `FUN_013eb720`.

### 2) The staged record layout is now field-confirmed

From `FUN_013ebb5c`, confirmed fields are:
- `+0x10` = key / match id
- `+0x14` = next-link / chain pointer index
- `+0x18` = first comparison payload / stored arg
- `+0x1c` = second comparison payload / stored arg
- `+0x20` = auxiliary payload / mode-dependent arg

From `FUN_013eb2ac`, confirmed write targets are:
- output tuple is copied from entry fields:
  - `entry[2] -> output[0]`
  - `entry[3] -> output[1]`
  - `entry[4] -> output[2]`

### 3) The secondary DrawSeb path is an emitted triple-buffer stage

Confirmed from `FUN_013eb4c0` + `FUN_013eb2ac` + `FUN_015c38c0`:
- DrawSebImg-family path can issue a base draw and a conditional secondary draw.
- The conditional path first runs a staged triple emission pass.
- `FUN_015c38c0` is a pure 3-value packer and does no math.
- Therefore `FUN_013eb2ac` is a guarded copy/emission routine, not the source of the coordinate math.

### 4) `FUN_013eb720` is a keyed candidate-search routine

Confirmed behavior:
- returns `0xffffffff` immediately when the source table pointer is null.
- uses two branch modes based on `*(param_1 + 0x20)`.
- traverses bucket/chain structures and evaluates candidates by key plus comparator callback.
- returns the matched candidate index when successful.

### 5) `FUN_013eb144` is a validity gate over `FUN_013eb720`

Equivalent form:
- `return ((FUN_013eb720() & 0x80000000) == 0) ? 1 : 0`

Practical meaning:
- `1` means the search result is in the non-sentinel range.
- `0` means the search result has the high bit set, including `0xffffffff`.

### 6) Producer-side field sources are now located (two paths)

**Path A: Direct staging** (FUN_013ea520 → FUN_013ebb5c)
- Per-entry source records are read from Seb sprite array at base + 0x10 (5-int stride).
- Fields extracted: `piVar7[2]`, `piVar7[3]`, `piVar7[4]`.
- Directly forwarded to `FUN_013ebb5c` for staged-record insert/update.
- This is the primary producer of staged entry payloads.

**Path B: Secondary packing** (FUN_013ecbd0 → secondary functions → FUN_013eb2ac)
- Two branches both extract `piVarX[2]`, `piVarX[3]`, `piVarX[4]` from same Seb sprite array.
- Branch 1: Direct triple pack via `FUN_015c38c0(&out, [2], [3], [4], ...)`.
- Branch 2: Lookup-mediated pack via `FUN_020404c8(&out, lookup_result, [4], 0)`.
- Both produce packed tuples before emission to `FUN_013eb2ac`.

### 7) The known setup helpers are not transform math

Confirmed non-math/setup helpers:
- `FUN_013eb420`
- `FUN_013eb450`
- `FUN_013ebb5c`
- `FUN_013eba88`
- `FUN_013edd24`
- `FUN_01f530c4`
- `FUN_015c38c0`
- `FUN_013ecbd0` (orchestrator for secondary packing, not math source)

These are setup, dispatch, caching, filtering, record-management, or packing routines, not the location of the final x/y/anchor/layer arithmetic.

## What is still missing

The final unresolved gap is the exact semantic meaning of the three payload fields extracted from Seb sprite records.

**Current unknowns:**
1. What do `piVarX[2]`, `piVarX[3]`, `piVarX[4]` represent in rendering domain?
   - Possibilities: [x, y, depth], [frame, image_id, layer], [id, variant, mode], or other.
2. Are these values raw or pre-transformed?
3. What role do the context lookups (offsets 0x38, 0xa8, etc.) play in transforming these values?

**Approach to resolve:**
- Read the Seb sprite record definition in IL2CPP metadata to identify field names at offsets matching [2], [3], [4].
- Trace DrawSebImg entry point to understand how public parameters (x, y, frame, imgId, anchor, layer, scale) map to the Seb sprite record fields.
- This will establish the semantic mapping without needing additional Ghidra traces.
