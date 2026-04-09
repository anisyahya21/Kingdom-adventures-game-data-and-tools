import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Trash2, Zap, RefreshCw, HelpCircle, ArrowLeftRight,
  X, Lock, LockOpen, Moon, Sun, Loader2, AlertTriangle, ExternalLink,
  ArrowLeft, Info, Star, ChevronDown, ChevronRight, Baby, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { SourceViewerButton } from "@/components/source-viewer";
import rawSource from "./marriage-matcher.tsx?raw";

// ─── API ──────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = (p: string) => `${BASE}/ka-api/ka${p}`;

type JobData = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  icon?: string;
  ranks: Record<string, unknown>;
  shield?: "can" | "cannot";
  weaponEquip?: Record<string, "can" | "cannot" | "weak">;
  skillAccess?: { attack?: "can" | "cannot"; casting?: "can" | "cannot" };
  skills: string[];
};

type SharedPair = { id: string; jobA: string; jobB: string; children: string[] };

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: async () => {
      const r = await fetch(API("/shared"));
      const d = await r.json() as { jobs: Record<string, JobData>; pairs?: SharedPair[] };
      return d;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

async function persistPairs(pairs: SharedPair[], userName: string) {
  try {
    await fetch(API("/pairs"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: pairs,
        history: {
          userName: userName || "community",
          changeType: "job",
          itemName: "pairs",
          description: `Updated compatible pairs (${pairs.length} total)`,
        },
      }),
    });
  } catch { /* ignore network errors */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Rank = "S" | "A" | "B" | "C" | "D";
const RANKS: Rank[] = ["S", "A", "B", "C", "D"];

const RANK_STYLE: Record<Rank, { badge: string; header: string; border: string }> = {
  S: {
    badge: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-700",
    header: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
  },
  A: {
    badge: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-700",
    header: "bg-rose-50 dark:bg-rose-950/30",
    border: "border-rose-200 dark:border-rose-800",
  },
  B: {
    badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700",
    header: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
  },
  C: {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700",
    header: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  D: {
    badge: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
    header: "bg-slate-50 dark:bg-slate-800/30",
    border: "border-slate-200 dark:border-slate-700",
  },
};

interface RankSlot {
  id: string;
  rank: Rank;
  jobName: string;
  males: number;
  females: number;
  unassigned: number;
}

interface Pair {
  id: string;
  jobA: string;
  jobB: string;
  children: string[];
}

interface LockedPair {
  id: string;
  maleJob: string;
  femaleJob: string;
  rank: Rank;
}

interface MatchResult {
  id: string;
  maleJob: string;
  femaleJob: string;
  rank: Rank;
  maleWasUnassigned: boolean;
  femaleWasUnassigned: boolean;
  locked: boolean;
}

interface UnassignedDecision {
  jobName: string;
  rank: Rank;
  assignedMales: number;
  assignedFemales: number;
}

interface OptimalResult {
  matches: MatchResult[];
  unmatchedMale: Array<{ job: string; rank: Rank }>;
  unmatchedFemale: Array<{ job: string; rank: Rank }>;
  unassignedDecisions: UnassignedDecision[];
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function runBipartiteMatching(
  effectiveMales: Record<string, number>,
  effectiveFemales: Record<string, number>,
  compatibleKeys: Set<string>
): Array<{ maleJob: string; femaleJob: string }> {
  const graph: Record<string, string[]> = {};
  for (const m in effectiveMales) {
    for (const f in effectiveFemales) {
      if (!compatibleKeys.has(pairKey(m, f))) continue;
      if (!graph[m]) graph[m] = [];
      if (!graph[m].includes(f)) graph[m].push(f);
    }
  }
  const matchF: Record<string, string> = {};
  function tryMatch(m: string, visited: Set<string>): boolean {
    if (!graph[m]) return false;
    for (const f of graph[m]) {
      if (visited.has(f)) continue;
      visited.add(f);
      if (!matchF[f] || tryMatch(matchF[f], visited)) { matchF[f] = m; return true; }
    }
    return false;
  }
  for (const m in effectiveMales) {
    for (let i = 0; i < effectiveMales[m]; i++) tryMatch(m, new Set<string>());
  }
  return Object.entries(matchF).map(([f, m]) => ({ maleJob: m, femaleJob: f }));
}

function matchRank(
  slots: RankSlot[],
  rank: Rank,
  compatibleKeys: Set<string>,
  lockedForRank: LockedPair[]
): {
  matches: Array<{ maleJob: string; femaleJob: string }>;
  unmatchedMale: Array<{ job: string; rank: Rank }>;
  unmatchedFemale: Array<{ job: string; rank: Rank }>;
  decisions: UnassignedDecision[];
} {
  const rankSlots = slots.filter((s) => s.rank === rank);
  const withUnassigned = rankSlots.filter((s) => s.unassigned > 0);

  const baseMales: Record<string, number> = {};
  const baseFemales: Record<string, number> = {};
  for (const s of rankSlots) {
    if (s.males > 0) baseMales[s.jobName] = (baseMales[s.jobName] ?? 0) + s.males;
    if (s.females > 0) baseFemales[s.jobName] = (baseFemales[s.jobName] ?? 0) + s.females;
  }
  for (const lp of lockedForRank) {
    if ((baseMales[lp.maleJob] ?? 0) > 0) baseMales[lp.maleJob]--;
    if ((baseFemales[lp.femaleJob] ?? 0) > 0) baseFemales[lp.femaleJob]--;
  }

  let bestCount = -1;
  let bestMatches: Array<{ maleJob: string; femaleJob: string }> = [];
  let bestMaleExtra: Record<string, number> = {};
  let bestFemaleExtra: Record<string, number> = {};

  function recurse(idx: number, maleExtra: Record<string, number>, femaleExtra: Record<string, number>) {
    if (idx === withUnassigned.length) {
      const effM = { ...baseMales };
      const effF = { ...baseFemales };
      for (const n in maleExtra) if (maleExtra[n] > 0) effM[n] = (effM[n] ?? 0) + maleExtra[n];
      for (const n in femaleExtra) if (femaleExtra[n] > 0) effF[n] = (effF[n] ?? 0) + femaleExtra[n];
      const matches = runBipartiteMatching(effM, effF, compatibleKeys);
      if (matches.length > bestCount) {
        bestCount = matches.length; bestMatches = matches;
        bestMaleExtra = { ...maleExtra }; bestFemaleExtra = { ...femaleExtra };
      }
      return;
    }
    const s = withUnassigned[idx];
    for (let m = 0; m <= s.unassigned; m++) {
      recurse(idx + 1,
        { ...maleExtra, [s.jobName]: (maleExtra[s.jobName] ?? 0) + m },
        { ...femaleExtra, [s.jobName]: (femaleExtra[s.jobName] ?? 0) + (s.unassigned - m) });
    }
  }
  recurse(0, {}, {});

  const effM = { ...baseMales };
  const effF = { ...baseFemales };
  for (const n in bestMaleExtra) if (bestMaleExtra[n] > 0) effM[n] = (effM[n] ?? 0) + bestMaleExtra[n];
  for (const n in bestFemaleExtra) if (bestFemaleExtra[n] > 0) effF[n] = (effF[n] ?? 0) + bestFemaleExtra[n];

  const unmatchedMale: Array<{ job: string; rank: Rank }> = [];
  for (const n in effM) {
    const matched = bestMatches.filter((m) => m.maleJob === n).length;
    for (let i = 0; i < effM[n] - matched; i++) unmatchedMale.push({ job: n, rank });
  }
  const unmatchedFemale: Array<{ job: string; rank: Rank }> = [];
  for (const n in effF) {
    const matched = bestMatches.filter((m) => m.femaleJob === n).length;
    for (let i = 0; i < effF[n] - matched; i++) unmatchedFemale.push({ job: n, rank });
  }

  return {
    matches: bestMatches,
    unmatchedMale,
    unmatchedFemale,
    decisions: withUnassigned.map((s) => ({
      jobName: s.jobName, rank,
      assignedMales: bestMaleExtra[s.jobName] ?? 0,
      assignedFemales: bestFemaleExtra[s.jobName] ?? 0,
    })),
  };
}

function findOptimalMatching(slots: RankSlot[], pairs: Pair[], lockedPairs: LockedPair[]): OptimalResult {
  const compatibleKeys = new Set(pairs.map((p) => pairKey(p.jobA, p.jobB)));
  const allMatches: MatchResult[] = [];
  const allUnmatchedMale: Array<{ job: string; rank: Rank }> = [];
  const allUnmatchedFemale: Array<{ job: string; rank: Rank }> = [];
  const allDecisions: UnassignedDecision[] = [];

  for (const lp of lockedPairs) {
    allMatches.push({
      id: lp.id, maleJob: lp.maleJob, femaleJob: lp.femaleJob, rank: lp.rank,
      maleWasUnassigned: false, femaleWasUnassigned: false, locked: true,
    });
  }

  for (const rank of RANKS) {
    const lockedForRank = lockedPairs.filter((lp) => lp.rank === rank);
    const res = matchRank(slots, rank, compatibleKeys, lockedForRank);
    allDecisions.push(...res.decisions);

    const unassignedMaleJobs = new Set(res.decisions.filter((d) => d.assignedMales > 0).map((d) => d.jobName));
    const unassignedFemaleJobs = new Set(res.decisions.filter((d) => d.assignedFemales > 0).map((d) => d.jobName));

    for (const m of res.matches) {
      allMatches.push({
        id: generateId(), maleJob: m.maleJob, femaleJob: m.femaleJob, rank,
        maleWasUnassigned: unassignedMaleJobs.has(m.maleJob),
        femaleWasUnassigned: unassignedFemaleJobs.has(m.femaleJob),
        locked: false,
      });
    }
    allUnmatchedMale.push(...res.unmatchedMale);
    allUnmatchedFemale.push(...res.unmatchedFemale);
  }

  return { matches: allMatches, unmatchedMale: allUnmatchedMale, unmatchedFemale: allUnmatchedFemale, unassignedDecisions: allDecisions };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() { return Math.random().toString(36).slice(2, 9); }
function makePair(a: string, b: string): Pair { return { id: generateId(), jobA: a, jobB: b, children: [] }; }

function getPossibleChildren(match: MatchResult, pairs: Pair[]): string[] {
  const pair = pairs.find((p) => pairKey(p.jobA, p.jobB) === pairKey(match.maleJob, match.femaleJob));
  return [...new Set([match.maleJob, match.femaleJob, ...(pair?.children ?? [])])];
}

const FALLBACK_JOB_NAMES: string[] = [
  "Archer", "Artisan", "Blacksmith", "Carpenter", "Champion",
  "Cook", "Doctor", "Farmer", "Guard", "Gunner",
  "Knight", "Mage", "Merchant", "Monk", "Mover",
  "Ninja", "Paladin", "Pirate", "Rancher", "Researcher",
  "Samurai", "Trader", "Viking", "Wizard",
].sort();

const DEFAULT_PAIRS: Pair[] = [
  makePair("Artisan", "Champion"), makePair("Artisan", "Guard"), makePair("Artisan", "Ninja"),
  makePair("Blacksmith", "Doctor"), makePair("Blacksmith", "Monk"), makePair("Blacksmith", "Wizard"),
  makePair("Carpenter", "Blacksmith"), makePair("Carpenter", "Mage"), makePair("Carpenter", "Pirate"),
  makePair("Cook", "Guard"), makePair("Doctor", "Champion"),
  makePair("Guard", "Archer"), makePair("Guard", "Champion"), makePair("Guard", "Guard"),
  makePair("Guard", "Ninja"), makePair("Guard", "Paladin"),
  makePair("Knight", "Pirate"), makePair("Mage", "Mage"), makePair("Mage", "Samurai"),
  makePair("Merchant", "Artisan"), makePair("Merchant", "Champion"), makePair("Merchant", "Ninja"),
  makePair("Monk", "Champion"), makePair("Monk", "Guard"), makePair("Monk", "Gunner"), makePair("Monk", "Mage"),
  makePair("Mover", "Archer"), makePair("Mover", "Champion"), makePair("Mover", "Researcher"),
  makePair("Ninja", "Samurai"), makePair("Pirate", "Pirate"),
  makePair("Rancher", "Knight"), makePair("Trader", "Gunner"), makePair("Wizard", "Wizard"),
];

// ─── RankTable ────────────────────────────────────────────────────────────────

interface RankTableProps {
  rank: Rank;
  slots: RankSlot[];
  availableJobs: string[];
  totalFirstGenCount: number;
  onUpdate: (id: string, field: "males" | "females" | "unassigned", value: number) => void;
  onRemove: (id: string) => void;
  onAdd: (rank: Rank, jobName: string) => void;
}

function RankTable({ rank, slots, availableJobs, totalFirstGenCount, onUpdate, onRemove, onAdd }: RankTableProps) {
  const style = RANK_STYLE[rank];
  const maleTotal = slots.reduce((s, j) => s + j.males, 0);
  const femaleTotal = slots.reduce((s, j) => s + j.females, 0);
  const unassignedTotal = slots.reduce((s, j) => s + j.unassigned, 0);

  return (
    <Card className={`shadow-sm border ${style.border}`}>
      <CardHeader className={`pb-2 pt-3 px-4 rounded-t-lg ${style.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={`text-sm font-bold px-2.5 py-0.5 border ${style.badge}`}>Rank {rank}</Badge>
            <span className="text-xs text-muted-foreground">{slots.length} job{slots.length !== 1 ? "s" : ""}</span>
          </div>
          {(maleTotal + femaleTotal + unassignedTotal) > 0 && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              {maleTotal > 0 && <span><strong className="text-foreground">{maleTotal}</strong> M</span>}
              {femaleTotal > 0 && <span><strong className="text-foreground">{femaleTotal}</strong> F</span>}
              {unassignedTotal > 0 && <span className="text-amber-600 dark:text-amber-400"><strong>{unassignedTotal}</strong> ?</span>}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {slots.length > 0 && (
          <div className="rounded-md border border-border overflow-hidden mt-3 mb-3">
            <div className="grid grid-cols-[1fr_72px_72px_88px_28px] bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span>Job</span>
              <span className="text-center">Male</span>
              <span className="text-center">Female</span>
              <span className="text-center flex items-center justify-center gap-1">
                Unassigned
                <Tooltip>
                  <TooltipTrigger asChild><HelpCircle className="w-3 h-3 cursor-help" /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-48 text-xs">
                    Gender not yet set. The algorithm tries all splits to maximise total matches.
                  </TooltipContent>
                </Tooltip>
              </span>
              <span />
            </div>
            <Separator />
            {slots.map((slot, i) => (
              <div key={slot.id}>
                {i > 0 && <Separator />}
                <div className="grid grid-cols-[1fr_72px_72px_88px_28px] items-center px-3 py-1.5 gap-1">
                  <span className="text-sm font-medium truncate">
                    {slot.jobName}
                    {slot.unassigned > 0 && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400">?</Badge>
                    )}
                  </span>
                  <Input type="number" min={0} value={slot.males}
                    onChange={(e) => onUpdate(slot.id, "males", parseInt(e.target.value) || 0)}
                    className="h-7 text-center text-sm px-1" />
                  <Input type="number" min={0} value={slot.females}
                    onChange={(e) => onUpdate(slot.id, "females", parseInt(e.target.value) || 0)}
                    className="h-7 text-center text-sm px-1" />
                  <Input type="number" min={0} value={slot.unassigned}
                    onChange={(e) => onUpdate(slot.id, "unassigned", parseInt(e.target.value) || 0)}
                    className="h-7 text-center text-sm px-1 border-amber-300 dark:border-amber-700 focus-visible:ring-amber-400" />
                  <button onClick={() => onRemove(slot.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors justify-self-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {availableJobs.length > 0 ? (
          <select
            value=""
            onChange={(e) => { if (e.target.value) onAdd(rank, e.target.value); }}
            className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground mt-3"
          >
            <option value="">+ Add a job you own at Rank {rank}…</option>
            {availableJobs.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : totalFirstGenCount === 0 ? (
          <p className="text-xs text-muted-foreground text-center mt-3 py-1">
            No 1st gen jobs in database yet — add them in the Jobs tool.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center mt-3 py-1">
            All {totalFirstGenCount} 1st gen jobs already added to this rank.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Jobs Panel ───────────────────────────────────────────────────────────────

function JobsPanel({ jobNames, isLoading, isFromApi }: { jobNames: string[]; isLoading: boolean; isFromApi: boolean }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">1st Generation Jobs</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Automatically loaded from the Jobs Tool. Only 1st gen jobs can be parents — they all have <strong>Compatibility A</strong> with each other.
            </CardDescription>
          </div>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
          {!isLoading && isFromApi && (
            <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600 dark:text-emerald-400 shrink-0">Live</Badge>
          )}
          {!isLoading && !isFromApi && (
            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400 shrink-0">Cached</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5 min-h-8">
          {jobNames.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground">No 1st gen jobs found. Add them in the Jobs Tool first.</p>
          )}
          {jobNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-xs px-2 py-1">{name}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{jobNames.length} first generation job{jobNames.length !== 1 ? "s" : ""}</p>
      </CardContent>
    </Card>
  );
}

// ─── Pairs Panel ──────────────────────────────────────────────────────────────

interface PairsPanelProps {
  pairs: Pair[];
  firstGenJobNames: string[];
  allJobNames: string[];
  onAdd: (a: string, b: string) => string | null;
  onRemove: (id: string) => void;
  onUpdateChildren: (id: string, children: string[]) => void;
}

function PairsPanel({ pairs, firstGenJobNames, allJobNames, onAdd, onRemove, onUpdateChildren }: PairsPanelProps) {
  const [selA, setSelA] = useState("");
  const [selB, setSelB] = useState("");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [childSel, setChildSel] = useState<Record<string, string>>({});

  const handleAdd = () => {
    const a = selA.trim(); const b = selB.trim();
    if (!a || !b) { setError("Select both jobs."); return; }
    const err = onAdd(a, b);
    if (err) { setError(err); return; }
    setSelA(""); setSelB(""); setError("");
  };

  const addChild = (pairId: string, child: string) => {
    if (!child) return;
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair || pair.children.includes(child)) return;
    onUpdateChildren(pairId, [...pair.children, child]);
    setChildSel((prev) => ({ ...prev, [pairId]: "" }));
  };

  const removeChild = (pairId: string, child: string) => {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return;
    onUpdateChildren(pairId, pair.children.filter((c) => c !== child));
  };

  const sorted = [...pairs].sort((a, b) => pairKey(a.jobA, a.jobB).localeCompare(pairKey(b.jobA, b.jobB)));

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Compatible Pairs & Children</CardTitle>
        <CardDescription className="text-xs">
          Define which 1st gen job pairs can marry (same character rank). Optionally add the possible child job outcomes for each pair — children can be any job (1st or 2nd gen).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border overflow-hidden">
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {sorted.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No pairs defined yet.</p>}
            {sorted.map((p) => {
              const [d1, d2] = [p.jobA, p.jobB].sort();
              const isExpanded = expandedId === p.id;
              const sortedChildren = [...p.children].sort();
              return (
                <div key={p.id} className="transition-colors">
                  <div className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30">
                    <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-medium truncate">{d1}</span>
                      <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{d2}</span>
                      {sortedChildren.length > 0 && (
                        <div className="flex gap-1 flex-wrap ml-1">
                          {sortedChildren.map((c) => (
                            <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-700 dark:text-violet-400 gap-1">
                              <Baby className="w-2.5 h-2.5" />{c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => onRemove(p.id)} className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 bg-muted/20 border-t border-border space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Possible child outcomes for <strong className="text-foreground">{d1} × {d2}</strong>:</p>
                      <p className="text-[11px] text-muted-foreground">The child can always take the father's or mother's job. Add here any additional job the child can receive from this marriage.</p>
                      {sortedChildren.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {sortedChildren.map((c) => (
                            <Badge key={c} variant="secondary" className="text-xs gap-1.5 px-2 py-1">
                              <Baby className="w-3 h-3 text-violet-500" />{c}
                              <button onClick={() => removeChild(p.id, c)} className="text-muted-foreground hover:text-destructive">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <select
                          value={childSel[p.id] ?? ""}
                          onChange={(e) => setChildSel((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="flex-1 h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">Select child job…</option>
                          {allJobNames
                            .filter((n) => !p.children.includes(n))
                            .map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <Button size="sm" variant="secondary" onClick={() => addChild(p.id, childSel[p.id] ?? "")} className="h-7 px-2.5 text-xs shrink-0">
                          <Plus className="w-3 h-3 mr-1" />Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <select value={selA} onChange={(e) => { setSelA(e.target.value); setError(""); }}
              className="flex-1 h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Parent A (1st gen)…</option>
              {firstGenJobNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <select value={selB} onChange={(e) => { setSelB(e.target.value); setError(""); }}
              className="flex-1 h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Parent B (1st gen)…</option>
              {firstGenJobNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={handleAdd} className="h-8 px-3 shrink-0">
              <Plus className="w-4 h-4 mr-1" />Add
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <p className="text-xs text-muted-foreground">{pairs.length} pair{pairs.length !== 1 ? "s" : ""} defined · Click <ChevronRight className="inline w-3 h-3" /> to add child outcomes</p>
      </CardContent>
    </Card>
  );
}

// ─── Priority Children Panel ───────────────────────────────────────────────────

interface PriorityPanelProps {
  desiredChildren: string[];
  allJobNames: string[];
  onAdd: (child: string) => void;
  onRemove: (child: string) => void;
}

function PriorityPanel({ desiredChildren, allJobNames, onAdd, onRemove }: PriorityPanelProps) {
  const [sel, setSel] = useState("");

  const handle = () => {
    if (!sel) return;
    onAdd(sel);
    setSel("");
  };

  return (
    <Card className="shadow-sm border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-violet-500" />
          <CardTitle className="text-base">Priority Children</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Select child jobs you want to obtain. After calculating, the results will show which marriages can produce each desired child — through the child inheriting the <em>father's job</em>, the <em>mother's job</em>, or a defined <em>outcome child</em> from the pair.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {desiredChildren.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {desiredChildren.map((c) => (
              <Badge key={c} className="gap-1.5 px-2 py-1 text-xs bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-700 border">
                <Star className="w-2.5 h-2.5" />{c}
                <button onClick={() => onRemove(c)} className="text-violet-500 hover:text-destructive transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No priority children set. Add some below to see coverage in results.</p>
        )}
        <div className="flex gap-2">
          <select value={sel} onChange={(e) => setSel(e.target.value)}
            className="flex-1 h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">Select desired child job…</option>
            {allJobNames.filter((n) => !desiredChildren.includes(n)).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={handle} className="h-8 px-3 shrink-0">
            <Plus className="w-4 h-4 mr-1" />Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Match Row ────────────────────────────────────────────────────────────────

interface MatchRowProps {
  match: MatchResult;
  index: number;
  rankJobNames: string[];
  pairs: Pair[];
  desiredChildren: string[];
  onLock: (id: string) => void;
  onUnlock: (id: string) => void;
  onChangeMale: (id: string, job: string) => void;
  onChangeFemale: (id: string, job: string) => void;
}

function MatchRow({ match, index, rankJobNames, pairs, desiredChildren, onLock, onUnlock, onChangeMale, onChangeFemale }: MatchRowProps) {
  const isLocked = match.locked;

  const possibleChildren = useMemo(() => getPossibleChildren(match, pairs), [match, pairs]);
  const desiredHere = useMemo(
    () => desiredChildren.filter((c) => possibleChildren.includes(c)),
    [desiredChildren, possibleChildren]
  );
  const hasDesired = desiredHere.length > 0;
  const outcomeChildren = useMemo(() => {
    const pair = pairs.find((p) => pairKey(p.jobA, p.jobB) === pairKey(match.maleJob, match.femaleJob));
    return pair?.children ?? [];
  }, [match, pairs]);

  return (
    <div className={`rounded-lg px-3 py-2 transition-all ${
      isLocked
        ? "bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700"
        : hasDesired
          ? "bg-violet-50 border border-violet-200 dark:bg-violet-950/20 dark:border-violet-800"
          : "bg-accent/50"
    }`}>
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-x-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold shrink-0">{index + 1}</span>
          {isLocked ? (
            <select value={match.maleJob} onChange={(e) => onChangeMale(match.id, e.target.value)}
              className="flex-1 h-7 text-sm rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring min-w-0">
              {rankJobNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-base font-bold text-blue-500 leading-none shrink-0">♂</span>
              <span className="font-medium text-sm truncate">{match.maleJob}</span>
              {match.maleWasUnassigned && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400 shrink-0 cursor-help">unassigned</Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">This slot's gender was decided by the algorithm</TooltipContent>
                </Tooltip>
              )}
            </span>
          )}
        </div>
        {isLocked
          ? <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          : <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        {isLocked ? (
          <select value={match.femaleJob} onChange={(e) => onChangeFemale(match.id, e.target.value)}
            className="flex-1 h-7 text-sm rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring min-w-0">
            {rankJobNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-base font-bold text-rose-500 leading-none shrink-0">♀</span>
            <span className="font-medium text-sm text-rose-600 dark:text-rose-400 truncate">{match.femaleJob}</span>
            {match.femaleWasUnassigned && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400 shrink-0 cursor-help">unassigned</Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">This slot's gender was decided by the algorithm</TooltipContent>
              </Tooltip>
            )}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => isLocked ? onUnlock(match.id) : onLock(match.id)}
              className={`shrink-0 p-1 rounded transition-colors ${isLocked ? "text-amber-500 hover:text-amber-700 dark:hover:text-amber-300" : "text-muted-foreground hover:text-foreground"}`}>
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isLocked ? "Unlock — let algorithm reassign" : "Lock this pair for future calculations"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Children row */}
      {(desiredHere.length > 0 || outcomeChildren.length > 0) && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap pl-7">
          <Baby className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground">Child can be:</span>
          {[match.maleJob, match.femaleJob, ...outcomeChildren].filter((v, i, a) => a.indexOf(v) === i).map((c) => {
            const isPriority = desiredChildren.includes(c);
            return (
              <Badge key={c} variant="outline" className={`text-[10px] px-1.5 py-0 ${isPriority ? "border-violet-400 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30" : "text-muted-foreground"}`}>
                {isPriority && <Star className="w-2.5 h-2.5 mr-0.5 text-violet-500" />}
                {c}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Info Dialog ──────────────────────────────────────────────────────────────

function InfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8">
          <Info className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How to use the Match Finder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div>
            <h3 className="font-semibold text-foreground mb-1">Compatibility vs Character Rank</h3>
            <p>This tool is for marriages at <strong>Compatibility A</strong> — the highest marriage compatibility rating (A is best, E is worst). All 1st generation jobs have Compatibility A with each other. Character rank (S/A/B/C/D) is separate and refers to how leveled up your character is.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">1. Jobs (auto-loaded)</h3>
            <p>1st gen jobs are loaded automatically from the <strong>Jobs Tool</strong>. Only 1st gen jobs can be parents.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">2. Assign to character rank tables</h3>
            <p>For each character rank (S through D), add the relevant jobs and enter how many <strong>male</strong> / <strong>female</strong> characters you have at that rank. Use <strong>Unassigned</strong> for undecided genders — the algorithm splits them to maximise matches.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">3. Compatible pairs & children</h3>
            <p>Define which job pairs can marry. Click <strong>▶</strong> on any pair to add possible child job outcomes (the child can always take the father's or mother's job; list here any extra outcome jobs for that pair).</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">4. Priority children</h3>
            <p>Select which child jobs you want. After calculating, results highlight matches that can produce your desired children — via the child inheriting the father's job, mother's job, or a defined outcome child.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">5. Calculate & lock</h3>
            <p>Click <strong>Calculate</strong> to find the optimal matching. Lock pairs with 🔓 to keep them fixed across recalculations.</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            <strong className="text-foreground">What's shared vs. private?</strong> Compatible pairs are community data shared across all users. Rank assignments, locks, and filters are saved in <em>this browser only</em> — private to you.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarriageMatcher() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [darkMode]);

  // ── API data ──
  const { data: sharedData, isLoading: jobsLoading } = useSharedData();

  const apiFirstGenJobs = useMemo(() => {
    if (!sharedData?.jobs) return null;
    return Object.keys(sharedData.jobs)
      .filter((name) => sharedData.jobs[name].generation === 1)
      .sort();
  }, [sharedData]);

  const apiAllJobs = useMemo(() => {
    if (!sharedData?.jobs) return null;
    return Object.keys(sharedData.jobs).sort();
  }, [sharedData]);

  const apiPairs = useMemo(() => {
    if (!sharedData?.pairs) return null;
    return sharedData.pairs.map((p) => ({ ...p, children: p.children ?? [] }));
  }, [sharedData]);

  const jobTypeMap = useMemo(() => {
    if (!sharedData?.jobs) return {} as Record<string, "combat" | "non-combat">;
    const map: Record<string, "combat" | "non-combat"> = {};
    for (const [name, job] of Object.entries(sharedData.jobs)) {
      if (job.type) map[name] = job.type;
    }
    return map;
  }, [sharedData]);

  // ── Job names: API-first, localStorage cache as fallback ──
  const [cachedJobNames, setCachedJobNames] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_jobNames");
      if (s) return JSON.parse(s) as string[];
    } catch { /* ignore */ }
    return FALLBACK_JOB_NAMES;
  });

  const prevFirstGenRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!apiFirstGenJobs) return;
    setCachedJobNames(apiFirstGenJobs);
    localStorage.setItem("ka_mf_jobNames", JSON.stringify(apiFirstGenJobs));

    // Auto-add pairs for any newly added Gen1 jobs
    const prev = prevFirstGenRef.current;
    if (prev !== null) {
      const newJobs = apiFirstGenJobs.filter((j) => !prev.includes(j));
      if (newJobs.length > 0) {
        setPairs((existing) => {
          const updated = [...existing];
          for (const newJob of newJobs) {
            for (const otherJob of apiFirstGenJobs) {
              const key = pairKey(newJob, otherJob);
              if (!updated.some((p) => pairKey(p.jobA, p.jobB) === key)) {
                updated.push(makePair(newJob, otherJob));
              }
            }
          }
          return updated;
        });
      }
    }
    prevFirstGenRef.current = apiFirstGenJobs;
  }, [apiFirstGenJobs]);

  const sortedJobNames = apiFirstGenJobs ?? cachedJobNames;
  const allJobNames = apiAllJobs ?? sortedJobNames;

  // ── State: rank slots ──
  const [rankSlots, setRankSlots] = useState<RankSlot[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_rankSlots");
      if (s) return JSON.parse(s) as RankSlot[];
    } catch { /* ignore */ }
    return [];
  });

  // ── State: pairs — loaded from API (community), fallback to localStorage ──
  const [pairsLoadedFromApi, setPairsLoadedFromApi] = useState(false);
  const [pairs, setPairs] = useState<Pair[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_pairs");
      if (s) {
        const loaded = JSON.parse(s) as Pair[];
        return loaded.map((p) => ({ ...p, children: p.children ?? [] }));
      }
    } catch { /* ignore */ }
    return DEFAULT_PAIRS;
  });

  // ── State: locked pairs ──
  const [lockedPairs, setLockedPairs] = useState<LockedPair[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_lockedPairs");
      if (s) return JSON.parse(s) as LockedPair[];
    } catch { /* ignore */ }
    return [];
  });

  // ── State: desired / priority children ──
  const [desiredChildren, setDesiredChildren] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_desiredChildren");
      if (s) return JSON.parse(s) as string[];
    } catch { /* ignore */ }
    return [];
  });

  // ── State: result filters ──
  const [resultTypeFilter, setResultTypeFilter] = useState<"all" | "combat" | "non-combat">("all");
  const [resultIncludeJobs, setResultIncludeJobs] = useState<string[]>([]);
  const [resultExcludeJobs, setResultExcludeJobs] = useState<string[]>([]);

  // ── Sync pairs from API (one-time on first load) ──
  const pairsRef = useRef(pairs);
  useEffect(() => { pairsRef.current = pairs; }, [pairs]);

  useEffect(() => {
    if (!apiPairs || pairsLoadedFromApi) return;
    setPairsLoadedFromApi(true);
    if (apiPairs.length > 0) {
      setPairs(apiPairs);
    } else {
      // API has no pairs yet — push our local pairs up to the backend
      persistPairs(pairsRef.current, "community");
    }
  }, [apiPairs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist ──
  useEffect(() => { localStorage.setItem("ka_mf_rankSlots", JSON.stringify(rankSlots)); }, [rankSlots]);
  useEffect(() => {
    localStorage.setItem("ka_mf_pairs", JSON.stringify(pairs));
    if (pairsLoadedFromApi) {
      persistPairs(pairs, "community");
    }
  }, [pairs, pairsLoadedFromApi]);
  useEffect(() => { localStorage.setItem("ka_mf_lockedPairs", JSON.stringify(lockedPairs)); }, [lockedPairs]);
  useEffect(() => { localStorage.setItem("ka_mf_desiredChildren", JSON.stringify(desiredChildren)); }, [desiredChildren]);

  // ── Result state ──
  const [result, setResult] = useState<OptimalResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isStale, setIsStale] = useState(false);

  const markStale = useCallback(() => setIsStale(true), []);

  // ── Slot actions ──
  const updateSlot = useCallback((id: string, field: "males" | "females" | "unassigned", value: number) => {
    setRankSlots((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: Math.max(0, value) } : s)));
    markStale();
  }, [markStale]);

  const removeSlot = useCallback((id: string) => {
    setRankSlots((prev) => prev.filter((s) => s.id !== id));
    markStale();
  }, [markStale]);

  const addSlot = useCallback((rank: Rank, jobName: string) => {
    const name = jobName.trim();
    if (!name) return;
    setRankSlots((prev) => {
      if (prev.some((s) => s.rank === rank && s.jobName === name)) return prev;
      return [...prev, { id: generateId(), rank, jobName: name, males: 0, females: 0, unassigned: 0 }];
    });
    markStale();
  }, [markStale]);

  // ── Pair actions ──
  const addPair = useCallback((a: string, b: string): string | null => {
    const key = pairKey(a, b);
    let dupe = false;
    setPairs((prev) => {
      if (prev.some((p) => pairKey(p.jobA, p.jobB) === key)) { dupe = true; return prev; }
      return [...prev, makePair(a, b)];
    });
    if (dupe) return "This pair already exists.";
    markStale();
    return null;
  }, [markStale]);

  const removePair = useCallback((id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id));
    markStale();
  }, [markStale]);

  const updatePairChildren = useCallback((id: string, children: string[]) => {
    setPairs((prev) => prev.map((p) => p.id === id ? { ...p, children } : p));
    markStale();
  }, [markStale]);

  // ── Lock actions ──
  const lockMatch = useCallback((matchId: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const match = prev.matches.find((m) => m.id === matchId);
      if (!match) return prev;
      const lp: LockedPair = { id: generateId(), maleJob: match.maleJob, femaleJob: match.femaleJob, rank: match.rank };
      setLockedPairs((lps) => [...lps, lp]);
      return { ...prev, matches: prev.matches.map((m) => m.id === matchId ? { ...m, locked: true, id: lp.id } : m) };
    });
    setIsStale(true);
  }, []);

  const unlockMatch = useCallback((matchId: string) => {
    setLockedPairs((prev) => prev.filter((lp) => lp.id !== matchId));
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: prev.matches.map((m) => m.id === matchId ? { ...m, locked: false } : m) };
    });
    setIsStale(true);
  }, []);

  const changeLockedMale = useCallback((matchId: string, newJob: string) => {
    setLockedPairs((prev) => prev.map((lp) => lp.id === matchId ? { ...lp, maleJob: newJob } : lp));
    setResult((prev) => prev ? { ...prev, matches: prev.matches.map((m) => m.id === matchId ? { ...m, maleJob: newJob } : m) } : prev);
    setIsStale(true);
  }, []);

  const changeLockedFemale = useCallback((matchId: string, newJob: string) => {
    setLockedPairs((prev) => prev.map((lp) => lp.id === matchId ? { ...lp, femaleJob: newJob } : lp));
    setResult((prev) => prev ? { ...prev, matches: prev.matches.map((m) => m.id === matchId ? { ...m, femaleJob: newJob } : m) } : prev);
    setIsStale(true);
  }, []);

  // ── Priority child actions ──
  const addDesiredChild = useCallback((child: string) => {
    setDesiredChildren((prev) => prev.includes(child) ? prev : [...prev, child].sort());
  }, []);

  const removeDesiredChild = useCallback((child: string) => {
    setDesiredChildren((prev) => prev.filter((c) => c !== child));
  }, []);

  // ── Calculate ──
  const calculate = useCallback(() => {
    setIsCalculating(true);
    setIsStale(false);
    setTimeout(() => {
      setResult(findOptimalMatching(rankSlots, pairs, lockedPairs));
      setIsCalculating(false);
    }, 80);
  }, [rankSlots, pairs, lockedPairs]);

  const reset = useCallback(() => {
    setRankSlots([]);
    setPairs(DEFAULT_PAIRS.map((p) => ({ ...p, id: generateId() })));
    setLockedPairs([]);
    setDesiredChildren([]);
    setResult(null);
    setIsStale(false);
  }, []);

  // ── Derived ──
  const availablePerRank = useMemo(() => {
    const map: Record<Rank, string[]> = { S: [], A: [], B: [], C: [], D: [] };
    const presentPerRank: Record<Rank, Set<string>> = {
      S: new Set(), A: new Set(), B: new Set(), C: new Set(), D: new Set(),
    };
    for (const s of rankSlots) presentPerRank[s.rank].add(s.jobName);
    for (const rank of RANKS) {
      map[rank] = sortedJobNames.filter((n) => !presentPerRank[rank].has(n));
    }
    return map;
  }, [rankSlots, sortedJobNames]);

  const jobsPerRank = useMemo(() => {
    const map: Record<Rank, string[]> = { S: [], A: [], B: [], C: [], D: [] };
    for (const s of rankSlots) {
      if (!map[s.rank].includes(s.jobName)) map[s.rank].push(s.jobName);
    }
    for (const rank of RANKS) map[rank].sort();
    return map;
  }, [rankSlots]);

  // ── Child coverage for results ──
  const childCoverage = useMemo(() => {
    if (!result || desiredChildren.length === 0) return [];
    return desiredChildren.map((child) => {
      const coveringMatches = result.matches.filter((m) =>
        getPossibleChildren(m, pairs).includes(child)
      );
      return { child, matches: coveringMatches };
    });
  }, [result, desiredChildren, pairs]);

  const hasLocked = lockedPairs.length > 0;

  // ── Filtered matches (result type filter) ──
  const filteredMatches = useMemo(() => {
    if (!result) return [];
    return result.matches.filter((m) => {
      if (resultExcludeJobs.includes(m.maleJob) || resultExcludeJobs.includes(m.femaleJob)) return false;
      if (resultIncludeJobs.length > 0 && !resultIncludeJobs.includes(m.maleJob) && !resultIncludeJobs.includes(m.femaleJob)) return false;
      if (resultTypeFilter === "all") return true;
      const maleType = jobTypeMap[m.maleJob];
      const femaleType = jobTypeMap[m.femaleJob];
      return maleType === resultTypeFilter || femaleType === resultTypeFilter;
    });
  }, [result, resultTypeFilter, resultIncludeJobs, resultExcludeJobs, jobTypeMap]);

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2 h-8 text-muted-foreground hover:text-foreground mt-1">
                <ArrowLeft className="w-4 h-4" /> Home
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Kingdom Adventures Match Finder</h1>
              <p className="mt-1 text-muted-foreground text-sm max-w-xl">
                Plan optimal marriages for <span className="font-medium text-foreground">Compatibility A</span> — the highest marriage compatibility rating (A through E, A is best). All 1st generation jobs have Compatibility A with each other.
              </p>
              <p className="mt-1 text-muted-foreground text-xs max-w-xl">
                Your rank assignments and settings are <span className="font-medium">private to your browser</span>. Compatible pairs are <span className="font-medium">shared community data</span> — visible to all users and shown on job pages.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <InfoDialog />
            <SourceViewerButton source={rawSource} title="Match Finder — Source Code" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setDarkMode((d) => !d)} className="h-8 w-8">
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Toggle {darkMode ? "light" : "dark"} mode</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={reset} className="flex items-center gap-2 h-8">
              <RefreshCw className="w-4 h-4" /> Reset
            </Button>
          </div>
        </div>

        {/* Jobs Panel */}
        <div className="mb-6">
          <JobsPanel jobNames={sortedJobNames} isLoading={jobsLoading} isFromApi={!!apiFirstGenJobs} />
        </div>

        {/* Rank tables */}
        <div className="space-y-4">
          {RANKS.map((rank) => (
            <RankTable key={rank} rank={rank}
              slots={rankSlots.filter((s) => s.rank === rank)}
              availableJobs={availablePerRank[rank]}
              totalFirstGenCount={sortedJobNames.length}
              onUpdate={updateSlot} onRemove={removeSlot} onAdd={addSlot}
            />
          ))}
        </div>

        {/* Compatible pairs */}
        <div className="mt-6">
          <PairsPanel
            pairs={pairs}
            firstGenJobNames={sortedJobNames}
            allJobNames={allJobNames}
            onAdd={addPair}
            onRemove={removePair}
            onUpdateChildren={updatePairChildren}
          />
        </div>

        {/* Priority children */}
        <div className="mt-6">
          <PriorityPanel
            desiredChildren={desiredChildren}
            allJobNames={allJobNames}
            onAdd={addDesiredChild}
            onRemove={removeDesiredChild}
          />
        </div>

        {/* Stale / locked notice */}
        {(isStale && result) && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">
              Inputs have changed{hasLocked ? " (some pairs are locked)" : ""}. Recalculate to update results.
            </p>
          </div>
        )}
        {(hasLocked && !isStale && result) && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
            <Lock className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {lockedPairs.length} pair{lockedPairs.length !== 1 ? "s are" : " is"} locked. The algorithm works around them.
            </p>
          </div>
        )}

        {/* Calculate button */}
        <div className="mt-6 flex justify-center">
          <Button onClick={calculate} disabled={isCalculating} size="lg" className={`gap-2 px-10 shadow-md transition-all ${isStale && result ? "ring-2 ring-amber-400 ring-offset-2" : ""}`}>
            {isCalculating
              ? <><Loader2 className="w-4 h-4 animate-spin" />Calculating…</>
              : <><Zap className="w-4 h-4" />{result ? "Recalculate" : "Calculate Optimal Matching"}</>}
          </Button>
        </div>

        {/* Results */}
        {result && !isCalculating && (
          <div className="mt-6 space-y-4">

            {/* Desired children coverage */}
            {childCoverage.length > 0 && (
              <Card className="shadow-sm border-violet-200 dark:border-violet-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-violet-500" />
                    <CardTitle className="text-sm text-violet-800 dark:text-violet-300">Priority Children Coverage</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {childCoverage.map(({ child, matches: coverMatches }) => (
                      <div key={child} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                        coverMatches.length > 0
                          ? "border-violet-300 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-700"
                          : "border-destructive/30 bg-destructive/5"
                      }`}>
                        <Star className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${coverMatches.length > 0 ? "text-violet-500" : "text-muted-foreground"}`} />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-xs">{child}</p>
                          {coverMatches.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              Covered by {coverMatches.length} match{coverMatches.length !== 1 ? "es" : ""}: {coverMatches.map((m) => `${m.maleJob} × ${m.femaleJob}`).join(", ")}
                            </p>
                          ) : (
                            <p className="text-[11px] text-destructive">Not covered — no match in this plan can produce this child. Add pairs with this child as an outcome, or include it as a parent.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.unassignedDecisions.some((d) => d.assignedMales + d.assignedFemales > 0) && (
              <Card className="shadow-sm border-amber-300 dark:border-amber-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-700 dark:text-amber-400">Optimal gender assignment for unassigned slots</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.unassignedDecisions.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm">
                        <Badge className={`text-[10px] px-1.5 border ${RANK_STYLE[d.rank].badge}`}>{d.rank}</Badge>
                        <span className="font-semibold text-foreground">{d.jobName}</span>
                        <span className="text-muted-foreground">→</span>
                        {d.assignedMales > 0 && <Badge variant="secondary" className="text-xs gap-1"><span className="text-blue-500">♂</span>{d.assignedMales}</Badge>}
                        {d.assignedFemales > 0 && <Badge variant="outline" className="text-xs border-primary/30 text-primary gap-1"><span className="text-rose-500">♀</span>{d.assignedFemales}</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Result filter UI */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  Filter Results
                </CardTitle>
                <CardDescription className="text-xs">Narrow the matched pairs shown below without recalculating.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-muted-foreground font-medium">Type:</span>
                  <div className="flex rounded-md overflow-hidden border border-input">
                    {(["all", "combat", "non-combat"] as const).map((t) => (
                      <button key={t} onClick={() => setResultTypeFilter(t)}
                        className={`px-3 h-7 text-xs font-medium transition-colors ${resultTypeFilter === t
                          ? t === "combat" ? "bg-red-500 text-white" : t === "non-combat" ? "bg-sky-500 text-white" : "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground"}`}>
                        {t === "all" ? "All" : t === "combat" ? "⚔ Combat" : "🌿 Non-Combat"}
                      </button>
                    ))}
                  </div>
                </div>
                {result.matches.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-muted-foreground font-medium w-16 shrink-0">Include:</span>
                      <div className="flex flex-wrap gap-1">
                        {resultIncludeJobs.map((j) => (
                          <Badge key={j} className="gap-1 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700 border">
                            {j}<button onClick={() => setResultIncludeJobs((prev) => prev.filter((x) => x !== j))}><X className="w-2.5 h-2.5 ml-0.5" /></button>
                          </Badge>
                        ))}
                        <select value="" onChange={(e) => { if (e.target.value) setResultIncludeJobs((prev) => prev.includes(e.target.value) ? prev : [...prev, e.target.value]); }}
                          className="h-6 text-xs rounded border border-dashed border-input bg-background px-2 text-muted-foreground">
                          <option value="">+ Add job…</option>
                          {result.matches.flatMap((m) => [m.maleJob, m.femaleJob]).filter((v, i, a) => a.indexOf(v) === i && !resultIncludeJobs.includes(v)).sort().map((j) => <option key={j} value={j}>{j}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-muted-foreground font-medium w-16 shrink-0">Exclude:</span>
                      <div className="flex flex-wrap gap-1">
                        {resultExcludeJobs.map((j) => (
                          <Badge key={j} className="gap-1 px-2 py-0.5 text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700 border">
                            {j}<button onClick={() => setResultExcludeJobs((prev) => prev.filter((x) => x !== j))}><X className="w-2.5 h-2.5 ml-0.5" /></button>
                          </Badge>
                        ))}
                        <select value="" onChange={(e) => { if (e.target.value) setResultExcludeJobs((prev) => prev.includes(e.target.value) ? prev : [...prev, e.target.value]); }}
                          className="h-6 text-xs rounded border border-dashed border-input bg-background px-2 text-muted-foreground">
                          <option value="">+ Exclude job…</option>
                          {result.matches.flatMap((m) => [m.maleJob, m.femaleJob]).filter((v, i, a) => a.indexOf(v) === i && !resultExcludeJobs.includes(v)).sort().map((j) => <option key={j} value={j}>{j}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Matched Pairs</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Click 🔓 to lock a pair. Edit job names in locked rows to override.
                      {desiredChildren.length > 0 && <> · <span className="text-violet-600 dark:text-violet-400">Purple rows</span> cover your priority children.</>}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {filteredMatches.length !== result.matches.length && (
                      <Badge variant="outline" className="text-xs">{result.matches.length} total</Badge>
                    )}
                    <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground shrink-0">{filteredMatches.length} shown</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {result.matches.length === 0
                      ? "No matches found. Check that compatible pairs cover jobs with both male and female slots at the same character rank."
                      : "No matches pass the current filters. Try adjusting the filter above."}
                  </p>
                ) : (
                  <div className="space-y-5">
                    {RANKS.map((rank) => {
                      const rankMatches = filteredMatches.filter((m) => m.rank === rank);
                      if (rankMatches.length === 0) return null;
                      const allJobsForRank = [...new Set([
                        ...jobsPerRank[rank],
                        ...rankMatches.map((m) => m.maleJob),
                        ...rankMatches.map((m) => m.femaleJob),
                      ])].sort();
                      return (
                        <div key={rank}>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`text-xs font-bold px-2 border ${RANK_STYLE[rank].badge}`}>Rank {rank}</Badge>
                            <span className="text-xs text-muted-foreground">{rankMatches.length} match{rankMatches.length !== 1 ? "es" : ""}</span>
                            {rankMatches.some((m) => m.locked) && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-600 dark:text-amber-400 px-1.5 py-0">
                                <Lock className="w-2.5 h-2.5" />{rankMatches.filter((m) => m.locked).length} locked
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1.5 pl-1">
                            {rankMatches.map((m, i) => (
                              <MatchRow key={m.id} match={m} index={i}
                                rankJobNames={allJobsForRank.length > 0 ? allJobsForRank : sortedJobNames}
                                pairs={pairs}
                                desiredChildren={desiredChildren}
                                onLock={lockMatch} onUnlock={unlockMatch}
                                onChangeMale={changeLockedMale} onChangeFemale={changeLockedFemale}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(result.unmatchedMale.length > 0 || result.unmatchedFemale.length > 0) && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                    {result.unmatchedMale.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5"><span className="text-blue-500 font-bold">♂</span> Unmatched male slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedMale.map((u, i) => (
                            <Badge key={i} variant="secondary" className="text-xs gap-1">
                              <span className="text-blue-500 font-bold">♂</span>{u.job}
                              <span className={`text-[10px] ${RANK_STYLE[u.rank].badge} rounded px-1`}>{u.rank}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.unmatchedFemale.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5"><span className="text-rose-500 font-bold">♀</span> Unmatched female slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedFemale.map((u, i) => (
                            <Badge key={i} variant="outline" className="text-xs text-muted-foreground gap-1">
                              <span className="text-rose-500 font-bold">♀</span>{u.job}
                              <span className={`text-[10px] ${RANK_STYLE[u.rank].badge} rounded px-1`}>{u.rank}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border flex items-center justify-end text-sm">
                  <span className="text-muted-foreground">Total matched: <strong className="text-foreground">{result.matches.length}</strong></span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {isCalculating && (
          <div className="mt-6 flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Running optimal matching algorithm…</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Kingdom Adventures Match Finder — open source</span>
          <a href="https://replit.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ExternalLink className="w-3 h-3" /> Fork &amp; edit on Replit
          </a>
        </div>
      </div>
    </div>
  );
}
