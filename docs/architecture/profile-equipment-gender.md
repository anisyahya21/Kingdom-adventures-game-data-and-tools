# Profile equipment restrictions and strategy matching

Profile characters store optional native `gender` values: 0 male, 1 female. Older saves retain an unspecified value; saving a gender change participates in account-profile equality and synchronization. New characters default to Male and expose the selector alongside Job and Rank.

The recovered `EquipData` declaration in `RE-evidence/G2.1/39257e72291d/dump/dump.cs` defines `FLAG_FOR_WOMEN = 1024`. The original `data/sheet-research/raw-copies/KA GameData - Equip.csv` flags identify IDs 209 (Skirt), 210 (Dress), 232 (Alice Band), and 260 (Tiara). Names alone do not determine restrictions. Flag 512 is projectile equipment, not a male restriction.

`src/game-data/equipment-gender.ts` owns the predicate. The shared picker, loadout conversion and battle setup validation use it. Female-only equipment requires a declared female character; unspecified gender does not admit it. Profile search filters slots before preparing worker contributions, including upgraded equipment. Resistance skills do not bypass this restriction.

Profile strategy comparison reuses the legal owned-equipment planner in a Web Worker. Each measured target is compared against current profile stats and equipment; upgrading is optional. Searches are bounded at one million nodes per target. Found exact ATT/Speed/Luck matches prove existence; incomplete searches do not establish impossibility or globally closest gear. Nearby means within 10% on each of those three stats, a display category rather than a validated reward range. Larger mismatches are hidden by default and may be inspected with their actual stat differences. A different Speed bracket is flagged. No average is predicted for a nearby build, and matching the three target stats does not validate another team's rewards.

Regression commands, run from `artifacts/kingdom-adventures`:

```text
node --experimental-transform-types --import ./tools/battle-setup-check/register.mjs tools/player-profile-check/gender_check.mjs
node --import ./tools/battle-setup-check/register.mjs tools/player-profile-check/strategy_matches_check.mjs
npm run check:player-profile
npm run check:account-player-profile
```

Browser verification exercised the saved gender selector and the profile comparison worker, including default hiding of distant targets, revealing actual stat deltas, and direct one-click comparison after reload. Fixtures and screenshots are local test data, not changes to the user's production profile.
