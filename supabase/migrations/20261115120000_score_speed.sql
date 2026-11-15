-- Request 640: SPEED PAYS. The time part of the score goes from 5 to 40 points per second under the
-- 600 s par (game.js SCORE.perSecUnderPar), so a fast clear outranks a long grind: on the real Level 1
-- bests (241-497 s) the old rate made the difference between a 4 and an 8 minute clear ~1,150 points,
-- less than the extra hits a slow run lands. Everything else (parts, ranks) is unchanged.
-- The time check accepts the old 5-point rate as well, for a page loaded before the update.
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
     or (abs(tp - round(greatest(0, 600 - t) * 40)) > 40 and abs(tp - round(greatest(0, 600 - t) * 5)) > 5)
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
