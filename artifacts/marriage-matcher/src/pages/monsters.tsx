import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, ChevronDown, ChevronRight, Moon, Sun,
  MapPin, Trophy, Skull, RefreshCw, Loader2, Check, Diamond, Info, RotateCcw, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { fetchAutomaticWeeklyConquestTimeline } from "@/lib/weekly-conquest";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = (p: string) => `${BASE}/ka-api/ka${p}`;


type MonsterSpawn = { area: string; level: number };
type Monster = { icon?: string; spawns: MonsterSpawn[] };
type WeeklyReward = { jobName: string; jobRank: string; diamonds: number; equipment: string };
type WeeklyConquest = { monsters: string[]; reward: WeeklyReward; updatedBy?: string; updatedAt?: number } | null;
type Job = { generation: 1 | 2; type?: "combat" | "non-combat"; icon?: string; ranks: Record<string, { stats: Record<string, { base: number; inc: number }> }>; equipment: Partial<Record<string, boolean>>; skills: string[] };

const MONSTER_SPAWN_FALLBACKS: Record<string, MonsterSpawn[]> = {
  Alpacavalier: [
    { area: "Grass", level: 5 },
    { area: "Grass", level: 7 },
    { area: "Grass", level: 15 },
    { area: "Desert", level: 8 },
    { area: "Desert", level: 10 },
    { area: "Desert", level: 13 },
    { area: "Desert", level: 37 },
    { area: "Desert", level: 41 },
    { area: "Desert", level: 76 },
    { area: "Desert", level: 92 },
    { area: "Rock", level: 12 },
    { area: "Rock", level: 14 },
    { area: "Rock", level: 16 },
    { area: "Snow", level: 135 },
    { area: "Swamp", level: 85 },
    { area: "Swamp", level: 225 },
    { area: "Lava", level: 525 },
  ],
};

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

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: () => fetchSharedWithFallback<{ monsters: Record<string, Monster>; weeklyConquest: WeeklyConquest; jobs: Record<string, Job>; overrides?: Record<string, unknown> }>(API("/shared")),
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

const DEFAULT_SPAWN_LEVELS = [1,2,3,5,7,8,10,11,12,13,14,15,16,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,37,40,41,43,44,45,46,48,50,51,52,54,55,56,58,60,61,62,65,69,70,72,74,75,76,82,85,88,90,92,112,120,121,135,142,162,208,225,250,265,311,320,360,454,525,592,624,777,888,1020,1100,1600,2400,3200,4800,6000,9999];

function useSpawnLevels() {
  const [levels, setLevels] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("ka_spawn_levels");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return [...parsed].sort((a, b) => a - b);
      }
    } catch { /* ignore */ }
    return DEFAULT_SPAWN_LEVELS;
  });
  const save = (next: number[]) => {
    const sorted = [...next].sort((a, b) => a - b);
    setLevels(sorted);
    localStorage.setItem("ka_spawn_levels", JSON.stringify(sorted));
  };
  const add = (lv: number) => { if (lv > 0 && !levels.includes(lv)) save([...levels, lv]); };
  const remove = (lv: number) => save(levels.filter((l) => l !== lv));
  const reset = () => { setLevels(DEFAULT_SPAWN_LEVELS); localStorage.removeItem("ka_spawn_levels"); };
  return { levels, add, remove, reset };
}

