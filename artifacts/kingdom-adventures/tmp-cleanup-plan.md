# tmp cleanup plan

## Summary
- Path inspected: `artifacts/kingdom-adventures/tmp`
- Total on-disk size: `100,456,411` bytes (~95.7 MB)
- Total filesystem items: `7,802` files
- Tracked files under git: `6,409` files
- Untracked files under tmp are ignored by the repo because root `.gitignore` contains `tmp`
- Current git branch: `backup/stabilize-map-renderer-20260516`
- Current branch has no configured upstream remote

## Phase 1: Inventory
- `git status --short` in `KA-Website` shows no changes inside `artifacts/kingdom-adventures/tmp`
- `git ls-files artifacts/kingdom-adventures/tmp` reports `6,409` tracked files
- `git status --short -- artifacts/kingdom-adventures/tmp` shows no visible untracked changes due to ignore rules
- The root `.gitignore` already contains `tmp`, which ignores untracked tmp files globally

## Phase 2: Dependency check
- Source search in:
  - `artifacts/kingdom-adventures/src`
  - `artifacts/kingdom-adventures/public`
  - `artifacts/kingdom-adventures/index.html`
  - `artifacts/kingdom-adventures/package.json`
  - `artifacts/kingdom-adventures/vite.config.ts`
- No runtime imports or fetches of `artifacts/kingdom-adventures/tmp` were found.
- `KA_assets` is not referenced by website code or config.
- The only relevant hit in source was a generated-comment in `artifacts/kingdom-adventures/src/runtime/world-builder/fixtures/f2-semantic-layer.ts`:
  - `// source: .../tmp/map-section-a-f2-mapchip-semantic-groups.json`
  - This is metadata on a generated file, not a runtime import.
- `package.json` contains developer scripts for analysis/rendering but does not use `tmp/` as a runtime path.

## Phase 3: Classification

### A. REQUIRED BY WEBSITE
- None discovered.
- `artifacts/kingdom-adventures/tmp` is not directly imported or fetched by website runtime code.
- The only source reference is a comment inside a generated fixture file.

### B. SAFE TO MOVE OUT OF WEBSITE
- Entire folder: `artifacts/kingdom-adventures/tmp`
- Tracked subtree: `artifacts/kingdom-adventures/tmp/KA_assets` (`6,409` files, ~12.3 MB)
- Ignored/untracked subtree: `artifacts/kingdom-adventures/tmp/archive` (`616` files, ~2.05 MB)
- Ignored/untracked subtree: `artifacts/kingdom-adventures/tmp/legacy` (`858` files, ~30.8 MB)
- Ignored/untracked subtree: `artifacts/kingdom-adventures/tmp/work` (`860` files, ~32.0 MB)
- Root-level generated artifacts in `tmp` such as:
  - analysis JSON/MD files
  - debug PNG renders
  - `.mjs` bundles
  - `.map` test files
  - `.log` files
  - `.txt` lists

### C. UNCERTAIN
- None of the tmp items are actively referenced in the website app.
- If you want a conservative staging step, treat `tmp/KA_assets` as the only tracked artifact set that needs explicit git handling.

### D. SHOULD STAY BUT BE GIT-IGNORED
- No items were identified that should remain inside the website app while being ignored.
- The safest cleanup is to move the entire `tmp` tree outside the app and keep a local archive.

## Recommended destination
- Preferred safe destination outside the website app:
  - `C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website-legacy-artifacts\kingdom-adventures-tmp\`
- This keeps the website app clean and preserves the reverse-engineering artifacts locally.

## Git safety notes
- `artifacts/kingdom-adventures/tmp/KA_assets` is currently tracked and must be removed from git if moved.
- `archive`, `legacy`, `work`, and root tmp items are currently ignored by `.gitignore` and can simply be relocated.
- Because current branch has no upstream, these cleanups are local and not yet reflected on GitHub via this branch.

## Recommended .gitignore addition
Add either one of these to make the intent explicit for the website app:
```gitignore
artifacts/kingdom-adventures/tmp/
# or more explicitly
artifacts/kingdom-adventures/tmp/**
```
- This complements the existing global `tmp` ignore and makes the website app cleanup explicit.

## Exact next move command (DO NOT EXECUTE YET)
Use this command to relocate the folder out of the website project:
```powershell
Move-Item -LiteralPath 'C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\tmp' -Destination 'C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website-legacy-artifacts\kingdom-adventures-tmp' -Force
```

## Exact git commands needed if tracked files are moved
After moving the folder outside the app, run:
```powershell
git rm -r artifacts/kingdom-adventures/tmp
git add .gitignore
git commit -m "Remove tracked tmp reverse-engineering artifacts from website app and ignore tmp folder"
```

## Notes
- No `.git mv` is needed because the destination is outside the repository.
- If you want to keep the files locally in the repo tree while stopping tracking, use `git rm -r --cached artifacts/kingdom-adventures/tmp` instead of `git rm -r` before moving them.
