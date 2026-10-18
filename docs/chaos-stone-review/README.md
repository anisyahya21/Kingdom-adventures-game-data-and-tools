# Chaos Stone workspace review - 18 October 2026

Local implementation for review. No deployment. The first cleanup draft was superseded after the user clarified that the whole interaction and rendering approach had become obsolete.

## Current generation UI

The generation flow is now Area level, Stone count, Generate. The setup dropdown, Stones / Boards / Ally / Land guide, Pick on map action and forced stage transitions have been removed from that flow. Generate displays the complete scene immediately and keeps the three controls available. A short result line lists stones, boards and reclamation; the header names the active area and its stone count rather than mixing global totals with a selected setup. The generation count initializes from the saved active setup, defaulting to seven for a new workspace. Editing tools remain behind Build.

Browser-verified at 9999 with seven stones: all seven are rendered directly, result is 61 boards and five reclaimed tiles, other setups remain on the map, and no guide is opened. See [simple-9999-generator.png](simple-9999-generator.png). The guide-related UI descriptions below are historical.

## Current correction: reclamation and multiple setups

The existing-land-only restriction was a misinterpretation and has been removed. Reclaiming land is normal planning; generated reclaimed tiles must connect cardinally to existing land. A cached breadth-first shoreline index attaches required water footprints and open positions to land. Candidate ranking prefers fewer reclaimed tiles, then fewer boards. At 9999 the first seven-stone result uses five reclaimed tiles and 61 boards; the second uses eight reclaimed tiles and 54 boards. The 21 land scenarios now check this connectivity as well as footprints, occupancy, adjacent positions, ranges and exact modeled board coverage. See [connected-land-scenarios.json](connected-land-scenarios.json).

Seven is a generation batch limit, not a workspace placement cap. Add stone always remains available. Chaos planning explicitly bypasses only the shared stone acquisition budget; World Builder keeps its normal acquisition checks, and footprint/land/collision checks still apply in Chaos planning. The local check verifies placement after fourteen stones while the normal World Builder call still rejects it.

Generating in another area retains all existing structures, reclamation and positions elsewhere. Generated setups track their pieces and marker positions; Go to setup navigates between them on the same map. Re-generation and alternatives replace only the selected area's generated setup. All setups and the active area save together under the existing device key; older single-layout saves load without deleting their pieces. Undo includes setup ownership and markers. Regeneration removes obsolete owned reclamation while retaining land needed by other setups or manually placed pieces, and covers retained land in the modeled envelope.

Browser verification: seven at 3200 plus seven at 9999 coexist as fourteen stones; 3200 retains its seven stones and 61 boards; a fifteenth stone was manually confirmed then undone; a stone sprite was selected and exposed Move/Remove; generation and an alternative at 9999 preserved 3200; both setups survived reload and navigation; board coverage was complete after the alternative. The guide includes Land when reclamation is needed. [Workspace preview](workspace-3200-and-9999.png).

The earlier existing-land-only workflow below is retained as superseded investigation history, not current behavior. Connected planning ground does not prove original-game dispatch legality; exploration and town boundaries remain player-specific checks.

## What was wrong

- A second, hidden 160 x 160 tile-button map was still constructed beside the native canvas. Labels and area-level controls affected that hidden renderer.
- The page retained raw axis/seam settings, a zoom slider and diagnostics outside the working map. Passing its trial profile checks did not establish game accuracy.
- People and skull badges were DOM overlays drawn above every structure, separate from the facility depth queue. Large S1/S2 badges hid the actual arrangement.
- No structure selection/move workflow, durable layout save or recovery for Clear. Invalid typed levels could reuse a prior location; old result alternatives could outlive changed settings.

## Replacement

The map is the workspace. Build, Generate, Undo, Focus, zoom, view settings and contextual Move/Remove are inside its frame. The line grid, spawn badges, skull marker, old placement-mode switch, axis/seam controls, raw diagnostics card and outside-frame control blocks are retired from the player workflow.

Structures reuse World Builder's native-backed placement validation, sprite assembly and alpha hit testing. Selected footprints appear only while selecting or placing. Saved objects remain visible when a move preview is invalid. Only one preview of an actor is drawn when repositioning it.

