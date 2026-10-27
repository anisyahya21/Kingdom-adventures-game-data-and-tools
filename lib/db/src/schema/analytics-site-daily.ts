import { bigint, date, pgTable, timestamp } from "drizzle-orm/pg-core";

// Site-wide distinct counts must not be summed from per-route distinct counts.
export const analyticsSiteDailyTable = pgTable("analytics_site_daily", {
  date: date("date").primaryKey(),
  views: bigint("views", { mode: "number" }).notNull().default(0),
  uniqueVisitors: bigint("unique_visitors", { mode: "number" })
    .notNull()
    .default(0),
  signedInUsers: bigint("signed_in_users", { mode: "number" })
    .notNull()
    .default(0),
  sessions: bigint("sessions", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
