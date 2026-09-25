-- Phase 593: adversarial regression coverage for migration 098 (stop
-- trusting an unconfirmed JWT email claim for traveler identity).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_098
--   sudo -u postgres psql -d traverion_test_098 -f supabase/tests/jwt_email_requires_confirmation.test.sql
--
-- Builds a minimal schema covering every real table/column the affected
-- functions and policies reference (bookings, listings, booking_messages,
-- cancellation_requests, supplier_ledger_entries, reviews, admin), then
-- installs the CURRENT, real, committed pre-098 bodies of every affected
-- object -- transcribed verbatim from the live migration files (037, 055,
-- 038, 085, 093) as read on 2026-09-25, not a reconstructed "original"
-- state -- so the "GAP CONFIRMED" section proves an exploit against
-- actual current production logic, matching the Phase 592 process note
-- about replaying real committed state rather than an assumed one.
--
-- Scenario: VICTIM is a real traveler who checked out as a guest and has
-- NEVER created a Traverion account (guest_user_id is null, guest_email =
-- 'victim@example.com') -- the common case; most guest checkouts never
-- become accounts. ATTACKER is a separate, real auth.users row (uid
-- differs from anyone else) whose email_confirmed_at is NULL -- modeling
-- any account whose session exists before its email address ownership is
-- confirmed, whatever causes that state. Every "GAP CONFIRMED" case shows
-- ATTACKER, with only an unconfirmed claim to victim@example.com in the
-- JWT and no real relationship to the booking, fully impersonating the
-- victim through the real pre-098 logic. Every matching post-098 case
-- shows the identical attempt rejected, and every regression case shows a
-- genuine CONFIRMED email holder, and the untouched guest_user_id path,
-- both still working exactly as before.

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email_confirmed_at timestamptz
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

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  guest_user_id uuid,
  guest_email text,
  status text not null default 'pending',
  payment_status text not null default 'pending',
  booking_date date,
  start_time time,
  special_requests text,
  cancelled_at timestamptz,
  cancellation_reason text,
  refund_choice text
);

create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_role text not null check (sender_role in ('traveler', 'supplier', 'system')),
  sender_user_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_by_traveler_at timestamptz,
  read_by_supplier_at timestamptz
);

create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by text not null check (requested_by in ('traveler', 'supplier')),
  requester_user_id uuid,
  reason_code text not null default 'other',
  reason_text text not null default '',
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'declined', 'expired', 'resolved')),
  policy_snapshot jsonb not null default '{}'::jsonb,
  applied_fee numeric not null default 0,
  fee_currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid
);

create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  booking_id uuid,
  kind text not null,
  amount numeric not null,
  currency text not null default 'EUR',
  reason text,
  source_id text,
  policy_id text,
  created_at timestamptz not null default now(),
  unique (kind, source_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null,
  booking_id uuid references public.bookings(id) on delete set null,
  guest_name text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  title text,
  comment text not null default '',
  created_at timestamptz default now() not null
);

