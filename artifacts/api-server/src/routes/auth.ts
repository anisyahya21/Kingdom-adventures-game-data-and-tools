import { Router } from "express";
import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

const router = Router();

type DbModule = typeof import("@workspace/db");

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_CHALLENGE_TTL_MS = 1000 * 60 * 5;
const DEFAULT_AUTH_MAX_AGE_SECONDS = 300;
const DEFAULT_CODE_LENGTH = 6;
const SESSION_COOKIE_NAME = "ka_session";
const POST_MESSAGE_SOURCE = "ka-auth";

let dbModule: DbModule | null = null;

function authCookieSameSite(): "lax" | "strict" | "none" {
  const raw = String(process.env.AUTH_COOKIE_SAME_SITE || "none").trim().toLowerCase();
  if (raw === "none") {
    // Browsers reject SameSite=None cookies unless Secure is true.
    return authCookieSecure() ? "none" : "lax";
  }
  if (raw === "lax" || raw === "strict") return raw;
  return authCookieSecure() ? "none" : "lax";
}

function authCookieSecure() {
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function authCookieDomain() {
  const raw = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return raw ? raw : undefined;
}

function sessionTtlMs() {
  const raw = Number(process.env.AUTH_SESSION_TTL_MS || DEFAULT_SESSION_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_MS;
}

function challengeTtlMs() {
  const raw = Number(process.env.AUTH_CHALLENGE_TTL_MS || DEFAULT_CHALLENGE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHALLENGE_TTL_MS;
}

function authMaxAgeSeconds() {
  const raw = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || DEFAULT_AUTH_MAX_AGE_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUTH_MAX_AGE_SECONDS;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

function randomCode(length = DEFAULT_CODE_LENGTH) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function normalizeDisplayName(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.slice(0, 64) : "";
}

function normalizeGameId(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (!/^\d{3},\d{3},\d{3}$/.test(trimmed)) {
    throw new Error("Game ID must match 123,456,789 format.");
  }
  return trimmed;
}

function normalizeTelegramBotUsername() {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) return "";
  return raw.replace(/^@+/, "");
}

function configuredAuthReady() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && normalizeTelegramBotUsername());
}

function getAdminTelegramUserIds() {
  return new Set(
    String(process.env.TELEGRAM_ADMIN_USER_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAdminTelegramUser(telegramUserId?: string | null) {
  if (!telegramUserId) return false;
  return getAdminTelegramUserIds().has(String(telegramUserId));
}

function baseUrlFromRequest(req: Parameters<typeof router.get>[1] extends never ? never : any) {
  const explicitClientOrigin = String(req.get("x-ka-origin") || "").trim();
  if (/^https?:\/\//i.test(explicitClientOrigin)) {
    return explicitClientOrigin.replace(/\/$/, "");
  }

  const origin = String(req.get("origin") || req.get("x-forwarded-origin") || "").trim();
  if (/^https?:\/\//i.test(origin)) {
    return origin.replace(/\/$/, "");
  }

  const referrer = String(req.get("referer") || req.get("referrer") || "").trim();
  if (referrer) {
    try {
      const url = new URL(referrer);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // Ignore invalid referer values.
    }
  }

  const explicit = process.env.AUTH_PUBLIC_BASE_URL?.trim() || process.env.EVENT_REMINDER_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const forwardedProto = String(req.get("x-forwarded-proto") || "").trim().toLowerCase();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").trim();
  if (host) {
    const protocol = forwardedProto === "https" ? "https" : req.protocol;
    if (protocol === "http" && !/^(localhost|127\.0\.0\.1|192\.168\.)/i.test(host)) {
      return `https://${host}`;
    }
    return `${protocol}://${host}`;
  }

  return `${req.protocol}://${req.get("host")}`;
}

async function getDbModule() {
  if (dbModule) return dbModule;
  if (!process.env.DATABASE_URL) return null;
  try {
    dbModule = await import("@workspace/db");
    return dbModule;
  } catch {
    return null;
  }
}

function encodeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function telegramDataCheckString(payload: Record<string, string>) {
  return Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function verifyTelegramPayload(payload: Record<string, string>) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  const receivedHash = payload.hash;
  if (!receivedHash) return false;

  const secret = crypto.createHash("sha256").update(token).digest();
  const dataCheckString = telegramDataCheckString(payload);
  const expectedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(receivedHash, "hex"));
  } catch {
    return false;
  }
}

function telegramAuthPayloadFromQuery(query: Record<string, unknown>) {
  return {
    id: String(query.id || "").trim(),
    first_name: String(query.first_name || "").trim(),
    last_name: String(query.last_name || "").trim(),
    username: String(query.username || "").trim(),
    photo_url: String(query.photo_url || "").trim(),
    auth_date: String(query.auth_date || "").trim(),
    hash: String(query.hash || "").trim(),
  };
}

type TelegramIdentity = {
  telegramUserId: string;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
};

async function upsertTelegramUser(module: DbModule, identity: TelegramIdentity) {
  const existingUserRows = await module.db
    .select({ id: module.usersTable.id })
    .from(module.usersTable)
    .where(eq(module.usersTable.telegramUserId, identity.telegramUserId))
    .limit(1);

  const now = new Date();
  let userId = existingUserRows[0]?.id;
  if (!userId) {
    const inserted = await module.db
      .insert(module.usersTable)
      .values({
        telegramUserId: identity.telegramUserId,
        telegramUsername: identity.telegramUsername || undefined,
        firstName: identity.firstName || undefined,
        lastName: identity.lastName || undefined,
        photoUrl: identity.photoUrl || undefined,
        status: "active",
        createdAt: now,
        lastLoginAt: now,
      })
      .returning({ id: module.usersTable.id });
    userId = inserted[0]?.id;
  } else {
    await module.db
      .update(module.usersTable)
      .set({
        telegramUsername: identity.telegramUsername || undefined,
        firstName: identity.firstName || undefined,
        lastName: identity.lastName || undefined,
        photoUrl: identity.photoUrl || undefined,
        lastLoginAt: now,
      })
      .where(eq(module.usersTable.id, userId));
  }

  return userId;
}

function normalizeLoginCommand(text: string) {
  const match = text.trim().match(/^\/login(?:@([a-zA-Z0-9_]+))?\s+([A-Z0-9]{4,12})$/i);
  if (match) {
    const commandBot = (match[1] || "").toLowerCase();
    const configuredBot = normalizeTelegramBotUsername().toLowerCase();
    if (commandBot && configuredBot && commandBot !== configuredBot) return null;
    return match[2].toUpperCase();
  }

  // Support deep-link based commands like /start login_ABC123.
  const startMatch = text.trim().match(/^\/start(?:@([a-zA-Z0-9_]+))?\s+login[_-]?([A-Z0-9]{4,12})$/i);
  if (!startMatch) return null;
  const startBot = (startMatch[1] || "").toLowerCase();
  const configuredBot = normalizeTelegramBotUsername().toLowerCase();
  if (startBot && configuredBot && startBot !== configuredBot) return null;
  return startMatch[2].toUpperCase();
}

type TelegramUpdateMessage = {
  text?: string;
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
};

async function createSession(module: DbModule, userId: string, ipAddress: string | undefined, userAgent: string | undefined) {
  const rawSessionToken = randomToken(48);
  const tokenHash = sha256Hex(rawSessionToken);
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  await module.db.insert(module.userSessionsTable).values({
    userId,
    sessionTokenHash: tokenHash,
    createdAt: new Date(),
    expiresAt,
    userAgent,
    ipAddress,
  });

  return { rawSessionToken, expiresAt };
}

async function getSessionUser(module: DbModule, rawSessionToken: string) {
  const tokenHash = sha256Hex(rawSessionToken);
  const rows = await module.db
    .select({
      sessionId: module.userSessionsTable.id,
      sessionExpiresAt: module.userSessionsTable.expiresAt,
      userId: module.usersTable.id,
      telegramUserId: module.usersTable.telegramUserId,
      telegramUsername: module.usersTable.telegramUsername,
      firstName: module.usersTable.firstName,
      lastName: module.usersTable.lastName,
      displayName: module.usersTable.displayName,
      gameId: module.usersTable.gameId,
      photoUrl: module.usersTable.photoUrl,
    })
    .from(module.userSessionsTable)
    .innerJoin(module.usersTable, eq(module.usersTable.id, module.userSessionsTable.userId))
    .where(and(
      eq(module.userSessionsTable.sessionTokenHash, tokenHash),
      isNull(module.userSessionsTable.revokedAt),
      gt(module.userSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);

  return rows[0] || null;
}

function clearSessionCookie(res: Parameters<typeof router.get>[1] extends never ? never : any) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: authCookieSameSite(),
    path: "/",
    domain: authCookieDomain(),
  });
}

router.get("/telegram/config", async (_req, res) => {
  const botUsername = normalizeTelegramBotUsername();
  res.json({
    enabled: configuredAuthReady(),
    botUsername,
    botUrl: botUsername ? `https://t.me/${encodeURIComponent(botUsername)}` : "",
  });
});

router.post("/telegram/start", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }
  if (!configuredAuthReady()) {
    res.status(503).json({ error: "Telegram auth is not configured." });
    return;
  }

  const state = randomToken(24);
  const nonce = randomToken(16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + challengeTtlMs());

  await module.db.insert(module.authChallengesTable).values({
    state,
    nonce,
    flow: "telegram_login",
    createdAt: now,
    expiresAt,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  const base = baseUrlFromRequest(req);
  res.json({
    ok: true,
    state,
    expiresAt: expiresAt.toISOString(),
    widgetUrl: `${base}/ka-api/auth/telegram/widget?state=${encodeURIComponent(state)}`,
  });
});

router.post("/telegram/fallback/start", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }
  if (!configuredAuthReady()) {
    res.status(503).json({ error: "Telegram auth is not configured." });
    return;
  }

  const state = randomToken(24);
  const code = randomCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + challengeTtlMs());

  await module.db.insert(module.authChallengesTable).values({
    state,
    nonce: sha256Hex(code),
    flow: "telegram_login_code",
    createdAt: now,
    expiresAt,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  const botUsername = normalizeTelegramBotUsername();
  res.json({
    ok: true,
    state,
    code,
    expiresAt: expiresAt.toISOString(),
    botUsername,
    botUrl: botUsername ? `https://t.me/${encodeURIComponent(botUsername)}` : "",
    deepLinkUrl: botUsername ? `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(`login_${code}`)}` : "",
    command: `/login ${code}`,
  });
});

