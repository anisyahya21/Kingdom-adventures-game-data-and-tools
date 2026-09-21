import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  Download,
  FilePlus2,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Square,
  Swords,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ka/page-header";
import { ToneBadge } from "@/components/ka/badges";
import { GeneratedBattleReplay } from "@/components/generated-battle-replay";
import { parseBattleReplayResult } from "@/lib/battle-replay-result";
import { createGeneratedBattleRecord, type GeneratedBattleRecord } from "@/lib/generated-battle-store";
import type { KaCategory } from "@/design-system/category-styles";

/* ------------------------------------------------------------------ */
/* Host bridge contract                                                */
/* ------------------------------------------------------------------ */

/**
 * The desktop host (`window.pywebview.api`) is the only interface this page has. Astra's Python
 * layer owns every mechanic, score, default and scheduler decision; this module declares the exact
 * shapes it is handed and renders them. It never reproduces a metric or invents a game fact.
 */

type SeedPair = [number, number];

type Summary = {
  n: number;
  wins: number;
  losses: number;
  censored: number;
  winRate: number | null;
  winInterval: [number, number];
  failureRate: number | null;
  unresolvedRate: number | null;
  /** Always null: the runner does not expose retained chest inventory. */
  retainedMean: null;
  callbackMean: number | null;
  callbackSD: number | null;
  callbackMin: number | null;
  callbackP10: number | null;
  callbackMax: number | null;
  callbackHistogram?: Record<string, number>;
  meanResources: number | null;
  meanSurvivors: number | null;
  meanTicks: number | null;
  comparable: boolean;
};

type Example = { seeds?: number[]; digest?: string };

type FighterStat = {
  monster?: boolean;
  weaponId?: number | string | null;
  weaponRange?: number | null;
  effectiveDefense?: number | null;
  averageTrainingLevel?: number | null;
  parameters?: Record<string, { value: number | null; maximum: number | null }>;
  skillCosts?: Array<{ skillId: number; cost: number }>;
};

type Candidate = {
  id: string;
  label: string;
  source: string;
  scenario: unknown;
  stats: Record<string, FighterStat>;
  discovery: Summary;
  validation: Summary;
  selection: Summary;
  validationRuns: number;
  family: string | null;
  examples: Record<string, Example>;
};

type ArchiveRow = { cell: string; candidate: string; quality: string };

type Provenance = {
  digest?: string;
  mode?: string;
  count?: number;
  files?: Record<string, string | null>;
  missing?: string[];
};

type OptimizerStatus = {
  state: string;
  error: string | null;
  compatible: boolean;
  totalRuns: number;
  sessionElapsedSeconds?: number;
  averageSimulationSeconds?: number | null;
  currentRunElapsedSeconds?: number | null;
  timedRuns?: number;
  proposals: number;
  improvements: number;
  lastImprovementRun: number | null;
  diskBytes: number;
  provenance: Provenance;
  candidates: Candidate[];
  archive: ArchiveRow[];
};

type CommandResult = { ok?: boolean; error?: string };
type ReplayResult = { ok?: boolean; replay?: unknown; scenario?: unknown; error?: string };

type OptimizerApi = {
  status: () => Promise<OptimizerStatus>;
  command: (action: string, value: Record<string, unknown>) => Promise<CommandResult>;
  replay: (candidateId: string, seeds: SeedPair) => Promise<ReplayResult>;
  import_build: () => Promise<CommandResult>;
  export_build: (candidateId: string) => Promise<CommandResult>;
  new_library: () => Promise<CommandResult>;
};

declare global {
  interface Window {
    pywebview?: { api?: OptimizerApi };
  }
}

function hostApi(): OptimizerApi | null {
  if (typeof window === "undefined") return null;
  return window.pywebview?.api ?? null;
}

/* ------------------------------------------------------------------ */
/* Constants and formatting                                            */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL_MS = 2000;
const DISCOVERY_RUNS = 8;
const SELECTION_RUNS = 64;
const RECOMMENDED_WIN_LOW = 0.8;
const RECOMMENDED_CALLBACK_SHARE = 0.95;
const REPLAY_WARNINGS = ["strategy-optimizer:selected-replay"];
const NO_FAMILY = "Unclassified (not yet validated)";

