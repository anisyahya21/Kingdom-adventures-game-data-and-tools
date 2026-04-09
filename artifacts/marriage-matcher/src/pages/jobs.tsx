import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Trash2, Moon, Sun,
  RefreshCw, Loader2, X, Check, Pencil, Shield, Star, Sword,
  Save, ImageIcon, Heart, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = (p: string) => `${BASE}/ka-api/ka${p}`;

const STAT_ORDER = ["HP", "MP", "Vigor", "Attack", "Defence", "Speed", "Luck", "Intelligence", "Dexterity", "Gather", "Move", "Heart"];
const CHAR_SLOTS = ["Head", "Weapon", "Shield", "Armor", "Accessory"] as const;
const MAX_LEVEL = 999;

type EquipValue = "can" | "cannot" | "weak";
type JobStatEntry = { base: number; inc: number; levels?: Record<string, number> };
type JobRankData = { stats: Record<string, JobStatEntry> };
type Job = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  icon?: string;
  ranks: Record<string, JobRankData>;
  equipment: Partial<Record<string, EquipValue>>;
  weaponClasses?: string[];
  skills: string[];
};
type SharedData = { jobs: Record<string, Job>; statIcons: Record<string, string>; weaponCategories?: string[] };

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

function IconUploadSmall({ value, onChange, placeholder }: { value?: string; onChange: (v: string) => void; placeholder?: React.ReactNode }) {
  return (
    <label className="cursor-pointer group relative inline-block">
      <input type="file" accept="image/*" className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => { if (ev.target?.result) onChange(ev.target.result as string); };
          reader.readAsDataURL(file);
        }} />
      <div className="w-10 h-10 rounded-lg border border-dashed border-border group-hover:border-primary/50 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors">
        {value
          ? <img src={value} alt="" className="w-full h-full object-contain" />
          : (placeholder ?? <ImageIcon className="w-4 h-4 text-muted-foreground/40" />)}
      </div>
    </label>
  );
}

// ─── Equip cycle helper ────────────────────────────────────────────────────────

function cycleEquip(current: EquipValue | undefined): EquipValue {
  if (!current || current === "cannot") return "can";
  if (current === "can") return "weak";
  return "cannot";
}

const EQUIP_STYLE: Record<EquipValue, string> = {
  can:    "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400",
  weak:   "bg-amber-100 dark:bg-amber-950/40 border-amber-400 text-amber-700 dark:text-amber-400",
  cannot: "border-dashed border-border text-muted-foreground/40",
};
const EQUIP_LABEL: Record<EquipValue, string> = { can: "Can Equip", weak: "Weak", cannot: "Can't Equip" };

// ─── Stat Row (expandable) ─────────────────────────────────────────────────────

