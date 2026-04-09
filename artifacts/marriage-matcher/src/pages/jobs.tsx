import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, Trash2, Moon, Sun,
  RefreshCw, Loader2, X, Check, Pencil, Star, Sword,
  Save, ImageIcon, Heart, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = (p: string) => `${BASE}/ka-api/ka${p}`;

const STAT_ORDER = ["HP", "MP", "Vigor", "Attack", "Defence", "Speed", "Luck", "Intelligence", "Dexterity", "Gather", "Move", "Heart"];
const DEFAULT_RANKS = ["S", "A", "B", "C", "D"];
const MAX_LEVEL = 999;

type WeaponValue = "can" | "cannot" | "weak";
type JobStatEntry = { base: number; inc: number; levels?: Record<string, number> };
type JobRankData = { stats: Record<string, JobStatEntry> };
type Job = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  icon?: string;
  ranks: Record<string, JobRankData>;
  shield?: "can" | "cannot";
  weaponEquip?: Partial<Record<string, WeaponValue>>;
  skillAccess?: { attack?: "can" | "cannot"; casting?: "can" | "cannot" };
  skills: string[];
};
type SharedData = {
  jobs: Record<string, Job>;
  statIcons: Record<string, string>;
  weaponCategories?: string[];
};

function statAtLevel(entry: JobStatEntry, level: number): number {
  const ov = entry.levels?.[String(level)];
  if (ov !== undefined) return ov;
  return entry.base + (level - 1) * entry.inc;
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
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

function NamePrompt({ onSave }: { onSave: (n: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <Dialog open>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>What's your name?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This will be shown on edits you make.</p>
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Your name" className="h-8 text-sm"
          onKeyDown={(e) => e.key === "Enter" && val.trim() && onSave(val.trim())} />
        <Button size="sm" onClick={() => val.trim() && onSave(val.trim())} className="w-full">Continue</Button>
      </DialogContent>
    </Dialog>
  );
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

async function saveJobs(jobs: Record<string, Job>, userName: string, description: string) {
  await fetch(API("/jobs"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: jobs, history: { userName, changeType: "job", itemName: "jobs", description } }),
  });
}

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
      <div className="w-12 h-12 rounded-xl border border-dashed border-border group-hover:border-primary/50 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors">
        {value ? <img src={value} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40" />}
      </div>
    </label>
  );
}

// ─── Stat Table ───────────────────────────────────────────────────────────────

