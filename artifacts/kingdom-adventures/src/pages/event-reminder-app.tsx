import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, ChevronDown, Clock3, Info, Loader2, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiUrl, configuredApiBase, saveConfiguredApiBase } from "@/lib/api";
import { useEventRefresh } from "@/lib/event-refresh";
import { useEventHourOffset } from "@/lib/event-time";
import {
  getBrowserPushStatus,
  getCurrentBrowserPushSubscription,
  isIosDevice,
  subscribeBrowserPush,
  type BrowserPushStatus,
} from "@/lib/web-push";
import { buildLocalAutomaticWeeklyConquestTimeline } from "@/lib/weekly-conquest";
import { ALL_GACHA_EVENTS, resolveGachaEvent, type GachaEvent } from "@/pages/gacha-events";
import { getNextWarioDungeonSpawn, WAIRO_DUNGEON_SCHEDULE, type WarioDungeonEntry } from "@/pages/wario-dungeon";

type ReminderMode = "start" | "one-hour-and-start";
type ReminderDefinition =
  | { type: "gacha"; event: GachaEvent }
  | { type: "wairo"; event: WarioDungeonEntry }
  | { type: "weekly-conquest" };

type ReminderOption = {
  id: string;
  group: "Wairo" | "S Rank Gacha" | "Weekly";
  title: string;
  detail: string;
  startsAt: Date;
  offsetHours: number;
  mode: ReminderMode;
  definition: ReminderDefinition;
};

type SavedReminder = {
  id: string;
  offsetHours: number;
  mode: ReminderMode;
  savedAt: number;
};

const STORAGE_KEY = "kaStandaloneEventReminders";

