# Facility.csv — Research Notes

All findings below are confirmed against in-game values unless marked ⚠️ (uncertain).

---

## Column Mapping (Facility.csv)

### Identity
| Col | Name | Notes |
|-----|------|-------|
| 0 | `id` | Row index (0-based). Used as the facility's data ID. |
| 1 | `type` | Facility type category (see Type IDs section below). |
| 2 | `exp` | Always 10 — likely build XP awarded. |

### Build Costs (minCosts = level 1, maxCosts = max level)
| Col | Name | Material |
|-----|------|----------|
| 3 | minCosts[0] | Always 6 — unknown (possibly "size slot cost"?) |
| 4 | minCosts[1] | Always 0 — unused/padding |
| **5** | **minCosts[2]** | **Grass** ✅ (Fence=1, Grass Storehouse=2) |
| **6** | **minCosts[3]** | **Wood** ✅ (Wood Wall=2, Mine:Ore=3) |
| **7** | **minCosts[4]** | **Food** ✅ (Food Storehouse=2) |
| **8** | **minCosts[5]** | **Ore** ✅ (Defensive Wall=2, Mine:Ore=5) |
| **9** | **minCosts[6]** | **Mystic Ore** ✅ (Castle Wall=1, Mine:Mystic=8) |
| 10 | maxCosts[0] | Always 6 — mirror of minCosts[0] |
| 11 | maxCosts[1] | Always 0 — unused/padding |
| **12** | **maxCosts[2]** | **Grass max** ✅ (Fence=10, Grass Storehouse=20) |
| **13** | **maxCosts[3]** | **Wood max** ✅ (Wood Wall=18, Mine:Ore=27) |
| **14** | **maxCosts[4]** | **Food max** ✅ (Food Storehouse=16) |
| **15** | **maxCosts[5]** | **Ore max** ✅ (Defensive Wall=14, Mine:Ore=35) |
| **16** | **maxCosts[6]** | **Mystic Ore max** ✅ (Castle Wall=6, Mine:Mystic=48) |

> **How min/max costs work:** Level 1 build uses minCosts. Max-level build/upgrade uses maxCosts.
> The cost at any given level scales linearly between min and max.
> Example: Mine:Ore min=3 wood+5 ore, max=27 wood+35 ore → level ~5 ≈ 14 wood+19 ore (confirmed in-game).

### Prices / Chips (⚠️ purpose not fully confirmed)
| Col | Name | Notes |
|-----|------|-------|
| 17–18 | prices[0..1] | Two values, often 2 and 1. Purpose unknown. |
| 19 | `dataId` | Internal data reference. |
| 20 | `combination` | Always 1. |
| 21 | `parentChipId` | References a parent chip — -1 if none. |
| 22–25 | chips[0..3] | Up to 4 chip IDs. Often -1 or 0 if unused. |

### Physical Properties
| Col | Name | Notes |
|-----|------|-------|
| 26 | ⚠️ unknown | Often empty. Possibly tile/wall type. |
| **27** | **wall** | Wall type ID. e.g., Fence=29, Wood Wall=27, Gate=35, Torch=-1. |
| **28** | **constructionTime** | Build time in **seconds** (level 1). e.g., Fence=240s=4min, Gate=240s. |
| **29** | **minHp** | HP at level 1. e.g., Fence=15, Town Hall=50. |
| **30** | **maxHp** | HP at max level. e.g., Fence=315, Town Hall=500. |
| 31 | `initNum` | ⚠️ Sometimes non-zero (e.g., Fence=10). Possibly initial build count. |
| **32** | **validRange** | Territory expansion radius in tiles. 0 = no expansion. |
|  |  | Town Hall=15, Gate=0, Torch=7, Meeting Place=8, Watchtower=10, Turret=12 |
| 33 | `usePriority` | ⚠️ Unknown. |
| 34–36 | motion/offsets | Visual offsets (X/Y/Z). Can ignore for data pages. |
| 37 | `recoveryIntervalFrame` | Recovery tick rate. |

