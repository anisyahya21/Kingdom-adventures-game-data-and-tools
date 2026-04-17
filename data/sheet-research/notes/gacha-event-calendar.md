# Gacha Event Calendar

## Scope

This note narrows the gacha research to the part we actually care about for the website:

- event date
- event duration
- event pool / featured result
- especially:
  - `S` rank job events
  - notable facility/chip events
  - optionally later: notable `S` weapon events

Primary raw sources:

- `data/sheet-research/raw-copies/KA GameData - GachaJob.csv`
- `data/sheet-research/raw-copies/KA GameData - GachaChip.csv`
- `data/sheet-research/raw-copies/KA GameData - GachaEquip.csv`
- `data/sheet-research/raw-copies/KA GameData - JobGroup.csv`
- `data/sheet-research/raw-copies/KA GameData - Equip.csv`

Status terms:

- `confirmed`: directly visible from the CSV rows
- `inference`: derived from repeated row patterns or linked lookup files

---

## What Is Reliable Right Now

We can already build a reliable event calendar for:

- `GachaJob` featured `S` rank job windows
- `GachaChip` featured high-tier facility windows
- `GachaEquip` recurring Kairo windows and daily `S` weapon bonus days

We are **not** yet fully ready to claim exact final-member odds for every member inside each pool.

So the safe version-1 website output is:

- start date
- finish date
- duration
- event type
- featured pool text
- featured `S` target when present

Website implementation note:

- treat these rows as recurring yearly windows, not one-off dates tied forever to the current calendar year
- when rendering countdowns, resolve each event to the nearest live/upcoming occurrence so late-December visitors still see January events correctly
- the page should stay modular because it is a likely future home for other schedule systems:
  - weekly conquest
  - Job Center
  - more Wairo Dungeon tracking
  - Kairo Room

---

## Confirmed Event Types

### 1. S-rank job events

Source:
- `GachaJob.csv`

Reliable fields:
- `startMonth`
- `startDate`
- `finishMonth`
- `finishDate`
- featured `S` job name in `explainArg`
- featured `S` job id in the `Available S JobGroup` section
- featured `S` rate value: usually `25`

Working website label:
- `S Rank Job Event`

Pool meaning:
- the banner is still a broader job gacha pool
- but one specific `S` rank job is explicitly featured for that event window

### 2. High-tier facility events

Source:
- `GachaChip.csv`

Reliable fields:
- date window
- `explainText`
- `explainArg`
- `groupSRankExtraRate`

Confirmed current repeating monthly facility event:
- the current CSV repeats the same featured facility pool text each month
- for the website, this should be presented as one repeating `S Facility Event` schedule unless later data proves the monthly pool actually changes
- when describing the pool in UI copy, compact the High Grade Storehouse variants into one grouped label such as `High Grade Storage`

Working website label:
- `Facility Event`

Important warning:
- `Dragon Stables` exists in facility-related data, but there is currently **no confirmed GachaChip row** tying it to the current chip event calendar.
- Because the current chip rows appear to repeat the same featured facility pool every month, the website should avoid over-labeling each monthly row as a different facility feature.

### 3. S-weapon bonus days

Source:
- `GachaEquip.csv`

Reliable fields:
- one-day date windows
- explanation text such as:
  - `Daily Bonus: A Chance to Get S-Grade Staves!`
  - `Daily Bonus: A Chance to Get S-Grade Clubs!`
  - `Daily Bonus: A Chance to Get S-Grade Spears!`
- `groupSRankExtraRate`

This is probably lower priority than jobs/facilities, but the event pattern is clear.

Confirmed subgroup-to-exact-S-weapon mapping from `GachaEquip.csv` + `Equip.csv`:

- subgroup `1` = `S/ Mystic Staff`
- subgroup `2` = `S/ Golden Club`, `S/ Divine Club`
- subgroup `3` = `S/ Fire Spear`
- subgroup `4` = `S/ Black Spear`
- subgroup `5` = `S/ Fire Hammer`, `S/ Golden Hammer`
- subgroup `6` = `S/ Fire Sword`, `S/ Blizzard Sword`, `S/ Legendary Sword`, `S/ Conqueror's Sword`, `S/ Yggdrasil Sword`
- subgroup `8` = `S/ Golden Gun`
- subgroup `9` = `S/ Champion's Bow`
- subgroup `10` = `S/ Legendary Axe`

Important interpretation:

