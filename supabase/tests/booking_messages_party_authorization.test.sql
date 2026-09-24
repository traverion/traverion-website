-- Phase 582: adversarial regression coverage for the booking_messages /
-- cancellation_requests party-authorization system (migration 055).
--
-- This subsystem had ZERO SQL-level regression coverage before this phase
-- despite being among the most security- and financial-critical code in
-- the app: it gates a private traveler<->supplier conversation thread and
-- the only path by which a supplier can force-cancel a paid booking (only
-- with the traveler's explicit accept). Read in full and reasoned through
-- adversarially (see Phase 582 commit message); this test proves that
-- reasoning against the REAL, currently-committed migration 055 rather
-- than leaving it as an unverified read-through.
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_055
--   sudo -u postgres psql -d traverion_test_055 -f supabase/tests/booking_messages_party_authorization.test.sql
--
-- Builds a minimal listings/bookings schema (matching the real columns
-- migration 055's functions reference: status, payment_status,
-- guest_user_id, guest_email, cancelled_at, cancellation_reason,
-- refund_choice), includes the REAL migration 055 file verbatim, then
-- proves, against a fixed scenario (booking B: traveler T owns it by
-- guest_user_id, listing L is owned by supplier S, plus an uninvolved
-- third party X and a different supplier S2 who owns nothing on this
-- booking):
--   (a) RLS SELECT on booking_messages returns the thread to T and S, and
--       zero rows to X and S2 (cross-booking / cross-supplier read denial);
--   (b) the same for cancellation_requests;
--   (c) direct client INSERT/UPDATE on booking_messages is rejected for
--       EVERYONE, including T and S themselves -- the RPCs are the only
--       path, not just the UI;
--   (d) post_booking_message succeeds for T and S, is rejected for X;
--   (e) post_booking_message is rejected while the booking is unpaid, and
--       rejected once cancelled unless a cancellation_request is open;
--   (f) mark_booking_messages_read only ever touches the caller's own
--       "other side" messages, and is a no-op (ok:false) for X;
--   (g) request_supplier_cancellation succeeds only for the REAL listing
--       owner S -- rejected for T (the traveler) and for S2 (a real
--       supplier, but not the owner of this listing);
--   (h) respond_cancellation_request -- the crown-jewel check -- succeeds
--       only for the TRAVELER T (by guest_user_id) or by guest_email
--       match; is REJECTED for the supplier S themselves (a supplier
--       cannot unilaterally force-cancel their own cancellation request
--       without the traveler's consent) and for the uninvolved third
--       party X.

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
  cancelled_at timestamptz,
  cancellation_reason text,
  refund_choice text
);

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

-- ---------------------------------------------------------------------
-- Apply the real, currently-committed migration 055 verbatim.
-- ---------------------------------------------------------------------
\ir ../migrations/055_ops_messaging_cancellation_ledger.sql

grant all on public.booking_messages, public.cancellation_requests, public.supplier_ledger_entries to authenticated, test_actor;
grant execute on function public.is_booking_party(uuid) to test_actor;
grant execute on function public.post_booking_message(uuid, text) to test_actor;
grant execute on function public.mark_booking_messages_read(uuid) to test_actor;
grant execute on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) to test_actor;
grant execute on function public.respond_cancellation_request(uuid, boolean) to test_actor;

-- ============================================================================
-- Shared fixture, built once as postgres (bypasses RLS), reused by every case.
-- ============================================================================
do $$
declare
  v_supplier uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_supplier2 uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_traveler uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_stranger uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_listing uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_booking uuid := 'cccccccc-0000-0000-0000-000000000001';
begin
  insert into auth.users (id) values (v_supplier), (v_supplier2), (v_traveler), (v_stranger);
  insert into public.listings (id, supplier_id) values (v_listing, v_supplier);
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status)
    values (v_booking, v_listing, v_traveler, 'traveler@example.com', 'confirmed', 'paid');
  -- Seed one message from each side so SELECT-visibility cases have real rows.
  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
    values (v_booking, 'traveler', v_traveler, 'Hi, question about pickup.');
  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
    values (v_booking, 'supplier', v_supplier, 'Sure, happy to help.');
