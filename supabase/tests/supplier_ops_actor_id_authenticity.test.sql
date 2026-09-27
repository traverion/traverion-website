-- Phase 1026: adversarial coverage for migration 116 (actor_id authenticity).
-- Focuses on supplier_booking_events (representative) + supplier_export_runs.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_116
--   sudo -u postgres psql -d traverion_test_116 -f supabase/tests/supplier_ops_actor_id_authenticity.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id)
);

create table public.supplier_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details text,
  created_at timestamptz not null default now()
);

create table public.supplier_export_runs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null default 'bookings',
  format text not null default 'csv',
  scope text not null default 'filtered',
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Minimal sibling tables so 116 can drop/recreate their policies without error.
create table public.supplier_booking_messages (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  actor_id uuid,
  subject text not null default '',
  recipients text[] not null default '{}',
  booking_ids uuid[] not null default '{}',
  channel text not null default 'email',
  body_preview text,
  created_at timestamptz not null default now()
);
create table public.supplier_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  actor_id uuid,
  subject text not null default '',
  scope text not null default 'selected',
  booking_ids uuid[] not null default '{}',
  recipients text[] not null default '{}',
  recipients_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplier_booking_events enable row level security;
alter table public.supplier_export_runs enable row level security;
alter table public.supplier_booking_messages enable row level security;
alter table public.supplier_message_campaigns enable row level security;

-- Pre-116 events policy (ownership already applied as in 109, no actor check)
create policy "Suppliers can write own booking events"
  on public.supplier_booking_events for insert
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_events.booking_id
        and l.supplier_id = supplier_booking_events.supplier_id
    )
  );

create policy "Suppliers can write own export runs"
  on public.supplier_export_runs for insert
  with check (supplier_id = auth.uid());

-- Placeholder policies so drop in 116 succeeds
create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages for insert with check (supplier_id = auth.uid());
create policy "Suppliers can update own booking messages"
  on public.supplier_booking_messages for update using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());
create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns for insert with check (supplier_id = auth.uid());
create policy "Suppliers can update own message campaigns"
  on public.supplier_message_campaigns for update using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select, insert on public.listings, public.bookings, public.supplier_booking_events, public.supplier_export_runs to test_actor;
grant select, insert, update on public.supplier_booking_messages, public.supplier_message_campaigns to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'victim@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'supplier@example.com');

insert into public.listings (id, supplier_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222');
insert into public.bookings (id, listing_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- GAP: spoof actor_id
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  insert into public.supplier_booking_events (booking_id, supplier_id, actor_id, event_type, details)
  values (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'note',
    'spoofed actor'
  );
  raise notice 'GAP CONFIRMED: pre-fix allowed actor_id spoof on booking events';
exception when others then
  raise exception 'TEST SETUP INVALID: pre-fix spoof unexpectedly blocked (%)', sqlerrm;
end
$$;
rollback;

\ir ../migrations/116_supplier_ops_actor_id_authenticity.sql

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  begin
    insert into public.supplier_booking_events (booking_id, supplier_id, actor_id, event_type, details)
    values (
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      'note',
      'spoofed actor'
    );
    raise exception 'REGRESSION: actor_id spoof still allowed on events';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'events actor spoof correctly blocked: %', sqlerrm;
  end;

  insert into public.supplier_booking_events (booking_id, supplier_id, actor_id, event_type, details)
  values (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'note',
    'genuine actor'
  );

  begin
    insert into public.supplier_export_runs (supplier_id, actor_id, kind, format, scope)
    values (
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      'bookings', 'csv', 'filtered'
    );
    raise exception 'REGRESSION: actor_id spoof still allowed on export_runs';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'export_runs actor spoof correctly blocked: %', sqlerrm;
  end;

  insert into public.supplier_export_runs (supplier_id, actor_id, kind, format, scope)
  values (
    '22222222-2222-2222-2222-222222222222',
    null,
    'bookings', 'csv', 'filtered'
  );
  raise notice 'genuine null actor_id export insert OK';
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (116)' as result;
