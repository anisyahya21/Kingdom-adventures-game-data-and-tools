import { lazy, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Boxes, Play, Search, SlidersHorizontal, Star } from "lucide-react";
import { PageHeader } from "@/components/ka/page-header";
import { Badge } from "@/components/ui/badge";
import { FarmingFavorites } from "@/components/ka/farming-favorites";
import { useFarmingFavorites } from "@/lib/farming-favorites";
import { FarmingPlannerSetup } from "@/components/ka/farming-planner-setup";

const LoadoutPage = lazy(() => import("@/pages/loadout"));
const PlayerBattlePage = lazy(() => import("@/pages/player-battle"));
const modes = [
  { href: "/combat/multi-box", label: "Find DPS", icon: Search },
  { href: "/combat/multi-box/match-stats", label: "Match Stats", icon: SlidersHorizontal },
  { href: "/combat/multi-box/favorites", label: "Favorites", icon: Star },
  { href: "/combat/multi-box/simulator", label: "Simulator", icon: Play },
];

export default function MultiBoxFarmingPage() {
  const [location, navigate] = useLocation();
  const simulator = location.endsWith("/simulator");
  const matchStats = location.endsWith("/match-stats");
  const favoritesPage = location.endsWith("/favorites");
  const favorites = useFarmingFavorites();
  return <>
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:py-7">
      <Link href="/combat" className="inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Combat Hub</Link>
      <PageHeader icon={<Boxes className="h-5 w-5 text-primary" />} title={<span className="flex flex-wrap items-center gap-2">Multi-Box Farming{!simulator && !matchStats && !favoritesPage && <Badge variant="secondary" className="text-[10px] font-normal">Setup preview</Badge>}</span>} actions={<nav aria-label="Farming tools" className="grid max-w-full grid-cols-2 gap-1 rounded-xl border bg-muted/30 p-1 sm:inline-flex">{modes.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={location === href ? "page" : undefined} className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-medium sm:px-4 sm:text-sm ${location === href ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}{label === "Favorites" && favorites.length > 0 && <span className="text-xs">{favorites.length}</span>}</Link>)}</nav>}>
        <p>{simulator ? "Test your team against the selected encounter." : matchStats ? "Find legal builds for specific stat targets." : favoritesPage ? "Reopen your saved builds without searching again." : "Choose the encounter, then decide what the search can use and change."}</p>
      </PageHeader>
      {!simulator && !matchStats && !favoritesPage && <FarmingPlannerSetup onMatchStats={(encounterId) => navigate(`/combat/multi-box/match-stats${encounterId === undefined ? "" : `?encounter=${encounterId}`}`)} />}
      {favoritesPage && <FarmingFavorites />}
    </div>
    {(simulator || matchStats) && <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading {simulator ? "simulator" : "stat matcher"}…</div>}>
      {simulator ? <PlayerBattlePage embedded /> : <LoadoutPage view="finder" />}
    </Suspense>}
  </>;
}
