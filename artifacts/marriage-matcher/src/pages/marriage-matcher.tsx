import { useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Zap, RefreshCw, HelpCircle, ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// A RankSlot is one job's entry within a specific rank.
// The same job name can appear in multiple ranks independently.
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
}

interface MatchResult {
  maleJob: string;
  femaleJob: string;
  rank: Rank;
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
  totalMaleSlots: number;
  totalFemaleSlots: number;
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
      if (!matchF[f] || tryMatch(matchF[f], visited)) {
        matchF[f] = m;
        return true;
      }
    }
    return false;
  }

  for (const m in effectiveMales) {
    for (let i = 0; i < effectiveMales[m]; i++) {
      tryMatch(m, new Set<string>());
    }
  }

  return Object.entries(matchF).map(([f, m]) => ({ maleJob: m, femaleJob: f }));
}

// Run optimal matching for a single rank
function matchRank(
  slots: RankSlot[],
  rank: Rank,
  compatibleKeys: Set<string>
): {
  matches: MatchResult[];
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

  let bestCount = -1;
  let bestMatches: Array<{ maleJob: string; femaleJob: string }> = [];
  let bestMaleExtra: Record<string, number> = {};
  let bestFemaleExtra: Record<string, number> = {};

  function recurse(
    idx: number,
    maleExtra: Record<string, number>,
    femaleExtra: Record<string, number>
  ) {
    if (idx === withUnassigned.length) {
      const effM = { ...baseMales };
      const effF = { ...baseFemales };
      for (const n in maleExtra) if (maleExtra[n] > 0) effM[n] = (effM[n] ?? 0) + maleExtra[n];
      for (const n in femaleExtra) if (femaleExtra[n] > 0) effF[n] = (effF[n] ?? 0) + femaleExtra[n];
      const matches = runBipartiteMatching(effM, effF, compatibleKeys);
      if (matches.length > bestCount) {
        bestCount = matches.length;
        bestMatches = matches;
        bestMaleExtra = { ...maleExtra };
        bestFemaleExtra = { ...femaleExtra };
      }
      return;
    }
    const s = withUnassigned[idx];
    for (let m = 0; m <= s.unassigned; m++) {
      recurse(
        idx + 1,
        { ...maleExtra, [s.jobName]: (maleExtra[s.jobName] ?? 0) + m },
        { ...femaleExtra, [s.jobName]: (femaleExtra[s.jobName] ?? 0) + (s.unassigned - m) }
      );
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
    matches: bestMatches.map((m) => ({ ...m, rank })),
    unmatchedMale,
    unmatchedFemale,
    decisions: withUnassigned.map((s) => ({
      jobName: s.jobName,
      rank,
      assignedMales: bestMaleExtra[s.jobName] ?? 0,
      assignedFemales: bestFemaleExtra[s.jobName] ?? 0,
    })),
  };
}

function findOptimalMatching(slots: RankSlot[], pairs: Pair[]): OptimalResult {
  const compatibleKeys = new Set(pairs.map((p) => pairKey(p.jobA, p.jobB)));

  const allMatches: MatchResult[] = [];
  const allUnmatchedMale: Array<{ job: string; rank: Rank }> = [];
  const allUnmatchedFemale: Array<{ job: string; rank: Rank }> = [];
  const allDecisions: UnassignedDecision[] = [];
  let totalMale = 0;
  let totalFemale = 0;

  for (const rank of RANKS) {
    const rankSlots = slots.filter((s) => s.rank === rank);
    totalMale += rankSlots.reduce((s, j) => s + j.males + j.unassigned, 0); // rough upper bound
    totalFemale += rankSlots.reduce((s, j) => s + j.females, 0);
    const res = matchRank(slots, rank, compatibleKeys);
    allMatches.push(...res.matches);
    allUnmatchedMale.push(...res.unmatchedMale);
    allUnmatchedFemale.push(...res.unmatchedFemale);
    allDecisions.push(...res.decisions);
  }

  // Better totals: count only slots that can actually contribute
  const tm = slots.reduce((s, j) => s + j.males + j.unassigned, 0);
  const tf = slots.reduce((s, j) => s + j.females, 0);

  return {
    matches: allMatches,
    unmatchedMale: allUnmatchedMale,
    unmatchedFemale: allUnmatchedFemale,
    unassignedDecisions: allDecisions,
    totalMaleSlots: tm,
    totalFemaleSlots: tf,
  };
}

// ─── Default data ─────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function makePair(a: string, b: string): Pair {
  return { id: generateId(), jobA: a, jobB: b };
}

