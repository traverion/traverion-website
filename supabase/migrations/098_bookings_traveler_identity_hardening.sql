-- Phase 593: stop trusting an unconfirmed JWT email claim for traveler
-- identity anywhere it gates read/write access to someone else's booking.
--
-- Every place in this schema that proves "this signed-in user IS the
-- traveler on booking X" accepts either of two conditions: b.guest_user_id
-- = auth.uid() (the booking was created by this exact account), OR a raw
-- string match of auth.jwt() ->> 'email' against b.guest_email. The second
-- path assumes the JWT's email claim always reflects a mailbox the current
-- session-holder has actually proven they control. That assumption is not
-- enforced anywhere in this database: nothing here checks
-- auth.users.email_confirmed_at before trusting that claim.
--
-- The overwhelming majority of guest_email values on this table belong to
-- nobody's auth.users row at all -- most travelers check out without ever
-- creating an account. That email string is therefore free for anyone to
-- claim at signup (Supabase's auth.users.email unique constraint only
-- blocks re-registering an email that is ALREADY a real account -- it does
-- not stop a brand-new signup from using a stranger's real address as long
-- as nobody has registered it yet). If this project's Supabase Auth
-- ever issues a usable access token before that address's ownership is
-- confirmed (this repository cannot see or change the hosted project's
-- Authentication -> Email -> "Confirm email" toggle -- that is dashboard
-- configuration, not something any migration controls), every one of
-- these email-matching checks would treat that unverified claim as proof
-- of identity. This migration does not assert that toggle is currently
-- off, or that this is presently exploitable in production -- only that
-- the database layer should not depend on an external setting it cannot
-- see to stay correct. src/contexts/AuthContext.tsx's own signIn/signUp
-- already added a client-side `!email_confirmed_at` guard for exactly
-- this scenario (see signIn's post-signInWithPassword check and signUp's
-- post-signUp data.session check) -- a client-side UX guard is not a
-- substitute for enforcing it in RLS/SECURITY DEFINER functions, since
-- anyone can call the REST/RPC API directly with a captured access token
-- and skip the app's JS entirely.
--
-- Fix: a single shared helper, jwt_verified_email(), returns the current
-- JWT's lowercased/trimmed email claim ONLY when auth.uid() resolves to an
-- auth.users row with email_confirmed_at set, else null -- and every site
-- below that used to read auth.jwt() ->> 'email' directly for identity
-- purposes now goes through it instead. auth.uid()-based matching
-- (guest_user_id = auth.uid(), reviews.user_id = auth.uid(), l.supplier_id
-- = auth.uid()) is untouched -- that path already requires the acting
-- account to be the one that owns the row via a stable id, not a
-- self-reported string, and is not part of this bug class.
--
-- Sites fixed, all via the same substitution (auth.jwt() ->> 'email' ->
-- jwt_verified_email()):
--  * public.is_booking_party(uuid) (migration 055) -- the shared gate
--    behind "Booking parties can read messages" / "...cancellation
--    requests" (public.booking_messages, public.cancellation_requests
--    SELECT policies) and behind post_booking_message() /
--    mark_booking_messages_read() (both call is_booking_party
--    internally, so fixing it once fixes both RPCs with no separate
--    edit).
--  * public.is_traverion_panel_admin() (migration 038) -- defense in
--    depth. The single current admin row (info.traverion@gmail.com) is
--    already a real, already-registered auth.users account, so the
--    "claim a stranger's never-registered email at signup" version of
--    this attack does not reach it today -- Supabase's auth.users.email
--    unique constraint already blocks re-registering a taken address.
--    This still closes the same unconfirmed-claim class for that path
--    and for any future admin row added to the allowlist before its
--    owner has an account. It does NOT fully close a separate,
--    unrelated provisioning-order risk (an admin row added before its
--    real owner signs up at all, letting anyone register that address
--    first) -- tracked as a remaining risk in the progress log, not
--    claimed fixed here.
--  * public.bookings policies "Consumers can view own bookings" / "...can
--    cancel own bookings" (migration 037, email-match halves only -- the
--    "...by user id" policies are untouched).
--  * public.update_guest_booking_special_requests(uuid, text)
--    (migration 037's version).
--  * public.cancel_booking_as_traveler(uuid, text) (migration 085's
--    version, the current one).
--  * public.respond_cancellation_request(uuid, boolean) (migration 085's
--    version, the current one).
--  * public.reviews policies "Users can insert own review" / "...update
--    own review" (migration 093's versions, the current ones) -- closes
--    the "verified" badge forgery this enabled: attaching a stranger's
--    real confirmed booking to a review via an unverified email claim
--    matching that stranger's guest_email.
--
-- No business rule changes: every one of these checks keeps the exact
-- same logic for a confirmed-email session (the only kind that should
-- ever legitimately exist per the app's own client-side intent) --
-- jwt_verified_email() returns the same lowercased/trimmed string
-- auth.jwt() ->> 'email' would have, whenever the account is confirmed.
--
-- =============================================================================
-- SECOND, INDEPENDENT, HIGHER-SEVERITY FINDING -- found while writing the
-- proof test above, not something this migration set out to look for.
-- =============================================================================
--
-- public.cancel_booking_as_traveler(uuid, text) and
-- public.respond_cancellation_request(uuid, boolean) (both migration 085,
-- the current versions) each gate on:
--
--   if not (
--     v_booking.guest_user_id = v_uid   -- (or v_guest_user = v_uid)
--     or (length(v_jwt_email) > 0 and ... = v_jwt_email)
--   ) then
--     return jsonb_build_object('ok', false, 'error', '...');
--   end if;
--
-- When a booking has guest_user_id IS NULL (true of every guest checkout
-- that never became an account -- almost certainly the majority of
-- bookings on this marketplace) AND the caller's email claim is absent,
-- empty, or simply doesn't match (no spoofing attempted, no confirmation
-- question involved at all): `NULL = v_uid` evaluates to SQL NULL, not
-- false, and `NULL OR false` is NULL. PL/pgSQL's `IF NOT (...) THEN ...`
-- treats a NULL condition the same as false -- it does NOT enter the
-- THEN branch -- so the "reject" never runs and the function falls
-- through as authorized. In plain terms: ANY authenticated user, with NO
-- email claim needed at all, can cancel or accept/decline the
-- cancellation of ANY booking with no linked account, just by knowing
-- its booking_id. This is unconditional -- it does not depend on
-- Supabase Auth's "Confirm email" setting or any external configuration
-- this repository cannot see, unlike the email-confirmation finding
-- above. It is proven directly against the real, currently-committed
-- migration 085 text (see supabase/tests/
-- jwt_email_requires_confirmation.test.sql, GAP-2/GAP-6, which reproduce
-- it with a caller whose JWT email claim is empty, not merely
-- unconfirmed).
--
-- This is exactly the class of bug Postgres's three-valued logic makes
-- easy to introduce: a column-equality comparison against a NULLable
-- column is not "false" when the column is null, it is NULL, and an OR
-- chain does not become false just because every real condition failed
-- to match -- it stays NULL unless at least one branch is definitely
-- false. The RLS-policy versions of this exact same idea (bookings
-- USING/WITH CHECK, is_booking_party's `exists(select ... where ...)`)
-- are NOT affected: a WHERE/USING clause already treats a NULL condition
-- as "exclude this row", which happens to be the correct behavior here.
-- The bug is specific to the `IF NOT (nullable-comparison OR ...) THEN
-- reject END IF;` shape in PL/pgSQL, which the other traveler-identity
-- functions in this file (update_guest_booking_special_requests) do not
-- use -- that one filters via an UPDATE ... WHERE clause instead, so it
-- was not affected. Grepped every `if not (` across every migration
-- (all instances, current and superseded): only these same two
-- functions' current (085) bodies have this shape; no other function in
-- the schema does.
--
-- Fix: wrap the whole ownership expression in coalesce(..., false)
-- before negating it, so a NULL result is treated as "not authorized"
-- (reject) instead of "condition satisfied" (allow) -- the only
-- behavior change is for the previously-broken NULL case; every
-- genuinely-authorized caller (real uid match, or a jwt_verified_email
-- match) is unaffected, since `x OR true` is true regardless of what x
-- is, so coalescing only ever changes the null-vs-false outcome, never a
-- true one.

create or replace function public.jwt_verified_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(auth.jwt() ->> 'email'))
  where auth.uid() is not null
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
    )