router.post("/telegram/fallback/verify", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const state = String((req.body as { state?: string } | undefined)?.state || "").trim();
  if (!state) {
    res.status(400).json({ error: "Missing login state." });
    return;
  }

  const challengeRows = await module.db
    .select()
    .from(module.authChallengesTable)
    .where(and(
      eq(module.authChallengesTable.state, state),
      eq(module.authChallengesTable.flow, "telegram_login_code"),
      isNull(module.authChallengesTable.consumedAt),
      gt(module.authChallengesTable.expiresAt, new Date()),
    ))
    .limit(1);

  if (!challengeRows.length) {
    res.status(400).json({ error: "Login code is invalid or expired." });
    return;
  }

  const challenge = challengeRows[0];
  let telegramIdentity: TelegramIdentity | null = null;

  // Search updates for any /login command whose code hash matches this challenge.
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    res.status(503).json({ error: "Telegram auth is not configured." });
    return;
  }

  const updatesResponse = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates?limit=100&allowed_updates=%5B%22message%22%5D`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!updatesResponse.ok) {
    res.status(502).json({ error: "Could not verify login code. Try again." });
    return;
  }
  const updatesPayload = await updatesResponse.json().catch(() => null) as { ok?: boolean; description?: string; result?: Array<{ message?: TelegramUpdateMessage }> } | null;
  if (!updatesPayload?.ok) {
    const description = String(updatesPayload?.description || "");
    if (/webhook/i.test(description)) {
      res.status(409).json({ error: "Bot uses webhook mode, so code verification via polling is blocked. Disable webhook or use a dedicated auth bot." });
      return;
    }
    res.status(502).json({ error: `Could not verify login code. ${description || "Try again."}`.trim() });
    return;
  }
  const updates = updatesPayload?.result ?? [];

  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const message = updates[index]?.message;
    if (!message?.text || !message.from?.id) continue;
    const parsedCode = normalizeLoginCommand(message.text);
    if (!parsedCode) continue;
    if (sha256Hex(parsedCode) !== challenge.nonce) continue;
    telegramIdentity = {
      telegramUserId: String(message.from.id),
      telegramUsername: message.from.username,
      firstName: message.from.first_name,
      lastName: message.from.last_name,
      photoUrl: undefined,
    };
    break;
  }

  if (!telegramIdentity) {
    res.status(409).json({ error: "Code not found yet. Send /login CODE to the bot, then verify again." });
    return;
  }

  const userId = await upsertTelegramUser(module, telegramIdentity);
  if (!userId) {
    res.status(500).json({ error: "Failed to create user session." });
    return;
  }

  const session = await createSession(module, userId, req.ip, req.get("user-agent"));

  await module.db
    .update(module.authChallengesTable)
    .set({ consumedAt: new Date() })
    .where(eq(module.authChallengesTable.id, challenge.id));

  res.cookie(SESSION_COOKIE_NAME, session.rawSessionToken, {
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: authCookieSameSite(),
    path: "/",
    maxAge: sessionTtlMs(),
    domain: authCookieDomain(),
  });

  res.json({ ok: true });
});

router.get("/telegram/widget", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).type("text/plain").send("Database is not configured.");
    return;
  }

  const state = String(req.query?.state || "").trim();
  if (!state) {
    res.status(400).type("text/plain").send("Missing auth state.");
    return;
  }

  const challengeRows = await module.db
    .select()
    .from(module.authChallengesTable)
    .where(and(
      eq(module.authChallengesTable.state, state),
      isNull(module.authChallengesTable.consumedAt),
      gt(module.authChallengesTable.expiresAt, new Date()),
    ))
    .limit(1);

  if (!challengeRows.length) {
    res.status(400).type("text/plain").send("Auth state is invalid or expired.");
    return;
  }

  const botUsername = normalizeTelegramBotUsername();
  const base = baseUrlFromRequest(req);
  const callbackUrl = `${base}/ka-api/auth/telegram/callback?state=${encodeURIComponent(state)}`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Telegram Login</title>
    <style>
      body { font-family: sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1020; color: #e2e8f0; }
      .card { width: min(92vw, 420px); background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 20px; }
      .title { font-size: 18px; font-weight: 700; margin: 0 0 10px; }
      .body { margin: 0 0 14px; font-size: 14px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="title">Sign in with Telegram</h1>
      <p class="body">Use your Telegram account to continue. This does not change your reminder subscriptions.</p>
      <script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${encodeHtml(botUsername)}" data-size="large" data-userpic="false" data-auth-url="${encodeHtml(callbackUrl)}" data-request-access="write"></script>
    </div>
  </body>
</html>`;
  res.type("html").send(html);
});

