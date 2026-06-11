import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appStateTable = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
