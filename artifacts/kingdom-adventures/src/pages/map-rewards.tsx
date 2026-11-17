import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Map, Search, Swords } from "lucide-react";
import { Link } from "wouter";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { getEquipmentIcon, getFacilityIcon, getFacilityIconByName, getFurnitureIcon, getItemIcon } from "@/lib/equipment-icons";
import { getRankIcon } from "@/lib/rank-icons";
import { PageHeader } from "@/components/ka/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AREA_REWARD_MAP, AREA_REWARDS, type AreaReward } from "@/game-data/area-rewards";
import { SURVEY_TERRAIN_PREVIEW_IMAGES } from "@/game-data/terrain-labels";

const PAGE_SIZE = 8;
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const rewards = (area: AreaReward) => area.chest?.rewards.filter(reward => reward.rate > 0) ?? [];
const searchableAreas = AREA_REWARDS.map(area => ({
  area,
  text: normalize([area.terrain, area.boss, area.directReward, area.unlock, area.chest?.name,
    ...rewards(area).map(reward => reward.name)].filter(Boolean).join(" ")),
}));

function chestItemIcon(reward: ReturnType<typeof rewards>[number]) {
  if (reward.type === "equipment") return getEquipmentIcon(null, reward.name);
  const plotSize = reward.type === "furniture" && reward.name.match(/^Land \((S|M|L|XL)\)$/)?.[1];
  if (plotSize) return `/world-assets/builder/land-${plotSize}.png`;
  if (reward.type === "furniture" && reward.name === "Gravel Path") return "/world-assets/chip/azemichi00.png";
  return reward.type === "furniture"
    ? getFurnitureIcon(reward.name) ?? getFacilityIconByName(reward.name)
    : getItemIcon(reward.name);
}

const SCORCHED_EARTH_ART: Record<number, string> = {
  199: "/world-assets/building/building_76.png",
  203: "/world-assets/building/building_86.png",
  204: "/world-assets/building/building_87.png",
};

const quantityLabel = (min: number, max: number) => min === max ? `×${min}` : `×${min}–${max}`;

type RewardPreview = { name: string; src?: string; recruit?: AreaReward; quantity?: string };
type ShowRewardPreview = (reward: RewardPreview | null, anchor: DOMRect) => void;

function MapRewardIcon({ reward, onPreview, children }: {
  reward: RewardPreview;
  onPreview: ShowRewardPreview;
  children?: ReactNode;
}) {
  return (
    <span className="inline-flex shrink-0 items-center" data-reward-name={reward.name}
      onPointerEnter={event => {
        if (event.pointerType === "mouse") onPreview(reward, event.currentTarget.getBoundingClientRect());
      }}
      onPointerLeave={event => onPreview(null, event.currentTarget.getBoundingClientRect())}>
      {children ?? (reward.src
        ? <img src={reward.src} alt="" className="size-[clamp(14px,1.9cqw,42px)] shrink-0 object-contain [image-rendering:pixelated]" />
        : <span className="text-[8px] leading-none">{reward.name}</span>)}
    </span>
  );
}

const TOWN_HALL_ICON = "/world-assets/builder/townhall-0.png";

function facilityUnlockIcon(area: AreaReward) {
  return getFacilityIcon(area.facility?.id) ?? getFacilityIconByName(area.unlock)
    ?? (area.facility && SCORCHED_EARTH_ART[area.facility.id]);
}

function RecruitArtwork({ area, className = "size-5", rankClassName = "size-2.5" }: { area: AreaReward; className?: string; rankClassName?: string }) {
  const recruit = area.directReward?.match(/^([A-Z]) Grade (.+)$/);
  if (!recruit) return null;
  const [, rank, jobName] = recruit;
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-px">
      <CharacterPreviewCanvas jobName={jobName} rank={rank} variant={area.recruitVariant}
        equipState="right" scale={1} poseFrame={0} label={area.directReward} className={`${className} object-contain`} />
      <img src={getRankIcon(rank)} alt="" className={`${rankClassName} object-contain [image-rendering:pixelated]`} />
    </span>
  );
}

function DetailRewardIcon({ src }: { src?: string }) {
  return src ? <img src={src} alt="" className="size-6 shrink-0 object-contain [image-rendering:pixelated]" /> : null;
}

