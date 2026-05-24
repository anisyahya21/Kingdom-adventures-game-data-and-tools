# Static Facility World Placement — Rules & Discoveries

Confirmed 2026-05-17 by visual inspection against live game data (Kairo Room cells verified by player).

---

## 1. Coordinate Convention: `cellX / cellY` is the Exclusive End

For every 2×2 static facility, the stored `cellX, cellY` is **one tile past the SE corner** of the footprint — the exclusive end of the range, not the top-left origin.

```
Footprint tiles occupied = [cellX-2, cellX-1] × [cellY-2, cellY-1]

  NW tile: (cellX-2, cellY-2)
  NE tile: (cellX-1, cellY-2)
  SW tile: (cellX-2, cellY-1)
  SE tile: (cellX-1, cellY-1)
```

**Verified example — Kairo Room (facility 180):**
```
cellX=56, cellY=88  →  zoneX=3, zoneY=5  (zone formula: zone*16+8)

NW (54,86) f2=41
NE (55,86) f2=53
SW (54,87) f2=54
SE (55,87) f2=53
```

**Implication for rendering:**
```typescript
// WRONG — draws 2 tiles too far south-east
const iso = worldToIso(facility.cellX, facility.cellY, ...);

// CORRECT — draws at NW tile
const iso = worldToIso(facility.cellX - 2, facility.cellY - 2, ...);
```

---

## 2. Building Image ID: Use `MapChip.img`, Not `Facility_lookup.type`

**Wrong source (previously used):** `Facility_lookup.csv` column 2 (`type` field).  
This is a facility-category code, not an image ID. It produced wrong images for 18 of 20 facilities.

**Correct source:** `MapChip.img` (column 10) from the MapChip row where `relatedDataId = facility_id`.

MapChip entries for static one-piece facilities live in CSV rows 225–264 of `KA GameData - MapChip.csv`.
The `img` value is the `building/img.inf` image ID.

**Lookup path:**
```
Facility ID
  → MapChip row where relatedDataId = facility_id  (MapChip rows 225–264)
  → MapChip.img (col 10)
  → building/img.inf: id → filename
  → /tmp/KA_assets/building/<filename>
```

**Full confirmed mapping:**

| Facility ID | Name | Correct img.inf ID | PNG file |
|---|---|---|---|
| 165 | Master Smithy | 60 | building_59.png |
| 166 | Friend Post Office | 61 | building_60.png |
| 167 | Briefing Room | 62 | building_61.png |
| 168 | Weekly Conquest Bonus | 64 | building_63.png |
| 169 | Treasure Room | 65 | building_64.png |
| 170 | Monster Farm | 67 | building_66.png |
| 171 | Trophy Room | 68 | building_67.png |
| 172 | Ranking Board | 69 | building_68.png |
| 173 | Friends Agency | 70 | building_69.png |
| 174 | Job Center | 71 | building_70.png |
| 175 | Material Shop | 72 | building_71.png |
| 177 | Instructor's Room | 74 | building_73.png |
| 178 | Monster Fusion Lab | 75 | building_74.png |
| 180 | Kairo Room | 95 | building_82.png |
| 181 | Underground Arena | 63 | building_62.png |
| 196 | Legendary Cave | 92 | building_79.png |
| 198 | Movers | 94 | building_81.png |
| 200 | Equipment Exchange | 96 | building_83.png |
| 201 | Trading Post | 97 | building_84.png |
| 202 | Date Spot | 98 | building_85.png |

---

## 3. Diamond Anchor: `worldToIso` Returns NW-Tile Center, Not Diamond Center

`worldToIso(cellX - 2, cellY - 2)` returns the **center of the NW tile** in screen space.  
The 2×2 bounding diamond is centered **one tile-halfH below** that point.

```typescript
const halfH_tile = (TILE_HEIGHT * zoom) / 2;          // 12px at zoom=1
const iso        = worldToIso(cellX - 2, cellY - 2, ...);
const diamondCenterY = iso.y + halfH_tile;

// 2×2 diamond vertices:
N: (iso.x,              diamondCenterY - TILE_HEIGHT * zoom)   // iso.y - 12
E: (iso.x + TILE_WIDTH * zoom, diamondCenterY)                  // iso.y + 12
S: (iso.x,              diamondCenterY + TILE_HEIGHT * zoom)   // iso.y + 36
W: (iso.x - TILE_WIDTH * zoom, diamondCenterY)                  // iso.y + 12

// Building sprite bottom (ground contact) at south vertex:
drawY = diamondCenterY + TILE_HEIGHT * zoom - drawH
      = iso.y + 36 - drawH   (at zoom=1)
```

---

## 4. Game Mechanic Anchor: South Tile

The game's area-effect logic for facilities (e.g. Chaos Stone monster spawns) is computed relative to the **SE tile** = `(cellX-1, cellY-1)`.  The rendered south vertex of the 2×2 footprint at `iso.y + 36` corresponds exactly to the south vertex of the SE tile — consistent with this game mechanic.

