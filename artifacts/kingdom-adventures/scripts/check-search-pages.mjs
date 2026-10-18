import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getSeoMeta, SITE_URL, encodeCanonicalPath } from "../src/app/seo.ts";
import { ROUTE_ALIASES, isIndexablePage } from "../src/app/seo-policy.ts";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(app, "dist/public");
const reports = path.resolve(app, "../../docs/seo-validation");
await mkdir(reports, { recursive: true });
const config = JSON.parse(await readFile(path.join(app, "vercel.json"), "utf8"));
const checks = [];
const check = (label, operation) => { operation(); checks.push(label); };
const progress = async label => writeFile(path.join(reports, "browser-progress.json"), JSON.stringify({ label, completed: checks.length, elapsed: Date.now()-start }));
const start = Date.now();
let browser, server, page;
const pageErrors = [];
try {
  // Exhaustively check initial HTML and sitemap against the real route policy.
  const rewritePages = config.rewrites.filter(r => r.destination.startsWith("/_search") && !r.source.includes(":"));
  for (const rule of [{ source: "/", destination: "/index.html" }, ...rewritePages]) {
    const html = await readFile(path.join(output, rule.destination), "utf8");
    const pathname = decodeURIComponent(rule.source);
    const canonical = `${SITE_URL}${encodeCanonicalPath(getSeoMeta(pathname).canonicalPath)}`;
    check(`initial HTML ${rule.source}`, () => {
      assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
      assert.ok(html.includes(`href="${canonical}"`), `Wrong canonical ${rule.source}`);
      assert.ok(html.includes('data-search-summary'));
      const heading = html.match(/<h1>(.*?)<\/h1>/)?.[1].replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
      assert.equal(heading, getSeoMeta(pathname).title);
      assert.ok(html.includes(`content="${isIndexablePage(pathname) ? "index, follow" : "noindex, follow"}"`));
    });
  }
  const sitemap = await readFile(path.join(output, "sitemap.xml"), "utf8");
  const entries = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
  check("sitemap canonical unique indexable destinations", () => {
    assert.equal(new Set(entries).size, entries.length);
    for (const entry of entries) {
      assert.ok(!ROUTE_ALIASES[decodeURIComponent(entry)]);
      assert.ok(isIndexablePage(entry));
      assert.ok(entry === "/" || rewritePages.some(r => r.source === entry));
    }
    for (const expected of ["/research", "/world-builder", "/briefing-room", "/item-sources", "/guides/stat-effects", "/monster-pet-stats", "/survey"]) assert.ok(entries.includes(expected));
    assert.ok(!sitemap.includes("<lastmod>"), "No invented lastmod timestamps");
  });
  assert.match(await readFile(path.join(output, "sitemap_index.xml"), "utf8"), /<sitemapindex/);
  checks.push("sitemap index has correct root");

  // Local routing simulator: validates app behavior. Vercel status/encoding still
  // needs an independent deployed HTTP check before production release.
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname).replace(/\/$/, "") || "/";
      if (ROUTE_ALIASES[pathname]) {
        res.writeHead(308, { Location: ROUTE_ALIASES[pathname] + url.search }); return res.end();
      }
      if (/^\/(ka-api|api)\//.test(pathname)) {
        res.writeHead(503, { "content-type":"application/json" });return res.end('{"error":"Local regression check uses bundled reference data"}');
      }
      let target = path.resolve(output, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!target.startsWith(output + path.sep) && target !== output) { res.writeHead(403);return res.end(); }
      let exists = await stat(target).then(s => s.isFile()).catch(() => false);
      if (!exists) {
        const rule = config.rewrites.find(r => !r.source.includes(":") && decodeURIComponent(r.source) === pathname);
        if (rule) target = path.join(output, rule.destination);
        else if (/^\/guides\/[^/]+$/.test(pathname)) target = path.join(output, "_search/community-guide.html");
        else { res.statusCode = 404;target = path.join(output, "404.html"); }
      }
      const contentTypes = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.xml':'application/xml'};
      res.setHeader("Content-Type", contentTypes[path.extname(target)] ?? "application/octet-stream");
      res.end(await readFile(target));
    } catch { res.writeHead(500);res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return route.abort();
    // Explicit empty successful response distinguishes a nonexistent community
    // guide from a transient API failure. No write requests reach a backend.
    if (u.pathname === '/ka-api/ka/guides') return route.fulfill({ json: { guides: [] } });
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => !document.querySelector('[data-search-summary]') && document.querySelector('h1'));
  const profile = JSON.stringify({ version:1, equipment:{'Wooden Stick':7},characters:[],valuables:{} });
  await page.evaluate(profile => {
    localStorage.setItem('ka_player_profile_v1', profile);
    localStorage.setItem('ka_note_monsters', 'SEO regression note');
  }, profile);

  await progress('Checking redirected monster filter');
  await page.goto(base+'/monsters?monster=Skullene#loot');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(e => e.value==='Skullene'));
  check('monster alias preserves query and fragment', () => {
    const u=new URL(page.url());assert.equal(u.pathname,'/monster-spawns');assert.equal(u.searchParams.get('monster'),'Skullene');assert.equal(u.hash,'#loot');
  });
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), SITE_URL+'/monster-spawns');

  await progress('Checking facilities filtered link');
  await page.goto(base+'/houses?tab=facilities&search=Tool%20Workshop');
  await page.getByPlaceholder('Search buildings...').waitFor();
  assert.equal(await page.getByPlaceholder('Search buildings...').inputValue(), 'Tool Workshop');
  await page.getByRole('button', { name:/Facilities Town facilities/ }).waitFor();
  checks.push('houses facilities tab and search query survive');
  await page.screenshot({ path:path.join(reports,'houses-mobile.png'), fullPage:false });

  await progress('Checking encoded job path');
  await page.goto(base+'/jobs/Beast%20Tamer');
  await page.waitForFunction(() => !document.querySelector('[data-search-summary]') && document.querySelector('main')?.textContent?.includes('Beast Tamer'));
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), SITE_URL+'/jobs/Beast%20Tamer');
  checks.push('job name with spaces renders with encoded canonical');

  await progress('Checking survey alias');
  await page.goto(base+'/survey-planner?search=retained');
  await page.waitForFunction(() => !document.querySelector('[data-search-summary]') && document.querySelector('h1'));
  assert.equal(new URL(page.url()).pathname,'/survey');
  assert.equal(new URL(page.url()).searchParams.get('search'),'retained');
  checks.push('survey alias retains query and renders');

  await progress('Checking unknown routes and robots recovery');
  assert.equal((await page.goto(base+'/seo-check-missing-page')).status(),404);
  await page.getByRole('heading',{ name:'404 Page Not Found' }).waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, follow');
  // Exercise actual SPA navigation from the error page back to an indexable page.
  await page.getByRole('link',{name:'Browse the tools and guides'}).click();
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content==='index, follow');
  checks.push('unknown route is 404 and navigation restores indexing');

  await page.goto(base+'/guides/seo-check-nonexistent-guide');
  await page.getByText('Guide not found.',{exact:true}).waitFor();
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content==='noindex, follow');
  await page.getByRole('link',{name:'Back to Guides'}).click();
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content==='index, follow');
  checks.push('missing runtime guide is noindex and valid navigation restores indexing');

  await progress('Checking profile and saved data');
  await page.goto(base+'/player-profile');
  await page.waitForFunction(() => !document.querySelector('[data-search-summary]') && document.querySelector('h1'));
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, follow');
  const stored = await page.evaluate(() => ({profile:localStorage.getItem('ka_player_profile_v1'),note:localStorage.getItem('ka_note_monsters')}));
  assert.equal(stored.profile,profile);
  assert.equal(stored.note,'SEO regression note');
  checks.push('saved profile and personal notes preserved across routes');
  assert.deepEqual(pageErrors,[]);
  checks.push('no uncaught JavaScript errors in tested flows');
  await writeFile(path.join(reports,'search-checks.json'),JSON.stringify({passed:true,checks,sitemapPages:entries.length,elapsedSeconds:(Date.now()-start)/1000,scope:'Local routing simulation and isolated Chrome; API failures deliberately use bundled fallback. Deployment routing needs independent verification.'},null,2));
  console.log(`${checks.length} checks passed; ${entries.length} sitemap destinations`);
} catch (error) {
  if(page) await page.screenshot({path:path.join(reports,'failure.png')}).catch(()=>{});
  await writeFile(path.join(reports,'search-checks.json'),JSON.stringify({passed:false,completed:checks.length,lastChecks:checks.slice(-5),pageErrors,body:page ? (await page.locator('body').innerText().catch(()=>'' )).slice(0,4000) : '',error:error.stack},null,2));
  throw error;
} finally {
  await browser?.close();
  if(server) await new Promise(resolve => server.close(resolve));
}
