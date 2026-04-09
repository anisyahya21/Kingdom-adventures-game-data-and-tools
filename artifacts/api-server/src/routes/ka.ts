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
  changeType: "stat" | "slot" | "equip-icon" | "stat-icon";
  itemName: string;
  description: string;
}

type SharedState = {
  overrides: Record<string, Record<string, { base?: number; inc?: number }>>;
  slotAssignments: Record<string, string>;
  equipIcons: Record<string, string>;
  statIcons: Record<string, string>;
  history: HistoryEntry[];
};

const DEFAULT_STATE: SharedState = {
  overrides: {},
  slotAssignments: {},
  equipIcons: {},
  statIcons: {},
  history: [],
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState(): SharedState {
  try {
    ensureDir();
    if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...DEFAULT_STATE, history: [], ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state: SharedState) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function appendHistory(state: SharedState, entry: Omit<HistoryEntry, "id" | "timestamp">) {
  const full: HistoryEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...entry,
  };
  state.history = [full, ...state.history].slice(0, 200);
}

const router = Router();

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

router.post("/ka/shared/rename-user", (req, res) => {
  const { oldName, newName } = req.body as { oldName: string; newName: string };
  if (!oldName || !newName || oldName === newName) {
    return res.status(400).json({ error: "oldName and newName must differ and be non-empty" });
  }
  const state = readState();
  state.history = state.history.map((e) =>
    e.userName === oldName ? { ...e, userName: newName } : e
  );
  writeState(state);
  res.json({ ok: true });
});

export default router;