function LevelCombobox({ value, onChange, onClose, levels }: { value: number; onChange: (v: number) => void; onClose: () => void; levels: number[] }) {
  const [q, setQ] = useState(String(value));
  const ref = useRef<HTMLDivElement>(null);
  const filtered = levels.filter((lv) => q === "" || String(lv).includes(q));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="relative inline-block">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const num = parseInt(q);
            if (!isNaN(num) && num > 0) { onChange(num); onClose(); }
          }
          if (e.key === "Escape") onClose();
        }}
        className="h-6 text-xs w-20 px-1.5"
        placeholder="Level…"
      />
      {filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-0.5 bg-popover border border-border rounded-md shadow-md max-h-52 overflow-y-auto min-w-[5rem]">
          {filtered.map((lv) => (
            <button key={lv} className={`w-full text-left px-2.5 py-1 text-xs hover:bg-muted transition-colors ${lv === value ? "bg-primary/10 text-primary font-medium" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(lv); onClose(); }}>
              {lv}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function saveMonsters(monsters: Record<string, Monster>, userName: string, description: string) {
  await fetch(API("/monsters"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: monsters, history: { userName, changeType: "monster", itemName: "monsters", description } }),
  });
}

function IconUploadSmall({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const ref = useState<HTMLInputElement | null>(null);
  const inputRef = { current: ref[0] };
  const [_, setRef] = ref;
  return (
    <label className="cursor-pointer group relative inline-block">
      <input ref={(el) => setRef(el)} type="file" accept="image/*" className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => { if (ev.target?.result) onChange(ev.target.result as string); };
          reader.readAsDataURL(file);
        }} />
      <div className="w-9 h-9 rounded-lg border border-dashed border-border group-hover:border-primary/50 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors">
        {value
          ? <img src={value} alt="" className="w-full h-full object-contain" />
          : <Skull className="w-4 h-4 text-muted-foreground/40" />}
      </div>
    </label>
  );
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
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Your name" className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && val.trim() && onSave(val.trim())} />
        <Button size="sm" onClick={() => val.trim() && onSave(val.trim())} className="w-full">Continue</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function MonstersPage() {
  const { dark, setDark } = useDarkMode();
  const { name: userName, save: saveUserName } = useUserName();
  const [promptName, setPromptName] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_monsters") ?? "");
  const [showNote, setShowNote] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useSharedData();

  const monsters: Record<string, Monster> = useMemo(() => {
    const source = data?.monsters ?? {};
    const merged: Record<string, Monster> = { ...source };
    for (const [name, spawns] of Object.entries(MONSTER_SPAWN_FALLBACKS)) {
      const existing = merged[name];
      if (!existing || existing.spawns.length === 0) {
        merged[name] = { icon: existing?.icon, spawns };
      }
    }
    return merged;
  }, [data?.monsters]);
  const fallbackWeeklyConquest: WeeklyConquest = data?.weeklyConquest ?? null;
  const withName = useCallback((fn: () => void) => {
    if (!userName) { setPendingAction(() => fn); setPromptName(true); }
    else fn();
  }, [userName]);

  const onNameSaved = (n: string) => {
    saveUserName(n); setPromptName(false);
    if (pendingAction) { pendingAction(); setPendingAction(null); }
  };

  const mutateMonsters = useCallback(async (next: Record<string, Monster>, desc: string) => {
    await saveMonsters(next, userName, desc);
    qc.invalidateQueries({ queryKey: ["ka-shared"] });
  }, [userName, qc]);

  const spawnLevels = useSpawnLevels();
  const [showLevelEditor, setShowLevelEditor] = useState(false);
  const [newLevelInput, setNewLevelInput] = useState("");

  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);
  const [editingSpawn, setEditingSpawn] = useState<{ name: string; idx: number } | null>(null);

  const updateIcon = (name: string, icon: string) => {
    withName(() => mutateMonsters({ ...monsters, [name]: { ...monsters[name], icon } }, `Updated icon for ${name}`));
  };

  const addSpawn = (monsterName: string) => {
    withName(() => {
      const m = monsters[monsterName];
      const next = { ...monsters, [monsterName]: { ...m, spawns: [...m.spawns, { area: "", level: 1 }] } };
      mutateMonsters(next, `Added spawn to ${monsterName}`);
    });
  };

  const updateSpawn = (monsterName: string, idx: number, spawn: MonsterSpawn) => {
    withName(() => {
      const m = monsters[monsterName];
      const spawns = m.spawns.map((s, i) => i === idx ? spawn : s);
      mutateMonsters({ ...monsters, [monsterName]: { ...m, spawns } }, `Updated spawn for ${monsterName}`);
    });
  };

  const removeSpawn = (monsterName: string, idx: number) => {
    withName(() => {
      const m = monsters[monsterName];
      mutateMonsters({ ...monsters, [monsterName]: { ...m, spawns: m.spawns.filter((_, i) => i !== idx) } }, `Removed spawn from ${monsterName}`);
    });
  };

  const [conquestOffset, setConquestOffset] = useState(0);
  const { data: conquestTimeline } = useQuery({
    queryKey: ["weekly-conquest-automatic"],
    queryFn: () => fetchAutomaticWeeklyConquestTimeline(),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const browsedConquest = conquestTimeline?.entries.find(
    (entry) => entry.id === (conquestTimeline.currentId + conquestOffset),
  ) ?? null;

  const weeklyConquest: WeeklyConquest = browsedConquest
    ? {
      monsters: browsedConquest.monsters,
      reward: browsedConquest.reward,
    }
    : fallbackWeeklyConquest;

  const monsterNames = Object.keys(monsters).sort();
  const conquestMeta = browsedConquest
    ? {
      title: browsedConquest.name,
      subtitle: "Automatic from Campaign + Campaign_lookup",
      range: `${new Date(browsedConquest.startedAt).toLocaleString()} - ${new Date(browsedConquest.endsAt).toLocaleString()}`,
      isCurrent: conquestOffset === 0,
    }
    : fallbackWeeklyConquest?.updatedBy
      ? {
        title: "Manual fallback",
        subtitle: `Last updated by ${fallbackWeeklyConquest.updatedBy}`,
        range: fallbackWeeklyConquest.updatedAt ? new Date(fallbackWeeklyConquest.updatedAt).toLocaleString() : "",
        isCurrent: true,
      }
      : null;
  const canGoPrevious = Boolean(conquestTimeline?.entries.find((entry) => entry.id === conquestTimeline.currentId + conquestOffset - 1));
  const canGoNext = Boolean(conquestTimeline?.entries.find((entry) => entry.id === conquestTimeline.currentId + conquestOffset + 1));

  useEffect(() => {
    setConquestOffset(0);
  }, [conquestTimeline?.currentId]);

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />Home
              </button>
            </Link>
            <span className="text-muted-foreground/30">/</span>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Skull className="w-5 h-5 text-violet-500" />Monsters
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowNote((v) => !v)} className="h-8 w-8 text-muted-foreground" title="Personal notes (private, stored on this device)">
              <Info className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowLevelEditor((v) => !v)} className={`h-8 w-8 transition-colors ${showLevelEditor ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground"}`} title="Spawn level list settings">
              <MapPin className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 text-muted-foreground">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setDark((d) => !d)} className="h-8 w-8">
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(e) => setPageNote(e.target.value)}
              onBlur={() => localStorage.setItem("ka_note_monsters", pageNote)}
              placeholder="Personal notes for this page… (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}

        {/* Spawn Level List Settings */}
        {showLevelEditor && (
          <Card className="mb-4 border-amber-200 dark:border-amber-800/40 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" />
                  <CardTitle className="text-sm">Spawn Level List</CardTitle>
                  <span className="text-xs text-muted-foreground">({spawnLevels.levels.length} levels · saved to this device)</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground gap-1" onClick={() => { if (confirm("Reset to default level list?")) spawnLevels.reset(); }}>
                  <RotateCcw className="w-3 h-3" />Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* Add a new level */}
              <div className="flex gap-2">
                <Input
                  type="number" min={1} value={newLevelInput}
                  onChange={(e) => setNewLevelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(newLevelInput);
                      if (!isNaN(n) && n > 0) { spawnLevels.add(n); setNewLevelInput(""); }
                    }
                  }}
                  placeholder="Add a level number…"
                  className="h-7 text-xs flex-1"
                />
                <Button size="sm" variant="secondary" className="h-7 px-3 text-xs"
                  onClick={() => { const n = parseInt(newLevelInput); if (!isNaN(n) && n > 0) { spawnLevels.add(n); setNewLevelInput(""); } }}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Add
                </Button>
              </div>
              {/* Current level list */}
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {spawnLevels.levels.map((lv) => (
                  <span key={lv} className="inline-flex items-center gap-1 text-[11px] bg-muted rounded px-1.5 py-0.5 font-mono">
                    {lv}
                    <button onClick={() => spawnLevels.remove(lv)} className="text-muted-foreground/50 hover:text-destructive transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly Conquest */}
        <Card className="shadow-sm mb-6 border-violet-200 dark:border-violet-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />Weekly Conquest
            </CardTitle>
            {conquestMeta && (
              <div className="space-y-0.5">
                <p className="text-[11px] text-muted-foreground">{conquestMeta.subtitle}</p>
                {conquestMeta.range && <p className="text-[11px] text-muted-foreground/70">{conquestMeta.range}</p>}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conquestMeta?.title && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {conquestMeta.isCurrent ? "Current Event" : conquestOffset < 0 ? "Past Event" : "Upcoming Event"}
                      </p>
                      <p className="text-sm font-semibold">{conquestMeta.title}</p>
                    </div>
                    {conquestTimeline?.entries?.length ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={!canGoPrevious}
                          onClick={() => setConquestOffset((value) => value - 1)}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={conquestOffset === 0}
                          onClick={() => setConquestOffset(0)}
                        >
                          Back to This Week
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={!canGoNext}
                          onClick={() => setConquestOffset((value) => value + 1)}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Array.from({ length: 5 }).map((_, i) => {
                  const mName = weeklyConquest?.monsters[i];
                  const m = mName ? monsters[mName] : undefined;
                  return mName ? (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {m?.icon ? <img src={m.icon} alt="" className="w-full h-full object-contain" /> : <Skull className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{mName}</p>
                        {m && m.spawns.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.spawns.map((sp, si) => (
                              <span key={si} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                <MapPin className="w-2.5 h-2.5" />{sp.area} Lv{sp.level}
                              </span>
                            ))}
                          </div>
                        ) : <p className="text-[10px] text-muted-foreground/60 mt-0.5">No spawns recorded</p>}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2 h-14">
                      <div className="w-8 h-8 rounded-md border border-dashed border-border/50 flex items-center justify-center shrink-0">
                        <Skull className="w-3.5 h-3.5 text-muted-foreground/20" />
                      </div>
                      <p className="text-xs text-muted-foreground/40">Slot {i + 1} — not set</p>
                    </div>
                  );
                })}
              </div>

              {weeklyConquest?.reward && (weeklyConquest.reward.jobName || weeklyConquest.reward.diamonds > 0 || weeklyConquest.reward.equipment) ? (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Event Reward</p>
                  <div className="flex flex-wrap gap-2">
                    {weeklyConquest.reward.jobName && (
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-3 py-1 text-xs font-medium">
                        <Trophy className="w-3 h-3" />{weeklyConquest.reward.jobRank} — {weeklyConquest.reward.jobName}
                      </span>
                    )}
                    {weeklyConquest.reward.diamonds > 0 && (
                      <span className="inline-flex items-center gap-1.5 bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded-full px-3 py-1 text-xs font-medium">
                        <Diamond className="w-3 h-3" />{weeklyConquest.reward.diamonds.toLocaleString()} Diamonds
                      </span>
                    )}
                    {weeklyConquest.reward.equipment && (
                      <span className="inline-flex items-center gap-1.5 bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-full px-3 py-1 text-xs font-medium">
                        🗡️ {weeklyConquest.reward.equipment}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Event Reward</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-xs text-muted-foreground/50">
                      <Trophy className="w-3 h-3" />Job reward — not set
                    </span>
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-xs text-muted-foreground/50">
                      <Diamond className="w-3 h-3" />Diamonds — not set
                    </span>
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-xs text-muted-foreground/50">
                      🗡️ Equipment — not set
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Monster Database */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Monster Database</h2>

        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : monsterNames.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No monsters are available from the shared database yet.
          </div>
        ) : (
          <Card className="shadow-sm overflow-hidden">
            <div className="divide-y divide-border">
              {monsterNames.map((mName) => {
                const m = monsters[mName];
                const isExpanded = expandedMonster === mName;
                return (
                  <div key={mName}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <div className="w-9 h-9 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                        {m.icon
                          ? <img src={m.icon} alt="" className="w-full h-full object-contain" />
                          : <Skull className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                      <button
                        onClick={() => setExpandedMonster(isExpanded ? null : mName)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className={`font-medium text-sm ${isExpanded ? "text-primary underline underline-offset-2 decoration-primary/40" : ""}`}>{mName}</span>
                        <span className="text-[11px] text-muted-foreground ml-1">
                          {m.spawns.length === 0 ? "no spawn data" : `${m.spawns.length} spawn${m.spawns.length !== 1 ? "s" : ""}`}
                        </span>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="bg-muted/10 px-4 py-3 border-t border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />Spawn Locations
                          </p>
                        </div>
                        {m.spawns.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 py-1">No spawns recorded yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {m.spawns.map((sp, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <MapPin className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                <div className="flex-1 text-xs text-muted-foreground">
                                  <span className="font-medium">Lv {sp.level}</span>
                                  {sp.area && <span className="text-muted-foreground/60"> • {sp.area}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          {monsterNames.length} monsters
        </p>
      </div>

    </div>
  );
}
