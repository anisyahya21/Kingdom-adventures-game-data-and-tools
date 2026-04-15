import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocalFeature } from "@/hooks/sync/use-local-feature";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Trash2, Loader2, Camera,
  ChevronDown, ChevronRight, Package, X, Check, Pencil,
  Download, Copy, Info, RotateCcw, Crown, Sword, Shield, Gem,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { toPng } from "html-to-image";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { apiUrl } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeaponValue = "can" | "weak" | "cannot";
type Skill = { name: string; studioLevel?: number; craftingIntelligence?: number; buyPrice?: number; sellPrice?: number; description?: string; weaponResistance?: string };
type JobStatEntry = { base: number; inc: number };
type Job = {
  generation: 1 | 2;
  ranks: Record<string, { stats: Record<string, JobStatEntry> }>;
  weaponEquip?: Partial<Record<string, WeaponValue>>;
  shield?: "can" | "cannot";
};
type EquipEntry = { name: string; level: number };
type Loadout = {
  id: string;
  name: string;
  jobName: string;
  rank: string;
  level?: number;          // legacy / fallback default level
  statLevels?: Record<string, number>; // per-stat levels (primary)
  equipment: EquipEntry[];
  skills: string[];
};
type SharedData = {
  jobs?: Record<string, Job>;
  skills?: Record<string, Skill>;
  overrides?: Record<string, Record<string, { base?: number; inc?: number }>>;
  slotAssignments?: Record<string, string>;
  equipIcons?: Record<string, string>;
  weaponTypes?: Record<string, string>;
  loadouts?: Loadout[];
  loadoutsUpdatedAt?: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

// Canonical short stat keys used throughout (Move is merged into Speed)
const STAT_KEYS = ["hp","mp","vig","atk","def","spd","lck","int","dex","gth","hrt"] as const;
const STAT_LABEL: Record<string, string> = {
  hp:"HP", mp:"MP", vig:"Vig", atk:"Atk", def:"Def",
  spd:"Spd", lck:"Lck", int:"Int", dex:"Dex", gth:"Gth", hrt:"Hrt",
};
const STAT_FULL: Record<string, string> = {
  hp:"HP", mp:"MP", vig:"Vigor", atk:"Attack", def:"Defence",
  spd:"Speed", lck:"Luck", int:"Intelligence", dex:"Dexterity",
  gth:"Gather", hrt:"Heart",
};
// Universal stat alias map — normalises any spelling/abbreviation to the canonical short key.
// All variants are lowercased before lookup. Move & Movement are treated as Speed per game rules.
const STAT_CANONICAL: Record<string, string> = {
  // HP
  hp:"hp",
  // MP
  mp:"mp",
  // Vigor
  vig:"vig", vigor:"vig",
  // Attack
  atk:"atk", att:"atk", attack:"atk",
  // Defence / Defense
  def:"def", defence:"def", defense:"def",
  // Speed  (Move / Movement are aliases)
  spd:"spd", speed:"spd",
  move:"spd", mov:"spd", movement:"spd",
  // Luck
  lck:"lck", luck:"lck",
  // Intelligence
  int:"int", intel:"int", intelligence:"int",
  // Dexterity
  dex:"dex", dext:"dex", dexterity:"dex",
  // Gather
  gth:"gth", gather:"gth",
  // Heart
  hrt:"hrt", heart:"hrt",
};

const EQUIP_SLOTS = [
  { slot: "Head",      Icon: Crown   },
  { slot: "Weapon",    Icon: Sword   },
  { slot: "Shield",    Icon: Shield  },
  { slot: "Armor",     Icon: Package },
  { slot: "Accessory", Icon: Gem     },
] as const;
type EquipSlot = typeof EQUIP_SLOTS[number]["slot"];

const RANK_COLORS: Record<string, string> = {
  S:"bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-700",
  A:"bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-700",
  B:"bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700",
  C:"bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700",
  D:"bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
};

function generateId() { return Math.random().toString(36).slice(2, 9); }

function statAtLevel(base: number, inc: number, level: number): number {
  return Math.round(base + (level - 1) * inc);
}

function commitOnEnter(e: React.KeyboardEvent<HTMLInputElement>, commit: () => void) {
  if (e.key === "Enter") {
    commit();
    e.currentTarget.blur();
  }
}

// ─── Weapon proficiency helpers ───────────────────────────────────────────────

function getWeaponProficiency(
  job: Job | undefined,
  equipName: string,
  slot: string,
  weaponTypes: Record<string, string> | undefined
): { weaponType: string | null; prof: WeaponValue | null } {
  if (!job || !equipName) return { weaponType: null, prof: null };
  if (slot === "Shield") {
    const prof = job.weaponEquip?.["Shield"] ?? (job.shield === "can" ? "can" : job.shield === "cannot" ? "cannot" : null);
    return { weaponType: "Shield", prof };
  }
  if (slot !== "Weapon") return { weaponType: null, prof: null };
  const wt = weaponTypes?.[equipName] ?? null;
  if (!wt || wt === "Tool") return { weaponType: wt, prof: null };
  const prof = job.weaponEquip?.[wt] ?? null;
  return { weaponType: wt, prof };
}

function findResistanceSkill(
  skills: Record<string, Skill> | undefined,
  weaponType: string | null
): Skill | null {
  if (!skills || !weaponType) return null;
  return Object.values(skills).find((s) => s.weaponResistance === weaponType) ?? null;
}

type EquipRuleState = {
  slot: string | null;
  weaponType: string | null;
  prof: WeaponValue | null;
  resistanceSkill: Skill | null;
  hasResistanceSkillEquipped: boolean;
  appliesPenalty: boolean;
  blocked: boolean;
};

function getEquipRuleState(loadout: Loadout, data: SharedData, equipName: string): EquipRuleState {
  const slot = data.slotAssignments?.[equipName] ?? null;
  const job = data.jobs?.[loadout.jobName];
  const { weaponType, prof } = getWeaponProficiency(job, equipName, slot ?? "", data.weaponTypes);
  const resistanceSkill = findResistanceSkill(data.skills, weaponType);
  const hasResistanceSkillEquipped = !!resistanceSkill && loadout.skills.includes(resistanceSkill.name);
  const blocked = prof === "cannot";
  const appliesPenalty = prof === "weak" && !hasResistanceSkillEquipped;
  return { slot, weaponType, prof, resistanceSkill, hasResistanceSkillEquipped, appliesPenalty, blocked };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: () => fetchSharedWithFallback<SharedData>(apiUrl("/shared")),
    staleTime: 15000,
  });
}


