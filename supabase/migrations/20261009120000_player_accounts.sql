-- =============================================================================
-- Ratel Rage — player accounts, cloud saves, gameplay events, validated scores
-- (request 378). Apply with `supabase db push` or paste into the SQL editor.
--
-- SECURITY MODEL
--   * Every table in `public` has RLS ON, and the grants Supabase hands `anon` /
--     `authenticated` by default are REVOKED first, then only what is needed is
--     granted back. Least privilege:
--       profiles           authenticated: SELECT + UPDATE(display_name) of OWN row
--       cloud_saves        authenticated: SELECT of OWN rows; writes only via save_progress()
--       gameplay_events    no direct access; inserts only via log_events() (rate limited)
--       runs               no direct access; start_run() / submit_score()
--       leaderboard_scores no direct access; written by submit_score(), read via get_leaderboard()
--   * SECURITY DEFINER functions take the user from auth.uid() — never from an
--     argument — pin `search_path = ''`, and are EXECUTE-granted only to the roles
--     that need them. Internal helpers live in schema `private` (not exposed).
--   * Guests are Supabase anonymous users (role `authenticated`, JWT claim
--     is_anonymous = true). They get a profile, a cloud save and analytics. Only
--     registered players can post leaderboard scores.
--   * No service_role key is needed by the game; none may ever ship in browser code.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- helpers ----
create or replace function private.is_guest()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- --------------------------------------------------------------- profiles ----
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (display_name ~ '^[A-Za-z0-9 _-]{3,20}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  converted_at  timestamptz          -- set when a guest becomes a registered account
);
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy "profiles: owner reads own row" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner updates own row" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- A profile for every new auth user (guest or registered). The default name is
-- derived from the id, never from an email or a Google name (no PII by default).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, converted_at)
  values (new.id, 'Ratel-' || substr(replace(new.id::text, '-', ''), 1, 6),
          case when coalesce(new.is_anonymous, false) then null else now() end)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Guest -> account conversion (linkIdentity / updateUser keep the same id).
create or replace function private.handle_user_converted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set converted_at = coalesce(converted_at, now()) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_converted after update of is_anonymous on auth.users
  for each row when (old.is_anonymous is true and new.is_anonymous is false)
  execute function private.handle_user_converted();

