import { useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Zap, RefreshCw, HelpCircle, ArrowLeftRight } from "lucide-react";
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

const RANK_COLORS: Record<Rank, string> = {
  S: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-700",
  A: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-700",
  B: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700",
  C: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700",
  D: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
};

interface Job {
  id: string;
  name: string;
  rank: Rank;
  males: number;
  females: number;
  unassigned: number;
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
  unmatchedMale: string[];
  unmatchedFemale: string[];
  unassignedDecisions: UnassignedDecision[];
  totalMaleSlots: number;
  totalFemaleSlots: number;
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function runBipartiteMatching(
  effectiveMales: Record<string, number>,
  effectiveFemales: Record<string, number>,
  jobRanks: Record<string, Rank>
): MatchResult[] {
  // Two jobs are compatible iff they share the same rank
  const graph: Record<string, string[]> = {};

  const addEdge = (m: string, f: string) => {
    if (jobRanks[m] !== jobRanks[f]) return; // different rank — not compatible
    if (!graph[m]) graph[m] = [];
    if (!graph[m].includes(f)) graph[m].push(f);
  };

  for (const m in effectiveMales) {
    for (const f in effectiveFemales) {
      addEdge(m, f);
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

  const matches: MatchResult[] = [];
  for (const f in matchF) {
    matches.push({ maleJob: matchF[f], femaleJob: f, rank: jobRanks[f] });
  }
  return matches;
}

function findOptimalMatching(jobs: Job[]): OptimalResult {
  const jobsWithUnassigned = jobs.filter((j) => j.unassigned > 0);
  const jobRanks: Record<string, Rank> = {};
  for (const j of jobs) jobRanks[j.name] = j.rank;

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
      const effM: Record<string, number> = { ...baseMales };
      const effF: Record<string, number> = { ...baseFemales };
      for (const name in maleExtra) {
        if (maleExtra[name] > 0) effM[name] = (effM[name] ?? 0) + maleExtra[name];
      }
      for (const name in femaleExtra) {
        if (femaleExtra[name] > 0) effF[name] = (effF[name] ?? 0) + femaleExtra[name];
      }
      const matches = runBipartiteMatching(effM, effF, jobRanks);
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

  const effM: Record<string, number> = { ...baseMales };
  const effF: Record<string, number> = { ...baseFemales };
  for (const name in bestMaleExtra) {
    if (bestMaleExtra[name] > 0) effM[name] = (effM[name] ?? 0) + bestMaleExtra[name];
  }
  for (const name in bestFemaleExtra) {
    if (bestFemaleExtra[name] > 0) effF[name] = (effF[name] ?? 0) + bestFemaleExtra[name];
  }

  const unmatchedMale: string[] = [];
  for (const name in effM) {
    const matched = bestMatches.filter((m) => m.maleJob === name).length;
    for (let i = 0; i < effM[name] - matched; i++) unmatchedMale.push(name);
  }
  const unmatchedFemale: string[] = [];
  for (const name in effF) {
    const matched = bestMatches.filter((m) => m.femaleJob === name).length;
    for (let i = 0; i < effF[name] - matched; i++) unmatchedFemale.push(name);
  }

  const unassignedDecisions: UnassignedDecision[] = jobsWithUnassigned.map((j) => ({
    jobName: j.name,
    rank: j.rank,
    assignedMales: bestMaleExtra[j.name] ?? 0,
    assignedFemales: bestFemaleExtra[j.name] ?? 0,
  }));

  return {
    matches: bestMatches,
    unmatchedMale,
    unmatchedFemale,
    unassignedDecisions,
    totalMaleSlots: Object.values(effM).reduce((s, v) => s + v, 0),
    totalFemaleSlots: Object.values(effF).reduce((s, v) => s + v, 0),
  };
}

// ─── Default data ─────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function makeJob(name: string, rank: Rank): Job {
  return { id: generateId(), name, rank, males: 0, females: 0, unassigned: 0 };
}

const DEFAULT_JOBS: Job[] = [
  makeJob("Merchant",    "C"),
  makeJob("Farmer",      "D"),
  makeJob("Carpenter",   "D"),
  makeJob("Mover",       "D"),
  makeJob("Trader",      "C"),
  makeJob("Researcher",  "B"),
  makeJob("Cook",        "C"),
  makeJob("Artisan",     "C"),
  makeJob("Blacksmith",  "B"),
  makeJob("Doctor",      "A"),
  makeJob("Monk",        "B"),
  makeJob("Rancher",     "D"),
  makeJob("Guard",       "C"),
  makeJob("Knight",      "A"),
  makeJob("Mage",        "A"),
  makeJob("Paladin",     "S"),
  makeJob("Gunner",      "B"),
  makeJob("Archer",      "B"),
  makeJob("Ninja",       "A"),
  makeJob("Samurai",     "S"),
  makeJob("Viking",      "A"),
  makeJob("Pirate",      "B"),
  makeJob("Champion",    "S"),
  makeJob("Wizard",      "S"),
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarriageMatcher() {
  const [jobs, setJobs] = useState<Job[]>(DEFAULT_JOBS);
  const [result, setResult] = useState<OptimalResult | null>(null);
  const [newJobName, setNewJobName] = useState("");
  const [newJobRank, setNewJobRank] = useState<Rank>("C");

  const addJob = useCallback(() => {
    const name = newJobName.trim();
    if (!name) return;
    if (jobs.some((j) => j.name === name)) return;
    setJobs((prev) => [...prev, makeJob(name, newJobRank)]);
    setNewJobName("");
    setResult(null);
  }, [newJobName, newJobRank, jobs]);

  const updateJob = useCallback(
    (id: string, field: keyof Job, value: string | number) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? { ...j, [field]: typeof value === "number" ? Math.max(0, value) : value }
            : j
        )
      );
      setResult(null);
    },
    []
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setResult(null);
  }, []);

  const calculate = useCallback(() => {
    setResult(findOptimalMatching(jobs));
  }, [jobs]);

  const reset = useCallback(() => {
    setJobs(DEFAULT_JOBS.map((j) => ({ ...j, id: generateId() })));
    setResult(null);
    setNewJobName("");
    setNewJobRank("C");
  }, []);

  // Group jobs by rank for the summary panel
  const byRank = useMemo(() => {
    const groups: Record<Rank, Job[]> = { S: [], A: [], B: [], C: [], D: [] };
    for (const j of jobs) groups[j.rank].push(j);
    return groups;
  }, [jobs]);

  const totalMales = jobs.reduce((s, j) => s + j.males, 0);
  const totalFemales = jobs.reduce((s, j) => s + j.females, 0);
  const totalUnassigned = jobs.reduce((s, j) => s + j.unassigned, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Marriage Matcher
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Only jobs of the same rank can marry. Unassigned slots are optimally assigned to male or female to maximise total matches.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="flex items-center gap-2 shrink-0">
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* ── Jobs table ─────────────────────────────────── */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jobs</CardTitle>
              <CardDescription>
                Set each job's rank and slot counts. Only jobs of the same rank are compatible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_72px_64px_64px_80px_32px] bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Job</span>
                  <span className="text-center">Rank</span>
                  <span className="text-center">Male</span>
                  <span className="text-center">Female</span>
                  <span className="text-center flex items-center justify-center gap-1">
                    Unassigned
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-52 text-xs">
                        Gender not yet decided. The algorithm tries all combinations to maximise matches.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span />
                </div>
                <Separator />

                {jobs.map((job, i) => (
                  <div key={job.id}>
                    {i > 0 && <Separator />}
                    <div className="grid grid-cols-[1fr_72px_64px_64px_80px_32px] items-center px-3 py-1.5 gap-1">
                      <span className="text-sm font-medium truncate pr-1">
                        {job.name}
                        {job.unassigned > 0 && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400">?</Badge>
                        )}
                      </span>
                      {/* Rank selector */}
                      <div className="flex justify-center">
                        <select
                          value={job.rank}
                          onChange={(e) => updateJob(job.id, "rank", e.target.value as Rank)}
                          className={`h-6 w-14 text-xs font-semibold rounded border px-1 text-center focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer ${RANK_COLORS[job.rank]}`}
                        >
                          {RANKS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
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

              {/* Add job row */}
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Job name"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addJob()}
                  className="h-8 text-sm"
                />
                <select
                  value={newJobRank}
                  onChange={(e) => setNewJobRank(e.target.value as Rank)}
                  className={`h-8 w-20 text-xs font-semibold rounded-md border px-2 text-center focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer shrink-0 ${RANK_COLORS[newJobRank]}`}
                >
                  {RANKS.map((r) => (
                    <option key={r} value={r}>Rank {r}</option>
                  ))}
                </select>
                <Button size="sm" variant="secondary" onClick={addJob} className="h-8 px-3 shrink-0">
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              {/* Slot totals */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-0.5">
                <span>Male: <strong className="text-foreground">{totalMales}</strong></span>
                <span>Female: <strong className="text-foreground">{totalFemales}</strong></span>
                {totalUnassigned > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    Unassigned: <strong>{totalUnassigned}</strong>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Rank groups summary ─────────────────────────── */}
          <div className="space-y-3">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rank Groups</CardTitle>
                <CardDescription className="text-xs">
                  Jobs can only marry within the same rank.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {RANKS.map((rank) => {
                  const group = byRank[rank];
                  const maleCount = group.reduce((s, j) => s + j.males, 0);
                  const femaleCount = group.reduce((s, j) => s + j.females, 0);
                  const unassignedCount = group.reduce((s, j) => s + j.unassigned, 0);
                  const hasSlots = maleCount + femaleCount + unassignedCount > 0;
                  return (
                    <div key={rank} className={`rounded-lg border p-2.5 ${group.length === 0 ? "opacity-40" : ""}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge className={`text-xs font-bold px-2 border ${RANK_COLORS[rank]}`}>
                          Rank {rank}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {group.length} job{group.length !== 1 ? "s" : ""}
                        </span>
                        {hasSlots && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {maleCount}M / {femaleCount}F{unassignedCount > 0 ? ` / ${unassignedCount}?` : ""}
                          </span>
                        )}
                      </div>
                      {group.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {group.map((j) => (
                            <span key={j.id} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                              {j.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No jobs</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Calculate button (in sidebar on xl) */}
            <Button onClick={calculate} className="w-full gap-2 shadow-md">
              <Zap className="w-4 h-4" />
              Calculate Optimal Matching
            </Button>
          </div>
        </div>

        {/* Calculate button (below on smaller screens) */}
        <div className="mt-6 flex justify-center xl:hidden">
          <Button onClick={calculate} size="lg" className="gap-2 px-8 shadow-md">
            <Zap className="w-4 h-4" />
            Calculate Optimal Matching
          </Button>
        </div>

        {/* ── Results ──────────────────────────────────────── */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Unassigned decisions */}
            {result.unassignedDecisions.filter((d) => d.assignedMales + d.assignedFemales > 0).length > 0 && (
              <Card className="shadow-sm border-amber-300 dark:border-amber-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                    Optimal gender assignment for unassigned slots
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.unassignedDecisions.map((d) => (
                      <div
                        key={d.jobName}
                        className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm"
                      >
                        <Badge className={`text-[10px] px-1.5 border ${RANK_COLORS[d.rank]}`}>{d.rank}</Badge>
                        <span className="font-semibold text-foreground">{d.jobName}</span>
                        <span className="text-muted-foreground">→</span>
                        {d.assignedMales > 0 && (
                          <Badge variant="secondary" className="text-xs">{d.assignedMales} male</Badge>
                        )}
                        {d.assignedFemales > 0 && (
                          <Badge variant="outline" className="text-xs border-primary/30 text-primary">{d.assignedFemales} female</Badge>
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

            {/* Matches grouped by rank */}
            <Card className="shadow-sm border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Matched Pairs</CardTitle>
                  <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground">
                    {result.matches.length} / {Math.min(result.totalMaleSlots, result.totalFemaleSlots)} matched
                  </Badge>
                </div>
                <CardDescription>
                  Maximum bipartite matching — same-rank only.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No matches found. Make sure jobs of the same rank have both male and female slots.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {RANKS.map((rank) => {
                      const rankMatches = result.matches.filter((m) => m.rank === rank);
                      if (rankMatches.length === 0) return null;
                      return (
                        <div key={rank}>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`text-xs font-bold px-2 border ${RANK_COLORS[rank]}`}>
                              Rank {rank}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {rankMatches.length} match{rankMatches.length !== 1 ? "es" : ""}
                            </span>
                          </div>
                          <div className="space-y-1.5 pl-1">
                            {rankMatches.map((m, i) => (
                              <div
                                key={i}
                                className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 rounded-lg bg-accent/50 px-3 py-2"
                              >
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

                {/* Unmatched */}
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
                        ? Math.round((result.matches.length / Math.min(result.totalMaleSlots, result.totalFemaleSlots)) * 100)
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
