import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadResearchBank, type ResearchBankGroup } from "@/lib/research-strategy-bank";

const PAGE_SIZE = 25;
const STAT_NAMES = ["ATT", "SPD", "LCK", "DEX"] as const;

export function ResearchStrategyBank({ encounter }: { encounter: number }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<ResearchBankGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(["", "", "", ""]);
  const [minimumTrials, setMinimumTrials] = useState("20");
  const [sort, setSort] = useState<"mean" | "trials">("mean");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setGroups([]);
    setError("");
    setStats(["", "", "", ""]);
    setMinimumTrials("20");
    setPage(0);
  }, [encounter]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    loadResearchBank(encounter).then((data) => { if (active) setGroups(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load measured results."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, encounter]);

  const filtered = useMemo(() => {
    const minN = Math.max(1, Number.parseInt(minimumTrials, 10) || 1);
    return groups.filter((group) => group.n >= minN && group.stats.every((value, index) => !stats[index] || value === Number(stats[index])))
      .sort((a, b) => sort === "mean" ? b.mean - a.mean || b.n - a.n || a.id.localeCompare(b.id) : b.n - a.n || b.mean - a.mean || a.id.localeCompare(b.id));
  }, [groups, minimumTrials, sort, stats]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return <section className="rounded-lg border bg-card">
    <button type="button" aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm font-medium hover:bg-muted/30" onClick={() => setOpen((value) => !value)}>
          <span>All measured combinations <span className="font-normal text-muted-foreground">· cohort trials</span></span><ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="space-y-3 border-t p-3">
      <p className="text-xs leading-5 text-muted-foreground">Descriptive cohort-level results from measured trials. Cohorts stay separate; small samples are exploratory and results are not player predictions.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{STAT_NAMES.map((name, index) => <label key={name} className="space-y-1 text-[11px] font-medium text-muted-foreground">{name}<Input aria-label={`Exact ${name}`} className="h-9" inputMode="numeric" type="number" min="0" placeholder="Any" value={stats[index]} onChange={(event) => { setStats((current) => current.map((value, i) => i === index ? event.target.value : value)); setPage(0); }} /></label>)}</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-28 space-y-1 text-[11px] font-medium text-muted-foreground">Minimum trials<Input aria-label="Minimum trials" className="h-9" inputMode="numeric" type="number" min="1" value={minimumTrials} onChange={(event) => { setMinimumTrials(event.target.value); setPage(0); }} /></label>
        <label className="w-40 space-y-1 text-[11px] font-medium text-muted-foreground">Sort by<select aria-label="Sort measured results" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(0); }}><option value="mean">Average reward</option><option value="trials">Trial count</option></select></label>
        <span className="ml-auto pb-2 text-xs text-muted-foreground">{filtered.length.toLocaleString()} cohorts</span>
      </div>
      {loading && <p role="status" className="py-5 text-center text-sm text-muted-foreground">Loading encounter measurements…</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">No measured cohorts match these filters.</p>}
      {!loading && !error && visible.length > 0 && <div className="space-y-2">
        {visible.map((group) => <ResearchResult key={group.id} group={group} encounter={encounter} />)}
        <div className="flex items-center justify-between border-t pt-2"><span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span><div className="flex gap-1"><Button variant="outline" size="sm" aria-label="Previous results page" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" aria-label="Next results page" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </div>}
    </div>}
  </section>;
}

function ResearchResult({ group, encounter }: { group: ResearchBankGroup; encounter: number }) {
  return <details className="rounded-md border px-3">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
      <span className="font-semibold text-foreground">{group.stats.map((value, index) => `${STAT_NAMES[index]} ${value}`).join(" · ")}</span>
      <span>Avg {group.mean.toFixed(2)} · n={group.n}</span><Badge variant="secondary">{group.n < 30 ? "Exploratory · small sample" : group.n < 200 ? "Exploratory · n&lt;200" : "Measured cohort"}</Badge><span className="ml-auto text-muted-foreground">Details</span>
    </summary>
    <div className="space-y-2 border-t py-3 text-xs text-muted-foreground">
      <p>Reward: average {group.mean.toFixed(2)} · highest {group.highest} · median {group.median.toFixed(2)} · low (≤1) {group.low}/{group.n} · defeats {group.defeats}/{group.n}</p>
      <p>Mean MP: DPS {group.meanDpsMp == null ? "unknown" : group.meanDpsMp.toFixed(0)} · healer {group.meanHealerMp == null ? "unknown" : group.meanHealerMp.toFixed(0)}</p>
      <p>Sample identity: profile {group.profileId ?? "unknown"} · cohort {group.cohortId ?? "unknown"} · formation {group.formationId ?? "unknown"} · finish {group.finishPolicy ?? "unknown"}</p>
      <p>Reward measurement: {group.rewardMeasurementMethod ?? "unknown"} · provenance {group.provenanceHash.slice(0, 12)}</p>
      <Link href={`/combat/multi-box/match-stats?research=${encodeURIComponent(group.id)}&encounter=${encounter}`} className="inline-flex min-h-9 items-center font-medium text-primary hover:underline">Match these stats</Link>
    </div>
  </details>;
}
