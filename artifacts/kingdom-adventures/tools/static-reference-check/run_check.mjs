import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { build } = createRequire(pathToFileURL(join(app, "../api-server/package.json")))("esbuild");
const scratch = await mkdtemp(join(tmpdir(), "ka-static-reference-"));
try {
  await build({ entryPoints: [join(app, "src/lib/local-shared-data.ts")], bundle: true,
    platform: "node", format: "esm", outfile: join(scratch, "shared.mjs"), tsconfig: join(app, "tsconfig.json") });
  const { loadSharedReferenceData, fetchSharedWithFallback } = await import(pathToFileURL(join(scratch, "shared.mjs")));
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests++; throw new Error("Reference must not request the backend"); };
  try {
    const reference = await loadSharedReferenceData();
    assert.ok(Object.keys(reference.jobs).length > 0);
    assert.ok(Object.keys(reference.skills).length > 0);
    assert.ok(reference.pairs.length > 0);
    reference.jobs.__testMutation = {};
    assert.equal((await loadSharedReferenceData()).jobs.__testMutation, undefined, "readers must not mutate the published catalog");
    assert.equal(requests, 0, "static reference must make zero fetch calls");
    // A staggered deployment may still return the legacy full response. Consume only workspace state.
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ loadouts: [{ id: "saved-character" }], loadoutsUpdatedAt: 123,
      loadoutBoxSetups: [{ id: "saved-setup" }], loadoutBoxSetupsUpdatedAt: 456, overrides: { bogus: {} }, skills: { bogus: {} } }) });
    const workspace = await fetchSharedWithFallback("/ka-api/ka/shared?scope=workspace");
    assert.equal(workspace.loadouts[0].id, "saved-character");
    assert.equal(workspace.loadoutBoxSetups[0].id, "saved-setup");
    assert.equal(workspace.overrides.bogus, undefined, "workspace response must not replace static game data");
    assert.equal(workspace.skills.bogus, undefined);
  } finally { globalThis.fetch = originalFetch; }
  // Exercise the actual server cache startup/read path: no outgoing request or repeating timer.
  await build({ entryPoints: [join(app, "../api-server/src/lib/google-cache.ts")], bundle: true,
    platform: "node", format: "esm", outfile: join(scratch, "google-cache.mjs"), loader: { ".txt": "text" }, plugins: [{
      name: "quiet-test-logger", setup(b) {
        b.onResolve({ filter: /^\.\/logger$/ }, () => ({ path: "logger", namespace: "test-logger" }));
        b.onLoad({ filter: /.*/, namespace: "test-logger" }, () => ({ contents: "export const logger = {info(){},warn(){},error(){}};", loader: "js" }));
      }
    }] });
  const savedCwd = process.cwd(), savedFetch = globalThis.fetch, savedInterval = globalThis.setInterval;
  let serverFetches = 0, gameTimers = 0;
  try {
    process.chdir(scratch);
    globalThis.fetch = async () => { serverFetches++; throw new Error("Static game data must not fetch Google"); };
    globalThis.setInterval = () => { gameTimers++; return { unref() {} }; };
    const serverCache = await import(pathToFileURL(join(scratch, "google-cache.mjs")));
    for (const key of Object.keys(serverCache.STATIC_SOURCES)) assert.ok(serverCache.getCachedContent(key), "server snapshot missing: " + key);
    assert.equal(serverFetches, 0);
    assert.equal(gameTimers, 0);
  } finally {
    process.chdir(savedCwd); globalThis.fetch = savedFetch; globalThis.setInterval = savedInterval;
  }
  const sheets = {};
  for (const name of ["equipment", "shops-items", "eggs", "weekly-conquest-lookup", "weekly-conquest-schedule"]) {
    const raw = await readFile(join(app, "../api-server/data/google-cache", name + ".txt"), "utf8");
    const parsed = JSON.parse(raw.slice(raw.indexOf("setResponse(") + 12).trim().replace(/\);?$/, ""));
    assert.equal(parsed.status, "ok");
    assert.ok(parsed.table.rows.length > 0);
    sheets[name] = parsed.table.rows.length;
  }
  const dist = await readdir(join(app, "dist/public/assets"));
  for (const name of Object.keys(sheets)) assert.ok(dist.some(file => file.startsWith(name + "-") && file.endsWith(".txt")), "fingerprinted static sheet missing: " + name);
  console.log(JSON.stringify({ ok: true, staticReferenceFetches: requests, serverGameDataFetches: serverFetches, serverGameDataTimers: gameTimers, isolatedReaderCopies: true, workspacePreserved: true, workspaceCannotOverrideGameData: true, sheets }, null, 2));
} finally {
  assert.equal(dirname(scratch), resolve(tmpdir()));
  assert.ok(scratch.split(/[\\/]/).at(-1).startsWith("ka-static-reference-"));
  await rm(scratch, { recursive: true });
}
