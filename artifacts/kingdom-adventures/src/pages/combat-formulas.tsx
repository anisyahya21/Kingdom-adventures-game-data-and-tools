import { useState } from "react";

import { BookOpen, Crosshair, Flame, MoveRight, Sparkles, Swords, Gauge, Zap } from "lucide-react";

import { CombatNavigation } from "@/components/ka/combat-navigation";

import { PageHeader } from "@/components/ka/page-header";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";

import { COMBAT_SPEED_BRACKETS } from "@/lib/combat-speed-brackets";

import { ARROW_SKILLS, damageExample, MAGIC_TIER_ROWS, projectileFootprint, SKILL_ACTIVATION_RATES, ARMOR_BREAKER_TIERS, ARMOR_BREAKER_DURATION_BRACKETS, STATUS_DURATION_TICKS, DEFENSIVE_REACTION_SKILLS } from "@/game-data/combat-mechanics";



function Footprint({ size }: { size: number }) {

  const points = projectileFootprint(size);

  return <div className="grid h-36 w-36 grid-cols-5 grid-rows-5 gap-1" role="img" aria-label={`${points.length} cells in a diamond, centered on the target`}>

    {Array.from({ length: 25 }, (_, i) => { const x = i % 5 - 2; const y = Math.floor(i / 5) - 2; const active = points.some((point) => point.x === x && point.y === y); return <span key={i} className={`flex items-center justify-center rounded border ${x === 0 && y === 0 ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary/30 bg-primary/15" : "border-border/50 bg-muted/20"}`}>{x === 0 && y === 0 ? <Crosshair className="h-4 w-4" /> : null}</span>; })}

  </div>;

}



