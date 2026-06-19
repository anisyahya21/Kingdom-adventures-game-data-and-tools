import { integer, pgTable, text, date, primaryKey } from "drizzle-orm/pg-core";

export const analyticsDailyRollupTable = pgTable("analytics_daily_rollup", {
  date: date("date").notNull(),
  route: text("route").notNull(),
  toolSlug: text("tool_slug").notNull().default(""),
  views: integer("views").notNull().default(0),
  uniqueUsers: integer("unique_users").notNull().default(0),
  uniqueAnons: integer("unique_anons").notNull().default(0),
  logins: integer("logins").notNull().default(0),
  fallbackLogins: integer("fallback_logins").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.date, table.route, table.toolSlug] }),
}));