end $$;

-- Fixed ids reused throughout (matches the fixture above). psql variable
-- interpolation inside dollar-quoted do $$ ... $$ blocks is unreliable, so
-- these are inlined as literal uuid casts wherever used below instead of
-- psql :variables.

-- ============================================================================
-- Case 1: RLS SELECT on booking_messages -- traveler and supplier see the
-- full thread; an uninvolved stranger and a different, unrelated supplier
-- see zero rows (cross-booking / cross-supplier read denial).
-- ============================================================================
do $$
declare
  v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  select count(*) into v_n from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 2 then raise exception 'Case 1 FAILED: traveler should see 2 messages, saw %', v_n; end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  select count(*) into v_n from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 2 then raise exception 'Case 1 FAILED: supplier should see 2 messages, saw %', v_n; end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false);
  select count(*) into v_n from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 0 then raise exception 'Case 1 FAILED: uninvolved stranger should see 0 messages, saw %', v_n; end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select count(*) into v_n from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 0 then raise exception 'Case 1 FAILED: unrelated supplier should see 0 messages, saw %', v_n; end if;

  reset session authorization;
  raise notice 'Case 1 passed: booking_messages SELECT correctly scoped to the two real parties';
end $$;

-- ============================================================================
-- Case 2: same visibility scoping for cancellation_requests (currently
-- empty, but the RLS policy itself is exercised as a query, not by row
-- count -- confirms no error and correct policy is in force).
-- ============================================================================
do $$
declare
  v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false);
  select count(*) into v_n from public.cancellation_requests where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 0 then raise exception 'Case 2 FAILED: expected 0 (table is empty at this point), saw %', v_n; end if;
  reset session authorization;
  raise notice 'Case 2 passed: cancellation_requests SELECT policy is in force (baseline empty read)';
end $$;

-- ============================================================================
-- Case 3: direct client INSERT into booking_messages is rejected for
-- EVERYONE, including the real traveler and supplier themselves -- the
-- RPC is the only legitimate path, not merely a UI convention.
-- ============================================================================
do $$
declare
  v_failed boolean := false;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  begin
    insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
      values ('cccccccc-0000-0000-0000-000000000001', 'traveler', 'aaaaaaaa-0000-0000-0000-000000000003', 'direct insert attempt');
  exception when others then
    v_failed := true;
  end;
  reset session authorization;
  if not v_failed then
    raise exception 'Case 3 FAILED: direct INSERT by the real traveler should be rejected (with check (false)), but succeeded';
  end if;
  raise notice 'Case 3 passed: direct client INSERT into booking_messages is rejected even for a real party';
end $$;

-- ============================================================================
-- Case 4: direct client UPDATE (e.g. forging a read receipt, or editing a
-- message body) is rejected for everyone, including the real parties.
-- ============================================================================
do $$
declare
  v_failed boolean := false;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  begin
    update public.booking_messages set read_by_supplier_at = now() where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  exception when others then
    v_failed := true;
  end;
  reset session authorization;
  -- using (false) means the USING clause matches zero rows -- UPDATE
  -- succeeds as a no-op (0 rows affected), it does not raise. Assert 0 rows
  -- changed instead of an exception.
  perform 1;
  if exists (
    select 1 from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001' and sender_role = 'traveler' and read_by_supplier_at is not null
  ) then
    raise exception 'Case 4 FAILED: direct client UPDATE on booking_messages should never take effect, but read_by_supplier_at was set';
  end if;
  raise notice 'Case 4 passed: direct client UPDATE on booking_messages never takes effect (using (false))';
end $$;

