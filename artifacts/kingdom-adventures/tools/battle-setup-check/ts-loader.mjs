/**
 * Node ESM hooks so the deterministic legality check can import the real site TypeScript modules
 * (`@/...` aliases, extensionless relative imports, JSON default imports) with Node's built-in
 * type stripping.
 *
 * Usage (see legality_check.mjs):
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/legality_check.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function resolveCandidates(base) {
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}.js`, path.join(base, "index.ts")];
}

function firstExisting(base) {
  for (const candidate of resolveCandidates(base)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const found = firstExisting(path.join(appRoot, "src", specifier.slice(2)));
    if (!found) throw new Error(`ts-loader: cannot resolve alias ${specifier}`);
    return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    if (!/\.[a-z]+$/i.test(specifier)) {
      const found = firstExisting(fileURLToPath(new URL(specifier, context.parentURL)));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".json")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${source};`, shortCircuit: true };
  }
  return next(url, context);
}
