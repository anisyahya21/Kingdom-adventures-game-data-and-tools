import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, Trash2, Moon, Sun, Loader2, Camera,
  ChevronDown, ChevronRight, Package, X, Check, Pencil,
  Download, Copy, Info, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toPng } from "html-to-image";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = (path: string) => `${BASE}/ka-api/ka${path}`;

// ─── Types ────────────────────────────────────────────────────────────────────

type Skill = { name: string; studioLevel?: number; craftingIntelligence?: number; buyPrice?: number; sellPrice?: number };
type JobStatEntry = { base: number; inc: number };
type Job = { generation: 1 | 2; ranks: Record<string, { stats: Record<string, JobStatEntry> }>; };
type SharedData = {
  jobs?: Record<string, Job>;
  skills?: Record<string, Skill>;
  overrides?: Record<string, Record<string, { base?: number; inc?: number }>>;
  slotAssignments?: Record<string, string>;
  equipIcons?: Record<string, string>;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const STAT_KEYS = ["hp","mp","vig","atk","def","spd","lck","int","dex","gth","mov","hrt"] as const;
const STAT_LABEL: Record<string, string> = {
  hp:"HP", mp:"MP", vig:"Vig", atk:"Atk", def:"Def",
  spd:"Spd", lck:"Lck", int:"Int", dex:"Dex", gth:"Gth", mov:"Mov", hrt:"Hrt",
};
const STAT_FULL: Record<string, string> = {
  hp:"HP", mp:"MP", vig:"Vigor", atk:"Attack", def:"Defence",
  spd:"Speed", lck:"Luck", int:"Intelligence", dex:"Dexterity",
  gth:"Gather", mov:"Move", hrt:"Heart",
};
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

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: async () => {
      const r = await fetch(API("/shared"));
      return r.json() as Promise<SharedData>;
    },
    staleTime: 15000,
  });
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : false
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, setDark };
}

function useLoadouts() {
  const [loadouts, setLoadouts] = useState<Loadout[]>(() => {
    try { return JSON.parse(localStorage.getItem("ka_loadouts") ?? "[]"); }
    catch { return []; }
  });
  const save = useCallback((next: Loadout[]) => {
    setLoadouts(next);
    localStorage.setItem("ka_loadouts", JSON.stringify(next));
  }, []);
  return { loadouts, save };
}

// ─── Stat Calculators ─────────────────────────────────────────────────────────

function getStatLevel(loadout: Loadout, k: string): number {
  return loadout.statLevels?.[k] ?? loadout.level ?? 1;
}

function calcJobStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const out: Record<string, number> = {};
  const job = data.jobs?.[loadout.jobName];
  if (job && loadout.rank) {
    const rankStats = job.ranks[loadout.rank]?.stats ?? {};
    for (const [stat, entry] of Object.entries(rankStats)) {
      const k = stat.toLowerCase();
      out[k] = statAtLevel(entry.base, entry.inc, getStatLevel(loadout, k));
    }
  }
  return out;
}

function calcEquipStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const out: Record<string, number> = {};
  const overrides = data.overrides ?? {};
  for (const { name, level } of loadout.equipment) {
    const statOverrides = overrides[name] ?? {};
    for (const [stat, entry] of Object.entries(statOverrides)) {
      const k = stat.toLowerCase();
      const b = entry.base ?? 0;
      const i = entry.inc ?? 0;
      if (b || i) out[k] = (out[k] ?? 0) + statAtLevel(b, i, level);
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

function LoadoutEditor({ loadout, data, onChange, onDelete }: {
  loadout: Loadout;
  data: SharedData;
  onChange: (updated: Loadout) => void;
  onDelete: () => void;
}) {
  const [renamingName, setRenamingName] = useState(false);
  const [nameVal, setNameVal] = useState(loadout.name);
  const [screenshotStatus, setScreenshotStatus] = useState<null | "working" | "ok" | "error">(null);
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

  const addEquip = (name: string) => {
    if (!name || loadout.equipment.some((e) => e.name === name)) return;
    upd("equipment", [...loadout.equipment, { name, level: 1 }]);
  };
  const removeEquip = (i: number) => upd("equipment", loadout.equipment.filter((_, j) => j !== i));
  const setEquipLevel = (i: number, level: number) => {
    upd("equipment", loadout.equipment.map((e, j) => j === i ? { ...e, level: Math.max(1, level) } : e));
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
      // Try clipboard first
      let copied = false;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      } catch { /* clipboard not available */ }
      // Always trigger download (browser shows "Save As" if configured, or saves to Downloads)
      const a = document.createElement("a");
      a.href = url;
      a.download = `${loadout.name || "loadout"}.png`;
      a.click();
      setScreenshotStatus("ok");
      setTimeout(() => setScreenshotStatus(null), 2500);
      void copied;
    } catch {
      setScreenshotStatus("error");
      setTimeout(() => setScreenshotStatus(null), 2500);
    }
  };

  const allStatKeys = STAT_KEYS.filter((k) => jobStats[k] !== undefined || equipStats[k] !== undefined);

  return (
    <div className="space-y-4">
      {/* Hidden screenshot node */}
      <div style={{ position: "absolute", top: -9999, left: -9999, pointerEvents: "none" }}>
        <div ref={hiddenRef}>
          <ScreenshotCard loadout={loadout} stats={stats} />
        </div>
      </div>

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
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Job + Per-stat breakdown */}
        <div className="space-y-3">
          {/* Job selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</p>
            <select value={loadout.jobName} onChange={(e) => onChange({ ...loadout, jobName: e.target.value, rank: "", statLevels: {} })}
              className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Select job…</option>
              {Object.keys(jobs).sort().map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {loadout.jobName && (
              <select value={loadout.rank} onChange={(e) => upd("rank", e.target.value)}
                className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">Rank…</option>
                {ranks.map((r) => <option key={r} value={r}>Rank {r}</option>)}
              </select>
            )}
          </div>

          {/* Per-stat breakdown table */}
          {allStatKeys.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Stats</p>
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
                      return (
                        <tr key={k} className="border-t border-border/30">
                          <td className="py-0.5 pr-2 text-muted-foreground uppercase text-[10px] font-medium">{STAT_FULL[k] ?? k}</td>
                          <td className="py-0.5 text-center">
                            {hasJob ? (
                              <Input type="number" min={1} max={999} value={lv}
                                onChange={(e) => setStatLevel(k, parseInt(e.target.value) || 1)}
                                className="h-5 text-[11px] text-center px-0 w-14" />
                            ) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="py-0.5 text-right tabular-nums text-foreground/80">{hasJob ? (jobStats[k] ?? 0).toLocaleString() : <span className="text-muted-foreground/30">—</span>}</td>
                          <td className="py-0.5 text-right tabular-nums text-sky-600 dark:text-sky-400">{eq ? `+${eq.toLocaleString()}` : <span className="text-muted-foreground/20">—</span>}</td>
                          <td className="py-0.5 text-right tabular-nums font-bold">{(stats[k] ?? 0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {allStatKeys.length === 0 && loadout.jobName && loadout.rank && (
            <p className="text-xs text-muted-foreground/50 text-center py-4">No stat data for this job/rank yet.</p>
          )}
        </div>

        {/* Right: Equipment + Skills */}
        <div className="space-y-3">
          {/* Equipment (slot-based) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Equipment <span className="normal-case font-normal">({loadout.equipment.length} items)</span>
            </p>
            {(() => {
              const slotMap = data.slotAssignments ?? {};
              const iconMap = data.equipIcons ?? {};
              const groups: Record<string, EquipEntry[]> = {};
              const unassigned: EquipEntry[] = [];
              for (const eq of loadout.equipment) {
                const slot = slotMap[eq.name];
                if (slot) { (groups[slot] ??= []).push(eq); }
                else { unassigned.push(eq); }
              }
              const allSlots = Object.keys(groups).sort();
              const renderRow = (eq: EquipEntry, i: number) => {
                const globalIdx = loadout.equipment.findIndex((e) => e.name === eq.name);
                const icon = iconMap[eq.name];
                return (
                  <div key={eq.name} className="flex items-center gap-1.5 bg-muted/30 rounded-md px-2 py-1">
                    {icon ? <img src={icon} alt="" className="w-4 h-4 shrink-0 object-contain" /> : <div className="w-4 h-4 shrink-0" />}
                    <span className="text-xs flex-1 truncate font-medium">{eq.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">Lv</span>
                    <Input type="number" min={1} max={999} value={eq.level}
                      onChange={(e) => setEquipLevel(globalIdx, parseInt(e.target.value) || 1)}
                      className="h-6 text-xs text-center w-14 px-1 shrink-0" />
                    <button onClick={() => removeEquip(globalIdx)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3 h-3" /></button>
                  </div>
                );
              };
              return (
                <div className="space-y-2 mb-2 max-h-52 overflow-y-auto">
                  {allSlots.map((slot) => (
                    <div key={slot}>
                      <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider px-0.5 mb-0.5">{slot}</p>
                      <div className="space-y-1">{groups[slot].map(renderRow)}</div>
                    </div>
                  ))}
                  {unassigned.length > 0 && (
                    <div>
                      {allSlots.length > 0 && <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider px-0.5 mb-0.5">Other</p>}
                      <div className="space-y-1">{unassigned.map(renderRow)}</div>
                    </div>
                  )}
                  {loadout.equipment.length === 0 && <p className="text-xs text-muted-foreground/40 text-center py-2">No equipment added yet.</p>}
                </div>
              );
            })()}
            <select value="" onChange={(e) => { addEquip(e.target.value); }}
              className="w-full h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground">
              <option value="">+ Add equipment…</option>
              {allEquip.filter((n) => !loadout.equipment.some((e) => e.name === n)).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
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
              <select value="" onChange={(e) => { addSkill(e.target.value); }}
                className="w-full h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground">
                <option value="">+ Add skill…</option>
                {allSkills.filter((s) => !loadout.skills.includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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
  const { dark, setDark } = useDarkMode();
  const { data, isLoading } = useSharedData();
  const { loadouts, save } = useLoadouts();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_loadout") ?? "");
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

  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />Home
              </button>
            </Link>
            <span className="text-muted-foreground/30">/</span>
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
            <Button variant="outline" size="icon" onClick={() => setDark((d) => !d)} className="h-8 w-8">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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
              onBlur={() => localStorage.setItem("ka_note_loadout", pageNote)}
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
                    <div className="flex items-center gap-3 flex-wrap">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <CardTitle className="text-sm font-semibold truncate flex-1">
                        {loadout.name || "Unnamed Loadout"}
                      </CardTitle>
                      {loadout.jobName && (
                        <span className="text-xs text-muted-foreground shrink-0">{loadout.jobName}</span>
                      )}
                      {loadout.rank && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${RANK_COLORS[loadout.rank] ?? ""} shrink-0`}>
                          Rank {loadout.rank}
                        </Badge>
                      )}
                      {loadout.level > 1 && <span className="text-xs text-muted-foreground shrink-0">Lv {loadout.level}</span>}
                      {loadout.equipment.length > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">{loadout.equipment.length} equip</span>
                      )}
                      {loadout.skills.length > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">{loadout.skills.length} skills</span>
                      )}

                      {/* Quick stat preview */}
                      {hasStats && !isOpen && (
                        <div className="flex gap-2 ml-1 flex-wrap">
                          {STAT_KEYS.filter((k) => stats[k]).slice(0, 4).map((k) => (
                            <span key={k} className="text-[10px] tabular-nums">
                              <span className="text-muted-foreground">{STAT_LABEL[k]} </span>
                              <strong>{stats[k].toLocaleString()}</strong>
                            </span>
                          ))}
                          {STAT_KEYS.filter((k) => stats[k]).length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+more</span>
                          )}
                        </div>
                      )}
                    </div>
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
