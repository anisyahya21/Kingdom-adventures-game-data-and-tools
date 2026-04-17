# Gacha Notes

## Scope

This note is the starting manual for the `Gacha*` CSV files:

- `KA GameData - GachaChip.csv`
- `KA GameData - GachaEquip.csv`
- `KA GameData - GachaFriend.csv`
- `KA GameData - GachaItem.csv`
- `KA GameData - GachaJob.csv`

Goal:
- understand what each gacha sheet controls
- separate banner schedule data from actual pool-member data
- preserve a rebuild trail before any website work starts
- keep an event-focused path for the website:
  - dates
  - durations
  - featured pools
  - featured `S` outcomes

Status:
- `confirmed` = directly visible from the CSV structure
- `hypothesis` = likely interpretation, not fully traced to downstream tables yet

---

## High-level structure

For the event-calendar output we care about most, see:

- `data/sheet-research/notes/gacha-event-calendar.md`

### Shared pattern across most gacha files

The following files share a similar compact format:

- `GachaChip`
- `GachaEquip`
- `GachaItem`
- `GachaFriend`

Confirmed common row fields:
- `id`
- `startMonth`
- `startDate`
- `finishMonth`
- `finishDate`
- explanation text
- `groupRateTable`
- rank-rate values
- occurrence-count values

Confirmed interpretation:
- each row describes a **banner window** or **gacha schedule entry**
- date fields define when that banner is active
- text fields describe the banner
- rank columns define the overall rarity split for the banner window
- occurrence columns look like the internal count/weight tables behind the rarity roll

### `GachaJob` is structurally different

`GachaJob.csv` is much wider and appears to inline pool composition directly.

Confirmed differences:
- it contains large repeated sections labeled like:
  - `Available JobGroup (Rate?)`
  - `Available S JobGroup (Rate?)`
- rows contain many repeated triples that look like:
  - pool selector / type
  - job group id
  - rate or weight
- the row ends with rank-rate values for:
  - `D`
  - `C`
  - `B`
  - `A`
  - `S`

Working interpretation:
- `GachaJob` may be much closer to a self-contained pool definition than the other gacha files
- the other gacha files likely reference additional downstream tables for actual contents

Status: `hypothesis`

---

## Per-file first readings

### GachaChip

Confirmed:
- default row covers `1/1` to `12/31`
- text like `Get A-D Rank facilities!`
- recurring monthly event rows near the end of each month
- those event rows mention `High Grade Storehouse`
- `groupRateTable` is usually `1,100<br>2,0`
- `groupSRankExtraRate` becomes `1,15` during featured periods

Working interpretation:
- this sheet controls facility/chip banners
- monthly end-of-month banners add an S-rank bonus for a featured subgroup
- the featured subgroup is likely group `1`

Status:
- banner timing: `confirmed`
- exact subgroup member mapping: `unknown`

### GachaEquip

Confirmed:
- default row text: `Get D-A Grade weapons!`
- recurring event rows mention `The Kairo Series will appear until the 10th/25th!`
- daily one-day bonus rows exist, such as:
  - `A Chance to Get S-Grade Staves`
  - `S-Grade Clubs`
  - `S-Grade Spears`
  - etc.
- `groupRateTable` can include many groups, for example:
  - `1,34`
  - `2,51`
  - `3,17`
  - ...
  - `11,200` during Kairo periods
- `groupSRankExtraRate` is `n/a` for many rows, but daily bonus rows use values like:
  - `1,15`
  - `2,15`
  - `3,6<br>4,6`
- `Equip.csv` contains visible Kairo-series equipment with `group = 11`, for example:
  - `A/ Kairo Sword`
  - `A/ Kairo Hammer`
  - `A/ Kairo Lance`
  - `A/ Kairo Bow`
  - `A/ Kairo Gun`

Working interpretation:
- `groupRateTable` defines the equip pool subgroup weights
- Kairo banners add extra subgroup `11`
- `groupSRankExtraRate` likely boosts specific S-rank weapon families

Status:
- banner timing and featured text: `confirmed`
- subgroup `11 = Kairo series`: `confirmed`
- subgroup-to-weapon-family mapping for the daily S-rank boosts: `hypothesis`

### GachaItem

Confirmed:
- current visible default row:
  - `Get some great items!`
- `groupRateTable` is `1,100`
- row shape matches compact gacha sheets

Working interpretation:
- item banners may be simpler and/or less event-heavy than equipment

Status:
- base structure: `confirmed`
- subgroup/pool interpretation: `unknown`

### GachaFriend

Confirmed:
- current visible default row:
  - `Get bonuses for helping friends!`
- `groupRateTable` is `0,20`
- rank rates shown in the row:
  - `4,500`
  - `350`
  - `0`
  - `0`