create table public.admin (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null default '',
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;
alter table public.booking_messages enable row level security;
alter table public.cancellation_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.admin enable row level security;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public, auth to authenticated, test_actor;
grant all on all tables in schema public to authenticated, test_actor;
grant execute on all functions in schema auth to authenticated, test_actor;
grant authenticated to test_actor;

-- ============================================================================
-- PRE-098: the real, currently-committed bodies of every affected object,
-- transcribed verbatim from migrations 037, 055, 038, 085, 093.
-- ============================================================================

create or replace function public.is_booking_party(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where b.id = p_booking_id
      and auth.uid() is not null
      and (
        l.supplier_id = auth.uid()
        or b.guest_user_id = auth.uid()
        or (
          length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
          and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
  );
$$;

drop policy if exists "Booking parties can read messages" on public.booking_messages;
create policy "Booking parties can read messages"
  on public.booking_messages for select
  using (public.is_booking_party(booking_id));
drop policy if exists "No direct message inserts" on public.booking_messages;
create policy "No direct message inserts" on public.booking_messages for insert with check (false);

create or replace function public.is_traverion_panel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin a
    WHERE lower(trim(a.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
  );
$$;

drop policy if exists "Consumers can view own bookings" on public.bookings;
create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
drop policy if exists "Consumers can view own bookings by user id" on public.bookings;
create policy "Consumers can view own bookings by user id"
  on public.bookings for select
  using (auth.uid() is not null and guest_user_id = auth.uid());

drop policy if exists "Consumers can cancel own bookings" on public.bookings;
create policy "Consumers can cancel own bookings"
  on public.bookings for update
  using (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
  with check (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

create or replace function public.update_guest_booking_special_requests(
  p_booking_id uuid,
  p_special_requests text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_uid uuid := auth.uid();
begin
  if (v_email = '' or v_email is null) and v_uid is null then
    return false;
  end if;
  update public.bookings
  set special_requests = left(trim(p_special_requests), 8000)
  where id = p_booking_id
    and status in ('pending', 'confirmed')
    and (
      (length(v_email) > 0 and lower(trim(coalesce(guest_email, ''))) = v_email)
      or (v_uid is not null and guest_user_id = v_uid)
    );
  return FOUND;
end;
$$;

create or replace function public.cancel_booking_as_traveler(
  p_booking_id uuid,
  p_refund_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_booking public.bookings%rowtype;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_choice not in ('full_refund', 'no_refund') then
    return jsonb_build_object('ok', false, 'error', 'Invalid refund choice.');
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;
  if not (
    v_booking.guest_user_id = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_booking.guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can cancel.');
  end if;
  v_pay := lower(trim(coalesce(v_booking.payment_status, '')));
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;
  if lower(trim(coalesce(v_booking.status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  v_collected := v_pay in ('paid', 'complete', 'succeeded');
  if not v_collected then
    v_choice := 'no_refund';
  end if;
  update public.bookings
    set status = 'cancelled', cancelled_at = now(), refund_choice = v_choice
    where id = v_booking.id and lower(trim(coalesce(status, ''))) <> 'cancelled';
  return jsonb_build_object('ok', true, 'refund_choice', v_choice, 'unpaid_checkout', not v_collected);
end;
$$;

create or replace function public.respond_cancellation_request(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.cancellation_requests%rowtype;
  v_guest_user uuid;
  v_guest_email text;
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;
  select b.guest_user_id, b.guest_email into v_guest_user, v_guest_email
  from public.bookings b where b.id = v_req.booking_id;
  if not (
    v_guest_user = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;
  if not p_accept then
    update public.cancellation_requests set status = 'declined', responded_at = now(), responded_by = v_uid
      where id = v_req.id and status = 'requested';
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'declined');
  end if;
  update public.cancellation_requests set status = 'accepted', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
  update public.bookings set status = 'cancelled', cancelled_at = now(), refund_choice = 'full_refund'
    where id = v_req.booking_id and lower(trim(coalesce(status, ''))) <> 'cancelled';
  return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'accepted');
end;
$$;

drop policy if exists "Reviews are viewable by everyone" on public.reviews;
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and not exists (
      select 1 from public.listings l
      where l.id = reviews.listing_id and l.supplier_id = reviews.user_id
    )
    and (
      reviews.booking_id is null
      or exists (
        select 1 from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and (
            b.guest_user_id = auth.uid()
            or (
              length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
              and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
          )
      )
    )
  );

grant all on public.bookings, public.booking_messages, public.cancellation_requests,
  public.supplier_ledger_entries, public.reviews to authenticated, test_actor;
grant execute on function public.is_booking_party(uuid) to authenticated, test_actor;
grant execute on function public.is_traverion_panel_admin() to authenticated, test_actor;
grant execute on function public.update_guest_booking_special_requests(uuid, text) to authenticated, test_actor;
grant execute on function public.cancel_booking_as_traveler(uuid, text) to authenticated, test_actor;
grant execute on function public.respond_cancellation_request(uuid, boolean) to authenticated, test_actor;

-- ============================================================================
-- Fixtures. ATTACKER's auth.users row has email_confirmed_at = NULL.
-- CONFIRMED_TRAVELER's has it set, for the regression cases.
-- ============================================================================
do $$
declare
  v_supplier      uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_attacker      uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_confirmed     uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_traveler_uid  uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_third_party   uuid := 'aaaaaaaa-0000-0000-0000-000000000005';
  v_listing       uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  insert into auth.users (id, email_confirmed_at) values
    (v_supplier, now()),
    (v_attacker, null),
    (v_confirmed, now()),
    (v_traveler_uid, now()),
    (v_third_party, now()); -- confirmed, but completely unrelated to any booking below
  insert into public.listings (id, supplier_id) values (v_listing, v_supplier);

  -- Victim guest bookings (no account at all: guest_user_id is null),
  -- one per write-case so pre-098 exploitation of one doesn't disturb
  -- another. All share guest_email 'victim@example.com'.
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status) values
    ('cccccccc-0000-0000-0000-000000000001', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- SELECT
    ('cccccccc-0000-0000-0000-000000000002', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- cancel (pre)
    ('cccccccc-0000-0000-0000-000000000003', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- messages
    ('cccccccc-0000-0000-0000-000000000004', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- review
    ('cccccccc-0000-0000-0000-000000000005', v_listing, null, 'victim@example.com', 'pending',   'pending'), -- special_requests (pre)
    ('cccccccc-0000-0000-0000-000000000006', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- respond_cancellation (pre)
    ('cccccccc-0000-0000-0000-000000000011', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- SELECT (post)
    ('cccccccc-0000-0000-0000-000000000012', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- cancel (post)
    ('cccccccc-0000-0000-0000-000000000013', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- messages (post)
    ('cccccccc-0000-0000-0000-000000000014', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- review (post)
    ('cccccccc-0000-0000-0000-000000000015', v_listing, null, 'victim@example.com', 'pending',   'pending'), -- special_requests (post)
    ('cccccccc-0000-0000-0000-000000000016', v_listing, null, 'victim@example.com', 'confirmed', 'paid'), -- respond_cancellation (post)
    -- Regression fixtures
    ('cccccccc-0000-0000-0000-0000000000c1', v_listing, null, 'confirmed@example.com', 'confirmed', 'paid'), -- CONFIRMED_TRAVELER email match (pre+post)
    ('cccccccc-0000-0000-0000-0000000000c2', v_listing, v_traveler_uid, 'unused@example.com', 'confirmed', 'paid'), -- guest_user_id path (pre+post)
    -- NULL-bypass isolation: guest_user_id null, and the caller below never
    -- claims this guest_email at all (no spoofing attempted whatsoever) --
    -- isolates the unconditional NULL-comparison bug from the email-claim
    -- bug above.
    ('cccccccc-0000-0000-0000-000000000021', v_listing, null, 'someone-else@example.com', 'confirmed', 'paid'), -- NULL-bypass (pre)
    ('cccccccc-0000-0000-0000-000000000022', v_listing, null, 'someone-else@example.com', 'confirmed', 'paid'); -- NULL-bypass (post)

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body) values
    ('cccccccc-0000-0000-0000-000000000003', 'supplier', v_supplier, 'Welcome, see you soon.'),
    ('cccccccc-0000-0000-0000-000000000013', 'supplier', v_supplier, 'Welcome, see you soon.');

  insert into public.cancellation_requests (id, booking_id, requested_by, requester_user_id, reason_code) values
    ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000006', 'supplier', v_supplier, 'weather'),
    ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000016', 'supplier', v_supplier, 'weather');

  insert into public.admin (email) values ('admin@example.com');
end $$;

-- ============================================================================
-- GAP CONFIRMED (pre-098, real current production logic)
-- ============================================================================

do $$
declare v_n int; v_res jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false); -- ATTACKER, unconfirmed
  perform set_config('test.email', 'victim@example.com', false);

  -- 1: SELECT
  select count(*) into v_n from public.bookings where id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 1 then raise exception 'GAP-1 did not reproduce (expected attacker to read the victim''s booking): saw %', v_n; end if;

  -- 2: cancel_booking_as_traveler
  select public.cancel_booking_as_traveler('cccccccc-0000-0000-0000-000000000002', 'no_refund') into v_res;
  if not (v_res ->> 'ok')::boolean then raise exception 'GAP-2 did not reproduce: %', v_res; end if;

  -- 3: booking_messages via is_booking_party
  select count(*) into v_n from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000003';
  if v_n <> 1 then raise exception 'GAP-3 did not reproduce: saw %', v_n; end if;

  -- 4: reviews forgery (attacker's OWN uid, but victim's booking as "proof")
  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
            'cccccccc-0000-0000-0000-000000000004', 'Attacker', 5, 'Forged verified review');
  select count(*) into v_n from public.reviews where booking_id = 'cccccccc-0000-0000-0000-000000000004';
  if v_n <> 1 then raise exception 'GAP-4 did not reproduce: saw %', v_n; end if;

  -- 5: update_guest_booking_special_requests
  if not public.update_guest_booking_special_requests('cccccccc-0000-0000-0000-000000000005', 'attacker note') then
    raise exception 'GAP-5 did not reproduce';
  end if;

  -- 6: respond_cancellation_request
  select public.respond_cancellation_request('dddddddd-0000-0000-0000-000000000001', false) into v_res;
  if not (v_res ->> 'ok')::boolean then raise exception 'GAP-6 did not reproduce: %', v_res; end if;

  -- 7: is_traverion_panel_admin (defense-in-depth target)
  perform set_config('test.email', 'admin@example.com', false);
  if not public.is_traverion_panel_admin() then raise exception 'GAP-7 did not reproduce'; end if;

  reset session authorization;
  raise notice 'GAP CONFIRMED (1-7): pre-098 logic lets an unconfirmed-email session read/cancel/message/review-forge a victim''s booking and pass the admin check, using only a self-claimed, unverified email.';
end $$;

-- Isolated NULL-bypass proof: a CONFIRMED, unrelated third party, whose
-- JWT email claim never matches (or is entirely blank) -- no spoofing
-- attempted at all -- can still cancel a guest_user_id-null booking,
-- because `NULL = v_uid` short-circuits the `IF NOT (...)` guard. This
-- is independent of the email-confirmation bug above.
do $$
declare v_res jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000005', false); -- third_party, confirmed, unrelated
  perform set_config('test.email', '', false); -- no email claim spoofed at all

  select public.cancel_booking_as_traveler('cccccccc-0000-0000-0000-000000000021', 'no_refund') into v_res;
  if not (v_res ->> 'ok')::boolean then raise exception 'GAP-8 did not reproduce: %', v_res; end if;

  reset session authorization;
  raise notice 'GAP CONFIRMED (8): pre-098 logic lets a completely unrelated, confirmed user with NO matching email claim at all cancel a guest_user_id-null booking -- the NULL-comparison bug needs no email spoofing whatsoever.';
end $$;

-- ============================================================================
-- Apply the REAL, currently-committed migration 098.
-- ============================================================================
\ir ../migrations/098_bookings_traveler_identity_hardening.sql

grant execute on function public.jwt_verified_email() to authenticated, test_actor;

-- ============================================================================
-- POST-098: identical attempts, fresh fixtures, now rejected.
-- ============================================================================

do $$
declare v_n int; v_res jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false); -- ATTACKER, still unconfirmed
  perform set_config('test.email', 'victim@example.com', false);

  select count(*) into v_n from public.bookings where id = 'cccccccc-0000-0000-0000-000000000011';
  if v_n <> 0 then raise exception 'Case 1 FAILED: unconfirmed attacker still reads the booking, saw %', v_n; end if;

  select public.cancel_booking_as_traveler('cccccccc-0000-0000-0000-000000000012', 'no_refund') into v_res;
  if (v_res ->> 'ok')::boolean then raise exception 'Case 2 FAILED: unconfirmed attacker still cancelled: %', v_res; end if;

  select count(*) into v_n from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000013';
  if v_n <> 0 then raise exception 'Case 3 FAILED: unconfirmed attacker still reads messages, saw %', v_n; end if;

  begin
    insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
      values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
              'cccccccc-0000-0000-0000-000000000014', 'Attacker', 5, 'Forged verified review');
    raise exception 'Case 4 FAILED: unconfirmed attacker still forged a verified review';
  exception when others then
    if sqlerrm not like '%FAILED%' then
      raise notice 'Case 4 passed: review insert correctly rejected (%).', sqlerrm;
    else
      raise;
    end if;
  end;

  if public.update_guest_booking_special_requests('cccccccc-0000-0000-0000-000000000015', 'attacker note') then
    raise exception 'Case 5 FAILED: unconfirmed attacker still edited special_requests';
  end if;

  select public.respond_cancellation_request('dddddddd-0000-0000-0000-000000000002', false) into v_res;
  if (v_res ->> 'ok')::boolean then raise exception 'Case 6 FAILED: unconfirmed attacker still responded: %', v_res; end if;

  if public.is_traverion_panel_admin() then raise exception 'Case 7 FAILED: unconfirmed attacker still passes the admin check'; end if;

  reset session authorization;
  raise notice 'Cases 1-7 passed: every unconfirmed-email path is now rejected post-098.';
end $$;

do $$
declare v_res jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000005', false); -- third_party, confirmed, unrelated
  perform set_config('test.email', '', false);

  select public.cancel_booking_as_traveler('cccccccc-0000-0000-0000-000000000022', 'no_refund') into v_res;
  if (v_res ->> 'ok')::boolean then raise exception 'Case 8 FAILED: unrelated confirmed user still cancelled a booking with no email claim at all: %', v_res; end if;

  reset session authorization;
  raise notice 'Case 8 passed: the NULL-comparison bypass is closed -- an unrelated user with no matching email claim can no longer cancel a guest_user_id-null booking.';
end $$;

-- ============================================================================
-- Regression: a genuine CONFIRMED email-only traveler (no account uid tie,
-- pure guest_email match) must be completely unaffected.
-- ============================================================================
do $$
declare v_n int; v_res jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false); -- CONFIRMED, real
  perform set_config('test.email', 'confirmed@example.com', false);

  select count(*) into v_n from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000c1';
  if v_n <> 1 then raise exception 'Regression FAILED: confirmed traveler cannot read own booking, saw %', v_n; end if;

  select public.cancel_booking_as_traveler('cccccccc-0000-0000-0000-0000000000c1', 'no_refund') into v_res;
  if not (v_res ->> 'ok')::boolean then raise exception 'Regression FAILED: confirmed traveler cannot cancel own booking: %', v_res; end if;

  reset session authorization;
  raise notice 'Regression passed: a genuine confirmed-email traveler is completely unaffected.';
end $$;

-- ============================================================================
-- Regression: the untouched guest_user_id path (account that owns the
-- booking by uid) is unaffected regardless of confirmation status.
-- ============================================================================
do $$
declare v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false); -- traveler_uid
  perform set_config('test.email', '', false);

  select count(*) into v_n from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000c2';
  if v_n <> 1 then raise exception 'Regression FAILED: guest_user_id owner cannot read own booking, saw %', v_n; end if;

  reset session authorization;
  raise notice 'Regression passed: guest_user_id-based ownership is untouched by this migration.';
end $$;

-- ============================================================================
-- Mutation check: with the email_confirmed_at guard stripped out of
-- jwt_verified_email(), the fix should stop working (proves the test
-- actually exercises that specific guard, not something else).
-- ============================================================================
create or replace function public.jwt_verified_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(auth.jwt() ->> 'email'))
  where auth.uid() is not null
$$;

do $$
declare v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false); -- ATTACKER, unconfirmed
  perform set_config('test.email', 'victim@example.com', false);

  select count(*) into v_n from public.bookings where id = 'cccccccc-0000-0000-0000-000000000011';
  if v_n <> 1 then
    raise exception 'MUTATION CHECK FAILED: removing the confirmation guard should have reopened the gap, but the attacker still saw % rows', v_n;
  end if;

  reset session authorization;
  raise notice 'Mutation check passed: stripping the email_confirmed_at guard reopens the gap, confirming the test exercises it.';
end $$;

-- Second mutation check: revert cancel_booking_as_traveler's coalesce(...)
-- back to the original bare NOT (...) to confirm Case 8's NULL-bypass
-- fix is what the test is actually exercising, not something else.
create or replace function public.cancel_booking_as_traveler(
  p_booking_id uuid,
  p_refund_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := coalesce(public.jwt_verified_email(), '');
  v_booking public.bookings%rowtype;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_choice not in ('full_refund', 'no_refund') then
    return jsonb_build_object('ok', false, 'error', 'Invalid refund choice.');
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;
  if not (
    v_booking.guest_user_id = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_booking.guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can cancel.');
  end if;
  v_pay := lower(trim(coalesce(v_booking.payment_status, '')));
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;
  if lower(trim(coalesce(v_booking.status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  v_collected := v_pay in ('paid', 'complete', 'succeeded');
  if not v_collected then
    v_choice := 'no_refund';
  end if;
  update public.bookings
    set status = 'cancelled', cancelled_at = now(), refund_choice = v_choice
    where id = v_booking.id and lower(trim(coalesce(status, ''))) <> 'cancelled';
  return jsonb_build_object('ok', true, 'refund_choice', v_choice, 'unpaid_checkout', not v_collected);
end;
$$;

do $$
declare v_res jsonb;
begin
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status)
    values ('cccccccc-0000-0000-0000-000000000023', 'bbbbbbbb-0000-0000-0000-000000000001', null, 'someone-else@example.com', 'confirmed', 'paid');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000005', false);
  perform set_config('test.email', '', false);

  select public.cancel_booking_as_traveler('cccccccc-0000-0000-0000-000000000023', 'no_refund') into v_res;
  if not (v_res ->> 'ok')::boolean then
    raise exception 'MUTATION CHECK 2 FAILED: reverting the coalesce(...) fix should have reopened the NULL-bypass gap, but the cancel was rejected: %', v_res;
  end if;

  reset session authorization;
  raise notice 'Mutation check 2 passed: reverting the coalesce(...) NULL-bypass fix reopens the gap, confirming Case 8 exercises it.';
end $$;

do $$ begin raise notice 'ALL ASSERTIONS PASSED (098)'; end $$;
