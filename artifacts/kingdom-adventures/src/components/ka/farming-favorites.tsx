import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Star, Swords, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { useLocalFeature } from "@/hooks/sync/use-local-feature";
import { favoriteToLoadout, removeFarmingFavorite, useFarmingFavorites, type FarmingFavorite } from "@/lib/farming-favorites";
import { writeLoadoutHandoff } from "@/lib/battle-legality";

export function FarmingFavorites() {
  const favorites = useFarmingFavorites();
  const [, navigate] = useLocation();
  const [, setLoadouts] = useLocalFeature<unknown>("ka_loadouts", []);
  const [destination, setDestination] = useState<"builder" | "simulator" | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!destination) return;
    navigate(destination === "simulator" ? "/combat/multi-box/simulator" : "/combat/character-builder");
    setDestination(null);
  }, [destination, navigate]);
  function open(favorite: FarmingFavorite, where: "builder" | "simulator") {
    try {
      const loadout = favoriteToLoadout(favorite);
      if (where === "simulator" && !writeLoadoutHandoff([loadout.id!])) throw new Error("Browser storage is unavailable. Open the build in the builder first.");
      setLoadouts((previous: unknown) => [...(Array.isArray(previous) ? previous.filter((row) => row?.id !== loadout.id) : []), loadout]);
      setError(""); setDestination(where);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this favorite."); }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Favorite builds</h2><p className="mt-1 text-sm text-muted-foreground">Saved on this device. Open a build without searching again.</p></div><Badge variant="secondary">{favorites.length} saved</Badge></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {favorites.length === 0 ? <Card><CardContent className="flex flex-col items-center px-5 py-12 text-center"><Star className="mb-4 h-8 w-8 text-muted-foreground/40" /><h3 className="font-medium">Keep your useful builds here</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Use the star on a build result to save its character, equipment levels, skills, and search settings.</p><Button asChild className="mt-5 min-h-11 gap-2"><Link href="/combat/multi-box/match-stats">Find a build<ArrowRight className="h-4 w-4" /></Link></Button></CardContent></Card> : favorites.map((favorite) => <Card key={favorite.id}><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/25"><CharacterPreviewCanvas jobName={favorite.build.jobName ?? favorite.profile.characters[0]?.jobName} rank={favorite.build.rank ?? favorite.profile.characters[0]?.rank} variant={1} equipState="right" scale={3} poseFrame={0} weaponName={favorite.build.picks.find((pick) => pick.slot === "Weapon")?.item} shieldName={favorite.build.picks.find((pick) => pick.slot === "Shield")?.item} label={favorite.name} className="max-h-full max-w-full object-contain" /></div><div className="min-w-0"><h3 className="break-words font-semibold">{favorite.name}</h3><p className="mt-1 text-xs text-muted-foreground">{favorite.build.jobName ?? favorite.profile.characters[0]?.jobName} · Rank {favorite.build.rank ?? favorite.profile.characters[0]?.rank}</p><p className="mt-1 text-xs text-muted-foreground">Saved {new Date(favorite.savedAt).toLocaleDateString()}</p></div></div><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${favorite.name} from Favorites`} onClick={() => setRemoveId(favorite.id)}><Trash2 className="h-4 w-4" /></Button></div>
      <div className="flex flex-wrap gap-2">{Object.entries(favorite.build.stats).filter(([key]) => ["atk", "spd", "lck", "hp", "mp", "def"].includes(key)).map(([key, value]) => <span key={key} className="rounded-md bg-muted/40 px-2.5 py-1 text-xs tabular-nums"><span className="text-muted-foreground">{key.toUpperCase()}</span> <strong>{value.toLocaleString()}</strong></span>)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{favorite.build.picks.map((pick) => <div key={`${pick.slot}:${pick.item}`} className="rounded-lg border px-3 py-2 text-sm"><span className="block text-[10px] text-muted-foreground">{pick.slot}</span><span className="font-medium">{pick.item}</span><span className="ml-2 text-xs text-muted-foreground">Lv{pick.level}</span></div>)}</div>
      {!!favorite.build.skills?.length && <p className="text-xs leading-5 text-muted-foreground">Required skills: {favorite.build.skills.join(" · ")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge variant="outline">Saved build</Badge>{favorite.build.addedLevels > 0 && <Badge variant="secondary">Gear upgrades required</Badge>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => open(favorite, "builder")}>Open in builder</Button><Button className="min-h-11 gap-2" onClick={() => open(favorite, "simulator")}><Swords className="h-4 w-4" />Simulate</Button></div></div>
      <details className="text-xs text-muted-foreground"><summary className="min-h-9 cursor-pointer py-2">Saved search settings</summary><p className="py-2 leading-6">{favorite.search.allowEquipmentLevelUp ? "Equipment upgrades allowed" : "Current equipment levels"}{Object.keys(favorite.search.goals).length ? ` · Targets: ${Object.keys(favorite.search.goals).map((key) => key.toUpperCase()).join(", ")}` : ""}</p></details>
    </CardContent></Card>)}
    <Dialog open={removeId !== null} onOpenChange={(value) => { if (!value) setRemoveId(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Remove this favorite?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Characters already copied to the builder or simulator are kept.</p><div className="flex justify-end gap-2"><Button variant="outline" className="min-h-11" onClick={() => setRemoveId(null)}>Cancel</Button><Button variant="destructive" className="min-h-11" onClick={() => { try { if (removeId) removeFarmingFavorite(removeId); setRemoveId(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this favorite."); } }}>Remove</Button></div></DialogContent></Dialog>
  </div>;
}
