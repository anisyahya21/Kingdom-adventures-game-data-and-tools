import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { assetVersion, STATIC_DIRECTORIES, versionStaticAssets } from './version-static-assets.mjs';

function execute(file, globals = {}) {
  const source = readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, ...globals });
  return exports;
}
const { createResourceCache } = execute('src/lib/resource-cache.ts');
let loads = 0;
const cached = createResourceCache(2);
const load = async () => ++loads;
assert.deepEqual(await Promise.all([cached('a', load), cached('a', load)]), [1, 1]);
await cached('b', load); await cached('c', load); await cached('a', load);
assert.equal(loads, 4, 'entry bound evicts oldest resource');
await assert.rejects(cached('failure', async () => { throw Error('offline'); }));
assert.equal(await cached('failure', async () => 'recovered'), 'recovered');
const optional = createResourceCache(4, value => value.status === 404 || value.status === 200);
let optionalLoads = 0;
await optional('missing', async () => { optionalLoads++; return {status:404}; });
await optional('missing', async () => { optionalLoads++; return {status:404}; });
assert.equal(optionalLoads, 1, 'confirmed static misses are reused');
await optional('temporary', async () => ({status:503}));
assert.equal((await optional('temporary', async () => ({status:200}))).status, 200, 'temporary HTTP failures can retry');

let fetches = 0, complete;
const { requestSession } = execute('src/lib/session-request.ts', {
  fetch: (_url, options) => {
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'include');
    fetches++; return new Promise(resolve => { complete = resolve; });
  },
});
const a = requestSession('/session'), b = requestSession('/session');
assert.equal(fetches, 1);
complete(new Response(JSON.stringify({ authenticated: true })));
const responses = await Promise.all([a, b]);
assert.equal((await responses[0].json()).authenticated, true);
assert.equal((await responses[1].json()).authenticated, true, 'bodies are independently readable');
const fresh = requestSession('/session');
assert.equal(fetches, 2, 'completed sessions are not cached');
complete(new Response(JSON.stringify({ authenticated: false })));
assert.equal((await (await fresh).json()).authenticated, false);

const fixture = mkdtempSync(path.join(tmpdir(), 'ka-version-check-'));
try {
  for (const dir of STATIC_DIRECTORIES) {
    mkdirSync(path.join(fixture, dir)); writeFileSync(path.join(fixture, dir, 'a.png'), 'original');
  }
  const first = await assetVersion(fixture);
  assert.equal(await assetVersion(fixture), first);
  writeFileSync(path.join(fixture, 'world-assets/a.png'), 'updated');
  assert.notEqual(await assetVersion(fixture), first, 'asset edits change URL version');
  const plugin = versionStaticAssets();
  plugin.configResolved({publicDir: fixture, root: fixture, build:{outDir:'out'}});
  await plugin.buildStart();
  const result = plugin.renderChunk('const a="/world-assets/a.png",b="/ka-api/auth/session",c=`${base}website_icons/a.png`;');
  assert.match(result.code, /\/static-v\/[a-f0-9]+\/world-assets\/a.png/);
  assert.match(result.code, /\$\{base\}static-v\/[a-f0-9]+\/website_icons/);
  assert.ok(result.code.includes('/ka-api/auth/session'));
  await plugin.closeBundle();
} finally { rmSync(fixture, { recursive: true, force: true }); }
console.log(JSON.stringify({ outcome:'PASS', checks:['bounded map reuse','failed-load retry','concurrent session deduplication','fresh later sessions','content version changes','static URL transformation and copying','API URLs untouched'] }));
