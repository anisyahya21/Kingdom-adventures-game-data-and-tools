import { Router, type Request } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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

export interface HistoryEntry {
  id: string;
  timestamp: number;
  userName: string;
  changeType: "stat" | "slot" | "equip-icon" | "stat-icon" | "weapon-type" | "weapon-category" | "monster" | "weekly-conquest" | "job";
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
};
export type Job = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
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

type CommunityGuide = {
  id: string;
  slug: string;
  title: string;
  author: string;
  docUrl: string;
  docId: string;
  ownerToken: string;
  createdAt: number;
  updatedAt: number;
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
  syncedDevices: [],
  communitySightings: {},
  communityGuides: [],
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState(): SharedState {
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
      syncedDevices: [],
      communitySightings: {},
      communityGuides: [],
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state: SharedState) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
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

function publicGuide(guide: CommunityGuide) {
  const { ownerToken: _ownerToken, ...rest } = guide;
  return rest;
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

router.get("/ka/shared", (_req, res) => {
  res.json(readState());
});

router.get("/ka/guides", (_req, res) => {
  const state = readState();
  res.json({ guides: state.communityGuides.map(publicGuide) });
});

router.post("/ka/guides", (req, res) => {
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
  const now = Date.now();
  const guide: CommunityGuide = {
    id: crypto.randomUUID(),
    slug: uniqueGuideSlug(state, slugify(cleanTitle)),
    title: cleanTitle,
    author: String(author ?? "").trim(),
    docUrl: cleanDocUrl,
    docId,
    ownerToken: String(ownerToken ?? crypto.randomUUID()),
    createdAt: now,
    updatedAt: now,
  };
  state.communityGuides = [guide, ...(state.communityGuides ?? [])];
  writeState(state);
  res.json({ guide: publicGuide(guide) });
});

router.patch("/ka/guides/:id", (req, res) => {
  const { ownerToken, title } = req.body as { ownerToken?: string; title?: string };
  const state = readState();
  const guide = state.communityGuides.find((item) => item.id === req.params.id);
  if (!guide) {
    res.status(404).json({ error: "Guide not found." });
    return;
  }
  if (!ownerToken || ownerToken !== guide.ownerToken) {
    res.status(403).json({ error: "Only the submitter can edit this guide." });
    return;
  }
  const cleanTitle = String(title ?? "").trim();
  if (!cleanTitle) {
    res.status(400).json({ error: "Title is required." });
    return;
  }
  guide.title = cleanTitle;
  guide.slug = uniqueGuideSlug(state, slugify(cleanTitle), guide.id);
  guide.updatedAt = Date.now();
  writeState(state);
  res.json({ guide: publicGuide(guide) });
});

router.delete("/ka/guides/:id", (req, res) => {
  const { ownerToken } = req.body as { ownerToken?: string };
  const state = readState();
  const guide = state.communityGuides.find((item) => item.id === req.params.id);
  if (!guide) {
    res.status(404).json({ error: "Guide not found." });
    return;
  }
  if (!ownerToken || ownerToken !== guide.ownerToken) {
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
