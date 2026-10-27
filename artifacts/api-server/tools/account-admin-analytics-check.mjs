// Real routers, local disposable PostgreSQL, controlled Discord OAuth fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { Client } = createRequire(
  new URL("../../../lib/db/package.json", import.meta.url),
)("pg");
const config = JSON.parse(
  fs.readFileSync(
    path.join(
      process.env.LOCALAPPDATA,
      "KingdomAdventurersProfilePreview/connection.json",
    ),
  ),
);
const connection = {
  host: "127.0.0.1",
  port: config.port,
  user: "profile_preview",
  password: config.password,
  database: "postgres",
};
const admin = new Client(connection);
const name = "account_admin_check_" + crypto.randomBytes(6).toString("hex");
const output = path.resolve("dist/account-admin-check.mjs");
const reportDir = path.resolve("../../docs/admin-analytics-review");
fs.mkdirSync(reportDir, { recursive: true });
const checks = [];
const realFetch = globalThis.fetch;
let db,
  mod,
  server,
  created = false;
const owner = crypto.randomUUID(),
  ordinary = crypto.randomUUID();
const ownerToken = crypto.randomBytes(32).toString("hex"),
  userToken = crypto.randomBytes(32).toString("hex");
const cookie = (token) => ({ Cookie: "ka_session=" + token });
try {
  await admin.connect();
  await admin.query('CREATE DATABASE "' + name + '"');
  created = true;
  db = new Client({ ...connection, database: name });
  await db.connect();
  await db.query(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_user_id text UNIQUE, telegram_username text, discord_user_id text UNIQUE, discord_username text, game_accounts jsonb, first_name text,last_name text,display_name text,game_id text,photo_url text,locale text,status text NOT NULL DEFAULT 'active',created_at timestamptz NOT NULL DEFAULT now(),last_login_at timestamptz);
    CREATE TABLE user_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),session_token_hash text UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,last_seen_at timestamptz,revoked_at timestamptz,user_agent text,ip_address text);
    CREATE TABLE auth_challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),state text UNIQUE NOT NULL,nonce text NOT NULL,flow text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,consumed_at timestamptz,ip_address text,user_agent text);
    CREATE TABLE app_state(key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE analytics_events(event_id text PRIMARY KEY,timestamp timestamptz NOT NULL DEFAULT now(),event_type text NOT NULL,route text NOT NULL,tool_slug text,user_id uuid REFERENCES users(id),anon_id text NOT NULL,session_id text NOT NULL,referrer text,user_agent text,country text);`);
  await db.query(
    "INSERT INTO users(id,telegram_user_id,telegram_username,discord_user_id,display_name) VALUES($1,'owner-telegram','FormerName','123456789012345678','Owner'),($2,'ordinary-telegram','AnesYahya',NULL,'Normal account')",
    [owner, ordinary],
  );
  for (const [id, token] of [
    [owner, ownerToken],
    [ordinary, userToken],
  ])
    await db.query(
      "INSERT INTO user_sessions(user_id,session_token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [id, crypto.createHash("sha256").update(token).digest("hex")],
    );
  const original = (
    await db.query(
      "SELECT row_to_json(s) AS row FROM user_sessions s ORDER BY id",
    )
  ).rows;
  process.env.DATABASE_URL = `postgresql://profile_preview:${config.password}@127.0.0.1:${config.port}/${name}`;
  process.env.NODE_ENV = "test";
  process.env.AUTH_COOKIE_SECURE = "false";
  process.env.DISCORD_CLIENT_ID = "fixture-client";
  process.env.DISCORD_CLIENT_SECRET = "fixture-secret";
  process.env.TELEGRAM_ADMIN_USER_IDS = "ordinary-telegram";
  process.env.TELEGRAM_ADMIN_USERNAMES = "AnesYahya";
  delete process.env.DISCORD_HTTP_RELAY_URL;
  delete process.env.DISCORD_LOGIN_REDIRECT_URI;
  await db.query(
    "INSERT INTO app_state(key,value) VALUES('ka_event_reminder_subscriptions_v1',$1::jsonb)",
    [
      JSON.stringify({
        subscriptions: [
          { clientId: "fixture-one" },
          { clientId: "fixture-two" },
        ],
        discordConnections: [],
      }),
    ],
  );
  await build({
    stdin: {
      contents:
        'export {default} from "./src/app";export {pool} from "@workspace/db";export * from "./src/lib/admin-analytics";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: output,
    loader: { ".sql": "text", ".txt": "text" },
    external: ["pg-native", "pino", "pino-http"],
    banner: {
      js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
    },
    logLevel: "warning",
  });
  mod = await import(pathToFileURL(output).href);
  await mod.ensureAdminAnalyticsSchema();
  await mod.ensureAdminAnalyticsSchema();
  assert.deepEqual(
    (
      await db.query(
        "SELECT row_to_json(s) AS row FROM user_sessions s ORDER BY id",
      )
    ).rows,
    original,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM users WHERE is_admin"))
      .rows[0].n,
    0,
  );
  await db.query("UPDATE users SET is_admin=true WHERE id=$1", [owner]);
  checks.push(
    "additive repeatable migration preserves sessions",
    "no automatic username grant",
    "explicit account admin grant",
  );
  // Same anonymous browser across routes/day: one daily unique, repeated views.
  await db.query(
    "ALTER TABLE analytics_events ALTER COLUMN user_agent SET DEFAULT 'Mozilla/5.0 Firefox/144.0'",
  );
  await db.query(
    "INSERT INTO analytics_events(event_id,timestamp,event_type,route,tool_slug,user_id,anon_id,session_id) VALUES('a','2025-01-01T12:00:00Z','page_view','/equipment','equipment',$1,'browser-a','s1'),('b','2025-01-01T13:00:00Z','page_view','/guides','guides',$1,'browser-a','s1'),('c','2025-01-01T14:00:00Z','page_view','/equipment','equipment',NULL,'browser-b','s2'),('d','2025-01-02T12:00:00Z','page_view','/equipment','equipment',$1,'browser-a','s3'),('e','2025-01-02T23:30:00Z','page_view','/guides','guides',NULL,'browser-b','s4')",
    [owner],
  );
  await db.query(
    "INSERT INTO analytics_site_daily(date,views,unique_visitors) VALUES('2025-01-01',999,999),('2025-01-03',999,999)",
  );
  const realPoolQuery = mod.pool.query.bind(mod.pool);
  mod.pool.query = (...args) =>
    String(args[0]).includes("INSERT INTO analytics_site_daily")
      ? Promise.reject(new Error("fixture initial backfill failure"))
      : realPoolQuery(...args);
  await assert.rejects(
    mod.refreshDailyAnalytics(true),
    /fixture initial backfill failure/,
  );
  mod.pool.query = realPoolQuery;
  await mod.refreshDailyAnalytics();
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT views FROM analytics_site_daily WHERE date='2025-01-01'",
        )
      ).rows[0].views,
    ),
    3,
  );
  await mod.refreshDailyAnalytics(true);
  checks.push(
    "failed initial backfill retries full history instead of leaving stale raw counts",
  );
  await db.query(
    "INSERT INTO analytics_events(event_id,timestamp,event_type,route,anon_id,session_id,user_agent) VALUES('google','2025-01-01T13:00Z','page_view','/bot','browser-a','bot','Googlebot/2.1'),('headless','2025-01-02T13:00Z','page_view','/bot','headless','headless','HeadlessChrome/145'),('bot-only','2025-01-04T13:00Z','page_view','/bot','bot-only','bot-only','DuckAssistBot/1.2'),('reviewed','2025-01-01T14:00Z','page_view','/reviewed','reviewed','reviewed','Mozilla/5.0 Chrome/145.0')",
  );
  await db.query(
    "INSERT INTO analytics_traffic_exclusions(event_id,reason) VALUES('reviewed','suspected_automation_test_fixture')",
  );
  await mod.refreshDailyAnalytics(true);
  await db.query(
    "UPDATE analytics_history_coverage SET end_date='2025-01-04'; INSERT INTO analytics_history_coverage(start_date,end_date,source) VALUES('2026-01-01',NULL,'Current collection')",
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM analytics_site_daily"))
      .rows[0].n,
    4,
  );
  const rollup = (
    await db.query("SELECT * FROM analytics_site_daily WHERE date='2025-01-01'")
  ).rows[0];
  assert.equal(Number(rollup.views), 3);
  assert.equal(Number(rollup.unique_visitors), 2);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT views FROM analytics_site_daily WHERE date='2025-01-04'",
        )
      ).rows[0].views,
    ),
    0,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM analytics_events")).rows[0]
      .n,
    9,
  );
  checks.push(
    "known crawlers, headless and reviewed suspect records excluded without deleting originals",
    "bot-only days have zero estimated human views",
  );
  checks.push(
    "historical backfill is repeatable",
    "daily unique browsers deduplicated across pages",
    "Berlin day boundaries",
  );
  server = mod.default.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  const request = async (route, token, init = {}) => {
    const response = await realFetch(base + route, {
      ...init,
      headers: { ...(token ? cookie(token) : {}), ...init.headers },
    });
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      body: await response.json(),
    };
  };
  for (const token of [undefined, userToken]) {
    assert.equal((await request("/ka/admin/overview", token)).status, 403);
    assert.equal((await request("/ka/admin/analytics", token)).status, 403);
  }
  let session = await request("/auth/session", ownerToken);
  assert.equal(session.body.user.isAdmin, true);
  assert.equal(
    (await request("/auth/session", userToken)).body.user.isAdmin,
    false,
  );
  const all = await request("/ka/admin/analytics?days=all", ownerToken);
  assert.equal(all.status, 200);
  assert.equal(all.cache, "private, no-store");
  assert.equal(all.body.firstDate, "2025-01-01");
  assert.ok(all.body.daily.length > 365);
  assert.equal(all.body.totals.views, 5);
  assert.equal(all.body.totals.uniqueVisitors, 2);
  assert.equal(all.body.daily[0].views, 3);
  assert.equal(all.body.daily[0].uniqueVisitors, 2);
  assert.equal(
    all.body.daily.find((row) => row.date === "2025-08-01").views,
    null,
  );
  assert.ok(all.body.unavailableDays > 0);
  assert.equal(
    (await request("/ka/admin/analytics", "forged-cookie")).status,
    403,
  );
  checks.push(
    "missing history is unavailable, not fabricated zero",
    "forged session rejected",
  );
  const oldRange = await request(
    "/ka/admin/analytics?from=2025-01-01&to=2025-01-02",
    ownerToken,
  );
  assert.equal(oldRange.body.totals.views, 4);
  assert.equal(oldRange.body.daily.length, 2);
  assert.equal(
    (
      await request(
        "/ka/admin/analytics?from=2025-02-30&to=2025-03-01",
        ownerToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/ka/admin/analytics?from=2024-01-01&to=2025-03-01",
        ownerToken,
      )
    ).status,
    400,
  );
  checks.push(
    "guest and non-admin blocked by actual routes",
    "old admin username does not grant access",
    "all-history includes more than a year",
    "period uniques not summed from daily uniques",
    "custom historical dates",
    "invalid and unavailable ranges rejected",
    "private analytics responses",
  );
  assert.equal(
    (await request("/ka/admin/overview", ownerToken)).body
      .reminderSubscriptions,
    2,
  );
  checks.push("reminder count uses initialized database-backed reminder store");
  const contextBody = (clientId) =>
    JSON.stringify({
      clientId,
      clientTimeZoneOffsetMinutes: 60,
      ownerUserId: ordinary,
    });
  await request(
    "/ka/event-reminders/subscriptions/sync-client-context",
    ownerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: contextBody("fixture-one"),
    },
  );
  let reminderAudience = (await request("/ka/admin/overview", ownerToken)).body
    .reminderAudience;
  assert.deepEqual(
    {
      subscriptions: reminderAudience.subscriptions,
      devices: reminderAudience.devices,
      accounts: reminderAudience.accounts,
      unknown: reminderAudience.unattributedDevices,
    },
    { subscriptions: 2, devices: 2, accounts: 1, unknown: 1 },
  );
  await request(
    "/ka/event-reminders/subscriptions/sync-client-context",
    ownerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: contextBody("fixture-two"),
    },
  );
  await request(
    "/ka/event-reminders/subscriptions/sync-client-context",
    userToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: contextBody("fixture-one"),
    },
  );
  reminderAudience = (await request("/ka/admin/overview", ownerToken)).body
    .reminderAudience;
  assert.equal(reminderAudience.accounts, 1);
  assert.equal(reminderAudience.unattributedDevices, 0);
  assert.equal(
    (
      await db.query(
        "SELECT value->'subscriptions'->0->>'ownerUserId' AS owner FROM app_state WHERE key='ka_event_reminder_subscriptions_v1'",
      )
    ).rows[0].owner,
    owner,
  );
  checks.push(
    "reminder subscriptions, devices, accounts and unknowns reported separately",
    "same account across devices counts once",
    "reminder account attribution uses server session and preserves existing ownership",
  );
  await db.query(
    "INSERT INTO analytics_events(event_id,timestamp,event_type,route,tool_slug,anon_id,session_id) VALUES('older-than-day',now()-interval '25 hours','page_view','/recent','recent','recent-a','recent-a'),('inside-day',now()-interval '1 hour','page_view','/recent','recent','recent-b','recent-b')",
  );
  await db.query(
    "INSERT INTO analytics_events(event_id,timestamp,event_type,route,tool_slug,anon_id,session_id,user_agent) VALUES('recent-bot',now()-interval '2 hours','page_view','/bot','bot','recent-bot','recent-bot','Googlebot/2.1'),('recent-reviewed',now()-interval '2 hours','page_view','/reviewed','reviewed','recent-reviewed','recent-reviewed','Mozilla/5.0 Chrome/145')",
  );
  await db.query(
    "INSERT INTO analytics_traffic_exclusions(event_id,reason) VALUES('recent-reviewed','suspected_automation_test_fixture')",
  );
  await mod.refreshDailyAnalytics(true);
  const last24 = await request("/ka/admin/analytics?hours=24", ownerToken);
  assert.equal(last24.status, 200);
  assert.equal(last24.body.totals.views, 1);
  assert.equal(last24.body.previous.views, 1);
  assert.equal(
    last24.body.daily.reduce((sum, row) => sum + (row.views ?? 0), 0),
    1,
  );
  assert.equal(
    Date.parse(last24.body.toInstant) - Date.parse(last24.body.fromInstant),
    86400000,
  );
  checks.push(
    "24 hours is a true rolling window in totals and daily rows",
    "24-hour comparison uses preceding 24 hours",
  );
  const trackerBody = {
    eventId: "collector-check",
    eventType: "page_view",
    route: "/collector",
    anonId: "collector-visitor",
    sessionId: "collector-session",
  };
  const beforeIntake = (
    await db.query("SELECT count(*)::int AS n FROM analytics_events")
  ).rows[0].n;
  for (const [agent, origin, automation] of [
    [
      "Googlebot/2.1",
      "https://kingdom-adventures-community-tools.vercel.app",
      false,
    ],
    [
      "HeadlessChrome/145",
      "https://kingdom-adventures-community-tools.vercel.app",
      false,
    ],
    [
      "ExaSearchBot/1.0",
      "https://kingdom-adventures-community-tools.vercel.app",
      false,
    ],
    ["Mozilla/5.0 Chrome/145", "http://localhost:5186", false],
    ["Mozilla/5.0 Chrome/145", "https://preview-example.vercel.app", false],
    [
      "Mozilla/5.0 Chrome/145",
      "https://kingdom-adventures-community-tools.vercel.app",
      true,
    ],
  ]) {
    const rejected = await request("/ka/analytics/events", undefined, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": agent,
        origin,
      },
      body: JSON.stringify({ ...trackerBody, automation }),
    });
    assert.equal(rejected.body.skipped, true);
  }
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM analytics_events")).rows[0]
      .n,
    beforeIntake,
  );
  const accepted = await request("/ka/analytics/events", undefined, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "user-agent": "Mozilla/5.0 Chrome/145",
      origin: "https://kingdom-adventures-community-tools.vercel.app",
    },
    body: JSON.stringify(trackerBody),
  });
  assert.equal(accepted.body.ok, true);
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM analytics_events")).rows[0]
      .n,
    beforeIntake + 1,
  );
  await mod.refreshDailyAnalytics(true);
  assert.equal(
    (await request("/ka/admin/top-pages?days=365", ownerToken)).body.rows.some(
      (r) => r.route === "/bot" || r.route === "/reviewed",
    ),
    false,
  );
  assert.equal(
    (await request("/ka/admin/top-tools?days=365", ownerToken)).body.rows.some(
      (r) => r.toolSlug === "bot",
    ),
    false,
  );
  checks.push(
    "intake discards known crawlers, automated flags, localhost and previews before persistence",
    "normal production browser events remain trackable",
    "legacy ranking endpoints use the same human filter",
  );
  const profile = await request("/auth/profile", userToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedUserId: ordinary,
      displayName: "AnesYahya",
      gameId: "",
      isAdmin: true,
    }),
  });
  assert.equal(profile.status, 200);
  assert.equal(
    (await request("/auth/session", userToken)).body.user.isAdmin,
    false,
  );
  checks.push("profile changes cannot elevate privileges");
  // Sign in with Discord independently: resolves to the same website account.
  const start = await realFetch(base + "/auth/discord/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ka-origin": base.replace("/api", ""),
    },
    body: "{}",
  });
  assert.equal(start.status, 200);
  const startData = await start.json();
  const state = new URL(startData.url).searchParams.get("state");
  const browserCookie = start.headers
    .getSetCookie()
    .find((c) => c.startsWith("ka_discord_oauth="))
    .split(";")[0];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://discord.com/api/"))
      return new Response(
        JSON.stringify(
          String(url).endsWith("/oauth2/token")
            ? { access_token: "fixture" }
            : { id: "123456789012345678", username: "different-name" },
        ),
        { headers: { "content-type": "application/json" } },
      );
    return realFetch(url, init);
  };
  const callback = await realFetch(
    base +
      "/auth/discord/callback?" +
      new URLSearchParams({ state, code: "fixture" }),
    { headers: { Cookie: browserCookie }, redirect: "manual" },
  );
  assert.equal(callback.status, 302);
  const discordToken = callback.headers
    .getSetCookie()
    .find((c) => c.startsWith("ka_session="))
    .split(";")[0]
    .split("=")[1];
  const discordSession = await request("/auth/session", discordToken);
  assert.equal(discordSession.body.user.id, owner);
  assert.equal(discordSession.body.user.isAdmin, true);
  const unlink = await request(
    "/auth/providers/telegram/unlink",
    discordToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUserId: owner }),
    },
  );
  assert.equal(unlink.status, 200);
  session = await request("/auth/session", discordToken);
  assert.equal(session.body.user.isAdmin, true);
  assert.equal(session.body.user.linkedProviders.telegram, false);
  assert.equal((await request("/ka/admin/overview", discordToken)).status, 200);
  assert.equal(
    (await request("/ka/admin/analytics", discordToken)).status,
    200,
  );
  assert.equal(
    (await request("/auth/session", ownerToken)).body.authenticated,
    false,
  );
  checks.push(
    "Discord login uses same account and admin role",
    "unlink Telegram retains admin via Discord",
    "revoked old session cannot access account",
  );
  if (process.env.ADMIN_BROWSER_CHECK === "1") {
    const { checkBrowser } =
      await import("./admin-dashboard-browser-check.mjs");
    checks.push(...(await checkBrowser(base, discordToken, reportDir)));
  }
  const report = {
    result: "PASS",
    checks,
    count: checks.length,
    database: "disposable local PostgreSQL, removed on exit",
    provider:
      "controlled Discord OAuth fixture, real account/session/router logic",
  };
  fs.writeFileSync(
    path.join(reportDir, "server-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  fs.writeFileSync(
    path.join(reportDir, "server-report.json"),
    JSON.stringify({ result: "FAIL", checks, error: error.stack }, null, 2),
  );
  throw error;
} finally {
  globalThis.fetch = realFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
  await mod?.pool.end();
  await db?.end();
  if (created) await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
  await admin.end();
  if (fs.existsSync(output)) fs.unlinkSync(output);
}
// Imported production routers own background timers; all test resources above
// are closed before ending this standalone verification process.
process.exit(0);
