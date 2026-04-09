import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, Trash2, Moon, Sun, RefreshCw, Loader2, X,
  Check, Star, Sword, Save, ImageIcon, Heart, ArrowUpDown,
  ArrowUp, ArrowDown, Settings2, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = (p: string) => `${BASE}/ka-api/ka${p}`;

const STAT_ORDER   = ["HP","MP","Vigor","Attack","Defence","Speed","Luck","Intelligence","Dexterity","Gather","Move","Heart"];
const STAT_SHORT: Record<string,string> = {
  HP:"HP", MP:"MP", Vigor:"Vig", Attack:"Atk", Defence:"Def",
  Speed:"Spd", Luck:"Lck", Intelligence:"Int", Dexterity:"Dex",
  Gather:"Gth", Move:"Mov", Heart:"Hrt",
};
const DEFAULT_RANKS  = ["S","A","B","C","D"];
const GEN1_RANKS     = ["S","A","B","C","D"];
const GEN2_RANKS     = ["S","A","B","C"];
const MAX_LEVEL     = 999;

// ─── Types ────────────────────────────────────────────────────────────────────

type WeaponValue   = "can" | "cannot" | "weak";
type JobStatEntry  = { base: number; inc: number; levels?: Record<string,number> };
type JobRankData   = { stats: Record<string,JobStatEntry> };
type Job = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  icon?: string;
  ranks: Record<string,JobRankData>;
  shield?: "can" | "cannot";
  weaponEquip?: Partial<Record<string,WeaponValue>>;
  skillAccess?: { attack?: "can"|"cannot"; casting?: "can"|"cannot" };
  skills: string[];
};
type SharedData = {
  jobs: Record<string,Job>;
  statIcons: Record<string,string>;
  weaponCategories?: string[];
};