function formatInt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : "—";
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatInterval(interval: [number, number] | undefined): string {
  if (!Array.isArray(interval) || interval.length < 2) return "—";
  return `${formatNumber(interval[0], 2)}–${formatNumber(interval[1], 2)}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id;
}

function stateCategory(state: string): KaCategory {
  const value = state.toLowerCase();
  if (value.includes("error")) return "warning";
  if (value.includes("running")) return "success";
  if (value.includes("saving") || value.includes("opening")) return "warning";
  return "muted";
}

function isCompleteSelection(candidate: Candidate): boolean {
  return Boolean(candidate.selection) && candidate.selection.n >= SELECTION_RUNS && candidate.selection.comparable;
}

function parseQuality(raw: string): [number | null, number | null, number | null] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 3) return null;
    const pick = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    return [pick(parsed[0]), pick(parsed[1]), pick(parsed[2])];
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Joint stat region (measured, same family only)                      */
/* ------------------------------------------------------------------ */

type StatCell = { key: string; label: string; value: number | null };

/** The runner's prepared values, labelled by fighter and the runner's own numeric parameter id. */
function fighterStatCells(stats: Record<string, FighterStat> | undefined): StatCell[] {
  const cells: StatCell[] = [];
  for (const [fighter, stat] of Object.entries(stats ?? {})) {
    if (!stat) continue;
    if (typeof stat.effectiveDefense === "number") {
      cells.push({ key: `${fighter}|defense`, label: `${fighter} · defense`, value: stat.effectiveDefense });
    }
    if (typeof stat.averageTrainingLevel === "number") {
      cells.push({ key: `${fighter}|training`, label: `${fighter} · training`, value: stat.averageTrainingLevel });
    }
    for (const [pid, param] of Object.entries(stat.parameters ?? {})) {
      cells.push({ key: `${fighter}|param:${pid}`, label: `${fighter} · param ${pid}`, value: param?.value ?? null });
    }
  }
  return cells;
}

type RegionColumn = { candidate: Candidate; recommended: boolean };
type RegionRow = { key: string; label: string; values: Array<number | null> };

/**
 * The same rules the engine applies to its own archive: a complete, comparable `SELECTION_RUNS`
 * selection bank with a win-interval lower bound of at least `RECOMMENDED_WIN_LOW`, restricted to one
 * measured family. "Recommended" additionally requires a callback mean within 95% of the best
 * observed in that family. Nothing here interpolates or promises an in-game result.
 */
function regionFor(candidates: Candidate[], family: string | null): {
  columns: RegionColumn[];
  rows: RegionRow[];
  bestObserved: number | null;
} {
  const viable = candidates
    .filter(
      (candidate) =>
        Boolean(candidate.selection) &&
        candidate.selection.n >= SELECTION_RUNS &&
        candidate.selection.comparable &&
        candidate.validation.comparable &&
        candidate.validation.winInterval[0] >= RECOMMENDED_WIN_LOW &&
        Array.isArray(candidate.selection.winInterval) &&
        (candidate.selection.winInterval[0] ?? 0) >= RECOMMENDED_WIN_LOW &&
        (candidate.family ?? null) === family,
    )
    .sort((left, right) => (right.selection.callbackMean ?? -Infinity) - (left.selection.callbackMean ?? -Infinity));

  const callbackMeans = viable
    .map((candidate) => candidate.selection.callbackMean)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const bestObserved = callbackMeans.length ? Math.max(...callbackMeans) : null;
  const recommendedIds = new Set(
    bestObserved === null
      ? []
      : viable
          .filter((candidate) => (candidate.selection.callbackMean ?? -Infinity) >= bestObserved * RECOMMENDED_CALLBACK_SHARE)
          .map((candidate) => candidate.id),
  );

  const labels = new Map<string, string>();
  for (const candidate of viable) {
    for (const cell of fighterStatCells(candidate.stats)) {
      if (!labels.has(cell.key)) labels.set(cell.key, cell.label);
    }
  }

  const rows: RegionRow[] = [...labels.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([key, label]) => ({
      key,
      label,
      values: viable.map((candidate) => {
        const cell = fighterStatCells(candidate.stats).find((entry) => entry.key === key);
        return cell ? cell.value : null;
      }),
    }));

  return {
    columns: viable.map((candidate) => ({ candidate, recommended: recommendedIds.has(candidate.id) })),
    rows,
    bestObserved,
  };
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{clamped.toFixed(0)}%</span>
      </div>
      <Progress value={clamped} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function StrategyOptimizerDesktopPage() {
  const [api, setApi] = useState<OptimizerApi | null>(() => hostApi());
  const [status, setStatus] = useState<OptimizerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exampleLabel, setExampleLabel] = useState<string | null>(null);
  const [workers, setWorkers] = useState(1);
  const [duty, setDuty] = useState(0.5);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayTitle, setReplayTitle] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayRecord, setReplayRecord] = useState<GeneratedBattleRecord>();
  /** Guards polling and manual refreshes so two status requests never overlap. */
  const inFlight = useRef(false);

  useEffect(() => {
    if (api) return;
    const onReady = () => setApi(hostApi());
    window.addEventListener("pywebviewready", onReady);
    return () => window.removeEventListener("pywebviewready", onReady);
  }, [api]);

  const refresh = useCallback(async () => {
    const host = api;
    if (!host || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await host.status();
      if (next && typeof next === "object") {
        setStatus(next);
        setStatusError(null);
      } else {
        setStatusError("the host returned an empty status");
      }
    } catch (error) {
      setStatusError(String(error));
    } finally {
      inFlight.current = false;
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [api, refresh]);

  const candidates = useMemo(() => status?.candidates ?? [], [status]);
  const archive = useMemo(() => status?.archive ?? [], [status]);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  useEffect(() => {
    if (selectedId && candidates.some((candidate) => candidate.id === selectedId)) return;
    setSelectedId(candidates.length ? candidates[0].id : null);
  }, [candidates, selectedId]);

  const exampleLabels = useMemo(
    () => (selected ? Object.keys(selected.examples ?? {}) : []),
    [selected],
  );

  useEffect(() => {
    if (!selected) {
      setExampleLabel(null);
      return;
    }
    const labels = Object.keys(selected.examples ?? {});
    setExampleLabel((current) => (current && labels.includes(current) ? current : labels[0] ?? null));
  }, [selected]);

  const families = useMemo(() => {
    const grouped = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const key = candidate.family ?? NO_FAMILY;
      const bucket = grouped.get(key);
      if (bucket) bucket.push(candidate);
      else grouped.set(key, [candidate]);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [candidates]);

  const region = useMemo(() => regionFor(candidates, selected?.family ?? null), [candidates, selected]);

  const completeSelection = candidates.filter(isCompleteSelection).length;
  const provenance = status?.provenance ?? null;

  const sendCommand = useCallback(
    async (label: string, action: string, value: Record<string, unknown>) => {
      const host = api;
      if (!host) return;
      setBusy(label);
      setActionError(null);
      try {
        const result = await host.command(action, value);
        if (result && result.ok === false) setActionError(result.error ?? `${label} was refused`);
        else setNotice(`${label} accepted`);
      } catch (error) {
        setActionError(String(error));
      } finally {
        setBusy(null);
      }
    },
    [api],
  );

  const importBuild = useCallback(async () => {
    const host = api;
    if (!host) return;
    setBusy("Import");
    setActionError(null);
    try {
      const result = await host.import_build();
      if (result && result.ok === false) setActionError(result.error ?? "the supplied build was refused");
      else setNotice("imported the supplied build");
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(null);
    }
  }, [api]);

  const exportBuild = useCallback(async () => {
    const host = api;
    if (!host || !selected) return;
    setBusy("Export");
    setActionError(null);
    try {
      const result = await host.export_build(selected.id);
      if (result && result.ok === false) setActionError(result.error ?? "the build could not be exported");
      else setNotice(`exported ${selected.label}`);
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(null);
    }
  }, [api, selected]);

  const newLibrary = useCallback(async () => {
    const host = api;
    if (!host) return;
    setBusy("New library");
    setActionError(null);
    try {
      const result = await host.new_library();
      if (result && result.ok === false) setActionError(result.error ?? "a new library was refused");
      else setNotice("the host opened a new library");
    } catch (error) {
      setActionError(String(error));
    } finally {
      setBusy(null);
    }
  }, [api]);

  const runReplay = useCallback(async () => {
    const host = api;
    if (!host || !selected || !exampleLabel) return;
    const seeds = selected.examples?.[exampleLabel]?.seeds;
    if (!Array.isArray(seeds) || seeds.length < 2) {
      setReplayError("this example carries no seed pair to replay");
      return;
    }
    setReplayBusy(true);
    setReplayError(null);
    try {
      const result = await host.replay(selected.id, [Number(seeds[0]), Number(seeds[1])]);
      if (!result || result.ok === false || !result.replay) {
        setReplayError(result?.error ?? "the host returned no replay payload");
        return;
      }
      const { result: parsed, issues } = parseBattleReplayResult(result.replay);
      if (!parsed) {
        setReplayError(`replay payload rejected: ${issues.join("; ")}`);
        return;
      }
      const title = `${selected.label} · ${exampleLabel}`;
      // Read-only by design: `scenarioJson` is omitted so the shared renderer shows the selected
      // actual trace and never offers branch interactions for an optimiser replay.
      setReplayRecord(createGeneratedBattleRecord(parsed, undefined, REPLAY_WARNINGS, title));
      setReplayTitle(title);
      setShowReplay(true);
    } catch (error) {
      setReplayError(String(error));
    } finally {
      setReplayBusy(false);
    }
  }, [api, selected, exampleLabel]);

  const stateLabel = status?.state ?? (api ? "Waiting for the host" : "Host not connected");
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-desktop-optimizer-root
      data-optimizer-state={status?.state ?? "unavailable"}
    >
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6">
        {showReplay ? (
          <div className="space-y-3" data-optimizer-replay>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowReplay(false)}
                data-action="back-to-optimizer"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back to optimiser
              </Button>
              <span className="text-xs text-muted-foreground" data-optimizer-replay-title>
                {replayTitle ?? "selected trace"}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                read-only · branch interactions disabled
              </Badge>
            </div>
            <GeneratedBattleReplay initialRecord={replayRecord} />
          </div>
        ) : (
          <>
            <PageHeader
              icon={<Swords className="h-5 w-5" />}
              title="Strategy Optimiser"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <ToneBadge category={stateCategory(stateLabel)}>{stateLabel}</ToneBadge>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    local-only · measurements from the recovered runner
                  </Badge>
                </div>
              }
            >
              <p>
                Discover and compare combat strategies, keep your results between sessions,
                and watch selected battles here in the app.
              </p>
            </PageHeader>

            <Alert className="border-amber-500/40 bg-amber-500/5" data-optimizer-caveat>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Research caveat: retained chests are unavailable</AlertTitle>
              <AlertDescription>
                <p>
                  Retained inventory and automatic battle completion are not fully modelled yet.
                  Prize callbacks show combat activity, not chests you will keep. Results remain
                  provisional; supplied stat values are not proof that a build is achievable in-game.
                </p>
              </AlertDescription>
            </Alert>

            {statusError ? (
              <Alert variant="destructive" data-optimizer-host-error>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>The desktop host did not answer</AlertTitle>
                <AlertDescription>
                  <p className="font-mono text-[11px]">{statusError}</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {status?.error ? (
              <Alert data-optimizer-message>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Optimiser message</AlertTitle>
                <AlertDescription>
                  <p>{status.error}</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {actionError ? (
              <Alert variant="destructive" data-optimizer-action-error>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Command refused</AlertTitle>
                <AlertDescription>
                  <p>{actionError}</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {notice ? (
              <p className="text-xs text-muted-foreground" data-optimizer-notice>
                {notice}
              </p>
            ) : null}

            {!api ? (
              <Card data-optimizer-no-host>
                <CardHeader>
                  <CardTitle className="text-base">Desktop host not connected</CardTitle>
                  <CardDescription>
                    `window.pywebview.api` is not present, so there is nothing to drive. Open this page
                    through the local desktop host rather than a plain browser tab.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            <Card data-optimizer-controls>
              <CardHeader>
                <CardTitle className="text-base">Run control &amp; library</CardTitle>
                <CardDescription>
                  Bound the search's workers and duty cycle, start or pause it, and manage the library.
                  Pause or stop finishes and saves the current batch before releasing the workers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {status && !status.compatible ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                    The simulator changed since this library was written, so starting is blocked until a new
                    library is opened.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-end gap-6">
                  <div className="space-y-1">
                    <Label className="text-xs">Workers</Label>
                    <Select value={String(workers)} onValueChange={(value) => setWorkers(Number(value))} disabled={!api}>
                      <SelectTrigger className="h-8 w-24 text-xs" data-optimizer-workers>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">engine caps at 2</p>
                  </div>
                  <div className="w-64 space-y-1">
                    <Label className="text-xs">Duty cycle: {duty.toFixed(2)}</Label>
                    <Slider
                      value={[duty]}
                      min={0.1}
                      max={0.8}
                      step={0.05}
                      onValueChange={(value) => setDuty(value[0] ?? 0.5)}
                      disabled={!api}
                      data-optimizer-duty
                    />
                    <p className="text-[10px] text-muted-foreground">0.10–0.80 of wall-clock; lower is gentler</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void sendCommand("Start", "start", { workers, duty })}
                    disabled={!api || busy !== null || !status?.compatible || status?.state === "Running"}
                    data-action="optimizer-start"
                  >
                    <Play className="mr-1 h-3.5 w-3.5" /> Start
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendCommand("Pause", "pause", {})}
                    disabled={!api || busy !== null || status?.state !== "Running"}
                    data-action="optimizer-pause"
                  >
                    <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendCommand("Stop", "stop", {})}
                    disabled={!api || busy !== null || !status}
                    data-action="optimizer-stop"
                  >
                    <Square className="mr-1 h-3.5 w-3.5" /> Stop
                  </Button>
                  <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void importBuild()}
                    disabled={!api || busy !== null}
                    data-action="optimizer-import"
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" /> Import supplied build…
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void exportBuild()}
                    disabled={!api || busy !== null || !selected}
                    data-action="optimizer-export"
                  >
                    <Download className="mr-1 h-3.5 w-3.5" /> Export chosen build…
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void newLibrary()}
                    disabled={!api || busy !== null}
                    data-action="optimizer-new-library"
                  >
                    <FilePlus2 className="mr-1 h-3.5 w-3.5" /> New library
                  </Button>
                  <Button type="button" variant="outline" disabled={!api || busy !== null || stateLabel === "Running" || stateLabel === "Saving"}
                    onClick={() => void sendCommand("All 20 encounters", "all_encounters", {})}>
                    Search all 20 encounters
                  </Button>
                </div>

                {busy ? (
                  <p className="text-xs text-muted-foreground" data-optimizer-busy>
                    {busy}…
                  </p>
                ) : null}
                <p className="text-[10px] text-muted-foreground">
                  Import and export use a file picker. New library creates or opens a separate
                  results library while search is paused. Each worker is limited to 768 MiB;
                  one simulation can run for at most 180 seconds.
                </p>
              </CardContent>
            </Card>

            <Card data-optimizer-status>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Library status</CardTitle>
                    <CardDescription>
                      Polled every {POLL_INTERVAL_MS / 1000} seconds; the counts are the runner's own.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void refresh()}
                    disabled={!api}
                    data-action="optimizer-refresh"
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <StatTile label="State" value={stateLabel} />
                  <StatTile label="Total runs" value={formatInt(status?.totalRuns)} />
                  <StatTile label="Proposals" value={formatInt(status?.proposals)} hint="legal mutations emitted" />
                  <StatTile label="Improvements" value={formatInt(status?.improvements)} hint="archive replacements" />
                  <StatTile label="Latest improvement" value={formatInt(status?.lastImprovementRun)} hint="run index" />
                  <StatTile label="Library on disk" value={formatBytes(status?.diskBytes)} />
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatTile label="Since first Start" value={`${Math.floor((status?.sessionElapsedSeconds ?? 0) / 60)}m ${Math.floor((status?.sessionElapsedSeconds ?? 0) % 60)}s`} hint="this app session; includes pauses" />
                    <StatTile label="Average simulation" value={status?.averageSimulationSeconds == null ? "Measuring…" : `${status.averageSimulationSeconds.toFixed(2)} s`} hint={`${status?.timedRuns ?? 0} timed runs; excludes deliberate idle time`} />
                    <StatTile label="Current batch elapsed" value={status?.currentRunElapsedSeconds == null ? "Idle" : `${status.currentRunElapsedSeconds.toFixed(1)} s`} />
                    <StatTile label="Estimated runs / hour" value={status?.averageSimulationSeconds ? formatInt(3600 * workers * duty / status.averageSimulationSeconds) : "—"} hint="at selected worker count and duty cycle; estimate" />
                  </div>
                  <p className="text-xs text-muted-foreground">Search screens new builds before spending 64 validation seeds on them. Two initial losses defer a build; they do not prove it can never work. Each encounter has its own strategy families.</p>
                  <ProgressRow
                    label={`Selection-complete builds (${completeSelection}/${candidates.length})`}
                    value={candidates.length ? (completeSelection / candidates.length) * 100 : 0}
                  />
                  {selected ? (
                    <>
                      <ProgressRow
                        label={`Discovery runs for ${selected.label} (${formatInt(selected.discovery?.n)}/${DISCOVERY_RUNS})`}
                        value={selected.discovery ? (selected.discovery.n / DISCOVERY_RUNS) * 100 : 0}
                      />
                      <ProgressRow
                        label={`Validation runs for ${selected.label} (${formatInt(selected.validation?.n)}/${SELECTION_RUNS})`}
                        value={selected.validation ? (selected.validation.n / SELECTION_RUNS) * 100 : 0}
                      />
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card data-optimizer-families>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4" /> Families (provisional)
                </CardTitle>
                <CardDescription>
                  Coarse measured behavioural cells from the runner's own validation runs — a hypothesis about
                  a family, not one family per parameter vector. Candidates stay provisional until a family's
                  selection bank is complete.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No candidates in this library yet.</p>
                ) : null}
                {families.map(([family, list]) => (
                  <div key={family} className="space-y-2 rounded-md border p-3" data-optimizer-family={family}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{family}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {list.length} candidate{list.length === 1 ? "" : "s"}
                      </Badge>
                      {list.every((candidate) => !isCompleteSelection(candidate)) ? (
                        <ToneBadge category="warning">provisional</ToneBadge>
                      ) : null}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Build</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Selection sample</TableHead>
                          <TableHead>Win rate (95% CI)</TableHead>
                          <TableHead>Callbacks (mean)</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((candidate) => (
                          <TableRow key={candidate.id} data-candidate={candidate.id}>
                            <TableCell>
                              <div className="font-medium">{candidate.label}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {shortId(candidate.id)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {candidate.source}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatInt(candidate.selection?.n)}/{SELECTION_RUNS} ·{" "}
                              {candidate.selection?.comparable ? "comparable" : "partial"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatPercent(candidate.selection?.winRate)} · [
                              {formatInterval(candidate.selection?.winInterval)}]
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatNumber(candidate.selection?.callbackMean, 2)}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant={candidate.id === selectedId ? "default" : "outline"}
                                onClick={() => setSelectedId(candidate.id)}
                                data-action="select-candidate"
                              >
                                {candidate.id === selectedId ? "Selected" : "Select"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </CardContent>
            </Card>

            {selected ? (
              <Card data-optimizer-selection data-selected-candidate={selected.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{selected.label}</CardTitle>
                      <CardDescription>
                        <span className="font-mono">{selected.id}</span> · {selected.source} · family{" "}
                        {selected.family ?? NO_FAMILY} · {formatInt(selected.validationRuns)} validation run(s)
                        recorded
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void exportBuild()}
                        disabled={!api || busy !== null}
                        data-action="optimizer-export-selected"
                      >
                        <Download className="mr-1 h-3.5 w-3.5" /> Export…
                      </Button>
                      <Button type="button" size="sm" variant="outline"
                        disabled={!api || busy !== null || selected.source === "saved"}
                        onClick={() => void sendCommand("Keep build", "keep", { id: selected.id })}>
                        <FilePlus2 className="mr-1 h-3.5 w-3.5" />
                        {selected.source === "saved" ? "Kept in library" : "Keep build"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void runReplay()}
                        disabled={!api || replayBusy || !exampleLabel || stateLabel === "Running" || stateLabel === "Saving"}
                        data-action="optimizer-replay"
                      >
                        <Swords className="mr-1 h-3.5 w-3.5" /> {replayBusy ? "Running replay…" : "Replay selected trace"}
                      </Button>
                    </div>
                  </div>
                  {replayBusy ? (
                    <p className="text-xs text-muted-foreground" data-optimizer-replay-busy>
                      The runner is producing the exact trace for this seed pair; a replay can take a while.
                    </p>
                  ) : null}
                  {replayError ? (
                    <p className="text-xs text-destructive" data-optimizer-replay-error>
                      {replayError}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Distributions &amp; reliability
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bank</TableHead>
                          <TableHead>n</TableHead>
                          <TableHead>wins</TableHead>
                          <TableHead>losses</TableHead>
                          <TableHead>censored</TableHead>
                          <TableHead>win rate</TableHead>
                          <TableHead>win 95% CI</TableHead>
                          <TableHead>failure</TableHead>
                          <TableHead>unresolved</TableHead>
                          <TableHead>callback mean</TableHead>
                          <TableHead>SD</TableHead>
                          <TableHead>min</TableHead>
                          <TableHead>p10</TableHead>
                          <TableHead>max</TableHead>
                          <TableHead>resources</TableHead>
                          <TableHead>survivors</TableHead>
                          <TableHead>ticks</TableHead>
                          <TableHead>comparable</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(
                          [
                            ["discovery", selected.discovery],
                            ["validation", selected.validation],
                            [`selection (first ${SELECTION_RUNS})`, selected.selection],
                          ] as Array<[string, Summary]>
                        ).map(([label, summary]) => (
                          <TableRow key={label} data-bank={label}>
                            <TableCell className="text-xs font-medium">{label}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatInt(summary?.n)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatInt(summary?.wins)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatInt(summary?.losses)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatInt(summary?.censored)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatPercent(summary?.winRate)}</TableCell>
                            <TableCell className="text-xs tabular-nums">
                              [{formatInterval(summary?.winInterval)}]
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{formatPercent(summary?.failureRate)}</TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatPercent(summary?.unresolvedRate)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatNumber(summary?.callbackMean, 3)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(summary?.callbackSD, 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(summary?.callbackMin, 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(summary?.callbackP10, 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(summary?.callbackMax, 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatNumber(summary?.meanResources, 3)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {formatNumber(summary?.meanSurvivors, 3)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(summary?.meanTicks, 1)}</TableCell>
                            <TableCell className="text-xs">{summary?.comparable ? "yes" : "no"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Validation statistics cover all completed samples. The selection bank stays fixed;
                      replay examples retain the first 64 and latest 192 validation seeds. These sampling
                      intervals do not certify real-game reliability.
                    </p>
                    {selected.validation.callbackHistogram && (
                      <div className="mt-3 flex flex-wrap gap-2" aria-label="Callback distribution over resolved validation runs">
                        {Object.entries(selected.validation.callbackHistogram).map(([range, count]) => (
                          <Badge key={range} variant="outline">{range} callbacks: {count} runs</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Interesting examples (choose a seed pair)
                    </p>
                    {exampleLabels.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No stored runs yet, so there is no example to replay.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2" data-optimizer-examples>
                        {exampleLabels.map((label) => (
                          <Button
                            key={label}
                            type="button"
                            size="sm"
                            variant={label === exampleLabel ? "default" : "outline"}
                            onClick={() => setExampleLabel(label)}
                            data-action="choose-example"
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    )}
                    {exampleLabels.length > 0 ? (
                      <Table className="mt-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Example</TableHead>
                            <TableHead>Seeds [math, lib]</TableHead>
                            <TableHead>Run digest</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exampleLabels.map((label) => {
                            const example = selected.examples?.[label];
                            return (
                              <TableRow key={label} data-example={label}>
                                <TableCell className="text-xs">{label}</TableCell>
                                <TableCell className="font-mono text-[11px]">
                                  {Array.isArray(example?.seeds) ? `[${example.seeds.join(", ")}]` : "—"}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-foreground">
                                  {example?.digest ? example.digest.slice(0, 16) : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : null}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Replaying always uses the runner's exact scenario and the chosen seed pair; only the
                      selected trace is generated.
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Effective stats of this build (runner-prepared values)
                    </p>
                    {Object.keys(selected.stats ?? {}).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        The runner reported no prepared stats for this build.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fighter</TableHead>
                            <TableHead>Kind</TableHead>
                            <TableHead>Weapon</TableHead>
                            <TableHead>Range</TableHead>
                            <TableHead>Eff. defense</TableHead>
                            <TableHead>Avg training</TableHead>
                            <TableHead>Parameters (value/max)</TableHead>
                            <TableHead>Skill MP costs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(selected.stats).map(([fighter, stat]) => {
                            const parameters = Object.entries(stat.parameters ?? {});
                            const skillCosts = stat.skillCosts ?? [];
                            return (
                              <TableRow key={fighter} data-fighter={fighter}>
                                <TableCell className="text-xs font-medium">{fighter}</TableCell>
                                <TableCell className="text-xs">{stat.monster ? "monster" : "hero"}</TableCell>
                                <TableCell className="text-xs">{stat.weaponId ?? "—"}</TableCell>
                                <TableCell className="text-xs tabular-nums">
                                  {formatNumber(stat.weaponRange, 0)}
                                </TableCell>
                                <TableCell className="text-xs tabular-nums">
                                  {formatNumber(stat.effectiveDefense, 2)}
                                </TableCell>
                                <TableCell className="text-xs tabular-nums">
                                  {formatNumber(stat.averageTrainingLevel, 2)}
                                </TableCell>
                                <TableCell className="font-mono text-[11px]">
                                  {parameters.length === 0
                                    ? "—"
                                    : parameters
                                        .map(
                                          ([pid, param]) =>
                                            `param ${pid}: ${formatNumber(param?.value, 2)}/${formatNumber(param?.maximum, 0)}`,
                                        )
                                        .join(" · ")}
                                </TableCell>
                                <TableCell className="font-mono text-[11px]">
                                  {skillCosts.length === 0
                                    ? "—"
                                    : skillCosts.map((row) => `skill ${row.skillId}: ${row.cost}`).join(" · ")}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Parameter ids are the runner's own numeric keys; no stat names are invented. These are
                      supplied or canonically mutated builds, not an achievability claim.
                    </p>
                  </div>

                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground">
                      Scenario that produced this build
                    </summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted/40 p-2">
                      {JSON.stringify(selected.scenario, null, 2)}
                    </pre>
                  </details>
                </CardContent>
              </Card>
            ) : null}

            {selected ? (
              <Card data-optimizer-region data-region-family={selected.family ?? NO_FAMILY}>
                <CardHeader>
                  <CardTitle className="text-base">
                    Recommended / viable joint stat region — {selected.family ?? NO_FAMILY}
                  </CardTitle>
                  <CardDescription>
                    Only builds in this same measured family with a complete, comparable {SELECTION_RUNS}-run
                    selection bank are shown. Recommended = win-interval lower bound ≥{" "}
                    {RECOMMENDED_WIN_LOW.toFixed(2)} and callback mean within{" "}
                    {Math.round(RECOMMENDED_CALLBACK_SHARE * 100)}% of the best observed in the family. Viable
                    = every such tested build.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {region.columns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No build in this family has a complete {SELECTION_RUNS}-run selection bank with a lower
                      win-interval bound ≥ {RECOMMENDED_WIN_LOW.toFixed(2)} yet.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground" data-optimizer-best-observed>
                        Best observed callback mean in this family:{" "}
                        <span className="font-mono text-foreground">{formatNumber(region.bestObserved, 3)}</span>.
                        Best observed is the best of these tested builds only — it is never a global optimum.
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-48">Stat (fighter · key)</TableHead>
                            {region.columns.map(({ candidate, recommended }) => (
                              <TableHead key={candidate.id} className="text-right">
                                <div className="font-mono text-[10px]">{shortId(candidate.id)}</div>
                                <div className="text-[9px] font-normal text-muted-foreground">
                                  {recommended ? "recommended" : "viable"}
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {region.rows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="text-[11px]">{row.label}</TableCell>
                              {row.values.map((value, index) => (
                                <TableCell
                                  key={region.columns[index].candidate.id}
                                  className="text-right font-mono text-[11px] tabular-nums"
                                >
                                  {formatNumber(value, 2)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <p className="text-[10px] text-muted-foreground">
                        Each column is one tested joint build and the cells are its measured values — not
                        independent per-stat ranges or min/max promises. No interpolation and no in-game
                        achievability certification are implied.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <Card data-optimizer-archive>
              <CardHeader>
                <CardTitle className="text-base">Archive</CardTitle>
                <CardDescription>
                  One entry per measured family cell. Membership is provisional; the quality triple is the
                  runner's own (callback mean, win-interval lower bound, −mean resources).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {archive.length === 0 ? (
                  <p className="text-xs text-muted-foreground">The archive is empty.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cell</TableHead>
                        <TableHead>Build</TableHead>
                        <TableHead>Callbacks (mean)</TableHead>
                        <TableHead>Win 95% lower</TableHead>
                        <TableHead>−resources</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {archive.map((row) => {
                        const quality = parseQuality(row.quality);
                        const known = candidates.some((candidate) => candidate.id === row.candidate);
                        return (
                          <TableRow key={row.cell} data-archive-cell={row.cell}>
                            <TableCell className="text-[11px]">{row.cell}</TableCell>
                            <TableCell className="font-mono text-[10px]">{shortId(row.candidate)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(quality?.[0], 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(quality?.[1], 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatNumber(quality?.[2], 3)}</TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedId(row.candidate)}
                                disabled={!known}
                                data-action="select-archive-candidate"
                              >
                                Select
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card data-optimizer-provenance>
              <CardHeader>
                <CardTitle className="text-base">Provenance</CardTitle>
                <CardDescription>
                  Digests of the canonical runner sources and the live runtime data this library is bound to.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Digest</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead>Missing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="break-all font-mono text-[10px]">
                        {provenance?.digest ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{provenance?.mode ?? "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{formatInt(provenance?.count)}</TableCell>
                      <TableCell className="text-xs">
                        {provenance?.missing?.length ? provenance.missing.join(", ") : "none"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                {provenance?.files ? (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground">
                      File digests ({Object.keys(provenance.files).length})
                    </summary>
                    <Table className="mt-1">
                      <TableHeader>
                        <TableRow>
                          <TableHead>File</TableHead>
                          <TableHead>sha256</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(provenance.files).map(([file, digest]) => (
                          <TableRow key={file}>
                            <TableCell className="text-[11px]">{file}</TableCell>
                            <TableCell className="break-all font-mono text-[10px]">{digest ?? "missing"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
