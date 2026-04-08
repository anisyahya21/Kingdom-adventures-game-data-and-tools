import { useState, useCallback } from "react";
import { Plus, Trash2, ArrowRight, Zap, RefreshCw } from "lucide-react";
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

interface Job {
  id: string;
  name: string;
  males: number;
  females: number;
}

interface Pair {
  id: string;
  maleJob: string;
  femaleJob: string;
}

interface MatchResult {
  maleJob: string;
  femaleJob: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function runBipartiteMatching(
  jobs: Job[],
  pairs: Pair[]
): { matches: MatchResult[]; unmatched: string[] } {
  const maleJobs: Record<string, number> = {};
  const femaleJobs: Record<string, number> = {};

  for (const job of jobs) {
    if (job.males > 0) maleJobs[job.name] = job.males;
    if (job.females > 0) femaleJobs[job.name] = job.females;
  }

  const graph: Record<string, string[]> = {};
  for (const pair of pairs) {
    if (!graph[pair.maleJob]) graph[pair.maleJob] = [];
    if (!graph[pair.maleJob].includes(pair.femaleJob)) {
      graph[pair.maleJob].push(pair.femaleJob);
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

  for (const m in maleJobs) {
    for (let i = 0; i < maleJobs[m]; i++) {
      tryMatch(m, new Set<string>());
    }
  }

  const matches: MatchResult[] = [];
  for (const f in matchF) {
    matches.push({ maleJob: matchF[f], femaleJob: f });
  }

  const unmatchedFemales: string[] = [];
  for (const job in femaleJobs) {
    const matchedCount = matches.filter((m) => m.femaleJob === job).length;
    if (matchedCount < femaleJobs[job]) {
      for (let i = 0; i < femaleJobs[job] - matchedCount; i++) {
        unmatchedFemales.push(job);
      }
    }
  }

  return { matches, unmatched: unmatchedFemales };
}

const DEFAULT_JOBS: Job[] = [
  { id: generateId(), name: "Job1", males: 1, females: 0 },
  { id: generateId(), name: "Job2", males: 1, females: 0 },
  { id: generateId(), name: "Job3", males: 0, females: 1 },
  { id: generateId(), name: "Job4", males: 0, females: 1 },
];

const DEFAULT_PAIRS: Pair[] = [
  { id: generateId(), maleJob: "Job1", femaleJob: "Job3" },
  { id: generateId(), maleJob: "Job1", femaleJob: "Job4" },
  { id: generateId(), maleJob: "Job2", femaleJob: "Job3" },
];

export default function MarriageMatcher() {
  const [jobs, setJobs] = useState<Job[]>(DEFAULT_JOBS);
  const [pairs, setPairs] = useState<Pair[]>(DEFAULT_PAIRS);
  const [result, setResult] = useState<{
    matches: MatchResult[];
    unmatched: string[];
  } | null>(null);
  const [newJobName, setNewJobName] = useState("");
  const [newPairMale, setNewPairMale] = useState("");
  const [newPairFemale, setNewPairFemale] = useState("");

  const maleJobNames = jobs.filter((j) => j.males > 0).map((j) => j.name);
  const femaleJobNames = jobs.filter((j) => j.females > 0).map((j) => j.name);

  const addJob = useCallback(() => {
    const name = newJobName.trim();
    if (!name) return;
    if (jobs.some((j) => j.name === name)) return;
    setJobs((prev) => [...prev, { id: generateId(), name, males: 0, females: 0 }]);
    setNewJobName("");
    setResult(null);
  }, [newJobName, jobs]);

  const updateJob = useCallback(
    (id: string, field: "males" | "females", value: number) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, [field]: Math.max(0, value) } : j))
      );
      setResult(null);
    },
    []
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setPairs((prev) => {
      const removedName = jobs.find((j) => j.id === id)?.name;
      if (!removedName) return prev;
      return prev.filter(
        (p) => p.maleJob !== removedName && p.femaleJob !== removedName
      );
    });
    setResult(null);
  }, [jobs]);

  const addPair = useCallback(() => {
    const m = newPairMale.trim();
    const f = newPairFemale.trim();
    if (!m || !f) return;
    if (pairs.some((p) => p.maleJob === m && p.femaleJob === f)) return;
    setPairs((prev) => [...prev, { id: generateId(), maleJob: m, femaleJob: f }]);
    setNewPairMale("");
    setNewPairFemale("");
    setResult(null);
  }, [newPairMale, newPairFemale, pairs]);

  const removePair = useCallback((id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id));
    setResult(null);
  }, []);

  const calculate = useCallback(() => {
    const res = runBipartiteMatching(jobs, pairs);
    setResult(res);
  }, [jobs, pairs]);

  const reset = useCallback(() => {
    setJobs(DEFAULT_JOBS);
    setPairs(DEFAULT_PAIRS);
    setResult(null);
    setNewJobName("");
    setNewPairMale("");
    setNewPairFemale("");
  }, []);

  const totalMales = jobs.reduce((s, j) => s + j.males, 0);
  const totalFemales = jobs.reduce((s, j) => s + j.females, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Marriage Matcher
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Bipartite matching — find the maximum compatible assignment between male and female job slots.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Jobs Panel */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jobs</CardTitle>
              <CardDescription>
                Define jobs and how many male/female slots each has.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px_36px] gap-0 bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Job name</span>
                  <span className="text-center">Males</span>
                  <span className="text-center">Females</span>
                  <span />
                </div>
                <Separator />
                {jobs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No jobs yet.
                  </p>
                )}
                {jobs.map((job, i) => (
                  <div key={job.id}>
                    {i > 0 && <Separator />}
                    <div className="grid grid-cols-[1fr_80px_80px_36px] items-center gap-0 px-3 py-2">
                      <span className="text-sm font-medium truncate pr-2">{job.name}</span>
                      <div className="px-1">
                        <Input
                          type="number"
                          min={0}
                          value={job.males}
                          onChange={(e) => updateJob(job.id, "males", parseInt(e.target.value) || 0)}
                          className="h-7 text-center text-sm px-1"
                        />
                      </div>
                      <div className="px-1">
                        <Input
                          type="number"
                          min={0}
                          value={job.females}
                          onChange={(e) => updateJob(job.id, "females", parseInt(e.target.value) || 0)}
                          className="h-7 text-center text-sm px-1"
                        />
                      </div>
                      <button
                        onClick={() => removeJob(job.id)}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove job"
                      >
                        <Trash2 className="w-4 h-4" />
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

              <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                <span>Total male slots: <strong className="text-foreground">{totalMales}</strong></span>
                <span>Total female slots: <strong className="text-foreground">{totalFemales}</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* Pairs Panel */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Compatibility Pairs</CardTitle>
              <CardDescription>
                Which male-job slots are compatible with which female-job slots.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_1fr_36px] gap-0 bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Male job</span>
                  <span />
                  <span>Female job</span>
                  <span />
                </div>
                <Separator />
                {pairs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No compatibility pairs yet.
                  </p>
                )}
                {pairs.map((pair, i) => (
                  <div key={pair.id}>
                    {i > 0 && <Separator />}
                    <div className="grid grid-cols-[1fr_auto_1fr_36px] items-center gap-0 px-3 py-2">
                      <Badge variant="secondary" className="justify-self-start text-xs font-medium">
                        {pair.maleJob}
                      </Badge>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mx-2" />
                      <Badge variant="outline" className="justify-self-start text-xs font-medium border-primary/30 text-primary">
                        {pair.femaleJob}
                      </Badge>
                      <button
                        onClick={() => removePair(pair.id)}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove pair"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Male job</Label>
                  <select
                    value={newPairMale}
                    onChange={(e) => setNewPairMale(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select...</option>
                    {maleJobNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground mb-1.5 shrink-0" />
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Female job</Label>
                  <select
                    value={newPairFemale}
                    onChange={(e) => setNewPairFemale(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select...</option>
                    {femaleJobNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" variant="secondary" onClick={addPair} className="h-8 px-3 shrink-0 mb-0">
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
          <Button
            onClick={calculate}
            size="lg"
            className="gap-2 px-8 shadow-md"
          >
            <Zap className="w-4 h-4" />
            Calculate Maximum Matching
          </Button>
        </div>

        {/* Results */}
        {result && (
          <Card className="mt-6 shadow-sm border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Results</CardTitle>
                <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground">
                  {result.matches.length} / {Math.min(totalMales, totalFemales)} matched
                </Badge>
              </div>
              <CardDescription>
                Maximum bipartite matching using the Hopcroft-Karp (augmenting path) algorithm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.matches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No matches found. Check that compatible pairs exist between male and female job slots.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground px-3 pb-1">
                    <span>Male job</span>
                    <span />
                    <span>Female job</span>
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
                        <span className="font-medium text-sm text-foreground">{m.maleJob}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm text-primary">{m.femaleJob}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.unmatched.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Unmatched female slots:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.unmatched.map((u, i) => (
                      <Badge key={i} variant="outline" className="text-xs text-muted-foreground">
                        {u}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Efficiency:{" "}
                  <strong className="text-foreground">
                    {Math.min(totalMales, totalFemales) > 0
                      ? Math.round((result.matches.length / Math.min(totalMales, totalFemales)) * 100)
                      : 0}%
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Total matched:{" "}
                  <strong className="text-foreground">{result.matches.length}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
