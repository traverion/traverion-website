-- Phase 1 of 6 — Cancellation foundations (Tours & Stays)
--
-- 1) Tour self-cancel clock = snapshotted official start only (never pickup).
-- 2) Supplier cancel executes immediately (no traveler approval); full refund entitlement.
-- 3) Booking resolution columns for refund/reschedule/support (reschedule UI = Phase 3;
--    Tour Stripe refund execution = Phase 2). Stay auto-refund preserved.
-- Future Rentals: same pattern as Tours using scheduled rental start (not implemented here).

-- ---------------------------------------------------------------------------
-- Booking resolution / lineage columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists cancellation_origin text
    check (
      cancellation_origin is null
      or cancellation_origin in ('traveler', 'supplier', 'support', 'system')
    );

alter table public.bookings
  add column if not exists cancellation_resolution text
    check (
      cancellation_resolution is null
      or cancellation_resolution in (
        'pending_customer_choice',
        'full_refund',
        'reschedule',
        'support'
      )
    );

alter table public.bookings
  add column if not exists rescheduled_from_booking_id uuid
    references public.bookings(id) on delete set null;

alter table public.bookings
  add column if not exists rescheduled_to_booking_id uuid
    references public.bookings(id) on delete set null;

alter table public.bookings
  add column if not exists support_flag boolean not null default false;

comment on column public.bookings.cancellation_origin is
  'Who initiated cancellation: traveler | supplier | support | system.';
comment on column public.bookings.cancellation_resolution is
  'Phase 1 foundation: pending_customer_choice | full_refund | reschedule | support. Reschedule workflow = Phase 3.';
comment on column public.bookings.rescheduled_from_booking_id is
  'Future: booking this row was rescheduled from (Phase 3).';
comment on column public.bookings.rescheduled_to_booking_id is
  'Future: booking this row was rescheduled to (Phase 3).';
comment on column public.bookings.support_flag is
  'Support/dispute attention without deleting booking history.';

create index if not exists bookings_cancellation_resolution_idx
  on public.bookings (cancellation_resolution)
  where cancellation_resolution is not null;

create index if not exists bookings_support_flag_idx
  on public.bookings (support_flag)
  where support_flag = true;

