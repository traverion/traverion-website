-- Phase 1020: adversarial regression coverage for migration 111
-- (supplier_message_campaigns cross-supplier booking_ids ownership).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_111
--   sudo -u postgres psql -d traverion_test_111 -f supabase/tests/supplier_message_campaigns_ownership_guard.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable
as $$ select coalesce(current_setting('test.role', true), 'anon') $$;

create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  guest_user_id uuid,
  guest_email text
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public to test_actor;
grant select, insert, update, delete on public.listings, public.bookings to test_actor;

create table public.supplier_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  subject text not null,
  scope text not null check (scope in ('selected', 'filtered')),
  filters_snapshot jsonb,
  booking_ids uuid[] not null default '{}',
  recipients text[] not null default '{}',
  recipients_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'partial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplier_message_campaigns enable row level security;

create policy "Suppliers can read own message campaigns"
  on public.supplier_message_campaigns
  for select using (supplier_id = auth.uid());

create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns
  for insert with check (supplier_id = auth.uid());

create policy "Suppliers can update own message campaigns"
  on public.supplier_message_campaigns
  for update using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

grant select, insert, update on public.supplier_message_campaigns to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'supplier-b@example.com');

insert into public.listings (id, supplier_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222');

insert into public.bookings (id, listing_id, guest_user_id, guest_email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'traveler@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'other-traveler@example.com');

-- GAP CONFIRMED
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  insert into public.supplier_message_campaigns (supplier_id, subject, scope, booking_ids, recipients)
  values (
    '22222222-2222-2222-2222-222222222222',
    'PRE-FIX planted',
    'selected',
    array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
    array['traveler@example.com']
  );
  raise notice 'GAP CONFIRMED: pre-fix policy let supplier B plant a campaign referencing supplier A''s booking';
exception
  when others then
    raise exception 'TEST SETUP INVALID: pre-fix insert was unexpectedly blocked (%)', sqlerrm;
end
$$;
rollback;

\ir ../migrations/111_supplier_message_campaigns_ownership_guard.sql

-- POST-FIX cross-tenant blocked
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_message_campaigns (supplier_id, subject, scope, booking_ids, recipients)
    values (
      '22222222-2222-2222-2222-222222222222',
      'POST-FIX attempt',
      'selected',
      array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
      array['traveler@example.com']
    );
    raise exception 'REGRESSION: post-fix policy still let supplier B plant a campaign on supplier A''s booking';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix cross-tenant insert correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- Genuine insert + update + empty OK
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_message_campaigns (id, supplier_id, subject, scope, booking_ids, recipients, status)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '22222222-2222-2222-2222-222222222222',
  'GENUINE-OK',
  'selected',
  array['dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid],
  array['other@example.com'],
  'queued'
);

update public.supplier_message_campaigns
  set status = 'sent', sent_count = 1
  where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

do $$
begin
  if not exists (
    select 1 from public.supplier_message_campaigns
    where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and status = 'sent'
  ) then
    raise exception 'REGRESSION: genuine same-supplier campaign UPDATE was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier campaign UPDATE correctly succeeded';
end
$$;

-- UPDATE that repoints booking_ids onto competitor must fail
do $$
begin
  begin
    update public.supplier_message_campaigns
      set booking_ids = array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid]
      where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    raise exception 'REGRESSION: campaign UPDATE was allowed to repoint booking_ids onto competitor booking';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'competitor booking_ids UPDATE correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- MUTATION
drop policy "Suppliers can write own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns
  for insert with check (supplier_id = auth.uid());

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_message_campaigns (supplier_id, subject, scope, booking_ids, recipients)
    values (
      '22222222-2222-2222-2222-222222222222',
      'MUTATION-REOPENED',
      'selected',
      array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
      array['traveler@example.com']
    );
    raise notice 'MUTATION CHECK OK: with the INSERT guard removed, the gap reopens as expected.';
  exception when others then
    raise exception 'MUTATION CHECK FAILED: gap did not reopen after removing the fix (%).', sqlerrm;
  end;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (111)' as result;