function StatRow({ stat, entry, icon, editing, level, onChange }: {
  stat: string;
  entry?: JobStatEntry;
  icon?: string;
  editing: boolean;
  level: number;
  onChange: (updated: JobStatEntry | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newLevelKey, setNewLevelKey] = useState("");
  const [newLevelVal, setNewLevelVal] = useState("");

  const e = entry ?? { base: 0, inc: 0, levels: {} };
  const val = entry ? statAtLevel(entry, level) : null;
  const overrides = Object.entries(e.levels ?? {}).sort(([a], [b]) => Number(a) - Number(b));

  if (editing) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        >
          <span className="flex items-center gap-1.5 flex-1 text-sm font-medium">
            {icon && <img src={icon} alt={stat} className="w-3.5 h-3.5 object-contain" />}
            {stat}
          </span>
          {entry && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {entry.base} +{entry.inc}/lv
              {overrides.length > 0 && <span className="ml-1 text-amber-500">+{overrides.length} override{overrides.length !== 1 ? "s" : ""}</span>}
            </span>
          )}
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        </button>
        {open && (
          <div className="px-3 pb-3 pt-1 bg-muted/10 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Start (Base)</p>
                <Input type="number" value={e.base} onChange={(ev) => onChange({ ...e, base: Number(ev.target.value) || 0 })} className="h-7 text-xs px-2" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Increment / Lv</p>
                <Input type="number" step="0.1" value={e.inc} onChange={(ev) => onChange({ ...e, inc: parseFloat(ev.target.value) || 0 })} className="h-7 text-xs px-2" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Individual Level Overrides</p>
              {overrides.length > 0 && (
                <div className="space-y-1 mb-2">
                  {overrides.map(([lv, v]) => (
                    <div key={lv} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-12 shrink-0">Lv {lv}</span>
                      <Input type="number" value={v}
                        onChange={(ev) => onChange({ ...e, levels: { ...e.levels, [lv]: Number(ev.target.value) || 0 } })}
                        className="h-6 text-xs px-2 flex-1" />
                      <button onClick={() => {
                        const next = { ...e.levels }; delete next[lv];
                        onChange({ ...e, levels: next });
                      }} className="text-muted-foreground/50 hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input type="number" value={newLevelKey} onChange={(ev) => setNewLevelKey(ev.target.value)} placeholder="Level" className="h-6 text-xs px-2 w-20" />
                <Input type="number" value={newLevelVal} onChange={(ev) => setNewLevelVal(ev.target.value)} placeholder="Value" className="h-6 text-xs px-2 w-20" />
                <button onClick={() => {
                  if (!newLevelKey) return;
                  onChange({ ...e, levels: { ...e.levels, [newLevelKey]: Number(newLevelVal) || 0 } });
                  setNewLevelKey(""); setNewLevelVal("");
                }} className="text-xs text-primary hover:underline">+ Add</button>
              </div>
            </div>
            {entry && (
              <button onClick={() => onChange(null)} className="text-[10px] text-destructive/60 hover:text-destructive transition-colors">
                Clear stat
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {icon && <img src={icon} alt={stat} className="w-3 h-3 object-contain" />}{stat}
      </span>
      <span className={`text-xs font-semibold tabular-nums ${val === null || val === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
        {val === null ? "—" : val}
        {entry?.levels?.[String(level)] !== undefined && <span className="ml-0.5 text-[9px] text-amber-500">★</span>}
      </span>
    </div>
  );
}

// ─── Job Detail View ──────────────────────────────────────────────────────────

function JobDetail({ jobName, jobs, statIcons, weaponCategories, onSave }: {
  jobName: string;
  jobs: Record<string, Job>;
  statIcons: Record<string, string>;
  weaponCategories: string[];
  onSave: (updated: Record<string, Job>, desc: string, newName?: string) => Promise<void>;
}) {
  const [, navigate] = useLocation();
  const job = jobs[jobName];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Job>(() => JSON.parse(JSON.stringify(job)));
  const [draftName, setDraftName] = useState(jobName);
  const [selectedRank, setSelectedRank] = useState(() => Object.keys(job.ranks)[0] ?? "A");
  const [level, setLevel] = useState(1);
  const [newSkill, setNewSkill] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);
  const [newRank, setNewRank] = useState("");
  const [addingRank, setAddingRank] = useState(false);

  const rankData = draft.ranks[selectedRank];
  const rankNames = Object.keys(draft.ranks);

  const setStat = (stat: string, updated: JobStatEntry | null) => {
    setDraft((d) => {
      const nextStats = { ...d.ranks[selectedRank]?.stats };
      if (updated === null) { delete nextStats[stat]; }
      else { nextStats[stat] = updated; }
      return { ...d, ranks: { ...d.ranks, [selectedRank]: { ...d.ranks[selectedRank], stats: nextStats } } };
    });
  };

  const addRank = () => {
    const r = newRank.trim().toUpperCase();
    if (!r || draft.ranks[r]) return;
    setDraft((d) => ({ ...d, ranks: { ...d.ranks, [r]: { stats: {} } } }));
    setSelectedRank(r);
    setNewRank(""); setAddingRank(false);
  };

  const removeRank = (r: string) => {
    if (Object.keys(draft.ranks).length <= 1) return;
    const next = { ...draft.ranks }; delete next[r];
    setDraft((d) => ({ ...d, ranks: next }));
    if (selectedRank === r) setSelectedRank(Object.keys(next)[0]);
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s || draft.skills.includes(s)) return;
    setDraft((d) => ({ ...d, skills: [...d.skills, s] }));
    setNewSkill(""); setAddingSkill(false);
  };

  const removeSkill = (s: string) => setDraft((d) => ({ ...d, skills: d.skills.filter((x) => x !== s) }));

  const toggleEquip = (slot: string) => {
    setDraft((d) => ({ ...d, equipment: { ...d.equipment, [slot]: cycleEquip(d.equipment[slot]) } }));
  };

  const toggleWeaponClass = (cls: string) => {
    setDraft((d) => {
      const current = d.weaponClasses ?? [];
      const next = current.includes(cls) ? current.filter((c) => c !== cls) : [...current, cls];
      return { ...d, weaponClasses: next };
    });
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
    await onSave(updatedJobs, `Updated job: ${trimmedName}`, trimmedName !== jobName ? trimmedName : undefined);
    setEditing(false);
    if (trimmedName !== jobName) {
      navigate(`/jobs/${encodeURIComponent(trimmedName)}`);
    }
  };

  const cancelEdit = () => {
    setDraft(JSON.parse(JSON.stringify(job)));
    setDraftName(jobName);
    setEditing(false);
  };

  const firstGenJobs = Object.entries(jobs).filter(([n, j]) => j.generation === 1 && n !== jobName).map(([n]) => n).sort();

  return (
    <div>
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
        {editing ? (
          <IconUploadSmall value={draft.icon} onChange={(icon) => setDraft((d) => ({ ...d, icon }))} />
        ) : (
          <div className="w-16 h-16 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
            {job.icon ? <img src={job.icon} alt={jobName} className="w-full h-full object-contain" /> : <Star className="w-8 h-8 text-muted-foreground/30" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="text-xl font-bold h-9 mb-2 max-w-xs"
              placeholder="Job name…"
            />
          ) : (
            <h2 className="text-2xl font-bold text-foreground mb-1">{jobName}</h2>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={job.generation === 1 ? "border-sky-300 text-sky-600 dark:text-sky-400" : "border-orange-300 text-orange-600 dark:text-orange-400"}>
              {job.generation === 1 ? "1st Generation" : "2nd Generation"}
            </Badge>
            {editing ? (
              <button onClick={() => setDraft((d) => ({ ...d, generation: d.generation === 1 ? 2 : 1 }))} className="text-xs text-primary hover:underline">
                Switch to {draft.generation === 1 ? "2nd" : "1st"} gen
              </button>
            ) : null}
            {editing ? (
              <div className="flex gap-1">
                {(["combat", "non-combat"] as const).map((t) => (
                  <button key={t} onClick={() => setDraft((d) => ({ ...d, type: t }))}
                    className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${draft.type === t ? (t === "combat" ? "bg-red-500 text-white border-red-500" : "bg-sky-500 text-white border-sky-500") : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {t === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
                  </button>
                ))}
              </div>
            ) : job.type ? (
              <Badge variant="outline" className={job.type === "combat" ? "border-red-300 text-red-600 dark:text-red-400" : "border-emerald-300 text-emerald-600 dark:text-emerald-400"}>
                {job.type === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground/60">Type not set</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" />Stats</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-wrap">
                {rankNames.map((r) => (
                  <button key={r} onClick={() => setSelectedRank(r)}
                    className={`px-2 py-0.5 text-xs rounded font-medium border transition-colors ${selectedRank === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                    {r}
                  </button>
                ))}
                {editing && (
                  addingRank ? (
                    <div className="flex items-center gap-1">
                      <Input value={newRank} onChange={(e) => setNewRank(e.target.value)} placeholder="Rank" className="h-6 w-16 text-xs"
                        onKeyDown={(e) => { if (e.key === "Enter") addRank(); if (e.key === "Escape") { setAddingRank(false); setNewRank(""); } }} autoFocus />
                      <button onClick={addRank} className="text-primary hover:text-primary/80"><Check className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingRank(true)} className="px-2 py-0.5 text-xs rounded border border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors">
                      + Rank
                    </button>
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
          {!editing && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">Level</span>
              <Input type="number" min={1} max={MAX_LEVEL} value={level}
                onChange={(e) => setLevel(Math.min(MAX_LEVEL, Math.max(1, parseInt(e.target.value) || 1)))}
                className="h-6 w-20 text-xs text-center" />
              <span className="text-xs text-muted-foreground">/ {MAX_LEVEL}</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-1.5">
              {STAT_ORDER.map((stat) => (
                <StatRow
                  key={stat}
                  stat={stat}
                  entry={rankData?.stats[stat]}
                  icon={statIcons[stat]}
                  editing
                  level={level}
                  onChange={(v) => setStat(stat, v)}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {STAT_ORDER.map((stat) => (
                <StatRow
                  key={stat}
                  stat={stat}
                  entry={rankData?.stats[stat]}
                  icon={statIcons[stat]}
                  editing={false}
                  level={level}
                  onChange={() => {}}
                />
              ))}
            </div>
          )}
          {!editing && rankData && (
            <p className="text-[10px] text-muted-foreground mt-3">
              stat = Base + (Level − 1) × +/Lv · max level {MAX_LEVEL} · <span className="text-amber-500">★</span> = individual override
            </p>
          )}
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-sky-500" />Equipment Slots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Non-weapon slots */}
          <div className="flex flex-wrap gap-2">
            {CHAR_SLOTS.filter((s) => s !== "Weapon").map((slot) => {
              const val = draft.equipment[slot] ?? "cannot";
              return editing ? (
                <button key={slot} onClick={() => toggleEquip(slot)}
                  className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${EQUIP_STYLE[val]}`}>
                  {val === "can" && <Check className="w-3 h-3 inline mr-1" />}
                  {slot} {val !== "cannot" && <span className="ml-1 opacity-70">({val === "can" ? "Can Equip" : "Weak"})</span>}
                </button>
              ) : (
                <span key={slot} className={`px-3 py-1.5 text-xs rounded-full border font-medium ${EQUIP_STYLE[val]} ${val === "cannot" ? "line-through" : ""}`}>
                  {val !== "cannot" && val === "can" && <Check className="w-3 h-3 inline mr-1" />}
                  {slot}{val === "weak" && <span className="ml-1 opacity-70">(Weak)</span>}
                </span>
              );
            })}
          </div>
          {editing && <p className="text-[10px] text-muted-foreground">Click non-weapon slots to cycle: Can't Equip → Can Equip → Weak → Can't Equip</p>}

          {/* Weapon slot */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sword className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Weapon Classes</span>
              <span className="text-[10px] text-muted-foreground">(select all classes this job can wield)</span>
            </div>
            {weaponCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No weapon categories defined yet — add them in the Equipment Stats page.</p>
            ) : editing ? (
              <div className="flex flex-wrap gap-1.5">
                {weaponCategories.map((cls) => {
                  const active = (draft.weaponClasses ?? []).includes(cls);
                  return (
                    <button key={cls} onClick={() => toggleWeaponClass(cls)}
                      className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                      {active && <Check className="w-3 h-3 inline mr-1" />}{cls}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(job.weaponClasses ?? []).length === 0 ? (
                  <span className="text-xs text-muted-foreground/50">No weapon classes assigned</span>
                ) : (job.weaponClasses ?? []).map((cls) => (
                  <span key={cls} className="px-2.5 py-1 text-xs rounded-full border border-primary/30 bg-primary/5 text-primary font-medium">
                    {cls}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Skills</CardTitle>
            {editing && !addingSkill && (
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => setAddingSkill(true)}>
                <Plus className="w-3 h-3" />Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing && addingSkill && (
            <div className="flex gap-2 mb-2">
              <Input autoFocus value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Skill name…" className="h-7 text-xs"
                onKeyDown={(e) => { if (e.key === "Enter") addSkill(); if (e.key === "Escape") { setAddingSkill(false); setNewSkill(""); } }} />
              <button onClick={addSkill} className="text-primary hover:text-primary/80"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setAddingSkill(false); setNewSkill(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          )}
          {draft.skills.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">{editing ? "No skills yet — add one above." : "No skills recorded."}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.skills.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 text-xs">
                  {skill}
                  {editing && <button onClick={() => removeSkill(skill)} className="text-muted-foreground/60 hover:text-destructive transition-colors"><X className="w-2.5 h-2.5" /></button>}
                </span>
              ))}
            </div>
          )}
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
                  className={`flex-1 py-1.5 text-xs rounded border font-medium transition-colors capitalize ${jobType === t ? (t === "combat" ? "bg-red-500 text-white border-red-500" : "bg-sky-500 text-white border-sky-500") : "border-border hover:border-primary/40"}`}>
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
      const emptyRanks: Record<string, JobRankData> = { A: { stats: {} } };
      const newJob: Job = { generation: gen, type, ranks: emptyRanks, equipment: {}, weaponClasses: [], skills: [] };
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

  const [search, setSearch] = useState("");
  const [genFilter, setGenFilter] = useState<"all" | "1" | "2">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "combat" | "non-combat">("all");
  const [addingJob, setAddingJob] = useState(false);

  const filteredJobs = useMemo(() => {
    return Object.entries(jobs)
      .filter(([name, job]) => {
        if (genFilter === "1" && job.generation !== 1) return false;
        if (genFilter === "2" && job.generation !== 2) return false;
        if (typeFilter === "combat" && job.type !== "combat") return false;
        if (typeFilter === "non-combat" && job.type !== "non-combat") return false;
        if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [jobs, genFilter, typeFilter, search]);

  const selectedJob = jobParam ? decodeURIComponent(jobParam) : null;

  return (
    <div className="min-h-screen bg-background transition-colors">
      {promptName && <NamePrompt onSave={onNameSaved} />}
      <NewJobDialog open={addingJob} onClose={() => setAddingJob(false)} onCreate={addJob} />

      <div className="max-w-5xl mx-auto px-4 py-8">
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
            <div className="flex flex-wrap items-center gap-2 mb-4">
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
                              {rankList.length === 0 ? (
                                <span className="text-[10px] text-muted-foreground">No ranks set</span>
                              ) : rankList.map((r) => (
                                <span key={r} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{r}</span>
                              ))}
                            </div>
                            {job.skills.length > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-1 truncate">{job.skills.length} skill{job.skills.length !== 1 ? "s" : ""}</p>
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
              {Object.keys(jobs).length} jobs · click any job to open its detail page
            </p>
          </>
        )}
      </div>
    </div>
  );
}