$$;

comment on function public.jwt_verified_email() is
  'The current session''s JWT email claim, lowercased and trimmed, ONLY
   when auth.uid() maps to an auth.users row with email_confirmed_at set;
   null otherwise (signed out, or a session whose email is not yet
   confirmed). Use this instead of a raw auth.jwt() ->> ''email'' read
   anywhere the value is used to prove which traveler a booking, message,
   cancellation, or review belongs to -- an unconfirmed JWT email claim
   must never be trusted for authorization on its own.';

revoke all on function public.jwt_verified_email() from public;
grant execute on function public.jwt_verified_email() to authenticated, anon;

-- =============================================================================
-- is_booking_party() -- fixes booking_messages + cancellation_requests
-- SELECT policies and post_booking_message()/mark_booking_messages_read()
-- (both already call is_booking_party internally; no separate edit needed).
-- =============================================================================

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
          length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
          and lower(trim(coalesce(b.guest_email, ''))) = public.jwt_verified_email()
        )
      )
  );
$$;

-- =============================================================================
-- is_traverion_panel_admin() -- defense in depth (see header note).
-- =============================================================================

create or replace function public.is_traverion_panel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin a
    where lower(trim(a.email)) = coalesce(public.jwt_verified_email(), '')
  );
$$;

-- =============================================================================
-- public.bookings -- email-match halves of the two consumer policies.
-- =============================================================================

