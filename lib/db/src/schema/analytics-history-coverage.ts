import { date, pgTable, text } from "drizzle-orm/pg-core";
export const analyticsHistoryCoverageTable = pgTable(
  "analytics_history_coverage",
  {
    startDate: date("start_date").primaryKey(),
    endDate: date("end_date"),
    source: text("source").notNull(),
  },
);
