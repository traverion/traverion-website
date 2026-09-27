-- Traveler self-cancel 24h window uses listing departureTimezone (IANA) when valid.
-- Falls back to Europe/Helsinki (platform default). Prefer purchase_snapshot.departureTimezone
-- when frozen at checkout so later listing edits cannot rewrite the cancel window.

create or replace function public.resolve_departure_timezone(p_raw text)
returns text
language plpgsql
stable
as $$
declare
  v_tz text := nullif(trim(coalesce(p_raw, '')), '');
begin
  if v_tz is null then
    return 'Europe/Helsinki';
  end if;
  begin
    perform timezone(v_tz, now());
    return v_tz;
  exception
    when others then
      return 'Europe/Helsinki';
  end;
end;
$$;

comment on function public.resolve_departure_timezone(text) is
  'Validate IANA timezone text; invalid/empty → Europe/Helsinki.';

revoke all on function public.resolve_departure_timezone(text) from public;
grant execute on function public.resolve_departure_timezone(text) to authenticated;
grant execute on function public.resolve_departure_timezone(text) to service_role;

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
  v_tz text := 'Europe/Helsinki';
  v_snap_tz text;
  v_listing_tz text;
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
    v_snap_tz := nullif(trim(coalesce(v_booking.purchase_snapshot->>'departureTimezone', '')), '');
    select nullif(trim(coalesce(l.listing_extras->>'departureTimezone', '')), '')
      into v_listing_tz
    from public.listings l
    where l.id = v_booking.listing_id;
    v_tz := public.resolve_departure_timezone(coalesce(v_snap_tz, v_listing_tz));
    v_tour_start := (v_booking.booking_date + coalesce(v_booking.start_time, time '00:00'))
      at time zone v_tz;
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
  'Traveler self-cancel with server-side 24h free-cancel window using purchase_snapshot.departureTimezone or listing_extras.departureTimezone (IANA), default Europe/Helsinki.';
