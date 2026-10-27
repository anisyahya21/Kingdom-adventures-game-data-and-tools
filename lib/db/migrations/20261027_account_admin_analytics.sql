-- Additive only. Existing login identities, sessions and raw events are preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS analytics_site_daily (
  date date PRIMARY KEY,
  views bigint NOT NULL DEFAULT 0,
  unique_visitors bigint NOT NULL DEFAULT 0,
  signed_in_users bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analytics_history_coverage (
  start_date date PRIMARY KEY,
  end_date date,
  source text NOT NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
