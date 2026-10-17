# Current Combat Hub research catalog

Updated 2026-10-17. Replaces the older MP-limited catalog; it does not change the Combat Hub design or saved favorites.

73 exact ATT/Speed/Luck/DEX configurations cover all 20 encounters. Each uses a separate audited 200-seed cohort with saved sufficient-MP evidence for both roles (fixed research capacity: 10,000,000 MP each). The export recomputed 18,000 trial rows across 90 source point groups. Seventeen repeated-tuple cohorts were not pooled; selection uses largest sample then latest cohort, never highest mean. Rankings are descriptive, not a demonstrated selection advantage.

The source is the Update 10 workbook's underlying audited records plus a labeled newer E15 Luck cohort. The workbook SHA and source analysis/audit hashes are retained in the catalog. Failed outcomes remain included. Mean role MP is consumption, not a capacity requirement. Highest is observed, not a ceiling. A different formation, skills, support or exact stat tuple may perform differently.

The old catalog's deviation panels are retired from current recommendations. New panels carry only exact measurements; no old tolerance or reward-drop claims are transferred. Nearby achievable builds have unmeasured rewards unless their exact four-stat tuple exists in the current catalog.

`scripts/import-research-catalog.mjs` deterministically maps the independently audited local proposal into the two compact hosted JSON files. It needs the proposal path as its only argument; no local database is required by the deployed site. Detailed trials remain local.

Validation: portable catalog checks cover all encounters, exact tuple identity, cohort counts, MP fields, no inherited deviation panels, exact DEX goals, and clearing rewards/MP for unmeasured profile builds. Vite production build passes. Typechecking has the same 48 existing errors as the starting commit, in equipment, world-render-lab and timed-events pages; no added diagnostics. Browser check confirms Find DPS displays current measured results and Match Stats selects the encounter and exact targets without starting a search.