- the daily `S` weapon rows are not one exact guaranteed weapon
- they point to a boosted subgroup / pool
- some subgroups resolve to one exact `S` weapon
- some resolve to multiple exact `S` weapons
- spear rows use `3,6<br>4,6`, which means the event is boosting both spear subgroups together, not just one exact spear

---

## Confirmed Facility Events

### Facility event pattern

Source:
- `GachaChip.csv`

Base/default row:
- `1/1 - 12/31`
- `Get A-D Rank facilities!`
- no featured `S` pool

Featured event rows:

| Start | Finish | Duration | Featured Pool | Notes |
| --- | --- | --- | --- | --- |
| 1/28 | 1/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 2/26 | 2/28 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 3/28 | 3/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 4/28 | 4/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 5/28 | 5/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 6/28 | 6/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 7/28 | 7/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 8/28 | 8/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 9/28 | 9/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 10/28 | 10/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 11/28 | 11/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |
| 12/28 | 12/30 | 3 days | Same monthly facility pool | `groupSRankExtraRate = 1,15` |

Confirmed supporting pattern:
- all featured rows keep `groupRateTable = 1,100<br>2,0`
- only the featured text and `groupSRankExtraRate` distinguish the event from the default facility banner

Inference:
- the event likely boosts a subgroup tied to the same repeating facility pool
- the row does not prove the exact final-member split inside that subgroup

---

## Confirmed S-Rank Job Events

Source:
- `GachaJob.csv`
- names cross-checked against `JobGroup.csv`

Interpretation rule:
- `startMonth/startDate` to `finishMonth/finishDate` is the event window
- the featured `S` job name is in `explainArg`
- the featured `S` job id is in the `Available S JobGroup` block
- the repeating featured rate value is usually `25`

### Calendar

| Start | Finish | Duration | Featured S Job | JobGroup id | Notes |
| --- | --- | --- | --- | --- | --- |
| 1/2 | 1/5 | 4 days | Samurai | 20 | confirmed |
| 1/8 | 1/10 | 3 days | Viking | 21 | confirmed |
| 1/15 | 1/17 | 3 days | Pirate | 22 | confirmed |
| 1/22 | 1/24 | 3 days | Champion | 23 | confirmed |
| 1/28 | 1/30 | 3 days | Wizard | 24 | confirmed |
| 2/5 | 2/8 | 4 days | Paladin | 16 | confirmed |
| 2/9 | 2/12 | 4 days | Gunner | 17 | confirmed |
| 2/15 | 2/18 | 4 days | Archer | 18 | confirmed |
| 3/1 | 3/3 | 3 days | Ninja | 19 | confirmed |
| 3/8 | 3/10 | 3 days | Samurai | 20 | confirmed |
| 3/15 | 3/17 | 3 days | Viking | 21 | confirmed |
| 3/22 | 3/24 | 3 days | Pirate | 22 | confirmed |
| 3/28 | 3/30 | 3 days | Champion | 23 | confirmed |
| 4/1 | 4/3 | 3 days | Wizard | 24 | confirmed |
| 4/8 | 4/10 | 3 days | Monk | 11 | confirmed |
| 4/15 | 4/17 | 3 days | Samurai | 20 | confirmed |
| 4/22 | 4/24 | 3 days | Guard | 13 | confirmed |
| 5/1 | 5/3 | 3 days | Knight | 14 | confirmed |
| 5/8 | 5/10 | 3 days | Mage | 15 | confirmed |
| 5/15 | 5/17 | 3 days | Paladin | 16 | confirmed |
| 5/22 | 5/24 | 3 days | Gunner | 17 | confirmed |
| 5/28 | 5/30 | 3 days | Archer | 18 | confirmed |
| 6/1 | 6/3 | 3 days | Ninja | 19 | confirmed |
| 6/8 | 6/10 | 3 days | Samurai | 20 | confirmed |
| 6/15 | 6/17 | 3 days | Viking | 21 | confirmed |
| 6/22 | 6/24 | 3 days | Pirate | 22 | confirmed |
| 7/1 | 7/3 | 3 days | Champion | 23 | confirmed |
| 7/8 | 7/10 | 3 days | Wizard | 24 | confirmed |
| 7/15 | 7/17 | 3 days | Guard | 13 | confirmed |
| 7/22 | 7/24 | 3 days | Knight | 14 | confirmed |
| 7/28 | 7/30 | 3 days | Mage | 15 | confirmed |
| 8/1 | 8/3 | 3 days | Paladin | 16 | confirmed |
| 8/8 | 8/10 | 3 days | Gunner | 17 | confirmed |
| 8/15 | 8/17 | 3 days | Archer | 18 | confirmed |
| 8/22 | 8/24 | 3 days | Ninja | 19 | confirmed |
| 8/28 | 8/30 | 3 days | Samurai | 20 | confirmed |
| 9/1 | 9/3 | 3 days | Viking | 21 | confirmed |
| 9/8 | 9/10 | 3 days | Pirate | 22 | confirmed |
| 9/15 | 9/17 | 3 days | Champion | 23 | confirmed |
| 9/22 | 9/24 | 3 days | Wizard | 24 | confirmed |
| 10/1 | 10/3 | 3 days | Guard | 13 | confirmed |
| 10/8 | 10/10 | 3 days | Knight | 14 | confirmed |
| 10/13 | 10/16 | 4 days | Mage | 15 | confirmed |
| 10/20 | 10/23 | 4 days | Paladin | 16 | confirmed |
| 10/26 | 10/30 | 5 days | Gunner | 17 | confirmed |
| 11/1 | 11/4 | 4 days | Archer | 18 | confirmed |
| 11/8 | 11/11 | 4 days | Ninja | 19 | confirmed |
| 11/16 | 11/18 | 3 days | Samurai | 20 | confirmed |
| 11/23 | 11/25 | 3 days | Viking | 21 | confirmed |
| 12/2 | 12/4 | 3 days | Pirate | 22 | confirmed |
| 12/7 | 12/9 | 3 days | Champion | 23 | confirmed |
| 12/14 | 12/16 | 3 days | Wizard | 24 | confirmed |
| 12/21 | 12/24 | 4 days | Guard | 13 | confirmed |
| 12/25 | 12/25 | 1 day | Santa Claus | 26 | featured `S` rate value is `30` instead of `25` |
| 12/28 | 12/31 | 4 days | Knight | 14 | confirmed |

