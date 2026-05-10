import { useState, useMemo, useRef, useCallback, useEffect } from "react";
// For environment banner
const ENV_BANNER = import.meta.env.MODE?.toUpperCase?.() || (process.env.NODE_ENV?.toUpperCase?.() ?? "UNKNOWN");
const ENV_HOST = window?.location?.host || "?";
const ENV_BASE = import.meta.env.BASE_URL || "/";
import { useLocalFeature } from "@/hooks/sync/use-local-feature";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Trash2, Loader2, Camera,
  ChevronDown, ChevronRight, Package, X, Check, Pencil,
  Download, Copy, Info, RotateCcw, Crown, Sword, Shield, Gem,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedNumberInput } from "@/components/ui/themed-number-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { PageHeader } from "@/components/ka/page-header";
import { ToneBadge } from "@/components/ka/badges";
import { toPng } from "html-to-image";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { apiUrl } from "@/lib/api";
import { getEquipmentIcon } from "@/lib/equipment-icons";
import { simulateBatch, simulateDuel, type Combatant, type BattleResult, type BatchResult } from "@/lib/combat-simulator";
import { getJobProfile } from "@/game-data/job-profile";
import { KA_RANK_BADGE_CLASS } from "@/design-system/category-styles";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeaponValue = "can" | "weak" | "cannot";
type Skill = { name: string; studioLevel?: number; craftingIntelligence?: number; buyPrice?: number; sellPrice?: number; description?: string; weaponResistance?: string };
type JobStatEntry = { base: number; inc: number };
type Job = {
  generation: 1 | 2;
  ranks: Record<string, { stats: Record<string, JobStatEntry> }>;
  weaponEquip?: Partial<Record<string, WeaponValue>>;
  shield?: "can" | "cannot";
};
type EquipEntry = { name: string; level: number };
type Loadout = {
  id: string;
  name: string;
  jobName: string;
  rank: string;
  level?: number;          // legacy / fallback default level
  statLevels?: Record<string, number>; // per-stat levels (primary)
  equipment: EquipEntry[];
  skills: string[];
};
type BoxSetupKind = "kairo" | "wairo";
type BoxStatRuleMode = "level" | "value";
type BoxStatRule = { mode: BoxStatRuleMode; min?: number; max?: number };
type BoxSkillRule = { id: string; name: string; alternatives: string[] };
type BoxUnitRule = {
  id: string;
  label: string;
  anyJob: boolean;
  jobOptions: string[];
  recommendedJobs: string;
  stats: Record<string, BoxStatRule | undefined>;
  skillRules: BoxSkillRule[];
  recommendedGear: Record<string, string[] | undefined>;
  notes: string;
};
type BoxGridCell = { id: string; rule?: BoxUnitRule };
type BoxSetup = {
  id: BoxSetupKind;
  title: string;
  notes: string;
  rows: number;
  cells: BoxGridCell[];
  updatedAt?: number;
};
type BoxAttempt = Record<string, string>;
type SharedData = {
  jobs?: Record<string, Job>;
  skills?: Record<string, Skill>;
  overrides?: Record<string, Record<string, { base?: number; inc?: number }>>;
  slotAssignments?: Record<string, string>;
  equipIcons?: Record<string, string>;
  weaponTypes?: Record<string, string>;
  weaponCategories?: string[];
  pairs?: Array<{ id: string; jobA: string; jobB: string; children?: string[]; affinity?: string; affinityNum?: number }>;
  loadouts?: Loadout[];
  loadoutsUpdatedAt?: number | null;
  loadoutBoxSetups?: BoxSetup[];
  loadoutBoxSetupsUpdatedAt?: number | null;
};
type BoxSetupShare = { id: string; setup: BoxSetup; createdAt: number; updatedAt: number };

// ─── Constants ────────────────────────────────────────────────────────────────

// Canonical short stat keys used throughout
const STAT_KEYS = ["hp","mp","vig","atk","def","spd","lck","int","dex","gth","mov","hrt"] as const;
const STAT_LABEL: Record<string, string> = {
  hp:"HP", mp:"MP", vig:"Vig", atk:"Atk", def:"Def",
  spd:"Spd", lck:"Lck", int:"Int", dex:"Dex", gth:"Gth", mov:"Mov", hrt:"Hrt",
};
const STAT_FULL: Record<string, string> = {
  hp:"HP", mp:"MP", vig:"Vigor", atk:"Attack", def:"Defence",
  spd:"Speed", lck:"Luck", int:"Intelligence", dex:"Dexterity",
  gth:"Gather", mov:"Move", hrt:"Heart",
};
// Universal stat alias map — normalises any spelling/abbreviation to the canonical short key.
// All variants are lowercased before lookup.
const STAT_CANONICAL: Record<string, string> = {
  // HP
  hp:"hp",
  // MP
  mp:"mp",
  // Vigor
  vig:"vig", vigor:"vig",
  // Attack
  atk:"atk", att:"atk", attack:"atk",
  // Defence / Defense
  def:"def", defence:"def", defense:"def",
  // Speed
  spd:"spd", speed:"spd",
  // Luck
  lck:"lck", luck:"lck",
  // Intelligence
  int:"int", intel:"int", intelligence:"int",
  // Dexterity
  dex:"dex", dext:"dex", dexterity:"dex",
  // Gather
  gth:"gth", gather:"gth",
  // Move / Movement
  mov:"mov", move:"mov", movement:"mov",
  // Heart
  hrt:"hrt", heart:"hrt",
};

const EQUIP_SLOTS = [
  { slot: "Head",      Icon: Crown   },
  { slot: "Weapon",    Icon: Sword   },
  { slot: "Shield",    Icon: Shield  },
  { slot: "Armor",     Icon: Package },
  { slot: "Accessory", Icon: Gem     },
] as const;
type EquipSlot = typeof EQUIP_SLOTS[number]["slot"];

const RANK_COLORS: Record<string, string> = {
  ...KA_RANK_BADGE_CLASS,
};

function generateId() { return Math.random().toString(36).slice(2, 9); }

function statAtLevel(base: number, inc: number, level: number): number {
  return Math.round(base + (level - 1) * inc);
}

function commitOnEnter(e: React.KeyboardEvent<HTMLInputElement>, commit: () => void) {
  if (e.key === "Enter") {
    commit();
    e.currentTarget.blur();
  }
}

// ─── Weapon proficiency helpers ───────────────────────────────────────────────

function getWeaponProficiency(
  job: Job | undefined,
  equipName: string,
  slot: string,
  weaponTypes: Record<string, string> | undefined
): { weaponType: string | null; prof: WeaponValue | null } {
  if (!job || !equipName) return { weaponType: null, prof: null };
  if (slot === "Shield") {
    const prof = job.weaponEquip?.["Shield"] ?? (job.shield === "can" ? "can" : job.shield === "cannot" ? "cannot" : null);
    return { weaponType: "Shield", prof };
  }
  if (slot !== "Weapon") return { weaponType: null, prof: null };
  const wt = weaponTypes?.[equipName] ?? null;
  if (!wt || wt === "Tool") return { weaponType: wt, prof: null };
  const prof = job.weaponEquip?.[wt] ?? null;
  return { weaponType: wt, prof };
}

function findResistanceSkill(
  skills: Record<string, Skill> | undefined,
  weaponType: string | null
): Skill | null {
  if (!skills || !weaponType) return null;
  return Object.values(skills).find((s) => s.weaponResistance === weaponType) ?? null;
}

type EquipRuleState = {
  slot: string | null;
  weaponType: string | null;
  prof: WeaponValue | null;
  resistanceSkill: Skill | null;
  hasResistanceSkillEquipped: boolean;
  appliesPenalty: boolean;
  blocked: boolean;
};

function getEquipRuleState(loadout: Loadout, data: SharedData, equipName: string): EquipRuleState {
  const slot = data.slotAssignments?.[equipName] ?? null;
  const profile = getJobProfile(data, loadout.jobName);
  const weaponType = slot === "Shield" ? "Shield" : data.weaponTypes?.[equipName] ?? null;
  const prof =
    slot === "Shield"
      ? profile?.equipmentAccess.shield ?? null
      : slot === "Weapon" && weaponType && weaponType !== "Tool"
        ? profile?.equipmentAccess.weapons[weaponType] ?? null
        : null;
  const resistanceSkill = findResistanceSkill(data.skills, weaponType);
  const hasResistanceSkillEquipped = !!resistanceSkill && loadout.skills.includes(resistanceSkill.name);
  const blocked = prof === "cannot";
  const appliesPenalty = prof === "weak" && !hasResistanceSkillEquipped;
  return { slot, weaponType, prof, resistanceSkill, hasResistanceSkillEquipped, appliesPenalty, blocked };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: () => fetchSharedWithFallback<SharedData>(apiUrl("/shared")),
    staleTime: 15000,
    refetchInterval: 15000,
  });
}


