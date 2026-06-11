import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, ".env.local"),
  path.resolve(__dirname, ".env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to a local .env.local file (gitignored).");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
