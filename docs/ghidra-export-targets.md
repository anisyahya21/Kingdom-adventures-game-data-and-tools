# Ghidra Bulk Export Workflow for SEB Render Targets

Goal: export decompiled C only for the SEB draw/transform target set and their direct callees.

Scope (fixed):
- DrawSebImg region: `0x13EB4C8`
- DrawSebEx: `0x13EB3D4`
- DrawScaledSeb: `0x13EBED8`, `0x13EBF90`, `0x13EC2B8`
- helper callees: `FUN_013eb2ac`, `FUN_015c38c0`, `FUN_01f530c4`, `FUN_013edd24`

Output directory:
- `Reverse engineering/exports/seb-render-functions/`

## Preferred method 1: Ghidra script (GUI)

Use script:
- `tools/asset_extractor/ghidra_scripts/export_seb_decomp.py`

What it does:
- resolves the exact target functions by address and helper names
- collects direct callees of those seed functions (one hop only)
- decompiles each collected function
- writes one C file per function
- writes `index.tsv` mapping function -> entrypoint -> file

How to run:
1. Open your analyzed `libil2cpp.so` program in Ghidra.
2. Open `Window -> Script Manager`.
3. Add script directory if needed:
   - `tools/asset_extractor/ghidra_scripts`
4. Run `export_seb_decomp.py`.
5. Optional script arg:
   - pass custom output dir as arg 1
   - if omitted, default output is:
     - `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\Reverse engineering\exports\seb-render-functions`

Expected files:
- `Reverse engineering/exports/seb-render-functions/index.tsv`
- `Reverse engineering/exports/seb-render-functions/*.c`

### PlaceChip-centered export script
A second fresh export script is now available for the PlaceChip anchor and its caller/callee graph:
- `tools/asset_extractor/ghidra_scripts/export_placechip_decomp.py`

This script exports:
- `FUN_01504134` / `ChipPlaceSystem.PlaceChip` at `0x15042E0`
- known PlaceChip helpers at `0x0208E2A4`, `0x02098B0C`, `0x02053924`, `0x02053A20`, and `0x020CAC40`
- direct callers and direct callees of the selected PlaceChip slice
- `index.tsv`, `callgraph_edges.tsv`, `seed_resolution.tsv`, and `placechip_export_inventory.md`

Default output directory:
- `Reverse engineering/exports/active/placechip-ghidra-fresh`

## Preferred method 2: Headless analyzer

Use this when you want repeatable one-command export.

PowerShell template:

```powershell
$ghidra = "C:\ghidra\ghidra_11.3.2_PUBLIC"
$projDir = "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\Reverse engineering"
$projName = "KingdomAdventures"
$scriptDir = "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\tools\asset_extractor\ghidra_scripts"
$outDir = "C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\Reverse engineering\exports\seb-render-functions"

& "$ghidra\support\analyzeHeadless.bat" `
  $projDir `
  $projName `
  -process "libil2cpp.so" `
  -scriptPath $scriptDir `
  -postScript "export_seb_decomp.py" $outDir
```

Notes:
- `-process "libil2cpp.so"` expects that program name in the Ghidra project.
- If your program name differs, replace it exactly.
- This does not export all functions, only the constrained target set + direct callees.

## Manual fallback (only if script/headless unavailable)

Use this exact constrained process:
1. Go to each target address:
   - `0x13EB4C8`, `0x13EB3D4`, `0x13EBED8`, `0x13EBF90`, `0x13EC2B8`
2. For each function, list direct callees from Function Call Trees (one level only).
3. Add helper functions by name:
   - `FUN_013eb2ac`, `FUN_015c38c0`, `FUN_01f530c4`, `FUN_013edd24`
4. Decompile and save each function C output to:
   - `Reverse engineering/exports/seb-render-functions/`
5. Create `index.tsv` with:
   - `function|entrypoint|file`

Manual guardrails:
- do not browse unrelated functions
- do not recurse beyond direct callees
- do not run whole-program exports

## Quick verification checklist

After export, verify:
- target address functions are present in `index.tsv`
- helper functions are present in `index.tsv`
- each listed function has a corresponding `.c` file
- export count is small (targeted), not large/global
