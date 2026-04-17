# Treasure research

Sources used:
- `data/Sheet csv/KA GameData - Treasure_lookup.csv`
- `data/sheet-research/raw-copies/KA GameData - Treasure_lookup.csv`
- `data/sheet-research/raw-copies/KA GameData - Treasure.csv`

## What the two treasure files appear to be

### `Treasure_lookup.csv`
- This looks like the raw gameplay table.
- It stores IDs, rates, level ranges, HP, rank/week flags, and reward slot IDs.
- This is the file to trust first when rebuilding treasure logic.

### `Treasure.csv`
- This appears to be an enriched/research copy of the same data.
- It includes resolved reward names like:
  - `equip1`
  - `item1`
  - `valuable`
  - `job`
- It also includes a `summary` string for human reading.

## Confirmed structure

Rows are not uniquely identified by `name`.

The same visible treasure name appears many times with different:
- `group`
- `minLevel`
- `maxLevel`
- `hp`
- reward contents
- special selectors like `rank` / `week` / `flag`

So the effective identity is closer to:

`name + group + level band + special selectors`

## Column observations

### `res`
- All checked rows currently use `27`.
- This does not look useful for distinguishing treasure families.

### `group`
- This is one of the most important columns.
- It clearly separates major treasure families / contexts.

Observed examples:
- `0`
  - special/system treasure rows
  - includes:
    - `Treasure Chest`
    - weekday rank bonus rows
    - battle bonus rows
    - terrain treasure names like `Plains_Treasure`
- `100` to `107`
  - normal treasure-family groups
  - these look like different loot ecosystems / map contexts
- `999`
  - `Treasure Box`
- `2000`
  - `Survey Backpack`

### `minLevel` / `maxLevel`
- Clearly level-gating fields.
- A treasure family often has multiple rows for different level bands.

### `hp`
- Very likely treasure durability / break HP.
- Repeats in stepped bands such as:
  - `18`
  - `45`
  - `75`
  - `90`
  - `105`
  - `135`
  - `150`
  - `165`
  - `240`
  - `315`
  - `375`
  - `465`
  - `615`

## Reward slot structure

The treasure rows appear to support several reward categories:
- equipment
- items
- furniture
- valuables
- skills
- jobs

The most common normal treasure rows use item slots with this pattern:
- `itemId1/itemRate1/minItemNum1/maxItemNum1`
- `itemId2/itemRate2/minItemNum2/maxItemNum2`
- `itemId3/itemRate3/minItemNum3/maxItemNum3`

Observed common rates:
- first item: `100%`
- second item: `70%`
- third item: `15%`

Observed common quantity range:
- `1` to `3`

## Treasure reward categories: current mapping

Treasure rewards can be mapped into these website-facing buckets:

### 1. Equipment
- source columns:
  - `equipId1/equipRate1/equipNum1`
  - `equipId2/equipRate2/equipNum2`
  - `equipId3/equipRate3/equipNum3`
- meaning:
  - gear rewards
  - weapons / armor / accessories / tools

### 2. Items
- source columns:
  - `itemId1/itemRate1/minItemNum1/maxItemNum1`
  - `itemId2/itemRate2/minItemNum2/maxItemNum2`
  - `itemId3/itemRate3/minItemNum3/maxItemNum3`
- meaning:
  - consumables
  - crafting materials
  - harvest goods
  - utility items

### 3. Furniture / facilities / blueprints-like placeables
- source columns:
  - `furnitureId/furnitureRate/furnitureNum`
- meaning:
  - town placeables / facility-style rewards / decorative objects
- examples seen in treasure summaries:
  - `Torch`
  - `Mine: Energy`
  - `Low Watchtower`
  - `Turret`
  - `Expedition Hut`
  - `Land (S)`
  - `Land (M)`
  - `Land (L)`
  - `Land (XL)`

### 4. Valuables
- source columns:
  - `valuableId/valuableRate/valuableNum`
- meaning:
  - special collectible / stat-boost / trophy-like rewards

### 5. Skills
- source columns:
  - `skillId/skillRate/skillNum`
- meaning:
  - skill rewards from the skill database

### 6. Jobs
- source columns:
  - `jobId/jobRate/jobNum`
- meaning:
  - job unlock / job-related rewards
- current observation:
  - this lane seems rare in treasure data

## Important distinction: base materials vs item-based building materials

There are at least two different "material" systems in the data.

