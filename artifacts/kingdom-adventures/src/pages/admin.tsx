import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ka/page-header";
import { fetchAuthSession } from "@/lib/auth-session";
import { configuredApiBase } from "@/lib/api";

type Daily = {
  date: string;
  views: number | null;
  uniqueVisitors: number | null;
  signedInUsers: number | null;
};
type Analytics = {
  from: string;
  to: string;
  fromInstant: string | null;
  toInstant: string | null;
  firstDate: string;
  today: string;
  timezone: string;
  daily: Daily[];
  unavailableDays: number;
  totals: {
    views: number;
    uniqueVisitors: number;
    sessions: number;
    signedInUsers: number;
  };
  previous: {
    from: string;
    to: string;
    views: number;
    uniqueVisitors: number;
    complete: boolean;
  };
  pages: Array<{ route: string; views: number }>;
  tools: Array<{ toolSlug: string; views: number }>;
};
type Overview = {
  users: number;
  activeSessions: number;
  reminderSubscriptions: number;
  reminderAudience?: {
    subscriptions: number;
    devices: number;
    accounts: number;
    unattributedDevices: number;
  };
  guides: number;
};
const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm";
const number = (n: number | null) => (n === null ? "—" : n.toLocaleString());
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Could not load the dashboard.";

async function get<T>(path: string): Promise<T> {
  const response = await fetch(
    `${configuredApiBase()}/ka-api/ka/admin${path}`,
    {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw new Error(body?.error || `Request failed (${response.status}).`);
  return body as T;
}
function csvCell(value: string | number | null) {
  const s = value === null ? "" : String(value);
  // Prevent spreadsheet formula execution in exported text.
  return '"' + (/^[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
function exportDaily(data: Analytics) {
  const rows = [
    ["Date", "Page views", "Unique browser visitors", "Signed-in accounts"],
    ...data.daily.map((r) => [
      r.date,
      r.views,
      r.uniqueVisitors,
      r.signedInUsers,
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-analytics-${data.from}-to-${data.to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function comparison(current: number, previous: number, complete: boolean) {
  if (!complete) return "Earlier period has incomplete history";
  if (!previous)
    return current
      ? "No activity in the previous period"
      : "No change from the previous period";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs previous period`;
}

export default function AdminPage() {
  const [access, setAccess] = useState<
    "loading" | "admin" | "denied" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [overviewError, setOverviewError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [data, setData] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState("30");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState("both");
  const [tablePage, setTablePage] = useState(0);
  const [loadedAt, setLoadedAt] = useState("");
  useEffect(() => {
    let active = true;
    setAccess("loading");
    setError("");
    fetchAuthSession()
      .then((session) => {
        if (active) setAccess(session.user?.isAdmin ? "admin" : "denied");
      })
      .catch((e) => {
        if (active) {
          setAccess("error");
          setError(errorMessage(e));
        }
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (access !== "admin") return;
    let active = true;
    setBusy(true);
    setError("");
    setOverviewError("");
    setData(null);
    setOverview(null);
    setTablePage(0);
    const params = new URLSearchParams(
      range
        ? range
        : period === "24h"
          ? { hours: "24" }
          : { days: period === "custom" ? "30" : period },
    );
    Promise.allSettled([
      get<Analytics>("/analytics?" + params),
      get<Overview>("/overview"),
    ]).then(([analytics, counts]) => {
      if (!active) return;
      if (analytics.status === "fulfilled") {
        setData(analytics.value);
        setLoadedAt(new Date().toLocaleTimeString());
      } else setError(errorMessage(analytics.reason));
      if (counts.status === "fulfilled") setOverview(counts.value);
      else setOverviewError(errorMessage(counts.reason));
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [access, period, range]);
  const reload = () => setRefresh((n) => n + 1);
  if (access !== "admin")
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {access === "loading"
                ? "Checking admin access…"
                : access === "error"
                  ? "Could not check access"
                  : "Admin access required"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {access === "error"
                ? error
                : access === "denied"
                  ? "Sign in with your website admin account."
                  : "Loading your session…"}
            </p>
            {access !== "loading" && (
              <Button variant="outline" onClick={reload}>
                Try again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  const daily = data ? [...data.daily].reverse() : [];
  const visibleDaily = daily.slice(tablePage * 20, tablePage * 20 + 20);
  const changePeriod = (value: string) => {
    setPeriod(value);
    setRange(null);
  };
  const safePath = (route: string) =>
    /^\/(?!\/)/.test(route) && !/[\\\s]/.test(route);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <PageHeader
        icon={<ShieldCheck className="h-6 w-6" />}
        title="Admin analytics"
        actions={
          <Button variant="outline" onClick={reload} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      >
        <p>Traffic history, daily visitors, and the pages people use.</p>
      </PageHeader>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <p className="text-sm">Duration</p>
              <div
                role="group"
                aria-label="Reporting period"
                className="flex flex-wrap gap-2"
              >
                {[
                  ["24h", "24 hours"],
                  ["7", "1 week"],
                  ["30", "1 month"],
                  ["90", "3 months"],
                  ["all", "Lifetime"],
                  ["custom", "Custom dates"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={period === value ? "default" : "outline"}
                    aria-pressed={period === value}
                    title={
                      value === "30"
                        ? "Last 30 days"
                        : value === "90"
                          ? "Last 90 days"
                          : label
                    }
                    onClick={() => changePeriod(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {period === "custom" && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setRange({ ...custom });
                }}
              >
                <label className="text-sm">
                  From
                  <Input
                    aria-label="From date"
                    type="date"
                    required
                    min={data?.firstDate}
                    max={custom.to || data?.today}
                    value={custom.from}
                    onChange={(e) =>
                      setCustom({ ...custom, from: e.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  To
                  <Input
                    aria-label="To date"
                    type="date"
                    required
                    min={custom.from || data?.firstDate}
                    max={data?.today}
                    value={custom.to}
                    onChange={(e) =>
                      setCustom({ ...custom, to: e.target.value })
                    }
                  />
                </label>
                <Button type="submit" variant="outline">
                  Apply dates
                </Button>
              </form>
            )}
            <Button
              className="sm:ml-auto"
              variant="outline"
              disabled={!data || busy}
              onClick={() => data && exportDaily(data)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export daily CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {data
              ? `${data.fromInstant ? new Date(data.fromInstant).toLocaleString() + " to " + new Date(data.toInstant!).toLocaleString() + " · Rolling 24 hours; daily rows include only this window" : data.from + " to " + data.to} · ${data.timezone} · Available since ${data.firstDate}. Daily summaries have no expiry.`
              : busy
                ? "Loading stored history…"
                : "Choose a reporting period."}
          </p>
        </CardContent>
      </Card>
      {data && data.unavailableDays > 0 && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {data.unavailableDays} days in this range have unavailable history.
          They appear as gaps or “—”, not zero visitors. Totals include recorded
          activity only.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
          <Button className="ml-3" variant="outline" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            "Page views",
            data?.totals.views,
            data &&
              comparison(
                data.totals.views,
                data.previous.views,
                data.previous.complete,
              ),
          ],
          [
            "Unique visitors",
            data?.totals.uniqueVisitors,
            data &&
              comparison(
                data.totals.uniqueVisitors,
                data.previous.uniqueVisitors,
                data.previous.complete,
              ),
          ],
          [
            "Visit sessions",
            data?.totals.sessions,
            "Browser sessions with a tracked page view",
          ],
          [
            "Signed-in accounts",
            data?.totals.signedInUsers,
            "Accounts seen during this reporting period",
          ],
        ].map(([label, value, detail]) => (
          <Card key={String(label)}>
            <CardContent className="py-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="my-1 text-2xl font-semibold">
                {typeof value === "number" ? number(value) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-wrap gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Daily traffic</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Unique visitors are distinct browser IDs each day. Repeat page
              views count separately.
            </p>
          </div>
          <select
            aria-label="Chart metric"
            className={selectClass}
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="both">Both metrics</option>
            <option value="uniqueVisitors">Unique visitors</option>
            <option value="views">Page views</option>
          </select>
        </CardHeader>
        <CardContent>
          {data ? (
            <div
              className="h-72 min-w-0"
              role="img"
              aria-label={`Daily traffic from ${data.from} to ${data.to}; full values in the daily table below.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.daily}
                  margin={{ top: 10, right: 15, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => v.slice(5)}
                    minTickGap={45}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--background))",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend />
                  {metric !== "uniqueVisitors" && (
                    <Line
                      name="Page views"
                      dataKey="views"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {metric !== "views" && (
                    <Line
                      name="Unique visitors"
                      dataKey="uniqueVisitors"
                      stroke="hsl(var(--foreground))"
                      strokeDasharray="5 3"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p
              role="status"
              className="py-16 text-center text-sm text-muted-foreground"
            >
              {busy ? "Loading daily totals…" : "Daily totals are unavailable."}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            A visitor may use several devices or clear browser storage. Unique
            visitors are estimates of browsers, not a count of identified
            people. Period uniques are calculated separately, never by adding
            daily uniques.
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Registered accounts", overview?.users],
          ["Valid login sessions", overview?.activeSessions],
          ["Community guides", overview?.guides],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">
                {typeof value === "number" ? number(value) : "—"}
              </p>
              {label === "Valid login sessions" && (
                <p className="text-xs text-muted-foreground">
                  Unexpired logins across devices; not users online.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminder usage</CardTitle>
          <p className="text-xs text-muted-foreground">
            One account can watch many events and use several devices.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Accounts with reminders
            </p>
            <p className="text-xl font-semibold">
              {!overview?.reminderAudience
                ? "—"
                : overview.reminderAudience.accounts === 0 &&
                    overview.reminderAudience.unattributedDevices > 0
                  ? "Not yet known"
                  : `${overview.reminderAudience.unattributedDevices > 0 ? "At least " : ""}${number(overview.reminderAudience.accounts)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Unique website accounts, counted once across devices.
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Subscribed devices</p>
            <p className="text-xl font-semibold">
              {overview?.reminderAudience
                ? number(overview.reminderAudience.devices)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Browser/device IDs, not people.
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Event subscriptions</p>
            <p className="text-xl font-semibold">
              {overview ? number(overview.reminderSubscriptions) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Each event watched on a device counts separately.
            </p>
          </div>
          {overview?.reminderAudience &&
            overview.reminderAudience.unattributedDevices > 0 && (
              <p className="text-xs text-muted-foreground sm:col-span-3">
                {overview.reminderAudience.unattributedDevices} devices are not
                linked to a website account yet. Existing reminders are
                preserved; account counts become clearer as signed-in visitors
                open or save their reminders.
              </p>
            )}
        </CardContent>
      </Card>
      {overviewError && (
        <p role="alert" className="text-sm text-destructive">
          Account totals unavailable: {overviewError}
        </p>
      )}
      <Input
        aria-label="Search pages and tools"
        placeholder="Search pages and tools…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["pages", "tools"] as const).map((kind) => {
          const rows = (data?.[kind] || [])
            .map((r) => ({
              name: "route" in r ? r.route : r.toolSlug,
              views: r.views,
            }))
            .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
          const max = Math.max(1, ...rows.map((r) => r.views));
          return (
            <Card key={kind}>
              <CardHeader>
                <CardTitle className="text-base">Top {kind}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Up to 50 entries in the selected reporting period
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!rows.length && (
                  <p className="text-sm text-muted-foreground">
                    {busy
                      ? "Loading…"
                      : data
                        ? "No matching activity."
                        : "Rankings unavailable."}
                  </p>
                )}
                {rows.map((r) => (
                  <div key={r.name}>
                    <div className="flex justify-between gap-3 text-sm">
                      {kind === "pages" && safePath(r.name) ? (
                        <a
                          className="break-all underline underline-offset-2"
                          href={r.name}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.name}
                        </a>
                      ) : (
                        <span className="break-all">{r.name}</span>
                      )}
                      <span className="shrink-0">{number(r.views)}</span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(r.views / max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily totals</CardTitle>
          <p className="text-xs text-muted-foreground">
            Newest first. CSV export includes every day in the selected period.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Page views</th>
                  <th className="p-2 text-right">Unique visitors</th>
                  <th className="p-2 text-right">Signed-in accounts</th>
                </tr>
              </thead>
              <tbody>
                {visibleDaily.map((r) => (
                  <tr key={r.date} className="border-b last:border-0">
                    <td className="whitespace-nowrap p-2">{r.date}</td>
                    <td className="p-2 text-right">{number(r.views)}</td>
                    <td className="p-2 text-right">
                      {number(r.uniqueVisitors)}
                    </td>
                    <td className="p-2 text-right">
                      {number(r.signedInUsers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {daily.length ? tablePage * 20 + 1 : 0}–
                {Math.min((tablePage + 1) * 20, daily.length)} of {daily.length}{" "}
                days
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={tablePage === 0}
                  onClick={() => setTablePage((n) => n - 1)}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(tablePage + 1) * 20 >= daily.length}
                  onClick={() => setTablePage((n) => n + 1)}
                >
                  Older
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <p role="status" className="text-xs text-muted-foreground">
        {busy
          ? "Refreshing analytics…"
          : data
            ? `Loaded at ${loadedAt}. Daily summaries refresh up to once a minute. Stored events are preserved; dates before tracking began are not invented.`
            : "Analytics unavailable."}
      </p>
    </div>
  );
}
