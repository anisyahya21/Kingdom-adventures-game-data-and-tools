import { useEffect, useMemo, useState } from "react";
import { useLocalFeature } from "@/hooks/sync/use-local-feature";
import { Link } from "wouter";
import { type HomeArtworkStyle, type HomeCombatArtwork } from "@/components/ka/home-tool-artwork";
import { ToolNavigationCard } from "@/components/ka/tool-navigation-card";
import { useArtworkPreference } from "@/hooks/use-artwork-preference";
import { Plus, Trash2, ExternalLink, BookOpen, CalendarDays, ArrowUpRight, Palette } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAutomaticWeeklyConquestTimeline } from "@/lib/weekly-conquest";
import { FACILITY_GACHA_EVENTS } from "@/game-data/facility-gacha-events";
import { getMonsterSpawnReference, presentBriefingMission } from "@/game-data/briefing-room";
import { eventClockDateToLocalDate, getOffsetAdjustedNow, useEventHourOffset } from "@/lib/event-time";
import { eventStatusLabel, type EventStatus } from "@/lib/event-status";
import { formatBriefingDate, getCurrentOrUpcomingSpecificMonsterTarget } from "@/lib/briefing-room-schedule";
import { getNextWarioDungeonSpawn, isWarioDungeonLive } from "@/lib/wairo-schedule";