### Pattern notes

Confirmed:
- most featured `S` job windows use featured value `25`
- `Santa Claus` is a one-day special row with featured value `30`
- the event rotation is calendar-based, not random

Inference:
- these are likely intended as the website-friendly "important job gacha events" even before we fully decode every lower-rank pool member

---

## Confirmed Weapon Event Patterns

### Kairo windows

Source:
- `GachaEquip.csv`
- supported by `Equip.csv`

Recurring windows:
- `month/5 - month/10`
- `month/20 - month/25`

Featured pool:
- `The Kairo Series`

Confirmed support:
- event rows add subgroup `11,200` to `groupRateTable`
- `Equip.csv` shows Kairo-series equipment using `group = 11`

Working website label:
- `Kairo Weapon Event`

### One-day S-weapon bonus rows

The full yearly pattern is now confirmed from `GachaEquip.csv`.

Rotation discovered:
- `Staves`
- `Clubs`
- `Spears`
- `Hammers`
- `Swords`
- `Guns`
- `Bows`
- `Axes`

Pattern notes:
- these are one-day rows
- the sequence rotates through the year rather than appearing random
- some weapon rows use a single boosted subgroup rate like `1,15`
- spear rows use a split extra rate like `3,6<br>4,6`

Website note:
- this is now reliable enough to show as a real `S Weapon Events` section, not just a future idea

---

## Rebuild Rules For The Website

If we later build a gacha event page/tool, the safest version-1 rules are:

1. Treat each row in the gacha file as a calendar event window.
2. Calculate duration as inclusive day count:
   - same-month example: `finishDate - startDate + 1`
3. For `GachaJob`, show:
   - start
   - finish
   - duration
   - featured `S` job
   - job group id
4. For `GachaChip`, show:
   - start
   - finish
   - duration
   - featured pool text
   - note that current confirmed recurring facility event is `High Grade Storehouse`
5. Do not claim exact final member odds for the whole pool unless subgroup/member mapping is fully decoded.

---

## Open Questions

- What exactly is the full subgroup-to-member mapping for `GachaChip`, `GachaItem`, and `GachaFriend`?
- Are there additional high-tier facility events in other years/versions that are not present in the current `GachaChip.csv`?
- Are there hidden `S Rank jobs appear today!` rows deeper in the file variant history, or is the current export mainly using explicit featured job names?
- What is the exact meaning of the repeated value `25` in the featured `S` job block:
  - direct subgroup rate
  - direct featured odds
  - bonus weight inside the `S` rank pool
