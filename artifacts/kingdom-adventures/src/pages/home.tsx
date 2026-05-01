import { useEffect, useMemo, useState } from "react";
import { useLocalFeature } from "@/hooks/sync/use-local-feature";
import { Link } from "wouter";
import { Plus, Heart, Sword, Trash2, ExternalLink, Skull, Briefcase, BookOpen, Package, Egg, Store, Home as HomeIcon, CalendarDays, BookMarked } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryBadge } from "@/components/ka/category-badge";
import type { KaCategory } from "@/design-system/category-styles";
import { fetchAutomaticWeeklyConquestTimeline } from "@/lib/weekly-conquest";
import { FACILITY_GACHA_EVENTS } from "@/game-data/facility-gacha-events";
import { eventClockDateToLocalDate, getOffsetAdjustedNow, useEventHourOffset } from "@/lib/event-time";
import { eventStatusCardClass, eventStatusClass, eventStatusLabel, type EventStatus } from "@/lib/event-status";
import { getNextWarioDungeonSpawn, isWarioDungeonLive } from "@/pages/wario-dungeon";

const CREDIT_SOURCES = [
  {
    label: "KA GameData Sheet",
    by: "minhnim",
    description: "Primary raw game-data sheet used to pull translated website data for jobs, equipment, monsters, conquest, items, and more.",
    href: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/edit",
  },
  {
    label: "Kingdom Adventures EN Sheet",
    description: "Reference and translation sheet used to understand systems like pets, eggs, and other player-facing game mechanics.",
    href: "https://docs.google.com/spreadsheets/d/1pNx7SjpgjuKFI9Hgr21y3ammRlZjKNTTdvfLYQL7l7A/edit",
  },
  {
    label: "Playthrough Guide",
    by: "Jaza",
    description: "Community-written Kingdom Adventures progression guide that we adapted into the website-styled guide page.",
    href: "https://docs.google.com/document/d/1HDY-6lgFfjIX9KfzmuBrR4xsSMWGXKViccsGQJ_o5yE/edit",
  },
  {
    label: "Kairosoft Fandom",
    description: "General Kingdom Adventures reference used to cross-check mechanics and player-facing data.",
    href: "https://kairosoft.fandom.com/wiki/Category:Kingdom_Adventurers",
  },
  {
    label: "Kairosoft Wiki.gg",
    description: "General Kingdom Adventures reference used alongside the data sheets for validation and understanding.",
    href: "https://kairosoft.wiki.gg/wiki/Kingdom_Adventurers",
  },
] as const;

function CreditsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Credits</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            These sheets and reference sites helped us pull, understand, and cross-check Kingdom Adventures data for the website.
          </p>
          <div className="space-y-3">
            {CREDIT_SOURCES.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <BookOpen className="w-4 h-4 text-primary" />
                  {source.label}
                  {"by" in source && source.by ? (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground border border-border rounded px-1.5 py-0.5">
                      by {source.by}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{source.description}</p>
              </a>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CustomProject {
  id: string;
  title: string;
  description: string;
  url: string;
}

const BUILT_IN_TOOLS = [
  {
    slug: "/match-finder",
    title: "Match Finder & Marriage Sim",
    description: "Three tools in one: Match Finder, Marriage Simulator, and Pairing Data.",
    icon: <Heart className="w-6 h-6 text-rose-500" />,
    badge: "Marriage",
    badgeCategory: "marriage" satisfies KaCategory,
  },
  {
    slug: "/equipment",
    title: "Equipment Stats & Exchange",
    description: "Open the equipment hub for stats browsing and the exchange calculator.",
    icon: <Sword className="w-6 h-6 text-amber-500" />,
    badge: "Equipment",
    badgeCategory: "equipment" satisfies KaCategory,
  },
  {
    slug: "/jobs",
    title: "Job Database",
    description: "Explore all jobs with stats, ranks, and restrictions.",
    icon: <Briefcase className="w-6 h-6 text-sky-500" />,
    badge: "Jobs",
    badgeCategory: "job" satisfies KaCategory,
  },
  {
    slug: "/survey",
    title: "Survey",
    description: "Survey database and calculator for planning success and rewards.",
    icon: <Store className="w-6 h-6 text-cyan-500" />,
    badge: "Survey",
    badgeCategory: "survey" satisfies KaCategory,
  },
  {
    slug: "/skills",
    title: "Skills Database",
    description: "Community-editable list of skills and related data.",
    icon: <BookOpen className="w-6 h-6 text-emerald-500" />,
    badge: "Skills",
    badgeCategory: "skill" satisfies KaCategory,
  },
  {
    slug: "/loadout",
    title: "Loadout Builder",
    description: "Build character loadouts and calculate total stats.",
    icon: <Package className="w-6 h-6 text-orange-500" />,
    badge: "Builder",
    badgeCategory: "builder" satisfies KaCategory,
  },
  {
    slug: "/eggs-pets-monsters",
    title: "Eggs, Pets & Monsters",
    description: "Egg planner plus detailed monster and pet databases for stats, growth, spawn locations, and team planning.",
    icon: <Egg className="w-6 h-6 text-yellow-500" />,
    badge: "Planner",
    badgeCategory: "monster" satisfies KaCategory,
  },
  {
    slug: "/shops",
    title: "Shops",
    description: "Browse shop systems by type and drill into each shop.",
    icon: <Store className="w-6 h-6 text-indigo-500" />,
    badge: "Shops",
    badgeCategory: "shop" satisfies KaCategory,
  },
  {
    slug: "/houses",
    title: "Houses & Facilities",
    description: "Plan plots, building costs, extra beds, shelves, monster rooms, owner jobs, facility upgrades, map unlocks, storage, and production.",
    icon: <HomeIcon className="w-6 h-6 text-lime-500" />,
    badge: "Buildings",
    badgeCategory: "building" satisfies KaCategory,
  },
  {
    slug: "/timed-events",
    title: "Events",
    description: "Weekly Conquest, Gacha Events, Wairo Dungeon, Kairo Room, and Job Center.",
    icon: <CalendarDays className="w-6 h-6 text-pink-500" />,
    badge: "Events",
    badgeCategory: "event" satisfies KaCategory,
  },
  {
    slug: "/guides",
    title: "Guides",
    description: "Community-written guides collected in one place, starting with Jaza's playthrough guide.",
    icon: <BookMarked className="w-6 h-6 text-violet-500" />,
    badge: "Guides",
    badgeCategory: "guide" satisfies KaCategory,
  },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Live now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getNextWarioSpawn(now: Date, offset: number): Date | null {
  return getNextWarioDungeonSpawn(now, offset)?.startsAt ?? null;
}

const MAX_EVENT_COUNTDOWN_MS = 330 * 86400000;

function resolveFacilityWindow(now: Date, offset: number) {
  const eventClockYear = getOffsetAdjustedNow(now, offset).getFullYear();
  const windows = FACILITY_GACHA_EVENTS.flatMap((event) => [eventClockYear - 1, eventClockYear, eventClockYear + 1].map((year) => ({
    id: event.id,
    startAt: eventClockDateToLocalDate(new Date(year, event.startMonth - 1, event.startDay, 0, 0, 0, 0), offset),
    endAt: eventClockDateToLocalDate(new Date(year, event.endMonth - 1, event.endDay, 23, 59, 59, 999), offset),
  })));
  const active = windows.find((window) => window.startAt <= now && now <= window.endAt);
  if (active) return active;
  return windows
    .filter((window) => {
      const diff = window.startAt.getTime() - now.getTime();
      return diff > 0 && diff <= MAX_EVENT_COUNTDOWN_MS;
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;
}

function HomeCountdownBanner() {
  const [now, setNow] = useState(() => new Date());
  const [activeIndex, setActiveIndex] = useState(0);
  const [eventOffset] = useEventHourOffset();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const rotate = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % 3);
    }, 4500);
    return () => window.clearInterval(rotate);
  }, []);

  const weeklyQuery = useQuery({
    queryKey: ["home-weekly-conquest-banner"],
    queryFn: () => fetchAutomaticWeeklyConquestTimeline(undefined, 4),
    staleTime: 5 * 60 * 1000,
  });

  const weeklyCurrent = weeklyQuery.data?.entries.find((entry) => entry.id === weeklyQuery.data?.currentId) ?? null;
  const weeklyUpcoming = useMemo(
    () => weeklyQuery.data?.entries.filter((entry) => entry.startedAt > now.getTime()).sort((a, b) => a.startedAt - b.startedAt)[0] ?? null,
    [weeklyQuery.data?.entries, now]
  );
  const nextWario = useMemo(() => getNextWarioSpawn(now, eventOffset), [eventOffset, now]);
  const warioLive = isWarioDungeonLive(now, eventOffset);
  const facilityWindow = useMemo(() => resolveFacilityWindow(now, eventOffset), [eventOffset, now]);
  const facilityActive = facilityWindow ? (facilityWindow.startAt <= now && now <= facilityWindow.endAt) : false;

  const cards: Array<{
    href: string;
    title: string;
    subtitle: string;
    countdown: string;
    status: EventStatus;
  }> = [
    {
      href: "/wario-dungeon",
      title: "Wairo Dungeon",
      subtitle: warioLive
        ? "Dungeon spawn is live now"
        : nextWario
        ? `${nextWario.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : "No upcoming spawn found",
      countdown: warioLive ? "Live now" : nextWario ? formatCountdown(nextWario.getTime() - now.getTime()) : "Unavailable",
      status: warioLive ? "live" : "inactive",
    },
    {
      href: "/gacha-events",
      title: "Next Facility S Rank Gacha",
      subtitle: facilityWindow
        ? (facilityActive
            ? `Live until ${facilityWindow.endAt.toLocaleDateString([], { month: "short", day: "numeric" })}`
            : `${facilityWindow.startAt.toLocaleDateString([], { month: "short", day: "numeric" })} - ${facilityWindow.endAt.toLocaleDateString([], { month: "short", day: "numeric" })}`)
        : "No upcoming event scheduled",
      countdown: facilityWindow
        ? formatCountdown((facilityActive ? facilityWindow.endAt : facilityWindow.startAt).getTime() - now.getTime())
        : "-",
      status: facilityActive ? "live" : "inactive",
    },
    {
      href: "/weekly-conquest",
      title: "Weekly Conquest",
      subtitle: weeklyCurrent
        ? weeklyCurrent.name
        : weeklyUpcoming
        ? `Next: ${weeklyUpcoming.name}`
        : weeklyQuery.isError
        ? "Unable to load current rotation"
        : "Loading current rotation",
      countdown: weeklyCurrent
        ? formatCountdown(weeklyCurrent.endsAt - now.getTime())
        : weeklyUpcoming
        ? formatCountdown(weeklyUpcoming.startedAt - now.getTime())
        : weeklyQuery.isError
        ? "Unavailable"
        : "Loading",
      status: weeklyCurrent ? "live" : "inactive",
    },
  ];

  const activeCard = cards[activeIndex] ?? cards[0];

  return (
    <div className="rounded-2xl border p-4 sm:p-5 bg-muted/20">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-5 h-5 text-primary" />
        <div>
          <div className="font-semibold xl:text-base text-sm">Event Timers</div>
          <div className="hidden xl:block text-sm text-muted-foreground">Live countdowns for current and upcoming event windows.</div>
        </div>
      </div>

      <div className="xl:hidden">
        <Link href={activeCard.href}>
          <Card className={`cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30 ${eventStatusCardClass(activeCard.status)}`}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm leading-tight">{activeCard.title}</div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${eventStatusClass(activeCard.status)}`}>
                  {eventStatusLabel(activeCard.status)}
                </Badge>
              </div>
              <div className="text-2xl font-semibold tabular-nums leading-none">{activeCard.countdown}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{activeCard.subtitle}</div>
              <div className="flex items-center gap-2 pt-1">
                {cards.map((card, index) => (
                  <button
                    key={card.title}
                    type="button"
                    aria-label={`Show ${card.title}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setActiveIndex(index);
                    }}
                    className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/35 hover:bg-muted-foreground/60"}`}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="hidden xl:block">
        <Link href={activeCard.href}>
          <Card className={`cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30 ${eventStatusCardClass(activeCard.status)}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{activeCard.title}</div>
                <Badge variant="outline" className={`text-[10px] ${eventStatusClass(activeCard.status)}`}>
                  {eventStatusLabel(activeCard.status)}
                </Badge>
              </div>
              <div className="text-3xl font-semibold tabular-nums leading-tight">{activeCard.countdown}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{activeCard.subtitle}</div>
              <div className="flex items-center gap-2 pt-1">
                {cards.map((card, index) => (
                  <button
                    key={card.title}
                    type="button"
                    aria-label={`Show ${card.title}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setActiveIndex(index);
                    }}
                    className={`h-2.5 rounded-full transition-all ${index === activeIndex ? "w-7 bg-primary" : "w-2.5 bg-muted-foreground/35 hover:bg-muted-foreground/60"}`}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function HomeWorldMapCard({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/world-map">
      <Card className="cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors h-full">
        <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-3"}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={compact ? "font-medium text-sm" : "font-medium"}>World map (Beta)</div>
            <Badge variant="outline" className="text-[10px]">Beta</Badge>
            {!compact && <Badge variant="outline" className="text-[10px]">Experimental</Badge>}
          </div>
          <div className={compact ? "text-xs text-muted-foreground leading-relaxed" : "text-sm text-muted-foreground leading-relaxed"}>
            Tile map planner with hover info on PC, tap info on mobile, and tool/highlight/deployment modes.
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function Home() {
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [customProjects, setCustomProjects] = useLocalFeature<CustomProject[]>("ka_custom_projects", []);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const saveProjects = (projects: CustomProject[]) => {
    setCustomProjects(projects);
  };

  const addProject = () => {
    if (!newTitle.trim()) return;
    saveProjects([
      ...customProjects,
      { id: generateId(), title: newTitle.trim(), description: newDesc.trim(), url: newUrl.trim() },
    ]);
    setNewTitle("");
    setNewDesc("");
    setNewUrl("");
    setAdding(false);
  };

  const removeProject = (id: string) => saveProjects(customProjects.filter((p) => p.id !== id));

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-12 xl:pr-[24rem]">
        <div className="flex items-start justify-between mb-10 gap-4">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold text-foreground tracking-tight">Kingdom Adventures</h1>
            <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Kingdom Adventures Community Tools is a searchable reference site for jobs, equipment, shops,
                monsters, pets, events, maps, guides, and planning calculators.
              </p>
              <p>
                Use it to compare job stats, check weapon and shield access, plan equipment exchange routes,
                find shop unlocks, follow event timers, and make better town progression decisions.
              </p>
            </div>
            <Link href="/updates" className="mt-2 inline-block text-sm font-semibold text-primary underline underline-offset-2 hover:opacity-90 transition-opacity">
              Click here for the latest updates and patch notes.
            </Link>
          </div>
        </div>

        <div className="mb-8 xl:pr-[24rem]">
          <div className="grid grid-cols-2 gap-3 xl:hidden">
            <HomeCountdownBanner />
            <HomeWorldMapCard compact />
          </div>
        </div>

        <div className="hidden xl:block fixed right-6 top-28 w-[320px] 2xl:right-10 z-20 space-y-4">
          <HomeCountdownBanner />
          <HomeWorldMapCard />
        </div>

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {BUILT_IN_TOOLS.map((tool) => (
            <Link key={tool.slug} href={tool.slug}>
              <Card className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                      {tool.icon}
                    </div>
                    <CategoryBadge category={tool.badgeCategory as KaCategory} className="text-xs px-2">
                      {tool.badge}
                    </CategoryBadge>
                  </div>
                  <CardTitle className="text-base mt-2">{tool.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">{tool.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {customProjects.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Community Projects</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {customProjects.map((p) => (
                <Card key={p.id} className="shadow-sm hover:shadow-md transition-all group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      <button
                        onClick={(e) => { e.preventDefault(); removeProject(p.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {p.description && <CardDescription className="text-xs">{p.description}</CardDescription>}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> Open project
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {adding ? (
          <Card className="shadow-sm border-dashed border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Add a project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Project title *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Short description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Link (URL)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="h-8 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={addProject} className="h-8">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewTitle(""); setNewDesc(""); setNewUrl(""); }} className="h-8">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors py-5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-4 h-4" /> Add a project
          </button>
        )}

        <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground flex items-center justify-between gap-4 flex-wrap">
          <span>Kingdom Adventures - open source tools</span>
          <div className="flex items-center gap-4">
            <button onClick={() => setCreditsOpen(true)} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <BookOpen className="w-3 h-3" /> Credits
            </button>
            <a
              href="https://github.com/anisyahya21/Kingdom-adventures-game-data-and-tools"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              style={{ textDecoration: "none" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3 h-3"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" fill="currentColor"/></svg>
              Fork/Link
            </a>
          </div>
        </div>
      </div>

      <CreditsDialog open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}
