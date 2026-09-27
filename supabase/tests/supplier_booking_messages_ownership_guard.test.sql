-- Phase 1019: adversarial regression coverage for migration 110
-- (supplier_booking_messages cross-supplier booking_ids ownership guard
-- + missing UPDATE policy).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_110
--   sudo -u postgres psql -d traverion_test_110 -f supabase/tests/supplier_booking_messages_ownership_guard.test.sql

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

-- ============================================================
-- CURRENT pre-110 migration 016 body for messages, verbatim.
-- ============================================================
create table public.supplier_booking_messages (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  subject text not null,
  recipients text[] not null default '{}',
  booking_ids uuid[] not null default '{}',
  channel text not null default 'email' check (channel in ('email', 'sms', 'other')),
  body_preview text,
  delivery_status text default 'queued',
  created_at timestamptz not null default now()
);

alter table public.supplier_booking_messages enable row level security;

create policy "Suppliers can read own booking messages"
  on public.supplier_booking_messages
  for select
  using (supplier_id = auth.uid());

create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages
  for insert
  with check (supplier_id = auth.uid());

-- Intentionally NO UPDATE policy pre-fix (mirrors production 016/017).

grant select, insert, update on public.supplier_booking_messages to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'supplier-b@example.com');

insert into public.listings (id, supplier_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222');

insert into public.bookings (id, listing_id, guest_user_id, guest_email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'traveler@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'other-traveler@example.com');

-- ============================================================
-- GAP CONFIRMED: B plants a message referencing A's booking_id.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  insert into public.supplier_booking_messages (supplier_id, subject, recipients, booking_ids, body_preview)
  values (
    '22222222-2222-2222-2222-222222222222',
    'PRE-FIX planted',
    array['traveler@example.com'],
    array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
    'competitor booking'
  );
  raise notice 'GAP CONFIRMED: pre-fix policy let supplier B plant a message referencing supplier A''s booking';
exception
  when others then
    raise exception 'TEST SETUP INVALID: pre-fix insert was unexpectedly blocked (%) -- hypothesis not reproduced against current code', sqlerrm;
end
$$;
rollback;

-- ============================================================
-- GAP CONFIRMED: UPDATE is denied pre-fix (no policy).
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_booking_messages (id, supplier_id, subject, recipients, booking_ids, delivery_status)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '22222222-2222-2222-2222-222222222222',
  'own message',
  array['other@example.com'],
  array['dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid],
  'queued'
);

do $$
declare
  updated_count int;
begin
  update public.supplier_booking_messages
    set delivery_status = 'sent'
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  get diagnostics updated_count = row_count;
  if updated_count > 0 then
    raise exception 'TEST SETUP INVALID: pre-fix UPDATE unexpectedly succeeded (expected zero rows under missing UPDATE policy)';
  end if;
  raise notice 'GAP CONFIRMED: pre-fix UPDATE of own delivery_status affected 0 rows (missing UPDATE policy)';
end
$$;
rollback;

-- ============================================================
-- Apply the real migration 110 fix.
-- ============================================================
\ir ../migrations/110_supplier_booking_messages_ownership_guard.sql

-- ============================================================
-- POST-FIX: cross-tenant insert rejected.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_booking_messages (supplier_id, subject, recipients, booking_ids)
    values (
      '22222222-2222-2222-2222-222222222222',
      'POST-FIX attempt',
      array['traveler@example.com'],
      array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid]
    );
    raise exception 'REGRESSION: post-fix policy still let supplier B plant a message on supplier A''s booking';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix cross-tenant insert correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- ============================================================
-- POST-FIX: genuine insert + delivery update + empty booking_ids OK.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_booking_messages (id, supplier_id, subject, recipients, booking_ids, delivery_status)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '22222222-2222-2222-2222-222222222222',
  'GENUINE-OK',
  array['other@example.com'],
  array['dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid],
  'queued'
);

update public.supplier_booking_messages
  set delivery_status = 'sent'
  where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_messages
    where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and delivery_status = 'sent'
  ) then
    raise exception 'REGRESSION: genuine same-supplier delivery UPDATE was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier delivery UPDATE correctly succeeded';
end
$$;

insert into public.supplier_booking_messages (supplier_id, subject, recipients, booking_ids)
values (
  '22222222-2222-2222-2222-222222222222',
  'EMPTY-OK',
  array[]::text[],
  array[]::uuid[]
);

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_messages
    where subject = 'EMPTY-OK' and cardinality(booking_ids) = 0
  ) then
    raise exception 'REGRESSION: empty booking_ids insert was wrongly rejected';
  end if;
  raise notice 'empty booking_ids insert correctly succeeded';
end
$$;

-- Mixed array (own + competitor) must fail.
do $$
begin
  begin
    insert into public.supplier_booking_messages (supplier_id, subject, recipients, booking_ids)
    values (
      '22222222-2222-2222-2222-222222222222',
      'MIXED-BAD',
      array['x@example.com'],
      array[
        'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
      ]
    );
    raise exception 'REGRESSION: mixed own+competitor booking_ids insert was allowed';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'mixed booking_ids insert correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- ============================================================
-- MUTATION TEST: revert INSERT guard; gap reopens.
-- ============================================================
drop policy "Suppliers can write own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages
  for insert
  with check (supplier_id = auth.uid());

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_booking_messages (supplier_id, subject, recipients, booking_ids)
    values (
      '22222222-2222-2222-2222-222222222222',
      'MUTATION-REOPENED',
      array['traveler@example.com'],
      array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid]
    );
    raise notice 'MUTATION CHECK OK: with the INSERT guard removed, the gap reopens as expected.';
  exception when others then
    raise exception 'MUTATION CHECK FAILED: gap did not reopen after removing the fix (%).', sqlerrm;
  end;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (110)' as result;
