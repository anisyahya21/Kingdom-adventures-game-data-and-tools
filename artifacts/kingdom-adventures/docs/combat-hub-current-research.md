# Current Combat Hub research catalog

## Broader measured bank — 2026-10-18

The highlighted 73 configurations remain available. The encounter-by-encounter hosted bank now contains 12,461 distinct exact tuples in 13,111 separate cohorts, covering 504,359 existing trials with explicit fair/reward eligibility, resolved outcomes and saved both-role sufficient-MP proof. All 19,023 pinned source files (599,440 attempted rows) were hash-verified; duplicate trial IDs and repeated seed pairs within each setup/cohort were rejected. No battles were rerun. Unknown provenance values are never pooled; all included groups have their setup/formation/kernel/measurement identities resolved.

This is a conservative subset of the workbook's 15,058 tuples. Its legacy fair count is not substituted for missing explicit per-trial eligibility. Excluded legacy rows are not declared bad solely because of missing flags; resolving those records is separate work. Failed battles and low rewards remain in eligible cohorts.

Files load only for the selected encounter. The full hosted JSON bank is 7,278,965 bytes, approximately 604,501 bytes gzip-compressed. It is not bundled into initial JavaScript. Exact reward lookup is indexed on all four stats; it prefers the largest individual cohort, with a stable tie-break independent of reward. Cohorts are never averaged together. Recorded rewards retain queued-at-victory semantics where specified; settled inventory equivalence is unverified.

Find DPS also considers bank tuples with at least 20 trials within broad owned-gear reachability bounds. These independent bounds rule out obvious impossibilities but do not establish that a joint equipment combination exists. Ten percent is a search-nearness bound, not a combat-safety claim. Each target still goes through the legal equipment planner. Approximate eight-million-node total search effort is divided across targets, with bounded individual searches and honest provisional status. Small samples are labeled exploratory; all other measured samples remain browsable. Result tables page 25 targets and preserve selections.

Requested survival objectives now add alternative legal warm starts to escape empty-gear coordinate traps, including compensating gear pairs with neutral net DPS stats. This improves candidate discovery, not proof of optimality. Regression checks cover that case, broad target bounds, exact DEX matching, source hashes, cohort selection, invalid input and clearing unmeasured rewards. Production builds pass; the full typecheck retains its pre-existing 48 errors.

Local evidence: `runtime/full-combat-catalog-20261018/report.json`, `public-export-report.json`, timestamped source journals and source manifest SHA `8b374aaa0f6b809d79d085c47dcc249eff226963d259c16c5c20b09fcaa124ac`. The first pass hit a Windows status-file rename race, fixed with bounded rename-only retries. Another pass exposed the strict/legacy count mismatch; diagnostics are preserved. Completed aggregate reduction now checkpoints before formatting. These were local export attempts, not extra battle trials.

Updated 2026-10-17. Replaces the older MP-limited catalog; it does not change the Combat Hub design or saved favorites.

73 exact ATT/Speed/Luck/DEX configurations cover all 20 encounters. Each uses a separate audited 200-seed cohort with saved sufficient-MP evidence for both roles (fixed research capacity: 10,000,000 MP each). The export recomputed 18,000 trial rows across 90 source point groups. Seventeen repeated-tuple cohorts were not pooled; selection uses largest sample then latest cohort, never highest mean. Rankings are descriptive, not a demonstrated selection advantage.

The source is the Update 10 workbook's underlying audited records plus a labeled newer E15 Luck cohort. The workbook SHA and source analysis/audit hashes are retained in the catalog. Failed outcomes remain included. Mean role MP is consumption, not a capacity requirement. Highest is observed, not a ceiling. A different formation, skills, support or exact stat tuple may perform differently.

The old catalog's deviation panels are retired from current recommendations. New panels carry only exact measurements; no old tolerance or reward-drop claims are transferred. Nearby achievable builds have unmeasured rewards unless their exact four-stat tuple exists in the current catalog.

`scripts/import-research-catalog.mjs` deterministically maps the independently audited local proposal into the two compact hosted JSON files. It needs the proposal path as its only argument; no local database is required by the deployed site. Detailed trials remain local.

Validation: portable catalog checks cover all encounters, exact tuple identity, cohort counts, MP fields, no inherited deviation panels, exact DEX goals, and clearing rewards/MP for unmeasured profile builds. Vite production build passes. Typechecking has the same 48 existing errors as the starting commit, in equipment, world-render-lab and timed-events pages; no added diagnostics. Browser check confirms Find DPS displays current measured results and Match Stats selects the encounter and exact targets without starting a search.
