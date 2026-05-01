# Game Data Layer

This directory owns canonical Kingdom Adventures game facts and derived game relationships.

Pages should import game facts from here instead of defining page-local copies. If a fact affects more than one page, it belongs here or in another explicitly named game-data module.

Current modules:

- `buildings.ts`: House.csv-derived building plot data, plot sizes, building groups, and building lookup helpers.
- `job-buildings.ts`: job to building/shop relationships, building owner lookups, and Survey Corps HQ-derived survey-capable jobs.
- `job-equipment.ts`: weapon and shield access helpers and fallbacks.
- `job-profile.ts`: composed job profile/query helpers for pages that need the full relationship picture.
- `job-skills.ts`: attack, attack magic, recovery, and casting access helpers and fallbacks.
- `job-normalization.ts`: shared job name keys and battle/non-battle category helpers.
- `job-marriage.ts`: marriage rank/name/pair helpers.
- `job-surveys.ts`: survey-facing exports derived from canonical job/building relationships.
- `relationship-checks.ts`: lightweight assertions for high-risk cross-page facts.

Rules:

- Do not invent facts in page components.
- Do not duplicate relationship maps in page files.
- Prefer typed records and lookup helpers over parsing display strings in pages.
- If data is generated from raw sheets, document the source and any known interpretation decisions.
