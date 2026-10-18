/** Render the real anonymous app, not an SEO-only summary or crawler-only view. */
import { createServer } from "node:http";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/public");
const reportDir = path.join(root, "dist");
const config = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const shared = JSON.parse(await readFile(path.join(root, "../api-server/data/ka_shared.json"), "utf8"));
// Public reference data only. Never expose synchronization tokens/history or any
// authenticated session to the build browser or to the generated documents.
const publicShared = Object.fromEntries(["jobs", "pairs", "skills", "monsters", "weeklyConquest", "equipIcons", "statIcons", "weaponTypes", "weaponCategories"].map(k => [k, shared[k]]));
const template = await readFile(path.join(root, "dist/search-template.html"), "utf8");
const siteOrigin = new URL(template.match(/property="og:url" content="([^"]+)"/)[1]).origin;
const publicResponses = new Map();
const routes = [{ source: "/", destination: "/index.html" }, ...config.rewrites.filter(r => r.destination.startsWith("/_search") && !r.source.includes(":"))];
const pending = [];
for(const rule of routes) {
  const filename = path.join(output, rule.destination);
  const doc = await readFile(filename,"utf8");
  if(doc.includes('content="index, follow"')) pending.push({...rule,filename,doc});
}
const total = pending.length;
const workers = Math.max(1, Math.min(Number(process.env.SEO_RENDER_WORKERS || Math.min(4,os.availableParallelism())),8,total));
const started = Date.now();
const results = [];
let browser;
const server = createServer(async(req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(pathname.startsWith('/ka-api/') || pathname.startsWith('/api/')) {
      res.setHeader('content-type','application/json');
      if(pathname==='/ka-api/auth/session') return res.end('{"authenticated":false,"guest":true}');
      if(pathname==='/ka-api/ka/shared') return res.end(JSON.stringify(publicShared));
      if(pathname.startsWith('/ka-api/auth/')) {res.statusCode=401;return res.end('{"error":"Sign in required"}');}
      if(pathname.startsWith('/ka-api/ka/')) {
        // Read public content once per URL, without cookies or credentials.
        // All writes are blocked by the browser request filter below.
        if(!publicResponses.has(req.url)) publicResponses.set(req.url,(async()=>{
          const response=await fetch(siteOrigin+req.url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
          return {status:response.status,body:await response.text()};
        })());
        const response=await publicResponses.get(req.url);res.statusCode=response.status;return res.end(response.body);
      }
      res.statusCode=503;return res.end('{"error":"Data unavailable during static rendering"}');
    }
    let filename=path.resolve(output,'.'+pathname);
    if(filename!==output && !filename.startsWith(output+path.sep)) {res.statusCode=404;return res.end();}
    if(!await stat(filename).then(s=>s.isFile()).catch(()=>false)) {
      if(path.extname(pathname)) {res.statusCode=404;return res.end();}
      res.setHeader('content-type','text/html');return res.end(template);
    }
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
    res.setHeader('content-type',types[path.extname(filename)] || 'application/octet-stream');
    res.end(await readFile(filename));
  } catch {res.statusCode=500;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const status=async(outcome='running',error) => {
  const elapsed=(Date.now()-started)/1000;
  await writeFile(path.join(reportDir,'prerender-status.json'),JSON.stringify({outcome,completed:results.length,total,workers,elapsedSeconds:elapsed,pagesPerSecond:results.length/Math.max(elapsed,.001),remainingSeconds:results.length ? elapsed/results.length*(total-results.length) : null,error,results},null,2));
};
await status();
try {
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
  const launch={headless:true};
  if(process.platform==='win32' || process.platform==='darwin') launch.channel='chrome';
  else {
    const {default:binary}=await import('@sparticuz/chromium');
    launch.executablePath=await binary.executablePath();
    // Separate renderer processes allow independent isolated contexts. The
    // Lambda-oriented single-process flag exits Chromium when a context closes.
    launch.args=binary.args.filter(arg=>arg!=='--single-process');
  }
  browser=await chromium.launch(launch);
  let next=0;
  let failed=false;
  let statusWrite=Promise.resolve();
  await Promise.all(Array.from({length:workers},async()=>{
    while(!failed && next<total) {
      const item=pending[next++];
      const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.stack || error.message));
      await context.route('**/*',route=>{
        const request=route.request();const url=new URL(request.url());
        if(request.method()!=='GET' || url.origin!==base || ['font','media'].includes(request.resourceType())) return route.abort();
        return route.continue();
      });
      try {
        await page.goto(base+item.source,{waitUntil:'networkidle',timeout:20000});
        await page.waitForFunction(()=>document.querySelector('#root')?.hasAttribute('data-client-route') && !document.querySelector('[data-route-loading]'),{},{timeout:15000});
        if(errors.length) throw Error(`${item.source}: ${errors.join('; ')}`);
        const snapshot=await page.evaluate(()=>{
          const root=document.querySelector('#root');
          for(const input of root.querySelectorAll('input')) {
            if(input.type==='password') throw Error('Unexpected password input during public rendering');
            input.setAttribute('value',input.value);
            input.toggleAttribute('checked',input.checked);
          }
          for(const textarea of root.querySelectorAll('textarea')) textarea.textContent=textarea.value;
          for(const option of root.querySelectorAll('option')) option.toggleAttribute('selected',option.selected);
          return {html:root.innerHTML,text:(root.querySelector('main') ?? root).textContent || ''};
        });
        if(snapshot.text.trim().length<50) throw Error(`No useful page content: ${item.source}`);
        // Replace only the root. Correct metadata and asset references remain
        // the output of the shared SEO generator and Vite build.
        const cleanDoc=item.doc.replace(/<div id="root"[^>]*>[^]*?<\/div>\s*<\/body>/,'<div id="root"></div>\n  </body>');
        const doc=cleanDoc.replace('<div id="root"></div>',`<div id="root" data-prerendered-page="${item.source}">${snapshot.html.split(base).join(siteOrigin)}</div>`);
        if(!doc.includes('data-prerendered-page=')) throw Error(`Missing empty app root: ${item.source}`);
        await writeFile(item.filename,doc);
        results.push({path:item.source,htmlBytes:Buffer.byteLength(snapshot.html),textCharacters:snapshot.text.length});
        statusWrite=statusWrite.then(()=>status());await statusWrite;
        console.log(`Rendered ${results.length}/${total}: ${item.source}`);
      } catch(error) {failed=true;throw error;}
      finally {await context.close();}
    }
  }));
  await status('completed');
  console.log(`Actual app HTML rendered for ${total} public routes in ${((Date.now()-started)/1000).toFixed(1)} seconds`);
} catch(error) {
  await status('failed',String(error));throw error;
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
