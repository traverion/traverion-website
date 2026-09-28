-- Phase 1326: Stay cancel/review detect nights-only stays (bookingIsStayNight parity).
--
-- BEFORE: cancel_booking_as_traveler and booking_experience_started_for_review
-- treated stays as check_out IS NOT NULL only. Trips UI (Phase 1324) already
-- treats nights >= 1 / check_out: notes as stays and uses checkInTime (default
-- 16:00) for the 24h free-cancel window — so nights-only paid stays could show
-- "Eligible for refund" while SQL forced no_refund via midnight tour semantics.
--
-- AFTER: shared booking_is_stay_night() matches client bookingIsStayNight;
-- cancel uses stay check-in wall clock; review uses stay_booking_check_out day.

create or replace function public.booking_is_stay_night(p_booking public.bookings)
returns boolean
language sql
immutable
as $$
  select
    p_booking.check_out is not null
    or (p_booking.nights is not null and p_booking.nights >= 1)
    or coalesce(p_booking.special_requests, '') ~* 'check_out:\s*\d{4}-\d{2}-\d{2}';
$$;

comment on function public.booking_is_stay_night(public.bookings) is
  'Phase 1326: stay shape = check_out column OR nights >= 1 OR check_out: YYYY-MM-DD in notes (client bookingIsStayNight parity).';

create or replace function public.booking_experience_started_for_review(
  b public.bookings,
  l public.listings
)
returns boolean
language plpgsql
stable
as $$
declare
  tz text;
  local_now timestamp;
  start_local timestamp;
  st text;
  hh int;
  mm int;
begin
  tz := nullif(trim(coalesce(b.purchase_snapshot->>'departureTimezone', '')), '');
  if tz is null then
    tz := nullif(trim(coalesce(l.listing_extras->>'departureTimezone', '')), '');
  end if;
  if tz is null or tz = '' then
    tz := 'Europe/Helsinki';
  end if;

  begin
    local_now := timezone(tz, now());
  exception when others then
    local_now := timezone('Europe/Helsinki', now());
    tz := 'Europe/Helsinki';
  end;

  if public.booking_is_stay_night(b) then
    if b.booking_date is null then
      return false;
    end if;
    return (local_now::date >= public.stay_booking_check_out(b));
  end if;

  if b.booking_date is null then
    return false;
  end if;

  st := nullif(trim(coalesce(b.purchase_snapshot->>'startTimeHm', '')), '');
  if st is null then
    st := coalesce(nullif(trim(coalesce(b.start_time::text, '')), ''), '23:59:00');
  end if;
  begin
    hh := split_part(st, ':', 1)::int;
    mm := split_part(st, ':', 2)::int;
  exception when others then
    hh := 23;
    mm := 59;
  end;

  start_local := b.booking_date::timestamp + make_interval(hours => hh, mins => mm);
  return local_now > start_local;
end;
$$;

comment on function public.booking_experience_started_for_review(public.bookings, public.listings) is
  'True when the booking experience has started/ended for review eligibility (Phase 1326). Stay (check_out/nights/notes): local date >= stay_booking_check_out. Tour: local now > booking_date + purchase_snapshot.startTimeHm (else start_time, default 23:59). TZ from snapshot/listing extras or Europe/Helsinki.';

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

  -- Free cancellation up to 24h before purchased experience-local start / check-in.
  if v_collected and v_choice = 'full_refund' and v_booking.booking_date is not null then
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
      v_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'startTimeHm', '')), '');
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

comment on function public.cancel_booking_as_traveler(uuid, text) is
  'Traveler self-cancel: jwt_verified_email ownership; 24h free-cancel before tour purchased startTimeHm or stay checkInTime (default 16:00) when booking_is_stay_night (Phase 1326 nights/notes parity). Unpaid → no_refund.';