-- ---------------------------------------------------------------------------
-- Traveler self-cancel: official start only (tours); hard deadline unchanged
-- ---------------------------------------------------------------------------
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
  v_listing public.listings%rowtype;
  v_supplier uuid;
  v_body text;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
  v_tz text;
  v_start_local timestamp;
  v_tour_start timestamptz;
  v_within_free_window boolean;
  v_hm text;
  v_hh int;
  v_mm int;
  v_is_stay boolean;
  v_closed_requests int := 0;
  v_preset text;
  v_policy text;
  v_free_hours int;
  v_hours_raw jsonb;
  v_refund_prep jsonb;
  v_deadline_error text;
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

  if not public.booking_traveler_owns(v_booking.guest_user_id, v_booking.guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can cancel.');
  end if;

  v_pay := lower(trim(coalesce(v_booking.payment_status, '')));
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;

  if v_pay = 'authorized' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Withdraw this stay request to release the payment authorization. Do not cancel while authorized.'
    );
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  v_collected := v_pay in ('paid', 'complete', 'succeeded');
  if not v_collected then
    v_choice := 'no_refund';
  end if;

  if v_collected and v_booking.booking_date is not null then
    select * into v_listing from public.listings where id = v_booking.listing_id;

    v_tz := nullif(trim(coalesce(v_booking.purchase_snapshot->>'departureTimezone', '')), '');
    if v_tz is null and v_listing.id is not null then
      v_tz := nullif(trim(coalesce(v_listing.listing_extras->>'departureTimezone', '')), '');
    end if;
    if v_tz is null or v_tz = '' then
      v_tz := 'Europe/Helsinki';
    end if;

    v_is_stay := public.booking_is_stay_night(v_booking);

    if v_is_stay then
      v_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'checkInTime', '')), '');
      if v_hm is null then
        v_hm := '16:00';
      end if;
    else
      -- Tours / future Rentals: official booked start only. Never pickup_time.
      -- Prefer cancelReferenceStartHm (frozen at purchase) then startTimeHm.
      v_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'cancelReferenceStartHm', '')), '');
      if v_hm is null then
        v_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'startTimeHm', '')), '');
      end if;
    end if;

    if v_hm is not null then
      begin
        v_hh := split_part(v_hm, ':', 1)::int;
        v_mm := split_part(v_hm, ':', 2)::int;
      exception when others then
        v_hh := case when v_is_stay then 16 else 0 end;
        v_mm := 0;
      end;
      v_start_local := v_booking.booking_date::timestamp + make_interval(hours => v_hh, mins => v_mm);
    else
      v_start_local :=
        (v_booking.booking_date::timestamp + coalesce(v_booking.start_time, time '00:00'));
    end if;

    begin
      v_tour_start := v_start_local at time zone v_tz;
    exception when others then
      v_tz := 'Europe/Helsinki';
      v_tour_start := v_start_local at time zone v_tz;
    end;

    v_preset := nullif(trim(coalesce(v_booking.purchase_snapshot->>'cancellationPreset', '')), '');
    v_hours_raw := v_booking.purchase_snapshot->'freeCancelHours';
    v_policy := lower(trim(coalesce(v_booking.purchase_snapshot->>'cancellationPolicy', '')));
    v_free_hours := null;

    if v_preset = 'non_refundable' then
      v_free_hours := null;
    elsif v_preset = 'free_24h' then
      v_free_hours := 24;
    elsif v_preset = 'free_48h' then
      v_free_hours := 48;
    elsif v_preset = 'free_7d' then
      v_free_hours := 168;
    elsif v_booking.purchase_snapshot ? 'freeCancelHours' then
      if jsonb_typeof(v_hours_raw) = 'null' then
        v_free_hours := null;
      else
        begin
          v_free_hours := (v_booking.purchase_snapshot->>'freeCancelHours')::int;
          if v_free_hours is not null and v_free_hours <= 0 then
            v_free_hours := null;
          end if;
        exception when others then
          v_free_hours := 24;
        end;
      end if;
    elsif v_policy <> '' then
      if (
        v_policy like '%non-refundable%'
        or v_policy like '%non refundable%'
      ) and v_policy not like '%up to 24%'
        and v_policy not like '%up to 48%'
        and v_policy not like '%up to 7%'
      then
        v_free_hours := null;
      elsif v_policy like '%7 days%' or v_policy like '%168 hour%' or v_policy like '%up to 7 day%' then
        v_free_hours := 168;
      elsif v_policy like '%48 hour%' or v_policy like '%up to 48%' then
        v_free_hours := 48;
      else
        v_free_hours := 24;
      end if;
    else
      v_free_hours := 24;
    end if;

    if v_free_hours is null then
      v_within_free_window := false;
      v_deadline_error :=
        'This booking is non-refundable for guest-initiated cancellations. Contact the operator from Messages to discuss your booking.';
    else
      v_within_free_window := v_tour_start - now() > make_interval(hours => v_free_hours);
      v_deadline_error :=
        'The free-cancellation deadline has passed. Contact the operator from Messages to discuss your booking.';
    end if;

    if not v_within_free_window then
      return jsonb_build_object(
        'ok', false,
        'error', v_deadline_error,
        'code', 'deadline_passed',
        'self_cancel_available', false
      );
    end if;
  elsif v_collected and v_booking.booking_date is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'The free-cancellation deadline has passed. Contact the operator from Messages to discuss your booking.',
      'code', 'deadline_passed',
      'self_cancel_available', false
    );
  end if;

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      refund_choice = v_choice,
      cancellation_origin = 'traveler',
      cancellation_resolution = case
        when not v_collected then null
        when v_choice = 'full_refund' then 'full_refund'
        else null
      end
    where id = v_booking.id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.cancellation_requests
    set
      status = 'resolved',
      responded_at = now(),
      responded_by = v_uid
    where booking_id = v_booking.id
      and status = 'requested';
  get diagnostics v_closed_requests = row_count;

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

  v_is_stay := public.booking_is_stay_night(v_booking);
  v_refund_prep := null;
  if v_collected and v_choice = 'full_refund' and v_is_stay then
    v_refund_prep := public.ensure_stay_cancel_refund_instruction(
      v_booking.id,
      'traveler_self_cancel_full_refund',
      v_uid
    );
  end if;

  if not v_collected then
    v_body :=
      'Traveler cancelled an unpaid checkout. No payment was collected.';
  elsif v_choice = 'full_refund' and v_is_stay and coalesce((v_refund_prep->>'ok')::boolean, false) then
    v_body :=
      'Traveler cancelled this booking. A refund has been queued with Stripe. Status updates when Stripe confirms the refund.';
  elsif v_choice = 'full_refund' then
    v_body :=
      'Traveler cancelled this booking. Status: Refund due until Stripe records a refund.';
  else
    v_body :=
      'Traveler cancelled this booking. No refund applies for this traveler-initiated cancellation.';
  end if;

  if v_closed_requests > 0 then
    v_body := v_body || ' The host cancellation request is closed because the traveler cancelled the booking.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_booking.id, 'system', v_uid, v_body);

  return jsonb_build_object(
    'ok', true,
    'refund_choice', v_choice,
    'unpaid_checkout', not v_collected,
    'closed_host_cancel_requests', v_closed_requests,
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id'
  );
