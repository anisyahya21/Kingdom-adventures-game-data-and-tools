import { useState, useCallback, useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
  Plus, Trash2, Zap, RefreshCw, HelpCircle, ArrowLeftRight,
  X, Lock, LockOpen, Moon, Sun, Loader2, AlertTriangle, ExternalLink,
  ArrowLeft, Info,
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

// ─── Default data ─────────────────────────────────────────────────────────────

function generateId() { return Math.random().toString(36).slice(2, 9); }
function makePair(a: string, b: string): Pair { return { id: generateId(), jobA: a, jobB: b }; }

const DEFAULT_JOB_NAMES: string[] = [
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
  availableJobs: string[]; // jobs NOT yet added to this rank
  onUpdate: (id: string, field: "males" | "females" | "unassigned", value: number) => void;
  onRemove: (id: string) => void;
  onAdd: (rank: Rank, jobName: string) => void;
}

function RankTable({ rank, slots, availableJobs, onUpdate, onRemove, onAdd }: RankTableProps) {
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
            <option value="">+ Add a job to Rank {rank}…</option>
            {availableJobs.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground text-center mt-3 py-1">
            All jobs added. <Link href="#jobs" className="underline text-primary">Add more jobs</Link> above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Jobs Panel ───────────────────────────────────────────────────────────────

interface JobsPanelProps {
  jobNames: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}

function JobsPanel({ jobNames, onAdd, onRemove }: JobsPanelProps) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const name = input.trim();
    if (!name || jobNames.includes(name)) return;
    onAdd(name);
    setInput("");
  };

  return (
    <Card className="shadow-sm" id="jobs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Job List</CardTitle>
        <CardDescription className="text-xs">
          Add jobs here to make them available to all rank tables and the compatible pairs list. Removing a job here does not remove it from ranks you already added it to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5 min-h-8">
          {jobNames.length === 0 && <p className="text-xs text-muted-foreground">No jobs yet.</p>}
          {jobNames.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1.5 px-2 py-1 text-xs">
              {name}
              <button onClick={() => onRemove(name)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="New job name…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-8 text-sm flex-1"
          />
          <Button size="sm" variant="secondary" onClick={handleAdd} className="h-8 px-3 shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Add Job
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{jobNames.length} job{jobNames.length !== 1 ? "s" : ""} available</p>
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
    const a = selA.trim(); const b = selB.trim();
    if (!a || !b) { setError("Select both jobs."); return; }
    const err = onAdd(a, b);
    if (err) { setError(err); return; }
    setSelA(""); setSelB(""); setError("");
  };

  const sorted = [...pairs].sort((a, b) => pairKey(a.jobA, a.jobB).localeCompare(pairKey(b.jobA, b.jobB)));

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Compatible Pairs</CardTitle>
        <CardDescription className="text-xs">
          A male from one job can marry a female from the other (same rank). Same-job pairs are allowed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {sorted.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No pairs defined yet.</p>}
            {sorted.map((p) => {
              const [d1, d2] = [p.jobA, p.jobB].sort();
              return (
                <div key={p.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{d1}</span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">{d2}</span>
                  </div>
                  <button onClick={() => onRemove(p.id)} className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0">
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

// ─── Match Row ────────────────────────────────────────────────────────────────

interface MatchRowProps {
  match: MatchResult;
  index: number;
  rankJobNames: string[];
  onLock: (id: string) => void;
  onUnlock: (id: string) => void;
  onChangeMale: (id: string, job: string) => void;
  onChangeFemale: (id: string, job: string) => void;
}

function MatchRow({ match, index, rankJobNames, onLock, onUnlock, onChangeMale, onChangeFemale }: MatchRowProps) {
  const isLocked = match.locked;
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr_auto] items-center gap-x-2 rounded-lg px-3 py-2 transition-all ${
      isLocked ? "bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700" : "bg-accent/50"
    }`}>
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
            <h3 className="font-semibold text-foreground mb-1">1. Add jobs</h3>
            <p>Use the <strong>Job List</strong> section to add all the job names in your game. Adding a job here makes it available to every rank table and to the compatible pairs selector.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">2. Populate rank tables</h3>
            <p>For each rank (S through D), use the dropdown to add relevant jobs. Enter the number of <strong>male</strong> and <strong>female</strong> characters in that job at that rank. Use <strong>Unassigned</strong> for characters whose gender you haven't decided yet — the algorithm will automatically split them to maximise matches.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">3. Define compatible pairs</h3>
            <p>Two jobs are compatible if a male from one can marry a female from the other. Use the <strong>Compatible Pairs</strong> panel to define these. Same-job pairs (e.g. Guard ↔ Guard) are allowed.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">4. Calculate</h3>
            <p>Click <strong>Calculate Optimal Matching</strong>. The algorithm uses bipartite matching to maximise the number of married pairs, only pairing jobs within the same rank and within compatible pairs.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">5. Lock pairs</h3>
            <p>Click the 🔓 icon on any result row to lock that marriage. Locked pairs are fixed — the algorithm works around them on the next calculation. You can also edit the job names in a locked row to manually override who marries whom.</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            <strong className="text-foreground">Tip:</strong> The amber <em>Unassigned</em> badge in results means that character's gender was decided by the algorithm to maximise total matches.
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

  const [jobNames, setJobNames] = useState<string[]>(DEFAULT_JOB_NAMES);
  const [rankSlots, setRankSlots] = useState<RankSlot[]>([]);
  const [pairs, setPairs] = useState<Pair[]>(DEFAULT_PAIRS);
  const [result, setResult] = useState<OptimalResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [lockedPairs, setLockedPairs] = useState<LockedPair[]>([]);

  const sortedJobNames = useMemo(() => [...jobNames].sort((a, b) => a.localeCompare(b)), [jobNames]);

  const markStale = useCallback(() => setIsStale(true), []);

  const addJob = useCallback((name: string) => {
    setJobNames((prev) => prev.includes(name) ? prev : [...prev, name].sort());
  }, []);

  const removeJob = useCallback((name: string) => {
    setJobNames((prev) => prev.filter((j) => j !== name));
  }, []);

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

  const calculate = useCallback(() => {
    setIsCalculating(true);
    setIsStale(false);
    setTimeout(() => {
      setResult(findOptimalMatching(rankSlots, pairs, lockedPairs));
      setIsCalculating(false);
    }, 80);
  }, [rankSlots, pairs, lockedPairs]);

  const reset = useCallback(() => {
    setJobNames(DEFAULT_JOB_NAMES);
    setRankSlots([]);
    setPairs(DEFAULT_PAIRS.map((p) => ({ ...p, id: generateId() })));
    setLockedPairs([]);
    setResult(null);
    setIsStale(false);
  }, []);

  // Per-rank available jobs (not yet added to that rank)
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

  // Jobs per rank for locked pair dropdowns
  const jobsPerRank = useMemo(() => {
    const map: Record<Rank, string[]> = { S: [], A: [], B: [], C: [], D: [] };
    for (const s of rankSlots) {
      if (!map[s.rank].includes(s.jobName)) map[s.rank].push(s.jobName);
    }
    for (const rank of RANKS) map[rank].sort();
    return map;
  }, [rankSlots]);

  const hasLocked = lockedPairs.length > 0;

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
              <p className="mt-1 text-muted-foreground text-sm">
                Add jobs globally, then assign them to ranks. Only same-rank compatible jobs can marry.
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

        {/* Central Jobs Panel */}
        <div className="mb-6">
          <JobsPanel jobNames={sortedJobNames} onAdd={addJob} onRemove={removeJob} />
        </div>

        {/* Rank tables */}
        <div className="space-y-4">
          {RANKS.map((rank) => (
            <RankTable key={rank} rank={rank}
              slots={rankSlots.filter((s) => s.rank === rank)}
              availableJobs={availablePerRank[rank]}
              onUpdate={updateSlot} onRemove={removeSlot} onAdd={addSlot}
            />
          ))}
        </div>

        {/* Compatible pairs */}
        <div className="mt-6">
          <PairsPanel pairs={pairs} jobNames={sortedJobNames} onAdd={addPair} onRemove={removePair} />
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

            <Card className="shadow-sm border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Matched Pairs</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Click 🔓 to lock a pair. Locked pairs stay fixed on recalculation. Edit job names in locked rows to override.
                    </CardDescription>
                  </div>
                  <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground shrink-0">{result.matches.length} matched</Badge>
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
