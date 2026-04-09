import { useState, useMemo, useCallback, useRef, Fragment, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw,
  Loader2, AlertTriangle, Moon, Sun, Info, X, ImageIcon,
  ChevronDown, ChevronRight, Download, History, CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SourceViewerButton } from "@/components/source-viewer";
import rawSource from "./equipment.tsx?raw";

// ─── Constants ────────────────────────────────────────────────────────────────

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

const STAT_ORDER = ["HP","MP","Vigor","Attack","Defence","Speed","Luck","Intelligence","Dexterity","Gather","Move","Heart"];
const CHAR_SLOTS = ["Head", "Weapon", "Shield", "Armor", "Accessory"] as const;
type CharSlot = typeof CHAR_SLOTS[number];
const SLOT_OPTIONS: Array<CharSlot | "—"> = ["—", "Head", "Weapon", "Shield", "Armor", "Accessory"];

function fullStat(raw: string): string { return STAT_FULL[raw.toLowerCase().trim()] ?? raw; }
function isStatCol(col: string): boolean { return !!STAT_FULL[col.toLowerCase().trim()]; }

function isIncCol(col: string): string | null {
  const lower = col.toLowerCase().replace(/[_\s/\-+]/g, "");
  for (const key of Object.keys(STAT_FULL)) {
    if (lower.startsWith(key) && (lower.includes("inc") || lower.includes("lvl") || lower.includes("level") || lower.includes("per") || lower.endsWith("lv"))) {
      return fullStat(key);
    }
  }
  return null;
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

const SHEET_ID = "1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk";
const GID = "123527243";

export interface EquipmentItem {
  uid: string;
  name: string;
  sheetSlot: string;
  baseStats: Record<string, number>;
  incStats: Record<string, number>;
  crafterStudioLevel: number;
  crafterIntelligence: number;
}

async function fetchSheet(): Promise<EquipmentItem[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;
  const res = await fetch(url);
  const text = await res.text();
  const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(json);
  const rawCols: Array<{ id: string; label: string; type: string }> = data.table.cols;
  const cols = rawCols.map((c) => (c.label || c.id).trim());
  const colTypes = rawCols.map((c) => c.type);

  const nameColIdx = (() => {
    const ex = cols.findIndex((c) => /^(name|item.?name|equipment.?name|equip(ment)?)$/i.test(c));
    if (ex >= 0) return ex;
    return colTypes.findIndex((t) => t === "string");
  })();

  const slotColIdx = cols.findIndex((c, i) => i !== nameColIdx && /^(slot|type|equip.?type|category|kind)$/i.test(c));
  const craftLvlIdx = cols.findIndex((c) => /crafterstudio|studio.?level|crafter.?studio/i.test(c));
  const craftIntIdx = cols.findIndex((c) => /craftermintelligence|crafter.?intel|craft.*int/i.test(c));

  const items: EquipmentItem[] = [];
  let uid = 0;

  for (const row of data.table.rows) {
    if (!row?.c) continue;
    const cells = row.c as Array<{ v: string | number | null } | null>;
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i]?.v ?? null : null);
    const name = String(get(nameColIdx) ?? "").trim();
    if (!name || /^\d+$/.test(name)) continue;
    const sheetSlot = slotColIdx >= 0 ? String(get(slotColIdx) ?? "").trim() : "";
    const baseStats: Record<string, number> = {};
    const incStats: Record<string, number> = {};
    for (let i = 0; i < cols.length; i++) {
      if (i === nameColIdx || i === slotColIdx || i === craftLvlIdx || i === craftIntIdx) continue;
      const col = cols[i]; if (!col) continue;
      const incName = isIncCol(col);
      if (incName) incStats[incName] = Number(get(i)) || 0;
      else if (isStatCol(col)) baseStats[fullStat(col)] = Number(get(i)) || 0;
    }
    for (const s of STAT_ORDER) {
      if (baseStats[s] === undefined) baseStats[s] = 0;
      if (incStats[s] === undefined) incStats[s] = 0;
    }
    items.push({ uid: String(uid++), name, sheetSlot, baseStats, incStats, crafterStudioLevel: Number(get(craftLvlIdx)) || 0, crafterIntelligence: Number(get(craftIntIdx)) || 0 });
  }
  return items;
}

function statAtLevel(base: number, inc: number, level: number): number {
  return Math.round(base + (level - 1) * inc);
}