end;
$$;

revoke all on function public.cancel_booking_as_traveler(uuid, text) from public;
grant execute on function public.cancel_booking_as_traveler(uuid, text) to authenticated;

comment on function public.cancel_booking_as_traveler(uuid, text) is
  'Traveler self-cancel. Tour clock = cancelReferenceStartHm/startTimeHm only (never pickup). Paid after deadline → deadline_passed. Stay full_refund queues Stripe instruction.';

-- ---------------------------------------------------------------------------
-- Supplier cancel: immediate (no traveler approval), any time including after start
-- ---------------------------------------------------------------------------
create or replace function public.request_supplier_cancellation(
  p_booking_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_evidence_note text default null,
  p_policy_snapshot jsonb default '{}'::jsonb,
  p_applied_fee numeric default 0,
  p_fee_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_listing_id uuid;
  v_status text;
  v_pay text;
  v_booking_currency text;
  v_code text := upper(trim(coalesce(p_reason_code, '')));
  v_text text := left(trim(coalesce(p_reason_text, '')), 2000);
  v_evidence text := left(trim(coalesce(p_evidence_note, '')), 2000);
  v_id uuid;
  v_allowed text[] := array[
    'FORCE_MAJEURE',
    'UNSAFE_WEATHER',
    'GOVERNMENT_RESTRICTION',
    'SUPPLIER_STAFF_UNAVAILABLE',
    'VEHICLE_OR_EQUIPMENT_FAILURE',
    'OVERBOOKING',
    'MINIMUM_PARTICIPATION_NOT_MET',
    'OPERATIONAL_ERROR',
    'TRAVELER_REQUESTED_DIRECTLY',
    'OTHER'
  ];
  v_fm boolean;
  v_fee numeric := coalesce(p_applied_fee, 0);
  v_booking public.bookings%rowtype;
  v_is_stay boolean;
  v_refund_prep jsonb;
  v_ledger_id uuid;
  v_body text;
  v_resolution text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_code <> all (v_allowed) then
    return jsonb_build_object('ok', false, 'error', 'Choose a cancellation reason.');
  end if;
  if char_length(v_text) < 12 then
    return jsonb_build_object('ok', false, 'error', 'Explain what happened (at least a short sentence).');
  end if;

  v_fm := v_code in ('FORCE_MAJEURE', 'UNSAFE_WEATHER', 'GOVERNMENT_RESTRICTION');
  if v_fm and char_length(v_text) < 24 then
    return jsonb_build_object('ok', false, 'error', 'Force majeure needs a clear explanation of why the trip cannot run.');
  end if;

  if v_fm then
    v_fee := 0;
  else
    v_fee := 20;
  end if;

  select l.supplier_id, b.listing_id, b.status, lower(trim(coalesce(b.payment_status, ''))),
    upper(trim(coalesce(b.currency, 'EUR')))
    into v_supplier, v_listing_id, v_status, v_pay, v_booking_currency
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_listing_id is null or not public.is_listing_supplier_bookings_editor(v_listing_id) then
    return jsonb_build_object('ok', false, 'error', 'You can only cancel bookings for your own listings.');
  end if;
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;
  if lower(trim(coalesce(v_status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already cancelled.');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Only paid bookings can go through this cancellation.');
  end if;

  -- Close any legacy open traveler-approval requests for this booking.
  update public.cancellation_requests
    set status = 'resolved', responded_at = now(), responded_by = v_uid
    where booking_id = p_booking_id and status = 'requested';

  insert into public.cancellation_requests (
    booking_id,
    requested_by,
    requester_user_id,
    reason_code,
    reason_text,
    evidence_note,
    status,
    policy_snapshot,
    applied_fee,
    fee_currency,
    traveler_refund_expectation,
    expires_at,
    responded_at,
    responded_by
  ) values (
    p_booking_id,
    'supplier',
    v_uid,
    v_code,
    v_text,
    nullif(v_evidence, ''),
    'accepted',
    coalesce(p_policy_snapshot, '{}'::jsonb) || jsonb_build_object(
      'server_applied_fee', v_fee,
      'server_force_majeure', v_fm,
      'auto_accept_hours', null,
      'immediate_supplier_cancel', true,
      'client_requested_fee_currency', p_fee_currency
    ),
    v_fee,
    v_booking_currency,
    'full_refund',
    null,
    now(),
    v_uid
  )
  returning id into v_id;

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  select * into v_booking from public.bookings where id = p_booking_id;
  v_is_stay := public.booking_is_stay_night(v_booking);
  -- Stays: resolution full_refund (auto-refund Phase 2.3). Tours: pending choice until Phases 2–3.
  v_resolution := case when v_is_stay then 'full_refund' else 'pending_customer_choice' end;

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_code,
      refund_choice = 'full_refund',
      cancellation_origin = 'supplier',
      cancellation_resolution = v_resolution
    where id = p_booking_id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if v_fee > 0 and v_supplier is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier,
      p_booking_id,
      'cancellation_penalty',
      - abs(v_fee),
      v_booking_currency,
      'Supplier cancellation fee',
      v_id::text,
      coalesce(p_policy_snapshot ->> 'policy_id', 'traverion_supplier_cancel_v1')
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
    coalesce(p_policy_snapshot ->> 'policy_id', 'traverion_supplier_ledger_v1')
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings'
    and e.booking_id = p_booking_id
  on conflict (kind, source_id) do nothing;

  v_refund_prep := null;
  if v_is_stay then
    v_refund_prep := public.ensure_stay_cancel_refund_instruction(
      p_booking_id,
      'supplier_cancel_full_refund',
      v_uid
    );
  end if;

  if v_is_stay and coalesce((v_refund_prep->>'ok')::boolean, false) then
    v_body :=
      'Operator cancelled this booking. A full refund has been queued with Stripe. Status updates when Stripe confirms the refund.';
  else
    v_body :=
      'Operator cancelled this booking. A full refund is due. Status: Refund due until Stripe records a refund.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (p_booking_id, 'system', v_uid, v_body);

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'applied_fee', v_fee,
    'fee_currency', v_booking_currency,
    'immediate', true,
    'refund_choice', 'full_refund',
    'cancellation_resolution', v_resolution,
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id',
    'ledger_id', v_ledger_id
  );
end;
$$;

revoke all on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) from public;
grant execute on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) to authenticated;

