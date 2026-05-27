# Surgical SEB Export Plan

**Date:** 2026-05-16  
**Goal:** Export exact target functions + immediate neighbors (no bulk prefix matching)

## Modified BulkExportSebRender.java

### What Changed

| Setting | Old | New | Reason |
|---------|-----|-----|--------|
| `INCLUDE_PREFIX_MATCHES` | `true` | `false` | Disable broad capture; seeded addresses only |
| `CALLEE_EXPANSION_DEPTH` | `8` | `4` | Capture downstream (4 levels) but not entire graph |
| `CALLER_EXPANSION_DEPTH` | `2` | `1` | Capture immediate callers only |
| `MAX_FUNCTIONS_TO_EXPORT` | `12000` | `500` | Only essential set; faster export |
| Logging | Minimal | Enhanced | Show surgical targeting |

### Exact Target Addresses (FORCE-SEEDED)

```
0x13EB4C8  → DrawSebImg (PRIMARY TARGET)
0x13EB3D4  → DrawSebEx (PRIMARY TARGET)
0x13EBED8  → DrawScaledSeb (PRIMARY TARGET)
0x13EBF90  → DrawScaledSeb variant
0x13EC2B8  → DrawScaledSeb variant
```

Regardless of prefix matching or traversal depth, these addresses will be extracted.

### Known Helpers (SEEDED BY NAME)

```
FUN_013eb2ac    (triple emission)
FUN_015c38c0    (tuple packer)
FUN_01f530c4    (render dispatch)
FUN_013edd24    (frame fallback)
FUN_013eb720    (keyed search)
FUN_013eba88    (staging init)
FUN_013ebb5c    (staged insert/update)
FUN_013eb450    (payload setup)
FUN_013eb420    (payload setup variant)
FUN_013eb0d4    (cleanup/reset)
FUN_013eb144    (validity gate)
FUN_013eb164    (entry predicate scan)
```

### Export Strategy

**Phase 1: Seed exact addresses**
- Force-include DrawSebImg, DrawSebEx, DrawScaledSeb functions

**Phase 2: Seed known helpers**  
- Include all 12 known helpers by name

**Phase 3: Expand neighbors (controlled)**
- **Callees:** Walk 4 levels down (to capture helper chains)
- **Callers:** Walk 1 level up (immediate callers only)

**Phase 4: Export**
- Max 500 functions (surgical set, not 12,000)
- Faster decompilation + smaller output set

## Expected Outcome

**Should contain:**
- DrawSebImg, DrawSebEx, DrawScaledSeb (the 3 entry points)
- All 12 known helpers
- Callers of staging/emission functions
- Called functions (downstream helpers)
- ~300-500 functions total

**Should NOT contain:**
- Random FUN_020* functions (no prefix sweep)
- Random FUN_014* functions (no prefix sweep)
- Deep call chains (4-level callee limit, 1-level caller limit)

## How to Run

1. **Open Ghidra project:**
   ```
   Reverse engineering/KingdomAdventures.rep
   ```

2. **Open Script Manager:**
   - Window → Script Manager

3. **Run BulkExportSebRender.java:**
   - Browse to: `tools/asset_extractor/ghidra_scripts/`
   - Select: `BulkExportSebRender.java`
   - Click: **Run**

4. **When prompted for export directory:**
   ```
   Use default:
   Reverse engineering/exports/seb-render-functions-surgical/
   ```

5. **Monitor console output:**
   - Look for `[SURGICAL]` messages showing target addresses
   - Wait for `[DONE]` message

## Output Structure

```
Reverse engineering/exports/seb-render-functions-surgical/
├── FUN_013eb4c0_013eb4c0.c       (DrawSebImg orchestrator)
├── FUN_013eb3d4_013eb3d4.c       (DrawSebEx entry point)
├── FUN_013ebed8_013ebed8.c       (DrawScaledSeb entry point)
├── FUN_013eb2ac_013eb2ac.c       (triple emission)
├── FUN_013ebb5c_013ebb5c.c       (staged insert)
├── [300+ helper/caller functions]
├── index.tsv                      (master index)
└── [decompile_failures.txt]       (if any)
```

## Next Steps After Export

1. **Read DrawSebImg** → Extract public parameter mapping
2. **Cross-reference with param_1 structure** → Map params to piVar7[2,3,4]
3. **Confirm semantic labels** → [x, y, depth]? [frame, img, layer]?
4. **Update evidence docs** → Section 9 with finalized semantics

## Surgical Mode Summary

- **Before:** 12,179 files, 0.016% examined, broad prefix capture
- **After:** ~500 files, exact targets forced, no prefix bloat
- **Result:** Focused export on just the SEB draw pipeline

---

**Status:** Ready to execute  
**Estimated runtime:** 2-5 minutes (120s timeout × 500 funcs)  
**Output size:** ~50-100 MB  