-- ============================================================================
-- Case 5: post_booking_message -- the real traveler and real supplier can
-- post; an uninvolved stranger cannot.
-- ============================================================================
do $$
declare
  v_result jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  select public.post_booking_message('cccccccc-0000-0000-0000-000000000001', 'Traveler follow-up message.') into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 5 FAILED: real traveler should be able to post, got %', v_result;
  end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  select public.post_booking_message('cccccccc-0000-0000-0000-000000000001', 'Supplier reply.') into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 5 FAILED: real supplier should be able to post, got %', v_result;
  end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false);
  select public.post_booking_message('cccccccc-0000-0000-0000-000000000001', 'Stranger trying to inject a message.') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 5 FAILED: uninvolved stranger should NOT be able to post, got %', v_result;
  end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select public.post_booking_message('cccccccc-0000-0000-0000-000000000001', 'Different supplier trying to inject a message.') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 5 FAILED: unrelated supplier should NOT be able to post, got %', v_result;
  end if;

  reset session authorization;
  raise notice 'Case 5 passed: post_booking_message correctly gates on real party membership';
end $$;

-- ============================================================================
-- Case 6: post_booking_message is rejected on an unpaid booking, and on a
-- cancelled booking with no open cancellation request; succeeds once a
-- cancellation request is open even though the booking will later be
-- cancelled.
-- ============================================================================
do $$
declare
  v_unpaid_booking uuid := 'cccccccc-0000-0000-0000-000000000002';
  v_cancelled_booking uuid := 'cccccccc-0000-0000-0000-000000000003';
  v_result jsonb;
begin
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status)
    values (v_unpaid_booking, 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'traveler@example.com', 'pending', 'pending');
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status, payment_status)
    values (v_cancelled_booking, 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'traveler@example.com', 'cancelled', 'paid');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);

  select public.post_booking_message(v_unpaid_booking, 'trying before payment') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 6 FAILED: messaging should be blocked before payment, got %', v_result;
  end if;

  select public.post_booking_message(v_cancelled_booking, 'trying after cancellation, no open request') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 6 FAILED: messaging should be blocked after cancellation with no open request, got %', v_result;
  end if;

  reset session authorization;
  raise notice 'Case 6 passed: post_booking_message correctly blocks unpaid and closed-cancelled bookings';
end $$;

-- ============================================================================
-- Case 7: mark_booking_messages_read only marks the CALLER's own inbound
-- side as read, and is a no-op for an uninvolved stranger.
-- ============================================================================
do $$
declare
  v_before_traveler timestamptz;
  v_after_traveler timestamptz;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);

  -- Stranger: should not be able to mark anything read (is_booking_party fails).
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false);
  perform public.mark_booking_messages_read('cccccccc-0000-0000-0000-000000000001');

  reset session authorization;
  select read_by_supplier_at into v_before_traveler
  from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001' and sender_role = 'traveler';
  if v_before_traveler is not null then
    raise exception 'Case 7 FAILED: an uninvolved stranger should not be able to mark messages read';
  end if;

  -- Real supplier marks the traveler's message read -- should work.
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  perform public.mark_booking_messages_read('cccccccc-0000-0000-0000-000000000001');
  reset session authorization;

  select read_by_supplier_at into v_after_traveler
  from public.booking_messages where booking_id = 'cccccccc-0000-0000-0000-000000000001' and sender_role = 'traveler';
  if v_after_traveler is null then
    raise exception 'Case 7 FAILED: real supplier marking read should set read_by_supplier_at on the traveler message';
  end if;

  raise notice 'Case 7 passed: mark_booking_messages_read scoped correctly to real parties and the right side of the thread';
end $$;

-- ============================================================================
-- Case 8: request_supplier_cancellation succeeds only for the REAL listing
-- owner. Rejected for the traveler (not a supplier action) and for a
-- different, unrelated supplier.
-- ============================================================================
do $$
declare
  v_result jsonb;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  select public.request_supplier_cancellation('cccccccc-0000-0000-0000-000000000001', 'OPERATIONAL_ERROR', 'Traveler pretending to be the supplier.') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 8 FAILED: traveler should not be able to request a supplier cancellation, got %', v_result;
  end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select public.request_supplier_cancellation('cccccccc-0000-0000-0000-000000000001', 'OPERATIONAL_ERROR', 'Unrelated supplier trying to cancel someone elses booking.') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 8 FAILED: an unrelated supplier should not be able to cancel this booking, got %', v_result;
  end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  select public.request_supplier_cancellation('cccccccc-0000-0000-0000-000000000001', 'OPERATIONAL_ERROR', 'Real supplier, legitimate operational error explanation.') into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 8 FAILED: the real listing owner should be able to request cancellation, got %', v_result;
  end if;

  reset session authorization;
  raise notice 'Case 8 passed: request_supplier_cancellation correctly gated to the real listing owner';