drop policy if exists "Consumers can view own bookings" on public.bookings;
create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
    and lower(trim(coalesce(guest_email, ''))) = public.jwt_verified_email()
  );

drop policy if exists "Consumers can cancel own bookings" on public.bookings;
create policy "Consumers can cancel own bookings"
  on public.bookings for update
  using (
    length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
    and lower(trim(coalesce(guest_email, ''))) = public.jwt_verified_email()
  )
  with check (
    length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
    and lower(trim(coalesce(guest_email, ''))) = public.jwt_verified_email()
  );

-- =============================================================================
-- update_guest_booking_special_requests(uuid, text)
-- =============================================================================

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
  v_email text := coalesce(public.jwt_verified_email(), '');
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

-- =============================================================================
-- cancel_booking_as_traveler(uuid, text) -- current version from migration 085.
-- =============================================================================

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
  v_supplier uuid;
  v_body text;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
  v_tour_start timestamptz;
  v_within_free_window boolean;
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

  if not coalesce(
    v_booking.guest_user_id = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_booking.guest_email, ''))) = v_jwt_email),
    false
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

  if v_collected and v_choice = 'full_refund' and v_booking.booking_date is not null then
    v_tour_start := (v_booking.booking_date + coalesce(v_booking.start_time, time '00:00'))
      at time zone 'Europe/Helsinki';
    v_within_free_window := v_tour_start - now() > interval '24 hours';
    if not v_within_free_window then
      v_choice := 'no_refund';
    end if;
  end if;

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      refund_choice = v_choice
    where id = v_booking.id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select l.supplier_id into v_supplier
  from public.listings l
  where l.id = v_booking.listing_id;

  if v_supplier is not null and v_collected and v_choice = 'full_refund' then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    )
    select
      e.supplier_id,
      e.booking_id,
      'refund',
      - abs(e.amount),
      e.currency,
      'Cancelled booking earnings reversal',
      e.booking_id::text,
      'traverion_traveler_self_cancel_v1'
    from public.supplier_ledger_entries e
    where e.kind = 'booking_earnings'
      and e.booking_id = v_booking.id
    on conflict (kind, source_id) do nothing;
  end if;

  if not v_collected then
    v_body :=
      'Traveler cancelled an unpaid checkout. No payment was collected.';
  elsif v_choice = 'full_refund' then
    v_body :=
      'Traveler cancelled this booking. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.';
  else
    v_body :=
      'Traveler cancelled this booking. No refund applies for this traveler-initiated cancellation.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_booking.id, 'system', v_uid, v_body);

  return jsonb_build_object('ok', true, 'refund_choice', v_choice, 'unpaid_checkout', not v_collected);
