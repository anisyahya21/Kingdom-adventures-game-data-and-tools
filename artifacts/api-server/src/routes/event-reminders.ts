import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import webpush, { type PushSubscription } from "web-push";

const router = Router();
const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "event-reminder-subscriptions.json");
const VAPID_KEY_FILE = path.join(DATA_DIR, "event-reminder-vapid-keys.json");
const DB_STORE_KEY = "ka_event_reminder_subscriptions_v1";
const DB_VAPID_KEY = "ka_event_reminder_vapid_v1";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_DUE_GRACE_MS = 60 * 60 * 1000;
const DEFAULT_AUTO_LOOKAHEAD_MS = 60 * 1000;
const WEEKLY_ANCHOR_START = Date.parse("2026-04-05T00:00:00+09:00");
const WAIRO_DUNGEON_SCHEDULE = [
  { day: 1, hour: 9 }, { day: 1, hour: 13 }, { day: 1, hour: 18 },
  { day: 2, hour: 15 }, { day: 2, hour: 23 },
  { day: 3, hour: 12 }, { day: 3, hour: 17 },
  { day: 4, hour: 19 },
  { day: 5, hour: 21 }, { day: 5, hour: 6 },
  { day: 6, hour: 8 },
  { day: 7, hour: 12 },
  { day: 8, hour: 14 },
  { day: 9, hour: 19 },
  { day: 10, hour: 22 },
  { day: 11, hour: 21 },
  { day: 12, hour: 16 },
  { day: 13, hour: 11 },
  { day: 14, hour: 19 },
  { day: 15, hour: 20 },
  { day: 16, hour: 8 },
  { day: 17, hour: 16 },
  { day: 18, hour: 20 },
  { day: 19, hour: 22 },
  { day: 20, hour: 1 },
  { day: 21, hour: 17 },
  { day: 22, hour: 16 },
  { day: 23, hour: 19 },
  { day: 24, hour: 11 },
  { day: 25, hour: 23 },
  { day: 26, hour: 0 },
  { day: 27, hour: 11 },
  { day: 28, hour: 16 },
  { day: 29, hour: 14 },
  { day: 30, hour: 15 }, { day: 30, hour: 22 },
  { day: 31, hour: 10 }, { day: 31, hour: 21 },
];

type ReminderMode = "start" | "one-hour-and-start";
type GachaEvent = {
  id: string;
  kind: string;
  title: string;
  poolLabel: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  notes?: string;
};
type ReminderDefinition =
  | { type: "gacha"; event: GachaEvent }
  | { type: "wairo"; event?: { day: number; hour: number } }
  | { type: "weekly-conquest" };

type ReminderChannels = {
  push: boolean;
  telegram: boolean;
  discord: boolean;
};

type ReminderTargets = {
  telegramChatId?: string;
};

type DiscordConnection = {
  clientId: string;
  userId: string;
  username: string;
  connectedAt: number;
  updatedAt: number;
  lastDmError?: string;
  lastDmErrorAt?: number;
};

type ReminderSubscription = {
  id: string;
  clientId: string;
  clientTimeZoneOffsetMinutes?: number;
  endpoint?: string;
  pushSubscription?: PushSubscription;
  subscriptionId: string;
  title: string;
  offsetHours: number;
  mode: ReminderMode;
  definition: ReminderDefinition;
  channels: ReminderChannels;
  targets: ReminderTargets;
  createdAt: number;
  updatedAt: number;
  sentKeys: string[];
};

type Store = {
  subscriptions: ReminderSubscription[];
  discordConnections: DiscordConnection[];
};

type VapidKeyPair = {
  publicKey: string;
  privateKey: string;
};

type DbModule = typeof import("@workspace/db");

let dbModule: DbModule | null = null;
let persistenceMode: "database" | "file" = "file";
let storeCache: Store = readStoreFromFile();
let lastStoreSnapshot = serializeStore(storeCache);
let cachedVapidKeys: VapidKeyPair | null = null;
let autoSchedulerStarted = false;
let autoSchedulerBusy = false;

const DISCORD_DM_FAILURE_MESSAGE = "Discord DM failed — check privacy settings or shared server access.";
const OAUTH_STATE_SECRET = process.env.DISCORD_OAUTH_STATE_SECRET || crypto.randomBytes(32).toString("hex");
const MISSING_DISCORD_BOT_TOKEN_MESSAGE = "missing DISCORD_BOT_TOKEN";
const MISSING_DISCORD_CLIENT_ID_MESSAGE = "missing DISCORD_CLIENT_ID";
const MISSING_DISCORD_CLIENT_SECRET_MESSAGE = "missing DISCORD_CLIENT_SECRET";
const REDIRECT_URI_MISMATCH_MESSAGE = "redirect URI mismatch";

type DiscordHealth = {
  botTokenConfigured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  oauthStateSecretConfigured: boolean;
  missingErrors: string[];
  oauthReady: boolean;
  dmReady: boolean;
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function isStoreEmpty(store: Store | null | undefined) {
  return !store || !Array.isArray(store.subscriptions) || store.subscriptions.length === 0;
}

function sanitizeStoreCandidate(value: unknown): Store | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<Store>;
  return {
    subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
    discordConnections: Array.isArray(parsed.discordConnections) ? parsed.discordConnections : [],
  };
}

function sanitizeVapidCandidate(value: unknown): VapidKeyPair | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<VapidKeyPair>;
  if (!parsed.publicKey || !parsed.privateKey) return null;
  return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
}

function readStoreFromFile(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as Partial<Store>;
    return {
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      discordConnections: Array.isArray(parsed.discordConnections) ? parsed.discordConnections : [],
    };
  } catch {
    return { subscriptions: [], discordConnections: [] };
  }
}