function useLoadouts(sharedData: SharedData | undefined) {
  const [loadouts, setLoadouts] = useLocalFeature<Loadout[]>("ka_loadouts", []);
  // Ref that always mirrors loadouts — used inside effects to avoid stale closures
  const loadoutsRef = useRef(loadouts);
  useEffect(() => { loadoutsRef.current = loadouts; }, [loadouts]);
  // Sync guards (same pattern as the pairs sync in marriage-matcher)
  const loadoutsHydratedRef = useRef(false);
  const skipNextLoadoutsEchoRef = useRef(false);
  const loadoutsPutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydration: on first API data load, pull loadouts from server.
  // Rule: if loadoutsUpdatedAt is non-null the server has been explicitly saved to
  // and is authoritative — even if loadouts is empty (means user deleted everything).
  // Only push local state when the server has NEVER been initialized (loadoutsUpdatedAt === null).
  useEffect(() => {
    if (loadoutsHydratedRef.current) return;
    if (!sharedData) return; // still loading
    loadoutsHydratedRef.current = true;
    if (sharedData.loadoutsUpdatedAt != null) {
      // Server has been written before — always take its state, even if empty
      skipNextLoadoutsEchoRef.current = true;
      setLoadouts(sharedData.loadouts ?? []);
    } else if (loadoutsRef.current.length > 0) {
      // Server has never been synced — push local state as the initial seed
      fetch(apiUrl("/loadouts"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: loadoutsRef.current }),
      }).catch(() => {});
    }
  }, [sharedData, setLoadouts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced PUT: push loadouts to server on every user change (after hydration)
  useEffect(() => {
    if (!loadoutsHydratedRef.current) return;
    if (skipNextLoadoutsEchoRef.current) {
      skipNextLoadoutsEchoRef.current = false;
      return;
    }
    if (loadoutsPutTimerRef.current) clearTimeout(loadoutsPutTimerRef.current);
    loadoutsPutTimerRef.current = setTimeout(() => {
      fetch(apiUrl("/loadouts"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: loadouts }),
      }).catch(() => {});
    }, 500);
    return () => {
      if (loadoutsPutTimerRef.current) clearTimeout(loadoutsPutTimerRef.current);
    };
  }, [loadouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((next: Loadout[]) => {
    setLoadouts(next);
  }, [setLoadouts]);
  return { loadouts, save };
}