function useLoadouts(sharedData: SharedData | undefined) {
  const [loadouts, setLoadouts] = useLocalFeature<Loadout[]>("ka_loadouts", []);
  // Ref that always mirrors loadouts — used inside effects to avoid stale closures
  const loadoutsRef = useRef(loadouts);
  useEffect(() => { loadoutsRef.current = loadouts; }, [loadouts]);
  // Sync guards (same pattern as the pairs sync in marriage-matcher)
  const loadoutsHydratedRef = useRef(false);
  const skipNextLoadoutsEchoRef = useRef(false);
  const loadoutsPutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydration: on first API data load, pull loadouts from server.
  // Rule: if loadoutsUpdatedAt is non-null the server has been explicitly saved to
  // and is authoritative — even if loadouts is empty (means user deleted everything).
  // Only push local state when the server has NEVER been initialized (loadoutsUpdatedAt === null).
  useEffect(() => {
    if (loadoutsHydratedRef.current) return;
    if (!sharedData) return; // still loading
    loadoutsHydratedRef.current = true;
    if (sharedData.loadoutsUpdatedAt != null) {
      // Server has been written before — always take its state, even if empty
      skipNextLoadoutsEchoRef.current = true;
      setLoadouts(sharedData.loadouts ?? []);
    } else if (loadoutsRef.current.length > 0) {
      // Server has never been synced — push local state as the initial seed
      fetch(apiUrl("/loadouts"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: loadoutsRef.current }),
      }).catch(() => {});
    }
  }, [sharedData, setLoadouts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced PUT: push loadouts to server on every user change (after hydration)
  useEffect(() => {
    if (!loadoutsHydratedRef.current) return;
    if (skipNextLoadoutsEchoRef.current) {
      skipNextLoadoutsEchoRef.current = false;
      return;
    }
    if (loadoutsPutTimerRef.current) clearTimeout(loadoutsPutTimerRef.current);
    loadoutsPutTimerRef.current = setTimeout(() => {
      fetch(apiUrl("/loadouts"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: loadouts }),
      }).catch(() => {});
    }, 500);
    return () => {
      if (loadoutsPutTimerRef.current) clearTimeout(loadoutsPutTimerRef.current);
    };
  }, [loadouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((next: Loadout[]) => {
    setLoadouts(next);
  }, [setLoadouts]);
  return { loadouts, save };
}

function usePrivateLoadouts() {
  const [loadouts, setLoadouts] = useLocalFeature<Loadout[]>("ka_loadouts", []);

  const save = useCallback((next: Loadout[]) => {
    setLoadouts(next);
  }, [setLoadouts]);

  return { loadouts, save };
}

function createEmptyBoxSetup(id: BoxSetupKind, title: string): BoxSetup {
  const rows = 2;
  return {
    id,
    title,
    notes: "",
    rows,
    cells: Array.from({ length: rows * 5 }, (_, index) => ({ id: `${id}-${index}` })),
  };
}

const DEFAULT_BOX_SETUPS: BoxSetup[] = [
  createEmptyBoxSetup("kairo", "Multi Box Kairo Setup"),
  createEmptyBoxSetup("wairo", "Multi Box Wairo Setup"),
];

function normalizeBoxSetups(value: unknown): BoxSetup[] {
  const incoming = Array.isArray(value) ? value : [];
  return DEFAULT_BOX_SETUPS.map((fallback) => {
    const found = incoming.find((item) => item && typeof item === "object" && (item as Partial<BoxSetup>).id === fallback.id) as Partial<BoxSetup> | undefined;
    const rows = Math.max(1, Math.min(12, Number(found?.rows) || fallback.rows));
    const cells = Array.from({ length: rows * 5 }, (_, index) => {
      const existing = found?.cells?.[index];
      return existing && typeof existing === "object" ? { id: existing.id || `${fallback.id}-${index}`, rule: existing.rule } : { id: `${fallback.id}-${index}` };
    });
    return {
      ...fallback,
      ...found,
      title: fallback.title,
      rows,
      cells,
      notes: typeof found?.notes === "string" ? found.notes : "",
    };
  });
}

function useCommunityBoxSetups(sharedData: SharedData | undefined) {
  const [setups, setSetups] = useLocalFeature<BoxSetup[]>("ka_loadout_box_setups", DEFAULT_BOX_SETUPS);
  const hydratedRef = useRef(false);
  const skipNextEchoRef = useRef(false);
  const putTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hydratedRef.current || !sharedData) return;
    hydratedRef.current = true;
    skipNextEchoRef.current = true;
    setSetups(normalizeBoxSetups(sharedData.loadoutBoxSetups));
  }, [sharedData, setSetups]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipNextEchoRef.current) {
      skipNextEchoRef.current = false;
      return;
    }
    if (putTimerRef.current) clearTimeout(putTimerRef.current);
    putTimerRef.current = setTimeout(() => {
      fetch(apiUrl("/loadout-box-setups"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: normalizeBoxSetups(setups) }),
      }).catch(() => {});
    }, 500);
    return () => {
      if (putTimerRef.current) clearTimeout(putTimerRef.current);
    };
  }, [setups]);

  const save = useCallback((next: BoxSetup[]) => setSetups(normalizeBoxSetups(next)), [setSetups]);
  return { setups: normalizeBoxSetups(setups), save };
}

// ─── Stat Calculators ─────────────────────────────────────────────────────────

function getStatLevel(loadout: Loadout, k: string): number {
  return loadout.statLevels?.[k] ?? loadout.level ?? 1;
}

function normStat(raw: string): string {
  return STAT_CANONICAL[raw.toLowerCase()] ?? raw.toLowerCase();
}

function calcJobStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const out: Record<string, number> = {};
  const job = data.jobs?.[loadout.jobName];
  if (job && loadout.rank) {
    const rankStats = job.ranks[loadout.rank]?.stats ?? {};
    for (const [stat, entry] of Object.entries(rankStats)) {
      const k = normStat(stat);
      out[k] = statAtLevel(entry.base, entry.inc, getStatLevel(loadout, k));
    }
  }
  return out;
}

function calcEquipStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const out: Record<string, number> = {};
  const overrides = data.overrides ?? {};
  for (const { name, level } of loadout.equipment) {
    const rule = getEquipRuleState(loadout, data, name);
    if (rule.blocked) continue;
    const multiplier = rule.appliesPenalty ? 0.5 : 1;
    const statOverrides = overrides[name] ?? {};
    for (const [stat, entry] of Object.entries(statOverrides)) {
      const k = normStat(stat);
      const b = entry.base ?? 0;
      const i = entry.inc ?? 0;
      if (b || i) {
        const total = statAtLevel(b, i, level);
        out[k] = (out[k] ?? 0) + Math.floor(total * multiplier);
      }
    }
  }
  return out;
}

function calcStats(loadout: Loadout, data: SharedData): Record<string, number> {
  const job = calcJobStats(loadout, data);
  const equip = calcEquipStats(loadout, data);
  const total = { ...job };
  for (const [k, v] of Object.entries(equip)) total[k] = (total[k] ?? 0) + v;
  return total;
}

type CombatSourceMode = "manual" | "loadout";

function formatNum(v: number | null | undefined) {
  return v == null ? "-" : v.toLocaleString();
}

function formatPct(part: number, total: number) {
  if (total <= 0) return "0.0%";
  return `${((part * 100) / total).toFixed(1)}%`;
}

function ordinalWord(value: number) {
  const words = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  return words[value - 1] ?? `${value}th`;
}

function attackOutcomeText(round: BattleResult["rounds"][number]) {
  if (!round.result.hit) return "missed";
  return `dealt ${formatNum(round.result.damage)} damage`;
}

const COMBAT_SIDE_STYLE = {
  a: {
    row: "border-l-4 border-l-sky-400 bg-sky-50/25 dark:border-l-sky-500 dark:bg-sky-950/10",
    chip: "border-sky-300/70 bg-sky-50/30 text-sky-900 dark:border-sky-700 dark:bg-sky-950/15 dark:text-sky-100",
    label: "text-sky-800 dark:text-sky-200",
  },
  b: {
    row: "border-l-4 border-l-rose-300 bg-rose-50/20 dark:border-l-rose-500/80 dark:bg-rose-950/10",
    chip: "border-rose-300/60 bg-rose-50/25 text-rose-900 dark:border-rose-800/80 dark:bg-rose-950/15 dark:text-rose-100",
    label: "text-rose-700 dark:text-rose-200",
  },
} as const;

function baseManualCombatant(name: string): Combatant {
  return {
    name,
    maxHp: 1200,
    atk: 220,
    def: 110,
    spd: 120,
    dex: 110,
    lck: 90,
    int: 80,
    weaponAdvantage: false,
    action: { type: "normal", value: 0 },
  };
}

function loadoutToCombatant(loadout: Loadout, data: SharedData): Combatant {
  const stats = calcStats(loadout, data);
  return {
    name: loadout.name || "Loadout",
    maxHp: Math.max(1, stats.hp ?? 1),
    atk: stats.atk ?? 0,
    def: stats.def ?? 0,
    spd: stats.spd ?? 0,
    dex: stats.dex ?? 0,
    lck: stats.lck ?? 0,
    int: stats.int ?? 0,
    weaponAdvantage: false,
    action: { type: "normal", value: 0 },
  };
}

