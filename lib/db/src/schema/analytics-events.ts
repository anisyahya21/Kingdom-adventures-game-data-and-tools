import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const analyticsEventsTable = pgTable("analytics_events", {
  eventId: text("event_id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  eventType: text("event_type").notNull(),
  route: text("route").notNull(),
  toolSlug: text("tool_slug"),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  anonId: text("anon_id").notNull(),
  sessionId: text("session_id").notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  country: text("country"),
}, (table) => ({
  timestampIdx: index("analytics_events_timestamp_idx").on(table.timestamp),
  eventTypeIdx: index("analytics_events_event_type_idx").on(table.eventType),
  routeIdx: index("analytics_events_route_idx").on(table.route),
  toolSlugIdx: index("analytics_events_tool_slug_idx").on(table.toolSlug),
  userIdIdx: index("analytics_events_user_id_idx").on(table.userId),
  anonIdIdx: index("analytics_events_anon_id_idx").on(table.anonId),
}));