### A. Base town/world materials (`Material.csv`)
- examples:
  - `Grass`
  - `Wood`
  - `Food`
  - `Ore`
  - `Mystic Ore`
  - `Energy`
  - `Items`
- these are the broad resource buckets used by town systems and storage
- these are **not** the same thing as the many named item materials in treasure rewards

### B. Item-based building / upgrade materials (`Item.csv`)
- examples found in treasure rewards:
  - `Sturdy Board`
  - `Large Nail`
  - `Strong Rope`
  - `High Grade Brick`
- these come from `Item.csv`, not `Material.csv`
- they behave like item-shop / tool / upgrade materials
- these appear to be the "building materials" the user means:
  - used in construction/upgrading-related systems
  - sold/handled as items
  - not simple base resources like wood/ore

## Important distinction: harvest materials vs building materials

Treasure item rewards also include harvest/gathered goods such as:
- `Medicinal Herb`
- `Leaf of Life`
- `Sweet Mushroom`
- `Potato`
- `Apple`
- `Sea Snail`
- `Cut of Meat`

These are also `Item.csv` entries, but they are a different subfamily from item-based building materials.

So for treasure classification, a useful split is:

- base materials
  - from `Material.csv`
  - grass / wood / food / ore / mystic ore / energy / item storage buckets
- building materials
  - from `Item.csv`
  - boards / nails / rope / bricks / similar construction materials
- gathered ingredients
  - from `Item.csv`
  - herbs / vegetables / fruit / seafood / meat
- consumables / utilities
  - from `Item.csv`
  - potions / flutes / elixirs / pouches

## Current best answer to the user's question

Yes:
- some treasure rewards are true item-based building materials
- they are **not** the same as the base stored resources like wood, ore, mystic ore
- they live in `Item.csv`
- they can be sold in the item shop / rewarded from treasure
- and they are used in upgrade/build systems even though they do not have their own production facilities

## Special selectors

### `rank`
- Usually `-1` for normal treasure rows.
- Special rows use `0..6`.
- This strongly suggests rank-tier selection.

### `week`
- Usually `-1` for normal treasure rows.
- Special rows use `0..6`.
- This strongly suggests weekday indexing.

### `flag`
- `0`
  - normal treasure rows
- `1`
  - special `Treasure Chest` rows
- `2`
  - weekday/rank bonus rows
- `8`
  - battle bonus rows

These flags look like behavior or source categories.

## Strong confirmed pattern: weekday rank bonus

Rows named:
- `Sunday Rank Bonus`
- `Monday Rank Bonus`
- `Tuesday Rank Bonus`
- `Wednesday Rank Bonus`
- `Thursday Rank Bonus`
- `Friday Rank Bonus`
- `Saturday Rank Bonus`

all use:
- `group = 0`
- `minLevel = maxLevel = 999`
- `hp = 500`
- `flag = 2`
- `week = 0..6`
- `rank = 0..6`

This is strong evidence that:
- `week` is weekday index
- `rank` is rank tier
- those rows define weekday rank-bonus treasure tables

## Strong confirmed pattern: battle bonus

Rows named `Battle Bonus` use:
- `group = 0`
- `flag = 8`
- `week = -1`
- varying `rank`

This strongly suggests battle-bonus reward tables keyed by rank but not weekday.

## First-pass reading of groups `100..107`

These groups look like normal treasure families, not one-off special reward systems.

Patterns seen:
- they reuse chest/container names such as:
  - `Tool Box`
  - `Wooden Box`
  - `Golden Barrel`
  - `Sack of Grass`
  - `Vegetable Pouch`
  - `Fruit Pouch`
  - `Meat Pouch`
  - `Seafood Pouch`
  - `Seed Pouch`
- each family has multiple level bands with increasing HP
- each row still uses the same 3-slot item reward shape

### Likely interpretation
- `group 100..107` probably correspond to different treasure ecosystems / terrain pools / source pools.
- They are not just one treasure type with one fixed loot table.

This still needs deeper confirmation.

## Important rebuild guidance

If a treasure page/tool is built later:
- do **not** treat `name` as unique
- do **not** flatten all treasure rows into one table by chest name only
- preserve:
  - `group`
  - level band
  - HP
  - `rank`
  - `week`
  - `flag`

That context appears necessary to reconstruct the actual treasure logic.

## Next questions to answer

- What exactly do groups `100..107` map to?
- Do terrain treasure names in `group 0` connect to world-map biomes directly?
- How should `flag = 1` `Treasure Chest` rows be interpreted?
- Are `rank 0..6` literal player rank buckets or some other tier system?
