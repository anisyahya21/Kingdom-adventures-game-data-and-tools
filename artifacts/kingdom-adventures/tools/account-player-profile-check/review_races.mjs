import { AccountPlayerProfileSyncController, PROFILE_SYNC_STORAGE_KEYS } from "../../src/lib/account-player-profile/sync-core.ts";

const failures = [];
const checks = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, pass, actual, expected });
  if (!pass) failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

function profile(label) {
  return {
    version: 1,
    equipment: { [label]: 1 },
    characters: [{ id: label, jobName: "Fighter", rank: "F", statLevels: { hp: 1 } }],
    valuables: {},
  };
}

function emptyProfile() {
  return { version: 1, equipment: {}, characters: [], valuables: {} };
}

function harness({ initial = profile("legacy"), accountId = "account-a", remote = null, remoteByAccount, storage = new Map(), failStorageWrites = false, readImpl, writeImpl } = {}) {
  let activeAccountId = accountId;
  let scope = null;
  const localByScope = new Map([[null, structuredClone(initial)]]);
  let localListener = () => {};
  const timers = [];
  const writes = [];
  const reads = [];
  let activeWrites = 0;
  let maximumActiveWrites = 0;
  const store = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { if (failStorageWrites) throw new Error("quota exceeded"); storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  };
  const deps = {
    storage: store,
    readLocal: () => structuredClone(localByScope.get(scope) ?? emptyProfile()),
    writeLocal(value) { localByScope.set(scope, structuredClone(value)); },
    setScope(account) { scope = account; if (!localByScope.has(scope)) localByScope.set(scope, emptyProfile()); },
    sanitize(value) { return structuredClone(value); },
    getSession: async () => activeAccountId ? { accountId: activeAccountId } : null,
    api: {
      async read() {
        const index = reads.length;
        reads.push(index);
        return readImpl ? readImpl(index) : structuredClone(remoteByAccount?.[activeAccountId] ?? remote ?? { profile: null, revision: null, accountId: activeAccountId });
      },
      async write(value, revision, expectedAccountId) {
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
        const entry = { profile: structuredClone(value), revision, expectedAccountId };
        writes.push(entry);
        try {
          if (writeImpl) return await writeImpl(entry, writes.length - 1);
          return { kind: "saved", revision: `revision-${writes.length}`, accountId: expectedAccountId };
        } finally {
          activeWrites -= 1;
        }
      },
    },
    listenLocalChanges(listener) { localListener = listener; return () => { localListener = () => {}; }; },
    schedule(callback, delayMs) {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel(timer) { timer.cancelled = true; },
  };
  const controller = new AccountPlayerProfileSyncController(deps);
  return {
    controller, writes, reads, timers, get local() { return structuredClone(localByScope.get(scope) ?? emptyProfile()); }, get scope() { return scope; },
    get maximumActiveWrites() { return maximumActiveWrites; },
    externalEdit(value) { localByScope.set(scope, structuredClone(value)); localListener(); },
    setAccountId(value) { activeAccountId = value; },
    async runTimer() {
      const timer = timers.find((entry) => !entry.cancelled && !entry.ran);
      if (!timer) throw new Error("No pending timer to run");
      timer.ran = true;
      timer.callback();
      await flush();
    },
  };
}

async function authenticatedEmptyDoesNotUpload() {
  const test = harness({ initial: emptyProfile(), accountId: "empty-account", remote: { profile: null, revision: null, accountId: "empty-account" } });
  await test.controller.refresh(true);
  await flush();
  check("empty authoritative account does not write back", test.writes.length, 0);
  check("empty account copy is active", test.local, emptyProfile());
}

async function laterMobileRemoteLoadsAfterEmptyBootstrap() {
  const mobile = profile("mobile-later");
  const test = harness({
    initial: emptyProfile(),
    accountId: "mobile-later-account",
    readImpl: (index) => Promise.resolve(index === 0
      ? { profile: null, revision: null, accountId: "mobile-later-account" }
      : { profile: mobile, revision: "mobile-r1", accountId: "mobile-later-account" }),
  });
  await test.controller.refresh(true);
  await test.controller.refresh(true);
  check("later mobile remote profile replaces empty bootstrap copy", test.local, mobile);
  check("later mobile remote load does not conflict", test.controller.getSnapshot().conflict, null);
  check("later mobile remote load does not upload back", test.writes.length, 0);
}

async function uncertainInitialCacheEqualToRemoteIsNotConflict() {
  const same = profile("same-first-save");
  const storage = new Map();
  storage.set(`${PROFILE_SYNC_STORAGE_KEYS.accountCachePrefix}uncertain-account`, JSON.stringify({ profile: same, baseProfile: null, revision: null }));
  const test = harness({
    initial: emptyProfile(),
    accountId: "uncertain-account",
    remote: { profile: same, revision: "server-r1", accountId: "uncertain-account" },
    storage,
  });
  await test.controller.refresh(true);
  check("uncertain first-save cache matching remote is not a conflict", test.controller.getSnapshot().conflict, null);
  check("matching remote becomes active", test.local, same);
  check("matching remote cache does not trigger duplicate PUT", test.writes.length, 0);
}

async function noOpEditAfterEmptyBootstrapDoesNotUpload() {
  const test = harness({ initial: emptyProfile(), accountId: "no-op-account", remote: { profile: null, revision: null, accountId: "no-op-account" } });
  test.controller.start();
  await flush();
  test.externalEdit(emptyProfile());
  await flush();
  check("no-op edit does not queue a debounce timer", test.timers.filter((entry) => !entry.cancelled && !entry.ran).length, 0);
  check("no-op edit after empty remote bootstrap does not upload", test.writes.length, 0);
  test.controller.stop();
}

async function legacyImportUploadsNonempty() {
  const legacy = profile("legacy-mobile");
  const test = harness({ initial: legacy, accountId: "mobile-account", remote: { profile: null, revision: null, accountId: "mobile-account" } });
  await test.controller.refresh(true);
  await flush();
  check("legacy profile is uploaded", test.writes.length, 1);
  check("legacy PUT is bound to signed-in account", test.writes[0]?.expectedAccountId, "mobile-account");
  check("legacy payload is preserved", test.writes[0]?.profile, legacy);
}

async function firstLegacyMigrationSurvivesStorageQuota() {
  const legacy = profile("legacy-quota");
  const test = harness({ initial: legacy, accountId: "quota-account", remote: { profile: null, revision: null, accountId: "quota-account" }, failStorageWrites: true });
  await test.controller.refresh(true);
  await flush();
  check("legacy migration with quota failure keeps nonempty local data", test.local, legacy);
  check("legacy migration with quota failure still uploads", test.writes.length, 1);
  check("quota failure upload has correct account binding", test.writes[0]?.expectedAccountId, "quota-account");
}

async function cachedOtherAccountUsesExpectedId() {
  const accountProfile = profile("account-b-cache");
  const storage = new Map();
  storage.set(`${PROFILE_SYNC_STORAGE_KEYS.accountCachePrefix}account-b`, JSON.stringify({ profile: accountProfile, baseProfile: null, revision: null }));
  storage.set(PROFILE_SYNC_STORAGE_KEYS.legacyBackup, JSON.stringify(profile("account-a-legacy")));
  storage.set(PROFILE_SYNC_STORAGE_KEYS.legacyOwner, "account-a");
  const test = harness({ initial: profile("device-original"), accountId: "account-b", remote: { profile: null, revision: null, accountId: "account-b" }, storage });
  await test.controller.refresh(true);
  await flush();
  check("cached second-account profile uploads", test.writes.length, 1);
  check("cached profile PUT carries second account id", test.writes[0]?.expectedAccountId, "account-b");
  check("other account legacy backup is not substituted", test.writes[0]?.profile, accountProfile);
}

async function writesSerializeAndCatchUpLatest() {
  const base = profile("base");
  const firstWrite = deferred();
  const test = harness({
    initial: base,
    accountId: "serialized-account",
    remote: { profile: base, revision: "r0", accountId: "serialized-account" },
    writeImpl: (_entry, index) => index === 0 ? firstWrite.promise : Promise.resolve({ kind: "saved", revision: "r2", accountId: "serialized-account" }),
  });
  test.controller.start();
  await flush();
  test.externalEdit(profile("edit-one"));
  await test.runTimer();
  check("first PUT started", test.writes.length, 1);
  test.externalEdit(profile("edit-two"));
  await test.runTimer();
  check("second edit does not start overlapping PUT", test.writes.length, 1);
  check("only one PUT is in flight", test.maximumActiveWrites, 1);
  firstWrite.resolve({ kind: "saved", revision: "r1", accountId: "serialized-account" });
  await flush();
  check("latest edit is eventually sent after first PUT resolves", test.writes.at(-1)?.profile, profile("edit-two"));
  check("follow-up PUT carries the returned revision", test.writes.at(-1)?.revision, "r1");
  test.controller.stop();
}

async function cacheQuotaStillQueuesLatestEdit() {
  const base = profile("quota-base");
  const firstWrite = deferred();
  const test = harness({
    initial: base,
    accountId: "cache-quota-account",
    remote: { profile: base, revision: "q0", accountId: "cache-quota-account" },
    failStorageWrites: true,
    writeImpl: (_entry, index) => index === 0 ? firstWrite.promise : Promise.resolve({ kind: "saved", revision: `q${index + 1}`, accountId: "cache-quota-account" }),
  });
  test.controller.start();
  await flush();
  test.externalEdit(profile("quota-edit-one"));
  await test.runTimer();
  test.externalEdit(profile("quota-edit-two"));
  await test.runTimer();
  firstWrite.resolve({ kind: "saved", revision: "q1", accountId: "cache-quota-account" });
  await flush();
  check("storage quota does not lose queued newest edit", test.writes.at(-1)?.profile, profile("quota-edit-two"));
  check("storage quota preserves returned write revision for queued latest", test.writes.at(-1)?.revision, "q1");
  test.controller.stop();
}

async function accountSwitchDuringWriteKeepsScopesSeparate() {
  const accountA = profile("account-a-remote");
  const accountB = profile("account-b-remote");
  const firstWrite = deferred();
  const test = harness({
    initial: emptyProfile(),
    accountId: "account-a",
    remoteByAccount: {
      "account-a": { profile: accountA, revision: "a0", accountId: "account-a" },
      "account-b": { profile: accountB, revision: "b0", accountId: "account-b" },
    },
    writeImpl: (_entry, index) => index === 0 ? firstWrite.promise : Promise.resolve({ kind: "saved", revision: "b1", accountId: "account-b" }),
  });
  test.controller.start();
  await flush();
  test.externalEdit(profile("account-a-pending-edit"));
  await test.runTimer();
  test.setAccountId("account-b");
  test.controller.invalidateForAuthChange();
  await test.controller.refresh(true);
  check("switch enters account B scope", test.scope, "account-b");
  check("account B profile is shown before account A write settles", test.local, accountB);
  firstWrite.reject(new Error("old account write failed"));
  await flush();
  check("stale account A failure does not contaminate B local profile", test.local, accountB);
  test.externalEdit(profile("account-b-new-edit"));
  await test.runTimer();
  check("B remains writable after stale A failure", test.writes.at(-1)?.expectedAccountId, "account-b");
  check("B latest edit remains in B scope", test.local, profile("account-b-new-edit"));
  test.controller.stop();
}

async function oldGetCannotOverwriteNewerGet() {
  const oldRead = deferred();
  const newRead = deferred();
  const test = harness({
    initial: profile("device"),
    accountId: "refresh-account",
    readImpl: (index) => index === 0 ? oldRead.promise : newRead.promise,
  });
  const oldRefresh = test.controller.refresh(true);
  await flush();
  const newRefresh = test.controller.refresh(true);
  await flush();
  check("both same-account reads started", test.reads.length, 2);
  newRead.resolve({ profile: profile("newer"), revision: "r-new", accountId: "refresh-account" });
  await newRefresh;
  oldRead.resolve({ profile: profile("older"), revision: "r-old", accountId: "refresh-account" });
  await oldRefresh;
  check("late older GET cannot replace newest profile", test.local, profile("newer"));
}

await authenticatedEmptyDoesNotUpload();
await laterMobileRemoteLoadsAfterEmptyBootstrap();
await uncertainInitialCacheEqualToRemoteIsNotConflict();
await noOpEditAfterEmptyBootstrapDoesNotUpload();
await legacyImportUploadsNonempty();
await firstLegacyMigrationSurvivesStorageQuota();
await cachedOtherAccountUsesExpectedId();
await writesSerializeAndCatchUpLatest();
await cacheQuotaStillQueuesLatestEdit();
await accountSwitchDuringWriteKeepsScopesSeparate();
await oldGetCannotOverwriteNewerGet();

for (const result of checks) console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`All ${checks.length} account profile sync race checks passed.`);
}
