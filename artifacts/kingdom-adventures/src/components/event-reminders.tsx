import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, ExternalLink, Minus, Plus, RefreshCw, Smartphone } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/lib/api";
import { useEventRefresh } from "@/lib/event-refresh";
import { useEventHourOffset } from "@/lib/event-time";
import { getReminderPushToken, hasFirebaseMessagingConfig } from "@/lib/fcm";
import { isProbablyIosSafari } from "@/lib/pwa";
import { ALL_GACHA_EVENTS, resolveGachaEvent, type GachaEvent } from "@/pages/gacha-events";
import { getNextWarioDungeonSpawn, WAIRO_DUNGEON_SCHEDULE, type WarioDungeonEntry } from "@/pages/wario-dungeon";

type ReminderMode = "start" | "one-hour-and-start" | "daily-check";

type ReminderEventDefinition =
  | {
      type: "gacha";
      event: GachaEvent;
    }
  | {
      type: "wairo";
      event: WarioDungeonEntry;
    }
  | {
      type: "page-daily";
      hour: number;
    };

type ReminderOption = {
  id: string;
  title: string;
  description: string;
  href: string;
  startsAt?: Date;
  mode: ReminderMode;
  definition: ReminderEventDefinition;
};

type SavedReminder = {
  id: string;
  offsetHours: number;
  mode: ReminderMode;
  savedAt: number;
};

const STORAGE_KEY = "kaEventReminderSubscriptions";

const OTHER_EVENT_OPTIONS: ReminderOption[] = [
  {
    id: "daily-check:weekly-conquest",
    title: "Weekly Conquest",
    description: "A daily check reminder for the weekly conquest page.",
    href: "/weekly-conquest",
    mode: "daily-check",
    definition: { type: "page-daily", hour: 9 },
  },
  {
    id: "daily-check:daily-rank-rewards",
    title: "Daily Rank Rewards",
    description: "A daily check reminder for daily rank reward planning.",
    href: "/daily-rank-rewards",
    mode: "daily-check",
    definition: { type: "page-daily", hour: 9 },
  },
  {
    id: "daily-check:kairo-room",
    title: "Kairo Room",
    description: "A daily check reminder for the Kairo Room event page.",
    href: "/kairo-room",
    mode: "daily-check",
    definition: { type: "page-daily", hour: 9 },
  },
  {
    id: "daily-check:job-center",
    title: "Job Center",
    description: "A daily check reminder for the Job Center rotation page.",
    href: "/job-center",
    mode: "daily-check",
    definition: { type: "page-daily", hour: 9 },
  },
];