### Stats (bonusParameters — cols ~38–80+)
These are stat bonuses the facility gives to residents or the surrounding area.  
Format: arrays of `[count, initialValue, incrementPerLevel]` per stat type.  
Stats include: HP, MP, Vigor, ATK, DEF, SPD, Luck, INT, DEX, Gather, Move, Heart.  
⚠️ Exact column positions not yet mapped — needs more research.

### Around Effect (area aura effects — cols ~87–98)
| Col range | Name | Notes |
|-----------|------|-------|
| ~87–98 | aroundEffectCategory/Type/MinValue/MaxValue × 3 | Up to 3 aura effects on nearby buildings/residents. |

### Level Up
| Col | Name | Notes |
|-----|------|-------|
| ~99 | **levelupItemGroupId** | **-1 = cannot be upgraded.** Otherwise references upgrade item group. |
|  |  | Walls/Gates/Territory: group 3–7. Storehouses: group 5. Production: group 6. |
| ~100–105 | minLvupCosts[0..5] | Material costs to upgrade (at level 1→2). Same material order as build costs. |
| ~106–111 | maxLvupCosts[0..5] | Material costs to upgrade at max level. |
| ~112 | `minLvupTimeSeconds` | Time to upgrade at level 1 (seconds). |
| ~113 | `maxLvupTimeSeconds` | Time to upgrade at max level (seconds). |

### Production (for production facilities)
| Col | Name | Notes |
|-----|------|-------|
| ~114 | `minProductCapacity` | Minimum storage capacity for produced materials. |
| ~115 | `maxProductCapacity` | Maximum storage capacity. |
| ~116 | `minProductTimeSeconds` | Min time per production cycle (seconds). |
| ~117 | `maxProductTimeSeconds` | Max time per production cycle (seconds). |

### Usage / Crafting
| Col | Name | Notes |
|-----|------|-------|
| ~118 | `workCostType` | Type of resource consumed when using the facility. -1=none. |
| ~119–122 | work cost/effect/time | Costs and outputs for facility usage. |
| ~123 | `capacity` | Max simultaneous users. |
| ~124 | `maxQueue` | Queue size. |
| ~125–126 | `minUseCountLimit` / `maxUseCountLimit` | Usage limits per day. 0=unlimited? |
| ~127–128 | `useCountLimitUnlockItemId` / `Num` | Item needed to unlock more uses. |
| ~129–132 | craft term/time columns | Studio level and INT required to craft items. |
| ~133 | `attackPriority` | Monster targeting priority when attacking. |
| ~134 | `maxUseCountOneDay` | Max times usable per day. |
| ~135 | `craftGroup` | Crafting category group ID. |

### Metadata (last columns)
| Col | Name | Notes |
|-----|------|-------|
| ~136 | **explain** | In-game description text. `<pic=grass>` etc. are material icons. `未使用` = "unused". |
| ~137 | `hintEvent` | Tutorial hint event ID. -1=none. |
| ~138 | `evolutionChipId` | Evolution chip ID. |
| ~139 | `vehicleId` | Vehicle reference. -1=none. |
| ~140 | **flag** | Build/behavior flags (bitmask). 0=none. |

---

## Flag Values (col ~140)

Notable flag values observed:
- `0` — Standard buildable facility (walls, gates, production, storehouses)
- `33554434` — Player-owned Town Hall / special facility
- `3145728` / `3145760` etc. — Common for unused/internal entries
- `137363492` — Canal (has special water tile behavior)
- `36700192` — UI/service buildings (no physical presence on map)
- `未使用` in explain column always indicates the facility is unused/not available to players

---

## Type IDs (col 1) — Known Mappings

