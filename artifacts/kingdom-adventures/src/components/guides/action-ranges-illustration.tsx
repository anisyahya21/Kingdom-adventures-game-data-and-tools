import { getJobRangeValue, type JobRangeIndex } from "@/game-data/job-profile";

type Point = { x: number; y: number };
type Comparison = {
  label: string;
  index: JobRangeIndex;
  smaller: string;
  larger: string;
  takeaway: string;
};
const rank = "A";
// Each selected pair differs in this range only; the other two ranges match.
const comparisons: Comparison[] = [
  {
    label: "Deployment range", index: 1, smaller: "Guard", larger: "Champion",
    takeaway: "Champion covers over twice the area; Guard offers a tighter deployment near map edges.",
  },
  {
    label: "Searching range", index: 0, smaller: "Knight", larger: "Gunner",
    takeaway: "Gunner can spot monsters farther away; Knight keeps its search closer when farming beside other allies.",
  },
  {
    label: "Defog AoE", index: 2, smaller: "Guard", larger: "Pirate",
    takeaway: "Pirate can reach fog up to 3 tiles away. Guard can reach it 1 tile away.",
  },
];
const distance = ({ x, y }: Point) => Math.abs(x) + Math.abs(y);
const tileCount = (reach: number) => 1 + 2 * reach * (reach + 1);
// Native GetRange: Manhattan distance < stat. Normal SearchAndBattle:
// distance <= base searching stat + 1. These are base footprints, not combat reach.
const reachFor = (value: number, index: JobRangeIndex) => index === 0 ? value + 1 : value - 1;

function RangeFootprints({ comparison, smaller, larger }: { comparison: Comparison; smaller: number; larger: number }) {
  const smallReach = reachFor(smaller, comparison.index);
  const largeReach = reachFor(larger, comparison.index);
  const size = 2 * largeReach + 1;
  const unit = 240 / size;
  const cells = Array.from({ length: size * size }, (_, i) => ({ x: i % size - largeReach, y: Math.floor(i / size) - largeReach }))
    .filter(c => distance(c) <= largeReach);
  const pathFor = (reach: number) => cells.filter(c => distance(c) <= reach).flatMap(c => {
    const x = (c.x + largeReach) * unit + 10;
    const y = (c.y + largeReach) * unit + 10;
    return [
      distance({ x: c.x, y: c.y - 1 }) > reach ? `M${x},${y}h${unit}` : "",
      distance({ x: c.x + 1, y: c.y }) > reach ? `M${x + unit},${y}v${unit}` : "",
      distance({ x: c.x, y: c.y + 1 }) > reach ? `M${x},${y + unit}h${unit}` : "",
      distance({ x: c.x - 1, y: c.y }) > reach ? `M${x},${y}v${unit}` : "",
    ];
  }).join(" ");
  return <svg viewBox="0 0 260 260" className="mx-auto block w-full max-w-[12rem] sm:max-w-[15rem]" role="img"
    aria-label={`A-rank ${comparison.label}: ${comparison.smaller}, range ${smaller}, covers ${tileCount(smallReach)} tiles; ${comparison.larger}, range ${larger}, covers ${tileCount(largeReach)} tiles. Both are drawn from the same position at the same scale. The outer band is the additional area of ${comparison.larger}.`}>
    {cells.map(c => <rect key={`${c.x},${c.y}`} x={(c.x + largeReach) * unit + 10} y={(c.y + largeReach) * unit + 10} width={unit} height={unit}
      className={`${distance(c) <= smallReach ? "fill-sky-500/25" : "fill-amber-500/20"} stroke-background/60`} strokeWidth="0.7" />)}
    <path d={pathFor(largeReach)} className="stroke-amber-700 dark:stroke-amber-300" strokeDasharray="4 2" fill="none" strokeWidth="1.8" />
    <path d={pathFor(smallReach)} className="stroke-sky-700 dark:stroke-sky-300" fill="none" strokeWidth="2" />
    <circle cx="130" cy="130" r="3" className="fill-foreground" />
  </svg>;
}

export function ActionRangesIllustration() {
  return <figure data-action-ranges className="overflow-hidden rounded-xl border border-border bg-card">
    <figcaption className="px-4 pt-4 sm:px-5">
      <h3 className="text-base font-semibold">Same rank, different reach</h3>
      <p className="mt-1 text-sm text-muted-foreground">All jobs below are A rank. Each pair isolates one range; their other two ranges are the same.</p>
    </figcaption>
    <div className="divide-y divide-border px-4 sm:px-5">
      {comparisons.map(comparison => {
        const smaller = getJobRangeValue(comparison.smaller, rank, comparison.index);
        const larger = getJobRangeValue(comparison.larger, rank, comparison.index);
        if (smaller === null || larger === null) return null;
        const smallTiles = tileCount(reachFor(smaller, comparison.index));
        const largeTiles = tileCount(reachFor(larger, comparison.index));
        return <div key={comparison.index} data-range-comparison={comparison.index} className="grid items-center gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_15rem] sm:gap-6">
          <div className="text-sm">
            <h4 className="text-base font-semibold">{comparison.label}</h4>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div className="border-l-[3px] border-sky-700 pl-3 dark:border-sky-300">
                <dt className="font-semibold">{comparison.smaller} <span className="font-normal text-muted-foreground">· A rank</span></dt>
                <dd>Range <strong>{smaller}</strong> <span className="text-muted-foreground">· {smallTiles} {comparison.index === 2 ? "tiles in reach" : "tiles"}</span></dd>
              </div>
              <div className="border-l-[3px] border-dashed border-amber-700 pl-3 dark:border-amber-300">
                <dt className="font-semibold">{comparison.larger} <span className="font-normal text-muted-foreground">· A rank</span></dt>
                <dd>Range <strong>{larger}</strong> <span className="text-muted-foreground">· {largeTiles} {comparison.index === 2 ? "tiles in reach" : "tiles"}</span></dd>
              </div>
            </dl>
            <p className="mt-3">{comparison.takeaway}</p>
          </div>
          <div>
            <RangeFootprints comparison={comparison} smaller={smaller} larger={larger} />
            <p className="mt-1 text-center text-sm font-medium">{largeTiles - smallTiles} additional tiles in the outer band</p>
          </div>
        </div>;
      })}
    </div>
    <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">Within each pair, both areas share the same centre and tile scale. The outer outline includes the inner area. Tile counts show the full base footprint, not how many monsters are present or how much fog remains.</p>
  </figure>;
}
