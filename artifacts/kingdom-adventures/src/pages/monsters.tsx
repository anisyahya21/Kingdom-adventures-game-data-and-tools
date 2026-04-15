import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, ChevronDown, ChevronRight, Moon, Sun,
  MapPin, Trophy, Skull, RefreshCw, Loader2, Check, Diamond, Info, RotateCcw, ChevronLeft, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { fetchAutomaticWeeklyConquestTimeline } from "@/lib/weekly-conquest";
import { apiUrl } from "@/lib/api";


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
    queryFn: () => fetchSharedWithFallback<{ monsters: Record<string, Monster>; weeklyConquest: WeeklyConquest; jobs: Record<string, Job>; overrides?: Record<string, unknown> }>(apiUrl("/shared")),
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

export default function MonstersPage() {
  const { dark, setDark } = useDarkMode();
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_monsters") ?? "");
  const [showNote, setShowNote] = useState(false);
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

  const spawnLevels = useSpawnLevels();
  const [showLevelEditor, setShowLevelEditor] = useState(false);
  const [newLevelInput, setNewLevelInput] = useState("");

  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);
  const [showConquestCalendar, setShowConquestCalendar] = useState(false);
  const [timeNow, setTimeNow] = useState(() => Date.now());

  const [conquestOffset, setConquestOffset] = useState(0);
  const [deploymentQuery, setDeploymentQuery] = useState("");
  const [deploymentOpen, setDeploymentOpen] = useState(false);
  const [coveredConquestAreas, setCoveredConquestAreas] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ka_conquest_covered_areas");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const deploymentBoxRef = useRef<HTMLDivElement | null>(null);
  const { data: conquestTimeline } = useQuery({
    queryKey: ["weekly-conquest-automatic"],
    queryFn: () => fetchAutomaticWeeklyConquestTimeline(undefined, 4),
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

  const conquestEventEntries = conquestTimeline?.entries ?? [];
  const currentTimelineId = conquestTimeline?.currentId ?? 0;
  const selectedConquestId = currentTimelineId + conquestOffset;
  const isOngoingEvent = browsedConquest
    ? timeNow >= browsedConquest.startedAt && timeNow < browsedConquest.endsAt
    : false;

  const conquestCountdown = useMemo(() => {
    if (!browsedConquest || !isOngoingEvent) return "";
    const diff = browsedConquest.endsAt - timeNow;
    if (diff <= 0) return "Event ending soon";
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s remaining`;
  }, [browsedConquest, isOngoingEvent, timeNow]);

  useEffect(() => {
    const interval = window.setInterval(() => setTimeNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setConquestOffset(0);
  }, [conquestTimeline?.currentId]);

  useEffect(() => {
    localStorage.setItem("ka_conquest_covered_areas", JSON.stringify(coveredConquestAreas));
  }, [coveredConquestAreas]);

  const conquestAreaKey = useCallback((spawn: MonsterSpawn) => `${spawn.area.trim().toLowerCase()}|${spawn.level}`, []);
  const toggleConquestArea = useCallback((spawn: MonsterSpawn) => {
    const key = conquestAreaKey(spawn);
    setCoveredConquestAreas((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }, [conquestAreaKey]);
  const isConquestAreaCovered = useCallback((spawn: MonsterSpawn) => {
    return coveredConquestAreas.includes(conquestAreaKey(spawn));
  }, [coveredConquestAreas, conquestAreaKey]);

  const availableConquestDeployments = useMemo(() => {
    if (!weeklyConquest?.monsters?.length) return [];

    const seen = new Set<string>();
    const results: Array<{ label: string; spawn: MonsterSpawn }> = [];

    for (const monsterName of weeklyConquest.monsters) {
      const monster = monsters[monsterName];
      if (!monster?.spawns?.length) continue;

      for (const spawn of monster.spawns) {
        if (!spawn.area || spawn.area === "Dispatch") continue;

        const key = `${spawn.area.trim().toLowerCase()}|${spawn.level}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          label: `${spawn.area} Lv${spawn.level}`,
          spawn,
        });
      }
    }

    return results.sort((a, b) => {
      const areaCmp = a.spawn.area.localeCompare(b.spawn.area);
      if (areaCmp !== 0) return areaCmp;
      return a.spawn.level - b.spawn.level;
    });
  }, [weeklyConquest, monsters]);

  const filteredConquestDeployments = useMemo(() => {
    const q = deploymentQuery.trim().toLowerCase();
    if (!q) return availableConquestDeployments;

    return availableConquestDeployments.filter(({ label, spawn }) => {
      const normalizedLabel = label.toLowerCase();
      const area = spawn.area.toLowerCase();
      const level = String(spawn.level);
      const compact = `${area} lv${level}`;
      return (
        normalizedLabel.includes(q) ||
        area.includes(q) ||
        level.includes(q) ||
        compact.includes(q.replace(/\s+/g, " ").trim())
      );
    });
  }, [deploymentQuery, availableConquestDeployments]);

  const addDeploymentFromSearch = useCallback((spawn: MonsterSpawn) => {
    if (!isConquestAreaCovered(spawn)) {
      toggleConquestArea(spawn);
    }
    setDeploymentQuery("");
    setDeploymentOpen(false);
  }, [isConquestAreaCovered, toggleConquestArea]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!deploymentBoxRef.current) return;
      if (!deploymentBoxRef.current.contains(event.target as Node)) {
        setDeploymentOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const conquestKillTargets = [50, 350, 600, 1200, 1500];

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
                {conquestCountdown ? (
                  <div className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-[12px] font-semibold text-amber-400 dark:text-amber-300">
                    {conquestCountdown}
                  </div>
                ) : null}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conquestMeta?.title && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {conquestMeta.isCurrent ? "Current Event" : conquestOffset < 0 ? "Past Event" : "Upcoming Event"}
                      </p>
                      <p className="text-sm font-semibold">{conquestMeta.title}</p>
                    </div>
                    {conquestTimeline?.entries?.length ? (
                      <div className="flex flex-wrap items-center gap-1">
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

              {conquestEventEntries.length > 0 && (
                <div className="-mx-3 overflow-x-auto px-3">
                  <div className="inline-flex gap-2 py-2 min-w-[max-content]">
                    {conquestEventEntries.map((entry) => {
                      const offset = entry.id - currentTimelineId;
                      const isSelected = entry.id === selectedConquestId;
                      const stateClasses = isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : offset < 0
                          ? "bg-muted text-muted-foreground border-border"
                          : "bg-muted/80 text-muted-foreground border-border";
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setConquestOffset(offset)}
                          className={`shrink-0 rounded-xl border px-3 py-2 text-left text-[11px] transition-colors ${stateClasses}`}
                        >
                          <div className="font-semibold leading-tight">{entry.name}</div>
                          <div className="text-[10px] text-muted-foreground/70">
                            {offset === 0 ? "Current" : offset < 0 ? `${-offset} past` : `${offset} upcoming`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/10 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground">Event Reward</p>
                  {isOngoingEvent && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Ongoing event</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {weeklyConquest?.reward && weeklyConquest.reward.jobName ? (
                    <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-3 py-1 text-[10px] font-medium">
                      <Trophy className="w-3 h-3" />{weeklyConquest.reward.jobRank} — {weeklyConquest.reward.jobName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-[10px] text-muted-foreground/50">
                      <Trophy className="w-3 h-3" />Job reward — not set
                    </span>
                  )}
                  {weeklyConquest?.reward && weeklyConquest.reward.diamonds > 0 ? (
                    <span className="inline-flex items-center gap-1.5 bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded-full px-3 py-1 text-[10px] font-medium">
                      <Diamond className="w-3 h-3" />{weeklyConquest.reward.diamonds.toLocaleString()} Diamonds
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-[10px] text-muted-foreground/50">
                      <Diamond className="w-3 h-3" />Diamonds — not set
                    </span>
                  )}
                  {weeklyConquest?.reward && weeklyConquest.reward.equipment ? (
                    <span className="inline-flex items-center gap-1.5 bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-full px-3 py-1 text-[10px] font-medium">
                      🗡️ {weeklyConquest.reward.equipment}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-[10px] text-muted-foreground/50">
                      🗡️ Equipment — not set
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/10 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Event Calendar</p>
                    <p className="text-[11px] text-muted-foreground">Past, current and upcoming events with rewards only.</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setShowConquestCalendar((value) => !value)}>
                    {showConquestCalendar ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
                    {showConquestCalendar ? "Collapse" : "Expand"}
                  </Button>
                </div>
                {showConquestCalendar && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {conquestEventEntries.map((entry) => {
                      const isCurrent = entry.id === currentTimelineId;
                      const isPast = entry.id < currentTimelineId;
                      const entryLabel = isCurrent ? "Current" : isPast ? "Past" : "Upcoming";
                      return (
                        <div key={entry.id} className={`rounded-xl border p-2 ${isCurrent ? "border-primary bg-primary/10" : "border-border bg-muted/50"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold leading-snug truncate">{entry.name}</p>
                              <p className="text-[9px] text-muted-foreground">{new Date(entry.startedAt).toLocaleDateString()} - {new Date(entry.endsAt).toLocaleDateString()}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${isCurrent ? "bg-primary text-primary-foreground" : isPast ? "bg-muted text-muted-foreground" : "bg-muted/70 text-muted-foreground"}`}>
                              {entryLabel}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-[9px]">
                            {entry.reward.jobName ? (
                              <div className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 font-medium w-full overflow-hidden whitespace-nowrap text-ellipsis">
                                <Trophy className="w-3 h-3" />{entry.reward.jobRank} — {entry.reward.jobName}
                              </div>
                            ) : null}
                            {entry.reward.diamonds > 0 ? (
                              <div className="inline-flex items-center gap-1 bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded-full px-2 py-0.5 font-medium w-full overflow-hidden whitespace-nowrap text-ellipsis">
                                <Diamond className="w-3 h-3" />{entry.reward.diamonds.toLocaleString()} Diamonds
                              </div>
                            ) : null}
                            {entry.reward.equipment ? (
                              <div className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-full px-2 py-0.5 font-medium w-full overflow-hidden whitespace-nowrap text-ellipsis">
                                🗡️ {entry.reward.equipment}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => {
                  if (i === 5) {
                    return (
                      <div
                        key="add-deployments"
                        ref={deploymentBoxRef}
                        className="rounded-lg border border-dashed border-border bg-muted/10 px-2 py-2"
                      >
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          Add Deployments
                        </p>

                        <div className="relative">
                          <Input
                            value={deploymentQuery}
                            onChange={(e) => {
                              setDeploymentQuery(e.target.value);
                              setDeploymentOpen(true);
                            }}
                            onFocus={() => setDeploymentOpen(true)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (filteredConquestDeployments.length > 0) {
                                  addDeploymentFromSearch(filteredConquestDeployments[0].spawn);
                                }
                              }
                              if (e.key === "Escape") {
                                setDeploymentOpen(false);
                              }
                            }}
                            placeholder="Type area or level..."
                            className="h-8 text-xs"
                          />

                          {deploymentOpen && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                              {filteredConquestDeployments.length > 0 ? (
                                filteredConquestDeployments.map(({ label, spawn }) => {
                                  const covered = isConquestAreaCovered(spawn);
                                  return (
                                    <button
                                      key={`${spawn.area}-${spawn.level}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        addDeploymentFromSearch(spawn);
                                      }}
                                      className={`w-full text-left px-2.5 py-2 text-xs border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors ${
                                        covered ? "text-emerald-400" : "text-foreground"
                                      }`}
                                    >
                                      <span className="inline-flex items-center gap-1.5">
                                        {covered ? (
                                          <Check className="w-3 h-3" />
                                        ) : (
                                          <MapPin className="w-3 h-3 text-muted-foreground" />
                                        )}
                                        {label}
                                      </span>
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="px-2.5 py-2 text-xs text-muted-foreground">
                                  No matching deployments this week.
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <p className="text-[10px] text-muted-foreground mt-2">
                          Only deployments from this week’s conquest are available.
                        </p>

                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          Covered: {coveredConquestAreas.length}
                        </p>
                      </div>
                    );
                  }

                  const mName = weeklyConquest?.monsters[i];
                  const m = mName ? monsters[mName] : undefined;
                  return mName ? (
                    <div key={i} className="rounded-lg border border-border bg-muted/20 px-2 py-2 text-[11px]">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {m?.icon ? <img src={m.icon} alt="" className="w-full h-full object-contain" /> : <Skull className="w-4 h-4 text-muted-foreground/40" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold leading-tight">{mName}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Target kills: {conquestKillTargets[i]?.toLocaleString() ?? "—"}
                          </p>
                        </div>
                      </div>
                      {m && m.spawns.length > 0 ? (
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          {m.spawns.map((sp, si) => (
                            <button
                              key={si}
                              type="button"
                              onClick={() => toggleConquestArea(sp)}
                              className={`w-full text-left inline-flex flex-col items-start gap-1 text-[10px] rounded px-1.5 py-1.5 border transition-colors ${
                                isConquestAreaCovered(sp)
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                                  : "bg-muted border-transparent text-muted-foreground"
                              }`}
                              title={isConquestAreaCovered(sp) ? "Marked as covered" : "Tap to mark as covered"}
                            >
                              <div className="flex items-center gap-1">
                                {isConquestAreaCovered(sp) ? <Check className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                                <span className="font-medium">{sp.area}</span>
                              </div>
                              <span className="text-[9px] text-muted-foreground">Lv{sp.level}</span>
                            </button>
                          ))}
                        </div>
                      ) : <p className="text-[10px] text-muted-foreground/60 mt-2">No spawns recorded</p>}
                    </div>
                  ) : (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-2 py-2 h-14">
                      <div className="w-8 h-8 rounded-md border border-dashed border-border/50 flex items-center justify-center shrink-0">
                        <Skull className="w-3.5 h-3.5 text-muted-foreground/20" />
                      </div>
                      <p className="text-xs text-muted-foreground/40">Slot {i + 1} — not set</p>
                    </div>
                  );
                })}
              </div>

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
                const realSpawns = m.spawns.filter((sp) => sp.area && sp.area !== "Dispatch");
                const dispatchSpawns = m.spawns.filter((sp) => sp.area === "Dispatch");
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
                          {realSpawns.length > 0
                            ? `${realSpawns.length} spawn${realSpawns.length !== 1 ? "s" : ""}${dispatchSpawns.length > 0 ? ` · ${dispatchSpawns.length} dispatch` : ""}`
                            : dispatchSpawns.length > 0
                              ? `${dispatchSpawns.length} dispatch level${dispatchSpawns.length !== 1 ? "s" : ""}`
                              : "no spawn data"}
                        </span>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="bg-muted/10 px-4 py-3 border-t border-border/50">
                        {realSpawns.length === 0 && dispatchSpawns.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 py-1">No spawns recorded yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {realSpawns.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />Spawn Locations
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  {realSpawns.map((sp, idx) => (
                                    <div key={`real-${idx}-${sp.area}-${sp.level}`} className="flex items-center gap-2">
                                      <MapPin className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                      <div className="flex-1 text-xs text-muted-foreground">
                                        <span className="font-medium">Lv {sp.level}</span>
                                        {sp.area && <span className="text-muted-foreground/60"> • {sp.area}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {dispatchSpawns.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <Info className="w-3 h-3" />Dispatch Levels
                                  </p>
                                </div>
                                <p className="text-[11px] text-muted-foreground/60 mb-2">
                                  Reference levels only. These are not confirmed map area spawns.
                                </p>
                                <div className="space-y-1.5">
                                  {dispatchSpawns.map((sp, idx) => (
                                    <div key={`dispatch-${idx}-${sp.level}`} className="flex items-center gap-2">
                                      <Info className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                      <div className="flex-1 text-xs text-muted-foreground">
                                        <span className="font-medium">Lv {sp.level}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
