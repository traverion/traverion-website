-- Phase 1349: Bound guest_user_id blocks recycled-email traveler ownership.
-- Parity with travelerOwnsCheckoutBooking (Phase 1348 edge checkout):
-- when guest_user_id is set, only that uid may act as traveler;
-- verified email match is only for legacy unbound rows.

create or replace function public.booking_traveler_owns(
  p_guest_user_id uuid,
  p_guest_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when p_guest_user_id is not null then p_guest_user_id = auth.uid()
    else
      length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
      and length(trim(coalesce(p_guest_email, ''))) > 0
      and lower(trim(p_guest_email)) = public.jwt_verified_email()
  end;
$$;

comment on function public.booking_traveler_owns(uuid, text) is
  'Phase 1349: traveler owns booking when guest_user_id = auth.uid(), or (when guest_user_id is null) verified JWT email matches guest_email.';

revoke all on function public.booking_traveler_owns(uuid, text) from public;
grant execute on function public.booking_traveler_owns(uuid, text) to authenticated;

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
        or exists (
          select 1
          from public.supplier_team_members stm
          where stm.supplier_id = l.supplier_id::text
            and stm.user_id = auth.uid()::text
        )
        or public.booking_traveler_owns(b.guest_user_id, b.guest_email)
      )
  );
$$;

comment on function public.is_booking_party(uuid) is
  'True when auth.uid() is listing supplier, supplier team member, or traveler via booking_traveler_owns (bound uid beats recycled email).';

drop policy if exists "Consumers can view own bookings" on public.bookings;
create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    guest_user_id is null
    and length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
    and lower(trim(coalesce(guest_email, ''))) = public.jwt_verified_email()
  );

drop policy if exists "Consumers can cancel own bookings" on public.bookings;
create policy "Consumers can cancel own bookings"
  on public.bookings for update
  using (
    guest_user_id is null
    and length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
    and lower(trim(coalesce(guest_email, ''))) = public.jwt_verified_email()
  )
  with check (
    guest_user_id is null
    and length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
    and lower(trim(coalesce(guest_email, ''))) = public.jwt_verified_email()
  );

drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and reviews.booking_id is not null
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = reviews.booking_id
        and b.listing_id = reviews.listing_id
        and b.status = 'confirmed'
        and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
        and public.booking_traveler_owns(b.guest_user_id, b.guest_email)
        and public.booking_experience_started_for_review(b, l)
    )
  );

drop policy if exists "Users can update own review" on public.reviews;
create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = reviews.user_id)
  with check (
    auth.uid() = reviews.user_id
    and reviews.booking_id is not null
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = reviews.booking_id
        and b.listing_id = reviews.listing_id
        and b.status = 'confirmed'
        and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
        and public.booking_traveler_owns(b.guest_user_id, b.guest_email)
        and public.booking_experience_started_for_review(b, l)
    )
  );

comment on column public.reviews.booking_id is
  'Required verified booking link. RLS requires owned paid+confirmed booking whose experience has started, booking_traveler_owns (Phase 1349), and not a self-supplier review.';

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
  v_existing text;
  v_guest text;
  v_machine text;
  v_merged text;
begin
  if (v_email = '' or v_email is null) and v_uid is null then
    return false;
  end if;

  select special_requests into v_existing
  from public.bookings
  where id = p_booking_id
    and status in ('pending', 'confirmed')
    and public.booking_traveler_owns(guest_user_id, guest_email)
  for update;

  if not found then
    return false;
  end if;

  v_guest := public.guest_facing_booking_notes(p_special_requests);
  v_machine := public.machine_booking_note_lines(v_existing);

  if v_guest <> '' and v_machine <> '' then
    v_merged := v_guest || E'\n' || v_machine;
  elsif v_guest <> '' then
    v_merged := v_guest;
  else
    v_merged := v_machine;
  end if;

  update public.bookings
  set special_requests = left(trim(v_merged), 8000)
  where id = p_booking_id;

  return FOUND;
end;
$$;

comment on function public.update_guest_booking_special_requests(uuid, text) is
  'Guest notes update: preserves machine keys (Phase 1330); traveler ownership via booking_traveler_owns (Phase 1349).';

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

  if not public.booking_traveler_owns(v_booking.guest_user_id, v_booking.guest_email) then
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
  'Traveler self-cancel: booking_traveler_owns (Phase 1349 bound uid); 24h free-cancel stay/tour parity (Phase 1326). Unpaid → no_refund.';