-- ------------------------------------------------------------ cloud saves ----
create table public.cloud_saves (
  user_id     uuid not null references auth.users (id) on delete cascade,
  slot        text not null default 'main' check (slot ~ '^[a-z0-9_-]{1,16}$'),
  data        jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 32768),
  version     integer not null default 1 check (version > 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.cloud_saves enable row level security;
revoke all on table public.cloud_saves from anon, authenticated;
grant select on table public.cloud_saves to authenticated;
create policy "cloud_saves: owner reads own saves" on public.cloud_saves
  for select to authenticated using (user_id = (select auth.uid()));

-- Optimistic concurrency: a write names the version it was based on. A stale
-- write is NOT applied; the caller gets the server copy back to merge with.
create or replace function public.save_progress(p_slot text, p_data jsonb, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur public.cloud_saves;
  n integer;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'save data must be a JSON object' using errcode = '22023';
  end if;
  select * into cur from public.cloud_saves where user_id = uid and slot = p_slot for update;
  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      return jsonb_build_object('status', 'conflict', 'version', 0, 'data', null);
    end if;
    insert into public.cloud_saves (user_id, slot, data, version) values (uid, p_slot, p_data, 1)
      on conflict (user_id, slot) do nothing;
    get diagnostics n = row_count;
    if n = 0 then   -- lost a race with another device's first save
      select * into cur from public.cloud_saves where user_id = uid and slot = p_slot;
      return jsonb_build_object('status', 'conflict', 'version', cur.version, 'data', cur.data);
    end if;
    return jsonb_build_object('status', 'ok', 'version', 1);
  end if;
  if cur.version <> coalesce(p_expected_version, -1) then
    return jsonb_build_object('status', 'conflict', 'version', cur.version, 'data', cur.data);
  end if;
  update public.cloud_saves set data = p_data, version = cur.version + 1, updated_at = now()
    where user_id = uid and slot = p_slot;
  return jsonb_build_object('status', 'ok', 'version', cur.version + 1);
end $$;

create or replace function public.load_progress(p_slot text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur public.cloud_saves;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into cur from public.cloud_saves where user_id = uid and slot = p_slot;
  if not found then return jsonb_build_object('status', 'empty', 'version', 0, 'data', null); end if;
  return jsonb_build_object('status', 'ok', 'version', cur.version, 'data', cur.data, 'updated_at', cur.updated_at);
end $$;

-- -------------------------------------------------------- gameplay events ----
create table public.gameplay_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_id  uuid,
  name        text not null check (name ~ '^[a-z0-9_]{1,40}$'),
  props       jsonb not null default '{}'::jsonb
              check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2048),
  client_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index gameplay_events_user_time on public.gameplay_events (user_id, created_at desc);
create index gameplay_events_name_time on public.gameplay_events (name, created_at desc);
alter table public.gameplay_events enable row level security;
revoke all on table public.gameplay_events from anon, authenticated;
-- (no policies, no grants: clients can neither read nor write this table directly)

-- Batched analytics. Rate limits: 50 events per call, 120 per user per minute,
-- 5000 per user per day; anything beyond is dropped, never an error the game sees.
create or replace function public.log_events(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  recent integer;
  daily integer;
  room integer;
  ev jsonb;
  accepted integer := 0;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'events must be a JSON array' using errcode = '22023';
  end if;
  select count(*) into recent from public.gameplay_events
    where user_id = uid and created_at > now() - interval '1 minute';
  select count(*) into daily from public.gameplay_events
    where user_id = uid and created_at > now() - interval '1 day';
  room := least(50, 120 - recent, 5000 - daily);
  if room <= 0 then return jsonb_build_object('status', 'rate_limited', 'accepted', 0); end if;
  for ev in select value from jsonb_array_elements(p_events) limit room loop
    continue when jsonb_typeof(ev) <> 'object' or coalesce(ev ->> 'e', '') !~ '^[a-z0-9_]{1,40}$';
    insert into public.gameplay_events (user_id, session_id, name, props, client_at)
    values (
      uid,
      case when coalesce(ev ->> 'sid', '') ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$'
           then (ev ->> 'sid')::uuid end,
      ev ->> 'e',
      case when jsonb_typeof(ev -> 'p') = 'object' and pg_column_size(ev -> 'p') <= 2048 then ev -> 'p'
           else '{}'::jsonb end,
      case when coalesce(ev ->> 't', '') ~ '^[0-9]{10,14}$'
           then to_timestamp((ev ->> 't')::double precision / 1000) end
    );
    accepted := accepted + 1;
  end loop;
  return jsonb_build_object('status', 'ok', 'accepted', accepted);
end $$;

-- ------------------------------------------------- runs + validated scores ----
create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  level         smallint not null check (level between 1 and 20),
  difficulty    text not null check (difficulty in ('EASY', 'NORMAL', 'HARD', 'ARCADE')),
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz
);
create index runs_user_time on public.runs (user_id, started_at desc);
alter table public.runs enable row level security;
revoke all on table public.runs from anon, authenticated;

create table public.leaderboard_scores (
  run_id      uuid primary key references public.runs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  level       smallint not null,
  difficulty  text not null,
  score       integer not null check (score between 0 and 200000),
  time_ms     integer not null check (time_ms > 0),
  kos         smallint not null check (kos >= 0),
  rank        text not null check (rank in ('S', 'A', 'B', 'C', 'D')),
  created_at  timestamptz not null default now()
);
create index leaderboard_board on public.leaderboard_scores (level, difficulty, score desc);
alter table public.leaderboard_scores enable row level security;
revoke all on table public.leaderboard_scores from anon, authenticated;

-- A run is opened by the SERVER clock when the level starts; the score later has
-- to fit inside the real time that has passed since.
create or replace function public.start_run(p_level integer, p_difficulty text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n integer;
  rid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select count(*) into n from public.runs where user_id = uid and started_at > now() - interval '1 hour';
  if n >= 60 then raise exception 'too many runs, slow down' using errcode = 'P0001'; end if;
  insert into public.runs (user_id, level, difficulty) values (uid, p_level, upper(p_difficulty))
    returning id into rid;
  return rid;
end $$;

-- Mirrors game.js computeScore() (SCORE: perKo 150, perComboHit 50, perTopHitDmg 5,
-- parTime 600, perSecUnderPar 5, health 2000; ranks S 32000 / A 25000 / B 18000 /
-- C 11000). A plausibility check — a client-side game cannot be made cheat-proof —
-- but a score has to add up, fit the run's real duration and be submitted once.
create or replace function public.submit_score(
  p_run_id uuid, p_score integer, p_parts jsonb, p_time_ms integer, p_kos integer, p_rank text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.runs;
  t numeric;
  elapsed_ms numeric;
  k integer; cb integer; co integer; th integer; tp integer; hp integer;
  want_rank text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if private.is_guest() then return jsonb_build_object('status', 'guest'); end if;
  select * into r from public.runs where id = p_run_id and user_id = uid for update;
  if not found or r.submitted_at is not null then return jsonb_build_object('status', 'invalid_run'); end if;
  elapsed_ms := extract(epoch from (now() - r.started_at)) * 1000;
  t := p_time_ms / 1000.0;
  if p_time_ms < 45000 or p_time_ms > elapsed_ms + 15000 or elapsed_ms > 3 * 3600 * 1000 then
    return jsonb_build_object('status', 'rejected', 'reason', 'time');
  end if;
  if p_parts is null or jsonb_typeof(p_parts) <> 'object' then
    return jsonb_build_object('status', 'rejected', 'reason', 'parts');
  end if;
  k  := coalesce((p_parts ->> 'kos')::integer, -1);
  cb := coalesce((p_parts ->> 'combat')::integer, -1);
  co := coalesce((p_parts ->> 'combo')::integer, -1);
  th := coalesce((p_parts ->> 'topHit')::integer, -1);
  tp := coalesce((p_parts ->> 'time')::integer, -1);
  hp := coalesce((p_parts ->> 'health')::integer, -1);
  if least(k, cb, co, th, tp, hp) < 0
     or p_kos < 0 or p_kos > 80 or k <> p_kos * 150
     or hp > 2000
     or abs(tp - round(greatest(0, 600 - t) * 5)) > 5
     or co % 50 <> 0 or co > 50 * 2000
     or th > 2500
     or cb > 750 * t
     or k + cb + co + th + tp + hp <> p_score then
    return jsonb_build_object('status', 'rejected', 'reason', 'score');
  end if;
  want_rank := case when p_score >= 32000 then 'S' when p_score >= 25000 then 'A'
                    when p_score >= 18000 then 'B' when p_score >= 11000 then 'C' else 'D' end;
  if p_rank is distinct from want_rank then
    return jsonb_build_object('status', 'rejected', 'reason', 'rank');
  end if;
  update public.runs set submitted_at = now() where id = r.id;
  insert into public.leaderboard_scores (run_id, user_id, level, difficulty, score, time_ms, kos, rank)
    values (r.id, uid, r.level, r.difficulty, p_score, p_time_ms, p_kos, want_rank);
  return jsonb_build_object('status', 'ok', 'rank', want_rank);
end $$;

-- Public board: best score per player, display names only (no user ids).
create or replace function public.get_leaderboard(p_level integer, p_difficulty text, p_limit integer default 20)
returns table (display_name text, score integer, rank text, time_ms integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.display_name, s.score, s.rank, s.time_ms, s.created_at
  from (
    select distinct on (ls.user_id) ls.user_id, ls.score, ls.rank, ls.time_ms, ls.created_at
    from public.leaderboard_scores ls
    where ls.level = p_level and ls.difficulty = upper(p_difficulty)
    order by ls.user_id, ls.score desc, ls.created_at asc
  ) s
  join public.profiles p on p.id = s.user_id
  order by s.score desc, s.created_at asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- -------------------------------------------------------------- execute ----
revoke all on function public.save_progress(text, jsonb, integer) from public, anon;
revoke all on function public.load_progress(text) from public, anon;
revoke all on function public.log_events(jsonb) from public, anon;
revoke all on function public.start_run(integer, text) from public, anon;
revoke all on function public.submit_score(uuid, integer, jsonb, integer, integer, text) from public, anon;
revoke all on function public.get_leaderboard(integer, text, integer) from public;
grant execute on function public.save_progress(text, jsonb, integer) to authenticated;
grant execute on function public.load_progress(text) to authenticated;
grant execute on function public.log_events(jsonb) to authenticated;
grant execute on function public.start_run(integer, text) to authenticated;
grant execute on function public.submit_score(uuid, integer, jsonb, integer, integer, text) to authenticated;
grant execute on function public.get_leaderboard(integer, text, integer) to anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
