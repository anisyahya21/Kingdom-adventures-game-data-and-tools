import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  isAdmin: boolean("is_admin").notNull().default(false),
  telegramUserId: text("telegram_user_id").unique(),
  discordUserId: text("discord_user_id").unique(),
  discordUsername: text("discord_username"),
  gameAccounts: jsonb("game_accounts").$type<Array<{ id: string; name: string; gameId: string }>>(),
  telegramUsername: text("telegram_username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  displayName: text("display_name"),
  gameId: text("game_id"),
  photoUrl: text("photo_url"),
  locale: text("locale"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});
