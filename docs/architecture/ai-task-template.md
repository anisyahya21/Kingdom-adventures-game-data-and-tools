# AI Task Template

Use this template when asking an AI to change the Kingdom Adventures website.

## Prompt Template

```md
Task:
<describe the exact change>

Important architecture rules:
- Read `AGENTS.md`.
- Check `docs/architecture/source-of-truth.md` before changing game facts.
- Use shared modules in `artifacts/kingdom-adventures/src/game-data` before adding page-local data.
- Use `artifacts/kingdom-adventures/src/design-system` and `src/components/ka` before adding page-local visual styles.
- Do not invent game facts. If a fact is not verified, leave it unlabeled or ask.
- If the fact affects more than one page, move it to a shared module.
- Use existing shared UI patterns and `src/components/ka/*` before creating new local styles.

Efficient context:
- Search narrowly with `rg`.
- Open only the files needed for the exact task.
- Do not scan the whole repo unless the task truly requires it.

Verification:
- Run `npm run typecheck` from `artifacts/kingdom-adventures`.
- Run `npm run build` if shared data, routing, or UI components changed.
```

## Good Task Examples

```md
Move building data used by Houses and Shops into a shared module. Do not change the visual design.
```

```md
Standardize shop and building badges using `CategoryBadge`. Do not invent new colors.
```

```md
Add a new job relationship. First check `src/game-data/job-buildings.ts`, Jobs, Survey, Houses, and Guides. Do not add a page-local copy.
```

## Bad Task Examples

```md
Fix the buildings page.
```

Too vague. The AI may guess.

```md
Add this fact to the Houses page.
```

Risky. If the fact belongs to a job/building/shop relationship, it should probably live in `src/game-data`.
