import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw,
  Loader2, AlertTriangle, Upload, Moon, Sun, Info, X, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SourceViewerButton } from "@/components/source-viewer";
import rawSource from "./equipment.tsx?raw";

// ─── Stat name mapping ────────────────────────────────────────────────────────

const STAT_FULL: Record<string, string> = {
  hp: "HP", mp: "MP",
  vig: "Vigor", vigor: "Vigor",
  atk: "Attack", attack: "Attack",
  def: "Defence", defence: "Defence", defense: "Defence",
  spd: "Speed", speed: "Speed",
  lck: "Luck", luck: "Luck",
  int: "Intelligence", intelligence: "Intelligence",
  dex: "Dexterity", dexterity: "Dexterity",
  gth: "Gather", gather: "Gather",
  mov: "Move", move: "Move",
  hrt: "Heart", heart: "Heart",
};

const STAT_ORDER = ["HP", "MP", "Vigor", "Attack", "Defence", "Speed", "Luck", "Intelligence", "Dexterity", "Gather", "Move", "Heart"];

function fullStat(raw: string): string {
  return STAT_FULL[raw.toLowerCase()] ?? raw;
}

function isStatCol(col: string): boolean {
  return !!STAT_FULL[col.toLowerCase().trim()];
}

// Detect increment column: "HP/Level", "HP Inc", "HPInc", "hp_inc", "HP_per_level" etc.
function isIncCol(col: string): string | null {
  const lower = col.toLowerCase().replace(/[_\s/-]/g, "");
  for (const key of Object.keys(STAT_FULL)) {
    if (lower.startsWith(key) && (lower.includes("inc") || lower.includes("lvl") || lower.includes("level") || lower.includes("per"))) {
      return fullStat(key);
    }
  }
  return null;
}

// ─── Google Sheets fetch ──────────────────────────────────────────────────────

const SHEET_ID = "1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk";
const GID = "123527243";

interface EquipmentItem {
  name: string;
  slot: string;
  baseStats: Record<string, number>;
  incStats: Record<string, number>;
  crafterStudioLevel: number;
  crafterIntelligence: number;
  raw: Record<string, string | number | null>;
}

async function fetchSheet(): Promise<EquipmentItem[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;
  const res = await fetch(url);
  const text = await res.text();
  // Strip JSONP wrapper
  const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(json);
  const rawCols: Array<{ id: string; label: string; type: string }> = data.table.cols;
  const cols: string[] = rawCols.map((c) => c.label || c.id);
  const colTypes: string[] = rawCols.map((c) => c.type);
  const rows: EquipmentItem[] = [];

  // Find the best "name" column: prefer label matching /name|item|equip/i, else first string column
  const nameColIdx = (() => {
    const explicit = cols.findIndex((c) => /^(name|item.?name|equipment.?name|item|equip)$/i.test(c.trim()));
    if (explicit >= 0) return explicit;
    // First string-type column
    const strIdx = colTypes.findIndex((t) => t === "string");
    if (strIdx >= 0) return strIdx;
    return 0;
  })();

  // Find slot column
  const slotColIdx = cols.findIndex((c, i) => i !== nameColIdx && /slot|type|equip.?type|category/i.test(c));

  for (const row of data.table.rows) {
    if (!row?.c) continue;
    const cells = row.c as Array<{ v: string | number | null; f?: string } | null>;
    const raw: Record<string, string | number | null> = {};
    cols.forEach((col, i) => { raw[col] = cells[i]?.v ?? null; });

    const name = String(cells[nameColIdx]?.v ?? "").trim();
    if (!name || /^\d+$/.test(name)) continue; // skip rows with purely numeric or empty names

    const slot = slotColIdx >= 0 ? String(cells[slotColIdx]?.v ?? "").trim() : "Unknown";

    // Parse base stats and increment stats
    const baseStats: Record<string, number> = {};
    const incStats: Record<string, number> = {};

    for (let i = 0; i < cols.length; i++) {
      if (i === nameColIdx || i === slotColIdx) continue;
      const col = cols[i].trim();
      const incName = isIncCol(col);
      if (incName) {
        incStats[incName] = Number(cells[i]?.v) || 0;
      } else if (isStatCol(col)) {
        baseStats[fullStat(col)] = Number(cells[i]?.v) || 0;
      }
    }

    // Ensure all stats have at least 0 base and inc
    for (const stat of STAT_ORDER) {
      if (baseStats[stat] === undefined) baseStats[stat] = 0;
      if (incStats[stat] === undefined) incStats[stat] = 0;
    }

    // Crafting — flexible matching
    const craftLvlIdx = cols.findIndex((c) => /crafterstudio|studio.?level|crafter.?studio/i.test(c));
    const craftIntIdx = cols.findIndex((c) => /craftermintelligence|crafter.?intel|craft.*int/i.test(c));
    const crafterStudioLevel = craftLvlIdx >= 0 ? Number(cells[craftLvlIdx]?.v) || 0 : 0;
    const crafterIntelligence = craftIntIdx >= 0 ? Number(cells[craftIntIdx]?.v) || 0 : 0;

    rows.push({ name, slot, baseStats, incStats, crafterStudioLevel, crafterIntelligence, raw });
  }
  return rows;
}

