-- Mission 06.3: Rental earnings complete at authoritative returnAt.
-- Tours/Stays completion clocks unchanged. Additive function replace + scoped backfill.
-- Does not change amounts, commissions, ledger entries, or create duplicate earnings.

-- ---------------------------------------------------------------------------
-- Service completion: Stay check-out · Rental returnAt · Tour start+duration
-- ---------------------------------------------------------------------------
create or replace function public.booking_service_completion_at(p_booking public.bookings)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hours numeric;
  v_tz text;
  v_out date;
  v_hm text;
  v_hh int;
  v_mm int;
  v_raw text;
  v_return timestamptz;
  v_ymd text;
  v_hms text;
begin
  -- Stays: check-out civil day + checkOutTime in listing timezone (unchanged).
  if public.booking_is_stay_night(p_booking) then
    v_tz := nullif(trim(coalesce(p_booking.purchase_snapshot->>'departureTimezone', '')), '');
    if v_tz is null then
      v_tz := 'Europe/Helsinki';
    end if;
    v_out := coalesce(p_booking.check_out, p_booking.booking_date);
    if v_out is null then
      return null;
    end if;
    v_hm := nullif(trim(coalesce(p_booking.purchase_snapshot->>'checkOutTime', '')), '');
    if v_hm is null then
      v_hm := '11:00';
    end if;
    begin
      v_hh := split_part(v_hm, ':', 1)::int;
      v_mm := split_part(v_hm, ':', 2)::int;
    exception when others then
      v_hh := 11;
      v_mm := 0;
    end;
    begin
      return (v_out::timestamp + make_interval(hours => v_hh, mins => v_mm)) at time zone v_tz;
    exception when others then
      return (v_out::timestamp + interval '11 hours') at time zone 'Europe/Helsinki';
    end;
  end if;

  -- Rentals: exact return instant from purchase_snapshot.returnAt.
  if public.booking_is_rental(p_booking) then
    v_raw := nullif(trim(coalesce(p_booking.purchase_snapshot->>'returnAt', '')), '');
    if v_raw is null then
      return null;
    end if;

    -- Offset / Z present → authoritative timestamptz instant.
    if v_raw ~* '(Z|[+-][0-9]{2}:?[0-9]{2})$' then
      begin
        return v_raw::timestamptz;
      exception when others then
        return null;
      end;
    end if;

    -- Wall-clock without offset: interpret in listing departureTimezone.
    v_tz := nullif(trim(coalesce(p_booking.purchase_snapshot->>'departureTimezone', '')), '');
    if v_tz is null then
      v_tz := 'Europe/Helsinki';
    end if;

    if v_raw ~ '^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?)?$' then
      v_ymd := substring(v_raw from 1 for 10);
      if length(v_raw) >= 16 then
        v_hms := substring(v_raw from 12 for 8);
        if length(v_hms) = 5 then
          v_hms := v_hms || ':00';
        end if;
      else
        -- Date-only: end of local return day (matches UI fallback).
        v_hms := '23:59:59';
      end if;
      begin
        return (v_ymd || ' ' || v_hms)::timestamp at time zone v_tz;
      exception when others then
        return null;
      end;
    end if;

    -- Last resort: direct cast (session TZ). Prefer null over inventing a clock.
    begin
      v_return := v_raw::timestamptz;
      return v_return;
    exception when others then
      return null;
    end;
  end if;

  -- Tours: official start + parsed duration (unchanged Phase 6: missing duration → null).
  v_start := public.booking_official_start_at(p_booking);
  if v_start is null then
    return null;
  end if;
  v_hours := public.booking_tour_duration_hours(p_booking);
  if v_hours is null then
    return null; -- pending verification until duration is known
  end if;
  return v_start + make_interval(secs => (v_hours * 3600)::int);
end;
$$;

comment on function public.booking_service_completion_at(public.bookings) is
  'Service completion clock: stay check-out, rental returnAt instant, or tour start+duration.';

-- uuid overload unchanged in body; recreate so grants/comment stay aligned.
create or replace function public.booking_service_completion_at(p_booking_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return null;
  end if;
  return public.booking_service_completion_at(v_booking);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scoped backfill: rental earning rows only. Never touch amounts / create rows.
-- ---------------------------------------------------------------------------
do $$
declare
  v_hold_hours integer;
  v_touched integer := 0;
begin
  select value_int into v_hold_hours
  from public.commercial_runtime_config where key = 'payout_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 48);

  update public.supplier_earning_items e
  set
    service_completed_at = public.booking_service_completion_at(e.booking_id),
    experience_at = coalesce(e.experience_at, public.booking_service_completion_at(e.booking_id)),
    eligible_at = public.booking_service_completion_at(e.booking_id)
      + make_interval(hours => v_hold_hours),
    updated_at = now()
  from public.bookings b
  where b.id = e.booking_id
    and coalesce(b.purchase_snapshot->>'inventoryFamily', '') = 'rental'
    and e.status in ('pending', 'eligible')
    and e.amount_minor > 0
    and public.booking_service_completion_at(e.booking_id) is not null
    and (
      e.service_completed_at is null
      or e.service_completed_at is distinct from public.booking_service_completion_at(e.booking_id)
      or e.eligible_at is null
      or e.eligible_at is distinct from (
        public.booking_service_completion_at(e.booking_id)
        + make_interval(hours => v_hold_hours)
      )
    );

  get diagnostics v_touched = row_count;

  raise notice '296_rental_earnings_completion_return_at backfill_touched=%', v_touched;
end $$;

-- Re-run eligibility so past-return rentals can become eligible under existing rules.
select public.refresh_supplier_earning_eligibility(now());
