/** Deterministic static search documents; the existing React app replaces the summary. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSeoMeta, SITE_NAME, SITE_URL, encodeCanonicalPath } from "../src/app/seo.ts";
import { ROUTE_ALIASES, isIndexablePage } from "../src/app/seo-policy.ts";
import { SHOP_RECORDS } from "../src/lib/shop-utils.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/public");
const shared = JSON.parse(await readFile(path.join(root, "../api-server/data/ka_shared.json"), "utf8"));
const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
const staticPaths = [...app.matchAll(/<Route path="([^":]+)"/g)].map(m => m[1]);
const paths = [...new Set([
  ...staticPaths,
  ...Object.keys(shared.jobs).map(name => `/jobs/${name}`),
  ...SHOP_RECORDS.map(shop => `/shops/${shop.slug}`),
])].sort();

// Refresh only public route identities, never serialize the rest of shared/account data.
const catalog = JSON.stringify({ paths }, null, 2) + "\n";
const catalogFile = path.join(root, "src/app/search-route-catalog.json");
if (process.argv.includes("--prepare")) {
  await writeFile(catalogFile, catalog);
  console.log(`Prepared ${paths.length} known route identities`);
  process.exit(0);
}
if (await readFile(catalogFile, "utf8") !== catalog) {
  throw new Error("Search route catalog is stale: run npm run seo:prepare before building");
}

const builtIndex = await readFile(path.join(output, "index.html"), "utf8");
const templateFile = path.join(root, "dist/search-template.html");
if (!builtIndex.includes("data-search-summary")) await writeFile(templateFile, builtIndex);
const html = await readFile(templateFile, "utf8");
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const primary = ["/jobs", "/skills", "/houses", "/shops", "/equipment", "/monster-spawns", "/monster-pet-stats", "/survey", "/guides"];
const links = pathname => (pathname === "/jobs" ? paths.filter(p => p.startsWith("/jobs/"))
  : pathname === "/shops" ? SHOP_RECORDS.map(s => `/shops/${s.slug}`) : primary)
  .filter(p => p !== pathname)
  .map(p => `<li><a href="${escape(encodeCanonicalPath(p))}">${escape(getSeoMeta(p).title.replace(/ - Kingdom Adventurers.*$/, ""))}</a></li>`).join("");

function documentFor(pathname, { notFound = false, dynamicGuide = false } = {}) {
  const meta = getSeoMeta(pathname);
  const title = notFound ? `Page not found | ${SITE_NAME}` : meta.title.includes(SITE_NAME) ? meta.title : `${meta.title} | ${SITE_NAME}`;
  const description = notFound ? "This page could not be found. Browse the Kingdom Adventurers tools and guides." : meta.description;
  const canonical = `${SITE_URL}${encodeCanonicalPath(meta.canonicalPath)}`;
  let doc = html.replace(/<title>[^]*?<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/<meta\s+name="description"[^]*?\/>/, `<meta name="description" content="${escape(description)}" />`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${notFound || !isIndexablePage(pathname) ? "noindex, follow" : "index, follow"}" />`)
    .replace(/<link rel="canonical"[^>]*>/g, "")
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escape(title)}" />`)
    .replace(/<meta\s+property="og:description"[^]*?\/>/, `<meta property="og:description" content="${escape(description)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, dynamicGuide || notFound ? "" : `<meta property="og:url" content="${escape(canonical)}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escape(title)}" />`)
    .replace(/<meta\s+name="twitter:description"[^]*?\/>/, `<meta name="twitter:description" content="${escape(description)}" />`);
  if (!notFound && !dynamicGuide) doc = doc.replace("</head>", `    <link rel="canonical" href="${escape(canonical)}" />\n  </head>`);
  const intro = `<main data-search-summary style="max-width:64rem;margin:2rem auto;padding:0 1rem;font-family:system-ui;line-height:1.6"><h1>${escape(notFound ? "Page not found" : meta.title)}</h1><p>${escape(description)}</p><nav aria-label="Related tools"><ul>${links(pathname)}</ul></nav><noscript>Enable JavaScript to use the interactive tools, filters and calculators.</noscript></main>`;
  return doc.replace('<div id="root"></div>', `<div id="root">${intro}</div>`);
}

await mkdir(path.join(output, "_search"), { recursive: true });
const canonicalPaths = paths.filter(p => !ROUTE_ALIASES[p]);
const rewrites = [];
for (const pathname of canonicalPaths) {
  const relative = pathname === "/" ? "index.html" : `_search${pathname}.html`;
  const filename = path.join(output, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, documentFor(pathname));
  if (pathname !== "/") rewrites.push({ source: encodeCanonicalPath(pathname), destination: `/${relative}` });
}
await writeFile(path.join(output, "_search/community-guide.html"), documentFor("/guides", { dynamicGuide: true }));
await writeFile(path.join(output, "404.html"), documentFor("/404", { notFound: true }));

const sitemapPaths = canonicalPaths.filter(isIndexablePage);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map(p => `  <url><loc>${escape(SITE_URL + encodeCanonicalPath(p))}</loc></url>`).join("\n")}\n</urlset>\n`;
const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE_URL}/sitemap.xml</loc></sitemap></sitemapindex>\n`;
await Promise.all([
  writeFile(path.join(output, "sitemap.xml"), sitemap),
  writeFile(path.join(output, "sitemap_index.xml"), sitemapIndex),
  writeFile(path.join(root, "public/sitemap.xml"), sitemap),
  writeFile(path.join(root, "public/sitemap_index.xml"), sitemapIndex),
]);
const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const expectedRewrites = [
  ...vercel.rewrites.filter(rule => rule.source.startsWith("/api/") || rule.source.startsWith("/ka-api/")),
  ...rewrites,
  { source: "/guides/:slug", destination: "/_search/community-guide.html" },
];
const redirects = Object.entries(ROUTE_ALIASES).map(([source, destination]) => ({ source, destination, permanent: true }));
if (JSON.stringify(vercel.rewrites) !== JSON.stringify(expectedRewrites) || JSON.stringify(vercel.redirects) !== JSON.stringify(redirects) || vercel.routes) {
  if (!process.argv.includes("--update-config")) throw new Error("Search routing changed; regenerate and commit vercel.json with --update-config");
  delete vercel.routes;
  vercel.rewrites = expectedRewrites;
  vercel.redirects = redirects;
  await writeFile(path.join(root, "vercel.json"), JSON.stringify(vercel, null, 2) + "\n");
}
await writeFile(path.join(output, "search-build-report.json"), JSON.stringify({ pages: canonicalPaths.length, sitemapPages: sitemapPaths.length, aliases: ROUTE_ALIASES, unknownRoutes: "Vercel filesystem 404; runtime community guides check existence in the client" }, null, 2));
console.log(`Generated ${canonicalPaths.length} search documents, ${sitemapPaths.length} sitemap URLs, ${redirects.length} permanent aliases and custom 404`);
