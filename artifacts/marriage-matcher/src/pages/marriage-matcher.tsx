import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Trash2, Zap, RefreshCw, HelpCircle, ArrowLeftRight,
  X, Lock, LockOpen, Moon, Sun, Loader2, AlertTriangle, ExternalLink,
  ArrowLeft, Info, Star, Baby, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/searchable-select";
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
import { fetchSharedWithFallback } from "@/lib/local-shared-data";

// âââ API ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
    queryFn: () => fetchSharedWithFallback<{ jobs: Record<string, JobData>; pairs?: SharedPair[] }>(API("/shared")),
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

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
  affinity?: string;
}

const AFFINITY_STYLE: Record<string, string> = {
  A: "bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-600",
  B: "bg-violet-100 text-violet-800 border-violet-400 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-600",
  C: "bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-600",
  D: "bg-sky-100 text-sky-800 border-sky-400 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-600",
  E: "bg-slate-100 text-slate-600 border-slate-400 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
};

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

// âââ Algorithm ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function normJob(name: string) { return name.trim().toLowerCase(); }
function pairKey(a: string, b: string) {
  return [normJob(a), normJob(b)].sort().join("|");
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
  const lockedMaleNeeds = lockedForRank.reduce<Record<string, number>>((acc, lp) => {
    acc[lp.maleJob] = (acc[lp.maleJob] ?? 0) + 1;
    return acc;
  }, {});
  const lockedFemaleNeeds = lockedForRank.reduce<Record<string, number>>((acc, lp) => {
    acc[lp.femaleJob] = (acc[lp.femaleJob] ?? 0) + 1;
    return acc;
  }, {});

  const withUnassigned: RankSlot[] = [];
  const baseMales: Record<string, number> = {};
  const baseFemales: Record<string, number> = {};

  for (const s of rankSlots) {
    let remainingMales = s.males;
    let remainingFemales = s.females;
    let remainingUnassigned = s.unassigned;

    const lockedMale = lockedMaleNeeds[s.jobName] ?? 0;
    const lockedFemale = lockedFemaleNeeds[s.jobName] ?? 0;

    const maleFromAssigned = Math.min(remainingMales, lockedMale);
    remainingMales -= maleFromAssigned;
    const femaleFromAssigned = Math.min(remainingFemales, lockedFemale);
    remainingFemales -= femaleFromAssigned;

    const stillNeeded = Math.max(0, lockedMale - maleFromAssigned) + Math.max(0, lockedFemale - femaleFromAssigned);
    remainingUnassigned = Math.max(0, remainingUnassigned - stillNeeded);

    if (remainingMales > 0) baseMales[s.jobName] = (baseMales[s.jobName] ?? 0) + remainingMales;
    if (remainingFemales > 0) baseFemales[s.jobName] = (baseFemales[s.jobName] ?? 0) + remainingFemales;
    if (remainingUnassigned > 0) withUnassigned.push({ ...s, males: 0, females: 0, unassigned: remainingUnassigned });
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

// âââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function generateId() { return Math.random().toString(36).slice(2, 9); }
function makePair(a: string, b: string): Pair { return { id: generateId(), jobA: a, jobB: b, children: [] }; }

function buildPossibleChildren(
  jobA: string,
  jobB: string,
  extraChildren: string[],
  includeParentInheritance = true
): string[] {
  if ([jobA, jobB].some((job) => normJob(job) === "monarch")) {
    return ["Royal"];
  }
  const pool = includeParentInheritance ? [jobA, jobB, ...extraChildren] : [...extraChildren];
  return [...new Set(pool)];
}

function getPossibleChildren(match: MatchResult, pairs: Pair[]): string[] {
  const pair = pairs.find((p) => pairKey(p.jobA, p.jobB) === pairKey(match.maleJob, match.femaleJob));
  return buildPossibleChildren(match.maleJob, match.femaleJob, pair?.children ?? []);
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

// âââ RankTable ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface RankTableProps {
  rank: Rank;
  slots: RankSlot[];
  availableJobs: string[];
  totalFirstGenCount: number;
  onUpdate: (id: string, field: "males" | "females" | "unassigned", value: number) => void;
  onRemove: (id: string) => void;
  onAdd: (rank: Rank, jobName: string) => void;
}

function CountInput({
  value,
  onCommit,
  className = "",
}: {
  value: number;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setLocal(value === 0 ? "" : String(value));
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = local.trim();
    const parsed = trimmed === "" ? 0 : parseInt(trimmed, 10);
    const next = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    onCommit(next);
    setLocal(next === 0 ? "" : String(next));
  }, [local, onCommit]);

  return (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      value={local}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
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
                  <CountInput value={slot.males} onCommit={(value) => onUpdate(slot.id, "males", value)} className="h-7 text-center text-sm px-1" />
                  <CountInput value={slot.females} onCommit={(value) => onUpdate(slot.id, "females", value)} className="h-7 text-center text-sm px-1" />
                  <CountInput value={slot.unassigned} onCommit={(value) => onUpdate(slot.id, "unassigned", value)} className="h-7 text-center text-sm px-1 border-amber-300 dark:border-amber-700 focus-visible:ring-amber-400" />
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
          <SearchableSelect
            value=""
            clearOnSelect
            onChange={(v) => { if (v) onAdd(rank, v); }}
            options={availableJobs.map((n) => ({ value: n, label: n }))}
            placeholder={`+ Add a job you own at Rank ${rank}…`}
            className="mt-3"
            triggerClassName="h-8 text-sm"
          />
        ) : totalFirstGenCount === 0 ? (
          <p className="text-xs text-muted-foreground text-center mt-3 py-1">
            No Non-Marriage jobs in database yet — add them in the Jobs tool.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center mt-3 py-1">
            All {totalFirstGenCount} Non-Marriage jobs already added to this rank.
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
            <CardTitle className="text-base">Non-Marriage Jobs</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Automatically loaded from the Jobs Tool. Only Non-Marriage jobs can be parents.
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
            <p className="text-xs text-muted-foreground">No Non-Marriage jobs found. Add them in the Jobs Tool first.</p>
          )}
          {jobNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-xs px-2 py-1">{name}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{jobNames.length} Non-Marriage job{jobNames.length !== 1 ? "s" : ""}</p>
      </CardContent>
    </Card>
  );
}

