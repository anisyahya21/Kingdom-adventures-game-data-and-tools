# Job.csv Research Notes

This note records how job generation and job type are currently being read from the raw sheets.

The goal is to leave a rebuild trail:
- what came directly from raw CSV
- what is currently stored in the website/app data
- where those two currently disagree

---

## Raw files used

- `data/Sheet csv/KA GameData - Job.csv`
- `data/Sheet csv/KA GameData - JobPair_lookup.csv`

Reference copies also exist in:
- `data/sheet-research/raw-copies/KA GameData - Job.csv`
- `data/sheet-research/raw-copies/KA GameData - JobPair_lookup.csv`

---

## Confirmed discovery: `name` pattern splits combat vs non-combat

In `Job.csv`, the `name` column uses two distinct patterns:

- `D Grade Merchant`
- `D Grade Monarch`
- `D Grade Artisan`

versus:

- `D Rank Guard`
- `D Rank Mage`
- `D Rank Knight`

Current working interpretation:

- `Grade` rows correspond to `non-combat`
- `Rank` rows correspond to `combat`

This is not just a Monarch-only quirk. It is consistent across the full main job set currently exported in the CSV.

### Current raw grouping from `Job.csv`

`Grade` jobs:
- Artisan
- Blacksmith
- Carpenter
- Cook
- Doctor
- Farmer
- Merchant
- Monarch
- Mover
- Researcher
- Trader

`Rank` jobs:
- Archer
- Artist
- Beast Tamer
- Berserker
- Champion
- Entertainer
- Guard
- Guerilla
- Gunner
- Knight
- Mage
- Magic Knight
- Monk
- Ninja
- Paladin
- Pirate
- Rancher
- Royal
- Samurai
- Santa Claus
- Scholar
- Viking
- Wizard

Other names seen in the CSV that do not fit the normal player-job pattern:
- Tourist
- Enemy 2
- Enemy 3
- Enemy 4

Status:
- `Grade -> non-combat`: confirmed from raw name pattern
- `Rank -> combat`: confirmed from raw name pattern
- exact dedicated raw `type` column decode: still unknown

Important:
- the CSV header includes a column named `type` at column index `2`
- in the sampled player-job rows checked so far, that column was `0` for both combat and non-combat jobs
- so we should **not** currently use column `2` as the decoded combat/non-combat source

---

## Monarch

### What the raw CSV supports

`Monarch` appears in `Job.csv` as:
- `D Grade Monarch`
- `C Grade Monarch`
- `B Grade Monarch`
- `A Grade Monarch`
- `S Grade Monarch`

Because Monarch uses the `Grade` naming pattern, the current raw-sheet interpretation is:

- `Monarch = non-combat`

### What the marriage sheet supports

`JobPair_lookup.csv` also clearly treats `Monarch` as a valid parent job:
- `Monarch + Merchant -> Royal`
- `Monarch + Guard -> Royal`
- `Monarch + Champion -> Royal`
- etc.

So the current sheet-backed reading is:

- `Monarch` is a parent-capable job in pair data
- `Monarch` uses the `Grade` naming class in `Job.csv`
- therefore our current CSV-backed interpretation is `Monarch = non-combat`

---

## Current website/app data mismatch

The currently loaded job data in `artifacts/api-server/data/ka_shared.json` does **not** fully match the raw `Grade/Rank` split.

Jobs currently marked `non-combat` in app data, but `Rank` in raw CSV:
- Artist
- Beast Tamer
- Entertainer
- Monk
- Rancher

This means:
- `Monarch` being non-combat is consistent between sheet interpretation and app data
- some other job types in app data are likely based on older/manual classification and should not automatically be treated as sheet-confirmed

Status:
- mismatch list: confirmed
- cause of mismatch: unknown

---

## Safe rebuild rule for now

If the job database has to be rebuilt from the CSV before the true type column is decoded:

1. read the short job name from `name`
2. inspect whether the CSV row uses `Grade` or `Rank`
3. map:
   - `Grade` -> `non-combat`
   - `Rank` -> `combat`
4. keep a warning note for the current mismatch cases until checked in-game

This is safer than trusting the currently stored site data blindly.

---

## Open questions

- Is there a deeper raw column that encodes the same distinction more directly than the `name` token?
- Are the app-data mismatch jobs actually intended to be non-combat by gameplay, meaning the raw `Grade/Rank` split is not the whole story?
- Do `Tourist` and the `Enemy` rows belong in the same classification system at all?

Until those are answered, the `Grade/Rank` rule is the strongest raw-sheet signal we have.