end;
$$;

revoke all on function public.cancel_booking_as_traveler(uuid, text) from public;
grant execute on function public.cancel_booking_as_traveler(uuid, text) to authenticated;

-- =============================================================================
-- respond_cancellation_request(uuid, boolean) -- current version from 085.
-- =============================================================================

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
  v_supplier uuid;
  v_guest_user uuid;
  v_guest_email text;
  v_jwt_email text := coalesce(public.jwt_verified_email(), '');
  v_ledger_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;

  select l.supplier_id, b.guest_user_id, b.guest_email
    into v_supplier, v_guest_user, v_guest_email
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = v_req.booking_id;

  if not coalesce(
    v_guest_user = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_guest_email, ''))) = v_jwt_email),
    false
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;

  if v_req.status = 'accepted' then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;

  if not p_accept then
    update public.cancellation_requests
      set status = 'declined', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
    insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
    values (v_req.booking_id, 'system', v_uid, 'Traveler declined the cancellation request. The booking stays active.');
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'declined');
  end if;

  update public.cancellation_requests
    set status = 'accepted', responded_at = now(), responded_by = v_uid
  where id = v_req.id and status = 'requested';
  if not found then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_req.reason_code,
      refund_choice = 'full_refund'
    where id = v_req.booking_id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if v_req.applied_fee > 0 and v_supplier is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier,
      v_req.booking_id,
      'cancellation_penalty',
      - abs(v_req.applied_fee),
      v_req.fee_currency,
      'Supplier cancellation fee',
      v_req.id::text,
      coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_cancel_v1')
    )
    on conflict (kind, source_id) do nothing
    returning id into v_ledger_id;
  end if;

  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  )
  select
    e.supplier_id,
    e.booking_id,
    'refund',
    - abs(e.amount),
    e.currency,
    'Cancelled booking earnings reversal',
    e.booking_id::text,
    coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_ledger_v1')
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings'
    and e.booking_id = v_req.booking_id
  on conflict (kind, source_id) do nothing;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    v_req.booking_id,
    'system',
    v_uid,
    'Traveler accepted the cancellation. This booking is cancelled. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.'
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id
  );
end;
$$;

revoke all on function public.respond_cancellation_request(uuid, boolean) from public;
grant execute on function public.respond_cancellation_request(uuid, boolean) to authenticated;

-- =============================================================================
-- public.reviews -- current versions of both policies (migration 093).
-- =============================================================================

drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
    and (
      reviews.booking_id is null
      or exists (
        select 1
        from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and (
            b.guest_user_id = auth.uid()
            or (
              length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
              and lower(trim(coalesce(b.guest_email, ''))) = public.jwt_verified_email()
            )
          )
      )
    )
  );

drop policy if exists "Users can update own review" on public.reviews;
create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = reviews.user_id)
  with check (
    auth.uid() = reviews.user_id
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
    and (
      reviews.booking_id is null
      or exists (
        select 1
        from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and (
            b.guest_user_id = auth.uid()
            or (
              length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
              and lower(trim(coalesce(b.guest_email, ''))) = public.jwt_verified_email()
            )
          )
      )
    )
  );
