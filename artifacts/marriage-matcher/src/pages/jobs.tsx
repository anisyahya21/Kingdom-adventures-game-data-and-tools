import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Trash2, Moon, Sun,
  RefreshCw, Loader2, X, Check, Pencil, Shield, Star, Users, Sword,
  Save, ImageIcon, Heart,
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
const RANKS_ORDER = ["A", "S", "SS", "SSS", "B", "C"];
const MAX_LEVEL = 999;

type JobStatEntry = { base: number; inc: number };
type JobRankData = { stats: Record<string, JobStatEntry> };
type Job = {
  generation: 1 | 2;
  icon?: string;
  ranks: Record<string, JobRankData>;
  equipment: Partial<Record<string, boolean>>;
  skills: string[];
};

function statAtLevel(base: number, inc: number, level: number) {
  return base + (level - 1) * inc;
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
      return r.json() as Promise<{ jobs: Record<string, Job>; statIcons: Record<string, string> }>;
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
  const [refState, setRef] = useState<HTMLInputElement | null>(null);
  return (
    <label className="cursor-pointer group relative inline-block">
      <input ref={setRef} type="file" accept="image/*" className="sr-only"
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

// ─── Job Detail View ──────────────────────────────────────────────────────────

function JobDetail({ jobName, jobs, statIcons, onBack, onSave }: {
  jobName: string;
  jobs: Record<string, Job>;
  statIcons: Record<string, string>;
  onBack: () => void;
  onSave: (updated: Record<string, Job>, desc: string) => Promise<void>;
}) {
  const job = jobs[jobName];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Job>(() => JSON.parse(JSON.stringify(job)));
  const [selectedRank, setSelectedRank] = useState(() => Object.keys(job.ranks)[0] ?? "A");
  const [level, setLevel] = useState(1);
  const [newSkill, setNewSkill] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);
  const [newRank, setNewRank] = useState("");
  const [addingRank, setAddingRank] = useState(false);

  const rankData = draft.ranks[selectedRank];
  const rankNames = Object.keys(draft.ranks);

  const statVal = (stat: string) => {
    const s = rankData?.stats[stat];
    if (!s) return 0;
    return statAtLevel(s.base, s.inc, Math.min(level, MAX_LEVEL));
  };

  const setStat = (stat: string, field: "base" | "inc", val: number) => {
    setDraft((d) => ({
      ...d,
      ranks: {
        ...d.ranks,
        [selectedRank]: {
          ...d.ranks[selectedRank],
          stats: { ...d.ranks[selectedRank]?.stats, [stat]: { ...(d.ranks[selectedRank]?.stats[stat] ?? { base: 0, inc: 0 }), [field]: val } },
        },
      },
    }));
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

  const toggleEquip = (slot: string) => setDraft((d) => ({ ...d, equipment: { ...d.equipment, [slot]: !d.equipment[slot] } }));

  const handleSave = async () => {
    await onSave({ ...jobs, [jobName]: draft }, `Updated job: ${jobName}`);
    setEditing(false);
  };

  const firstGenJobs = Object.entries(jobs).filter(([n, j]) => j.generation === 1 && n !== jobName).map(([n]) => n).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Jobs
        </button>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button size="sm" className="h-8 gap-1.5" onClick={handleSave}><Save className="w-3.5 h-3.5" />Save</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setDraft(JSON.parse(JSON.stringify(job))); setEditing(false); }}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" />Edit</Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4 mb-6">
        {editing ? (
          <IconUploadSmall value={draft.icon} onChange={(icon) => setDraft((d) => ({ ...d, icon }))} />
        ) : (
          <div className="w-16 h-16 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
            {job.icon ? <img src={job.icon} alt={jobName} className="w-full h-full object-contain" /> : <Star className="w-8 h-8 text-muted-foreground/30" />}
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold text-foreground">{jobName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={job.generation === 1 ? "border-sky-300 text-sky-600 dark:text-sky-400" : "border-orange-300 text-orange-600 dark:text-orange-400"}>
              {job.generation === 1 ? "1st Generation" : "2nd Generation"}
            </Badge>
            {editing && (
              <button
                onClick={() => setDraft((d) => ({ ...d, generation: d.generation === 1 ? 2 : 1 }))}
                className="text-xs text-primary hover:underline"
              >
                Switch to {draft.generation === 1 ? "2nd" : "1st"} gen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Stats</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-wrap">
                {rankNames.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRank(r)}
                    className={`px-2 py-0.5 text-xs rounded font-medium border transition-colors ${selectedRank === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}
                  >
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {STAT_ORDER.map((stat) => {
                const s = rankData?.stats[stat] ?? { base: 0, inc: 0 };
                return (
                  <div key={stat} className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                      {statIcons[stat] && <img src={statIcons[stat]} alt={stat} className="w-3 h-3 object-contain" />}{stat}
                    </span>
                    <div className="flex gap-1">
                      <div className="flex-1">
                        <span className="text-[9px] text-muted-foreground/70">Base</span>
                        <Input type="number" value={s.base} onChange={(e) => setStat(stat, "base", Number(e.target.value) || 0)} className="h-6 text-xs px-1.5" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[9px] text-muted-foreground/70">+/Lv</span>
                        <Input type="number" step="0.1" value={s.inc} onChange={(e) => setStat(stat, "inc", parseFloat(e.target.value) || 0)} className="h-6 text-xs px-1.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {STAT_ORDER.map((stat) => {
                const s = rankData?.stats[stat];
                const val = s ? statAtLevel(s.base, s.inc, Math.min(level, MAX_LEVEL)) : null;
                return (
                  <div key={stat} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {statIcons[stat] && <img src={statIcons[stat]} alt={stat} className="w-3 h-3 object-contain" />}{stat}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${val === null || val === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
                      {val === null ? "—" : val}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {!editing && rankData && (
            <p className="text-[10px] text-muted-foreground mt-3">stat = Base + (Level − 1) × +/Lv · max level {MAX_LEVEL}</p>
          )}
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-sky-500" />Equipment Slots</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CHAR_SLOTS.map((slot) => {
              const canEquip = draft.equipment[slot] ?? false;
              return editing ? (
                <button
                  key={slot}
                  onClick={() => toggleEquip(slot)}
                  className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${canEquip ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400" : "border-dashed border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {canEquip ? <><Check className="w-3 h-3 inline mr-1" />{slot}</> : <>{slot}</>}
                </button>
              ) : (
                <span key={slot} className={`px-3 py-1.5 text-xs rounded-full border font-medium ${canEquip ? "bg-green-100 dark:bg-green-950/40 border-green-400 text-green-700 dark:text-green-400" : "border-dashed border-border text-muted-foreground/40 line-through"}`}>
                  {slot}
                </span>
              );
            })}
          </div>
          {editing && <p className="text-[10px] text-muted-foreground mt-2">Click slots to toggle whether this job can equip them.</p>}
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
              <p className="text-xs text-muted-foreground mb-3">All first generation jobs are compatible at <strong>A rank</strong>.</p>
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

// ─── Jobs List ────────────────────────────────────────────────────────────────

function NewJobDialog({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, gen: 1 | 2) => void;
}) {
  const [name, setName] = useState("");
  const [gen, setGen] = useState<1 | 2>(1);
  const submit = () => { if (name.trim()) { onCreate(name.trim(), gen); setName(""); } };
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
          <div className="flex gap-2">
            <Button className="flex-1 h-8 text-sm" onClick={submit}>Add Job</Button>
            <Button variant="outline" className="h-8 text-sm" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function JobsPage() {
  const { name: jobParam } = useParams<{ name?: string }>();
  const { dark, setDark } = useDarkMode();
  const { name: userName, save: saveUserName } = useUserName();
  const [promptName, setPromptName] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useSharedData();

  const jobs: Record<string, Job> = data?.jobs ?? {};
  const statIcons: Record<string, string> = data?.statIcons ?? {};

  const withName = useCallback((fn: () => void) => {
    if (!userName) { setPendingAction(() => fn); setPromptName(true); }
    else fn();
  }, [userName]);

  const onNameSaved = (n: string) => {
    saveUserName(n); setPromptName(false);
    if (pendingAction) { pendingAction(); setPendingAction(null); }
  };

  const mutateJobs = useCallback(async (next: Record<string, Job>, desc: string) => {
    await saveJobs(next, userName, desc);
    await qc.invalidateQueries({ queryKey: ["ka-shared"] });
  }, [userName, qc]);

  const [addingJob, setAddingJob] = useState(false);
  const [genFilter, setGenFilter] = useState<"all" | "1" | "2">("all");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  useEffect(() => {
    if (jobParam) setSelectedJob(decodeURIComponent(jobParam));
  }, [jobParam]);

  const addJob = (name: string, gen: 1 | 2) => {
    withName(() => {
      const emptyRanks: Record<string, JobRankData> = { A: { stats: {} } };
      const newJob: Job = { generation: gen, ranks: emptyRanks, equipment: {}, skills: [] };
      mutateJobs({ ...jobs, [name]: newJob }, `Added job: ${name}`);
      setAddingJob(false);
      setSelectedJob(name);
    });
  };

  const removeJob = (name: string) => {
    withName(() => {
      const next = { ...jobs }; delete next[name];
      mutateJobs(next, `Removed job: ${name}`);
      if (selectedJob === name) setSelectedJob(null);
    });
  };

  const filteredJobs = useMemo(() => {
    return Object.entries(jobs)
      .filter(([name, job]) => {
        if (genFilter === "1" && job.generation !== 1) return false;
        if (genFilter === "2" && job.generation !== 2) return false;
        if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [jobs, genFilter, search]);

  return (
    <div className="min-h-screen bg-background transition-colors">
      {promptName && <NamePrompt onSave={onNameSaved} />}
      <NewJobDialog open={addingJob} onClose={() => setAddingJob(false)} onCreate={addJob} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {selectedJob ? (
              <button onClick={() => setSelectedJob(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
            onBack={() => setSelectedJob(null)}
            onSave={async (updated, desc) => {
              withName(() => mutateJobs(updated, desc));
            }}
          />
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
                    <Card key={name} className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group" onClick={() => setSelectedJob(name)}>
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                            {job.icon ? <img src={job.icon} alt={name} className="w-full h-full object-contain" /> : <Star className="w-5 h-5 text-muted-foreground/30" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">{name}</h3>
                              <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${job.generation === 1 ? "border-sky-300 text-sky-600 dark:text-sky-400" : "border-orange-300 text-orange-600 dark:text-orange-400"}`}>
                                {job.generation === 1 ? "Gen 1" : "Gen 2"}
                              </Badge>
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
              {Object.keys(jobs).length} jobs · click any job to view details
            </p>
          </>
        )}
      </div>
    </div>
  );
}
