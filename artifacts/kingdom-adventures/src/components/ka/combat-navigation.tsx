import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

const sections = [
  { href: "/combat/character-builder", label: "Character Builder" },
  { href: "/combat/multi-box", label: "Multi-Box Farming" },
  { href: "/combat/formulas", label: "Combat Formulas" },
];

export function CombatNavigation() {
  const [location] = useLocation();
  return <div className="mx-auto max-w-7xl space-y-3 px-4 pt-5">
    <Link href="/combat" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Combat Hub</Link>
    <nav aria-label="Combat tools" className="grid grid-cols-3 gap-1 border-b border-border pb-3 sm:flex">
      {sections.map(({ href, label }) => <Link key={href} href={href} aria-current={location.startsWith(href) ? "page" : undefined} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm ${location.startsWith(href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</Link>)}
    </nav>
  </div>;
}
