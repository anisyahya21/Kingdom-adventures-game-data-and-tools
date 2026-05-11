import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import admin from "firebase-admin";

const router = Router();
const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "event-reminder-subscriptions.json");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ReminderMode = "start" | "one-hour-and-start" | "daily-check";
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
  | { type: "wairo"; event: { day: number; hour: number } }
  | { type: "page-daily"; hour: number };

type ReminderSubscription = {
  id: string;
  token: string;
  subscriptionId: string;
  title: string;
  href: string;
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

function readStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { subscriptions: [] };
  }
}

function writeStore(store: Store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function normalizeOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(23, Math.max(-23, parsed));
}

function isValidDefinition(value: unknown): value is ReminderDefinition {
  if (!value || typeof value !== "object") return false;
  const definition = value as ReminderDefinition;
  if (definition.type === "page-daily") return Number.isFinite(definition.hour);
  if (definition.type === "wairo") return Number.isFinite(definition.event?.day) && Number.isFinite(definition.event?.hour);
  if (definition.type === "gacha") {
    const event = definition.event;
    return Boolean(event?.id && event.title && Number.isFinite(event.startMonth) && Number.isFinite(event.startDay) && Number.isFinite(event.endMonth) && Number.isFinite(event.endDay));
  }
  return false;
}

function subscriptionHash(token: string, subscriptionId: string) {
  return crypto.createHash("sha256").update(`${token}:${subscriptionId}`).digest("hex");
}

function initializeFirebase() {
  if (admin.apps.length) return true;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  try {
    if (serviceAccountJson) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
      return true;
    }
    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
      return true;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

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

function nextWairoStart(entry: { day: number; hour: number }, now: Date, offset: number) {
  const eventClockNow = new Date(now.getTime() + offset * HOUR_MS);
  const candidates: Date[] = [];
  for (let monthOffset = 0; monthOffset <= 2; monthOffset += 1) {
    const eventClockStart = new Date(eventClockNow.getFullYear(), eventClockNow.getMonth() + monthOffset, entry.day, entry.hour, 0, 0, 0);
    if (eventClockStart.getDate() !== entry.day) continue;
    candidates.push(eventClockDateToLocalDate(eventClockStart, offset));
  }
  return candidates.filter((date) => date.getTime() >= now.getTime() - 5 * 60 * 1000).sort((a, b) => a.getTime() - b.getTime())[0];
}

function nextDailyStart(hour: number, now: Date, offset: number) {
  const eventClockNow = new Date(now.getTime() + offset * HOUR_MS);
  const today = eventClockDateToLocalDate(new Date(eventClockNow.getFullYear(), eventClockNow.getMonth(), eventClockNow.getDate(), hour, 0, 0, 0), offset);
  if (today.getTime() >= now.getTime() - 5 * 60 * 1000) return today;
  return new Date(today.getTime() + DAY_MS);
}

function notificationTimes(subscription: ReminderSubscription, now: Date) {
  const offset = subscription.offsetHours;
  let startAt: Date | undefined;
  if (subscription.definition.type === "gacha") startAt = nextGachaStart(subscription.definition.event, now, offset);
  if (subscription.definition.type === "wairo") startAt = nextWairoStart(subscription.definition.event, now, offset);
  if (subscription.definition.type === "page-daily") startAt = nextDailyStart(subscription.definition.hour, now, offset);
  if (!startAt) return [];

  const times = [{ kind: "start", at: startAt }];
  if (subscription.mode === "one-hour-and-start") {
    times.unshift({ kind: "one-hour", at: new Date(startAt.getTime() - HOUR_MS) });
  }
  return times;
}

async function sendReminder(subscription: ReminderSubscription, kind: string, scheduledAt: Date) {
  const oneHour = kind === "one-hour";
  await admin.messaging().send({
    token: subscription.token,
    notification: {
      title: oneHour ? `${subscription.title} in 1 hour` : subscription.title,
      body: oneHour ? "Your one-hour warning is ready." : "Your subscribed event is starting.",
    },
    data: {
      url: subscription.href,
      subscriptionId: subscription.subscriptionId,
      scheduledAt: scheduledAt.toISOString(),
    },
    webpush: {
      fcmOptions: {
        link: subscription.href,
      },
    },
  });
}

router.post("/event-reminders/subscriptions", (req, res) => {
  const token = String(req.body?.token || "");
  const subscriptionId = String(req.body?.subscriptionId || "");
  const title = String(req.body?.title || "");
  const href = String(req.body?.href || "/timed-events");
  const mode = String(req.body?.mode || "start") as ReminderMode;
  const definition = req.body?.definition;

  if (!token || !subscriptionId || !title || !["start", "one-hour-and-start", "daily-check"].includes(mode) || !isValidDefinition(definition)) {
    res.status(400).json({ error: "Invalid reminder subscription payload." });
    return;
  }

  const store = readStore();
  const id = subscriptionHash(token, subscriptionId);
  const now = Date.now();
  const existing = store.subscriptions.find((subscription) => subscription.id === id);
  const next: ReminderSubscription = {
    id,
    token,
    subscriptionId,
    title,
    href,
    offsetHours: normalizeOffset(req.body?.offsetHours),
    mode,
    definition,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sentKeys: existing?.sentKeys ?? [],
  };

  store.subscriptions = [...store.subscriptions.filter((subscription) => subscription.id !== id), next];
  writeStore(store);
  res.json({ ok: true, id });
});

router.delete("/event-reminders/subscriptions", (req, res) => {
  const token = String(req.body?.token || "");
  const subscriptionId = String(req.body?.subscriptionId || "");
  if (!token || !subscriptionId) {
    res.status(400).json({ error: "Token and subscriptionId are required." });
    return;
  }
  const store = readStore();

  store.subscriptions = store.subscriptions.filter((subscription) => subscription.id !== subscriptionHash(token, subscriptionId));

  writeStore(store);
  res.json({ ok: true });
});

router.post("/event-reminders/send-due", async (req, res) => {
  const secret = process.env.EVENT_REMINDER_CRON_SECRET;
  if (secret && req.header("x-cron-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  if (!initializeFirebase()) {
    res.status(503).json({ error: "Firebase Admin is not configured." });
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

  writeStore(store);
  res.json({ ok: true, sent, failed, checked: store.subscriptions.length });
});

export default router;
