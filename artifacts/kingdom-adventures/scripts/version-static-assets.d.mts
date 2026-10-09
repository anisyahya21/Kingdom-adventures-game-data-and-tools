import type { Plugin } from 'vite';
export const STATIC_DIRECTORIES: string[];
export function assetVersion(publicDir: string): Promise<string>;
export function versionStaticAssets(): Plugin;