// ─── Stat Calculators ─────────────────────────────────────────────────────────

function getStatLevel(loadout: Loadout, k: string): number {
  return loadout.statLevels?.[k] ?? loadout.level ?? 1;
}

function normStat(raw: string): string {
  return STAT_CANONICAL[raw.toLowerCase()] ?? raw.toLowerCase();
}

function calcJobStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const out: Record<string, number> = {};
  const job = data.jobs?.[loadout.jobName];
  if (job && loadout.rank) {
    const rankStats = job.ranks[loadout.rank]?.stats ?? {};
    for (const [stat, entry] of Object.entries(rankStats)) {
      const k = normStat(stat);
      out[k] = statAtLevel(entry.base, entry.inc, getStatLevel(loadout, k));
    }
  }
  return out;
}

function calcEquipStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const out: Record<string, number> = {};
  const overrides = data.overrides ?? {};
  for (const { name, level } of loadout.equipment) {
    const rule = getEquipRuleState(loadout, data, name);
    if (rule.blocked) continue;
    const multiplier = rule.appliesPenalty ? 0.5 : 1;
    const statOverrides = overrides[name] ?? {};
    for (const [stat, entry] of Object.entries(statOverrides)) {
      const k = normStat(stat);
      const b = entry.base ?? 0;
      const i = entry.inc ?? 0;
      if (b || i) {
        const total = statAtLevel(b, i, level);
        out[k] = (out[k] ?? 0) + Math.floor(total * multiplier);
      }
    }
  }
  return out;
}

function calcStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const job = calcJobStats(loadout, data);
  const equip = calcEquipStats(loadout, data);
  const total = { ...job };
  for (const [k, v] of Object.entries(equip)) total[k] = (total[k] ?? 0) + v;
  return total;
}

// ─── Screenshot Card (portal-rendered) ───────────────────────────────────────

