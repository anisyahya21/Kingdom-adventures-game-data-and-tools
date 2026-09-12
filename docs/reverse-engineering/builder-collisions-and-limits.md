# Builder collision previews and Chaos Stone supply

Recovered/checked 12 September 2026. Original table/native-code evidence is distinct from website tests; no original-game runtime validation.

## Report and reproduction

The user confirmed that some apparent overlapping Chaos Stones disappeared on Cancel. Browser reproduction showed the second placement was rejected with “This space is already occupied.” The invalid translucent ghost nevertheless remained over the saved structure. This was confusing preview presentation, not demonstrated saved overlapping occupancy.

Invalid ghost sprites are now omitted for all facilities. The saved original stays visible during an invalid move. Red footprint marks and a “Cannot place” label remain. Valid ghosts are explicitly labelled “Preview … tap to place.” Successful repeated placement clears the old cursor preview. This is editor presentation.

All 235 rendered facility dimensions were cross-checked with original MapChip component size × unit size, retaining the previously recovered Town Hall/port reserved rings. The collision audit covers all four rotations and every occupied square, duplicate placements, move exclusions, existing indoor/plot tests, and rejected-preview rendering. 17,511 total builder assertions pass. Browser verification confirms a rejected second stone creates no extra sprite, and placement stops at the seventh copy.

## Seven normal-source Chaos Stones

Original Survey.txt rows 10, 21 and 32 each have maxEarnableRewardCount=2 and rewardTreasureId=765. Treasure765 has MapChip221 at 100%, quantity1. The surveys therefore supply six stones. Original Area94 (level5100) links Treasure352, with another MapChip221 at 100%, quantity1. Total supported normal acquisition supply: seven.

SurveyData.isRemainingEarnableRewardCount `0x1633018` reads max count at +0x38, permits unlimited only for -1, and otherwise tests ClampMin(max-successCount,0)>0. AddSuccessCount `0x16333ac` increments +0x8c. SubForm.UpdateSurveyResult `0x16f8af0` increments the per-SurveyData counter and `0x16f8e54..68` delivers its exact treasure ID. Evidence slices live in workspace `RE-evidence/20260911-building/placement/limits-1633018.asm`, `limits-16333ac.asm`, and the existing treasure `16f860c.asm`.

This is not a native stock-storage cap of seven: FacilityData constructor `0x16243d4..e0` initializes maxStock to999; MapChipData.get_maxStock `0x162d3e0` delegates to FacilityData. Generic delivery Treasure938 also contains a Chaos Stone, but an additional obtainable source is not established (see treasure-lookup.md on group999 task-delivery records). Seven is the builder budget for supported normal sources, not a claim about every possible external offer/task.

`tools/recovery/recover_builder_limits.py` checks original Survey/Treasure/Area rows and emits `builder-acquisition-limits.json`. The shared validator blocks additional Chaos Stones at seven, while movement, rotation and removal remain available. The menu displays placed/available count and disables new placement at the limit. Existing saves above seven remain intact and cannot add more. Other facilities are not assigned invented acquisition limits.

Production build passes. Typecheck retains the existing48 unrelated errors in equipment, runtime-world-render-lab and timed-events, with no errors in changed builder files.