comment on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) is
  'Phase 1: supplier cancels immediately (no traveler approval), any time including after start. Full refund entitlement. Stay queues auto-refund. Tour Stripe refund = Phase 2. History in cancellation_requests status=accepted.';

-- Patch respond_cancellation_request to set origin/resolution on legacy accept path
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
  v_booking_status text;
  v_ledger_id uuid;
  v_booking public.bookings%rowtype;
  v_refund_prep jsonb;
  v_is_stay boolean;
  v_body text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;

  select l.supplier_id, b.guest_user_id, b.guest_email, lower(trim(coalesce(b.status, '')))
    into v_supplier, v_guest_user, v_guest_email, v_booking_status
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = v_req.booking_id;

  if not public.booking_traveler_owns(v_guest_user, v_guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;

  if v_req.status = 'accepted' then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;

  if v_booking_status = 'cancelled' then
    update public.cancellation_requests
      set status = 'resolved', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'resolved', 'already_cancelled', true);
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

  select * into v_booking from public.bookings where id = v_req.booking_id;
  v_is_stay := public.booking_is_stay_night(v_booking);

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_req.reason_code,
      refund_choice = 'full_refund',
      cancellation_origin = 'supplier',
      cancellation_resolution = case when v_is_stay then 'full_refund' else 'pending_customer_choice' end
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

  v_refund_prep := null;
  if v_is_stay then
    v_refund_prep := public.ensure_stay_cancel_refund_instruction(
      v_req.booking_id,
      'supplier_cancel_accepted_full_refund',
      v_uid
    );
  end if;

  if v_is_stay and coalesce((v_refund_prep->>'ok')::boolean, false) then
    v_body :=
      'Traveler accepted the cancellation. This booking is cancelled. A full refund has been queued with Stripe. Status updates when Stripe confirms the refund.';
  else
    v_body :=
      'Traveler accepted the cancellation. This booking is cancelled. Status: Refund due until Stripe records a refund.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_req.booking_id, 'system', v_uid, v_body);

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id,
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id'
  );
end;
$$;

comment on function public.respond_cancellation_request(uuid, boolean) is
  'Legacy traveler accept/decline for open cancellation_requests. New supplier cancels use immediate request_supplier_cancellation.';