| Type | Category | Examples |
|------|----------|---------|
| 1 | Plot/Land | Land plots (small/medium/large/XL) |
| 4 | Facility (craft/buff) | Shrines, training, cooking facilities |
| 6 | Bridge | Bridge tiles |
| 16 | Territory (large) | Low Watchtower, Turret |
| 17 | Storehouse | All material/item storehouses |
| 18 | Production (farm) | Field, Plantation |
| 19 | Road | Roads/paths |
| 21 | Wall | Fence, Wood Wall, Defensive Wall, Castle Wall |
| 22 | Canal/Water | Canal |
| 25 | Ranch | Ranch |
| 29 | Rest/Sleep | Hammock, beds, rest facilities |
| 30 | Trap | Monster decoys/traps |
| 31 | Display | Shop display stands |
| 33 | Signpost/Guide | Visitor guide signs |
| 35 | Town Hall | Town Hall (monarch HQ) |
| 36 | Castle (unused) | — |
| 38 | Service facility | Well, Training grounds, Cooking, Statues |
| 41 | Gate | Town gate |
| 45 | Stable/Rental | Stable, Dragon Rental |
| 47 | Training | Training dojo |
| 48 | Well/Fountain | Well |
| 53 | Torch/Light | Torch (territory) |
| 56 | Shop building | Weapon/Armor/Food/Skill/Item shop buildings |
| 57 | Shop storage | Material storage for shops |
| 58 | Watchtower (unused) | — |
| 59 | Meeting place | Nighttime Meeting Place (territory) |
| 60 | Energy | Energy gatherer |
| 61 | Lure/Decoy | Monster lure buildings |
| 62 | Mine | Ore mine, Mystic ore mine |
| 66 | Research/Lab | Research lab |

---

## Known Facilities (Player-Buildable)

### Defense
| ID | Name | Min Cost | Max Cost | HP range | Wall col | Notes |
|----|------|----------|----------|----------|----------|-------|
| 23 | Fence | 1 grass | 10 grass | 15–315 | 29 | Cheapest wall |
| 24 | Wood Wall | 2 wood | 18 wood | 40–430 | 27 | Mid tier wall |
| 25 | Defensive Wall | 2 wood, 2 ore | 18 wood, 14 ore | 65–650 | 25 | |
| 26 | Castle Wall | 3 ore, 1 mystic | 21 ore, 6 mystic | 90–975 | 26 | Strongest wall |
| 28 | Gate | 1 grass, 3 wood | 10 grass, 27 wood | 25–600 | 35 | Opens/closes |

### Territory Expansion
| ID | Name | Min Cost | Max Cost | validRange | Build time |
|----|------|----------|----------|------------|-----------|
| 29 | Torch | 3 wood | 27 wood | 7 | 720s |
| 30 | Nighttime Meeting Place | 3 grass, 4 wood | 30 grass, 36 wood | 8 | 240s |
| 31 | Low Watchtower | 5 grass, 8 wood | 50 grass, 72 wood | 10 | 720s |
| 32 | Turret | 7 grass, 11 wood | 70 grass, 99 wood | 12 | 1200s |

### Town Hall
| ID | Name | Min HP | Max HP | validRange | Notes |
|----|------|--------|--------|------------|-------|
| 17 | Town Hall | 50 | 500 | 15 | Every 10 levels = territory expansion. Level cap unknown. |

### Storehouses (Standard)
| ID | Name | Min Cost | Max Cost | levelupGroup |
|----|------|----------|----------|-------------|
| 33 | Grass Storehouse | 2 grass | 20 grass | 5 |
| 34 | Food Storehouse | 2 food | 16 food | 5 |
| 35 | Wood Storehouse | 2 wood | 18 wood | 5 |
| 36 | Ore Storehouse | 2 ore | 14 ore | 5 |
| 37 | Mystic Ore Storehouse | 2 mystic | 12 mystic | 5 |
| 38 | Item Storehouse | 2 grass | 20 grass | 5 |
| 39 | Energy Storehouse | 2 wood, 1 food | 18 wood, 8 food | 5 |
| 40 | Treasure Storehouse | 1 wood, 2 ore | 9 wood, 14 ore | 5 |

