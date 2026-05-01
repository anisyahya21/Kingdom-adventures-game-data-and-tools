# Project Instructions

## Real App Location

The actual website is inside:

`artifacts/kingdom-adventures`

## Local Run On Windows

Use these commands first:

```bat
cd artifacts\kingdom-adventures
set PORT=5173
set BASE_PATH=/
npm run dev -- --host
```

Important:
- Do not try to run from the repo root.
- Do not waste turns guessing preview commands.
- For phone testing, use the LAN IP with port `5173`.
- Prefer fixing files over repeatedly restarting preview.

## AI Architecture Rules

This is a data-heavy Kingdom Adventures reference site. Do not invent game facts.

Before adding or changing game data:
- Check whether the fact already exists in `artifacts/kingdom-adventures/src/game-data` or another canonical source listed in `docs/architecture/source-of-truth.md`.
- Prefer shared data and relationship modules over page-local constants.
- If a fact is used by more than one page, move it to a shared module.
- Pages should render data, not own canonical data.
- Never create a second local mapping for the same relationship.
- If unsure whether a fact is verified, ask or leave it unlabeled. Do not infer.

Important relationship domains:
- job to buildings/shops
- job to survey capability
- job to marriage and child inheritance
- job to equipment access
- job to skill access
- job to ranks, stats, and ranges
- shop to craftable items, equipment, and skills
- building to owner jobs
- building to capacity, extra beds, shelves, and monster rooms
- facility to unlocks, upgrades, storage, and production

## Efficient Context Rule

For normal tasks:
1. Read this file.
2. Search narrowly with `rg` for exact labels, functions, and data names.
3. Open only the files returned by the search.
4. If a change touches data shared by multiple pages, check `src/game-data` and the source-of-truth map first.
5. Use `src/design-system` and existing shared UI/components before creating new local patterns.
6. Run `npm run typecheck` after code changes.

Do not scan the whole repo unless the task truly requires it.

## UI Consistency Rules

The site should behave like one tool suite, not unrelated pages.

- Prefer shared components for page headers, cards, badges, tables, filters, links, and cost displays.
- If a UI pattern appears on two or more pages, extract or reuse a shared component.
- Do not create one-off category colors in page files; use shared styles/tokens.
- Keep buttons, badges, cards, and table spacing consistent across pages.
- Link behavior should be consistent for jobs, shops, buildings, equipment, and guides.

## Current Source Of Truth Map

See `docs/architecture/source-of-truth.md` before changing cross-page game facts.