function TileRewards({ area, onPreview }: { area: AreaReward; onPreview: ShowRewardPreview }) {
  const contents = rewards(area);
  return (
    <>
      {(area.directReward || area.unlock) && <span className="flex items-center justify-center gap-0.5 rounded bg-background/90 px-0.5">
        {area.directReward === "Town Hall"
          ? <MapRewardIcon reward={{ name: "Town Hall", src: TOWN_HALL_ICON, quantity: "×1" }} onPreview={onPreview} />
          : area.directReward && <MapRewardIcon reward={{ name: area.directReward, recruit: area, quantity: "×1" }} onPreview={onPreview}>
              <RecruitArtwork area={area} className="size-[clamp(20px,2.5cqw,52px)]" rankClassName="size-[clamp(10px,1.25cqw,24px)]" />
            </MapRewardIcon>}
        {area.unlock && <MapRewardIcon reward={{ name: area.unlock, src: facilityUnlockIcon(area) }} onPreview={onPreview} /> }
      </span>}
      {contents.length > 0 && <span className="flex max-w-full flex-wrap items-center justify-center rounded bg-background/90">
        {contents.map((reward, index) => <MapRewardIcon key={index} reward={{ name: reward.name, src: chestItemIcon(reward), quantity: quantityLabel(reward.min, reward.max) }} onPreview={onPreview} />)}
      </span>}
    </>
  );
}

