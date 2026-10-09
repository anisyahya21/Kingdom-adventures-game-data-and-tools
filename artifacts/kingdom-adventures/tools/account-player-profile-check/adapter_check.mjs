import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseAccountSessionResponse } from "../../src/lib/account-player-profile/sync-core.ts";

// Execute the actual HTTP adapter without mounting React or needing real login cookies.
const source = readFileSync(new URL("../../src/lib/account-player-profile/sync.ts", import.meta.url), "utf8");
const start = source.indexOf("type AuthSessionPayload");
const end = source.indexOf("let controller:", start);
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let response;
let request;
const adapter = runInNewContext(`${code}\n({ loadAccountId, readAccountProfile, writeAccountProfile })`, {
  fetch: async (url, options) => { request = { url, options }; return response; },
  requestSession: async (url) => { request = { url, options: { credentials: "include", cache: "no-store" } }; return response; },
  configuredApiBase: () => "",
  apiUrl: (path) => `/ka-api/ka${path}`,
  sanitizePlayerProfile: (profile) => profile,
  parseAccountSessionResponse,
});
response = new Response(JSON.stringify({ authenticated: false }), { status: 200 });
assert.equal(await adapter.loadAccountId(), null);
assert.equal(request.options.credentials, "include");
response = new Response("unavailable", { status: 503 });
await assert.rejects(adapter.loadAccountId(), /503/);
response = new Response(JSON.stringify({ authenticated: true, user: { id: "account-a" } }));
assert.equal((await adapter.loadAccountId()).accountId, "account-a");
response = new Response("login required", { status: 401 });
await assert.rejects(adapter.readAccountProfile(), /Sign in/);
assert.equal(request.options.cache, "no-store");
const profile = { version: 1, equipment: {}, characters: [], valuables: {} };
response = new Response(JSON.stringify({ profile, revision: "r1", accountId: "account-a" }));
const saved = await adapter.writeAccountProfile(profile, null, "account-a");
assert.equal(saved.kind, "saved");
assert.equal(saved.revision, "r1");
assert.equal(saved.accountId, "account-a");
assert.equal(request.url, "/ka-api/ka/account-player-profile");
assert.equal(request.options.credentials, "include");
assert.equal(JSON.parse(request.options.body).expectedAccountId, "account-a");
response = new Response(JSON.stringify({ profile, revision: "r2", accountId: "account-a" }), { status: 409 });
const conflict = await adapter.writeAccountProfile(profile, "r1", "account-a");
assert.equal(conflict.kind, "conflict");
assert.equal(conflict.current.revision, "r2");
response = new Response(JSON.stringify({ profile }), { status: 200 });
await assert.rejects(adapter.readAccountProfile(), /incomplete/);
console.log(JSON.stringify({ outcome: "PASS", checks: "HTTP login, auth outage, credentials, account binding, no-store, save, revision conflict, malformed response" }));