function statAtLevel(entry: JobStatEntry, level: number): number {
  const ov = entry.levels?.[String(level)];
  if (ov !== undefined) return ov;
  return entry.base + (level - 1) * entry.inc;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

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

function useUserName() {
  const [name, setName] = useState(() => localStorage.getItem("ka_username") ?? "");
  const save = (n: string) => { setName(n); localStorage.setItem("ka_username", n); };
  return { name, save };
}

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: async () => {
      const r = await fetch(API("/shared"));
      return r.json() as Promise<SharedData>;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function persistJobs(jobs: Record<string,Job>, userName: string, desc: string) {
  await fetch(API("/jobs"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: jobs, history: { userName, changeType: "job", itemName: "jobs", description: desc } }),
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NamePrompt({ onSave }: { onSave: (n: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <Dialog open>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>What's your name?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This will be shown on edits you make.</p>
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Your name"
          className="h-8 text-sm"
          onKeyDown={(e) => e.key === "Enter" && val.trim() && onSave(val.trim())} />
        <Button size="sm" onClick={() => val.trim() && onSave(val.trim())} className="w-full">Continue</Button>
      </DialogContent>
    </Dialog>
  );
}

function NewJobDialog({ open, onClose, onCreate }: {
  open: boolean; onClose: () => void;
  onCreate: (name: string, gen: 1|2, type: "combat"|"non-combat") => void;
}) {
  const [name, setName]     = useState("");
  const [gen, setGen]       = useState<1|2>(1);
  const [jobType, setJobType] = useState<"combat"|"non-combat">("combat");
  const submit = () => { if (name.trim()) { onCreate(name.trim(), gen, jobType); setName(""); } };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Add Job</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Job name…"
            className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Generation</label>
            <div className="flex gap-2">
              {([1,2] as const).map((g) => (
                <button key={g} onClick={() => setGen(g)}
                  className={`flex-1 py-1.5 text-xs rounded border font-medium transition-colors ${gen === g ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                  {g === 1 ? "1st Gen" : "2nd Gen"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <div className="flex gap-2">
              {(["combat","non-combat"] as const).map((t) => (
                <button key={t} onClick={() => setJobType(t)}
                  className={`flex-1 py-1.5 text-xs rounded border font-medium transition-colors ${jobType === t
                    ? t === "combat" ? "bg-red-500 text-white border-red-500" : "bg-sky-500 text-white border-sky-500"
                    : "border-border hover:border-primary/40"}`}>
                  {t === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 h-8 text-sm" onClick={submit}>Add Job</Button>
            <Button variant="outline" className="h-8 text-sm" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────

interface RowState {
  showBackend: boolean;
  levels: Record<string, number>; // per-stat preview level
  rank:   string;
  draft:  Record<string, { base: number; inc: number }>;
  dirty:  boolean;
}

function makeRowState(job: Job): RowState {
  const availRanks = job.generation === 1 ? GEN1_RANKS : GEN2_RANKS;
  const existingRanks = Object.keys(job.ranks);
  const rank = availRanks.find((r) => existingRanks.includes(r)) ?? existingRanks[0] ?? "S";
  return { showBackend: false, levels: {}, rank, draft: {}, dirty: false };
}

function clampLevel(v: number): number {
  return Math.min(MAX_LEVEL, Math.max(1, v));
}

function JobRow({ jobName, job, statIcons, onDelete, onSaveStats, canDelete }: {
  jobName:     string;
  job:         Job;
  statIcons:   Record<string,string>;
  onDelete:    () => void;
  onSaveStats: (rank: string, stats: Record<string,JobStatEntry>) => Promise<void>;
  canDelete:   boolean;
}) {
  const [rs, setRs] = useState<RowState>(() => makeRowState(job));

  const availRanks    = job.generation === 1 ? GEN1_RANKS : GEN2_RANKS;
  const currentStats  = job.ranks[rs.rank]?.stats ?? {};

  // Keep rank valid if job.ranks changes externally
  const rankKeys = Object.keys(job.ranks);
  if (!rankKeys.includes(rs.rank) && rankKeys.length > 0) {
    setRs((r) => ({ ...r, rank: rankKeys[0] }));
  }

  // Merge draft on top of saved stats (for live preview while editing backend)
  const effectiveStats = useMemo(() => {
    const merged: Record<string,JobStatEntry> = { ...currentStats };
    for (const [stat, d] of Object.entries(rs.draft)) {
      merged[stat] = { ...(merged[stat] ?? { base:0, inc:0 }), ...d };
    }
    return merged;
  }, [currentStats, rs.draft]);

  const levelFor = (stat: string) => rs.levels[stat] ?? 1;

  const val = (stat: string) => {
    const s = effectiveStats[stat];
    return s ? statAtLevel(s, levelFor(stat)) : null;
  };

  const setLevel = (stat: string, raw: string) => {
    const n = parseInt(raw);
    if (!isNaN(n)) {
      setRs((r) => ({ ...r, levels: { ...r.levels, [stat]: clampLevel(n) } }));
    }
  };

  const changeRank = (rank: string) => {
    setRs((r) => ({ ...r, rank, draft: {}, dirty: false }));
  };

  const setDraftField = (stat: string, field: "base"|"inc", v: number) => {
    setRs((r) => ({
      ...r, dirty: true,
      draft: {
        ...r.draft,
        [stat]: {
          base: r.draft[stat]?.base ?? currentStats[stat]?.base ?? 0,
          inc:  r.draft[stat]?.inc  ?? currentStats[stat]?.inc  ?? 0,
          [field]: v,
        },
      },
    }));
  };

  const handleSave = async () => {
    const merged: Record<string,JobStatEntry> = { ...currentStats };
    for (const [stat, d] of Object.entries(rs.draft)) {
      merged[stat] = { ...(merged[stat] ?? { base:0, inc:0 }), ...d };
    }
    await onSaveStats(rs.rank, merged);
    setRs((r) => ({ ...r, draft: {}, dirty: false }));
  };

  return (
    <>
      {/* ── Main row ── */}
      <tr className="border-b border-border/50 hover:bg-muted/20 group transition-colors">
        {/* Sticky left column */}
        <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/20 transition-colors px-2 py-1.5 min-w-[220px] max-w-[220px]">
          <div className="flex items-center gap-1.5">
            {/* Backend toggle */}
            <button
              onClick={() => setRs((r) => ({ ...r, showBackend: !r.showBackend, draft: r.showBackend ? {} : r.draft, dirty: r.showBackend ? false : r.dirty }))}
              className={`transition-colors shrink-0 ${rs.showBackend ? "text-primary" : "text-muted-foreground/40 hover:text-foreground"}`}
              title="Edit backend stats">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            {/* Icon */}
            <Link href={`/jobs/${encodeURIComponent(jobName)}`}>
              <div className="w-7 h-7 rounded-md border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0 hover:border-primary/40 transition-colors cursor-pointer"
                title={`Full details for ${jobName}`}>
                {job.icon
                  ? <img src={job.icon} alt={jobName} className="w-full h-full object-contain" />
                  : <Star className="w-3.5 h-3.5 text-muted-foreground/30" />}
              </div>
            </Link>
            {/* Name — clickable link */}
            <Link href={`/jobs/${encodeURIComponent(jobName)}`}>
              <span className="font-medium text-sm text-foreground hover:text-primary transition-colors truncate cursor-pointer">{jobName}</span>
            </Link>
            {/* Gen / type badges */}
            <div className="flex gap-1 shrink-0 ml-auto">
              <span className={`text-[9px] px-1 rounded font-semibold ${job.generation === 1 ? "bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400" : "bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400"}`}>
                G{job.generation}
              </span>
              {job.type && (
                <span className={`text-[9px] px-1 rounded font-semibold ${job.type === "combat" ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"}`}>
                  {job.type === "combat" ? "⚔" : "🌿"}
                </span>
              )}
              {/* Delete */}
              {canDelete && (
                <button onClick={onDelete}
                  className="text-muted-foreground/20 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          {/* Rank dropdown */}
          <div className="pl-5 mt-0.5">
            <select value={rs.rank} onChange={(e) => changeRank(e.target.value)}
              className="h-5 text-[10px] rounded border border-input bg-background px-1 text-muted-foreground">
              {availRanks.map((r) => (
                <option key={r} value={r}>Rank {r}</option>
              ))}
            </select>
          </div>
        </td>

        {/* Stat cells — level input always visible + computed value */}
        {STAT_ORDER.map((stat) => {
          const v = val(stat);
          return (
            <td key={stat} className="text-center px-1 py-1 align-middle">
              {/* Level input */}
              <Input
                type="number"
                min={1}
                max={MAX_LEVEL}
                value={levelFor(stat)}
                onChange={(e) => setLevel(stat, e.target.value)}
                onBlur={(e) => setLevel(stat, e.target.value)}
                className="h-5 w-14 text-[10px] text-center px-0.5 mx-auto mb-0.5 block"
              />
              {/* Value */}
              <span className={`text-sm font-semibold tabular-nums ${v === null || v === 0 ? "text-muted-foreground/25" : "text-foreground"}`}>
                {v === null || v === 0 ? "—" : Math.round(v * 100) / 100}
              </span>
            </td>
          );
        })}
      </tr>

      {/* ── Backend editing row ── */}
      {rs.showBackend && (
        <tr className="border-b border-primary/20 bg-primary/5">
          <td colSpan={1 + STAT_ORDER.length} className="px-3 py-2">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-xs font-semibold text-primary">Editing rank {rs.rank} backend stats</span>
              {rs.dirty && (
                <>
                  <Button size="sm" className="h-6 text-xs px-2 gap-1" onClick={handleSave}>
                    <Save className="w-3 h-3" />Save
                  </Button>
                  <button onClick={() => setRs((r) => ({ ...r, draft: {}, dirty: false }))}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Discard
                  </button>
                </>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full" style={{ minWidth: `${STAT_ORDER.length * 90}px` }}>
                <thead>
                  <tr>
                    {STAT_ORDER.map((stat) => (
                      <th key={stat} className="text-center px-2 pb-1 border-b border-border">
                        <div className="flex flex-col items-center gap-0.5">
                          {statIcons[stat] && <img src={statIcons[stat]} alt={stat} className="w-3.5 h-3.5 object-contain" />}
                          <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{stat}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {STAT_ORDER.map((stat) => {
                      const base = rs.draft[stat]?.base ?? currentStats[stat]?.base ?? 0;
                      const inc  = rs.draft[stat]?.inc  ?? currentStats[stat]?.inc  ?? 0;
                      return (
                        <td key={stat} className="px-1 pt-1 align-top">
                          <div className="space-y-1">
                            <div>
                              <p className="text-[9px] text-muted-foreground/60 text-center">Start</p>
                              <Input type="number" value={base}
                                onChange={(e) => setDraftField(stat, "base", Number(e.target.value) || 0)}
                                className="h-6 text-[11px] text-center px-0.5 w-full" />
                            </div>
                            <div>
                              <p className="text-[9px] text-muted-foreground/60 text-center">+/Lv</p>
                              <Input type="number" step="0.1" value={inc}
                                onChange={(e) => setDraftField(stat, "inc", parseFloat(e.target.value) || 0)}
                                className="h-6 text-[11px] text-center px-0.5 w-full" />
                            </div>
                            <div className="text-center">
                              <p className="text-[9px] text-muted-foreground/60">@ Lv {levelFor(stat)}</p>
                              <p className="text-[11px] font-semibold tabular-nums">
                                {Math.round(statAtLevel({ base, inc }, levelFor(stat)) * 100) / 100 || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Jobs Stat Table ──────────────────────────────────────────────────────────

function JobsTable({
  jobs, statIcons, userName, onSaveJobs,
}: {
  jobs: Record<string,Job>;
  statIcons: Record<string,string>;
  userName: string;
  onSaveJobs: (updated: Record<string,Job>, desc: string) => void;
}) {
  const [search,      setSearch]      = useState("");
  const [genFilter,   setGenFilter]   = useState<"all"|"1"|"2">("all");
  const [typeFilter,  setTypeFilter]  = useState<"all"|"combat"|"non-combat">("all");
  const [addingJob,   setAddingJob]   = useState(false);

  // Sort
  const [sortCol,  setSortCol]  = useState<string>("");  // "" = name, else stat
  const [sortDir,  setSortDir]  = useState<"asc"|"desc">("desc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Per-row default rank (first rank) for sorting — use the first rank's stat at level 1
  const sortedEntries = useMemo(() => {
    const entries = Object.entries(jobs).filter(([name, job]) => {
      if (genFilter === "1" && job.generation !== 1) return false;
      if (genFilter === "2" && job.generation !== 2) return false;
      if (typeFilter === "combat"     && job.type !== "combat")     return false;
      if (typeFilter === "non-combat" && job.type !== "non-combat") return false;
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    if (sortCol) {
      entries.sort(([,a], [,b]) => {
        const getV = (job: Job) => {
          const rd = Object.values(job.ranks)[0];
          const s  = rd?.stats[sortCol];
          return s ? statAtLevel(s, 1) : -Infinity;
        };
        return sortDir === "desc" ? getV(b) - getV(a) : getV(a) - getV(b);
      });
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b));
    }
    return entries;
  }, [jobs, genFilter, typeFilter, search, sortCol, sortDir]);

  const addJob = (name: string, gen: 1|2, type: "combat"|"non-combat") => {
    const ranks: Record<string,JobRankData> = {};
    DEFAULT_RANKS.forEach((r) => { ranks[r] = { stats: {} }; });
    const newJob: Job = { generation: gen, type, ranks, shield: "cannot", weaponEquip: {}, skillAccess: { attack: "can", casting: "can" }, skills: [] };
    onSaveJobs({ ...jobs, [name]: newJob }, `Added job: ${name}`);
  };

  const deleteJob = (name: string) => {
    const next = { ...jobs }; delete next[name];
    onSaveJobs(next, `Deleted job: ${name}`);
  };

  const saveStats = (jobName: string) => async (rank: string, stats: Record<string,JobStatEntry>) => {
    const updated = {
      ...jobs,
      [jobName]: { ...jobs[jobName], ranks: { ...jobs[jobName].ranks, [rank]: { stats } } },
    };
    onSaveJobs(updated, `Updated stats for ${jobName} rank ${rank}`);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-25" />;
    return sortDir === "desc" ? <ArrowDown className="w-3 h-3 text-primary" /> : <ArrowUp className="w-3 h-3 text-primary" />;
  };

  return (
    <div>
      <NewJobDialog open={addingJob} onClose={() => setAddingJob(false)} onCreate={addJob} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm w-40" />
        <div className="flex rounded-md overflow-hidden border border-input">
          {(["all","1","2"] as const).map((g) => (
            <button key={g} onClick={() => setGenFilter(g)}
              className={`px-3 h-8 text-xs font-medium transition-colors ${genFilter === g ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>
              {g === "all" ? "All" : g === "1" ? "1st Gen" : "2nd Gen"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md overflow-hidden border border-input">
          {(["all","combat","non-combat"] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 h-8 text-xs font-medium transition-colors ${typeFilter === t
                ? t === "combat" ? "bg-red-500 text-white" : t === "non-combat" ? "bg-sky-500 text-white" : "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"}`}>
              {t === "all" ? "All Types" : t === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 ml-auto" onClick={() => setAddingJob(true)}>
          <Plus className="w-3.5 h-3.5" />Add Job
        </Button>
      </div>

      {sortCol && (
        <div className="mb-3 flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Sorted by <strong className="text-foreground">{sortCol}</strong> · {sortDir === "desc" ? "highest first" : "lowest first"} · values shown at <strong className="text-foreground">Lv 1</strong> (expand a row to preview at a different level)
          </p>
          <button onClick={() => setSortCol("")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: `${220 + STAT_ORDER.length * 75}px` }}>
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="sticky left-0 z-20 bg-muted/50 text-left px-3 py-2 text-xs font-semibold text-muted-foreground min-w-[220px]">
                  Job
                </th>
                {STAT_ORDER.map((stat) => (
                  <th key={stat}
                    onClick={() => toggleSort(stat)}
                    className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground hover:bg-muted/70 transition-colors whitespace-nowrap select-none">
                    <div className="flex items-center justify-center gap-1">
                      {statIcons[stat] && <img src={statIcons[stat]} alt={stat} className="w-3.5 h-3.5 object-contain" />}
                      <span>{STAT_SHORT[stat] ?? stat}</span>
                      <SortIcon col={stat} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={1 + STAT_ORDER.length} className="text-center py-12 text-sm text-muted-foreground">
                    {Object.keys(jobs).length === 0
                      ? "No jobs yet. Click Add Job to get started."
                      : "No jobs match your filter."}
                  </td>
                </tr>
              ) : (
                sortedEntries.map(([name, job]) => (
                  <JobRow
                    key={name}
                    jobName={name}
                    job={job}
                    statIcons={statIcons}
                    onDelete={() => deleteJob(name)}
                    onSaveStats={saveStats(name)}
                    canDelete={true}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {sortedEntries.length} job{sortedEntries.length !== 1 ? "s" : ""} · click any stat header to sort · type a level (1–999) in each cell · click ⚙ to edit backend stats · click a job name or icon to view full details
      </p>
    </div>
  );
}

// ─── Job Detail Page (separate page, /jobs/:name) ─────────────────────────────

function IconUploadSmall({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <label className="cursor-pointer group relative inline-block">
      <input type="file" accept="image/*" className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => { if (ev.target?.result) onChange(ev.target.result as string); };
          reader.readAsDataURL(file);
        }} />
      <div className="w-14 h-14 rounded-xl border border-dashed border-border group-hover:border-primary/50 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors">
        {value ? <img src={value} alt="" className="w-full h-full object-contain" />
               : <ImageIcon className="w-5 h-5 text-muted-foreground/40" />}
      </div>
    </label>
  );
}

function JobDetailPage({ jobName, jobs, statIcons, weaponCategories, onSave }: {
  jobName: string;
  jobs: Record<string,Job>;
  statIcons: Record<string,string>;
  weaponCategories: string[];
  onSave: (updated: Record<string,Job>, desc: string) => void;
}) {
  const [, navigate] = useLocation();
  const job = jobs[jobName];
  const [editing,   setEditing]   = useState(false);
  const [draft,     setDraft]     = useState<Job>(() => JSON.parse(JSON.stringify(job)));
  const [draftName, setDraftName] = useState(jobName);
  const [selRank,   setSelRank]   = useState(() => Object.keys(job.ranks)[0] ?? "S");
  const [level,     setLevel]     = useState(1);
  const [addingRank, setAddingRank] = useState(false);
  const [newRankVal, setNewRankVal] = useState("");

  const rankData = draft.ranks[selRank];
  const rankList = Object.keys(draft.ranks);

  const setStat = (stat: string, field: "base"|"inc", val: number) => {
    setDraft((d) => ({
      ...d,
      ranks: {
        ...d.ranks,
        [selRank]: {
          ...d.ranks[selRank],
          stats: {
            ...d.ranks[selRank]?.stats,
            [stat]: { ...(d.ranks[selRank]?.stats[stat] ?? { base:0, inc:0 }), [field]: val },
          },
        },
      },
    }));
  };

  const addRank = () => {
    const r = newRankVal.trim().toUpperCase();
    if (!r || draft.ranks[r]) return;
    setDraft((d) => ({ ...d, ranks: { ...d.ranks, [r]: { stats: {} } } }));
    setSelRank(r); setNewRankVal(""); setAddingRank(false);
  };

  const removeRank = (r: string) => {
    if (Object.keys(draft.ranks).length <= 1) return;
    const next = { ...draft.ranks }; delete next[r];
    setDraft((d) => ({ ...d, ranks: next }));
    if (selRank === r) setSelRank(Object.keys(next)[0]);
  };

  const handleSave = () => {
    const name = draftName.trim(); if (!name) return;
    let updated: Record<string,Job>;
    if (name !== jobName) {
      updated = { ...jobs }; delete updated[jobName]; updated[name] = draft;
    } else {
      updated = { ...jobs, [jobName]: draft };
    }
    onSave(updated, `Updated job details: ${name}`);
    setEditing(false);
    if (name !== jobName) navigate(`/jobs/${encodeURIComponent(name)}`);
  };

  const cancelEdit = () => {
    setDraft(JSON.parse(JSON.stringify(job)));
    setDraftName(jobName); setEditing(false);
  };

  const cycleWeapon = (cls: string) => {
    setDraft((d) => {
      const cur = d.weaponEquip?.[cls];
      const next: WeaponValue = !cur || cur === "cannot" ? "can" : cur === "can" ? "weak" : "cannot";
      return { ...d, weaponEquip: { ...d.weaponEquip, [cls]: next } };
    });
  };

  const firstGenJobs = Object.entries(jobs)
    .filter(([n, j]) => j.generation === 1 && n !== jobName)
    .map(([n]) => n).sort();

  const weaponStyle: Record<WeaponValue,string> = {
    can:    "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400",
    weak:   "bg-amber-100 dark:bg-amber-950/40 border-amber-400 text-amber-700 dark:text-amber-400",
    cannot: "border-dashed border-border/60 text-muted-foreground/40",
  };
  const weaponLabel: Record<WeaponValue,string> = { can:"Can", weak:"Weak", cannot:"Can't" };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/jobs")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />Jobs Database
          </button>
          <span className="text-muted-foreground/30">/</span>
          <h2 className="text-xl font-bold text-foreground">{jobName}</h2>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button size="sm" className="h-8 gap-1.5" onClick={handleSave}><Save className="w-3.5 h-3.5" />Save</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={cancelEdit}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" />Edit</Button>
          )}
        </div>
      </div>

      {/* Header card */}
      <Card className="shadow-sm mb-4">
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            {editing
              ? <IconUploadSmall value={draft.icon} onChange={(icon) => setDraft((d) => ({ ...d, icon }))} />
              : <div className="w-14 h-14 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                  {job.icon ? <img src={job.icon} alt={jobName} className="w-full h-full object-contain" />
                            : <Star className="w-7 h-7 text-muted-foreground/30" />}
                </div>
            }
            <div className="flex-1 min-w-0">
              {editing
                ? <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="text-xl font-bold h-9 mb-2 max-w-xs" placeholder="Job name…" />
                : <h3 className="text-2xl font-bold text-foreground mb-1">{jobName}</h3>}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={job.generation === 1 ? "border-sky-300 text-sky-600 dark:text-sky-400" : "border-orange-300 text-orange-600 dark:text-orange-400"}>
                  {job.generation === 1 ? "1st Gen" : "2nd Gen"}
                </Badge>
                {editing && (
                  <button onClick={() => setDraft((d) => ({ ...d, generation: d.generation === 1 ? 2 : 1 }))}
                    className="text-xs text-primary hover:underline">
                    Switch to {draft.generation === 1 ? "2nd" : "1st"} gen
                  </button>
                )}
                {editing ? (
                  <div className="flex gap-1">
                    {(["combat","non-combat"] as const).map((t) => (
                      <button key={t} onClick={() => setDraft((d) => ({ ...d, type: t }))}
                        className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${draft.type === t
                          ? t === "combat" ? "bg-red-500 text-white border-red-500" : "bg-sky-500 text-white border-sky-500"
                          : "border-border text-muted-foreground hover:border-primary/40"}`}>
                        {t === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
                      </button>
                    ))}
                  </div>
                ) : job.type && (
                  <Badge variant="outline" className={job.type === "combat" ? "border-red-300 text-red-600 dark:text-red-400" : "border-emerald-300 text-emerald-600 dark:text-emerald-400"}>
                    {job.type === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats (all ranks) */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Stats</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Level</span>
                <Input type="number" min={1} max={MAX_LEVEL} value={level}
                  onChange={(e) => setLevel(Math.min(MAX_LEVEL, Math.max(1, parseInt(e.target.value)||1)))}
                  className="h-6 w-16 text-xs text-center" />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {rankList.map((r) => (
                  <button key={r} onClick={() => setSelRank(r)}
                    className={`px-2.5 py-0.5 text-xs rounded font-medium border transition-colors ${selRank === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                    {r}
                  </button>
                ))}
                {editing && (
                  addingRank ? (
                    <div className="flex items-center gap-1">
                      <select value={newRankVal} onChange={(e) => setNewRankVal(e.target.value)}
                        className="h-6 text-xs rounded border border-input bg-background px-1">
                        <option value="">Pick rank…</option>
                        {DEFAULT_RANKS.filter((r) => !draft.ranks[r]).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button onClick={addRank} className="text-primary"><Check className="w-3 h-3" /></button>
                      <button onClick={() => { setAddingRank(false); setNewRankVal(""); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                  ) : DEFAULT_RANKS.some((r) => !draft.ranks[r]) && (
                    <button onClick={() => setAddingRank(true)}
                      className="px-2 py-0.5 text-xs rounded border border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors">
                      + Rank
                    </button>
                  )
                )}
              </div>
              {editing && rankList.length > 1 && (
                <button onClick={() => removeRank(selRank)} className="text-xs text-destructive/60 hover:text-destructive transition-colors">
                  Remove {selRank}
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: `${STAT_ORDER.length * 90}px` }}>
              <thead>
                <tr>
                  {STAT_ORDER.map((stat) => (
                    <th key={stat} className="text-center px-2 pb-1 border-b border-border">
                      <div className="flex flex-col items-center gap-0.5">
                        {statIcons[stat] && <img src={statIcons[stat]} alt={stat} className="w-4 h-4 object-contain" />}
                        <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{stat}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editing && (
                  <tr>
                    {STAT_ORDER.map((stat) => {
                      const s = rankData?.stats[stat] ?? { base:0, inc:0 };
                      return (
                        <td key={stat} className="px-1 pt-2 align-top">
                          <div className="space-y-1">
                            <div>
                              <p className="text-[9px] text-muted-foreground/60 text-center mb-0.5">Start</p>
                              <Input type="number" value={s.base}
                                onChange={(e) => setStat(stat, "base", Number(e.target.value)||0)}
                                className="h-6 text-[11px] text-center px-1 w-full" />
                            </div>
                            <div>
                              <p className="text-[9px] text-muted-foreground/60 text-center mb-0.5">+/Lv</p>
                              <Input type="number" step="0.1" value={s.inc}
                                onChange={(e) => setStat(stat, "inc", parseFloat(e.target.value)||0)}
                                className="h-6 text-[11px] text-center px-1 w-full" />
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr className={editing ? "border-t border-border/50" : ""}>
                  {STAT_ORDER.map((stat) => {
                    const s = rankData?.stats[stat];
                    const v = s ? statAtLevel(s, level) : null;
                    return (
                      <td key={stat} className="text-center px-2 py-2">
                        <span className={`text-sm font-semibold tabular-nums ${!v ? "text-muted-foreground/30" : "text-foreground"}`}>
                          {v === null || v === 0 ? "—" : Math.round(v * 100) / 100}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">value = Start + (Level − 1) × +/Lv</p>
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Shield</p>
            <div className="flex gap-2">
              {(["can","cannot"] as const).map((v) => {
                const active = (draft.shield ?? "cannot") === v;
                return editing ? (
                  <button key={v} onClick={() => setDraft((d) => ({ ...d, shield: v }))}
                    className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${active
                      ? v === "can" ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400" : "border-border text-muted-foreground"
                      : "border-dashed border-border/60 text-muted-foreground/50 hover:border-primary/40"}`}>
                    {v === "can" ? <><Check className="w-3 h-3 inline mr-1" />Can Equip</> : "Can't Equip"}
                  </button>
                ) : active ? (
                  <span key={v} className={`px-3 py-1.5 text-xs rounded-full border font-medium ${v === "can" ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400" : "border-dashed border-border/60 text-muted-foreground/50"}`}>
                    {v === "can" ? <><Check className="w-3 h-3 inline mr-1" />Can Equip</> : "Can't Equip"}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Weapon Classes</p>
            {weaponCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No weapon categories defined yet — add them in Equipment Stats.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse" style={{ minWidth: `${weaponCategories.length * 80}px` }}>
                  <thead>
                    <tr>
                      {weaponCategories.map((cls) => (
                        <th key={cls} className="text-center px-3 pb-1 border-b border-border font-medium text-muted-foreground whitespace-nowrap">{cls}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {weaponCategories.map((cls) => {
                        const v = draft.weaponEquip?.[cls] ?? "cannot";
                        return (
                          <td key={cls} className="text-center px-2 py-2">
                            {editing ? (
                              <button onClick={() => cycleWeapon(cls)}
                                className={`px-2 py-1 rounded-full border text-[11px] font-medium transition-colors whitespace-nowrap ${weaponStyle[v]}`}>
                                {weaponLabel[v]}
                              </button>
                            ) : (
                              <span className={`px-2 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap ${weaponStyle[v]}`}>
                                {weaponLabel[v]}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {editing && <p className="text-[10px] text-muted-foreground mt-1">Click to cycle: Can't → Can → Weak → Can't</p>}
          </div>
        </CardContent>
      </Card>

      {/* Skill Access */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Skill Access</CardTitle></CardHeader>
        <CardContent>
          <table className="text-xs border-collapse w-full max-w-xs">
            <thead>
              <tr>
                {(["attack","casting"] as const).map((cat) => (
                  <th key={cat} className="text-center px-4 pb-1 border-b border-border font-medium text-muted-foreground capitalize">
                    {cat} Skills
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {(["attack","casting"] as const).map((cat) => {
                  const v = draft.skillAccess?.[cat] ?? "can";
                  return (
                    <td key={cat} className="text-center px-4 py-2">
                      {editing ? (
                        <button onClick={() => setDraft((d) => ({ ...d, skillAccess: { ...d.skillAccess, [cat]: v === "can" ? "cannot" : "can" } }))}
                          className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${v === "can"
                            ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400"
                            : "border-dashed border-border/60 text-muted-foreground/50"}`}>
                          {v === "can" ? <><Check className="w-3 h-3 inline mr-1" />Can Use</> : "Can't Use"}
                        </button>
                      ) : (
                        <span className={`px-3 py-1.5 rounded-full border text-xs font-medium ${v === "can"
                          ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400"
                          : "border-dashed border-border/60 text-muted-foreground/50"}`}>
                          {v === "can" ? <><Check className="w-3 h-3 inline mr-1" />Can Use</> : "Can't Use"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Marriage */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" />Marriage Compatibility</CardTitle>
        </CardHeader>
        <CardContent>
          {job.generation === 2 ? (
            <p className="text-sm text-muted-foreground">Second generation jobs cannot marry.</p>
          ) : firstGenJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other first generation jobs in the database yet.</p>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-3">All first generation jobs are <strong>Compatibility A</strong> with each other.</p>
              <div className="flex flex-wrap gap-1.5">
                {firstGenJobs.map((j) => (
                  <Link key={j} href={`/jobs/${encodeURIComponent(j)}`}>
                    <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors">
                      <Heart className="w-2.5 h-2.5" />{j}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { name: jobParam } = useParams<{ name?: string }>();
  const [, navigate]       = useLocation();
  const { dark, setDark }  = useDarkMode();
  const { name: userName, save: saveUserName } = useUserName();
  const [promptName, setPromptName] = useState(false);
  const [pendingFn,  setPendingFn]  = useState<(() => void) | null>(null);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useSharedData();

  const jobs:             Record<string,Job>    = data?.jobs ?? {};
  const statIcons:        Record<string,string> = data?.statIcons ?? {};
  const weaponCategories: string[]              = data?.weaponCategories ?? [];

  const withName = useCallback((fn: () => void) => {
    if (!userName) { setPendingFn(() => fn); setPromptName(true); }
    else fn();
  }, [userName]);

  const onNameSaved = (n: string) => {
    saveUserName(n); setPromptName(false);
    if (pendingFn) { pendingFn(); setPendingFn(null); }
  };

  const handleSaveJobs = useCallback((updated: Record<string,Job>, desc: string) => {
    withName(() => {
      qc.setQueryData(["ka-shared"], (old: SharedData|undefined) => old ? { ...old, jobs: updated } : old);
      persistJobs(updated, userName, desc).then(() => qc.invalidateQueries({ queryKey: ["ka-shared"] }));
    });
  }, [qc, userName, withName]);

  const selectedJob = jobParam ? decodeURIComponent(jobParam) : null;

  return (
    <div className="min-h-screen bg-background transition-colors">
      {promptName && <NamePrompt onSave={onNameSaved} />}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {!selectedJob && (
              <Link href="/">
                <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-4 h-4" />Home
                </button>
              </Link>
            )}
            {!selectedJob && (
              <>
                <span className="text-muted-foreground/30">/</span>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Sword className="w-5 h-5 text-sky-500" />Job Database
                </h1>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 text-muted-foreground">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setDark((d) => !d)} className="h-8 w-8">
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : selectedJob && jobs[selectedJob] ? (
          <JobDetailPage
            jobName={selectedJob}
            jobs={jobs}
            statIcons={statIcons}
            weaponCategories={weaponCategories}
            onSave={handleSaveJobs}
          />
        ) : selectedJob ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Job "{selectedJob}" not found.{" "}
            <button onClick={() => navigate("/jobs")} className="text-primary hover:underline">Back to list</button>
          </div>
        ) : (
          <JobsTable
            jobs={jobs}
            statIcons={statIcons}
            userName={userName}
            onSaveJobs={handleSaveJobs}
          />
        )}
      </div>
    </div>
  );
}
