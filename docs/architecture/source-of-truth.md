# Source Of Truth Map

This site is a Kingdom Adventures reference database. Game facts should have one canonical home, then pages should render from that home.

## Current Canonical Modules

| Domain | Canonical or Preferred Source | Notes |
| --- | --- | --- |
| Shop metadata and shop routes | `artifacts/kingdom-adventures/src/lib/shop-utils.ts` | Includes shop owners, shop slugs, and shop-page metadata. Building stats come from `src/game-data/buildings.ts`. |
| Job to building/shop relationships | `artifacts/kingdom-adventures/src/game-data/job-buildings.ts` | Used by Jobs, Guides, Houses, and Survey. Do not duplicate `KNOWN_JOB_SHOPS`. |
| Job range data | `artifacts/kingdom-adventures/src/lib/generated-job-range-data.ts` | Generated data. Do not hand-edit unless regenerating is unavailable. |
| Equipment data | `artifacts/kingdom-adventures/src/lib/generated-equipment-data.ts` | Generated equipment catalog and exchange data. |
| Local shared data fallback | `artifacts/kingdom-adventures/src/lib/local-shared-data.ts` | App-wide fallback data used when API/shared data is unavailable. |
| Monster truth/parsing helpers | `artifacts/kingdom-adventures/src/lib/monster-truth.ts` | CSV parsing and monster data helpers. |
| Building plot data | `artifacts/kingdom-adventures/src/game-data/buildings.ts` | Shared House.csv-derived building records used by Houses and Shops. |
| Facilities | `artifacts/kingdom-adventures/src/game-data/facilities.ts` | Shared facility records used by Houses, Shops, and Ask Database. |
| Job equipment access | `artifacts/kingdom-adventures/src/game-data/job-equipment.ts` | Weapon and shield access helpers used by Jobs. |
| Job skill access | `artifacts/kingdom-adventures/src/game-data/job-skills.ts` | Attack, attack magic, recovery, and casting fallback helpers used by Jobs. |
| Job name/category normalization | `artifacts/kingdom-adventures/src/game-data/job-normalization.ts` | Shared job name keys and battle/non-battle category helpers. |
| Job profile queries | `artifacts/kingdom-adventures/src/game-data/job-profile.ts` | Composes job stats, ranks, ranges, shops/buildings, equipment, skills, survey capability, and marriage links for page consumers. |
| Marriage relationship helpers | `artifacts/kingdom-adventures/src/game-data/job-marriage.ts` plus shared data | Marriage page should import shared rank/name/pair helpers from here. |
| Survey data | `artifacts/kingdom-adventures/src/game-data/job-surveys.ts` plus raw CSV | Survey-capable job names are derived from Survey Corps HQ ownership. |
| High-risk relationship checks | `artifacts/kingdom-adventures/src/game-data/relationship-checks.ts` | Guards facts that have previously been misrepresented, such as Survey Corps HQ owners. |
| Category, rank, and affinity badge styles | `artifacts/kingdom-adventures/src/design-system/category-styles.ts` | Shared semantic color classes. Use via `src/components/ka/category-badge.tsx` or `src/components/ka/badges.tsx` where possible. |
| App navigation | `artifacts/kingdom-adventures/src/app/navigation.ts` | Header menu sections and links. Do not define page navigation menus in `App.tsx`. |
| Global search entries | `artifacts/kingdom-adventures/src/app/global-search.ts` | Header search entity list and route behavior. |
| Route SEO | `artifacts/kingdom-adventures/src/app/seo.ts` | Page titles, descriptions, canonical paths, and dynamic job/shop/guide metadata. |
| App shell/header | `artifacts/kingdom-adventures/src/app/app-shell.tsx` and `src/app/site-header.tsx` | Global layout, theme toggle, menu, and search UI. |
| Architecture checks | `artifacts/kingdom-adventures/scripts/architecture-checks.mjs` | Lightweight guardrails for duplicated constants, stale terminology, app-shell drift, and high-risk relationships. |
| Future AI review checklist | `docs/architecture/future-ai-review-checklist.md` | Human-readable checklist for accepting AI-generated changes. |

## Relationship Domains

Jobs are central. A job can affect:

- buildings and shops it can open
- survey capability
- marriage and child outcomes
- equipment access
- skill access
- ranks, stats, and ranges
- guide previews and search results

When changing any job-related fact, check whether the fact also affects Jobs, Houses, Survey, Marriage, Guides, Shops, Loadout, or Search.

## Page Rules

Pages may own:

- local UI state
- filters and sorting state
- view-only formatting
- page-specific explanatory text

Pages should not own:

- game relationship mappings used by more than one page
- shop/building/job compatibility facts
- route/name normalization helpers used by multiple pages
- category colors used across pages

## Long-Term Target Structure

```txt
src/game-data/
  buildings.ts
  facilities.ts
  job-buildings.ts
  job-equipment.ts
  job-profile.ts
  job-skills.ts
  job-marriage.ts
  job-normalization.ts
  job-surveys.ts
  relationship-checks.ts

src/design-system/
  category-styles.ts

src/app/
  app-shell.tsx
  global-search.ts
  navigation.ts
  seo.ts
  site-header.tsx

scripts/
  architecture-checks.mjs

src/components/ka/
  page-header.tsx
  data-card.tsx
  filter-bar.tsx
  stat-table.tsx
  cost-pills.tsx
  category-badge.tsx
  badges.tsx
  entity-link.tsx
```

Move toward this structure gradually. Do not do a giant rewrite unless specifically asked.