const DEFAULT_JOB_NAMES: string[] = [
  "Archer", "Artisan", "Blacksmith", "Carpenter", "Champion",
  "Cook", "Doctor", "Farmer", "Guard", "Gunner",
  "Knight", "Mage", "Merchant", "Monk", "Mover",
  "Ninja", "Paladin", "Pirate", "Rancher", "Researcher",
  "Samurai", "Trader", "Viking", "Wizard",
];

function makeDefaultSlots(): RankSlot[] {
  const slots: RankSlot[] = [];
  for (const rank of RANKS) {
    for (const jobName of DEFAULT_JOB_NAMES) {
      slots.push({ id: generateId(), rank, jobName, males: 0, females: 0, unassigned: 0 });
    }
  }
  return slots;
}

const DEFAULT_PAIRS: Pair[] = [
  makePair("Artisan",    "Champion"),
  makePair("Artisan",    "Guard"),
  makePair("Artisan",    "Ninja"),
  makePair("Blacksmith", "Doctor"),
  makePair("Blacksmith", "Monk"),
  makePair("Blacksmith", "Wizard"),
  makePair("Carpenter",  "Blacksmith"),
  makePair("Carpenter",  "Mage"),
  makePair("Carpenter",  "Pirate"),
  makePair("Cook",       "Guard"),
  makePair("Doctor",     "Champion"),
  makePair("Guard",      "Archer"),
  makePair("Guard",      "Champion"),
  makePair("Guard",      "Guard"),
  makePair("Guard",      "Ninja"),
  makePair("Guard",      "Paladin"),
  makePair("Knight",     "Pirate"),
  makePair("Mage",       "Mage"),
  makePair("Mage",       "Samurai"),
  makePair("Merchant",   "Artisan"),
  makePair("Merchant",   "Champion"),
  makePair("Merchant",   "Ninja"),
  makePair("Monk",       "Champion"),
  makePair("Monk",       "Guard"),
  makePair("Monk",       "Gunner"),
  makePair("Monk",       "Mage"),
  makePair("Mover",      "Archer"),
  makePair("Mover",      "Champion"),
  makePair("Mover",      "Researcher"),
  makePair("Ninja",      "Samurai"),
  makePair("Pirate",     "Pirate"),
  makePair("Rancher",    "Knight"),
  makePair("Trader",     "Gunner"),
  makePair("Wizard",     "Wizard"),
];

// ─── Rank Table ───────────────────────────────────────────────────────────────

interface RankTableProps {
  rank: Rank;
  slots: RankSlot[];
  allJobNames: string[];
  onUpdate: (id: string, field: "males" | "females" | "unassigned", value: number) => void;
  onRemove: (id: string) => void;
  onAdd: (rank: Rank, jobName: string) => void;
}