export default function CombatFormulasPage() {

  const [section, setSection] = useState("damage");

  const [offense, setOffense] = useState("1000");

  const [defense, setDefense] = useState("500");

  const [critical, setCritical] = useState(false);

  const [tier, setTier] = useState(3);

  const [speed, setSpeed] = useState("315");

  const [showAllBrackets, setShowAllBrackets] = useState(false);

  const speedValue = speed.trim() === "" ? null : Math.max(1, Math.min(99999, Number(speed) || 1));

  const bracketIndex = speedValue === null ? -1 : COMBAT_SPEED_BRACKETS.findIndex((row) => speedValue >= row.min && (row.max === null || speedValue <= row.max));

  const bracket = COMBAT_SPEED_BRACKETS[bracketIndex];

  // Charging begins acting only after the interval is exceeded: interval + 1 ticks from an empty gauge.

  const visibleBrackets = COMBAT_SPEED_BRACKETS.filter((row, index) => row.min <= 99999 && (showAllBrackets || Math.abs(index - bracketIndex) <= 3));

  const example = damageExample(Number(offense) || 0, Number(defense) || 0, critical);

  const spell = MAGIC_TIER_ROWS[tier];

  return <>

    <CombatNavigation />

    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">

      <PageHeader icon={<BookOpen className="h-5 w-5 text-primary" />} title="Combat Formulas"><p>A practical guide to damage, skills, and getting more from your stats.</p></PageHeader>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Combat mechanics">

        {[{ id: "damage", label: "Damage", icon: Swords }, { id: "magic", label: "Magic", icon: Flame }, { id: "arrows", label: "Arrows", icon: MoveRight }, { id: "targeting", label: "Targeting", icon: Crosshair }, { id: "activation", label: "Skill Activation", icon: Zap }, { id: "speed", label: "Speed Brackets", icon: Gauge }].map(({ id, label, icon: Icon }) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={section === id} aria-controls={`panel-${id}`} onClick={() => setSection(id)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium sm:px-4 sm:text-sm ${section === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}><Icon className="h-4 w-4" />{label}</button>)}

      </div>

      <div role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`}>

        {section === "damage" && <article className="max-w-4xl space-y-8 rounded-xl border bg-card p-5 text-sm leading-7 sm:p-8">

          <section className="space-y-3"><h2 className="text-xl font-semibold tracking-tight">How damage works</h2><p>Stronger attacks deal more damage. Defense reduces the damage taken. The game adds some variation to every hit, so the same attack will not always show the same number.</p>

            <div className="grid gap-3 pt-1 sm:grid-cols-2"><div className="rounded-lg bg-muted/40 p-4"><Swords className="mb-2 h-5 w-5 text-primary" /><h3 className="font-semibold">Physical damage uses ATK</h3><p className="mt-1 text-muted-foreground">Normal attacks, Myriad Arrows, and Arrow Rain use your final Attack stat.</p></div><div className="rounded-lg bg-muted/40 p-4"><Sparkles className="mb-2 h-5 w-5 text-primary" /><h3 className="font-semibold">Magic damage uses INT</h3><p className="mt-1 text-muted-foreground">Fire, Ice, and Lightning use Intelligence instead of Attack. The enemy’s Defense still reduces the damage.</p></div></div>

          </section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">What each combat stat changes</h2><div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-2 pr-5">Stat</th><th className="py-2">Effect in combat</th></tr></thead><tbody>{[

            ["ATK", "Raises physical damage. It does not raise Fire, Ice, or Lightning damage."],

            ["INT", "Raises magic damage. It does not add to ATK for physical attacks."],

            ["DEF", "Reduces incoming physical and magic damage."],

            ["DEX", "Helps attacks land. More accuracy is useful when enemies dodge your hits."],

            ["LCK", "Raises critical-hit chance and also helps avoid ordinary hits."],

            ["SPD", "Shortens the wait to act and also helps avoid ordinary hits. Its effect on charging has breakpoints."],


            ["MP", "Pays for skills. Each skill’s cost scales with the character’s average stat level."],

          ].map(([stat, effect]) => <tr key={stat} className="border-b last:border-0"><th className="py-3 pr-5 align-top font-semibold">{stat}</th><td className="py-3 text-muted-foreground">{effect}</td></tr>)}</tbody></table></div></section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">How skill MP costs are calculated</h2><p>Each skill has a minimum and maximum MP cost. For human characters, the cost rises evenly between those limits as the <strong>average of all 12 stat training levels</strong> increases. An average level of 1 uses the minimum; an average of 999 reaches the maximum.</p><p>The average level and the resulting MP cost are rounded down. Equipment stat bonuses do not count toward that average.</p><div className="rounded-lg bg-muted/40 p-4"><h3 className="font-semibold">Example: Myriad Arrows</h3><p className="mt-1">Its cost ranges from <strong>10 to 120 MP</strong>. At average stat level 1 it costs 10 MP; at 500 it costs 65 MP; at 999 it costs 120 MP. This pays for all three volleys.</p></div><p>Monsters pay the skill’s minimum MP cost.</p></section>
          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">Landing a hit and dealing damage are separate</h2><p>A high ATK value is no help if the attack misses. DEX helps your accuracy, while the defender’s SPD and LCK make ordinary hits harder to land. Each hit of a multi-hit skill gets its own checks.</p><p>A critical hit passes the ordinary accuracy check and uses only one eighth of the target’s Defense when calculating damage. Criticals therefore make a bigger difference against enemies with high DEF.</p></section>

          <section className="space-y-3 border-t pt-6">
            <h2 className="text-lg font-semibold">Minimum damage</h2>
            <p>The game calculates damage first. If the result is <strong>5 or less</strong>, it replaces it with a random number from <strong>1 to 10</strong>.</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Calculated damage <strong>2</strong> → deal <strong>1–10</strong>.</li>
              <li>Increasing ATK raises calculated damage to <strong>4</strong> → still deal <strong>1–10</strong>.</li>
              <li>Increasing ATK raises calculated damage to <strong>20</strong> → deal <strong>20</strong>.</li>
            </ul>
            <p>So a small ATK increase can have little effect against very high DEF.</p>
          </section>
          <section className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold">Armor Breaker</h2>
            <p>Armor Breaker lowers the target’s DEF, increasing the damage they take from physical attacks and magic.</p>
            <div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Skill</th><th className="py-3 pr-4">DEF reduction</th><th className="py-3">1,000 DEF becomes</th></tr></thead><tbody>{ARMOR_BREAKER_TIERS.map((skill) => <tr key={skill.id} className="border-b last:border-0"><th className="py-3 pr-4 font-medium">{skill.nameText.replace("<0>", skill.nameArg)}</th><td className="py-3 pr-4">{skill.value}%</td><td className="py-3">{1000 - skill.value * 10}</td></tr>)}</tbody></table></div>
            <h3 className="pt-2 font-semibold">The caster’s INT determines how long it lasts</h3>
            <p>Higher INT gives Armor Breaker a longer duration. The skill tier controls the DEF reduction; the caster’s INT controls the duration.</p>
            <div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Caster INT</th><th className="py-3">Duration without incoming hits</th></tr></thead><tbody>{ARMOR_BREAKER_DURATION_BRACKETS.map((row) => <tr key={row.minInt} className="border-b last:border-0"><th className="py-3 pr-4 font-medium">{row.maxInt === null ? `${row.minInt.toLocaleString()}+` : `${row.minInt.toLocaleString()}–${row.maxInt.toLocaleString()}`}</th><td className="py-3">{row.duration * STATUS_DURATION_TICKS} ticks</td></tr>)}</tbody></table></div>
            <h3 className="pt-2 font-semibold">How time and hits shorten the effect</h3>
            <p>A tick is one update of the battle. Ticks keep passing while the fight runs, even when nobody attacks. A duration of 60 ticks means the effect lasts for 60 battle updates, unless incoming hits end it sooner.</p>
            <p>Each incoming attack that passes its hit check cuts {STATUS_DURATION_TICKS} ticks off the remaining duration, or ends the effect immediately if less time remains. The hit that ends it still benefits from the reduced DEF.</p>
            <div className="rounded-lg bg-muted/40 p-4">
              <h4 className="font-semibold">Example: a caster with 500 INT</h4>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                <li>Armor Breaker starts with a maximum duration of <strong>60 ticks</strong>.</li>
                <li>After <strong>20 battle updates</strong>, <strong>40 ticks</strong> remain if no incoming attack has passed its hit check.</li>
                <li>A successful incoming hit check at that point removes another 20 ticks, leaving <strong>20 ticks</strong>.</li>
                <li>Another successful hit check ends the effect immediately. Otherwise, it ends after the remaining 20 ticks.</li>
              </ul>
            </div>
          </section>
          <section className="space-y-3 border-t pt-6">
            <h2 className="text-lg font-semibold">Defensive skills</h2>
            <p>When it activates, <strong>Parry halves incoming damage</strong>, rounded down, with a minimum of 1 damage. Half Reflect returns 50% of the incoming damage to the attacker; Full Reflect returns 100%.</p>
            <p><strong>Full Reflect does not stop you taking damage.</strong> Both Reflect skills leave the original incoming damage unchanged.</p>
            <h3 className="pt-2 font-semibold">Example: an incoming hit of 1,000 damage</h3>
            <div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Activated skill</th><th className="py-3 pr-4">Effect</th><th className="py-3 pr-4">You take</th><th className="py-3">Attacker takes</th></tr></thead><tbody>{DEFENSIVE_REACTION_SKILLS.map((skill) => <tr key={skill.id} className="border-b last:border-0"><th className="py-3 pr-4 font-medium">{skill.nameText}</th><td className="py-3 pr-4">{skill.type === 21 ? `${skill.value}% damage taken` : `${skill.value}% reflected`}</td><td className="py-3 pr-4">{(skill.type === 21 ? Math.max(1, Math.trunc(1000 * skill.value / 100)) : 1000).toLocaleString()}</td><td className="py-3">{(skill.type === 18 ? Math.max(1, Math.trunc(1000 * skill.value / 100)) : 0).toLocaleString()}</td></tr>)}</tbody></table></div>
            <p>Perfect Dodge can prevent a hit when it activates.</p>
          </section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">How much damage does Myriad Arrows deal?</h2><p>Each arrow uses your <strong>final ATK against the enemy’s DEF</strong>, with the same physical damage calculation used for a normal hit. Myriad Arrows is an AoE three-hit attack: each of its three volleys covers the target cell and its four neighbors.</p><p>A stationary enemy in the center can be hit once by each of the three volleys. If an ordinary hit would deal around <strong>600 damage</strong>, three similar hits would deal around <strong>1,800 in total</strong>. Misses, criticals, movement, and defensive skills can change that total.</p></section>

          <details className="rounded-lg border px-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Try a simple damage example</summary><div className="space-y-4 pb-5"><p className="text-muted-foreground">An illustrative hit using a typical attack and defense roll. Actual hits vary.</p><div className="grid grid-cols-2 gap-3"><label className="space-y-1 font-medium">Your ATK or INT<Input aria-label="Your ATK or INT" type="number" inputMode="numeric" min="0" max="100000" value={offense} onChange={(event) => setOffense(event.target.value)} onBlur={() => setOffense(String(Math.max(0, Math.min(100000, Math.trunc(Number(offense) || 0)))))} /></label><label className="space-y-1 font-medium">Enemy DEF<Input aria-label="Enemy DEF" type="number" inputMode="numeric" min="0" max="100000" value={defense} onChange={(event) => setDefense(event.target.value)} onBlur={() => setDefense(String(Math.max(0, Math.min(100000, Math.trunc(Number(defense) || 0)))))} /></label></div><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-primary" checked={critical} onChange={(event) => setCritical(event.target.checked)} />Critical hit</label><p aria-live="polite" className="rounded-lg bg-primary/10 p-4 text-base font-medium">About <strong className="text-primary">{example.damage}</strong> damage on this hit.</p></div></details>

        </article>}

        {section === "magic" && <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">

          <Card><CardHeader><CardTitle className="text-lg">Fire, Ice & Lightning</CardTitle><p className="text-sm leading-6 text-muted-foreground">Fire, Ice, and Lightning deal the same damage at matching tiers. Choose between their visual effects; these spells do not add burning, freezing, stun, or chain lightning.</p></CardHeader><CardContent className="space-y-5">

            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Magic tier comparison for all three elements</caption><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-3">Tier</th><th className="p-3">Reach</th><th className="p-3">Cells</th><th className="py-3 pl-3">MP cost</th></tr></thead><tbody>{MAGIC_TIER_ROWS.map((row, index) => <tr key={row.id} className={`border-b last:border-0 ${index === tier ? "bg-primary/5" : ""}`}><th className="py-3"><button className="min-h-11 min-w-11 rounded hover:bg-muted" onClick={() => setTier(index)} aria-label={`Show magic tier ${row.tier}`}>{row.tier}</button></th><td className="p-3">{row.shootingRange}</td><td className="p-3">{row.cells}</td><td className="py-3 pl-3 whitespace-nowrap">{row.minMp}–{row.maxMp}</td></tr>)}</tbody></table></div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-semibold">IV and V have the same damage per hit and footprint.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">V reaches one cell farther and costs more MP. If the nearest enemy is already within 5, both choose the same target from the same position.</p></div>

            <p className="text-xs leading-5 text-muted-foreground">Human MP costs scale with average stat training levels. Monsters pay the lower listed cost.</p>

          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-lg">See the spell footprint</CardTitle></CardHeader><CardContent className="space-y-6"><div className="flex flex-wrap gap-2">{MAGIC_TIER_ROWS.map((row, index) => <button key={row.id} aria-pressed={index === tier} onClick={() => setTier(index)} className={`min-h-11 min-w-11 rounded-lg border text-sm ${index === tier ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{row.tier}</button>)}</div><div className="flex justify-center py-4"><Footprint size={spell.range} /></div><div className="text-center"><p className="text-lg font-semibold">{spell.cells} cells · one volley</p><p className="mt-2 text-sm leading-6 text-muted-foreground">One projectile per cell. The crosshair is the target position. Empty cells still receive a projectile.</p></div><p className="rounded-lg bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">A larger area can catch more enemies. It does not hit one stationary enemy 13 times: each projectile hits whoever is in its landing cell.</p></CardContent></Card>

        </div>}

        {section === "arrows" && <div className="grid gap-5 md:grid-cols-2">{ARROW_SKILLS.map((skill) => <Card key={skill.id}><CardHeader><CardTitle className="text-lg">{skill.nameText}</CardTitle><Badge variant="secondary" className="w-fit">Bow required · Physical damage</Badge></CardHeader><CardContent className="space-y-5"><div className="flex justify-center"><Footprint size={skill.range} /></div><div className="grid grid-cols-2 gap-3">{[["Targeting range", skill.shootingRange], ["Volleys", skill.count], ["Arrows per volley", projectileFootprint(skill.range).length], ["MP cost", `${skill.minMp}–${skill.maxMp}`]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div><p className="text-sm leading-6 text-muted-foreground">{skill.id === 36 ? "Three volleys cover the target and its four neighboring cells. Each arrow uses ATK against DEF, like a normal physical hit. A stationary enemy in the center can take three hits. For example, three hits of about 600 damage give about 1,800 total. MP is paid once for the whole skill." : "Fires one projectile at one cell, despite the name suggesting a shower of arrows. The hit uses ATK against DEF, like a normal physical hit."}</p></CardContent></Card>)}</div>}

        {section === "targeting" && <Card><CardHeader><CardTitle className="text-lg">Nearest enemy, not best area coverage</CardTitle></CardHeader><CardContent className="space-y-6"><ol className="space-y-4 text-sm leading-6">{["Consider enemies with positive HP inside the spell’s acquisition range.", "Measure grid distance: horizontal distance + vertical distance.", "Choose the nearest. Equal distances keep the first enemy in the game’s enumeration order.", "Center the projectile footprint on the chosen target’s position when the volley is released."].map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">{index + 1}</span><span>{step}</span></li>)}</ol><div><div className="rounded-xl bg-muted/40 p-5"><h2 className="font-medium">Do spells aim for the front line?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Usually, because it is closest. Magic has no explicit front-line-only selection rule. It does not search for the center that would hit the most enemies.</p></div></div><p className="border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">A projectile hits whoever is in its landing cell. If the selected enemy moves away, it may miss them or hit someone else instead.</p></CardContent></Card>}

        {section === "activation" && <article className="max-w-4xl space-y-8 rounded-xl border bg-card p-5 text-sm leading-7 sm:p-8">

          <section className="space-y-3"><h2 className="text-xl font-semibold tracking-tight">How skills activate</h2><p>Equipping a skill makes it available. It does not guarantee that the character uses it every time they act. A skill needs a suitable target, enough MP, and any required weapon before it can be chosen.</p><p>The <strong>High, Normal, and Low</strong> settings change the chance of activation. They do not change damage, area, or how many hits the skill produces.</p></section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">Activation chances</h2><p>Healing and revival have higher activation chances than attack skills. These are the chances when an eligible skill is checked.</p><div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-3">Skill type</th><th className="p-3">High</th><th className="p-3">Normal</th><th className="py-3 pl-3">Low</th></tr></thead><tbody>{SKILL_ACTIVATION_RATES.map((row) => <tr key={row.name} className="border-b last:border-0"><th className="py-3 pr-3 font-medium">{row.name}</th><td className="p-3">{row.high}%</td><td className="p-3">{row.normal}%</td><td className="py-3 pl-3">{row.low}%</td></tr>)}</tbody></table></div><p className="text-muted-foreground">A 36% chance does not mean 36% of all attacks will use that skill. It may be out of range, lack MP, or lose priority to another skill.</p></section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">Skill order matters</h2><p>The character considers revival first, then healing, then attack skills. Within each group, earlier equipped skills get checked first. The first successful activation is chosen.</p><div className="rounded-lg bg-muted/40 p-4"><h3 className="font-semibold">Example: two attack skills set to High</h3><p className="mt-1">The first skill gets its chance first. If it activates, the second is not checked for that choice. Moving a skill higher in the list can therefore make it appear more often without changing its activation setting.</p></div><p>A healer needs a wounded ally for healing and a defeated ally for revival. An attack skill needs an enemy it can reach. A high activation setting cannot bypass these requirements.</p></section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">Reactive and passive skills</h2><p>Reactive skills, such as Counter, are checked in response to combat events rather than competing with ordinary attack skills in the same way. Permanently active skills apply their effects without a normal cast. Some skills have a guaranteed trigger once their requirements are met.</p><p>For a multi-hit skill, activation starts the sequence. Each hit does not need to win a new activation roll, and MP is normally paid once at the start. The individual hits still need to connect.</p></section>

        </article>}

        {section === "speed" && <article className="max-w-4xl space-y-8 rounded-xl border bg-card p-5 text-sm leading-7 sm:p-8">

          <section className="space-y-3"><h2 className="text-xl font-semibold tracking-tight">When more Speed makes you faster</h2><p>SPD shortens the time a character spends charging before an action. That wait is counted in whole steps, so several neighboring SPD values can produce the same charge time. These groups are called <strong>speed brackets</strong>.</p><p>For example, <strong>315 and 399 SPD share a charge bracket</strong>. Reaching <strong>400 SPD</strong> shortens the wait by another step. When choosing gear, a breakpoint can be more useful than a small SPD increase that stays inside the same bracket.</p></section>

          <section className="space-y-4 border-t pt-6"><h2 className="text-lg font-semibold">Your attack timing</h2><label className="flex max-w-sm flex-wrap items-center gap-3 font-medium">Your final SPD<Input aria-label="Your final SPD" className="w-32" inputMode="numeric" type="number" min="1" max="99999" value={speed} onChange={(event) => setSpeed(event.target.value)} onBlur={() => { if (speed.trim() !== "") setSpeed(String(Math.max(1, Math.min(99999, Math.trunc(Number(speed) || 1))))); }} /></label>

            <div className="rounded-lg bg-primary/10 p-4" aria-live="polite">{bracket ? <><p className="text-base font-semibold">Your bracket: {bracket.min === 0 ? "1" : bracket.min.toLocaleString()}–{Math.min(99999, bracket.max ?? 99999).toLocaleString()} SPD</p><p className="mt-1">Attack charge: <strong>{bracket.attackFrames + 1} ticks</strong></p></> : <p>Enter your SPD to see its bracket and attack charge time.</p>}</div>

            <div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-3 pr-4">SPD range</th><th className="py-3">Attack charge (ticks)</th></tr></thead><tbody>{visibleBrackets.map((row) => { return <tr key={row.value} className={`border-b last:border-0 ${row === bracket ? "bg-primary/5" : ""}`}><th className="py-3 pr-4 font-medium">{row.min === 0 ? "1" : row.min.toLocaleString()}–{Math.min(99999, row.max ?? 99999).toLocaleString()}{row === bracket && <span className="ml-2 text-xs text-primary">Your bracket</span>}</th><td className="py-3 text-muted-foreground">{row.attackFrames + 1}</td></tr>; })}</tbody></table></div><button type="button" className="min-h-11 text-sm font-medium text-primary hover:underline" onClick={() => setShowAllBrackets((previous) => !previous)}>{showAllBrackets ? "Show nearby brackets" : "Show all speed brackets"}</button>

          </section>

          <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-semibold">What else affects attack speed</h2><p>The ticks above measure charging from an empty attack gauge. Moving into range, attack animations, and reactions to incoming hits can add time to the full attack cycle.</p><p>SPD also helps avoid ordinary hits, so extra points can still have a use even when they do not cross a charge breakpoint.</p></section>

        </article>}

      </div>



    </div>

  </>;

}
