# Website Workflow

This project follows a `sheet-first, read-only-by-default` product model and a `system-first` working style.

## Core rule

Before making a change, classify it as one of these:

- `global rule`
- `shared component/pattern`
- `single-page behavior`
- `data-source decision`

If a change is not clearly single-page, audit all matching pages before editing.

## Cross-site checklist

Every feature or cleanup pass should be checked for:

- control pattern consistency
- wording consistency
- data source consistency
- editability consistency
- game-rule consistency
- mobile/readability consistency

## UI defaults

- Short fixed option lists should use a simple dropdown, not searchable filtering.
- Large or fuzzy option lists can use searchable selection.
- Public pages should look like reference/database views first, not admin tools.
- Browser-local planning tools can stay interactive, but must not silently edit shared truth.

## Data defaults

- If the sheet already gives enough truth, prefer read-only public display.
- If the rule is confirmed from gameplay and sheet research, encode it once and reuse it everywhere.
- If the data is incomplete or uncertain, collect it through structured submissions or research notes instead of open public editing.
- Personal planning state belongs in browser-local storage unless there is a strong reason to share it.

## Review pass for each implementation batch

1. Rule level
   Check whether the game rule is correct and whether it was applied everywhere it matters.

2. Data-source level
   Check whether the feature is reading from the right layer:
   - sheet
   - translated cache
   - structured submission
   - browser-local state

3. UI level
   Check whether the interaction matches similar areas of the site and still feels like a player-facing database.