function RewardDetails({ area }: { area: AreaReward }) {
  const contents = rewards(area);
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold">Area level {area.level} <span className="font-normal text-muted-foreground">· {area.terrain}</span></h3>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted/50 p-3">
          <dt className="flex items-center gap-2 font-semibold">
            {area.chest && <img src={area.chest.icon} alt="" className="h-6 w-6 object-contain [image-rendering:pixelated]" />}
            Area chest
          </dt>
          <dd className="mt-2">
            {area.chest ? <>
              {contents.length > 0 ? <ul className="mt-1 space-y-1">
                {contents.map((reward, index) => <li key={index} className="flex items-center gap-2">
                  <DetailRewardIcon src={chestItemIcon(reward)} />
                  <span>{reward.name} <span className="whitespace-nowrap text-muted-foreground">{quantityLabel(reward.min, reward.max)}{reward.rate === 100 ? "" : ` · ${reward.rate}%`}</span></span>
                </li>)}
              </ul> : <p className="text-muted-foreground">No contents listed.</p>}
            </> : <p className="text-muted-foreground">{area.treasureId < 0 ? "No area chest." : "Chest contents unavailable."}</p>}
          </dd>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <dt className="flex items-center gap-2 font-semibold"><Swords className="h-4 w-4" aria-hidden="true" /> Boss clear</dt>
          <dd className="mt-2 space-y-1">
            {area.bossLevel === undefined ? <p className="text-muted-foreground">No area boss.</p> : <>
              <p className="text-xs text-muted-foreground">{area.boss ?? "Area boss"} · Boss level {area.bossLevel}</p>
              {area.directReward && <p className="flex items-center gap-2">
                {area.directReward === "Town Hall"
                  ? <DetailRewardIcon src={TOWN_HALL_ICON} />
                  : <RecruitArtwork area={area} className="size-7" />}
                {area.directReward}
              </p>}
              {area.unlock && <p className="flex items-center gap-2">
                <DetailRewardIcon src={facilityUnlockIcon(area)} />
                <span>Unlocks {area.unlock}</span>
              </p>}
              {!area.directReward && !area.unlock && <p className="text-muted-foreground">No separate reward listed.</p>}
            </>}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function MapRewardsPage() {
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    const level = new URLSearchParams(window.location.search).get("level") ?? "";
    return /^\d+$/.test(level) ? level : "";
  });
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<{ reward: RewardPreview; left: number; top: number; above: boolean } | null>(null);
  const [expandedArea, setExpandedArea] = useState<AreaReward | null>(null);
  const lastTile = useRef<HTMLButtonElement>(null);

  const showRewardPreview: ShowRewardPreview = (reward, anchor) => {
    if (!reward) {
      setHovered(null);
      return;
    }
    const above = anchor.bottom + 100 > window.innerHeight;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 232));
    setHovered({ reward, left, top: above ? anchor.top - 6 : anchor.bottom + 6, above });
  };

  const hoverActive = hovered !== null;
  useEffect(() => {
    if (!hoverActive) return;
    const dismiss = () => setHovered(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [hoverActive]);

  const tokens = normalize(query).split(" ").filter(Boolean);
  const exactId = query.trim().match(/^#(\d+)$/)?.[1];
  const matching = searchableAreas.filter(({ area, text }) => exactId !== undefined
    ? area.id === Number(exactId)
    : tokens.every(token => /^\d+$/.test(token) ? area.level === Number(token) : text.includes(token)));
  const displayed = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const matchIds = new Set(matching.map(({ area }) => area.id));

  return (
    <div className="w-full space-y-6 px-4 py-5 sm:px-6">
      <PageHeader className="mx-auto w-[min(100%,1152px)]" title="Map Rewards" icon={<Map className="h-5 w-5" />} actions={<Button variant="outline" asChild><a href="#reward-map">Jump to map</a></Button>}>
        <p>See what’s inside each area chest and what defeating the area boss earns or unlocks.</p>
      </PageHeader>

      <section aria-labelledby="reward-lookup" className="mx-auto w-[min(100%,1152px)] space-y-3">
        <h2 id="reward-lookup" className="text-lg font-semibold">Reward lookup</h2>
        <label htmlFor="area-reward-search" className="block text-sm font-medium">Search by area level, reward, boss or terrain</label>
        <div className="relative max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input id="area-reward-search" type="search" value={query} className="pl-9"
            onChange={event => { setQuery(event.target.value); setPage(0); }} />
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {matching.length === 0 ? "No matching areas." : `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + displayed.length} of ${matching.length} areas`}
        </p>
        <div className="grid gap-3 lg:grid-cols-2">{displayed.map(({ area }) => <RewardDetails key={area.id} area={area} />)}</div>
        {matching.length > PAGE_SIZE && <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft aria-hidden="true" /> Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= matching.length} onClick={() => setPage(page + 1)}>Next <ChevronRight aria-hidden="true" /></Button>
        </div>}
      </section>

      <section id="reward-map" aria-labelledby="reward-map-title" className="scroll-mt-20 space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        <div>
          <h2 id="reward-map-title" className="text-lg font-semibold">Rewards map</h2>
          <p className="text-sm text-muted-foreground">
            Boss rewards sit above the chest items. <span className="hidden pointer-fine:inline">Hover over an icon to enlarge it and see its name. </span>Tap or select a tile for details.
            <span className="block md:hidden">Swipe sideways to see the rest of the map.</span>
          </p>
        </div>
        <div className="min-w-0 overflow-x-auto" role="region" aria-label="Scrollable reward tiles" tabIndex={0}>
          <div className="grid min-w-[680px] grid-cols-10 gap-px rounded-md bg-border p-px [container-type:inline-size] sm:gap-0.5">
              {AREA_REWARD_MAP.flatMap((row, y) => row.map(({ area, terrain }, x) => {
                const active = selection?.x === x && selection.y === y;
                const matches = matchIds.has(area.id);
                const tile = SURVEY_TERRAIN_PREVIEW_IMAGES[area.terrainId];
                const tooltip = [
                  area.directReward, area.unlock && `Unlocks ${area.unlock}`,
                  area.chest && `Chest: ${rewards(area).map(item => item.name).join(", ") || area.chest.name}`,
                ].filter(Boolean).join(" · ") || "No reward listed";
                return <button type="button" key={`${x}:${y}`} aria-pressed={active}
                  aria-label={`Level ${area.level} ${terrain ?? area.terrain}, row ${y + 1} column ${x + 1}: ${tooltip}`}
                  onPointerLeave={() => setHovered(null)}
                  onClick={event => {
                    setHovered(null);
                    setSelection({ x, y });
                    lastTile.current = event.currentTarget;
                    setExpandedArea(area);
                  }}
                  className={`relative grid min-h-[clamp(72px,8.3cqw,185px)] min-w-0 content-center justify-items-center gap-[clamp(2px,0.3cqw,6px)] overflow-hidden rounded-sm bg-muted p-0.5 text-center text-[clamp(12px,1.12cqw,24px)] font-bold leading-none focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? "z-10 ring-2 ring-primary" : ""} ${!matches && !active ? "opacity-35" : ""}`}>
                  {tile && <span aria-hidden="true" className="absolute inset-0 bg-cover bg-center opacity-50 [image-rendering:pixelated]" style={{ backgroundImage: `url(${tile})` }} />}
                  <span className="relative rounded bg-background/90 px-0.5">{area.level}</span>
                  <span aria-hidden="true" className="relative flex max-w-full flex-col items-center gap-0.5">
                    <TileRewards area={area} onPreview={showRewardPreview} />
                  </span>
                </button>;
              }))}
          </div>
        </div>
        <Link href="/world-map-v2" className="text-sm text-primary underline underline-offset-2">Open the full world map</Link>
      </section>
      {hovered && createPortal(
        <div aria-hidden="true" className="pointer-events-none fixed z-50 flex w-56 max-w-[calc(100vw-1rem)] items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm font-semibold shadow-xl"
          style={{ left: hovered.left, top: hovered.top, transform: hovered.above ? "translateY(-100%)" : undefined }}>
          {hovered.reward.recruit && <RecruitArtwork area={hovered.reward.recruit} className="size-16" rankClassName="size-4" />}
          {hovered.reward.src && <img src={hovered.reward.src} alt="" className="size-14 shrink-0 object-contain [image-rendering:pixelated]" />}
          <span>
            {hovered.reward.name}
            {hovered.reward.quantity && <span className="ml-1 whitespace-nowrap text-muted-foreground">{hovered.reward.quantity}</span>}
          </span>
        </div>,
        document.body,
      )}
      <Dialog open={expandedArea !== null} onOpenChange={open => { if (!open) setExpandedArea(null); }}>
        <DialogContent aria-describedby={undefined} className="block overflow-y-auto p-2 pt-12"
          onCloseAutoFocus={event => { event.preventDefault(); lastTile.current?.focus({ preventScroll: true }); }}>
          <DialogTitle className="sr-only">Area rewards</DialogTitle>
          {expandedArea && <RewardDetails area={expandedArea} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
