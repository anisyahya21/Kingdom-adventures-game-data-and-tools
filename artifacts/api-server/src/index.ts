import app from "./app";
import { logger } from "./lib/logger";
import { ensureProfileSchema } from "./lib/profile-schema";
import { ensureAdminAnalyticsSchema, refreshDailyAnalytics } from "./lib/admin-analytics";
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
await ensureAdminAnalyticsSchema();
// Backfill existing history without blocking sign-in if analytics is unavailable.
void refreshDailyAnalytics(true).catch((error) => logger.error({ error }, "Analytics backfill failed"));

app.listen({ port, host }, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
  void verifyDiscordOAuthReadiness();
});
