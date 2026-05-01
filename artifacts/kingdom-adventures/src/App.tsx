import { lazy, memo, Suspense, useEffect } from "react";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/app/app-shell";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, encodeCanonicalPath, getSeoMeta } from "@/app/seo";
const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home"));
const MarriageMatcher = lazy(() => import("@/pages/marriage-matcher"));
const EquipmentPage = lazy(() => import("@/pages/equipment"));
const EquipmentExchangePage = lazy(() => import("@/pages/equipment-exchange"));
const EquipmentLevelingOptimizerPage = lazy(() => import("@/pages/equipment-leveling-optimizer"));
const EquipmentStatsExchangePage = lazy(() => import("@/pages/equipment-stats-exchange"));
const MonstersPage = lazy(() => import("@/pages/monsters"));
const JobsPage = lazy(() => import("@/pages/jobs"));
const SkillsPage = lazy(() => import("@/pages/skills"));
const LoadoutPage = lazy(() => import("@/pages/loadout"));
const EggsPage = lazy(() => import("@/pages/eggs"));
const EggsPetsMonstersPage = lazy(() => import("@/pages/eggs-pets-monsters"));
const ShopsPage = lazy(() => import("@/pages/shops"));
const SyncDevicesPage = lazy(() => import("@/pages/sync-devices"));
const WorldMapPage = lazy(() => import("@/pages/world-map"));
const Map2TestingPage = lazy(() => import("@/pages/map-2-testing"));
const HousesPage = lazy(() => import("@/pages/houses"));
const TownRankPage = lazy(() => import("@/pages/town-rank"));
const GachaEventsPage = lazy(() => import("@/pages/gacha-events"));
const TimedEventsPage = lazy(() => import("@/pages/timed-events"));
const MonstersPetsPage = lazy(() => import("@/pages/monsters-pets"));
const WeeklyConquestPage = lazy(() => import("@/pages/weekly-conquest"));
const WarioDungeonPage = lazy(() => import("@/pages/wario-dungeon"));
const MonsterPetStatsPage = lazy(() => import("@/pages/monster-pet-stats"));
const DailyRankRewardsPage = lazy(() => import("@/pages/daily-rank-rewards"));
const JobCenterPage = lazy(() => import("@/pages/job-center"));
const KairoRoomPage = lazy(() => import("@/pages/kairo-room"));
const PlaythroughGuidePage = lazy(() => import("@/pages/playthrough-guide"));
const GuidesPage = lazy(() => import("@/pages/guides"));
const AddGuidePage = lazy(() => import("@/pages/add-guide"));
const CommunityGuidePage = lazy(() => import("@/pages/community-guide"));
const UpdatesPage = lazy(() => import("@/pages/updates"));
const SurveyPlanner = lazy(() => import("@/pages/survey-planner"));
const TestPage = lazy(() => import("./pages/Test"));

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Loading page...
    </div>
  );
}

function upsertMeta(selector: string, create: () => HTMLMetaElement | HTMLLinkElement | HTMLScriptElement, value: string) {
  const existing = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | HTMLScriptElement | null;
  const element = existing ?? create();

  if (!existing) {
    document.head.appendChild(element);
  }

  if (element instanceof HTMLMetaElement) {
    element.content = value;
  } else if (element instanceof HTMLLinkElement) {
    element.href = value;
  } else {
    element.textContent = value;
  }
}

