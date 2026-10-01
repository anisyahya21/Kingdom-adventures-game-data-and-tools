export type PlayerProfile = {
  version: 1;
  equipment: Record<string, number>;
  characters: Array<{
    id: string;
    jobName: string;
    rank: string;
    statLevels: Record<string, number>;
  }>;
  valuables: Record<string, number>;
};

export type AccountProfileEnvelope = {
  profile: PlayerProfile | null;
  revision: string | null;
  accountId?: string;
};

export type AccountProfileSyncStatus = "device" | "syncing" | "saved" | "error" | "conflict";

export type AccountProfileSyncSnapshot = {
  status: AccountProfileSyncStatus;
  message: string;
  accountId: string | null;
  legacyImportAvailable: boolean;
  conflict: {
    local: PlayerProfile;
    account: PlayerProfile;
  } | null;
};

export function parseAccountSessionResponse(
  status: number,
  payload: { authenticated?: boolean; user?: { id?: string } } | null,
): { accountId: string } | null {
  if (status === 401) return null;
  if (status < 200 || status >= 300) {
    throw new Error(`Could not check the account session (${status}). Your profile remains on this device.`);
  }
  if (!payload?.authenticated) return null;
  if (typeof payload.user?.id !== "string" || !payload.user.id) {
    throw new Error("The account session did not include an account ID. Your profile remains on this device.");
  }
  return { accountId: payload.user.id };
}

