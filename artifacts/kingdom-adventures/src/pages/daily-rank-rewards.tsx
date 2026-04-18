import { Award, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DAILY_RANK_REWARD_DRAFTS } from "@/lib/en-event-drafts";

const COLUMNS = [
  { key: "weapon", label: "Weapon" },
  { key: "armor", label: "Armor" },
  { key: "shield", label: "Shield" },
  { key: "overallItem1", label: "Overall Item 1" },
  { key: "overallItem2", label: "Overall Item 2" },
  { key: "ticket", label: "Ticket" },
  { key: "skill", label: "Skill" },
] as const;

export default function DailyRankRewardsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Daily Rank Rewards</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          First-draft daily ranking board rewards by weekday, showing the current community-understood S and A rank payouts.
        </p>
      </div>

      <div className="grid gap-4">
        {DAILY_RANK_REWARD_DRAFTS.map((entry) => (
          <Card key={entry.day} className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    {entry.day}
                  </CardTitle>
                  <CardDescription>S and A ranking board rewards for this weekday.</CardDescription>
                </div>
                <div className="flex gap-2">
                  {entry.rewards.map((reward) => (
                    <Badge key={reward.rank} variant="outline">
                      Rank {reward.rank}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden lg:grid lg:grid-cols-[100px_repeat(7,minmax(0,1fr))] gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div>Rank</div>
                {COLUMNS.map((column) => (
                  <div key={column.key}>{column.label}</div>
                ))}
              </div>
              <div className="space-y-3">
                {entry.rewards.map((reward) => (
                  <div key={reward.rank} className="rounded-lg border border-border/60 bg-card/60 px-3 py-3">
                    <div className="mb-3 lg:hidden">
                      <Badge variant="secondary">Rank {reward.rank}</Badge>
                    </div>
                    <div className="hidden lg:grid lg:grid-cols-[100px_repeat(7,minmax(0,1fr))] gap-3 text-sm">
                      <div className="font-semibold text-foreground">Rank {reward.rank}</div>
                      {COLUMNS.map((column) => (
                        <div key={column.key} className="text-muted-foreground">
                          {reward[column.key]}
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:hidden">
                      {COLUMNS.map((column) => (
                        <div key={column.key} className="rounded-md border border-border/50 bg-muted/20 px-2 py-2">
                          <div className="text-[11px] text-muted-foreground">{column.label}</div>
                          <div className="text-sm font-medium text-foreground">{reward[column.key]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