function SeoManager() {
  const [pathname] = useLocation();

  useEffect(() => {
    const meta = getSeoMeta(pathname);
    const canonicalUrl = `${SITE_URL}${encodeCanonicalPath(meta.canonicalPath)}`;
    const imageUrl = `${SITE_URL}/opengraph.jpg`;
    const title = meta.title.includes(SITE_NAME) ? meta.title : `${meta.title} | ${SITE_NAME}`;

    document.title = title;

    upsertMeta('meta[name="description"]', () => {
      const element = document.createElement("meta");
      element.name = "description";
      return element;
    }, meta.description);
    upsertMeta('link[rel="canonical"]', () => {
      const element = document.createElement("link");
      element.rel = "canonical";
      return element;
    }, canonicalUrl);
    upsertMeta('meta[property="og:title"]', () => {
      const element = document.createElement("meta");
      element.setAttribute("property", "og:title");
      return element;
    }, title);
    upsertMeta('meta[property="og:description"]', () => {
      const element = document.createElement("meta");
      element.setAttribute("property", "og:description");
      return element;
    }, meta.description);
    upsertMeta('meta[property="og:url"]', () => {
      const element = document.createElement("meta");
      element.setAttribute("property", "og:url");
      return element;
    }, canonicalUrl);
    upsertMeta('meta[property="og:image"]', () => {
      const element = document.createElement("meta");
      element.setAttribute("property", "og:image");
      return element;
    }, imageUrl);
    upsertMeta('meta[name="twitter:title"]', () => {
      const element = document.createElement("meta");
      element.name = "twitter:title";
      return element;
    }, title);
    upsertMeta('meta[name="twitter:description"]', () => {
      const element = document.createElement("meta");
      element.name = "twitter:description";
      return element;
    }, meta.description);
    upsertMeta('meta[name="twitter:image"]', () => {
      const element = document.createElement("meta");
      element.name = "twitter:image";
      return element;
    }, imageUrl);
    upsertMeta('script[type="application/ld+json"][data-seo="website"]', () => {
      const element = document.createElement("script");
      element.type = "application/ld+json";
      element.dataset.seo = "website";
      return element;
    }, JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
    }));
  }, [pathname]);

  return null;
}

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/">{() => <Home />}</Route>
        <Route path="/match-finder">{() => <MarriageMatcher />}</Route>
        <Route path="/equipment">{() => <EquipmentStatsExchangePage />}</Route>
        <Route path="/equipment-stats">{() => <EquipmentPage />}</Route>
        <Route path="/equipment-exchange">{() => <EquipmentExchangePage />}</Route>
        <Route path="/equipment-leveling-optimizer">{() => <EquipmentLevelingOptimizerPage />}</Route>
        <Route path="/monsters">{() => <MonstersPage />}</Route>
        <Route path="/weekly-conquest">{() => <WeeklyConquestPage />}</Route>
        <Route path="/jobs">{() => <JobsPage />}</Route>
        <Route path="/jobs/:name">{() => <JobsPage />}</Route>
        <Route path="/skills">{() => <SkillsPage />}</Route>
        <Route path="/loadout">{() => <LoadoutPage />}</Route>
        <Route path="/eggs-pets-monsters">{() => <EggsPetsMonstersPage />}</Route>
        <Route path="/eggs">{() => <EggsPage />}</Route>
        <Route path="/monsters-pets">{() => <MonstersPetsPage />}</Route>
        <Route path="/monster-spawns">{() => <MonstersPage />}</Route>
        <Route path="/monster-pet-stats">{() => <MonsterPetStatsPage />}</Route>
        <Route path="/shops">{() => <ShopsPage />}</Route>
        <Route path="/shops/:slug">{() => <ShopsPage />}</Route>
        <Route path="/sync-devices">{() => <SyncDevicesPage />}</Route>
        <Route path="/world-map">{() => <WorldMapPage />}</Route>
        <Route path="/map-2-testing">{() => <Map2TestingPage />}</Route>
        <Route path="/houses">{() => <HousesPage />}</Route>
        <Route path="/survey">{() => <SurveyPlanner />}</Route>
        <Route path="/survey-planner">{() => <SurveyPlanner />}</Route>
        <Route path="/timed-events">{() => <TimedEventsPage />}</Route>
        <Route path="/wario-dungeon">{() => <WarioDungeonPage />}</Route>
        <Route path="/daily-rank-rewards">{() => <DailyRankRewardsPage />}</Route>
        <Route path="/job-center">{() => <JobCenterPage />}</Route>
        <Route path="/kairo-room">{() => <KairoRoomPage />}</Route>
        <Route path="/gacha-events">{() => <GachaEventsPage />}</Route>
        <Route path="/town-rank">{() => <TownRankPage />}</Route>
        <Route path="/guides/:slug">{() => <CommunityGuidePage />}</Route>
        <Route path="/guides">{() => <GuidesPage />}</Route>
        <Route path="/updates">{() => <UpdatesPage />}</Route>
        <Route path="/add-guide">{() => <AddGuidePage />}</Route>
        <Route path="/playthrough-guide">{() => <PlaythroughGuidePage />}</Route>
        <Route path="/test">{() => <TestPage />}</Route>
        <Route>{() => <NotFound />}</Route>
      </Switch>
    </Suspense>
  );
}

function ScrollToTopOnRouteChange() {
  const [pathname] = useLocation();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const targetId = decodeURIComponent(hash.replace(/^#/, ""));
      let attempts = 0;
      const maxAttempts = 30;
      const tryScrollToHash = () => {
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
          if (typeof (target as HTMLElement).focus === "function") {
            (target as HTMLElement).focus({ preventScroll: true });
          }
          target.classList.remove("hash-focus-flash");
          // Force reflow so repeated visits retrigger the animation.
          void target.getBoundingClientRect();
          target.classList.add("hash-focus-flash");
          return true;
        }
        return false;
      };

      requestAnimationFrame(() => {
        if (tryScrollToHash()) return;
        const timer = window.setInterval(() => {
          attempts += 1;
          if (tryScrollToHash() || attempts >= maxAttempts) {
            window.clearInterval(timer);
          }
        }, 100);
      });

      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

const App = memo(function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <SeoManager />
        <ScrollToTopOnRouteChange />
        <AppShell>
          <Router />
        </AppShell>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
});

export default App;