// âââ Pairs Panel ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const ALL_AFFINITIES = ["A", "B", "C", "D", "E"] as const;

type ChildTypeFilter = "all" | "combat" | "non-combat";
type ExclusiveFilter = "all" | "exclude-exclusive" | "only-exclusive";

interface PairsPanelProps {
  pairs: Pair[];
  jobTypeMap: Record<string, "combat" | "non-combat">;
  jobGenMap: Record<string, 1 | 2>;
  allJobNames: string[];
}

function PairsPanel({ pairs, jobTypeMap, jobGenMap, allJobNames }: PairsPanelProps) {
  const [pairAffinityFilter, setPairAffinityFilter] = useState<Set<string>>(new Set(["A", "B", "C", "D", "E"]));
  const [pairChildTypeFilter, setPairChildTypeFilter] = useState<ChildTypeFilter>("all");
  const [pairExclusiveFilter, setPairExclusiveFilter] = useState<ExclusiveFilter>("all");
  const [includeParentInheritance, setIncludeParentInheritance] = useState(true);
  const [pairParentFilter, setPairParentFilter] = useState<string>("all");
  const [pairChildFilter, setPairChildFilter] = useState<string>("all");

  const toggleAffinity = (aff: string) => {
    const next = new Set(pairAffinityFilter);
    if (next.has(aff)) next.delete(aff);
    else next.add(aff);
    setPairAffinityFilter(next);
  };

  const filtered = pairs.filter((p) => {
    if (p.affinity && !pairAffinityFilter.has(p.affinity)) return false;

    const possibleChildren = buildPossibleChildren(p.jobA, p.jobB, p.children, includeParentInheritance);

    if (pairParentFilter !== "all") {
      const parentMatch =
        normJob(p.jobA) === normJob(pairParentFilter) ||
        normJob(p.jobB) === normJob(pairParentFilter);
      if (!parentMatch) return false;
    }

    if (pairChildFilter !== "all") {
      const childMatch = possibleChildren.some((child) => normJob(child) === normJob(pairChildFilter));
      if (!childMatch) return false;
    }

    const typeOk = pairChildTypeFilter === "all"
      || possibleChildren.some((child) => jobTypeMap[child] === pairChildTypeFilter);
    if (!typeOk) return false;

    const exclusiveOk = pairExclusiveFilter === "all"
      || possibleChildren.some((child) =>
        pairExclusiveFilter === "exclude-exclusive" ? jobGenMap[child] !== 2 : jobGenMap[child] === 2
      );
    if (!exclusiveOk) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => pairKey(a.jobA, a.jobB).localeCompare(pairKey(b.jobA, b.jobB)));
  const parentOptions = allJobNames.map((job) => ({ value: job, label: job }));
  const childOptions = [...new Set([
    ...allJobNames,
    ...pairs.flatMap((p) => buildPossibleChildren(p.jobA, p.jobB, p.children, true)),
  ])].sort((a, b) => a.localeCompare(b)).map((job) => ({ value: job, label: job }));

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Compatible Pairs & Children</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Affinity:</span>
            {ALL_AFFINITIES.map((aff) => {
              const active = pairAffinityFilter.has(aff);
              return (
                <button
                  key={aff}
                  onClick={() => toggleAffinity(aff)}
                  className={`text-xs font-bold px-2 py-0.5 rounded border transition-all ${active ? (AFFINITY_STYLE[aff] ?? "bg-muted border-border text-foreground") : "bg-transparent border-border text-muted-foreground opacity-40"}`}
                >
                  {aff}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Parent job:</span>
              <SearchableSelect
                value={pairParentFilter}
                onChange={(v) => setPairParentFilter(v || "all")}
                options={[{ value: "all", label: "All parents" }, ...parentOptions]}
                placeholder="All parents"
                triggerClassName="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Child job:</span>
              <SearchableSelect
                value={pairChildFilter}
                onChange={(v) => setPairChildFilter(v || "all")}
                options={[{ value: "all", label: "All children" }, ...childOptions]}
                placeholder="All children"
                triggerClassName="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Child type:</span>
            <div className="flex rounded-md overflow-hidden border border-input">
              {(["all", "combat", "non-combat"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPairChildTypeFilter(mode)}
                  className={`px-2.5 h-7 text-[11px] font-medium transition-colors ${
                    pairChildTypeFilter === mode
                      ? mode === "combat"
                        ? "bg-red-500 text-white"
                        : mode === "non-combat"
                          ? "bg-sky-500 text-white"
                          : "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "all" ? "All" : mode === "combat" ? "Combat" : "Non-Combat"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Marriage Exclusive:</span>
            <div className="flex rounded-md overflow-hidden border border-input">
              {([
                { value: "all", label: "All" },
                { value: "only-exclusive", label: "Marriage Exclusive" },
                { value: "exclude-exclusive", label: "Non-Marriage Exclusive" },
              ] as const).map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setPairExclusiveFilter(mode.value)}
                  className={`px-2.5 h-7 text-[11px] font-medium transition-colors ${
                    pairExclusiveFilter === mode.value
                      ? "bg-orange-500 text-white"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Parent inheritance:</span>
            <button
              onClick={() => setIncludeParentInheritance((v) => !v)}
              className={`px-2.5 h-7 text-[11px] font-medium rounded-md border transition-colors ${
                includeParentInheritance
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-background text-muted-foreground border-input hover:text-foreground"
              }`}
            >
              {includeParentInheritance ? "Included" : "Ignored"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              When included, parent jobs count as possible child outcomes.
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} of {pairs.length} pairs.
            </span>
            {(pairParentFilter !== "all" || pairChildFilter !== "all") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPairParentFilter("all");
                  setPairChildFilter("all");
                }}
                className="h-6 px-2 text-xs"
              >
                Clear parent/child
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {sorted.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No pairs defined yet.</p>}
            {sorted.map((p) => {
              const [d1, d2] = [p.jobA, p.jobB].sort();
              const sortedChildren = [...buildPossibleChildren(p.jobA, p.jobB, p.children, includeParentInheritance)].sort();
              return (
                <div key={p.id} className="px-3 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
                    {p.affinity && (
                      <span className={`text-[10px] font-bold px-1 py-0 rounded border shrink-0 ${AFFINITY_STYLE[p.affinity] ?? "bg-muted border-border"}`}>{p.affinity}</span>
                    )}
                    <span className="font-medium truncate">{d1}</span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{d2}</span>
                  </div>
                  {sortedChildren.length > 0 && (
                    <div className="mt-1.5 ml-6 flex flex-wrap gap-1.5">
                      {sortedChildren.map((c) => (
                        <Badge key={c} variant="secondary" className="text-xs gap-1.5 px-2 py-1">
                          <Baby className="w-3 h-3 text-violet-500" />{c}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{pairs.length} pair{pairs.length !== 1 ? "s" : ""} loaded.</p>
      </CardContent>
    </Card>
  );
}

interface PlannerSetupProps {
  affinityFilter: Set<string>;
  onAffinityFilterChange: (aff: Set<string>) => void;
  targetChildTypeFilter: ChildTypeFilter;
  onTargetChildTypeFilterChange: (mode: ChildTypeFilter) => void;
  targetExclusiveFilter: ExclusiveFilter;
  onTargetExclusiveFilterChange: (mode: ExclusiveFilter) => void;
  targetIncludeJobs: string[];
  onAddIncludeJob: (job: string) => void;
  onRemoveIncludeJob: (job: string) => void;
  targetExcludeJobs: string[];
  onAddExcludeJob: (job: string) => void;
  onRemoveExcludeJob: (job: string) => void;
  targetPoolJobs: string[];
  onResetSetup: () => void;
  allJobNames: string[];
}

function PlannerSetup({
  affinityFilter,
  onAffinityFilterChange,
  targetChildTypeFilter,
  onTargetChildTypeFilterChange,
  targetExclusiveFilter,
  onTargetExclusiveFilterChange,
  targetIncludeJobs,
  onAddIncludeJob,
  onRemoveIncludeJob,
  targetExcludeJobs,
  onAddExcludeJob,
  onRemoveExcludeJob,
  targetPoolJobs,
  onResetSetup,
  allJobNames,
}: PlannerSetupProps) {
  const toggleAffinity = (aff: string) => {
    const next = new Set(affinityFilter);
    if (next.has(aff)) next.delete(aff);
    else next.add(aff);
    onAffinityFilterChange(next);
  };

  return (
    <Card className="shadow-sm border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Planner Setup</CardTitle>
        <CardDescription className="text-xs">
          Choose the affinities and child targets you want to plan around before calculating.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Allowed affinity:</span>
            {ALL_AFFINITIES.map((aff) => {
              const active = affinityFilter.has(aff);
              return (
                <button
                  key={aff}
                  onClick={() => toggleAffinity(aff)}
                  className={`text-xs font-bold px-2 py-0.5 rounded border transition-all ${active ? (AFFINITY_STYLE[aff] ?? "bg-muted border-border text-foreground") : "bg-transparent border-border text-muted-foreground opacity-40"}`}
                >
                  {aff}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Only pairs with these compatibility ranks will be considered during calculation.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Target child pool:</span>
            <div className="flex rounded-md overflow-hidden border border-input">
              {(["all", "combat", "non-combat"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onTargetChildTypeFilterChange(mode)}
                  className={`px-2.5 h-7 text-[11px] font-medium transition-colors ${
                    targetChildTypeFilter === mode
                      ? mode === "combat"
                        ? "bg-red-500 text-white"
                        : mode === "non-combat"
                          ? "bg-sky-500 text-white"
                          : "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "all" ? "All" : mode === "combat" ? "Combat" : "Non-Combat"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Marriage Exclusive:</span>
            <div className="flex rounded-md overflow-hidden border border-input">
              {([
                { value: "all", label: "All" },
                { value: "only-exclusive", label: "Marriage Exclusive" },
                { value: "exclude-exclusive", label: "Non-Marriage Exclusive" },
              ] as const).map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => onTargetExclusiveFilterChange(mode.value)}
                  className={`px-2.5 h-7 text-[11px] font-medium transition-colors ${
                    targetExclusiveFilter === mode.value
                      ? "bg-orange-500 text-white"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground font-medium">Include:</span>
            {targetIncludeJobs.map((job) => (
              <Badge key={job} className="gap-1 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700 border">
                {job}
                <button onClick={() => onRemoveIncludeJob(job)}><X className="w-2.5 h-2.5 ml-0.5" /></button>
              </Badge>
            ))}
            <SearchableSelect
              value=""
              clearOnSelect
              onChange={(v) => { if (v) onAddIncludeJob(v); }}
              options={allJobNames
                .filter((job) => !targetIncludeJobs.includes(job))
                .sort()
                .map((job) => ({ value: job, label: job }))}
              placeholder="+ Include job"
              triggerClassName="h-6 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground font-medium">Exclude:</span>
            {targetExcludeJobs.map((job) => (
              <Badge key={job} className="gap-1 px-2 py-0.5 text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700 border">
                {job}
                <button onClick={() => onRemoveExcludeJob(job)}><X className="w-2.5 h-2.5 ml-0.5" /></button>
              </Badge>
            ))}
            <SearchableSelect
              value=""
              clearOnSelect
              onChange={(v) => { if (v) onAddExcludeJob(v); }}
              options={allJobNames
                .filter((job) => !targetExcludeJobs.includes(job))
                .sort()
                .map((job) => ({ value: job, label: job }))}
              placeholder="+ Exclude job"
              triggerClassName="h-6 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Setup:</span>
            <Button size="sm" variant="ghost" onClick={onResetSetup} className="h-7 text-xs">
              Reset Setup
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Current target pool: <span className="font-medium text-foreground">{targetPoolJobs.length}</span> job{targetPoolJobs.length !== 1 ? "s" : ""}
              </p>
            </div>
            {targetPoolJobs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {targetPoolJobs.slice(0, 18).map((job) => (
                  <Badge key={job} variant="outline" className="text-[10px] px-1.5 py-0">{job}</Badge>
                ))}
                {targetPoolJobs.length > 18 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    +{targetPoolJobs.length - 18} more
                  </Badge>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              The planner now uses this target pool directly when checking desired child coverage.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// âââ Match Row ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
    () => desiredChildren.filter((c) => possibleChildren.some((p) => normJob(p) === normJob(c))),
    [desiredChildren, possibleChildren]
  );
  const hasDesired = desiredHere.length > 0;

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
            <SearchableSelect
              value={match.maleJob}
              onChange={(v) => onChangeMale(match.id, v)}
              options={rankJobNames.map((n) => ({ value: n, label: n }))}
              className="flex-1 min-w-0"
              triggerClassName="h-7 text-sm"
            />
          ) : (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-base font-bold text-blue-500 leading-none shrink-0">â</span>
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
            <SearchableSelect
              value={match.femaleJob}
              onChange={(v) => onChangeFemale(match.id, v)}
              options={rankJobNames.map((n) => ({ value: n, label: n }))}
              className="flex-1 min-w-0"
              triggerClassName="h-7 text-sm"
            />
        ) : (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-base font-bold text-rose-500 leading-none shrink-0">â</span>
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
            {isLocked ? "Unlock â let algorithm reassign" : "Lock this pair for future calculations"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Children row */}
      {possibleChildren.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap pl-7">
          <Baby className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground">Child can be:</span>
          {possibleChildren.map((c) => {
            const isPriority = desiredChildren.some((d) => normJob(d) === normJob(c));
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

// âââ Info Dialog ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
          <DialogTitle>How to use Match Finder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div>
            <h3 className="font-semibold text-foreground mb-1">Compatibility vs Character Rank</h3>
            <p>This tool helps you plan optimal marriages using the loaded compatible pairs. Character rank (S/A/B/C/D) is separate and refers to how leveled up your character is, and it is not the same as marriage compatibility.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">1. Jobs (auto-loaded)</h3>
            <p>Non-Marriage jobs are loaded automatically from the <strong>Jobs Tool</strong>. Only Non-Marriage jobs can be parents.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">2. Assign to character rank tables</h3>
            <p>For each character rank (S through D), add the relevant jobs and enter how many <strong>male</strong> / <strong>female</strong> characters you have at that rank. Use <strong>Unassigned</strong> for undecided genders â the algorithm splits them to maximise matches.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">3. Compatible pairs & children</h3>
            <p>Review which job pairs can marry in the reference section below the calculator.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">4. Child targets</h3>
            <p>Use Planner Setup to target the child jobs you want. After calculating, results highlight matches that can produce your desired children through parent inheritance or a defined outcome child. Monarch is excluded from parent inheritance and only produces Royal.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">5. Calculate & lock</h3>
            <p>Click <strong>Calculate</strong> to find the optimal matching. Lock pairs with ð to keep them fixed across recalculations.</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            <strong className="text-foreground">Private to this browser:</strong> Rank assignments, locks, and filters are saved only on this device.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// âââ Main Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function MarriageMatcher() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_marriage") ?? "");
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [darkMode]);

  // ââ API data ââ
  const { data: sharedData, isLoading: jobsLoading } = useSharedData();

  const apiFirstGenJobs = useMemo(() => {
    if (!sharedData?.jobs) return null;
    const seen = new Set<string>();
    return Object.keys(sharedData.jobs)
      .filter((name) => {
        if (sharedData.jobs[name].generation !== 1) return false;
        const key = normJob(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort();
  }, [sharedData]);

  const apiAllJobs = useMemo(() => {
    if (!sharedData?.jobs) return null;
    const seen = new Set<string>();
    return Object.keys(sharedData.jobs)
      .filter((name) => {
        const key = normJob(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort();
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

  const jobGenMap = useMemo(() => {
    if (!sharedData?.jobs) return {} as Record<string, 1 | 2>;
    const map: Record<string, 1 | 2> = {};
    for (const [name, job] of Object.entries(sharedData.jobs)) {
      map[name] = job.generation;
    }
    return map;
  }, [sharedData]);

  // ââ Job names: API-first, localStorage cache as fallback ââ
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

  // ââ State: rank slots ââ
  const [rankSlots, setRankSlots] = useState<RankSlot[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_rankSlots");
      if (s) return JSON.parse(s) as RankSlot[];
    } catch { /* ignore */ }
    return [];
  });

  // ââ State: pairs â loaded from API (community), fallback to localStorage ââ
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

  // ââ State: locked pairs ââ
  const [lockedPairs, setLockedPairs] = useState<LockedPair[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_lockedPairs");
      if (s) return JSON.parse(s) as LockedPair[];
    } catch { /* ignore */ }
    return [];
  });

  // ââ State: desired / priority children ââ
  const [desiredChildren, setDesiredChildren] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_desiredChildren");
      if (s) return JSON.parse(s) as string[];
    } catch { /* ignore */ }
    return [];
  });

  const [targetChildTypeFilter, setTargetChildTypeFilter] = useState<ChildTypeFilter>("all");
  const [targetExclusiveFilter, setTargetExclusiveFilter] = useState<ExclusiveFilter>("all");
  const [targetIncludeJobs, setTargetIncludeJobs] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_targetIncludeJobs");
      if (s) return JSON.parse(s) as string[];
    } catch { /* ignore */ }
    return [];
  });
  const [targetExcludeJobs, setTargetExcludeJobs] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("ka_mf_targetExcludeJobs");
      if (s) return JSON.parse(s) as string[];
    } catch { /* ignore */ }
    return [];
  });

  // ââ State: affinity filter (for matching and pair list) ââ
  const [affinityFilter, setAffinityFilter] = useState<Set<string>>(new Set(["A", "B", "C", "D", "E"]));
  const filteredPairs = useMemo(
    () => pairs.filter((p) => !p.affinity || affinityFilter.has(p.affinity)),
    [pairs, affinityFilter]
  );
  const targetPoolJobs = useMemo(() => {
    const filtered = allJobNames.filter((name) => {
      const typeOk = targetChildTypeFilter === "all" || jobTypeMap[name] === targetChildTypeFilter;
      const exclusiveOk = targetExclusiveFilter === "all"
        || (targetExclusiveFilter === "exclude-exclusive" ? jobGenMap[name] !== 2 : jobGenMap[name] === 2);
      return typeOk && exclusiveOk;
    });
    return [...new Set([...filtered, ...targetIncludeJobs])]
      .filter((job) => !targetExcludeJobs.some((excluded) => normJob(excluded) === normJob(job)))
      .sort();
  }, [allJobNames, jobGenMap, jobTypeMap, targetChildTypeFilter, targetExclusiveFilter, targetIncludeJobs, targetExcludeJobs]);

  // ââ State: result filters ââ
  const [resultTypeFilter, setResultTypeFilter] = useState<"all" | "combat" | "non-combat">("all");
  const [resultIncludeJobs, setResultIncludeJobs] = useState<string[]>([]);
  const [resultExcludeJobs, setResultExcludeJobs] = useState<string[]>([]);

  // ââ Sync pairs from API (one-time on first load) ââ
  const pairsRef = useRef(pairs);
  useEffect(() => { pairsRef.current = pairs; }, [pairs]);

  useEffect(() => {
    if (!apiPairs || pairsLoadedFromApi) return;
    setPairsLoadedFromApi(true);
    if (apiPairs.length > 0) {
      setPairs(apiPairs);
    } else {
      // API has no pairs yet â push our local pairs up to the backend
      persistPairs(pairsRef.current, "community");
    }
  }, [apiPairs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ââ Persist ââ
  useEffect(() => { localStorage.setItem("ka_mf_rankSlots", JSON.stringify(rankSlots)); }, [rankSlots]);
  useEffect(() => {
    localStorage.setItem("ka_mf_pairs", JSON.stringify(pairs));
    if (pairsLoadedFromApi) {
      persistPairs(pairs, "community");
    }
  }, [pairs, pairsLoadedFromApi]);
  useEffect(() => { localStorage.setItem("ka_mf_lockedPairs", JSON.stringify(lockedPairs)); }, [lockedPairs]);
  useEffect(() => { localStorage.setItem("ka_mf_desiredChildren", JSON.stringify(desiredChildren)); }, [desiredChildren]);
  useEffect(() => { localStorage.setItem("ka_mf_targetIncludeJobs", JSON.stringify(targetIncludeJobs)); }, [targetIncludeJobs]);
  useEffect(() => { localStorage.setItem("ka_mf_targetExcludeJobs", JSON.stringify(targetExcludeJobs)); }, [targetExcludeJobs]);

  // ââ Result state ââ
  const [result, setResult] = useState<OptimalResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isStale, setIsStale] = useState(false);

  const markStale = useCallback(() => setIsStale(true), []);

  // ââ Slot actions ââ
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
      if (prev.some((s) => s.rank === rank && normJob(s.jobName) === normJob(name))) return prev;
      return [...prev, { id: generateId(), rank, jobName: name, males: 0, females: 0, unassigned: 0 }];
    });
    markStale();
  }, [markStale]);

  // ââ Pair actions ââ
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

  // ââ Lock actions ââ
  const lockMatch = useCallback((matchId: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const match = prev.matches.find((m) => m.id === matchId);
      if (!match) return prev;
      if (match.locked) return prev;
      const lp: LockedPair = { id: generateId(), maleJob: match.maleJob, femaleJob: match.femaleJob, rank: match.rank };
      setLockedPairs((lps) => lps.some((existing) => existing.id === matchId) ? lps : [...lps, lp]);
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

  // ââ Priority child actions ââ
  const addDesiredChild = useCallback((child: string) => {
    setDesiredChildren((prev) => prev.some((c) => normJob(c) === normJob(child)) ? prev : [...prev, child].sort());
  }, []);

  const removeDesiredChild = useCallback((child: string) => {
    setDesiredChildren((prev) => prev.filter((c) => normJob(c) !== normJob(child)));
  }, []);

  const addTargetIncludeJob = useCallback((job: string) => {
    setTargetIncludeJobs((prev) => prev.some((j) => normJob(j) === normJob(job)) ? prev : [...prev, job].sort());
  }, []);

  const removeTargetIncludeJob = useCallback((job: string) => {
    setTargetIncludeJobs((prev) => prev.filter((j) => normJob(j) !== normJob(job)));
  }, []);

  const addTargetExcludeJob = useCallback((job: string) => {
    setTargetExcludeJobs((prev) => prev.some((j) => normJob(j) === normJob(job)) ? prev : [...prev, job].sort());
  }, []);

  const removeTargetExcludeJob = useCallback((job: string) => {
    setTargetExcludeJobs((prev) => prev.filter((j) => normJob(j) !== normJob(job)));
  }, []);

  const resetPlannerSetup = useCallback(() => {
    setAffinityFilter(new Set(ALL_AFFINITIES));
    setTargetChildTypeFilter("all");
    setTargetExclusiveFilter("all");
    setTargetIncludeJobs([]);
    setTargetExcludeJobs([]);
    setDesiredChildren([]);
  }, []);

  useEffect(() => {
    setDesiredChildren((prev) => {
      if (
        prev.length === targetPoolJobs.length
        && prev.every((job, index) => normJob(job) === normJob(targetPoolJobs[index]))
      ) {
        return prev;
      }
      return targetPoolJobs;
    });
  }, [targetPoolJobs]);

  // ââ Calculate ââ
  const calculate = useCallback(() => {
    setIsCalculating(true);
    setIsStale(false);
    setTimeout(() => {
      setResult(findOptimalMatching(rankSlots, filteredPairs, lockedPairs));
      setIsCalculating(false);
    }, 80);
  }, [rankSlots, filteredPairs, lockedPairs]);

  const reset = useCallback(() => {
    setRankSlots([]);
    setPairs(DEFAULT_PAIRS.map((p) => ({ ...p, id: generateId() })));
    setLockedPairs([]);
    setDesiredChildren([]);
    setTargetChildTypeFilter("all");
    setTargetExclusiveFilter("all");
    setTargetIncludeJobs([]);
    setTargetExcludeJobs([]);
    setResult(null);
    setIsStale(false);
  }, []);

  // ââ Derived ââ
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

  // ââ Child coverage for results ââ
  const childCoverage = useMemo(() => {
    if (!result || desiredChildren.length === 0) return [];
    return desiredChildren.map((child) => {
      const coveringMatches = result.matches.filter((m) =>
        getPossibleChildren(m, pairs).some((p) => normJob(p) === normJob(child))
      );
      return { child, matches: coveringMatches };
    }).filter(({ matches }) => matches.length > 0);
  }, [result, desiredChildren, pairs]);

  const hasLocked = lockedPairs.length > 0;

  // ââ Filtered matches (result type filter) ââ
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
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Match Finder</h1>
              <p className="mt-1 text-muted-foreground text-sm max-w-xl">
                Set your rank slots, choose your affinity and child targets, and let the planner find the best matches.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setShowNote((v) => !v)} className="h-8 w-8 text-muted-foreground" title="Personal notes (private, stored on this device)">
              <Info className="w-3.5 h-3.5" />
            </Button>
            <InfoDialog />
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

        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(e) => setPageNote(e.target.value)}
              onBlur={() => localStorage.setItem("ka_note_marriage", pageNote)}
              placeholder="Personal notes for this pageâ¦ (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}

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

        <div className="mt-6">
          <PlannerSetup
            affinityFilter={affinityFilter}
            onAffinityFilterChange={setAffinityFilter}
            targetChildTypeFilter={targetChildTypeFilter}
            onTargetChildTypeFilterChange={setTargetChildTypeFilter}
            targetExclusiveFilter={targetExclusiveFilter}
            onTargetExclusiveFilterChange={setTargetExclusiveFilter}
            targetIncludeJobs={targetIncludeJobs}
            onAddIncludeJob={addTargetIncludeJob}
            onRemoveIncludeJob={removeTargetIncludeJob}
            targetExcludeJobs={targetExcludeJobs}
            onAddExcludeJob={addTargetExcludeJob}
            onRemoveExcludeJob={removeTargetExcludeJob}
            targetPoolJobs={targetPoolJobs}
            onResetSetup={resetPlannerSetup}
            allJobNames={allJobNames}
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
              ? <><Loader2 className="w-4 h-4 animate-spin" />Calculatingâ¦</>
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
                    <CardTitle className="text-sm text-violet-800 dark:text-violet-300">Desired Child Coverage</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {childCoverage.map(({ child, matches: coverMatches }) => (
                      <div key={child} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm border-violet-300 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-700">
                        <Star className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-xs">{child}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Covered by {coverMatches.length} match{coverMatches.length !== 1 ? "es" : ""}: {coverMatches.map((m) => `${m.maleJob} × ${m.femaleJob}`).join(", ")}
                          </p>
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
                        <span className="text-muted-foreground">â</span>
                        {d.assignedMales > 0 && <Badge variant="secondary" className="text-xs gap-1"><span className="text-blue-500">â</span>{d.assignedMales}</Badge>}
                        {d.assignedFemales > 0 && <Badge variant="outline" className="text-xs border-primary/30 text-primary gap-1"><span className="text-rose-500">â</span>{d.assignedFemales}</Badge>}
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
                        {t === "all" ? "All" : t === "combat" ? "â Combat" : "ð¿ Non-Combat"}
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
                        <SearchableSelect
                          value=""
                          clearOnSelect
                          onChange={(v) => { if (v) setResultIncludeJobs((prev) => prev.includes(v) ? prev : [...prev, v]); }}
                          options={result.matches.flatMap((m) => [m.maleJob, m.femaleJob]).filter((v, i, a) => a.indexOf(v) === i && !resultIncludeJobs.includes(v)).sort().map((j) => ({ value: j, label: j }))}
                          placeholder="+ Add jobâ¦"
                          triggerClassName="h-6 text-xs"
                        />
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
                        <SearchableSelect
                          value=""
                          clearOnSelect
                          onChange={(v) => { if (v) setResultExcludeJobs((prev) => prev.includes(v) ? prev : [...prev, v]); }}
                          options={result.matches.flatMap((m) => [m.maleJob, m.femaleJob]).filter((v, i, a) => a.indexOf(v) === i && !resultExcludeJobs.includes(v)).sort().map((j) => ({ value: j, label: j }))}
                          placeholder="+ Exclude jobâ¦"
                          triggerClassName="h-6 text-xs"
                        />
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
                      Lock a pair to keep it fixed across recalculations.
                      {desiredChildren.length > 0 && <> Â· <span className="text-violet-600 dark:text-violet-400">Purple rows</span> cover your desired children.</>}
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
                        <p className="text-xs font-medium text-muted-foreground mb-1.5"><span className="text-blue-500 font-bold">â</span> Unmatched male slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedMale.map((u, i) => (
                            <Badge key={i} variant="secondary" className="text-xs gap-1">
                              <span className="text-blue-500 font-bold">â</span>{u.job}
                              <span className={`text-[10px] ${RANK_STYLE[u.rank].badge} rounded px-1`}>{u.rank}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.unmatchedFemale.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5"><span className="text-rose-500 font-bold">â</span> Unmatched female slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedFemale.map((u, i) => (
                            <Badge key={i} variant="outline" className="text-xs text-muted-foreground gap-1">
                              <span className="text-rose-500 font-bold">â</span>{u.job}
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
            <p className="text-sm">Running optimal matching algorithmâ¦</p>
          </div>
        )}

        <div className="mt-6">
          <PairsPanel
            pairs={pairs}
            jobTypeMap={jobTypeMap}
            jobGenMap={jobGenMap}
            allJobNames={allJobNames}
          />
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Match Finder â open source</span>
          <a href="https://replit.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ExternalLink className="w-3 h-3" /> Fork &amp; edit on Replit
          </a>
        </div>
      </div>
    </div>
  );
}







