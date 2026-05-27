# Runtime World Render Lab Evidence

- `.map` / `.bin`: the parsed main section is `160 x 160`, big-endian, six `u32` fields per cell plus a row sentinel. Port chip ids `67`, `68`, `69`, `70` are explicit placement facts in the map data.
- `MapChip.txt`: visual truth for chip rendering. The lab now routes `MapChip.res/img/seb/frame` through the matching folder registry instead of assuming every chip comes from `chip/img.inf`.
- `Facility_lookup` exports: used only for relationships. Port family ids `7..10` establish that the port family is a grouped facility and that chip `67` is the verified parent-chip anchor.
- `Wall` lookup exports: used only for visual family membership. Rows `7..10 -> img 44..47, seb 1` identify the wall-sheet resources associated with the port family.
- Runtime reverse-engineering notes: `MapSystem.PlacePort`, `CreateMapChips`, and `BaseWallSystem.IsBridge` indicate that bridge / wall / support pieces are neighbor-aware runtime assembly, not fully explicit static map rows.
- Current remaining inference: the bridge offsets drawn by the lab are still temporary visual fallbacks. They are kept separate from MapChip gate/root rendering and labeled in code as inferred.