import { createHash } from 'node:crypto';
import { readdir, readFile, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

// These public assets are shipped with the app, not fetched user/account data.
export const STATIC_DIRECTORIES = ['world-assets', 'website_icons', 'monster-sprites', 'treasure-icons', 'character_sprites'];

export async function assetVersion(publicDir) {
  const hash = createHash('sha256');
  async function visit(relative) {
    const entries = await readdir(path.join(publicDir, relative), { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const filename = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        hash.update(filename); hash.update('\0');
        hash.update(await readFile(path.join(publicDir, filename))); hash.update('\0');
      }
    }
  }
  for (const directory of STATIC_DIRECTORIES) await visit(directory);
  return hash.digest('hex').slice(0, 20);
}

export function versionStaticAssets() {
  let config, version;
  return {
    name: 'version-static-assets', apply: 'build',
    configResolved(value) { config = value; },
    async buildStart() { version = await assetVersion(config.publicDir); },
    renderChunk(code) {
      // Runs before Rollup computes chunk hashes. Covers both absolute URLs and
      // BASE_URL-relative strings, including paths imported from JSON catalogs.
      let result = code;
      for (const directory of STATIC_DIRECTORIES) {
        result = result.replaceAll(`${directory}/`, `static-v/${version}/${directory}/`);
      }
      return result === code ? null : { code: result, map: null };
    },
    async closeBundle() {
      const output = path.resolve(config.root, config.build.outDir, 'static-v', version);
      await mkdir(output, { recursive: true });
      await Promise.all(STATIC_DIRECTORIES.map(directory => cp(
        path.join(config.publicDir, directory), path.join(output, directory), { recursive: true },
      )));
    },
  };
}