function writeStoreFile(store: Store) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function serializeStore(store: Store): string | null {
  try {
    return JSON.stringify(store);
  } catch {
    return null;
  }
}

async function initDbModule() {
  if (!process.env.DATABASE_URL) return;
  try {
    dbModule = await import("@workspace/db");
  } catch (error) {
    console.warn("event-reminders: database module unavailable, using file fallback", error);
  }
}

async function readStoreFromDb(): Promise<Store | null> {
  if (!dbModule) return null;
  try {
    const rows = await dbModule.db
      .select({ value: dbModule.appStateTable.value })
      .from(dbModule.appStateTable)
      .where(eq(dbModule.appStateTable.key, DB_STORE_KEY))
      .limit(1);
    if (!rows.length) return null;
    return sanitizeStoreCandidate(rows[0].value);
  } catch (error) {
    console.warn("event-reminders: failed reading subscriptions from database", error);
    return null;
  }
}

async function writeStoreToDb(store: Store): Promise<boolean> {
  if (!dbModule) return false;
  try {
    await dbModule.db
      .insert(dbModule.appStateTable)
      .values({
        key: DB_STORE_KEY,
        value: store as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dbModule.appStateTable.key,
        set: {
          value: store as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
    return true;
  } catch (error) {
    console.warn("event-reminders: failed writing subscriptions to database", error);
    return false;
  }
}

async function readVapidFromDb(): Promise<VapidKeyPair | null> {
  if (!dbModule) return null;
  try {
    const rows = await dbModule.db
      .select({ value: dbModule.appStateTable.value })
      .from(dbModule.appStateTable)
      .where(eq(dbModule.appStateTable.key, DB_VAPID_KEY))
      .limit(1);
    if (!rows.length) return null;
    return sanitizeVapidCandidate(rows[0].value);
  } catch (error) {
    console.warn("event-reminders: failed reading VAPID keys from database", error);
    return null;
  }
}

async function writeVapidToDb(keys: VapidKeyPair): Promise<boolean> {
  if (!dbModule) return false;
  try {
    await dbModule.db
      .insert(dbModule.appStateTable)
      .values({
        key: DB_VAPID_KEY,
        value: keys as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dbModule.appStateTable.key,
        set: {
          value: keys as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
    return true;
  } catch (error) {
    console.warn("event-reminders: failed writing VAPID keys to database", error);
    return false;
  }
}

function readStore(): Store {
  return storeCache;
}

async function writeStore(store: Store) {
  const nextSnapshot = serializeStore(store);
  if (nextSnapshot !== null && lastStoreSnapshot !== null && nextSnapshot === lastStoreSnapshot) {
    return;
  }

  storeCache = store;
  lastStoreSnapshot = nextSnapshot;
  if (persistenceMode === "database") {
    const persisted = await writeStoreToDb(store);
    if (persisted) return;
    persistenceMode = "file";
    console.info("event-reminders: persistence mode=file fallback");
  }
  writeStoreFile(store);
}

function normalizeOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(23, Math.max(-23, parsed));
}

function normalizeTimeZoneOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(840, Math.max(-840, parsed));
}

function normalizeChannels(value: unknown): ReminderChannels {
  const parsed = (value || {}) as Partial<ReminderChannels>;
  return {
    push: Boolean(parsed.push),
    telegram: Boolean(parsed.telegram),
    discord: Boolean(parsed.discord),
  };
}

function hasAnyChannel(channels: ReminderChannels) {
  return channels.push || channels.telegram || channels.discord;
}

function normalizeTargets(value: unknown): ReminderTargets {
  const parsed = (value || {}) as Partial<ReminderTargets>;
  return {
    telegramChatId: typeof parsed.telegramChatId === "string" ? parsed.telegramChatId.trim() : undefined,
  };
}

function isDiscordConnected(store: Store, clientId: string) {
  return Boolean(store.discordConnections.find((connection) => connection.clientId === clientId));
}

function getDiscordConnection(store: Store, clientId: string) {
  return store.discordConnections.find((connection) => connection.clientId === clientId);
}

function upsertDiscordConnection(store: Store, next: DiscordConnection) {
  store.discordConnections = [
    ...store.discordConnections.filter((connection) => connection.clientId !== next.clientId),
    next,
  ];
}

function clearDiscordConnection(store: Store, clientId: string) {
  store.discordConnections = store.discordConnections.filter((connection) => connection.clientId !== clientId);
}

function updateDiscordDmError(store: Store, clientId: string, error?: string) {
  const existing = getDiscordConnection(store, clientId);
  if (!existing) return;

  const normalizedError = error?.trim() || undefined;
  const currentError = existing.lastDmError?.trim() || undefined;
  const currentErrorAt = existing.lastDmErrorAt;

  // Skip no-op updates so the auto-scheduler does not churn DB writes.
  if (normalizedError === currentError) {
    if (!normalizedError && currentErrorAt === undefined) return;
    if (normalizedError && currentErrorAt !== undefined) return;
  }

  const next: DiscordConnection = {
    ...existing,
    updatedAt: Date.now(),
    lastDmError: normalizedError,
    lastDmErrorAt: normalizedError ? Date.now() : undefined,
  };
  upsertDiscordConnection(store, next);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signDiscordState(payload: string) {
  return crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(payload).digest("hex");
}

function createDiscordState(clientId: string, returnTo: string) {
  const payload = JSON.stringify({
    clientId,
    returnTo,
    exp: Date.now() + 10 * 60 * 1000,
  });
  const encoded = base64UrlEncode(payload);
  const signature = signDiscordState(encoded);
  return `${encoded}.${signature}`;
}

function parseDiscordState(state: string): { clientId: string; returnTo: string } | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = signDiscordState(encoded);
  if (expected !== signature) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as { clientId?: string; returnTo?: string; exp?: number };
    if (!parsed.clientId || !parsed.returnTo || !parsed.exp || parsed.exp < Date.now()) return null;
    return { clientId: parsed.clientId, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

function isValidTelegramChatId(chatId: string) {
  return /^-?\d{5,20}$/.test(chatId);
}

function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PushSubscription;
  return Boolean(candidate.endpoint && candidate.keys?.auth && candidate.keys?.p256dh);
}

function isValidDefinition(value: unknown): value is ReminderDefinition {
  if (!value || typeof value !== "object") return false;
  const definition = value as ReminderDefinition;
  if (definition.type === "weekly-conquest") return true;
  if (definition.type === "wairo") return true;
  if (definition.type === "gacha") {
    const event = definition.event;
    return Boolean(event?.id && event.title && Number.isFinite(event.startMonth) && Number.isFinite(event.startDay) && Number.isFinite(event.endMonth) && Number.isFinite(event.endDay));
  }
  return false;
}

function subscriptionHash(clientId: string, subscriptionId: string) {
  return crypto.createHash("sha256").update(`${clientId}:${subscriptionId}`).digest("hex");
}

async function configureWebPush() {
  const keyPair = await getVapidKeys();
  const publicKey = keyPair?.publicKey;
  const privateKey = keyPair?.privateKey;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function readGeneratedVapidKeys(): VapidKeyPair | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(VAPID_KEY_FILE, "utf8")) as Partial<VapidKeyPair>;
    if (parsed.publicKey && parsed.privateKey) return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
  } catch {
    // Missing generated keys are expected on first boot.
  }
  return null;
}

function writeGeneratedVapidKeys(keys: VapidKeyPair) {
  ensureDataDir();
  fs.writeFileSync(VAPID_KEY_FILE, JSON.stringify(keys, null, 2));
}

async function getVapidKeys(): Promise<VapidKeyPair | null> {
  const envPublicKey = process.env.VAPID_PUBLIC_KEY;
  const envPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (envPublicKey && envPrivateKey) {
    cachedVapidKeys = { publicKey: envPublicKey, privateKey: envPrivateKey };
    return cachedVapidKeys;
  }

  if (cachedVapidKeys) return cachedVapidKeys;

  if (persistenceMode === "database") {
    const dbKeys = await readVapidFromDb();
    if (dbKeys) {
      cachedVapidKeys = dbKeys;
      return cachedVapidKeys;
    }
  }

  const fileKeys = readGeneratedVapidKeys();
  if (fileKeys) {
    cachedVapidKeys = fileKeys;
    if (persistenceMode === "database") {
      const persisted = await writeVapidToDb(cachedVapidKeys);
      if (!persisted) {
        persistenceMode = "file";
        console.info("event-reminders: persistence mode=file fallback");
      }
    }
    return cachedVapidKeys;
  }

  const freshKeys = webpush.generateVAPIDKeys();
  cachedVapidKeys = { publicKey: freshKeys.publicKey, privateKey: freshKeys.privateKey };

  if (persistenceMode === "database") {
    const persisted = await writeVapidToDb(cachedVapidKeys);
    if (persisted) {
      return cachedVapidKeys;
    }
    persistenceMode = "file";
    console.info("event-reminders: persistence mode=file fallback");
  }

  writeGeneratedVapidKeys(cachedVapidKeys);
  return cachedVapidKeys;
}

async function bootstrapEventReminderPersistence() {
  try {
    await initDbModule();
    if (!dbModule) {
      persistenceMode = "file";
      console.info("event-reminders: persistence mode=file fallback");
      return;
    }

    const dbStore = await readStoreFromDb();
    if (isStoreEmpty(dbStore)) {
      const fileStore = readStoreFromFile();
      if (!isStoreEmpty(fileStore)) {
        storeCache = fileStore;
        const migrated = await writeStoreToDb(storeCache);
        if (!migrated) throw new Error("failed migrating reminder subscriptions to database");
        console.info("event-reminders: migrated file snapshot to database");
      } else {
        const seeded = await writeStoreToDb(storeCache);
        if (!seeded) throw new Error("failed seeding reminder subscriptions in database");
      }
    } else if (dbStore) {
      storeCache = dbStore;
    }

    lastStoreSnapshot = serializeStore(storeCache);

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      const dbKeys = await readVapidFromDb();
      if (dbKeys) {
        cachedVapidKeys = dbKeys;
      } else {
        const fileKeys = readGeneratedVapidKeys();
        if (fileKeys) {
          cachedVapidKeys = fileKeys;
          const migratedKeys = await writeVapidToDb(fileKeys);
          if (!migratedKeys) throw new Error("failed migrating VAPID keys to database");
        }
      }
    }

    persistenceMode = "database";
    console.info("event-reminders: persistence mode=database");
  } catch (error) {
    persistenceMode = "file";
    console.warn("event-reminders: database initialization failed, using file fallback", error);
    console.info("event-reminders: persistence mode=file fallback");
  }
}

void bootstrapEventReminderPersistence();

function eventClockDateToLocalDate(date: Date, offset: number) {
  return new Date(date.getTime() - offset * HOUR_MS);
}

function isValidDayInMonth(year: number, month: number, day: number) {
  const monthAnchor = new Date(Date.UTC(year, month, 1));
  const candidate = new Date(Date.UTC(year, month, day));
  return (
    candidate.getUTCFullYear() === monthAnchor.getUTCFullYear()
    && candidate.getUTCMonth() === monthAnchor.getUTCMonth()
    && candidate.getUTCDate() === day
  );
}

function eventClockDateToLocalDateForClient(
  year: number,
  month: number,
  day: number,
  hour: number,
  offsetHours: number,
  clientTimeZoneOffsetMinutes?: number,
) {
  if (clientTimeZoneOffsetMinutes === undefined) {
    return eventClockDateToLocalDate(new Date(year, month, day, hour, 0, 0, 0), offsetHours);
  }

  const eventClockLocalMs = Date.UTC(year, month, day, hour, 0, 0, 0)
    + clientTimeZoneOffsetMinutes * 60_000;
  return new Date(eventClockLocalMs - offsetHours * HOUR_MS);
}

function eventClockNowYearMonth(now: Date, offsetHours: number, clientTimeZoneOffsetMinutes?: number) {
  if (clientTimeZoneOffsetMinutes === undefined) {
    const adjusted = new Date(now.getTime() + offsetHours * HOUR_MS);
    return { year: adjusted.getFullYear(), month: adjusted.getMonth() };
  }

  const adjustedMs = now.getTime() + offsetHours * HOUR_MS - clientTimeZoneOffsetMinutes * 60_000;
  const adjusted = new Date(adjustedMs);
  return { year: adjusted.getUTCFullYear(), month: adjusted.getUTCMonth() };
}

function gachaStartForYear(event: GachaEvent, year: number, offset: number) {
  return eventClockDateToLocalDate(new Date(year, event.startMonth - 1, event.startDay, 0, 0, 0, 0), offset);
}

function nextGachaStart(event: GachaEvent, now: Date, offset: number) {
  const adjustedYear = new Date(now.getTime() + offset * HOUR_MS).getFullYear();
  return [adjustedYear - 1, adjustedYear, adjustedYear + 1, adjustedYear + 2]
    .map((year) => gachaStartForYear(event, year, offset))
    .filter((date) => date.getTime() >= now.getTime() - 5 * 60 * 1000)
    .sort((a, b) => a.getTime() - b.getTime())[0];
}

function wairoNotificationTimes(subscription: ReminderSubscription, now: Date) {
  const offset = subscription.offsetHours;
  const clientTimeZoneOffsetMinutes = subscription.clientTimeZoneOffsetMinutes;
  const eventClockNow = eventClockNowYearMonth(now, offset, clientTimeZoneOffsetMinutes);
  const candidates: Array<{ kind: string; at: Date }> = [];
  for (let monthOffset = -1; monthOffset <= 2; monthOffset += 1) {
    const year = eventClockNow.year;
    const month = eventClockNow.month + monthOffset;
    for (const entry of WAIRO_DUNGEON_SCHEDULE) {
      if (!isValidDayInMonth(year, month, entry.day)) continue;
      const startAt = eventClockDateToLocalDateForClient(
        year,
        month,
        entry.day,
        entry.hour,
        offset,
        clientTimeZoneOffsetMinutes,
      );
      candidates.push({ kind: "start", at: startAt });
      if (subscription.mode === "one-hour-and-start") {
        candidates.push({ kind: "one-hour", at: new Date(startAt.getTime() - HOUR_MS) });
      }
    }
  }
  return candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function nextWeeklyConquestStart(now: Date, offsetHours: number) {
  const eventClockNow = new Date(now.getTime() + offsetHours * HOUR_MS);
  const cycle = Math.floor((eventClockNow.getTime() - WEEKLY_ANCHOR_START) / (7 * DAY_MS)) + 1;
  return new Date(WEEKLY_ANCHOR_START + cycle * 7 * DAY_MS - offsetHours * HOUR_MS);
}

function notificationTimes(subscription: ReminderSubscription, now: Date) {
  if (subscription.definition.type === "wairo") return wairoNotificationTimes(subscription, now);

  const offset = subscription.offsetHours;
  let startAt: Date | undefined;
  if (subscription.definition.type === "gacha") startAt = nextGachaStart(subscription.definition.event, now, offset);
  if (subscription.definition.type === "weekly-conquest") startAt = nextWeeklyConquestStart(now, offset);
  if (!startAt) return [];

  const times = [{ kind: "start", at: startAt }];
  if (subscription.mode === "one-hour-and-start") {
    times.unshift({ kind: "one-hour", at: new Date(startAt.getTime() - HOUR_MS) });
  }
  return times;
}

function dueGraceMs() {
  const raw = Number(process.env.EVENT_REMINDER_DUE_GRACE_MS || DEFAULT_DUE_GRACE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DUE_GRACE_MS;
}

function autoLookAheadMs() {
  const raw = Number(process.env.EVENT_REMINDER_AUTO_LOOKAHEAD_MS || DEFAULT_AUTO_LOOKAHEAD_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUTO_LOOKAHEAD_MS;
}

function nextNotificationPreview(subscription: ReminderSubscription, now: Date, limit = 3) {
  return notificationTimes(subscription, now)
    .filter(({ at }) => at.getTime() >= now.getTime() - dueGraceMs())
    .slice(0, limit)
    .map(({ kind, at }) => ({
      kind,
      at: at.toISOString(),
      inMinutes: Math.round((at.getTime() - now.getTime()) / 60_000),
    }));
}

async function sendReminder(store: Store, subscription: ReminderSubscription, kind: string, scheduledAt: Date) {
  const oneHour = kind === "one-hour";
  const visual = notificationVisualFor(subscription, oneHour);
  let delivered = 0;
  let failed = 0;

  if (subscription.channels.push && subscription.pushSubscription) {
    const payload = JSON.stringify({
      title: visual.title,
      body: visual.body,
      tag: subscription.subscriptionId,
      url: `/event-reminders?focus=${encodeURIComponent(subscription.subscriptionId)}`,
      scheduledAt: scheduledAt.toISOString(),
      icon: visual.icon,
      badge: visual.badge,
      image: visual.image,
    });
    try {
      if (!(await configureWebPush())) {
        throw new Error("Web Push VAPID keys are not configured.");
      }
      await webpush.sendNotification(subscription.pushSubscription, payload);
      delivered += 1;
    } catch {
      failed += 1;
    }
  }

  if (subscription.channels.telegram && subscription.targets.telegramChatId) {
    try {
      await sendTelegramReminder(subscription.targets.telegramChatId, visual.title, visual.body, subscription.subscriptionId);
      delivered += 1;
    } catch {
      failed += 1;
    }
  }

  if (subscription.channels.discord) {
    try {
      const connection = getDiscordConnection(store, subscription.clientId);
      if (!connection) {
        throw new Error("discord not connected");
      }
      await sendDiscordReminder(connection.userId, visual.title, visual.body, subscription.subscriptionId);
      updateDiscordDmError(store, subscription.clientId, undefined);
      delivered += 1;
    } catch {
      updateDiscordDmError(store, subscription.clientId, DISCORD_DM_FAILURE_MESSAGE);
      failed += 1;
    }
  }

  return { delivered, failed };
}

async function sendTelegramReminder(chatId: string, title: string, body: string, subscriptionId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `*${title}*\n${body}\n\n#${subscriptionId.replace(/[^a-zA-Z0-9_:-]/g, "_")}`,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Telegram send failed (${response.status})`);
  }
}

async function sendDiscordReminder(discordUserId: string, title: string, body: string, subscriptionId: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN is not configured");

  const dmChannelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dmChannelResponse.ok) {
    throw new Error(`Discord DM channel open failed (${dmChannelResponse.status})`);
  }

  const dmChannel = await dmChannelResponse.json() as { id?: string };
  if (!dmChannel.id) {
    throw new Error("Discord DM channel id missing");
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(dmChannel.id)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({
      content: `**${title}**\n${body}`,
      embeds: [
        {
          title,
          description: body,
          color: 0x22c55e,
          footer: { text: `Reminder ${subscriptionId}` },
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Discord send failed (${response.status})`);
  }
}

function notificationVisualFor(subscription: ReminderSubscription, oneHour: boolean) {
  const defaultIcon = "/pwa-icon.svg";
  const type = subscription.definition.type;

  if (type === "wairo") {
    return {
      title: oneHour ? "Wairo Dungeon in 1 hour" : "Wairo Dungeon spawn is live",
      body: oneHour
        ? "Prepare your team. Wairo Dungeon will spawn in one hour."
        : "Wairo Dungeon just spawned.",
      icon: "/website_icons/facilities_confirmed/mapchip_223_wairo_dungeon.png",
      badge: defaultIcon,
      image: "/website_icons/facilities_confirmed/mapchip_223_wairo_dungeon.png",
    };
  }

  if (type === "weekly-conquest") {
    return {
      title: "Weekly Conquest reset",
      body: "A new Weekly Conquest rotation is now available.",
      icon: "/website_icons/facilities_confirmed/facility_168_weekly_conquest_bonus.png",
      badge: defaultIcon,
      image: "/website_icons/facilities_confirmed/facility_168_weekly_conquest_bonus.png",
    };
  }

  if (type === "gacha") {
    const event = subscription.definition.event;
    const kindLabel = event.kind === "facilities" ? "Facility" : event.kind === "jobs" ? "Job" : event.kind === "weapons" ? "Weapon" : "Item";
    const iconByKind: Record<string, string> = {
      facilities: "/website_icons/facilities_confirmed/facility_174_job_center.png",
      jobs: "/website_icons/attributes/attribute_2_grass.png",
      weapons: "/website_icons/attributes/attribute_5_volcano.png",
      items: "/website_icons/attributes/attribute_0_water.png",
    };
    const icon = iconByKind[event.kind] || defaultIcon;
    return {
      title: oneHour ? `${event.title} in 1 hour` : `${event.title} started`,
      body: oneHour ? `${kindLabel} gacha opens in one hour.` : `${kindLabel} gacha is now active.`,
      icon,
      badge: defaultIcon,
      image: icon,
    };
  }

  return {
    title: oneHour ? `${subscription.title} in 1 hour` : subscription.title,
    body: oneHour ? "One-hour warning." : "Your event is starting.",
    icon: defaultIcon,
    badge: defaultIcon,
    image: undefined as string | undefined,
  };
}

async function sendDueReminders(now: Date, lookAheadMs: number) {
  const store = readStore();
  let sent = 0;
  let failed = 0;
  const graceMs = dueGraceMs();

  for (const subscription of store.subscriptions) {
    const due = notificationTimes(subscription, now).filter(({ kind, at }) => {
      const diff = at.getTime() - now.getTime();
      const key = `${kind}:${at.toISOString()}`;
      return diff >= -graceMs && diff <= lookAheadMs && !subscription.sentKeys.includes(key);
    });

    for (const item of due) {
      const key = `${item.kind}:${item.at.toISOString()}`;
      const result = await sendReminder(store, subscription, item.kind, item.at);
      if (result.delivered > 0) {
        subscription.sentKeys = [...subscription.sentKeys.slice(-25), key];
        sent += result.delivered;
      }
      if (result.failed > 0) {
        failed += result.failed;
      }
    }
  }

  await writeStore(store);
  return { sent, failed, checked: store.subscriptions.length };
}

async function runAutoDueSweep() {
  if (autoSchedulerBusy) return;
  autoSchedulerBusy = true;
  try {
    await configureWebPush();
    const result = await sendDueReminders(new Date(), autoLookAheadMs());
    if (result.sent || result.failed) {
      console.info("event-reminders: auto sweep", result);
    }
  } catch (error) {
    console.warn("event-reminders: auto sweep failed", error);
  } finally {
    autoSchedulerBusy = false;
  }
}

function startAutoDueScheduler() {
  if (autoSchedulerStarted) return;
  autoSchedulerStarted = true;
  void runAutoDueSweep();
  setInterval(() => {
    void runAutoDueSweep();
  }, 60_000);
}

function normalizeReturnTo(value: string | undefined) {
  const fallback = (process.env.EVENT_REMINDER_PUBLIC_BASE_URL || "https://kingdom-adventures-community-tools.vercel.app").replace(/\/$/, "");
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return fallback;
  }
}

function discordRedirectUri() {
  const configured = process.env.DISCORD_REDIRECT_URI?.trim();
  if (configured) return configured;
  const base = normalizeReturnTo(undefined);
  return `${base}/ka-api/ka/event-reminders/discord/callback`;
}

function getDiscordHealth(): DiscordHealth {
  const botTokenConfigured = Boolean(process.env.DISCORD_BOT_TOKEN?.trim());
  const clientIdConfigured = Boolean(process.env.DISCORD_CLIENT_ID?.trim());
  const clientSecretConfigured = Boolean(process.env.DISCORD_CLIENT_SECRET?.trim());
  const redirectUriConfigured = Boolean(process.env.DISCORD_REDIRECT_URI?.trim());
  const oauthStateSecretConfigured = Boolean(process.env.DISCORD_OAUTH_STATE_SECRET?.trim());
  const missingErrors: string[] = [];

  if (!botTokenConfigured) missingErrors.push(MISSING_DISCORD_BOT_TOKEN_MESSAGE);
  if (!clientIdConfigured) missingErrors.push(MISSING_DISCORD_CLIENT_ID_MESSAGE);
  if (!clientSecretConfigured) missingErrors.push(MISSING_DISCORD_CLIENT_SECRET_MESSAGE);

  return {
    botTokenConfigured,
    clientIdConfigured,
    clientSecretConfigured,
    redirectUriConfigured,
    oauthStateSecretConfigured,
    missingErrors,
    oauthReady: clientIdConfigured && clientSecretConfigured,
    dmReady: botTokenConfigured,
  };
}

function normalizeTelegramBotUsername() {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) return "";
  return raw.replace(/^@+/, "");
}

async function exchangeDiscordOAuthCode(code: string) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    if (!clientId) throw new Error(MISSING_DISCORD_CLIENT_ID_MESSAGE);
    throw new Error(MISSING_DISCORD_CLIENT_SECRET_MESSAGE);
  }

  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: discordRedirectUri(),
  });

  const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.json().catch(() => null) as { error?: string; error_description?: string } | null;
    const details = `${tokenError?.error || ""} ${tokenError?.error_description || ""}`.toLowerCase();
    if (details.includes("redirect") || details.includes("redirect_uri")) {
      throw new Error(REDIRECT_URI_MISMATCH_MESSAGE);
    }
    throw new Error(`Discord OAuth token exchange failed (${tokenResponse.status})`);
  }

  const tokenData = await tokenResponse.json() as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Discord OAuth did not return an access token.");
  }

  const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userResponse.ok) {
    throw new Error(`Discord user lookup failed (${userResponse.status})`);
  }

  const user = await userResponse.json() as { id?: string; username?: string; global_name?: string };
  if (!user.id) {
    throw new Error("Discord user id missing from OAuth profile.");
  }

  return {
    userId: user.id,
    username: user.global_name || user.username || "Discord user",
  };
}