function statAtLevel(base: number, inc: number, level: number): number {
  return base + (level - 1) * inc;
}

// ─── Icon storage ─────────────────────────────────────────────────────────────

function useIcons(storageKey: string) {
  const [icons, setIcons] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); }
    catch { return {}; }
  });

  const setIcon = useCallback((key: string, dataUrl: string) => {
    setIcons((prev) => {
      const next = { ...prev, [key]: dataUrl };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const removeIcon = useCallback((key: string) => {
    setIcons((prev) => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { icons, setIcon, removeIcon };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Icon Upload Button ───────────────────────────────────────────────────────

function IconUpload({ iconKey, icons, setIcon, removeIcon, size = 28 }: {
  iconKey: string;
  icons: Record<string, string>;
  setIcon: (k: string, v: string) => void;
  removeIcon: (k: string) => void;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = icons[iconKey];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setIcon(iconKey, dataUrl);
    e.target.value = "";
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {existing ? (
        <>
          <img src={existing} alt={iconKey} className="rounded object-contain w-full h-full cursor-pointer hover:opacity-80"
            onClick={() => inputRef.current?.click()} title="Click to change icon" />
          <button
            onClick={(e) => { e.stopPropagation(); removeIcon(iconKey); }}
            className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
          >
            <X className="w-2 h-2" />
          </button>
        </>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-full flex items-center justify-center rounded border border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-muted-foreground"
          title="Upload icon"
        >
          <ImageIcon className="w-3 h-3" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Slots ────────────────────────────────────────────────────────────────────

const CHAR_SLOTS = ["Head", "Weapon", "Shield", "Armor", "Accessory"] as const;
type CharSlot = typeof CHAR_SLOTS[number];

interface SlotEntry { itemName: string; level: number; }
type LoadoutState = Record<CharSlot, SlotEntry>;

const DEFAULT_LOADOUT: LoadoutState = {
  Head: { itemName: "", level: 1 },
  Weapon: { itemName: "", level: 1 },
  Shield: { itemName: "", level: 1 },
  Armor: { itemName: "", level: 1 },
  Accessory: { itemName: "", level: 1 },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const { data: items = [], isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["equipment"],
    queryFn: fetchSheet,
    staleTime: 5 * 60 * 1000,
  });

  const { icons: equipIcons, setIcon: setEquipIcon, removeIcon: removeEquipIcon } = useIcons("ka_equip_icons");
  const { icons: statIcons, setIcon: setStatIcon, removeIcon: removeStatIcon } = useIcons("ka_stat_icons");

  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState("All");
  const [globalLevel, setGlobalLevel] = useState(1);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loadout, setLoadout] = useState<LoadoutState>(() => {
    try { return JSON.parse(localStorage.getItem("ka_loadout") ?? "null") ?? DEFAULT_LOADOUT; }
    catch { return DEFAULT_LOADOUT; }
  });

  const setLoadoutEntry = (slot: CharSlot, entry: Partial<SlotEntry>) => {
    setLoadout((prev) => {
      const next = { ...prev, [slot]: { ...prev[slot], ...entry } };
      localStorage.setItem("ka_loadout", JSON.stringify(next));
      return next;
    });
  };

  const slots = useMemo(() => {
    const s = new Set(items.map((i) => i.slot));
    return ["All", ...Array.from(s).sort()];
  }, [items]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let list = items;
    if (search) list = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    if (slotFilter !== "All") list = list.filter((i) => i.slot === slotFilter);
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = sortCol === "name" ? a.name : statAtLevel(a.baseStats[sortCol] ?? 0, a.incStats[sortCol] ?? 0, globalLevel);
        const bv = sortCol === "name" ? b.name : statAtLevel(b.baseStats[sortCol] ?? 0, b.incStats[sortCol] ?? 0, globalLevel);
        if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
    }
    return list;
  }, [items, search, slotFilter, sortCol, sortDir, globalLevel]);

  // Total loadout stats
  const totalStats = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const stat of STAT_ORDER) totals[stat] = 0;
    for (const slot of CHAR_SLOTS) {
      const entry = loadout[slot];
      if (!entry.itemName) continue;
      const item = items.find((i) => i.name === entry.itemName);
      if (!item) continue;
      for (const stat of STAT_ORDER) {
        totals[stat] += statAtLevel(item.baseStats[stat] ?? 0, item.incStats[stat] ?? 0, entry.level);
      }
    }
    return totals;
  }, [loadout, items]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const updatedText = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2 h-8 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Home
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Equipment Stats</h1>
              <p className="text-xs text-muted-foreground">Compare equipment at any level · Build your loadout</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SourceViewerButton source={rawSource} title="Equipment Stats — Source Code" />
            <Button variant="outline" size="icon" onClick={toggleDark} className="h-8 w-8">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Stat icons manager */}
        <Card className="shadow-sm mb-4">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Stat Icons
              <span className="text-xs font-normal text-muted-foreground">— click any slot to upload an icon for that stat</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {STAT_ORDER.map((stat) => (
                <div key={stat} className="flex flex-col items-center gap-1">
                  <IconUpload iconKey={stat} icons={statIcons} setIcon={setStatIcon} removeIcon={removeStatIcon} size={32} />
                  <span className="text-[10px] text-muted-foreground">{stat}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input placeholder="Search equipment…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm w-48" />
          <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)}
            className="h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
            {slots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Preview Level:</span>
            <Input type="number" min={1} max={99} value={globalLevel}
              onChange={(e) => setGlobalLevel(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
              className="h-8 w-16 text-sm text-center" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {updatedText && <span className="text-xs text-muted-foreground">Updated {updatedText}</span>}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="h-8 gap-2">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh data
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm">Fetching equipment data from Google Sheets…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">Failed to load sheet data. Make sure the sheet is publicly accessible.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="ml-auto h-7">Retry</Button>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {/* Equipment Table */}
            <Card className="shadow-sm mb-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">Icon</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Name <SortIcon col="name" />
                        </button>
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Slot</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Craftable</th>
                      {STAT_ORDER.map((stat) => (
                        <th key={stat} className="text-center px-2 py-2 font-medium text-muted-foreground">
                          <button onClick={() => handleSort(stat)} className="flex flex-col items-center gap-0.5 hover:text-foreground transition-colors w-full">
                            {statIcons[stat]
                              ? <img src={statIcons[stat]} alt={stat} className="w-4 h-4 object-contain" title={stat} />
                              : <span className="text-[10px] whitespace-nowrap">{stat}</span>}
                            <SortIcon col={stat} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.length === 0 && (
                      <tr><td colSpan={4 + STAT_ORDER.length} className="text-center py-10 text-sm text-muted-foreground">No equipment found.</td></tr>
                    )}
                    {filtered.map((item) => (
                      <tr key={item.name} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-1.5">
                          <IconUpload iconKey={`equip:${item.name}`} icons={equipIcons} setIcon={setEquipIcon} removeIcon={removeEquipIcon} size={28} />
                        </td>
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap">{item.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground text-xs whitespace-nowrap">{item.slot}</td>
                        <td className="px-3 py-1.5">
                          {item.crafterStudioLevel === 0
                            ? <span className="text-destructive text-xs font-medium">Not craftable</span>
                            : (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Studio Lv </span>
                                <strong>{item.crafterStudioLevel}</strong>
                                {item.crafterIntelligence > 0 && (
                                  <> · <span className="text-muted-foreground">INT </span><strong>{item.crafterIntelligence}</strong></>
                                )}
                              </div>
                            )}
                        </td>
                        {STAT_ORDER.map((stat) => {
                          const base = item.baseStats[stat] ?? 0;
                          const inc = item.incStats[stat] ?? 0;
                          const val = statAtLevel(base, inc, globalLevel);
                          return (
                            <td key={stat} className={`px-2 py-1.5 text-center text-xs tabular-nums ${val === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
                              {val > 0 ? val : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
                {filtered.length} / {items.length} items · showing stats at level {globalLevel}
              </div>
            </Card>

            {/* Character Builder */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Character Builder</CardTitle>
                <p className="text-xs text-muted-foreground">Equip items in each slot and compare total stats.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                  {CHAR_SLOTS.map((slot) => {
                    const entry = loadout[slot];
                    const item = items.find((i) => i.name === entry.itemName);
                    return (
                      <Card key={slot} className="border-border shadow-none">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{slot}</span>
                            {entry.itemName && (
                              <button onClick={() => setLoadoutEntry(slot, { itemName: "" })} className="text-muted-foreground hover:text-destructive transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-2">
                          {entry.itemName && equipIcons[`equip:${entry.itemName}`] && (
                            <img src={equipIcons[`equip:${entry.itemName}`]} alt={entry.itemName}
                              className="w-10 h-10 object-contain rounded mx-auto" />
                          )}
                          <select
                            value={entry.itemName}
                            onChange={(e) => setLoadoutEntry(slot, { itemName: e.target.value })}
                            className="w-full h-7 text-xs rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">— none —</option>
                            {items.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
                          </select>
                          {entry.itemName && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground">Level</span>
                              <Input type="number" min={1} max={99} value={entry.level}
                                onChange={(e) => setLoadoutEntry(slot, { level: Math.min(99, Math.max(1, parseInt(e.target.value) || 1)) })}
                                className="h-6 w-14 text-xs text-center px-1" />
                            </div>
                          )}
                          {item && entry.itemName && (
                            <div className="text-[10px] text-muted-foreground space-y-0.5">
                              {STAT_ORDER.filter((s) => statAtLevel(item.baseStats[s] ?? 0, item.incStats[s] ?? 0, entry.level) > 0).map((s) => (
                                <div key={s} className="flex items-center justify-between">
                                  <span className="flex items-center gap-1">
                                    {statIcons[s] && <img src={statIcons[s]} alt={s} className="w-3 h-3 object-contain" />}
                                    {s}
                                  </span>
                                  <span className="font-medium text-foreground tabular-nums">
                                    {statAtLevel(item.baseStats[s] ?? 0, item.incStats[s] ?? 0, entry.level)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Total stats */}
                <div className="rounded-lg bg-muted/50 border border-border px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Total Equipment Stats</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                    {STAT_ORDER.map((stat) => (
                      <div key={stat} className="flex items-center gap-1.5 text-sm">
                        {statIcons[stat]
                          ? <img src={statIcons[stat]} alt={stat} className="w-4 h-4 object-contain" />
                          : <span className="text-xs text-muted-foreground">{stat}</span>}
                        <span className={`font-semibold tabular-nums ${totalStats[stat] === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
                          {totalStats[stat] || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>Data from Google Sheets · Kingdom Adventures</span>
          <Link href="/"><span className="hover:text-foreground transition-colors cursor-pointer">← Back to home</span></Link>
        </div>
      </div>
    </div>
  );
}