### Storehouses (High Grade)
| ID | Name | Min Cost | Max Cost | levelupGroup |
|----|------|----------|----------|-------------|
| 206 | HG Grass Storehouse | 2 grass, 2 wood | 20 grass, 18 wood | 5 |
| 207 | HG Wood Storehouse | 2 wood, 2 food | 18 wood, 16 food | 5 |
| 208 | HG Food Storehouse | 2 food, 2 ore | 16 food, 14 ore | 5 |
| 209 | HG Ore Storehouse | 2 ore, 2 mystic | 14 ore, 12 mystic | 5 |
| 210 | HG Mystic Storehouse | 2 mystic | 12 mystic | 5 |
| 211 | HG Energy Storehouse | 3 food | 24 food | 5 |
| 212 | HG Treasure Storehouse | 2 ore, 2 mystic | 14 ore, 12 mystic | 5 |
| 213 | HG Item Storehouse | 3 grass, 3 ore | 30 grass, 21 ore | 5 |
| 214 | HG Egg Storehouse | 2 grass, 2 food | 20 grass, 16 food | 5 |

### Production
| ID | Name | Min Cost | Max Cost | HP | Build time | levelupGroup |
|----|------|----------|----------|-----|-----------|-------------|
| 42 | Field | 1 grass, 2 food | 10 grass, 16 food | 10–510 | 480s | 6 |
| 43 | Plantation | 1 grass, 3 wood | 10 grass, 27 wood | 10–510 | 480s | 6 |
| 44 | Ranch | 5 grass, 10 wood | 50 grass, 90 wood | 10–510 | 480s | 6 |
| 45 | Mine: Ore | 3 wood, 5 ore | 27 wood, 35 ore | 10–510 | 1440s | 6 |
| 46 | Mine: Mystic Ore | 5 ore, 8 mystic | 35 ore, 48 mystic | 10–510 | 1440s | 6 |
| 47 | Mine: Energy ✅ | 3 wood, 5 food | 27 wood, 40 food | 20–520 | 480s | 6 |

### Utility / Service
| ID | Name | Min Cost | Build time | Notes |
|----|------|----------|-----------|-------|
| 41 | ⚠️ Canal? | 3 grass, 5 wood | 960s | "Produces fish." Has craftGroup=25. |
| 66 | ⚠️ Fountain? | 2 grass, 4 wood | 1200s | "Has an effect on surrounding area." evolutionChipId=3 |
| 67 | ⚠️ Well? | 1 grass, 2 wood | 480s | "Makes MP and Vigor recover faster." |
| 68 | ⚠️ Signpost? | 2 wood | 480s | "Helps guide visitors to town." validRange=10 |
| 69 | ⚠️ unknown | 5 wood, 3 food | 480s | "Restores wasteland outside of town." validRange=14 |
| 70 | ⚠️ Stable? | 5 wood, 3 food | 720s | "Allows you to rent horses." vehicleId=0 |
| 71 | Wagen Yard ✅ | 2 wood, 1 ore | 960s | "Used to move things between towns." levelupGroupId=-1 (not upgradeable) |
| 72 | ⚠️ unknown | 1 grass, 2 wood | 1440s | "Used to analyze treasure." type=63 |
| 194 | Egg House | 2 grass | 1440s | "A place to store eggs." levelupGroup=5 |

### ⚠️ NOT player-buildable (found on map only)
| Name | Notes |
|------|-------|
| Trading Post | Found on the world map. Sell group items/equipment/skills to the game. Cannot build or upgrade. |

---

## Key Game Mechanics (from data + in-game)

### Build costs scale with level
- minCosts = cost at level 1 (first construction)
- maxCosts = cost at highest upgrade level
- Mid-level costs interpolate between these two

### levelupItemGroupId
- `-1` = cannot be leveled up at all
- Any other ID = references an item group needed to upgrade
- Same group ID means the same item type is used for upgrades

