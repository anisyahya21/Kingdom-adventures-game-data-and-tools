# Surround effects: native recovery

12 September 2026. Original ARM64 code and extracted game tables support the findings below. These are static findings, not original-game runtime validation. The builder has not yet been changed into an effects simulator.

## Area of effect

`AroundEffectSystem.EnumerateFacilitiesInEffectRange` (`0x14e3c14`) passes **radius 3, excludeCenter true** to `RectUtil.EnumerateLocationsInRangeRect` (`0x1460480`) at `0x14e3e00..0x14e3e0c`.

- An ordinary source with a MapChipRect uses that rectangle, expanded by three cells on all sides. The source rectangle itself is excluded.
- A source without a MapChipRect, or with MapChip `FLAG_AREA_MERGE` (2048), uses a 1×1 rectangle at its cell instead.
- Thus a 1×1 source searches the surrounding 7×7 square minus its own cell: 48 cells, including diagonals. An ordinary 2×2 source searches an 8×8 square minus its four source cells: 60 cells.
- Each searched cell resolves through `MapSystem.GetMapChip(world,x,y,building:true)` (`0x15b00c8`). This is a cell lookup, **not a requirement that a target's entire footprint fit inside the area**. Do not reuse the builder's whole-footprint town-coverage test here.
- That lookup reaches `0x15b0158`: it checks the map cell's child for MapChip types 17, 7, 100, 101 or 9; it returns that child except category 78, which falls back to the base map cell. If no matching child exists, it also returns the base cell. This is more specific than selecting every object whose footprint overlaps the effect square.
- The filter (`0x14e5ff4`) rejects null/destroyed entities, the source entity, entities without Facility, and entities whose MapChipRect shares the source rectangle's x/y origin. No wall raycast, circular-distance test, or town-membership filter appears in this enumeration.

This radius is unrelated to the 7/8/10/12 expansion ranges of Torch, Nighttime Meeting Place, Low Watchtower and Turret.

## Emitters and targets

`CanAffectSurroundingsAroundEffect` (`0x14e4248`) requires a Facility with at least one defined effect. For ordinary multi-cell rectangles, only the cell at `(rect.x+width-1, rect.y+height-1)` emits. Area-merge/no-rectangle sources bypass that representative-cell gate. Preserve this native entity distinction when mapping compound builder buildings to effects.

`AddAroundEffects` (`0x14e437c`, flag check at `0x14e44ac`) rejects a target with Facility `FLAG_NO_AROUND_EFFECT` (2097152). `CanBeAffectedBySurroundings` (`0x14e5338`) adds these category checks:

| Category | Required target behavior |
|---|---|
| 0: Stat EXP | Its base `FacilityData.GetBonusParamExp(effect.Type, limitLevel)` must be positive. An Attack EXP effect cannot give an otherwise non-training target Attack training. |
| 1: Recovery | `FacilityData`'s recovery predicate (`0x16228f8`) must pass. |
| 2: Warehouse capacity | No additional category-specific check here, but no active entries were found. |
| 3: Maximum HP | Base `GetMaxHp(level, limitLevel)` must be positive. |
| 4: Targeting cost | No additional category-specific check here. |

## Strength and stacking

`FacilityData.GetAroundEffectValue` (`0x1622fe0`) reads the effect's minimum/maximum and the **shared FacilityData upgrade level**, capped at the source FacilityComponent's nonzero limit level. It calls the interpolation helper at `0x23fe33c` with 99 steps, `level-1`, amplitude zero. The interior calculation uses float32 and truncates toward zero; endpoints clamp to minimum/maximum.

For the common 5→25 effect, levels 1/25/50/75/100 give **5/9/14/19/25**, respectively. This is not driven by Town Hall rank or by a newly invented per-instance level.

`FacilityComponent.AddAroundEffect` (`0x14c94e4`, especially `0x14c95d8..0x14c9620`) **adds** Value into a dictionary keyed by Type inside a Category cache. `GetAroundEffectValue` (`0x14c9100`) returns that sum, or zero if absent. There is no strongest-only or same-facility-type exclusion in this accumulator. Do not confuse the visual notification queue's grouping in `AroundEffectSystem.Update` with gameplay stacking.

Let `S` be the resulting category/type sum:

| Effect | Confirmed consumer formula | Native method |
|---|---|---|
| Stat EXP | `truncate(baseStatExp × (100 + S) / 100)` | FacilityComponent.GetBonusParamExp `0x14c91ec` |
| Recovery | `truncate(baseRecoveryRate(paramId) × (100 + S) / 100)` | FacilityComponent.GetRecoveryRate `0x14c9098`; uses recovery Type -1 |
| Maximum HP | `truncate(baseMaximum × (100 + S) / 100)` for facility HP parameter 10, unless immune | Param.GetMaxValue `0x16609ec`, effect application `0x1660c3c..0x1660cbc` |
| Targeting cost | `truncate(baseAttackPriority × max(0, 100 - S) / 100)` | FacilityComponent.GetAttackPriority `0x14c9434` |

For example, two qualifying +5 EXP contributions turn a base 20 into 22, rather than applying two sequential rounded multiplications. Base 3 with +10 remains 3 because of integer truncation. Targeting cost reaches zero at a sum of 100; it does not become negative. The eventual enemy-target selection behavior must be traced before labeling this as a precise aggro/chance reduction.

## Original effect catalog

Generated evidence is in workspace `RE-evidence/20260911-building/placement/surround-effects/catalog.json` and `catalog.md`, from `tools/recovery/recover_surround_effects.py`.

All **243 original Facility rows** were checked against the shared lookup's three effect slots. There are **81 source facility types and 85 active entries**:

- 57 stat EXP effects.
- 11 recovery effects.
- 15 maximum HP effects.
- 2 targeting-cost effects: Simple Stove and Bonfire.
- No warehouse-capacity effects. Category 2 is defined, but there are no active table entries and the native direct-call scan found no category-2 consumer through GetAroundEffectValue. Do not expose a functional storage bonus based only on the enum.

Examples: Fence supplies HP EXP; Wood Wall supplies Energy EXP; Defensive Wall supplies Defense EXP; Castle Wall supplies Agility EXP; Gate supplies maximum HP. Torch supplies Dexterity EXP plus Love EXP; Nighttime Meeting Place supplies Intelligence EXP plus Love EXP. Most entries scale 5→25; those additional Love effects scale 2→15. The full generated catalog records all entries and source MapChip geometry/area-merge flags.

The extractor handles variable-length original rows using their fixed tail layout, verifies all 12 effect fields against the lookup, and checks endpoints/limit behavior: **498 deterministic extraction/formula checks passed**. These checks are not execution of the original game.

## Builder simulation boundary

The native categories, source values, radius, accumulator and four consumer formulas are recovered. Ordinary `ChipPlaceSystem.PlaceChip` placements create one Facility entity and attach its `MapChipRect`; the same entity is linked into the cell-child lists for that footprint (`World.CreateBuilding` `0x1477e04`, placement `0x15042e0`). `MapSystem.GetMapChip` (`0x15b00c8` → `GetMapChipBuild`, `0x15b0158`) may therefore return the same entity for several queried cells. After its selector and candidate filter, `EnumerateFacilitiesInEffectRange` (`0x14e3c14`) tail-calls LINQ `Distinct<object>` (`0x188f264`). `Entity` does not override `object.Equals`, so repeated references to one placement are collapsed by reference identity. A compound placement contributes to or receives an effect once per source-target pair, not once for each footprint cell. These are static native findings, not runtime observations.

The remaining layout boundary is the native first-match behavior of `GetMapChip(building:true)` when indoor and outdoor children overlap or share a cell: the lookup checks child types in native order and may fall back to the base cell. A simulator must use the placement/entity model and lookup order rather than count every footprint overlap, and its legal placement rules must prevent layouts the game rejects. Source representative-cell and area-merge rules are described above; whether a particular overlapping indoor/outdoor arrangement is accepted still depends on the map/layout validator.

Before reporting complete layout results, the builder adapter must also preserve:

1. Shared facility upgrade levels and each instance's level cap, separate from Town Hall rank. The current builder only exposes town rank and lacks these simulation inputs.
2. Base target training/recovery/HP/attack-priority values, including applicable level limits. Surround percentages alone cannot produce meaningful final stats or training-per-hour results.

Place/destruct/level-up hooks exist on AroundEffectSystem; `AddAroundEffectsToFacility` (`0x14e3e98`) rebuilds contributions for new targets, and `OnLeveledFacilityUp` (`0x14e5700`) updates emitters. A builder can recompute a static layout deterministically, but it should not claim to simulate staffing, visits, combat, elapsed production or construction timing from these aura formulas.