---

## 5. Port Assembly (Facilities 6–10)

Port is a compound object assembled from the Port MapChip rows, not a one-piece facility sprite.

There are two visible Port locations on the world map:

| Port unlock | Zone | Stored cell | NW anchor |
|---:|---|---|---|
| 7 | (9,6) | (152,104) | (150,102) |
| 44 | (9,2) | (152,40) | (150,38) |

The stored cell uses the same exclusive-end rule as other 2×2 facilities.

Facility `7` is the parent Port entry. Its `combination=2`, `parentChipId=67`, and child chip list is `[70, 68, 69]`.
This confirms the component chips, but it is **not enough by itself** to draw a straight horizontal row.

Practical Port render rule:
- Port itself should be treated as a 4x4 composed facility footprint.
- Stored `cellX, cellY` is the exclusive end of that 4x4 footprint.
- The 4x4 occupied range is `[cellX-4, cellX-1] × [cellY-4, cellY-1]`.
- Each of the four Port component buildings is a 2x2 building placed inside that 4x4.
- Each component follows the same 2x2 exclusive-end / NW-anchor logic used by normal static facilities.
- The renderer must highlight the full 4x4 first, then allow the four 2x2 components to be rearranged within it.

| MapChip ID | img.inf ID | PNG | Note |
|---|---|---|---|
| 67 | 2 | gate_00.png | Parent chip |
| 68 | 3 | gate_01.png | Child |
| 69 | 20 | gate_02.png | Child |
| 70 | 21 | gate_03.png | Child |

All chips have `sizeWidth=2, sizeHeight=2` and flag `Water Only`.  
The 4 chips form a gateway/arch assembly around a water body.
Each chip uses the same 2×2 anchor formula above.

Current manual-layout starting point:

| Order | MapChip | Facility ID | Asset | Relative 2x2 NW anchor |
|---:|---:|---:|---|---|
| 1 | 68 | 8 | `gate_01.png` | (0,0) |
| 2 | 67 | 7 | `gate_00.png` | (2,0) |
| 3 | 69 | 9 | `gate_02.png` | (0,2) |
| 4 | 70 | 10 | `gate_03.png` | (2,2) |

This is only the default editable layout. The runtime page exposes dx/dy controls for each piece and saves the manual layout in browser local storage.

The Port also needs water-side bridge/dock pieces. These are not building sprites:

| Visual role | Asset source | ID | PNG |
|---|---|---:|---|
| bridge deck | `chip/img.inf` | 44 | `hashi00.png` |
| bridge side/rail | `chip/img.inf` | 43 | `bridge_side.png` |
| bridge wall | `wall/img.inf` | 5 | `bridge_wall_00.png` |

Implementation status:
- `/runtime-world-render-test` now renders ports through a dedicated Port assembly pass, separate from `ONE_PIECE_FACILITY_OVERLAYS`.
- The two Port locations are rendered using the confirmed map unlock zones.
- The page highlights the full 4x4 Port footprint and each component's 2x2 footprint.
- The four gate pieces have editable dx/dy anchors so the layout can be corrected manually against game screenshots before deriving a permanent rule.
- Port gate sprites must be drawn through their building `.opt` placement cell, not as raw bottom-anchored PNGs. Confirmed sidecar offsets:
  - `gate_00.opt`: 96x128 cell, image offset `(8,1)`
  - `gate_01.opt`: 96x128 cell, image offset `(0,23)`
  - `gate_02.opt`: 96x128 cell, image offset `(1,16)`
  - `gate_03.opt`: 96x128 cell, image offset `(12,61)`
  This explains why `gate_03.png` looked detached/too low when drawn directly as a raw PNG.
- Port component draw order should follow map depth: pieces farther south/lower on screen draw later and cover pieces behind them.
- The 4x4 Port footprint should visually replace the base tiles under the gate with wasteland-style map chips before gate sprites are drawn.
- Bridge/dock pieces are disabled by default for this manual placement pass. Exact native water-chip replacement and rail attachment rules should be tuned separately after the four 2x2 building anchors are correct.
- Debug focus URLs:
  - `/runtime-world-render-test?focus=port7`
  - `/runtime-world-render-test?focus=port44`

---

## Source Files

- Cell formula verified from: user live-game observation (Kairo Room)
- Image ID mapping source: `data/sheet-research/raw-copies/KA GameData - MapChip.csv` rows 225–264
- Image filenames: `artifacts/kingdom-adventures/tmp/KA_assets/building/img.inf`
- Renderer implementation: `artifacts/kingdom-adventures/src/pages/runtime-world-render-test.tsx`
  - `ONE_PIECE_FACILITY_OVERLAYS` (line ~301) — coordinate + image ID data
  - `drawOnePieceFacilityOverlays()` (line ~2797) — rendering with corrected anchor
