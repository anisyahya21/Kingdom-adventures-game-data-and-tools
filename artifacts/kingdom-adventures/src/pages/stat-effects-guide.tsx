import { useState } from "react";
import { Link } from "wouter";
import { BookOpenText } from "lucide-react";
import { PageHeader } from "@/components/ka/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UTILITY_STAT_EFFECTS, freshFogHp, fogPulses, wagonMaterialLoad } from "@/game-data/utility-stat-effects";

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
  const pulses = hp === null || heartValue === null ? null : fogPulses(hp, heartValue);
  const load = moveValue === null || stockValue === null ? null : wagonMaterialLoad(moveValue, stockValue);

  return <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
    <PageHeader icon={<BookOpenText className="w-5 h-5" />} title="Stats outside combat">
      <p>What your residents' stats change during town work, transport and exploration, and when more of a stat stops helping.</p>
    </PageHeader>
    <div className="flex flex-wrap gap-2">
      <Link href="/guides"><Button variant="outline" size="sm">All guides</Button></Link>
      <Link href="/skills"><Button variant="outline" size="sm">Skill database</Button></Link>
      <a href="#heart"><Button variant="outline" size="sm">Heart & fog</Button></a>
      <a href="#move"><Button variant="outline" size="sm">Move & wagons</Button></a>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {UTILITY_STAT_EFFECTS.map(stat => <Card key={stat.key}>
        <CardHeader className="pb-2"><CardTitle className="text-base">{stat.name}</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 leading-relaxed"><p>{stat.effect}</p><p className="text-muted-foreground">{stat.training}</p></CardContent>
      </Card>)}
    </div>
    <Card id="heart" className="scroll-mt-20">
      <CardHeader><CardTitle>Heart & fog: train for fewer pulses</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">
        <p>Each eligible fog tile in range loses HP equal to effective Heart per clearing pulse. The pulse runs every 19 exploration updates. For one worker, with fixed Heart and no other clearing damage:</p>
        <p className="rounded-md bg-muted p-3 font-mono">Pulses = round up(remaining fog HP ÷ Heart)</p>
        <p>Normal fresh fog scales from 100 HP at area level 1 to 1,000 HP at level 500 and above. Therefore 1,000 effective Heart is enough for a one-pulse clear throughout this fog-scaling path. That is a useful ceiling for damage to normal fresh fog, not a cap on Heart. Lower areas and partially cleared fog need less.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">Area level<Input type="number" min="1" step="1" value={area} onChange={e => setArea(e.target.value)} /></label>
          <label className="space-y-1">Effective Heart<Input type="number" min="1" step="1" value={heart} onChange={e => setHeart(e.target.value)} /></label>
        </div>
        <div className="rounded-md bg-muted p-3" aria-live="polite">{hp === null || pulses === null ? "Enter a positive area level and Heart." : <>
          <strong>{hp.toLocaleString()} fog HP · {pulses.toLocaleString()} {pulses === 1 ? "pulse" : "pulses"}</strong>
          <p>{pulses > 1 ? `The next reduction is at ${Math.ceil(hp / (pulses - 1)).toLocaleString()} Heart (${pulses - 1} ${pulses === 2 ? "pulse" : "pulses"}).` : "More Heart cannot reduce this target below one pulse."}</p>
        </>}</div>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">Area level</th><th className="p-2">Fresh fog HP / one-pulse Heart</th></tr></thead><tbody>{[1, 50, 100, 200, 300, 400, 499, 500].map(level => <tr key={level} className="border-b last:border-0"><td className="p-2">{level === 500 ? "500+" : level}</td><td className="p-2">{freshFogHp(level)}</td></tr>)}</tbody></table></div>
        <p><strong>Range is separate.</strong> De-Fogger adds 1 to the job's clearing range. Reaching the next position and waiting for the next pulse can still take time after a one-pulse clear.</p>
        <p><strong>Surveys also use Heart.</strong> Each survey calculates a Heart requirement from its prior success count, then maps your Heart relative to that requirement onto its own success-rate range. The preferred job group adds 20 percentage points, capped at 100%. There is no single Heart target for every survey.</p>
      </CardContent>
    </Card>
    <Card id="move" className="scroll-mt-20">
      <CardHeader><CardTitle>Move & wagons: train for the available load</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">
        <p><strong>1 Move value = capacity for 1 carried unit.</strong> This uses the effective stat value, including applicable equipment, rather than its training level. Wagon Yard works without Transport Corps.</p>
        <p>For eligible cargo, the wagon selects one source storage location and takes:</p>
        <p className="rounded-md bg-muted p-3 font-mono">Load = min(effective Move, selected container's current stock)</p>
        <p>The wagon does not combine stock from several containers to fill unused capacity before returning. Stored items use up to Move matching objects from the same warehouse; coins are limited by the selected deposit. Individual non-stock objects can use a single-object pickup path.</p>
        <p><strong>What one point of Move carries:</strong> one material unit, one coin from a coin-box deposit, or one matching stored item. The inspected pickup paths do not apply different carrying weights to different material types.</p>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">Effective Move</th><th className="p-2">3,000,000 copper coins in a box</th><th className="p-2">300 identical items in one HG storage</th></tr></thead><tbody>{[50, 100, 200, 300, 1000].map(value => <tr key={value} className="border-b last:border-0"><td className="p-2">{value.toLocaleString()}</td><td className="p-2">{value.toLocaleString()} coins</td><td className="p-2">{Math.min(value, 300)} items</td></tr>)}</tbody></table></div>
        <p>Thus Move 100 takes 100 copper coins from that box, leaving 2,999,900, or 100 of those stored items, leaving 200. Move 300 can collect all 300 items in one pickup. Move above 300 adds nothing to that item pickup, but can still increase the coin load.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">Effective Move<Input type="number" min="0" step="1" value={move} onChange={e => setMove(e.target.value)} /></label>
          <label className="space-y-1">Stock in selected material container<Input type="number" min="0" step="1" value={stock} onChange={e => setStock(e.target.value)} /></label>
        </div>
        <div className="rounded-md bg-muted p-3" aria-live="polite">{load === null ? "Enter a non-negative Move and source stock." : <><strong>{load.toLocaleString()} materials in this pickup</strong><p>{moveValue! >= stockValue! ? "More Move adds nothing to this pickup: source stock is the limit." : `Another ${stockValue! - moveValue!} Move would let this pickup take all currently available stock.`}</p></>}</div>
        <p><strong>No extra fixed load cap was found in this pickup path.</strong> The useful target is the largest per-container load your task regularly offers. Fragmented or depleted stock lowers that target. Receiving storage and collection can also limit deliveries.</p>
        <p>The carrying rule does not make every resource transportable. Energy cannot be transported by Wagon Yard. For eligible cargo, use the actual selected container's stock and capacity for your target.</p>
        <p>Different available stock can produce different loads: with Move 300, a source holding 100 Wood gives 100 Wood, while a warehouse holding 300 matching items gives 300 items. Extra Move cannot supply stock that is not there.</p>
        <p>More cargo can reduce trips, but once Move exceeds the available load, improve travel and source availability. Doubling travel speed does not double a full cycle that also includes work, waiting and drop-off.</p>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">Skill</th><th className="p-2">Wagon benefit</th></tr></thead><tbody>
          <tr className="border-b"><td className="p-2"><Link href="/skills?search=Transport%20Corps" className="text-primary">Transport Corps</Link></td><td className="p-2">Travel speed ×1.5.</td></tr>
          <tr className="border-b"><td className="p-2"><Link href="/skills?search=All-Out%20Sprint" className="text-primary">All-Out Sprint</Link></td><td className="p-2">Travel speed ×2; bypasses the empty-Vigor half-speed branch.</td></tr>
          <tr className="border-b"><td className="p-2"><Link href="/skills?search=Move%20Speed%20UP" className="text-primary">Move Speed UP</Link></td><td className="p-2">Adds 1 internal speed unit after multipliers.</td></tr>
          <tr><td className="p-2"><Link href="/skills?search=Insta-Move" className="text-primary">Insta-Move</Link></td><td className="p-2">Can teleport at route starts at least 35 Manhattan cells away, including loaded returns. Requires MP and activation success.</td></tr>
        </tbody></table></div>
        <p>Transport Corps and All-Out Sprint combine to ×3 travel speed in the ordinary cart branch. Terrain, vehicles and the separate global speed boost can change the final speed.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Other stats and the limits of this guide</CardTitle></CardHeader>
      <CardContent className="text-sm space-y-2 leading-relaxed">
        <p>HP supports survival; MP funds active skills, including instant work and teleportation. Those skills scale human MP costs by average stat <em>levels</em>, not current stat values or a percentage of maximum MP.</p>
        <p>Attack, Defense, combat Speed and Luck retain their combat roles. No independent wagon-load or fog-damage bonus from them is established in the inspected paths. Combat Speed is not the walking-speed stat. Dexterity and Intelligence have both combat and work uses.</p>
        <p className="text-muted-foreground">Based on game code and in-game data. Some effects still need investigation, including Well-Prepared and its possible role before area challenges. Complete wagon-trip timing has not been measured. Listed limits apply to the named action, not every possible use of a stat.</p>
      </CardContent>
    </Card>
  </div>;
}
