# UI System Notes

The site should feel like one coherent tool suite. New pages and components should reuse the same patterns instead of creating page-specific styling.

## Current Rule Of Thumb

- Use `src/components/ui/*` primitives for base controls.
- Put Kingdom Adventures-specific shared components in `src/components/ka/*`.
- Put shared category colors and badge styles in `src/design-system/category-styles.ts`.
- Keep page files focused on composition, filters, and state.

## Shared Components To Create First

These are the highest-value extractions because they appear across multiple pages:

| Component | Purpose |
| --- | --- |
| `PageHeader` | Icon, title, description, optional actions. |
| `DataCard` | Standard card spacing for reference entries. |
| `FilterBar` | Search and segmented/filter controls. |
| `StatTable` | Dense data tables with consistent typography and spacing. |
| `CostPills` | Material or item cost display. |
| `CategoryBadge` | Shared badge color system. |
| `RankBadge`, `AffinityBadge`, `ToneBadge` | Shared rank, marriage compatibility, and semantic status badges. |
| `EntityLink` | Consistent links to jobs, shops, buildings, equipment, and guides. |

## Color Rules

Do not invent random category colors in page files. Shared categories should be named by meaning:

- `job`
- `shop`
- `house`
- `facility`
- `event`
- `monster`
- `equipment`
- `survey`
- `warning`
- `success`
- `muted`

Local color strings are acceptable for highly specific interactive states such as map overlays, chart bars, active countdown rows, editor color swatches, or one-off warning panels. Reusable database concepts, categories, ranks, affinities, and entity badges should use `src/design-system/category-styles.ts` or `src/components/ka/*`.

## Review Checklist For UI Changes

- Does the page use the same header style as similar pages?
- Are buttons the same size and shape as nearby tools?
- Are badges semantically colored, not randomly colored?
- Are cards using consistent padding and radius?
- Does mobile layout avoid cramped text and overlapping controls?
- If this pattern exists elsewhere, should it be a shared component?
