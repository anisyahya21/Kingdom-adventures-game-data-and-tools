-- Run before deploying the API. Existing users, sessions and profile rows are preserved.
BEGIN;
ALTER TABLE users ALTER COLUMN telegram_user_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS game_accounts jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS users_discord_user_id_unique ON users(discord_user_id);
COMMIT;
