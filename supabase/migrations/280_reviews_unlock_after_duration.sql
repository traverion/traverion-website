-- Review unlock: tours after departure + snapshotted duration; stays after checkout wall clock.
-- Prefer purchase_snapshot.duration / checkOutTime so later listing edits cannot change history.
-- When duration is absent, keep legacy unlock-after-start (do not invent an end time).

create or replace function public.booking_experience_duration_minutes(snap jsonb)
returns integer
language plpgsql
immutable
as $$
declare
  raw text;
  hours_part numeric := 0;
  mins_part numeric := 0;
  h_match text[];
  m_match text[];
  total int;
begin
  raw := lower(trim(coalesce(snap->>'duration', '')));
  if raw = '' then
    return null;
  end if;

  h_match := regexp_match(raw, '([0-9]+(?:\.[0-9]+)?)\s*(?:hours?|hrs?|h)\y');
  m_match := regexp_match(raw, '([0-9]+(?:\.[0-9]+)?)\s*(?:minutes?|mins?|m)\y');

  if h_match is not null then
    hours_part := h_match[1]::numeric;
  end if;
  if m_match is not null then
    mins_part := m_match[1]::numeric;
  end if;

  if h_match is null and m_match is null then
    if raw ~ '^[0-9]+(\.[0-9]+)?$' then
      hours_part := raw::numeric;
      if hours_part <= 0 or hours_part > 48 then
        return null;
      end if;
    else
      return null;
    end if;
  end if;

  total := round(hours_part * 60 + mins_part)::int;
  if total <= 0 then
    return null;
  end if;
  return least(total, 14 * 24 * 60);
exception when others then
  return null;
end;
$$;

comment on function public.booking_experience_duration_minutes(jsonb) is
  'Parse purchase_snapshot.duration into minutes. Null when unparseable — callers must not invent an end.';

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
  end_local timestamp;
  st text;
  hh int;
  mm int;
  dur_mins int;
  cout date;
  cout_hm text;
  cout_hh int;
  cout_mm int;
  is_stay boolean;
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

  is_stay := b.check_out is not null or public.booking_is_stay_night(b);
  if is_stay then
    cout := b.check_out;
    if cout is null then
      if b.nights is not null and b.nights > 0 and b.booking_date is not null then
        cout := (b.booking_date + make_interval(days => b.nights))::date;
      else
        return false;
      end if;
    end if;
    cout_hm := nullif(trim(coalesce(b.purchase_snapshot->>'checkOutTime', '')), '');
    if cout_hm is null then
      return local_now > cout::timestamp;
    end if;
    begin
      cout_hh := split_part(cout_hm, ':', 1)::int;
      cout_mm := split_part(cout_hm, ':', 2)::int;
    exception when others then
      return local_now > cout::timestamp;
    end;
    return local_now > (cout::timestamp + make_interval(hours => cout_hh, mins => cout_mm));
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
  dur_mins := public.booking_experience_duration_minutes(b.purchase_snapshot);
  if dur_mins is not null and dur_mins > 0 then
    end_local := start_local + make_interval(mins => dur_mins);
  else
    end_local := start_local;
  end if;
  return local_now > end_local;
end;
$$;

comment on function public.booking_experience_started_for_review(public.bookings, public.listings) is
  'Review unlock. Stay: after checkout date + optional checkOutTime. Tour: after booking_date + startTimeHm + snapshotted duration (else after start). TZ from snapshot/listing extras or Europe/Helsinki.';

revoke all on function public.booking_experience_duration_minutes(jsonb) from public;
grant execute on function public.booking_experience_duration_minutes(jsonb) to authenticated;
