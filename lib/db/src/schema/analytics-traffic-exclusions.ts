import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const analyticsTrafficExclusionsTable = pgTable(
  "analytics_traffic_exclusions",
  {
    eventId: text("event_id").primaryKey(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
