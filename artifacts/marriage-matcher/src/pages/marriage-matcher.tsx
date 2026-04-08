import { useState, useCallback } from "react";
import { Plus, Trash2, ArrowLeftRight, Zap, RefreshCw, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Job {
  id: string;
  name: string;
  males: number;
  females: number;
  unassigned: number;
}

/** A compatibility pair is undirected — order doesn't matter */
interface Pair {
  id: string;
  jobA: string;
  jobB: string;
}

interface MatchResult {
  maleJob: string;
  femaleJob: string;
}

interface UnassignedDecision {
  jobName: string;
  assignedMales: number;
  assignedFemales: number;
}

interface OptimalResult {
  matches: MatchResult[];
  unmatchedMale: string[];
  unmatchedFemale: string[];
  unassignedDecisions: UnassignedDecision[];
  totalMaleSlots: number;
  totalFemaleSlots: number;
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

/**
 * Run bipartite matching given effective male/female counts per job.
 * Pairs are undirected: if A is male and B is female (or vice versa), add an edge.
 */
function runBipartiteMatching(
  effectiveMales: Record<string, number>,
  effectiveFemales: Record<string, number>,
  pairs: Pair[]
): MatchResult[] {
  // Build adjacency: maleJob → [femaleJob, ...]
  // A pair (A, B) contributes an edge A→B if A is male & B is female,
  // and an edge B→A if B is male & A is female.
  const graph: Record<string, string[]> = {};

  const addEdge = (m: string, f: string) => {
    if (!graph[m]) graph[m] = [];
    if (!graph[m].includes(f)) graph[m].push(f);
  };

  for (const pair of pairs) {
    const { jobA, jobB } = pair;
    if (effectiveMales[jobA] && effectiveFemales[jobB]) addEdge(jobA, jobB);
    if (effectiveMales[jobB] && effectiveFemales[jobA]) addEdge(jobB, jobA);
  }

  // matchF[femaleJob] = which maleJob is matched to it
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

  const matches: MatchResult[] = [];
  for (const f in matchF) {
    matches.push({ maleJob: matchF[f], femaleJob: f });
  }
  return matches;
}

/**
 * Try all possible gender splits for unassigned slots and return the
 * assignment that maximises total matches.
 */
function findOptimalMatching(jobs: Job[], pairs: Pair[]): OptimalResult {
  const jobsWithUnassigned = jobs.filter((j) => j.unassigned > 0);

  const baseMales: Record<string, number> = {};
  const baseFemales: Record<string, number> = {};
  for (const j of jobs) {
    if (j.males > 0) baseMales[j.name] = j.males;
    if (j.females > 0) baseFemales[j.name] = j.females;
  }

  let bestCount = -1;
  let bestMatches: MatchResult[] = [];
  let bestMaleExtra: Record<string, number> = {};
  let bestFemaleExtra: Record<string, number> = {};

  function recurse(
    idx: number,
    maleExtra: Record<string, number>,
    femaleExtra: Record<string, number>
  ) {
    if (idx === jobsWithUnassigned.length) {
      const effMales: Record<string, number> = { ...baseMales };
      const effFemales: Record<string, number> = { ...baseFemales };
      for (const name in maleExtra) {
        if (maleExtra[name] > 0) effMales[name] = (effMales[name] ?? 0) + maleExtra[name];
      }
      for (const name in femaleExtra) {
        if (femaleExtra[name] > 0) effFemales[name] = (effFemales[name] ?? 0) + femaleExtra[name];
      }
      const matches = runBipartiteMatching(effMales, effFemales, pairs);
      if (matches.length > bestCount) {
        bestCount = matches.length;
        bestMatches = matches;
        bestMaleExtra = { ...maleExtra };
        bestFemaleExtra = { ...femaleExtra };
      }
      return;
    }

    const job = jobsWithUnassigned[idx];
    for (let m = 0; m <= job.unassigned; m++) {
      recurse(
        idx + 1,
        { ...maleExtra, [job.name]: m },
        { ...femaleExtra, [job.name]: job.unassigned - m }
      );
    }
  }

  recurse(0, {}, {});

  // Recompute final effective counts
  const effMales: Record<string, number> = { ...baseMales };
  const effFemales: Record<string, number> = { ...baseFemales };
  for (const name in bestMaleExtra) {
    if (bestMaleExtra[name] > 0) effMales[name] = (effMales[name] ?? 0) + bestMaleExtra[name];
  }
  for (const name in bestFemaleExtra) {
    if (bestFemaleExtra[name] > 0) effFemales[name] = (effFemales[name] ?? 0) + bestFemaleExtra[name];
  }

  const unmatchedMale: string[] = [];
  for (const name in effMales) {
    const matched = bestMatches.filter((m) => m.maleJob === name).length;
    for (let i = 0; i < effMales[name] - matched; i++) unmatchedMale.push(name);
  }

  const unmatchedFemale: string[] = [];
  for (const name in effFemales) {
    const matched = bestMatches.filter((m) => m.femaleJob === name).length;
    for (let i = 0; i < effFemales[name] - matched; i++) unmatchedFemale.push(name);
  }

  const unassignedDecisions: UnassignedDecision[] = jobsWithUnassigned.map((j) => ({
    jobName: j.name,
    assignedMales: bestMaleExtra[j.name] ?? 0,
    assignedFemales: bestFemaleExtra[j.name] ?? 0,
  }));

  const totalMaleSlots = Object.values(effMales).reduce((s, v) => s + v, 0);
  const totalFemaleSlots = Object.values(effFemales).reduce((s, v) => s + v, 0);

  return {
    matches: bestMatches,
    unmatchedMale,
    unmatchedFemale,
    unassignedDecisions,
    totalMaleSlots,
    totalFemaleSlots,
  };
}

// ─── Default data ─────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_JOBS: Job[] = [
  { id: generateId(), name: "Job1", males: 1, females: 0, unassigned: 0 },
  { id: generateId(), name: "Job2", males: 0, females: 0, unassigned: 1 },
  { id: generateId(), name: "Job3", males: 0, females: 1, unassigned: 0 },
  { id: generateId(), name: "Job4", males: 0, females: 1, unassigned: 0 },
];

// Undirected pairs — just "these two jobs are compatible"
const DEFAULT_PAIRS: Pair[] = [
  { id: generateId(), jobA: "Job1", jobB: "Job3" },
  { id: generateId(), jobA: "Job1", jobB: "Job4" },
  { id: generateId(), jobA: "Job2", jobB: "Job3" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarriageMatcher() {
  const [jobs, setJobs] = useState<Job[]>(DEFAULT_JOBS);
  const [pairs, setPairs] = useState<Pair[]>(DEFAULT_PAIRS);
  const [result, setResult] = useState<OptimalResult | null>(null);
  const [newJobName, setNewJobName] = useState("");
  const [newPairA, setNewPairA] = useState("");
  const [newPairB, setNewPairB] = useState("");

  const allJobNames = jobs.map((j) => j.name);

  const addJob = useCallback(() => {
    const name = newJobName.trim();
    if (!name) return;
    if (jobs.some((j) => j.name === name)) return;
    setJobs((prev) => [...prev, { id: generateId(), name, males: 0, females: 0, unassigned: 0 }]);
    setNewJobName("");
    setResult(null);
  }, [newJobName, jobs]);

  const updateJob = useCallback(
    (id: string, field: "males" | "females" | "unassigned", value: number) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, [field]: Math.max(0, value) } : j))
      );
      setResult(null);
    },
    []
  );

  const removeJob = useCallback(
    (id: string) => {
      const removedName = jobs.find((j) => j.id === id)?.name;
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (removedName) {
        setPairs((prev) =>
          prev.filter((p) => p.jobA !== removedName && p.jobB !== removedName)
        );
      }
      setResult(null);
    },
    [jobs]
  );

  const addPair = useCallback(() => {
    const a = newPairA.trim();
    const b = newPairB.trim();
    if (!a || !b || a === b) return;
    // Undirected — treat (A,B) same as (B,A)
    if (pairs.some((p) => (p.jobA === a && p.jobB === b) || (p.jobA === b && p.jobB === a))) return;
    setPairs((prev) => [...prev, { id: generateId(), jobA: a, jobB: b }]);
    setNewPairA("");
    setNewPairB("");
    setResult(null);
  }, [newPairA, newPairB, pairs]);

  const removePair = useCallback((id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id));
    setResult(null);
  }, []);

  const calculate = useCallback(() => {
    setResult(findOptimalMatching(jobs, pairs));
  }, [jobs, pairs]);

  const reset = useCallback(() => {
    setJobs(DEFAULT_JOBS.map((j) => ({ ...j, id: generateId() })));
    setPairs(DEFAULT_PAIRS.map((p) => ({ ...p, id: generateId() })));
    setResult(null);
    setNewJobName("");
    setNewPairA("");
    setNewPairB("");
  }, []);

  const totalFixed = jobs.reduce((s, j) => s + j.males + j.females, 0);
  const totalUnassigned = jobs.reduce((s, j) => s + j.unassigned, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Marriage Matcher
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Bipartite matching — compatible pairs are symmetric, and unassigned slots are optimally assigned to male or female.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="flex items-center gap-2 shrink-0">
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Jobs ─────────────────────────────────────── */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jobs</CardTitle>
              <CardDescription>
                Set fixed male/female counts per job. Use <strong>Unassigned</strong> for slots whose gender the algorithm should decide.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_64px_64px_80px_32px] bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Job</span>
                  <span className="text-center">Male</span>
                  <span className="text-center">Female</span>
                  <span className="text-center flex items-center justify-center gap-1">
                    Unassigned
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-52 text-xs">
                        These slots can be male or female. The algorithm tries all combinations and picks the split that maximises total matches.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span />
                </div>
                <Separator />

                {jobs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No jobs yet.</p>
                )}

                {jobs.map((job, i) => (
                  <div key={job.id}>
                    {i > 0 && <Separator />}
                    <div className="grid grid-cols-[1fr_64px_64px_80px_32px] items-center px-3 py-2 gap-1">
                      <span className="text-sm font-medium truncate pr-1">
                        {job.name}
                        {job.unassigned > 0 && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400">
                            ?
                          </Badge>
                        )}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={job.males}
                        onChange={(e) => updateJob(job.id, "males", parseInt(e.target.value) || 0)}
                        className="h-7 text-center text-sm px-1"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={job.females}
                        onChange={(e) => updateJob(job.id, "females", parseInt(e.target.value) || 0)}
                        className="h-7 text-center text-sm px-1"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={job.unassigned}
                        onChange={(e) => updateJob(job.id, "unassigned", parseInt(e.target.value) || 0)}
                        className="h-7 text-center text-sm px-1 border-amber-300 dark:border-amber-700 focus-visible:ring-amber-400"
                      />
                      <button
                        onClick={() => removeJob(job.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors justify-self-center"
                        title="Remove job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Job name"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addJob()}
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="secondary" onClick={addJob} className="h-8 px-3 shrink-0">
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                <span>Fixed: <strong className="text-foreground">{totalFixed}</strong></span>
                {totalUnassigned > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    Unassigned: <strong>{totalUnassigned}</strong>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Compatibility Pairs ───────────────────────── */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Compatibility Pairs</CardTitle>
              <CardDescription>
                Two jobs that can be matched — it doesn't matter which one ends up male or female. The pair is symmetric.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_1fr_32px] bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Job</span>
                  <span />
                  <span>Job</span>
                  <span />
                </div>
                <Separator />

                {pairs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No pairs yet.</p>
                )}

                {pairs.map((pair, i) => (
                  <div key={pair.id}>
                    {i > 0 && <Separator />}
                    <div className="grid grid-cols-[1fr_auto_1fr_32px] items-center px-3 py-2">
                      <Badge variant="secondary" className="justify-self-start text-xs font-medium">
                        {pair.jobA}
                      </Badge>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground mx-2" />
                      <Badge variant="secondary" className="justify-self-start text-xs font-medium">
                        {pair.jobB}
                      </Badge>
                      <button
                        onClick={() => removePair(pair.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors justify-self-center"
                        title="Remove pair"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add pair */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Job</Label>
                  <select
                    value={newPairA}
                    onChange={(e) => setNewPairA(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select...</option>
                    {allJobNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <ArrowLeftRight className="w-4 h-4 text-muted-foreground mb-1.5 shrink-0" />
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Job</Label>
                  <select
                    value={newPairB}
                    onChange={(e) => setNewPairB(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select...</option>
                    {allJobNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" variant="secondary" onClick={addPair} className="h-8 px-3 shrink-0">
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {pairs.length} pair{pairs.length !== 1 ? "s" : ""} defined
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Calculate button */}
        <div className="mt-6 flex justify-center">
          <Button onClick={calculate} size="lg" className="gap-2 px-8 shadow-md">
            <Zap className="w-4 h-4" />
            Calculate Optimal Matching
          </Button>
        </div>

        {/* ── Results ──────────────────────────────────────── */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Unassigned decisions */}
            {result.unassignedDecisions.length > 0 && (
              <Card className="shadow-sm border-amber-300 dark:border-amber-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                    Optimal gender assignment for unassigned slots
                  </CardTitle>
                  <CardDescription className="text-xs">
                    The algorithm determined the following assignments produce the most matches.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.unassignedDecisions.map((d) => (
                      <div
                        key={d.jobName}
                        className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm"
                      >
                        <span className="font-semibold text-foreground">{d.jobName}</span>
                        <span className="text-muted-foreground">→</span>
                        {d.assignedMales > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {d.assignedMales} male
                          </Badge>
                        )}
                        {d.assignedFemales > 0 && (
                          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                            {d.assignedFemales} female
                          </Badge>
                        )}
                        {d.assignedMales === 0 && d.assignedFemales === 0 && (
                          <span className="text-muted-foreground text-xs">unused</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Matches */}
            <Card className="shadow-sm border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Matched Pairs</CardTitle>
                  <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground">
                    {result.matches.length} / {Math.min(result.totalMaleSlots, result.totalFemaleSlots)} matched
                  </Badge>
                </div>
                <CardDescription>
                  Maximum bipartite matching after optimal gender assignment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No matches found. Make sure compatible pairs exist between jobs that end up on opposite sides.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto_1fr] text-xs font-medium text-muted-foreground px-3 pb-1">
                      <span>Male slot</span>
                      <span />
                      <span>Female slot</span>
                    </div>
                    {result.matches.map((m, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 rounded-lg bg-accent/50 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium text-sm">{m.maleJob}</span>
                        </div>
                        <ArrowLeftRight className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm text-primary">{m.femaleJob}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(result.unmatchedMale.length > 0 || result.unmatchedFemale.length > 0) && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                    {result.unmatchedMale.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Unmatched male slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedMale.map((u, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{u}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.unmatchedFemale.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Unmatched female slots:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.unmatchedFemale.map((u, i) => (
                            <Badge key={i} variant="outline" className="text-xs text-muted-foreground">{u}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Efficiency:{" "}
                    <strong className="text-foreground">
                      {Math.min(result.totalMaleSlots, result.totalFemaleSlots) > 0
                        ? Math.round(
                            (result.matches.length /
                              Math.min(result.totalMaleSlots, result.totalFemaleSlots)) *
                              100
                          )
                        : 0}%
                    </strong>
                  </span>
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
