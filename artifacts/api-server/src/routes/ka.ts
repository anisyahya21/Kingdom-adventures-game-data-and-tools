import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

const router = Router();

const syncedDevices = new Map<string, { id: string; name: string; createdAt: number }>();
const syncCodes = new Map<string, { expiresAt: number; sourceDeviceId: string }>();

function generateSyncCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Equipment shared state ────────────────────────────────────────────────────

router.get("/ka/shared", (_req, res) => {
  res.json(readState());
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
  res.json({ ok: true });
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

// ─── Device Sync (in-memory) ──────────────────────────────────────────────────

router.get("/ka/sync/devices", (_req, res) => {
  const devices = [...syncedDevices.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json(devices);
});

router.post("/ka/sync/generate", (req, res) => {
  const { name, currentDeviceId } = req.body as { name?: string; currentDeviceId?: string | null };

  let device = currentDeviceId ? syncedDevices.get(currentDeviceId) : undefined;
  if (!device) {
    const id = crypto.randomUUID();
    device = {
      id,
      name: (name ?? "").trim() || "Unnamed Device",
      createdAt: Date.now(),
    };
    syncedDevices.set(id, device);
  } else if (typeof name === "string" && name.trim()) {
    device = { ...device, name: name.trim() };
    syncedDevices.set(device.id, device);
  }

  let code = generateSyncCode();
  while (syncCodes.has(code)) {
    code = generateSyncCode();
  }

  const expiresAt = Date.now() + 5 * 60 * 1000;
  syncCodes.set(code, { expiresAt, sourceDeviceId: device.id });

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

  let device = currentDeviceId ? syncedDevices.get(currentDeviceId) : undefined;
  if (!device) {
    const id = crypto.randomUUID();
    device = {
      id,
      name: (name ?? "").trim() || "Unnamed Device",
      createdAt: Date.now(),
    };
  } else if (typeof name === "string" && name.trim()) {
    device = { ...device, name: name.trim() };
  }

  syncedDevices.set(device.id, device);

  if (!syncedDevices.has(record.sourceDeviceId)) {
    syncedDevices.set(record.sourceDeviceId, {
      id: record.sourceDeviceId,
      name: "Source Device",
      createdAt: Date.now(),
    });
  }

  syncCodes.delete(normalizedCode);

  res.json({
    ok: true,
    message: "Device linked successfully.",
    currentDeviceId: device.id,
    device,
  });
});

router.delete("/ka/sync/device/:id", (req, res) => {
  syncedDevices.delete(req.params.id);
  res.json({ ok: true });
});

export default router;
