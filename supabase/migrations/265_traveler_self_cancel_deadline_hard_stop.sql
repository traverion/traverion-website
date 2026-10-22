-- Phase 265: after the free-cancel deadline (or non-refundable), traveler self-cancel
-- is rejected entirely — no status change, inventory release, ledger reversal, or refund
-- instruction. Direct travelers to Messages. Supplier accept / unpaid checkout unchanged.
--
-- Tour cancel anchor: frozen purchase_snapshot.selfCancelStartHm when set; else confirmed
-- bookings.pickup_time when fulfillment=pickup; else snapshotted startTimeHm / start_time.
-- Never use estimated pickup windows. Later pickup edits that freeze selfCancelStartHm
-- keep the first confirmed cancel clock.

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
  v_fulfillment text;
  v_frozen_hm text;
  v_pickup_hm text;
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

  -- Paid bookings: enforce free-cancel window. After deadline / non-refundable → hard reject.
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
      -- Tour: frozen cancel clock → confirmed pickup (pickup fulfillment) → booked departure.
      v_frozen_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'selfCancelStartHm', '')), '');
      v_fulfillment := lower(trim(coalesce(v_booking.purchase_snapshot->>'fulfillment', '')));
      v_pickup_hm := null;
      if v_booking.pickup_time is not null then
        v_pickup_hm := to_char(v_booking.pickup_time, 'HH24:MI');
      end if;

      if v_frozen_hm is not null then
        v_hm := v_frozen_hm;
      elsif v_fulfillment = 'pickup' and v_pickup_hm is not null then
        v_hm := v_pickup_hm;
      else
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
      -- Strict: more than free_hours remaining. Exact deadline → closed.
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

    -- Inside free window: paid self-cancel is a full refund (client may still send full_refund).
    if v_choice = 'full_refund' then
      null;
    end if;
  elsif v_collected and v_booking.booking_date is null then
    -- Paid but no booking_date: cannot evaluate window — do not grant free cancel.
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
      refund_choice = v_choice
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
  'Traveler self-cancel. Paid: only while strictly inside free-cancel window (snapshotted hours; tour uses frozen selfCancelStartHm / confirmed pickup / startTimeHm). After deadline → reject with code deadline_passed (no mutate). Stay full_refund queues Stripe refund instruction. Unpaid checkout always cancellable. Supplier accept is a separate RPC.';
