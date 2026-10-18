import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { SITE_URL } from "../src/app/seo.ts";

const base = new URL(process.argv[2]);
assert.equal(base.protocol,"https:");
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output = path.resolve(app,"../../docs/seo-validation");
const cases = [
  {path:"/",canonical:"/",rendered:true},
  {path:"/jobs",canonical:"/jobs",rendered:true},
  {path:"/jobs/Beast%20Tamer",canonical:"/jobs/Beast%20Tamer",rendered:true},
  {path:"/houses?tab=facilities&search=Tool%20Workshop",canonical:"/houses",rendered:true},
  {path:"/monster-pet-stats",canonical:"/monster-pet-stats",rendered:true,help:true},
  {path:"/monster-xp",canonical:"/monster-xp",rendered:true,help:true},
  {path:"/monsters?monster=Skullene",status:308,redirect:"/monster-spawns?monster=Skullene"},
  {path:"/survey-planner?search=retained",status:308,redirect:"/survey?search=retained"},
  {path:"/skill",status:308,redirect:"/skills"},
  {path:"/loadout?share=preserved",status:308,redirect:"/combat?share=preserved"},
  {path:"/seo-check-missing-page",status:404},
  {path:"/jobs/SEO-check-nonexistent-job",status:404},
  {path:"/shops/seo-check-nonexistent-shop",status:404},
  {path:"/sitemap.xml",sitemap:true},
  {path:"/sitemap_index.xml",sitemapIndex:true},
  {path:"/player-profile",canonical:"/player-profile",noindex:true},
  {path:"/ka-api/auth/session",session:true},
  {path:"/browser-combat.zip",runtime:true},
];
const temp = await mkdtemp(path.join(tmpdir(),"ka-seo-http-"));
const run = promisify(execFile);
function zipManifest(bytes) {
  let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50) {
    const method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18);
    const nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8');
    const begin=offset+30+nameLength+extraLength;
    if(name==='browser-runtime-manifest.json') {
      const data=bytes.subarray(begin,begin+size);
      return JSON.parse((method===8 ? inflateRawSync(data) : data).toString('utf8'));
    }
    offset=begin+size;
  }
  throw Error('Browser runtime manifest missing');
}
const results = [];
const started = Date.now();
let next = 0;
try {
  await Promise.all(Array.from({length:4},async()=>{
    while(next<cases.length) {
      const index = next++;
      const item = cases[index];
      let status,location,body;
      if(process.env.VERCEL_CLI_JS) {
        const bodyFile = path.join(temp,`${index}.body`);
        const headersFile = path.join(temp,`${index}.headers`);
        await run(process.execPath,[process.env.VERCEL_CLI_JS,"curl",new URL(item.path,base).href,"--scope","anisyahya21s-projects","--","--silent","--show-error","--max-time","30","--output",bodyFile,"--dump-header",headersFile],{timeout:40000,maxBuffer:256000});
        const headers = await readFile(headersFile,"utf8");
        status = Number([...headers.matchAll(/^HTTP\/\S+ (\d+)/gm)].at(-1)?.[1]);
        location = headers.match(/^location:\s*(.*)$/im)?.[1].trim();
        body = await readFile(bodyFile);
      } else {
        const response = await fetch(new URL(item.path,base),{redirect:"manual",signal:AbortSignal.timeout(30000)});
        status = response.status;location = response.headers.get("location");body = Buffer.from(await response.arrayBuffer());
      }
      const result={path:item.path,status,bytes:body.length};
      try {
        assert.equal(status,item.status ?? 200);
        const html=body.toString("utf8");
        if(item.canonical) {
          assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
          assert.ok(html.includes(`href="${SITE_URL}${item.canonical}"`));
          result.canonical=item.canonical;
          assert.ok(!html.includes('data-search-summary'));
        }
        if(item.rendered) assert.ok(html.includes('data-prerendered-page='));
        if(item.help) {
          const details=html.match(/<details data-tool-help[^>]*>/)?.[0];
          assert.ok(details, 'Missing upfront help content');
          assert.doesNotMatch(details, /\bopen(?:=|\s|>)/);
          assert.ok(html.includes(item.path === '/monster-xp' ? 'The game chooses one non-zero exp stat' : 'The data comes from the mined'));
          result.collapsedHelpPresent=true;
        }
        if(item.noindex) assert.ok(html.includes('content="noindex, follow"'));
        if(item.redirect) {
          const target=new URL(location,base);
          assert.equal(target.pathname+target.search,item.redirect);
          result.redirect=item.redirect;
        }
        if(item.sitemap) {
          assert.match(html,/<urlset/);
          assert.equal((html.match(/<loc>/g)||[]).length,97);
          assert.ok(!html.includes(`${SITE_URL}/monsters</loc>`));
          assert.ok(html.includes(`${SITE_URL}/survey</loc>`));
        }
        if(item.sitemapIndex) assert.match(html,/<sitemapindex/);
        if(item.session) {const session=JSON.parse(html);assert.equal(session.authenticated,false);result.apiPassthrough=true;}
        if(item.runtime) {
          const local=await readFile(path.join(app,"dist/public/browser-combat.zip"));
          // Zip timestamps differ across machines; compare canonical manifests.
          assert.deepEqual(zipManifest(body),zipManifest(local));
          result.runtimeMatches=true;
        }
        result.passed=true;
      } catch(error) {result.passed=false;result.error=error.message;}
      results.push(result);
      console.log(`${results.length}/${cases.length} ${result.passed?'PASS':'FAIL'} ${item.path}`);
    }
  }));
  const report={base:base.origin,passed:results.every(r=>r.passed),elapsedSeconds:(Date.now()-started)/1000,results};
  await writeFile(path.join(output,base.origin===SITE_URL?'production-http.json':'preview-http.json'),JSON.stringify(report,null,2));
  assert.ok(report.passed,JSON.stringify(results.filter(r=>!r.passed)));
} finally {
  // Only delete the temporary directory created above, after checking its scope.
  assert.ok(path.resolve(temp).startsWith(path.join(path.resolve(tmpdir()),'ka-seo-http-')));
  await rm(temp,{recursive:true,force:true});
}
