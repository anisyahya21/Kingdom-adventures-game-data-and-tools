# Training facility stat XP

30 September 2026. Static native-code and source-table recovery; not validated by running the original game. Formula confidence: confirmed from the frozen G2.1 native binary and `dump.cs`. The targeted instruction listings and binary hashes are preserved under `RE-evidence/20260930-training-xp/native-listings/`.

## Formula

`FacilityData.GetBonusParam(paramId)` (`0x16229f4`) indexes `bonusParameters` at `paramId - 10`. `FacilityData.GetBonusParamExp` (`0x1622a8c`) reads the first two integers of that stat's pair and returns:

```text
effectiveLevel = limitLevel != 0 ? min(FacilityData.level_, limitLevel) : FacilityData.level_
baseXP         = initial + increment * (effectiveLevel - 1)
```

If the parameter pair is missing or has fewer than two values, the native method returns zero. `FacilityComponent.GetBonusParamExp` (`0x14c91ec`) then looks up the accumulated category-0/stat-ID aura sum `S` and applies:

```text
finalXP = trunc_toward_zero(baseXP * (100 + S) / 100)
```

This final percentage operation uses signed 32-bit integer multiplication and division, not float math; all matching source contributions are added before the one multiplication/division. A target can receive a stat-EXP aura only when its base XP for that stat is positive (`0x14e5338`).

Stat IDs from the `Facility_lookup.csv` bonus-parameter order and native aura catalog: 10 HP, 11 MP, 12 Vigor/Energy, 13 Attack, 14 Defence/Defense, 15 Speed/Agility, 16 Luck, 17 Owned, 18 Intelligence, 19 Dexterity, 20 Gathering, 21 Move/Movement, 22 Heart/Love. `Owned` is present in the source table but is not one of the displayed training stats or active stat-EXP aura types.

Examples from `KA-Website/data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv`: Training Room (id 132) has Attack `[10, 5]`, Speed `[5, 5]`, Luck `[5, 5]`; Magic Training Ground (id 134) has MP `[20, 8]`, Intelligence `[12, 8]`, Dexterity `[12, 8]`. At level 2, Training Room Attack is 15 base XP; a summed +25% stat aura produces 18 XP after truncation.

## Levels and caps

`FacilityData.MAX_LEVEL` is 100. The same type defines `FLAG_NO_LVUP = 32`; this is the no-level-up flag, not a level cap of 32. `FacilitySystem.CanLevelUp` (`0x1573630`) checks the facility data with `BaseData.Check(..., 0x20)` and blocks when this bit is set. It also blocks when stored data level exceeds 99 or the instance limit has been reached. `FacilitySystem.LevelUp` (`0x15773f0`) calls this gate before `FacilityData.Levelup` (`0x1622170`), which advances a level through 100 and stops there.

The live `FacilityComponent` level is clamped by its nonzero `limitLevel` (facility entity parameter 23). `get_maxLevel` (`0x14c89ec`) returns that per-instance limit when present; otherwise it returns `TownSystem.GetMaxTownRank` (`0x1600b00`), whose native body computes `min(30 + ValuableSystem.GetSpEffect(1), 99)`. Thus the normal town-rank fallback tops out at 99, while an explicit instance limit can permit level 100. `AppData.ClampMax` (`0x16657c8`) is an upper-bound clamp only (`min(value, max)`).

For stat-EXP emitters, `FacilityData.GetAroundEffectValue` (`0x1622fe0`) uses float32 linear interpolation over levels 1–100, with the source's nonzero `limitLevel` as an upper cap, then truncates the interpolated value toward zero. The radius, eligible source catalog, and per-cell map lookup are documented in [`surround-effects.md`](surround-effects.md); this note resolves how ordinary compound footprints map back to one facility entity. A legal editor should derive `S` only from actual selected source facilities/levels and validated placements; it should not accept a free-form percentage or source count. A conservative editor can restrict layouts to collision-checked single-cell placements on one map layer; supporting multi-cell placements requires retaining each placement as one rect-bearing entity and respecting the native source anchor and candidate `Distinct` behavior described below.

## Visit eligibility

Having a positive `bonusParameters` pair does not alone make a facility award stat EXP during resident use. `FacilityComponent.get_isAvailable` (`0x14c8a14`) calls `BaseData.Check(facilityData, 4)`, where `4` is `FacilityData.FLAG_USE`, and also rejects the instance when its `FacilityComponent.flag` has bit `8` set. Both resident-candidate callbacks for furniture and outdoor facilities additionally require a Facility component and fewer than one assigned staff member (`0x14d663c`, `0x14d6a4c`). The random facility selectors use those callbacks before entering the corresponding use state.

The actual stat-EXP award path is `AISystem.UpdateUseFurniture` (`0x14a9734`) and `AISystem.UpdateUseOutdoorFacility` (`0x14af564`): each obtains `FacilityComponent.GetAvailableBonusParams` (`0x14c9404`), shuffles the available positive stat entries, takes a random one to three, and passes the selected parameter and XP to `AIComponent.AddCommandExp` (`0x14c54e4`). `AISystem.ScrExp` (`0x148a62c`, script type `SCR_EXP = 26`) processes that command by adding the EXP to the selected `Parameter.expBuf` field, then emits an EXP event and gauge. Thus the displayed XP is the exact amount sent to a stat's EXP buffer when selected on a visit; the native code does not promise that every positive stat is awarded on each visit. `Param` IDs 10–12 are HP, MP and Energy, so positive bonus pairs for those IDs are stat EXP too. Keep them separate from a facility's recovery rates: `FacilityData.GetRecoveryRate` (`0x16228b4`) / `FacilityComponent.GetRecoveryRate` (`0x14c9098`) form a separate recovery channel, consumed by resident recovery/sleep and related paths. A facility with positive table values but without `FLAG_USE` is not a valid resident-use XP facility. This excludes the Monster Statue (85), Monster-Repelling Orb (86), Monster-Repelling Sword (87), Monster-Repelling Slate (88), Chair (106), Rejuvenating Bath (135), and Fishing Pond (241) from this resident stat-EXP catalog; their other effects or recovery behavior are separate.

