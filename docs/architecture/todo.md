# Architecture Cleanup Todo

This is the working path for turning the site from page-by-page AI output into a maintainable Kingdom Adventures reference app.

## Phase 0 - Guardrails

- [x] Update root `AGENTS.md` with AI architecture rules.
- [x] Add `docs/architecture/source-of-truth.md`.
- [x] Add `docs/architecture/ui-system.md`.
- [x] Add this persistent todo list.
- [x] Add a short `docs/architecture/ai-task-template.md` for future prompts.

## Phase 1 - Canonical Game Data Layer

- [x] Create shared `src/game-data/job-buildings.ts`.
- [x] Move `KNOWN_JOB_SHOPS` out of page files.
- [x] Make Jobs, Guides, Houses, and Survey consume shared job/building relationship data.
- [x] Make Survey capable jobs derive from Survey Corps HQ job relationship data.
- [x] Create `src/game-data/buildings.ts`.
- [x] Move house/building plot data out of `src/pages/houses.tsx`.
- [x] Make Houses consume `src/game-data/buildings.ts`.
- [x] Make Shops consume building stats from the same building source instead of duplicated shop building data.
- [x] Create `src/game-data/facilities.ts`.
- [x] Move facility data out of `src/pages/houses.tsx`.
- [x] Create `src/game-data/job-profile.ts` or `src/game-data/game-profiles.ts`.
- [x] Add `getJobProfile(jobName)` for stats, ranks, ranges, shops/buildings, equipment access, skill access, survey capability, and marriage hooks.
- [x] Gradually update Jobs, Loadout, Survey, Marriage, Guides, and Search to use shared profile/query helpers.

## Phase 2 - Relationship Modules

- [x] Create `src/game-data/job-equipment.ts` for weapon, shield, armor, and accessory access helpers.
- [x] Create `src/game-data/job-skills.ts` for attack, attack magic, recovery, and casting skill access helpers.
- [x] Create `src/game-data/job-surveys.ts` if survey logic grows beyond `job-buildings.ts`.
- [x] Create `src/game-data/job-marriage.ts` for parent/child relationship helpers currently embedded in marriage pages.
- [x] Create normalization helpers for names/slugs/rank notes so pages stop parsing labels differently.
- [x] Add lightweight relationship checks for high-risk facts, such as Survey Corps HQ owners.

## Phase 3 - Shared UI System

- [x] Create `src/design-system/category-styles.ts`.
- [x] Create `src/components/ka/category-badge.tsx`.
- [x] Create `src/components/ka/page-header.tsx`.
- [x] Create `src/components/ka/data-card.tsx`.
- [x] Create `src/components/ka/filter-bar.tsx`.
- [x] Create `src/components/ka/stat-table.tsx`.
- [x] Create `src/components/ka/cost-pills.tsx`.
- [x] Create `src/components/ka/entity-link.tsx`.
- [x] Replace page-local badge color strings with `CategoryBadge` or shared category styles.
- [x] Standardize page headers across major pages.
- [x] Standardize card padding/radius/table typography across major database pages.
- [x] Standardize entity links for jobs, shops, buildings, equipment, monsters, and guides.

## Phase 4 - App Shell And Navigation

- [x] Extract nav sections from `App.tsx` into `src/app/navigation.ts`.
- [x] Create a shared app shell/header component.
- [x] Standardize mobile menu behavior.
- [x] Standardize global search entity results and route behavior.
- [x] Review all route SEO entries for duplicated or stale wording.

## Phase 5 - Validation And Maintenance

- [x] Add `npm` script for architecture checks if useful.
- [x] Add checks for duplicated relationship constants like `KNOWN_JOB_SHOPS`.
- [x] Add tests or script assertions for canonical relationships.
- [x] Add a checklist for reviewing future AI changes.
- [x] Periodically update `source-of-truth.md` when a domain moves to a shared module.

## Current Next Best Task

Phase 3 is complete for reusable database UI. Remaining local colors are intentional domain states such as map overlays, chart bars, countdown activity states, editor swatches, and warning panels.

## Grouped Execution Plan

### Group A - Shared UI Foundation

- [x] Create `src/components/ka/filter-bar.tsx`.
- [x] Apply shared UI components across Houses and Shops first.
- [x] Replace page-local badge color strings with `CategoryBadge` or shared category styles.
- [x] Standardize Houses and Shops page headers through shared `PageHeader`.
- [x] Standardize Houses and Shops card/table structure through shared `DataCard` and `StatTable`.
- [x] Standardize Houses and Shops entity links through shared `EntityLink`.

Group A foundation is complete. Remaining page-wide UI rollout is tracked in Phase 3.

### Group B - Job Relationship Data

- [x] Create `src/game-data/job-equipment.ts`.
- [x] Create `src/game-data/job-skills.ts`.
- [x] Create `src/game-data/job-marriage.ts`.
- [x] Create `src/game-data/job-surveys.ts`.
- [x] Create shared name/category/pair-key normalization helpers.
- [x] Add relationship checks for high-risk facts.

### Group C - Job Profile Query Layer

- [x] Create `src/game-data/job-profile.ts`.
- [x] Add `getJobProfile(shared, jobName)`.
- [x] Move Jobs detail ranges/shops/pairs to profile helpers.
- [x] Move guide job previews to profile helpers.
- [x] Move Loadout equipment-rule lookup to profile helpers.
- [x] Move Survey planner composed job-family lookups to profile helpers.
- [x] Move Marriage planner child/pair lookups to profile helpers where practical.
- [x] Move Ask Database/Search job summaries to profile helpers.

### Group D - App Shell And Navigation

- [x] Extract nav sections from `App.tsx` into `src/app/navigation.ts`.
- [x] Create a shared app shell/header component.
- [x] Standardize mobile menu behavior inside `src/app/site-header.tsx`.
- [x] Standardize global search entity results and route behavior in `src/app/global-search.ts`.
- [x] Move route SEO entries into `src/app/seo.ts` for future review and maintenance.

### Group E - Validation And Maintenance

- [x] Add architecture checks if useful.
- [x] Add duplicate relationship constant checks.
- [x] Add tests or script assertions for canonical relationships.
- [x] Add a future-AI review checklist.
- [x] Keep `source-of-truth.md` updated as domains move.
