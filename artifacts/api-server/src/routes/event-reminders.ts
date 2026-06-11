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

type ReminderSubscription = {
  id: string;
  endpoint: string;
  pushSubscription: PushSubscription;
  subscriptionId: string;
  title: string;
  offsetHours: number;
  mode: ReminderMode;
  definition: ReminderDefinition;
  createdAt: number;
  updatedAt: number;
  sentKeys: string[];
};

type Store = {
  subscriptions: ReminderSubscription[];
};

type VapidKeyPair = {
  publicKey: string;
  privateKey: string;
};

type DbModule = typeof import("@workspace/db");

let dbModule: DbModule | null = null;
let persistenceMode: "database" | "file" = "file";
let storeCache: Store = readStoreFromFile();
let cachedVapidKeys: VapidKeyPair | null = null;

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
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { subscriptions: [] };
  }
}

function writeStoreFile(store: Store) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
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
  storeCache = store;
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

function subscriptionHash(endpoint: string, subscriptionId: string) {
  return crypto.createHash("sha256").update(`${endpoint}:${subscriptionId}`).digest("hex");
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
    } else {
      storeCache = dbStore;
    }

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
  const eventClockNow = new Date(now.getTime() + offset * HOUR_MS);
  const candidates: Array<{ kind: string; at: Date }> = [];
  for (let monthOffset = -1; monthOffset <= 2; monthOffset += 1) {
    const year = eventClockNow.getFullYear();
    const month = eventClockNow.getMonth() + monthOffset;
    for (const entry of WAIRO_DUNGEON_SCHEDULE) {
      const eventClockStart = new Date(year, month, entry.day, entry.hour, 0, 0, 0);
      if (eventClockStart.getDate() !== entry.day) continue;
      const startAt = eventClockDateToLocalDate(eventClockStart, offset);
      candidates.push({ kind: "start", at: startAt });
      if (subscription.mode === "one-hour-and-start") {
        candidates.push({ kind: "one-hour", at: new Date(startAt.getTime() - HOUR_MS) });
      }
    }
  }
  return candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function nextWeeklyConquestStart(now: Date) {
  const offset = Math.floor((now.getTime() - WEEKLY_ANCHOR_START) / (7 * DAY_MS)) + 1;
  return new Date(WEEKLY_ANCHOR_START + offset * 7 * DAY_MS);
}

function notificationTimes(subscription: ReminderSubscription, now: Date) {
  if (subscription.definition.type === "wairo") return wairoNotificationTimes(subscription, now);

  const offset = subscription.offsetHours;
  let startAt: Date | undefined;
  if (subscription.definition.type === "gacha") startAt = nextGachaStart(subscription.definition.event, now, offset);
  if (subscription.definition.type === "weekly-conquest") startAt = nextWeeklyConquestStart(now);
  if (!startAt) return [];

  const times = [{ kind: "start", at: startAt }];
  if (subscription.mode === "one-hour-and-start") {
    times.unshift({ kind: "one-hour", at: new Date(startAt.getTime() - HOUR_MS) });
  }
  return times;
}

async function sendReminder(subscription: ReminderSubscription, kind: string, scheduledAt: Date) {
  const oneHour = kind === "one-hour";
  const payload = JSON.stringify({
    title: oneHour ? `${subscription.title} in 1 hour` : subscription.title,
    body: oneHour ? "One-hour warning." : "Your event is starting.",
    tag: subscription.subscriptionId,
    url: "/event-reminders",
    scheduledAt: scheduledAt.toISOString(),
  });
  await webpush.sendNotification(subscription.pushSubscription, payload);
}

router.get("/event-reminders/config", async (_req, res) => {
  const keyPair = await getVapidKeys();
  res.json({ configured: Boolean(keyPair?.publicKey && keyPair.privateKey), publicKey: keyPair?.publicKey || "" });
});

