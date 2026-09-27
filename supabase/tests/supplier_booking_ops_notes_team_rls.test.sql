-- Phase 1198: adversarial coverage for migration 152.
-- Team JWT must SELECT/INSERT/UPDATE/DELETE owner-keyed ops notes;
-- stranger must not; cross-supplier booking plant still rejected (108 EXISTS).
--
-- Run manually when a local Postgres is available:
--   sudo -u postgres createdb traverion_test_152
--   sudo -u postgres psql -d traverion_test_152 -f supabase/tests/supplier_booking_ops_notes_team_rls.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create extension if not exists pgcrypto;

create table public.supplier_team_members (
  supplier_id text not null,
  user_id text not null,
  primary key (supplier_id, user_id)
);

create or replace function public.is_supplier_account_side(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_supplier_id is not null
    and (
      p_supplier_id = auth.uid()
      or exists (
        select 1
        from public.supplier_team_members stm
        where stm.supplier_id = p_supplier_id::text
          and stm.user_id = auth.uid()::text
      )
    );
$$;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id)
);
create table public.supplier_booking_ops_notes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id),
  note text not null,
  updated_at timestamptz not null default now()
);

alter table public.supplier_booking_ops_notes enable row level security;

-- Pre-152 owner-only policies (015/108 shape).
create policy "Suppliers can read own booking notes"
  on public.supplier_booking_ops_notes for select
  using (supplier_id = auth.uid());
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes for insert
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );
create policy "Suppliers can update own booking notes"
  on public.supplier_booking_ops_notes for update
  using (supplier_id = auth.uid())
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );
create policy "Suppliers can delete own booking notes"
  on public.supplier_booking_ops_notes for delete
  using (supplier_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select, insert, update, delete on public.supplier_booking_ops_notes, public.listings, public.bookings, public.supplier_team_members to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'team@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'other@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.supplier_team_members (supplier_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.listings (id, supplier_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333');

insert into public.bookings (id, listing_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into public.supplier_booking_ops_notes (booking_id, supplier_id, note) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'owner note');

-- GAP: team JWT cannot SELECT before 152.
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_booking_ops_notes
    where supplier_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'GAP expected: team SELECT should fail before 152, got %', n;
  end if;
end $$;
reset role;

-- Apply migration 152 body.
drop policy if exists "Suppliers can read own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can read own booking notes"
  on public.supplier_booking_ops_notes for select
  using (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can upsert own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes for insert
  with check (
    public.is_supplier_account_side(supplier_id)
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );

drop policy if exists "Suppliers can update own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can update own booking notes"
  on public.supplier_booking_ops_notes for update
  using (public.is_supplier_account_side(supplier_id))
  with check (
    public.is_supplier_account_side(supplier_id)
    and exists (
      select 1 from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );

drop policy if exists "Suppliers can delete own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can delete own booking notes"
  on public.supplier_booking_ops_notes for delete
  using (public.is_supplier_account_side(supplier_id));

-- Team can SELECT owner note.
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_booking_ops_notes
    where supplier_id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'team SELECT after 152 expected 1, got %', n;
  end if;
end $$;

-- Team can UPDATE owner note.
update public.supplier_booking_ops_notes
  set note = 'team updated'
  where booking_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and supplier_id = '11111111-1111-1111-1111-111111111111';
do $$
declare n text;
begin
  select note into n from public.supplier_booking_ops_notes
    where booking_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if n is distinct from 'team updated' then
    raise exception 'team UPDATE failed, note=%', n;
  end if;
end $$;

-- Team cannot plant note on other supplier's booking under owner id.
do $$
begin
  begin
    insert into public.supplier_booking_ops_notes (booking_id, supplier_id, note)
    values (
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      '11111111-1111-1111-1111-111111111111',
      'cross plant'
    );
    raise exception 'cross-supplier plant should have been rejected';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end $$;

-- Stranger cannot SELECT.
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_booking_ops_notes;
  if n <> 0 then
    raise exception 'stranger SELECT should be empty, got %', n;
  end if;
end $$;
reset role;

select 'supplier_booking_ops_notes_team_rls.test.sql OK' as result;
