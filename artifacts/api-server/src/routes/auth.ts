import { Router } from "express";
import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

const router = Router();

type DbModule = typeof import("@workspace/db");

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_CHALLENGE_TTL_MS = 1000 * 60 * 5;
const DEFAULT_AUTH_MAX_AGE_SECONDS = 300;
const SESSION_COOKIE_NAME = "ka_session";
const POST_MESSAGE_SOURCE = "ka-auth";

let dbModule: DbModule | null = null;

function authCookieSameSite(): "lax" | "strict" | "none" {
  const raw = String(process.env.AUTH_COOKIE_SAME_SITE || "none").trim().toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") return raw;
  return "none";
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

function normalizeTelegramBotUsername() {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) return "";
  return raw.replace(/^@+/, "");
}

function configuredAuthReady() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && normalizeTelegramBotUsername());
}

function baseUrlFromRequest(req: Parameters<typeof router.get>[1] extends never ? never : any) {
  const explicit = process.env.AUTH_PUBLIC_BASE_URL?.trim() || process.env.EVENT_REMINDER_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
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
      telegramUsername: module.usersTable.telegramUsername,
      firstName: module.usersTable.firstName,
      lastName: module.usersTable.lastName,
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

  const existingUserRows = await module.db
    .select({ id: module.usersTable.id })
    .from(module.usersTable)
    .where(eq(module.usersTable.telegramUserId, payload.id))
    .limit(1);

  const now = new Date();
  let userId = existingUserRows[0]?.id;
  if (!userId) {
    const inserted = await module.db
      .insert(module.usersTable)
      .values({
        telegramUserId: payload.id,
        telegramUsername: payload.username || undefined,
        firstName: payload.first_name || undefined,
        lastName: payload.last_name || undefined,
        photoUrl: payload.photo_url || undefined,
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
        telegramUsername: payload.username || undefined,
        firstName: payload.first_name || undefined,
        lastName: payload.last_name || undefined,
        photoUrl: payload.photo_url || undefined,
        lastLoginAt: now,
      })
      .where(eq(module.usersTable.id, userId));
  }

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

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Login complete</title></head>
  <body>
    <script>
      (function () {
        if (window.opener) {
          window.opener.postMessage({ source: "${POST_MESSAGE_SOURCE}", type: "telegram-auth-success" }, "*");
        }
        window.close();
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

  res.json({
    authenticated: true,
    guest: false,
    user: {
      id: sessionUser.userId,
      telegramUsername: sessionUser.telegramUsername || "",
      firstName: sessionUser.firstName || "",
      lastName: sessionUser.lastName || "",
      photoUrl: sessionUser.photoUrl || "",
      displayName,
    },
  });
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
