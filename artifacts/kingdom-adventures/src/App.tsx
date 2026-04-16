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
import MonstersPage from "@/pages/monsters";
import JobsPage from "@/pages/jobs";
import SkillsPage from "@/pages/skills";
import LoadoutPage from "@/pages/loadout";
import EggsPage from "@/pages/eggs";
import ShopsPage from "@/pages/shops";
import SyncDevicesPage from "@/pages/sync-devices";
import WorldMapPage from "@/pages/world-map";
import HousesPage from "@/pages/houses";
import TownRankPage from "@/pages/town-rank";
import { localSharedData } from "@/lib/local-shared-data";
import { SHOP_RECORDS } from "@/lib/shop-utils";

const queryClient = new QueryClient();

type GlobalSearchEntry = { label: string; subtitle: string; href: string };

const FURNITURE_SEARCH_ROWS = [
  "Candle","Kitchen Shelves","Desk","Red Carpet","Decorative Plant","Dining Table","Study Desk",
  "Rainwater Barrel","Chest of Drawers","Flower Vase","Shelf","Bookshelf","Training Room",
  "Rejuvenating Bath","Flowers","Tomato","Dresser","Couch","Bathtub","Stove","Pansy",
  "Shooting Range","Fluffy Carpet","Cooking Counter","Decorative Armor","Vanity Mirror","Window",
  "Magic Training Ground","Glittering Stone","Black Mat","Fireplace","Tree Nursery","Ancestor Statue",
  "Animal Figurine","Tool Workshop","Ore Workbench","Double Bed",
];

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
      entries.push({ label: name, subtitle: "Monster Database", href: "/monsters" })
    );

    Object.keys(shared.skills ?? {}).forEach((name) =>
      entries.push({ label: name, subtitle: "Skills Database", href: "/skills" })
    );

    Object.keys(shared.overrides ?? {}).forEach((name) => {
      entries.push({ label: name, subtitle: "Equipment Database", href: "/equipment" });
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

  const links = [
    { href: "/", label: "Home" },
    { href: "/jobs", label: "Jobs" },
    { href: "/equipment", label: "Equipment" },
    { href: "/monsters", label: "Monsters" },
    { href: "/skills", label: "Skills" },
    { href: "/eggs", label: "Eggs & Pets" },
    { href: "/shops", label: "Shops" },
    { href: "/match-finder", label: "Match Finder" },
    { href: "/loadout", label: "Loadout" },
    { href: "/sync-devices", label: "Sync Devices" },
    { href: "/world-map", label: "World Map", beta: true },
    { href: "/houses", label: "Houses" },
    { href: "/town-rank", label: "Town Rank" },
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">

        <div className="flex items-center gap-0.5">
          <div ref={menuRef}>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMenuOpen(!menuOpen)}>
              <Menu className="w-5 h-5" />
            </Button>

            {menuOpen && (
              <div className="absolute left-4 top-full mt-2 z-50 w-72">
                <Card>
                  <CardContent className="p-3 space-y-2">
                    {links.map((link) => (
                      <button
                        key={link.href}
                        onClick={() => {
                          navigate(link.href);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <span className="flex items-center gap-1.5">
                          {link.label}
                          {(link as { beta?: boolean }).beta && (
                            <span className="text-[10px] font-semibold text-orange-400">BETA</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {pathname !== "/" && (
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goBack} title="Go back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
        </div>

        <Link href="/">
          <button className="text-sm font-semibold truncate">
            Kingdom Adventures
          </button>
        </Link>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDark((d) => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <div ref={searchRef}>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSearchOpen(!searchOpen)}>
            <Search className="w-5 h-5" />
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
      <Route path="/equipment" component={EquipmentPage} />
      <Route path="/monsters" component={MonstersPage} />
      <Route path="/jobs" component={JobsPage} />
      <Route path="/jobs/:name" component={JobsPage} />
      <Route path="/skills" component={SkillsPage} />
      <Route path="/loadout" component={LoadoutPage} />
      <Route path="/eggs" component={EggsPage} />
      <Route path="/shops" component={ShopsPage} />
      <Route path="/shops/:slug" component={ShopsPage} />
      <Route path="/sync-devices" component={SyncDevicesPage} />
      <Route path="/world-map" component={WorldMapPage} />
      <Route path="/houses" component={HousesPage} />
      <Route path="/town-rank" component={TownRankPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const App = memo(function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SiteHeader />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
});

export default App;