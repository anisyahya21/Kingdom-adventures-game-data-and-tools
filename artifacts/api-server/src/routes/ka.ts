import { Router, type Request } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { STATIC_SOURCES, getCachedContent, ensureGuideDocCached, refreshStaticSourceIfStale } from "../lib/google-cache";
import { renderJobPreview, renderJobPreviewByName } from "../lib/character-preview";
import multer from "multer";
// Multer setup for image uploads
const PUBLIC_IMAGES_DIR = path.resolve(process.cwd(), "artifacts/kingdom-adventures/public/guides/images");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
    cb(null, PUBLIC_IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    // Use a unique filename
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = `${base}-${Date.now()}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({ storage });

type UploadedImageRequest = Request & { file?: { filename: string } };


const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "ka_shared.json");
const DB_STATE_KEY = "ka_shared_state_v1";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  userName: string;
  changeType: "stat" | "slot" | "equip-icon" | "stat-icon" | "weapon-type" | "weapon-category" | "monster" | "weekly-conquest" | "job" | "loadout";
  itemName: string;
  description: string;
}

export type MonsterSpawn = { area: string; level: number };
export type Monster = { icon?: string; spawns: MonsterSpawn[] };
export type CommunitySighting = { area: string; level: number };

export type WeeklyConquest = {
  monsters: string[];
  reward: { jobName: string; jobRank: string; diamonds: number; equipment: string };
  updatedBy: string;
  updatedAt: number;
};

export type JobStatEntry = { base: number; inc: number; levels?: Record<string, number> };
export type JobRank = { stats: Record<string, JobStatEntry> };
export type SharedPair = { id: string; jobA: string; jobB: string; children: string[]; affinity?: string };
export type MarriageMatcherRank = "S" | "A" | "B" | "C" | "D";
export type MarriageMatcherState = {
  rankSlots: Array<{
    id: string;
    rank: MarriageMatcherRank;
    jobName: string;
    males: number;
    females: number;
    unassigned: number;
  }>;
  lockedPairs: Array<{
    id: string;
    maleJob: string;
    femaleJob: string;
    rank: MarriageMatcherRank;
  }>;
  desiredChildren: string[];
  targetChildTypeFilter: "all" | "combat" | "non-combat";
  targetExclusiveFilter: "all" | "exclude-exclusive" | "only-exclusive";
  targetIncludeJobs: string[];
  targetExcludeJobs: string[];
  updatedAt: number;
};
export type Skill = {
  name: string;
  studioLevel?: number;
  craftingIntelligence?: number;
  buyPrice?: number;
  sellPrice?: number;
  description?: string;
  flags?: number;
};

const LEGACY_SKILL_TEXT_PATH = path.resolve(
  process.cwd(),
  "KA-Legacy-Archive",
  "kingdom-adventures-tmp",
  "KA_assets",
  "xls",
  "English.lproj",
  "Skill.txt",
);
let cachedLegacySkillFlags: Record<string, number> | null = null;

function loadLegacySkillFlags() {
  if (cachedLegacySkillFlags) return cachedLegacySkillFlags;
  cachedLegacySkillFlags = {};
  if (!fs.existsSync(LEGACY_SKILL_TEXT_PATH)) return cachedLegacySkillFlags;

  const text = fs.readFileSync(LEGACY_SKILL_TEXT_PATH, "latin1");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 34) continue;

    const baseName = cols[29].trim();
    const argName = cols[30].trim();
    const resolvedName = baseName.replace("<0>", argName).trim();
    if (!resolvedName) continue;

    const lowerName = resolvedName.toLowerCase();
    if (lowerName === "skill" || lowerName === "not used" || lowerName === "unused") continue;

    const rawFlags = cols[33].trim();
    const flag = Number(rawFlags);
    if (!Number.isFinite(flag)) continue;

    cachedLegacySkillFlags[resolvedName] = flag;
  }

  return cachedLegacySkillFlags;
}

function withLegacySkillFlags(skills: Record<string, Skill>): Record<string, Skill> {
  const legacyFlags = loadLegacySkillFlags();
  return Object.fromEntries(
    Object.entries(skills).map(([key, skill]) => {
      const enriched: Skill = {
        ...skill,
        flags: skill.flags ?? legacyFlags[skill.name],
      };
      return [key, enriched];
    }),
  );
}

export type Job = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  category?: string;
  icon?: string;
  ranks: Record<string, JobRank>;
  shield?: "can" | "cannot";
  weaponEquip?: Partial<Record<string, "can" | "cannot" | "weak">>;
  skillAccess?: { attack?: "can" | "cannot"; casting?: "can" | "cannot" };
  skills: string[];
  shops?: string[];
  notes?: string;
};

type Loadout = {
  id: string;
  name: string;
  jobName: string;
  rank: string;
  level?: number;
  statLevels?: Record<string, number>;
  equipment: Array<{ name: string; level: number }>;
  skills: string[];
};

type GuideCustomLink = {
  id: string;
  phrase: string;
  href: string;
  target?: GuideLinkTarget;
  occurrenceKey?: string;
};

type GuideCustomIcon = {
  id: string;
  phrase: string;
  iconSrc: string;
  occurrenceKey?: string;
};

type GuideLinkOverrides = {
  disabledAutoLinks: string[];
  disabledOccurrences?: string[];
  disabledAutoIcons?: string[];
  disabledIconOccurrences?: string[];
  customLinks: GuideCustomLink[];
  customIcons?: GuideCustomIcon[];
};

type GuideLinkTarget =
  | { type: "equipment"; equipmentName: string }
  | { type: "job"; jobName: string }
  | { type: "equipment-set"; equipment: Array<{ name: string; level: number }> }
  | { type: "marriage-sim"; parentA?: string; parentB?: string; child?: string }
  | { type: "custom"; href: string };

type CommunityGuide = {
  id: string;
  slug: string;
  title: string;
  author: string;
  docUrl: string;
  docId: string;
  ownerToken: string;
  ownerUserId?: string;
  createdAt: number;
  updatedAt: number;
  linkOverrides?: GuideLinkOverrides;
};

type SharedState = {
  overrides: Record<string, Record<string, { base?: number; inc?: number }>>;
  slotAssignments: Record<string, string>;
  equipIcons: Record<string, string>;
  statIcons: Record<string, string>;
  weaponTypes: Record<string, string>;
  weaponCategories: string[];
  history: HistoryEntry[];
  monsters: Record<string, Monster>;
  weeklyConquest: WeeklyConquest | null;
  jobs: Record<string, Job>;
  pairs: SharedPair[];
  marriageMatcher: MarriageMatcherState | null;
  skills: Record<string, Skill>;
  loadouts: Loadout[];
  loadoutsUpdatedAt: number | null;
  loadoutBoxSetups: unknown[];
  loadoutBoxSetupsUpdatedAt: number | null;
  loadoutBoxSetupShares: Record<string, { id: string; setup: unknown; createdAt: number; updatedAt: number }>;
  syncedDevices: Array<{ id: string; name: string; createdAt: number; syncGroupId?: string }>;
  communitySightings: Record<string, CommunitySighting[]>;
  communityGuides: CommunityGuide[];
};

const DEFAULT_STATE: SharedState = {
  overrides: {},
  slotAssignments: {},
  equipIcons: {},
  statIcons: {},
  weaponTypes: {},
  weaponCategories: [],
  history: [],
  monsters: {},
  weeklyConquest: null,
  jobs: {},
  pairs: [],
  marriageMatcher: null,
  skills: {},
  loadouts: [],
  loadoutsUpdatedAt: null,
  loadoutBoxSetups: [],
  loadoutBoxSetupsUpdatedAt: null,
  loadoutBoxSetupShares: {},
  syncedDevices: [],
  communitySightings: {},
  communityGuides: [],
};

function pruneDeprecatedGuides(state: SharedState): boolean {
  // Disabled: title/slug-based pruning can delete user content unexpectedly.
  // Use explicit admin deletion instead of implicit runtime filtering.
  void state;
  return false;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStateFromFile(): SharedState {
  try {
    ensureDir();
    if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      ...DEFAULT_STATE,
      history: [],
      weaponCategories: [],
      monsters: {},
      weeklyConquest: null,
      jobs: {},
      pairs: [],
      marriageMatcher: null,
      skills: {},
      loadouts: [],
      loadoutsUpdatedAt: null,
      loadoutBoxSetups: [],
      loadoutBoxSetupsUpdatedAt: null,
      loadoutBoxSetupShares: {},
      syncedDevices: [],
      communitySightings: {},
      communityGuides: [],
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

const fileStateBaseline = readStateFromFile();
const baselineEquipIcons = { ...(fileStateBaseline.equipIcons ?? {}) };
const baselineStatIcons = { ...(fileStateBaseline.statIcons ?? {}) };

function mergeIconMap(
  baseline: Record<string, string>,
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const next: Record<string, string> = { ...baseline };
  for (const [rawKey, rawValue] of Object.entries(overrides ?? {})) {
    const key = String(rawKey || "").trim();
    const value = String(rawValue || "").trim();
    if (!key || !value) continue;
    next[key] = value;
  }
  return next;
}

function compactIconOverridesForDatabase(
  iconMap: Record<string, string> | undefined,
  baseline: Record<string, string>,
): Record<string, string> {
  const compact: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(iconMap ?? {})) {
    const key = String(rawKey || "").trim();
    const value = String(rawValue || "").trim();
    if (!key || !value) continue;
    if ((baseline[key] ?? "") === value) continue;
    compact[key] = value;
  }
  return compact;
}

function expandStateWithBaselineIcons(state: SharedState): SharedState {
  return {
    ...state,
    equipIcons: mergeIconMap(baselineEquipIcons, state.equipIcons),
    statIcons: mergeIconMap(baselineStatIcons, state.statIcons),
  };
}

function compactStateForDatabase(state: SharedState): SharedState {
  return {
    ...state,
    equipIcons: compactIconOverridesForDatabase(state.equipIcons, baselineEquipIcons),
    statIcons: compactIconOverridesForDatabase(state.statIcons, baselineStatIcons),
  };
}

function writeStateFile(state: SharedState) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function serializeSharedState(state: SharedState): string | null {
  try {
    return JSON.stringify(state);
  } catch {
    return null;
  }
}

type DbModule = typeof import("@workspace/db");
let dbModule: DbModule | null = null;
let persistenceMode: "database" | "file" = "file";
const SESSION_COOKIE_NAME = "ka_session";

async function initDbModule() {
  if (!process.env.DATABASE_URL) {
    console.info("shared-state: persistence mode=file (DATABASE_URL missing)");
    return;
  }
  try {
    dbModule = await import("@workspace/db");
  } catch (error) {
    console.warn("shared-state: database module unavailable, falling back to file storage", error);
    console.info("shared-state: persistence mode=file (db module unavailable)");
  }
}

function sanitizeStateCandidate(value: unknown): SharedState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<SharedState>;
  return {
    ...DEFAULT_STATE,
    history: [],
    weaponCategories: [],
    monsters: {},
    weeklyConquest: null,
    jobs: {},
    pairs: [],
    marriageMatcher: null,
    skills: {},
    loadouts: [],
    loadoutsUpdatedAt: null,
    loadoutBoxSetups: [],
    loadoutBoxSetupsUpdatedAt: null,
    loadoutBoxSetupShares: {},
    syncedDevices: [],
    communitySightings: {},
    communityGuides: [],
    ...parsed,
  };
}

async function readStateFromDb(): Promise<SharedState | null> {
  if (!dbModule) return null;
  const rows = await dbModule.db
    .select({ value: dbModule.appStateTable.value })
    .from(dbModule.appStateTable)
    .where(eq(dbModule.appStateTable.key, DB_STATE_KEY))
    .limit(1);
  if (!rows.length) return null;
  return sanitizeStateCandidate(rows[0].value);
}

async function writeStateToDb(state: SharedState): Promise<boolean> {
  if (!dbModule) return false;
  const persistedState = compactStateForDatabase(state);
  try {
    await dbModule.db
      .insert(dbModule.appStateTable)
      .values({
        key: DB_STATE_KEY,
        value: persistedState as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dbModule.appStateTable.key,
        set: {
          value: persistedState as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
    return true;
  } catch (error) {
    console.warn("shared-state: failed writing to database", error);
    return false;
  }
}

let stateCache: SharedState = expandStateWithBaselineIcons(readStateFromFile());
void pruneDeprecatedGuides(stateCache);
let lastSharedStateSnapshot = serializeSharedState(stateCache);

async function bootstrapSharedStatePersistence() {
  try {
    console.info("shared-state: starting background persistence initialization");
    await initDbModule();
    if (dbModule) {
      const persisted = await readStateFromDb();
      if (persisted) {
        const persistedSnapshot = serializeSharedState(persisted);
        stateCache = expandStateWithBaselineIcons(persisted);
        const compactedSnapshot = serializeSharedState(compactStateForDatabase(stateCache));
        const needsDbCompaction =
          persistedSnapshot !== null
          && compactedSnapshot !== null
          && compactedSnapshot !== persistedSnapshot;
        const cleaned = pruneDeprecatedGuides(stateCache);
        if (cleaned || needsDbCompaction) {
          const persistedToDb = await writeStateToDb(stateCache);
          if (!persistedToDb) throw new Error("shared-state: failed to persist loaded state");
        }
        writeStateFile(stateCache);
        lastSharedStateSnapshot = serializeSharedState(stateCache);
        persistenceMode = "database";
        console.info("shared-state: persistence mode=database (loaded existing state)");
      } else {
        const cleaned = pruneDeprecatedGuides(stateCache);
        const initialized = await writeStateToDb(stateCache);
        if (!initialized) throw new Error("shared-state: failed to initialize database state from file snapshot");
        if (cleaned) {
          console.info("shared-state: migrated deprecated guide cleanup to database");
        }
        lastSharedStateSnapshot = serializeSharedState(stateCache);
        persistenceMode = "database";
        console.info("shared-state: persistence mode=database (initialized from file snapshot)");
      }
    } else {
      persistenceMode = "file";
      console.info("shared-state: persistence mode=file (using local file state)");
    }
  } catch (error) {
    persistenceMode = "file";
    console.warn("shared-state: initialization failed, using file fallback", error);
  }
}

void bootstrapSharedStatePersistence();

function readState(): SharedState {
  return stateCache;
}

function writeState(state: SharedState) {
  void pruneDeprecatedGuides(state);

  const nextSnapshot = serializeSharedState(state);
  if (nextSnapshot !== null && lastSharedStateSnapshot !== null && nextSnapshot === lastSharedStateSnapshot) {
    return;
  }

  stateCache = state;
  lastSharedStateSnapshot = nextSnapshot;
  writeStateFile(state);
  if (persistenceMode !== "database") {
    console.warn("shared-state: writing with file fallback; set DATABASE_URL to enable durable DB persistence");
  }
  void writeStateToDb(state).then((persisted) => {
    if (persisted) {
      if (persistenceMode !== "database") {
        persistenceMode = "database";
        console.info("shared-state: persistence mode=database (recovered via write-state)");
      }
      return;
    }

    if (persistenceMode !== "file") {
      persistenceMode = "file";
      console.info("shared-state: persistence mode=file fallback");
    }
  });
}

function appendHistory(state: SharedState, entry: Omit<HistoryEntry, "id" | "timestamp">) {
  const full: HistoryEntry = { id: crypto.randomUUID(), timestamp: Date.now(), ...entry };
  state.history = [full, ...state.history].slice(0, 200);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "guide";
}

function extractGoogleDocId(url: string) {
  return url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? "";
}

function sanitizeGuideLinkOverrides(overrides: unknown): GuideLinkOverrides {
  const input = (overrides && typeof overrides === "object" ? overrides : {}) as Partial<GuideLinkOverrides>;
  return {
    disabledAutoLinks: Array.from(
      new Set(
        (Array.isArray(input.disabledAutoLinks) ? input.disabledAutoLinks : [])
          .map((label) => String(label ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 300),
    disabledOccurrences: Array.from(
      new Set(
        (Array.isArray(input.disabledOccurrences) ? input.disabledOccurrences : [])
          .map((key) => String(key ?? "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 500),
    disabledAutoIcons: Array.from(
      new Set(
        (Array.isArray(input.disabledAutoIcons) ? input.disabledAutoIcons : [])
          .map((label) => String(label ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 300),
    disabledIconOccurrences: Array.from(
      new Set(
        (Array.isArray(input.disabledIconOccurrences) ? input.disabledIconOccurrences : [])
          .map((key) => String(key ?? "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 500),
    customLinks: (Array.isArray(input.customLinks) ? input.customLinks : [])
      .map((link) => ({
        id: String(link?.id || crypto.randomUUID()),
        phrase: String(link?.phrase ?? "").trim(),
        href: String(link?.href ?? "").trim(),
        target: sanitizeGuideLinkTarget(link?.target),
        occurrenceKey: String(link?.occurrenceKey ?? "").trim() || undefined,
      }))
      .filter((link) => link.phrase && link.href)
      .slice(0, 300),
    customIcons: (Array.isArray(input.customIcons) ? input.customIcons : [])
      .map((icon) => ({
        id: String(icon?.id || crypto.randomUUID()),
        phrase: String(icon?.phrase ?? "").trim(),
        iconSrc: String(icon?.iconSrc ?? "").trim(),
        occurrenceKey: String(icon?.occurrenceKey ?? "").trim() || undefined,
      }))
      .filter((icon) => icon.phrase && icon.iconSrc)
      .slice(0, 300),
  };
}

function sanitizeGuideLinkTarget(target: unknown): GuideLinkTarget | undefined {
  const input = (target && typeof target === "object" ? target : {}) as Partial<GuideLinkTarget>;
  if (input.type === "equipment") {
    const equipmentName = String(input.equipmentName ?? "").trim();
    return equipmentName ? { type: "equipment", equipmentName } : undefined;
  }
  if (input.type === "job") {
    const jobName = String(input.jobName ?? "").trim();
    return jobName ? { type: "job", jobName } : undefined;
  }
  if (input.type === "equipment-set") {
    const equipment = (Array.isArray(input.equipment) ? input.equipment : [])
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        level: Math.min(99, Math.max(1, Math.round(Number(item?.level) || 99))),
      }))
      .filter((item) => item.name)
      .slice(0, 12);
    return equipment.length ? { type: "equipment-set", equipment } : undefined;
  }
  if (input.type === "marriage-sim") {
    return {
      type: "marriage-sim",
      parentA: String(input.parentA ?? "").trim(),
      parentB: String(input.parentB ?? "").trim(),
      child: String(input.child ?? "").trim(),
    };
  }
  if (input.type === "custom") {
    const href = String(input.href ?? "").trim();
    return href ? { type: "custom", href } : undefined;
  }
  return undefined;
}

function publicGuide(guide: CommunityGuide) {
  const { ownerToken: _ownerToken, ownerUserId: _ownerUserId, ...rest } = guide;
  return {
    ...rest,
    linkOverrides: sanitizeGuideLinkOverrides(guide.linkOverrides),
  };
}

type AuthenticatedSession = {
  userId: string;
  telegramUserId: string;
  isAdmin: boolean;
};

type AnalyticsEventRequest = {
  eventId?: string;
  eventType?: string;
  route?: string;
  toolSlug?: string;
  anonId?: string;
  sessionId?: string;
  referrer?: string;
  country?: string;
};

function getAdminTelegramUserIds() {
  return new Set(
    String(process.env.TELEGRAM_ADMIN_USER_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

async function resolveAuthenticatedSession(req: Request): Promise<AuthenticatedSession | undefined> {
  const rawSessionToken = String((req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME] || "").trim();
  if (!rawSessionToken || !process.env.DATABASE_URL) return undefined;

  if (!dbModule) {
    await initDbModule();
  }
  if (!dbModule) return undefined;

  const tokenHash = crypto.createHash("sha256").update(rawSessionToken).digest("hex");
  const rows = await dbModule.db
    .select({
      userId: dbModule.userSessionsTable.userId,
      telegramUserId: dbModule.usersTable.telegramUserId,
    })
    .from(dbModule.userSessionsTable)
    .innerJoin(dbModule.usersTable, eq(dbModule.usersTable.id, dbModule.userSessionsTable.userId))
    .where(and(
      eq(dbModule.userSessionsTable.sessionTokenHash, tokenHash),
      isNull(dbModule.userSessionsTable.revokedAt),
      gt(dbModule.userSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return {
    userId: row.userId,
    telegramUserId: row.telegramUserId,
    isAdmin: getAdminTelegramUserIds().has(String(row.telegramUserId)),
  };
}

function canManageGuide(session: AuthenticatedSession | undefined, guide: CommunityGuide) {
  if (!session) return false;
  return session.isAdmin || Boolean(guide.ownerUserId && guide.ownerUserId === session.userId);
}

function summarizeToolSlug(route: string) {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const segment = normalized.split("/").filter(Boolean)[0];
  if (!segment) return "home";
  return segment;
}

function requireAdmin(session: AuthenticatedSession | undefined, res: Parameters<typeof router.get>[1] extends never ? never : any) {
  if (session?.isAdmin) return true;
  res.status(403).json({ error: "Admin access required." });
  return false;
}

function countReminderSubscriptions() {
  const reminderStorePath = path.join(DATA_DIR, "event-reminder-subscriptions.json");
  if (!fs.existsSync(reminderStorePath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(reminderStorePath, "utf8")) as { subscriptions?: unknown[] };
    return Array.isArray(parsed.subscriptions) ? parsed.subscriptions.length : 0;
  } catch {
    return 0;
  }
}

function uniqueGuideSlug(state: SharedState, base: string, existingId?: string) {
  let slug = base;
  let suffix = 2;
  while (state.communityGuides.some((guide) => guide.slug === slug && guide.id !== existingId)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

const router = Router();

// Pre-warm guide doc cache for all guides already in the state file.
{
  const state = readState();
  for (const guide of state.communityGuides) {
    ensureGuideDocCached(guide.docId);
  }
}

// GET /ka/google/sheet/:key – serve cached Google Sheet data by whitelisted key
router.get("/ka/google/sheet/:key", (req, res) => {
  const { key } = req.params;
  if (!Object.prototype.hasOwnProperty.call(STATIC_SOURCES, key)) {
    res.status(404).json({ error: "Unknown sheet key" });
    return;
  }
  const data = getCachedContent(key);
  if (!data) {
    res.status(503).json({ error: "Cache is warming up, try again shortly" });
    return;
  }
  refreshStaticSourceIfStale(key);
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.send(data);
});

// GET /ka/google/doc/:docId – serve cached Google Doc markdown by docId
router.get("/ka/google/doc/:docId", (req, res) => {
  const { docId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(docId)) {
    res.status(400).json({ error: "Invalid docId" });
    return;
  }
  ensureGuideDocCached(docId);
  const data = getCachedContent(`guide:${docId}`);
  if (!data) {
    res.status(503).json({ error: "Cache is warming up, try again shortly" });
    return;
  }
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.send(data);
});

// POST /ka/upload-image: Accepts multipart/form-data, saves image, returns URL
router.post("/ka/upload-image", upload.single("image"), (req: UploadedImageRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  // Return the public URL for the uploaded image
  const url = `/guides/images/${req.file.filename}`;
  res.json({ url });
});

const syncCodes = new Map<string, { expiresAt: number; sourceDeviceId: string }>();

type SyncedDevice = SharedState["syncedDevices"][number];

function generateSyncCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizeSyncedDevices(devices: SharedState["syncedDevices"]): SyncedDevice[] {
  return devices.map((device) => ({
    id: device.id,
    name: device.name,
    createdAt: device.createdAt,
    syncGroupId: device.syncGroupId || device.id,
  }));
}

function findDeviceById(devices: SyncedDevice[], id?: string | null): SyncedDevice | undefined {
  if (!id) return undefined;
  return devices.find((device) => device.id === id);
}

function getGroupDevices(devices: SyncedDevice[], groupId: string): SyncedDevice[] {
  return devices
    .filter((device) => device.syncGroupId === groupId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Equipment shared state ────────────────────────────────────────────────────

router.get("/ka/shared", async (req, res) => {
  const state = readState();
  const currentSession = await resolveAuthenticatedSession(req);
  res.json({
    ...state,
    communityGuides: state.communityGuides.map((guide) => ({
      ...publicGuide(guide),
      editable: canManageGuide(currentSession, guide),
    })),
    skills: withLegacySkillFlags(state.skills),
  });
});

router.post("/ka/analytics/events", async (req, res) => {
  if (!dbModule) {
    await initDbModule();
  }
  if (!dbModule) {
    res.json({ ok: true, skipped: true });
    return;
  }

  const body = (req.body ?? {}) as AnalyticsEventRequest;
  const route = String(body.route ?? "").trim();
  const eventType = String(body.eventType ?? "").trim().toLowerCase();
  const anonId = String(body.anonId ?? "").trim();
  const sessionId = String(body.sessionId ?? "").trim();
  if (!route || !eventType || !anonId || !sessionId) {
    res.status(400).json({ error: "Missing required analytics event fields." });
    return;
  }

  const currentSession = await resolveAuthenticatedSession(req);
  const eventId = String(body.eventId ?? crypto.randomUUID()).trim();
  const toolSlug = String(body.toolSlug ?? summarizeToolSlug(route)).trim();
  const referrer = String(body.referrer ?? "").trim() || undefined;
  const country = String(body.country ?? "").trim() || undefined;
  const userAgent = req.get("user-agent") || undefined;

  await dbModule.db
    .insert(dbModule.analyticsEventsTable)
    .values({
      eventId,
      eventType,
      route,
      toolSlug,
      userId: currentSession?.userId,
      anonId,
      sessionId,
      referrer,
      userAgent,
      country,
    })
    .onConflictDoNothing({ target: dbModule.analyticsEventsTable.eventId });

  res.json({ ok: true });
});

router.get("/ka/admin/overview", async (req, res) => {
  const currentSession = await resolveAuthenticatedSession(req);
  if (!requireAdmin(currentSession, res)) return;
  if (!dbModule) {
    await initDbModule();
  }
  if (!dbModule) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const usersCountResult = await dbModule.db
    .select({ count: sql<number>`count(*)::int` })
    .from(dbModule.usersTable);

  const activeSessionsResult = await dbModule.db
    .select({ count: sql<number>`count(*)::int` })
    .from(dbModule.userSessionsTable)
    .where(and(
      isNull(dbModule.userSessionsTable.revokedAt),
      gt(dbModule.userSessionsTable.expiresAt, new Date()),
    ));

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const uniqueVisitors30dResult = await dbModule.db
    .select({ count: sql<number>`count(distinct ${dbModule.analyticsEventsTable.anonId})::int` })
    .from(dbModule.analyticsEventsTable)
    .where(gte(dbModule.analyticsEventsTable.timestamp, since));

  const state = readState();
  res.json({
    users: usersCountResult[0]?.count ?? 0,
    activeSessions: activeSessionsResult[0]?.count ?? 0,
    reminderSubscriptions: countReminderSubscriptions(),
    guides: state.communityGuides.length,
    uniqueVisitors30d: uniqueVisitors30dResult[0]?.count ?? 0,
  });
});

router.get("/ka/admin/top-pages", async (req, res) => {
  const currentSession = await resolveAuthenticatedSession(req);
  if (!requireAdmin(currentSession, res)) return;
  if (!dbModule) {
    await initDbModule();
  }
  if (!dbModule) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const days = Math.max(1, Math.min(365, Math.round(Number(req.query.days) || 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await dbModule.db
    .select({
      route: dbModule.analyticsEventsTable.route,
      views: sql<number>`count(*)::int`,
    })
    .from(dbModule.analyticsEventsTable)
    .where(and(
      eq(dbModule.analyticsEventsTable.eventType, "page_view"),
      gte(dbModule.analyticsEventsTable.timestamp, since),
    ))
    .groupBy(dbModule.analyticsEventsTable.route)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  res.json({ days, rows });
});

router.get("/ka/admin/top-tools", async (req, res) => {
  const currentSession = await resolveAuthenticatedSession(req);
  if (!requireAdmin(currentSession, res)) return;
  if (!dbModule) {
    await initDbModule();
  }
  if (!dbModule) {
    res.status(503).json({ error: "Database is not configured." });
    return;
  }

  const days = Math.max(1, Math.min(365, Math.round(Number(req.query.days) || 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await dbModule.db
    .select({
      toolSlug: dbModule.analyticsEventsTable.toolSlug,
      views: sql<number>`count(*)::int`,
    })
    .from(dbModule.analyticsEventsTable)
    .where(and(
      eq(dbModule.analyticsEventsTable.eventType, "page_view"),
      gte(dbModule.analyticsEventsTable.timestamp, since),
    ))
    .groupBy(dbModule.analyticsEventsTable.toolSlug)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  res.json({
    days,
    rows: rows.filter((row) => String(row.toolSlug ?? "").trim().length > 0),
  });
});

router.get("/ka/guides", async (req, res) => {
  const state = readState();
  const currentSession = await resolveAuthenticatedSession(req);
  res.json({
    guides: state.communityGuides.map((guide) => ({
      ...publicGuide(guide),
      editable: canManageGuide(currentSession, guide),
    })),
  });
});

router.get("/ka/job-preview", (req, res) => {
  try {
    const png = renderJobPreview(req.query as Record<string, string | string[] | undefined>);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.send(png);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(404).json({ error: message });
  }
});

router.get("/ka/job-preview-by-name", (req, res) => {
  try {
    const png = renderJobPreviewByName(req.query as Record<string, string | string[] | undefined>);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.send(png);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(404).json({ error: message });
  }
});

router.post("/ka/guides", async (req, res) => {
  const { title, author, docUrl, ownerToken } = req.body as {
    title?: string;
    author?: string;
    docUrl?: string;
    ownerToken?: string;
  };
  const cleanTitle = String(title ?? "").trim();
  const cleanDocUrl = String(docUrl ?? "").trim();
  const docId = extractGoogleDocId(cleanDocUrl);
  if (!cleanTitle || !docId) {
    res.status(400).json({ error: "A title and public Google Doc link are required." });
    return;
  }

  const state = readState();
  const currentSession = await resolveAuthenticatedSession(req);
  const now = Date.now();
  const guide: CommunityGuide = {
    id: crypto.randomUUID(),
    slug: uniqueGuideSlug(state, slugify(cleanTitle)),
    title: cleanTitle,
    author: String(author ?? "").trim(),
    docUrl: cleanDocUrl,
    docId,
    ownerToken: String(ownerToken ?? crypto.randomUUID()),
    ownerUserId: currentSession?.userId,
    createdAt: now,
    updatedAt: now,
    linkOverrides: sanitizeGuideLinkOverrides(undefined),
  };
  state.communityGuides = [guide, ...(state.communityGuides ?? [])];
  writeState(state);
  ensureGuideDocCached(docId);
  res.json({
    guide: {
      ...publicGuide(guide),
      editable: canManageGuide(currentSession, guide),
    },
  });
});

router.patch("/ka/guides/:id", async (req, res) => {
  const { ownerToken, title, linkOverrides } = req.body as {
    ownerToken?: string;
    title?: string;
    linkOverrides?: GuideLinkOverrides;
  };
  const state = readState();
  const currentSession = await resolveAuthenticatedSession(req);
  const guide = state.communityGuides.find((item) => item.id === req.params.id);
  if (!guide) {
    res.status(404).json({ error: "Guide not found." });
    return;
  }
  const canEditByToken = Boolean(ownerToken && ownerToken === guide.ownerToken);
  const canEditByAccount = canManageGuide(currentSession, guide);
  if (!canEditByToken && !canEditByAccount) {
    res.status(403).json({ error: "Only the submitter can edit this guide." });
    return;
  }
  if (!guide.ownerUserId && canEditByToken && currentSession?.userId) {
    guide.ownerUserId = currentSession.userId;
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body ?? {}, "title");
  const hasLinkOverrides = Object.prototype.hasOwnProperty.call(req.body ?? {}, "linkOverrides");
  if (!hasTitle && !hasLinkOverrides) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }
  if (hasTitle) {
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) {
      res.status(400).json({ error: "Title is required." });
      return;
    }
    guide.title = cleanTitle;
    guide.slug = uniqueGuideSlug(state, slugify(cleanTitle), guide.id);
  }
  if (hasLinkOverrides) {
    guide.linkOverrides = sanitizeGuideLinkOverrides(linkOverrides);
  }
  guide.updatedAt = Date.now();
  writeState(state);
  res.json({
    guide: {
      ...publicGuide(guide),
      editable: canManageGuide(currentSession, guide),
    },
  });
});

router.delete("/ka/guides/:id", async (req, res) => {
  const { ownerToken } = req.body as { ownerToken?: string };
  const state = readState();
  const currentSession = await resolveAuthenticatedSession(req);
  const guide = state.communityGuides.find((item) => item.id === req.params.id);
  if (!guide) {
    res.status(404).json({ error: "Guide not found." });
    return;
  }
  const canDeleteByToken = Boolean(ownerToken && ownerToken === guide.ownerToken);
  const canDeleteByAccount = canManageGuide(currentSession, guide);
  if (!canDeleteByToken && !canDeleteByAccount) {
    res.status(403).json({ error: "Only the submitter can remove this guide." });
    return;
  }
  state.communityGuides = state.communityGuides.filter((item) => item.id !== guide.id);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/shared/overrides", (req, res) => {
  const { data, history } = req.body as { data: SharedState["overrides"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.overrides = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/shared/slots", (req, res) => {
  const { data, history } = req.body as { data: SharedState["slotAssignments"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.slotAssignments = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/shared/icons/equip", (req, res) => {
  const { data, history } = req.body as { data: SharedState["equipIcons"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.equipIcons = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/shared/icons/stat", (req, res) => {
  const { data, history } = req.body as { data: SharedState["statIcons"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.statIcons = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/shared/weapon-types", (req, res) => {
  const { data, history } = req.body as { data: SharedState["weaponTypes"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.weaponTypes = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/shared/weapon-categories", (req, res) => {
  const { data, history } = req.body as { data: SharedState["weaponCategories"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.weaponCategories = Array.isArray(data) ? data : [];
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.post("/ka/shared/rename-user", (req, res) => {
  const { oldName, newName } = req.body as { oldName: string; newName: string };
  if (!oldName || !newName || oldName === newName) {
    return res.status(400).json({ error: "oldName and newName must differ and be non-empty" });
  }
  const state = readState();
  state.history = state.history.map((e) => e.userName === oldName ? { ...e, userName: newName } : e);
  writeState(state);
  return res.json({ ok: true });
});

// ─── Monsters ─────────────────────────────────────────────────────────────────

router.get("/ka/monsters", (_req, res) => {
  res.json(readState().monsters);
});

router.put("/ka/monsters", (req, res) => {
  const { data, history } = req.body as { data: SharedState["monsters"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.monsters = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

// ─── Weekly Conquest ──────────────────────────────────────────────────────────

router.get("/ka/weekly-conquest", (_req, res) => {
  res.json(readState().weeklyConquest);
});

router.put("/ka/weekly-conquest", (req, res) => {
  const { data, history } = req.body as { data: WeeklyConquest; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.weeklyConquest = data ?? null;
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

// ─── Community Sightings ──────────────────────────────────────────────────────

router.get("/ka/community-sightings", (_req, res) => {
  res.json(readState().communitySightings ?? {});
});

router.put("/ka/community-sightings", (req, res) => {
  const { data } = req.body as { data: Record<string, CommunitySighting[]> };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "data must be an object" });
  }
  const state = readState();
  state.communitySightings = data;
  writeState(state);
  return res.json({ ok: true });
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────

router.get("/ka/jobs", (_req, res) => {
  res.json(readState().jobs);
});

router.put("/ka/jobs", (req, res) => {
  const { data, history } = req.body as { data: SharedState["jobs"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.jobs = data ?? {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/skills", (req, res) => {
  const { data, history } = req.body as { data: SharedState["skills"]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.skills = data && typeof data === "object" ? data : {};
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/pairs", (req, res) => {
  const { data, history } = req.body as { data: SharedPair[]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.pairs = Array.isArray(data) ? data : [];
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/marriage-matcher", (req, res) => {
  const { data, history } = req.body as {
    data: SharedState["marriageMatcher"];
    history?: Omit<HistoryEntry, "id" | "timestamp">;
  };
  const state = readState();
  state.marriageMatcher = data ?? null;
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/marriage-matcher/rank-slots", (req, res) => {
  const { data } = req.body as { data: MarriageMatcherState["rankSlots"] };
  const state = readState();
  if (!state.marriageMatcher) {
    state.marriageMatcher = {
      rankSlots: [],
      lockedPairs: [],
      desiredChildren: [],
      targetChildTypeFilter: "all",
      targetExclusiveFilter: "all",
      targetIncludeJobs: [],
      targetExcludeJobs: [],
      updatedAt: Date.now(),
    };
  }
  state.marriageMatcher.rankSlots = Array.isArray(data) ? data : [];
  state.marriageMatcher.updatedAt = Date.now();
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/loadouts", (req, res) => {
  const { data } = req.body as { data: Loadout[] };
  const state = readState();
  state.loadouts = Array.isArray(data) ? data : [];
  state.loadoutsUpdatedAt = Date.now();
  writeState(state);
  res.json({ ok: true });
});

router.put("/ka/loadout-box-setups", (req, res) => {
  const { data, history } = req.body as { data: unknown[]; history?: Omit<HistoryEntry, "id" | "timestamp"> };
  const state = readState();
  state.loadoutBoxSetups = Array.isArray(data) ? data : [];
  state.loadoutBoxSetupsUpdatedAt = Date.now();
  if (history) appendHistory(state, history);
  writeState(state);
  res.json({ ok: true });
});

router.post("/ka/loadout-box-setups/share", (req, res) => {
  const { setup } = req.body as { setup?: unknown };
  if (!setup || typeof setup !== "object") {
    res.status(400).json({ error: "setup is required" });
    return;
  }
  const state = readState();
  const id = crypto.randomBytes(6).toString("base64url");
  const now = Date.now();
  state.loadoutBoxSetupShares[id] = { id, setup, createdAt: now, updatedAt: now };
  writeState(state);
  res.json({ id });
});

router.get("/ka/loadout-box-setups/share/:id", (req, res) => {
  const state = readState();
  const share = state.loadoutBoxSetupShares[req.params.id];
  if (!share) {
    res.status(404).json({ error: "Shared setup not found" });
    return;
  }
  res.json(share);
});

// ─── Device Sync (persisted) ──────────────────────────────────────────────────

router.get("/ka/sync/devices", (_req, res) => {
  const state = readState();
  const currentDeviceId = typeof _req.query.currentDeviceId === "string" ? _req.query.currentDeviceId : "";
  const devices = normalizeSyncedDevices(state.syncedDevices);
  const currentDevice = findDeviceById(devices, currentDeviceId);
  if (!currentDevice) {
    return res.json([]);
  }

  const groupDevices = getGroupDevices(devices, currentDevice.syncGroupId || currentDevice.id);
  return res.json(groupDevices);
});

router.post("/ka/sync/generate", (req, res) => {
  const { name, currentDeviceId } = req.body as { name?: string; currentDeviceId?: string | null };
  const state = readState();
  const devices = normalizeSyncedDevices(state.syncedDevices);

  const existing = findDeviceById(devices, currentDeviceId);
  let device: SyncedDevice;
  if (!existing) {
    device = {
      id: crypto.randomUUID(),
      name: (name ?? "").trim() || "Unnamed Device",
      createdAt: Date.now(),
      syncGroupId: crypto.randomUUID(),
    };
    devices.push(device);
  } else {
    device = typeof name === "string" && name.trim()
      ? { ...existing, name: name.trim() }
      : existing;
    const index = devices.findIndex((entry) => entry.id === device.id);
    devices[index] = device;
  }

  let code = generateSyncCode();
  while (syncCodes.has(code)) {
    code = generateSyncCode();
  }

  const expiresAt = Date.now() + 5 * 60 * 1000;
  syncCodes.set(code, { expiresAt, sourceDeviceId: device.id });
  state.syncedDevices = devices;
  writeState(state);

  res.json({
    ok: true,
    code,
    expiresAt,
    currentDeviceId: device.id,
    device,
  });
});

router.post("/ka/sync/redeem", (req, res) => {
  const { code, name, currentDeviceId } = req.body as {
    code: string;
    name?: string;
    currentDeviceId?: string | null;
  };

  const normalizedCode = (code ?? "").trim().toUpperCase();
  const record = syncCodes.get(normalizedCode);
  if (!record || record.expiresAt <= Date.now()) {
    if (record && record.expiresAt <= Date.now()) {
      syncCodes.delete(normalizedCode);
    }
    return res.status(400).json({ ok: false, message: "Invalid or expired code." });
  }

  const state = readState();
  const devices = normalizeSyncedDevices(state.syncedDevices);
  const sourceDevice = findDeviceById(devices, record.sourceDeviceId);
  if (!sourceDevice) {
    syncCodes.delete(normalizedCode);
    return res.status(400).json({ ok: false, error: "That code is no longer valid." });
  }

  const existing = findDeviceById(devices, currentDeviceId);
  let device: SyncedDevice;
  if (!existing) {
    device = {
      id: crypto.randomUUID(),
      name: (name ?? "").trim() || "Unnamed Device",
      createdAt: Date.now(),
      syncGroupId: sourceDevice.syncGroupId || sourceDevice.id,
    };
  } else {
    device = typeof name === "string" && name.trim()
      ? { ...existing, name: name.trim(), syncGroupId: sourceDevice.syncGroupId || sourceDevice.id }
      : { ...existing, syncGroupId: sourceDevice.syncGroupId || sourceDevice.id };
  }

  const upsert = (d: SyncedDevice) => {
    const idx = devices.findIndex((x) => x.id === d.id);
    if (idx >= 0) devices[idx] = d;
    else devices.push(d);
  };

  upsert(device);
  syncCodes.delete(normalizedCode);
  state.syncedDevices = devices;
  writeState(state);

  return res.json({
    ok: true,
    message: "Device linked successfully.",
    currentDeviceId: device.id,
    device,
  });
});

router.delete("/ka/sync/device/:id", (req, res) => {
  const state = readState();
  const currentDeviceId = typeof req.query.currentDeviceId === "string" ? req.query.currentDeviceId : "";
  const devices = normalizeSyncedDevices(state.syncedDevices);
  const currentDevice = findDeviceById(devices, currentDeviceId);
  const targetDevice = findDeviceById(devices, req.params.id);

  if (!currentDevice || !targetDevice) {
    return res.status(404).json({ error: "Device not found." });
  }

  if ((currentDevice.syncGroupId || currentDevice.id) !== (targetDevice.syncGroupId || targetDevice.id)) {
    return res.status(403).json({ error: "You can only remove devices from your linked group." });
  }

  state.syncedDevices = devices.filter((device) => device.id !== req.params.id);
  writeState(state);
  return res.json({ ok: true });
});

export default router;
