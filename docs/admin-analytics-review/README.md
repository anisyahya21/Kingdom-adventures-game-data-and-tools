# Account admin role and analytics dashboard

The dashboard remains an analytics dashboard. It adds top duration buttons (rolling 24 hours, 7 days, 30 days, 90 days, lifetime, custom dates), daily page-view and unique-browser charts, historical date selection, comparisons, searchable page/tool rankings, a paginated daily table, and CSV export. Calendar reports use Europe/Berlin dates; the 24-hour option uses exact timestamps and partial-day buckets.

## Account permissions

`users.is_admin` is now the only source of admin permission in session responses and protected API routes. Login providers resolve the website account; they do not grant roles. Both the Telegram-ID and Telegram-username allowlists were removed from runtime authorization. Existing roles are not changed by provider linking, unlinking, display-name changes, or normal profile edits. There is no public role-update endpoint.

The existing production owner account was identified by its website UUID and verified Telegram numeric ID, then explicitly granted the role in an additive transaction. Fingerprints verified that other account fields and existing sessions were unchanged. The role was verified after migration. New accounts default to non-admin. Discord must be linked to the same website account; an independent Discord-created account does not inherit the owner's role.

## Historical data and retention

Current history originally began 2026-09-02. The original database retained another 5,256 events from 2026-07-12 through 2026-07-31. All 5,256 were recovered into the current database with original event IDs and timestamps, using conflict-safe inserts. The original database was preserved. Its only signed-in visitor was mapped to the current website account by the identical numeric Telegram account ID, not the username.

The recovery produced 74 stored daily aggregate rows. Immediately after recovery, raw events and summaries both totaled 26,434 views (including one new live event during this work). The daily summary table and index occupied 57,344 bytes. Daily totals have no expiry; existing raw events are preserved. No deletion or truncation job was added.

`analytics_history_coverage` distinguishes the recovered July interval and the ongoing September interval. The intervening 2026-08-01 through 2026-09-01 history is unavailable. API responses use nulls and the chart/table/CSV show gaps, em dashes, or empty cells rather than invented zeroes. Recorded days without events inside known coverage show zero. Period unique visitors are calculated from distinct raw browser IDs, never by summing daily uniques or per-page uniques.

## Reminder metrics

The old overview counted a local JSON file even when reminders used the database-backed store. It now awaits initialization and reads the exact store used by the reminder service. The display separates event subscriptions, device/browser IDs, and distinct attributed website accounts. Unknown devices are shown separately rather than labeled as people. The live database had 10 event subscriptions across 4 devices, with no historical website-account attribution; no owner was guessed retroactively.

Signed-in reminder saves and client-context synchronization capture the account ID from the verified session, ignore client-supplied owner IDs, and preserve existing attribution. The same account on multiple devices counts once. Reading the dashboard does not change subscriptions or send reminders. Reminder scheduler execution is disabled in NODE_ENV=test so isolated verification cannot send messages.

## Verification

- `artifacts/api-server/tools/account-admin-analytics-check.mjs`: disposable local PostgreSQL database, real HTTP routers, controlled Discord provider fixture. Set ADMIN_BROWSER_CHECK=1 for the browser suite; start Vite at port 5186 first. It requires the existing local preview PostgreSQL instance and connection metadata under LOCALAPPDATA/KingdomAdventurersProfilePreview. All test resources are cleaned up before exit.
- `server-report.json`: 36 passing checks, including role preservation through Discord sign-in and Telegram unlink, rejected forged/non-admin sessions, rejected profile elevation, legacy username/ID configuration ignored, historical backfill, coverage gaps, unbounded history, deduplicated period uniques, rolling 24-hour boundaries, reminder audience attribution, CSV, filters, pagination, error handling, and mobile overflow.
- Backend typecheck and production build pass. The frontend production Vite build passes. Frontend typecheck retains unrelated diagnostics in untouched equipment, world-render lab, and timed-events pages; no admin diagnostics were reported.
- Screenshots use isolated fixture accounts and data. Real user provider consent is not claimed from fixture tests.

Deployment status is recorded separately after verifying the API and website releases. The schema and owner grant were applied before releasing code that reads the new flag.

## Human-traffic estimates

The dashboard now filters known crawler, headless-browser and tool User-Agent signatures from every traffic query, daily aggregate, comparison, and legacy ranking endpoint. Missing User-Agents are excluded as unverified. This is an estimate, not proof that every remaining browser is a person. Explicit crawler names are used rather than a broad `bot` substring, so real device brands such as CUBOT are preserved.

The production collector skips development, localhost, previews, known automation, navigator.webdriver and explicit QA-disabled contexts. The intake also rejects non-production origins, known automation and client-marked automation before database initialization/insertion. Google and other crawlers can still access the website; only their analytics events are suppressed. None of these signals is an authentication boundary or a complete anti-spoofing solution.

Historical source records are preserved. `analytics_traffic_exclusions` records 227 reviewed suspicious events from 2026-09-17, 14:00-16:00 Europe/Berlin: fresh single-page visitor IDs with one exact browser string across 82 routes. This narrowly reviewed group is excluded as unverified/suspected automation, not asserted to be proven bots. Other unknown browser strings are not excluded merely for being unfamiliar. The filter can be revised and summaries rebuilt from original records.

At review time, the policy estimated 41 visitors for 2026-09-17 (297 raw IDs) and 51 for 2026-10-18 (180 raw IDs). These counts are not forced to match Vercel, which uses a different visitor identification method. Dates, recovered history, gaps, reminder metrics and account permissions are preserved.

`node tools/human-traffic-check.mjs` verifies the shared classifier and client collector without network calls. The real-router/PostgreSQL/browser suite now passes 42 grouped checks, including mixed human/bot days, zero-human days, preserved source records, collector rejection, normal production tracking, and consistent filtering across endpoints. The shared policy lives in a public JS module with type declarations so both browser and API use the same signatures and source list.
