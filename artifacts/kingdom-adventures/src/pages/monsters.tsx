import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, Loader2, Plus, RefreshCw, Search, Skull, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { apiUrl } from "@/lib/api";
import { MONSTER_ICON_MAP } from "@/lib/monster-icons";
import {
  MINED_MONSTER_SUMMARIES,
  mergeUniqueSpawns,
  type CommunitySighting,
} from "@/lib/monster-truth";

type SharedMonster = { icon?: string };

function MonsterImage({ src, name, large = false }: { src?: string; name: string; large?: boolean }) {
  return (
    <div className={`${large ? "h-24 w-48" : "h-14 w-28 sm:h-16 sm:w-32"} shrink-0 overflow-hidden rounded-md border border-border bg-muted/30`}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover object-center" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Skull className={`${large ? "h-7 w-7" : "h-5 w-5"} text-muted-foreground/40`} />
        </div>
      )}
    </div>
  );
}

function SpawnChip({ area, level }: { area: string; level: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] leading-5 text-muted-foreground">
      <span className="font-medium text-foreground/80">{area}</span>
      <span>Lv {level}</span>
    </span>
  );
}

function useSharedIcons() {
  return useQuery({
    queryKey: ["ka-shared-monster-icons"],
    queryFn: () => fetchSharedWithFallback<{ monsters: Record<string, SharedMonster> }>(apiUrl("/shared")),
    staleTime: 5 * 60_000,
  });
}

const SIGHTINGS_CACHE_KEY = "ka_monster_community_sightings";

