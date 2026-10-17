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
  const seen = new Set<string>();
  const rows = (matches ?? []).flatMap((match) => {
    const option = options.find((option) => option.id === match.id);
    if (!option || !match.build || !profile) return [];
    const fingerprint = favoriteFingerprint(match.build, profile);
    if (seen.has(fingerprint) || exactOnly && strategyMatchDeviation(match, option) !== 0) return [];
    seen.add(fingerprint);
    return [{ match, build: match.build, option, fingerprint }];
  });
  return <section aria-label="Recommended DPS builds" className="space-y-3" data-dps-results>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recommended DPS builds</h2>{busy && <Button variant="outline" onClick={onCancel}>Cancel search</Button>}</div>
    <p role="status" className="text-xs text-muted-foreground">{status || "Preparing your profile…"}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!busy && !error && matches !== null && rows.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No {exactOnly ? "exact " : ""}build found for this setup. Try allowing gear upgrades or removing exclusions. An unfinished search does not prove a build is impossible.</p>}
    {rows.map(({ match, build, option, fingerprint }) => {
      const character = profile!.characters.find((character) => character.id === build.characterId);
      const evidence = measuredStrategyBuild(option.encounter, build.stats);
      const saved = favorites.some((favorite) => favorite.fingerprint === fingerprint);
      return <Card key={fingerprint}><CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3"><CharacterPreviewCanvas jobName={build.jobName ?? character?.jobName ?? "Guard"} rank={build.rank ?? character?.rank} variant={character?.gender === 1 ? 2 : 1} equipState="right" scale={2} poseFrame={0} weaponName={build.picks.find((pick) => pick.slot === "Weapon")?.item} shieldName={build.picks.find((pick) => pick.slot === "Shield")?.item} label={build.characterName} className="h-16 w-16 object-contain" /><div><h3 className="font-semibold">{build.jobName ?? character?.jobName} · Rank {build.rank ?? character?.rank}</h3><p className="text-xs text-muted-foreground">{match.complete ? "Search complete" : "Closest found so far"} · {strategyMatchDeviation(match, option) === 0 ? "Exact target stats" : "Alternative stats"}</p></div></div>
        <div className="flex flex-wrap gap-3 text-sm tabular-nums">{["atk", "spd", "lck", "dex"].map((stat) => <span key={stat}><span className="text-xs text-muted-foreground">{stat.toUpperCase()}</span> {build.stats[stat]?.toLocaleString()}</span>)}</div>
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
