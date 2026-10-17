import { useState } from "react";
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
  const seen = new Set<string>();
  const rows = (matches ?? []).flatMap((match) => {
    const option = options.find((option) => option.id === match.id);
    if (!option || !match.build || !profile) return [];
    return (match.builds ?? [match.build]).flatMap((build) => {
      const variant = { ...match, build };
      const fingerprint = favoriteFingerprint(build, profile);
      if (seen.has(fingerprint) || exactOnly && strategyMatchDeviation(variant, option) !== 0) return [];
      seen.add(fingerprint);
      return [{ match: variant, build, option, fingerprint }];
    });
  });
  return <section aria-label="Recommended DPS builds" className="space-y-3" data-dps-results>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Achievable strategies</h2>{busy && <Button variant="outline" onClick={onCancel}>Cancel search</Button>}</div>
    <p role="status" className="text-xs text-muted-foreground">{status || "Preparing your profile…"}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!busy && !error && matches !== null && rows.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No {exactOnly ? "exact " : ""}build found for this setup. Try allowing gear upgrades or removing exclusions. An unfinished search does not prove a build is impossible.</p>}
    {rows.length > 0 && <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-xs text-muted-foreground">Choose one or more strategies, then create the character builds. Each listed strategy has a legal build from your profile. Results shown are for the fixed research team.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm tabular-nums"><thead><tr className="border-b text-xs text-muted-foreground"><th scope="col" className="p-2">Pick</th><th scope="col" className="p-2">Achievable stats</th><th scope="col" className="p-2">Your character</th>{["Avg chests", "Best run", "Trials", "Seed range"].map((label) => <th key={label} scope="col" className="whitespace-nowrap p-2 text-right">{label}</th>)}</tr></thead><tbody>{(matches ?? []).filter((match) => rows.some((row) => row.match.id === match.id)).map((match) => {
        const found = rows.find((row) => row.match.id === match.id)!;
        const build = found.build;
        const evidence = measuredStrategyBuild(found.option.encounter, build.stats);
        return <tr key={match.id} className="border-b border-border/40 last:border-0"><td className="p-2"><input aria-label={`Select strategy ${match.id}`} type="checkbox" className="h-4 w-4 accent-primary" checked={selected.includes(match.id)} onChange={(event) => { setSelected((old) => event.target.checked ? [...old, match.id] : old.filter((id) => id !== match.id)); }} /></td><td className="p-2"><div className="whitespace-nowrap text-xs">ATK {build.stats.atk} · SPD {build.stats.spd} · LCK {build.stats.lck} · DEX {build.stats.dex}</div><div className="mt-1 text-[11px] text-muted-foreground">{evidence ? "Measured stats" : "Alternative stats · performance unmeasured"}{!match.complete && " · closest found so far"}</div></td><td className="p-2 text-xs"><div className="whitespace-nowrap">{build.jobName ?? profile?.characters.find((row) => row.id === build.characterId)?.jobName} · {build.rank ?? profile?.characters.find((row) => row.id === build.characterId)?.rank}</div><div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">HP {build.stats.hp} · MP {build.stats.mp} · DEF {build.stats.def}</div></td><td className="p-2 text-right">{evidence ? evidence.mean.toFixed(2) : "—"}</td><td className="p-2 text-right">{evidence?.highest ?? "—"}</td><td className="p-2 text-right">{evidence?.n.toLocaleString() ?? "—"}</td><td className="whitespace-nowrap p-2 text-right text-xs">{evidence?.seedRange?.length === 2 ? `${evidence.seedRange[0]}–${evidence.seedRange[1]}` : "—"}</td></tr>;
      })}</tbody></table></div>
      <Button className="mt-4 min-h-11" disabled={busy || selected.length === 0} onClick={() => setCreated([...selected])}>Create character builds{selected.length > 0 ? ` (${selected.length})` : ""}</Button>
    </div>}
    {created && <h2 className="pt-2 text-lg font-semibold">Character builds · equipment and survivability</h2>}
    {rows.filter((row) => created?.includes(row.match.id)).map(({ match, build, option, fingerprint }) => {
      const character = profile!.characters.find((character) => character.id === build.characterId);
      const evidence = measuredStrategyBuild(option.encounter, build.stats);
      const saved = favorites.some((favorite) => favorite.fingerprint === fingerprint);
      return <Card key={fingerprint}><CardContent className="space-y-4 p-4 sm:p-5">
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
  </section>;
}
