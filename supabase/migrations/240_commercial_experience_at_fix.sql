-- Fix booking_experience_at: listings has no timezone column.

create or replace function public.booking_experience_at(p_booking_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date date;
  v_checkout date;
  v_start text;
  v_tz text := 'Europe/Helsinki';
  v_kind text;
begin
  select
    b.booking_date,
    b.check_out,
    b.start_time,
    lower(trim(coalesce(l.experience_kind, l.style, '')))
  into v_date, v_checkout, v_start, v_kind
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_date is null then
    return null;
  end if;

  -- Stays: experience completes on check-out day (local calendar day start).
  if v_kind like '%stay%' or v_checkout is not null then
    return (coalesce(v_checkout, v_date)::timestamp at time zone v_tz);
  end if;

  -- Tours: wall-clock start when start_time present.
  if v_start is not null and length(trim(v_start)) >= 4 then
    begin
      return ((v_date::text || ' ' || trim(v_start))::timestamp at time zone v_tz);
    exception when others then
      return (v_date::timestamp at time zone v_tz);
    end;
  end if;

  return (v_date::timestamp at time zone v_tz);
end;
$$;

comment on function public.booking_experience_at(uuid) is
  'Authoritative experience instant for payout eligibility. Tours use booking_date+start_time; stays use check_out. TZ Europe/Helsinki (listings have no timezone column).';
