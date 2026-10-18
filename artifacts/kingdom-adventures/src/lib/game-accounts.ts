import type { GameAccount } from "./auth-session";

export type GameAccountContext = "profile" | "combat" | "leveling";
export function gameAccountContext(pathname: string): GameAccountContext {
  if (pathname === "/equipment-leveling-optimizer" || pathname === "/equipment-level-optimizer") return "leveling";
  if (pathname === "/combat" || pathname.startsWith("/combat/") || pathname === "/loadout") return "combat";
  return "profile";
}
function currentContext() { return gameAccountContext(typeof window === "undefined" ? "" : window.location.pathname); }
const key = (userId: string, context: GameAccountContext) => `ka_game_account_choice:${userId}:${context}`;
export function selectedGameAccount(userId: string, accounts: GameAccount[], context = currentContext()): string {
  try {
    const selected = localStorage.getItem(key(userId, context));
    return accounts.some((account) => account.id === selected) ? selected! : "primary";
  } catch { return "primary"; }
}

export function selectGameAccount(userId: string, id: string, context = currentContext()) {
  localStorage.setItem(key(userId, context), id);
  window.dispatchEvent(new CustomEvent("ka-profile-context-changed"));
}

export function gameAccountScope(userId: string, id: string) {
  return id === "primary" ? userId : `${userId}:game:${id}`;
}

export function gameAccountQuery(scope: string) {
  const id = scope.split(":game:")[1];
  return id ? `?gameAccountId=${encodeURIComponent(id)}` : "";
}
