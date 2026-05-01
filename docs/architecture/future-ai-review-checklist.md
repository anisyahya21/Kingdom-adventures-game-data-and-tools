# Future AI Review Checklist

Use this before accepting AI-generated changes.

## Source Of Truth

- If a fact affects more than one page, it must live in `src/game-data/`, `src/design-system/`, or `src/app/`.
- Do not invent job/building/shop relationships in page components.
- Do not duplicate `KNOWN_JOB_SHOPS`; import helpers from `src/game-data/job-buildings.ts` or `src/game-data/job-profile.ts`.
- For job-related facts, check whether Jobs, Houses, Survey, Marriage, Guides, Loadout, Search, or Ask Database also need the same fact.

## UI Consistency

- Use `src/components/ka/` shared components for database cards, badges, filters, tables, cost pills, and entity links when practical.
- Use `src/design-system/category-styles.ts` for semantic color classes.
- Navigation changes belong in `src/app/navigation.ts`.
- Header search entries belong in `src/app/global-search.ts`.
- Route titles/descriptions belong in `src/app/seo.ts`.

## High-Risk Facts

- Survey Corps HQ is opened by Carpenter, Farmer, Merchant, Mover, and Rancher at Rank B+.
- Royal is not a Survey Corps HQ owner.
- House “Capacity” is total bed capacity.
- “Extra beds” means additional beds beyond the default bed.
- Do not reintroduce “Indoor slots” unless a decoded source explicitly proves a separate mechanic.

## Commands

Run from `artifacts/kingdom-adventures`:

```bash
npm run architecture:check
npm run typecheck
npm run build
```

Existing build warnings about sourcemaps and chunk size are known, but new failures should be fixed before accepting changes.