router.get("/event-reminders/config", async (_req, res) => {
  const keyPair = await getVapidKeys();
  res.json({ configured: Boolean(keyPair?.publicKey && keyPair.privateKey), publicKey: keyPair?.publicKey || "" });
});

router.get("/event-reminders/telegram/status", async (_req, res) => {
  const botUsername = normalizeTelegramBotUsername();
  res.json({
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    botUsername,
    botUrl: botUsername ? `https://t.me/${encodeURIComponent(botUsername)}` : "",
    idHelperUrl: "https://t.me/userinfobot",
  });
});

router.get("/event-reminders/discord/health", async (_req, res) => {
  const health = getDiscordHealth();
  res.json({
    ok: health.oauthReady && health.dmReady,
    ...health,
  });
});

router.get("/event-reminders/discord/connect", async (req, res) => {
  const clientId = String(req.query?.clientId || "").trim();
  if (!clientId) {
    res.status(400).json({ error: "clientId is required." });
    return;
  }

  const discordClientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!discordClientId) {
    res.status(503).json({ error: MISSING_DISCORD_CLIENT_ID_MESSAGE });
    return;
  }
  if (!process.env.DISCORD_CLIENT_SECRET?.trim()) {
    res.status(503).json({ error: MISSING_DISCORD_CLIENT_SECRET_MESSAGE });
    return;
  }

  const returnTo = normalizeReturnTo(typeof req.query?.returnTo === "string" ? req.query.returnTo : undefined);
  const state = createDiscordState(clientId, returnTo);
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", discordClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", discordRedirectUri());

  res.redirect(url.toString());
});