function RankTable({ rank, slots, allJobNames, onUpdate, onRemove, onAdd }: RankTableProps) {
  const [customJob, setCustomJob] = useState("");
  const style = RANK_STYLE[rank];

  const presentNames = new Set(slots.map((s) => s.jobName));
  const available = allJobNames.filter((n) => !presentNames.has(n));

  const handleAdd = () => {
    const name = customJob.trim();
    if (!name) return;
    onAdd(rank, name);
    setCustomJob("");
  };

  const maleTotal = slots.reduce((s, j) => s + j.males, 0);
  const femaleTotal = slots.reduce((s, j) => s + j.females, 0);
  const unassignedTotal = slots.reduce((s, j) => s + j.unassigned, 0);

  return (
    <Card className={`shadow-sm border ${style.border}`}>
      <CardHeader className={`pb-2 pt-3 px-4 rounded-t-lg ${style.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={`text-sm font-bold px-2.5 py-0.5 border ${style.badge}`}>
              Rank {rank}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {slots.length} job{slots.length !== 1 ? "s" : ""}
            </span>
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
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 cursor-help" />
                  </TooltipTrigger>
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

        {/* Add job row */}
        <div className={`space-y-2 ${slots.length === 0 ? "mt-3" : ""}`}>
          {available.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val || val === "__custom__") return;
                onAdd(rank, val);
              }}
              className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
            >
              <option value="">+ Add a job to Rank {rank}…</option>
              {available.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Or type a new job name…"
              value={customJob}
              onChange={(e) => setCustomJob(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" variant="secondary" onClick={handleAdd} className="h-8 px-3 shrink-0">
              <Plus className="w-4 h-4 mr-1" />Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pairs Panel ──────────────────────────────────────────────────────────────

interface PairsPanelProps {
  pairs: Pair[];
  jobNames: string[];
  onAdd: (a: string, b: string) => string | null;
  onRemove: (id: string) => void;
}

function PairsPanel({ pairs, jobNames, onAdd, onRemove }: PairsPanelProps) {
  const [selA, setSelA] = useState("");
  const [selB, setSelB] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    const a = selA.trim();
    const b = selB.trim();
    if (!a || !b) { setError("Select both jobs."); return; }
    const err = onAdd(a, b);
    if (err) { setError(err); return; }
    setSelA("");
    setSelB("");
    setError("");
  };

  const sorted = [...pairs].sort((a, b) =>
    pairKey(a.jobA, a.jobB).localeCompare(pairKey(b.jobA, b.jobB))
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Compatible Pairs</CardTitle>
        <CardDescription className="text-xs">
          A male from one job can marry a female from the other (within the same rank). Same-job pairs (e.g. Guard ↔ Guard) are also supported.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border overflow-hidden">
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {sorted.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No pairs defined yet.</p>
            )}
            {sorted.map((p) => {
              const [d1, d2] = [p.jobA, p.jobB].sort();
              return (
                <div key={p.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{d1}</span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">{d2}</span>
                  </div>
                  <button onClick={() => onRemove(p.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <select value={selA} onChange={(e) => { setSelA(e.target.value); setError(""); }}
              className="flex-1 h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Job A…</option>
              {jobNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <select value={selB} onChange={(e) => { setSelB(e.target.value); setError(""); }}
              className="flex-1 h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Job B…</option>
              {jobNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={handleAdd} className="h-8 px-3 shrink-0">
              <Plus className="w-4 h-4 mr-1" />Add
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <p className="text-xs text-muted-foreground">{pairs.length} pair{pairs.length !== 1 ? "s" : ""} defined</p>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MarriageMatcher() {
  const [jobNames, setJobNames] = useState<string[]>(DEFAULT_JOB_NAMES);
  const [rankSlots, setRankSlots] = useState<RankSlot[]>([]);
  const [pairs, setPairs] = useState<Pair[]>(DEFAULT_PAIRS);
  const [result, setResult] = useState<OptimalResult | null>(null);

  const sortedJobNames = useMemo(
    () => [...jobNames].sort((a, b) => a.localeCompare(b)),
    [jobNames]
  );

  const updateSlot = useCallback(
    (id: string, field: "males" | "females" | "unassigned", value: number) => {
      setRankSlots((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: Math.max(0, value) } : s)));
      setResult(null);
    },
    []
  );

  const removeSlot = useCallback((id: string) => {
    setRankSlots((prev) => prev.filter((s) => s.id !== id));
    setResult(null);
  }, []);

  const addSlot = useCallback((rank: Rank, jobName: string) => {
    const name = jobName.trim();
    if (!name) return;
    setRankSlots((prev) => {
      if (prev.some((s) => s.rank === rank && s.jobName === name)) return prev;
      return [...prev, { id: generateId(), rank, jobName: name, males: 0, females: 0, unassigned: 0 }];
    });
    // Add to master list if new
    setJobNames((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    setResult(null);
  }, []);

  const addPair = useCallback((a: string, b: string): string | null => {
    const key = pairKey(a, b);
    let dupe = false;
    setPairs((prev) => {
      if (prev.some((p) => pairKey(p.jobA, p.jobB) === key)) { dupe = true; return prev; }
      return [...prev, makePair(a, b)];
    });
    if (dupe) return "This pair already exists.";
    setResult(null);
    return null;
  }, []);

  const removePair = useCallback((id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id));
    setResult(null);
  }, []);

  const calculate = useCallback(() => {
    setResult(findOptimalMatching(rankSlots, pairs));
  }, [rankSlots, pairs]);

  const reset = useCallback(() => {
    setJobNames(DEFAULT_JOB_NAMES);
    setRankSlots([]);
    setPairs(DEFAULT_PAIRS.map((p) => ({ ...p, id: generateId() })));
    setResult(null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Marriage Matcher</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Add any job to any rank. Only jobs within the same rank can marry, and only if they are a compatible pair.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="flex items-center gap-2 shrink-0">
            <RefreshCw className="w-4 h-4" />Reset
          </Button>
        </div>

        {/* Rank tables */}
        <div className="space-y-4">
          {RANKS.map((rank) => (
            <RankTable
              key={rank}
              rank={rank}
              slots={rankSlots.filter((s) => s.rank === rank)}
              allJobNames={sortedJobNames}
              onUpdate={updateSlot}
              onRemove={removeSlot}
              onAdd={addSlot}
            />
          ))}
        </div>

        {/* Compatible pairs */}
        <div className="mt-6">
          <PairsPanel
            pairs={pairs}
            jobNames={sortedJobNames}
            onAdd={addPair}
            onRemove={removePair}
          />
        </div>

        {/* Calculate */}
        <div className="mt-8 flex justify-center">
          <Button onClick={calculate} size="lg" className="gap-2 px-10 shadow-md">
            <Zap className="w-4 h-4" />
            Calculate Optimal Matching
          </Button>
        </div>

        {/* ── Results ──────────────────────────────────────── */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Unassigned decisions */}
            {result.unassignedDecisions.some((d) => d.assignedMales + d.assignedFemales > 0) && (
              <Card className="shadow-sm border-amber-300 dark:border-amber-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                    Optimal gender assignment for unassigned slots
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.unassignedDecisions.map((d, i) => (
                      <div key={i}
                        className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm">
                        <Badge className={`text-[10px] px-1.5 border ${RANK_STYLE[d.rank].badge}`}>{d.rank}</Badge>
                        <span className="font-semibold text-foreground">{d.jobName}</span>
                        <span className="text-muted-foreground">→</span>
                        {d.assignedMales > 0 && <Badge variant="secondary" className="text-xs">{d.assignedMales} male</Badge>}
                        {d.assignedFemales > 0 && <Badge variant="outline" className="text-xs border-primary/30 text-primary">{d.assignedFemales} female</Badge>}
                        {d.assignedMales === 0 && d.assignedFemales === 0 && <span className="text-muted-foreground text-xs">unused</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Matched pairs */}
            <Card className="shadow-sm border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Matched Pairs</CardTitle>
                  <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground">
                    {result.matches.length} matched
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {result.matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No matches found. Check that compatible pairs cover jobs with both male and female slots in the same rank.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {RANKS.map((rank) => {
                      const rankMatches = result.matches.filter((m) => m.rank === rank);
                      if (rankMatches.length === 0) return null;
                      return (
                        <div key={rank}>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`text-xs font-bold px-2 border ${RANK_STYLE[rank].badge}`}>Rank {rank}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {rankMatches.length} match{rankMatches.length !== 1 ? "es" : ""}
                            </span>
                          </div>
                          <div className="space-y-1.5 pl-1">
                            {rankMatches.map((m, i) => (
                              <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 rounded-lg bg-accent/50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold shrink-0">
                                    {i + 1}
                                  </span>
                                  <span className="font-medium text-sm">{m.maleJob}</span>
                                </div>
                                <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                                <span className="font-medium text-sm text-primary">{m.femaleJob}</span>
                              </div>
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
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Unmatched male slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedMale.map((u, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {u.job} <span className={`ml-1 text-[10px] ${RANK_STYLE[u.rank].badge} rounded px-1`}>{u.rank}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.unmatchedFemale.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Unmatched female slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedFemale.map((u, i) => (
                            <Badge key={i} variant="outline" className="text-xs text-muted-foreground">
                              {u.job} <span className={`ml-1 text-[10px] ${RANK_STYLE[u.rank].badge} rounded px-1`}>{u.rank}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border flex items-center justify-end text-sm">
                  <span className="text-muted-foreground">
                    Total matched: <strong className="text-foreground">{result.matches.length}</strong>
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