function readSavedReminders(): Record<string, SavedReminder> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSavedReminders(next: Record<string, SavedReminder>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function formatWhen(date?: Date) {
  if (!date) return "Recurring reminder";
  return date.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function offsetLabel(offset: number) {
  return offset >= 0 ? `+${offset}h` : `${offset}h`;
}

function ReminderOffsetControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(Math.max(-23, value - 1))} disabled={value <= -23} aria-label="Decrease reminder offset">
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-12 text-center font-mono text-sm">{offsetLabel(value)}</span>
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(Math.min(23, value + 1))} disabled={value >= 23} aria-label="Increase reminder offset">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function EventReminderManager() {
  const [eventOffset] = useEventHourOffset();
  const [now, setNow] = useState(() => new Date());
  const [saved, setSaved] = useState<Record<string, SavedReminder>>(() => readSavedReminders());
  const [customOffsets, setCustomOffsets] = useState<Record<string, number>>({});
  const [wairoTwoStep, setWairoTwoStep] = useState(false);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pullStart, setPullStart] = useState<number | null>(null);

  const refresh = useCallback(() => setNow(new Date()), []);
  useEventRefresh(refresh);

  useEffect(() => {
    writeSavedReminders(saved);
  }, [saved]);

  const gachaOptions = useMemo(() => {
    return ALL_GACHA_EVENTS
      .filter((event) => event.title.startsWith("S Rank"))
      .map((event): ReminderOption => {
        const resolved = resolveGachaEvent(event, now, eventOffset);
        return {
          id: `gacha:${event.id}`,
          title: event.title,
          description: `${event.poolLabel}. Notification opens the gacha events page.`,
          href: "/gacha-events",
          startsAt: resolved.startAt,
          mode: "start",
          definition: { type: "gacha", event },
        };
      })
      .sort((a, b) => (a.startsAt?.getTime() || 0) - (b.startsAt?.getTime() || 0))
      .slice(0, 12);
  }, [eventOffset, now]);

  const wairoOption = useMemo((): ReminderOption | null => {
    const nextSpawn = getNextWarioDungeonSpawn(now, eventOffset);
    if (!nextSpawn) return null;
    const scheduleEntry = WAIRO_DUNGEON_SCHEDULE.find((entry) => entry.day === nextSpawn.day && entry.hour === nextSpawn.hour);
    if (!scheduleEntry) return null;
    return {
      id: `wairo:${nextSpawn.day}:${nextSpawn.hour}`,
      title: "Wairo Dungeon spawn",
      description: wairoTwoStep ? "Sends one reminder one hour before the spawn and another at spawn." : "Sends one reminder when the Wairo Dungeon spawn starts.",
      href: "/wario-dungeon",
      startsAt: nextSpawn.startsAt,
      mode: wairoTwoStep ? "one-hour-and-start" : "start",
      definition: { type: "wairo", event: scheduleEntry },
    };
  }, [eventOffset, now, wairoTwoStep]);

  const reminderOptions = useMemo(() => {
    return [...(wairoOption ? [wairoOption] : []), ...gachaOptions, ...OTHER_EVENT_OPTIONS];
  }, [gachaOptions, wairoOption]);

  const subscribe = async (option: ReminderOption) => {
    setBusyId(option.id);
    setStatus("");
    try {
      const token = await getReminderPushToken();
      const offsetHours = customOffsets[option.id] ?? eventOffset;
      const response = await fetch(apiUrl("/event-reminders/subscriptions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          subscriptionId: option.id,
          title: option.title,
          href: option.href,
          offsetHours,
          mode: option.mode,
          definition: option.definition,
        }),
      });
      if (!response.ok) throw new Error("The reminder server could not save this subscription.");
      setSaved((current) => ({
        ...current,
        [option.id]: { id: option.id, offsetHours, mode: option.mode, savedAt: Date.now() },
      }));
      setStatus(`Subscribed to ${option.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not subscribe to this reminder.");
    } finally {
      setBusyId(null);
    }
  };

  const unsubscribe = async (option: ReminderOption) => {
    setBusyId(option.id);
    setStatus("");
    try {
      if (hasFirebaseMessagingConfig() && "Notification" in window) {
        const token = await getReminderPushToken();
        await fetch(apiUrl("/event-reminders/subscriptions"), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, subscriptionId: option.id }),
        });
      }
    } catch {
      // Local disable still works if the browser cannot mint the token again.
    } finally {
      setSaved((current) => {
        const next = { ...current };
        delete next[option.id];
        return next;
      });
      setStatus(`Disabled ${option.title}.`);
      setBusyId(null);
    }
  };

  return (
    <Card
      onTouchStart={(event) => setPullStart(event.touches[0]?.clientY ?? null)}
      onTouchEnd={(event) => {
        if (pullStart !== null && event.changedTouches[0] && event.changedTouches[0].clientY - pullStart > 80) refresh();
        setPullStart(null);
      }}
    >
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Event reminders
            </CardTitle>
            <CardDescription>
              Subscribe to event reminders without an account. Android and desktop Chrome/Edge use Firebase push notifications.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/install">
                <Smartphone className="h-4 w-4" />
                Install
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isProbablyIosSafari() ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            iPhone Safari can install this app, but it cannot receive true background web push from this setup. Open or refresh the app to update event timing.
          </div>
        ) : null}
        {!hasFirebaseMessagingConfig() ? (
          <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Firebase messaging environment variables are not configured yet, so push subscriptions will show a setup message in this local build.
          </div>
        ) : null}
        {status ? <div className="rounded-lg border bg-muted px-3 py-2 text-sm">{status}</div> : null}

        <div className="space-y-2">
          {reminderOptions.map((option) => {
            const active = Boolean(saved[option.id]);
            const offset = customOffsets[option.id] ?? saved[option.id]?.offsetHours ?? eventOffset;
            return (
              <div key={option.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{option.title}</div>
                      <Badge variant="outline">{formatWhen(option.startsAt)}</Badge>
                      {active ? <Badge>Subscribed</Badge> : null}
                    </div>
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                    <Link href={option.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2">
                      Open event page <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {option.id.startsWith("wairo:") ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={wairoTwoStep} onCheckedChange={setWairoTwoStep} />
                        One-hour warning
                      </label>
                    ) : null}
                    <ReminderOffsetControl value={offset} onChange={(value) => setCustomOffsets((current) => ({ ...current, [option.id]: value }))} />
                    {active ? (
                      <Button type="button" variant="outline" onClick={() => unsubscribe(option)} disabled={busyId === option.id}>
                        <BellOff className="h-4 w-4" />
                        Disable
                      </Button>
                    ) : (
                      <Button type="button" onClick={() => subscribe(option)} disabled={busyId === option.id}>
                        <Bell className="h-4 w-4" />
                        Subscribe to reminder
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