router.get("/event-reminders/discord/callback", async (req, res) => {
  const code = String(req.query?.code || "").trim();
  const state = String(req.query?.state || "").trim();
  const parsedState = parseDiscordState(state);

  const fallbackReturnTo = normalizeReturnTo(undefined);
  const returnTo = parsedState?.returnTo || fallbackReturnTo;

  if (!code || !parsedState) {
    res.redirect(`${returnTo}/event-reminders?discord=error`);
    return;
  }

  try {
    const identity = await exchangeDiscordOAuthCode(code);
    const store = readStore();
    upsertDiscordConnection(store, {
      clientId: parsedState.clientId,
      userId: identity.userId,
      username: identity.username,
      connectedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeStore(store);
    res.redirect(`${returnTo}/event-reminders?discord=connected`);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Discord connect failed.";
    const message = [
      MISSING_DISCORD_CLIENT_ID_MESSAGE,
      MISSING_DISCORD_CLIENT_SECRET_MESSAGE,
      REDIRECT_URI_MISMATCH_MESSAGE,
    ].includes(rawMessage)
      ? rawMessage
      : "Discord connect failed.";
    res.redirect(`${returnTo}/event-reminders?discord=error&message=${encodeURIComponent(message)}`);
  }
});

router.get("/event-reminders/discord/status", async (req, res) => {
  const clientId = String(req.query?.clientId || "").trim();
  if (!clientId) {
    res.status(400).json({ error: "clientId is required." });
    return;
  }

  const store = readStore();
  const connection = getDiscordConnection(store, clientId);
  const health = getDiscordHealth();
  res.json({
    connected: Boolean(connection),
    username: connection?.username || "",
    lastError: connection?.lastDmError || "",
    oauthConfigured: health.oauthReady,
    missingErrors: health.missingErrors,
    config: {
      botTokenConfigured: health.botTokenConfigured,
      clientIdConfigured: health.clientIdConfigured,
      clientSecretConfigured: health.clientSecretConfigured,
      redirectUriConfigured: health.redirectUriConfigured,
      oauthStateSecretConfigured: health.oauthStateSecretConfigured,
    },
  });
});

router.post("/event-reminders/discord/test", async (req, res) => {
  const clientId = String(req.body?.clientId || "").trim();
  if (!clientId) {
    res.status(400).json({ error: "clientId is required." });
    return;
  }

  if (!process.env.DISCORD_BOT_TOKEN?.trim()) {
    res.status(503).json({ error: MISSING_DISCORD_BOT_TOKEN_MESSAGE });
    return;
  }

  const store = readStore();
  const connection = getDiscordConnection(store, clientId);
  if (!connection) {
    res.status(400).json({ error: "Connect Discord first before Discord test." });
    return;
  }

  try {
    await sendDiscordReminder(
      connection.userId,
      "KA Events Discord test",
      "Discord DM delivery is working.",
      "discord-test",
    );
    updateDiscordDmError(store, clientId, undefined);
    await writeStore(store);
    res.json({ ok: true });
  } catch {
    updateDiscordDmError(store, clientId, DISCORD_DM_FAILURE_MESSAGE);
    await writeStore(store);
    res.status(502).json({ error: DISCORD_DM_FAILURE_MESSAGE });
  }
});

router.post("/event-reminders/discord/disconnect", async (req, res) => {
  const clientId = String(req.body?.clientId || "").trim();
  if (!clientId) {
    res.status(400).json({ error: "clientId is required." });
    return;
  }

  const store = readStore();
  clearDiscordConnection(store, clientId);
  store.subscriptions = store.subscriptions.map((subscription) => {
    if (subscription.clientId !== clientId) return subscription;
    return {
      ...subscription,
      channels: {
        ...subscription.channels,
        discord: false,
      },
    };
  });
  await writeStore(store);
  res.json({ ok: true });
});

router.post("/event-reminders/subscriptions", async (req, res) => {
  const pushSubscription = req.body?.pushSubscription;
  const clientId = String(req.body?.clientId || "").trim();
  const subscriptionId = String(req.body?.subscriptionId || "");
  const title = String(req.body?.title || "");
  const mode = String(req.body?.mode || "start") as ReminderMode;
  const definition = req.body?.definition;
  const channels = normalizeChannels(req.body?.channels || { push: true });
  const targets = normalizeTargets(req.body?.targets);
  const store = readStore();

  if (!clientId || !subscriptionId || !title || !["start", "one-hour-and-start"].includes(mode) || !isValidDefinition(definition)) {
    res.status(400).json({ error: "Invalid reminder subscription payload." });
    return;
  }
  if (!hasAnyChannel(channels)) {
    res.status(400).json({ error: "Select at least one notification channel." });
    return;
  }
  if (channels.push && !isPushSubscription(pushSubscription)) {
    res.status(400).json({ error: "Push channel requires a browser push subscription." });
    return;
  }
  if (channels.telegram) {
    if (!targets.telegramChatId || !isValidTelegramChatId(targets.telegramChatId)) {
      res.status(400).json({ error: "Telegram channel requires a valid chat id." });
      return;
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      res.status(503).json({ error: "Telegram channel is not configured on the server." });
      return;
    }
  }
  if (channels.discord) {
    if (!process.env.DISCORD_BOT_TOKEN?.trim()) {
      res.status(503).json({ error: MISSING_DISCORD_BOT_TOKEN_MESSAGE });
      return;
    }
    if (!isDiscordConnected(store, clientId)) {
      res.status(400).json({ error: "Discord channel requires Discord connection first." });
      return;
    }
  }

  const id = subscriptionHash(clientId, subscriptionId);
  const now = Date.now();
  const existing = store.subscriptions.find((subscription) => subscription.id === id);
  const next: ReminderSubscription = {
    id,
    clientId,
    clientTimeZoneOffsetMinutes: normalizeTimeZoneOffset(req.body?.clientTimeZoneOffsetMinutes),
    endpoint: isPushSubscription(pushSubscription) ? pushSubscription.endpoint : undefined,
    pushSubscription: isPushSubscription(pushSubscription) ? pushSubscription : undefined,
    subscriptionId,
    title,
    offsetHours: normalizeOffset(req.body?.offsetHours),
    mode,
    definition,
    channels,
    targets: { telegramChatId: targets.telegramChatId },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sentKeys: existing?.sentKeys ?? [],
  };

  store.subscriptions = [...store.subscriptions.filter((subscription) => subscription.id !== id), next];
  await writeStore(store);
  res.json({ ok: true, id });
});

router.delete("/event-reminders/subscriptions", async (req, res) => {
  const clientId = String(req.body?.clientId || "").trim();
  const subscriptionId = String(req.body?.subscriptionId || "");
  if (!clientId || !subscriptionId) {
    res.status(400).json({ error: "clientId and subscriptionId are required." });
    return;
  }
  const store = readStore();
  store.subscriptions = store.subscriptions.filter((subscription) => subscription.id !== subscriptionHash(clientId, subscriptionId));
  await writeStore(store);
  res.json({ ok: true });
});

router.post("/event-reminders/subscriptions/sync-client-context", async (req, res) => {
  const clientId = String(req.body?.clientId || "").trim();
  const clientTimeZoneOffsetMinutes = normalizeTimeZoneOffset(req.body?.clientTimeZoneOffsetMinutes);
  if (!clientId || clientTimeZoneOffsetMinutes === undefined) {
    res.status(400).json({ error: "clientId and clientTimeZoneOffsetMinutes are required." });
    return;
  }

  const store = readStore();
  let updated = 0;
  store.subscriptions = store.subscriptions.map((subscription) => {
    if (subscription.clientId !== clientId) return subscription;
    if (subscription.clientTimeZoneOffsetMinutes === clientTimeZoneOffsetMinutes) return subscription;
    updated += 1;
    return {
      ...subscription,
      clientTimeZoneOffsetMinutes,
      updatedAt: Date.now(),
    };
  });

  if (updated > 0) {
    await writeStore(store);
  }
  res.json({ ok: true, updated });
});

router.post("/event-reminders/test", async (req, res) => {
  const pushSubscription = req.body?.pushSubscription;
  const clientId = String(req.body?.clientId || "").trim();
  const channels = normalizeChannels(req.body?.channels || { push: true });
  const targets = normalizeTargets(req.body?.targets);
  const delaySeconds = Math.max(3, Math.min(30, Number(req.body?.delaySeconds || 5)));
  if (!hasAnyChannel(channels)) {
    res.status(400).json({ error: "Select at least one test channel." });
    return;
  }
  if (channels.push && !isPushSubscription(pushSubscription)) {
    res.status(400).json({ error: "Push test requires a browser push subscription." });
    return;
  }
  if (channels.telegram && (!targets.telegramChatId || !isValidTelegramChatId(targets.telegramChatId))) {
    res.status(400).json({ error: "Telegram test requires a valid chat id." });
    return;
  }
  if (channels.discord && !clientId) {
    res.status(400).json({ error: "Discord test requires a client ID." });
    return;
  }
  if (channels.discord && !process.env.DISCORD_BOT_TOKEN?.trim()) {
    res.status(503).json({ error: MISSING_DISCORD_BOT_TOKEN_MESSAGE });
    return;
  }
  if (channels.discord) {
    const store = readStore();
    if (!getDiscordConnection(store, clientId)) {
      res.status(400).json({ error: "Connect Discord first before Discord test." });
      return;
    }
  }
  if (channels.push && !(await configureWebPush())) {
    res.status(503).json({ error: "Web Push VAPID keys are not configured." });
    return;
  }

  setTimeout(async () => {
    const title = "KA Events test";
    const body = "This is your test notification.";
    const promises: Promise<unknown>[] = [];

    if (channels.push && isPushSubscription(pushSubscription)) {
      const payload = JSON.stringify({
        title,
        body,
        tag: `ka-event-test-${Date.now()}`,
        url: "/event-reminders",
        scheduledAt: new Date().toISOString(),
      });
      promises.push(webpush.sendNotification(pushSubscription, payload));
    }
    if (channels.telegram && targets.telegramChatId) {
      promises.push(sendTelegramReminder(targets.telegramChatId, title, body, "test"));
    }
    if (channels.discord) {
      const store = readStore();
      const connection = getDiscordConnection(store, clientId);
      if (connection) {
        promises.push(sendDiscordReminder(connection.userId, title, body, "test"));
      }
    }

    await Promise.allSettled(promises);
  }, delaySeconds * 1000);

  res.json({ ok: true, delaySeconds });
});

router.post("/event-reminders/telegram/test", async (req, res) => {
  const chatId = String(req.body?.chatId || "").trim();
  if (!chatId || !isValidTelegramChatId(chatId)) {
    res.status(400).json({ error: "Telegram test requires a valid chat id." });
    return;
  }

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    res.status(503).json({ error: "Telegram channel is not configured on the server." });
    return;
  }

  try {
    await sendTelegramReminder(chatId, "KA Events Telegram test", "Telegram DM delivery is working.", "telegram-test");
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "Telegram send failed. Start the bot chat first, then retry." });
  }
});

