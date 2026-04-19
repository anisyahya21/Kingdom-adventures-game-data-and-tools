import { Link } from "wouter";
import { BookMarked, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const GUIDE_CARDS = [
  {
    href: "/playthrough-guide",
    title: "Playthrough Guide by Jaza",
    description: "Website-styled version of the community progression guide, with site links layered on top.",
    badge: "Guide",
    note: "Community guide",
  },
  {
    href: "/add-guide",
    title: "Add your own guide",
    description: "Create and submit your own community guide for Kingdom Adventures!",
    badge: "Submit",
    note: "Contribute a guide",
  },
];

export default function GuidesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Guides</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Community-written guides collected in one place so we can add more over time.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {GUIDE_CARDS.map((guide) => (
          <Link key={guide.href} href={guide.href}>
            <Card className="h-full cursor-pointer shadow-sm transition-all hover:shadow-md hover:border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <BookMarked className="w-5 h-5 text-primary" />
                  </div>
                  <Badge variant="outline">{guide.badge}</Badge>
                </div>
                <CardTitle className="text-base mt-2">{guide.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <CardDescription className="text-xs leading-relaxed">{guide.description}</CardDescription>
                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ExternalLink className="w-3 h-3" />
                  {guide.note}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