function StatTable({ rankData, statIcons, editing, level, onChangeLevel, onChangeStat }: {
  rankData: JobRankData | undefined;
  statIcons: Record<string, string>;
  editing: boolean;
  level: number;
  onChangeLevel: (v: number) => void;
  onChangeStat: (stat: string, field: "base" | "inc", val: number) => void;
}) {
  const stats = rankData?.stats ?? {};

  return (
    <div>
      {/* Level row */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Preview at level</span>
        <Input
          type="number" min={1} max={MAX_LEVEL} value={level}
          onChange={(e) => onChangeLevel(Math.min(MAX_LEVEL, Math.max(1, parseInt(e.target.value) || 1)))}
          className="h-7 w-20 text-xs text-center"
        />
        <span className="text-xs text-muted-foreground">/ {MAX_LEVEL}</span>
      </div>

      {/* Horizontal scrollable stat table */}
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
                  const s = stats[stat] ?? { base: 0, inc: 0 };
                  return (
                    <td key={stat} className="px-1 pt-2 align-top">
                      <div className="space-y-1">
                        <div>
                          <p className="text-[9px] text-muted-foreground/60 text-center mb-0.5">Base</p>
                          <Input
                            type="number"
                            value={s.base}
                            onChange={(e) => onChangeStat(stat, "base", Number(e.target.value) || 0)}
                            className="h-6 text-[11px] text-center px-1 w-full"
                          />
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground/60 text-center mb-0.5">+/Lv</p>
                          <Input
                            type="number"
                            step="0.1"
                            value={s.inc}
                            onChange={(e) => onChangeStat(stat, "inc", parseFloat(e.target.value) || 0)}
                            className="h-6 text-[11px] text-center px-1 w-full"
                          />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}
            <tr className={editing ? "border-t border-border/50" : ""}>
              {STAT_ORDER.map((stat) => {
                const s = stats[stat];
                const val = s ? statAtLevel(s, level) : null;
                return (
                  <td key={stat} className="text-center px-2 py-2">
                    <span className={`text-sm font-semibold tabular-nums ${val === null || val === 0 ? "text-muted-foreground/30" : "text-foreground"}`}>
                      {val === null ? "—" : Math.round(val * 100) / 100}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">value = Base + (Level − 1) × +/Lv</p>
    </div>
  );
}

// ─── Job Detail View ──────────────────────────────────────────────────────────

function JobDetail({ jobName, jobs, statIcons, weaponCategories, onSave }: {
  jobName: string;
  jobs: Record<string, Job>;
  statIcons: Record<string, string>;
  weaponCategories: string[];
  onSave: (updated: Record<string, Job>, desc: string) => Promise<void>;
}) {
  const [, navigate] = useLocation();
  const job = jobs[jobName];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Job>(() => JSON.parse(JSON.stringify(job)));
  const [draftName, setDraftName] = useState(jobName);
  const [selectedRank, setSelectedRank] = useState(() => Object.keys(job.ranks)[0] ?? "S");
  const [level, setLevel] = useState(1);
  const [newRankInput, setNewRankInput] = useState("");
  const [addingRank, setAddingRank] = useState(false);

  const rankData = draft.ranks[selectedRank];
  const rankNames = Object.keys(draft.ranks);

  const setStat = (stat: string, field: "base" | "inc", val: number) => {
    setDraft((d) => {
      const cur = d.ranks[selectedRank]?.stats[stat] ?? { base: 0, inc: 0 };
      return {
        ...d,
        ranks: {
          ...d.ranks,
          [selectedRank]: {
            ...d.ranks[selectedRank],
            stats: { ...d.ranks[selectedRank]?.stats, [stat]: { ...cur, [field]: val } },
          },
        },
      };
    });
  };

  const addRank = () => {
    const r = newRankInput.trim().toUpperCase();
    if (!r || draft.ranks[r]) return;
    setDraft((d) => ({ ...d, ranks: { ...d.ranks, [r]: { stats: {} } } }));
    setSelectedRank(r);
    setNewRankInput(""); setAddingRank(false);
  };

  const removeRank = (r: string) => {
    if (Object.keys(draft.ranks).length <= 1) return;
    const next = { ...draft.ranks }; delete next[r];
    setDraft((d) => ({ ...d, ranks: next }));
    if (selectedRank === r) setSelectedRank(Object.keys(next)[0]);
  };

  const handleSave = async () => {
    const trimmedName = draftName.trim();
    if (!trimmedName) return;
    let updatedJobs: Record<string, Job>;
    if (trimmedName !== jobName) {
      updatedJobs = { ...jobs };
      delete updatedJobs[jobName];
      updatedJobs[trimmedName] = draft;
    } else {
      updatedJobs = { ...jobs, [jobName]: draft };
    }
    await onSave(updatedJobs, `Updated job: ${trimmedName}`);
    setEditing(false);
    if (trimmedName !== jobName) navigate(`/jobs/${encodeURIComponent(trimmedName)}`);
  };

  const cancelEdit = () => {
    setDraft(JSON.parse(JSON.stringify(job)));
    setDraftName(jobName);
    setEditing(false);
  };

  const firstGenJobs = Object.entries(jobs).filter(([n, j]) => j.generation === 1 && n !== jobName).map(([n]) => n).sort();

  const weaponValueLabel: Record<WeaponValue, string> = { can: "Can", cannot: "Can't", weak: "Weak" };
  const weaponValueStyle: Record<WeaponValue, string> = {
    can:    "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400",
    weak:   "bg-amber-100 dark:bg-amber-950/40 border-amber-400 text-amber-700 dark:text-amber-400",
    cannot: "border-dashed border-border/60 text-muted-foreground/40",
  };

  const cycleWeapon = (cls: string) => {
    setDraft((d) => {
      const cur = d.weaponEquip?.[cls];
      const next: WeaponValue = !cur || cur === "cannot" ? "can" : cur === "can" ? "weak" : "cannot";
      return { ...d, weaponEquip: { ...d.weaponEquip, [cls]: next } };
    });
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate("/jobs")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Jobs
        </button>
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

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        {editing
          ? <IconUploadSmall value={draft.icon} onChange={(icon) => setDraft((d) => ({ ...d, icon }))} />
          : <div className="w-14 h-14 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
              {job.icon ? <img src={job.icon} alt={jobName} className="w-full h-full object-contain" /> : <Star className="w-7 h-7 text-muted-foreground/30" />}
            </div>
        }
        <div className="flex-1 min-w-0">
          {editing
            ? <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="text-xl font-bold h-9 mb-2 max-w-xs" placeholder="Job name…" />
            : <h2 className="text-2xl font-bold text-foreground mb-1">{jobName}</h2>
          }
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={job.generation === 1 ? "border-sky-300 text-sky-600 dark:text-sky-400" : "border-orange-300 text-orange-600 dark:text-orange-400"}>
              {job.generation === 1 ? "1st Gen" : "2nd Gen"}
            </Badge>
            {editing && (
              <button onClick={() => setDraft((d) => ({ ...d, generation: d.generation === 1 ? 2 : 1 }))} className="text-xs text-primary hover:underline">
                Switch to {draft.generation === 1 ? "2nd" : "1st"} gen
              </button>
            )}
            {editing ? (
              <div className="flex gap-1">
                {(["combat", "non-combat"] as const).map((t) => (
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

      {/* Stats */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Stats</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Rank tabs */}
              <div className="flex items-center gap-1 flex-wrap">
                {rankNames.map((r) => (
                  <button key={r} onClick={() => setSelectedRank(r)}
                    className={`px-2.5 py-0.5 text-xs rounded font-medium border transition-colors ${selectedRank === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                    {r}
                  </button>
                ))}
                {editing && (
                  addingRank ? (
                    <div className="flex items-center gap-1">
                      <select value={newRankInput} onChange={(e) => setNewRankInput(e.target.value)}
                        className="h-6 text-xs rounded border border-input bg-background px-1">
                        <option value="">Pick rank…</option>
                        {DEFAULT_RANKS.filter((r) => !draft.ranks[r]).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button onClick={addRank} className="text-primary hover:text-primary/80"><Check className="w-3 h-3" /></button>
                      <button onClick={() => { setAddingRank(false); setNewRankInput(""); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    DEFAULT_RANKS.some((r) => !draft.ranks[r]) && (
                      <button onClick={() => setAddingRank(true)} className="px-2 py-0.5 text-xs rounded border border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors">
                        + Rank
                      </button>
                    )
                  )
                )}
              </div>
              {editing && rankNames.length > 1 && (
                <button onClick={() => removeRank(selectedRank)} className="text-xs text-destructive/60 hover:text-destructive transition-colors">
                  Remove {selectedRank}
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StatTable
            rankData={rankData}
            statIcons={statIcons}
            editing={editing}
            level={level}
            onChangeLevel={setLevel}
            onChangeStat={setStat}
          />
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Equipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Shield */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Shield</p>
            <div className="flex gap-2">
              {(["can", "cannot"] as const).map((v) => {
                const active = (draft.shield ?? "cannot") === v;
                return editing ? (
                  <button key={v} onClick={() => setDraft((d) => ({ ...d, shield: v }))}
                    className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${active
                      ? v === "can" ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400" : "border-border text-muted-foreground"
                      : "border-dashed border-border/60 text-muted-foreground/50 hover:border-primary/40 hover:text-foreground"}`}>
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

          {/* Weapon classes */}
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
                        <th key={cls} className="text-center px-2 pb-1 border-b border-border font-medium text-muted-foreground whitespace-nowrap">
                          {cls}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {weaponCategories.map((cls) => {
                        const val = draft.weaponEquip?.[cls] ?? "cannot";
                        return (
                          <td key={cls} className="text-center px-2 py-2">
                            {editing ? (
                              <button onClick={() => cycleWeapon(cls)}
                                className={`px-2 py-1 rounded-full border text-[11px] font-medium transition-colors whitespace-nowrap ${weaponValueStyle[val]}`}>
                                {weaponValueLabel[val]}
                              </button>
                            ) : (
                              <span className={`px-2 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap ${weaponValueStyle[val]}`}>
                                {weaponValueLabel[val]}
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
            {editing && weaponCategories.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Click to cycle: Can't → Can → Weak → Can't</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Skill Access */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Skill Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full max-w-xs">
              <thead>
                <tr>
                  {(["attack", "casting"] as const).map((cat) => (
                    <th key={cat} className="text-center px-4 pb-1 border-b border-border font-medium text-muted-foreground capitalize">
                      {cat} Skills
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(["attack", "casting"] as const).map((cat) => {
                    const val = draft.skillAccess?.[cat] ?? "can";
                    return (
                      <td key={cat} className="text-center px-4 py-2">
                        {editing ? (
                          <button
                            onClick={() => setDraft((d) => ({
                              ...d,
                              skillAccess: { ...d.skillAccess, [cat]: val === "can" ? "cannot" : "can" },
                            }))}
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${val === "can"
                              ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400"
                              : "border-dashed border-border/60 text-muted-foreground/50"}`}>
                            {val === "can" ? <><Check className="w-3 h-3 inline mr-1" />Can Use</> : "Can't Use"}
                          </button>
                        ) : (
                          <span className={`px-3 py-1.5 rounded-full border text-xs font-medium ${val === "can"
                            ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400"
                            : "border-dashed border-border/60 text-muted-foreground/50"}`}>
                            {val === "can" ? <><Check className="w-3 h-3 inline mr-1" />Can Use</> : "Can't Use"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
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
              <p className="text-xs text-muted-foreground mb-3">
                All first generation jobs are compatible at <strong>Compatibility A</strong> with each other.
              </p>
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

// ─── New Job Dialog ────────────────────────────────────────────────────────────

function NewJobDialog({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, gen: 1 | 2, type: "combat" | "non-combat") => void;
}) {
  const [name, setName] = useState("");
  const [gen, setGen] = useState<1 | 2>(1);
  const [jobType, setJobType] = useState<"combat" | "non-combat">("combat");
  const submit = () => { if (name.trim()) { onCreate(name.trim(), gen, jobType); setName(""); } };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Add Job</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Job name…" className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Generation</label>
            <div className="flex gap-2">
              {([1, 2] as const).map((g) => (
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
              {(["combat", "non-combat"] as const).map((t) => (
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

export default function JobsPage() {
  const { name: jobParam } = useParams<{ name?: string }>();
  const [, navigate] = useLocation();
  const { dark, setDark } = useDarkMode();
  const { name: userName, save: saveUserName } = useUserName();
  const [promptName, setPromptName] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useSharedData();

  const jobs: Record<string, Job> = data?.jobs ?? {};
  const statIcons: Record<string, string> = data?.statIcons ?? {};
  const weaponCategories: string[] = data?.weaponCategories ?? [];

  const withName = useCallback((fn: () => void) => {
    if (!userName) { setPendingAction(() => fn); setPromptName(true); }
    else fn();
  }, [userName]);

  const onNameSaved = (n: string) => {
    saveUserName(n); setPromptName(false);
    if (pendingAction) { pendingAction(); setPendingAction(null); }
  };

  const mutateJobs = useCallback((updated: Record<string, Job>, desc: string) => {
    qc.setQueryData(["ka-shared"], (old: SharedData | undefined) => old ? { ...old, jobs: updated } : old);
    saveJobs(updated, userName, desc).then(() => qc.invalidateQueries({ queryKey: ["ka-shared"] }));
  }, [qc, userName]);

  const addJob = (name: string, gen: 1 | 2, type: "combat" | "non-combat") => {
    withName(() => {
      const ranks: Record<string, JobRankData> = {};
      DEFAULT_RANKS.forEach((r) => { ranks[r] = { stats: {} }; });
      const newJob: Job = { generation: gen, type, ranks, shield: "cannot", weaponEquip: {}, skillAccess: { attack: "can", casting: "can" }, skills: [] };
      mutateJobs({ ...jobs, [name]: newJob }, `Added job: ${name}`);
      navigate(`/jobs/${encodeURIComponent(name)}`);
    });
  };

  const removeJob = (name: string) => {
    withName(() => {
      const next = { ...jobs }; delete next[name];
      mutateJobs(next, `Removed job: ${name}`);
    });
  };

  // ── List filters & sort ──
  const [search, setSearch] = useState("");
  const [genFilter, setGenFilter] = useState<"all" | "1" | "2">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "combat" | "non-combat">("all");
  const [addingJob, setAddingJob] = useState(false);

  // Sort by stat
  const [sortStat, setSortStat] = useState<string>("");
  const [sortRank, setSortRank] = useState<string>("S");
  const [sortLevel, setSortLevel] = useState<number>(1);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortExpanded, setSortExpanded] = useState(false);

  const filteredJobs = useMemo(() => {
    const entries = Object.entries(jobs).filter(([name, job]) => {
      if (genFilter === "1" && job.generation !== 1) return false;
      if (genFilter === "2" && job.generation !== 2) return false;
      if (typeFilter === "combat" && job.type !== "combat") return false;
      if (typeFilter === "non-combat" && job.type !== "non-combat") return false;
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    if (sortStat) {
      entries.sort(([, a], [, b]) => {
        const getVal = (job: Job) => {
          const rd = job.ranks[sortRank] ?? Object.values(job.ranks)[0];
          const s = rd?.stats[sortStat];
          return s ? statAtLevel(s, sortLevel) : -Infinity;
        };
        const va = getVal(a), vb = getVal(b);
        return sortDir === "desc" ? vb - va : va - vb;
      });
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b));
    }

    return entries;
  }, [jobs, genFilter, typeFilter, search, sortStat, sortRank, sortLevel, sortDir]);

  const selectedJob = jobParam ? decodeURIComponent(jobParam) : null;

  return (
    <div className="min-h-screen bg-background transition-colors">
      {promptName && <NamePrompt onSave={onNameSaved} />}
      <NewJobDialog open={addingJob} onClose={() => setAddingJob(false)} onCreate={addJob} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {selectedJob ? (
              <button onClick={() => navigate("/jobs")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />Jobs
              </button>
            ) : (
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
                  <Sword className="w-5 h-5 text-sky-500" />Jobs
                </h1>
              </>
            )}
            {selectedJob && jobs[selectedJob] && (
              <h1 className="text-xl font-bold text-foreground">{selectedJob}</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!selectedJob && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAddingJob(true)}>
                <Plus className="w-3.5 h-3.5" />Add Job
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 text-muted-foreground">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setDark((d) => !d)} className="h-8 w-8">
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Detail page */}
        {selectedJob && jobs[selectedJob] ? (
          <JobDetail
            jobName={selectedJob}
            jobs={jobs}
            statIcons={statIcons}
            weaponCategories={weaponCategories}
            onSave={async (updated, desc) => {
              withName(() => mutateJobs(updated, desc));
            }}
          />
        ) : selectedJob ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Job "{selectedJob}" not found. <button onClick={() => navigate("/jobs")} className="text-primary hover:underline">Back to list</button>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm w-44" />
              <div className="flex rounded-md overflow-hidden border border-input">
                {(["all", "1", "2"] as const).map((g) => (
                  <button key={g} onClick={() => setGenFilter(g)}
                    className={`px-3 h-8 text-xs font-medium transition-colors ${genFilter === g ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>
                    {g === "all" ? "All" : g === "1" ? "1st Gen" : "2nd Gen"}
                  </button>
                ))}
              </div>
              <div className="flex rounded-md overflow-hidden border border-input">
                {(["all", "combat", "non-combat"] as const).map((t) => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`px-3 h-8 text-xs font-medium transition-colors ${typeFilter === t
                      ? t === "combat" ? "bg-red-500 text-white" : t === "non-combat" ? "bg-sky-500 text-white" : "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground"}`}>
                    {t === "all" ? "All Types" : t === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort controls */}
            <div className="mb-4">
              <button
                onClick={() => setSortExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                Sort by stat
                {sortStat && <Badge variant="outline" className="text-[10px] ml-1">{sortStat} @ Lv {sortLevel} · {sortDir === "desc" ? "↓ High" : "↑ Low"}</Badge>}
                <ChevronDown className={`w-3 h-3 transition-transform ${sortExpanded ? "rotate-180" : ""}`} />
              </button>
              {sortExpanded && (
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
                  <select value={sortStat} onChange={(e) => setSortStat(e.target.value)}
                    className="h-7 text-xs rounded border border-input bg-background px-2">
                    <option value="">— Name (A-Z) —</option>
                    {STAT_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {sortStat && (
                    <>
                      <select value={sortRank} onChange={(e) => setSortRank(e.target.value)}
                        className="h-7 text-xs rounded border border-input bg-background px-2">
                        {DEFAULT_RANKS.map((r) => <option key={r} value={r}>Rank {r}</option>)}
                      </select>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Lv</span>
                        <Input type="number" min={1} max={MAX_LEVEL} value={sortLevel}
                          onChange={(e) => setSortLevel(Math.min(MAX_LEVEL, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="h-7 w-16 text-xs text-center" />
                      </div>
                      <button onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
                        className="flex items-center gap-1 px-2 h-7 text-xs rounded border border-input bg-background hover:border-primary/40 transition-colors">
                        {sortDir === "desc" ? <><ArrowDown className="w-3 h-3" />Highest first</> : <><ArrowUp className="w-3 h-3" />Lowest first</>}
                      </button>
                      <button onClick={() => { setSortStat(""); }} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Job list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                {Object.keys(jobs).length === 0 ? "No jobs yet. Click Add Job to get started." : "No jobs match your filter."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredJobs.map(([name, job]) => {
                  const rankList = Object.keys(job.ranks);
                  const sortStatVal = sortStat ? (() => {
                    const rd = job.ranks[sortRank] ?? Object.values(job.ranks)[0];
                    const s = rd?.stats[sortStat];
                    return s ? Math.round(statAtLevel(s, sortLevel) * 100) / 100 : null;
                  })() : null;
                  return (
                    <Card key={name} className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
                      onClick={() => navigate(`/jobs/${encodeURIComponent(name)}`)}>
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                            {job.icon ? <img src={job.icon} alt={name} className="w-full h-full object-contain" /> : <Star className="w-5 h-5 text-muted-foreground/30" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">{name}</h3>
                              <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${job.generation === 1 ? "border-sky-300 text-sky-600 dark:text-sky-400" : "border-orange-300 text-orange-600 dark:text-orange-400"}`}>
                                {job.generation === 1 ? "Gen 1" : "Gen 2"}
                              </Badge>
                              {job.type && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${job.type === "combat" ? "border-red-300 text-red-600 dark:text-red-400" : "border-emerald-300 text-emerald-600 dark:text-emerald-400"}`}>
                                  {job.type === "combat" ? "⚔" : "🌿"} {job.type === "combat" ? "Combat" : "Non-Combat"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {rankList.map((r) => (
                                <span key={r} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{r}</span>
                              ))}
                            </div>
                            {sortStatVal !== null && (
                              <p className="text-xs font-semibold text-primary mt-1">
                                {sortStat} @ Lv {sortLevel}: {sortStatVal}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeJob(name); }}
                            className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4 text-center">
              {Object.keys(jobs).length} jobs · click any job to view details
            </p>
          </>
        )}
      </div>
    </div>
  );
}