router.get("/event-reminders/debug/next-due", async (req, res) => {
  const clientId = String(req.query?.clientId || "").trim();
  if (!clientId) {
    res.status(400).json({ error: "clientId is required." });
    return;
  }

  const now = new Date();
  const store = readStore();
  const reminders = store.subscriptions
    .filter((subscription) => subscription.clientId === clientId)
    .map((subscription) => ({
      subscriptionId: subscription.subscriptionId,
      title: subscription.title,
      offsetHours: subscription.offsetHours,
      clientTimeZoneOffsetMinutes: subscription.clientTimeZoneOffsetMinutes,
      mode: subscription.mode,
      channels: subscription.channels,
      next: nextNotificationPreview(subscription, now, 3),
    }));

  res.json({
    now: now.toISOString(),
    graceMinutes: Math.round(dueGraceMs() / 60_000),
    autoLookAheadMinutes: Math.round(autoLookAheadMs() / 60_000),
    reminders,
  });
});

router.post("/event-reminders/send-due", async (req, res) => {
  const secret = process.env.EVENT_REMINDER_CRON_SECRET;
  if (secret && req.header("x-cron-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const now = new Date();
  const lookAheadMs = Math.max(60_000, Math.min(15 * 60_000, Number(req.body?.lookAheadMs || 5 * 60_000)));
  const result = await sendDueReminders(now, lookAheadMs);
  res.json({ ok: true, ...result });
});

startAutoDueScheduler();

export default router;