Working interpretation:
- friend gacha may be a much narrower banner type
- it may not use the same rarity spread as equip/chip/item

Status:
- base structure: `confirmed`
- rarity/pool interpretation: `unknown`

### GachaJob

Confirmed:
- default row text:
  - `Get A-C Rank jobs!`
- many event rows feature a specific S-rank job by name:
  - Samurai
  - Viking
  - Pirate
  - Champion
  - Wizard
  - Merchant
  - Paladin
  - Gunner
  - Archer
  - Ninja
  - Monk
  - Guard
  - Knight
  - Mage
  - Santa Claus
- one-day bonus rows exist:
  - `S Rank jobs appear today!`
- the file explicitly exposes many job-group ids and weights in-row
- `JobGroup.csv` confirms the featured S-rank ids used in the event rows:
  - `20 = Samurai`
  - `21 = Viking`
  - `22 = Pirate`
  - `23 = Champion`
  - `24 = Wizard`
  - `1 = Merchant`
  - `16 = Paladin`
  - `17 = Gunner`
  - `18 = Archer`
  - `19 = Ninja`
  - `11 = Monk`
  - `13 = Guard`
  - `14 = Knight`
  - `15 = Mage`
  - `26 = Santa Claus`

Working interpretation:
- `GachaJob` may be sufficient on its own to reconstruct most of the job banner pool
- specific S-rank featured jobs are represented directly in the row data

Status:
- banner schedule: `confirmed`
- featured S-rank job ids: `confirmed`
- exact decoding of the repeated job-group triples: `hypothesis`

---

## Field interpretations

### `groupRateTable`

Observed examples:
- Chip: `1,100<br>2,0`
- Equip: `1,34<br>2,51<br>...`
- Friend: `0,20`

Working interpretation:
- this is a list of `groupId,weight` pairs
- it likely determines which subgroup/pool is selected before the final reward roll

Status: `hypothesis`

### Rank-rate columns

Observed patterns:
- compact gacha files consistently end with a rank split shaped like:
  - rank label column
  - values such as `500,300,150,0`
- `GachaJob` explicitly labels the ending rank columns as:
  - `D,C,B,A,S`

Working interpretation:
- compact files probably also represent rarity rates in a fixed order
- likely descending/common-to-rare order, but the exact column-to-rank mapping still needs confirmation

Status: `hypothesis`

### `numOfOccurrence`

Observed:
- compact files have another block of counts after the rank rates
- examples look like:
  - `29310,50539,15092,5059,0`
  - `27947,49871,15301,6881,0`

Working interpretation:
- these may be occurrence counts, pool sizes, or internal roll-table weights for each rarity bucket
- likely used after the rarity roll but before the final item/member selection

Status: `unknown`

### `groupSRankExtraRate`

Observed:
- Chip featured rows use:
  - `1,15`
- Equip daily bonus rows use:
  - `1,15`
  - `2,15`
  - `3,6<br>4,6`
- many baseline rows use:
  - `n/a`
  - `0,0`

Working interpretation:
- extra weighting applied only within S-rank results
- targets one or more subgroup ids during the event window

Status: `hypothesis`

---

## What we can already build reliably

With the current understanding, we can already build a reliable **banner calendar/schedule** for:
- active dates
- banner text
- featured event windows
- daily bonus windows
- visible subgroup boost strings

We are **not yet ready** to claim reliable final pull odds for exact members because we still need:
- subgroup-to-member mapping for chip/equip/item/friend
- confirmed rank-column ordering for compact gacha files
- confirmed meaning of `numOfOccurrence`

---

## Next steps

1. Find downstream tables that define the actual members of each gacha subgroup.
2. Confirm the rarity-column ordering for `Chip`, `Equip`, `Item`, and `Friend`.
3. Decode `GachaJob` repeated triples into a clean structure:
   - pool type
   - job group id
   - weight
4. Create a separate `gacha-pool-mapping.md` once subgroup membership is understood.

---

## New confirmed links

### `GachaJob` -> `JobGroup.csv`

Confirmed:
- the S-rank featured ids in `GachaJob.csv` match the `JobGroup.csv` ids directly
- this means the job gacha file is not using a hidden lookup for those featured job names

Rebuild rule:
- when reading an event row like `...,1,1,2,20,25,...`
  - the `20` can be interpreted through `JobGroup.csv` as `Samurai`

### `GachaEquip` -> `Equip.csv`

Confirmed:
- `Equip.csv` has Kairo gear entries with `group = 11`
- `GachaEquip` Kairo event windows add `11,200` into `groupRateTable`

Working rebuild rule:
- `group 11` in equipment gacha is the Kairo-series subgroup

Status:
- `confirmed`
