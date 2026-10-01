import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/routes/ka.ts", import.meta.url), "utf8");
const helperStart = source.indexOf("type AccountPlayerProfile =");
const helperEnd = source.indexOf("function accountRequestFromWebsite", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const helperCode = ts.transpileModule(source.slice(helperStart, helperEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const helpers = runInNewContext(`${helperCode}\n({ validate: isAccountPlayerProfile, envelope: readAccountPlayerProfileEnvelope })`);
const valid = { version: 1, equipment: { Sword: 99 }, characters: [{ id: "c1", jobName: "Hero", rank: "S", statLevels: { strength: 999 } }], valuables: { water: 3 } };
assert.equal(helpers.validate(valid), true);
assert.equal(helpers.validate({ ...valid, version: 2 }), false);
assert.equal(helpers.validate({ ...valid, equipment: { Sword: 100 } }), false);
assert.equal(helpers.validate({ ...valid, valuables: { water: -1 } }), false);
assert.equal(helpers.validate({ ...valid, characters: [{ ...valid.characters[0], statLevels: { strength: 1000 } }] }), false);
assert.equal(helpers.validate({ ...valid, characters: [valid.characters[0], valid.characters[0]] }), false);
assert.equal(helpers.envelope({ revision: "r1", profile: valid }).revision, "r1");
assert.equal(helpers.envelope({ revision: null, profile: valid }), null);

const getStart = source.indexOf('router.get("/ka/account-player-profile"');
const putStart = source.indexOf('router.put("/ka/account-player-profile"', getStart);
const routeEnd = source.indexOf('router.get("/ka/account-rosters"', putStart);
assert.ok(getStart >= 0 && putStart > getStart && routeEnd > putStart);
const routeSource = source.slice(getStart, routeEnd);
const registrations = new Map();
const table = { key: "key", value: "value", updatedAt: "updatedAt" };
const records = new Map();
let userId;
let revisionNumber = 0;
const eq = (column, value) => ({ kind: "eq", column, value });
const and = (...conditions) => ({ kind: "and", conditions });
const sql = (_strings, ...values) => ({ kind: "revision", revision: values[1] });
const db = {
  select: () => ({ from: () => ({ where: (condition) => ({ limit: async () => {
    const keyCondition = condition.kind === "eq" ? condition : condition.conditions.find((item) => item.kind === "eq");
    const value = records.get(keyCondition.value);
    return value ? [{ value }] : [];
  } }) }) }),
  insert: () => ({ values: (row) => ({ onConflictDoNothing: () => ({ returning: async () => {
    if (records.has(row.key)) return [];
    records.set(row.key, row.value);
    return [{ key: row.key }];
  } }) }) }),
  update: () => ({ set: (row) => ({ where: (condition) => ({ returning: async () => {
    const keyCondition = condition.conditions.find((item) => item.kind === "eq");
    const revisionCondition = condition.conditions.find((item) => item.kind === "revision");
    const current = records.get(keyCondition.value);
    if (!current || current.revision !== revisionCondition.revision) return [];
    records.set(keyCondition.value, row.value);
    return [{ key: keyCondition.value }];
  } }) }) }),
};
const router = {
  get: (path, handler) => registrations.set(`GET ${path}`, handler),
  put: (path, handler) => registrations.set(`PUT ${path}`, handler),
};
const routeCode = ts.transpileModule(routeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
await runInNewContext(`(async () => { ${routeCode} })()`, {
  router,
  dbModule: { db, appStateTable: table },
  resolveAuthenticatedSession: async () => userId ? { userId } : undefined,
  accountRequestFromWebsite: () => true,
  isRecord: (value) => Boolean(value && typeof value === "object" && !Array.isArray(value)),
  isAccountPlayerProfile: helpers.validate,
  readAccountPlayerProfileEnvelope: helpers.envelope,
  ACCOUNT_PLAYER_PROFILE_PREFIX: "ka_account_player_profile_v1:",
  ACCOUNT_PLAYER_PROFILE_MAX_BYTES: 256 * 1024,
  crypto: { randomUUID: () => `r${++revisionNumber}` },
  Buffer,
  console,
  and,
  eq,
  sql,
  Date,
});
const response = () => ({ statusCode: 200, headers: {}, body: undefined,
  setHeader(name, value) { this.headers[name] = value; return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const invoke = async (method, asUser, body = {}) => {
  userId = asUser;
  const res = response();
  await registrations.get(`${method} /ka/account-player-profile`)({ body: { expectedAccountId: asUser, ...body }, get: () => "same-origin" }, res);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  return res;
};
assert.equal((await invoke("GET", undefined)).statusCode, 401);
assert.equal((await invoke("PUT", "u2", { profile: valid, revision: null, expectedAccountId: "u1" })).statusCode, 403);
assert.equal(records.has("ka_account_player_profile_v1:u2"), false);
assert.equal((await invoke("PUT", "u1", { expectedAccountId: "u1", profile: valid })).statusCode, 400);
assert.equal((await invoke("PUT", "u1", { expectedAccountId: "wrong-user", profile: valid, revision: null })).statusCode, 403);
const first = await invoke("PUT", "u1", { expectedAccountId: "u1", profile: valid, revision: null });
assert.equal(first.statusCode, 200);
assert.equal(first.body.accountId, "u1");
const duplicateInitial = await invoke("PUT", "u1", { expectedAccountId: "u1", profile: valid, revision: null });
assert.equal(duplicateInitial.statusCode, 409);
assert.equal(duplicateInitial.body.revision, first.body.revision);
const stale = await invoke("PUT", "u1", { expectedAccountId: "u1", profile: valid, revision: "stale" });
assert.equal(stale.statusCode, 409);
assert.equal(stale.body.revision, first.body.revision);
const updated = await invoke("PUT", "u1", { expectedAccountId: "u1", profile: { ...valid, valuables: { water: 4 } }, revision: first.body.revision });
assert.equal(updated.statusCode, 200);
assert.notEqual(updated.body.revision, first.body.revision);
assert.equal(records.get("ka_account_player_profile_v1:u1").profile.valuables.water, 4);
const isolated = (await invoke("GET", "u2")).body;
assert.equal(isolated.profile, null);
assert.equal(isolated.revision, null);
assert.equal(records.has("ka_account_player_profile_v1:u2"), false);

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
assert.match(source, /const ACCOUNT_PLAYER_PROFILE_MAX_BYTES = 256 \* 1024/);
assert.match(routeSource, /accountRequestFromWebsite\(req\)/);
assert.match(appSource, /\["\/api\/ka\/account-player-profile", "\/ka-api\/ka\/account-player-profile"\], express\.json\(\{ limit: "256kb" \}\)\);\s*app\.use\(express\.json\(\)\)/);
console.log(JSON.stringify({ ok: true, profileValidationCases: 8, handlerScenarios: 10, parserAndGuards: 2 }));