// ─── Shared API state ─────────────────────────────────────────────────────────

type StatOverrides = Record<string, { base?: number; inc?: number }>;

interface HistoryEntry {
  id: string;
  timestamp: number;
  userName: string;
  changeType: "stat" | "slot" | "equip-icon" | "stat-icon";
  itemName: string;
  description: string;
}

interface SharedState {
  overrides: Record<string, StatOverrides>;
  slotAssignments: Record<string, string>;
  equipIcons: Record<string, string>;
  statIcons: Record<string, string>;
  history: HistoryEntry[];
}

const EMPTY_SHARED: SharedState = { overrides: {}, slotAssignments: {}, equipIcons: {}, statIcons: {}, history: [] };

async function fetchShared(): Promise<SharedState> {
  try {
    const res = await fetch("/ka-api/ka/shared");
    if (!res.ok) return EMPTY_SHARED;
    const data = await res.json();
    return { ...EMPTY_SHARED, ...data };
  } catch { return EMPTY_SHARED; }
}

type HistoryPayload = Omit<HistoryEntry, "id" | "timestamp">;

async function putShared(endpoint: string, data: unknown, history?: HistoryPayload) {
  await fetch(`/ka-api/ka/shared/${endpoint}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, history }),
  });
}

function useShared() {
  const qc = useQueryClient();
  const { data: shared = EMPTY_SHARED } = useQuery<SharedState>({
    queryKey: ["ka-shared"],
    queryFn: fetchShared,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ["ka-shared"] }), [qc]);

  const saveOverrides = useCallback(async (data: Record<string, StatOverrides>, history?: HistoryPayload) => {
    await putShared("overrides", data, history); invalidate();
  }, [invalidate]);

  const saveSlots = useCallback(async (data: Record<string, string>, history?: HistoryPayload) => {
    await putShared("slots", data, history); invalidate();
  }, [invalidate]);

  const saveEquipIcons = useCallback(async (data: Record<string, string>, history?: HistoryPayload) => {
    await putShared("icons/equip", data, history); invalidate();
  }, [invalidate]);

  const saveStatIcons = useCallback(async (data: Record<string, string>, history?: HistoryPayload) => {
    await putShared("icons/stat", data, history); invalidate();
  }, [invalidate]);

  return { shared, saveOverrides, saveSlots, saveEquipIcons, saveStatIcons, invalidate };
}

function getEffectiveStat(item: EquipmentItem, stat: string, field: "base" | "inc", overrides: Record<string, StatOverrides>): number {
  const ov = overrides[item.name]?.[stat]?.[field];
  if (ov !== undefined) return ov;
  return field === "base" ? (item.baseStats[stat] ?? 0) : (item.incStats[stat] ?? 0);
}

// ─── Username ─────────────────────────────────────────────────────────────────

function useUserName() {
  const [userName, setUserNameState] = useState(() => localStorage.getItem("ka_username") ?? "");
  const setUserName = (name: string) => {
    setUserNameState(name);
    localStorage.setItem("ka_username", name);
  };
  return { userName, setUserName };
}

// ─── Name prompt dialog ───────────────────────────────────────────────────────

function NamePromptDialog({ open, onSave }: { open: boolean; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = draft.trim();
    if (n) onSave(n);
  };
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Who's making this change?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Your name will be shown in the change history so everyone knows who updated what.</p>
        <form onSubmit={submit} className="flex gap-2 mt-2">
          <Input autoFocus placeholder="Your name…" value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1" />
          <Button type="submit" disabled={!draft.trim()}>Continue</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Icon upload ──────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}

function IconUpload({ iconKey, icons, onSave, size = 28 }: {
  iconKey: string; icons: Record<string, string>;
  onSave: (icons: Record<string, string>) => void; size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = icons[iconKey];
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    onSave({ ...icons, [iconKey]: await fileToDataUrl(file) }); e.target.value = "";
  };
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation(); const next = { ...icons }; delete next[iconKey]; onSave(next);
  };
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {existing ? (
        <>
          <img src={existing} alt="" className="rounded object-contain w-full h-full cursor-pointer hover:opacity-80" onClick={() => inputRef.current?.click()} />
          <button onClick={handleRemove} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"><X className="w-2 h-2" /></button>
        </>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="w-full h-full flex items-center justify-center rounded border border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-muted-foreground" title="Upload icon">
          <ImageIcon className="w-3 h-3" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const CHANGE_COLORS: Record<string, string> = {
  stat: "bg-blue-500",
  slot: "bg-violet-500",
  "equip-icon": "bg-amber-500",
  "stat-icon": "bg-emerald-500",
};

// ─── Character builder ────────────────────────────────────────────────────────

interface SlotEntry { itemName: string; level: number; }
type LoadoutState = Record<CharSlot, SlotEntry>;
const DEFAULT_LOADOUT: LoadoutState = { Head: { itemName: "", level: 1 }, Weapon: { itemName: "", level: 1 }, Shield: { itemName: "", level: 1 }, Armor: { itemName: "", level: 1 }, Accessory: { itemName: "", level: 1 } };

// ─── Info dialog ──────────────────────────────────────────────────────────────

function InfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8"><Info className="w-4 h-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>How to use Equipment Stats</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <div><h3 className="font-semibold text-foreground mb-1">Comparing specific items</h3><p>Check the checkbox on any rows you want to compare, then click <strong>Compare</strong> to show only those items side by side. Click <strong>Show all</strong> to go back.</p></div>
          <div><h3 className="font-semibold text-foreground mb-1">Assigning slots</h3><p>Use the Slot dropdown on each item to assign it to Head, Weapon, Shield, Armor, or Accessory. Once set, it only appears in that slot in the Character Builder.</p></div>
          <div><h3 className="font-semibold text-foreground mb-1">Editing stats</h3><p>Click an item's name to expand its stat editor. Set Base and +/Lv values using <code className="bg-muted px-1 rounded text-xs">stat = Base + (Level − 1) × Inc</code>. You'll be asked for your name — this gets logged in the change history.</p></div>
          <div><h3 className="font-semibold text-foreground mb-1">Exporting data</h3><p>Use the <strong>Export JSON</strong> button to download all current slot assignments and stat values as a file. This can be re-imported or committed to the project's code.</p></div>
          <div><h3 className="font-semibold text-foreground mb-1">What's shared vs personal</h3><p>Slots, stats, and icons are shared with everyone. Character builder and dark/light preference are yours only.</p></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dark mode ────────────────────────────────────────────────────────────────

function initDark() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = saved ? saved === "dark" : prefersDark;
  document.documentElement.classList.toggle("dark", isDark);
  return isDark;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportData(shared: SharedState) {
  const payload = { slotAssignments: shared.slotAssignments, overrides: shared.overrides };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ka-equipment-data.json"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const [darkMode, setDarkMode] = useState(() => initDark());
  const toggleDark = () => {
    const next = !darkMode; setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const { data: items = [], isLoading, isError, refetch, dataUpdatedAt } = useQuery({ queryKey: ["equipment"], queryFn: fetchSheet, staleTime: 5 * 60 * 1000 });
  const { shared, saveOverrides, saveSlots, saveEquipIcons, saveStatIcons } = useShared();
  const { overrides, slotAssignments, equipIcons, statIcons, history } = shared;

  const { userName, setUserName } = useUserName();
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const pendingAction = useRef<(() => Promise<void>) | null>(null);

  // Before any change, ensure we have a username
  const withName = useCallback((action: () => Promise<void>) => {
    if (userName) { action(); return; }
    pendingAction.current = action;
    setNamePromptOpen(true);
  }, [userName]);

  const onNameSaved = (name: string) => {
    setUserName(name);
    setNamePromptOpen(false);
    if (pendingAction.current) { pendingAction.current(); pendingAction.current = null; }
  };

  // Per-item levels (local, comparison table only)
  const [itemLevels, setItemLevels] = useState<Record<string, number>>({});
  const getItemLevel = (name: string) => itemLevels[name] ?? 1;
  const setItemLevel = (name: string, v: number) => setItemLevels((prev) => ({ ...prev, [name]: Math.min(99, Math.max(1, v)) }));

  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState("All");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showHistory, setShowHistory] = useState(false);

  // Comparison checkboxes
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);

  const toggleSelect = (uid: string) =>
    setSelectedUids((prev) => { const next = new Set(prev); next.has(uid) ? next.delete(uid) : next.add(uid); return next; });
  const clearSelection = () => { setSelectedUids(new Set()); setCompareMode(false); };

  // Character builder — personal
  const [loadout, setLoadout] = useState<LoadoutState>(() => {
    try { return JSON.parse(localStorage.getItem("ka_loadout") ?? "null") ?? DEFAULT_LOADOUT; } catch { return DEFAULT_LOADOUT; }
  });
  const setLoadoutEntry = (slot: CharSlot, entry: Partial<SlotEntry>) =>
    setLoadout((prev) => {
      const next = { ...prev, [slot]: { ...prev[slot], ...entry } };
      localStorage.setItem("ka_loadout", JSON.stringify(next));
      return next;
    });

  // Slot helpers
  const getItemSlot = useCallback((name: string) => slotAssignments[name] ?? "—", [slotAssignments]);

  const setItemSlot = useCallback((name: string, slot: string) => {
    withName(async () => {
      const next = { ...slotAssignments, [name]: slot };
      await saveSlots(next, { userName, changeType: "slot", itemName: name, description: `Assigned "${name}" to slot: ${slot}` });
    });
  }, [slotAssignments, saveSlots, withName, userName]);

  const setOverride = useCallback((itemName: string, stat: string, field: "base" | "inc", value: number) => {
    withName(async () => {
      const next = { ...overrides, [itemName]: { ...(overrides[itemName] ?? {}), [stat]: { ...(overrides[itemName]?.[stat] ?? {}), [field]: value } } };
      await saveOverrides(next, { userName, changeType: "stat", itemName, description: `Updated ${itemName} — ${stat} ${field === "base" ? "base" : "+/Lv"}: ${value}` });
    });
  }, [overrides, saveOverrides, withName, userName]);

  const handleEquipIcons = useCallback((icons: Record<string, string>, itemName?: string) => {
    withName(async () => {
      await saveEquipIcons(icons, itemName ? { userName, changeType: "equip-icon", itemName, description: `Updated icon for ${itemName}` } : undefined);
    });
  }, [saveEquipIcons, withName, userName]);

  const handleStatIcons = useCallback((icons: Record<string, string>, stat?: string) => {
    withName(async () => {
      await saveStatIcons(icons, stat ? { userName, changeType: "stat-icon", itemName: stat, description: `Updated stat icon for ${stat}` } : undefined);
    });
  }, [saveStatIcons, withName, userName]);

  const slotOptions = useMemo(() => {
    const assigned = new Set(Object.values(slotAssignments).filter((s) => s && s !== "—"));
    return ["All", ...CHAR_SLOTS.filter((s) => assigned.has(s))];
  }, [slotAssignments]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const getItemStatVal = useCallback((item: EquipmentItem, stat: string) => {
    const base = getEffectiveStat(item, stat, "base", overrides);
    const inc = getEffectiveStat(item, stat, "inc", overrides);
    return statAtLevel(base, inc, getItemLevel(item.name));
  }, [overrides, itemLevels]);

  const filtered = useMemo(() => {
    let list = compareMode ? items.filter((i) => selectedUids.has(i.uid)) : items;
    if (search) list = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    if (slotFilter !== "All") {
      list = list.filter((i) => { const a = getItemSlot(i.name); return a !== "—" ? a === slotFilter : i.sheetSlot === slotFilter; });
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        let av: number | string, bv: number | string;
        if (sortCol === "name") { av = a.name; bv = b.name; }
        else if (sortCol === "studioLevel") { av = a.crafterStudioLevel; bv = b.crafterStudioLevel; }
        else if (sortCol === "intReq") { av = a.crafterIntelligence; bv = b.crafterIntelligence; }
        else if (sortCol === "slot") { av = getItemSlot(a.name); bv = getItemSlot(b.name); }
        else { av = getItemStatVal(a, sortCol); bv = getItemStatVal(b, sortCol); }
        if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
    }
    return list;
  }, [items, compareMode, selectedUids, search, slotFilter, sortCol, sortDir, getItemStatVal, getItemSlot]);

  const totalStats = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of STAT_ORDER) totals[s] = 0;
    for (const slot of CHAR_SLOTS) {
      const entry = loadout[slot]; if (!entry.itemName) continue;
      const item = items.find((i) => i.name === entry.itemName); if (!item) continue;
      for (const s of STAT_ORDER) {
        const base = getEffectiveStat(item, s, "base", overrides);
        const inc = getEffectiveStat(item, s, "inc", overrides);
        totals[s] += statAtLevel(base, inc, entry.level);
      }
    }
    return totals;
  }, [loadout, items, overrides]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary shrink-0" /> : <ArrowDown className="w-3 h-3 text-primary shrink-0" />;
  };

  const colCount = 7 + STAT_ORDER.length; // checkbox, icon, name, level, slot, craftable, ...stats

  // Clear loadout entry if slot mismatch
  useEffect(() => {
    if (!items.length || !Object.keys(slotAssignments).length) return;
    let changed = false; const next = { ...loadout };
    for (const slot of CHAR_SLOTS) {
      const entry = next[slot]; if (!entry.itemName) continue;
      const assigned = slotAssignments[entry.itemName];
      if (assigned && assigned !== "—" && assigned !== slot) { next[slot] = { itemName: "", level: 1 }; changed = true; }
    }
    if (changed) { setLoadout(next); localStorage.setItem("ka_loadout", JSON.stringify(next)); }
  }, [slotAssignments, items]);

  return (
    <div className="min-h-screen bg-background transition-colors">
      <NamePromptDialog open={namePromptOpen} onSave={onNameSaved} />

      <div className="max-w-[1400px] mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/"><Button variant="ghost" size="sm" className="gap-2 h-8 text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" />Home</Button></Link>
            <Separator orientation="vertical" className="h-5" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Equipment Stats</h1>
              <p className="text-xs text-muted-foreground">Compare equipment at any level · Build your loadout</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {userName && (
              <button onClick={() => { setUserName(""); }} className="text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-2 py-1" title="Click to change your display name">
                Editing as <strong>{userName}</strong>
              </button>
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => exportData(shared)}>
              <Download className="w-3.5 h-3.5" />Export JSON
            </Button>
            <Button variant="outline" size="sm" className={`h-8 gap-1.5 ${showHistory ? "bg-muted" : ""}`} onClick={() => setShowHistory((v) => !v)}>
              <History className="w-3.5 h-3.5" />History {history.length > 0 && <span className="ml-0.5 text-[10px] bg-primary/10 text-primary px-1 rounded-full">{history.length}</span>}
            </Button>
            <InfoDialog />
            <SourceViewerButton source={rawSource} title="Equipment Stats — Source Code" />
            <Button variant="outline" size="icon" onClick={toggleDark} className="h-8 w-8">{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</Button>
          </div>
        </div>

        {/* Stat icons row */}
        <Card className="shadow-sm mb-4">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Stat Icons</span>
              {STAT_ORDER.map((stat) => (
                <div key={stat} className="flex flex-col items-center gap-0.5">
                  <IconUpload iconKey={stat} icons={statIcons} onSave={(icons) => handleStatIcons(icons, stat)} size={28} />
                  <span className="text-[9px] text-muted-foreground leading-none">{stat}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Input placeholder="Search equipment…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm w-44" />
          <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)}
            className="h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
            {slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {selectedUids.size > 0 && !compareMode && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-primary text-primary hover:bg-primary/5" onClick={() => setCompareMode(true)}>
              <CheckSquare className="w-3.5 h-3.5" />Compare {selectedUids.size} selected
            </Button>
          )}
          {compareMode && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={clearSelection}>
              <X className="w-3.5 h-3.5" />Show all
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {dataUpdatedAt && <span className="text-xs text-muted-foreground">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="h-8 gap-2">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Refresh
            </Button>
          </div>
        </div>

        {isLoading && <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="text-sm">Fetching data…</span></div>}
        {isError && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">Failed to load sheet data.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="ml-auto h-7">Retry</Button>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {compareMode && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary font-medium">
                <CheckSquare className="w-4 h-4" />
                Comparing {selectedUids.size} items
                <button onClick={clearSelection} className="ml-auto flex items-center gap-1 hover:underline"><X className="w-3 h-3" />Clear & show all</button>
              </div>
            )}

            {/* Equipment Table */}
            <Card className="shadow-sm mb-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border">
                      <th className="px-2 py-2 w-7 shrink-0">
                        <input type="checkbox" className="rounded border-border"
                          checked={selectedUids.size === filtered.length && filtered.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedUids(new Set(filtered.map((i) => i.uid)));
                            else clearSelection();
                          }} title="Select all visible" />
                      </th>
                      <th className="px-2 py-2 w-8 shrink-0" />
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap">
                        <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-foreground">Name <SortIcon col="name" /></button>
                      </th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground whitespace-nowrap w-16">Level</th>
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap">
                        <button onClick={() => handleSort("slot")} className="flex items-center gap-1 hover:text-foreground">Slot <SortIcon col="slot" /></button>
                      </th>
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleSort("studioLevel")} className="flex items-center gap-1 hover:text-foreground">Studio Lv <SortIcon col="studioLevel" /></button>
                          <span className="text-muted-foreground/40">/</span>
                          <button onClick={() => handleSort("intReq")} className="flex items-center gap-1 hover:text-foreground">INT Req <SortIcon col="intReq" /></button>
                        </div>
                      </th>
                      {STAT_ORDER.map((stat) => (
                        <th key={stat} className="text-center px-1.5 py-2 font-medium text-muted-foreground">
                          <button onClick={() => handleSort(stat)} className="flex flex-col items-center gap-0.5 hover:text-foreground w-full">
                            {statIcons[stat] ? <img src={statIcons[stat]} alt={stat} className="w-4 h-4 object-contain mx-auto" title={stat} /> : <span className="text-[10px] whitespace-nowrap">{stat}</span>}
                            <SortIcon col={stat} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && <tr><td colSpan={colCount} className="text-center py-10 text-sm text-muted-foreground">No equipment found.</td></tr>}
                    {filtered.map((item) => {
                      const isExpanded = expandedItem === item.uid;
                      const level = getItemLevel(item.name);
                      const itemSlot = getItemSlot(item.name);
                      const isSelected = selectedUids.has(item.uid);
                      return (
                        <Fragment key={item.uid}>
                          <tr className={`border-b border-border transition-colors ${isExpanded ? "bg-primary/5" : isSelected ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.uid)} className="rounded border-border cursor-pointer" />
                            </td>
                            <td className="px-2 py-1.5">
                              <IconUpload iconKey={`equip:${item.name}`} icons={equipIcons}
                                onSave={(icons) => handleEquipIcons(icons, item.name)} size={26} />
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <button onClick={() => setExpandedItem(isExpanded ? null : item.uid)}
                                className="flex items-center gap-1.5 font-medium text-left hover:text-primary transition-colors group" title="Click to edit stats">
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />}
                                {item.name}
                              </button>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input type="number" min={1} max={99} value={level}
                                onChange={(e) => setItemLevel(item.name, parseInt(e.target.value) || 1)}
                                className="h-6 w-14 text-xs text-center px-1 mx-auto" />
                            </td>
                            <td className="px-2 py-1.5">
                              <select value={itemSlot} onChange={(e) => setItemSlot(item.name, e.target.value)}
                                className="h-6 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring w-24">
                                {SLOT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              {item.crafterStudioLevel === 0
                                ? <span className="text-destructive text-xs font-medium">Not craftable</span>
                                : <span className="text-xs"><strong>{item.crafterStudioLevel}</strong>{item.crafterIntelligence > 0 && <> / INT <strong>{item.crafterIntelligence}</strong></>}</span>}
                            </td>
                            {STAT_ORDER.map((stat) => {
                              const val = getItemStatVal(item, stat);
                              return <td key={stat} className={`px-1.5 py-1.5 text-center text-xs tabular-nums ${val === 0 ? "text-muted-foreground/30" : "font-medium text-foreground"}`}>{val > 0 ? val : "—"}</td>;
                            })}
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={colCount} className="bg-primary/5 border-b border-primary/20 px-4 py-3">
                                <p className="text-xs text-muted-foreground mb-2">
                                  Editing <strong className="text-foreground">{item.name}</strong> · <code className="bg-muted px-1 rounded">stat = Base + (Level − 1) × Inc</code>
                                  <span className="ml-2 text-primary">· Saved to everyone</span>
                                  {!userName && <span className="ml-2 text-amber-500">· You'll be asked for your name on first edit</span>}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2">
                                  {STAT_ORDER.map((stat) => {
                                    const base = getEffectiveStat(item, stat, "base", overrides);
                                    const inc = getEffectiveStat(item, stat, "inc", overrides);
                                    return (
                                      <div key={stat} className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                                          {statIcons[stat] && <img src={statIcons[stat]} alt={stat} className="w-3 h-3 object-contain" />}{stat}
                                        </span>
                                        <div className="flex gap-1">
                                          <div className="flex-1">
                                            <span className="text-[9px] text-muted-foreground/70">Base</span>
                                            <Input type="number" value={base}
                                              onChange={(e) => setOverride(item.name, stat, "base", Number(e.target.value) || 0)}
                                              className="h-6 text-xs px-1.5 w-full" />
                                          </div>
                                          <div className="flex-1">
                                            <span className="text-[9px] text-muted-foreground/70">+/Lv</span>
                                            <Input type="number" value={inc} step={0.1}
                                              onChange={(e) => setOverride(item.name, stat, "inc", Number(e.target.value) || 0)}
                                              className="h-6 text-xs px-1.5 w-full" />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
                <span>{filtered.length} / {items.length} items shown · click item name to edit stats</span>
                {selectedUids.size > 0 && !compareMode && (
                  <button onClick={() => setCompareMode(true)} className="text-primary font-medium hover:underline">
                    Compare {selectedUids.size} selected →
                  </button>
                )}
              </div>
            </Card>

            {/* Character Builder */}
            <Card className="shadow-sm mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Character Builder</CardTitle>
                <p className="text-xs text-muted-foreground">Your personal loadout — saved only for you. Each slot shows only items assigned to it.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                  {CHAR_SLOTS.map((slot) => {
                    const entry = loadout[slot];
                    const item = items.find((i) => i.name === entry.itemName);
                    const eligibleItems = items.filter((i) => { const a = getItemSlot(i.name); return a === slot || a === "—"; });
                    return (
                      <Card key={slot} className="border-border shadow-none">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{slot}</span>
                            {entry.itemName && <button onClick={() => setLoadoutEntry(slot, { itemName: "" })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>}
                          </div>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-2">
                          {entry.itemName && equipIcons[`equip:${entry.itemName}`] && (
                            <img src={equipIcons[`equip:${entry.itemName}`]} alt={entry.itemName} className="w-10 h-10 object-contain rounded mx-auto" />
                          )}
                          <select value={entry.itemName} onChange={(e) => setLoadoutEntry(slot, { itemName: e.target.value })}
                            className="w-full h-7 text-xs rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="">— none —</option>
                            {eligibleItems.map((i) => <option key={i.uid} value={i.name}>{i.name}</option>)}
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
                            <div className="text-[10px] text-muted-foreground space-y-0.5 mt-1">
                              {STAT_ORDER.filter((s) => statAtLevel(getEffectiveStat(item, s, "base", overrides), getEffectiveStat(item, s, "inc", overrides), entry.level) > 0).map((s) => {
                                const b = getEffectiveStat(item, s, "base", overrides);
                                const inc = getEffectiveStat(item, s, "inc", overrides);
                                return (
                                  <div key={s} className="flex items-center justify-between">
                                    <span className="flex items-center gap-1">{statIcons[s] && <img src={statIcons[s]} alt={s} className="w-3 h-3 object-contain" />}{s}</span>
                                    <span className="font-medium text-foreground tabular-nums">{statAtLevel(b, inc, entry.level)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                <div className="rounded-lg bg-muted/50 border border-border px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Total Equipment Stats</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {STAT_ORDER.map((stat) => (
                      <div key={stat} className="flex items-center gap-1.5 text-sm">
                        {statIcons[stat] ? <img src={statIcons[stat]} alt={stat} className="w-4 h-4 object-contain" /> : <span className="text-xs text-muted-foreground">{stat}</span>}
                        <span className={`font-semibold tabular-nums ${totalStats[stat] === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>{totalStats[stat] || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Change History */}
            {showHistory && (
              <Card className="shadow-sm mb-6">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" />Change History</CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(false)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Every edit made to shared data — slots, stats, and icons.</p>
                </CardHeader>
                <CardContent className="pt-0">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No changes yet. Make a slot or stat edit and it'll appear here.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {history.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-3 text-sm">
                          <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${CHANGE_COLORS[entry.changeType] ?? "bg-muted-foreground"}`}>
                            {entry.userName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{entry.userName}</span>
                            <span className="text-muted-foreground"> — {entry.description}</span>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{relTime(entry.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <div className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>Data from Google Sheets · Kingdom Adventures</span>
          <Link href="/"><span className="hover:text-foreground transition-colors cursor-pointer">← Back to home</span></Link>
        </div>
      </div>
    </div>
  );
}
