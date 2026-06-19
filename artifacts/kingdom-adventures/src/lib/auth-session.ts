import { configuredApiBase } from "@/lib/api";

export type AuthUser = {
  id: string;
  telegramUsername: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  displayName: string;
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

function authUrl(path: string) {
  const base = configuredApiBase();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}/ka-api/auth${cleanPath}`;
}

export async function fetchAuthSession(): Promise<AuthSessionResponse> {
  const response = await fetch(authUrl("/session"), {
    credentials: "include",
  });
  if (!response.ok) {
    return { authenticated: false, guest: true };
  }
  return response.json() as Promise<AuthSessionResponse>;
}

export async function startTelegramAuth(): Promise<TelegramStartResponse> {
  const response = await fetch(authUrl("/telegram/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Telegram login is not available.");
  }
  return response.json() as Promise<TelegramStartResponse>;
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
