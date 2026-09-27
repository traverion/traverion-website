-- Phase 1245: adversarial coverage for listing_group_size_is_parseable (169/171).
-- Manual scratch Postgres:
--   createdb traverion_test_group_size
--   psql -d traverion_test_group_size -f supabase/tests/listing_group_size_parseable.test.sql
--   dropdb traverion_test_group_size

\set ON_ERROR_STOP on

create schema if not exists public;

-- Apply the Phase 1243 definition (supersedes 169 regex-only helper).
\ir ../migrations/171_listing_group_size_parseable_bounds.sql

do $$
begin
  if not public.listing_group_size_is_parseable('1-8 People') then
    raise exception 'EXPECTED: 1-8 People is parseable';
  end if;
  if not public.listing_group_size_is_parseable('2–12') then
    raise exception 'EXPECTED: en-dash range is parseable';
  end if;
  if public.listing_group_size_is_parseable(null) then
    raise exception 'EXPECTED: null group_size is not parseable';
  end if;
  if public.listing_group_size_is_parseable('Small group') then
    raise exception 'EXPECTED: prose group_size is not parseable';
  end if;
  if public.listing_group_size_is_parseable('8-2 People') then
    raise exception 'EXPECTED: inverted range is not parseable (Phase 1243)';
  end if;
  if public.listing_group_size_is_parseable('0-8 People') then
    raise exception 'EXPECTED: min < 1 is not parseable (Phase 1243)';
  end if;
  raise notice 'ALL ASSERTIONS PASSED';
end $$;