function LoadoutCombatTool({ loadouts, data }: { loadouts: Loadout[]; data: SharedData }) {
  const [aName, setAName] = useState("Attacker A");
  const [bName, setBName] = useState("Attacker B");
  const [aMode, setAMode] = useState<CombatSourceMode>("manual");
  const [bMode, setBMode] = useState<CombatSourceMode>("manual");
  const [aManual, setAManual] = useState<Combatant>(() => baseManualCombatant("Attacker A"));
  const [bManual, setBManual] = useState<Combatant>(() => baseManualCombatant("Attacker B"));
  const [aLoadoutId, setALoadoutId] = useState<string>(loadouts[0]?.id ?? "");
  const [bLoadoutId, setBLoadoutId] = useState<string>(loadouts[1]?.id ?? loadouts[0]?.id ?? "");
  const [batchCount, setBatchCount] = useState(1000);
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [batch, setBatch] = useState<BatchResult | null>(null);

  const aImported = useMemo(() => loadouts.find((l) => l.id === aLoadoutId) ?? null, [loadouts, aLoadoutId]);
  const bImported = useMemo(() => loadouts.find((l) => l.id === bLoadoutId) ?? null, [loadouts, bLoadoutId]);

  const resolvedA = useMemo(() => {
    if (aMode === "manual") {
      return { ...aManual, name: aName.trim() || aManual.name || "Attacker A" };
    }
    if (!aImported) return null;
    return { ...loadoutToCombatant(aImported, data), name: aName.trim() || aImported.name || "Attacker A" };
  }, [aMode, aManual, aImported, data, aName]);

  const resolvedB = useMemo(() => {
    if (bMode === "manual") {
      return { ...bManual, name: bName.trim() || bManual.name || "Attacker B" };
    }
    if (!bImported) return null;
    return { ...loadoutToCombatant(bImported, data), name: bName.trim() || bImported.name || "Attacker B" };
  }, [bMode, bManual, bImported, data, bName]);

  const run = () => {
    if (!resolvedA || !resolvedB) return;
    setBattle(simulateDuel(resolvedA, resolvedB));
    setBatch(simulateBatch(resolvedA, resolvedB, Math.max(1, batchCount)));
  };

  const battleSummary = useMemo(() => {
    if (!battle || !resolvedA || !resolvedB) return null;
    let aAttacks = 0;
    let bAttacks = 0;
    const rows = battle.rounds.map((round, index) => {
      const isA = round.attacker === resolvedA.name;
      const attackNumber = isA ? ++aAttacks : ++bAttacks;
      return {
        id: `${round.attacker}-${index}`,
        side: (isA ? "a" : "b") as keyof typeof COMBAT_SIDE_STYLE,
        label: `${round.attacker} ${ordinalWord(attackNumber)} attack`,
        text: `${attackOutcomeText(round)}. ${round.defender} HP after: ${formatNum(round.defenderHpAfter)}.`,
        crit: round.result.crit,
        meta: `${round.result.attackType}${round.result.note ? ` - ${round.result.note}` : ""}`,
      };
    });
    return { aAttacks, bAttacks, rows };
  }, [battle, resolvedA, resolvedB]);

  const renderManualEditor = (c: Combatant, setC: (next: Combatant) => void) => (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">HP</span>
        <ThemedNumberInput value={c.maxHp} min={1} onValueChange={(value) => setC({ ...c, maxHp: Math.max(1, value) })} className="h-8" ariaLabel="HP" />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">ATK</span>
        <ThemedNumberInput value={c.atk} min={0} onValueChange={(value) => setC({ ...c, atk: value })} className="h-8" ariaLabel="ATK" />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">DEF</span>
        <ThemedNumberInput value={c.def} min={0} onValueChange={(value) => setC({ ...c, def: value })} className="h-8" ariaLabel="DEF" />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">SPD</span>
        <ThemedNumberInput value={c.spd} min={0} onValueChange={(value) => setC({ ...c, spd: value })} className="h-8" ariaLabel="SPD" />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">DEX</span>
        <ThemedNumberInput value={c.dex} min={0} onValueChange={(value) => setC({ ...c, dex: value })} className="h-8" ariaLabel="DEX" />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">LCK</span>
        <ThemedNumberInput value={c.lck} min={0} onValueChange={(value) => setC({ ...c, lck: value })} className="h-8" ariaLabel="LCK" />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">INT</span>
        <ThemedNumberInput value={c.int} min={0} onValueChange={(value) => setC({ ...c, int: value })} className="h-8" ariaLabel="INT" />
      </label>
      <label className="text-xs text-muted-foreground col-span-2 flex items-center gap-2">
        <input type="checkbox" checked={c.weaponAdvantage} onChange={(e) => setC({ ...c, weaponAdvantage: e.currentTarget.checked })} />
        Weapon advantage (x1.5)
      </label>
    </div>
  );

  const renderImportedPreview = (selectedId: string, setSelectedId: (id: string) => void, c: Combatant | null) => (
    <div className="space-y-2">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">Select loadout...</option>
        {loadouts.map((lo) => <option key={lo.id} value={lo.id}>{lo.name || "Unnamed"}</option>)}
      </select>
      {c && (
        <div className="text-xs text-muted-foreground border border-border rounded-md p-2 bg-muted/20">
          HP {formatNum(c.maxHp)} · ATK {formatNum(c.atk)} · DEF {formatNum(c.def)} · SPD {formatNum(c.spd)} · DEX {formatNum(c.dex)} · LCK {formatNum(c.lck)} · INT {formatNum(c.int)}
        </div>
      )}
    </div>
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Combat Sandbox (Normal Attack)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Attacker A</div>
            <Input value={aName} onChange={(e) => setAName(e.target.value)} className="h-8 text-xs" placeholder="Display name" />
            <select value={aMode} onChange={(e) => setAMode(e.target.value as CombatSourceMode)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
              <option value="manual">Manual input</option>
              <option value="loadout">Import from loadouts</option>
            </select>
            {aMode === "manual" ? renderManualEditor(aManual, setAManual) : renderImportedPreview(aLoadoutId, setALoadoutId, resolvedA)}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Attacker B</div>
            <Input value={bName} onChange={(e) => setBName(e.target.value)} className="h-8 text-xs" placeholder="Display name" />
            <select value={bMode} onChange={(e) => setBMode(e.target.value as CombatSourceMode)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
              <option value="manual">Manual input</option>
              <option value="loadout">Import from loadouts</option>
            </select>
            {bMode === "manual" ? renderManualEditor(bManual, setBManual) : renderImportedPreview(bLoadoutId, setBLoadoutId, resolvedB)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemedNumberInput value={batchCount} min={1} onValueChange={(value) => setBatchCount(Math.max(1, value))} className="h-8 w-32" />
          <span className="text-xs text-muted-foreground">batch size</span>
          <Button size="sm" onClick={run}>Run simulation</Button>
        </div>

        {(battle || batch) && (
          <div className="space-y-3 text-sm">
            {batch && (
              <div className="rounded-md border border-border bg-transparent px-3 py-2 text-xs">
                Batch outcomes: <strong>{resolvedA?.name ?? "A"}</strong> ahead in {formatNum(batch.leftWins)} ({formatPct(batch.leftWins, batch.total)}), <strong>{resolvedB?.name ?? "B"}</strong> ahead in {formatNum(batch.rightWins)} ({formatPct(batch.rightWins, batch.total)}), draws {formatNum(batch.draws)} ({formatPct(batch.draws, batch.total)}) out of {formatNum(batch.total)}.
              </div>
            )}
            {battle && (
              <div className="rounded-md border border-border bg-background">
                <div className="space-y-3 border-b border-border bg-transparent p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Duel summary</div>
                      <div className="text-xs text-muted-foreground">
                        {battle.winner ? `${battle.winner} standing` : "Draw"} after {battle.rounds.length} strikes
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md border border-border bg-transparent px-2 py-1">{resolvedA?.name ?? "A"}: {formatNum(battle.leftHp)} HP left</span>
                      <span className="rounded-md border border-border bg-transparent px-2 py-1">{resolvedB?.name ?? "B"}: {formatNum(battle.rightHp)} HP left</span>
                    </div>
                  </div>
                  {battleSummary && (
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <div className={`rounded-md border px-2 py-1 ${COMBAT_SIDE_STYLE.a.chip}`}>
                        <strong>{resolvedA?.name ?? "A"}</strong>: {battleSummary.aAttacks} attacks
                      </div>
                      <div className={`rounded-md border px-2 py-1 ${COMBAT_SIDE_STYLE.b.chip}`}>
                        <strong>{resolvedB?.name ?? "B"}</strong>: {battleSummary.bAttacks} attacks
                      </div>
                    </div>
                  )}
                </div>
                {battleSummary && (
                  <div className="divide-y divide-border">
                    {battleSummary.rows.map((row) => (
                      <div key={row.id} className={`grid gap-1 px-3 py-2 text-xs sm:grid-cols-[180px_1fr] sm:items-start ${COMBAT_SIDE_STYLE[row.side].row}`}>
                        <div className={`font-semibold ${COMBAT_SIDE_STYLE[row.side].label}`}>{row.label}</div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-foreground">
                            <span>{row.text}</span>
                            {row.crit ? <span className="font-semibold text-orange-500">💥 Crit</span> : null}
                          </div>
                          <div className="text-muted-foreground">{row.meta}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Screenshot Card (portal-rendered) ───────────────────────────────────────

function createBoxUnitRule(): BoxUnitRule {
  return {
    id: generateId(),
    label: "Required unit",
    anyJob: false,
    jobOptions: [],
    recommendedJobs: "",
    stats: {},
    skillRules: [],
    recommendedGear: {},
    notes: "",
  };
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatList(value: string[]) {
  return value.join(", ");
}

function addUnique(value: string[], next: string) {
  if (!next || value.includes(next)) return value;
  return [...value, next];
}

function removeValue(value: string[], target: string) {
  return value.filter((item) => item !== target);
}

function statRulePasses(loadout: Loadout, stats: Record<string, number>, stat: string, rule: BoxStatRule | undefined) {
  if (!rule) return true;
  const value = rule.mode === "level" ? getStatLevel(loadout, stat) : (stats[stat] ?? 0);
  if (rule.min != null && value < rule.min) return false;
  if (rule.max != null && value > rule.max) return false;
  return true;
}

function unitMatchesRule(loadout: Loadout | null, rule: BoxUnitRule | undefined, data: SharedData) {
  if (!rule) return "empty";
  if (!loadout) return "missing";
  const stats = calcStats(loadout, data);
  if (!rule.anyJob && rule.jobOptions.length > 0 && !rule.jobOptions.includes(loadout.jobName)) return "fail";
  for (const stat of STAT_KEYS) {
    if (!statRulePasses(loadout, stats, stat, rule.stats[stat])) return "fail";
  }
  for (const skillRule of rule.skillRules) {
    const allowed = [skillRule.name, ...skillRule.alternatives].filter(Boolean);
    if (allowed.length > 0 && !allowed.some((skill) => loadout.skills.includes(skill))) return "fail";
  }
  return "pass";
}

function BoxUnitRuleEditor({ rule, data, onChange }: { rule: BoxUnitRule; data: SharedData; onChange: (next: BoxUnitRule) => void }) {
  const jobs = Object.keys(data.jobs ?? {}).sort();
  const skills = Object.keys(data.skills ?? {}).sort();
  const equipBySlot = useMemo(() => {
    const slotMap = data.slotAssignments ?? {};
    const out: Record<string, string[]> = {};
    for (const { slot } of EQUIP_SLOTS) {
      out[slot] = Object.entries(slotMap).filter(([, itemSlot]) => itemSlot === slot).map(([name]) => name).sort();
    }
    return out;
  }, [data.slotAssignments]);
  const setStatRule = (stat: string, next: BoxStatRule | undefined) => onChange({ ...rule, stats: { ...rule.stats, [stat]: next } });

  // --- ENVIRONMENT BANNER ---
  // Only show once at the top of the page
  useEffect(() => {
    const banner = document.getElementById("env-banner-ka-loadout");
    if (banner) banner.style.display = "block";
    return () => { if (banner) banner.style.display = "none"; };
  }, []);

  return (
    <div className="space-y-4">
      {/* ENVIRONMENT BANNER */}
      <div id="env-banner-ka-loadout" style={{display:'block',marginBottom:8,padding:8,background:'#22263a',color:'#b5baff',borderRadius:6,fontSize:13,fontWeight:600,letterSpacing:1}}>
        ENV: {ENV_BANNER} &nbsp;|&nbsp; HOST: {ENV_HOST} &nbsp;|&nbsp; BASE: {ENV_BASE}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Slot label</span>
          <Input value={rule.label} onChange={(e) => onChange({ ...rule, label: e.target.value })} className="h-8 text-xs" />
        </label>
        <label className="flex items-center gap-2 pt-5 text-xs text-muted-foreground">
          <input type="checkbox" checked={rule.anyJob} onChange={(e) => onChange({ ...rule, anyJob: e.currentTarget.checked })} />
          Any job can satisfy this position
        </label>
      </div>

      {!rule.anyJob && (
        <div className="space-y-2 text-xs">
          <span className="font-medium text-muted-foreground">Allowed jobs or classes</span>
          <SearchableSelect
            value=""
            clearOnSelect
            onChange={(value) => onChange({ ...rule, jobOptions: addUnique(rule.jobOptions, value) })}
            options={jobs.filter((job) => !rule.jobOptions.includes(job)).map((job) => ({ value: job, label: job }))}
            placeholder="Add allowed job"
            triggerClassName="h-8 text-xs"
          />
          <div className="flex min-h-6 flex-wrap gap-1">
            {rule.jobOptions.map((job) => (
              <ToneBadge key={job} category="job" className="gap-1 px-2 py-0.5 text-xs">
                {job}
                <button onClick={() => onChange({ ...rule, jobOptions: removeValue(rule.jobOptions, job) })} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </ToneBadge>
            ))}
            {rule.jobOptions.length === 0 && <span className="text-xs text-muted-foreground/60">No job restriction yet.</span>}
          </div>
        </div>
      )}

      <label className="block space-y-1 text-xs">
        <span className="font-medium text-muted-foreground">Recommended jobs</span>
        <Input value={rule.recommendedJobs} onChange={(e) => onChange({ ...rule, recommendedJobs: e.target.value })} placeholder="Optional notes about rank, stat scaling, or role" className="h-8 text-xs" />
      </label>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Must-match stat rules</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {STAT_KEYS.map((stat) => {
            const statRule = rule.stats[stat];
            return (
              <div key={stat} className={`rounded-md border border-border bg-muted/15 p-2 ${statRule ? 'ring-2 ring-primary/60' : ''}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{STAT_LABEL[stat]}</span>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={!!statRule} onChange={(e) => setStatRule(stat, e.currentTarget.checked ? { mode: "value" } : undefined)} />
                    Rule
                  </label>
                </div>
                {statRule && (
                  <div className="grid grid-cols-[88px_1fr_1fr] gap-1.5 items-center">
                    <select value={statRule.mode} onChange={(e) => setStatRule(stat, { ...statRule, mode: e.target.value as BoxStatRuleMode })} className="h-7 rounded-md border border-input bg-background px-1 text-[11px]">
                      <option value="value">Value</option>
                      <option value="level">Level</option>
                    </select>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground pl-1">Min</span>
                      <ThemedNumberInput value={statRule.min ?? 0} min={0} onValueChange={(value) => setStatRule(stat, { ...statRule, min: value || undefined })} className="h-7 text-xs" ariaLabel={`${stat} min`} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground pl-1">Max</span>
                      <ThemedNumberInput value={statRule.max ?? 0} min={0} onValueChange={(value) => setStatRule(stat, { ...statRule, max: value || undefined })} className="h-7 text-xs" ariaLabel={`${stat} max`} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Required skill order</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange({ ...rule, skillRules: [...rule.skillRules, { id: generateId(), name: "", alternatives: [] }] })}>
            <Plus className="h-3 w-3" />Skill
          </Button>
        </div>
        <div className="space-y-2">
          {rule.skillRules.map((skillRule, index) => (
            <div key={skillRule.id} className="grid gap-2 rounded-md border border-border bg-muted/15 p-2 sm:grid-cols-[76px_1fr_1fr_28px]">
              <div className="pt-2 text-xs font-semibold text-muted-foreground">Skill {index + 1}</div>
              <SearchableSelect value={skillRule.name} onChange={(value) => onChange({ ...rule, skillRules: rule.skillRules.map((item) => item.id === skillRule.id ? { ...item, name: value } : item) })} options={skills.map((skill) => ({ value: skill, label: skill }))} placeholder="Primary skill" triggerClassName="h-8 text-xs" />
              <div className="space-y-1">
                <SearchableSelect
                  value=""
                  clearOnSelect
                  onChange={(value) => onChange({ ...rule, skillRules: rule.skillRules.map((item) => item.id === skillRule.id ? { ...item, alternatives: addUnique(item.alternatives, value) } : item) })}
                  options={skills.filter((skill) => !skillRule.alternatives.includes(skill) && skill !== skillRule.name).map((skill) => ({ value: skill, label: skill }))}
                  placeholder="Add replacement"
                  triggerClassName="h-8 text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {skillRule.alternatives.map((skill) => (
                    <ToneBadge key={skill} category="skill" className="gap-1 px-1.5 py-0.5 text-[10px]">
                      {skill}
                      <button onClick={() => onChange({ ...rule, skillRules: rule.skillRules.map((item) => item.id === skillRule.id ? { ...item, alternatives: removeValue(item.alternatives, skill) } : item) })} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </ToneBadge>
                  ))}
                </div>
              </div>
              <button onClick={() => onChange({ ...rule, skillRules: rule.skillRules.filter((item) => item.id !== skillRule.id) })} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recommended gear</p>
        <div className="grid gap-2 sm:grid-cols-5">
          {EQUIP_SLOTS.map(({ slot }) => (
            <div key={slot} className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">{slot}</span>
              <SearchableSelect
                value=""
                clearOnSelect
                onChange={(value) => onChange({ ...rule, recommendedGear: { ...rule.recommendedGear, [slot]: addUnique(Array.isArray(rule.recommendedGear[slot]) ? rule.recommendedGear[slot] : [], value) } })}
                options={(equipBySlot[slot] ?? []).filter((name) => !(rule.recommendedGear[slot] ?? []).includes(name)).map((name) => ({ value: name, label: name }))}
                placeholder="Add item"
                triggerClassName="h-8 text-[10px]"
              />
              <div className="flex min-h-5 flex-wrap gap-1">
                {(Array.isArray(rule.recommendedGear[slot]) ? rule.recommendedGear[slot] : []).map((item) => (
                  <ToneBadge key={item} category="equipment" className="gap-1 px-1.5 py-0.5 text-[10px]">
                    {item}
                    <button onClick={() => onChange({ ...rule, recommendedGear: { ...rule.recommendedGear, [slot]: removeValue(Array.isArray(rule.recommendedGear[slot]) ? rule.recommendedGear[slot] : [], item) } })} className="hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </ToneBadge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="font-medium text-muted-foreground">Notes</span>
        <textarea value={rule.notes} onChange={(e) => onChange({ ...rule, notes: e.target.value })} className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs" />
      </label>
    </div>
  );
}

function BoxSetupCard({
  setup,
  loadouts,
  data,
  onChange,
  onCreateLoadout,
  readOnly = false,
}: {
  setup: BoxSetup;
  loadouts: Loadout[];
  data: SharedData;
  onChange: (next: BoxSetup) => void;
  onCreateLoadout: () => string;
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<"rules" | "try">("rules");
  const [openCellIndex, setOpenCellIndex] = useState<number | null>(null);
  const [attempt, setAttempt] = useLocalFeature<BoxAttempt>(`ka_box_attempt_${setup.id}`, {});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState<null | "working" | "ok" | "error">(null);
  const openCell = openCellIndex == null ? null : setup.cells[openCellIndex] ?? null;
  const openRule = openCell?.rule ?? createBoxUnitRule();

  const updateCell = (index: number, cell: BoxGridCell) => {
    if (readOnly) return;
    onChange({ ...setup, cells: setup.cells.map((item, i) => i === index ? cell : item), updatedAt: Date.now() });
  };
  const setRows = (rows: number) => {
    if (readOnly) return;
    const nextRows = Math.max(1, Math.min(12, rows));
    const cells = Array.from({ length: nextRows * 5 }, (_, index) => setup.cells[index] ?? { id: `${setup.id}-${index}` });
    onChange({ ...setup, rows: nextRows, cells, updatedAt: Date.now() });
  };
  const moveCell = (from: number, to: number) => {
    if (from === to) return;
    if (readOnly && mode === "rules") return;
    if (mode === "rules") {
      const cells = [...setup.cells];
      const [moved] = cells.splice(from, 1);
      cells.splice(to, 0, moved);
      onChange({ ...setup, cells, updatedAt: Date.now() });
      return;
    }
    const fromId = setup.cells[from]?.id;
    const toId = setup.cells[to]?.id;
    if (!fromId || !toId) return;
    setAttempt({ ...attempt, [fromId]: attempt[toId] ?? "", [toId]: attempt[fromId] ?? "" });
  };
  const rulesCount = setup.cells.filter((cell) => cell.rule).length;
  const passCount = setup.cells.filter((cell) => unitMatchesRule(loadouts.find((loadout) => loadout.id === attempt[cell.id]) ?? null, cell.rule, data) === "pass").length;
  const shareSetup = async () => {
    setShareStatus("working");
    try {
      const response = await fetch(apiUrl("/loadout-box-setups/share"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup: { ...setup, updatedAt: Date.now() } }),
      });
      if (!response.ok) throw new Error("share failed");
      const payload = await response.json() as { id: string };
      const url = new URL(window.location.href);
      url.pathname = "/loadout";
      url.search = "";
      url.searchParams.set("setup", setup.id);
      url.searchParams.set("share", payload.id);
      await navigator.clipboard.writeText(url.toString());
      setShareStatus("ok");
    } catch {
      setShareStatus("error");
    } finally {
      setTimeout(() => setShareStatus(null), 2500);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{setup.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{readOnly ? "Shared link snapshot. Your matching attempt is private to this device." : "Shared setup rules. Your matching attempt is private to this device."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={shareSetup} disabled={shareStatus === "working"}>
                {shareStatus === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                {shareStatus === "ok" ? "Copied" : shareStatus === "error" ? "Failed" : "Share setup"}
              </Button>
            )}
            <div className="flex rounded-md border border-border p-0.5">
              <button onClick={() => setMode("rules")} className={`h-8 rounded px-3 text-xs ${mode === "rules" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Rules</button>
              <button onClick={() => setMode("try")} className={`h-8 rounded px-3 text-xs ${mode === "try" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Try match</button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows</span>
          <ThemedNumberInput value={setup.rows} min={1} max={12} onValueChange={setRows} className="h-8 w-20" ariaLabel={`${setup.title} rows`} disabled={readOnly} />
          <Badge variant="outline" className="text-xs">{rulesCount} required positions</Badge>
          {mode === "try" && <Badge variant="outline" className="text-xs text-emerald-700 dark:text-emerald-300">{passCount}/{rulesCount} matched</Badge>}
        </div>
        <textarea value={setup.notes} onChange={(e) => !readOnly && onChange({ ...setup, notes: e.target.value, updatedAt: Date.now() })} readOnly={readOnly} placeholder="Shared notes, rewards, farming steps, herbs per round, or setup context." className="min-h-16 w-full resize-y rounded-md border border-input bg-muted/15 px-3 py-2 text-xs" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-2">
          {setup.cells.map((cell, index) => {
            const selected = loadouts.find((loadout) => loadout.id === attempt[cell.id]) ?? null;
            const match = unitMatchesRule(selected, cell.rule, data);
            const stateClass = mode === "try" && cell.rule ? (match === "pass" ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/15" : "border-red-500 bg-red-50/40 dark:bg-red-950/15") : cell.rule ? "border-primary/50 bg-primary/5" : "border-dashed border-border bg-muted/15";
            return (
              <button key={cell.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragIndex != null) moveCell(dragIndex, index); setDragIndex(null); }} onClick={() => setOpenCellIndex(index)} className={`min-h-28 rounded-md border-2 p-2 text-left transition-colors ${stateClass}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Spot {index + 1}</span>
                  {mode === "try" && cell.rule && <span className={`text-[10px] font-bold ${match === "pass" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{match === "pass" ? "OK" : "Check"}</span>}
                </div>
                {cell.rule ? (
                  <div className="mt-2 space-y-1">
                    <div className="line-clamp-2 text-xs font-semibold text-foreground">{cell.rule.label || "Required unit"}</div>
                    <div className="line-clamp-2 text-[11px] text-muted-foreground">{cell.rule.anyJob ? "Any job" : cell.rule.jobOptions.join(" / ") || "Job not set"}</div>
                    {cell.rule.skillRules.length > 0 && <div className="text-[10px] text-muted-foreground">{cell.rule.skillRules.length} skill rule{cell.rule.skillRules.length === 1 ? "" : "s"}</div>}
                    {mode === "try" && <div className="line-clamp-2 text-[11px] font-medium text-foreground">{selected?.name || "No loadout selected"}</div>}
                  </div>
                ) : (
                  <div className="mt-6 text-center text-xs text-muted-foreground">Empty</div>
                )}
              </button>
            );
          })}
        </div>

        <Dialog open={openCellIndex != null} onOpenChange={(open) => { if (!open) setOpenCellIndex(null); }}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm">{setup.title} spot {(openCellIndex ?? 0) + 1}</DialogTitle>
            </DialogHeader>
            {openCellIndex != null && (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-muted/15 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Your loadout for this spot</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <SearchableSelect value={attempt[setup.cells[openCellIndex].id] ?? ""} onChange={(value) => setAttempt({ ...attempt, [setup.cells[openCellIndex].id]: value })} options={loadouts.map((loadout) => ({ value: loadout.id, label: loadout.name || "Unnamed Loadout" }))} placeholder="Choose one of your loadouts" triggerClassName="h-8 text-xs" />
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { const id = onCreateLoadout(); setAttempt({ ...attempt, [setup.cells[openCellIndex].id]: id }); }}>
                      <Plus className="h-3.5 w-3.5" />New loadout
                    </Button>
                  </div>
                </div>
                <BoxUnitRuleEditor rule={openRule} data={data} onChange={(next) => updateCell(openCellIndex, { ...setup.cells[openCellIndex], rule: next })} />
                <div className="flex justify-between gap-2">
                  <Button size="sm" variant="destructive" onClick={() => updateCell(openCellIndex, { ...setup.cells[openCellIndex], rule: undefined })}>
                    <Trash2 className="h-3.5 w-3.5" />Clear rules
                  </Button>
                  <Button size="sm" onClick={() => setOpenCellIndex(null)}>Done</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ScreenshotCard({ loadout, stats }: { loadout: Loadout; stats: Record<string, number> }) {
  const hasStats = STAT_KEYS.some((k) => stats[k]);
  return (
    <div style={{ background: "#0f172a", color: "#f1f5f9", padding: 20, borderRadius: 12, width: 480, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{loadout.name || "Loadout"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {loadout.jobName || "No job"} {loadout.rank ? `· Rank ${loadout.rank}` : ""} {(loadout.level ?? 1) > 1 ? `· Lv ${loadout.level}` : ""}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#64748b" }}>Kingdom Adventures</div>
      </div>

      {hasStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginBottom: 14 }}>
          {STAT_KEYS.filter((k) => stats[k]).map((k) => (
            <div key={k} style={{ background: "#1e293b", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{STAT_LABEL[k]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{stats[k].toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {loadout.equipment.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Equipment</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {loadout.equipment.map((eq, i) => (
              <div key={i} style={{ background: "#1e293b", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#e2e8f0" }}>
                {eq.name} {eq.level > 1 ? <span style={{ color: "#64748b" }}>Lv{eq.level}</span> : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {loadout.skills.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Skills</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {loadout.skills.map((s, i) => (
              <div key={i} style={{ background: "#312e81", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#c7d2fe" }}>{s}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loadout Editor ───────────────────────────────────────────────────────────

function LoadoutEditor({ loadout, data, onChange, onDelete, onDuplicate }: {
  loadout: Loadout;
  data: SharedData;
  onChange: (updated: Loadout) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [renamingName, setRenamingName] = useState(false);
  const [nameVal, setNameVal] = useState(loadout.name);
  const [screenshotStatus, setScreenshotStatus] = useState<null | "working" | "ok" | "error">(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const hiddenRef = useRef<HTMLDivElement>(null);

  const jobs = data.jobs ?? {};
  const allSkills = Object.keys(data.skills ?? {}).sort();
  const allEquip = Object.keys(data.overrides ?? {}).filter((n) =>
    data.slotAssignments?.[n] || (data.overrides?.[n] && Object.keys(data.overrides[n]).length > 0)
  ).sort();

  const job = jobs[loadout.jobName];
  const ranks = job ? Object.keys(job.ranks).sort() : ["S","A","B","C","D"];
  const jobStats = useMemo(() => calcJobStats(loadout, data), [loadout, data]);
  const equipStats = useMemo(() => calcEquipStats(loadout, data), [loadout, data]);
  const stats = useMemo(() => {
    const t = { ...jobStats };
    for (const [k, v] of Object.entries(equipStats)) t[k] = (t[k] ?? 0) + v;
    return t;
  }, [jobStats, equipStats]);

  const upd = useCallback(<K extends keyof Loadout>(field: K, val: Loadout[K]) => {
    onChange({ ...loadout, [field]: val });
  }, [loadout, onChange]);

  const setStatLevel = (k: string, lv: number) => {
    upd("statLevels", { ...(loadout.statLevels ?? {}), [k]: Math.max(1, Math.min(999, lv)) });
  };
  const setAllStatLevels = (lv: number) => {
    const next = Math.max(1, Math.min(999, lv));
    const nextLevels: Record<string, number> = {};
    for (const k of allStatKeys) nextLevels[k] = next;
    upd("statLevels", nextLevels);
  };

  // Slot-aware equipment helpers
  const setSlotEquip = (slot: EquipSlot, name: string) => {
    const slotMap = data.slotAssignments ?? {};
    // Remove any existing item in this slot
    const withoutSlot = loadout.equipment.filter((e) => slotMap[e.name] !== slot);
    if (!name) { upd("equipment", withoutSlot); return; }
    upd("equipment", [...withoutSlot, { name, level: 1 }]);
  };
  const removeEquip = (i: number) => upd("equipment", loadout.equipment.filter((_, j) => j !== i));
  const setEquipLevel = (i: number, level: number) => {
    upd("equipment", loadout.equipment.map((e, j) => j === i ? { ...e, level: Math.max(1, Math.min(99, level)) } : e));
  };

  const addSkill = (name: string) => {
    if (!name || loadout.skills.includes(name) || loadout.skills.length >= 9) return;
    upd("skills", [...loadout.skills, name].sort());
  };
  const removeSkill = (name: string) => upd("skills", loadout.skills.filter((s) => s !== name));

  const takeScreenshot = async () => {
    if (!hiddenRef.current) return;
    setScreenshotStatus("working");
    try {
      const url = await toPng(hiddenRef.current, { pixelRatio: 2 });
      setScreenshotUrl(url);
      setScreenshotStatus("ok");
      setTimeout(() => setScreenshotStatus(null), 2500);
    } catch {
      setScreenshotStatus("error");
      setTimeout(() => setScreenshotStatus(null), 2500);
    }
  };

  const downloadScreenshot = () => {
    if (!screenshotUrl) return;
    const a = document.createElement("a");
    a.href = screenshotUrl;
    a.download = `${loadout.name || "loadout"}.png`;
    a.click();
  };

  const allStatKeys = [...STAT_KEYS] as string[];
  const [allLv, setAllLv] = useState(1);
  const [allLvInput, setAllLvInput] = useState("1");
  const [statLevelInputs, setStatLevelInputs] = useState<Record<string, string>>({});
  const [equipLevelInputs, setEquipLevelInputs] = useState<Record<number, string>>({});

  const setAllStatLevelsInput = (raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setAllLvInput(raw);
  };

  const commitAllStatLevels = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = Math.max(1, Math.min(999, isNaN(parsed) ? 1 : parsed));
    setAllLv(next);
    setAllLvInput(String(next));
    setAllStatLevels(next);
    const nextInputs: Record<string, string> = {};
    for (const k of allStatKeys) nextInputs[k] = String(next);
    setStatLevelInputs(nextInputs);
  };

  const setStatLevelInput = (k: string, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setStatLevelInputs((prev) => ({ ...prev, [k]: raw }));
  };

  const commitStatLevel = (k: string, raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = Math.max(1, Math.min(999, isNaN(parsed) ? 1 : parsed));
    setStatLevel(k, next);
    setStatLevelInputs((prev) => ({ ...prev, [k]: String(next) }));
  };

  const setEquipLevelInput = (idx: number, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setEquipLevelInputs((prev) => ({ ...prev, [idx]: raw }));
  };

  const commitEquipLevel = (idx: number, raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = Math.max(1, Math.min(99, isNaN(parsed) ? 1 : parsed));
    setEquipLevel(idx, next);
    setEquipLevelInputs((prev) => ({ ...prev, [idx]: String(next) }));
  };

  return (
    <div className="space-y-4">
      {/* Hidden screenshot node */}
      <div style={{ position: "absolute", top: -9999, left: -9999, pointerEvents: "none" }}>
        <div ref={hiddenRef}>
          <ScreenshotCard loadout={loadout} stats={stats} />
        </div>
      </div>

      {/* Screenshot preview modal */}
      <Dialog open={!!screenshotUrl} onOpenChange={(open) => { if (!open) setScreenshotUrl(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Screenshot ready</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-2">Right-click the image to save, or use the download button below.</p>
          {screenshotUrl && (
            <img src={screenshotUrl} alt="Loadout screenshot" className="w-full rounded-lg border border-border" style={{ imageRendering: "auto" }} />
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setScreenshotUrl(null)}>Close</Button>
            <Button size="sm" onClick={downloadScreenshot} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Download PNG
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Name + actions */}
      <div className="flex items-center gap-2">
        {renamingName ? (
          <div className="flex gap-1.5 flex-1">
            <Input value={nameVal} onChange={(e) => setNameVal(e.target.value)} className="h-8 text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") { upd("name", nameVal); setRenamingName(false); } if (e.key === "Escape") { setNameVal(loadout.name); setRenamingName(false); } }}
              autoFocus />
            <button onClick={() => { upd("name", nameVal); setRenamingName(false); }} className="text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm truncate">{loadout.name || "Unnamed Loadout"}</h3>
            <button onClick={() => { setNameVal(loadout.name); setRenamingName(true); }} className="text-muted-foreground hover:text-foreground shrink-0"><Pencil className="w-3 h-3" /></button>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={takeScreenshot} disabled={screenshotStatus === "working"} className={`h-8 gap-1.5 shrink-0 text-xs ${screenshotStatus === "ok" ? "text-emerald-600 border-emerald-400" : screenshotStatus === "error" ? "text-destructive border-destructive/40" : ""}`}>
          {screenshotStatus === "working" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {screenshotStatus === "ok" ? "Saved!" : screenshotStatus === "error" ? "Failed" : "Screenshot"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Job + Per-stat breakdown */}
        <div className="space-y-3">
          {/* Job selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</p>
            <SearchableSelect
              value={loadout.jobName}
              onChange={(v) => onChange({ ...loadout, jobName: v })}
              options={Object.keys(jobs).sort().map((n) => ({ value: n, label: n }))}
              placeholder="Select job…"
              triggerClassName="h-8 text-sm"
            />
            {loadout.jobName && (
              <select
                value={loadout.rank}
                onChange={(e) => upd("rank", e.target.value)}
                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="" disabled>Select rank</option>
                {ranks.map((r) => (
                  <option key={r} value={r}>
                    Rank {r}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Per-stat breakdown table */}
          {loadout.jobName && loadout.rank && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stats</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">All Lv:</span>
                  <Input type="text" inputMode="numeric" value={allLvInput}
                    onChange={(e) => setAllStatLevelsInput(e.target.value)}
                    onKeyDown={(e) => commitOnEnter(e, () => commitAllStatLevels(e.currentTarget.value))}
                    onBlur={(e) => commitAllStatLevels(e.target.value)}
                    className="h-5 text-[11px] text-center px-0 w-14" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium">Stat</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-center w-16">Level</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-right w-14">Job</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-right w-14">Equip</th>
                      <th className="pb-1 text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium text-right w-14">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStatKeys.map((k) => {
                      const hasJob = jobStats[k] !== undefined;
                      const lv = getStatLevel(loadout, k);
                      const eq = equipStats[k];
                      const total = (jobStats[k] ?? 0) + (eq ?? 0);
                      return (
                        <tr key={k} className="border-t border-border/30">
                          <td className="py-0.5 pr-2 text-muted-foreground uppercase text-[10px] font-medium">{STAT_FULL[k] ?? k}</td>
                          <td className="py-0.5 text-center">
                            <Input type="text" inputMode="numeric" value={statLevelInputs[k] ?? String(lv)}
                              onChange={(e) => setStatLevelInput(k, e.target.value)}
                              onKeyDown={(e) => commitOnEnter(e, () => commitStatLevel(k, e.currentTarget.value))}
                              onBlur={(e) => commitStatLevel(k, e.target.value)}
                              className="h-5 text-[11px] text-center px-0 w-14" />
                          </td>
                          <td className="py-0.5 text-right tabular-nums text-foreground/80">{hasJob ? (jobStats[k] ?? 0).toLocaleString() : <span className="text-muted-foreground/30">—</span>}</td>
                          <td className="py-0.5 text-right tabular-nums text-sky-600 dark:text-sky-400">{eq ? `+${eq.toLocaleString()}` : <span className="text-muted-foreground/20">—</span>}</td>
                          <td className="py-0.5 text-right tabular-nums font-bold">{total > 0 ? total.toLocaleString() : <span className="text-muted-foreground/30">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Equipment + Skills */}
        <div className="space-y-3">
          {/* Equipment — 5-slot card grid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Equipment</p>
            {(() => {
              const slotMap = data.slotAssignments ?? {};
              const iconMap = data.equipIcons ?? {};
              // Items grouped by slot
              const slotToEquip: Record<string, EquipEntry> = {};
              for (const eq of loadout.equipment) {
                const s = slotMap[eq.name];
                if (s) slotToEquip[s] = eq;
              }
              // Items in no known slot
              const extra = loadout.equipment.filter((eq) => !slotMap[eq.name]);
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2">
                    {EQUIP_SLOTS.map(({ slot, Icon }) => {
                      const eq = slotToEquip[slot];
                      const globalIdx = eq ? loadout.equipment.findIndex((e) => e.name === eq.name) : -1;
                      const icon = eq ? getEquipmentIcon(iconMap, eq.name) : null;
                      const slotItems = Object.entries(slotMap)
                        .filter(([, s]) => s === slot)
                        .map(([n]) => n)
                        .sort();
                      return (
                        <div key={slot} className={`flex flex-col rounded-lg border-2 transition-colors ${eq ? "border-primary/30 bg-primary/5" : "border-dashed border-border/60 bg-muted/20"}`}>
                          {/* Slot header */}
                          <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{slot}</span>
                            {eq && (
                              <button onClick={() => setSlotEquip(slot as EquipSlot, "")} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {/* Icon area */}
                          <div className="flex items-center justify-center py-3 px-1">
                            {eq && icon ? (
                              <img src={icon} alt={eq.name} className="w-14 h-14 object-contain rounded" />
                            ) : eq ? (
                              <div className="w-14 h-14 rounded bg-muted/40 flex items-center justify-center">
                                <Icon className="w-7 h-7 text-muted-foreground/50" />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded bg-muted/20 flex items-center justify-center">
                                <Icon className="w-7 h-7 text-muted-foreground/25" />
                              </div>
                            )}
                          </div>
                          {/* Item name + level or select */}
                          <div className="px-2 pb-2 space-y-1">
                            {eq ? (
                              <>
                                <p className="text-[11px] font-medium text-center text-foreground/80 leading-tight line-clamp-2 min-h-[30px]">{eq.name}</p>
                                {/* Weapon proficiency badge */}
                                {(() => {
                                  const rule = getEquipRuleState(loadout, data, eq.name);
                                  if (!rule.prof || rule.prof === "can") return null;
                                  const isWeak = rule.prof === "weak";
                                  return (
                                    <div className="text-center space-y-0.5">
                                      <ToneBadge category={isWeak ? "shop" : "warning"} className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold">
                                        {isWeak
                                          ? (rule.appliesPenalty ? "⚠ Weak: 50%" : "✓ Weak removed")
                                          : "✗ Can't wield"}
                                      </ToneBadge>
                                      {rule.blocked ? (
                                        <p className="text-[8px] text-muted-foreground leading-tight">
                                          This item is ignored in stat totals
                                        </p>
                                      ) : rule.resistanceSkill && (
                                        <p className="text-[8px] text-muted-foreground leading-tight">
                                          {rule.hasResistanceSkillEquipped
                                            ? `${rule.resistanceSkill.name} restores full stats`
                                            : `${rule.resistanceSkill.name} removes this penalty`}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="flex items-center gap-1 justify-center">
                                  <span className="text-xs text-muted-foreground">Lv</span>
                                  <Input type="text" inputMode="numeric" value={equipLevelInputs[globalIdx] ?? String(eq.level)}
                                    onChange={(e) => setEquipLevelInput(globalIdx, e.target.value)}
                                    onKeyDown={(e) => commitOnEnter(e, () => commitEquipLevel(globalIdx, e.currentTarget.value))}
                                    onBlur={(e) => commitEquipLevel(globalIdx, e.target.value)}
                                    className="h-6 text-xs text-center w-14 px-0" />
                                </div>
                              </>
                            ) : (
                              <SearchableSelect
                                value=""
                                clearOnSelect
                                onChange={(v) => { if (v) setSlotEquip(slot as EquipSlot, v); }}
                                options={slotItems.map((n) => ({ value: n, label: n }))}
                                placeholder="— empty —"
                                triggerClassName="h-7 text-[10px]"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Unassigned items (no slot in db) */}
                  {extra.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider mb-1">Other</p>
                      <div className="space-y-1">
                        {extra.map((eq) => {
                          const idx = loadout.equipment.findIndex((e) => e.name === eq.name);
                          return (
                            <div key={eq.name} className="flex items-center gap-1.5 bg-muted/30 rounded-md px-2 py-1">
                              {getEquipmentIcon(iconMap, eq.name) ? <img src={getEquipmentIcon(iconMap, eq.name)} alt="" className="w-4 h-4 object-contain" /> : <div className="w-4 h-4" />}
                              <span className="text-xs flex-1 truncate font-medium">{eq.name}</span>
                              <span className="text-[10px] text-muted-foreground">Lv</span>
                              <Input type="text" inputMode="numeric" value={equipLevelInputs[idx] ?? String(eq.level)}
                                onChange={(e) => setEquipLevelInput(idx, e.target.value)}
                                onKeyDown={(e) => commitOnEnter(e, () => commitEquipLevel(idx, e.currentTarget.value))}
                                onBlur={(e) => commitEquipLevel(idx, e.target.value)}
                                className="h-5 text-[10px] text-center w-12 px-0" />
                              <button onClick={() => removeEquip(idx)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Skills */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Skills <span className="normal-case font-normal">({loadout.skills.length}/9)</span>
            </p>
            <div className="flex flex-wrap gap-1 mb-2 min-h-6">
              {loadout.skills.map((s) => (
                <ToneBadge key={s} category="skill" className="text-xs gap-1 px-2 py-0.5">
                  {s}
                  <button onClick={() => removeSkill(s)} className="hover:text-destructive ml-0.5"><X className="w-2.5 h-2.5" /></button>
                </ToneBadge>
              ))}
              {loadout.skills.length === 0 && <span className="text-xs text-muted-foreground/60">No skills selected</span>}
            </div>
            {loadout.skills.length < 9 && allSkills.length > 0 && (
              <SearchableSelect
                value=""
                clearOnSelect
                onChange={(v) => { if (v) addSkill(v); }}
                options={allSkills.filter((s) => !loadout.skills.includes(s)).map((s) => ({ value: s, label: s }))}
                placeholder="+ Add skill…"
                triggerClassName="h-7 text-xs"
              />
            )}
            {allSkills.length === 0 && <p className="text-xs text-muted-foreground/60">No skills in database yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoadoutPage() {
  const { data, isLoading } = useSharedData();
  const { loadouts, save } = usePrivateLoadouts();
  const { setups, save: saveSetups } = useCommunityBoxSetups(data);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageNote, setPageNote] = useLocalFeature<string>("ka_note_loadout", "");
  const [showNote, setShowNote] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<BoxSetupKind | "combat">("kairo");
  const [sharedSetup, setSharedSetup] = useState<BoxSetupShare | null>(null);
  const [shareLoadError, setShareLoadError] = useState<string | null>(null);

  const addLoadout = () => {
    const id = generateId();
    const newLoadout: Loadout = { id, name: "New Loadout", jobName: "", rank: "", statLevels: {}, equipment: [], skills: [] };
    save([...loadouts, newLoadout]);
    setExpandedId(id);
    return id;
  };

  const updateLoadout = useCallback((updated: Loadout) => {
    save(loadouts.map((l) => l.id === updated.id ? updated : l));
  }, [loadouts, save]);

  const deleteLoadout = useCallback((id: string) => {
    save(loadouts.filter((l) => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [loadouts, save, expandedId]);

  const duplicateLoadout = useCallback((id: string) => {
    const source = loadouts.find((l) => l.id === id);
    if (!source) return;
    const newId = generateId();
    const duplicate: Loadout = { ...source, id: newId, name: `Copy of ${source.name}` };
    save([...loadouts, duplicate]);
    setExpandedId(newId);
  }, [loadouts, save]);

  const updateSetup = useCallback((updated: BoxSetup) => {
    saveSetups(setups.map((setup) => setup.id === updated.id ? updated : setup));
  }, [setups, saveSetups]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");
    const setupKind = params.get("setup");
    if (!shareId) return;
    let cancelled = false;
    setShareLoadError(null);
    fetch(apiUrl(`/loadout-box-setups/share/${encodeURIComponent(shareId)}`))
      .then((response) => {
        if (!response.ok) throw new Error("Shared setup not found");
        return response.json() as Promise<BoxSetupShare>;
      })
      .then((share) => {
        if (cancelled) return;
        const normalized = normalizeBoxSetups([share.setup]).find((setup) => setup.id === share.setup.id || setup.id === setupKind);
        if (!normalized) throw new Error("Shared setup is not a Kairo or Wairo setup");
        setSharedSetup({ ...share, setup: normalized });
        setActiveToolTab(normalized.id);
      })
      .catch((error: Error) => {
        if (!cancelled) setShareLoadError(error.message || "Could not load shared setup");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <PageHeader
            icon={<Package className="w-5 h-5 text-orange-500" />}
            title="Loadout Builder"
            actions={(
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setShowNote((v) => !v)} className="h-8 w-8 text-muted-foreground" title="Personal notes (private, stored on this device)">
                  <Info className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                  if (confirm("Delete all your loadouts? This cannot be undone.")) {
                    save([]);
                  }
                }} className="h-8 w-8 text-muted-foreground" title="Reset all loadouts">
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" onClick={addLoadout} className="h-8 gap-1.5">
                  <Plus className="w-3.5 h-3.5" />New Loadout
                </Button>
              </div>
            )}
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(e) => setPageNote(e.target.value)}
              placeholder="Personal notes for this page… (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        )}

        {!isLoading && loadouts.length === 0 && (
          <div className="text-center py-20">
            <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No loadouts yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1 mb-5">Create a loadout to combine job stats, equipment, and skills.</p>
            <Button onClick={addLoadout} className="gap-1.5"><Plus className="w-4 h-4" />Create First Loadout</Button>
          </div>
        )}

        <div className="space-y-3">
          {loadouts.map((loadout) => {
            const isOpen = expandedId === loadout.id;
            const job = data?.jobs?.[loadout.jobName];
            const stats = data ? calcStats(loadout, data) : {};
            const hasStats = STAT_KEYS.some((k) => stats[k]);

            return (
              <Card key={loadout.id} className="shadow-sm overflow-hidden">
                {/* Summary bar */}
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(isOpen ? null : loadout.id)}
                >
                  <CardHeader className="py-3 px-4 hover:bg-muted/30 transition-colors">
                    {/* Row 1: chevron + name + job + rank + duplicate */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <CardTitle className="text-base font-bold truncate flex-1 min-w-0">
                        {loadout.name || "Unnamed Loadout"}
                      </CardTitle>
                      {loadout.jobName && (
                        <span className="text-sm font-bold text-primary shrink-0">{loadout.jobName}</span>
                      )}
                      {loadout.rank && (
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 border font-semibold ${RANK_COLORS[loadout.rank] ?? ""} shrink-0`}>
                          Rank {loadout.rank}
                        </Badge>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateLoadout(loadout.id); }}
                        className="text-muted-foreground hover:text-primary shrink-0 ml-1"
                        title="Duplicate this loadout"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteLoadout(loadout.id); }}
                        className="text-destructive hover:text-destructive/70 shrink-0 ml-1"
                        title="Delete this loadout"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Collapsed detail rows */}
                    {!isOpen && (
                      <div className="pl-6 mt-2 space-y-2">
                        {/* All stats */}
                        {hasStats && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {STAT_KEYS.filter((k) => stats[k]).map((k) => (
                              <span key={k} className="text-xs tabular-nums">
                                <span className="text-muted-foreground">{STAT_LABEL[k]} </span>
                                <strong className="text-foreground">{stats[k].toLocaleString()}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Equipment chips */}
                        {loadout.equipment.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {loadout.equipment.map((eq) => {
                              const icon = getEquipmentIcon(data?.equipIcons, eq.name);
                              const slot = data?.slotAssignments?.[eq.name];
                              const rule = data ? getEquipRuleState(loadout, data, eq.name) : null;
                              return (
                                <span key={eq.name} className="inline-flex items-center gap-1.5 bg-muted/50 border border-border/50 rounded-md px-2 py-0.5 text-xs">
                                  {slot && <span className="text-muted-foreground/60 font-medium">{slot}:</span>}
                                  {icon && <img src={icon} alt="" className="w-4 h-4 object-contain shrink-0" />}
                                  <span className="font-medium">{eq.name}</span>
                                  <span className="text-muted-foreground">Lv{eq.level}</span>
                                  {rule?.blocked && <span className="text-orange-600 dark:text-orange-400 font-semibold">Can't</span>}
                                  {rule?.appliesPenalty && <span className="text-amber-600 dark:text-amber-400 font-semibold">Weak</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {/* Skill pills */}
                        {loadout.skills.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground/70 shrink-0">Skills:</span>
                            {loadout.skills.map((s) => (
                              <ToneBadge key={s} category="skill" className="inline-block rounded-md px-2 py-0.5 text-xs">
                                {s}
                              </ToneBadge>
                            ))}
                          </div>
                        )}
                        {!hasStats && loadout.equipment.length === 0 && loadout.skills.length === 0 && (
                          <span className="text-xs text-muted-foreground/50">Empty loadout — click to configure</span>
                        )}
                      </div>
                    )}
                  </CardHeader>
                </button>

                {isOpen && (
                  <>
                    <Separator />
                    <CardContent className="p-4">
                      {data ? (
                        <LoadoutEditor
                          loadout={loadout}
                          data={data}
                          onChange={updateLoadout}
                          onDelete={() => deleteLoadout(loadout.id)}
                          onDuplicate={() => duplicateLoadout(loadout.id)}
                        />
                      ) : (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                      )}
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
        </div>

        {loadouts.length > 0 && !isLoading && (
          <button onClick={addLoadout}
            className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors py-4 text-sm text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4" />Add another loadout
          </button>
        )}

        {!isLoading && data && (
          <div className="mt-6 space-y-3">
            {(sharedSetup || shareLoadError) && (
              <div className={`rounded-md border px-3 py-2 text-xs ${shareLoadError ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200"}`}>
                {shareLoadError ? shareLoadError : `Viewing shared setup link: ${sharedSetup?.setup.title}. Try match uses your private loadouts.`}
              </div>
            )}
            <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2">
              {setups.map((setup) => (
                <button
                  key={setup.id}
                  onClick={() => setActiveToolTab(setup.id)}
                  className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${activeToolTab === setup.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                >
                  {setup.title}
                </button>
              ))}
              <button
                onClick={() => setActiveToolTab("combat")}
                className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${activeToolTab === "combat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              >
                Combat Sandbox
              </button>
            </div>

            {setups.map((setup) => (
              activeToolTab === setup.id ? (
                <BoxSetupCard
                  key={setup.id}
                  setup={sharedSetup?.setup.id === setup.id ? sharedSetup.setup : setup}
                  loadouts={loadouts}
                  data={data}
                  onChange={sharedSetup?.setup.id === setup.id ? () => {} : updateSetup}
                  onCreateLoadout={addLoadout}
                  readOnly={sharedSetup?.setup.id === setup.id}
                />
              ) : null
            ))}

            {activeToolTab === "combat" && (
              <LoadoutCombatTool loadouts={loadouts} data={data} />
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Loadouts are saved to your browser — private to you
        </p>
      </div>
    </div>
  );
}
