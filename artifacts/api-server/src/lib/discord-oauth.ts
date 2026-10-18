const API = "https://discord.com/api/v10";
const USER_AGENT = "KingdomAdventurersCommunityTools/1.0 (+https://kingdom-adventures-community-tools.vercel.app)";

export async function discordOAuthJson<T>(path: "/oauth2/token" | "/users/@me", init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("User-Agent", USER_AGENT);
  const response = await fetch(`${API}${path}`, { ...init, headers, signal: AbortSignal.timeout(15000) });
  const stage = path === "/oauth2/token" ? "authorization" : "identity verification";
  const contentType = response.headers.get("content-type") || "";
  // Never log response bodies: they can contain OAuth codes, tokens or identity data.
  if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
    console.warn("Discord OAuth response rejected", { stage, status: response.status, contentType: contentType.slice(0, 100) });
    if (response.status === 429) throw new Error("Discord is temporarily limiting sign-ins. Please wait a minute and start again from Profile.");
    throw new Error(`Discord ${stage} is temporarily unavailable (HTTP ${response.status}). Please start again from Profile.`);
  }
  try { return await response.json() as T; }
  catch {
    console.warn("Discord OAuth returned invalid JSON", { stage, status: response.status });
    throw new Error(`Discord returned an unreadable ${stage} response. Please start again from Profile.`);
  }
}
