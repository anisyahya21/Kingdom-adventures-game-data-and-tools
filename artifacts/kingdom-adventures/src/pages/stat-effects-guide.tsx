import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ka/page-header";
import { Input } from "@/components/ui/input";
import { localSharedData } from "@/lib/local-shared-data";
import { getStatIcon } from "@/lib/stat-icons";
import { UTILITY_STAT_EFFECTS, freshFogHp, fogPulses, wagonMaterialLoad } from "@/game-data/utility-stat-effects";

const statOrder = ["mov", "hrt", "dex", "int", "gth", "vig"] as const;

function numberOrNull(value: string, min: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : null;
}

export default function StatEffectsGuidePage() {
  const [area, setArea] = useState("100");
  const [heart, setHeart] = useState("100");
  const [move, setMove] = useState("80");
  const [stock, setStock] = useState("100");
  const areaValue = numberOrNull(area, 1);
  const heartValue = numberOrNull(heart, 1);
  const moveValue = numberOrNull(move, 0);
  const stockValue = numberOrNull(stock, 0);
  const hp = areaValue === null ? null : freshFogHp(areaValue);
  const clears = hp === null || heartValue === null ? null : fogPulses(hp, heartValue);
  const load = moveValue === null || stockValue === null ? null : wagonMaterialLoad(moveValue, stockValue);

  return <article className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
    <Link href="/guides" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> All guides
    </Link>
    <PageHeader title="Resident Stats">
      <p>What to train for carrying, clearing fog and working around town.</p>
    </PageHeader>
    <nav aria-label="Stats in this guide" className="mt-6 flex flex-wrap gap-2 border-b pb-6">
      {statOrder.map(key => {
        const stat = UTILITY_STAT_EFFECTS.find(entry => entry.key === key)!;
        return <a key={key} href={`#${key}`} className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium hover:bg-muted">{stat.name}</a>;
      })}
    </nav>

    {statOrder.map(key => {
      const stat = UTILITY_STAT_EFFECTS.find(entry => entry.key === key)!;
      const icon = getStatIcon(localSharedData.statIcons as Record<string, string>, key);
      return <section key={key} id={key} className="scroll-mt-20 border-b py-8 sm:py-10">
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          {icon && <img src={icon} alt="" width={27} height={27} className="h-7 w-7 shrink-0 object-contain" />}
          {stat.name}
        </h2>
        <div className="space-y-4 text-base leading-7">
          <p>{stat.effect}</p>
          <p>{stat.training}</p>

          {key === "mov" && <>
            <div className="border-l-2 border-primary pl-4">
              <p className="font-semibold">1 Move = room for 1 carried unit</p>
              <p>With 200 Move, a wagon can collect 200 units. If the container only holds 80, it brings back 80.</p>
            </div>
            <p>A wagon collects from one container before returning. It does not visit other containers to fill the remaining space. Materials have the same carrying cost; different amounts in storage can explain different-sized loads.</p>
            <p>There is no separate fixed wagon-load cap in this calculation. Once Move is high enough to empty the container, raising it further will not help that pickup.</p>
            <details className="rounded-xl border px-4">
              <summary className="cursor-pointer py-4 font-medium">Check a wagon load</summary>
              <div className="space-y-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-2 text-sm font-medium">Move value<Input type="number" min="0" step="1" value={move} onChange={e => setMove(e.target.value)} /></label>
                  <label className="space-y-2 text-sm font-medium">Units in container<Input type="number" min="0" step="1" value={stock} onChange={e => setStock(e.target.value)} /></label>
                </div>
                <p className="rounded-lg bg-muted p-3" aria-live="polite">{load === null ? "Enter Move and the amount in one container." : <><strong>{load.toLocaleString()} units per pickup.</strong>{moveValue! >= stockValue! ? " This empties the container." : ` ${ (stockValue! - load).toLocaleString()} units remain.`}</>}</p>
              </div>
            </details>
            <details className="rounded-xl border px-4">
              <summary className="cursor-pointer py-4 font-medium">Useful skills for Wagon Yard</summary>
              <div className="space-y-4 pb-4">
                <p>Transport Corps is optional. Residents can use Wagon Yard without it.</p>
                <dl className="space-y-4">
                  <div><dt className="font-medium"><Link href="/skills?search=Transport%20Corps" className="text-primary hover:underline">Transport Corps</Link></dt><dd>Makes wagon travel 50% faster.</dd></div>
                  <div><dt className="font-medium"><Link href="/skills?search=All-Out%20Sprint" className="text-primary hover:underline">All-Out Sprint</Link></dt><dd>Doubles travel speed, including wagon journeys. With Transport Corps, wagon travel is three times as fast.</dd></div>
                  <div><dt className="font-medium"><Link href="/skills?search=Move%20Speed%20UP" className="text-primary hover:underline">Move Speed UP</Link></dt><dd>Adds a flat travel-speed bonus that also works with wagons.</dd></div>
                  <div><dt className="font-medium"><Link href="/skills?search=Insta-Move" className="text-primary hover:underline">Insta-Move</Link></dt><dd>Can teleport on long journeys, including the return trip with a loaded wagon. Uses MP.</dd></div>
                </dl>
              </div>
            </details>
          </>}

          {key === "hrt" && <>
            <p>Fog takes more work to clear in higher-level areas. With 1,000 Heart, a resident can clear ordinary, untouched fog in one action, even in areas at level 500 or above. Lower-level areas need less Heart.</p>
            <p>Heart also helps with surveys, but the amount you need depends on the survey and how many times it has already succeeded.</p>
            <details className="rounded-xl border px-4">
              <summary className="cursor-pointer py-4 font-medium">Check how much Heart you need</summary>
              <div className="space-y-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-2 text-sm font-medium">Area level<Input type="number" min="1" step="1" value={area} onChange={e => setArea(e.target.value)} /></label>
                  <label className="space-y-2 text-sm font-medium">Heart value<Input type="number" min="1" step="1" value={heart} onChange={e => setHeart(e.target.value)} /></label>
                </div>
                <div className="rounded-lg bg-muted p-3" aria-live="polite">{hp === null || clears === null ? <p>Enter a positive area level and Heart value.</p> : <>
                  <p className="font-semibold">{clears.toLocaleString()} {clears === 1 ? "clearing action" : "clearing actions"} needed</p>
                  <p>{clears > 1 ? `${Math.ceil(hp / (clears - 1)).toLocaleString()} Heart would reduce this to ${clears - 1}.` : "More Heart will not clear this fog any faster."}</p>
                  <p className="mt-2 text-sm text-muted-foreground">For one resident clearing untouched fog. Moving to the next tile still takes time.</p>
                </>}</div>
              </div>
            </details>
          </>}
        </div>
      </section>;
    })}
    <p className="py-6 text-sm leading-6 text-muted-foreground">Looking for a particular skill? <Link href="/skills" className="font-medium text-primary hover:underline">Browse the skill database</Link>.</p>
  </article>;
}
