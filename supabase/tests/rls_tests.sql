-- Ratel Rage — RLS / grant / RPC tests for 20261009120000_player_accounts.sql.
--
-- Runs inside ONE transaction that is rolled back, so it is safe on a staging
-- project: paste into the Supabase SQL editor (it runs as `postgres`) or
-- `psql "$DB_URL" -f supabase/tests/rls_tests.sql`. Any failed expectation
-- raises and aborts; a clean run ends with "ALL RLS TESTS PASSED".
-- Locally, _chromakey/accountsqltest.js runs this same file on PGlite with a
-- Supabase auth stub.
--
-- Actors:  G guest (anonymous)   R registered   O another registered player
--          anon = a visitor with only the public anon key (no session)

begin;

insert into auth.users (id, email, is_anonymous) values
  ('11111111-1111-4111-8111-111111111111', null, true),
  ('22222222-2222-4222-8222-222222222222', 'r@example.test', false),
  ('33333333-3333-4333-8333-333333333333', 'o@example.test', false);

-- ---------------------------------------------------------------- as postgres
do $$ begin
  assert (select count(*) from public.profiles) = 3, 'profiles auto-created for every auth user';
  assert (select converted_at is null from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'guest profile not marked converted';
  assert (select converted_at is not null from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'registered profile marked converted';
  assert (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Ratel-111111', 'default name derived from id, no PII';
  assert (select bool_and(relrowsecurity) from pg_class
          where relnamespace = 'public'::regnamespace and relname in
          ('profiles', 'cloud_saves', 'gameplay_events', 'runs', 'leaderboard_scores')), 'RLS enabled on every table';
  raise notice 'PASS setup: profiles created, RLS on all 5 tables';
end $$;

-- ---------------------------------------------------------------- as anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform 1 from public.profiles; raise exception 'FAIL anon read profiles'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.cloud_saves; raise exception 'FAIL anon read cloud_saves'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.gameplay_events; raise exception 'FAIL anon read gameplay_events'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.runs; raise exception 'FAIL anon read runs'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.leaderboard_scores; raise exception 'FAIL anon read leaderboard_scores'; exception when insufficient_privilege then null; end;
  begin perform public.save_progress('main', '{}'::jsonb, 0); raise exception 'FAIL anon save_progress'; exception when insufficient_privilege then null; end;
  begin perform public.log_events('[]'::jsonb); raise exception 'FAIL anon log_events'; exception when insufficient_privilege then null; end;
  begin perform public.start_run(1, 'NORMAL'); raise exception 'FAIL anon start_run'; exception when insufficient_privilege then null; end;
  begin perform private.is_guest(); raise exception 'FAIL anon private schema'; exception when insufficient_privilege then null; end;
  perform * from public.get_leaderboard(1, 'NORMAL', 10);   -- the public board IS readable
  raise notice 'PASS anon: no table access, no write RPCs, private schema closed, leaderboard readable';
end $$;
reset role;

-- ---------------------------------------------------------------- as guest G
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;
do $$
declare r jsonb; n integer;
begin
  -- profiles: own row only, display_name only
  assert (select count(*) from public.profiles) = 1, 'guest sees exactly one profile';
  assert (select id from public.profiles) = '11111111-1111-4111-8111-111111111111', 'guest sees only own profile';
  update public.profiles set display_name = 'Guest_Ratel' where id = '11111111-1111-4111-8111-111111111111';
  assert (select display_name from public.profiles) = 'Guest_Ratel', 'guest renames self';
  update public.profiles set display_name = 'Hijack' where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics n = row_count;
  assert n = 0, 'guest cannot rename someone else';
  begin update public.profiles set converted_at = now(); raise exception 'FAIL guest wrote converted_at'; exception when insufficient_privilege then null; end;
  begin insert into public.profiles (id, display_name) values (gen_random_uuid(), 'Fake_Player'); raise exception 'FAIL guest inserted profile'; exception when insufficient_privilege then null; end;
  begin delete from public.profiles; raise exception 'FAIL guest deleted profile'; exception when insufficient_privilege then null; end;
  begin update public.profiles set display_name = 'x' ; raise exception 'FAIL short name accepted'; exception when check_violation then null; end;

  -- cloud saves: versioned writes through the RPC only
  r := public.save_progress('main', '{"levels":{"1":{"completions":1}}}'::jsonb, 0);
  assert r ->> 'status' = 'ok' and (r ->> 'version')::int = 1, 'guest first save -> v1';
  r := public.save_progress('main', '{"levels":{"1":{"completions":2}}}'::jsonb, 1);
  assert r ->> 'status' = 'ok' and (r ->> 'version')::int = 2, 'guest second save -> v2';
  r := public.save_progress('main', '{"levels":{"1":{"completions":0}}}'::jsonb, 1);
  assert r ->> 'status' = 'conflict' and (r ->> 'version')::int = 2
     and (r -> 'data' -> 'levels' -> '1' ->> 'completions')::int = 2, 'stale write refused, server copy returned, not overwritten';
  r := public.load_progress('main');
  assert (r ->> 'version')::int = 2 and (r -> 'data' -> 'levels' -> '1' ->> 'completions')::int = 2, 'load returns the kept copy';
  begin insert into public.cloud_saves (user_id, slot, data) values ('11111111-1111-4111-8111-111111111111', 'x', '{}'); raise exception 'FAIL direct insert cloud_saves'; exception when insufficient_privilege then null; end;
  begin update public.cloud_saves set data = '{}'; raise exception 'FAIL direct update cloud_saves'; exception when insufficient_privilege then null; end;
  begin perform public.save_progress('main', '[1,2]'::jsonb, 2); raise exception 'FAIL non-object save'; exception when invalid_parameter_value then null; end;

  -- analytics: insert-only through the RPC, invalid names dropped, never readable
  r := public.log_events('[{"e":"level_start","p":{"level":1},"sid":"5fd73dc5-b55e-4ceb-8e16-da16b3fae3db","t":1791535929663},
                           {"e":"game_over","p":{"level":1}},{"e":"retry"},{"e":"DROP TABLE"}]'::jsonb);
  assert r ->> 'status' = 'ok' and (r ->> 'accepted')::int = 3, 'guest logs 3 valid events, bad name dropped';
  begin perform 1 from public.gameplay_events; raise exception 'FAIL guest read events'; exception when insufficient_privilege then null; end;

  -- scores: guests may open runs but cannot post to the board
  r := jsonb_build_object('run', public.start_run(1, 'normal'));
  assert (select (public.submit_score((r ->> 'run')::uuid, 0, '{}'::jsonb, 60000, 0, 'D')) ->> 'status') = 'guest', 'guest score not accepted';
  begin perform private.is_guest(); raise exception 'FAIL authenticated reached private schema'; exception when insufficient_privilege then null; end;
  raise notice 'PASS guest: own profile only, versioned cloud save, events insert-only, no leaderboard posts';
end $$;
reset role;

-- ------------------------------------------------- rate limit (as guest G)
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;
do $$
declare r jsonb; total integer := 3; i integer;
begin
  for i in 1..3 loop
    r := public.log_events((select jsonb_agg(jsonb_build_object('e', 'spam')) from generate_series(1, 60)));
    total := total + (r ->> 'accepted')::int;
  end loop;
  assert (r ->> 'status') = 'rate_limited' or total <= 120, 'per-minute cap holds';
  assert total = 120, format('exactly 120 events accepted in the minute (got %s)', total);
  r := public.log_events('[{"e":"one_more"}]'::jsonb);
  assert r ->> 'status' = 'rate_limited', 'further events refused, not errors';
  raise notice 'PASS rate limit: 50 per call, 120 per minute, overflow dropped quietly';
end $$;
reset role;

-- ------------------------------------------------- as other player O (owner-only)
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
do $$
declare r jsonb;
begin
  assert (select count(*) from public.cloud_saves) = 0, 'O cannot see G''s save';
  r := public.load_progress('main');
  assert r ->> 'status' = 'empty', 'O''s load does not return G''s save';
  r := public.save_progress('main', '{"mine":true}'::jsonb, 0);
  assert r ->> 'status' = 'ok', 'O saves own slot (same slot name as G, separate row)';
  assert (select count(*) from public.cloud_saves) = 1, 'O sees only own save';
  raise notice 'PASS owner-only: saves are per user, same slot names never collide';
end $$;
reset role;

-- ---------------------------------------------- registered R: validated scores
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
create temp table _run on commit drop as select public.start_run(1, 'NORMAL') as id;
grant select on _run to authenticated;
do $$
declare rid uuid := (select id from _run); r jsonb;
begin
  -- 150 s claimed, but the run was opened a moment ago: impossible
  r := public.submit_score(rid, 28700, '{"kos":3150,"combat":20000,"combo":1500,"topHit":300,"time":2250,"health":1500}', 150000, 21, 'A');
  assert r ->> 'status' = 'rejected' and r ->> 'reason' = 'time', 'a score faster than the clock is rejected';
  raise notice 'PASS score timing: cannot claim more play time than has passed';
end $$;
reset role;
update public.runs set started_at = now() - interval '5 minutes' where id = (select id from _run);   -- (as postgres) the run "began" 5 min ago
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
do $$
declare rid uuid := (select id from _run); r jsonb; other uuid;
begin
  r := public.submit_score(rid, 28701, '{"kos":3150,"combat":20000,"combo":1500,"topHit":300,"time":2250,"health":1500}', 150000, 21, 'A');
  assert r ->> 'reason' = 'score', 'parts that do not add up are rejected';
  r := public.submit_score(rid, 28700, '{"kos":3150,"combat":20000,"combo":1500,"topHit":300,"time":2250,"health":1500}', 150000, 21, 'S');
  assert r ->> 'reason' = 'rank', 'a rank that does not match the score is rejected';
  r := public.submit_score(rid, 31700, '{"kos":3150,"combat":20000,"combo":1500,"topHit":300,"time":2250,"health":4500}', 150000, 21, 'A');
  assert r ->> 'reason' = 'score', 'health over 2000 is rejected';
  r := public.submit_score(rid, 28700, '{"kos":3150,"combat":20000,"combo":1500,"topHit":300,"time":2250,"health":1500}', 150000, 21, 'A');
  assert r ->> 'status' = 'ok' and r ->> 'rank' = 'A', 'a consistent score is accepted';
  r := public.submit_score(rid, 28700, '{"kos":3150,"combat":20000,"combo":1500,"topHit":300,"time":2250,"health":1500}', 150000, 21, 'A');
  assert r ->> 'status' = 'invalid_run', 'a run can be submitted once';
  assert (select count(*) from public.get_leaderboard(1, 'normal', 10)) = 1, 'board lists the score';
  assert (select display_name from public.get_leaderboard(1, 'NORMAL', 10)) = 'Ratel-222222', 'board shows display names';
  begin insert into public.leaderboard_scores (run_id, user_id, level, difficulty, score, time_ms, kos, rank)
        values (rid, '22222222-2222-4222-8222-222222222222', 1, 'NORMAL', 199999, 1000, 0, 'S');
        raise exception 'FAIL direct score insert'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.runs; raise exception 'FAIL read runs'; exception when insufficient_privilege then null; end;
  raise notice 'PASS registered: validated submit, one per run, tampering rejected, direct writes denied';
end $$;
reset role;

-- O cannot submit R's run
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
do $$ begin
  assert (public.submit_score((select id from _run), 1, '{}', 60000, 0, 'D')) ->> 'status' = 'invalid_run', 'cannot use another player''s run';
  raise notice 'PASS owner-only runs';
end $$;
reset role;

-- authenticated role WITHOUT a user id (expired / forged session)
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin perform public.save_progress('main', '{}'::jsonb, 0); raise exception 'FAIL save without uid'; exception when sqlstate '28000' then null; end;
  begin perform public.log_events('[]'::jsonb); raise exception 'FAIL events without uid'; exception when sqlstate '28000' then null; end;
  raise notice 'PASS no-uid sessions are refused';
end $$;
reset role;

-- ------------------------------------------- guest -> account conversion keeps everything
update auth.users set is_anonymous = false, email = 'g@example.test' where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  assert (select converted_at is not null from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'conversion stamped';
  assert (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Guest_Ratel', 'profile kept';
  assert (select version from public.cloud_saves where user_id = '11111111-1111-4111-8111-111111111111') = 2, 'cloud save kept';
  raise notice 'PASS conversion: same UUID keeps profile and save, converted_at stamped';
end $$;

do $$ begin raise notice 'ALL RLS TESTS PASSED'; end $$;
rollback;
