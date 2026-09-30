import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function resolve(specifier, context, next) {
  if (!specifier.endsWith(".csv?raw")) return next(specifier, context);
  const bareSpecifier = specifier.slice(0, -4);
  if (bareSpecifier.startsWith("@/")) {
    const file = path.join(appRoot, "src", bareSpecifier.slice(2));
    if (!existsSync(file)) throw new Error(`training CSV loader: cannot resolve ${specifier}`);
    return { url: `${pathToFileURL(file).href}?raw`, shortCircuit: true };
  }
  if (bareSpecifier.startsWith("./") || bareSpecifier.startsWith("../")) {
    const file = fileURLToPath(new URL(bareSpecifier, context.parentURL));
    if (!existsSync(file)) throw new Error(`training CSV loader: cannot resolve ${specifier}`);
    return { url: `${pathToFileURL(file).href}?raw`, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".csv?raw")) {
    const source = readFileSync(fileURLToPath(url.slice(0, -4)), "utf8");
    return { format: "module", source: `export default ${JSON.stringify(source)};`, shortCircuit: true };
  }
  return next(url, context);
}
