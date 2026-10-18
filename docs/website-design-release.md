# Website design and Jobs view release

Approved in the website foundation review chat on 2026-10-18.

- Complete homepage with fourteen destinations, larger map preview, compact tool copy, retained SEO text and saved generated/native artwork choice.
- Shared card/header treatment with distinct illustrations for individual tools; actual game entity/shop imagery preserved.
- Bridge Blueprints uses the native Reclaim tile. Multi-Box uses dungeon reward chests. Items Reference uses its own catalogue.
- Jobs ranking medal encoding fixed. Value/Growth is now a display view that shows recorded gain per level on desktop and mobile. Rankings follow displayed values; irrelevant level/awakening controls hide in growth view.
- Highlighted Jobs and Match Finder header actions removed without deleting saved data. Jobs query freshness is automatic.
- Global search includes navigation destinations and keyboard/accessibility improvements.

This package excludes local comparison routes, screenshots, intermediate artwork, unrelated profile/auth follow-ups and Chaos planner work. It starts from the current origin/main so previously released account/reminder functionality remains. Full investigation and browser evidence remain in the original review checkout under docs/foundation-review.

Validation: full npm run build passed including icon validation and browser-runtime packaging. TypeScript reports the same 48 existing diagnostics as the reviewed baseline, with no new diagnostics. Earlier browser checks verified fourteen homepage links, artwork preference, distinct subtool art, native reclaimed-land tile, corrected medals, and desktop/phone gain-per-level view (34 canonical HP-growth comparisons). git diff --check passes.

Google site-name follow-up: initial HTML now contains the same WebSite JSON-LD used by the client, with consistent homepage title signals. The runtime updater reuses that script node. Existing favicon is unchanged; three local branding proposals are intentionally outside this release. Google recrawl and selection remain external.
