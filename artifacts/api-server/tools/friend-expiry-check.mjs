import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the route's actual normalization, including legacy entry migration.
const source = readFileSync(new URL("../src/routes/ka.ts", import.meta.url), "utf8");
const start = source.indexOf("const FRIEND_ENTRY_TTL_MS =");
const end = source.indexOf("function ensureDir()", start);
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const { sanitize, prune, ttl } = runInNewContext(`${code}\n({ sanitize: sanitizeFriendPoolEntries, prune: pruneExpiredFriendPoolEntries, ttl: FRIEND_ENTRY_TTL_MS })`, { crypto: { randomUUID } });
const day = 24 * 60 * 60 * 1000;
const reset = Date.UTC(2026, 8, 1);
const entry = { id: "entry", userId: "player", displayName: "Player", gameId: "123,456,789", createdAt: reset, updatedAt: reset, expiresAt: reset + 14 * day };
assert.equal(ttl, 30 * day);
const state = { friendPool: [entry] };
assert.equal(prune(state, reset + 10 * day), true);
assert.equal(state.friendPool[0].expiresAt, reset + 30 * day);
assert.equal(prune(state, reset + 10 * day), false, "migration must be idempotent");
assert.equal(sanitize(state.friendPool, reset + 29 * day).length, 1);
assert.equal(sanitize(state.friendPool, reset + 30 * day).length, 0, "expire at exact boundary");
const renewed = { ...entry, updatedAt: reset + 20 * day, expiresAt: reset + 50 * day };
assert.equal(sanitize([renewed], reset + 49 * day).length, 1);
assert.equal(sanitize([renewed], reset + 50 * day).length, 0);
assert.equal(sanitize([{ ...entry, expiresAt: "invalid" }], reset).length, 0);
assert.equal(sanitize([renewed, entry], reset + 21 * day).length, 1, "deduplicate a user's resets");
console.log(JSON.stringify({ ok: true, checks: 9, ttlDays: ttl / day }));
