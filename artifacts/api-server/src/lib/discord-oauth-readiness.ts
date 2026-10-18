import { discordClientAuthorization, discordOAuthJson, discordRetryAfterSeconds, DiscordOAuthRateLimitError } from "./discord-oauth";

let status: "not-configured" | "checking" | "ready" | "cooldown" | "unavailable" = "not-configured";
let checkedAt: string | null = null;
let running = false;
let reminderBotVerified = false;
export function discordOAuthReadiness() { return { status, checkedAt, transport: process.env.DISCORD_HTTP_RELAY_URL ? "vercel" : "direct", retryAfterSeconds: discordRetryAfterSeconds(), credentialsAndIdentityVerified: status === "ready", reminderBotVerified }; }

// Discord documents this owner-only grant for testing. No website account is
// created or linked, no reminders are sent, and the temporary token is revoked.
export async function verifyDiscordOAuthReadiness(allowScheduledRetry = true) {
  if (running || !process.env.DISCORD_CLIENT_ID?.trim() || !process.env.DISCORD_CLIENT_SECRET?.trim()) return;
  running = true;
  status = "checking";
  let token: string | undefined;
  try {
    const access = await discordOAuthJson<{ access_token?: string }>("/oauth2/token", {
      method: "POST", headers: { Authorization: discordClientAuthorization(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "identify" }),
    });
    token = access.access_token;
    if (!token) throw new Error("Missing verification token");
    const identity = await discordOAuthJson<{ id?: string }>("/users/@me", { headers: { Authorization: `Bearer ${token}` } });
    if (!identity.id || !/^\d+$/.test(identity.id)) throw new Error("Invalid verification identity");
    status = "ready";
    if (process.env.DISCORD_BOT_TOKEN?.trim()) {
      try {
        const bot = await discordOAuthJson<{ id?: string; bot?: boolean }>("/users/@me", { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN.trim()}` } });
        reminderBotVerified = bot.bot === true && bot.id === process.env.DISCORD_CLIENT_ID?.trim();
      } catch { reminderBotVerified = false; }
    }
  } catch (error) {
    status = error instanceof DiscordOAuthRateLimitError ? "cooldown" : "unavailable";
    if (error instanceof DiscordOAuthRateLimitError && allowScheduledRetry && error.retryAfterSeconds <= 3600) {
      // One bounded retry, after Discord's actual reset time; never retry a user's code.
      setTimeout(() => { void verifyDiscordOAuthReadiness(false); }, (error.retryAfterSeconds + 1) * 1000).unref();
    }
  } finally {
    if (token) {
      await discordOAuthJson("/oauth2/token/revoke", { method: "POST", headers: { Authorization: discordClientAuthorization(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, token_type_hint: "access_token" }) }).catch(() => {});
    }
    checkedAt = new Date().toISOString();
    running = false;
    console.info(JSON.stringify({ event: "discord_oauth_readiness", ...discordOAuthReadiness() }));
  }
}