function readSightingsCache(): Record<string, CommunitySighting[]> {
  try {
    const raw = localStorage.getItem(SIGHTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSightingsCache(data: Record<string, CommunitySighting[]>) {
  try {
    localStorage.setItem(SIGHTINGS_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function useCommunitySightings() {
  return useQuery({
    queryKey: ["ka-community-sightings"],
    queryFn: async (): Promise<Record<string, CommunitySighting[]>> => {
      try {
        const res = await fetch(apiUrl("/community-sightings"));
        if (!res.ok) throw new Error("not ok");
        const data = await res.json();
        writeSightingsCache(data);
        return data;
      } catch {
        return readSightingsCache();
      }
    },
    staleTime: 5 * 60_000,
    initialData: readSightingsCache,
  });
}

export default function MonstersPage() {
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_monsters") ?? "");
  const [showNote, setShowNote] = useState(false);
  const [expandedMonster, setExpandedMonster] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("monster") ?? null;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sightingDrafts, setSightingDrafts] = useState<Record<string, { area: string; level: string }>>({});
  const { data, isLoading, refetch } = useSharedIcons();
  const { data: communitySightings = {} } = useCommunitySightings();
  const queryClient = useQueryClient();
  const expandedRowRef = useRef<HTMLDivElement | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (sightings: Record<string, CommunitySighting[]>) => {
      writeSightingsCache(sightings);
      const res = await fetch(apiUrl("/community-sightings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: sightings }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ka-community-sightings"] });
    },
  });

  const monsters = useMemo(() => {
    const sharedMonsters = data?.monsters ?? {};
    return MINED_MONSTER_SUMMARIES.map((monster) => {
      const sightings = communitySightings[monster.name] ?? [];
      return {
        ...monster,
        icon: sharedMonsters[monster.name]?.icon ?? MONSTER_ICON_MAP[monster.name],
        communitySightings: sightings,
        combinedSpawns: mergeUniqueSpawns(monster.nativeMapSpawns, sightings),
      };
    });
  }, [communitySightings, data?.monsters]);

  const filteredMonsters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return monsters;
    return monsters.filter((monster) => {
      const searchable = [
        monster.name,
        monster.terrainName,
        String(monster.areaLevelMin),
        String(monster.areaLevelMax),
        ...monster.combinedSpawns.flatMap((spawn) => [spawn.area, String(spawn.level), `lv ${spawn.level}`]),
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [monsters, searchQuery]);

  useEffect(() => {
    if (expandedRowRef.current) {
      expandedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const updateSightingDraft = useCallback((monsterName: string, patch: Partial<{ area: string; level: string }>) => {
    setSightingDrafts((current) => ({
      ...current,
      [monsterName]: {
        area: current[monsterName]?.area ?? "",
        level: current[monsterName]?.level ?? "",
        ...patch,
      },
    }));
  }, []);

  const addCommunitySighting = useCallback((monsterName: string) => {
    const draft = sightingDrafts[monsterName];
    const area = draft?.area?.trim() ?? "";
    const level = Number(draft?.level ?? "");
    if (!area || !Number.isFinite(level)) return;

    const existing = communitySightings[monsterName] ?? [];
    const alreadyExists = existing.some(
      (entry) => entry.area.trim().toLowerCase() === area.toLowerCase() && entry.level === level,
    );
    if (alreadyExists) return;

    const updated = {
      ...communitySightings,
      [monsterName]: [...existing, { area, level }].sort((left, right) => {
        const areaCmp = left.area.localeCompare(right.area);
        if (areaCmp !== 0) return areaCmp;
        return left.level - right.level;
      }),
    };
    saveMutation.mutate(updated);
    queryClient.setQueryData(["ka-community-sightings"], updated);
    updateSightingDraft(monsterName, { area: "", level: "" });
  }, [communitySightings, saveMutation, queryClient, updateSightingDraft, sightingDrafts]);

  const removeCommunitySighting = useCallback((monsterName: string, target: CommunitySighting) => {
    const existing = communitySightings[monsterName] ?? [];
    const filtered = existing.filter(
      (entry) => !(entry.area === target.area && entry.level === target.level),
    );
    const updated = { ...communitySightings };
    if (filtered.length === 0) {
      delete updated[monsterName];
    } else {
      updated[monsterName] = filtered;
    }
    saveMutation.mutate(updated);
    queryClient.setQueryData(["ka-community-sightings"], updated);
  }, [communitySightings, saveMutation, queryClient]);

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Skull className="w-5 h-5 text-violet-500" />Monster Spawns
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowNote((value) => !value)} className="h-8 w-8 text-muted-foreground" title="Personal notes (private, stored on this device)">
              <Info className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 text-muted-foreground">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(event) => setPageNote(event.target.value)}
              onBlur={() => localStorage.setItem("ka_note_monsters", pageNote)}
              placeholder="Personal notes for this page... (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}

        <div className="mb-4 rounded-lg border border-border bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Mined-first spawn view</p>
          <p>
            Terrain, Min Lv. and Max Lv. come from <code>KA GameData - Monster.csv</code>. Native spawn levels are only shown where the current mined terrain map resolves them.
            If a monster still has an incomplete spawn picture, you can keep local community sightings here instead of leaving it blank.
          </p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Monster Spawns Database</h2>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search monsters, terrain, or spawn level"
            className="h-9 pl-9 text-sm"
          />
        </div>

        <Card className="shadow-sm overflow-hidden">
          <div className="divide-y divide-border">
            {filteredMonsters.map((monster) => {
              const isExpanded = expandedMonster === monster.name;
              const draft = sightingDrafts[monster.name] ?? { area: "", level: "" };
              const previewSpawns = monster.combinedSpawns.slice(0, 6);
              const hiddenSpawnCount = Math.max(0, monster.combinedSpawns.length - previewSpawns.length);
              return (
                <div key={monster.id || monster.name} ref={expandedMonster === monster.name ? expandedRowRef : null}>
                  <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors">
                    <MonsterImage src={monster.icon} name={monster.name} />
                    <button onClick={() => setExpandedMonster(isExpanded ? null : monster.name)} className="grid flex-1 grid-cols-1 gap-1 text-left lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)_160px] lg:items-center">
                      <div className="flex min-w-0 items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className={`truncate font-medium text-sm ${isExpanded ? "text-primary underline underline-offset-2 decoration-primary/40" : ""}`}>{monster.name}</span>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {previewSpawns.length > 0 ? (
                          <>
                            {previewSpawns.map((spawn, index) => (
                              <SpawnChip key={`${monster.name}-preview-${spawn.area}-${spawn.level}-${index}`} area={spawn.area} level={spawn.level} />
                            ))}
                            {hiddenSpawnCount > 0 ? (
                              <span className="inline-flex items-center rounded border border-border/70 px-2 py-0.5 text-[11px] leading-5 text-muted-foreground">+{hiddenSpawnCount}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No resolved spawn levels</span>
                        )}
                      </div>
                      <div className="hidden text-right text-[11px] text-muted-foreground lg:block">
                        <span className="font-medium text-foreground/80">{monster.terrainName}</span>
                        <span> Lv {monster.areaLevelMin}-{monster.areaLevelMax}</span>
                      </div>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="bg-muted/10 px-3 py-3 border-t border-border/50">
                      <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)]">
                        <div className="hidden lg:block">
                          <MonsterImage src={monster.icon} name={monster.name} large />
                        </div>

                        <div className="min-w-0 space-y-3">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Terrain</p>
                              <p className="text-sm font-medium">{monster.terrainName}</p>
                            </div>
                            <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Min Lv.</p>
                              <p className="text-sm font-medium">{monster.areaLevelMin}</p>
                            </div>
                            <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Max Lv.</p>
                              <p className="text-sm font-medium">{monster.areaLevelMax}</p>
                            </div>
                          </div>

                          {monster.spawnNote ? (
                            <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3">
                              <p className="text-xs text-muted-foreground">{monster.spawnNote}</p>
                            </div>
                          ) : null}

                          {monster.nativeMapSpawns.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Native Map Spawns</p>
                              <div className="flex flex-wrap gap-1.5">
                                {monster.nativeMapSpawns.map((spawn, index) => (
                                  <SpawnChip key={`${monster.name}-${spawn.area}-${spawn.level}-${index}`} area={spawn.area} level={spawn.level} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-md border border-border/60 bg-background/40 px-3 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-xs font-medium text-muted-foreground">Sighted by community data</p>
                        </div>
                        {monster.communitySightings.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {monster.communitySightings.map((entry, index) => (
                              <button
                                key={`${monster.name}-community-${entry.area}-${entry.level}-${index}`}
                                type="button"
                                onClick={() => removeCommunitySighting(monster.name, entry)}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
                                title="Remove this local sighting"
                              >
                                <span className="font-medium">{entry.area}</span>
                                <span>Lv {entry.level}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/70 mb-3">No community sightings added on this device yet.</p>
                        )}

                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                          <Input
                            value={draft.area}
                            onChange={(event) => updateSightingDraft(monster.name, { area: event.target.value })}
                            placeholder="Biome or area, like Grass or Snow"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={draft.level}
                            onChange={(event) => updateSightingDraft(monster.name, { level: event.target.value })}
                            placeholder="Lv"
                            inputMode="numeric"
                            className="h-8 text-xs"
                          />
                          <Button type="button" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addCommunitySighting(monster.name)}>
                            <Plus className="w-3.5 h-3.5" />
                            Add sighting
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 mt-2">Sightings are shared with all users.</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredMonsters.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No monsters match that search.
              </div>
            ) : null}
          </div>
        </Card>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          {filteredMonsters.length === monsters.length
            ? `${monsters.length} monsters`
            : `${filteredMonsters.length} of ${monsters.length} monsters`}
        </p>
      </div>
    </div>
  );
}