The fighter uses the shared native SEB/OPT idle resolver, its actual shadow/origin and animation. The representative monster uses the existing map-body sprite. Actors and structures share one depth-sorted scene. Structure opacity defaults to 65% and is adjustable. A separate shared editor canvas animates at most 20 frames per second, without re-rendering terrain or setting React state on every frame; art is baked/loaded once, and animation can be paused. Reduced-motion preference is respected.

Layouts save under the separate versioned ka-chaos-plan-v2 device key. Undo retains twenty prior changes. Existing World Builder saves and account/profile data are not changed.

## Evidence and limits

### Superseded existing-land-only workflow

The old Generate button required a separate level commit, and generation silently reclaimed water. The saved 9999 layout inspected in the browser contained 30 planned land tiles. It was not established as ready to build in game.

Typing a valid level now selects its area immediately; Enter generates. The new pure planner searches compact patterns across that area using original map land and shared fixed-facility occupancy. It validates stone footprints and both open positions before ranking layouts, then covers remaining available land in the movement envelope with boards. It never automatically reclaims water. Failed generation preserves the current layout and offers a smaller count when one is found. The search is bounded, not exhaustive; a failure is not proof that no arrangement exists.

Generation opens a Stones / Boards / Ally build guide. The stages fade irrelevant structures, expose uncovered board tiles and offer a repair action. The ally stage highlights its open tile. Camera fitting measures the guide so the map remains visible beside or below it. At 3200, seven stones produce 61 boards on existing land. At 9999, no seven-stone pattern was found; the offered three-stone pattern uses 54 boards and original land for the ally.

[Current desktop](workflow-3200-desktop.png), [390px phone](workflow-3200-mobile.png), [320px phone](workflow-3200-narrow.png), [9999 ally stage](workflow-9999-ally.png), [21 scenario results](workflow-scenarios.json).

The bounded native dispatch inspection covers `ecs.DispatchAreaSelectSystem.CheckDispatch` at 0x1536478 and its wrapper at 0x1535118. It tests a selected tile, rejects missing map chips, water, unexplored territory and town territory, and rejects building-type cells except the dungeon category. No larger empty square requirement was found in this inspected path. This does not establish every original-game dispatch condition. The planner has no player exploration or town-boundary state, and the guide asks the player to check those in game. Native exports and their binary/index provenance remain under native-full-extents.

The workflow browser checks verified typing 3200 without Enter enables Generate, successful seven-stone generation, 9999 failure and three-stone fallback, invalid input rejection, stage switching, removal of a board producing one highlighted uncovered tile, repair restoring coverage, and responsive framing. Final browser error log was empty. Build passed; normalized TypeScript diagnostics match the 48-diagnostic baseline with no additional diagnostics. Scenario checks validate footprints, original land, occupancy, ranges, adjacent open positions and exact modeled board coverage; an all-water fixture returns no plan. They do not simulate native spawning, movement or combat.

[Desktop preview](desktop.png), [phone preview](mobile.png), [machine-readable verification](verification.json).

Build passed. TypeScript retains the same 48 existing diagnostics after normalizing line/column locations, with none in edited files. View-fit checks and save decoding checks passed. Browser checks cover generation, native sprite selection and moving, invalid placement, Undo, reload restoration, opacity, fighter choice, animation pause, zoom/focus, and 320/390px layouts with no horizontal overflow or visible controls outside the frame. No browser console errors were observed in the final session.

The existing spawn origin, directional bounds, Manhattan distance function and profile targets were extracted unchanged into chaos-rules.ts; the normalized source comparison is [mechanics-preservation.json](mechanics-preservation.json). Generated layouts remain experimental. The fighter's idle animation is presentation, not a simulation of spawning, walking or combat. Manually reclaimed cells remain planning overlays rather than proof of town reclamation legality.

The native investigation used the canonical index and the hash-verified fb834373...30208 ELF. Bounded full method extents and manifests are retained in native-full-extents; earlier ka_slice exports in native-slices trim after the last RET and may omit throw/tail blocks. This inspection did not certify every old generator assumption and did not justify changing the spawn rule. No original-game runtime validation is claimed.

## Reproduce local checks

From artifacts/kingdom-adventures:

```powershell
npm run typecheck
npm run build
node --import ./tools/battle-setup-check/register.mjs tools/chaos-view-check.mjs
node --import ./tools/battle-setup-check/register.mjs tools/chaos-plan-check.mjs
node tools/chaos-mechanics-preservation-check.mjs
node --import ./tools/battle-setup-check/register.mjs tools/chaos-planner-check.mjs
```
