-- LOCAL TEST ONLY — a minimal stand-in for what a Supabase project already has,
-- so the migration and rls_tests.sql can run on plain Postgres / PGlite.
-- Never apply this to a real Supabase project (it already has all of it).
--   roles  anon, authenticated, service_role (as Supabase names them)
--   auth   auth.users (with is_anonymous), auth.uid(), auth.jwt() reading
--          request.jwt.claims exactly as PostgREST sets it
--   the default privileges Supabase gives anon/authenticated on new objects in
--   `public`, so the migration's REVOKEs are really exercised.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id            uuid primary key,
  email         text,
  is_anonymous  boolean not null default false,
  created_at    timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
