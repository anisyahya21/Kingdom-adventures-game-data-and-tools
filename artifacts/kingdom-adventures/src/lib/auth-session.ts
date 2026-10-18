import { requestSession } from "@/lib/session-request";
import { configuredApiBase } from "@/lib/api";

export type GameAccount = { id: string; name: string; gameId: string };

export type AuthUser = {
  id: string;
  isAdmin?: boolean;
  telegramUsername: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  displayName: string;
  gameId?: string;
  discordUsername?: string;
  linkedProviders?: { telegram: boolean; discord: boolean };
  gameAccounts?: GameAccount[];
  accountsRevision?: string;
};

export type AuthSessionResponse = {
  authenticated: boolean;
  guest: boolean;
  user?: AuthUser;
};

type TelegramStartResponse = {
  ok: boolean;
  state: string;
  expiresAt: string;
  widgetUrl: string;
};

export type TelegramFallbackStartResponse = {
  ok: boolean;
  state: string;
  code: string;
  expiresAt: string;
  botUsername: string;
  botUrl: string;
  deepLinkUrl?: string;
  command: string;
};

function authUrl(path: string) {
  const base = configuredApiBase();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}/ka-api/auth${cleanPath}`;
}

export async function fetchAuthSession(): Promise<AuthSessionResponse> {
  const response = await requestSession(authUrl("/session"));
  if (!response.ok) {
    throw new Error(`Could not check your session (${response.status}). Please try again.`);
  }
  return response.json() as Promise<AuthSessionResponse>;
}

export async function startTelegramAuth(link = false): Promise<TelegramStartResponse> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const response = await fetch(authUrl("/telegram/start"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { "x-ka-origin": origin, "x-ka-return-to": window.location.href } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ link }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Telegram login is not available.");
  }
  return response.json() as Promise<TelegramStartResponse>;
}

export async function startTelegramFallbackAuth(): Promise<TelegramFallbackStartResponse> {
  const response = await fetch(authUrl("/telegram/fallback/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Code login is not available.");
  }
  return response.json() as Promise<TelegramFallbackStartResponse>;
}

export async function verifyTelegramFallbackAuth(state: string) {
  const response = await fetch(authUrl("/telegram/fallback/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ state }),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Could not verify login code.");
  }
}

export async function logoutAuthSession() {
  const response = await fetch(authUrl("/logout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Failed to log out.");
  }
}

export async function updateAuthProfile(input: { displayName: string; gameId: string; gameAccounts?: GameAccount[]; expectedUserId: string; accountsRevision?: string }) {
  const response = await fetch(authUrl("/profile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to update profile.");
  }
}

export async function startDiscordAuth(link = false) {
  const response = await fetch(authUrl("/discord/start"), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "x-ka-origin": window.location.origin },
    body: JSON.stringify({ link }),
  });
  const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!payload) throw new Error(`Discord sign-in is temporarily unavailable (HTTP ${response.status}). Please try again.`);
  if (!response.ok || !payload.url) throw new Error(payload.error || "Could not start Discord login.");
  window.location.assign(payload.url);
}

export async function unlinkAuthProvider(provider: "telegram" | "discord", expectedUserId: string) {
  const response = await fetch(authUrl(`/providers/${provider}/unlink`), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUserId }),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not unlink this account.");
  window.dispatchEvent(new CustomEvent("ka-auth-changed"));
}