const CREDIT_SOURCES = [
  {
    label: "KA GameData Sheet",
    by: "minhnim",
    description: "Primary raw game-data sheet used to pull translated website data for jobs, equipment, monsters, conquest, items, and more.",
    href: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/edit",
  },
  {
    label: "Kingdom Adventurers EN Sheet",
    description: "Reference and translation sheet used to understand systems like pets, eggs, and other player-facing game mechanics.",
    href: "https://docs.google.com/spreadsheets/d/1pNx7SjpgjuKFI9Hgr21y3ammRlZjKNTTdvfLYQL7l7A/edit",
  },
  {
    label: "Playthrough Guide",
    by: "Jaza",
    description: "Community-written Kingdom Adventurers progression guide that we adapted into the website-styled guide page.",
    href: "https://docs.google.com/document/d/1HDY-6lgFfjIX9KfzmuBrR4xsSMWGXKViccsGQJ_o5yE/edit",
  },
  {
    label: "Kairosoft Fandom",
    description: "General Kingdom Adventurers reference used to cross-check mechanics and player-facing data.",
    href: "https://kairosoft.fandom.com/wiki/Category:Kingdom_Adventurers",
  },
  {
    label: "Kairosoft Wiki.gg",
    description: "General Kingdom Adventurers reference used alongside the data sheets for validation and understanding.",
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
            These sheets and reference sites helped us pull, understand, and cross-check Kingdom Adventurers data for the website.
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
    slug: "/jobs-marriage",
    title: "Jobs",
    description: "Stats, ranks & marriage",
  },
  {
    slug: "/equipment",
    title: "Equipment",
    description: "Stats, exchange & leveling",
  },
  {
    slug: "/survey",
    title: "Survey",
    description: "Rewards & success calculator",
  },
  {
    slug: "/skills",
    title: "Skills",
    description: "Skill effects & notes",
  },
  {
    slug: "/combat",
    title: "Combat Hub",
    description: "Characters, teams & simulations",
  },
  {
    slug: "/eggs-pets-monsters",
    title: "Eggs, Pets & Monsters",
    description: "Egg planner, pet stats & spawns",
  },
  {
    slug: "/chaos-setup-lab",
    title: "Chaos Setup",
    description: "Stone & signboard layouts",
  },
  {
    slug: "/shops",
    title: "Shops & Items",
    description: "Catalogs, crafting & feeding",
  },
  {
    slug: "/research",
    title: "Research",
    description: "Unlocks & requirements",
  },
  {
    slug: "/training-facilities",
    title: "Training Facilities",
    description: "Stat XP & surround bonuses",
  },
  {
    slug: "/houses",
    title: "Houses & Facilities",
    description: "Plots, capacity & facilities",
  },
  {
    slug: "/timed-events",
    title: "Events",
    description: "Schedules & rewards",
  },
  {
    slug: "/guides",
    title: "Guides",
    description: "Walkthroughs & community tips",
  },
  {
    slug: "/add-friends",
    title: "Add Friends",
    description: "Find players & share your game ID",
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

type EventTimerCard = {
  href: string;
  title: string;
  subtitle: string;
  countdown: string;
  status: EventStatus;
  spriteSrc?: string;
  detail?: string;
};

function EventTimerDescription({ card }: { card: EventTimerCard }) {
  if (!card.spriteSrc) {
    return <div className="text-xs text-muted-foreground leading-relaxed">{card.subtitle}</div>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/30 p-1">
        <img src={card.spriteSrc} alt="" className="h-full w-full object-contain" style={{ imageRendering: "pixelated" }} />
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs leading-snug text-muted-foreground">{card.subtitle}</div>
        {card.detail ? <div className="line-clamp-2 break-words text-[10px] leading-snug text-muted-foreground/80">{card.detail}</div> : null}
      </div>
    </div>
  );
}

function HomeCountdownBanner() {
  const [now, setNow] = useState(() => new Date());
  const [activeIndex, setActiveIndex] = useState(0);
  const [eventOffset] = useEventHourOffset();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
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
  const briefingTarget = useMemo(
    () => getCurrentOrUpcomingSpecificMonsterTarget(now, eventOffset),
    [eventOffset, now],
  );
  const briefingMission = briefingTarget ? presentBriefingMission(briefingTarget.mission, null) : undefined;
  const briefingMonsterName = briefingMission?.monsterName;
  const briefingSpawn = getMonsterSpawnReference(briefingMonsterName);

  const cards: EventTimerCard[] = [
    {
      href: "/briefing-room",
      title: briefingMonsterName ? `Briefing Room: ${briefingMonsterName}` : "Briefing Room monster target",
      subtitle: briefingTarget?.active
        ? "Scheduled today (JST) · target changes at the next Japan day"
        : briefingTarget
        ? `Next scheduled target: ${formatBriefingDate(briefingTarget.date)} (JST)`
        : "No upcoming specific-monster mission found",
      detail: briefingSpawn
        ? briefingSpawn.terrainName + " · Area Lv. " + briefingSpawn.minLevel + "–" + briefingSpawn.maxLevel
        : "Spawn reference unavailable",
      spriteSrc: briefingSpawn?.sprite,
      countdown: briefingTarget
        ? formatCountdown(briefingTarget.countdownAt.getTime() - now.getTime())
        : "Unavailable",
      status: briefingTarget?.active ? "live" : "inactive",
    },
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
  const timerLabels = ["Briefing Room", "Wairo Dungeon", "S-rank Gacha", "Weekly Conquest"];

  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden shadow-none" aria-labelledby="home-events-title">
      <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="home-events-title" className="text-sm font-semibold">Event Timers</h2>
      </div>
      <Link href={activeCard.href} className="group block flex-1 px-4 py-4 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium leading-snug text-foreground group-hover:text-primary">{activeCard.title}</h3>
          <Badge variant="outline" className={`shrink-0 text-xs ${activeCard.status === "live" ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            {eventStatusLabel(activeCard.status)}
          </Badge>
        </div>
        <div className="mb-3 text-3xl font-semibold leading-none tracking-tight text-foreground tabular-nums">{activeCard.countdown}</div>
        <EventTimerDescription card={activeCard} />
      </Link>
      <div className="grid grid-cols-2 gap-1.5 border-t border-border p-3" role="group" aria-label="Choose event timer">
        {cards.map((card, index) => (
          <Button
            key={card.href}
            type="button"
            variant="ghost"
            aria-label={`Show ${timerLabels[index]} timer`}
            aria-pressed={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            className={`min-h-11 h-auto justify-start whitespace-normal px-2.5 py-2 text-left text-xs ${index === activeIndex ? "bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground"}`}
          >
            {timerLabels[index]}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function HomeWorldMapCard() {
  return (
    <Link href="/world-map-v2" className="group block min-w-0 rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Card className="flex h-full flex-col overflow-hidden shadow-none transition-colors group-hover:border-primary/40">
        <div className="relative min-h-48 flex-1 overflow-hidden bg-muted sm:min-h-64">
          <img
            src="/Images/world-map-v2-thumbnail.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
            width={1418}
            height={497}
          />
        </div>
        <CardContent className="px-4 py-3">
          <h2 className="text-base font-medium text-foreground group-hover:text-primary">World map</h2>
        </CardContent>
      </Card>
    </Link>
  );
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function Home({ artworkStyle, combatArtwork = "cyan", allowArtworkSwitch = artworkStyle === undefined || artworkStyle === "mixed" }: { artworkStyle?: HomeArtworkStyle; combatArtwork?: HomeCombatArtwork; allowArtworkSwitch?: boolean } = {}) {
  const [preferGameArtwork, setPreferGameArtwork] = useArtworkPreference();
  const gameArtworkEnabled = preferGameArtwork === true;
  const displayedArtwork = allowArtworkSwitch ? (gameArtworkEnabled ? "game" : "mixed") : artworkStyle ?? "mixed";
  const artworkAction = gameArtworkEnabled ? "Switch to generated artwork" : "Switch to game artwork";
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Kingdom Adventurers</h1>
          <Link href="/updates" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Latest updates <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mb-7 grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:mb-9 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <HomeCountdownBanner />
          <HomeWorldMapCard />
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Tools</h2>
          {allowArtworkSwitch && <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={artworkAction} onClick={() => setPreferGameArtwork((previous) => previous !== true)} className="h-11 w-11 text-muted-foreground hover:text-foreground">
                  <Palette className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{artworkAction}</TooltipContent>
            </Tooltip>
            <span className="sr-only" role="status">{gameArtworkEnabled ? "Game artwork selected" : "Generated artwork selected"}</span>
          </>}
        </div>
        <div className="mb-8 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {BUILT_IN_TOOLS.map((tool) => (
            <ToolNavigationCard key={tool.slug} href={tool.slug} title={tool.title} description={tool.description} artworkKey={tool.slug} artworkStyle={displayedArtwork} combatArtwork={combatArtwork} homeCard />
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
                        type="button"
                        aria-label={`Remove ${p.title} from your projects`}
                        onClick={(e) => { e.preventDefault(); removeProject(p.id); }}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
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
              <Input aria-label="Project title" placeholder="Project title *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="min-h-11 text-sm" />
              <Input aria-label="Project description" placeholder="Short description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="min-h-11 text-sm" />
              <Input aria-label="Project URL" placeholder="Link (URL)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="min-h-11 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={addProject} disabled={!newTitle.trim()} className="min-h-11">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewTitle(""); setNewDesc(""); setNewUrl(""); }} className="min-h-11">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 hover:text-foreground"
          >
            <Plus className="w-4 h-4" /> Add a project
          </button>
        )}

        <section className="mt-8 max-w-3xl space-y-2 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground" aria-labelledby="home-about-title">
          <h2 id="home-about-title" className="text-sm font-medium text-foreground">About Kingdom Adventurers Community Tools</h2>
          <p>
            Kingdom Adventurers Community Tools is a searchable reference site for jobs, equipment, shops,
            monsters, pets, events, maps, guides, and planning calculators.
          </p>
          <p>
            Use it to compare job stats, check weapon and shield access, plan equipment exchange routes,
            find shop unlocks, follow event timers, and make better town progression decisions.
          </p>
        </section>

        <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between gap-4 flex-wrap">
          <span>Kingdom Adventurers - open source tools</span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setCreditsOpen(true)} className="flex min-h-11 items-center gap-1 hover:text-foreground transition-colors">
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

