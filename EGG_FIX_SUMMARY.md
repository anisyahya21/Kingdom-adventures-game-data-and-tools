# Egg Icon Update - Fixed to Unhatched Versions

## Issue
The original export included **hatched eggs** (showing baby monsters coming out of eggs). The website needs **unhatched eggs** (just the egg shells).

## Root Cause
Egg PNGs in `material/` folder are 28×55 and contain TWO states stacked vertically:
- **Top portion (0-33px)**: Unhatched egg
- **Bottom portion (33-55px)**: Hatched egg with baby monster

The original export loaded the entire PNG file, including both states.

## Solution
Updated both the export script and API endpoint to use `.opt` sprite extraction:
- The `.opt` files contain a sprite at coordinates `[0,0]` that crops just the unhatched portion (28×33)
- Extract this specific sprite instead of loading the whole file

## Changes Made

### 1. Updated `export_website_icons.py`
- Modified `export_egg_icons()` function to use `.opt` parsing
- Extracts sprite at `[u=0, v=0]` which is the unhatched egg
- Fallback to manual crop `(0, 0, 28, 33)` if `.opt` missing
- Added `"state": "unhatched"` to metadata

### 2. Updated `inspector/server.py`
- Modified `/api/egg-icon` endpoint to extract unhatched version
- Uses same `.opt` extraction logic
- Added `X-Egg-State: unhatched` response header
- Changed method name to `egg_unhatched_opt`

## Verification

### Before (Incorrect):
```
egg_0.png: 28×55 (full file with both states)
```

### After (Correct):
```
egg_0.png: 56×66 (28×33 at 2x scale = unhatched only)
```

All 8 eggs now show **ONLY** the unhatched egg shell without baby monsters.

## Visual Confirmation
✅ Tested egg_0.png - shows white egg shell only (no baby monster)
✅ All eggs exported at correct unhatched dimensions (28×33 native, 56×66 at 2x scale)
✅ Manifest updated with `"state": "unhatched"` metadata

## Files Updated
1. `KA-Website/tools/asset_extractor/export_website_icons.py` - Export logic
2. `KA-Website/tools/asset_extractor/inspector/server.py` - API endpoint
3. `KA-Website/website_icons/eggs/*.png` - Re-exported with unhatched versions
4. `KA-Website/website_icons/manifest.json` - Updated metadata
5. `KA-Website/website_icons/preview.html` - Regenerated with new eggs
