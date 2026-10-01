import { useSyncExternalStore } from "react";
import { apiUrl, configuredApiBase } from "@/lib/api";
import {
  EMPTY_PLAYER_PROFILE,
  PLAYER_PROFILE_EVENT,
  playerProfileStorageKey,
  readPlayerProfile,
  setPlayerProfileAccountScope,
  sanitizePlayerProfile,
  writePlayerProfile,
  type PlayerProfile,
} from "@/lib/player-profile";
import {
  AccountPlayerProfileSyncController,
  parseAccountSessionResponse,
  type AccountProfileEnvelope,
  type AccountProfileSyncSnapshot,
} from "./sync-core";

type AuthSessionPayload = {
  authenticated?: boolean;
  user?: { id?: string };
};

type ApiEnvelope = {
  profile?: unknown;
  revision?: unknown;
  accountId?: unknown;
};

async function loadAccountId(): Promise<{ accountId: string } | null> {
  const response = await fetch(`${configuredApiBase()}/ka-api/auth/session`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = response.ok ? await response.json() as AuthSessionPayload : null;
  return parseAccountSessionResponse(response.status, payload);
}

async function readEnvelope(response: Response): Promise<AccountProfileEnvelope> {
  const payload = await response.json().catch(() => null) as ApiEnvelope | null;
  if (!payload || !("profile" in payload) || !("revision" in payload)) {
    throw new Error("The account profile response was incomplete. Your device copy is preserved.");
  }
  if (payload.profile !== null && (!payload.profile || typeof payload.profile !== "object" || Array.isArray(payload.profile))) {
    throw new Error("The account profile was invalid. Your device copy is preserved.");
  }
  if (payload.revision !== null && typeof payload.revision !== "string") {
    throw new Error("The account profile revision was invalid. Your device copy is preserved.");
  }
  if (payload.accountId !== undefined && typeof payload.accountId !== "string") {
    throw new Error("The account profile identity was invalid. Your device copy is preserved.");
  }
  return {
    profile: payload.profile === null ? null : sanitizePlayerProfile(payload.profile),
    revision: payload.revision as string | null,
    ...(typeof payload.accountId === "string" ? { accountId: payload.accountId } : {}),
  };
}

async function readAccountProfile(): Promise<AccountProfileEnvelope> {
  const response = await fetch(apiUrl("/account-player-profile"), { credentials: "include", cache: "no-store" });
  if (response.status === 401) throw new Error("Sign in to sync this profile. Your device copy is preserved.");
  if (!response.ok) {
    throw new Error(`Could not load the account profile (${response.status}). Your device copy is preserved.`);
  }
  return readEnvelope(response);
}

async function writeAccountProfile(
  profile: PlayerProfile,
  revision: string | null,
  expectedAccountId: string,
) {
  const response = await fetch(apiUrl("/account-player-profile"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, revision, expectedAccountId }),
  });
  if (response.status === 409) {
    return { kind: "conflict" as const, current: await readEnvelope(response) };
  }
  if (response.status === 401) throw new Error("Sign in to sync this profile. Your device copy is preserved.");
  if (!response.ok) {
    throw new Error(`Could not save the account profile (${response.status}). Your device copy is preserved.`);
  }
  const saved = await readEnvelope(response);
  if (saved.revision === null) {
    throw new Error("The account saved the profile without a revision. Your device copy is preserved.");
  }
  return { kind: "saved" as const, revision: saved.revision, ...(saved.accountId ? { accountId: saved.accountId } : {}) };
}

let controller: AccountPlayerProfileSyncController | null = null;
let runtimeUsers = 0;
let removeRuntimeListeners: (() => void) | null = null;
const SERVER_SNAPSHOT: AccountProfileSyncSnapshot = {
  status: "device",
  message: "This profile is stored on this device.",
  accountId: null,
  legacyImportAvailable: false,
  conflict: null,
};

const deferredStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
};

function getController() {
  if (controller) return controller;
  controller = new AccountPlayerProfileSyncController({
    storage: deferredStorage,
    readLocal: readPlayerProfile,
    writeLocal: writePlayerProfile,
    setScope: setPlayerProfileAccountScope,
    currentStorageKey: playerProfileStorageKey,
    sanitize: sanitizePlayerProfile,
    getSession: loadAccountId,
    api: {
      read: readAccountProfile,
      write: writeAccountProfile,
    },
    listenLocalChanges(listener, externalListener) {
      const onProfileEvent = () => listener();
      const onStorage = (event: StorageEvent) => {
        if (
          event.key !== null &&
          event.key !== "ka_player_profile_anonymous_v1" &&
          event.key !== playerProfileStorageKey() &&
          !event.key.startsWith("ka_account_player_profile_v1:")
        ) return;
        externalListener(event.key);
      };
      window.addEventListener(PLAYER_PROFILE_EVENT, onProfileEvent);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(PLAYER_PROFILE_EVENT, onProfileEvent);
        window.removeEventListener("storage", onStorage);
      };
    },
  });
  return controller;
}

export function startProfileAccountSync() {
  if (typeof window === "undefined") return () => {};
  const sync = getController();
  runtimeUsers += 1;
  if (runtimeUsers === 1) {
    const onAuthChanged = () => {
      sync.invalidateForAuthChange();
      void sync.refresh(true);
    };
    const onFocus = () => void sync.refresh(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync.refresh(true);
    };
    window.addEventListener("ka-auth-changed", onAuthChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    removeRuntimeListeners = () => {
      window.removeEventListener("ka-auth-changed", onAuthChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    sync.start();
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    runtimeUsers = Math.max(0, runtimeUsers - 1);
    if (runtimeUsers === 0) {
      removeRuntimeListeners?.();
      removeRuntimeListeners = null;
      sync.stop();
    }
  };
}

export type ProfileAccountSync = AccountProfileSyncSnapshot & {
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  useAccountCopy: () => void;
  keepLocalCopy: () => void;
  restoreLegacyBackup: () => Promise<void>;
};

export function useProfileAccountSync(): ProfileAccountSync {
  const sync = getController();
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, () => SERVER_SNAPSHOT);
  return {
    ...snapshot,
    refresh: () => sync.refresh(true),
    retry: () => sync.retry(),
    useAccountCopy: () => sync.useAccountCopy(),
    keepLocalCopy: () => sync.keepLocalCopy(),
    restoreLegacyBackup: () => sync.restoreLegacyBackup(),
  };
}

export { EMPTY_PLAYER_PROFILE };
export type { PlayerProfile };
