import { pool } from "@workspace/db";
import migration from "../../../../lib/db/migrations/20261027_account_admin_analytics.sql";
import { HUMAN_TRAFFIC_SQL } from "./human-traffic";

export const ANALYTICS_TIMEZONE = "Europe/Berlin";

export async function ensureAdminAnalyticsSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(20261027, 1)");
    await client.query(migration);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

let refreshedAt = 0;
let needsFullRefresh = true;
let refreshing: Promise<void> | undefined;
export function refreshDailyAnalytics(force = false): Promise<void> {
  if (refreshing) return refreshing;
  if (!force && Date.now() - refreshedAt < 60000) return Promise.resolve();
  refreshing = (async () => {
    await pool.query(
      `INSERT INTO analytics_history_coverage(start_date,end_date,source)
      SELECT min((timestamp AT TIME ZONE $1)::date),NULL,'Current collection' FROM analytics_events
      WHERE event_type='page_view' HAVING count(*)>0 AND NOT EXISTS (SELECT 1 FROM analytics_history_coverage)
      ON CONFLICT DO NOTHING`,
      [ANALYTICS_TIMEZONE],
    );
    // First run backfills all history. Later runs recalculate only the latest two
    // dates and new dates, making interrupted/back-to-back runs repeatable.
    await pool.query(
      `INSERT INTO analytics_site_daily(date, views, unique_visitors, signed_in_users, sessions)
      SELECT (timestamp AT TIME ZONE $1)::date,
        count(*) FILTER (WHERE ${HUMAN_TRAFFIC_SQL}), count(DISTINCT anon_id) FILTER (WHERE ${HUMAN_TRAFFIC_SQL}),
        count(DISTINCT user_id) FILTER (WHERE ${HUMAN_TRAFFIC_SQL}), count(DISTINCT session_id) FILTER (WHERE ${HUMAN_TRAFFIC_SQL})
      FROM analytics_events
      WHERE event_type='page_view' AND ($2::boolean OR timestamp >= COALESCE(
        ((SELECT max(date)-1 FROM analytics_site_daily)::timestamp AT TIME ZONE $1), '-infinity'::timestamptz))
      GROUP BY 1
      ON CONFLICT(date) DO UPDATE SET views=excluded.views, unique_visitors=excluded.unique_visitors,
        signed_in_users=excluded.signed_in_users, sessions=excluded.sessions, updated_at=now()`,
      [ANALYTICS_TIMEZONE, force || needsFullRefresh],
    );
    needsFullRefresh = false;
    refreshedAt = Date.now();
  })().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

function dateString(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

export function analyticsRange(
  query: Record<string, unknown>,
  firstDate: string,
  today: string,
) {
  const end = typeof query.to === "string" ? query.to : today;
  const days = query.days === "all" ? null : Number(query.days ?? 30);
  if (
    days !== null &&
    (!Number.isSafeInteger(days) || days < 1 || days > 365250)
  )
    throw new Error("Choose valid dates or a valid reporting period.");
  const time = Date.parse(end);
  const suggested =
    days === null || !Number.isFinite(time)
      ? firstDate
      : new Date(time - (days - 1) * 86400000).toISOString().slice(0, 10);
  const start =
    typeof query.from === "string"
      ? query.from
      : suggested < firstDate
        ? firstDate
        : suggested;
  if (!dateString(start) || !dateString(end) || start > end || end > today)
    throw new Error(
      "Choose valid dates, with the end date no later than today.",
    );
  if (start < firstDate) throw new Error(`Stored history begins ${firstDate}.`);
  return { start, end };
}

export async function readAnalytics(query: Record<string, unknown>) {
  if (query.hours !== undefined && query.hours !== "24")
    throw new Error("Choose valid dates or the 24-hour duration.");
  const rolling = query.hours === "24";
  const toInstant = rolling ? new Date().toISOString() : null;
  const fromInstant = rolling
    ? new Date(Date.parse(toInstant!) - 86400000).toISOString()
    : null;
  await refreshDailyAnalytics();
  const metadata = (
    await pool.query(
      `SELECT
    to_char(min(date),'YYYY-MM-DD') AS first_date,
    to_char((now() AT TIME ZONE $1)::date,'YYYY-MM-DD') AS today
    FROM analytics_site_daily`,
      [ANALYTICS_TIMEZONE],
    )
  ).rows[0];
  const firstDate: string = metadata.first_date || metadata.today;
  const rollingStartDate = rolling
    ? new Intl.DateTimeFormat("en-CA", { timeZone: ANALYTICS_TIMEZONE }).format(
        new Date(fromInstant!),
      )
    : "";
  const { start, end } = analyticsRange(
    rolling
      ? {
          from: rollingStartDate < firstDate ? firstDate : rollingStartDate,
          to: metadata.today,
        }
      : query,
    firstDate,
    metadata.today,
  );
  const bounds = [start, end, ANALYTICS_TIMEZONE, fromInstant, toInstant];
  const [daily, totals, pages, tools, previous] = await Promise.all([
    rolling
      ? pool.query(
          `WITH counts AS (
      SELECT (timestamp AT TIME ZONE $3)::date AS date,count(*)::int AS views,count(DISTINCT anon_id)::int AS visitors,count(DISTINCT user_id)::int AS users
      FROM analytics_events WHERE event_type='page_view' AND (${HUMAN_TRAFFIC_SQL}) AND timestamp >= $4::timestamptz AND timestamp < $5::timestamptz GROUP BY 1)
      SELECT to_char(d.date,'YYYY-MM-DD') AS date,coalesce(c.views,0) AS views,coalesce(c.visitors,0) AS "uniqueVisitors",coalesce(c.users,0) AS "signedInUsers"
      FROM generate_series($1::date,$2::date,'1 day') d(date) LEFT JOIN counts c ON c.date=d.date::date ORDER BY d.date`,
          bounds,
        )
      : pool.query(
          `SELECT to_char(d.date,'YYYY-MM-DD') AS date, coalesce(s.views,0)::int AS views,
        coalesce(s.unique_visitors,0)::int AS "uniqueVisitors", coalesce(s.signed_in_users,0)::int AS "signedInUsers"
      FROM generate_series($1::date,$2::date,'1 day') d(date)
      LEFT JOIN analytics_site_daily s ON s.date=d.date::date ORDER BY d.date`,
          [start, end],
        ),
    pool.query(
      `SELECT count(*)::int AS views, count(DISTINCT anon_id)::int AS "uniqueVisitors",
      count(DISTINCT session_id)::int AS sessions, count(DISTINCT user_id)::int AS "signedInUsers"
      FROM analytics_events WHERE event_type='page_view' AND (${HUMAN_TRAFFIC_SQL})
      AND timestamp >= ($1::date::timestamp AT TIME ZONE $3)
      AND timestamp < (($2::date+1)::timestamp AT TIME ZONE $3)
      AND ($4::timestamptz IS NULL OR (timestamp >= $4::timestamptz AND timestamp < $5::timestamptz))`,
      bounds,
    ),
    pool.query(
      `SELECT route, count(*)::int AS views FROM analytics_events WHERE event_type='page_view' AND (${HUMAN_TRAFFIC_SQL})
      AND timestamp >= ($1::date::timestamp AT TIME ZONE $3) AND timestamp < (($2::date+1)::timestamp AT TIME ZONE $3)
      AND ($4::timestamptz IS NULL OR (timestamp >= $4::timestamptz AND timestamp < $5::timestamptz))
      GROUP BY route ORDER BY views DESC,route LIMIT 50`,
      bounds,
    ),
    pool.query(
      `SELECT tool_slug AS "toolSlug",count(*)::int AS views FROM analytics_events WHERE event_type='page_view' AND (${HUMAN_TRAFFIC_SQL}) AND coalesce(tool_slug,'')<>''
      AND timestamp >= ($1::date::timestamp AT TIME ZONE $3) AND timestamp < (($2::date+1)::timestamp AT TIME ZONE $3)
      AND ($4::timestamptz IS NULL OR (timestamp >= $4::timestamptz AND timestamp < $5::timestamptz))
      GROUP BY tool_slug ORDER BY views DESC,tool_slug LIMIT 50`,
      bounds,
    ),
    rolling
      ? pool.query(
          `SELECT count(*)::int AS views,count(DISTINCT anon_id)::int AS "uniqueVisitors",
      to_char(($1::timestamptz-interval '24 hours') AT TIME ZONE $3,'YYYY-MM-DD') AS "from",to_char($1::timestamptz AT TIME ZONE $3,'YYYY-MM-DD') AS "to"
      FROM analytics_events WHERE event_type='page_view' AND (${HUMAN_TRAFFIC_SQL}) AND timestamp >= $1::timestamptz-interval '24 hours' AND timestamp < $1::timestamptz AND $2::timestamptz IS NOT NULL`,
          [fromInstant, toInstant, ANALYTICS_TIMEZONE],
        )
      : pool.query(
          `SELECT count(*)::int AS views,count(DISTINCT anon_id)::int AS "uniqueVisitors",
      to_char($1::date-($2::date-$1::date+1),'YYYY-MM-DD') AS "from",to_char($1::date-1,'YYYY-MM-DD') AS "to"
      FROM analytics_events WHERE event_type='page_view' AND (${HUMAN_TRAFFIC_SQL})
      AND timestamp >= (($1::date-($2::date-$1::date+1))::timestamp AT TIME ZONE $3)
      AND timestamp < ($1::date::timestamp AT TIME ZONE $3)`,
          [start, end, ANALYTICS_TIMEZONE],
        ),
  ]);
  const coverage = (
    await pool.query(
      `SELECT to_char(start_date,'YYYY-MM-DD') AS "from",to_char(coalesce(end_date,(now() AT TIME ZONE $1)::date),'YYYY-MM-DD') AS "to",source FROM analytics_history_coverage ORDER BY start_date`,
      [ANALYTICS_TIMEZONE],
    )
  ).rows;
  const known = (date: string) =>
    coverage.some((c) => date >= c.from && date <= c.to);
  const dailyRows = daily.rows.map((row) =>
    known(row.date)
      ? row
      : { ...row, views: null, uniqueVisitors: null, signedInUsers: null },
  );
  return {
    from: start,
    to: end,
    fromInstant,
    toInstant,
    firstDate,
    today: metadata.today,
    timezone: ANALYTICS_TIMEZONE,
    daily: dailyRows,
    coverage,
    unavailableDays: dailyRows.filter((row) => row.views === null).length,
    totals: totals.rows[0],
    pages: pages.rows,
    tools: tools.rows,
    previous: {
      ...previous.rows[0],
      complete: coverage.some(
        (c) => previous.rows[0].from >= c.from && previous.rows[0].to <= c.to,
      ),
    },
    definitions: {
      uniqueVisitors:
        "Estimated human browser visitors, excluding known automation and explicitly reviewed suspect traffic. Not proof of individual people.",
      views: "Tracked page views, including repeat visits.",
      dailyRetention:
        "Daily totals have no expiry. Existing raw events are preserved.",
    },
  };
}