### validRange (territory)
- 0 = facility does NOT expand territory
- Non-zero = radius of territory expansion in tiles
- Town Hall base range = 15 tiles
- Town Hall expands +territory every 10 levels (confirmed in-game)

### HP
- minHp = HP at level 1 (freshly built)
- maxHp = HP at max level
- Walls gain HP when upgraded — their main upgrade benefit

### Building sizes (for map use)
⚠️ Building footprint size is NOT in this CSV — it is likely in a separate tile/asset definition.
The `wall` column (col 27) references a wall tile type ID, which could be used to look up footprint.
- Known wall IDs: Fence=29, Wood Wall=27, Defensive Wall=25, Castle Wall=26, Gate=35
- Territory buildings (Torch/Watchtower etc.) use wall=-1 (no wall tile, just a radius)

### Storehouse upgrades
Upgrading a storehouse does NOT increase capacity for that material type.
⚠️ Need to confirm what storehouse upgrades actually do.

### Coin storehouses (separate from material storehouses)
id=183: "Used to store Copper Coins." costs 2 wood + 2 mystic
id=184: "Used to store Silver Coins." costs 4 wood + 4 mystic
id=185: "Used to store Gold Coins." costs 6 wood + 6 mystic
All three are upgradeable (levelupGroupId=3).

### Production upgrades
Upgrading production buildings (Field/Mine/Ranch etc.) likely increases:
- Production speed (shorter productTimeSeconds)
- OR production quantity per cycle
⚠️ Exact benefit needs in-game confirmation.

### Usage limits (minUseCountLimit / maxUseCountLimit)
Some facilities (training, cooking, etc.) have a limited number of uses per day.
You can unlock more uses via research or special items (useCountLimitUnlockItemId).

### flag bitmask (col 140)
The `flag` column is a bitmask. `flag=0` = standard buildable facility.
High flag values usually indicate special/internal-only facilities not available to players.
The explain text `未使用` (Japanese: "unused") is a reliable indicator to exclude from the page.

---

## Still Unknown / Needs Confirmation

- [x] Mine: Energy confirmed (id=47, previously called "Energy Gatherer")
- [x] Wagen Yard confirmed (id=71, 2 wood + 1 ore, not upgradeable)
- [x] Trading Post confirmed as map-only (NOT player-buildable)
- [ ] Exact in-game names for remaining facilities (see list below)
- [ ] Confirm: Canal (id=41, 3 grass+5 wood, produces fish)
- [ ] Confirm: Fountain (id=66, 2 grass+4 wood, area effect)
- [ ] Confirm: Well (id=67, 1 grass+2 wood, MP/Vigor recovery)
- [ ] Confirm: Stable (id=70, 5 wood+3 food, rent horses)
- [ ] Confirm names for beds/rest buildings (ids 73, 98-101, 154-156)
- [ ] Confirm names for shrines (ids 79-83)
- [ ] Confirm names for training buildings (ids 75, 82-83, 106, 132-134)
- [ ] Confirm names for shop buildings (ids 107-118, type=56)
- [ ] Confirm names for cooking buildings (ids 76-77, 139, etc.)
- [ ] Confirm names for lure/decoy buildings (ids 78, 85-88)
- [ ] What storehouse upgrades actually improve (capacity? transfer speed?)
- [ ] What production upgrades improve (speed vs quantity)
- [ ] Town Hall upgrade benefits beyond territory expansion every 10 levels
- [ ] Starting resident count at Town Hall level 1, and breakpoints (e.g., does the +1/level rule change near level 100?)
- [ ] `col3` (always 6) and `col4` (always 0) in minCosts — purpose unknown
- [ ] Exact column positions for levelup cost arrays (approximate positions noted above)
- [ ] Building footprint sizes (not in this CSV — likely in tile/asset data)
- [ ] What `flag` bitmask values mean specifically
