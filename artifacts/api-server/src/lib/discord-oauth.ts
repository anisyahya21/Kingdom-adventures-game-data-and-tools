import { createHmac, randomBytes } from "node:crypto";
const API = "https://discord.com/api/v10";
const USER_AGENT = "KingdomAdventurersCommunityTools/1.0 (+https://kingdom-adventures-community-tools.vercel.app)";
const blockedUntil = new Map<string, number>();
export function discordRetryAfterSeconds(path = "/oauth2/token") {
  return Math.max(0, Math.ceil((Math.max(blockedUntil.get(path) || 0, blockedUntil.get("global") || 0) - Date.now()) / 1000));
}
export class DiscordOAuthRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Discord sign-in is cooling down. Please try again in ${retryAfterSeconds} seconds.`);
  }
}
export function discordClientAuthorization() {
  return `Basic ${Buffer.from(`${process.env.DISCORD_CLIENT_ID?.trim() || ""}:${process.env.DISCORD_CLIENT_SECRET?.trim() || ""}`).toString("base64")}`;
}
export async function discordApiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json"); headers.set("User-Agent", USER_AGENT);
  const relay = process.env.DISCORD_HTTP_RELAY_URL?.trim();
  if (!relay) return fetch(`${API}${path}`, { ...init, headers, signal: AbortSignal.timeout(15000) });
  const secret = process.env.DISCORD_HTTP_RELAY_SECRET;
  if (!secret || !relay.startsWith("https://")) throw new Error("Discord transport is not configured.");
  const raw = JSON.stringify({ path, method: init.method || "GET", authorization: headers.get("authorization") || undefined, contentType: headers.get("content-type") || undefined, body: init.body === undefined ? undefined : String(init.body) });
  const timestamp = String(Date.now()); const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${raw}`).digest("hex");
  return fetch(relay, { method: "POST", headers: { "Content-Type": "application/json", "x-ka-discord-time": timestamp, "x-ka-discord-nonce": nonce, "x-ka-discord-signature": signature }, body: raw, signal: AbortSignal.timeout(20000) });
}

export async function discordOAuthJson<T>(path: "/oauth2/token" | "/users/@me" | "/oauth2/token/revoke", init: RequestInit): Promise<T> {
  const remaining = discordRetryAfterSeconds(path);
  if (remaining) throw new DiscordOAuthRateLimitError(remaining);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("User-Agent", USER_AGENT);
  const response = await discordApiFetch(path, { ...init, headers });
  const stage = path === "/oauth2/token" ? "authorization" : "identity verification";
  const contentType = response.headers.get("content-type") || "";
  // Never log response bodies: they can contain OAuth codes, tokens or identity data.
  if (!response.ok || path !== "/oauth2/token/revoke" && !contentType.toLowerCase().includes("application/json")) {
    if (response.status === 429) {
      const details = contentType.includes("application/json") ? await response.json().catch(() => null) as { retry_after?: number; global?: boolean; code?: number } | null : null;
      const delay = Number(response.headers.get("retry-after") || details?.retry_after || 60);
      const retryAfterSeconds = Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : 60;
      blockedUntil.set(details?.global ? "global" : path, Date.now() + retryAfterSeconds * 1000);
      console.warn(JSON.stringify({ event: "discord_oauth_rate_limit", stage, status: 429, retryAfterSeconds, global: details?.global === true, scope: response.headers.get("x-ratelimit-scope"), code: typeof details?.code === "number" ? details.code : undefined }));
      throw new DiscordOAuthRateLimitError(retryAfterSeconds);
    }
    console.warn(JSON.stringify({ event: "discord_oauth_response_rejected", stage, status: response.status, contentType: contentType.slice(0, 100) }));
    throw new Error(`Discord ${stage} is temporarily unavailable (HTTP ${response.status}). Please start again from Profile.`);
  }
  if (path === "/oauth2/token/revoke") return {} as T;
  try { return await response.json() as T; }
  catch {
    console.warn("Discord OAuth returned invalid JSON", { stage, status: response.status });
    throw new Error(`Discord returned an unreadable ${stage} response. Please start again from Profile.`);
  }
}
