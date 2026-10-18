# Static reference and control cleanup

Game reference pages use release data instead of routine API/Google refreshes. Five existing spreadsheet snapshots are fingerprinted frontend assets and embedded API references. Removed the backend 30-second/two-minute game-table polling and request-triggered refreshes. Player workspace hydration uses a separate query key and a minimal server projection, with compatibility for the previous backend response.

Removed routine Refresh controls from Equipment, Find Builds, Event Reminders, healthy profile/account-loadout states and desktop optimizer status. Removed Skills/Monsters/Builder notebooks and Skills note-editor pencils, preserving existing stored notes and game/community data. Useful named help, admin reload and contextual failure Retry remain.

Validation: frontend build and API build/typecheck; frontend typecheck compared against its 48-error baseline. `node tools/static-reference-check/run_check.mjs` verifies zero reference fetches, zero server game-data timers/fetches, all five snapshots, isolated reference copies and workspace-state preservation. Local browser checks cover Equipment (295 entries), Shops, Skills, Eggs, Weekly Conquest and reminder controls.

Release is applied on top of the latest main. Unrelated audit-checkout changes and local comparison routes are excluded. No account, notification, saved-plan or game-data mutations were performed during verification. Community-authored guide caching remains separate from static game tables.
