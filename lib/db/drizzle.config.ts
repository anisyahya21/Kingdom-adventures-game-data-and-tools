import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

function toPosixPath(value: string) {
  return value.replace(/\\/g, "/");
}

const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(configDir, ".env.local"),
  path.resolve(configDir, ".env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to a local .env.local file (gitignored).");
}

function withRequiredSsl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!isLocal && !url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const databaseUrl = withRequiredSsl(process.env.DATABASE_URL);

export default defineConfig({
  schema: toPosixPath(path.resolve(configDir, "src/schema/*.ts")),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
