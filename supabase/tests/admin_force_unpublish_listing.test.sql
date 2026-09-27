-- Phase 1001: staff force-unpublish RPC + audit + client deny.
--
-- Run manually:
--   createdb traverion_test_107
--   psql -d traverion_test_107 -f this_file.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated');
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('email', coalesce(nullif(current_setting('test.email', true), ''), ''));
$$;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  title text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id),
  status text not null default 'confirmed',
  payment_status text,
  booking_date date,
  check_out date
);

\ir ../migrations/107_admin_force_unpublish_listing.sql

drop role if exists test_actor_107;
create role test_actor_107 login;
grant usage on schema public to test_actor_107;
grant usage on schema auth to test_actor_107;
grant select, insert, update, delete on table public.listings to test_actor_107;
grant select, insert, update, delete on table public.bookings to test_actor_107;
-- Explicitly no EXECUTE on admin_force_unpublish_listing and no DML on audit table
-- (mirrors anon/authenticated revoke in migration 107).
revoke all on table public.admin_listing_moderation_events from test_actor_107;
revoke all on function public.admin_force_unpublish_listing(uuid, text, uuid, text) from test_actor_107;

do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_listing uuid;
  v_res jsonb;
  v_cnt int;
begin
  insert into auth.users (id) values (v_supplier), (v_actor);

  insert into public.listings (supplier_id, title, status)
  values (v_supplier, 'Moderation test tour', 'published')
  returning id into v_listing;

  insert into public.bookings (listing_id, status, payment_status, booking_date)
  values (v_listing, 'confirmed', 'paid', (timezone('utc', now()))::date + 7);

  -- Authenticated role cannot execute the RPC
  begin
    set local role test_actor_107;
    perform set_config('test.uid', v_actor::text, true);
    perform set_config('test.role', 'authenticated', true);
    perform public.admin_force_unpublish_listing(v_listing, 'spam listing', v_actor, 'staff@example.com');
    raise exception 'expected permission denied for authenticated';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%permission denied%' then
        null;
      else
        raise;
      end if;
  end;
  reset role;

  -- Direct table insert into audit denied for authenticated (no grants)
  begin
    set local role test_actor_107;
    insert into public.admin_listing_moderation_events (
      listing_id, action, previous_status, new_status, reason
    ) values (v_listing, 'force_unpublish', 'published', 'draft', 'bypass');
    raise exception 'expected audit insert denied';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%permission denied%' then
        null;
      else
        raise;
      end if;
  end;
  reset role;

  -- Service path (table owner / postgres) succeeds
  v_res := public.admin_force_unpublish_listing(
    v_listing,
    'Unsafe content reported',
    v_actor,
    'staff@example.com'
  );
  if (v_res->>'ok')::boolean is not true then
    raise exception 'force unpublish failed: %', v_res;
  end if;
  if (v_res->>'skipped')::boolean is true then
    raise exception 'should not skip published listing';
  end if;
  if (v_res->>'new_status') is distinct from 'draft' then
    raise exception 'expected draft, got %', v_res->>'new_status';
  end if;
  if (v_res->>'upcoming_paid_bookings')::int <> 1 then
    raise exception 'expected 1 upcoming paid, got %', v_res->>'upcoming_paid_bookings';
  end if;

  if (select status from public.listings where id = v_listing) <> 'draft' then
    raise exception 'listing status not draft';
  end if;

  select count(*) into v_cnt from public.admin_listing_moderation_events where listing_id = v_listing;
  if v_cnt <> 1 then
    raise exception 'expected 1 audit row, got %', v_cnt;
  end if;

  -- Idempotent skip when already draft
  v_res := public.admin_force_unpublish_listing(v_listing, 'again', v_actor, 'staff@example.com');
  if (v_res->>'ok')::boolean is not true or (v_res->>'skipped')::boolean is not true then
    raise exception 'expected skip on already-draft: %', v_res;
  end if;
  select count(*) into v_cnt from public.admin_listing_moderation_events where listing_id = v_listing;
  if v_cnt <> 1 then
    raise exception 'skip must not write second audit row, got %', v_cnt;
  end if;

  -- Short reason rejected
  v_res := public.admin_force_unpublish_listing(v_listing, 'no', v_actor, null);
  if (v_res->>'ok')::boolean is not false then
    raise exception 'short reason should fail';
  end if;

  raise notice 'admin_force_unpublish_listing.test.sql PASS';
end;
$$;
