import { useEffect, useMemo, useRef, useState } from "react";
import { Package, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { EquipmentSprite } from "@/components/ka/equipment-sprite";
import { getEquipmentIcon } from "@/lib/equipment-icons";
import { favoriteFingerprint, saveFarmingFavorite, useFarmingFavorites } from "@/lib/farming-favorites";
import { chestStrategyGoals, type ChestStrategyOption } from "@/lib/chest-strategy-targets";
import { measuredStrategyBuild } from "@/lib/chest-strategy-boundaries";
import { strategyMatchDeviation, type ProfileStrategyMatch } from "@/lib/profile-strategy-matches";
import { compareFarmingDpsRank } from "@/lib/farming-dps-ranking";
import { exactAccountDiagnosticCase, accountDiagnosticLabel, accountDiagnosticScenario, accountDiagnosticFailedPilotApplies, accountDiagnosticObservedDeathsApply } from "@/game-data/account-diagnostic-evidence";
import { findHostedAccountCombatEvidence, loadHostedAccountCombatEvidenceDataset, type HostedEvidenceMatch } from "@/game-data/hosted-account-combat-evidence";
import { HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY, prepareHostedAccountEvidenceInput } from "@/game-data/prepare-hosted-account-evidence";
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";
import { compareHostedRecipeEvidenceOrder, hostedEvidenceMatchesForScope, hostedRecipeEvidenceOrder, profileFarmingBuildFingerprint, projectHostedRecipeProfileCandidates, type HostedRecipeProfileCandidate } from "@/lib/hosted-recipe-profile-targets";
import type { PlayerProfile } from "@/lib/player-profile";
import type { SharedLoadoutData } from "@/lib/battle-legality";
import type { FarmingPlannerSettings } from "@/lib/farming-planner";
import { testedProfileEvidenceVisible, type TestedProfileCandidate } from "@/lib/tested-profile-build";

const FIXED_TEAM_BENCHMARK_HEADERS = [
  "Exact-stat research mean", "Exact-stat research best", "Exact-stat research n",
  "Fixed-team target avg", "Fixed-team target best", "Fixed-team target n", "Fixed-team target seeds",
] as const;

function accountRewardEvidenceLabel(exactMeasuredMatch: boolean): string {
  return exactMeasuredMatch
    ? "Unmeasured for your team · Exact four-stat research match"
    : "Unmeasured for your team";
}

function hostedCohortLabel(match: HostedEvidenceMatch): string {
  if (match.cohortId === "primary-six-validation-20") return "Primary six-skill cohort";
  if (match.cohortId === "mp-followup-pajamas-replication-5") return "Pajamas follow-up replication";
  if (match.cohortId === "mp-followup-fire-pajamas-5") return "Fire Sword + Pajamas cohort";
  if (match.caseId === "speed-breakpoint") return "Pajamas original cohort";
  const labels: Record<string, string> = {
    "dex-accessibility-small": "DEX accessibility cohort",
    "attack-speed-joint": "Attack/speed cohort",
    "luck-dex-attack-tradeoff": "Luck/DEX tradeoff cohort",
  };
  return labels[match.caseId] ?? "Measured build cohort";
}

function ConditionalHostedEvidence({ matches }: { matches: HostedEvidenceMatch[] }) {
  if (matches.length === 0) return null;
  return <div className="rounded-md border border-primary/25 bg-muted/20 p-3 text-xs">
    <p className="font-medium">Conditional test results</p>
    <p className="text-muted-foreground">Simulate starts fresh; Herbs are manual.</p>
    <div className="mt-2 space-y-2">{matches.map((match) => {
      const summary = match.outcomeSummary;
      const terminality = summary.terminality;
      const observedDeaths = summary.survival.survived < summary.survival.sampleSize;
      const incompleteFirstBossCoverage = summary.firstBossAttempt.count < match.sample.n;
      return <div key={match.cohortId} className="rounded border bg-background/60 p-2">
        <p className={`font-medium ${observedDeaths || incompleteFirstBossCoverage ? "text-amber-700 dark:text-amber-300" : ""}`}>{observedDeaths ? "Observed deaths · " : incompleteFirstBossCoverage ? "First boss not reached in every run · " : ""}{hostedCohortLabel(match)} · {match.sample.n} tests</p>
        <p className="mt-1 tabular-nums">Modeled average {summary.modeledCallbacks.mean.toFixed(1)} · survived {summary.survival.survived}/{summary.survival.sampleSize}{terminality.horizonCensored > 0 ? " · 18k-tick endpoint" : ""}</p>
        <details className="mt-1 text-muted-foreground">
          <summary className="cursor-pointer">Scope, resources, and limits</summary>
          <p className="mt-1">Callback scope: {summary.callbackScope}. Terminal battles: {terminality.terminalByVerdictAndDeparture}/{match.sample.n}; horizon-censored: {terminality.horizonCensored}/{match.sample.n}. First DPS boss attack observed: {summary.firstBossAttempt.count}/{match.sample.n}.</p>
          <p className="mt-1 tabular-nums">Mean paid MP {summary.dpsPaidMp.mean.toFixed(0)} · mean Herbs {summary.herbsUsed.mean.toFixed(1)}{summary.preFirstBossAttemptGrossDpt ? ` · gross pre-boss DPT ${summary.preFirstBossAttemptGrossDpt.mean.toFixed(2)}` : ""}{summary.mpReserveWarnings !== undefined ? ` · MP reserve warnings ${summary.mpReserveWarnings}` : ""}.</p>
          <p className="mt-1">Median {summary.modeledCallbacks.median.toFixed(1)} · highest {summary.modeledCallbacks.max}. These are modeled prize callbacks, not verified collected rewards. Separate cohorts remain separate. {match.caveat}</p>
        </details>
      </div>;
    })}</div>
  </div>;
}

type BuildCardRow = {
  sourceKind: "research-target" | "hosted-recipe";
  match: ProfileStrategyMatch | null;
  option: ChestStrategyOption | null;
  recipe: HostedRecipeProfileCandidate | null;
  build: ProfileGoalBuild;
  fingerprint: string;
  dedupeFingerprint: string;
  favoriteFingerprints: string[];
  measured: ReturnType<typeof measuredStrategyBuild>;
  failedExactSetupPilot: boolean;
  observedDpsDeaths: boolean;
  deviation: number;
  hostedMatches: HostedEvidenceMatch[];
};

export function FarmingDpsResults({ profile, sharedData, plannerSettings, matches, options, busy, status, error, onCancel, onCreate, equipmentIcons, allowUpgrades, exactOnly, testedProfileBuild, testedProfileCandidate, testedProfileAlternatives, testedProfileSetup }: {
  profile: PlayerProfile | null; matches: ProfileStrategyMatch[] | null; options: ChestStrategyOption[];
  sharedData?: SharedLoadoutData | null; plannerSettings?: FarmingPlannerSettings;
  testedProfileBuild?: ProfileGoalBuild | null; testedProfileCandidate?: TestedProfileCandidate;
  testedProfileAlternatives?: readonly { candidate: TestedProfileCandidate; build: ProfileGoalBuild }[];
  testedProfileSetup?: { encounterId: number; placeholderSupports: boolean; allowConsumables: boolean; holyHerbLimit: number; recoveryPotionLimit: number; finiteHpMp: boolean };
  busy: boolean; status: string; error: string; equipmentIcons?: Record<string, string>; allowUpgrades: boolean; exactOnly: boolean;
  onCancel: () => void; onCreate: (build: ProfileGoalBuild, profile: PlayerProfile, destination?: "builder" | "simulator", battleSeconds?: number) => void;
}) {
  const [hostedEvidenceState, setHostedEvidenceState] = useState<{
    profile: PlayerProfile; sharedData: SharedLoadoutData; settings: FarmingPlannerSettings;
    matches: Record<string, HostedEvidenceMatch[]>;
  } | null>(null);
  const [hostedDatasetState, setHostedDatasetState] = useState<{
    profile: PlayerProfile; sharedData: SharedLoadoutData; settings: FarmingPlannerSettings;
    dataset: Awaited<ReturnType<typeof loadHostedAccountCombatEvidenceDataset>>;
  } | null>(null);
  const [recipeEvidenceState, setRecipeEvidenceState] = useState<{
    profile: PlayerProfile; sharedData: SharedLoadoutData; settings: FarmingPlannerSettings;
    matches: Record<string, HostedEvidenceMatch[]>;
  } | null>(null);
  const hostedEvidenceByFingerprint = hostedEvidenceMatchesForScope(hostedEvidenceState, profile, sharedData, plannerSettings);
  const hostedDataset = hostedDatasetState?.profile === profile && hostedDatasetState.sharedData === sharedData &&
    hostedDatasetState.settings === plannerSettings ? hostedDatasetState.dataset : null;
  const hostedRecipeCandidates = useMemo(() => profile && sharedData && plannerSettings && hostedDataset
    ? projectHostedRecipeProfileCandidates(hostedDataset, profile, sharedData, plannerSettings, exactOnly) : [],
  [hostedDataset, profile, sharedData, plannerSettings, exactOnly]);
  const hostedRecipeEvidenceByFingerprint = hostedEvidenceMatchesForScope(recipeEvidenceState, profile, sharedData, plannerSettings);
  const favorites = useFarmingFavorites();
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<string[] | null>(null);
  useEffect(() => {
    if (busy) {
      setCreated(null);
      setSelected([]);
      setNotice("");
    }
  }, [busy]);
  useEffect(() => {
    let cancelled = false;
    setHostedDatasetState(null);
    setRecipeEvidenceState(null);
    if (!profile || !sharedData || !plannerSettings) return () => { cancelled = true; };
    void loadHostedAccountCombatEvidenceDataset().then((dataset) => {
      if (!cancelled) setHostedDatasetState({ profile, sharedData, settings: plannerSettings, dataset });
    }).catch(() => {
      // Recipe suggestions are optional; a failed evidence asset leaves the existing stat search intact.
    });
    return () => { cancelled = true; };
  }, [profile, sharedData, plannerSettings]);
  const equipmentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (created) equipmentHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [created]);
  const [page, setPage] = useState(0);
  const [createdPage, setCreatedPage] = useState(0);
  const [showFixedTeamBenchmarks, setShowFixedTeamBenchmarks] = useState(false);
  useEffect(() => setPage(0), [matches]);
  useEffect(() => setCreatedPage(0), [matches, created]);
  const targetRows = useMemo(() => {
    const optionById = new Map(options.map((option) => [option.id, option]));
    const seen = new Set<string>();
    return (matches ?? []).flatMap((match) => {
      const option = optionById.get(match.id);
      if (!option || !match.build || !profile) return [];
      return (match.builds ?? [match.build]).flatMap((build) => {
        const variant = { ...match, build };
        const fingerprint = favoriteFingerprint(build, profile);
        if (seen.has(`${match.id}:${fingerprint}`) || exactOnly && strategyMatchDeviation(variant, option) !== 0) return [];
        seen.add(`${match.id}:${fingerprint}`);
        const measured = measuredStrategyBuild(option.encounter, build.stats);
        const character = profile.characters.find((item) => item.id === build.characterId);
        const diagnostic = exactAccountDiagnosticCase(option.encounter, build, character?.gender);
        const failedExactSetupPilot = accountDiagnosticFailedPilotApplies(diagnostic, option.encounter, testedProfileSetup);
        const observedDpsDeaths = accountDiagnosticObservedDeathsApply(diagnostic, option.encounter, testedProfileSetup);
        return [{ sourceKind: "research-target" as const, match: variant, build, option, recipe: null, fingerprint, dedupeFingerprint: profileFarmingBuildFingerprint(build, profile), favoriteFingerprints: [fingerprint], measured, failedExactSetupPilot, observedDpsDeaths, deviation: strategyMatchDeviation(variant, option), hostedMatches: [] as HostedEvidenceMatch[] }];
      });
    }).sort((a, b) => compareFarmingDpsRank({ id: a.match.id, failedExactSetupPilot: a.failedExactSetupPilot, observedDpsDeaths: a.observedDpsDeaths, measuredMean: a.measured?.mean ?? null, deviation: a.deviation }, { id: b.match.id, failedExactSetupPilot: b.failedExactSetupPilot, observedDpsDeaths: b.observedDpsDeaths, measuredMean: b.measured?.mean ?? null, deviation: b.deviation }));
  }, [matches, options, profile, exactOnly, testedProfileSetup]);
  const firstRows = useMemo(() => {
    const first = new Map<string, (typeof targetRows)[number]>();
    for (const row of targetRows) if (!first.has(row.match.id)) first.set(row.match.id, row);
    return first;
  }, [targetRows]);
  const matchesById = new Map((matches ?? []).map((match) => [match.id, match]));
  const availableMatches = [...firstRows.keys()].flatMap((id) => matchesById.has(id) ? [matchesById.get(id)!] : []);
  const pageCount = Math.max(1, Math.ceil(availableMatches.length / 25));
  const pageMatches = availableMatches.slice(page * 25, (page + 1) * 25);
  const targetByFingerprint = useMemo(() => {
    const map = new Map<string, (typeof targetRows)[number]>();
    for (const row of targetRows) if (!map.has(row.dedupeFingerprint)) map.set(row.dedupeFingerprint, row);
    return map;
  }, [targetRows]);
  useEffect(() => {
    let cancelled = false;
    setRecipeEvidenceState(null);
    if (!profile || !sharedData || !plannerSettings || hostedRecipeCandidates.length === 0) return () => { cancelled = true; };
    void Promise.all(hostedRecipeCandidates.map(async (candidate) => {
      const fingerprint = favoriteFingerprint(candidate.build, profile);
      try {
        if (candidate.build.addedLevels !== 0) return [fingerprint, []] as const;
        const prepared = await prepareHostedAccountEvidenceInput({ build: candidate.build, profile, sharedData, plannerSettings, policy: HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY });
        return [fingerprint, await findHostedAccountCombatEvidence(prepared.lookupInput)] as const;
      } catch {
        return [fingerprint, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setRecipeEvidenceState({ profile, sharedData, settings: plannerSettings, matches: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  }, [hostedRecipeCandidates, profile, sharedData, plannerSettings]);
  const recipeRows = useMemo<BuildCardRow[]>(() => hostedRecipeCandidates.map((recipe) => {
    const build = recipe.build;
    const fingerprint = profile ? favoriteFingerprint(build, profile) : "";
    const dedupeFingerprint = profile ? profileFarmingBuildFingerprint(build, profile) : fingerprint;
    const target = targetByFingerprint.get(dedupeFingerprint);
    const character = profile?.characters.find(({ id }) => id === build.characterId);
    const diagnostic = plannerSettings ? exactAccountDiagnosticCase(plannerSettings.encounterId, build, character?.gender) : null;
    const hostedMatches = hostedRecipeEvidenceByFingerprint[fingerprint] ?? [];
    const encounterId = plannerSettings?.encounterId;
    const measured = target?.measured ?? null;
    return {
      sourceKind: "hosted-recipe",
      match: target?.match ?? null,
      option: target?.option ?? null,
      recipe,
      build,
      fingerprint,
      dedupeFingerprint,
      favoriteFingerprints: [...new Set([fingerprint, ...(target?.favoriteFingerprints ?? [])])],
      measured,
      failedExactSetupPilot: encounterId === undefined ? false : accountDiagnosticFailedPilotApplies(diagnostic, encounterId, testedProfileSetup),
      observedDpsDeaths: encounterId === undefined ? false : accountDiagnosticObservedDeathsApply(diagnostic, encounterId, testedProfileSetup),
      deviation: target?.deviation ?? Infinity,
      hostedMatches,
    };
  }), [hostedRecipeCandidates, profile, targetByFingerprint, plannerSettings, hostedRecipeEvidenceByFingerprint, testedProfileSetup]);
  const buildRows = useMemo<BuildCardRow[]>(() => {
    const recipeFingerprints = new Set(recipeRows.map(({ dedupeFingerprint }) => dedupeFingerprint));
    const combined: BuildCardRow[] = [
      ...targetRows.filter(({ dedupeFingerprint }) => !recipeFingerprints.has(dedupeFingerprint)),
      ...recipeRows,
    ];
    const tier = (row: BuildCardRow) => {
      if (row.failedExactSetupPilot || row.observedDpsDeaths) return 3;
      if (row.sourceKind === "research-target") return 1;
      const order = hostedRecipeEvidenceOrder(row.hostedMatches);
      if (order.kind === "observed-deaths") return 3;
      return order.kind === "no-observed-deaths" ? 0 : 2;
    };
    return combined.sort((a, b) => {
      const rank = tier(a) - tier(b);
      if (rank !== 0) return rank;
      const sourceOrder = a.sourceKind.localeCompare(b.sourceKind);
      if (sourceOrder !== 0) return sourceOrder;
      if (a.sourceKind === "hosted-recipe" && b.sourceKind === "hosted-recipe") {
        return compareHostedRecipeEvidenceOrder(hostedRecipeEvidenceOrder(a.hostedMatches), hostedRecipeEvidenceOrder(b.hostedMatches)) ||
          (a.recipe?.recipeId ?? "").localeCompare(b.recipe?.recipeId ?? "");
      }
      if (a.sourceKind === "research-target" && b.sourceKind === "research-target") {
        return compareFarmingDpsRank({ id: a.match?.id ?? a.fingerprint, failedExactSetupPilot: a.failedExactSetupPilot, observedDpsDeaths: a.observedDpsDeaths, measuredMean: a.measured?.mean ?? null, deviation: a.deviation },
          { id: b.match?.id ?? b.fingerprint, failedExactSetupPilot: b.failedExactSetupPilot, observedDpsDeaths: b.observedDpsDeaths, measuredMean: b.measured?.mean ?? null, deviation: b.deviation });
      }
      return 0;
    });
  }, [recipeRows, targetRows]);
  const createdRows = useMemo(() => {
    if (busy && !created) return buildRows.filter((row) => row.sourceKind === "hosted-recipe");
    const seen = new Set<string>();
    return buildRows.filter((row) => {
      if (row.sourceKind === "research-target" && created !== null && !created.includes(row.match?.id ?? "") ||
          seen.has(row.dedupeFingerprint)) return false;
      seen.add(row.dedupeFingerprint);
      return true;
    });
  }, [buildRows, recipeRows, created, busy]);
  const createdPageCount = Math.max(1, Math.ceil(createdRows.length / 5));
  const visibleCreatedPage = Math.min(createdPage, createdPageCount - 1);
  const testedProfileVisible = !!testedProfileBuild && !!testedProfileCandidate && !!testedProfileSetup && !!profile &&
    testedProfileEvidenceVisible(testedProfileCandidate, testedProfileSetup);
  const visibleTestedAlternatives = !!testedProfileSetup && !!profile ? (testedProfileAlternatives ?? []).filter(({ candidate }) => testedProfileEvidenceVisible(candidate, testedProfileSetup)) : [];
  const pageCreatedRows = useMemo(() => createdRows.slice(visibleCreatedPage * 5, (visibleCreatedPage + 1) * 5), [createdRows, visibleCreatedPage]);
  useEffect(() => {
    let cancelled = false;
    setHostedEvidenceState(null);
    const targetPageRows = pageCreatedRows.filter(({ sourceKind }) => sourceKind === "research-target");
    if (!profile || !sharedData || !plannerSettings || !targetPageRows.length) return () => { cancelled = true; };
    void Promise.all(targetPageRows.map(async ({ fingerprint, build }) => {
      try {
        const prepared = await prepareHostedAccountEvidenceInput({ build, profile, sharedData, plannerSettings, policy: HOSTED_ACCOUNT_EVIDENCE_FIXED_POLICY });
        return [fingerprint, await findHostedAccountCombatEvidence(prepared.lookupInput)] as const;
      } catch {
        // Unsupported/nearby builds and stale page state remain simply unmeasured.
        return [fingerprint, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setHostedEvidenceState({ profile, sharedData, settings: plannerSettings, matches: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  }, [pageCreatedRows, profile, sharedData, plannerSettings]);
  useEffect(() => {
    if (createdPage !== visibleCreatedPage) setCreatedPage(visibleCreatedPage);
  }, [createdPage, visibleCreatedPage]);
  const renderCreatedPagination = () => <div className="flex items-center justify-between gap-3 border-t pt-3">
    <span className="text-xs text-muted-foreground">Showing {visibleCreatedPage * 5 + 1}–{Math.min((visibleCreatedPage + 1) * 5, createdRows.length)} of {createdRows.length} equipment builds · page {visibleCreatedPage + 1} of {createdPageCount}</span>
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={visibleCreatedPage === 0} onClick={() => setCreatedPage((value) => Math.max(0, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={visibleCreatedPage + 1 >= createdPageCount} onClick={() => setCreatedPage((value) => Math.min(createdPageCount - 1, value + 1))}>Next</Button></div>
  </div>;
  return <section aria-label="Recommended DPS builds" className="space-y-3" data-dps-results>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Profile search results</h2>{busy && <Button variant="outline" onClick={onCancel}>Cancel search</Button>}</div>
    <p role="status" className="text-xs text-muted-foreground">{status || "Preparing your profile…"}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!busy && !error && matches !== null && targetRows.length === 0 && hostedRecipeCandidates.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No {exactOnly ? "exact " : ""}build found for this setup. Try allowing gear upgrades or removing exclusions. An unfinished search does not prove a build is impossible.</p>}
    {targetRows.length > 0 && <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">Browse stat matches ({availableMatches.length}) · rewards untested</summary>
      <div className="mt-3">
      <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={showFixedTeamBenchmarks}
          onChange={(event) => setShowFixedTeamBenchmarks(event.target.checked)} aria-label="Show fixed-team benchmarks" />
        <span>Show fixed-team benchmarks</span>
      </label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm tabular-nums"><thead><tr className="border-b text-xs text-muted-foreground"><th scope="col" className="p-2">Pick</th><th scope="col" className="p-2">Research target</th><th scope="col" className="p-2">Your build</th><th scope="col" className="p-2">Account reward evidence</th>{showFixedTeamBenchmarks && FIXED_TEAM_BENCHMARK_HEADERS.map((label) => <th key={label} className="whitespace-nowrap p-2 text-right" scope="col">{label}</th>)}</tr></thead><tbody>{pageMatches.map((match) => {
        const found = firstRows.get(match.id)!;
        const build = found.build;
        const option = found.option;
        const exact = strategyMatchDeviation({ ...match, build }, option) === 0;
        const measured = measuredStrategyBuild(option.encounter, build.stats);
        const sourceCharacter = profile?.characters.find((row) => row.id === build.characterId);
        const diagnostic = exactAccountDiagnosticCase(option.encounter, build, sourceCharacter?.gender);
        return <tr key={match.id} className="border-b border-border/40 last:border-0">
          <td className="p-2"><input aria-label={`Select strategy ${match.id}`} type="checkbox" className="h-4 w-4 accent-primary" checked={selected.includes(match.id)} onChange={(event) => { setSelected((old) => event.target.checked ? [...old, match.id] : old.filter((id) => id !== match.id)); }} /></td>
          <td className="p-2"><div className="whitespace-nowrap text-xs">ATK {option.atk} · SPD {option.spd} · LCK {option.lck} · DEX {option.dex}</div></td>
          <td className="p-2 text-xs"><div className="whitespace-nowrap font-medium">{build.jobName ?? sourceCharacter?.jobName} · {build.rank ?? sourceCharacter?.rank}</div><div className="mt-1 whitespace-nowrap text-[11px]">ATK {build.stats.atk} · SPD {build.stats.spd} · LCK {build.stats.lck} · DEX {build.stats.dex}</div><div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">HP {build.stats.hp} · MP {build.stats.mp} · DEF {build.stats.def}</div><div className="mt-1 text-[11px] text-muted-foreground">{exact ? "Exact four-stat match" : "Four-stat distance prioritized"}{!match.complete && " · closest found so far"}</div>{diagnostic && <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{accountDiagnosticLabel(diagnostic)}</p>}</td>
          <td className="p-2 text-xs text-muted-foreground"><p>{accountRewardEvidenceLabel(exact && measured !== null)}</p><Button className="mt-2" size="sm" variant="outline" disabled={busy} aria-label={`View equipment for strategy ${match.id}`} onClick={() => setCreated([match.id])}>View equipment</Button></td>
          {showFixedTeamBenchmarks && <>
            <td className="p-2 text-right text-xs">{measured?.mean.toFixed(2) ?? <span className="text-muted-foreground">Not measured</span>}</td>
            <td className="p-2 text-right text-xs">{measured?.highest ?? <span className="text-muted-foreground">Not measured</span>}</td>
            <td className="p-2 text-right text-xs">{measured?.n.toLocaleString() ?? <span className="text-muted-foreground">Not measured</span>}</td>
            <td className="p-2 text-right font-medium">{option.mean.toFixed(2)}{option.n < 200 && <span className="mt-1 block whitespace-nowrap text-[10px] font-normal text-muted-foreground">Exploratory sample</span>}</td>
            <td className="p-2 text-right">{option.highest}</td>
            <td className="p-2 text-right">{option.n.toLocaleString()}</td>
            <td className="whitespace-nowrap p-2 text-right text-xs">{option.seedRange?.length === 2 ? `${option.seedRange[0]}–${option.seedRange[1]}` : "Not recorded"}</td>
          </>}
        </tr>;
      })}</tbody></table></div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3"><span className="text-xs text-muted-foreground">{availableMatches.length.toLocaleString()} strategies · page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button></div></div>
      <Button className="mt-4 min-h-11" disabled={busy || selected.length === 0} onClick={() => setCreated([...selected])}>View selected equipment{selected.length > 0 ? ` (${selected.length})` : ""}</Button>
      </div>
    </details>}
    {createdRows.length > 0 && <h2 ref={equipmentHeading} className="scroll-mt-24 pt-2 text-lg font-semibold">Your equipment options</h2>}
    {createdRows.length > 5 && <div className="rounded-xl border bg-card p-4">{renderCreatedPagination()}</div>}
    {pageCreatedRows.map((row) => {
      const { sourceKind, match, build, option, recipe, fingerprint } = row;
      const character = profile!.characters.find((character) => character.id === build.characterId);
      const diagnostic = exactAccountDiagnosticCase(option?.encounter ?? plannerSettings?.encounterId ?? 0, build, character?.gender);
      const saved = favorites.some((favorite) => row.favoriteFingerprints.includes(favorite.fingerprint));
      const favoriteGoals = option
        ? chestStrategyGoals(option, { atk: 0, spd: 0, lck: 0 })
        : Object.fromEntries(["atk", "spd", "lck", "dex"].map((stat) => [stat, { mode: "range" as const, min: build.stats[stat], max: build.stats[stat] }]));
      const hostedMatches = recipe ? row.hostedMatches : hostedEvidenceByFingerprint[fingerprint] ?? [];
      return <Card key={`${recipe?.recipeId ?? option?.id ?? "recipe"}:${fingerprint}`}><CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3"><CharacterPreviewCanvas jobName={build.jobName ?? character?.jobName ?? "Guard"} rank={build.rank ?? character?.rank} variant={character?.gender === 1 ? 2 : 1} equipState="right" scale={2} poseFrame={0} weaponName={build.picks.find((pick) => pick.slot === "Weapon")?.item} shieldName={build.picks.find((pick) => pick.slot === "Shield")?.item} label={build.characterName} className="h-16 w-16 object-contain" /><div><h3 className="font-semibold">{build.jobName ?? character?.jobName} · Rank {build.rank ?? character?.rank}</h3><p className="text-xs text-muted-foreground">{sourceKind === "hosted-recipe" ? (build.addedLevels > 0 ? "Gear upgrades required" : "Built from your profile") : match ? `${match.complete ? "Search complete" : "Closest found so far"} · ${strategyMatchDeviation(match, option!) === 0 ? "Exact target stats" : "Alternative stats"}` : "Profile build"}</p></div></div>
        <div className="flex flex-wrap gap-3 text-sm tabular-nums">{["atk", "spd", "lck", "dex", "hp", "mp", "def"].map((stat) => <span key={stat}><span className="text-xs text-muted-foreground">{stat.toUpperCase()}</span> {build.stats[stat]?.toLocaleString()}</span>)}</div>
        <div><h4 className="mb-2 text-xs font-medium">Equipment</h4><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{build.picks.map((pick) => {
          const icon = getEquipmentIcon(equipmentIcons, pick.item);
          const upgrade = build.requiredUpgrades.find((row) => row.item === pick.item);
          return <div key={pick.slot} className="flex items-center gap-3 rounded-lg border p-3">{icon ? <EquipmentSprite src={icon} alt="" className="h-10 w-10 shrink-0 object-contain" /> : <Package className="h-10 w-10 shrink-0 text-muted-foreground" />}<div className="min-w-0 text-sm"><p className="text-[10px] text-muted-foreground">{pick.slot}</p><p className="font-medium">{pick.item}</p><p className={`text-xs ${upgrade ? "text-primary" : "text-muted-foreground"}`}>{upgrade ? `Lv${upgrade.currentLevel} → ${pick.level}` : `Lv${pick.level}`}</p></div></div>;
        })}{build.picks.length === 0 && <p className="text-sm text-muted-foreground">No equipment needed for these stats.</p>}</div></div>
        {!!build.skills?.length && <p className="text-xs text-muted-foreground">Required skills: {build.skills.join(" · ")} · check ownership in game.</p>}
        {diagnostic && <div className="rounded-md border border-amber-500/30 px-3 py-2 text-xs"><p className="font-medium text-amber-700 dark:text-amber-300">{accountDiagnosticLabel(diagnostic)}</p><details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">Scenario assumptions</summary><p className="mt-1">{accountDiagnosticScenario(diagnostic)}</p></details></div>}
        {hostedMatches.length === 0 && <p className="text-xs text-muted-foreground">Reward average unmeasured for this build.</p>}
        <ConditionalHostedEvidence matches={hostedMatches} />
        <div className="flex flex-wrap gap-2"><Button onClick={() => onCreate(build, profile!, "simulator")}>Simulate</Button><Button variant="outline" onClick={() => onCreate(build, profile!, "builder")}>Save character</Button><Button variant="outline" disabled={saved} onClick={() => { try { saveFarmingFavorite(build, profile!, favoriteGoals, allowUpgrades); setNotice("Saved to Favorites."); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not save favorite."); } }}><Star className={`mr-2 h-4 w-4 ${saved ? "fill-current" : ""}`} />{saved ? "Saved" : "Favorite"}</Button></div>
      </CardContent></Card>;
    })}
    {createdRows.length > 5 && <div className="rounded-xl border bg-card p-4">{renderCreatedPagination()}</div>}
    {(testedProfileVisible || visibleTestedAlternatives.length > 0) && <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-medium">Previous build tests</summary>
      <div className="mt-3 space-y-3">

    {testedProfileVisible && <Card><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold">Tested profile build</h3>
          <p className="text-xs text-muted-foreground">Conditional diagnostic · {testedProfileBuild!.jobName} · Rank {testedProfileBuild!.rank} · ATK {testedProfileBuild!.stats.atk} · SPD {testedProfileBuild!.stats.spd} · LCK {testedProfileBuild!.stats.lck} · DEX {testedProfileBuild!.stats.dex}</p>
          <p className="mt-1 text-xs">HP {testedProfileBuild!.stats.hp.toLocaleString()} · MP {testedProfileBuild!.stats.mp.toLocaleString()} · DEF {testedProfileBuild!.stats.def.toLocaleString()}</p>
        </div>
        <Button onClick={() => onCreate(testedProfileBuild!, profile!, "simulator", testedProfileCandidate!.horizonSeconds)}>Simulate</Button>
      </div>
      <div className="flex flex-wrap gap-2">{testedProfileBuild!.picks.map((pick) => <span key={pick.slot} className="rounded-md border px-2 py-1 text-xs">{pick.slot}: {pick.item} Lv{pick.level}</span>)}</div>
      <p className="text-xs text-muted-foreground">Required skills: {(testedProfileBuild!.skills ?? []).join(", ")} · ownership not recorded.</p>
      <div className="rounded-md border border-amber-500/30 px-3 py-2 text-xs">
        <p className="font-medium text-amber-700 dark:text-amber-300">Modeled average {testedProfileCandidate!.averageCallbacks} · survived {testedProfileCandidate!.survivedRuns}/{testedProfileCandidate!.sampleSize}</p>
        <details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">Details</summary>
          <p className="mt-1">{testedProfileCandidate!.sampleSize} paired-seed tests · median {testedProfileCandidate!.medianCallbacks} · highest {testedProfileCandidate!.highestCallbacks} · 0–1 callback in {testedProfileCandidate!.atMostOneCallbackRuns}/{testedProfileCandidate!.sampleSize} · median Herbs {testedProfileCandidate!.medianHerbsUsed}.</p>
          <p className="mt-1">Fixed synthetic supports, finite HP/MP, at most 10 Holy Herbs at 20% DPS MP using a 200-tick window, and 0 potions. One run reached the Herb cap and a low-MP reserve after its final reward callback; no lost eligible cast was demonstrated. Your team has not been measured. These are conditional simulator callbacks, not settled or earned rewards; they do not change fixed-research averages or ranking. The Simulate button starts a fresh run, not a replay of these tests. Herbs must be used manually in the interactive replay; setting the stock does not reproduce the tested timing automatically.</p>
        </details>
      </div>
    </CardContent></Card>}
    {visibleTestedAlternatives.map(({ candidate, build }) => <Card key={`tested-alt-${candidate.evidenceSha256}`}><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div>
        <h3 className="font-semibold">Lower-resource alternative · A/ Ribbon Lv40</h3>
        <p className="text-xs text-muted-foreground">Conditional diagnostic · Ninja · Rank A · ATK {build.stats.atk} · SPD {build.stats.spd} · LCK {build.stats.lck} · DEX {build.stats.dex}</p>
        <p className="mt-1 text-xs">HP {build.stats.hp.toLocaleString()} · MP {build.stats.mp.toLocaleString()} · DEF {build.stats.def}</p>
      </div><Button onClick={() => onCreate(build, profile!, "simulator", candidate.horizonSeconds)}>Simulate this alternative</Button></div>
      <div className="flex flex-wrap gap-2">{build.picks.map((pick) => <span key={pick.slot} className="rounded-md border px-2 py-1 text-xs">{pick.slot}: {pick.item} Lv{pick.level}</span>)}</div>
      <p className="text-xs text-muted-foreground">Required skills: {(build.skills ?? []).join(", ")} · ownership not recorded.</p>
      <div className="rounded-md border border-amber-500/30 px-3 py-2 text-xs">
        <p className="font-medium text-amber-700 dark:text-amber-300">Modeled average {candidate.averageCallbacks} · survived {candidate.survivedRuns}/{candidate.sampleSize}</p>
        <details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">Details</summary>
          <p className="mt-1">Separate 20-pair, 36,000-tick cohort · median {candidate.medianCallbacks} · best {candidate.highestCallbacks} · completed {candidate.completedRuns}/20 · 0–1 callback in {candidate.atMostOneCallbackRuns}/20 · Herbs avg/median {candidate.averageHerbsUsed}/{candidate.medianHerbsUsed} · paid MP avg {candidate.averagePaidMp?.toLocaleString()}.</p>
          <p className="mt-1">Fixed synthetic supports; finite HP/MP; at most 10 Holy Herbs at 20% DPS MP using a 200-tick window; 0 potions. In these 20 matched seeds, Ribbon averaged 4.65 Herbs and 7,726.4 paid MP versus control 6.75 Herbs and 10,197.8 paid MP. Ribbon averaged 13.9 callbacks; control endpoint averaged 21.05, with 1 unfinished battle, so that is not a full-battle control mean. Paired callback difference was −7.15 (95% interval −22.15 to 4.95); reward retention is uncertain. The current primary build is a separate 18,000-tick cohort, not a paired comparison. These are conditional simulator callbacks, not settled or earned rewards; fixed-research averages and ranking are unchanged. Simulate starts a fresh run at the tested 1,800-second horizon. Herbs must be used manually in replay; stock does not reproduce tested timing. Evidence audit hashes: candidate {candidate.evidenceSha256}; control {candidate.controlEvidenceSha256}.</p>
        </details>
      </div>
    </CardContent></Card>)}
      </div>
    </details>}
  </section>;
}
