import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ToolIdentityArtwork, getToolArtworkKey } from "./tool-identity";
import type { HomeArtworkStyle, HomeCombatArtwork } from "./home-tool-artwork";

export const TOOL_CARD_SURFACE = "h-full shadow-none transition-colors hover:border-primary/40 hover:bg-muted/20";

export function ToolNavigationCard({ href, title, description, artworkKey = getToolArtworkKey(href), artworkStyle, combatArtwork, layout = "stacked", detail, action, homeCard = false }: {
  href: string; title: string; description: string; artworkKey?: string; artworkStyle?: HomeArtworkStyle; combatArtwork?: HomeCombatArtwork;
  layout?: "stacked" | "row"; detail?: string; action?: string; homeCard?: boolean;
}) {
  return <Link href={href} className="group block min-w-0 rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" data-tool-card data-home-tool={homeCard ? "" : undefined}>
    <Card className={TOOL_CARD_SURFACE}>
      <CardContent className={cn("flex h-full p-4", layout === "row" ? "min-h-28 items-start gap-4" : "min-h-36 flex-col")}>
        {artworkKey && <div className={cn("flex h-10 shrink-0 items-center", layout === "stacked" && "mb-3")} aria-hidden="true"><ToolIdentityArtwork artworkKey={artworkKey} artworkStyle={artworkStyle} combatArtwork={combatArtwork} /></div>}
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">{title}</h3>
          <p className="text-xs leading-snug text-muted-foreground">{description}</p>
          {detail && <p className="mt-3 text-xs text-muted-foreground">{detail}</p>}
        </div>
        {action && <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs font-medium text-primary">{action}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></div>}
      </CardContent>
    </Card>
  </Link>;
}