router.get("/telegram/callback", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).type("text/plain").send("Database is not configured.");
    return;
  }

  const state = String(req.query?.state || "").trim();
  if (!state) {
    res.status(400).type("text/plain").send("Missing auth state.");
    return;
  }

  const challengeRows = await module.db
    .select()
    .from(module.authChallengesTable)
    .where(and(
      eq(module.authChallengesTable.state, state),
      isNull(module.authChallengesTable.consumedAt),
      gt(module.authChallengesTable.expiresAt, new Date()),
    ))
    .limit(1);

  if (!challengeRows.length) {
    res.status(400).type("text/plain").send("Auth state is invalid or expired.");
    return;
  }

  const payload = telegramAuthPayloadFromQuery(req.query as Record<string, unknown>);
  if (!payload.id || !payload.auth_date || !payload.hash || !verifyTelegramPayload(payload)) {
    res.status(400).type("text/plain").send("Telegram signature validation failed.");
    return;
  }

  const authDate = Number(payload.auth_date);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || nowSeconds - authDate > authMaxAgeSeconds()) {
    res.status(400).type("text/plain").send("Telegram auth payload is expired.");
    return;
  }

  const userId = await upsertTelegramUser(module, {
    telegramUserId: payload.id,
    telegramUsername: payload.username || undefined,
    firstName: payload.first_name || undefined,
    lastName: payload.last_name || undefined,
    photoUrl: payload.photo_url || undefined,
  });

  if (!userId) {
    res.status(500).type("text/plain").send("Failed to create user session.");
    return;
  }

  const session = await createSession(module, userId, req.ip, req.get("user-agent"));

  await module.db
    .update(module.authChallengesTable)
    .set({ consumedAt: new Date() })
    .where(eq(module.authChallengesTable.id, challengeRows[0].id));

  res.cookie(SESSION_COOKIE_NAME, session.rawSessionToken, {
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: authCookieSameSite(),
    path: "/",
    maxAge: sessionTtlMs(),
    domain: authCookieDomain(),
  });

  const base = baseUrlFromRequest(req);
  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Login complete</title></head>
  <body>
    <script>
      (function () {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ source: "${POST_MESSAGE_SOURCE}", type: "telegram-auth-success" }, "*");
          window.close();
          return;
        }
        // Mobile browsers often block/ignore popup close; redirect to app to finish login in same tab.
        window.location.replace("${encodeHtml(base)}" + "/?auth=ok");
      })();
    </script>
    Login complete. You can close this window.
  </body>
