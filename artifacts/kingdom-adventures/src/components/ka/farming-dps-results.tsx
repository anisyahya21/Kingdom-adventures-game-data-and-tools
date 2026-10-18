import { useEffect, useMemo, useState } from "react";
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
import type { ProfileGoalBuild } from "@/lib/profile-loadout-goal-planner";
import type { PlayerProfile } from "@/lib/player-profile";

export function FarmingDpsResults({ profile, matches, options, busy, status, error, onCancel, onCreate, equipmentIcons, allowUpgrades, exactOnly }: {
  profile: PlayerProfile | null; matches: ProfileStrategyMatch[] | null; options: ChestStrategyOption[];
  busy: boolean; status: string; error: string; equipmentIcons?: Record<string, string>; allowUpgrades: boolean; exactOnly: boolean;
  onCancel: () => void; onCreate: (build: ProfileGoalBuild, profile: PlayerProfile, destination?: "builder" | "simulator") => void;
}) {
  const favorites = useFarmingFavorites();
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<string[] | null>(null);
  const [page, setPage] = useState(0);
  const [createdPage, setCreatedPage] = useState(0);
  useEffect(() => setPage(0), [matches]);
  useEffect(() => setCreatedPage(0), [matches, created]);
  const rows = useMemo(() => {
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
        return [{ match: variant, build, option, fingerprint, measured, deviation: strategyMatchDeviation(variant, option) }];
      });
    }).sort((a, b) => compareFarmingDpsRank({ id: a.match.id, measuredMean: a.measured?.mean ?? null, deviation: a.deviation }, { id: b.match.id, measuredMean: b.measured?.mean ?? null, deviation: b.deviation }));
  }, [matches, options, profile, exactOnly]);
  const firstRows = useMemo(() => {
    const first = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!first.has(row.match.id)) first.set(row.match.id, row);
    return first;
  }, [rows]);
  const matchesById = new Map((matches ?? []).map((match) => [match.id, match]));
  const availableMatches = [...firstRows.keys()].flatMap((id) => matchesById.has(id) ? [matchesById.get(id)!] : []);
  const pageCount = Math.max(1, Math.ceil(availableMatches.length / 25));
  const pageMatches = availableMatches.slice(page * 25, (page + 1) * 25);
  const createdRows = rows.filter((row) => created?.includes(row.match.id));
  const createdPageCount = Math.max(1, Math.ceil(createdRows.length / 5));
  const visibleCreatedPage = Math.min(createdPage, createdPageCount - 1);
  const pageCreatedRows = createdRows.slice(visibleCreatedPage * 5, (visibleCreatedPage + 1) * 5);
  useEffect(() => {
    if (createdPage !== visibleCreatedPage) setCreatedPage(visibleCreatedPage);
  }, [createdPage, visibleCreatedPage]);
  const renderCreatedPagination = () => <div className="flex items-center justify-between gap-3 border-t pt-3">
    <span className="text-xs text-muted-foreground">Showing {visibleCreatedPage * 5 + 1}–{Math.min((visibleCreatedPage + 1) * 5, createdRows.length)} of {createdRows.length} equipment builds · page {visibleCreatedPage + 1} of {createdPageCount}</span>
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={visibleCreatedPage === 0} onClick={() => setCreatedPage((value) => Math.max(0, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={visibleCreatedPage + 1 >= createdPageCount} onClick={() => setCreatedPage((value) => Math.min(createdPageCount - 1, value + 1))}>Next</Button></div>
  </div>;
  return <section aria-label="Recommended DPS builds" className="space-y-3" data-dps-results>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Achievable strategies</h2>{busy && <Button variant="outline" onClick={onCancel}>Cancel search</Button>}</div>
    <p role="status" className="text-xs text-muted-foreground">{status || "Preparing your profile…"}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!busy && !error && matches !== null && rows.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No {exactOnly ? "exact " : ""}build found for this setup. Try allowing gear upgrades or removing exclusions. An unfinished search does not prove a build is impossible.</p>}
    {rows.length > 0 && <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-xs text-muted-foreground">Exact-stat averages use the fixed research team. Your account team’s survival, skills, and MP changes remain untested. Other builds rank by four-stat closeness; their rewards are unmeasured.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm tabular-nums"><thead><tr className="border-b text-xs text-muted-foreground"><th scope="col" className="p-2">Pick</th><th scope="col" className="p-2">Tested target</th><th scope="col" className="p-2">Your build</th>{["Exact-stat evidence", "Target avg", "Target best", "Target n", "Target seeds"].map((label) => <th key={label} className="whitespace-nowrap p-2 text-right" scope="col">{label}</th>)}</tr></thead><tbody>{pageMatches.map((match) => {
        const found = firstRows.get(match.id)!;
        const build = found.build;
        const option = found.option;
        const exact = strategyMatchDeviation({ ...match, build }, option) === 0;
        const measured = measuredStrategyBuild(option.encounter, build.stats);
        return <tr key={match.id} className="border-b border-border/40 last:border-0">
          <td className="p-2"><input aria-label={`Select strategy ${match.id}`} type="checkbox" className="h-4 w-4 accent-primary" checked={selected.includes(match.id)} onChange={(event) => { setSelected((old) => event.target.checked ? [...old, match.id] : old.filter((id) => id !== match.id)); }} /></td>
          <td className="p-2"><div className="whitespace-nowrap text-xs">ATK {option.atk} · SPD {option.spd} · LCK {option.lck} · DEX {option.dex}</div><div className="mt-1 text-[11px] text-muted-foreground">Fixed research team · target evidence</div></td>
          <td className="p-2 text-xs"><div className="whitespace-nowrap font-medium">{build.jobName ?? profile?.characters.find((row) => row.id === build.characterId)?.jobName} · {build.rank ?? profile?.characters.find((row) => row.id === build.characterId)?.rank}</div><div className="mt-1 whitespace-nowrap text-[11px]">ATK {build.stats.atk} · SPD {build.stats.spd} · LCK {build.stats.lck} · DEX {build.stats.dex}</div><div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">HP {build.stats.hp} · MP {build.stats.mp} · DEF {build.stats.def}</div><div className="mt-1 text-[11px] text-muted-foreground">{measured ? "Exact stats measured with fixed research team" : `${exact ? "Exact target stats" : "Unmeasured · four-stat distance prioritized"}`}{!match.complete && " · closest found so far"}</div></td>
          <td className="whitespace-nowrap p-2 text-right text-xs">{measured ? <><span className="font-medium">{measured.mean.toFixed(2)} avg</span><span className="mt-1 block text-[10px] text-muted-foreground">best {measured.highest} · n {measured.n}</span></> : <span className="text-muted-foreground">Unmeasured</span>}</td><td className="p-2 text-right font-medium">{option.mean.toFixed(2)}{option.n < 200 && <span className="mt-1 block whitespace-nowrap text-[10px] font-normal text-muted-foreground">Exploratory sample</span>}</td><td className="p-2 text-right">{option.highest}</td><td className="p-2 text-right">{option.n.toLocaleString()}</td><td className="whitespace-nowrap p-2 text-right text-xs">{option.seedRange?.length === 2 ? `${option.seedRange[0]}–${option.seedRange[1]}` : "Not recorded"}</td>
        </tr>;
      })}</tbody></table></div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3"><span className="text-xs text-muted-foreground">{availableMatches.length.toLocaleString()} strategies · page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button></div></div>
      <Button className="mt-4 min-h-11" disabled={busy || selected.length === 0} onClick={() => setCreated([...selected])}>Create character builds{selected.length > 0 ? ` (${selected.length})` : ""}</Button>
    </div>}
    {created && <h2 className="pt-2 text-lg font-semibold">Character builds · equipment and survivability</h2>}
    {createdRows.length > 5 && <div className="rounded-xl border bg-card p-4">{renderCreatedPagination()}</div>}
    {pageCreatedRows.map(({ match, build, option, fingerprint }) => {
      const character = profile!.characters.find((character) => character.id === build.characterId);
      const evidence = measuredStrategyBuild(option.encounter, build.stats);
      const saved = favorites.some((favorite) => favorite.fingerprint === fingerprint);
      return <Card key={`${option.id}:${fingerprint}`}><CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3"><CharacterPreviewCanvas jobName={build.jobName ?? character?.jobName ?? "Guard"} rank={build.rank ?? character?.rank} variant={character?.gender === 1 ? 2 : 1} equipState="right" scale={2} poseFrame={0} weaponName={build.picks.find((pick) => pick.slot === "Weapon")?.item} shieldName={build.picks.find((pick) => pick.slot === "Shield")?.item} label={build.characterName} className="h-16 w-16 object-contain" /><div><h3 className="font-semibold">{build.jobName ?? character?.jobName} · Rank {build.rank ?? character?.rank}</h3><p className="text-xs text-muted-foreground">{match.complete ? "Search complete" : "Closest found so far"} · {strategyMatchDeviation(match, option) === 0 ? "Exact target stats" : "Alternative stats"}</p></div></div>
        <div className="flex flex-wrap gap-3 text-sm tabular-nums">{["atk", "spd", "lck", "dex", "hp", "mp", "def"].map((stat) => <span key={stat}><span className="text-xs text-muted-foreground">{stat.toUpperCase()}</span> {build.stats[stat]?.toLocaleString()}</span>)}</div>
        <div><h4 className="mb-2 text-xs font-medium">Recommended equipment</h4><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{build.picks.map((pick) => {
          const icon = getEquipmentIcon(equipmentIcons, pick.item);
          const upgrade = build.requiredUpgrades.find((row) => row.item === pick.item);
          return <div key={pick.slot} className="flex items-center gap-3 rounded-lg border p-3">{icon ? <EquipmentSprite src={icon} alt="" className="h-10 w-10 shrink-0 object-contain" /> : <Package className="h-10 w-10 shrink-0 text-muted-foreground" />}<div className="min-w-0 text-sm"><p className="text-[10px] text-muted-foreground">{pick.slot}</p><p className="font-medium">{pick.item}</p><p className={`text-xs ${upgrade ? "text-primary" : "text-muted-foreground"}`}>{upgrade ? `Lv${upgrade.currentLevel} → ${pick.level}` : `Lv${pick.level}`}</p></div></div>;
        })}{build.picks.length === 0 && <p className="text-sm text-muted-foreground">No equipment needed for these stats.</p>}</div></div>
        {!!build.skills?.length && <p className="text-xs text-muted-foreground">Required skills: {build.skills.join(" · ")} · check ownership in game.</p>}
        <p className="text-xs text-muted-foreground">{evidence ? `These exact stats averaged ${evidence.mean.toFixed(2)} chests with the fixed research team (${evidence.n} runs).` : "Rewards for these stats have not been measured."} Test your own team in the simulator.</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => onCreate(build, profile!, "simulator")}>Simulate</Button><Button variant="outline" onClick={() => onCreate(build, profile!, "builder")}>Save character</Button><Button variant="outline" disabled={saved} onClick={() => { try { saveFarmingFavorite(build, profile!, chestStrategyGoals(option, { atk: 0, spd: 0, lck: 0 }), allowUpgrades); setNotice("Saved to Favorites."); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not save favorite."); } }}><Star className={`mr-2 h-4 w-4 ${saved ? "fill-current" : ""}`} />{saved ? "Saved" : "Favorite"}</Button></div>
      </CardContent></Card>;
    })}
    {createdRows.length > 5 && <div className="rounded-xl border bg-card p-4">{renderCreatedPagination()}</div>}
  </section>;
}
