# World Map Data Integration: MapChip, Terrain, and Survey

## Overview

This document explains how to build a complete, flexible, and future-proof world map system for Kingdom Adventurers by integrating three key data sources:
- **MapChip.csv**: Defines the properties and visuals of each map tile.
- **Terrain.csv**: Defines gameplay logic and categories for terrain types.
- **Survey.csv**: Specifies survey rules, rewards, and requirements for different terrain types and levels.

Integrating all three allows for precise queries, richer map rendering, and more advanced gameplay features.

---

## 1. Data Source Roles

### MapChip.csv
- Each row defines a unique map tile ("chip") with properties:
  - `id`: Unique tile ID
  - `name`: Visual name (e.g., Grass, Swamp, Road)
  - `type`/`category`: Links to terrain type
  - `movementCost`, `height`, `flags`, etc.: Tile-specific gameplay and rendering properties
- **Purpose:** Controls map visuals, placement, and tile-specific rules.

### Terrain.csv
- Each row defines a terrain type with gameplay logic:
  - `type`/`id`: Terrain type/category
  - `name`: Human-readable name (e.g., Swamp, Iron, Grass)
  - `monsterGroupId`, `dropGroupId`, `materialDropRate`, etc.: Gameplay effects, drops, encounters
- **Purpose:** Controls area-level gameplay logic and links to survey rules.

### Survey.csv
- Each row defines a surveyable event or reward:
  - `terrain`: Terrain type required (matches Terrain.csv)
  - `minAreaLevel`: Minimum level for the survey
  - `rewardType`, `rewardTreasureId`: What is discovered/rewarded
- **Purpose:** Specifies where and when surveys are possible, and what they yield.

---

## 2. How They Work Together

### Data Flow
1. **Map grid** (the world map) stores tile IDs (from MapChip.csv) for each cell.
2. **MapChip.csv**: For each tile ID, provides visual and tile-specific data, and links to a terrain type via `type` or `category`.
3. **Terrain.csv**: For each terrain type, provides gameplay logic and links to survey rules.
4. **Survey.csv**: For each survey, specifies which terrain types and levels allow it.

### Example: Finding Surveyable Tiles for a Master Instructor at Level 120
1. **Survey.csv**: Find rows with `rewardType` = Master Instructor, `terrain` = 3, `minAreaLevel` = 120.
2. **Terrain.csv**: Find `type` = 3 (e.g., "Iron").
3. **Map grid**: Scan for tiles where MapChip.type/category = 3 and (if available) tile level >= 120.
4. **Result**: List of (row, col) coordinates for valid tiles.

---

## 3. Why Integrate MapChip?
- **Visuals & Placement:** MapChip controls how the map looks and how tiles are placed.
- **Tile-Specific Rules:** Allows for advanced rules (e.g., only certain MapChip types are surveyable, or only tiles with specific movement costs or flags).
- **Future-Proofing:** Adding new tile types or rules is easy—just update MapChip.csv and the map grid.
- **Advanced Queries:** Enables questions like "Which exact tiles allow a survey?" or "Show all Swamp tiles with movement cost > 50 that are surveyable."

---

## 4. Implementation Steps
1. **Update the map grid** to store MapChip IDs for each cell (if not already).
2. **Link MapChip to Terrain** using the `type` or `category` field.
3. **Link Terrain to Survey** using the `terrain` field in Survey.csv.
4. **For any query:**
   - Map grid cell → MapChip ID → MapChip.type/category → Terrain.csv → Survey.csv
   - Filter by additional properties as needed (e.g., tile level, flags).

---

## 5. Example Use Cases
- **Find all tiles where a Master Instructor can be surveyed at level 120:**
  - Use Survey.csv to get terrain and level requirements.
  - Use Terrain.csv to interpret terrain type.
  - Use MapChip.csv and the map grid to find all matching tiles.
- **Show all surveyable Swamp tiles with movement cost > 50:**
  - Filter MapChip for Swamp tiles with movementCost > 50, then cross-reference with Survey and Terrain rules.

---

## 6. Summary
- Integrating MapChip, Terrain, and Survey data creates a robust, flexible world map system.
- This approach supports advanced gameplay, richer visuals, and easier future expansion.
- Always use all three data sources for any map-based logic, queries, or rendering.

---

## 7. Current Project Readings

### What the website is using today
- `KA GameData - Map.csv`
  - current reliable source for the native 10x10 biome + level grid
- `Kingdom Adventurers EN - Map.csv`
  - community/reference full map layout and unlock notes
- `KA GameData - Terrain.csv`
  - terrain gameplay rows
- `KA GameData - Survey.csv`
  - survey rules, terrain requirements, level thresholds, and timing/success data
- `KA GameData - MapChip.csv`
  - tile/chip metadata layer now being integrated on `Map 2 Testing`

### Phase 1 MapChip interpretation
- We do **not** yet have a decoded full-map chip grid.
- Because of that, `Map 2 Testing` currently keeps the known-good map layout from the existing map data and enriches each biome tile with a representative MapChip row.
- Representative biome chips from `MapChip.csv`:
  - Grass: chip `8`, `relatedDataType=2`, `relatedDataId=9`
  - Sand: chip `9`, `relatedDataType=2`, `relatedDataId=14`
  - Rock: chip `10` (`Cliff`), `relatedDataType=2`, `relatedDataId=19`
  - Snow: chip `11`, `relatedDataType=2`, `relatedDataId=29`
  - Swamp: chip `12`, `relatedDataType=2`, `relatedDataId=34`
  - Volcano: chip `13`, `relatedDataType=2`, `relatedDataId=24`
  - Ground/start area placeholder: chip `5` (`Dirt`), `relatedDataType=2`, `relatedDataId=4`

### Why this is only phase 1
- This gives us real chip metadata now:
  - chip name
  - chip id
  - movement cost
  - move speed rate
  - height
  - linked terrain row
- But it is still a representative layer, not the final true per-cell chip map.
- Future phase:
  - decode or import the actual full map chip layout
  - replace representative chip assignment with real per-cell chip IDs
  - then let surveys and other map logic flow through:
    - full-map cell -> MapChip -> Terrain -> Survey

### Current blocker for "real map chips"
- After checking the current repo sources, we **do not yet have** a clean exported sheet/file that stores the world map as exact per-cell `MapChip` IDs.
- Files currently available:
  - `KA GameData - Map.csv`
    - gives the native 10x10 biome + level zones
  - `Kingdom Adventurers EN - Map.csv`
    - gives community/reference full-map notes and unlock layout
  - `KA GameData - MapChip.csv`
    - gives chip definitions and metadata
- Missing piece:
  - a cell-by-cell world map chip layout that says which exact `MapChip.id` is placed at each world coordinate
- Result:
  - exact per-cell chip rendering is blocked until we find/export that layout or decode it from another source
- Safe rule for the project:
  - do not claim "real map chips" are implemented until that per-cell source exists in the repo or is decoded reproducibly

---

**For further questions or to extend this system, see the code comments and data schemas in each CSV file.**