function ScreenshotCard({ loadout, stats }: { loadout: Loadout; stats: Record<string, number> }) {
  const hasStats = STAT_KEYS.some((k) => stats[k]);
  return (
    <div style={{ background: "#0f172a", color: "#f1f5f9", padding: 20, borderRadius: 12, width: 480, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{loadout.name || "Loadout"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {loadout.jobName || "No job"} {loadout.rank ? `· Rank ${loadout.rank}` : ""} {loadout.level > 1 ? `· Lv ${loadout.level}` : ""}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#64748b" }}>Kingdom Adventures</div>
      </div>

      {hasStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginBottom: 14 }}>
          {STAT_KEYS.filter((k) => stats[k]).map((k) => (
            <div key={k} style={{ background: "#1e293b", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{STAT_LABEL[k]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{stats[k].toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {loadout.equipment.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Equipment</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {loadout.equipment.map((eq, i) => (
              <div key={i} style={{ background: "#1e293b", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#e2e8f0" }}>
                {eq.name} {eq.level > 1 ? <span style={{ color: "#64748b" }}>Lv{eq.level}</span> : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {loadout.skills.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Skills</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {loadout.skills.map((s, i) => (
              <div key={i} style={{ background: "#312e81", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#c7d2fe" }}>{s}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loadout Editor ───────────────────────────────────────────────────────────

function LoadoutEditor({ loadout, data, onChange, onDelete, onDuplicate }: {
  loadout: Loadout;
  data: SharedData;
  onChange: (updated: Loadout) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [renamingName, setRenamingName] = useState(false);
  const [nameVal, setNameVal] = useState(loadout.name);
  const [screenshotStatus, setScreenshotStatus] = useState<null | "working" | "ok" | "error">(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const hiddenRef = useRef<HTMLDivElement>(null);

  const jobs = data.jobs ?? {};
  const allSkills = Object.keys(data.skills ?? {}).sort();
  const allEquip = Object.keys(data.overrides ?? {}).filter((n) =>
    data.slotAssignments?.[n] || (data.overrides?.[n] && Object.keys(data.overrides[n]).length > 0)
  ).sort();

  const job = jobs[loadout.jobName];
  const ranks = job ? Object.keys(job.ranks).sort() : ["S","A","B","C","D"];
  const jobStats = useMemo(() => calcJobStats(loadout, data), [loadout, data]);
  const equipStats = useMemo(() => calcEquipStats(loadout, data), [loadout, data]);
  const stats = useMemo(() => {
    const t = { ...jobStats };
    for (const [k, v] of Object.entries(equipStats)) t[k] = (t[k] ?? 0) + v;
    return t;
  }, [jobStats, equipStats]);

  const upd = useCallback(<K extends keyof Loadout>(field: K, val: Loadout[K]) => {
    onChange({ ...loadout, [field]: val });
  }, [loadout, onChange]);

  const setStatLevel = (k: string, lv: number) => {
    upd("statLevels", { ...(loadout.statLevels ?? {}), [k]: Math.max(1, Math.min(999, lv)) });
  };
  const setAllStatLevels = (lv: number) => {
    const next = Math.max(1, Math.min(999, lv));
    const nextLevels: Record<string, number> = {};
    for (const k of allStatKeys) nextLevels[k] = next;
    upd("statLevels", nextLevels);
  };

  // Slot-aware equipment helpers
  const setSlotEquip = (slot: EquipSlot, name: string) => {
    const slotMap = data.slotAssignments ?? {};
    // Remove any existing item in this slot
    const withoutSlot = loadout.equipment.filter((e) => slotMap[e.name] !== slot);
    if (!name) { upd("equipment", withoutSlot); return; }
    upd("equipment", [...withoutSlot, { name, level: 1 }]);
  };
  const removeEquip = (i: number) => upd("equipment", loadout.equipment.filter((_, j) => j !== i));
  const setEquipLevel = (i: number, level: number) => {
    upd("equipment", loadout.equipment.map((e, j) => j === i ? { ...e, level: Math.max(1, Math.min(99, level)) } : e));
  };

  const addSkill = (name: string) => {
    if (!name || loadout.skills.includes(name) || loadout.skills.length >= 9) return;
    upd("skills", [...loadout.skills, name].sort());
  };
  const removeSkill = (name: string) => upd("skills", loadout.skills.filter((s) => s !== name));

  const takeScreenshot = async () => {
    if (!hiddenRef.current) return;
    setScreenshotStatus("working");
    try {
      const url = await toPng(hiddenRef.current, { pixelRatio: 2 });
      setScreenshotUrl(url);
      setScreenshotStatus("ok");
      setTimeout(() => setScreenshotStatus(null), 2500);
    } catch {
      setScreenshotStatus("error");
      setTimeout(() => setScreenshotStatus(null), 2500);
    }
  };

  const downloadScreenshot = () => {
    if (!screenshotUrl) return;
    const a = document.createElement("a");
    a.href = screenshotUrl;
    a.download = `${loadout.name || "loadout"}.png`;
    a.click();
  };

  const allStatKeys = [...STAT_KEYS] as string[];
  const [allLv, setAllLv] = useState(1);
  const [allLvInput, setAllLvInput] = useState("1");
  const [statLevelInputs, setStatLevelInputs] = useState<Record<string, string>>({});
  const [equipLevelInputs, setEquipLevelInputs] = useState<Record<number, string>>({});

  const setAllStatLevelsInput = (raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setAllLvInput(raw);
  };

  const commitAllStatLevels = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = Math.max(1, Math.min(999, isNaN(parsed) ? 1 : parsed));
    setAllLv(next);
    setAllLvInput(String(next));
    setAllStatLevels(next);
    const nextInputs: Record<string, string> = {};
    for (const k of allStatKeys) nextInputs[k] = String(next);
    setStatLevelInputs(nextInputs);
  };

  const setStatLevelInput = (k: string, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setStatLevelInputs((prev) => ({ ...prev, [k]: raw }));
  };

  const commitStatLevel = (k: string, raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = Math.max(1, Math.min(999, isNaN(parsed) ? 1 : parsed));
    setStatLevel(k, next);
    setStatLevelInputs((prev) => ({ ...prev, [k]: String(next) }));
  };

  const setEquipLevelInput = (idx: number, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setEquipLevelInputs((prev) => ({ ...prev, [idx]: raw }));
  };

  const commitEquipLevel = (idx: number, raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = Math.max(1, Math.min(99, isNaN(parsed) ? 1 : parsed));
    setEquipLevel(idx, next);
    setEquipLevelInputs((prev) => ({ ...prev, [idx]: String(next) }));
  };

  return (
    <div className="space-y-4">
      {/* Hidden screenshot node */}
      <div style={{ position: "absolute", top: -9999, left: -9999, pointerEvents: "none" }}>
        <div ref={hiddenRef}>
          <ScreenshotCard loadout={loadout} stats={stats} />
        </div>
      </div>

      {/* Screenshot preview modal */}
      <Dialog open={!!screenshotUrl} onOpenChange={(open) => { if (!open) setScreenshotUrl(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Screenshot ready</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-2">Right-click the image to save, or use the download button below.</p>
          {screenshotUrl && (
            <img src={screenshotUrl} alt="Loadout screenshot" className="w-full rounded-lg border border-border" style={{ imageRendering: "auto" }} />
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setScreenshotUrl(null)}>Close</Button>
            <Button size="sm" onClick={downloadScreenshot} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Download PNG
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Name + actions */}
      <div className="flex items-center gap-2">
        {renamingName ? (
          <div className="flex gap-1.5 flex-1">
            <Input value={nameVal} onChange={(e) => setNameVal(e.target.value)} className="h-8 text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") { upd("name", nameVal); setRenamingName(false); } if (e.key === "Escape") { setNameVal(loadout.name); setRenamingName(false); } }}
              autoFocus />
            <button onClick={() => { upd("name", nameVal); setRenamingName(false); }} className="text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm truncate">{loadout.name || "Unnamed Loadout"}</h3>
            <button onClick={() => { setNameVal(loadout.name); setRenamingName(true); }} className="text-muted-foreground hover:text-foreground shrink-0"><Pencil className="w-3 h-3" /></button>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={takeScreenshot} disabled={screenshotStatus === "working"} className={`h-8 gap-1.5 shrink-0 text-xs ${screenshotStatus === "ok" ? "text-emerald-600 border-emerald-400" : screenshotStatus === "error" ? "text-destructive border-destructive/40" : ""}`}>
          {screenshotStatus === "working" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {screenshotStatus === "ok" ? "Saved!" : screenshotStatus === "error" ? "Failed" : "Screenshot"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Job + Per-stat breakdown */}
        <div className="space-y-3">
          {/* Job selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</p>
            <SearchableSelect
              value={loadout.jobName}
              onChange={(v) => onChange({ ...loadout, jobName: v })}
              options={Object.keys(jobs).sort().map((n) => ({ value: n, label: n }))}
              placeholder="Select job…"
              triggerClassName="h-8 text-sm"
            />
            {loadout.jobName && (
              <select
                value={loadout.rank}
                onChange={(e) => upd("rank", e.target.value)}
                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="" disabled>Select rank</option>
                {ranks.map((r) => (
                  <option key={r} value={r}>
                    Rank {r}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Per-stat breakdown table */}
          {loadout.jobName && loadout.rank && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stats</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">All Lv:</span>
                  <Input type="text" inputMode="numeric" value={allLvInput}
                    onChange={(e) => setAllStatLevelsInput(e.target.value)}
                    onKeyDown={(e) => commitOnEnter(e, () => commitAllStatLevels(e.currentTarget.value))}
                    onBlur={(e) => commitAllStatLevels(e.target.value)}
                    className="h-5 text-[11px] text-center px-0 w-14" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium">Stat</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-center w-16">Level</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-right w-14">Job</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-right w-14">Equip</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-right w-14">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStatKeys.map((k) => {
                      const hasJob = jobStats[k] !== undefined;
                      const lv = getStatLevel(loadout, k);
                      const eq = equipStats[k];
                      const total = (jobStats[k] ?? 0) + (eq ?? 0);
                      return (
                        <tr key={k} className="border-t border-border/30">
                          <td className="py-0.5 pr-2 text-muted-foreground uppercase text-[10px] font-medium">{STAT_FULL[k] ?? k}</td>
                          <td className="py-0.5 text-center">
                            <Input type="text" inputMode="numeric" value={statLevelInputs[k] ?? String(lv)}
                              onChange={(e) => setStatLevelInput(k, e.target.value)}
                              onKeyDown={(e) => commitOnEnter(e, () => commitStatLevel(k, e.currentTarget.value))}
                              onBlur={(e) => commitStatLevel(k, e.target.value)}
                              className="h-5 text-[11px] text-center px-0 w-14" />
                          </td>
                          <td className="py-0.5 text-right tabular-nums text-foreground/80">{hasJob ? (jobStats[k] ?? 0).toLocaleString() : <span className="text-muted-foreground/30">—</span>}</td>
                          <td className="py-0.5 text-right tabular-nums text-sky-600 dark:text-sky-400">{eq ? `+${eq.toLocaleString()}` : <span className="text-muted-foreground/20">—</span>}</td>
                          <td className="py-0.5 text-right tabular-nums font-bold">{total > 0 ? total.toLocaleString() : <span className="text-muted-foreground/30">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Equipment + Skills */}
        <div className="space-y-3">
          {/* Equipment — 5-slot card grid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Equipment</p>
            {(() => {
              const slotMap = data.slotAssignments ?? {};
              const iconMap = data.equipIcons ?? {};
              // Items grouped by slot
              const slotToEquip: Record<string, EquipEntry> = {};
              for (const eq of loadout.equipment) {
                const s = slotMap[eq.name];
                if (s) slotToEquip[s] = eq;
              }
              // Items in no known slot
              const extra = loadout.equipment.filter((eq) => !slotMap[eq.name]);
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2">
                    {EQUIP_SLOTS.map(({ slot, Icon }) => {
                      const eq = slotToEquip[slot];
                      const globalIdx = eq ? loadout.equipment.findIndex((e) => e.name === eq.name) : -1;
                      const icon = eq ? iconMap[eq.name] : null;
                      const slotItems = Object.entries(slotMap)
                        .filter(([, s]) => s === slot)
                        .map(([n]) => n)
                        .sort();
                      return (
                        <div key={slot} className={`flex flex-col rounded-lg border-2 transition-colors ${eq ? "border-primary/30 bg-primary/5" : "border-dashed border-border/60 bg-muted/20"}`}>
                          {/* Slot header */}
                          <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{slot}</span>
                            {eq && (
                              <button onClick={() => setSlotEquip(slot as EquipSlot, "")} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {/* Icon area */}
                          <div className="flex items-center justify-center py-3 px-1">
                            {eq && icon ? (
                              <img src={icon} alt={eq.name} className="w-14 h-14 object-contain rounded" />
                            ) : eq ? (
                              <div className="w-14 h-14 rounded bg-muted/40 flex items-center justify-center">
                                <Icon className="w-7 h-7 text-muted-foreground/50" />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded bg-muted/20 flex items-center justify-center">
                                <Icon className="w-7 h-7 text-muted-foreground/25" />
                              </div>
                            )}
                          </div>
                          {/* Item name + level or select */}
                          <div className="px-2 pb-2 space-y-1">
                            {eq ? (
                              <>
                                <p className="text-[11px] font-medium text-center text-foreground/80 leading-tight line-clamp-2 min-h-[30px]">{eq.name}</p>
                                {/* Weapon proficiency badge */}
                                {(() => {
                                  const rule = getEquipRuleState(loadout, data, eq.name);
                                  if (!rule.prof || rule.prof === "can") return null;
                                  const isWeak = rule.prof === "weak";
                                  return (
                                    <div className="text-center space-y-0.5">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                        isWeak
                                          ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700"
                                          : "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-700"
                                      }`}>
                                        {isWeak
                                          ? (rule.appliesPenalty ? "⚠ Weak: 50%" : "✓ Weak removed")
                                          : "✗ Can't wield"}
                                      </span>
                                      {rule.blocked ? (
                                        <p className="text-[8px] text-muted-foreground leading-tight">
                                          This item is ignored in stat totals
                                        </p>
                                      ) : rule.resistanceSkill && (
                                        <p className="text-[8px] text-muted-foreground leading-tight">
                                          {rule.hasResistanceSkillEquipped
                                            ? `${rule.resistanceSkill.name} restores full stats`
                                            : `${rule.resistanceSkill.name} removes this penalty`}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="flex items-center gap-1 justify-center">
                                  <span className="text-xs text-muted-foreground">Lv</span>
                                  <Input type="text" inputMode="numeric" value={equipLevelInputs[globalIdx] ?? String(eq.level)}
                                    onChange={(e) => setEquipLevelInput(globalIdx, e.target.value)}
                                    onKeyDown={(e) => commitOnEnter(e, () => commitEquipLevel(globalIdx, e.currentTarget.value))}
                                    onBlur={(e) => commitEquipLevel(globalIdx, e.target.value)}
                                    className="h-6 text-xs text-center w-14 px-0" />
                                </div>
                              </>
                            ) : (
                              <SearchableSelect
                                value=""
                                clearOnSelect
                                onChange={(v) => { if (v) setSlotEquip(slot as EquipSlot, v); }}
                                options={slotItems.map((n) => ({ value: n, label: n }))}
                                placeholder="— empty —"
                                triggerClassName="h-7 text-[10px]"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Unassigned items (no slot in db) */}
                  {extra.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider mb-1">Other</p>
                      <div className="space-y-1">
                        {extra.map((eq) => {
                          const idx = loadout.equipment.findIndex((e) => e.name === eq.name);
                          return (
                            <div key={eq.name} className="flex items-center gap-1.5 bg-muted/30 rounded-md px-2 py-1">
                              {iconMap[eq.name] ? <img src={iconMap[eq.name]} alt="" className="w-4 h-4 object-contain" /> : <div className="w-4 h-4" />}
                              <span className="text-xs flex-1 truncate font-medium">{eq.name}</span>
                              <span className="text-[10px] text-muted-foreground">Lv</span>
                              <Input type="text" inputMode="numeric" value={equipLevelInputs[idx] ?? String(eq.level)}
                                onChange={(e) => setEquipLevelInput(idx, e.target.value)}
                                onKeyDown={(e) => commitOnEnter(e, () => commitEquipLevel(idx, e.currentTarget.value))}
                                onBlur={(e) => commitEquipLevel(idx, e.target.value)}
                                className="h-5 text-[10px] text-center w-12 px-0" />
                              <button onClick={() => removeEquip(idx)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Skills */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Skills <span className="normal-case font-normal">({loadout.skills.length}/9)</span>
            </p>
            <div className="flex flex-wrap gap-1 mb-2 min-h-6">
              {loadout.skills.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                  {s}
                  <button onClick={() => removeSkill(s)} className="hover:text-destructive ml-0.5"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              ))}
              {loadout.skills.length === 0 && <span className="text-xs text-muted-foreground/60">No skills selected</span>}
            </div>
            {loadout.skills.length < 9 && allSkills.length > 0 && (
              <SearchableSelect
                value=""
                clearOnSelect
                onChange={(v) => { if (v) addSkill(v); }}
                options={allSkills.filter((s) => !loadout.skills.includes(s)).map((s) => ({ value: s, label: s }))}
                placeholder="+ Add skill…"
                triggerClassName="h-7 text-xs"
              />
            )}
            {allSkills.length === 0 && <p className="text-xs text-muted-foreground/60">No skills in database yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoadoutPage() {
  const { data, isLoading } = useSharedData();
  const { loadouts, save } = useLoadouts(data);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageNote, setPageNote] = useLocalFeature<string>("ka_note_loadout", "");
  const [showNote, setShowNote] = useState(false);

  const addLoadout = () => {
    const id = generateId();
    const newLoadout: Loadout = { id, name: "New Loadout", jobName: "", rank: "", statLevels: {}, equipment: [], skills: [] };
    save([...loadouts, newLoadout]);
    setExpandedId(id);
  };

  const updateLoadout = useCallback((updated: Loadout) => {
    save(loadouts.map((l) => l.id === updated.id ? updated : l));
  }, [loadouts, save]);

  const deleteLoadout = useCallback((id: string) => {
    save(loadouts.filter((l) => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [loadouts, save, expandedId]);

  const duplicateLoadout = useCallback((id: string) => {
    const source = loadouts.find((l) => l.id === id);
    if (!source) return;
    const newId = generateId();
    const duplicate: Loadout = { ...source, id: newId, name: `Copy of ${source.name}` };
    save([...loadouts, duplicate]);
    setExpandedId(newId);
  }, [loadouts, save]);

  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />Loadout Builder
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowNote((v) => !v)} className="h-8 w-8 text-muted-foreground" title="Personal notes (private, stored on this device)">
              <Info className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => {
              if (confirm("Delete all your loadouts? This cannot be undone.")) {
                save([]);
              }
            }} className="h-8 w-8 text-muted-foreground" title="Reset all loadouts">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={addLoadout} className="h-8 gap-1.5">
              <Plus className="w-3.5 h-3.5" />New Loadout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(e) => setPageNote(e.target.value)}
              placeholder="Personal notes for this page… (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        )}

        {!isLoading && loadouts.length === 0 && (
          <div className="text-center py-20">
            <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No loadouts yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1 mb-5">Create a loadout to combine job stats, equipment, and skills.</p>
            <Button onClick={addLoadout} className="gap-1.5"><Plus className="w-4 h-4" />Create First Loadout</Button>
          </div>
        )}

        <div className="space-y-3">
          {loadouts.map((loadout) => {
            const isOpen = expandedId === loadout.id;
            const job = data?.jobs?.[loadout.jobName];
            const stats = data ? calcStats(loadout, data) : {};
            const hasStats = STAT_KEYS.some((k) => stats[k]);

            return (
              <Card key={loadout.id} className="shadow-sm overflow-hidden">
                {/* Summary bar */}
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(isOpen ? null : loadout.id)}
                >
                  <CardHeader className="py-3 px-4 hover:bg-muted/30 transition-colors">
                    {/* Row 1: chevron + name + job + rank + duplicate */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <CardTitle className="text-base font-bold truncate flex-1 min-w-0">
                        {loadout.name || "Unnamed Loadout"}
                      </CardTitle>
                      {loadout.jobName && (
                        <span className="text-sm font-bold text-primary shrink-0">{loadout.jobName}</span>
                      )}
                      {loadout.rank && (
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 border font-semibold ${RANK_COLORS[loadout.rank] ?? ""} shrink-0`}>
                          Rank {loadout.rank}
                        </Badge>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateLoadout(loadout.id); }}
                        className="text-muted-foreground hover:text-primary shrink-0 ml-1"
                        title="Duplicate this loadout"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteLoadout(loadout.id); }}
                        className="text-destructive hover:text-destructive/70 shrink-0 ml-1"
                        title="Delete this loadout"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Collapsed detail rows */}
                    {!isOpen && (
                      <div className="pl-6 mt-2 space-y-2">
                        {/* All stats */}
                        {hasStats && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {STAT_KEYS.filter((k) => stats[k]).map((k) => (
                              <span key={k} className="text-xs tabular-nums">
                                <span className="text-muted-foreground">{STAT_LABEL[k]} </span>
                                <strong className="text-foreground">{stats[k].toLocaleString()}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Equipment chips */}
                        {loadout.equipment.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {loadout.equipment.map((eq) => {
                              const icon = data?.equipIcons?.[eq.name];
                              const slot = data?.slotAssignments?.[eq.name];
                              const rule = data ? getEquipRuleState(loadout, data, eq.name) : null;
                              return (
                                <span key={eq.name} className="inline-flex items-center gap-1.5 bg-muted/50 border border-border/50 rounded-md px-2 py-0.5 text-xs">
                                  {slot && <span className="text-muted-foreground/60 font-medium">{slot}:</span>}
                                  {icon && <img src={icon} alt="" className="w-4 h-4 object-contain shrink-0" />}
                                  <span className="font-medium">{eq.name}</span>
                                  <span className="text-muted-foreground">Lv{eq.level}</span>
                                  {rule?.blocked && <span className="text-orange-600 dark:text-orange-400 font-semibold">Can't</span>}
                                  {rule?.appliesPenalty && <span className="text-amber-600 dark:text-amber-400 font-semibold">Weak</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {/* Skill pills */}
                        {loadout.skills.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground/70 shrink-0">Skills:</span>
                            {loadout.skills.map((s) => (
                              <span key={s} className="inline-block bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-md px-2 py-0.5 text-xs">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {!hasStats && loadout.equipment.length === 0 && loadout.skills.length === 0 && (
                          <span className="text-xs text-muted-foreground/50">Empty loadout — click to configure</span>
                        )}
                      </div>
                    )}
                  </CardHeader>
                </button>

                {isOpen && (
                  <>
                    <Separator />
                    <CardContent className="p-4">
                      {data ? (
                        <LoadoutEditor
                          loadout={loadout}
                          data={data}
                          onChange={updateLoadout}
                          onDelete={() => deleteLoadout(loadout.id)}
                          onDuplicate={() => duplicateLoadout(loadout.id)}
                        />
                      ) : (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                      )}
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
        </div>

        {loadouts.length > 0 && !isLoading && (
          <button onClick={addLoadout}
            className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors py-4 text-sm text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4" />Add another loadout
          </button>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Loadouts are saved to your browser — private to you
        </p>
      </div>
    </div>
  );
}

