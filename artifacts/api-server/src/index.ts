import app from "./app";
import { logger } from "./lib/logger";
import { ensureProfileSchema } from "./lib/profile-schema";
import { verifyDiscordOAuthReadiness } from "./lib/discord-oauth-readiness";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const host = "0.0.0.0";

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await ensureProfileSchema();

app.listen({ port, host }, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
  void verifyDiscordOAuthReadiness();
});