### User-provided UI screenshot cross-check

These are visual readings from screenshots supplied during this task, recorded as corroboration rather than proof of native behavior or exact in-game wording. The Kairo King Statue (Facility 186) screenshot at Lv35/80 showed 146 for HP/MP/Vigor under “Recovery,” 146 for Attack/Defence/Agility/Luck EXP, and 200 for Intelligence EXP. Its lookup row has 15% HP/MP/Vigor recovery rates, while its HP-through-Luck bonus pairs are `[10,4]`, which yield 146 at level 35; Intelligence through Love use `[15,4]`, yielding 151 base, and an Intelligence aura sum of 33 yields `trunc(151×1.33)=200`. This numeric match suggests the screenshot's 146 values under “Recovery” are reading the stat-EXP outputs; the native recovery-rate values are a separate 15% channel. The Magic Training Ground (Facility 134) Lv53/75 screenshot was read as blank HP Recovery, MP “Recovery” 436 (uncertain), Intelligence 1391 (unclear), and Dexterity EXP 428. Its MP pair `[20,8]` yields 436, and Intelligence/Dexterity pairs `[12,8]` each yield 428; the ambiguous screenshot labels/readings are not used as native evidence.

## Multi-cell facility identity

The compound-cell identity question is resolved for ordinary MapChip facility placements. `ChipPlaceSystem.PlaceChip` (`0x15042e0`) calls `World.CreateBuilding` (`0x1477e04`) once for a placed facility entity, attaches its `MapChipRect`, and links that same entity into the cell-child lists covered by the rectangle. `MapSystem.GetMapChip` (`0x15b00c8` → `GetMapChipBuild`, `0x15b0158`) can therefore return the same entity for more than one enumerated cell. `EnumerateFacilitiesInEffectRange` then applies its MapChip selector and candidate filter before tail-calling LINQ `Distinct<object>` (`0x188f264`); `Entity` does not override `object.Equals`, so duplicate references to the same placement collapse. Both a 1×1 and a 2×2 facility instance contribute/receive once per source-target pair, not once per footprint cell. The native lookup still uses its first-match order for overlapping indoor/outdoor child entities; consult the map/layout validator for placements that compete for one cell.

For ordinary MapChipRect emitters, `CanAffectSurroundingsAroundEffect` (`0x14e4248`) requires the entity's cell coordinate to equal the rectangle's bottom-right cell `(xi + width − 1, yi + height − 1)`. This is an entity anchor/representative-cell rule; a layout simulator must use the placed entity once with its real footprint and anchor, not synthesize one emitter per tile. The five 2×2 stat-EXP emitters in the recovered catalog—Turret (MapChip 82), Rest Stop (126), Fruit Tree (285), Santa Room (298), Fishing Pond (303)—are ordinary single-chip placements (`FacilityData.combination=0`), not the FacilityData `chips[]` construction path. Their MapChipData footprints are all 2×2 (`unitWidth=unitHeight=1`).

The native listings and exact frozen-code hashes are in `RE-evidence/20260930-training-xp/native-listings/` for `World.CreateBuilding`, rectangle attachment, cell-child insertion, map-cell lookup, source-anchor gating and the `Distinct` tail call. The use eligibility and resident XP award/processing listings are in `RE-evidence/20260930-training-xp/native-listings/eligibility/`; `slices.json` records their code hashes against the frozen binary. The full placement listing already preserved at `RE-evidence/20260911-building/placement/polish-15042e0.asm` shows the repeated insertion of the same entity across its footprint. This resolves footprint duplication for ordinary facility placements; cells with overlapping indoor/outdoor candidates still follow `GetMapChip`'s native first-match order and must be resolved through the map/layout validator.

## Provenance

- Native index entry points: `KA-Website/docs/reverse-engineering/NATIVE-INDEX.md`, `KA-Website/tools/recovery/ka_index.py`, and `KA-Website/tools/recovery/combat_native.py`.
- Frozen native binary: `RE-evidence/G2.1/39257e72291d/inputs/libil2cpp.so`, SHA-256 `fb834373cb3bd1dc7dac941fcf94113f3b5123e033cf0a41d5e00c0656e30208`.
- Frozen declarations: `RE-evidence/G2.1/39257e72291d/dump/dump.cs`, `FacilityData` (`TypeDefIndex 1284`), including `FLAG_NO_LVUP`, `MAX_LEVEL`, and `Levelup` RVA.
- Targeted slices generated from the indexed extents and frozen binary: `RE-evidence/20260930-training-xp/native-listings/`. `slices.json` records each code hash and the source binary hash. The existing exact consumer and aura-interpolation slices are `RE-evidence/20260920-native-index/slices/14c91ec.asm` and `RE-evidence/20260920-native-index/slices/1622fe0.asm`.
- Surround catalog/source: `KA-Website/docs/reverse-engineering/surround-effects.md`, `RE-evidence/20260911-building/placement/surround-effects/catalog.json`, and `KA-Website/data/sheet-research/raw-copies/KA GameData - Facility_lookup.csv`.