function readSaved(): Record<string, SavedReminder> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSaved(value: Record<string, SavedReminder>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function formatCountdown(target: Date, now: Date) {
  const ms = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(target: Date) {
  return target.toLocaleString([], { month: "short", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
}

function offsetLabel(offset: number) {
  return offset >= 0 ? `+${offset}h` : `${offset}h`;
}

function StatusGrid({ status }: { status: BrowserPushStatus | null }) {
  const rows = [
    ["standalone", status?.standalone ? "true" : "false"],
    ["browserName", status?.browserName ?? "..."],
    ["osName", status?.osName ?? "..."],
    ["deviceType", status?.deviceType ?? "..."],
    ["notificationAPI", status?.notificationPermission ?? "..."],
    ["serviceWorkerState", status?.serviceWorkerState ?? "..."],
    ["subscriptionState", status?.subscriptionState ?? "..."],
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 font-mono text-[13px] shadow-xl">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-1">
          <div className="truncate text-right text-slate-500">{label}</div>
          <div className="truncate text-slate-100">{value}</div>
        </div>
      ))}
      {status?.supportReason ? (
        <div className="mt-3 rounded-xl bg-black/25 p-3 font-sans text-xs leading-relaxed text-slate-300">
          {status.supportReason}
        </div>
      ) : null}
    </div>
  );
}

function OffsetControl({ value, disabled, onChange }: { value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/5 p-1">
      <button type="button" onClick={() => onChange(Math.max(-23, value - 1))} disabled={disabled} className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-slate-100 disabled:opacity-40" aria-label="Decrease offset">
        <Minus className="h-4 w-4" />
      </button>
      <div className="w-12 text-center font-mono text-sm text-slate-100">{offsetLabel(value)}</div>
      <button type="button" onClick={() => onChange(Math.min(23, value + 1))} disabled={disabled} className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-slate-100 disabled:opacity-40" aria-label="Increase offset">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function ReminderRow({
  option,
  now,
  active,
  busy,
  disabledReason,
  onSubscribe,
  onUnsubscribe,
  onOffsetChange,
  onWairoModeChange,
  onTap,
}: {
  option: ReminderOption;
  now: Date;
  active: boolean;
  busy: boolean;
  disabledReason?: string;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onOffsetChange: (value: number) => void;
  onWairoModeChange?: (enabled: boolean) => void;
  onTap: () => void;
}) {
  const disabled = Boolean(disabledReason);

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${active ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-slate-900/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">{option.group}</div>
          <div className="mt-1 truncate text-base font-semibold text-white">{option.title}</div>
          <div className="mt-1 text-xs text-slate-400">{option.detail}</div>
        </div>
        {active ? (
          <div className="rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-semibold text-emerald-300">On</div>
        ) : (
          <div className="rounded-full bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-400">Off</div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-black/20 px-3 py-2">
          <div className="text-slate-500">Next</div>
          <div className="mt-0.5 font-medium text-slate-100">{formatDate(option.startsAt)}</div>
        </div>
        <div className="rounded-xl bg-black/20 px-3 py-2">
          <div className="text-slate-500">Countdown</div>
          <div className="mt-0.5 font-medium text-slate-100">{formatCountdown(option.startsAt, now)}</div>
        </div>
      </div>

      {option.definition.type === "wairo" && onWairoModeChange ? (
        <label className="mt-3 flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-200">
          <span>One-hour warning + spawn</span>
          <Switch checked={option.mode === "one-hour-and-start"} disabled={active} onCheckedChange={onWairoModeChange} />
        </label>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <OffsetControl value={option.offsetHours} disabled={active} onChange={onOffsetChange} />
        {active ? (
          <Button type="button" variant="outline" onClick={onUnsubscribe} disabled={busy} className="border-white/15 bg-white/5 text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
            Disable
          </Button>
        ) : (
          <Button type="button" onClick={disabled ? onTap : onSubscribe} disabled={busy} className={`${disabled ? "bg-slate-700 text-slate-100 hover:bg-slate-700" : "bg-sky-500 text-white hover:bg-sky-500"}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {busy ? "Checking..." : "Notify me"}
          </Button>
        )}
      </div>
      {active ? <div className="mt-2 text-xs text-slate-500">Disable this reminder to change its offset.</div> : null}
      {!active && disabledReason ? <div className="mt-2 text-xs text-amber-200">{disabledReason}</div> : null}
    </div>
  );
}

export default function EventReminderAppPage() {
  const [now, setNow] = useState(() => new Date());
  const [eventOffset] = useEventHourOffset();
  const [status, setStatus] = useState<BrowserPushStatus | null>(null);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<Record<string, SavedReminder>>(() => readSaved());
  const [customOffsets, setCustomOffsets] = useState<Record<string, number>>({});
  const [wairoTwoStep, setWairoTwoStep] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<"all" | "gacha">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState(() => configuredApiBase());

  const refresh = useCallback(() => {
    setNow(new Date());
    getBrowserPushStatus().then(setStatus).catch(() => {});
  }, []);

  useEventRefresh(refresh, 180_000);

  useEffect(() => {
    writeSaved(saved);
  }, [saved]);

  const options = useMemo(() => {
    const nextWairo = getNextWarioDungeonSpawn(now, eventOffset);
    const wairoEntry = nextWairo ? WAIRO_DUNGEON_SCHEDULE.find((entry) => entry.day === nextWairo.day && entry.hour === nextWairo.hour) : null;
    const wairo: ReminderOption[] = nextWairo && wairoEntry ? [{
      id: `wairo:${wairoEntry.day}:${wairoEntry.hour}`,
      group: "Wairo",
      title: "Wairo Dungeon spawn",
      detail: wairoTwoStep ? "Notify one hour before and when it spawns." : "Notify when it spawns.",
      startsAt: nextWairo.startsAt,
      offsetHours: customOffsets[`wairo:${wairoEntry.day}:${wairoEntry.hour}`] ?? saved[`wairo:${wairoEntry.day}:${wairoEntry.hour}`]?.offsetHours ?? eventOffset,
      mode: wairoTwoStep ? "one-hour-and-start" : "start",
      definition: { type: "wairo", event: wairoEntry },
    }] : [];

    const weeklyTimeline = buildLocalAutomaticWeeklyConquestTimeline(now, 1);
    const currentWeekly = weeklyTimeline.entries.find((entry) => entry.id === weeklyTimeline.currentId);
    const weekly: ReminderOption[] = currentWeekly ? [{
      id: "weekly-conquest:rotation",
      group: "Weekly",
      title: "Weekly Conquest reset",
      detail: "Notify when the next weekly conquest rotation starts.",
      startsAt: new Date(currentWeekly.endsAt),
      offsetHours: customOffsets["weekly-conquest:rotation"] ?? saved["weekly-conquest:rotation"]?.offsetHours ?? 0,
      mode: "start",
      definition: { type: "weekly-conquest" },
    }] : [];

    const gacha = ALL_GACHA_EVENTS
      .filter((event) => event.title.startsWith("S Rank"))
      .map((event): ReminderOption => {
        const resolved = resolveGachaEvent(event, now, eventOffset);
        const id = `gacha:${event.id}`;
        return {
          id,
          group: "S Rank Gacha",
          title: event.title,
          detail: event.poolLabel,
          startsAt: resolved.startAt,
          offsetHours: customOffsets[id] ?? saved[id]?.offsetHours ?? eventOffset,
          mode: "start",
          definition: { type: "gacha", event },
        };
      })
      .filter((option) => !search || option.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return [...wairo, ...weekly, ...(expanded === "gacha" || search ? gacha : gacha.slice(0, 10))];
  }, [customOffsets, eventOffset, expanded, now, saved, search, wairoTwoStep]);

  const syncStatus = async () => setStatus(await getBrowserPushStatus());

  const subscribe = async (option: ReminderOption) => {
    setBusyId(option.id);
    setMessage(`Checking notification support for ${option.title}...`);
    try {
      const pushSubscription = await subscribeBrowserPush();
      const response = await fetch(apiUrl("/event-reminders/subscriptions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pushSubscription: pushSubscription.toJSON(),
          subscriptionId: option.id,
          title: option.title,
          offsetHours: option.offsetHours,
          mode: option.mode,
          definition: option.definition,
        }),
      });
      if (!response.ok) throw new Error("The reminder server could not save this subscription.");
      setSaved((current) => ({ ...current, [option.id]: { id: option.id, offsetHours: option.offsetHours, mode: option.mode, savedAt: Date.now() } }));
      setMessage(`${option.title} reminders are on.`);
      await syncStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not subscribe.");
    } finally {
      setBusyId(null);
    }
  };

  const unsubscribe = async (option: ReminderOption) => {
    setBusyId(option.id);
    setMessage(`Turning off ${option.title} reminders...`);
    try {
      const pushSubscription = await getCurrentBrowserPushSubscription();
      if (pushSubscription) {
        await fetch(apiUrl("/event-reminders/subscriptions"), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: pushSubscription.endpoint, subscriptionId: option.id }),
        });
      }
      setSaved((current) => {
        const next = { ...current };
        delete next[option.id];
        return next;
      });
      setMessage(`${option.title} reminders are off.`);
      await syncStatus();
    } catch {
      setMessage("Removed locally. The server could not be reached.");
    } finally {
      setBusyId(null);
    }
  };

  const needsIosInstall = isIosDevice() && status?.supported && !status.standalone;
  const blockedReason = status && !status.supported ? status.supportReason : "";
  const saveNotificationServer = () => {
    const clean = saveConfiguredApiBase(apiBaseInput);
    setApiBaseInput(clean);
    setMessage(clean ? `Notification server set to ${clean}.` : "Notification server reset to the site default.");
  };
  const sendTestNotification = async () => {
    setTestBusy(true);
    setMessage("Scheduling a test notification for 5 seconds from now...");
    try {
      saveConfiguredApiBase(apiBaseInput);
      const pushSubscription = await subscribeBrowserPush();
      const response = await fetch(apiUrl("/event-reminders/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushSubscription: pushSubscription.toJSON(), delaySeconds: 5 }),
      });
      if (!response.ok) throw new Error("The reminder server could not schedule a test notification.");
      setMessage("Test notification scheduled. It should arrive in about 5 seconds.");
      await syncStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send a test notification.");
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="sticky top-0 z-10 -mx-4 bg-black/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Kingdom Adventures</div>
              <h1 className="text-2xl font-bold tracking-tight">Event Reminders</h1>
            </div>
            <button type="button" onClick={refresh} className="grid h-11 w-11 place-items-center rounded-full bg-slate-900" aria-label="Refresh">
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <StatusGrid status={status} />

          {needsIosInstall || status?.installRequired ? (
            <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-50">
              On iPhone, tap Share, choose Add to Home Screen, then open KA Events from the new icon. Safari only enables web push for installed Home Screen apps.
            </div>
          ) : null}

          {status && !status.supported && !status.installRequired ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-50">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="h-4 w-4" />
                Push is unavailable here
              </div>
              <p className="mt-1 text-amber-50/85">{status.supportReason}</p>
              {isIosDevice() ? <p className="mt-2 text-amber-50/75">For iPhone, web push needs iOS 16.4 or newer and the app must be opened from the Home Screen icon.</p> : null}
            </div>
          ) : null}

          {message ? <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-slate-100">{message}</div> : null}

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-300">Notification server</div>
            <div className="mt-2 flex gap-2">
              <input
                value={apiBaseInput}
                onChange={(event) => setApiBaseInput(event.target.value)}
                placeholder="https://your-backend-url"
                className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <Button type="button" onClick={saveNotificationServer} className="bg-slate-700 text-white hover:bg-slate-700">
                Save
              </Button>
            </div>
            <div className="mt-2 text-xs text-slate-500">Use this when testing with a local backend tunnel.</div>
            <Button type="button" onClick={sendTestNotification} disabled={testBusy || Boolean(blockedReason)} className="mt-3 w-full bg-violet-500 text-white hover:bg-violet-500 disabled:bg-slate-700">
              {testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              {testBusy ? "Scheduling..." : "Send test notification in 5 seconds"}
            </Button>
            {blockedReason ? <div className="mt-2 text-xs text-amber-200">{blockedReason}</div> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
            <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find S Rank Samurai, Ninja..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <div>Event offset: {offsetLabel(eventOffset)}</div>
              <div>{Object.keys(saved).length} active</div>
            </div>
          </div>

          <div className="space-y-3">
            {options.map((option) => (
              <ReminderRow
                key={option.id}
                option={option}
                now={now}
                active={Boolean(saved[option.id])}
                busy={busyId === option.id}
                disabledReason={blockedReason}
                onSubscribe={() => subscribe(option)}
                onUnsubscribe={() => unsubscribe(option)}
                onOffsetChange={(value) => setCustomOffsets((current) => ({ ...current, [option.id]: value }))}
                onWairoModeChange={option.definition.type === "wairo" ? setWairoTwoStep : undefined}
                onTap={() => setMessage(blockedReason || "Notifications are not available in this browser.")}
              />
            ))}
          </div>

          {!search ? (
            <button type="button" onClick={() => setExpanded((value) => value === "all" ? "gacha" : "all")} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-200">
              {expanded === "all" ? "Show all S Rank gacha events" : "Show fewer gacha events"}
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded === "gacha" ? "rotate-180" : ""}`} />
            </button>
          ) : null}

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="h-4 w-4" />
              Standalone mode
            </div>
            <p className="mt-1 text-emerald-100/80">
              This installed app is only for event reminders. Notifications open this page, not the full website.
            </p>
          </div>

          <div className="pb-4 text-center text-[11px] text-slate-600">
            <Clock3 className="mx-auto mb-1 h-4 w-4" />
            Refreshes on open, focus, and every few minutes.
          </div>
        </div>
      </div>
    </main>
  );
}
