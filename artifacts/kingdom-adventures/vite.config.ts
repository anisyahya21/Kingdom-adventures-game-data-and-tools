import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: await (async () => {
    const plugins = [react(), tailwindcss()];

    try {
      const { default: runtimeErrorOverlay } = await import(
        "@replit/vite-plugin-runtime-error-modal"
      );
      plugins.push(runtimeErrorOverlay());
    } catch {
      // This plugin is available in Replit, but local installs may not include it.
    }

    if (
      process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
    ) {
      try {
        const { cartographer } = await import("@replit/vite-plugin-cartographer");
        plugins.push(
          cartographer({
            root: path.resolve(import.meta.dirname, ".."),
          }),
        );
      } catch {
        // Local development can proceed without Replit-specific tooling.
      }

      try {
        const { devBanner } = await import("@replit/vite-plugin-dev-banner");
        plugins.push(devBanner());
      } catch {
        // Local development can proceed without Replit-specific tooling.
      }
    }

    return plugins;
  })(),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/ka-api": {
        target: `http://localhost:${process.env.API_PORT || 3001}`,
        rewrite: (p) => p.replace(/^\/ka-api/, "/api"),
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // Prevent Vite from triggering HMR when the API server writes to its data
    // files (e.g. ka_shared.json). local-shared-data.ts imports that file as a
    // static module, so without this ignore Vite watches it and every
    // PUT /api/ka/pairs causes an HMR cycle that remounts the page.
    watch: {
      ignored: ["**/api-server/data/**"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
