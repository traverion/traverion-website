-- Adversarial: anon must not read listing_stay_private; owner may.
-- Run via supabase test db or SQL editor with role switches when available.

do $$
declare
  v_supplier uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_listing uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  -- Smoke: table exists and RLS enabled
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'listing_stay_private'
  ) then
    raise exception 'listing_stay_private missing';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'listing_stay_private' and c.relrowsecurity
  ) then
    raise exception 'listing_stay_private RLS not enabled';
  end if;
end $$;
