# Land State and Monster Spawn Leads

Date created: 2026-05-17
Status: secondary watch ledger for map/world-builder research

## Purpose

Capture evidence about land-state and monster-spawn mechanics encountered during map, terrain, render, facility, or world-builder reverse engineering.

Primary question:
- Does a tile or area becoming wasteland affect monster spawning?

Watch for:
- wasteland
- land reclamation
- terrain state changes
- monster spawn zones
- spawn eligibility
- spawn level/rank
- biome-based spawning

Known data sources:
- `data/Sheet csv/KA GameData - Monster.csv`
  - Contains monster rows with terrain, area-level min/max, drop data, and stats.
- `data/sheet-research/raw-copies/KA GameData - Monster spawn.csv`
  - Contains researched monster-to-tile/area-level spawn notes.

Current interpretation:
- These CSV files are useful spawn fact sources, but they may not describe the complete rule system.
- Reverse-engineering evidence is still needed for runtime mechanics such as:
  - whether wasteland blocks, enables, or modifies spawning,
  - whether reclaimed land changes spawn eligibility,
  - whether native terrain differs from dug-up/changed terrain,
  - whether monster feed, chaos stones, or boss/full-moon spawns bypass normal terrain rules.

## Monster Spawn Rules

Use this section only when evidence is strong enough to describe an actual rule.

### Template

Function/class/file:
- TBD

Evidence:
- TBD

Practical meaning for map builder:
- TBD

Confidence:
- TBD

## Possible Leads

Use this section for weaker clues that need confirmation later.

### Step 8 Render Export Pass

Function/class/file:
- `Reverse engineering/exports/seb-render-functions`

Why it might matter:
- This pass was checked opportunistically for land-state/spawn terms while analyzing render draw-record helpers.

What needs confirmation later:
- No wasteland, land-reclamation, terrain-state, or monster-spawn code was naturally encountered in this render-focused export.
- Continue watching during map, terrain, town nature, and monster-system exports.

### Existing Monster Spawn CSV

Function/class/file:
- `data/sheet-research/raw-copies/KA GameData - Monster spawn.csv`
- `data/Sheet csv/KA GameData - Monster.csv`

Why it might matter:
- The raw spawn CSV says ground-spawn monsters can use original town tile or dug-up dirt tile when the required area-level condition is met.
- The monster CSV has terrain and area-level min/max fields.

What needs confirmation later:
- Whether wasteland tiles count as a terrain/state that affects normal monster spawning.
- Whether land reclamation changes spawn eligibility immediately or only visual/resource behavior.
- Whether special spawners such as Monster Feed, Chaos Stones, bosses, or full-moon events use different rules.

### Template

Function/class/file:
- TBD

Why it might matter:
- TBD

What needs confirmation later:
- TBD
