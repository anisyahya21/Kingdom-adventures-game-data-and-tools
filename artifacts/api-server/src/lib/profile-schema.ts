import { pool } from "@workspace/db";
import migration from "../../../../lib/db/migrations/20261018_profile_accounts.sql";

// Use this service's configured database, without exporting its credentials.
// The SQL is repeatable and preserves all existing users and sessions.
export async function ensureProfileSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(20261018, 1)");
    const ready = await client.query(`SELECT
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('discord_user_id','discord_username','game_accounts'))=3
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='telegram_user_id' AND is_nullable='YES')
      AND to_regclass('public.users_discord_user_id_unique') IS NOT NULL AS ready`);
    if (ready.rows[0]?.ready) { await client.query("COMMIT"); return; }
    // Prevent concurrent account writes while checking preservation.
    await client.query("LOCK TABLE users, user_sessions IN SHARE ROW EXCLUSIVE MODE");
    const fingerprint = `SELECT
      (SELECT md5(coalesce(string_agg((to_jsonb(u)-'discord_user_id'-'discord_username'-'game_accounts')::text, '' ORDER BY id),'')) FROM users u) AS users,
      (SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '' ORDER BY id),'')) FROM user_sessions s) AS sessions`;
    const before = (await client.query(fingerprint)).rows[0];
    await client.query(migration.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm, ""));
    const after = (await client.query(fingerprint)).rows[0];
    if (before.users !== after.users || before.sessions !== after.sessions) throw new Error("Profile migration preservation check failed");
    await client.query("COMMIT");
    console.info("Profile schema ready; existing users and sessions preserved.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
