import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Diamond, Loader2, MapPin, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { fetchAutomaticWeeklyConquestTimeline } from "@/lib/weekly-conquest";
import { apiUrl } from "@/lib/api";
import {
  MINED_MONSTER_SUMMARY_MAP,
  mergeUniqueSpawns,
  readCommunitySightings,
  type CommunitySighting,
} from "@/lib/monster-truth";

type MonsterSpawn = { area: string; level: number };
type Monster = { icon?: string; spawns: MonsterSpawn[] };
type WeeklyReward = { jobName: string; jobRank: string; diamonds: number; equipment: string };
type WeeklyConquest = { monsters: string[]; reward: WeeklyReward; updatedBy?: string; updatedAt?: number } | null;

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: () => fetchSharedWithFallback<{ monsters: Record<string, Monster>; weeklyConquest: WeeklyConquest }>(apiUrl("/shared")),
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

export default function WeeklyConquestPage() {
  const { data, isLoading } = useSharedData();
  const monsters = data?.monsters ?? {};
  const fallbackWeeklyConquest: WeeklyConquest = data?.weeklyConquest ?? null;
  const [showConquestCalendar, setShowConquestCalendar] = useState(false);
  const [timeNow, setTimeNow] = useState(() => Date.now());
  const [conquestOffset, setConquestOffset] = useState(0);
  const [deploymentQuery, setDeploymentQuery] = useState("");
  const [deploymentOpen, setDeploymentOpen] = useState(false);
  const [communitySightings] = useState<Record<string, CommunitySighting[]>>(() => readCommunitySightings());
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
    ? { monsters: browsedConquest.monsters, reward: browsedConquest.reward }
    : fallbackWeeklyConquest;

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
  const isOngoingEvent = browsedConquest ? timeNow >= browsedConquest.startedAt && timeNow < browsedConquest.endsAt : false;

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
    setCoveredConquestAreas((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  }, [conquestAreaKey]);
  const isConquestAreaCovered = useCallback((spawn: MonsterSpawn) => coveredConquestAreas.includes(conquestAreaKey(spawn)), [coveredConquestAreas, conquestAreaKey]);

  const availableConquestDeployments = useMemo(() => {
    if (!weeklyConquest?.monsters?.length) return [];
    const seen = new Set<string>();
    const results: Array<{ label: string; spawn: MonsterSpawn }> = [];
    for (const monsterName of weeklyConquest.monsters) {
      const monster = monsters[monsterName];
      const minedSummary = MINED_MONSTER_SUMMARY_MAP[monsterName];
      const spawns = mergeUniqueSpawns(monster?.spawns, minedSummary?.nativeMapSpawns, communitySightings[monsterName]);
      if (!spawns.length) continue;
      for (const spawn of spawns) {
        if (!spawn.area || spawn.area === "Dispatch") continue;
        const key = `${spawn.area.trim().toLowerCase()}|${spawn.level}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ label: `${spawn.area} Lv${spawn.level}`, spawn });
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
      return normalizedLabel.includes(q) || area.includes(q) || level.includes(q) || compact.includes(q.replace(/\s+/g, " ").trim());
    });
  }, [deploymentQuery, availableConquestDeployments]);

  const addDeploymentFromSearch = useCallback((spawn: MonsterSpawn) => {
    if (!isConquestAreaCovered(spawn)) toggleConquestArea(spawn);
    setDeploymentQuery("");
    setDeploymentOpen(false);
  }, [isConquestAreaCovered, toggleConquestArea]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!deploymentBoxRef.current) return;
      if (!deploymentBoxRef.current.contains(event.target as Node)) setDeploymentOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const conquestKillTargets = [50, 350, 600, 1200, 1500];

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />Weekly Conquest
          </h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Card className="shadow-sm mb-6 border-violet-200 dark:border-violet-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />Weekly Conquest
              </CardTitle>
              {conquestMeta ? (
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{conquestMeta.subtitle}</p>
                  {conquestMeta.range ? <p className="text-[11px] text-muted-foreground/70">{conquestMeta.range}</p> : null}
                  {conquestCountdown ? (
                    <div className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-[12px] font-semibold text-amber-400 dark:text-amber-300">
                      {conquestCountdown}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {conquestMeta?.title ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{conquestMeta.isCurrent ? "Current Event" : conquestOffset < 0 ? "Past Event" : "Upcoming Event"}</p>
                        <p className="text-sm font-semibold">{conquestMeta.title}</p>
                      </div>
                      {conquestTimeline?.entries?.length ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" disabled={!canGoPrevious} onClick={() => setConquestOffset((value) => value - 1)}>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={conquestOffset === 0} onClick={() => setConquestOffset(0)}>
                            Back to This Week
                          </Button>
                          <Button size="icon" variant="outline" className="h-7 w-7" disabled={!canGoNext} onClick={() => setConquestOffset((value) => value + 1)}>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {conquestEventEntries.length > 0 ? (
                  <div className="-mx-3 overflow-x-auto px-3">
                    <div className="inline-flex gap-2 py-2 min-w-[max-content]">
                      {conquestEventEntries.map((entry) => {
                        const offset = entry.id - currentTimelineId;
                        const isSelected = entry.id === selectedConquestId;
                        const stateClasses = isSelected ? "bg-primary text-primary-foreground border-primary" : offset < 0 ? "bg-muted text-muted-foreground border-border" : "bg-muted/80 text-muted-foreground border-border";
                        return (
                          <button key={entry.id} type="button" onClick={() => setConquestOffset(offset)} className={`shrink-0 rounded-xl border px-3 py-2 text-left text-[11px] transition-colors ${stateClasses}`}>
                            <div className="font-semibold leading-tight">{entry.name}</div>
                            <div className="text-[10px] text-muted-foreground/70">{offset === 0 ? "Current" : offset < 0 ? `${-offset} past` : `${offset} upcoming`}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-muted/10 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-muted-foreground">Event Reward</p>
                    {isOngoingEvent ? <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Ongoing event</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {weeklyConquest?.reward?.jobName ? (
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-3 py-1 text-[10px] font-medium">
                        <Trophy className="w-3 h-3" />{weeklyConquest.reward.jobRank} - {weeklyConquest.reward.jobName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-[10px] text-muted-foreground/50">
                        <Trophy className="w-3 h-3" />Job reward - not set
                      </span>
                    )}
                    {weeklyConquest?.reward && weeklyConquest.reward.diamonds > 0 ? (
                      <span className="inline-flex items-center gap-1.5 bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded-full px-3 py-1 text-[10px] font-medium">
                        <Diamond className="w-3 h-3" />{weeklyConquest.reward.diamonds.toLocaleString()} Diamonds
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-[10px] text-muted-foreground/50">
                        <Diamond className="w-3 h-3" />Diamonds - not set
                      </span>
                    )}
                    {weeklyConquest?.reward?.equipment ? (
                      <span className="inline-flex items-center gap-1.5 bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-full px-3 py-1 text-[10px] font-medium">
                        {weeklyConquest.reward.equipment}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 border border-dashed border-border rounded-full px-3 py-1 text-[10px] text-muted-foreground/50">
                        Equipment - not set
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
                  {showConquestCalendar ? (
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
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => {
                    if (i === 5) {
                      return (
                        <div key="add-deployments" ref={deploymentBoxRef} className="rounded-lg border border-dashed border-border bg-muted/10 px-2 py-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Add Deployments</p>
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
                                  if (filteredConquestDeployments.length > 0) addDeploymentFromSearch(filteredConquestDeployments[0].spawn);
                                }
                                if (e.key === "Escape") setDeploymentOpen(false);
                              }}
                              placeholder="Type area or level..."
                              className="h-8 text-xs"
                            />
                            {deploymentOpen ? (
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
                                        className={`w-full text-left px-2.5 py-2 text-xs border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors ${covered ? "text-emerald-400" : "text-foreground"}`}
                                      >
                                        <span className="inline-flex items-center gap-1.5">
                                          {covered ? <Check className="w-3 h-3" /> : <MapPin className="w-3 h-3 text-muted-foreground" />}
                                          {label}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="px-2.5 py-2 text-xs text-muted-foreground">No matching deployments this week.</div>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">Only deployments from this week&apos;s conquest are available.</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">Covered: {coveredConquestAreas.length}</p>
                        </div>
                      );
                    }

                    const mName = weeklyConquest?.monsters?.[i];
                    const m = mName ? monsters[mName] : undefined;
                    const minedSummary = mName ? MINED_MONSTER_SUMMARY_MAP[mName] : undefined;
                    const communitySpawns = mName ? (communitySightings[mName] ?? []) : [];
                    const displaySpawns = mergeUniqueSpawns(m?.spawns, minedSummary?.nativeMapSpawns, communitySpawns);
                    return mName ? (
                      <div key={i} className="rounded-lg border border-border bg-muted/20 px-2 py-2 text-[11px]">
                        <div className="flex items-start gap-2">
                          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {m?.icon ? <img src={m.icon} alt="" className="w-full h-full object-contain" /> : <Trophy className="w-4 h-4 text-muted-foreground/40" />}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/monsters?monster=${encodeURIComponent(mName)}`}
                              className="text-[11px] font-semibold leading-tight text-foreground hover:text-primary underline-offset-2 hover:underline"
                            >
                              {mName}
                            </Link>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Target kills: {conquestKillTargets[i]?.toLocaleString() ?? "-"}</p>
                          </div>
                        </div>
                        {minedSummary ? (
                          <div className="mt-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
                            <p className="text-[10px] text-muted-foreground">
                              <span className="font-medium text-foreground">{minedSummary.terrainName}</span>
                              {" • "}Lv {minedSummary.areaLevelMin} to Lv {minedSummary.areaLevelMax}
                            </p>
                          </div>
                        ) : null}
                        {displaySpawns.length > 0 ? (
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            {displaySpawns.map((sp, si) => (
                              <button
                                key={si}
                                type="button"
                                onClick={() => toggleConquestArea(sp)}
                                className={`w-full text-left inline-flex flex-col items-start gap-1 text-[10px] rounded px-1.5 py-1.5 border transition-colors ${isConquestAreaCovered(sp) ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-muted border-transparent text-muted-foreground"}`}
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
                        ) : (
                          <div className="mt-2 rounded-md border border-dashed border-border/60 bg-background/30 px-2 py-2">
                            <p className="text-[10px] text-muted-foreground/70">You can add spawns on the Monster Spawns page for this monster.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-2 py-2 h-14">
                        <div className="w-8 h-8 rounded-md border border-dashed border-border/50 flex items-center justify-center shrink-0">
                          <Trophy className="w-3.5 h-3.5 text-muted-foreground/20" />
                        </div>
                        <p className="text-xs text-muted-foreground/40">Slot {i + 1} - not set</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
