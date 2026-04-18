import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, Loader2, MapPin, RefreshCw, RotateCcw, Plus, X, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { apiUrl } from "@/lib/api";

type MonsterSpawn = { area: string; level: number };
type Monster = { icon?: string; spawns: MonsterSpawn[] };

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

const DEFAULT_SPAWN_LEVELS = [1,2,3,5,7,8,10,11,12,13,14,15,16,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,37,40,41,43,44,45,46,48,50,51,52,54,55,56,58,60,61,62,65,69,70,72,74,75,76,82,85,88,90,92,112,120,121,135,142,162,208,225,250,265,311,320,360,454,525,592,624,777,888,1020,1100,1600,2400,3200,4800,6000,9999];

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: () => fetchSharedWithFallback<{ monsters: Record<string, Monster> }>(apiUrl("/shared")),
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

function useSpawnLevels() {
  const [levels, setLevels] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("ka_spawn_levels");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return [...parsed].sort((a, b) => a - b);
      }
    } catch {}
    return DEFAULT_SPAWN_LEVELS;
  });

  const save = (next: number[]) => {
    const sorted = [...next].sort((a, b) => a - b);
    setLevels(sorted);
    localStorage.setItem("ka_spawn_levels", JSON.stringify(sorted));
  };

  const add = (lv: number) => {
    if (lv > 0 && !levels.includes(lv)) save([...levels, lv]);
  };

  const remove = (lv: number) => save(levels.filter((l) => l !== lv));
  const reset = () => {
    setLevels(DEFAULT_SPAWN_LEVELS);
    localStorage.removeItem("ka_spawn_levels");
  };

  return { levels, add, remove, reset };
}

export default function MonstersPage() {
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_monsters") ?? "");
  const [showNote, setShowNote] = useState(false);
  const [showLevelEditor, setShowLevelEditor] = useState(false);
  const [newLevelInput, setNewLevelInput] = useState("");
  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);
  const { data, isLoading, refetch } = useSharedData();
  const spawnLevels = useSpawnLevels();

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

  const monsterNames = Object.keys(monsters).sort();

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Skull className="w-5 h-5 text-violet-500" />Monster Spawns
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
          </div>
        </div>

        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(e) => setPageNote(e.target.value)}
              onBlur={() => localStorage.setItem("ka_note_monsters", pageNote)}
              placeholder="Personal notes for this page... (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}

        {showLevelEditor && (
          <Card className="mb-4 border-amber-200 dark:border-amber-800/40 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" />
                  <CardTitle className="text-sm">Spawn Level List</CardTitle>
                  <span className="text-xs text-muted-foreground">({spawnLevels.levels.length} levels - saved to this device)</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground gap-1" onClick={() => { if (confirm("Reset to default level list?")) spawnLevels.reset(); }}>
                  <RotateCcw className="w-3 h-3" />Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={newLevelInput}
                  onChange={(e) => setNewLevelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(newLevelInput, 10);
                      if (!isNaN(n) && n > 0) {
                        spawnLevels.add(n);
                        setNewLevelInput("");
                      }
                    }
                  }}
                  placeholder="Add a level number..."
                  className="h-7 text-xs flex-1"
                />
                <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={() => {
                  const n = parseInt(newLevelInput, 10);
                  if (!isNaN(n) && n > 0) {
                    spawnLevels.add(n);
                    setNewLevelInput("");
                  }
                }}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Add
                </Button>
              </div>
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

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Monster Spawns Database</h2>
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
                        {m.icon ? <img src={m.icon} alt="" className="w-full h-full object-contain" /> : <Skull className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                      <button onClick={() => setExpandedMonster(isExpanded ? null : mName)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className={`font-medium text-sm ${isExpanded ? "text-primary underline underline-offset-2 decoration-primary/40" : ""}`}>{mName}</span>
                        <span className="text-[11px] text-muted-foreground ml-1">
                          {realSpawns.length > 0
                            ? `${realSpawns.length} spawn${realSpawns.length !== 1 ? "s" : ""}${dispatchSpawns.length > 0 ? ` - ${dispatchSpawns.length} dispatch` : ""}`
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
                                        {sp.area ? <span className="text-muted-foreground/60"> - {sp.area}</span> : null}
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

        <p className="text-xs text-muted-foreground mt-4 text-center">{monsterNames.length} monsters</p>
      </div>
    </div>
  );
}
