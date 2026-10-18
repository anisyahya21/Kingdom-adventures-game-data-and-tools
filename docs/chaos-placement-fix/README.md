# Chaos Setup placement controls

New stones and boards previously reset the active tool after every placement. They now keep the chosen tool active until cancelled, allowing repeated placements. Moving an existing piece still ends after one successful move. Occupied or otherwise invalid cells remain blocked, and undo/save behavior uses the existing paths.

The Build panel now exposes both `Tap a tile` and `Drag map + confirm`. Drag-map confirmation remains the default. The active-tool hint reflects the chosen mode; direct placement shows the existing tile preview on hover.

Verification:

- Browser tests place two boards in each mode without reopening Build, check that the occupied cell rejects another confirmation, cancel placement, move an existing board without duplicating it, and parse the saved plan (`local-browser-check.json`).
- Both placement modes fit at 320px and 390px without horizontal overflow (`local-mobile-check.json`).
- Existing plan round-trip, legacy migration, invalid-save, and workspace-limit checks pass. The native mechanics preservation check also passes.
- Vite production build passes. Frontend typecheck reports the same 48 pre-existing errors as the baseline, with no new diagnostics (`typecheck-comparison.json`).

Thumbnail artwork and composition remain local proposals outside this release.