router.post("/event-reminders/subscriptions", async (req, res) => {
  const pushSubscription = req.body?.pushSubscription;
  const subscriptionId = String(req.body?.subscriptionId || "");
  const title = String(req.body?.title || "");
  const mode = String(req.body?.mode || "start") as ReminderMode;
  const definition = req.body?.definition;

  if (!isPushSubscription(pushSubscription) || !subscriptionId || !title || !["start", "one-hour-and-start"].includes(mode) || !isValidDefinition(definition)) {
    res.status(400).json({ error: "Invalid reminder subscription payload." });
    return;
  }

  const store = readStore();
  const id = subscriptionHash(pushSubscription.endpoint, subscriptionId);
  const now = Date.now();
  const existing = store.subscriptions.find((subscription) => subscription.id === id);
  const next: ReminderSubscription = {
    id,
    endpoint: pushSubscription.endpoint,
    pushSubscription,
    subscriptionId,
    title,
    offsetHours: normalizeOffset(req.body?.offsetHours),
    mode,
    definition,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sentKeys: existing?.sentKeys ?? [],
  };

  store.subscriptions = [...store.subscriptions.filter((subscription) => subscription.id !== id), next];
  await writeStore(store);
  res.json({ ok: true, id });
});

router.delete("/event-reminders/subscriptions", async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  const subscriptionId = String(req.body?.subscriptionId || "");
  if (!endpoint || !subscriptionId) {
    res.status(400).json({ error: "Endpoint and subscriptionId are required." });
    return;
  }
  const store = readStore();
  store.subscriptions = store.subscriptions.filter((subscription) => subscription.id !== subscriptionHash(endpoint, subscriptionId));
  await writeStore(store);
  res.json({ ok: true });
});

router.post("/event-reminders/test", async (req, res) => {
  const pushSubscription = req.body?.pushSubscription;
  const delaySeconds = Math.max(3, Math.min(30, Number(req.body?.delaySeconds || 5)));
  if (!isPushSubscription(pushSubscription)) {
    res.status(400).json({ error: "A browser push subscription is required." });
    return;
  }
  if (!(await configureWebPush())) {
    res.status(503).json({ error: "Web Push VAPID keys are not configured." });
    return;
  }

  setTimeout(async () => {
    const payload = JSON.stringify({
      title: "KA Events test",
      body: "This is your test notification.",
      tag: `ka-event-test-${Date.now()}`,
      url: "/event-reminders",
      scheduledAt: new Date().toISOString(),
    });

    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch {
      // The caller already got the scheduling response; failed test sends are
      // intentionally not retried from this endpoint.
    }
  }, delaySeconds * 1000);

  res.json({ ok: true, delaySeconds });
});

router.post("/event-reminders/send-due", async (req, res) => {
  const secret = process.env.EVENT_REMINDER_CRON_SECRET;
  if (secret && req.header("x-cron-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  if (!(await configureWebPush())) {
    res.status(503).json({ error: "Web Push VAPID keys are not configured." });
    return;
  }

  const now = new Date();
  const lookAheadMs = Math.max(60_000, Math.min(15 * 60_000, Number(req.body?.lookAheadMs || 5 * 60_000)));
  const store = readStore();
  let sent = 0;
  let failed = 0;

  for (const subscription of store.subscriptions) {
    const due = notificationTimes(subscription, now).filter(({ kind, at }) => {
      const diff = at.getTime() - now.getTime();
      const key = `${kind}:${at.toISOString()}`;
      return diff >= -5 * 60_000 && diff <= lookAheadMs && !subscription.sentKeys.includes(key);
    });

    for (const item of due) {
      const key = `${item.kind}:${item.at.toISOString()}`;
      try {
        await sendReminder(subscription, item.kind, item.at);
        subscription.sentKeys = [...subscription.sentKeys.slice(-25), key];
        sent += 1;
      } catch {
        failed += 1;
      }
    }
  }

  await writeStore(store);
  res.json({ ok: true, sent, failed, checked: store.subscriptions.length });
});

export default router;
