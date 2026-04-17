# Treasure loot table plan

This note exists so we can come back later and build a proper treasure/loot-table tool without re-discovering the structure from scratch.

## Goal

Build a reliable treasure viewer that can answer:
- what each treasure type can drop
- the odds for each reward slot
- the quantity ranges
- the source/context for that treasure row

## What the data already supports

From treasure data we already have:
- treasure/container name
- group
- level band (`minLevel` / `maxLevel`)
- HP
- special selectors:
  - `rank`
  - `week`
  - `flag`
- reward lanes:
  - equipment
  - items
  - furniture/placeables
  - valuables
  - skills
  - jobs
- explicit reward rates for each lane/slot
- explicit min/max quantity ranges for item slots

## What a future loot table should key on

Do **not** key rows by treasure `name` alone.

A reliable loot-table identity should preserve at least:
- `name`
- `group`
- `minLevel`
- `maxLevel`
- `hp`
- `rank`
- `week`
- `flag`

## Reliability status

### Already reliable enough to build
- per-row reward odds
- per-row quantity ranges
- per-row reward categories
- weekday/rank bonus rows
- battle bonus rows

### Not fully reliable yet
- exact meaning of every `group` bucket
- exact source label for some treasure families
- whether some rows are map biome-specific, event-specific, or system-specific

## Practical conclusion

Yes, we likely already have enough data to build a **usable and mostly reliable** loot table.

But the first version should be framed as:
- reliable for drop contents and rates
- partially inferred for source/context labels

## Recommended build order

1. Build a raw treasure row explorer
   - show one treasure row at a time with all reward lanes and rates
2. Add grouping by treasure name
   - but keep row-level detail visible
3. Add source/context labeling
   - terrain / rank bonus / battle bonus / survey / treasure box / special chest
4. Add filtering
   - by level
   - by reward type
   - by item/equipment/facility reward
5. Only later collapse rows into “clean” human categories once the remaining group meanings are confirmed
