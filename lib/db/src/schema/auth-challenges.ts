import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const authChallengesTable = pgTable("auth_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull().unique(),
  nonce: text("nonce").notNull(),
  flow: text("flow").notNull().default("telegram_login"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  expiresAtIdx: index("auth_challenges_expires_at_idx").on(table.expiresAt),
}));
