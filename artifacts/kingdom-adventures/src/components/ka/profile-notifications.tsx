import { ProfileReminderChannels } from "./profile-reminder-channels";
import { useMemo, useState } from "react";
import { Bell, BellRing, Loader2, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { BrowserPushStatus } from "@/lib/web-push";
import { REMINDER_GACHA_GROUPS } from "@/lib/event-reminder-catalog";
import type { ReminderOption, SavedReminder, DeliveryChannels, DeliveryTargets, TelegramStatus, DiscordStatus } from "@/pages/event-reminder-app";

export type ProfileNotificationProps = {
  options: ReminderOption[];
  saved: Record<string, SavedReminder>;
  channels: DeliveryChannels;
  targets: DeliveryTargets;
  status: BrowserPushStatus | null;
  telegram: TelegramStatus;
  discord: DiscordStatus;
  message: string;
  blockedReason: string;
  busyId: string | null;
  errors: Record<string, string>;
  testBusy: boolean;
  setChannel: (channel: keyof DeliveryChannels, enabled: boolean) => void;
  setTelegramId: (id: string) => void;
  subscribe: (option: ReminderOption) => void;
  unsubscribe: (option: ReminderOption) => void;
  setOffset: (id: string, hours: number) => void;
  setWairoWarning: (enabled: boolean) => void;
  connectDiscord: () => void;
  disconnectDiscord: () => void;
  testDiscord: () => void;
  testTelegram: () => void;
  test: () => void;
  checkSchedule: () => void;
};

const groups = ["All events", "Wairo", ...REMINDER_GACHA_GROUPS, "Weekly"] as const;
const eventDate = (date: Date) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

export function ProfileNotifications(props: ProfileNotificationProps) {
  const [filter, setFilter] = useState<"all" | "subscribed">("all");
  const [group, setGroup] = useState<string>("All events");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { saved } = props;
  const activeCount = Object.keys(saved).length;
  const options = useMemo(() => props.options.filter((option) =>
    (filter === "all" || saved[option.id]) && (group === "All events" || option.group === group)
    && `${option.title} ${option.detail}`.toLowerCase().includes(search.trim().toLowerCase())), [props.options, saved, filter, group, search]);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Bell className="h-5 w-5 text-primary" />Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Follow events and get reminders on Telegram or Discord.</p></div>
      <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">{activeCount} subscribed</span>
    </div>
    <div className="space-y-5">
      <ProfileReminderChannels {...props} />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border bg-muted/30 p-1" role="group" aria-label="Subscription filter">
            <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All events</Button>
            <Button size="sm" variant={filter === "subscribed" ? "secondary" : "ghost"} aria-pressed={filter === "subscribed"} onClick={() => setFilter("subscribed")}>Subscribed{activeCount ? ` (${activeCount})` : ""}</Button>
          </div>
          <select aria-label="Event category" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={group} onChange={(event) => setGroup(event.target.value)}>{groups.map((entry) => <option key={entry} value={entry}>{entry === "All events" ? "All categories" : entry}</option>)}</select>
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search reminders" className="h-10 pl-9" placeholder="Find an event…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {props.message && <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{props.message}</p>}
        {props.blockedReason && <p className="text-xs leading-relaxed text-muted-foreground">{props.blockedReason}</p>}
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {options.slice(0, visibleCount).map((option) => {
            const active = Boolean(saved[option.id]);
            const busy = props.busyId === option.id;
            const open = expanded === option.id;
            return <div key={option.id} className={active ? "bg-primary/[0.04]" : ""}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{active ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</div>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium leading-snug">{option.title}</div><div className="mt-1 text-xs text-muted-foreground">{option.group} <span aria-hidden="true">·</span> {eventDate(option.adjustedStartsAt)}</div></div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Settings for ${option.title}`} aria-expanded={open} onClick={() => setExpanded(open ? null : option.id)}><Settings2 className="h-4 w-4" /></Button>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving subscription" /> : <Switch aria-label={`Subscribe to ${option.title}`} checked={active} disabled={!active && Boolean(props.blockedReason)} onCheckedChange={(on) => on ? props.subscribe(option) : props.unsubscribe(option)} />}
              </div>
              {open && <div className="space-y-3 border-t border-dashed bg-muted/20 px-4 py-3 text-xs">
                {option.detail && <p className="text-muted-foreground">{option.detail}</p>}
                <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2">Time adjustment<Input className="h-8 w-20" type="number" min={-24} max={24} step={1} value={option.offsetHours} disabled={active} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) props.setOffset(option.id, Math.max(-24, Math.min(24, value))); }} /><span className="text-muted-foreground">hours</span></label>
                  {option.definition.type === "wairo" && <label className="flex items-center gap-2"><Switch aria-label="One-hour Wairo warning" checked={option.mode === "one-hour-and-start"} disabled={active} onCheckedChange={props.setWairoWarning} />One-hour warning</label>}
                </div>
                {active && <p className="text-muted-foreground">Turn off this subscription before changing its timing.</p>}
              </div>}
              {props.errors[option.id] && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{props.errors[option.id]}</p>}
            </div>;
          })}
          {!options.length && <div className="px-5 py-12 text-center"><Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">{filter === "subscribed" ? "No subscriptions yet" : "No matching events"}</p><p className="mt-1 text-xs text-muted-foreground">{filter === "subscribed" ? "Choose an event in All events to get started." : "Try another search or category."}</p></div>}
        </div>
        {options.length > 0 && <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{Math.min(visibleCount, options.length)} of {options.length} events</span>{visibleCount < options.length && <Button size="sm" variant="outline" onClick={() => setVisibleCount((count) => count + 12)}>Show more events</Button>}</div>}
      </div>
    </div>
  </div>;
}