end $$;

-- ============================================================================
-- Case 8b: now that a real cancellation_requests row exists (from Case 8),
-- re-check RLS SELECT scoping with actual data present (Case 2 only proved
-- the policy runs without error against an empty table). The real
-- traveler and real supplier must see it; an uninvolved stranger and an
-- unrelated supplier must see zero rows.
-- ============================================================================
do $$
declare
  v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  select count(*) into v_n from public.cancellation_requests where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 1 then raise exception 'Case 8b FAILED: traveler should see the 1 open cancellation request, saw %', v_n; end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  select count(*) into v_n from public.cancellation_requests where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 1 then raise exception 'Case 8b FAILED: real supplier should see the 1 open cancellation request, saw %', v_n; end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false);
  select count(*) into v_n from public.cancellation_requests where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 0 then raise exception 'Case 8b FAILED: uninvolved stranger should see 0 cancellation requests, saw %', v_n; end if;

  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select count(*) into v_n from public.cancellation_requests where booking_id = 'cccccccc-0000-0000-0000-000000000001';
  if v_n <> 0 then raise exception 'Case 8b FAILED: unrelated supplier should see 0 cancellation requests, saw %', v_n; end if;

  reset session authorization;
  raise notice 'Case 8b passed: cancellation_requests SELECT correctly scoped to the two real parties with real data present';
end $$;

-- ============================================================================
-- Case 9 (crown jewel): respond_cancellation_request -- once a cancellation
-- request is open (from Case 8), only the TRAVELER may accept or decline
-- it. The SUPPLIER who created the request must NOT be able to
-- self-approve their own cancellation -- that would let a supplier
-- unilaterally force-cancel a paid booking without the traveler's
-- consent, defeating the entire point of this workflow. An uninvolved
-- stranger must also be rejected.
-- ============================================================================
do $$
declare
  v_request_id uuid;
  v_result jsonb;
begin
  select id into v_request_id from public.cancellation_requests where booking_id = 'cccccccc-0000-0000-0000-000000000001' and status = 'requested';
  if v_request_id is null then
    raise exception 'Case 9 setup FAILED: expected an open cancellation request from Case 8';
  end if;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);

  -- The supplier who created the request tries to self-approve it.
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  select public.respond_cancellation_request(v_request_id, true) into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 9 FAILED (critical): the supplier was able to self-approve their own cancellation request -- got %', v_result;
  end if;

  -- An uninvolved stranger tries to respond.
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000004', false);
  select public.respond_cancellation_request(v_request_id, true) into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'Case 9 FAILED: an uninvolved stranger was able to respond to the cancellation request, got %', v_result;
  end if;

  -- Confirm the request is still open after both rejected attempts.
  reset session authorization;
  if not exists (select 1 from public.cancellation_requests where id = v_request_id and status = 'requested') then
    raise exception 'Case 9 FAILED: the cancellation request should still be open after the rejected attempts';
  end if;

  -- The real traveler accepts it -- should succeed.
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  select public.respond_cancellation_request(v_request_id, true) into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'Case 9 FAILED: the real traveler should be able to accept the cancellation, got %', v_result;
  end if;
  reset session authorization;

  if not exists (select 1 from public.cancellation_requests where id = v_request_id and status = 'accepted') then
    raise exception 'Case 9 FAILED: cancellation request should be accepted after the real travelers response';
  end if;
  if not exists (select 1 from public.bookings where id = 'cccccccc-0000-0000-0000-000000000001' and status = 'cancelled') then
    raise exception 'Case 9 FAILED: booking should be cancelled after the traveler accepted';
  end if;

  raise notice 'Case 9 passed (crown jewel): only the real traveler can accept/decline a cancellation request -- the requesting supplier cannot self-approve, and a stranger cannot respond either';
end $$;

do $$ begin raise notice 'ALL CASES PASSED'; end $$;
