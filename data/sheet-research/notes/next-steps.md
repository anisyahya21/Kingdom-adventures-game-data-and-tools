# Sheet Research Next Steps

This file is our reminder list for things we intentionally paused and want to revisit later.

## Skills

- Confirm the detailed per-skill classification layer, especially for combat skills.
- Split combat skills into:
  - Attack skill
  - Attack magic skill
  - Recovery magic skill
- Verify edge-case skills that may not fit cleanly:
  - Reflect skills
  - Dodge / counter / parry style skills
  - Any unusual combat passives
- Confirm whether category `2` skills are effectively universal/passive for all jobs, or if there are hidden exceptions.
- Build a final translation table from raw skill sheet values to player-facing categories.

## Equipment

- Revisit the two unresolved raw equip-affinity columns from `gid=52017777`:
  - `col3`
  - `col13`
- Confirm whether those columns are unused, cut content, or non-player-facing/internal equip classes.
- Recheck the earlier Blizzard Sword result if it ever matters, in case there was a hidden modifier or read error.

## Job Groups

- Document the raw skill-permission group ids more cleanly.
- Build a final table:
  - group id
  - jobs in that group
  - allowed skill families
  - special flags like lookout / parent-job restrictions
- Investigate duplicate or alternate job rows, such as `Royal` appearing in more than one group.

## Future Website Work

- Workflow and ownership policy now live in:
  - `docs/website-workflow.md`
  - `data/sheet-research/system-map.json`
  - `src/lib/site-policy.ts`
- Future feature work should update those files when a system changes ownership, public editability, or source-of-truth status.
- Before building the final player-facing skill database, revisit the skill notes above so the website reflects the real game logic instead of a simplified model.
- Consider turning the confirmed research into structured JSON the website can use directly.
- Shop filtering rules discovered from gameplay and sheet reading should be preserved when we build the final shop database.
- Skill Shop filtering rules:
  - if a skill has `craftingStudioLevel = 0`, treat it as not craftable in the shop
  - if the raw skill row is marked `Not used` in column B / the name-text helper field, treat it as not available
  - if the raw skill row has explanatory text in `explainText` (AF), treat it as special/hidden/non-normal content that should not be shown as ordinary craftable shop output by default
  - some skills may technically exist in the data but be unreachable in normal gameplay because of impossible crafting requirements or inaccessible crafting studio levels
- Job detail pages should eventually show the researched rules in player-friendly language.
- Example: if a job is weak with a weapon type, show it as `Weak` and include a short explanation that weak equipment currently appears to apply a 50% stat penalty with round-down behavior.
- The loadout builder should enforce equipment rules more accurately.
- If a user equips something a job cannot equip:
  - show a clear visible warning
  - do not include that item's stats in the final calculation
- If a user equips something a job is weak with:
  - apply the weak penalty to the displayed stat totals
  - unless the matching resistance skill is also equipped
- If the correct resistance skill is equipped:
  - remove the weakness penalty
  - allow the item to contribute full stats

## Eggs And Pets

- Eggs & Pets phase 1 now reads the pets reference sheet directly for:
  - egg color
  - monster outcome thresholds
  - starting skill / 2nd skill item
  - feed item stat values, EXP, copper, and hatch-time notes
- Egg/Pet decoding notes now live in:
  - `data/sheet-research/egg-pet-research.json`
- Still revisit before calling the simulator final:
  - confirmed egg-level feed-cap rule
  - minimum egg level per target monster
  - exact probability meaning of `Low / Medium / High / Over`