</html>`;
  res.type("html").send(html);
});

router.get("/session", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const rawSessionToken = String(req.cookies?.[SESSION_COOKIE_NAME] || "").trim();
  if (!rawSessionToken) {
    res.json({ authenticated: false, guest: true });
    return;
  }

  const sessionUser = await getSessionUser(module, rawSessionToken);
  if (!sessionUser) {
    clearSessionCookie(res);
    res.json({ authenticated: false, guest: true });
    return;
  }

  await module.db
    .update(module.userSessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(module.userSessionsTable.id, sessionUser.sessionId));

  const displayName = [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ")
    || sessionUser.telegramUsername
    || "Telegram user";
  const preferredDisplayName = String(sessionUser.displayName || "").trim() || displayName;

  res.json({
    authenticated: true,
    guest: false,
    user: {
      id: sessionUser.userId,
      isAdmin: isAdminTelegramUser(sessionUser.telegramUserId),
      telegramUsername: sessionUser.telegramUsername || "",
      firstName: sessionUser.firstName || "",
      lastName: sessionUser.lastName || "",
      photoUrl: sessionUser.photoUrl || "",
      displayName: preferredDisplayName,
      gameId: sessionUser.gameId || "",
    },
  });
});

router.post("/profile", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const rawSessionToken = String(req.cookies?.[SESSION_COOKIE_NAME] || "").trim();
  if (!rawSessionToken) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  const sessionUser = await getSessionUser(module, rawSessionToken);
  if (!sessionUser) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session expired." });
    return;
  }

  try {
    const nextDisplayName = normalizeDisplayName((req.body as { displayName?: string } | undefined)?.displayName);
    const nextGameId = normalizeGameId((req.body as { gameId?: string } | undefined)?.gameId);

    await module.db
      .update(module.usersTable)
      .set({
        displayName: nextDisplayName || null,
        gameId: nextGameId || null,
      })
      .where(eq(module.usersTable.id, sessionUser.userId));

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid profile values." });
  }
});

router.post("/logout", async (req, res) => {
  const module = await getDbModule();
  if (!module) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const rawSessionToken = String(req.cookies?.[SESSION_COOKIE_NAME] || "").trim();
  if (rawSessionToken) {
    await module.db
      .update(module.userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(module.userSessionsTable.sessionTokenHash, sha256Hex(rawSessionToken)));
  }

  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
