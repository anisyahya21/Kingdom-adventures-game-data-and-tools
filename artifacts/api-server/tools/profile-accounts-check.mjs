import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const { Client } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");
const config = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, "KingdomAdventurersProfilePreview/connection.json")));
// Hard-bound to the disposable local preview cluster; never accepts a production URL.
const db = new Client({ host: "127.0.0.1", port: config.port, user: "profile_preview", password: config.password, database: "postgres" });
await db.connect();
const userId = crypto.randomUUID();
const gameId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("base64url");
const otherToken = crypto.randomBytes(32).toString("base64url");
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
async function call(path, body, sessionToken = token) {
  const response = await fetch(`http://127.0.0.1:3001/ka-api/${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { Cookie: `ka_session=${sessionToken}`, "Content-Type": "application/json", "sec-fetch-site": "same-origin" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function collection(method, game, profile, expectedAccountId, revision) {
  const response = await fetch(`http://127.0.0.1:3001/ka-api/ka/account-player-profile${game ? `?gameAccountId=${game}` : ""}`, {
    method, headers: { Cookie: `ka_session=${token}`, "Content-Type": "application/json", "sec-fetch-site": "same-origin" },
    ...(method === "PUT" ? { body: JSON.stringify({ profile, expectedAccountId, revision }) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
try {
  await db.query("INSERT INTO users(id, telegram_user_id, telegram_username, discord_user_id, discord_username, game_id) VALUES($1,$2,'check',$3,'check','123,456,789')", [userId, `test-${userId}`, `test-${crypto.randomUUID()}`]);
  for (const value of [token, otherToken]) await db.query("INSERT INTO user_sessions(user_id, session_token_hash, expires_at) VALUES($1,$2,now()+interval '1 day')", [userId, crypto.createHash("sha256").update(value).digest("hex")]);
  let session = await call("auth/session");
  check(session.body.authenticated, true, "Database session loads");
  check(session.body.user.gameAccounts, [{ id: "primary", name: "Main account", gameId: "123,456,789" }], "Legacy game ID retained");
  check(session.headers.get("cache-control"), "private, no-store, max-age=0", "Private auth response");
  const accounts = [{ id: "primary", name: "Main account", gameId: "123,456,789" }, { id: gameId, name: "Second account", gameId: "987,654,321" }];
  const input = { displayName: "Integration test", gameId: "123,456,789", gameAccounts: accounts, expectedUserId: userId, accountsRevision: session.body.user.accountsRevision };
  check((await call("auth/profile", { ...input, expectedUserId: crypto.randomUUID() })).status, 409, "Reject account switch during save");
  check((await call("auth/profile", { ...input, gameAccounts: [accounts[1]] })).status, 400, "Protect legacy primary collection");
  check((await call("auth/profile", { ...input, gameAccounts: [accounts[0], { ...accounts[1], gameId: "invalid" }] })).status, 400, "Reject malformed ID");
  check((await call("auth/profile", input)).status, 200, "Save multiple accounts");
  check((await call("auth/profile", input)).status, 400, "Reject stale metadata overwrite");
  session = await call("auth/session");
  check(session.body.user.gameAccounts.length, 2, "Accounts survive fresh session read");
  const empty = { version: 1, equipment: {}, characters: [], valuables: {} };
  const main = { ...empty, valuables: { "know-how": 2 } };
  const second = { ...empty, valuables: { "know-how": 5 } };
  check((await collection("PUT", null, main, userId, null)).status, 200, "Save main collection");
  check((await collection("PUT", gameId, second, `${userId}:game:${gameId}`, null)).status, 200, "Save secondary collection");
  check((await collection("GET", null)).body.profile.valuables["know-how"], 2, "Main collection isolated");
  check((await collection("GET", gameId)).body.profile.valuables["know-how"], 5, "Second collection isolated");
  check((await collection("PUT", gameId, main, userId, null)).status, 403, "Reject stale collection scope");
  assert.notEqual((await collection("GET", crypto.randomUUID())).status, 200); checks++;
  check((await call("auth/providers/discord/unlink", { expectedUserId: crypto.randomUUID() })).status, 409, "Reject stale unlink identity");
  check((await call("auth/providers/discord/unlink", { expectedUserId: userId })).status, 200, "Unlink secondary sign-in");
  check((await call("auth/session", undefined, otherToken)).body.authenticated, false, "Other sessions revoked after unlink");
  check((await call("auth/session")).body.authenticated, true, "Current browser retained");
  check((await call("auth/providers/telegram/unlink", { expectedUserId: userId })).status, 400, "Cannot remove final sign-in");
  const [stored] = (await db.query("SELECT game_accounts, telegram_user_id, discord_user_id FROM users WHERE id=$1", [userId])).rows;
  check(stored.game_accounts.length, 2, "Unlink preserves game accounts");
  check(stored.discord_user_id, null, "Discord association removed");
  check(Boolean(stored.telegram_user_id), true, "Telegram association retained");
  console.log(JSON.stringify({ ok: true, checks, database: "isolated-local-postgresql", oauthProviderRoundTrip: "not tested" }));
} finally {
  await db.query("DELETE FROM app_state WHERE key=ANY($1::text[])", [[`ka_account_player_profile_v1:${userId}`, `ka_account_player_profile_v1:${userId}:game:${gameId}`]]);
  await db.query("DELETE FROM users WHERE id=$1", [userId]);
  await db.end();
}
