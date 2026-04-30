import { memo, useMemo, useState, useRef, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { Menu, Search, X, ArrowLeft, Moon, Sun } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import MarriageMatcher from "@/pages/marriage-matcher";
import EquipmentPage from "@/pages/equipment";
import EquipmentExchangePage from "@/pages/equipment-exchange";
import EquipmentLevelingOptimizerPage from "@/pages/equipment-leveling-optimizer";
import EquipmentStatsExchangePage from "@/pages/equipment-stats-exchange";
import MonstersPage from "@/pages/monsters";
import JobsPage from "@/pages/jobs";
import SkillsPage from "@/pages/skills";
import LoadoutPage from "@/pages/loadout";
import EggsPage from "@/pages/eggs";
import EggsPetsMonstersPage from "@/pages/eggs-pets-monsters";
import ShopsPage from "@/pages/shops";
import SyncDevicesPage from "@/pages/sync-devices";
import WorldMapPage from "@/pages/world-map";
import Map2TestingPage from "@/pages/map-2-testing";
import HousesPage from "@/pages/houses";
import TownRankPage from "@/pages/town-rank";
import GachaEventsPage from "@/pages/gacha-events";
import TimedEventsPage from "@/pages/timed-events";
import MonstersPetsPage from "@/pages/monsters-pets";
import WeeklyConquestPage from "@/pages/weekly-conquest";
import WarioDungeonPage from "@/pages/wario-dungeon";
import MonsterPetStatsPage from "@/pages/monster-pet-stats";
import DailyRankRewardsPage from "@/pages/daily-rank-rewards";
import JobCenterPage from "@/pages/job-center";
import KairoRoomPage from "@/pages/kairo-room";
import PlaythroughGuidePage from "@/pages/playthrough-guide";
import GuidesPage from "@/pages/guides";
import AddGuidePage from "@/pages/add-guide";
import CommunityGuidePage from "@/pages/community-guide";
import UpdatesPage from "@/pages/updates";
import SurveyPlanner from "@/pages/survey-planner";
import { localSharedData } from "@/lib/local-shared-data";
import { SHOP_RECORDS } from "@/lib/shop-utils";
import TestPage from "./pages/Test";

const queryClient = new QueryClient();
const SITE_URL = "https://kingdom-adventures-community-tools.vercel.app";
const SITE_NAME = "Kingdom Adventures Community Tools";
const DEFAULT_DESCRIPTION =
  "Kingdom Adventures tools, databases, guides, job stats, equipment exchange, shops, monsters, pets, events, maps, and calculators for planning stronger towns.";

type GlobalSearchEntry = { label: string; subtitle: string; href: string };
type NavLink = { href: string; label: string; beta?: boolean };
type NavSection = {
  title: string;
  primary?: NavLink;
  children?: NavLink[];
  note?: string;
};

const FURNITURE_SEARCH_ROWS = [
  "Candle","Kitchen Shelves","Desk","Red Carpet","Decorative Plant","Dining Table","Study Desk",
  "Rainwater Barrel","Chest of Drawers","Flower Vase","Shelf","Bookshelf","Training Room",
  "Rejuvenating Bath","Flowers","Tomato","Dresser","Couch","Bathtub","Stove","Pansy",
  "Shooting Range","Fluffy Carpet","Cooking Counter","Decorative Armor","Vanity Mirror","Window",
  "Magic Training Ground","Glittering Stone","Black Mat","Fireplace","Tree Nursery","Ancestor Statue",
  "Animal Figurine","Tool Workshop","Ore Workbench","Double Bed",
];

type SeoMeta = {
  title: string;
  description: string;
  canonicalPath: string;
};

const ROUTE_SEO: Record<string, Omit<SeoMeta, "canonicalPath">> = {
  "/": {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
  },
  "/jobs": {
    title: "Kingdom Adventures Job Database",
    description:
      "Compare Kingdom Adventures jobs by stats, battle type, skills, ranges, and weapon or shield access.",
  },
  "/match-finder": {
    title: "Kingdom Adventures Match Finder",
    description:
      "Find strong Kingdom Adventures marriage matches and plan children, awakenings, and job pairings.",
  },
  "/equipment": {
    title: "Kingdom Adventures Equipment Stats and Exchange",
    description:
      "Search Kingdom Adventures equipment stats, exchange values, shop data, and upgrade planning tools.",
  },
  "/equipment-stats": {
    title: "Kingdom Adventures Equipment Stats",
    description:
      "Look up Kingdom Adventures weapons, armor, accessories, stats, ranks, and equipment details.",
  },
  "/equipment-exchange": {
    title: "Kingdom Adventures Equipment Exchange",
    description:
      "Calculate Kingdom Adventures equipment exchange values and plan efficient item trades.",
  },
  "/equipment-leveling-optimizer": {
    title: "Kingdom Adventures Equipment Leveling Optimizer",
    description:
      "Optimize Kingdom Adventures equipment leveling plans with material and upgrade calculations.",
  },
  "/skills": {
    title: "Kingdom Adventures Skills Database",
    description:
      "Search Kingdom Adventures skills, effects, compatibility, and planning data for jobs and units.",
  },
  "/loadout": {
    title: "Kingdom Adventures Loadout Builder",
    description:
      "Build and compare Kingdom Adventures loadouts with equipment, skills, jobs, and stat planning.",
  },
  "/eggs-pets-monsters": {
    title: "Kingdom Adventures Eggs, Pets, and Monsters",
    description:
      "Plan Kingdom Adventures eggs, pets, and monsters with egg outcomes, feed items, spawn locations, detailed stats, growth data, and level-based comparisons.",
  },
  "/eggs": {
    title: "Kingdom Adventures Eggs and Pets",
    description:
      "Plan Kingdom Adventures eggs and pets with hatching, compatibility, and pet data.",
  },
  "/monsters": {
    title: "Kingdom Adventures Monster Spawns",
    description:
      "Search Kingdom Adventures monsters, spawn locations, levels, drops, and map data.",
  },
  "/monster-spawns": {
    title: "Kingdom Adventures Monster Spawns",
    description:
      "Search Kingdom Adventures monster spawn locations, levels, drops, and map data.",
  },
  "/monsters-pets": {
    title: "Kingdom Adventures Monsters and Pets",
    description:
      "Browse detailed Kingdom Adventures monster and pet data, including spawn locations, base stats, growth, levels, and stat comparisons.",
  },
  "/monster-pet-stats": {
    title: "Kingdom Adventures Monster Pet Stats",
    description:
      "Compare Kingdom Adventures monster and pet stats with base levels, growth values, and level-based stat tables for stronger team planning.",
  },
  "/shops": {
    title: "Kingdom Adventures Shop Database",
    description:
      "Search Kingdom Adventures shop unlocks, furniture, weapons, armor, accessories, items, restaurants, and skills.",
  },
  "/houses": {
    title: "Kingdom Adventures Houses and Facilities",
    description:
      "Plan Kingdom Adventures houses, facilities, furniture, and town building decisions.",
  },
  "/survey": {
    title: "Kingdom Adventures Survey Planner",
    description:
      "Plan Kingdom Adventures surveys, map exploration, rewards, and town progression.",
  },
  "/survey-planner": {
    title: "Kingdom Adventures Survey Planner",
    description:
      "Plan Kingdom Adventures surveys, map exploration, rewards, and town progression.",
  },
  "/timed-events": {
    title: "Kingdom Adventures Timed Events",
    description:
      "Track Kingdom Adventures timed events, weekly activities, gacha events, dungeons, and reward planning.",
  },
  "/weekly-conquest": {
    title: "Kingdom Adventures Weekly Conquest",
    description:
      "Plan Kingdom Adventures weekly conquest fights, rewards, timing, and event progress.",
  },
  "/wario-dungeon": {
    title: "Kingdom Adventures Wairo Dungeon",
    description:
      "Use Kingdom Adventures Wairo Dungeon data for event planning, rewards, and progression.",
  },
  "/daily-rank-rewards": {
    title: "Kingdom Adventures Daily Rank Rewards",
    description:
      "Check Kingdom Adventures daily rank rewards and plan collection timing.",
  },
  "/job-center": {
    title: "Kingdom Adventures Job Center",
    description:
      "Review Kingdom Adventures Job Center data, unlocks, and job planning details.",
  },
  "/kairo-room": {
    title: "Kingdom Adventures Kairo Room",
    description:
      "Find Kingdom Adventures Kairo Room data, rewards, and planning details.",
  },
  "/gacha-events": {
    title: "Kingdom Adventures Gacha Events",
    description:
      "Track Kingdom Adventures gacha events, banners, timing, and reward planning.",
  },
  "/town-rank": {
    title: "Kingdom Adventures Town Rank",
    description:
      "Plan Kingdom Adventures town rank progression, unlocks, requirements, and rewards.",
  },
  "/world-map": {
    title: "Kingdom Adventures World Map",
    description:
      "Use the Kingdom Adventures world map to plan exploration, monsters, rewards, and resources.",
  },
  "/map-2-testing": {
    title: "Kingdom Adventures Map 2 Testing",
    description:
      "Review Kingdom Adventures map testing data for exploration and progression planning.",
  },
  "/guides": {
    title: "Kingdom Adventures Guides",
    description:
      "Read Kingdom Adventures guides, community notes, playthrough help, and strategy resources.",
  },
  "/playthrough-guide": {
    title: "Kingdom Adventures Playthrough Guide",
    description:
      "Follow a Kingdom Adventures playthrough guide with progression advice, planning tips, and strategy notes.",
  },
  "/updates": {
    title: "Kingdom Adventures Tool Updates",
    description:
      "See recent updates to the Kingdom Adventures community tools, databases, and calculators.",
  },
  "/sync-devices": {
    title: "Kingdom Adventures Sync Devices",
    description:
      "Sync Kingdom Adventures tool settings and planning data across your devices.",
  },
};

function getSeoMeta(pathname: string): SeoMeta {
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (cleanPath.startsWith("/jobs/")) {
    const jobName = decodeURIComponent(cleanPath.replace("/jobs/", ""));
    return {
      title: `${jobName} Job Stats - Kingdom Adventures`,
      description: `View ${jobName} job stats, rank scaling, skills, ranges, battle type, and equipment access in Kingdom Adventures.`,
      canonicalPath: cleanPath,
    };
  }

  if (cleanPath.startsWith("/shops/")) {
    const slug = cleanPath.replace("/shops/", "");
    const shop = SHOP_RECORDS.find((record) => record.slug === slug);
    const shopName = shop?.title ?? slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");

    return {
      title: `${shopName} - Kingdom Adventures Shop Database`,
      description: `Search ${shopName} items, unlocks, costs, and shop data for Kingdom Adventures.`,
      canonicalPath: cleanPath,
    };
  }

  if (cleanPath.startsWith("/guides/")) {
    const guideName = decodeURIComponent(cleanPath.replace("/guides/", "")).replace(/-/g, " ");
    return {
      title: `${guideName} - Kingdom Adventures Guide`,
      description: `Read the ${guideName} guide for Kingdom Adventures strategy, planning, and community tips.`,
      canonicalPath: cleanPath,
    };
  }

  const meta = ROUTE_SEO[cleanPath] ?? {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
  };

  return { ...meta, canonicalPath: cleanPath };
}

function encodeCanonicalPath(path: string) {
  if (path === "/") return "/";

  return path
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
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

function SiteHeader() {
  const [pathname, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : false
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const hasNavRef = useRef(false);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      hasNavRef.current = true;
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const goBack = () => {
    if (hasNavRef.current) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }

      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const searchEntries = useMemo<GlobalSearchEntry[]>(() => {
    const shared = localSharedData as any;
    const entries: GlobalSearchEntry[] = [];

    Object.keys(shared.jobs ?? {}).forEach((name) =>
      entries.push({ label: name, subtitle: "Job Database", href: `/jobs/${encodeURIComponent(name)}` })
    );

    Object.keys(shared.monsters ?? {}).forEach((name) =>
      entries.push({ label: name, subtitle: "Monster Spawns", href: "/monster-spawns" })
    );

    Object.keys(shared.skills ?? {}).forEach((name) =>
      entries.push({ label: name, subtitle: "Skills Database", href: "/skills" })
    );

    Object.keys(shared.overrides ?? {}).forEach((name) => {
      entries.push({ label: name, subtitle: "Equipment Database", href: "/equipment-stats" });
    });

    FURNITURE_SEARCH_ROWS.forEach((name) =>
      entries.push({ label: name, subtitle: "Furniture Shop", href: `/shops/furniture-shop?search=${encodeURIComponent(name)}` })
    );

    SHOP_RECORDS.forEach((shop) =>
      entries.push({ label: shop.title, subtitle: "Shops", href: `/shops/${shop.slug}` })
    );

    return entries;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchEntries.filter((entry) =>
      entry.label.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, searchEntries]);

  const navSections: NavSection[] = [
    {
      title: "Browse",
      children: [
        { href: "/", label: "Home" },
        { href: "/jobs", label: "Jobs" },
        { href: "/survey", label: "Survey" },
        { href: "/equipment", label: "Equipment Stats & Exchange" },
        { href: "/skills", label: "Skills" },
        { href: "/loadout", label: "Loadout Builder" },
        { href: "/match-finder", label: "Match Finder" },
        { href: "/town-rank", label: "Town Rank" },
        { href: "/guides", label: "Guides" },
      ],
      note: "Match Finder includes marriage matching and marriage sim tools.",
    },
    {
      title: "Guides",
      primary: { href: "/guides", label: "Guides" },
      children: [
        { href: "/playthrough-guide", label: "Playthrough Guide by Jaza" },
        { href: "/add-guide", label: "Add Guide" },
      ],
    },
    {
      title: "Equipment",
      primary: { href: "/equipment", label: "Equipment Stats & Exchange" },
      children: [
        { href: "/equipment-stats", label: "Equipment Stats" },
        { href: "/equipment-exchange", label: "Equipment Exchange" },
        { href: "/equipment-leveling-optimizer", label: "Equipment Leveling Optimizer", beta: true },
      ],
    },
    {
      title: "Eggs, Pets & Monsters",
      primary: { href: "/eggs-pets-monsters", label: "Eggs, Pets & Monsters" },
      children: [
        { href: "/eggs", label: "Eggs & Pets" },
        { href: "/monsters-pets", label: "Monsters & Pets" },
      ],
    },
    {
      title: "Shops",
      primary: { href: "/shops", label: "Shops" },
      children: SHOP_RECORDS.map((shop) => ({
        href: `/shops/${shop.slug}`,
        label: shop.shortTitle,
      })),
    },
    {
      title: "Facilities",
      primary: { href: "/houses", label: "Houses & Facilities" },
    },
    {
      title: "Events",
      primary: { href: "/timed-events", label: "Events" },
      children: [
        { href: "/weekly-conquest", label: "Weekly Conquest" },
        { href: "/gacha-events", label: "Gacha Events" },
        { href: "/wario-dungeon", label: "Wairo Dungeon" },
        { href: "/daily-rank-rewards", label: "Daily Rank Rewards" },
        { href: "/kairo-room", label: "Kairo Room" },
        { href: "/job-center", label: "Job Center" },
      ],
    },
    {
      title: "Maps",
      children: [
        { href: "/world-map", label: "World Map", beta: true },
        { href: "/map-2-testing", label: "Map 2 Testing", beta: true },
      ],
    },
    {
      title: "Device",
      children: [{ href: "/sync-devices", label: "Sync Devices" }],
    },
  ];

  return (
    <div className="fixed inset-x-0 top-0 z-[60] border-b border-border bg-background/90 backdrop-blur">
      <div className="w-full px-2 sm:px-4 h-14 flex items-center justify-between gap-3">

        <div className="flex items-center gap-0.5">
          {pathname !== "/" && (
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={goBack} title="Go back">
              <ArrowLeft className="w-[30px] h-[30px]" />
            </Button>
          )}

          <div ref={menuRef}>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMenuOpen(!menuOpen)}>
              <Menu className="w-[30px] h-[30px]" />
            </Button>

            {menuOpen && (
              <div className="absolute left-4 top-full mt-2 z-50 w-72 max-h-[min(80vh,42rem)] overflow-y-auto">
                <Card>
                  <CardContent className="p-3 space-y-3">
                    {navSections.map((section) => (
                      <div key={section.title} className="space-y-1.5">
                        <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                          {section.title}
                        </div>
                        {section.primary && (
                          <button
                            onClick={() => {
                              navigate(section.primary!.href);
                              setMenuOpen(false);
                            }}
                            className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                          >
                            <span className="flex items-center gap-1.5">
                              {section.primary.label}
                              {section.primary.beta && (
                                <span className="text-[10px] font-semibold text-orange-400">BETA</span>
                              )}
                            </span>
                          </button>
                        )}
                        {section.note && (
                          <div className="px-1 text-[11px] leading-relaxed text-muted-foreground/75">
                            {section.note}
                          </div>
                        )}
                        {section.children && (
                          <div className="flex flex-wrap gap-1.5 px-0.5">
                            {section.children.map((link) => (
                              <button
                                key={`${section.title}-${link.href}-${link.label}`}
                                onClick={() => {
                                  navigate(link.href);
                                  setMenuOpen(false);
                                }}
                                className="rounded-md border px-2.5 py-1.5 text-[11px] hover:bg-muted/40"
                              >
                                <span className="flex items-center gap-1">
                                  {link.label}
                                  {link.beta && (
                                    <span className="text-[9px] font-semibold text-orange-400">BETA</span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        <Link
          href="/"
          className="text-xl sm:text-2xl font-semibold truncate hover:opacity-80 transition-opacity"
          title="Go to home page"
        >
          Kingdom Adventures
        </Link>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setDark((d) => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun className="w-[30px] h-[30px]" /> : <Moon className="w-[30px] h-[30px]" />}
          </Button>

          <div ref={searchRef}>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setSearchOpen(!searchOpen)}>
            <Search className="w-[30px] h-[30px]" />
          </Button>

          {searchOpen && (
            <div className="absolute right-4 top-full mt-2 z-50 w-[min(32rem,calc(100vw-2rem))]">
              <Card>
                <CardContent className="p-3 space-y-3">

                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search..."
                      className="pl-9 h-10 pr-9"
                    />

                    {query && (
                      <button
                        onClick={() => setQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {filtered.map((entry) => (
                    <button
                      key={entry.label}
                      onClick={() => {
                        navigate(entry.href);
                        setSearchOpen(false);
                        setQuery("");
                      }}
                      className="block w-full text-left px-2 py-2 hover:bg-muted/40 rounded-md"
                    >
                      <div className="font-medium text-sm">{entry.label}</div>
                      <div className="text-xs opacity-70">{entry.subtitle}</div>
                    </button>
                  ))}

                </CardContent>
              </Card>
            </div>
          )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/match-finder" component={MarriageMatcher} />
      <Route path="/equipment" component={EquipmentStatsExchangePage} />
      <Route path="/equipment-stats" component={EquipmentPage} />
      <Route path="/equipment-exchange" component={EquipmentExchangePage} />
      <Route path="/equipment-leveling-optimizer" component={EquipmentLevelingOptimizerPage} />
      <Route path="/monsters" component={MonstersPage} />
      <Route path="/weekly-conquest" component={WeeklyConquestPage} />
      <Route path="/jobs" component={JobsPage} />
      <Route path="/jobs/:name" component={JobsPage} />
      <Route path="/skills" component={SkillsPage} />
      <Route path="/loadout" component={LoadoutPage} />
      <Route path="/eggs-pets-monsters" component={EggsPetsMonstersPage} />
      <Route path="/eggs" component={EggsPage} />
      <Route path="/monsters-pets" component={MonstersPetsPage} />
      <Route path="/monster-spawns" component={MonstersPage} />
      <Route path="/monster-pet-stats" component={MonsterPetStatsPage} />
      <Route path="/shops" component={ShopsPage} />
      <Route path="/shops/:slug" component={ShopsPage} />
      <Route path="/sync-devices" component={SyncDevicesPage} />
      <Route path="/world-map" component={WorldMapPage} />
      <Route path="/map-2-testing" component={Map2TestingPage} />
      <Route path="/houses" component={HousesPage} />
      <Route path="/survey" component={SurveyPlanner} />
      <Route path="/survey-planner" component={SurveyPlanner} />
      <Route path="/timed-events" component={TimedEventsPage} />
      <Route path="/wario-dungeon" component={WarioDungeonPage} />
      <Route path="/daily-rank-rewards" component={DailyRankRewardsPage} />
      <Route path="/job-center" component={JobCenterPage} />
      <Route path="/kairo-room" component={KairoRoomPage} />
      <Route path="/gacha-events" component={GachaEventsPage} />
      <Route path="/town-rank" component={TownRankPage} />
      <Route path="/guides/:slug" component={CommunityGuidePage} />
      <Route path="/guides" component={GuidesPage} />
      <Route path="/updates" component={UpdatesPage} />
      <Route path="/add-guide" component={AddGuidePage} />
      <Route path="/playthrough-guide" component={PlaythroughGuidePage} />
      <Route path="/test" component={TestPage} />
      <Route component={NotFound} />
      
    </Switch>
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SeoManager />
          <ScrollToTopOnRouteChange />
          <SiteHeader />
          <main className="ka-app-shell pt-14">
            <Router />
          </main>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
});

export default App;
