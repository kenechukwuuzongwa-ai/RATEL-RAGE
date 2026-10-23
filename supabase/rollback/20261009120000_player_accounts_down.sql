-- Ratel Rage — ROLLBACK of 20261009120000_player_accounts.sql.
-- DESTRUCTIVE: drops profiles, cloud saves, gameplay events, runs and scores.
-- Take a backup first (Dashboard → Database → Backups, or `supabase db dump --data-only`).
-- Auth users (guests and accounts) are NOT touched.

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_converted on auth.users;

drop function if exists public.get_leaderboard(integer, text, integer);
drop function if exists public.submit_score(uuid, integer, jsonb, integer, integer, text);
drop function if exists public.start_run(integer, text);
drop function if exists public.log_events(jsonb);
drop function if exists public.load_progress(text);
drop function if exists public.save_progress(text, jsonb, integer);

drop table if exists public.leaderboard_scores;
drop table if exists public.runs;
drop table if exists public.gameplay_events;
drop table if exists public.cloud_saves;
drop table if exists public.profiles;

drop function if exists private.handle_user_converted();
drop function if exists private.handle_new_user();
drop function if exists private.touch_updated_at();
drop function if exists private.is_guest();
drop schema if exists private;
