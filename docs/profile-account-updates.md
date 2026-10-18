# Profile account updates (local review)

Release branch: `fix/session-persistence-release`. Includes this chat's profile, sign-in, equipment synchronization and reminder updates; excludes the parallel homepage and tool-design projects.

## Local preview

Frontend: `http://localhost:5173/player-profile?tab=notifications`.

The isolated preview API runs on `127.0.0.1:3001`. Its separate PostgreSQL cluster uses port `55418`; it does not use the existing PostgreSQL service or the production database. Preview credentials and data stay under `%LOCALAPPDATA%/KingdomAdventurersProfilePreview`. The user is labelled **Local preview account**. The preview account has synthetic Telegram/Discord associations for reviewing the controls, not working provider credentials.

Start the frontend from `artifacts/kingdom-adventures` with `PORT=5173`, `BASE_PATH=/`, and `npm run dev -- --host`. Start the preview API from `artifacts/api-server` with `node tools/profile-preview.mjs`. Open `/ka-api/local-preview` through port 5173 to enter the isolated preview account. This helper entry point is never included in the production build.

## Behavior

- Profile now has separate Profile & collection and Notifications views. Notifications use the website's normal components, a delivery sidebar, searchable event rows, subscribed/category filters, per-event timing controls, and collapsed diagnostics. The installed reminder app retains its own layout and existing subscription storage. Push subscriptions and reminder channel preferences remain device-specific.
- Primary Game ID and Display name align at the top. Additional named game accounts save under the website user. Profile has an **Edit collection for** picker; Combat Hub and the leveling optimiser each remember an independent game-account choice. There is no global active-account control. Each account retains separate characters, gear and valuables. Primary account storage remains compatible with existing data. Removing an account from the list does not delete its stored collection row.
- Current equipment levels now share the selected account's collection in both directions: edits in the optimiser update Profile, and Profile edits update the optimiser. EXP recipient/source levels, Item A/B current levels, the Grand recipient and its source table all use that shared data. Selecting equipment does not write levels. Editing a current level records that item as owned at that level. Target levels, selected source checkboxes and calculations stay in per-account planning storage. **Select owned sources** resets source selection from recorded ownership without changing levels. The former device-only planner state remains intact under its original storage keys.
- Discord authorization-code login requests only the `identify` scope. Telegram and Discord can be linked to one user and unlinked. A provider already attached to another website user is rejected rather than merged. Unlinking the final method is rejected, and other sessions are revoked after unlinking. Linking is bound to the browser that started it and, when linking, the original website session.
- Auth routes send private/no-store headers. HTTPS production uses same-origin API rewrites consistently. Failed session requests raise connection errors instead of returning a guest session; focus/manual refresh can recover. Existing database sessions retain their original opaque-token/hash design and TTL. These changes address identified cache/origin/error-handling problems; a real production redeployment test has not been performed.
- Collection writes retain optimistic revision checks and include both the authenticated website identity and game-account scope. Metadata saves reject changed logins and stale account lists.

## Validation

- Local API TypeScript check and bundle build pass.
- Existing account sync race checks: 33 pass. HTTP adapter and server profile checks pass.
- `node tools/profile-accounts-check.mjs` exercises the actual API with isolated PostgreSQL: legacy IDs, multiple accounts, account ownership, collection isolation, stale metadata, unlinking, preserved sessions, and private response headers. It creates and cleans up only its own test records.
- Frontend typecheck has the same pre-existing errors as the before-change baseline, in equipment, world-render lab, and timed events. No additional errors were found in the changed frontend code.
- Browser preview checked for aligned fields, notifications layout and subscribed empty state. No real Discord/Telegram OAuth round trip or notification DM was sent.
- S-rank weapon reminders reuse the existing 36 one-day S-weapon schedule entries. The catalog marks these explicitly as S rank, and the shared reminder filter excludes all 24 Kairo Series entries. The S Rank Weapons category, search, per-event controls and pagination were checked in the local browser. `reminder_catalog_check.mjs` verifies the filter against the actual catalog and preserves job/facility coverage.
- `tool_account_check.mjs`: shared current-level edits preserve other equipment, characters and valuables, clamp to supported levels, and avoid redundant writes; independent tool choices, user isolation and per-account planning storage remain covered. The existing 33 sync race checks and HTTP adapter checks still pass. Frontend typecheck remains at the same 48 baseline errors.
- Browser verification on the isolated secondary preview account: setting Bronze Sword current level to 23 in the optimiser appeared as 23 in Profile; editing it to 47 in Profile appeared as 47 in the optimiser. The optimiser target stayed at 77. API checks confirmed the primary game account and all unrelated profile fields were unchanged. Original test equipment data was restored after verification. These are local checks, not production evidence.

## Before an authorized release

1. API startup applies `lib/db/migrations/20261018_profile_accounts.sql` to its own configured database before listening. It uses a bounded transaction and advisory lock, checks existing user/session fingerprints, and skips completed migrations. A disposable PostgreSQL test verified migration and repeat execution preserve original records. No separate connected database is modified.
2. Use existing server-side `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`. Register `https://kingdom-adventures-community-tools.vercel.app/ka-api/auth/discord/callback` as an additional Discord OAuth redirect. Optionally set `DISCORD_LOGIN_REDIRECT_URI` to that same URL. Keep the existing reminder delivery redirect registered separately.
3. Check the stable production hostname/cookie settings and perform real provider linking/unlinking, notifications, and a sign-in → deployment → session-retention test. No production readiness or persistence claim is established by the local preview alone.