export type ProfileSyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ProfileSyncDependencies = {
  storage: ProfileSyncStorage;
  readLocal: () => PlayerProfile;
  writeLocal: (profile: PlayerProfile) => void;
  setScope?: (accountId: string | null) => void;
  currentStorageKey?: () => string;
  sanitize: (profile: unknown) => PlayerProfile;
  getSession: () => Promise<{ accountId: string } | null>;
  api: {
    read: () => Promise<AccountProfileEnvelope>;
    write: (profile: PlayerProfile, revision: string | null, expectedAccountId: string) => Promise<
      | { kind: "saved"; revision: string | null; accountId?: string }
      | { kind: "conflict"; current: AccountProfileEnvelope }
    >;
  };
  listenLocalChanges: (listener: () => void, externalListener: (key: string | null) => void) => () => void;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

type AccountCache = {
  profile: PlayerProfile;
  baseProfile: PlayerProfile | null;
  revision: string | null;
};

type Conflict = {
  local: PlayerProfile;
  account: PlayerProfile;
  revision: string | null;
};

const CACHE_PREFIX = "ka_account_player_profile_v1:";
const LEGACY_BACKUP_KEY = "ka_player_profile_legacy_backup_v1";
const LEGACY_OWNER_KEY = "ka_player_profile_legacy_owner_v1";
const ANONYMOUS_PROFILE_KEY = "ka_player_profile_anonymous_v1";

export function isPlayerProfileEmpty(profile: PlayerProfile): boolean {
  return (
    Object.keys(profile.equipment).length === 0 &&
    profile.characters.length === 0 &&
    Object.keys(profile.valuables).length === 0
  );
}

function stableProfile(profile: PlayerProfile) {
  return JSON.stringify({
    version: 1,
    equipment: Object.fromEntries(Object.entries(profile.equipment).sort(([a], [b]) => a.localeCompare(b))),
    characters: profile.characters.map((character) => ({
      id: character.id,
      jobName: character.jobName,
      rank: character.rank,
      statLevels: Object.fromEntries(Object.entries(character.statLevels).sort(([a], [b]) => a.localeCompare(b))),
    })),
    valuables: Object.fromEntries(Object.entries(profile.valuables).sort(([a], [b]) => a.localeCompare(b))),
  });
}

export function samePlayerProfile(a: PlayerProfile | null, b: PlayerProfile | null): boolean {
  if (a === null || b === null) return a === b;
  return stableProfile(a) === stableProfile(b);
}

function accountCacheKey(accountId: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(accountId)}`;
}

export class AccountPlayerProfileSyncController {
  private snapshot: AccountProfileSyncSnapshot = {
    status: "device",
    message: "This profile is stored on this device.",
    accountId: null,
    legacyImportAvailable: false,
    conflict: null,
  };
  private listeners = new Set<() => void>();
  private unsubscribeLocal: (() => void) | null = null;
  private activeAccountId: string | null = null;
  private accountGeneration = 0;
  private refreshGeneration = 0;
  private editGeneration = 0;
  private suppressLocalEvents = 0;
  private bootstrapping = false;
  private writeBlocked = false;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private conflict: Conflict | null = null;
  private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void;
  private identityResolved = false;
  private cacheFallback = new Map<string, AccountCache>();
  private failedCacheWrites = new Set<string>();
  private inFlightWrites = new Map<string, Promise<void>>();
  private queuedWrites = new Map<string, { profile: PlayerProfile; revision: string | null; generation: number }>();
  private accountEditGenerations = new Map<string, number>();
  private lastObservedLocal: PlayerProfile | null = null;
  private memoryLegacyBackup: PlayerProfile | null = null;
  private memoryLegacyOwner: string | null = null;
  private memoryAnonymousProfile: PlayerProfile | null = null;

  constructor(private readonly deps: ProfileSyncDependencies) {
    this.schedule = deps.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancel = deps.cancel ?? ((timer) => clearTimeout(timer));
  }

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.unsubscribeLocal) return;
    this.lastObservedLocal = this.deps.sanitize(this.deps.readLocal());
    this.unsubscribeLocal = this.deps.listenLocalChanges(
      () => this.onLocalChange(),
      (key) => this.onExternalStorageChange(key),
    );
    void this.refresh(true);
  }

  stop() {
    this.refreshGeneration += 1;
    this.accountGeneration += 1;
    this.unsubscribeLocal?.();
    this.unsubscribeLocal = null;
    if (this.pendingTimer) this.cancel(this.pendingTimer);
    this.pendingTimer = null;
    this.queuedWrites.clear();
  }

  /** Invalidate pending work immediately when the auth cookie may have changed. */
  invalidateForAuthChange() {
    this.refreshGeneration += 1;
    this.accountGeneration += 1;
    if (this.pendingTimer) this.cancel(this.pendingTimer);
    this.pendingTimer = null;
    if (this.activeAccountId) this.queuedWrites.delete(this.activeAccountId);
  }

  async refresh(forceRemote = true): Promise<void> {
    const refreshGeneration = ++this.refreshGeneration;
    let session: { accountId: string } | null;
    try {
      session = await this.deps.getSession();
    } catch (error) {
      if (refreshGeneration !== this.refreshGeneration) return;
      this.setSnapshot({
        ...this.snapshot,
        status: "error",
        message: error instanceof Error ? error.message : "Could not check the account session.",
      });
      return;
    }
    if (refreshGeneration !== this.refreshGeneration) return;

    if (!session) {
      this.leaveAccount();
      return;
    }

    if (this.activeAccountId === session.accountId && !forceRemote && this.snapshot.status !== "error") {
      return;
    }

    if (this.activeAccountId !== session.accountId) {
      this.enterAccount(session.accountId);
    } else {
      this.identityResolved = true;
      this.bootstrapping = true;
      this.setSnapshot({ ...this.snapshot, status: "syncing", message: "Checking the saved account profile." });
    }
    const accountId = session.accountId;
    const accountGeneration = this.accountGeneration;
    const startingEditGeneration = this.editGeneration;
    let remote: AccountProfileEnvelope;
    try {
      remote = await this.deps.api.read();
    } catch (error) {
      if (refreshGeneration === this.refreshGeneration && this.isCurrent(accountId, accountGeneration)) {
        this.bootstrapping = false;
        this.setSnapshot({
          ...this.snapshot,
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the account profile. Your device copy is preserved.",
        });
      }
      return;
    }
    if (refreshGeneration !== this.refreshGeneration || !this.isCurrent(accountId, accountGeneration)) return;
    if (remote.accountId && remote.accountId !== accountId) {
      this.bootstrapping = false;
      this.setSnapshot({
        ...this.snapshot,
        status: "error",
        message: "The account changed while loading. Your device copy is preserved; refresh to continue.",
      });
      return;
    }
    this.bootstrapping = false;
    this.reconcileRemote(accountId, remote, startingEditGeneration);
  }

  async retry(): Promise<void> {
    this.writeBlocked = false;
    this.conflict = null;
    await this.refresh(true);
  }

  useAccountCopy() {
    if (!this.conflict || !this.activeAccountId) return;
    const accountId = this.activeAccountId;
    const conflict = this.conflict;
    this.conflict = null;
    this.writeBlocked = false;
    this.applyLocal(conflict.account);
    this.writeCache(accountId, {
      profile: conflict.account,
      baseProfile: conflict.account,
      revision: conflict.revision,
    });
    this.setSnapshot({
      status: "saved",
      message: "The account copy is active on this device.",
      accountId,
      legacyImportAvailable: this.snapshot.legacyImportAvailable,
      conflict: null,
    });
  }

  keepLocalCopy() {
    if (!this.conflict || !this.activeAccountId) return;
    const conflict = this.conflict;
    const accountId = this.activeAccountId;
    const local = this.deps.sanitize(this.deps.readLocal());
    this.conflict = null;
    this.writeBlocked = false;
    this.writeCache(accountId, {
      profile: local,
      baseProfile: conflict.account,
      revision: conflict.revision,
    });
    void this.writeRemote(accountId, local, conflict.revision, this.accountGeneration);
  }

  async restoreLegacyBackup(): Promise<void> {
    const accountId = this.activeAccountId;
    if (!accountId || !this.legacyBelongsTo(accountId)) return;
    const legacy = this.readImportProfile(accountId);
    if (!legacy || isPlayerProfileEmpty(legacy)) return;
    const cache = this.readCache(accountId);
    if (!cache?.revision && cache?.baseProfile === null) {
      await this.refresh(true);
      if (this.conflict) return;
    }
    const latestCache = this.readCache(accountId);
    const revision = latestCache?.revision ?? null;
    this.conflict = null;
    this.writeBlocked = false;
    this.applyLocal(legacy);
    this.writeCache(accountId, {
      profile: legacy,
      baseProfile: latestCache?.baseProfile ?? null,
      revision,
    });
    await this.writeRemote(accountId, legacy, revision, this.accountGeneration);
  }

  private reconcileRemote(accountId: string, remote: AccountProfileEnvelope, startingEditGeneration: number) {
    const cache = this.readCache(accountId);
    const local = this.deps.sanitize(this.deps.readLocal());
    const editedDuringRead = this.editGeneration !== startingEditGeneration;
    const importProfile = this.readImportProfile(accountId);
    const canImportLegacy = !!importProfile && !isPlayerProfileEmpty(importProfile) && !samePlayerProfile(importProfile, remote.profile);

    if (editedDuringRead && !samePlayerProfile(local, remote.profile)) {
      this.writeCache(accountId, {
        profile: local,
        baseProfile: cache?.baseProfile ?? null,
        revision: cache?.revision ?? null,
      });
      if (remote.profile) {
        this.setSnapshot({ ...this.snapshot, legacyImportAvailable: canImportLegacy });
        this.setConflict(accountId, local, remote.profile, remote.revision);
      } else {
        void this.writeRemote(accountId, local, null, this.accountGeneration);
      }
      return;
    }

    if (remote.profile) {
      const cacheIsDirty = !!cache && (
        (cache.baseProfile === null && !isPlayerProfileEmpty(cache.profile)) ||
        (cache.baseProfile !== null && !samePlayerProfile(cache.profile, cache.baseProfile))
      );
      if (cacheIsDirty && !samePlayerProfile(cache.profile, remote.profile)) {
        if (cache.baseProfile && samePlayerProfile(remote.profile, cache.baseProfile)) {
          this.writeCache(accountId, { ...cache, revision: remote.revision });
          void this.writeRemote(accountId, cache.profile, remote.revision, this.accountGeneration);
        } else {
          this.setSnapshot({ ...this.snapshot, legacyImportAvailable: canImportLegacy });
          this.setConflict(accountId, cache.profile, remote.profile, remote.revision);
        }
        return;
      }

      this.applyLocal(remote.profile);
      this.writeCache(accountId, {
        profile: remote.profile,
        baseProfile: remote.profile,
        revision: remote.revision,
      });
      this.writeBlocked = false;
      this.setSnapshot({
        status: "saved",
        message: "Your account profile is saved and active on this device.",
        accountId,
        legacyImportAvailable: canImportLegacy,
        conflict: null,
      });
      return;
    }

    if (cache && !isPlayerProfileEmpty(cache.profile)) {
      this.applyLocal(cache.profile);
      this.writeCache(accountId, { ...cache, revision: null });
      void this.writeRemote(accountId, cache.profile, null, this.accountGeneration);
      return;
    }

    const legacy = canImportLegacy ? importProfile : null;
    if (legacy && !isPlayerProfileEmpty(legacy)) {
      this.applyLocal(legacy);
      this.writeCache(accountId, { profile: legacy, baseProfile: null, revision: null });
      void this.writeRemote(accountId, legacy, null, this.accountGeneration);
      return;
    }

    const empty = this.emptyProfile();
    this.applyLocal(empty);
    this.writeCache(accountId, { profile: empty, baseProfile: null, revision: null });
    this.writeBlocked = false;
    this.setSnapshot({
      status: "saved",
      message: "Account profile ready; there is no saved profile yet.",
      accountId,
      legacyImportAvailable: false,
      conflict: null,
    });
  }

  private enterAccount(accountId: string) {
    const previousAccountId = this.activeAccountId;
    this.persistActiveCache();
    if (previousAccountId) this.queuedWrites.delete(previousAccountId);
    this.accountGeneration += 1;
    this.activeAccountId = accountId;
    this.identityResolved = true;
    this.bootstrapping = true;
    this.writeBlocked = false;
    this.conflict = null;
    if (this.pendingTimer) this.cancel(this.pendingTimer);
    this.pendingTimer = null;
    this.captureLegacyForFirstAccount(accountId);
    this.deps.setScope?.(accountId);
    const cache = this.readCache(accountId);
    this.applyLocal(cache?.profile ?? (this.legacyBelongsTo(accountId) ? this.readImportProfile(accountId) : null) ?? this.emptyProfile(), true);
    this.setSnapshot({
      status: "syncing",
      message: "Checking the saved account profile.",
      accountId,
      legacyImportAvailable: false,
      conflict: null,
    });
  }

  private leaveAccount() {
    if (!this.activeAccountId) {
      this.identityResolved = true;
      this.ensureAnonymousProfile();
      this.setSnapshot({
        status: "device",
        message: "This profile is stored on this device.",
        accountId: null,
        legacyImportAvailable: false,
        conflict: null,
      });
      return;
    }
    this.persistActiveCache();
    this.accountGeneration += 1;
    this.activeAccountId = null;
    this.identityResolved = true;
    this.bootstrapping = false;
    this.writeBlocked = false;
    this.conflict = null;
    if (this.pendingTimer) this.cancel(this.pendingTimer);
    this.pendingTimer = null;
    this.deps.setScope?.(null);
    const anonymous = this.readAnonymousProfile() ?? this.emptyProfile();
    this.applyLocal(anonymous, true);
    this.setSnapshot({
      status: "device",
      message: "This profile is stored on this device.",
      accountId: null,
      legacyImportAvailable: false,
      conflict: null,
    });
  }

  private captureLegacyForFirstAccount(accountId: string) {
    let owner: string | null = null;
    try {
      const raw = this.deps.storage.getItem(LEGACY_BACKUP_KEY);
      const envelopeOwner = raw ? (JSON.parse(raw) as { owner?: unknown }).owner : null;
      owner = typeof envelopeOwner === "string"
        ? envelopeOwner
        : this.deps.storage.getItem(LEGACY_OWNER_KEY) ?? this.memoryLegacyOwner;
    } catch {
      owner = this.memoryLegacyOwner;
    }
    if (owner) {
      this.memoryLegacyOwner = owner;
      return;
    }
    const initialLocal = this.deps.sanitize(this.deps.readLocal());
    this.memoryLegacyOwner = accountId;
    this.memoryLegacyBackup = initialLocal;
    this.memoryAnonymousProfile ??= initialLocal;
    try {
      this.deps.storage.setItem(LEGACY_BACKUP_KEY, JSON.stringify({ owner: accountId, profile: initialLocal }));
    } catch {
      // The profile stays available in memory if browser storage is full.
    }
    try {
      if (this.deps.storage.getItem(ANONYMOUS_PROFILE_KEY) === null) {
        this.deps.storage.setItem(ANONYMOUS_PROFILE_KEY, JSON.stringify(initialLocal));
      }
    } catch {
      // The profile stays available in memory if browser storage is full.
    }
    try {
      this.deps.storage.setItem(LEGACY_OWNER_KEY, accountId);
    } catch {
      // The profile stays available in memory if browser storage is full.
    }
  }

  private legacyBelongsTo(accountId: string) {
    try {
      const raw = this.deps.storage.getItem(LEGACY_BACKUP_KEY);
      const envelopeOwner = raw ? (JSON.parse(raw) as { owner?: unknown }).owner : null;
      const owner = typeof envelopeOwner === "string"
        ? envelopeOwner
        : this.deps.storage.getItem(LEGACY_OWNER_KEY) ?? this.memoryLegacyOwner;
      return owner === accountId;
    } catch {
      return this.memoryLegacyOwner === accountId;
    }
  }

  private readLegacyBackup(): PlayerProfile | null {
    try {
      const raw = this.deps.storage.getItem(LEGACY_BACKUP_KEY);
      if (!raw) return this.memoryLegacyBackup;
      const parsed = JSON.parse(raw) as { profile?: unknown };
      return this.deps.sanitize(parsed && typeof parsed === "object" && "profile" in parsed ? parsed.profile : parsed);
    } catch {
      return this.memoryLegacyBackup ?? null;
    }
  }

  private readAnonymousProfile(): PlayerProfile | null {
    try {
      const raw = this.deps.storage.getItem(ANONYMOUS_PROFILE_KEY);
      if (!raw) return this.memoryAnonymousProfile;
      return this.deps.sanitize(JSON.parse(raw));
    } catch {
      return this.memoryAnonymousProfile;
    }
  }

  private ensureAnonymousProfile() {
    this.memoryAnonymousProfile = this.deps.sanitize(this.deps.readLocal());
    try {
      if (this.deps.storage.getItem(ANONYMOUS_PROFILE_KEY) !== null) return;
      this.deps.storage.setItem(ANONYMOUS_PROFILE_KEY, JSON.stringify(this.memoryAnonymousProfile));
    } catch {
      // The profile remains available through the page's in-memory store.
    }
  }

  private readImportProfile(accountId: string): PlayerProfile | null {
    if (!this.legacyBelongsTo(accountId)) return null;
    return this.readAnonymousProfile() ?? this.readLegacyBackup();
  }

  private readCache(accountId: string): AccountCache | null {
    const key = accountCacheKey(accountId);
    if (this.failedCacheWrites.has(accountId)) return this.cacheFallback.get(accountId) ?? null;
    try {
      const raw = this.deps.storage.getItem(key);
      if (!raw) return this.cacheFallback.get(accountId) ?? null;
      const parsed = JSON.parse(raw) as Partial<AccountCache>;
      if (!parsed || !("profile" in parsed)) return this.cacheFallback.get(accountId) ?? null;
      const cache = {
        profile: this.deps.sanitize(parsed.profile),
        baseProfile: parsed.baseProfile == null ? null : this.deps.sanitize(parsed.baseProfile),
        revision: typeof parsed.revision === "string" ? parsed.revision : null,
      };
      this.cacheFallback.set(accountId, cache);
      return cache;
    } catch {
      return this.cacheFallback.get(accountId) ?? null;
    }
  }

  private writeCache(accountId: string, cache: AccountCache) {
    const safe = {
      profile: this.deps.sanitize(cache.profile),
      baseProfile: cache.baseProfile === null ? null : this.deps.sanitize(cache.baseProfile),
      revision: cache.revision,
    };
    this.cacheFallback.set(accountId, safe);
    try {
      this.deps.storage.setItem(accountCacheKey(accountId), JSON.stringify(safe));
      this.failedCacheWrites.delete(accountId);
    } catch {
      this.failedCacheWrites.add(accountId);
      if (this.activeAccountId === accountId) {
        this.setSnapshot({
          ...this.snapshot,
          status: "error",
          message: "The account copy is active, but this device could not cache it. Keep this tab open until sync completes.",
        });
      }
    }
  }

  private persistActiveCache() {
    if (!this.activeAccountId) return;
    const id = this.activeAccountId;
    const previous = this.readCache(id);
    this.writeCache(id, {
      profile: this.deps.sanitize(this.deps.readLocal()),
      baseProfile: previous?.baseProfile ?? null,
      revision: previous?.revision ?? null,
    });
  }

  private onLocalChange() {
    if (this.suppressLocalEvents) return;
    const local = this.deps.sanitize(this.deps.readLocal());
    if (this.lastObservedLocal && samePlayerProfile(local, this.lastObservedLocal)) return;
    this.lastObservedLocal = local;
    this.editGeneration += 1;
    if (!this.activeAccountId) {
      if (this.identityResolved) {
        this.memoryAnonymousProfile = local;
        try {
          this.deps.storage.setItem(ANONYMOUS_PROFILE_KEY, JSON.stringify(local));
        } catch {
          // The anonymous profile remains in the active tab's memory.
        }
      }
      return;
    }
    const accountId = this.activeAccountId;
    this.accountEditGenerations.set(accountId, (this.accountEditGenerations.get(accountId) ?? 0) + 1);
    const previous = this.readCache(accountId);
    this.writeCache(accountId, {
      profile: local,
      baseProfile: previous?.baseProfile ?? null,
      revision: previous?.revision ?? null,
    });
    if (this.conflict) {
      this.conflict.local = local;
      this.setSnapshot({
        ...this.snapshot,
        conflict: { local, account: this.conflict.account },
      });
      return;
    }
    if (this.bootstrapping || this.writeBlocked) return;
    if (this.pendingTimer) this.cancel(this.pendingTimer);
    const accountGeneration = this.accountGeneration;
    this.pendingTimer = this.schedule(() => {
      this.pendingTimer = null;
      if (!this.isCurrent(accountId, accountGeneration) || this.conflict || this.writeBlocked) return;
      const cache = this.readCache(accountId);
      if (!cache || samePlayerProfile(cache.profile, cache.baseProfile)) return;
      void this.writeRemote(accountId, cache.profile, cache.revision, accountGeneration);
    }, 350);
    this.setSnapshot({
      ...this.snapshot,
      status: "syncing",
      message: "Saving your account profile.",
    });
  }

  private onExternalStorageChange(key: string | null) {
    if (!this.identityResolved) return;
    if (this.activeAccountId) {
      const accountId = this.activeAccountId;
      const activeStorageKey = this.deps.currentStorageKey?.();
      if (key === null || key === accountCacheKey(accountId)) {
        const cache = this.readCache(accountId);
        if (cache && !samePlayerProfile(cache.profile, this.deps.readLocal())) this.applyLocal(cache.profile);
        void this.refresh(true);
      } else if (key === activeStorageKey) {
        void this.refresh(true);
      } else if (key === ANONYMOUS_PROFILE_KEY) {
        void this.refresh(true);
      }
      return;
    }
    if (key === null || key === ANONYMOUS_PROFILE_KEY || key === this.deps.currentStorageKey?.()) {
      const anonymous = this.readAnonymousProfile();
      if (anonymous && !samePlayerProfile(anonymous, this.deps.readLocal())) this.applyLocal(anonymous);
    }
  }

  private async writeRemote(
    accountId: string,
    profile: PlayerProfile,
    revision: string | null,
    accountGeneration: number,
  ): Promise<void> {
    if (!this.isCurrent(accountId, accountGeneration)) return;
    const pending = this.inFlightWrites.get(accountId);
    if (pending) {
      this.queuedWrites.set(accountId, { profile, revision, generation: accountGeneration });
      return pending;
    }
    const operation = this.performWrite(accountId, profile, revision, accountGeneration);
    this.inFlightWrites.set(accountId, operation);
    try {
      await operation;
    } finally {
      if (this.inFlightWrites.get(accountId) === operation) this.inFlightWrites.delete(accountId);
      const queued = this.queuedWrites.get(accountId);
      this.queuedWrites.delete(accountId);
      if (queued && this.isCurrent(accountId, queued.generation) && !this.writeBlocked && !this.conflict) {
        const cache = this.readCache(accountId);
        const latest = this.deps.sanitize(this.deps.readLocal());
        if (!samePlayerProfile(latest, cache?.baseProfile ?? null)) {
          void this.writeRemote(accountId, latest, cache?.revision ?? queued.revision, queued.generation);
        }
      }
    }
  }

  private async performWrite(
    accountId: string,
    profile: PlayerProfile,
    revision: string | null,
    accountGeneration: number,
  ): Promise<void> {
    if (!this.isCurrent(accountId, accountGeneration)) return;
    this.setSnapshot({
      ...this.snapshot,
      status: "syncing",
      message: "Saving your account profile.",
    });
    const startingEditGeneration = this.accountEditGenerations.get(accountId) ?? 0;
    try {
      const result = await this.deps.api.write(profile, revision, accountId);
      const latest = this.readCache(accountId);
      const latestProfile = this.activeAccountId === accountId
        ? this.deps.sanitize(this.deps.readLocal())
        : latest?.profile ?? profile;
      const changedDuringWrite = this.activeAccountId === accountId
        ? (this.accountEditGenerations.get(accountId) ?? 0) !== startingEditGeneration
        : !samePlayerProfile(latestProfile, profile);

      if (result.kind === "conflict") {
        const current = result.current;
        if (current.accountId && current.accountId !== accountId) {
          if (this.isCurrent(accountId, accountGeneration)) {
            this.writeBlocked = true;
            this.setSnapshot({
              ...this.snapshot,
              status: "error",
              message: "The account changed while saving. Your device copy is preserved; refresh to continue.",
            });
          }
          return;
        }
        const local = latestProfile;
        this.writeCache(accountId, {
          profile: local,
          baseProfile: latest?.baseProfile ?? null,
          revision: latest?.revision ?? null,
        });
        if (this.isCurrent(accountId, accountGeneration)) {
          if (current.profile) this.setConflict(accountId, local, current.profile, current.revision);
          else {
            this.writeBlocked = true;
            this.setSnapshot({
              ...this.snapshot,
              status: "error",
              message: "The account profile changed while saving. Your device copy is preserved; refresh and retry.",
            });
          }
        }
        return;
      }

      if (result.accountId && result.accountId !== accountId) {
        if (this.isCurrent(accountId, accountGeneration)) {
          this.writeBlocked = true;
          this.setSnapshot({
            ...this.snapshot,
            status: "error",
            message: "The account changed while saving. Your device copy is preserved; refresh to continue.",
          });
        }
        return;
      }

      this.writeCache(accountId, {
        profile: latestProfile,
        baseProfile: profile,
        revision: result.revision,
      });
      if (!this.isCurrent(accountId, accountGeneration)) return;

      if (changedDuringWrite) {
        this.queuedWrites.set(accountId, {
          profile: latestProfile,
          revision: result.revision,
          generation: accountGeneration,
        });
        return;
      }
      this.writeBlocked = false;
      this.setSnapshot({
        status: "saved",
        message: "Your account profile is saved.",
        accountId,
        legacyImportAvailable: this.snapshot.legacyImportAvailable,
        conflict: null,
      });
    } catch (error) {
      const latest = this.readCache(accountId);
      this.writeCache(accountId, {
        profile: this.activeAccountId === accountId ? this.deps.sanitize(this.deps.readLocal()) : latest?.profile ?? profile,
        baseProfile: latest?.baseProfile ?? null,
        revision: latest?.revision ?? revision,
      });
      if (this.isCurrent(accountId, accountGeneration)) {
        this.writeBlocked = true;
        this.setSnapshot({
          ...this.snapshot,
          status: "error",
          message: error instanceof Error ? error.message : "Could not save the account profile. Your device copy is preserved.",
        });
      }
    }
  }

  private setConflict(accountId: string, local: PlayerProfile, account: PlayerProfile, revision: string | null) {
    this.conflict = { local, account, revision };
    this.writeBlocked = true;
    this.setSnapshot({
      status: "conflict",
      message: "This device and account have different profile changes. Choose which copy to use.",
      accountId,
      legacyImportAvailable: this.snapshot.legacyImportAvailable,
      conflict: { local, account },
    });
  }

  private applyLocal(profile: PlayerProfile, force = false) {
    const safe = this.deps.sanitize(profile);
    const current = this.deps.sanitize(this.deps.readLocal());
    if (!force && samePlayerProfile(current, safe)) {
      this.lastObservedLocal = safe;
      return;
    }
    this.suppressLocalEvents += 1;
    try {
      this.deps.writeLocal(safe);
      this.lastObservedLocal = safe;
    } finally {
      this.suppressLocalEvents -= 1;
    }
  }

  private emptyProfile(): PlayerProfile {
    return this.deps.sanitize({ version: 1, equipment: {}, characters: [], valuables: {} });
  }

  private isCurrent(accountId: string, accountGeneration: number) {
    return this.activeAccountId === accountId && this.accountGeneration === accountGeneration;
  }

  private setSnapshot(snapshot: AccountProfileSyncSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

export const PROFILE_SYNC_STORAGE_KEYS = {
  legacyBackup: LEGACY_BACKUP_KEY,
  legacyOwner: LEGACY_OWNER_KEY,
  accountCachePrefix: CACHE_PREFIX,
} as const;
